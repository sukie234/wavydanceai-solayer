# 沙箱充值联调指南 — Stripe / 易支付 / NOWPayments

> 目标：本机跑通 P0 三个支付通道的**真实下单 → 回调 → 入账 → 幂等**闭环。
> 适用环境：本机 macOS / Linux，`make up` 启动本地栈。

---

## 0. 前置条件

- 仓库代码已是 P0 完成版（`go test ./model/ ./controller/` 全过）
- `.env` 已从 `.env.example` 复制，至少填了 `SESSION_SECRET` 和 `INITIAL_ROOT_PASSWORD`
- 本地栈可启动：`make up` → server 监听 `http://localhost:3000`
- 一个 user 账号（root 之外的普通用户更接近真实场景）+ 一个 user access token

### 拿到 user access token

```bash
# 用网页登录后台，进入 "Tokens"，新建一个 token，复制 sk-xxxx
# 或者直接用 root 测，admin 也可以 topup
```

### 全局打开支付（必做，否则所有 /topup/* 返 "payments disabled"）

后台 Admin → System Settings → Options，至少把 `PaymentEnabled` 改成 `true`。或者用 root API：
```bash
TOKEN="sk-你的 root token"
BASE=http://localhost:3000

curl -X PUT $BASE/api/option/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key":"PaymentEnabled","value":"true"}'

curl -X PUT $BASE/api/option/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key":"PaymentCallbackBaseURL","value":"http://localhost:3000"}'

curl -X PUT $BASE/api/option/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key":"PaymentReturnURL","value":"http://localhost:3000/topup-result"}'
```

---

## 1. Stripe Sandbox（最推荐先跑）

### 1.1 准备

1. 装 Stripe CLI（如已有跳过）
   ```bash
   brew install stripe/stripe-cli/stripe
   ```
2. 登录到你的 sandbox
   ```bash
   stripe login
   # 浏览器选中你那个 sandbox（不是真生产）
   ```
3. 在 Stripe Dashboard 复制 sandbox 的 **secret key**：
   - 左下角切到对应 Sandbox
   - Developers → API keys → 复制 `sk_test_xxxxx`

### 1.2 启动 webhook 转发（**保持窗口开着**）

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```
输出里有一行：
```
Your webhook signing secret is whsec_xxxxxxxxxxxx (^C to quit)
```
**复制这个 `whsec_...`**。

### 1.3 配 `.env`

```bash
STRIPE_API_SECRET_KEY=sk_test_刚才复制的
STRIPE_WEBHOOK_SECRET=whsec_CLI输出的
STRIPE_CURRENCY=usd
```

### 1.4 重启 server

```bash
make restart
make logs   # 另开窗口跟日志
```

### 1.5 打开 Stripe 开关

```bash
curl -X PUT $BASE/api/option/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key":"StripeEnabled","value":"true"}'
```

### 1.6 自检

```bash
curl $BASE/api/user/topup/info -H "Authorization: Bearer $TOKEN"
# 期望 data.stripe_enabled = true
```

### 1.7 真实下单

用普通用户 token（不是 root token，topup 要在 selfRoute）：

```bash
USER_TOKEN="sk-普通用户token"

curl -X POST $BASE/api/user/topup/stripe \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"money": 200}'
# {"success":true,"data":{"trade_no":"...","pay_url":"https://checkout.stripe.com/c/pay/cs_test_..."}}
```

复制 `pay_url`，浏览器打开。

### 1.8 完成支付

- Email：随意
- Card：`4242 4242 4242 4242`
- MM/YY：随便未来日期，如 `12/30`
- CVC：`123`
- ZIP：随意（如 `12345`）
- 点 Pay

### 1.9 观察事件链（应该都看到）

1. **Stripe CLI 窗口**：`checkout.session.completed [200]`
2. **`make logs` 窗口**：
   ```
   record log: ... 通过 stripe 充值 2.00 usd → $0.002000 额度
   ```
3. **DB**：
   ```bash
   make db-shell
   # 在 psql 里
   SELECT trade_no, status, money, completed_at FROM topups ORDER BY id DESC LIMIT 1;
   # status='success'
   SELECT id, username, quota FROM users WHERE id=<你的user id>;
   # quota 已增加
   ```
4. **HTTP**：浏览器自动跳到 `PaymentReturnURL?trade_no=xxx`

### 1.10 幂等校验（**关键测试**）

```bash
# 找出刚才的 event id
stripe events list --limit 1
# 复制 evt_xxx，重发一次
stripe events resend evt_xxx
```

期望：
- Stripe CLI 仍返 200
- `make logs` 出现 `stripe duplicate callback for trade_no=... (idempotent)`
- 用户 quota **没有再涨**
- DB 里 topups 行不变（已经 success）

### 1.11 取消/过期场景（可选）

发起一个 session 但不付款，等过期，或：
```bash
stripe trigger checkout.session.expired
```
对应 topups 行 status='failed'。

---

## 2. 易支付（沙箱较少，用 mock 模拟即可）

> 大部分 彩虹易支付/虎皮椒 提供商没有公开沙箱。本地验证用我们提供的本地脚本模拟一次 notify 即可。

### 2.1 配 `.env`

```bash
EPAY_ID=mock-pid
EPAY_KEY=mock-secret-key-for-local-testing
EPAY_URL=https://example.test/submit.php
EPAY_DEFAULT_METHOD=alipay
```

`EpayUrl` 可以是任意 URL；下单返回的跳转 URL 不会真的访问到。

### 2.2 重启 + 启 EPay 开关

```bash
make restart

