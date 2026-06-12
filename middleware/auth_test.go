package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/model"
)

func TestShouldCheckModel(t *testing.T) {
	cases := []struct {
		method string
		path   string
		want   bool
	}{
		{http.MethodPost, "/v1/chat/completions", true},
		{http.MethodPost, "/v1/completions", true},
		{http.MethodPost, "/v1/images/generations", true},
		{http.MethodPost, "/v1/audio/speech", true},
		{http.MethodPost, "/v1/videos", true},
		{http.MethodGet, "/v1/videos/task-123", false}, // task poll carries no model
		{http.MethodPost, "/v1/models", false},
		{http.MethodPost, "/v1/embeddings", false},
		{http.MethodGet, "/api/user/self", false},
	}
	for _, c := range cases {
		ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
		ctx.Request = httptest.NewRequest(c.method, c.path, nil)
		if got := shouldCheckModel(ctx); got != c.want {
			t.Errorf("shouldCheckModel(%s %s) = %v, want %v", c.method, c.path, got, c.want)
		}
	}
}

// newAuthEngine builds a gin engine with cookie sessions and an in-memory DB
// so the access-token / token-validation branches have something to query.
func newAuthEngine(t *testing.T) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:?_busy_timeout=5000"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}))
	model.DB = db
	// No Redis in unit tests — force the direct-DB path in the token cache
	// (RedisEnabled defaults to true until InitRedisClient runs).
	common.RedisEnabled = false

	e := gin.New()
	e.Use(sessions.Sessions("wavy", cookie.NewStore([]byte("test-secret"))))
	return e
}

// seedSession sets the session fields authHelper reads, emulating a logged-in
// user with the given role/status. Within one request, Get reflects Set.
func seedSession(role, status, id int) gin.HandlerFunc {
	return func(c *gin.Context) {
		s := sessions.Default(c)
		s.Set("username", "u")
		s.Set("role", role)
		s.Set("status", status)
		s.Set("id", id)
		c.Next()
	}
}

func reached(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"success": true, "reached": true}) }

func wasReached(t *testing.T, w *httptest.ResponseRecorder) bool {
	t.Helper()
	var out map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &out))
	r, _ := out["reached"].(bool)
	return r
}

func TestAuthHelperSessionGating(t *testing.T) {
	t.Run("common user passes UserAuth", func(t *testing.T) {
		e := newAuthEngine(t)
		e.GET("/u", seedSession(model.RoleCommonUser, model.UserStatusEnabled, 1), UserAuth(), reached)
		w := httptest.NewRecorder()
		e.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/u", nil))
		require.True(t, wasReached(t, w))
	})

	t.Run("common user blocked by AdminAuth", func(t *testing.T) {
		e := newAuthEngine(t)
		e.GET("/a", seedSession(model.RoleCommonUser, model.UserStatusEnabled, 1), AdminAuth(), reached)
		w := httptest.NewRecorder()
		e.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/a", nil))
		require.False(t, wasReached(t, w))
	})

	t.Run("admin passes AdminAuth", func(t *testing.T) {
		e := newAuthEngine(t)
		e.GET("/a", seedSession(model.RoleAdminUser, model.UserStatusEnabled, 1), AdminAuth(), reached)
		w := httptest.NewRecorder()
		e.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/a", nil))
		require.True(t, wasReached(t, w))
	})

	t.Run("admin blocked by RootAuth", func(t *testing.T) {
		e := newAuthEngine(t)
		e.GET("/r", seedSession(model.RoleAdminUser, model.UserStatusEnabled, 1), RootAuth(), reached)
		w := httptest.NewRecorder()
		e.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/r", nil))
		require.False(t, wasReached(t, w))
	})

	t.Run("disabled user is rejected", func(t *testing.T) {
		e := newAuthEngine(t)
		e.GET("/u", seedSession(model.RoleCommonUser, model.UserStatusDisabled, 1), UserAuth(), reached)
		w := httptest.NewRecorder()
		e.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/u", nil))
		require.False(t, wasReached(t, w))
	})
}

func TestAuthHelperNoCredentials(t *testing.T) {
	t.Run("no session and no access token", func(t *testing.T) {
		e := newAuthEngine(t)
		e.GET("/u", UserAuth(), reached)
		w := httptest.NewRecorder()
		e.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/u", nil))
		require.Equal(t, http.StatusUnauthorized, w.Code)
		require.False(t, wasReached(t, w))
	})

	t.Run("invalid access token", func(t *testing.T) {
		e := newAuthEngine(t)
		e.GET("/u", UserAuth(), reached)
		req := httptest.NewRequest(http.MethodGet, "/u", nil)
		req.Header.Set("Authorization", "Bearer no-such-token")
		w := httptest.NewRecorder()
		e.ServeHTTP(w, req)
		require.False(t, wasReached(t, w))
	})
}

func TestTokenAuthRejects(t *testing.T) {
	t.Run("missing token", func(t *testing.T) {
		e := newAuthEngine(t)
		e.GET("/relay", TokenAuth(), reached)
		w := httptest.NewRecorder()
		e.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/relay", nil))
		require.Equal(t, http.StatusUnauthorized, w.Code)
		require.False(t, wasReached(t, w))
	})

	t.Run("unknown token", func(t *testing.T) {
		e := newAuthEngine(t)
		e.GET("/relay", TokenAuth(), reached)
		req := httptest.NewRequest(http.MethodGet, "/relay", nil)
		req.Header.Set("Authorization", "Bearer sk-unknown")
		w := httptest.NewRecorder()
		e.ServeHTTP(w, req)
		require.False(t, wasReached(t, w))
	})
}
