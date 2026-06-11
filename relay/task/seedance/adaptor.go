// Package seedance implements the async task adaptor for Seedance video
// generation, speaking the Volcano Ark contents-generations protocol:
//
//	POST {base}/api/v3/contents/generations/tasks   (create, Bearer auth)
//	GET  {base}/api/v3/contents/generations/tasks/{id}
//
// The protocol layer is deliberately generic Ark and the base URL comes
// entirely from the channel config, so the same code serves both
// worldrouter (https://inference-api.worldrouter.ai, models
// seedance-2.0 / seedance-2.0-fast) and direct Volcano Ark / BytePlus
// (https://ark.cn-beijing.volces.com, models doubao-seedance-2-0-260128 /
// doubao-seedance-2-0-fast-260128) — only the channel's base_url, key and
// model name differ.
package seedance

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/common/client"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/relay/meta"
	relaymodel "github.com/songquanpeng/one-api/relay/model"
	"github.com/songquanpeng/one-api/relay/task"
)

// Platform is this adaptor's key in the relay/task registry.
const Platform = "seedance"

const tasksPath = "/api/v3/contents/generations/tasks"

// ModelList holds both upstream namings; they map to the same adaptor and
// are sent upstream verbatim (use the name your channel's upstream expects,
// or a channel model mapping).
var ModelList = []string{
	// worldrouter naming
	"seedance-2.0",
	"seedance-2.0-fast",
	// Volcano Ark / BytePlus naming
	"doubao-seedance-2-0-260128",
	"doubao-seedance-2-0-fast-260128",
}

func init() {
	task.Register(Platform, func() task.Adaptor { return &Adaptor{} }, ModelList...)
}

const (
	defaultDuration   = 5
	defaultResolution = "720p"
	minDuration       = 4
	maxDuration       = 15
)

// Seedance 2.0 (non-fast) 1080p is priced at $7.70/M tokens vs $7.00/M for
// 480p/720p, i.e. a 7.70/7.00 = 1.1× surcharge over the ModelRatio base
// tier. It rides in OtherRatios: ComputeQuota multiplies it into the
// pre-charge, and the billing snapshot in the task's private data carries it
// to AdjustBillingOnComplete for settlement. (Fast models reject 1080p at
// validation, so the surcharge can only apply to non-fast 2.0.)
const (
	hdSurchargeKey = "hd_surcharge"
	hdSurcharge    = 1.1
)

// resolutionShortSide: the billing estimate treats the resolution as the
// short side and derives the long side from the aspect ratio.
var resolutionShortSide = map[string]int{"480p": 480, "720p": 720, "1080p": 1080}

// aspectRatios maps the Ark ratio enum to width:height. "adaptive" (and
// unset) is estimated as 16:9 — the upstream-reported total_tokens settles
// the real amount on completion anyway.
var aspectRatios = map[string][2]int{
	"16:9": {16, 9}, "4:3": {4, 3}, "1:1": {1, 1},
	"3:4": {3, 4}, "9:16": {9, 16}, "21:9": {21, 9},
}

// request is the user-facing body of POST /v1/videos with the Seedance
// extension fields. `seconds` is the OpenAI-Video duration field (a string);
// resolution / ratio / seed / watermark pass through to Ark.
//
// TODO(i2v): image-to-video is not implemented yet — worldrouter requires
// its asset upload flow (asset_group_id) instead of public image URLs, and
// direct-Ark image_url passthrough needs a live key to verify.
type request struct {
	Prompt     string `json:"prompt"`
	Seconds    string `json:"seconds"`
	Resolution string `json:"resolution"`
	Ratio      string `json:"ratio"`
	Seed       *int64 `json:"seed"`
	Watermark  *bool  `json:"watermark"`
}

// Adaptor implements task.Adaptor for one request: ValidateRequest caches
// the parsed request for the later Build* / EstimateBilling calls.
type Adaptor struct {
	task.BaseBilling
	meta       *meta.Meta
	req        *request
	duration   int    // seconds, defaulted + validated
	resolution string // defaulted + validated
}

func (a *Adaptor) Init(meta *meta.Meta) {
	a.meta = meta
}

