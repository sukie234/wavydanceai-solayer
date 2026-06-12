package task

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"runtime/debug"
	"time"

	"github.com/songquanpeng/one-api/common/helper"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/relay/channeltype"
)

const (
	pollInterval = 15 * time.Second
	// taskTimeout: non-terminal tasks older than this are failed + refunded.
	// Video generations finish in minutes; 2 hours means the upstream lost it.
	taskTimeout   = 2 * time.Hour
	fetchInterval = time.Second // pause between upstream queries to stay under rate limits
	// fetchTimeout caps one upstream query; a hung connection must not stall
	// the single polling goroutine (and with it timeout scans and refunds).
	fetchTimeout     = 30 * time.Second
	pollBatchLimit   = 1000
	timeoutScanLimit = 100
)

// adaptorByPlatform is indirection for tests; production code uses GetAdaptor.
var adaptorByPlatform = GetAdaptor

// StartPolling runs the task polling loop; call it once from main as a
// goroutine. Safe to run on multiple instances: every terminal transition
// goes through a status CAS, so concurrent pollers only waste upstream
// queries, never double-bill.
func StartPolling() {
	logger.SysLog("task polling loop started")
	for {
		pollOnceSafe(context.Background())
		time.Sleep(pollInterval)
	}
}

// pollOnceSafe shields the polling loop from panics in adaptor code — the
// HTTP side has RelayPanicRecover, this is the poller's equivalent. A
// panicking round is logged and skipped; the next round retries, and tasks
// it kept failing on are eventually swept by the timeout scan.
func pollOnceSafe(ctx context.Context) {
	defer func() {
		if r := recover(); r != nil {
			logger.Errorf(ctx, "task polling round panicked: %v", r)
			logger.Errorf(ctx, "stacktrace from panic: %s", string(debug.Stack()))
		}
	}()
	pollOnce(ctx)
}

func pollOnce(ctx context.Context) {
	scanTimeouts(ctx)
	pollUnfinished(ctx)
}

func scanTimeouts(ctx context.Context) {
	deadline := helper.GetTimestamp() - int64(taskTimeout/time.Second)
	tasks, err := model.ListTimeoutTasks(timeoutScanLimit, deadline)
	if err != nil {
		logger.Error(ctx, "failed to list timeout tasks: "+err.Error())
		return
	}
	for _, t := range tasks {
		failTask(ctx, t, "task timed out", "")
	}
}

// failTask CAS-migrates the task to FAILURE; only the CAS winner refunds.
func failTask(ctx context.Context, t *model.Task, reason string, rawData string) {
	updates := map[string]interface{}{
		"status":      model.TaskStatusFailure,
		"fail_reason": reason,
		"finish_time": helper.GetTimestamp(),
	}
	if rawData != "" {
		updates["data"] = rawData
	}
	won, err := model.UpdateTaskStatus(t.Id, t.Status, updates)
	if err != nil {
		logger.Error(ctx, fmt.Sprintf("task %s: failed to mark FAILURE: %s", t.TaskId, err.Error()))
		return
	}
	if !won {
		return // another writer migrated it first; that writer handled the money
	}
	RefundTask(ctx, t, reason)
}

