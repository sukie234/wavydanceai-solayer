package seedance

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"

	"github.com/songquanpeng/one-api/common/client"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/relay/meta"
	"github.com/songquanpeng/one-api/relay/task"
)

func init() {
	gin.SetMode(gin.TestMode)
	client.Init()
}

// newValidatedAdaptor runs Init + ValidateRequest over a raw /v1/videos body.
func newValidatedAdaptor(t *testing.T, body string, actualModel string) (*Adaptor, *meta.Meta, error) {
	t.Helper()
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/videos", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	m := &meta.Meta{ActualModelName: actualModel}
	a := &Adaptor{}
	a.Init(m)
	_, err := a.ValidateRequest(c, m)
	return a, m, err
}

func TestRegistration(t *testing.T) {
	for _, name := range ModelList {
		require.Equal(t, Platform, task.GetPlatform(name))
	}
	require.NotNil(t, task.GetAdaptor(Platform))
	require.Empty(t, task.GetPlatform("gpt-4o"))
}

func TestBuildRequestBody(t *testing.T) {
	body := `{"model":"seedance-2.0","prompt":"a corgi running on the beach",` +
		`"seconds":"5","resolution":"720p","ratio":"16:9","seed":42,"watermark":false}`
	a, m, err := newValidatedAdaptor(t, body, "doubao-seedance-2-0-260128")
	require.NoError(t, err)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	reader, err := a.BuildRequestBody(c, m)
	require.NoError(t, err)
	raw, err := io.ReadAll(reader)
	require.NoError(t, err)

	var got map[string]any
	require.NoError(t, json.Unmarshal(raw, &got))
	require.Equal(t, "doubao-seedance-2-0-260128", got["model"], "must send the mapped model name")
	content := got["content"].([]any)
	require.Len(t, content, 1)
	require.Equal(t, map[string]any{"type": "text", "text": "a corgi running on the beach"}, content[0])
	require.Equal(t, "720p", got["resolution"])
	require.Equal(t, "16:9", got["ratio"])
	require.EqualValues(t, 5, got["duration"])
	require.EqualValues(t, 42, got["seed"])
	require.Equal(t, false, got["watermark"])
}

func TestBuildRequestBody_Defaults(t *testing.T) {
	a, m, err := newValidatedAdaptor(t, `{"model":"seedance-2.0","prompt":"hi there"}`, "seedance-2.0")
	require.NoError(t, err)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	reader, err := a.BuildRequestBody(c, m)
	require.NoError(t, err)
	raw, err := io.ReadAll(reader)
	require.NoError(t, err)

	var got map[string]any
	require.NoError(t, json.Unmarshal(raw, &got))
	require.Equal(t, "720p", got["resolution"])
	require.EqualValues(t, 5, got["duration"])
	_, hasRatio := got["ratio"]
	require.False(t, hasRatio, "unset ratio must be omitted (upstream default)")
	_, hasSeed := got["seed"]
	require.False(t, hasSeed)
	_, hasWatermark := got["watermark"]
	require.False(t, hasWatermark)
}

func TestValidateRequest_Errors(t *testing.T) {
	cases := []struct {
		name  string
		body  string
		model string
	}{
		{"empty prompt", `{"model":"seedance-2.0","prompt":"  "}`, "seedance-2.0"},
		{"bad seconds", `{"model":"seedance-2.0","prompt":"x","seconds":"five"}`, "seedance-2.0"},
		{"seconds too short", `{"model":"seedance-2.0","prompt":"x","seconds":"2"}`, "seedance-2.0"},
		{"seconds too long", `{"model":"seedance-2.0","prompt":"x","seconds":"30"}`, "seedance-2.0"},
		{"bad resolution", `{"model":"seedance-2.0","prompt":"x","resolution":"4k"}`, "seedance-2.0"},
		{"bad ratio", `{"model":"seedance-2.0","prompt":"x","ratio":"2:1"}`, "seedance-2.0"},
		{"fast at 1080p", `{"model":"seedance-2.0-fast","prompt":"x","resolution":"1080p"}`, "seedance-2.0-fast"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, _, err := newValidatedAdaptor(t, tc.body, tc.model)
			require.Error(t, err)
		})
	}
}

func TestBuildRequestURL(t *testing.T) {
	a := &Adaptor{}
	url, err := a.BuildRequestURL(&meta.Meta{BaseURL: "https://ark.cn-beijing.volces.com/"})
	require.NoError(t, err)
	require.Equal(t, "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks", url)
	_, err = a.BuildRequestURL(&meta.Meta{})
	require.Error(t, err)
}

