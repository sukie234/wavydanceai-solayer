# Historical Quota Audit

Read-only forensic scan that detects traces of the three concurrency bugs
fixed in PR #32 (topup + redemption row-lock) and the PR introducing this
file (PreConsumeTokenQuota TOCTOU).

Run it against a production / staging database snapshot to answer two
operational questions:

1. **Have we already been hit?** Each query is designed to produce zero rows
   on a clean deployment; any row is a candidate incident worth manual review.
2. **Which users / tokens / orders need reconciliation?** Section 2 gives
   per-user delta vs. credited quota; sections 1, 3 list specific orders /
   codes; sections 4, 5 list balances that have already gone negative.

## Running it

```bash
# Read-only — no rows are mutated. Safe against live prod.
psql "$PROD_DSN" -f docs/AUDIT_HISTORICAL_QUOTA.sql > audit-$(date +%F).txt
```

Postgres-only. (The fork supports MySQL too; rewrite `to_timestamp` and the
`||` string concatenation if you need a MySQL variant — none of the queries
use Postgres-specific JSON or `WITH RECURSIVE`.)

Recommended cadence:

| When | Why |
|---|---|
| After deploying the fixes in PR #32 and this PR | Establish a baseline — any historical victims are already in the snapshot |
| Weekly for the first month | Catch reproductions if a fix regresses |
| Before any topup-related migration | Confirm books are clean before mutating |

## Interpretation

Six sections. Empty output across §1, §3, §4, §5 = no detected impact.

### §1 — Duplicate topup credit logs per `trade_no`

A successful order that produced multiple `通过 <gateway> 充值 ...` log
entries inside a 10-second window is the literal smoking gun of the
pre-#32 webhook race: two webhooks for the same `trade_no` both landed,
both passed the (broken) status guard, both credited.

The match is best-effort — `logs.content` embeds the human amount but not
the `trade_no`. Tighten the `BETWEEN ±5` time window if your traffic is
dense enough to produce ambiguous matches.

**If non-empty:** sum `logged_credit - expected_credit` to see total
over-credited quota. Each row is one order; you can reconcile by manually
debiting the difference (use `AdminMarkTopupSuccess` equivalents only
for genuine missing-callback cases, not for clawback — issue a direct
`UPDATE users SET quota = quota - <delta> WHERE id = <user_id>` with
operator audit trail).

### §2 — Users with unexplained credited quota

Arithmetic check across all funding sources:

```
unexplained = current_balance + consumed
              - SUM(successful topup quota)
              - SUM(used redemption quota)
```

A positive `unexplained_quota` means the user holds (or has spent) more
than they were ever legitimately credited.

**Caveat:** any signup / promo quota assigned at user creation (see
`config.DefaultQuotaForNewUser` and the seeding paths in `model/user.go`)
also shows up as unexplained because it has no topup or redemption row.
Subtract the seed amount per user before treating a row as an incident:

```sql
unexplained_quota - <signup_default> = real anomaly
```

### §3 — Duplicate redemption credit logs

Each `redemption.status = 3` (used) row must produce exactly one
`通过兑换码充值` log entry. More than one = pre-#32 redeem race.

**If non-empty:** this is the most exploitable of the three bugs (any
logged-in user can drive it from a browser). Cross-check the redeeming
users against your signup-fraud signals — if multiple incidents cluster
on accounts registered within the same hour or from the same IP block,
treat as organised abuse.

### §4 — Negative `users.quota`

Pre-this-PR signature of the `PreConsumeTokenQuota` TOCTOU race: a user
with quota=100 fired 5 concurrent chats costing 80 each, all 5 passed
the (non-atomic) balance guard, 5 deductions ran, balance is now -300.

A single negative row is unambiguous evidence the bug bit. Cross-check
against §6 to see if it was scripted.

**If non-empty:** the upstream provider has already been billed for the
overage. Refund decisions are commercial; the technical action is to
zero the balance and freeze the token until the user re-tops-up.

### §5 — Negative `tokens.remain_quota`

Same race signature scoped to a single token cap (when the user has
plenty of balance but the token is capped). Less common because most
tokens are unlimited (`unlimited_quota=true`).

### §6 — Rapid-fire consume bursts

Behavioural fingerprint, not a financial check. Any token producing
≥10 consume logs inside a one-second window is either (a) a legitimate
parallel worker (benchmark, batch eval) or (b) a scripted concurrency
attack. Cross-reference with §4 / §5 — bursts on tokens whose owner
also appears negative are the attack pattern.

This section stays useful after the fix lands, as the indicator of a
client who *tried* to exploit the bug even when their attack now bounces.

## Triage workflow

```
audit-2026-06-06.txt
    ├─ §1 non-empty? -------- yes -> manual reconciliation per order
    ├─ §3 non-empty? -------- yes -> redemption clawback + abuse review
    ├─ §4 / §5 non-empty? --- yes -> zero balance + freeze token + notify
    ├─ §2 non-empty? -------- subtract default seed, then triage
    └─ §6 non-empty? -------- monitor; cross-ref against §4
```

If everything is empty, file the report as the "clean baseline" and move
on. Re-run weekly.