func (a *Adaptor) ValidateRequest(c *gin.Context, meta *meta.Meta) (string, error) {
	req := &request{}
	if err := common.UnmarshalBodyReusable(c, req); err != nil {
		return "", err
	}
	if strings.TrimSpace(req.Prompt) == "" {
		return "", errors.New("prompt 不能为空")
	}
	duration := defaultDuration
	if req.Seconds != "" {
		d, err := strconv.Atoi(req.Seconds)
		if err != nil {
			return "", fmt.Errorf("seconds 必须是整数秒数，收到 %q", req.Seconds)
		}
		duration = d
	}
	if duration < minDuration || duration > maxDuration {
		return "", fmt.Errorf("seconds 必须在 %d-%d 秒之间", minDuration, maxDuration)
	}
	resolution := req.Resolution
	if resolution == "" {
		resolution = defaultResolution
	}
	if _, ok := resolutionShortSide[resolution]; !ok {
		return "", fmt.Errorf("resolution 仅支持 480p/720p/1080p，收到 %q", req.Resolution)
	}
	if resolution == "1080p" && strings.Contains(meta.ActualModelName, "fast") {
		return "", errors.New("fast 模型不支持 1080p")
	}
	if req.Ratio != "" && req.Ratio != "adaptive" {
		if _, ok := aspectRatios[req.Ratio]; !ok {
			return "", fmt.Errorf("ratio 不支持 %q", req.Ratio)
		}
	}
	a.req = req
	a.duration = duration
	a.resolution = resolution
	return "generate", nil
}

// EstimateBilling pre-charges by the documented Seedance token formula:
//
//	tokens = duration(s) × width × height × 24fps ÷ 1024
//
// e.g. 720p 16:9 5s → 5 × 1280 × 720 × 24 / 1024 = 108000 tokens. (The
// official example reports usage.total_tokens=108900 for the same input —
// the model's actual encode dimensions differ slightly; the framework
// settles the delta from the upstream-reported usage on completion, so the
// estimate only needs to be close.) ModelRatio is in quota-per-1K-tokens
// units, hence tokens/1000 here against the framework's ×1000 quotaScale.
func (a *Adaptor) EstimateBilling(meta *meta.Meta) (map[string]float64, error) {
	if a.req == nil {
		return nil, errors.New("EstimateBilling called before ValidateRequest")
	}
	w, h := a.estimateDimensions()
	tokens := float64(a.duration) * float64(w) * float64(h) * 24 / 1024
	ratios := map[string]float64{"tokens": tokens / 1000}
	if a.resolution == "1080p" {
		ratios[hdSurchargeKey] = hdSurcharge
	}
	return ratios, nil
}

// AdjustBillingOnComplete applies the 1080p price tier on settlement. The
// framework's default recalculation is totalTokens × ModelRatio × GroupRatio
// (see task.SettleSuccess); for 1080p tasks the surcharge snapshotted in the
// billing context at submit time must be multiplied in as well — otherwise
// settlement would silently fall back to the cheaper 480p/720p tier and
// undercharge by ~9%. Non-1080p tasks fall through to the default.
func (a *Adaptor) AdjustBillingOnComplete(t *model.Task, info *task.TaskInfo) (int64, bool) {
	if info.TotalTokens <= 0 {
		return 0, false
	}
	pd, err := t.GetPrivateData()
	if err != nil {
		return 0, false
	}
	surcharge, ok := pd.Billing.OtherRatios[hdSurchargeKey]
	if !ok || surcharge <= 0 {
		return 0, false
	}
	bc := pd.Billing
	return int64(float64(info.TotalTokens) * bc.ModelRatio * bc.GroupRatio * surcharge), true
}

func (a *Adaptor) estimateDimensions() (width, height int) {
	short := resolutionShortSide[a.resolution]
	ar, ok := aspectRatios[a.req.Ratio]
	if !ok {
		ar = aspectRatios["16:9"] // adaptive / unset: estimate as 16:9
	}
	if ar[0] >= ar[1] {
		return short * ar[0] / ar[1], short
	}
	return short, short * ar[1] / ar[0]
}

// arkContent is one entry of the Ark create request's content array.
type arkContent struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
}

// arkCreateRequest is the Ark create-task body: model + content[] plus
// top-level generation parameters.
type arkCreateRequest struct {
	Model      string       `json:"model"`
	Content    []arkContent `json:"content"`
	Resolution string       `json:"resolution"`
	Ratio      string       `json:"ratio,omitempty"`
	Duration   int          `json:"duration"`
	Seed       *int64       `json:"seed,omitempty"`
	Watermark  *bool        `json:"watermark,omitempty"`
}

func (a *Adaptor) BuildRequestURL(meta *meta.Meta) (string, error) {
	if meta.BaseURL == "" {
		return "", errors.New("渠道未配置 base url")
	}
	return strings.TrimSuffix(meta.BaseURL, "/") + tasksPath, nil
}

func (a *Adaptor) BuildRequestHeader(c *gin.Context, req *http.Request, meta *meta.Meta) error {
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+meta.APIKey)
	return nil
}

func (a *Adaptor) BuildRequestBody(c *gin.Context, meta *meta.Meta) (io.Reader, error) {
	if a.req == nil {
		return nil, errors.New("BuildRequestBody called before ValidateRequest")
	}
	body := arkCreateRequest{
		Model:      meta.ActualModelName,
		Content:    []arkContent{{Type: "text", Text: a.req.Prompt}},
		Resolution: a.resolution,
		Ratio:      a.req.Ratio,
		Duration:   a.duration,
		Seed:       a.req.Seed,
		Watermark:  a.req.Watermark,
	}
	data, err := json.Marshal(&body)
	if err != nil {
		return nil, err
	}
	return bytes.NewReader(data), nil
}