func TestDoResponse_ParsesUpstreamTaskId(t *testing.T) {
	a := &Adaptor{}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(`{"id":"cgt-20260611-abc123"}`)),
	}
	id, respErr := a.DoResponse(c, resp, &meta.Meta{})
	require.Nil(t, respErr)
	require.Equal(t, "cgt-20260611-abc123", id)
}

func TestDoResponse_UpstreamErrors(t *testing.T) {
	cases := []struct {
		name       string
		status     int
		body       string
		wantInMsg  string
		wantCode   string
		wantStatus int
	}{
		{
			"invalid parameter",
			http.StatusBadRequest,
			`{"error":{"code":"InvalidParameter","message":"The parameter duration specified in the request are not valid"}}`,
			"duration", "InvalidParameter", http.StatusBadRequest,
		},
		{
			"content moderation",
			http.StatusBadRequest,
			`{"error":{"code":"InputTextSensitiveContentDetected","message":"The request failed because the input text may contain sensitive information"}}`,
			"sensitive", "InputTextSensitiveContentDetected", http.StatusBadRequest,
		},
		{
			"non-json body",
			http.StatusBadGateway,
			`upstream exploded`,
			"502", "", http.StatusBadGateway,
		},
		{
			// worldrouter wraps the error in "detail" instead of "error";
			// body observed live against inference-api.worldrouter.ai.
			"worldrouter detail envelope",
			http.StatusPaymentRequired,
			`{"detail":{"code":"seedance_balance_too_low","message":"Insufficient team balance for Seedance use — please recharge.","required_available_nano":10000000000,"available_nano":999892001}}`,
			"Insufficient team balance", "seedance_balance_too_low", http.StatusPaymentRequired,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			a := &Adaptor{}
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			resp := &http.Response{StatusCode: tc.status, Body: io.NopCloser(strings.NewReader(tc.body))}
			id, respErr := a.DoResponse(c, resp, &meta.Meta{})
			require.Empty(t, id)
			require.NotNil(t, respErr)
			require.Equal(t, tc.wantStatus, respErr.StatusCode)
			require.Contains(t, respErr.Error.Message, tc.wantInMsg)
			require.Equal(t, tc.wantCode, respErr.Error.Code)
		})
	}
}

func TestDoResponse_MissingTaskId(t *testing.T) {
	a := &Adaptor{}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	resp := &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`{}`))}
	_, respErr := a.DoResponse(c, resp, &meta.Meta{})
	require.NotNil(t, respErr)
}

func TestParseTaskResult_AllStatuses(t *testing.T) {
	a := &Adaptor{}

	t.Run("queued", func(t *testing.T) {
		info, err := a.ParseTaskResult([]byte(`{"id":"cgt-1","status":"queued","created_at":1765432100,"updated_at":1765432100}`))
		require.NoError(t, err)
		require.Equal(t, model.TaskStatusQueued, info.Status)
		require.Equal(t, "cgt-1", info.TaskId)
	})

	t.Run("running", func(t *testing.T) {
		info, err := a.ParseTaskResult([]byte(`{"id":"cgt-1","status":"running"}`))
		require.NoError(t, err)
		require.Equal(t, model.TaskStatusInProgress, info.Status)
	})

	t.Run("succeeded", func(t *testing.T) {
		body := `{"id":"cgt-1","status":"succeeded",` +
			`"content":{"video_url":"https://ark-content.tos-cn-beijing.volces.com/cgt-1.mp4"},` +
			`"usage":{"completion_tokens":108900,"total_tokens":108900}}`
		info, err := a.ParseTaskResult([]byte(body))
		require.NoError(t, err)
		require.Equal(t, model.TaskStatusSuccess, info.Status)
		require.Equal(t, "https://ark-content.tos-cn-beijing.volces.com/cgt-1.mp4", info.Url)
		require.EqualValues(t, 108900, info.TotalTokens)
		require.Equal(t, 100, info.Progress)
	})

	t.Run("succeeded with worldrouter output_tokens", func(t *testing.T) {
		// worldrouter reports usage.output_tokens instead of total_tokens.
		body := `{"id":"cgt-1","status":"succeeded",` +
			`"content":{"video_url":"https://cdn.worldrouter.ai/cgt-1.mp4"},` +
			`"usage":{"output_tokens":108900}}`
		info, err := a.ParseTaskResult([]byte(body))
		require.NoError(t, err)
		require.Equal(t, model.TaskStatusSuccess, info.Status)
		require.EqualValues(t, 108900, info.TotalTokens)
	})

	t.Run("failed", func(t *testing.T) {
		body := `{"id":"cgt-1","status":"failed",` +
			`"error":{"code":"OutputVideoSensitiveContentDetected","message":"The output video may contain sensitive information"}}`
		info, err := a.ParseTaskResult([]byte(body))
		require.NoError(t, err)
		require.Equal(t, model.TaskStatusFailure, info.Status)
		require.Contains(t, info.Reason, "sensitive")
	})

	t.Run("cancelled", func(t *testing.T) {
		info, err := a.ParseTaskResult([]byte(`{"id":"cgt-1","status":"cancelled"}`))
		require.NoError(t, err)
		require.Equal(t, model.TaskStatusFailure, info.Status)
		require.NotEmpty(t, info.Reason)
	})

	t.Run("expired", func(t *testing.T) {
		info, err := a.ParseTaskResult([]byte(`{"id":"cgt-1","status":"expired"}`))
		require.NoError(t, err)
		require.Equal(t, model.TaskStatusFailure, info.Status)
		require.NotEmpty(t, info.Reason)
	})

	t.Run("succeeded without video_url leaves a retry", func(t *testing.T) {
		// finalizing here would settle the charge with no artifact; the error
		// keeps the task for the next round (timeout scan refunds eventually)
		_, err := a.ParseTaskResult([]byte(`{"id":"cgt-1","status":"succeeded","usage":{"total_tokens":108900}}`))
		require.Error(t, err)
		_, err = a.ParseTaskResult([]byte(`{"id":"cgt-1","status":"succeeded","content":{"video_url":"  "}}`))
		require.Error(t, err)
	})

	t.Run("unknown status leaves a retry", func(t *testing.T) {
		_, err := a.ParseTaskResult([]byte(`{"id":"cgt-1","status":"warming_up"}`))
		require.Error(t, err)
	})

	t.Run("garbage body", func(t *testing.T) {
		_, err := a.ParseTaskResult([]byte(`not json`))
		require.Error(t, err)
	})
}

