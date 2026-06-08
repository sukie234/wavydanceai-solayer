# P0 商业化充值 — 执行计划

> 目标：跑通 **Stripe / 易支付 (E-Pay，含支付宝/微信) / 加密支付基座** 三通道的在线充值闭环。
> 共用一套 backbone：订单表 + 统一回调入账 + 幂等 + 管理后台。
> 三通道实现为 backbone 上的薄 adapter。
>
> ## 业务上下文（影响所有设计决策）
>
> 本项目是 **白标 SaaS**：
> - 每个客户（含每家加密商）= **独立部署实例**（自己的品牌、自己的域名）
> - 平台 + 上游大模型 API key + 客制 adapter + 持续维护 都由本团队交付
> - 加密支付不是"接一家用一家"，而是"**adapter 基座 + 按客户写 adapter**"
>   - 一家加密商 = 一个 Go adapter 文件 + 1 个 PR + 镜像复用
>   - 运行时通过 option 启用 / 关闭 / 填 key —— **不**重新构建镜像
> - 典型部署：**单实例启用 1 个加密 adapter**（该客户自己的），接口允许 N 个但运营上通常只开一个
>
> 后续白标会扩展到 brand（logo / 名称 / 主题）、上游 channel 预配、用户协议替换等 —— **不在 P0 内**，但接口预留。

---

## 0. 架构总览

```
                    ┌─────────────────────────────────────────┐
                    │            controller/topup.go          │
                    │  下单 / 回调 / 查订单 / 管理员补单       │
                    └────────────┬────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │ service/payment/Gateway │  ← interface
                    └────────────┬────────────┘
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
       ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
       │ stripe.go    │   │ epay.go      │   │ crypto.go    │
       └──────────────┘   └──────────────┘   └──────────────┘

                    ┌────────────────────────┐
                    │     model/topup.go     │  ← 订单表 + 幂等入账
                    └────────────────────────┘
```

**核心抽象 `Gateway` 接口**（`service/payment/gateway.go`）：

```go
type Gateway interface {
    Name() string
    // 下单：返回跳转 URL / Checkout Session URL / Invoice URL
    CreateOrder(ctx context.Context, order *model.Topup, returnURL, notifyURL string) (payURL string, err error)
    // 回调验签 + 解析订单号 + 状态
    HandleCallback(c *gin.Context) (*CallbackResult, error)
}

type CallbackResult struct {
    TradeNo    string  // 我们的内部订单号
    GatewayTradeNo string // 第三方流水号
    Status     string  // "success" | "failed" | "pending" | "refunded"
    PaidAmount int64   // 实付金额（分；加密支付用 USDT 时折算成 USD 分）
    RawPayload string  // 原始回调 body，存档
}
```

**入账幂等流程**（`model/topup.go` 的 `CompleteOrder`，所有 adapter 共用）：
1. 事务 + `FOR UPDATE` 锁订单
2. 若 `status != 'pending'` → 直接返回成功（幂等）
3. 校验 `paid_amount >= order.money * 100`（防少付）
4. `UPDATE topup SET status='success', completed_at=NOW(), gateway_trade_no=?, callback_payload=?`
5. `UPDATE user SET quota = quota + ?`
6. `RecordLog(LogTypeTopup, "通过 {gateway} 充值 X 元 → Y quota")`
7. 任意失败 → 回滚 + 向网关返回非 200（让其重试）

---

## 1. 数据模型

### 1.1 新表 `topup`

```go
// model/topup.go
type Topup struct {
    Id              int    `json:"id"`
    UserId          int    `json:"user_id" gorm:"index"`
    TradeNo         string `json:"trade_no" gorm:"type:varchar(64);uniqueIndex"`         // 我们的订单号 (uuid)
    GatewayTradeNo  string `json:"gateway_trade_no" gorm:"type:varchar(128);index"`     // 第三方流水号
    Gateway         string `json:"gateway" gorm:"type:varchar(32);index"`               // stripe / epay / crypto
    PayMethod       string `json:"pay_method" gorm:"type:varchar(32)"`                  // alipay / wxpay / card / usdt-trc20...
    Money           int64  `json:"money" gorm:"bigint"`                                 // 用户支付金额（分，CNY 或 USD 看 Currency）
    Currency        string `json:"currency" gorm:"type:varchar(8);default:'CNY'"`
    Quota           int64  `json:"quota" gorm:"bigint"`                                 // 充值额度
    Status          string `json:"status" gorm:"type:varchar(16);default:'pending';index"` // pending/success/failed/refunded
    CallbackPayload string `json:"-" gorm:"type:text"`
    CreatedAt       int64  `json:"created_at" gorm:"bigint;index"`
    CompletedAt    int64  `json:"completed_at" gorm:"bigint"`
}
```

