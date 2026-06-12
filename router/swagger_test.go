package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func swaggerStatus(t *testing.T, path string) int {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	SetSwaggerRouter(r)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
	return w.Code
}

func TestSwaggerDisabledByDefault(t *testing.T) {
	t.Setenv("SWAGGER_ENABLED", "")
	if code := swaggerStatus(t, "/swagger/"); code != http.StatusNotFound {
		t.Fatalf("expected 404 with SWAGGER_ENABLED unset, got %d", code)
	}
	if code := swaggerStatus(t, "/swagger/openapi.yaml"); code != http.StatusNotFound {
		t.Fatalf("expected 404 for spec with SWAGGER_ENABLED unset, got %d", code)
	}
}

func TestSwaggerDisabledExplicitly(t *testing.T) {
	t.Setenv("SWAGGER_ENABLED", "false")
	if code := swaggerStatus(t, "/swagger/"); code != http.StatusNotFound {
		t.Fatalf("expected 404 with SWAGGER_ENABLED=false, got %d", code)
	}
}

func TestSwaggerEnabled(t *testing.T) {
	t.Setenv("SWAGGER_ENABLED", "true")
	if code := swaggerStatus(t, "/swagger/"); code != http.StatusOK {
		t.Fatalf("expected 200 with SWAGGER_ENABLED=true, got %d", code)
	}
	if code := swaggerStatus(t, "/swagger/openapi.yaml"); code != http.StatusOK {
		t.Fatalf("expected 200 for spec with SWAGGER_ENABLED=true, got %d", code)
	}
}
