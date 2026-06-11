package task

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/songquanpeng/one-api/model"
)

func TestPollOnce_SuccessSettlesTask(t *testing.T) {
	setupTaskDB(t)
	user, token := newUserAndToken(t, 1000)
	channel := newTestChannel(t)
	task := newSubmittedTask(t, user, token, channel.Id, 300) // wallet: 700
	withFakeAdaptor(t, &fakeAdaptor{
		fetch: func(context.Context) (*http.Response, error) { return httpResp(200, `{"status":"succeeded"}`), nil },
		parse: func([]byte) (*TaskInfo, error) {
			return &TaskInfo{
				Status:   model.TaskStatusSuccess,
				Url:      "https://example.com/video.mp4",
				Progress: 100,
			}, nil
		},
	})

	pollOnce(context.Background())

	got := reloadTask(t, task.Id)
	require.Equal(t, model.TaskStatusSuccess, got.Status)
	require.Equal(t, "https://example.com/video.mp4", got.ResultUrl)
	require.Equal(t, 100, got.Progress)
	require.NotZero(t, got.FinishTime)
	require.Equal(t, `{"status":"succeeded"}`, got.Data)
	// no usage data and no billing override: prepaid amount stands
	require.Equal(t, int64(700), userQuota(t, user.Id))
}

func TestPollOnce_UpstreamFailureRefunds(t *testing.T) {
	setupTaskDB(t)
	user, token := newUserAndToken(t, 1000)
	channel := newTestChannel(t)
	task := newSubmittedTask(t, user, token, channel.Id, 300) // wallet: 700
	withFakeAdaptor(t, &fakeAdaptor{
		fetch: func(context.Context) (*http.Response, error) { return httpResp(200, `{"status":"failed"}`), nil },
		parse: func([]byte) (*TaskInfo, error) {
			return &TaskInfo{Status: model.TaskStatusFailure, Reason: "content moderation"}, nil
		},
	})

	pollOnce(context.Background())

	got := reloadTask(t, task.Id)
	require.Equal(t, model.TaskStatusFailure, got.Status)
	require.Equal(t, "content moderation", got.FailReason)
	require.Equal(t, int64(1000), userQuota(t, user.Id), "failed task must be fully refunded")
	require.EqualValues(t, 1, countLogs(t, model.LogTypeRefund))
}

func TestPollOnce_RateLimitedKeepsTaskUntouched(t *testing.T) {
	setupTaskDB(t)
	user, token := newUserAndToken(t, 1000)
	channel := newTestChannel(t)
	task := newSubmittedTask(t, user, token, channel.Id, 300)
	withFakeAdaptor(t, &fakeAdaptor{
		fetch: func(context.Context) (*http.Response, error) { return httpResp(http.StatusTooManyRequests, ""), nil },
		parse: func([]byte) (*TaskInfo, error) {
			t.Fatal("parse must not be called on 429")
			return nil, nil
		},
	})

	pollOnce(context.Background())

	got := reloadTask(t, task.Id)
	require.Equal(t, model.TaskStatusQueued, got.Status)
	require.Equal(t, int64(700), userQuota(t, user.Id), "no refund, no charge")
}

func TestPollOnce_ParseFailureLeavesTaskForNextRound(t *testing.T) {
	setupTaskDB(t)
	user, token := newUserAndToken(t, 1000)
	channel := newTestChannel(t)
	task := newSubmittedTask(t, user, token, channel.Id, 300)
	withFakeAdaptor(t, &fakeAdaptor{
		fetch: func(context.Context) (*http.Response, error) { return httpResp(200, "not json"), nil },
		parse: func([]byte) (*TaskInfo, error) { return nil, errors.New("unexpected payload") },
	})

	pollOnce(context.Background())

	got := reloadTask(t, task.Id)
	require.Equal(t, model.TaskStatusQueued, got.Status)
	require.Equal(t, int64(700), userQuota(t, user.Id))
}

func TestPollOnce_FetchErrorLeavesTaskForNextRound(t *testing.T) {
	setupTaskDB(t)
	user, token := newUserAndToken(t, 1000)
	channel := newTestChannel(t)
	task := newSubmittedTask(t, user, token, channel.Id, 300)
	withFakeAdaptor(t, &fakeAdaptor{
		fetch: func(context.Context) (*http.Response, error) { return nil, errors.New("connection refused") },
		parse: func([]byte) (*TaskInfo, error) {
			t.Fatal("parse must not be called when fetch fails")
			return nil, nil
		},
	})

	pollOnce(context.Background())

	require.Equal(t, model.TaskStatusQueued, reloadTask(t, task.Id).Status)
}

func TestPollOnce_ProgressUpdateForRunningTask(t *testing.T) {
	setupTaskDB(t)
	user, token := newUserAndToken(t, 1000)
	channel := newTestChannel(t)
	task := newSubmittedTask(t, user, token, channel.Id, 300)
	withFakeAdaptor(t, &fakeAdaptor{
		fetch: func(context.Context) (*http.Response, error) { return httpResp(200, `{"status":"running"}`), nil },
		parse: func([]byte) (*TaskInfo, error) {
			return &TaskInfo{Status: model.TaskStatusInProgress, Progress: 40}, nil
		},
	})

	pollOnce(context.Background())

	got := reloadTask(t, task.Id)
	require.Equal(t, model.TaskStatusInProgress, got.Status)
	require.Equal(t, 40, got.Progress)
	require.NotZero(t, got.StartTime)
	require.Equal(t, int64(700), userQuota(t, user.Id), "running update must not touch money")
}