加 `AutoMigrate(&Topup{})` 到 `model/main.go` 的 `InitDB`。

### 1.2 必要的查询方法

- `CreatePendingTopup(...)` — 下单时建 pending 行
- `GetTopupByTradeNo(tradeNo)`
- `CompleteTopup(tradeNo, gatewayTradeNo, paidAmount, payload)` — **幂等入账**
- `FailTopup(tradeNo, reason)`
- `ListUserTopups(userId, offset, limit)`
- `AdminListTopups(filters)` — 按 user / status / gateway / 时间过滤
- `AdminMarkTopupSuccess(tradeNo, operator, note)` — 手动补单

---

## 2. 配置 (Option) 与环境变量

### 2.1 全局开关 / 通用配置（写入 `option` 表，管理员可热改）

```
PaymentEnabled                bool     // 总开关
PaymentCurrency               string   // "CNY" | "USD"
TopupAmountOptions            string   // JSON: [{"money":10,"quota":1000000}, ...]
TopupMinMoney                 float64  // 最低金额
PaymentReturnURL              string   // 支付完成回跳前端 URL
PaymentCallbackBaseURL        string   // 我们后端被回调的公网基础 URL（必填）
PaymentGroupRatio             string   // JSON: 用户组优惠比例
```

### 2.2 Stripe（环境变量优先，敏感不入库）

```bash
STRIPE_API_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_CURRENCY=usd                # 或 cny
# 可选：固定价格模式 vs 动态金额
STRIPE_USE_PRICE_IDS=false
```

### 2.3 易支付（彩虹/虎皮椒/码支付兼容协议）

option 表（管理员配置）：
```
EpayId
EpayKey               (HMAC 密钥，不要日志打印)
EpayUrl               // 例如 https://pay.example.com/submit.php
EpayApiUrl            // 例如 https://pay.example.com/mapi.php (可选，查单)
EpayEnabledMethods    // JSON: ["alipay","wxpay","qqpay"]
```

### 2.4 加密支付 — Adapter 基座

> 这是和 Stripe/E-Pay 设计**最大的差异**：加密支付**不是单一 adapter**，是一个**注册式基座**，
> 让团队按客户需求快速增加新的加密 adapter。详细接入指南见 `docs/HOW_TO_ADD_CRYPTO_ADAPTER.md`。

#### 2.4.1 设计原则

1. **注册式插件**：每个 adapter 一个 Go 文件 + `init()` 自注册到 registry
2. **统一 webhook 路由**：`POST /api/crypto/webhook/:adapter` 按 adapter 名分发
3. **统一下单路由**：`POST /api/user/topup/crypto/:adapter` 按 adapter 名分发
4. **配置自带**：每个 adapter 自己声明需要的 option keys，admin 后台动态渲染表单
5. **运行时启停**：`CryptoAdaptersEnabled = ["nowpayments"]` 这种白名单，热改
6. **两类生命周期**：
   - `HostedCryptoAdapter`（CryptoMus / Solayer U-Card / NOWPayments）— 走 webhook
   - `OnChainCryptoAdapter`（Sui 原生 / 自建 USDT-TRC20 监听）— 走 deposit address + watcher（MVP 仅预留接口，**不实现**）

#### 2.4.2 接口

```go
// service/payment/crypto/adapter.go
type CryptoAdapter interface {
    Name() string                  // "nowpayments" — 路由 path 用这个
    DisplayName() string           // "USDT Pay" — 前端展示
    SupportedAssets() []string     // ["USDT-TRC20","USDT-ERC20","BTC",...]
    DeclaredConfigKeys() []ConfigKey  // 这个 adapter 需要哪些 option / env
    IsEnabled() bool               // 读取配置决定是否暴露给前端
}

type HostedCryptoAdapter interface {
    CryptoAdapter
    CreateOrder(ctx context.Context, order *model.Topup) (payURL string, err error)
    HandleWebhook(c *gin.Context) (*payment.CallbackResult, error)
}

// 预留接口，MVP 不实现
type OnChainCryptoAdapter interface {
    CryptoAdapter
    GenerateDepositAddress(ctx context.Context, order *model.Topup) (addr string, memo string, err error)
    // 由后台 watcher goroutine 调用
    PollConfirmations(ctx context.Context, order *model.Topup) (*payment.CallbackResult, error)
}
```

