# 能力对照：wavydanceai vs `QuantumNous/new-api`

> 对照对象：`QuantumNous/new-api` main 分支（2026-06-10 仍活跃，v1.0.0-rc 阶段）
> 对照基准：本仓库（`wavydanceai`，one-api 硬分叉）
> 最后更新：2026-06-11（全量重写，替代 2026-06-06 旧版）

**怎么读这份文档**：new-api 是同源分叉、不是我们的 upstream，它的功能全集只是"参照系"，不是待办清单。每个差距都按我们自己的业务模型评估——**白标 SaaS、一客户一部署、上游走 worldrouter 聚合**——很多 new-api 的能力在这个模型下根本不需要（见 §10 不做清单）。

---

## TL;DR

| 域 | 状态 | 一句话 |
|---|---|---|
| §1 支付/充值 | ✅ 基本对齐 | 三通道闭环已上线，差的只是更多网关和合规开关 |
| §2 认证/安全 | ✅ 基本对齐 | 2FA + Passkey + 5 家 OAuth 都有，差通用二次验证中间件 |
| §3 异步任务 + 视频 | ❌ **最大缺口** | new-api 有完整任务框架 + 9 个视频适配器，我们是零；与视频里程碑直接重合 |
| §4 计费引擎 | ⚠️ 中等差距 | 预扣+结算有了；差缓存计费、阶梯计费、工具计费 |
| §5 协议互转 | ❌ 缺失，按需 | 只有 OpenAI 兼容入口；无 /v1/messages、Responses API |
| §6 订阅制 | ❌ 缺失，暂缓 | new-api 全套套餐+续期，我们没有；等充值跑稳再评估 |
| §7 渠道管理 | ✅ 够用 | worldrouter 单渠道模型下，new-api 的智能选择/亲和性大多用不上 |
| §8 运营/增长 | ⚠️ 核心有了 | 签到、邀请有；差公告、排行榜、setup 向导（低优先） |
| §9 基础设施 | ⚠️ 按需补 | setting 注册表已起步；差通知、敏感词、过载保护 |

**当前最重要的事**（结合里程碑）：充值→用量闭环验证完后，缺口 #1 是 §3 异步任务框架，它是 Seedance → Kling → Sora 视频接入的前置条件。

---

## 0. 业务前提（决定所有取舍）

1. **白标 SaaS，一客户一部署**：不存在"一个部署多租户/多 IdP/多支付偏好"的需求。singleton + 配置足够，不引入注册表/插件抽象（除非出现 ≥2 个真实并发场景）。
2. **上游走 worldrouter 聚合**（inference-api.worldrouter.ai）：一个 OpenAI 兼容渠道覆盖全部文本流量。new-api 维护 30+ 上游适配器的负担我们没有，相应的渠道智能化能力也大多不需要。
3. **视频里程碑**：Seedance → Kling → Sora → 图片批量；当前阻塞在充值→用量闭环验证上。
4. new-api 已改 AGPLv3（从 one-api 的 MIT 硬分叉），**参考设计思路可以，直接抄代码要过许可证评估**。

---

## 1. 支付 / 充值 — ✅ 基本对齐

### 我们已有（2026-06 P0 已交付）

| 能力 | 本仓库证据 |
|---|---|
| Stripe（下单 + 签名 webhook） | `controller/topup_stripe.go`、`POST /api/stripe/webhook` |
| 易支付 E-Pay | `controller/topup.go`、`POST /api/epay/notify` |
| Crypto（NOWPayments / Sui / Solayer UCard 实装；CryptoMus 占位） | `service/payment/`、`POST /api/crypto/webhook/:adapter` |
| 充值订单表（状态机 + 幂等回调） | `model/topup.go`（pending/success/failed/refunded） |
| 管理员补单（行锁幂等） | `controller/topup.go` `AdminCompleteTopup` |
| 订单查询/对账（按用户/状态/网关/时间） | `AdminListTopups` |
| 兑换码（含自兑换防护） | `model/redemption.go`，PR #39 |

### new-api 多出来的

| 能力 | new-api 证据 | 评估 |
|---|---|---|
| Creem / Waffo / Waffo Pancake 网关 | `controller/topup_creem.go`、`topup_waffo*.go` | 不需要——现有三通道覆盖中外场景 |
| 支付合规确认弹窗（付费前确认） | `controller/payment_compliance.go`（2026-05） | 看客户合规要求，可后补 |
| Webhook 可用性自检 | `controller/payment_webhook_availability.go` | 锦上添花，排障时有用 |
| 充值倍率/分组优惠 | `common/topup-ratio.go` | 有促销需求时再做 |

**结论**：本域不再是缺口。剩余工作是运营验证（回调成功率、对账），不是开发。

