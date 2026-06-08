package controller

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/songquanpeng/one-api/common/ctxkey"
	"github.com/songquanpeng/one-api/common/helper"
	"github.com/songquanpeng/one-api/common/random"
	"github.com/songquanpeng/one-api/model"
)

// playgroundTokenName is the reserved name for the auto-provisioned token that
// the in-app playground uses to call /v1/chat/completions. Leading underscores
// mark it as system-managed; the UI hides rows with this name from the user's
// token list so it can't be accidentally revoked or repurposed.
const playgroundTokenName = "__playground__"

// chatModelPrefixes is a v0 heuristic for which models surface in the chat
// playground. v1 (image playground) is the right moment to replace this with
// an adaptor-declared Modality() field — see PLAYGROUND_V0_CHAT_PLAN.md §6.
//
// Matching is against the lowercased model name OR, for OpenRouter / TogetherAI
// style "vendor/model" slugs, the lowercased segment after the final '/'.
var chatModelPrefixes = []string{
	"gpt-",
	"o1-",
	"o3",
	"o4",
	"chatgpt-",
	"claude-",
	"gemini-",
	"grok-",
	"qwen",
	"deepseek",
	"moonshot",
	"kimi",
	"doubao",
	"glm-",
	"yi-",
	"ernie",
	"abab",
	"hunyuan",
	"command",
	"llama",
	"mistral",
	"mixtral",
	"step-",
	"baichuan",
	"spark", // xunfei
	"nova-", // amazon nova
}

// chatModelExcludeSubstrings filters out non-chat models whose names would
// otherwise pass the prefix list (e.g. "claude-3-haiku" passes "claude-", but
// "gemini-embedding-001" would too). Keep this conservative — over-excluding
// here silently hides legitimate chat models from the playground.
var chatModelExcludeSubstrings = []string{
	"embedding",
	"embed",
	"whisper",
	"tts",
	"audio",
	"dall-e",
	"image",
	"realtime",
	"sora",
}

// chatModelExcludeSuffixes catches modality variants that share a chat-model
// prefix (e.g. "veo-3-video", "qwen-image-edit"). Suffix-matched so a chat
// model that happens to have "video" in the *middle* of its name still passes.
var chatModelExcludeSuffixes = []string{
	"-video",
	"-image",
	"-image-edit",
}

// imageModelPrefixes / imageModelSubstrings classify image-generation models
// from the user's group-allowed list. Substring matching is needed because
// many image models embed the marker mid-name (e.g. "stability-ai/sdxl",
// "qwen-image-edit", "black-forest-labs/flux-pro").
var imageModelPrefixes = []string{
	"dall-e",
	"gpt-image",
	"wanx",
	"cogview",
	"step-1x",
}

var imageModelSubstrings = []string{
	"flux",
	"stable-diffusion",
	"stable_diffusion",
	"sdxl",
	"midjourney",
	"imagen",
	"-image",   // qwen-image, gemini-image, etc.
	"image-",   // image-1, image-2
	"recraft",
	"ideogram",
}

// imageModelExcludeSubstrings strips non-image traffic that would otherwise
// match (e.g. "claude-3-haiku" doesn't, but "video" models that mention
// "image-to-video" or "qwen-image-edit-to-video" should not be classified as
// pure image generators).
var imageModelExcludeSubstrings = []string{
	"to-video",
	"-video",
	"video-",
}

// videoModelPrefixes / videoModelSubstrings classify video-generation models.
// Kept conservative — only model families we have a parameter spec for in
// the playground are listed. Adding a new family means updating both this
// list and the frontend modelSpecs.
var videoModelPrefixes = []string{
	"sora",
	"kling",
	"veo",
	"seedance",
	"vidu",
	"hailuo",
	"minimax-video",
	"runway",
	"luma",
	"pika",
	"wan-",
	"wan2",
}

var videoModelSubstrings = []string{
	"-video",
	"video-",
	"to-video",
	"text-to-video",
	"image-to-video",
}

func matchAny(name string, prefixes, substrings, excludes []string) bool {
	lower := strings.ToLower(name)
	if slash := strings.LastIndex(lower, "/"); slash >= 0 && slash < len(lower)-1 {
		lower = lower[slash+1:]
	}
	for _, ex := range excludes {
		if strings.Contains(lower, ex) {
			return false
		}
	}
	for _, p := range prefixes {
		if strings.HasPrefix(lower, p) {
			return true
		}
	}
	for _, s := range substrings {
		if strings.Contains(lower, s) {
			return true
		}
	}
	return false
}