#### 2.4.3 注册机制

```go
// 每个 adapter 文件末尾：
func init() {
    crypto.Register(&CryptomusAdapter{})
}
```

```go
// service/payment/crypto/registry.go
var registry = map[string]CryptoAdapter{}
func Register(a CryptoAdapter) { registry[a.Name()] = a }
func Get(name string) (CryptoAdapter, bool) { /* ... */ }
func EnabledList() []CryptoAdapter { /* 过滤 IsEnabled() 为 true 的 */ }
```

#### 2.4.4 MVP 默认 adapter

实现 **NOWPayments** 作为白标基础版的默认综合加密支付（2019 年起、爱沙尼亚 VASP 牌照、200+ 币种、HMAC SHA512 webhook）。

参考实现的 env：
```bash
NOWPAYMENTS_API_KEY=xxx               # 下单 API key
NOWPAYMENTS_IPN_SECRET=xxx            # webhook (IPN) HMAC SHA512 密钥
NOWPAYMENTS_BASE_CURRENCY=usd         # 报价币种
NOWPAYMENTS_SANDBOX=false             # 沙箱模式
```

#### 2.4.5 占位（仅文件骨架 + 文档 TODO，**不实现**）

- `service/payment/crypto/adapters/cryptomus.go` — 备选 hosted 服务商，需要更低费率/更多亚洲币种时启用
- `service/payment/crypto/adapters/solayer_ucard.go` — 等 Solayer 商户 API 文档
- `service/payment/crypto/adapters/sui.go` — 等 Sui 接入方案确定（hosted vs on-chain）
- `service/payment/crypto/adapters/_template.go` — 给团队照抄的样板

#### 2.4.6 候选 hosted 服务商（参考实现可换）

| 候选 | 优点 | 缺点 | 备注 |
|---|---|---|---|
| **NOWPayments** ✅ MVP 默认 | 老牌 (2019)、爱沙尼亚 VASP 牌照、200+ 币种、文档完善 | 费率略高 (0.5%)、部分国家受限 | HMAC SHA512 IPN |
| CryptoMus | 费率低 (0.4%)、亚洲方向友好 | 无监管牌照、合规风险 | HMAC SHA256，骨架预留 |
| Coinbase Commerce | 品牌信任度高 | 弱化新商户 | 不推荐 |
| BitPay | 最老牌、美国合规 | KYC 重 | 视客户合规需求 |
| Solayer U-Card | 客户自带、Solana 生态 | 需对方 API 文档 | 待客户提供 |
| Sui native | Sui 生态原生 | 大概率走 on-chain，需 watcher | P1 评估 |
| 自建 TRC20 监听 | 0 手续费 | 节点/监听/汇率自维护 | 不在 MVP |

---

## 3. 路由 (`router/api.go`)

```go
// 公共 (无需登录) — webhook 回调
apiRouter.POST("/stripe/webhook",           controller.StripeWebhook)
apiRouter.POST("/epay/notify",              controller.EpayNotify)
apiRouter.GET ("/epay/notify",              controller.EpayNotify)   // 易支付同步通知
apiRouter.POST("/crypto/webhook/:adapter",  controller.CryptoWebhook) // 加密基座按 :adapter 分发

// 已登录 selfRoute (middleware.UserAuth)
selfRoute.GET ("/topup/info",                  controller.GetTopupInfo)        // 可用金额档位 + 启用 adapter 列表
selfRoute.GET ("/topup/self",                  controller.GetUserTopups)
selfRoute.POST("/topup/amount",                controller.RequestTopupAmount)
selfRoute.POST("/topup/stripe",                middleware.CriticalRateLimit(), controller.RequestStripePay)
selfRoute.POST("/topup/epay",                  middleware.CriticalRateLimit(), controller.RequestEpayPay)
selfRoute.POST("/topup/crypto/:adapter",       middleware.CriticalRateLimit(), controller.RequestCryptoPay)

// 管理员 adminRoute (middleware.AdminAuth)
adminRoute.GET ("/topup",            controller.AdminListTopups)
adminRoute.POST("/topup/complete",   controller.AdminCompleteTopup)   // 补单
```