---

## 2. 认证 / 安全 — ✅ 基本对齐

### 我们已有

| 能力 | 本仓库证据 |
|---|---|
| OAuth：GitHub / Google / WeChat / Lark / 通用 OIDC | `controller/auth/{github,google,wechat,lark,oidc}.go` |
| 2FA / TOTP + 备份码 | `service/twofa/`，PR #16 |
| Passkey / WebAuthn（注册/登录/恢复码） | `service/passkey/`、`model/passkey.go`，PR #29（已知小 bug，已降优先级） |
| 邮箱验证 + 忘记密码 | PR #41 |
| 密码复杂度 + 用户名规则 | PR #40、#51 |
| Turnstile | `middleware` 集成 |
| 行级锁的 quota 原子扣减 | PR #32、#33 |

### new-api 多出来的

| 能力 | new-api 证据 | 评估 |
|---|---|---|
| **敏感操作通用二次验证**（中间件级，改密/改绑定前强制 2FA/Passkey 验证） | `controller/secure_verification.go`、`middleware/secure_verification.go` | **值得做**——我们 2FA/Passkey 都有了，但没有统一的"敏感操作前再验一次"入口 |
| OAuth provider 注册表 + 自定义 OAuth | `oauth/registry.go`、`controller/custom_oauth.go` | 不做——一客一部署一 IdP，singleton OIDC 已覆盖（2026-06-06 已评估过一次，结论不变） |
| Discord / LinuxDO / Telegram OAuth | `oauth/discord.go` 等 | 视客户用户群，按需 |
| 第三方绑定统一管理表 | `model/user_oauth_binding.go` | 等出现多绑定管理需求再说 |
| SSRF 防护 / URL 校验 / 请求体限制 | `common/ssrf_protection.go`、`request_body_limit.go` | **值得对照自查**——我们 channel base_url 校验有了（PR #42），SSRF 和 body limit 覆盖面要确认 |
| 用户创建/最后登录时间审计 | v0.13.2 | 小，顺手可加 |

---

## 3. 异步任务系统 + 视频生成 — ❌ 最大缺口（与里程碑直接重合）

我们目前只有同步 relay（chat/completions、embeddings、images、audio、moderations，见 `relay/relaymode/define.go`）。**没有任务表、没有轮询、没有任务计费**。前端 playground 已经有 video tab（PR #44），但后端没有对应 relay 能力。

new-api 这边是完整体系：

| 组件 | new-api 证据 |
|---|---|
| 统一任务框架（CAS 状态机 + 轮询） | `model/task.go`、`service/task_polling.go`、`relay/relay_task.go` |
| 任务计费（预扣→结算，无价格报错） | `service/task_billing.go` |
| 统一 OpenAI Video 格式 + 独立路由 | `dto/openai_video.go`、`router/video-router.go`、`controller/task_video.go` |
| 视频代理（含 Gemini 专用） | `controller/video_proxy.go`、`video_proxy_gemini.go` |
| 视频适配器 ×9：Kling、即梦、Sora、Vidu、海螺、豆包、阿里 Wan、Veo；Seedance 2.0（2026-04） | `relay/channel/task/{kling,jimeng,sora,vidu,hailuo,doubao,ali,vertex,gemini}/` |
| 文件下载/解码/服务 | `service/file_service.go`、`file_decoder.go` |
| Midjourney-Proxy / Suno | `controller/midjourney.go`、`relay/channel/task/suno/` |

**落地建议**（充值→用量闭环验证完成后启动）：

1. 第一个 PR 做**任务框架本身**：`task` 表（任务 id、用户、渠道、状态机、预扣 quota、回调 payload）+ 提交/查询 API + 轮询 goroutine + 任务计费（预扣→成功结算/失败退款）。参考 new-api 的状态机设计，不抄代码。
2. 然后按里程碑顺序接适配器：**Seedance → Kling → Sora**，每个适配器一个 PR。
3. 图片批量生成复用同一任务框架。
4. Midjourney / Suno 不在里程碑内，不做。

---

## 4. 计费引擎 — ⚠️ 中等差距

### 我们已有

- 预扣 + 结算（`relay/billing/billing.go`：`PreConsumeTokenQuota` / `PostConsumeTokenQuota`）
- 模型倍率 / 分组倍率（`relay/billing/ratio/`，已有单测 PR #55）
- Token 计数（`relay/adaptor/openai/token.go`）
- 消费日志 + 审计（`model/log.go`、审计脚本 PR #33）

### new-api 多出来的

