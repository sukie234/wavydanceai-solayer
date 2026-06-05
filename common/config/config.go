package config

import (
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/songquanpeng/one-api/common/env"

	"github.com/google/uuid"
)

var SystemName = "One API"
var ServerAddress = "http://localhost:3000"
var Footer = ""
var Logo = ""
var TopUpLink = ""
var ChatLink = ""
var QuotaPerUnit = 500 * 1000.0 // $0.002 / 1K tokens
var DisplayInCurrencyEnabled = true
var DisplayTokenStatEnabled = true

// Any options with "Secret", "Token" in its key won't be return by GetOptions

var SessionSecret = uuid.New().String()

var OptionMap map[string]string
var OptionMapRWMutex sync.RWMutex

var ItemsPerPage = 10
var MaxRecentItems = 100

var PasswordLoginEnabled = true
var PasswordRegisterEnabled = true
var EmailVerificationEnabled = false
var GitHubOAuthEnabled = false
var OidcEnabled = false
var WeChatAuthEnabled = false
var TurnstileCheckEnabled = false
var RegisterEnabled = true

var EmailDomainRestrictionEnabled = false
var EmailDomainWhitelist = []string{
	"gmail.com",
	"163.com",
	"126.com",
	"qq.com",
	"outlook.com",
	"hotmail.com",
	"icloud.com",
	"yahoo.com",
	"foxmail.com",
}

var DebugEnabled = strings.ToLower(os.Getenv("DEBUG")) == "true"
var DebugSQLEnabled = strings.ToLower(os.Getenv("DEBUG_SQL")) == "true"
var MemoryCacheEnabled = strings.ToLower(os.Getenv("MEMORY_CACHE_ENABLED")) == "true"

var LogConsumeEnabled = true

var SMTPServer = ""
var SMTPPort = 587
var SMTPAccount = ""
var SMTPFrom = ""
var SMTPToken = ""

var GitHubClientId = ""
var GitHubClientSecret = ""

var LarkClientId = ""
var LarkClientSecret = ""

var OidcClientId = ""
var OidcClientSecret = ""
var OidcWellKnown = ""
var OidcAuthorizationEndpoint = ""
var OidcTokenEndpoint = ""
var OidcUserinfoEndpoint = ""

var WeChatServerAddress = ""
var WeChatServerToken = ""
var WeChatAccountQRCodeImageURL = ""

var MessagePusherAddress = ""
var MessagePusherToken = ""

var TurnstileSiteKey = ""
var TurnstileSecretKey = ""

var QuotaForNewUser int64 = 0
var QuotaForInviter int64 = 0
var QuotaForInvitee int64 = 0
var ChannelDisableThreshold = 5.0
var AutomaticDisableChannelEnabled = false
var AutomaticEnableChannelEnabled = false
var QuotaRemindThreshold int64 = 1000
var PreConsumedQuota int64 = 500
var ApproximateTokenEnabled = false
var RetryTimes = 0

var RootUserEmail = ""

var IsMasterNode = os.Getenv("NODE_TYPE") != "slave"

var requestInterval, _ = strconv.Atoi(os.Getenv("POLLING_INTERVAL"))
var RequestInterval = time.Duration(requestInterval) * time.Second

var SyncFrequency = env.Int("SYNC_FREQUENCY", 10*60) // unit is second

var BatchUpdateEnabled = false
var BatchUpdateInterval = env.Int("BATCH_UPDATE_INTERVAL", 5)

var RelayTimeout = env.Int("RELAY_TIMEOUT", 0) // unit is second

var GeminiSafetySetting = env.String("GEMINI_SAFETY_SETTING", "BLOCK_NONE")

var Theme = env.String("THEME", "wavy")
var ValidThemes = map[string]bool{
	"wavy": true,
}

// All duration's unit is seconds
// Shouldn't larger then RateLimitKeyExpirationDuration
var (
	GlobalApiRateLimitNum            = env.Int("GLOBAL_API_RATE_LIMIT", 480)
	GlobalApiRateLimitDuration int64 = 3 * 60

	GlobalWebRateLimitNum            = env.Int("GLOBAL_WEB_RATE_LIMIT", 240)
	GlobalWebRateLimitDuration int64 = 3 * 60

	UploadRateLimitNum            = 10
	UploadRateLimitDuration int64 = 60

	DownloadRateLimitNum            = 10
	DownloadRateLimitDuration int64 = 60

	CriticalRateLimitNum            = 20
	CriticalRateLimitDuration int64 = 20 * 60
)