func TestPollOnce_TimeoutFailsAndRefunds(t *testing.T) {
	setupTaskDB(t)
	user, token := newUserAndToken(t, 1000)
	channel := newTestChannel(t)
	task := newSubmittedTask(t, user, token, channel.Id, 300) // wallet: 700
	// age the task past the timeout window
	require.NoError(t, model.DB.Model(&model.Task{}).Where("id = ?", task.Id).
		Update("submit_time", task.SubmitTime-int64(taskTimeout.Seconds())-1).Error)
	withFakeAdaptor(t, &fakeAdaptor{
		fetch: func(context.Context) (*http.Response, error) {
			t.Fatal("the timeout scan must fail the task before any upstream fetch")
			return nil, nil
		},
	})

	pollOnce(context.Background())

	got := reloadTask(t, task.Id)
	require.Equal(t, model.TaskStatusFailure, got.Status)
	require.Equal(t, "task timed out", got.FailReason)
	require.Equal(t, int64(1000), userQuota(t, user.Id), "timed-out task must be fully refunded")
	require.EqualValues(t, 1, countLogs(t, model.LogTypeRefund))
}

func TestPollOnce_NoAdaptorSkipsTasks(t *testing.T) {
	setupTaskDB(t)
	user, token := newUserAndToken(t, 1000)
	channel := newTestChannel(t)
	task := newSubmittedTask(t, user, token, channel.Id, 300)
	old := adaptorByPlatform
	adaptorByPlatform = func(string) Adaptor { return nil }
	t.Cleanup(func() { adaptorByPlatform = old })

	pollOnce(context.Background())

	require.Equal(t, model.TaskStatusQueued, reloadTask(t, task.Id).Status)
}

// A panicking adaptor (future ParseTaskResult bugs, nil derefs in billing
// hooks) must not take down the whole process — the poller has no
// RelayPanicRecover in front of it, so pollOnceSafe is that shield.
func TestPollOnceSafe_RecoversFromAdaptorPanic(t *testing.T) {
	setupTaskDB(t)
	user, token := newUserAndToken(t, 1000)
	channel := newTestChannel(t)
	task := newSubmittedTask(t, user, token, channel.Id, 300)
	withFakeAdaptor(t, &fakeAdaptor{
		fetch: func(context.Context) (*http.Response, error) { return httpResp(200, "{}"), nil },
		parse: func([]byte) (*TaskInfo, error) { panic("adaptor bug") },
	})

	require.NotPanics(t, func() { pollOnceSafe(context.Background()) })

	got := reloadTask(t, task.Id)
	require.Equal(t, model.TaskStatusQueued, got.Status, "a panicking round must leave the task for the next one")
	require.Equal(t, int64(700), userQuota(t, user.Id))
}

// The framework must set a per-fetch deadline so a hung upstream connection
// cannot block the single polling goroutine; hitting that deadline is a
// transient error that leaves the task for the next round.
func TestPollOnce_FetchDeadlineLeavesTaskForNextRound(t *testing.T) {
	setupTaskDB(t)
	user, token := newUserAndToken(t, 1000)
	channel := newTestChannel(t)
	task := newSubmittedTask(t, user, token, channel.Id, 300)
	withFakeAdaptor(t, &fakeAdaptor{
		fetch: func(ctx context.Context) (*http.Response, error) {
			_, hasDeadline := ctx.Deadline()
			require.True(t, hasDeadline, "the poller must set a per-fetch deadline")
			// simulate a hung upstream that only returns once the deadline fires
			return nil, context.DeadlineExceeded
		},
		parse: func([]byte) (*TaskInfo, error) {
			t.Fatal("parse must not be called when fetch times out")
			return nil, nil
		},
	})

	pollOnce(context.Background())

	require.Equal(t, model.TaskStatusQueued, reloadTask(t, task.Id).Status)
	require.Equal(t, int64(700), userQuota(t, user.Id), "a timed-out fetch must not move money")
}

// A corrupt channel row (negative type, no base URL) must not index
// ChannelBaseURLs out of bounds — the group is skipped and its tasks are
// left for the timeout scan.
func TestPollOnce_InvalidChannelTypeSkipsGroup(t *testing.T) {
	setupTaskDB(t)
	user, token := newUserAndToken(t, 1000)
	channel := &model.Channel{
		Name:   "corrupt-channel",
		Key:    "sk-fake",
		Status: model.ChannelStatusEnabled,
		Type:   -1,
	}
	require.NoError(t, model.DB.Create(channel).Error)
	task := newSubmittedTask(t, user, token, channel.Id, 300)
	withFakeAdaptor(t, &fakeAdaptor{
		fetch: func(context.Context) (*http.Response, error) {
			t.Fatal("fetch must not run against a corrupt channel config")
			return nil, nil
		},
	})

	require.NotPanics(t, func() { pollOnce(context.Background()) })

	require.Equal(t, model.TaskStatusQueued, reloadTask(t, task.Id).Status)
	require.Equal(t, int64(700), userQuota(t, user.Id))
}