| 能力 | new-api 证据 | 评估 |
|---|---|---|
| **缓存计费**（prompt cache hit/creation 单独倍率，OpenAI/Claude/DeepSeek/Qwen） | `setting/ratio_setting/cache_ratio` | **值得做**——上游（worldrouter）按缓存折扣计价的话，我们不区分缓存就会亏价差或多收客户 |
| expr 表达式阶梯计费（`tokens <= 128000 ? 0.002 : 0.004`） | `pkg/billingexpr/`（2026-04） | 等出现真实的阶梯定价模型再做；目前定价模型用不上 |
| 工具调用计费（web search 等附加费） | `service/tool_billing.go` | 接了带工具计费的模型时再做 |
| 任务计费 | `service/task_billing.go` | 归入 §3 一起做 |
| 资金来源抽象（余额 vs 订阅额度） | `service/funding_source.go` | 订阅制的前置，§6 一起评估 |
| 违规罚款（Grok 兼容） | `service/violation_fee.go` | 不需要 |
| Pricing 独立模块 + 上游价格自动同步（OpenRouter/models.dev） | `controller/pricing.go`、`ratio_sync.go` | **半个缺口**——我们模型倍率是手维护的；如果 worldrouter 暴露 pricing endpoint，做个同步能省运营成本 |
| reasoning 后缀计费/路由（`-high/-thinking` 等） | `setting/reasoning/suffix.go` | 客户用到 reasoning 模型分档时再说 |

---

## 5. 协议互转 — ❌ 缺失，按客户需求触发

我们只有 OpenAI 兼容入口（`/v1/*` → `controller.Relay`）。new-api 按协议分了入口层：

| 能力 | new-api 证据 | 评估 |
|---|---|---|
| **Claude 原生 `/v1/messages`** | `relay/claude_handler.go` | **最可能先被客户要**——用 Anthropic SDK / Claude Code 的客户没法直接接我们 |
| Gemini 原生 `/v1beta` | `relay/gemini_handler.go` | 同上，需求弱一档 |
| Responses API + Chat⇄Responses 互转 | `relay/responses_handler.go`、`service/openaicompat/` | OpenAI 生态在迁 Responses，中期值得跟踪 |
| `/v1/responses/compact` 上下文压缩 | 2026-02 | 不急 |
| Codex 渠道（ChatGPT OAuth 账号当上游 + 凭证自动刷新） | `relay/channel/codex/`、`service/codex_*` | 不做——上游策略是 worldrouter，不走账号池 |
| Rerank 入口 | `relay/rerank_handler.go` | 按需 |

**触发条件**：第一个明确要求 Anthropic SDK 接入的客户出现时，做 `/v1/messages` → OpenAI 格式的转换层（worldrouter 是 OpenAI 兼容的，所以只需要协议转换，不需要新上游适配器）。

---

## 6. 订阅制 — ❌ 缺失，暂缓

new-api 2026-02 起建了全套：套餐 CRUD、按网关分实现的购买（Stripe/E-Pay/Creem/Pancake/余额）、配额周期重置任务（`controller/subscription*.go`、`model/subscription.go`、`service/subscription_reset_task.go`）。

我们完全没有。**维持旧结论：充值模式跑稳、有客户明确要包月之前不做。** 真要做时注意它依赖 §4 的资金来源抽象（余额额度 vs 订阅额度分账）。

---

## 7. 渠道管理 — ✅ 当前模型下够用

我们已有：channel CRUD、单/批量测试、权重+优先级负载均衡、自动禁用阈值、余额同步（`controller/channel.go`、`channel-test.go`、`channel-billing.go`）。

new-api 多出来的能力，在"worldrouter 单渠道"模型下大多无意义：

| 能力 | 评估 |
|---|---|
| 渠道亲和性缓存、智能渠道选择 | 不做——单渠道无可选 |
| 上游模型定时同步 + 缺失模型可视化 | **半个缺口**——形式上是渠道功能，实际解决"上游加了新模型我们要手动跟"的运营痛点，和 §4 的价格同步是同一件事 |
| 参数覆盖引擎（可视化规则/通配/头透传） | 现阶段 model_mapping + system_prompt 够用 |
| 多 key 模式 / request_header key 透传 | 不做 |
| 模型/厂商元数据（vendor_meta、model_meta） | 前端模型库要展示厂商图标/描述时再说，纯展示层 |

---

## 8. 运营 / 增长 — ⚠️ 核心有了，剩余低优先