func (a *Adaptor) DoRequest(c *gin.Context, meta *meta.Meta, requestBody io.Reader) (*http.Response, error) {
	requestURL, err := a.BuildRequestURL(meta)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, requestURL, requestBody)
	if err != nil {
		return nil, err
	}
	if err = a.BuildRequestHeader(c, req, meta); err != nil {
		return nil, err
	}
	return client.HTTPClient.Do(req)
}

// arkError is the Ark error envelope: {"error":{"code":"...","message":"..."}}.
type arkError struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// DoResponse parses the create response and returns the upstream task id
// (cgt-xxx). On a rejected submit (e.g. 400 InvalidParameter or
// InputTextSensitiveContentDetected) it returns the upstream message — the
// controller then refunds the pre-consumed quota and creates no task row,
// so a rejected submit leaves nothing behind.
func (a *Adaptor) DoResponse(c *gin.Context, resp *http.Response, meta *meta.Meta) (string, *relaymodel.ErrorWithStatusCode) {
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", seedanceError(http.StatusInternalServerError, "", "读取上游响应失败："+err.Error())
	}
	if resp.StatusCode != http.StatusOK {
		message := fmt.Sprintf("上游返回状态码 %d", resp.StatusCode)
		code := ""
		var e arkError
		if json.Unmarshal(body, &e) == nil && e.Error.Message != "" {
			message = e.Error.Message
			code = e.Error.Code
		}
		return "", seedanceError(resp.StatusCode, code, message)
	}
	var created struct {
		Id string `json:"id"`
	}
	if err = json.Unmarshal(body, &created); err != nil || created.Id == "" {
		return "", seedanceError(http.StatusInternalServerError, "", "上游未返回任务 ID："+string(body))
	}
	return created.Id, nil
}

func seedanceError(status int, code string, message string) *relaymodel.ErrorWithStatusCode {
	return &relaymodel.ErrorWithStatusCode{
		StatusCode: status,
		Error: relaymodel.Error{
			Message: message,
			Type:    "seedance_error",
			Code:    code,
		},
	}
}

// FetchTask runs in the poller, outside any HTTP request context; ctx
// carries the poller's per-call deadline and must reach the HTTP request.
// Responses are returned as-is: the poller itself treats 429 (and any other
// non-200) as "keep the task, retry next round".
func (a *Adaptor) FetchTask(ctx context.Context, baseURL string, key string, upstreamTaskId string) (*http.Response, error) {
	fetchURL := strings.TrimSuffix(baseURL, "/") + tasksPath + "/" + url.PathEscape(upstreamTaskId)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fetchURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	return client.HTTPClient.Do(req)
}

// arkTask is the Ark query response.
type arkTask struct {
	Id      string `json:"id"`
	Status  string `json:"status"` // queued | running | succeeded | failed | cancelled | expired
	Content struct {
		VideoUrl string `json:"video_url"`
	} `json:"content"`
	Usage struct {
		TotalTokens int64 `json:"total_tokens"`
	} `json:"usage"`
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func (a *Adaptor) ParseTaskResult(body []byte) (*task.TaskInfo, error) {
	var t arkTask
	if err := json.Unmarshal(body, &t); err != nil {
		return nil, err
	}
	info := &task.TaskInfo{TaskId: t.Id}
	switch t.Status {
	case "queued":
		info.Status = model.TaskStatusQueued
	case "running":
		info.Status = model.TaskStatusInProgress
	case "succeeded":
		// succeeded without a video_url must not finalize: it would settle the
		// charge while delivering no artifact. Error out so the poller retries
		// next round; if the URL never appears, the timeout scan eventually
		// fails and refunds the task.
		if strings.TrimSpace(t.Content.VideoUrl) == "" {
			return nil, errors.New("上游任务 succeeded 但未返回 video_url")
		}
		info.Status = model.TaskStatusSuccess
		info.Url = t.Content.VideoUrl
		info.TotalTokens = t.Usage.TotalTokens
		info.Progress = 100
	case "failed", "cancelled", "expired":
		info.Status = model.TaskStatusFailure
		info.Reason = t.Error.Message
		if info.Reason == "" {
			info.Reason = "上游任务 " + t.Status
		}
	default:
		// unknown / missing status: error out so the poller leaves the task
		// for the next round instead of acting on a guess
		return nil, fmt.Errorf("未知的任务状态 %q", t.Status)
	}
	return info, nil
}

func (a *Adaptor) GetModelList() []string {
	return ModelList
}

func (a *Adaptor) GetChannelName() string {
	return "seedance"
}
