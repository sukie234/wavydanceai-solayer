// Package task implements the async task relay framework: long-running
// upstream jobs (video generation, ...) that are submitted once, billed
// up-front and resolved later by a polling loop. Each upstream platform
// plugs in via the Adaptor interface, mirroring relay/adaptor for the
// synchronous relays.
package task

import (
	"context"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/relay/meta"
	relaymodel "github.com/songquanpeng/one-api/relay/model"
)

// TaskInfo is the normalized view of one upstream task query result; every
// adaptor's ParseTaskResult must map its upstream payload into this shape.
type TaskInfo struct {
	TaskId      string           // upstream task id
	Status      model.TaskStatus // normalized internal status
	Reason      string           // failure reason, if any
	Url         string           // result url on success
	Progress    int              // 0-100
	TotalTokens int64            // upstream-reported usage; 0 when unknown
}

// Adaptor is implemented once per upstream platform. One request = one
// adaptor instance: implementations may cache the parsed request on the
// struct between ValidateRequest and the Build* calls.
type Adaptor interface {
	Init(meta *meta.Meta)
	// ValidateRequest parses and validates the user request and returns the
	// task action (e.g. "generate").
	ValidateRequest(c *gin.Context, meta *meta.Meta) (action string, err error)
	BuildRequestURL(meta *meta.Meta) (string, error)
	BuildRequestHeader(c *gin.Context, req *http.Request, meta *meta.Meta) error
	BuildRequestBody(c *gin.Context, meta *meta.Meta) (io.Reader, error)
	DoRequest(c *gin.Context, meta *meta.Meta, requestBody io.Reader) (*http.Response, error)
	// DoResponse validates the upstream submit response and returns the
	// upstream task id. It must NOT write to the client — the controller
	// owns the OpenAI-Video-compatible response.
	DoResponse(c *gin.Context, resp *http.Response, meta *meta.Meta) (upstreamTaskId string, err *relaymodel.ErrorWithStatusCode)
	// FetchTask queries the upstream for the current state of one task; it
	// runs in the poller, outside any HTTP request context. The poller sets
	// a per-call deadline on ctx — implementations must honor it (pass it
	// into the http request), or a hung upstream would stall the single
	// polling goroutine and with it every timeout scan and refund.
	FetchTask(ctx context.Context, baseURL string, key string, upstreamTaskId string) (*http.Response, error)
	ParseTaskResult(body []byte) (*TaskInfo, error)
	GetModelList() []string
	GetChannelName() string

	taskBilling
}

// taskBilling are the billing hooks; embed BaseBilling for no-op defaults.
type taskBilling interface {
	// EstimateBilling returns the multiplicative cost ratios derived from the
	// request (e.g. {"seconds": 5, "size": 1.67}) before submission. The
	// pre-consumed quota is modelRatio × groupRatio × ∏otherRatios × 1000.
	EstimateBilling(meta *meta.Meta) (otherRatios map[string]float64, err error)
	// AdjustBillingOnSubmit may correct the pre-consumed quota right after a
	// successful submit, when the upstream reports the actual accepted
	// parameters. Return (quota, true) to override, (0, false) to keep.
	AdjustBillingOnSubmit(meta *meta.Meta, preConsumedQuota int64) (int64, bool)
	// AdjustBillingOnComplete may replace the final quota when the task
	// succeeds. Return (quota, true) to override, (0, false) to fall through
	// to the TotalTokens recalculation (or to the pre-consumed amount).
	AdjustBillingOnComplete(task *model.Task, info *TaskInfo) (int64, bool)
}

// BaseBilling provides no-op billing hooks so adaptors only implement the
// ones their upstream actually needs.
type BaseBilling struct{}

func (BaseBilling) EstimateBilling(*meta.Meta) (map[string]float64, error) {
	return nil, nil
}

func (BaseBilling) AdjustBillingOnSubmit(*meta.Meta, int64) (int64, bool) {
	return 0, false
}

func (BaseBilling) AdjustBillingOnComplete(*model.Task, *TaskInfo) (int64, bool) {
	return 0, false
}

// GetAdaptor returns the adaptor for a task platform, or nil if none is
// registered.
func GetAdaptor(platform string) Adaptor {
	switch platform {
	// Adaptors land in follow-up PRs (Seedance first); nothing is registered
	// yet, so the framework stays dark until then.
	default:
		return nil
	}
}

// GetPlatform maps a requested model name to its task platform, or "" when
// the model is not served by any registered task adaptor.
func GetPlatform(modelName string) string {
	// no task platforms registered yet (dark launch)
	return ""
}
