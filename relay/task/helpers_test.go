package task

import (
	"context"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/common/helper"
	"github.com/songquanpeng/one-api/common/random"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/relay/meta"
	relaymodel "github.com/songquanpeng/one-api/relay/model"
)

// setupTaskDB swaps model.DB / model.LOG_DB for a file-backed sqlite with the
// tables the task framework touches. File-backed (not ":memory:") so multiple
// pooled connections see the same database.
func setupTaskDB(t *testing.T) {
	t.Helper()
	// RedisEnabled defaults to true until InitRedisClient runs; without this
	// the quota-cache helpers would dereference a nil redis client.
	common.RedisEnabled = false
	dsn := filepath.Join(t.TempDir(), "task.db") + "?_busy_timeout=5000"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(
		&model.User{}, &model.Token{}, &model.Channel{}, &model.Log{}, &model.Task{},
	))
	model.DB = db
	model.LOG_DB = db
}

func newUserAndToken(t *testing.T, quota int64) (*model.User, *model.Token) {
	t.Helper()
	suffix := random.GetUUID()[:8]
	user := &model.User{
		Username:    "u-" + suffix,
		Password:    "x",
		Role:        model.RoleCommonUser,
		Status:      model.UserStatusEnabled,
		AccessToken: "at-" + suffix, // unique index
		AffCode:     "af-" + suffix, // unique index
		Quota:       quota,
	}
	require.NoError(t, model.DB.Create(user).Error)
	token := &model.Token{
		UserId:         user.Id,
		Key:            "key-" + suffix,
		Status:         model.TokenStatusEnabled,
		Name:           "task-test",
		UnlimitedQuota: true,
	}
	require.NoError(t, model.DB.Create(token).Error)
	return user, token
}

func newTestChannel(t *testing.T) *model.Channel {
	t.Helper()
	channel := &model.Channel{
		Name:   "fake-channel",
		Key:    "sk-fake",
		Status: model.ChannelStatusEnabled,
	}
	require.NoError(t, model.DB.Create(channel).Error)
	return channel
}

// newSubmittedTask mimics what RelayVideoSubmit persists: quota already
// pre-consumed via PreConsumeTokenQuota and the billing context snapshotted.
func newSubmittedTask(t *testing.T, user *model.User, token *model.Token, channelId int, quota int64) *model.Task {
	t.Helper()
	require.NoError(t, model.PreConsumeTokenQuota(token.Id, quota))
	task := &model.Task{
		TaskId:     model.GenerateTaskId(),
		Platform:   "fake",
		UserId:     user.Id,
		Group:      "default",
		ChannelId:  channelId,
		Quota:      quota,
		Action:     "generate",
		Status:     model.TaskStatusQueued,
		SubmitTime: helper.GetTimestamp(),
	}
	require.NoError(t, task.SetPrivateData(&model.TaskPrivateData{
		UpstreamTaskId: "cgt-" + random.GetUUID()[:8],
		Billing: model.TaskBillingContext{
			TokenId:    token.Id,
			TokenName:  token.Name,
			ModelName:  "fake-video",
			ModelRatio: 2,
			GroupRatio: 1,
		},
	}))
	require.NoError(t, model.InsertTask(task))
	return task
}

func userQuota(t *testing.T, userId int) int64 {
	t.Helper()
	var user model.User
	require.NoError(t, model.DB.First(&user, userId).Error)
	return user.Quota
}

func reloadTask(t *testing.T, id int64) *model.Task {
	t.Helper()
	var task model.Task
	require.NoError(t, model.DB.First(&task, id).Error)
	return &task
}

func countLogs(t *testing.T, logType int) int64 {
	t.Helper()
	var n int64
	require.NoError(t, model.LOG_DB.Model(&model.Log{}).Where("type = ?", logType).Count(&n).Error)
	return n
}

func httpResp(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}

// fakeAdaptor lets tests script FetchTask / ParseTaskResult / billing hooks.
type fakeAdaptor struct {
	BaseBilling
	fetch         func(ctx context.Context) (*http.Response, error)
	parse         func(body []byte) (*TaskInfo, error)
	completeQuota *int64 // non-nil: AdjustBillingOnComplete override
}

func (f *fakeAdaptor) Init(*meta.Meta) {}

func (f *fakeAdaptor) ValidateRequest(*gin.Context, *meta.Meta) (string, error) {
	return "generate", nil
}

func (f *fakeAdaptor) BuildRequestURL(*meta.Meta) (string, error) { return "", nil }

func (f *fakeAdaptor) BuildRequestHeader(*gin.Context, *http.Request, *meta.Meta) error {
	return nil
}

func (f *fakeAdaptor) BuildRequestBody(*gin.Context, *meta.Meta) (io.Reader, error) {
	return nil, nil
}

func (f *fakeAdaptor) DoRequest(*gin.Context, *meta.Meta, io.Reader) (*http.Response, error) {
	return nil, nil
}

func (f *fakeAdaptor) DoResponse(*gin.Context, *http.Response, *meta.Meta) (string, *relaymodel.ErrorWithStatusCode) {
	return "", nil
}

func (f *fakeAdaptor) FetchTask(ctx context.Context, baseURL string, key string, upstreamTaskId string) (*http.Response, error) {
	return f.fetch(ctx)
}

func (f *fakeAdaptor) ParseTaskResult(body []byte) (*TaskInfo, error) {
	return f.parse(body)
}

func (f *fakeAdaptor) GetModelList() []string { return []string{"fake-video"} }

func (f *fakeAdaptor) GetChannelName() string { return "fake" }

func (f *fakeAdaptor) AdjustBillingOnComplete(task *model.Task, info *TaskInfo) (int64, bool) {
	if f.completeQuota != nil {
		return *f.completeQuota, true
	}
	return 0, false
}

// withFakeAdaptor routes every platform lookup in the poller to the fake.
func withFakeAdaptor(t *testing.T, fake *fakeAdaptor) {
	t.Helper()
	old := adaptorByPlatform
	adaptorByPlatform = func(string) Adaptor { return fake }
	t.Cleanup(func() { adaptorByPlatform = old })
}