| 能力 | new-api | 我们 | 评估 |
|---|---|---|---|
| 签到送额度 | ✅ | ✅ `model/checkin.go`（含连签） | 对齐 |
| 邀请/分销 aff | ✅ | ✅ aff_code + 三方奖励配置 | 对齐 |
| 消费日志/统计 | ✅ | ✅ `model/log.go` + stat 接口 | 对齐 |
| 公告 / 用户协议 / 关于页接口 | ✅ | ⚠️ 后端无独立公告接口 | 白标客户可能要，小活 |
| 模型排行榜 + 性能指标采集 | ✅（2026-05） | ❌ | 不急；公开 status 页有营销价值时再做 |
| Uptime Kuma 集成 | ✅ | ❌ | 不做，监控走部署层 |
| Setup 首启向导 | ✅ | ❌（env 配置） | **白标场景反而有价值**——每开一个客户部署都要初始化 root 密码/SMTP/支付配置，向导能降交付成本；也可以用部署脚本替代 |

---

## 9. 基础设施 — ⚠️ 按需补

| 能力 | new-api | 我们 | 评估 |
|---|---|---|---|
| setting 注册表（struct + 反射 + `_old.go` 渐进迁移） | ✅ 全量迁完 | ⚠️ 基建已建（`setting/config/`，PR #20），已迁 checkin/google/passkey，`common/config/config.go` 仍剩 ~100 个 flat var | 按既定节奏继续；**新配置一律走 registry，禁止再加 flat var**；另有已知并发问题（LoadFromDB 与读者竞争）需独立 phase 处理 |
| 用户通知（额度预警，邮件/webhook）+ 限频 | ✅ `service/user_notify.go` | ❌ | **值得做**——付费用户余额耗尽无感知会直接变成客诉 |
| 通用 webhook 服务 | ✅ `service/webhook.go` | ❌ | 随通知一起评估 |
| 敏感词过滤（含 key 脱敏） | ✅ `service/sensitive.go` | ❌ | 国内合规需求出现时做 |
| 系统过载保护（资源超阈值拒新请求） | ✅（2026-02） | ❌ | 单实例规模暂不需要，Fly 扩容优先 |
| 后端 i18n | ✅（2026-02） | ❌（前端有 i18next） | 错误信息要双语时再说 |
| 混合缓存（内存+Redis） | ✅ `pkg/cachex/` | ⚠️ one-api 原生缓存 | 性能瓶颈出现前不动 |
| 日志 upstream request id 追踪 | ✅（2026-05，需 DDL） | ❌ | 排障值，做视频任务时顺手考虑 |

---

## 10. 明确不做清单（防止反复重新评估）

| 项 | 理由 | 最后评估 |
|---|---|---|
| 30+ 上游适配器维护 | worldrouter 聚合层替我们做了 | 2026-06-11 |
| OAuth/OIDC 多 provider 注册表、自定义 OAuth | 一客一部署一 IdP；singleton 已覆盖；曾试验后关闭（PR #25） | 2026-06-06 |
| 渠道亲和性 / 智能渠道选择 | 单渠道模型无可选 | 2026-06-11 |
| Codex 账号渠道 | 上游策略不走账号池 | 2026-06-11 |
| Midjourney / Suno | 不在产品方向 | 2026-06-11 |
| Creem / Waffo 系支付网关 | 三通道已覆盖 | 2026-06-11 |
| 违规罚款计费 | 无对应上游 | 2026-06-11 |
| Electron 桌面端 / 双前端切换 | 不在产品方向 | 2026-06-11 |

重新打开任一项的条件：出现具体客户需求或业务模型变化（如转公开多租户 SaaS），且在本表记录新结论。

---

## 11. 缺口优先级汇总

| 序 | 缺口 | 域 | 触发条件 |
|---|---|---|---|
| 1 | **异步任务框架 + 任务计费** | §3 | 充值→用量闭环验证通过后立即启动（视频里程碑前置） |
| 2 | **Seedance / Kling / Sora 视频适配器** | §3 | 任务框架合入后逐个上 |
| 3 | 缓存计费（cache ratio） | §4 | 确认 worldrouter 计价含缓存折扣后 |
| 4 | 用户额度预警通知 | §9 | 有付费客户即有需求，独立小 PR |
| 5 | 敏感操作通用二次验证 | §2 | 安全加固批次 |
| 6 | 上游模型/价格同步 | §4/§7 | 确认 worldrouter 是否暴露 pricing/models endpoint |
| 7 | `/v1/messages` Claude 协议入口 | §5 | 第一个 Anthropic SDK 客户出现时 |
| 8 | 公告接口 / Setup 向导 | §8 | 白标交付流程标准化时 |
| 9 | 订阅制 | §6 | 客户明确要包月 + 充值已稳定运行 |

---

> 维护：业务模型或里程碑变化时全文复查；单项能力落地后更新对应表格并在 §10/§11 标注 PR 号。
> new-api 侧信息快照于 2026-06-10（v1.0.0-rc.10 前后），半年后引用前建议重新核对。
