// Package passkey holds runtime configuration for WebAuthn / Passkey login.
// Admins edit these via /api/option/ with keys "passkey_setting.<json_tag>".
package passkey

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/songquanpeng/one-api/setting/config"
)

// PasskeySetting controls the Passkey login feature. When Enabled is false
// all /passkey/* and /login/passkey/* endpoints reject with HTTP 403, so the
// table can ship dark and be toggled on per environment.
type PasskeySetting struct {
	Enabled   bool   `json:"enabled"`
	RPID      string `json:"rp_id"`
	RPName    string `json:"rp_name"`
	RPOrigins string `json:"rp_origins"` // JSON array of origins, e.g. ["https://wavydance.ai"]
}

var passkeySetting = PasskeySetting{
	Enabled:   false,
	RPID:      "",
	RPName:    "",
	RPOrigins: "",
}

func init() {
	config.GlobalConfig.Register("passkey_setting", &passkeySetting)
}

// GetPasskeySetting returns the live pointer; never copy.
func GetPasskeySetting() *PasskeySetting {
	return &passkeySetting
}

// Validate enforces invariants documented in the spec §5 startup guard.
// Returns an error rather than panicking so the caller decides when to
// abort — keeps the package testable without panic recovery.
func (s *PasskeySetting) Validate() error {
	if !s.Enabled {
		return nil
	}
	if s.RPID == "" {
		return errors.New("passkey: enabled but rp_id is empty")
	}
	if s.RPOrigins == "" {
		return errors.New("passkey: enabled but rp_origins is empty")
	}
	var origins []string
	if err := json.Unmarshal([]byte(s.RPOrigins), &origins); err != nil {
		return fmt.Errorf("passkey: rp_origins is not valid JSON: %w", err)
	}
	if len(origins) == 0 {
		return errors.New("passkey: rp_origins parses to an empty array")
	}
	return nil
}
