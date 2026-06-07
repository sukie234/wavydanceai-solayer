-- Historical quota audit
--
-- Detects forensic traces of the three concurrency bugs fixed in:
--   #32  topup + redemption row-lock (gorm v1 -> v2 silent breakage)
--   #__  PreConsumeTokenQuota TOCTOU (this PR)
--
-- Run against the *production* database (read-only):
--   psql "$PROD_DSN" -f docs/AUDIT_HISTORICAL_QUOTA.sql > audit-$(date +%F).txt
--
-- Each section prints zero rows on a clean deployment. Any row is a candidate
-- incident — read the §Interpretation block in docs/AUDIT_HISTORICAL_QUOTA.md
-- before acting.
--
-- Schema reference (constants from model/log.go):
--   logs.type = 1  → topup credit log
--   logs.type = 2  → consume (chat usage) log
--   topups.status = 'success' → credited
--   redemptions.status = 3    → used

\echo '========================================================================'
\echo ' 1. DUPLICATE TOPUP CREDIT LOGS (same trade flow recorded as success'
\echo '    more than once). Pre-#32 webhook race signature.'
\echo '========================================================================'
SELECT
    t.user_id,
    t.trade_no,
    t.gateway,
    t.money,
    t.quota                                    AS expected_credit,
    COUNT(l.id)                                AS topup_log_rows,
    SUM(l.quota)                               AS logged_credit
FROM topups t
LEFT JOIN logs l
    ON l.user_id = t.user_id
   AND l.type    = 1
   AND l.created_at BETWEEN t.completed_at - 5 AND t.completed_at + 5
   -- The legacy log content embeds the human-readable amount, not the trade
   -- number, so this match is best-effort. Tighten the time window if your
   -- traffic produces ambiguous matches.
   AND l.content LIKE '通过 ' || t.gateway || ' 充值%'
WHERE t.status = 'success'
GROUP BY t.id
HAVING COUNT(l.id) > 1
ORDER BY t.completed_at DESC;

\echo ''
\echo '========================================================================'
\echo ' 2. USERS WHOSE CREDITED QUOTA EXCEEDS THEIR SUCCESSFUL TOPUP TOTAL'
\echo '    (after accounting for redemptions and current usage). Strongest'
\echo '    arithmetic signal of historical double-credit.'
\echo '========================================================================'
WITH topup_sum AS (
    SELECT user_id, COALESCE(SUM(quota), 0) AS credited
    FROM topups WHERE status = 'success'
    GROUP BY user_id
),
redemption_sum AS (
    SELECT user_id, COALESCE(SUM(quota), 0) AS redeemed
    FROM redemptions WHERE status = 3
    GROUP BY user_id
)
SELECT
    u.id, u.username,
    u.quota                                     AS current_balance,
    u.used_quota                                AS consumed,
    COALESCE(ts.credited, 0)                    AS topups_credited,
    COALESCE(rs.redeemed, 0)                    AS redemptions_credited,
    u.quota + u.used_quota
       - COALESCE(ts.credited, 0)
       - COALESCE(rs.redeemed, 0)               AS unexplained_quota
FROM users u
LEFT JOIN topup_sum      ts ON ts.user_id = u.id
LEFT JOIN redemption_sum rs ON rs.user_id = u.id
WHERE u.quota + u.used_quota
    - COALESCE(ts.credited, 0)
    - COALESCE(rs.redeemed, 0) > 0
ORDER BY unexplained_quota DESC
LIMIT 100;
-- Note: any seed/promo quota assigned at user creation (model/user.go's
-- DefaultQuota path) shows up as `unexplained` here. Cross-check against
-- your seeding config before treating a row as an incident.

\echo ''
\echo '========================================================================'
\echo ' 3. DUPLICATE REDEMPTION CREDIT LOGS PER USER. Each `used` redemption'
\echo '    code must produce exactly one "通过兑换码充值" log entry.'
\echo '========================================================================'
SELECT
    r.user_id,
    r.id            AS redemption_id,
    r.key,
    r.quota         AS expected_credit,
    COUNT(l.id)     AS credit_log_rows
FROM redemptions r
LEFT JOIN logs l
    ON l.user_id = r.user_id
   AND l.type    = 1
   AND l.content LIKE '通过兑换码充值%'
   AND l.created_at BETWEEN r.redeemed_time - 5 AND r.redeemed_time + 5
WHERE r.status = 3
GROUP BY r.id
HAVING COUNT(l.id) > 1
ORDER BY r.redeemed_time DESC;

\echo ''
\echo '========================================================================'
\echo ' 4. NEGATIVE USER BALANCES. PreConsumeTokenQuota race signature —'
\echo '    a non-zero count here is direct evidence of the pre-#__ bug.'
\echo '========================================================================'
SELECT id, username, quota, used_quota, request_count
FROM users
WHERE quota < 0
ORDER BY quota ASC
LIMIT 100;

\echo ''
\echo '========================================================================'
\echo ' 5. NEGATIVE TOKEN REMAIN_QUOTA. Same race signature scoped to tokens.'
\echo '========================================================================'
SELECT id, user_id, name, remain_quota, used_quota
FROM tokens
WHERE unlimited_quota = false AND remain_quota < 0
ORDER BY remain_quota ASC
LIMIT 100;

\echo ''
\echo '========================================================================'
\echo ' 6. RAPID-FIRE CONSUME LOGS (same token, >=10 calls in <1 second).'
\echo '    Behavioural fingerprint of a scripted concurrent attack, even if'
\echo '    the user balance now looks clean.'
\echo '========================================================================'
-- Logs reference tokens by name only (logs.token_name). Same name across
-- different tokens of different users is possible but rare; bursts that
-- look ambiguous should be cross-checked against tokens.name + user_id.
WITH bursts AS (
    SELECT
        user_id,
        token_name,
        date_trunc('second', to_timestamp(created_at)) AS sec_bucket,
        COUNT(*)                                       AS calls_in_second
    FROM logs
    WHERE type = 2 AND token_name <> ''
    GROUP BY user_id, token_name, sec_bucket
    HAVING COUNT(*) >= 10
)
SELECT
    b.user_id, b.token_name, b.sec_bucket, b.calls_in_second
FROM bursts b
ORDER BY b.calls_in_second DESC, b.sec_bucket DESC
LIMIT 50;

\echo ''
\echo 'Audit complete. Empty output across §1, §3, §4, §5 = no detected impact.'
\echo 'Always cross-check §2 against your default-quota seeding before action.'