// Golden case from the research notes: the official example for 720p 16:9 5s
// reports usage.total_tokens = 108900. Our estimate with nominal 1280×720
// dimensions is 5 × 1280 × 720 × 24 / 1024 = 108000 — within 1% of the
// official number; the upstream-reported usage settles the difference.
func TestEstimateBilling_GoldenCase(t *testing.T) {
	body := `{"model":"seedance-2.0","prompt":"x","seconds":"5","resolution":"720p","ratio":"16:9"}`
	a, m, err := newValidatedAdaptor(t, body, "seedance-2.0")
	require.NoError(t, err)

	ratios, err := a.EstimateBilling(m)
	require.NoError(t, err)
	estimatedTokens := ratios["tokens"] * 1000
	require.EqualValues(t, 108000, estimatedTokens)
	require.InEpsilon(t, 108900, estimatedTokens, 0.01, "estimate must stay within 1% of the official usage example")

	// quota wiring sanity: seedance-2.0 at ratio 3.5 → 5s 720p ≈ $0.76
	quota := task.ComputeQuota(&model.TaskBillingContext{
		ModelRatio:  3.5,
		GroupRatio:  1,
		OtherRatios: ratios,
	})
	require.EqualValues(t, 378000, quota)
}

func TestEstimateBilling_Dimensions(t *testing.T) {
	cases := []struct {
		name       string
		body       string
		wantTokens float64
	}{
		// 9:16 portrait keeps the same pixel area as 16:9 → same tokens
		{"720p 9:16 5s", `{"model":"seedance-2.0","prompt":"x","seconds":"5","resolution":"720p","ratio":"9:16"}`, 108000},
		// adaptive estimated as 16:9
		{"720p adaptive 5s", `{"model":"seedance-2.0","prompt":"x","seconds":"5","ratio":"adaptive"}`, 108000},
		// 480p 16:9: width 480×16/9 truncates to 853 → 5 × 853 × 480 × 24 / 1024 = 47981.25
		{"480p 16:9 5s", `{"model":"seedance-2.0","prompt":"x","seconds":"5","resolution":"480p","ratio":"16:9"}`, 47981.25},
		// 1080p 16:9 10s: 10 × 1920 × 1080 × 24 / 1024 = 486000
		{"1080p 16:9 10s", `{"model":"seedance-2.0","prompt":"x","seconds":"10","resolution":"1080p","ratio":"16:9"}`, 486000},
		// 1:1: 5 × 720 × 720 × 24 / 1024 = 60750
		{"720p 1:1 5s", `{"model":"seedance-2.0","prompt":"x","seconds":"5","resolution":"720p","ratio":"1:1"}`, 60750},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			a, m, err := newValidatedAdaptor(t, tc.body, "seedance-2.0")
			require.NoError(t, err)
			ratios, err := a.EstimateBilling(m)
			require.NoError(t, err)
			require.InDelta(t, tc.wantTokens, ratios["tokens"]*1000, 0.001)
		})
	}
}