func pollUnfinished(ctx context.Context) {
	tasks, err := model.ListUnfinishedTasks(pollBatchLimit)
	if err != nil {
		logger.Error(ctx, "failed to list unfinished tasks: "+err.Error())
		return
	}
	// group by platform+channel so credentials are resolved once per group
	type groupKey struct {
		platform  string
		channelId int
	}
	groups := make(map[groupKey][]*model.Task)
	for _, t := range tasks {
		key := groupKey{platform: t.Platform, channelId: t.ChannelId}
		groups[key] = append(groups[key], t)
	}
	for key, group := range groups {
		adaptor := adaptorByPlatform(key.platform)
		if adaptor == nil {
			logger.Error(ctx, fmt.Sprintf("no task adaptor for platform %q, skipping %d tasks", key.platform, len(group)))
			continue
		}
		channel, err := model.GetChannelById(key.channelId, true)
		if err != nil {
			// channel deleted: leave the tasks for the timeout scan
			logger.Error(ctx, fmt.Sprintf("failed to load channel #%d for %d tasks: %s", key.channelId, len(group), err.Error()))
			continue
		}
		baseURL := channel.GetBaseURL()
		if baseURL == "" {
			if channel.Type < 0 || channel.Type >= len(channeltype.ChannelBaseURLs) {
				// corrupt channel config: don't index out of bounds; skip the
				// group and let these tasks hit the timeout scan
				logger.Error(ctx, fmt.Sprintf("channel #%d has invalid type %d, skipping %d tasks", key.channelId, channel.Type, len(group)))
				continue
			}
			baseURL = channeltype.ChannelBaseURLs[channel.Type]
		}
		for i, t := range group {
			if i > 0 {
				time.Sleep(fetchInterval)
			}
			pollTask(ctx, adaptor, t, baseURL, channel.Key)
		}
	}
}

// pollTask queries the upstream once for one task. Any transient problem
// (network error, non-200, unparsable body) leaves the task untouched for
// the next round — the only way a task is given up on is the timeout scan.
func pollTask(ctx context.Context, adaptor Adaptor, t *model.Task, baseURL string, key string) {
	pd, err := t.GetPrivateData()
	if err != nil || pd.UpstreamTaskId == "" {
		logger.Error(ctx, fmt.Sprintf("task %s: missing upstream task id, leaving for timeout scan", t.TaskId))
		return
	}
	fetchCtx, cancel := context.WithTimeout(ctx, fetchTimeout)
	defer cancel()
	resp, err := adaptor.FetchTask(fetchCtx, baseURL, key, pd.UpstreamTaskId)
	if err != nil {
		logger.Error(ctx, fmt.Sprintf("task %s: fetch failed: %s", t.TaskId, err.Error()))
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusTooManyRequests {
		return // rate limited: keep the task as-is, retry next round
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		logger.Error(ctx, fmt.Sprintf("task %s: failed to read fetch response: %s", t.TaskId, err.Error()))
		return
	}
	if resp.StatusCode != http.StatusOK {
		logger.Error(ctx, fmt.Sprintf("task %s: fetch returned status %d", t.TaskId, resp.StatusCode))
		return
	}
	info, err := adaptor.ParseTaskResult(body)
	if err != nil {
		logger.Error(ctx, fmt.Sprintf("task %s: failed to parse fetch response: %s", t.TaskId, err.Error()))
		return
	}
	applyTaskInfo(ctx, adaptor, t, info, string(body))
}

func applyTaskInfo(ctx context.Context, adaptor Adaptor, t *model.Task, info *TaskInfo, rawData string) {
	switch info.Status {
	case model.TaskStatusSuccess:
		won, err := model.UpdateTaskStatus(t.Id, t.Status, map[string]interface{}{
			"status":      model.TaskStatusSuccess,
			"progress":    100,
			"result_url":  info.Url,
			"finish_time": helper.GetTimestamp(),
			"data":        model.NormalizeJSONColumn(rawData),
		})
		if err != nil {
			logger.Error(ctx, fmt.Sprintf("task %s: failed to mark SUCCESS: %s", t.TaskId, err.Error()))
			return
		}
		if !won {
			return
		}
		SettleSuccess(ctx, adaptor, t, info)
	case model.TaskStatusFailure:
		failTask(ctx, t, info.Reason, rawData)
	default:
		// still running: refresh progress without touching money
		updates := map[string]interface{}{
			"progress": info.Progress,
		}
		if info.Status != "" {
			updates["status"] = info.Status
		}
		if info.Status == model.TaskStatusInProgress && t.StartTime == 0 {
			updates["start_time"] = helper.GetTimestamp()
		}
		if err := model.UpdateTaskNonTerminal(t.Id, updates); err != nil {
			logger.Error(ctx, fmt.Sprintf("task %s: failed to update progress: %s", t.TaskId, err.Error()))
		}
	}
}
