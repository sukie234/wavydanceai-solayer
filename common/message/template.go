package message

import (
	"fmt"
	"html"
	"strings"

	"github.com/songquanpeng/one-api/common/config"
)

// logoURL returns the image used in the email header: the admin-configured
// Logo option when set (white-label deployments), otherwise the app icon
// served by this deployment. Empty when neither is available (no ServerAddress
// configured yet) — the template then renders without an image.
func logoURL() string {
	if config.Logo != "" {
		return config.Logo
	}
	if config.ServerAddress != "" {
		return strings.TrimSuffix(config.ServerAddress, "/") + "/icon-light-192.png"
	}
	return ""
}

// EmailTemplate wraps content in the branded transactional-email shell.
// Colors mirror web/wavy's light-theme tokens (globals.css): ink #07394a,
// muted #3f7a8c, cyan #2e8fb0, page #f3fafc, border #c9e6ee.
func EmailTemplate(title, content string) string {
	systemName := html.EscapeString(config.SystemName)
	logo := ""
	if u := logoURL(); u != "" {
		logo = fmt.Sprintf(`<img src="%s" alt="%s" width="48" height="48" style="display: block; margin: 0 auto 12px auto; border-radius: 10px;" />`, html.EscapeString(u), systemName)
	}
	return fmt.Sprintf(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; font-family: Arial, Helvetica, sans-serif; line-height: 1.6; background-color: #f3fafc;">
    <div style="max-width: 600px; margin: 20px auto; padding: 32px; background-color: #ffffff; border: 1px solid #c9e6ee; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 28px;">
            %s
            <h2 style="color: #07394a; margin: 0; font-size: 22px;">%s</h2>
        </div>
        <div style="color: #07394a; font-size: 16px;">
            %s
        </div>
        <div style="margin-top: 36px; padding-top: 18px; border-top: 1px solid #c9e6ee; color: #3f7a8c; font-size: 13px; text-align: center;">
            <p style="margin: 4px 0;">This is an automated message — please do not reply.</p>
            <p style="margin: 4px 0;">%s</p>
        </div>
    </div>
</body>
</html>
`, logo, html.EscapeString(title), content, systemName)
}
