# 如何新增一个加密支付 Adapter（内部开发指南）

> 受众：本团队工程师
> 场景：来了一个新白标客户（加密商），需要接入他们的支付方式（hosted 网关 / 商户卡 API / 链上直收）
> 目标：**1 个 Go 文件 + 1 个 PR + 同一个镜像可热启用**

---

## 选型决策树

```
新加密商需要接入？
│
├── 他们有 hosted 商户 API（下单返 URL + 回调 webhook）?
│   └── 是 → 选 HostedCryptoAdapter ✅ MVP 唯一支持
│         例：CryptoMus / NOWPayments / Solayer U-Card
│
└── 需要链上直收（生成专属地址 + 监听 + 确认数）?
    └── 是 → 选 OnChainCryptoAdapter ⚠️ 接口已留，watcher 尚未实现
          例：Sui native / 自建 USDT-TRC20
```

如果是 OnChain 类型，请先开 issue 讨论 watcher 实现方案（不在 MVP）。

---

## HostedCryptoAdapter 接入步骤

### 1. 复制模板

```bash
cp service/payment/crypto/adapters/_template.go \
   service/payment/crypto/adapters/<vendor_name>.go
```

`<vendor_name>` 要求：小写、下划线、和路由 path 一致（会出现在 URL 里），例如 `solayer_ucard`。

### 2. 实现 `HostedCryptoAdapter` 接口

```go
// service/payment/crypto/adapters/solayer_ucard.go
package adapters

import (
    "context"
    "github.com/gin-gonic/gin"
    "github.com/songquanpeng/one-api/model"
    "github.com/songquanpeng/one-api/service/payment"
    "github.com/songquanpeng/one-api/service/payment/crypto"
)

type SolayerUCardAdapter struct{}

func (a *SolayerUCardAdapter) Name() string         { return "solayer_ucard" }
func (a *SolayerUCardAdapter) DisplayName() string  { return "Solayer U-Card" }
func (a *SolayerUCardAdapter) SupportedAssets() []string {
    return []string{"sUSD", "USDC-SOL"}
}

func (a *SolayerUCardAdapter) DeclaredConfigKeys() []crypto.ConfigKey {
    return []crypto.ConfigKey{
        {Key: "SolayerMerchantId",   Sensitive: false, Required: true},
        {Key: "SolayerApiSecret",    Sensitive: true,  Required: true},
        {Key: "SolayerWebhookSecret",Sensitive: true,  Required: true},
    }
}

func (a *SolayerUCardAdapter) IsEnabled() bool {
    return crypto.IsAdapterEnabled(a.Name())
}

func (a *SolayerUCardAdapter) CreateOrder(
    ctx context.Context, order *model.Topup,
) (payURL string, err error) {
    // 1. 用 SolayerApiSecret 调对方下单 API
    // 2. 把对方返的 invoice id 存到 order.GatewayTradeNo (可选，回调时也能映射)
    // 3. 返回 payURL（用户跳转付款）
    panic("TODO: implement")
}

func (a *SolayerUCardAdapter) HandleWebhook(
    c *gin.Context,
) (*payment.CallbackResult, error) {
    // 1. 验签：HMAC / 公钥 / 签名头 — 按对方文档
    // 2. 解析 body 拿到我们的 trade_no、paid amount、status
    // 3. 构造 CallbackResult 返回（不要在这里直接改库，backbone 会处理）
    panic("TODO: implement")
}

func init() {
    crypto.Register(&SolayerUCardAdapter{})
}
```

### 3. 验证清单

- [ ] `Name()` 返回值在所有 adapter 里唯一（registry 用它做 key）
- [ ] `DeclaredConfigKeys()` 列出**所有**对方要的配置项；敏感字段标 `Sensitive: true`（不会被 `/api/option/` 回显）
- [ ] `CreateOrder` 把对方下单 API 的 invoice/order ID 写进 `order.GatewayTradeNo`（用于回调反查）
- [ ] `HandleWebhook` **必须**先验签，再读 body
- [ ] `HandleWebhook` **绝不**自己改 user.quota 或 topup.status —— 只返 `CallbackResult`，由 `controller.CryptoWebhook` 调用统一的 `model.CompleteTopup` 入账
- [ ] `init()` 注册自己

### 4. 启用（运维）

在 admin 后台 / option 表：

```
CryptoAdaptersEnabled = ["solayer_ucard"]
SolayerMerchantId    = "xxxx"
SolayerApiSecret     = "xxxx"
SolayerWebhookSecret = "xxxx"
```

### 5. 对方需要的 webhook URL

告诉客户填到他们 dashboard：

```
https://<deployment>/api/crypto/webhook/solayer_ucard
```

### 6. 测试

- 用 staging 环境
- 客户提供 sandbox key
- 跑一笔最小金额真实下单 → 回调 → 检查：
  - `topup.status = 'success'`
  - `user.quota` 增加正确额度
  - 重复回调相同 `trade_no` 不会重复加额度（幂等）
  - 金额少付被拒绝
- 然后切生产 key

---

## OnChainCryptoAdapter（接口预留，**MVP 不支持**）

如果客户需要链上直收：

1. 先开 issue：评估 watcher 实现（共用 goroutine pool / 每 chain 一个 / 用对方 RPC）
2. 接口签名：
   ```go
   type OnChainCryptoAdapter interface {
       CryptoAdapter
       GenerateDepositAddress(ctx, order) (addr, memo string, err error)
       PollConfirmations(ctx, order) (*payment.CallbackResult, error)
   }
   ```
3. 入账依然走 `model.CompleteTopup`（接口统一）

**P0 阶段，OnChain 客户：暂建议用 hosted 第三方（如 CryptoMus、Triangle）作为过渡。**

---

## 反模式（不要这么写）

| ❌ | ✅ |
|---|---|
| 在 adapter 里 `DB.Update(user)...` | 只返回 `CallbackResult`，让 `CompleteTopup` 改库 |
| 把 secret 写死在代码里 | 用 `DeclaredConfigKeys` + option 表 + env |
| `if status == "ok" { ... } else { ... }` 大量分支判断 | adapter 只负责验签+解析；状态机由 backbone |
| 验签失败时返回 200 | 验签失败必须返非 200，让网关重试 |
| `float64` 算金额 | 全部用 `int64` cents / quota |
| 自己生成 `trade_no` | `trade_no` 由 backbone 创建 pending 订单时生成，传给 adapter |
| 在 webhook handler 里阻塞调外部 API 几秒 | 验签 + 入账之外的事（通知、邮件）走 goroutine |

---

## FAQ

**Q：客户希望前端按钮显示自己 logo / 名字？**
A：`DisplayName()` 控制按钮文字。Logo 走静态资源 + 前端按 `Name()` 选图。MVP 用文字即可。

**Q：一个客户同时支持多链多币？**
A：一个 adapter 只对接一家服务（CryptoMus 一家就支持 30 多币）。如果客户有两家不同的加密服务，写两个 adapter。

**Q：如何下线某个 adapter？**
A：从 `CryptoAdaptersEnabled` 数组移除即可，不需重新部署。文件留着供以后启用。

**Q：trade_no 撞了怎么办？**
A：不会。`trade_no` 是 uuid v4，DB 上唯一索引。

**Q：客户改了 webhook secret，我们要重启吗？**
A：不用。option 通过 hot reload 读取（参考现有 SMTP / GitHub OAuth 配置的做法）。

---

*最后更新：2026-06-05*
