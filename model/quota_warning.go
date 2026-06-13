package model

import (
	"bytes"
	"fmt"
	"html/template"
	"strings"
	"sync"
	"time"

	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/common/message"
	"github.com/songquanpeng/one-api/setting/notify_setting"
)

// quotaWarningBodyTmpl renders the warning body with html/template so every
// interpolated value — including the admin-supplied ServerAddress in the
// link — gets context-aware escaping (text node vs. attribute vs. URL) and
// cannot break out of the markup. fmt.Sprintf + manual escaping is not
// enough here; see the same reasoning on the template this replaced.
var quotaWarningBodyTmpl = template.Must(template.New("quotaWarningBody").Parse(`
				<p>Hi,</p>
				{{if .Exhausted}}<p>Your {{.SystemName}} balance has run out. Requests will fail until you top up.</p>
				{{else}}<p>Your {{.SystemName}} balance is running low — you have <strong>{{.Remaining}}</strong> remaining.</p>
				{{end}}<p style="text-align: center; margin: 30px 0;">
					<a href="{{.Link}}" style="background-color: #2e8fb0; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">Top up now</a>
				</p>
				<p style="color: #3f7a8c;">If the button doesn't work, copy and paste this link into your browser:</p>
				<p style="background-color: #e7f5f8; border: 1px solid #c9e6ee; padding: 10px; border-radius: 8px; word-break: break-all; font-size: 14px;">{{.Link}}</p>
			`))

// quotaWarningLastSent is a per-user cooldown so concurrent requests that
// cross the threshold together — or a balance that sits at zero across many
// requests — produce at most one email per cooldown window.
//
// The map is in-memory only: on a multi-node deployment each node keeps its
// own copy, so a user could receive up to one email per node per window.
// Acceptable for the current single-instance deployment; revisit (e.g. Redis
// SETNX with TTL) if we ever scale out.
var (
	quotaWarningMutex    sync.Mutex
	quotaWarningLastSent = make(map[int]time.Time)
)

// quotaWarningCooldownAllows reports whether userId is outside its cooldown
// window at now, and if so records now as the last send time. Expired
// entries are pruned on the way so the map stays bounded by the number of
// users warned within one window.
func quotaWarningCooldownAllows(userId int, now time.Time, cooldown time.Duration) bool {
	quotaWarningMutex.Lock()
	defer quotaWarningMutex.Unlock()
	if last, ok := quotaWarningLastSent[userId]; ok && now.Sub(last) < cooldown {
		return false
	}
	for id, last := range quotaWarningLastSent {
		if now.Sub(last) >= cooldown {
			delete(quotaWarningLastSent, id)
		}
	}
	quotaWarningLastSent[userId] = now
	return true
}

// shouldSendQuotaWarning is the full reminder decision: feature enabled,
// the user's balance crossed the threshold going down (or is exhausted),
// and the user is outside the cooldown window. A true result records the
// send time, so it must be followed by an actual send attempt. The window
// is consumed even if delivery then fails (SMTP error, user has no email
// on file) — deliberate, so a broken mail setup can't turn every request
// from an exhausted user into a send attempt.
func shouldSendQuotaWarning(userId int, preQuota int64, postQuota int64, now time.Time) bool {
	s := notify_setting.GetQuotaWarningSetting()
	if !s.Enabled {
		return false
	}
	crossedThreshold := preQuota >= s.ThresholdQuota && postQuota < s.ThresholdQuota
	exhausted := postQuota <= 0
	if !crossedThreshold && !exhausted {
		return false
	}
	return quotaWarningCooldownAllows(userId, now, time.Duration(s.CooldownHours)*time.Hour)
}

// maybeSendQuotaWarning is the shared entry point for both deduction paths
// (atomic and legacy/batch). Fire-and-forget: the decision is cheap and
// synchronous, the email goes out on its own goroutine, and nothing here
// can block or fail the quota deduction.
func maybeSendQuotaWarning(userId int, preQuota int64, postQuota int64) {
	if !shouldSendQuotaWarning(userId, preQuota, postQuota, time.Now()) {
		return
	}
	go sendQuotaWarningEmail(userId, postQuota)
}

// quotaDollars renders an internal quota amount as the user-facing dollar
// string, clamped at $0.00 (a post-deduction balance can go negative).
func quotaDollars(quota int64) string {
	if quota < 0 {
		quota = 0
	}
	return fmt.Sprintf("$%.2f", float64(quota)/config.QuotaPerUnit)
}

// buildQuotaWarningEmail renders the subject and branded HTML body for a
// low-balance warning (exhausted when remaining <= 0). Split from the send
// path so content is unit-testable without SMTP.
func buildQuotaWarningEmail(remaining int64) (subject string, content string) {
	subject = fmt.Sprintf("Your %s balance is running low", config.SystemName)
	title := "Low balance warning"
	if remaining <= 0 {
		subject = fmt.Sprintf("Your %s balance has run out", config.SystemName)
		title = "Balance exhausted"
	}
	var buf bytes.Buffer
	if err := quotaWarningBodyTmpl.Execute(&buf, struct {
		SystemName string
		Remaining  string
		Link       string
		Exhausted  bool
	}{
		SystemName: config.SystemName,
		Remaining:  quotaDollars(remaining),
		Link:       strings.TrimSuffix(config.ServerAddress, "/") + "/console/topup",
		Exhausted:  remaining <= 0,
	}); err != nil {
		logger.SysError("failed to render quota warning email: " + err.Error())
		return subject, ""
	}
	content = message.EmailTemplate(title, buf.String())
	return subject, content
}

func sendQuotaWarningEmail(userId int, remaining int64) {
	email, err := GetUserEmail(userId)
	if err != nil {
		logger.SysError("failed to fetch user email: " + err.Error())
	}
	if email == "" {
		return
	}
	subject, content := buildQuotaWarningEmail(remaining)
	if content == "" {
		return
	}
	if err := message.SendEmail(subject, email, content); err != nil {
		logger.SysError("failed to send quota warning email: " + err.Error())
	}
}
