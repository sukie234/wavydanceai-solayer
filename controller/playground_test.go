package controller

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/songquanpeng/one-api/common/ctxkey"
	"github.com/songquanpeng/one-api/model"
)

func setupPlaygroundTest(t *testing.T) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:?_busy_timeout=5000"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}))
	model.DB = db
	model.LOG_DB = db
}

func callPlaygroundToken(t *testing.T, userId int) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/user/self/playground_token", nil)
	c.Set(ctxkey.Id, userId)
	GetPlaygroundToken(c)
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	return w, body
}

func TestGetPlaygroundToken_CreatesOnFirstCall(t *testing.T) {
	setupPlaygroundTest(t)
	user := newTestUserCtrl(t, "pg1", 1000)

	w, body := callPlaygroundToken(t, user.Id)
	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, true, body["success"])

	data := body["data"].(map[string]any)
	key := data["key"].(string)
	require.NotEmpty(t, key)
	require.Len(t, key, 48, "key should be the 48-char raw key (no sk- prefix)")

	// DB now has exactly one token row for this user with the reserved name.
	var tokens []model.Token
	require.NoError(t, model.DB.Where("user_id = ?", user.Id).Find(&tokens).Error)
	require.Len(t, tokens, 1)
	require.Equal(t, playgroundTokenName, tokens[0].Name)
	require.True(t, tokens[0].UnlimitedQuota)
	require.Equal(t, int64(-1), tokens[0].ExpiredTime)
	require.Equal(t, model.TokenStatusEnabled, tokens[0].Status)
}

func TestGetPlaygroundToken_Idempotent(t *testing.T) {
	setupPlaygroundTest(t)
	user := newTestUserCtrl(t, "pg2", 1000)

	_, body1 := callPlaygroundToken(t, user.Id)
	_, body2 := callPlaygroundToken(t, user.Id)

	key1 := body1["data"].(map[string]any)["key"].(string)
	key2 := body2["data"].(map[string]any)["key"].(string)
	require.Equal(t, key1, key2, "second call must return the same key, not regenerate it")

	var count int64
	require.NoError(t, model.DB.Model(&model.Token{}).Where("user_id = ?", user.Id).Count(&count).Error)
	require.Equal(t, int64(1), count, "must not create a duplicate row")
}

func TestGetPlaygroundToken_RejectsUnauthenticated(t *testing.T) {
	setupPlaygroundTest(t)
	w, body := callPlaygroundToken(t, 0) // no ctxkey.Id set → 0
	require.Equal(t, http.StatusUnauthorized, w.Code)
	require.Equal(t, false, body["success"])
}

func TestIsChatModel_AcceptsKnownChatModels(t *testing.T) {
	cases := []string{
		"gpt-4o",
		"gpt-4o-mini",
		"chatgpt-4o-latest",
		"o1-preview",
		"o3-mini",
		"o4-mini",
		"claude-3-5-sonnet-20241022",
		"claude-opus-4-5",
		"gemini-1.5-pro",
		"gemini-2.0-flash",
		"grok-2",
		"grok-2-vision-1212",
		"qwen2.5-72b-instruct",
		"deepseek-chat",
		"deepseek-reasoner",
		"moonshot-v1-32k",
		"kimi-latest",
		"doubao-pro-32k",
		"glm-4-plus",
		"yi-large",
		"ernie-4.0",
		"abab6.5",
		"hunyuan-large",
		"command-r-plus",
		"llama-3.3-70b",
		"mistral-large-2411",
		"mixtral-8x22b",
		"step-1-32k",
		"step-2-16k",
		"Baichuan2-Turbo-192k",
		"Spark-4.0-Ultra",
		"nova-pro-v1",
		// Vendor-prefixed slug forms (OpenRouter / TogetherAI).
		"anthropic/claude-3-opus",
		"meta-llama/Llama-3-70b-chat-hf",
		"amazon/nova-pro-v1",
		// Vision variants that should still surface as chat.
		"gpt-4-vision-preview",
		"llama-3.2-90b-vision-preview",
	}
	for _, name := range cases {
		require.True(t, isChatModel(name), "expected %q to be classified as a chat model", name)
	}
}

func TestIsImageModel_AcceptsKnownImageModels(t *testing.T) {
	cases := []string{
		"dall-e-2",
		"dall-e-3",
		"gpt-image-1",
		"gpt-image-2-text-to-image",
		"gpt-image-2-image-to-image",
		"wanx-v1",
		"cogview-3",
		"step-1x-medium",
		"qwen-image-edit",
		"black-forest-labs/flux-1.1-pro",
		"black-forest-labs/flux-schnell",
		"stability-ai/stable-diffusion-3.5-large",
		"stability-ai/sdxl",
		"midjourney-v6",
		"imagen-3",
		"recraft-v3",
		"ideogram-v2",
	}
	for _, name := range cases {
		require.True(t, isImageModel(name), "expected %q to be classified as an image model", name)
	}
}

func TestIsImageModel_RejectsNonImage(t *testing.T) {
	cases := []string{
		"gpt-4o",
		"claude-3-5-sonnet-20241022",
		"text-embedding-3-large",
		"sora-2",
		"veo-3-video",
		"kling-2.6/text-to-video",
		"wan-2.2-image-to-video", // routes to video, not image
	}
	for _, name := range cases {
		require.False(t, isImageModel(name), "expected %q to be rejected as an image model", name)
	}
}

func TestIsVideoModel_AcceptsKnownVideoModels(t *testing.T) {
	cases := []string{
		"sora-1.0",
		"sora-2",
		"kling-2.6/text-to-video",
		"kling-v1-pro",
		"veo-3-video",
		"veo-2",
		"seedance-1.0-pro",
		"vidu-2.0",
		"hailuo-02",
		"minimax-video-01",
		"runway-gen-3",
		"luma-dream-machine",
		"pika-1.5",
		"wan-2.2-image-to-video",
	}
	for _, name := range cases {
		require.True(t, isVideoModel(name), "expected %q to be classified as a video model", name)
	}
}

func TestIsVideoModel_RejectsNonVideo(t *testing.T) {
	cases := []string{
		"gpt-4o",
		"claude-3-5-sonnet-20241022",
		"dall-e-3",
		"gpt-image-2-text-to-image",
		"wanx-v1",
	}
	for _, name := range cases {
		require.False(t, isVideoModel(name), "expected %q to be rejected as a video model", name)
	}
}

func TestIsChatModel_RejectsNonChat(t *testing.T) {
	cases := []string{
		"text-embedding-3-large",
		"text-embedding-ada-002",
		"gemini-embedding-001",
		"whisper-1",
		"tts-1",
		"tts-1-hd",
		"dall-e-3",
		"gpt-image-1",
		"qwen-image-edit",
		"sora-1.0",
		"sora-2",
		"gpt-4o-realtime-preview",
		"gpt-4o-audio-preview",
		"veo-3-video",
		"random-model-xyz",
	}
	for _, name := range cases {
		require.False(t, isChatModel(name), "expected %q to be rejected", name)
	}
}
