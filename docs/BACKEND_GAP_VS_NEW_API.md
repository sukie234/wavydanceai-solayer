# 后端业务能力对照：当前仓库 vs `QuantumNous/new-api`

> 对照对象：`QuantumNous/new-api`（main 分支，活跃 One-API 衍生项目）
> 对照基准：当前仓库 (`wavydanceai`，标准 One-API 分叉)
> 目的：盘点业务能力差距，规划 MVP 商业化路径。

---

## MVP 目标（按优先级）

| 优先级 | 模块 | 范围 |
|---|---|---|
| **P0（首要，必须先跑通）** | [§1 商业化充值](#1-商业化充值-p0) | 在线支付下单、回调、订单、额度入账、对账与管理后台补单 |
| **P1（次要）** | [§3 认证与安全](#3-认证--安全-p1) | 多 OAuth、2FA/TOTP、Passkey/WebAuthn、通用二次验证 |
| P2 之后 | §2 订阅制、§4 运营增长、§5 计费引擎、§6 多模态/任务、§7 协议互转/Codex、§8 其他 | 不在 MVP 内，但本文记录差距以便后续规划 |

---

## 0. 当前仓库现状（充值相关，事实记录）

- 路由：
  - `POST /api/user/topup` → `controller.TopUp`（兑换码兑换；`controller/user.go:754`）
  - `POST /api/topup` → `controller.AdminTopUp`（管理员手动加额度；`controller/user.go:788`）
- 配置：`config.TopUpLink`（`common/config/config.go:19`）只是个跳转外链，回传给前端展示在 `/api/status`，**后端不处理任何支付订单 / 回调 / 金额校验**。
- 模型：`model/redemption.go` 兑换码、`model.RecordTopupLog` 仅写流水，**没有充值订单表 (`topup` table)**。
- 结论：**目前没有任何在线支付能力**，只有"兑换码 + 管理员手工补单 + 外链跳转"三件套。

---

## 1. 商业化充值 (P0)

> **MVP 首要目标**：至少跑通一个支付渠道的"下单 → 回调 → 入账 → 流水/订单 → 管理后台"完整闭环。
> 推荐起步：**易支付 (E-Pay) 或 Stripe 二选一**（Stripe 海外/合规更稳；E-Pay 国内/接入快）。

### 1.1 new-api 已提供的能力

| 能力 | new-api 文件 | new-api 路由 / 入口 |
|---|---|---|
| 易支付下单 | `controller/topup.go` (`RequestEpay`, `RequestAmount`) | `POST /api/user/pay`, `POST /api/user/amount` |
| 易支付回调 | `controller/topup.go` (`EpayNotify`) | `POST/GET /api/user/epay/notify` |
| 易支付服务层 | `service/epay.go` | — |
| Stripe 下单 | `controller/topup_stripe.go` (`RequestStripePay`, `RequestStripeAmount`) | `POST /api/user/stripe/pay`, `POST /api/user/stripe/amount` |
| Stripe 回调 | `controller/topup_stripe.go` | `POST /api/stripe/webhook` |
| Creem 下单 / 回调 | `controller/topup_creem.go` | `POST /api/user/creem/pay`, `POST /api/creem/webhook` |
| Waffo / Waffo-Pancake | `controller/topup_waffo*.go`, `service/waffo_pancake.go` | `POST /api/user/waffo*`, `POST /api/waffo*/webhook` |
| 充值订单表 | `model/topup.go` | — |
| 用户查询自身充值 | `controller/topup.go` (`GetUserTopUps`) | `GET /api/user/topup/self` |
| 用户查询充值入口配置 | `controller/topup.go` (`GetTopUpInfo`) | `GET /api/user/topup/info` |
| 管理员列出全部充值订单 | `controller/topup.go` (`GetAllTopUps`) | `GET /api/user/topup`（admin） |
| 管理员手动完单（补单） | `controller/topup.go` (`AdminCompleteTopUp`) | `POST /api/user/topup/complete` |
| 兑换码 (Redemption) | `controller/topup.go` (`TopUp`) | `POST /api/user/topup` |
| 支付合规开关 | `controller/payment_compliance.go` | `POST /api/option/payment_compliance` |
| Webhook 可用性自检 | `controller/payment_webhook_availability.go` | — |
| Waffo-Pancake 商品目录 / 配对 / 订阅产品 | `controller/topup_waffo_pancake.go` | `/api/option/waffo-pancake/*` |

### 1.2 当前仓库的缺口

- ❌ **零在线支付**（无 Stripe / 易支付 / 微信 / 支付宝 / Creem / Waffo）
- ❌ 无 `topup` 订单表（仅有 `RecordTopupLog` 日志条目，无订单实体）
- ❌ 无 webhook 签名校验、幂等、订单状态机
- ❌ 无管理员补单接口（`AdminCompleteTopUp`）
- ❌ 无支付合规开关
- ❌ 无前端"选择金额 → 下单 → 跳转/弹支付窗"链路所需的后端 API

### 1.3 MVP 最小可行改造清单（建议起步：Stripe 或 E-Pay 单通道）

**新增数据表**
- `topup`：`id, user_id, amount, money, trade_no, gateway, status (pending/success/failed/refunded), created_at, completed_at, callback_payload`
  - 索引：`(user_id, status)`、唯一 `trade_no`

**新增 controller / service**
- `controller/topup.go`：`GetTopUpInfo`, `GetUserTopUps`, `RequestEpay`/`RequestStripePay`, `EpayNotify`/`StripeWebhook`, `GetAllTopUps`, `AdminCompleteTopUp`
- `service/epay.go` 或 `service/stripe.go`：签名、下单 URL/Session、回调验签
- 把现有 `TopUp`（兑换码）保留，路径不变

**新增路由（参考 new-api `router/api-router.go`）**
```
selfRoute.GET  /user/topup/info
selfRoute.GET  /user/topup/self
selfRoute.POST /user/amount            // 询价（含折扣、最小金额）
selfRoute.POST /user/pay               // 易支付下单
selfRoute.POST /user/stripe/amount
selfRoute.POST /user/stripe/pay        // Stripe Checkout Session
userRoute.POST /user/epay/notify       // E-Pay 同步/异步回调
apiRouter.POST /stripe/webhook         // Stripe 签名 webhook
adminRoute.GET  /user/topup            // 列订单
adminRoute.POST /user/topup/complete   // 补单
```

**新增 option 配置项（写入 `option` 表）**
- `TopupGroupRatio`（不同用户组优惠比例）
- `PaymentEnabled`、`PaymentUSDRate`、`MinTopupCount`、`TopupAmountDiscount`
- `EpayId / EpayKey / EpayUrl / EpayAddress`
- `StripeApiSecretKey / StripeWebhookSecret / StripePriceXxx`
- `CustomCallbackAddress`（被 Stripe / E-Pay 用作回调基础地址）

**回调入账流程（关键，必须幂等）**
1. 校验签名 / Stripe signature
2. 查 `topup` by `trade_no`；若 `status != pending` → 直接 200 返回（幂等）
3. 事务内：
   - `UPDATE topup SET status='success', completed_at=NOW(), callback_payload=...`
   - `model.IncreaseUserQuota(user_id, quota)`
   - `model.RecordTopupLog(ctx, user_id, "通过 Stripe 充值 X", quota)`
4. 失败回滚，记录日志，向网关返回非 200 让其重试

**环境变量**
- 至少新增：`STRIPE_API_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CALLBACK_ADDRESS`
- 不要把密钥写进 `option` 默认值；用 env 注入 + 启动加载

**安全 / 合规**
- Webhook 必须验签（Stripe `Stripe-Signature` / E-Pay `sign`）
- 回调路由 **不要**走 `UserAuth`，但要套 `anonymousRequestBodyLimit` 防大 body
- 金额校验：服务端复算 quota，**绝不**信任客户端传来的 quota
- 货币换算用整数分（避免 float）
- 订单 `trade_no` 用 UUID/雪花，避免可预测

### 1.4 MVP 验收标准

- [ ] 用户能在前端选择金额，发起 Stripe / E-Pay 支付
- [ ] 支付成功后 quota 自动入账，余额变化与流水正确
- [ ] 同一笔回调重复触发不会重复入账（幂等）
- [ ] 管理员能查到全部充值订单 + 按状态/用户筛选
- [ ] 管理员能对"已付款但未入账"的订单手动补单
- [ ] 失败/取消订单状态正确，不影响余额
- [ ] 关键路径有审计日志

---

## 2. 订阅制 (Subscription) — P2，MVP 之后

new-api 已经有完整的"套餐 + 自动续期"，当前仓库**完全没有**。

| 能力 | new-api |
|---|---|
| 套餐定义、用户订阅、定期重置 | `controller/subscription.go`, `model/subscription.go`, `service/subscription_reset_task.go` |
| 套餐购买（余额 / E-Pay / Stripe / Creem / Waffo-Pancake） | `POST /api/subscription/{balance,epay,stripe,creem,waffo-pancake}/pay` |
| 管理端套餐 CRUD + 启停 | `POST/PUT/PATCH /api/subscription/admin/plans` |
| 用户订阅管理（管理员） | `/api/subscription/admin/users/:id/subscriptions` |
| 订阅独立回调链 | `/api/subscription/epay/{notify,return}` |

**MVP 不做。** 上 §1 充值跑通后再评估订阅模型是否需要。

---

## 3. 认证 / 安全 (P1)

> **MVP 次要目标**：在充值跑通后补齐主流账户安全能力。

### 3.1 差距

| 能力 | new-api | 当前 | MVP 建议 |
|---|---|---|---|
| GitHub OAuth | ✅ | ✅ | 保持 |
| WeChat OAuth | ✅ | ✅（看版本） | 保持 |
| Discord OAuth | ✅ `controller/discord.go` | ❌ | P1（视用户群） |
| OIDC | ✅ `controller/oidc.go` | ❌ | P1（企业接入） |
| LinuxDO | ✅ `controller/linuxdo.go` | ❌ | 可选 |
| Telegram | ✅ `controller/telegram.go` | ❌ | 可选 |
| **Custom OAuth Provider**（运营自助配置） | ✅ `controller/custom_oauth.go` + `model/custom_oauth_provider.go` + 绑定管理 | ❌ | **P1（推荐）** |
| **2FA / TOTP + 备份码** | ✅ `controller/twofa.go`, `model/twofa.go` | ❌ | **P1（必备）** |
| **Passkey / WebAuthn** | ✅ `controller/passkey.go`, `service/passkey/`, `oauth/passkey` | ❌ | **P1（强烈推荐）** |
| 通用二次验证接口 | ✅ `controller/secure_verification.go` (`POST /api/verify`) | ❌ | P1（配合 2FA/Passkey） |
| 管理员重置用户 Passkey | ✅ `AdminResetPasskey` | ❌ | 随 Passkey 一起 |
| 管理员强制下线绑定 | ✅ `AdminClearUserBinding` | ❌ | 可选 |
| OAuth 统一入口 (`/api/oauth/:provider`) | ✅ | ❌（每家一个 handler） | P1 重构 |

### 3.2 MVP P1 推荐顺序

1. **2FA (TOTP) + 备份码** — 最低成本提升账户安全，纯后端 + 标准库即可 — ✅ 已完成 PR #16
2. **Passkey / WebAuthn** — 现代化体验，依赖 `go-webauthn/webauthn`
3. **Custom OAuth Provider** — 让运营自助接 SSO，避免每次加一个 OAuth 都改代码
4. **OIDC / Discord** — 视实际用户群再补

### 3.3 多 provider OIDC 设计（架构补充，2026-06-06）

§3.1 表里的 "OIDC"、"Custom OAuth Provider"、"OAuth 统一入口" 三行**不是三个独立能力，是一套架构的三层**。直接抄 new-api 会落入它的坑 —— new-api 的 OIDC 仍然是 singleton（同时只能跑一个 IdP）。

**目标架构**：把这三项合并为一套**多 provider OIDC 注册表**，模式照搬 P0 加密支付的 adapter 基座（`service/payment/crypto/registry.go`）：

```go
// setting/system_setting/oidc.go
type OIDCProvider struct {
    Name         string  // "google" / "okta" / "auth0"，路由 :provider 用
    DisplayName  string  // "Sign in with Google"，前端按钮文案
    WellKnown    string
    ClientId     string
    ClientSecret string
    Enabled      bool
    Icon         string
}
type OIDCSettings struct {
    Providers []OIDCProvider `json:"providers"`
}

// 路由：/api/oauth/oidc/:provider 按 Name 分发
// 前端：/api/status 暴露 enabled providers，循环渲染按钮
```

**白标 SaaS 含义**：每个客户可能要不同 OIDC IdP（A 客户用 Google，B 用 Okta，C 用自建 Keycloak）。**多 provider 是真实需求**，singleton 不够用。

**Custom OAuth Provider** (`controller/custom_oauth.go` + `model/custom_oauth_provider.go`) 是这套设计的**运营态扩展** —— 让 admin 在管理后台直接加 provider，无需写代码 / 改镜像 / 出 PR。三件事是一个 phase。

**目前状态**：PR #15 临时做了一个硬编码 Google handler (`controller/auth/google.go` + 已在 #15 后续 commit 迁到 `setting/auth_setting/google_setting.go`)。这是过渡产物，最终会被这个注册表替代 —— 完成后 Google handler 删除，"Sign in with Google" 走 generic OIDC + provider name = "google"。

---

## 4. 运营 / 增长 — P2

| 能力 | new-api | 当前 |
|---|---|---|
| 签到送额度 | ✅ `controller/checkin.go`, `model/checkin.go` | ❌ |
| 邀请 / 分销（aff code + aff transfer） | ✅ | ❌ |
| 公告 / 用户协议 / 隐私政策 / 关于页 | ✅ 全套接口 | 部分 |
| 排行榜 | ✅ `controller/rankings.go`, `model/usedata_rankings.go` | ❌ |
| Perf Metrics（模型实测延迟/吞吐） | ✅ `controller/perf_metrics.go`, `model/perf_metric.go` | ❌ |
| Uptime Kuma 集成 | ✅ `controller/uptime_kuma.go` | ❌ |
| 首页内容配置 | ✅ `GetHomePageContent` | ❌ |
| Setup 向导（首次启动引导） | ✅ `controller/setup.go`, `model/setup.go` | ❌（env 配置） |

**MVP 不做。** 充值跑通后视增长需要再做（签到、分销对获客很有用）。

---

## 5. 计费 / 渠道智能引擎 — P2 之后

> new-api 把计费拆成独立 `service/` 层，能力远超 One-API 原版。
> 当前仓库的 `controller/billing.go` 只做单次 quota 扣减 + 限速 + 日志。

| 能力 | new-api | 当前 |
|---|---|---|
| 预扣 + 结算 | `service/pre_consume_quota.go`, `text_quota.go`, `tool_billing.go`, `task_billing.go` | 简单扣减 |
| 阶梯结算（按用量分档） | `service/tiered_settle.go` | ❌ |
| 违规罚款 | `service/violation_fee.go` | ❌ |
| 资金来源区分（余额/订阅/赠送） | `service/funding_source.go` | ❌ |
| 渠道亲和缓存（用户/模型 sticky） | `service/channel_affinity.go`, `controller/channel_affinity_cache.go` | ❌ |
| 智能渠道选择 | `service/channel_select.go` | ❌ |
| 上游同步（模型/比率） | `controller/channel_upstream_update.go`, `model_sync.go`, `ratio_sync.go` | ❌ |
| Pricing 独立模块 | `controller/pricing.go`, `model/pricing*.go` | ❌ |
| Token 计数独立模块 | `service/token_counter.go`, `token_estimator.go`, `tokenizer.go` | 内嵌 relay |
| 厂商 / 模型元数据 | `model_meta.go`, `vendor_meta.go`, `prefill_group.go`, `missing_models.go` | ❌ |

---

## 6. 多模态 / 异步任务系统 — P2 之后

new-api 是 "AI Gateway"，不止文本。

| 能力 | new-api |
|---|---|
| Midjourney | `controller/midjourney.go`, `model/midjourney.go` |
| 图片 | `controller/image.go` |
| 视频 | `router/video-router.go`, `controller/swag_video.go`, `task_video.go`, `video_proxy.go`, `video_proxy_gemini.go` |
| 异步任务框架 | `controller/task.go`, `service/task_polling.go`, `task_billing.go` |
| 文件下载/解码/服务 | `service/download.go`, `file_decoder.go`, `file_service.go` |

当前仓库只有同步文本 relay (`controller/relay.go`)。

---

## 7. 协议互转 / Codex — P2 之后

new-api 的卖点之一：**任意 LLM 互转 OpenAI / Claude / Gemini 兼容格式**。

- `service/convert.go`, `openai_chat_responses_compat.go`, `openai_chat_responses_mode.go`, `openaicompat/` 包
- Codex 专用：`controller/codex_oauth.go`, `codex_usage.go`, `service/codex_credential_refresh.go`

当前仓库走经典 One-API relay 链路，没有这层兼容转换。

---

## 8. 其他后端能力 — P3 / 视情况

| 能力 | new-api | 当前 |
|---|---|---|
| Webhook 通用服务 | `service/webhook.go` | ❌ |
| 用户通知 + 限频 | `service/user_notify.go`, `notify-limit.go` | ❌ |
| 敏感词过滤 | `service/sensitive.go` | ❌ |
| Dashboard 独立路由 | `router/dashboard.go` | ❌ |
| Service 分层架构 | 独立 `service/` 包 | ❌（业务全在 controller） |

---

## 9. 配置层架构迁移 (`setting/`)（2026-06-06 新增）

> 这一节记录的不是"再抄一个模块"，而是抄 **new-api 的配置组织方式**本身。
> 已经启动，PR #20 是起点，pilot 模块是 checkin。

### 9.1 为什么

当前 `common/config/config.go` 是 **101 个全局 var**，`model/option.go` 是 **62 个 switch case** 手工列每个 key。每加一个配置项要改 4 处（声明 var、InitOptionMap 默认值、updateOptionMap switch、调用方读 var）。new-api 重构成了"一个模块一个 struct + `init()` 注册到全局 registry"，配合反射做自动序列化 —— 加新模块 = 1 个文件，零中央样板。

### 9.2 基础设施（已完成）

| PR | 内容 | 状态 |
|---|---|---|
| #20 | `setting/config/` registry 基建（ConfigManager + Register / LoadFromDB / SaveToDB / ExportAllConfigs，基于 reflect + json tag）+ 集成进 `model/option.go` 的 load / update 路径 + pilot 模块 `setting/operation_setting/checkin_setting.go` | ✅ merged |
| #15 | 借势把 Google OAuth 迁到 `setting/auth_setting/google_setting.go`（这是过渡命名，见 §3.3）| ✅ merged |

**新旧两套并存规则**：legacy key 用 bare 名称（`PaymentEnabled`），新模块用 dotted（`payment_setting.enabled`）。`.` 不是 Go 标识符合法字符，两套命名空间天然隔离。

### 9.3 `_old.go` 兼容 shim 模式（关键技术）

new-api 不做 DB key 数据迁移 —— 它把**老的扁平 var 单独抽到 `payment_setting_old.go` / `system_setting_old.go`**，跟新 struct **共存**。文件头明确写"如需增加新的参数、变量等，请在新文件中添加"。

含义：迁移有生产数据的模块（payment / quota）**不需要 SQL migration**，只需要：

1. 新增 `setting/<group>/<module>_setting.go`（struct + register + Get accessor）
2. 把 `common/config/config.go` 里的老 var **搬到** `setting/<group>/<module>_setting_old.go`
3. 调用方逐步从老 var 改成 `setting.GetXxx()`
4. 老 var 还在、DB key 还是老名字 → 零数据迁移
5. 觉得安全了再删 `_old.go`

这是之前内部讨论里"phase 8/9 高风险，需要 data migration"判断的**修正答案**。

### 9.4 命名 / 目录约定（对齐 new-api）

| 维度 | 约定 |
|---|---|
| Struct 名 | `OIDCSettings`（复数 `s`，匹配 new-api） |
| Singleton 名 | `defaultOIDCSettings` |
| Register key | `"oidc"`（**不带** `_setting` 后缀） |
| Getter | `GetOIDCSettings()` |
| 子包 | 按域分：`system_setting/`（OAuth / 安全 / 主题 / 法务） / `operation_setting/`（增长 / 支付 / 签到 / quota） / `model_setting/`（per-vendor LLM 调优） / `ratio_setting/`（计费比率） / `billing_setting/`（阶梯计费） |

**已知偏差待修**：PR #15 建的 `setting/auth_setting/google_setting.go` 命名（`auth_setting` 子包 + `GoogleSetting` 单数 + register key `"google_setting"`）跟 new-api 不一致。应在多 provider OIDC 注册表落地时一起改 —— `setting/auth_setting/` 整体改名 / 合并到 `setting/system_setting/`，否则未来 cherry-pick new-api 的 `system_setting/{oidc,discord,passkey}.go` 会跟我们的目录撞。

### 9.5 迁移 phase 候选（按依赖 + 风险排序）

每个 phase = 一个独立 PR，~ 1 小时工作量。**严禁一口气全做** —— 中间留几天观察生产稳定性。

| Phase | 子包 / 文件 | 包含 keys | 风险 / 备注 |
|---|---|---|---|
| 1 | `system_setting/github.go` | GitHubOAuthEnabled / GitHubClientId / GitHubClientSecret | 低 |
| 2 | `system_setting/oidc.go` + 多 provider 注册表（见 §3.3） | OidcEnabled / OidcClientId / OidcClientSecret / OidcWellKnown / Oidc*Endpoint | 中（同时替换 §3.3 的 Google handler） |
| 3 | `system_setting/lark.go` | LarkClientId / LarkClientSecret | 低 |
| 4 | `system_setting/wechat.go` | WeChatAuthEnabled / WeChatServerAddress / WeChatServerToken / WeChatAccountQRCodeImageURL | 低 |
| 5 | `system_setting/password.go` | PasswordLoginEnabled / PasswordRegisterEnabled / RegisterEnabled / EmailVerificationEnabled / EmailDomainRestrictionEnabled / EmailDomainWhitelist | 中（动 register / login 核心路径） |
| 6 | `system_setting/turnstile.go` | TurnstileCheckEnabled / TurnstileSiteKey / TurnstileSecretKey | 低 |
| 7 | `system_setting/smtp.go` + `smtp_old.go` shim | SMTPServer / SMTPPort / SMTPAccount / SMTPFrom / SMTPToken | 中（影响所有邮件发送，必须留 `_old.go`） |
| 8 | `operation_setting/payment_setting.go` + `payment_setting_old.go` shim | PaymentEnabled / StripeEnabled / EpayEnabled / PaymentCallbackBaseURL / PaymentReturnURL / CryptoAdaptersEnabled | **高**（已上生产，必须留 `_old.go`） |
| 9 | `operation_setting/quota_setting.go` + `quota_setting_old.go` shim | QuotaForNewUser / QuotaForInviter / QuotaForInvitee / QuotaRemindThreshold / PreConsumedQuota / QuotaPerUnit | 中（计费路径） |
| 10 | `system_setting/branding.go` + `branding_old.go` shim | SystemName / Logo / Footer / Theme / HomePageContent / About / Notice / TopUpLink / ChatLink / ServerAddress / MessagePusherAddress / MessagePusherToken / ChannelDisableThreshold / Automatic*Channel / ApproximateToken / DisplayIn* / RetryTimes | 中（量大但都是显示层 / 渠道开关） |

**节奏**：先 1-4（纯 OAuth provider，pattern 验证过、无生产数据）→ 6 → 5 → 7 → 10 → 9 → 8 最后。每个之间观察 3-7 天。

---

## 附：架构差异

- **目录分层**：new-api 有清晰的 `controller / service / model / router` 四层；当前仓库业务逻辑大量塞在 controller 里。
- **路由组织**：new-api 路由按业务域分组（subscription / topup / passkey / 2fa / oauth 统一入口），可读性更好。
- **配置模型**：new-api 大量功能通过 `option` 表动态开关（payment_compliance、channel_affinity_cache、waffo-pancake catalog 等），运营可热调；当前仓库以 env 为主。**已启动迁移，见 §9**。

---

## 行动建议（落地顺序）

1. ~~**本周内**：拍板 P0 支付渠道~~ — ✅ 完成（PR #11 三通道）
2. ~~**P0 开发**：按 §1.3 清单做"单通道闭环"，验收按 §1.4~~ — ✅ 完成
3. **P0 上线 + 观察 1–2 周**：流水对账、回调成功率、幂等是否生效 — 进行中
4. **P1 启动**：先 2FA（✅ PR #16），再 Passkey，再 Custom OAuth / 多 provider OIDC（§3.3）
5. **配置层迁移**：按 §9.5 节奏，从 phase 1 开始
6. **P2 起规划**：根据业务诉求（订阅 / 多模态 / 签到分销）排期

---

> 文档维护：每完成一个模块迁移，在对应表里把 ❌ 改成 ✅ 并标注 commit / PR。
> 最后更新：2026-06-06