> `POST /api/topup` (现有 AdminTopUp 直接加额度) 保留，不动。
> `POST /api/user/topup` (现有兑换码) 保留，不动。

---

## 4. 文件清单（新增）

```
controller/
  topup.go                  ← 扩展现有 TopUp（兑换码保留） + GetTopupInfo / GetUserTopups / AdminListTopups / AdminCompleteTopup
  topup_stripe.go           ← RequestStripePay / StripeWebhook
  topup_epay.go             ← RequestEpayPay / EpayNotify
  topup_crypto.go           ← RequestCryptoPay / CryptoWebhook（按 :adapter 分发）
service/
  payment/
    gateway.go              ← Stripe/EPay 的 Gateway 接口
    util.go                 ← trade_no 生成、金额换算、money→quota
    stripe.go               ← Stripe adapter（用 github.com/stripe/stripe-go/v76）
    epay.go                 ← 易支付 adapter（HMAC MD5）
    crypto/
      adapter.go            ← CryptoAdapter / HostedCryptoAdapter / OnChainCryptoAdapter 接口
      registry.go           ← Register / Get / EnabledList
      result.go             ← CallbackResult 类型
      adapters/
        nowpayments.go      ← MVP 默认 adapter（HMAC SHA512 IPN）
        cryptomus.go        ← 占位 + TODO（备选 hosted）
        solayer_ucard.go    ← 占位 + TODO
        sui.go              ← 占位 + TODO
        _template.go        ← 给团队照抄的样板（实现 HostedCryptoAdapter）
model/
  topup.go                  ← 订单表 + 幂等入账 CompleteTopup
common/config/
  config.go                 ← PaymentEnabled / PaymentCallbackBaseURL / CryptoAdaptersEnabled 等
docs/
  P0_TOPUP_EXECUTION_PLAN.md (本文)
  HOW_TO_ADD_CRYPTO_ADAPTER.md (内部接入指南，新增)
```

`go.mod` 新增：
```
github.com/stripe/stripe-go/v76
```
易支付和 CryptoMus 无 SDK，用 `net/http` + `crypto/hmac` 直接做即可。

---

## 5. 实施顺序（每步可独立 commit）

| Step | 内容 | 验收 |
|---|---|---|
| 1 | 加 `model/topup.go` + AutoMigrate + option 字段 + config 字段 | `go build ./...` 通过，启动后表已建 |
| 2 | 加 `service/payment/gateway.go` 接口和 `util.go`（trade_no 等） | 单测：trade_no 唯一性 |
| 3 | 加 `controller/topup.go`：`GetTopupInfo` / `GetUserTopups` / `RequestTopupAmount` / `AdminListTopups` / `AdminCompleteTopup` + 路由 | 手动用 curl 跑通查询、补单 |
| 4 | **Stripe adapter**：`service/payment/stripe.go` + `controller/topup_stripe.go` + 路由 `/topup/stripe` + `/stripe/webhook` | Stripe CLI `stripe trigger checkout.session.completed` 触发回调，订单变 success，quota 入账 |
| 5 | **E-Pay adapter**：`service/payment/epay.go` + `controller/topup_epay.go` + `/topup/epay` + `/epay/notify` | mock 一个易支付沙箱回调，订单成功入账 |
| 6 | **加密基座** (`service/payment/crypto/` 接口 + 注册表) + **NOWPayments 默认实现** + CryptoMus/Solayer/Sui 占位文件 + `controller/topup_crypto.go` + 路由 `/topup/crypto/:adapter` + `/crypto/webhook/:adapter` + `HOW_TO_ADD_CRYPTO_ADAPTER.md` | NOWPayments sandbox 触发 IPN，订单入账；新加密商按指南 1 文件 + 1 PR 接入 |
| 7 | 前端：充值页 + 我的充值记录 + 管理后台订单列表 | 用户能从前端走完整流程 |

---

## 6. 入账幂等 — 黄金法则（务必所有 adapter 都走这个流程）

