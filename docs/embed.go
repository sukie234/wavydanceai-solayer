// Package docs embeds the platform API OpenAPI spec so it can be served by the
// backend (see router/swagger.go).
package docs

import _ "embed"

//go:embed openapi.yaml
var OpenAPISpec []byte