curl -X PUT $BASE/api/option/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key":"EpayEnabled","value":"true"}'
```

### 2.3 下单（拿到 trade_no）

```bash
RESP=$(curl -s -X POST $BASE/api/user/topup/epay \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"money": 1000, "pay_method": "alipay"}')
echo $RESP
# 复制 trade_no
TRADE_NO=$(echo $RESP | jq -r .data.trade_no)
echo $TRADE_NO
```

### 2.4 模拟 notify（用 python 算签名）

```bash
# 把这段保存到 /tmp/epay_notify.py
cat > /tmp/epay_notify.py <<'PY'
import hashlib, sys, urllib.parse, urllib.request
trade_no = sys.argv[1]
key = "mock-secret-key-for-local-testing"
params = {
    "pid": "mock-pid",
    "out_trade_no": trade_no,
    "trade_no": "gw-mock-" + trade_no[:8],
    "type": "alipay",
    "money": "10.00",
    "trade_status": "TRADE_SUCCESS",
}
items = sorted((k, v) for k, v in params.items() if v != "")
joined = "&".join(f"{k}={v}" for k, v in items) + key
sig = hashlib.md5(joined.encode()).hexdigest()
params["sign"] = sig
params["sign_type"] = "MD5"
url = "http://localhost:3000/api/epay/notify?" + urllib.parse.urlencode(params)
print("GET", url)
resp = urllib.request.urlopen(url).read().decode()
print("body:", resp)
PY

python3 /tmp/epay_notify.py $TRADE_NO
# 期望: body: success
```

### 2.5 验证

- `make logs`：`通过 epay 充值 10.00 CNY → ... 额度`
- DB topups：status='success'
- 用户 quota 增加

### 2.6 幂等

再跑一次 `python3 /tmp/epay_notify.py $TRADE_NO` → body 仍是 `success`，但 log 出现 `epay duplicate callback ... (idempotent)`，quota 不变。

---

## 3. NOWPayments Sandbox（加密支付）

### 3.1 注册沙箱

1. 去 https://account-sandbox.nowpayments.io/ 注册 sandbox 账号（独立于主站）
2. Dashboard → Settings → API key → 复制
3. Dashboard → Settings → IPN settings → Webhook URL 先空着（我们后面填）→ Generate "IPN secret" → 复制

### 3.2 公网暴露 webhook（用 ngrok）

```bash
brew install ngrok
ngrok http 3000
# 拿到一个 https://xxx.ngrok-free.app
```

### 3.3 配 `.env`

```bash
NOWPAYMENTS_API_KEY=刚才复制的 sandbox API key
NOWPAYMENTS_IPN_SECRET=刚才复制的 IPN secret
NOWPAYMENTS_BASE_CURRENCY=usd
NOWPAYMENTS_SANDBOX=true
```

`PaymentCallbackBaseURL` 改成 ngrok 域名：
```bash
curl -X PUT $BASE/api/option/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key":"PaymentCallbackBaseURL","value":"https://xxx.ngrok-free.app"}'
```

### 3.4 打开 NOWPayments adapter

```bash
curl -X PUT $BASE/api/option/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key":"CryptoAdaptersEnabled","value":"nowpayments"}'
```

### 3.5 在 NOWPayments dashboard 填 IPN URL

填：
```
https://xxx.ngrok-free.app/api/crypto/webhook/nowpayments
```

### 3.6 重启 + 下单

```bash
make restart