```go
// model/topup.go
func CompleteTopup(tradeNo string, gatewayTradeNo string, paidAmountCents int64, payload string) (alreadyDone bool, err error) {
    return alreadyDone, DB.Transaction(func(tx *gorm.DB) error {
        var t Topup
        if err := tx.Set("gorm:query_option", "FOR UPDATE").
            Where("trade_no = ?", tradeNo).First(&t).Error; err != nil {
            return err
        }
        if t.Status == "success" {
            alreadyDone = true
            return nil // 幂等：回调重复，直接成功
        }
        if t.Status != "pending" {
            return fmt.Errorf("order in non-actionable status: %s", t.Status)
        }
        if paidAmountCents < t.Money {
            return fmt.Errorf("paid amount %d < expected %d", paidAmountCents, t.Money)
        }
        if err := tx.Model(&User{}).Where("id = ?", t.UserId).
            Update("quota", gorm.Expr("quota + ?", t.Quota)).Error; err != nil {
            return err
        }
        t.Status = "success"
        t.GatewayTradeNo = gatewayTradeNo
        t.CallbackPayload = payload
        t.CompletedAt = time.Now().Unix()
        if err := tx.Save(&t).Error; err != nil {
            return err
        }
        RecordLog(context.Background(), t.UserId, LogTypeTopup,
            fmt.Sprintf("通过 %s 充值 %d %s → %d quota", t.Gateway, t.Money/100, t.Currency, t.Quota))
        return nil
    })
}
```

任何 adapter 的回调 handler 只做三件事：
1. **验签**（Stripe / E-Pay / CryptoMus 各自的方法）
2. **解析** → 拿到 `tradeNo`、`paidAmountCents`、`status`
3. **调 `CompleteTopup`** → 它来管事务和幂等

---

## 7. 安全清单

- [ ] webhook 路径 **不** 走 `UserAuth`，但要套 body size limit
- [ ] webhook **必须** 验签：
  - Stripe: `Stripe-Signature` header → `webhook.ConstructEvent`
  - E-Pay: 字典序参数 + `EpayKey` MD5
  - CryptoMus: body + `CRYPTOMUS_WEBHOOK_API_KEY` HMAC SHA256
- [ ] 任何金额计算只用整数（cents / quota），**禁止 float**
- [ ] `trade_no` 用 uuid.v4 或雪花，**绝不**可预测
- [ ] 服务端复算 `money → quota`，**绝不**信任客户端传的 quota
- [ ] webhook 失败必须返回非 200，让网关重试
- [ ] 密钥从 env 注入；option 表里的 key 字段 **不** 通过 `GetOptions` API 回显
- [ ] 充值历史接口加 `userId` 过滤；管理员接口加 `AdminAuth`
- [ ] 充值流水写入 `log` 表（已有 `LogTypeTopup`）
- [ ] PR 上线前在 staging 用 Stripe test mode + CryptoMus test mode 走通

---

## 8. 测试策略

| 类型 | 工具 | 覆盖点 |
|---|---|---|
| 单测 | go test | `CompleteTopup` 幂等（同一 tradeNo 调 2 次只入账 1 次），少付拒绝，金额换算 |
| 集成 | Stripe CLI / CryptoMus test mode | 真实下单 → 回调 → 入账 |
| 手动 | curl + sqlite | `AdminListTopups`、`AdminCompleteTopup`、`GetUserTopups` |
| 回归 | 现有兑换码 + AdminTopUp | 不能破坏 |

---

## 9. 上线前 checklist

- [ ] 三通道 env / option 都已配置
- [ ] `PaymentCallbackBaseURL` 指向公网 HTTPS 域名
- [ ] Stripe webhook endpoint 已在 dashboard 注册并验证一次
- [ ] CryptoMus webhook endpoint 已在 dashboard 注册
- [ ] 易支付商户后台回调地址已填
- [ ] `SESSION_COOKIE_SECURE=true`（CLAUDE.md 要求）
- [ ] 默认 root 密码已改
- [ ] 至少跑一笔 staging 真实小额（Stripe $1 / 易支付 0.01 / Crypto 1 USDT）
- [ ] 监控：失败回调告警、订单 stuck-in-pending 报表

---

## 10. 不在 P0 内（先记下）

- 退款 / 对账自动化
- 用户组阶梯优惠（先支持固定档位，组优惠后续）
- 订阅 / 续费
- 发票 / 报税
- 多币种汇率自动更新
- **`OnChainCryptoAdapter` 的 watcher 实现**（接口先留，Sui / 自建 TRC20 监听后续做）
- **白标其它维度**（品牌 logo/名称/主题、上游 channel 模板、用户协议替换、登录页定制） — P1+ 评估

---

*维护：每完成一步在 §5 表格里勾选 + 写入 commit hash。*
*创建日期：2026-06-05*
