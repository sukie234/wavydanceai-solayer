// Package auth_setting holds settings for authentication providers
// (OAuth IdPs, 2FA, password policy, etc.). Each file registers exactly
// one settings struct via setting/config; admins edit them through
// /api/option/ with keys formatted as "<module>.<json_tag>".
package auth_setting

import (
	"github.com/songquanpeng/one-api/setting/config"
)

// GoogleSetting controls the Google OAuth sign-in handler. Endpoints are
// hardcoded in controller/auth/google.go — only enable + credentials are
// runtime-configurable.
type GoogleSetting struct {
	Enabled      bool   `json:"enabled"`
	ClientId     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
}

// googleSetting is the process singleton. The pointer is registered with
// the global config manager so admin updates propagate without callers
// needing to re-fetch.
var googleSetting = GoogleSetting{
	Enabled:      false,
	ClientId:     "",
	ClientSecret: "",
}

func init() {
	config.GlobalConfig.Register("google_setting", &googleSetting)
}

// GetGoogleSetting returns the live pointer — never copy the struct or
// you'll miss subsequent admin updates.
func GetGoogleSetting() *GoogleSetting {
	return &googleSetting
}
