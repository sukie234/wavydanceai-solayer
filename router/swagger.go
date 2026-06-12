package router

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common/env"
	"github.com/songquanpeng/one-api/docs"
)

// swaggerUIVersion pins the swagger-ui-dist assets served from the CDN.
const swaggerUIVersion = "5.17.14"

const swaggerIndexHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>WavyDance Platform API</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@` + swaggerUIVersion + `/swagger-ui.css"
    integrity="sha384-wxLW6kwyHktdDGr6Pv1zgm/VGJh99lfUbzSn6HNHBENZlCN7W602k9VkGdxuFvPn" crossorigin="anonymous">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@` + swaggerUIVersion + `/swagger-ui-bundle.js"
    integrity="sha384-wmyclcVGX/WhUkdkATwhaK1X1JtiNrr2EoYJ+diV3vj4v6OC5yCeSu+yW13SYJep" crossorigin="anonymous"></script>
  <script>
    window.onload = function () {
      window.ui = SwaggerUIBundle({
        url: "openapi.yaml",
        dom_id: "#swagger-ui",
        deepLinking: true,
        withCredentials: true,
      });
    };
  </script>
</body>
</html>`

// SetSwaggerRouter serves the platform API docs (Swagger UI + spec) at /swagger.
// Same-origin, so the session cookie flows for "Try it out"; the Authorize
// dialog accepts a personal access token for programmatic callers.
// Off unless SWAGGER_ENABLED=true: white-label production deployments must
// not expose the platform's API surface.
func SetSwaggerRouter(router *gin.Engine) {
	if !env.Bool("SWAGGER_ENABLED", false) {
		return
	}
	router.GET("/swagger", func(c *gin.Context) {
		c.Redirect(http.StatusMovedPermanently, "/swagger/")
	})
	router.GET("/swagger/", func(c *gin.Context) {
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(swaggerIndexHTML))
	})
	router.GET("/swagger/openapi.yaml", func(c *gin.Context) {
		c.Data(http.StatusOK, "application/yaml; charset=utf-8", docs.OpenAPISpec)
	})
}