func isImageModel(name string) bool {
	// Video classification wins over image when names like "image-to-video"
	// would otherwise match both buckets — the user is generating a video.
	if isVideoModel(name) {
		return false
	}
	return matchAny(name, imageModelPrefixes, imageModelSubstrings, imageModelExcludeSubstrings)
}

func isVideoModel(name string) bool {
	return matchAny(name, videoModelPrefixes, videoModelSubstrings, nil)
}

func isChatModel(name string) bool {
	lower := strings.ToLower(name)
	// Strip vendor prefix on slug-form names (openrouter, togetherai):
	// "anthropic/claude-3-opus" → "claude-3-opus".
	if slash := strings.LastIndex(lower, "/"); slash >= 0 && slash < len(lower)-1 {
		lower = lower[slash+1:]
	}
	for _, ex := range chatModelExcludeSubstrings {
		if strings.Contains(lower, ex) {
			return false
		}
	}
	for _, suf := range chatModelExcludeSuffixes {
		if strings.HasSuffix(lower, suf) {
			return false
		}
	}
	for _, p := range chatModelPrefixes {
		if strings.HasPrefix(lower, p) {
			return true
		}
	}
	return false
}

// GetPlaygroundToken returns (creating on demand) the user's reserved
// playground token. The returned key is the raw key; the frontend prepends
// "sk-" when building the Authorization header.
//
// The token is configured with UnlimitedQuota=true so it imposes no cap of
// its own — the relay still deducts against the owning user's quota, which
// is the actual spend control. The token's name is the reserved sentinel
// (playgroundTokenName); the wavy UI filters this name out of the user's
// token list to keep it system-managed.
//
// Concurrency note: two simultaneous first-time requests for the same user
// can both miss the SELECT and both INSERT, leaving an orphan duplicate row.
// The `tokens` table only has a uniqueIndex on Key, not on (user_id, name).
// The duplicate is functionally harmless — the client filters by name so it
// stays hidden, and both rows authenticate against the same user quota. v1
// should add a (user_id, name) composite unique index via migration; see
// PLAYGROUND_V0_CHAT_PLAN.md §11.
func GetPlaygroundToken(c *gin.Context) {
	userId := c.GetInt(ctxkey.Id)
	if userId == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "unauthenticated",
		})
		return
	}

	var existing model.Token
	err := model.DB.Where("user_id = ? AND name = ?", userId, playgroundTokenName).First(&existing).Error
	if err == nil {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "",
			"data":    gin.H{"key": existing.Key},
		})
		return
	}
	if err != gorm.ErrRecordNotFound {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	fresh := model.Token{
		UserId:         userId,
		Name:           playgroundTokenName,
		Key:            random.GenerateKey(),
		CreatedTime:    helper.GetTimestamp(),
		AccessedTime:   helper.GetTimestamp(),
		ExpiredTime:    -1,
		RemainQuota:    0,
		UnlimitedQuota: true,
		Status:         model.TokenStatusEnabled,
	}
	if err := fresh.Insert(); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    gin.H{"key": fresh.Key},
	})
}

// GetPlaygroundChatModels returns the chat-capable subset of the user's
// group-allowed models. Mirrors GetUserAvailableModels and then filters by
// isChatModel.
func GetPlaygroundChatModels(c *gin.Context) {
	getPlaygroundModelsByModality(c, isChatModel)
}

// GetPlaygroundImageModels returns the image-generation subset of the user's
// group-allowed models.
func GetPlaygroundImageModels(c *gin.Context) {
	getPlaygroundModelsByModality(c, isImageModel)
}

// GetPlaygroundVideoModels returns the video-generation subset of the user's
// group-allowed models.
func GetPlaygroundVideoModels(c *gin.Context) {
	getPlaygroundModelsByModality(c, isVideoModel)
}

func getPlaygroundModelsByModality(c *gin.Context, match func(string) bool) {
	ctx := c.Request.Context()
	userId := c.GetInt(ctxkey.Id)
	userGroup, err := model.CacheGetUserGroup(userId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	allModels, err := model.CacheGetGroupModels(ctx, userGroup)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	filtered := make([]string, 0, len(allModels))
	for _, m := range allModels {
		if match(m) {
			filtered = append(filtered, m)
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    filtered,
	})
}
