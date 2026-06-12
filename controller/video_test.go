package controller

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/common/ctxkey"
	"github.com/songquanpeng/one-api/common/random"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/relay/meta"
	relaymodel "github.com/songquanpeng/one-api/relay/model"
	relaytask "github.com/songquanpeng/one-api/relay/task"
)

// setupVideoCtrlTest swaps in a file-backed sqlite. withTaskTable=false leaves
// the tasks table missing so InsertTask fails — the easiest way to exercise
// the post-submit failure path.
func setupVideoCtrlTest(t *testing.T, withTaskTable bool) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	common.RedisEnabled = false
	dsn := filepath.Join(t.TempDir(), "video.db") + "?_busy_timeout=5000"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	tables := []interface{}{&model.User{}, &model.Token{}, &model.Log{}}
	if withTaskTable {
		tables = append(tables, &model.Task{})
	}
	require.NoError(t, db.AutoMigrate(tables...))
	model.DB = db
	model.LOG_DB = db
}

func newVideoUserToken(t *testing.T, quota int64) (*model.User, *model.Token) {
	t.Helper()
	suffix := random.GetUUID()[:8]
	user := &model.User{
		Username:    "v-" + suffix,
		Password:    "x",
		Role:        model.RoleCommonUser,
		Status:      model.UserStatusEnabled,
		AccessToken: "at-" + suffix,
		AffCode:     "af-" + suffix,
		Quota:       quota,
	}
	require.NoError(t, model.DB.Create(user).Error)
	token := &model.Token{
		UserId:         user.Id,
		Key:            "key-" + suffix,
		Status:         model.TokenStatusEnabled,
		Name:           "video-test",
		UnlimitedQuota: true,
	}
	require.NoError(t, model.DB.Create(token).Error)
	return user, token
}

func videoUserQuota(t *testing.T, userId int) int64 {
	t.Helper()
	var user model.User
	require.NoError(t, model.DB.First(&user, userId).Error)
	return user.Quota
}

// fakeVideoAdaptor drives RelayVideoSubmit through a successful upstream
// submission; adjustDelta != 0 makes AdjustBillingOnSubmit raise the charge.
type fakeVideoAdaptor struct {
	relaytask.BaseBilling
	adjustDelta int64
}

func (f *fakeVideoAdaptor) Init(*meta.Meta) {}

func (f *fakeVideoAdaptor) ValidateRequest(*gin.Context, *meta.Meta) (string, error) {
	return "generate", nil
}

func (f *fakeVideoAdaptor) BuildRequestURL(*meta.Meta) (string, error) { return "", nil }

func (f *fakeVideoAdaptor) BuildRequestHeader(*gin.Context, *http.Request, *meta.Meta) error {
	return nil
}

func (f *fakeVideoAdaptor) BuildRequestBody(*gin.Context, *meta.Meta) (io.Reader, error) {
	return strings.NewReader("{}"), nil
}

func (f *fakeVideoAdaptor) DoRequest(*gin.Context, *meta.Meta, io.Reader) (*http.Response, error) {
	return &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(`{"id":"cgt-1"}`)),
	}, nil
}

func (f *fakeVideoAdaptor) DoResponse(*gin.Context, *http.Response, *meta.Meta) (string, *relaymodel.ErrorWithStatusCode) {
	return "cgt-1", nil
}

func (f *fakeVideoAdaptor) FetchTask(context.Context, string, string, string) (*http.Response, error) {
	return nil, nil
}

func (f *fakeVideoAdaptor) ParseTaskResult([]byte) (*relaytask.TaskInfo, error) {
	return nil, nil
}

func (f *fakeVideoAdaptor) GetModelList() []string { return []string{"fake-video"} }

func (f *fakeVideoAdaptor) GetChannelName() string { return "fake" }

func (f *fakeVideoAdaptor) AdjustBillingOnSubmit(_ *meta.Meta, preConsumed int64) (int64, bool) {
	if f.adjustDelta == 0 {
		return 0, false
	}
	return preConsumed + f.adjustDelta, true
}

func withVideoAdaptor(t *testing.T, fake relaytask.Adaptor) {
	t.Helper()
	oldPlatform, oldAdaptor := getTaskPlatform, getTaskAdaptor
	getTaskPlatform = func(string) string { return "fake" }
	getTaskAdaptor = func(string) relaytask.Adaptor { return fake }
	t.Cleanup(func() {
		getTaskPlatform, getTaskAdaptor = oldPlatform, oldAdaptor
	})
}

func callVideoSubmit(t *testing.T, userId int, tokenId int) *httptest.ResponseRecorder {
	t.Helper()
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/videos",
		strings.NewReader(`{"model":"fake-video","prompt":"a cat"}`))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set(ctxkey.Id, userId)
	c.Set(ctxkey.TokenId, tokenId)
	c.Set(ctxkey.TokenName, "video-test")
	c.Set(ctxkey.Group, "default")
	c.Set(ctxkey.Channel, 1)
	c.Set(ctxkey.ChannelId, 1)
	c.Set(ctxkey.RequestModel, "fake-video")
	RelayVideoSubmit(c)
	return w
}

// CodeRabbit finding: after AdjustBillingOnSubmit corrected the charge, the
// later failure paths still refunded the stale pre-consumed amount, leaving
// a residual charge (or over-refunding). The refund must always return
// exactly what is currently debited.
func TestRelayVideoSubmit_FailureAfterAdjustmentRefundsAdjustedAmount(t *testing.T) {
	const initialQuota = int64(1_000_000)
	setupVideoCtrlTest(t, false) // no tasks table → InsertTask fails after the adjustment
	user, token := newVideoUserToken(t, initialQuota)
	withVideoAdaptor(t, &fakeVideoAdaptor{adjustDelta: 200})

	w := callVideoSubmit(t, user.Id, token.Id)

	require.Equal(t, http.StatusInternalServerError, w.Code)
	require.Equal(t, initialQuota, videoUserQuota(t, user.Id),
		"refund must return the adjusted charge, not the stale pre-consumed amount")
}

// Happy path sanity for the same threading: the persisted task quota, the
// consume log and the wallet debit must all reflect the adjusted charge.
func TestRelayVideoSubmit_AdjustedChargeIsConsistent(t *testing.T) {
	const initialQuota = int64(1_000_000)
	setupVideoCtrlTest(t, true)
	user, token := newVideoUserToken(t, initialQuota)
	withVideoAdaptor(t, &fakeVideoAdaptor{adjustDelta: 200})

	w := callVideoSubmit(t, user.Id, token.Id)

	require.Equal(t, http.StatusOK, w.Code)
	var task model.Task
	require.NoError(t, model.DB.First(&task).Error)
	require.Equal(t, initialQuota-task.Quota, videoUserQuota(t, user.Id),
		"wallet debit must equal the persisted task quota")
	var log model.Log
	require.NoError(t, model.LOG_DB.Where("type = ?", model.LogTypeConsume).First(&log).Error)
	require.EqualValues(t, task.Quota, log.Quota,
		"consume log must record the adjusted charge")
}