// 1080p (non-fast) bills at the $7.70/M tier: a 1.1× surcharge over the
// $7.00/M ModelRatio, threaded through OtherRatios into both the pre-charge
// and the settlement override.
func TestEstimateBilling_1080pSurcharge(t *testing.T) {
	body := `{"model":"seedance-2.0","prompt":"x","seconds":"10","resolution":"1080p","ratio":"16:9"}`
	a, m, err := newValidatedAdaptor(t, body, "seedance-2.0")
	require.NoError(t, err)
	ratios, err := a.EstimateBilling(m)
	require.NoError(t, err)
	require.Equal(t, hdSurcharge, ratios[hdSurchargeKey])

	// pre-charge: 486000 tokens × 3.5 × 1.1 = 1871100 quota
	quota := task.ComputeQuota(&model.TaskBillingContext{
		ModelRatio:  3.5,
		GroupRatio:  1,
		OtherRatios: ratios,
	})
	require.EqualValues(t, 1_871_100, quota)

	// non-1080p must not carry the surcharge
	a720, m720, err := newValidatedAdaptor(t,
		`{"model":"seedance-2.0","prompt":"x","seconds":"5","resolution":"720p"}`, "seedance-2.0")
	require.NoError(t, err)
	ratios720, err := a720.EstimateBilling(m720)
	require.NoError(t, err)
	require.NotContains(t, ratios720, hdSurchargeKey)
}

func TestAdjustBillingOnComplete(t *testing.T) {
	a := &Adaptor{}
	newTask := func(otherRatios map[string]float64) *model.Task {
		tk := &model.Task{}
		require.NoError(t, tk.SetPrivateData(&model.TaskPrivateData{
			Billing: model.TaskBillingContext{
				ModelRatio:  3.5,
				GroupRatio:  1,
				OtherRatios: otherRatios,
			},
		}))
		return tk
	}

	t.Run("1080p settles at the 3.85-equivalent tier", func(t *testing.T) {
		quota, ok := a.AdjustBillingOnComplete(
			newTask(map[string]float64{"tokens": 486, hdSurchargeKey: hdSurcharge}),
			&task.TaskInfo{TotalTokens: 490_000})
		require.True(t, ok)
		// 490000 × 3.5 × 1 × 1.1 = 490000 × 3.85
		require.EqualValues(t, 1_886_500, quota)
	})

	t.Run("non-1080p falls through to the default recalculation", func(t *testing.T) {
		_, ok := a.AdjustBillingOnComplete(
			newTask(map[string]float64{"tokens": 108}),
			&task.TaskInfo{TotalTokens: 108_900})
		require.False(t, ok)
	})

	t.Run("no reported usage keeps the pre-consumed amount", func(t *testing.T) {
		_, ok := a.AdjustBillingOnComplete(
			newTask(map[string]float64{"tokens": 486, hdSurchargeKey: hdSurcharge}),
			&task.TaskInfo{})
		require.False(t, ok)
	})
}

func TestFetchTask_RequestShape(t *testing.T) {
	var gotURI, gotAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotURI = r.RequestURI
		gotAuth = r.Header.Get("Authorization")
		_, _ = w.Write([]byte(`{"id":"cgt-1","status":"queued"}`))
	}))
	defer server.Close()

	a := &Adaptor{}
	resp, err := a.FetchTask(context.Background(), server.URL, "sk-test", "cgt-1")
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.Equal(t, "/api/v3/contents/generations/tasks/cgt-1", gotURI)
	require.Equal(t, "Bearer sk-test", gotAuth)

	// odd upstream ids must be path-escaped, not spliced raw into the URL
	resp, err = a.FetchTask(context.Background(), server.URL, "sk-test", "cgt 1?x")
	require.NoError(t, err)
	resp.Body.Close()
	require.Equal(t, "/api/v3/contents/generations/tasks/cgt%201%3Fx", gotURI)
}

// FetchTask must thread ctx into the HTTP request, or the poller's 30s
// per-fetch deadline would never fire against a hung upstream.
func TestFetchTask_HonorsContextDeadline(t *testing.T) {
	block := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-block
	}))
	defer server.Close()
	defer close(block)

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	a := &Adaptor{}
	start := time.Now()
	_, err := a.FetchTask(ctx, server.URL, "sk-test", "cgt-1")
	require.Error(t, err)
	require.ErrorIs(t, err, context.DeadlineExceeded)
	require.Less(t, time.Since(start), 5*time.Second)
}

func TestGetModelListAndChannelName(t *testing.T) {
	a := &Adaptor{}
	require.Equal(t, ModelList, a.GetModelList())
	require.Len(t, a.GetModelList(), 4)
	require.Equal(t, "seedance", a.GetChannelName())
}
