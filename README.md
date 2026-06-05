<p align="center">
  <a href="https://wavydance.ai">
    <img src="web/wavy/public/logo-mark.svg" width="120" height="120" alt="wavydance.ai">
  </a>
</p>

<h1 align="center">wavydance.ai</h1>

<p align="center">
  <strong>One Wave. Every Model.</strong><br/>
  The unified gateway to every LLM API — one endpoint, one key, one bill.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-PolyForm%20NC%201.0.0-7c3aed.svg" alt="License: PolyForm Noncommercial 1.0.0"></a>
  <a href="https://wavydance.ai"><img src="https://img.shields.io/badge/website-wavydance.ai-3FB3D9.svg" alt="Website"></a>
  <img src="https://img.shields.io/badge/go-%3E%3D1.21-00ADD8.svg" alt="Go">
  <img src="https://img.shields.io/badge/status-active-22c55e.svg" alt="Status">
</p>

<p align="center">
  <a href="#what-is-wavydanceai">What</a> ·
  <a href="#features">Features</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#api">API</a> ·
  <a href="#self-hosting">Self-hosting</a> ·
  <a href="#license">License</a> ·
  <a href="#commercial-use">Commercial use</a>
</p>

---

## What is wavydance.ai

**Wavydance.ai is a self-hostable LLM gateway** that puts **200+ models from every major provider** behind a single OpenAI-compatible endpoint. Point your existing SDK at one base URL, switch providers by changing the model string, and pay one consolidated bill — across GPT, Claude, Gemini, DeepSeek, Qwen, and the long tail.

For image and video models, a unified **async task API** gives you consistent parameters across providers, with results delivered by webhook push or polling.

The whole system ships as a **single Go binary** with an embedded React console — drop it on a VPS, point a domain at it, and you have a production LLM router.

## Features

- **One endpoint, every model** — 200+ models behind a single OpenAI-compatible base URL
- **Drop-in for chat & vision** — change one line in your existing OpenAI SDK code, switch providers by model string
- **Unified async task API** for image and video — same parameters across providers, webhook or polling
- **Smart routing & failover** — latency-aware routing detects upstream failures and retries on the next-best provider, transparently
- **Token-grained billing** — pay-as-you-go per token (or per generation for media), aggregated into one bill across all providers; built-in budgets and alerts
- **Cost analytics** — per-model breakdown, request volume, quota consumption over trailing windows
- **Multi-tenant API keys** — issue scoped keys per client, rotate or disable instantly
- **Zero-log mode** for enterprise — only token metadata retained, no prompt/response storage
- **Self-hostable** — single Go binary, Docker image, SQLite or MySQL/Postgres
- **Polished admin console** — bilingual (EN / 中文), light + dark themes, built on a modern React + Tailwind stack

## Quick start

### Docker

```bash
docker run -d \
  --name wavydance \
  -p 3000:3000 \
  -e INITIAL_ROOT_PASSWORD=change-me-please \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  -e SESSION_COOKIE_SECURE=true \
  -v $PWD/data:/data \
  ghcr.io/jimmyhu213/wavydanceai:latest
```

Open `http://localhost:3000`, sign in with `root` and the password you set, then add your first upstream channel.

### Binary

Download the release for your platform from [Releases](https://github.com/JimmyHu213/wavydanceai/releases), then:

```bash
./wavydanceai --port 3000 --log-dir ./logs
```

### Build from source

```bash
# 1. Build the React frontend (Vite + bun)
cd web && ./build.sh && cd ..

# 2. Build the Go binary (frontend is embedded via //go:embed)
go build -ldflags "-s -w" -o wavydanceai
```

## API

Chat and vision are OpenAI-compatible — point any SDK at `https://your-host/v1` and use a wavydance API key.

```bash
curl https://your-host/v1/chat/completions \
  -H "Authorization: Bearer wd-..." \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-opus-4-6",
    "messages": [{"role": "user", "content": "ping"}]
  }'
```

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://your-host/v1",
    api_key="wd-...",
)

resp = client.chat.completions.create(
    model="claude-opus-4-6",
    messages=[{"role": "user", "content": "ping"}],
)
print(resp.choices[0].message.content)
```

Switch providers by changing the model string — `gpt-4o`, `claude-opus-4-6`, `gemini-2.5-pro`, `deepseek-v3`, `qwen-max`, etc.

## Self-hosting

Required environment variables for any production deployment:

| Variable | Required | Notes |
|---|---|---|
| `INITIAL_ROOT_PASSWORD` | **Yes** | Sets the password for the seeded `root` account on first boot. Never deploy without this set. |
| `SESSION_SECRET` | **Yes** | Random 32+ byte string per deployment. Never reuse across environments. |
| `SESSION_COOKIE_SECURE` | Prod | Set to `true` behind TLS so session cookies are not sent over plain HTTP. |
| `INITIAL_ROOT_TOKEN` | Optional | Bootstrap a root API key on first boot. |
| `INITIAL_ROOT_ACCESS_TOKEN` | Optional | Bootstrap a root admin access token. |

See [`docs/`](docs/) for full configuration, multi-node deployment, and backup guidance.

## License

This project is licensed under the **PolyForm Noncommercial License 1.0.0** — see [`LICENSE`](LICENSE) for the full text and [`NOTICE`](NOTICE) for a plain-English summary.

- ✅ Personal learning, research, classroom use, hobby projects, non-profits
- ❌ Any commercial use — hosted services, resale, embedding in paid products, or internal use at for-profit organizations

## Commercial use

Need to run wavydance.ai inside a for-profit organization, ship it as part of a paid product, or offer it as a hosted service? **Commercial licenses are available.**

📩 **hujieming213@gmail.com**
Subject: `wavydance.ai commercial license`

We'll get back to you within two business days with terms.

## Credits

wavydance.ai is a brand-and-feature fork of [songquanpeng/one-api](https://github.com/songquanpeng/one-api) (MIT). Portions of this codebase derived from one-api remain available under their original MIT terms from the original source. See [`NOTICE`](NOTICE) for full attribution.

---

<p align="center">
  <sub>Built with waves · <a href="https://wavydance.ai">wavydance.ai</a></sub>
</p>