curl -X POST $BASE/api/user/topup/crypto/nowpayments \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"money": 200}'
# {"data":{"trade_no":"...","pay_url":"https://sandbox.nowpayments.io/payment/..."}}
```

### 3.7 完成沙箱支付

打开 `pay_url`，按 sandbox 页面提示完成（沙箱可以模拟付款，无需真打币）。

### 3.8 观察

- ngrok 终端：`POST /api/crypto/webhook/nowpayments 200`
- `make logs`：`通过 crypto:nowpayments 充值 2.00 USD → ...`
- DB topups: status='success'
- quota 增加

### 3.9 幂等

NOWPayments dashboard → Payment History → 重发 IPN，验证 log 出现 `crypto duplicate callback [nowpayments]`。

---

## 4. 故障排查

| 现象 | 可能原因 | 排查 |
|---|---|---|
| 下单返 `payments disabled` | `PaymentEnabled` 没开 | `curl $BASE/api/user/topup/info` 看 stripe_enabled 等 |
| 下单返 `stripe disabled or not configured` | env 没设 / option 没开 | 检查 `STRIPE_API_SECRET_KEY` 是否生效，重启 |
| Stripe webhook 收到 400 | `STRIPE_WEBHOOK_SECRET` 错配 | 看 `make logs` 里 `webhook signature` 错误，对照 stripe listen 输出 |
| Stripe webhook 收到 200 但 quota 没增 | `PaymentStatus != paid` (异步) | `make logs` 看 raw payload；async 银行转账要等 `checkout.session.async_payment_succeeded` |
| 易支付 notify 返 `fail` | 签名 / 金额不符 | log 里 `epay signature mismatch` 或 `paid amount < expected` |
| 加密 webhook 400 `signature mismatch` | IPN secret 错 / body 在 nginx 处被改 | 确保 webhook 路径不被 proxy 改 body；secret 复制完整无空格 |
| 同一笔被扣两次 | **不可能**（CompleteTopup 幂等） | 如果真出现，是 bug — 提 issue |

---

## 5. 上线前 checklist

- [ ] 三通道在 staging 都跑过真实小额（Stripe $1 / 易支付 0.01 元 / Crypto 1 USDT）
- [ ] 所有 `STRIPE_*` / `EPAY_*` / `NOWPAYMENTS_*` 已从 staging key 换成 production key
- [ ] `PaymentCallbackBaseURL` 指向**公网 HTTPS**，不是 ngrok / localhost
- [ ] `SESSION_COOKIE_SECURE=true`（CLAUDE.md 要求）
- [ ] root 默认密码已改
- [ ] Stripe / NOWPayments dashboard 的 webhook endpoint 已注册到生产域名
- [ ] 监控：观察 24h 内有没有 stuck-in-pending 订单（应该没有）

---

## 6. 当下做 G 的最小步骤（懒人版）

```bash
# 1. 一窗口跑 Stripe CLI
stripe listen --forward-to localhost:3000/api/stripe/webhook
# 复制 whsec_xxx

# 2. 配 .env
echo "STRIPE_API_SECRET_KEY=sk_test_..." >> .env
echo "STRIPE_WEBHOOK_SECRET=whsec_..." >> .env
echo "STRIPE_CURRENCY=usd" >> .env

# 3. 重启 + 开关
make restart
ROOT=sk-root-token
curl -X PUT http://localhost:3000/api/option/ -H "Authorization: Bearer $ROOT" \
  -H "Content-Type: application/json" -d '{"key":"PaymentEnabled","value":"true"}'
curl -X PUT http://localhost:3000/api/option/ -H "Authorization: Bearer $ROOT" \
  -H "Content-Type: application/json" -d '{"key":"StripeEnabled","value":"true"}'
curl -X PUT http://localhost:3000/api/option/ -H "Authorization: Bearer $ROOT" \
  -H "Content-Type: application/json" -d '{"key":"PaymentReturnURL","value":"http://localhost:3000/topup-result"}'

# 4. 下单
USER=sk-user-token
curl -X POST http://localhost:3000/api/user/topup/stripe \
  -H "Authorization: Bearer $USER" -H "Content-Type: application/json" \
  -d '{"money": 200}'

# 5. 打开返回的 pay_url，4242 4242 4242 4242 付款

# 6. 验证
make logs | grep -i stripe
```

跑通了告诉我，下一步上 H（前端集成）或 I（P1 安全）。

---

*最后更新：2026-06-05*