var RateLimitKeyExpirationDuration = 20 * time.Minute

var EnableMetric = env.Bool("ENABLE_METRIC", false)
var MetricQueueSize = env.Int("METRIC_QUEUE_SIZE", 10)
var MetricSuccessRateThreshold = env.Float64("METRIC_SUCCESS_RATE_THRESHOLD", 0.8)
var MetricSuccessChanSize = env.Int("METRIC_SUCCESS_CHAN_SIZE", 1024)
var MetricFailChanSize = env.Int("METRIC_FAIL_CHAN_SIZE", 128)

var InitialRootToken = os.Getenv("INITIAL_ROOT_TOKEN")

var InitialRootAccessToken = os.Getenv("INITIAL_ROOT_ACCESS_TOKEN")

// InitialRootPassword overrides the seeded root account password on the very
// first run (when the users table is empty). Always set this in any deployment
// reachable from outside localhost — the fallback "123456" is publicly known.
var InitialRootPassword = os.Getenv("INITIAL_ROOT_PASSWORD")

var GeminiVersion = env.String("GEMINI_VERSION", "v1")

var OnlyOneLogFile = env.Bool("ONLY_ONE_LOG_FILE", false)

var RelayProxy = env.String("RELAY_PROXY", "")
var UserContentRequestProxy = env.String("USER_CONTENT_REQUEST_PROXY", "")
var UserContentRequestTimeout = env.Int("USER_CONTENT_REQUEST_TIMEOUT", 30)

var EnforceIncludeUsage = env.Bool("ENFORCE_INCLUDE_USAGE", false)
var TestPrompt = env.String("TEST_PROMPT", "Output only your specific model name with no additional text.")

// ---------- Payments (P0 商业化充值) ----------
//
// Global toggles + URLs for the topup subsystem. Per-gateway secrets
// (Stripe API key, EPay key, NOWPayments IPN secret) live in env vars
// or per-adapter ConfigKey declarations, not here.

// PaymentEnabled is the master switch. When false, all topup endpoints
// return "payments disabled" regardless of per-gateway flags.
var PaymentEnabled = false

// StripeEnabled / EpayEnabled control the two baseline non-crypto gateways.
var StripeEnabled = false
var EpayEnabled = false

// PaymentCallbackBaseURL is the public HTTPS origin our webhooks live on.
// Adapters compose notify URLs from this + their endpoint path. Required
// in any deployment that accepts real payments.
var PaymentCallbackBaseURL = ""

// PaymentReturnURL is where the user is redirected after completing payment.
// Typically a frontend route like https://app.example.com/topup/result.
var PaymentReturnURL = ""

// CryptoAdaptersEnabled is the whitelist of crypto adapter Name()s currently
// active in this deployment. Empty slice = no crypto. Stored in option table
// as a comma-separated string (matches EmailDomainWhitelist convention).
var CryptoAdaptersEnabled = []string{}

// Stripe — sensitive keys live in env vars only, never in the option table
// (so they can't leak through /api/option/). StripeCurrency is configurable
// because the same code can serve USD / EUR / HKD / CNY deployments.
var StripeAPISecretKey = env.String("STRIPE_API_SECRET_KEY", "")
var StripeWebhookSecret = env.String("STRIPE_WEBHOOK_SECRET", "")
var StripeCurrency = env.String("STRIPE_CURRENCY", "usd")

// E-Pay (彩虹易支付协议) — wraps Alipay / WeChat / QQ. Keys in env only,
// same reasoning as Stripe. EpayUrl is the merchant's submit.php endpoint;
// EpayDefaultMethod is the type code sent if the request doesn't pick one.
var EpayId = env.String("EPAY_ID", "")
var EpayKey = env.String("EPAY_KEY", "")
var EpayUrl = env.String("EPAY_URL", "")
var EpayDefaultMethod = env.String("EPAY_DEFAULT_METHOD", "alipay")
