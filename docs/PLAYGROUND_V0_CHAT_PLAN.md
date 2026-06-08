# Playground v0 — Chat Execution Plan

> **Scope:** v0 ships **chat** only. Image / video modalities are wired in
> at the navigation level (placeholder "coming soon" cards) so v1/v2 only
> need to drop their UI into the existing shell. No work on image or video
> generation in this PR.

## 0. Why

We've onboarded users, taken their topup, and shipped tokens — but the
shortest path from "I just paid" to "I see value" is still
"go install an SDK and copy-paste your sk-key". That's the bottleneck
behind the current recharge→usage gap.

A playground page that consumes the user's own quota closes that loop in
one click and doubles as our default demo surface for every new model
adapter we ship.

## 1. Goals & Non-goals

### Goals (v0)

1. New `Playground` entry in the console sidebar.
2. Landing page at `/console/playground` with three modality cards:
   `Chat` (live), `Image` (disabled, "coming soon"), `Video` (disabled).
3. `/console/playground/chat` — full chat UI:
   - Model picker (only models the user's group can access)
   - Streaming responses (SSE)
   - Parameter panel: `temperature`, `max_tokens`, `top_p`, `system prompt`
   - Multiple conversations stored in `localStorage`
   - Live quota readout: remaining quota in header, cost-of-last-request banner
4. Every chat completion deducts the user's quota through the **same
   relay path** any external SDK uses — no parallel billing code.
5. i18n: all strings via `react-i18next`, en + zh.

### Non-goals (v0)

- Image / video modalities (just the placeholder cards).
- Server-side persistence of conversations (localStorage is fine; users
  who clear browser data lose history — acceptable for v0).
- Multi-turn tool use, function calling, vision uploads, file attachments.
- Per-conversation system-prompt presets / prompt library / sharing.
- Cost estimation *before* sending (we'll show actuals after).
- Mobile layout polish (the console is desktop-first already).

## 2. Architecture decision: how does playground call the model?

Two options were considered:

**A. Direct call from browser to `/v1/chat/completions`**, using a sk-token.
The browser behaves exactly like an SDK client.

**B. New backend endpoint** (`/api/playground/chat`) that uses the session
cookie, looks up the user internally, and proxies to the relay.

We pick **A**. Reasons:

- Zero new backend surface to maintain or secure.
- Quota deduction, logging, group enforcement, channel routing all
  happen for free — they already work for tokens.
- The playground UI doubles as a "this is what your SDK will see"
  reference. Users can copy the request and reproduce it offline.

The one UX cost of A is "which token does the playground use?" — see §3.

## 3. Token strategy

The playground needs a sk-token in `Authorization: Bearer sk-...`. Three
sub-options:

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| Ask user to pick from existing tokens | Zero new code | If user has none, dead-end | Reject |
| Auto-pick first active token | Simple | Silently spends a token the user might have earmarked for an app | Reject |
| Dedicated internal **playground token**, auto-provisioned | Stable identity in logs ("source: playground"), user can't accidentally delete it | Need a tiny backend addition | **Accept** |

### Backend addition (single endpoint)

```text
GET /api/user/self/playground_token   →  { key: "<48-char raw key>" }
```

The endpoint returns the raw key without an `sk-` prefix — the frontend
prepends `sk-` when building the `Authorization` header (the middleware
strips it again, see `middleware/auth.go`).

- Auth: session cookie via `UserAuth()` (same as `/api/user/self`).
- Behavior: look up a token belonging to this user with name
  `__playground__` (reserved, leading underscores so it sorts to the top
  and is obviously system-managed). If absent, create one with:
  - `Name = "__playground__"`
  - `RemainQuota = 0`, `UnlimitedQuota = true` — the token's own cap is
    a no-op; the user's group quota is what actually gates spend.
  - `ExpiredTime = -1` (never)
  - `Status = TokenStatusEnabled`
  - `Group = ""` (inherit user group)
- Return the sk-key string. **Never** show it in the UI; only the
  playground fetch hook reads it and stuffs it into the
  `Authorization` header.

### Token list visibility

Hide `__playground__` from the regular `/console/tokens` list to avoid
confusing users. Implementation: client-side filter in
`tokens.ts` service (`name !== '__playground__'`). If user wants to see
all tokens (e.g. admin debug), they can hit `/api/token/` directly.

> **Why hide rather than block creation manually?** If a user wants
> to rotate the key for security reasons, we still want to handle that
> through the existing token API; just don't show the row in the UI.

### Quota accounting

Already works:

1. Token's `UnlimitedQuota=true` means the token itself imposes no cap.
2. Relay middleware checks `user.Quota` against the model's pre-charge
   *before* calling the upstream, then deducts actual usage *after*.
3. The log row in `/console/logs` will show this request, including
   token name `__playground__` — auditable.

No new billing code. This is the whole point of going with option A.

## 4. UX & visual design

### Sidebar entry

Insert between `Models` and `Tokens` in `OPERATIONS` (Sidebar.tsx):

```ts
{ to: '/console/playground', icon: Sparkles, i18n: 'console.nav.playground' },
```

Icon: `Sparkles` from lucide-react (fits "play with the model" feel and
matches the wavy/cyan palette).

Visible to all users (no `minRole`).

### `/console/playground` — modality picker

Single page, centered grid of 3 cards:

```text
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ 💬 Chat       │  │ 🖼  Image     │  │ 🎬 Video      │
│ Talk to LLMs  │  │ Generate     │  │ Generate     │
│              │  │ Coming soon  │  │ Coming soon  │
│ [Open]       │  │ [Disabled]   │  │ [Disabled]   │
└──────────────┘  └──────────────┘  └──────────────┘
```

Cards reuse the existing card styling from `console.index.tsx` (look
for `rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)]`).

Disabled cards: same visual, opacity 50%, no hover state, "Coming
soon" pill in the corner.

### `/console/playground/chat` — three-pane layout

```text
┌────────────┬──────────────────────────────────┬────────────────┐
│ Sessions   │ Messages                         │ Parameters     │
│ (left)     │ (middle, scroll)                 │ (right)        │
│            │                                  │                │
│ + New chat │ ┌─ assistant ─────────┐          │ Model: [▼]     │
│            │ │ Hi! How can I help? │          │ Temp:  ▬▬◯─    │
│ ▸ Today    │ └─────────────────────┘          │ Max:   1024    │
│   • Untit… │                                  │ Top-p: ▬▬◯─    │
│   • Sketc… │ ┌─ user ──────────────┐          │                │
│ ▸ Yester…  │ │ Make me a poem      │          │ System prompt: │
│   • ...    │ └─────────────────────┘          │ [textarea]     │
│            │                                  │                │
│            │ ┌────────────────────────────┐   │                │
│            │ │ Type a message…    [Send]  │   │                │
│            │ └────────────────────────────┘   │                │
└────────────┴──────────────────────────────────┴────────────────┘
```

**Header band** (above the three panes): "Quota remaining: 1.23M tokens
($12.34)" + "Last request: 412 tokens · $0.0008".

### Streaming behavior

- "Send" disabled while a stream is in flight. ESC or a `Stop` button
  aborts it (`AbortController`).
- Tokens render incrementally as SSE chunks arrive.
- On completion, refresh quota: refetch the React Query
  `['self']` cache so the header band updates.

### Empty / error states

- No models available → show a card "No models available for your
  group — contact admin" with a link back to `/console`.
- 402 (quota exhausted) → toast: "Out of quota — top up to continue"
  with `[Top up]` button linking to `/console/topup`.
- 401 (token revoked) → re-fetch playground token, retry once; if
  still 401 → toast "Session expired, please re-login".

## 5. File layout

```text
web/wavy/src/
├── routes/
│   ├── console.playground.tsx            (layout — modality picker on index)
│   ├── console.playground.index.tsx      (3-card grid)
│   └── console.playground.chat.tsx       (chat UI)
├── components/
│   └── playground/
│       ├── ModalityCard.tsx
│       ├── chat/
│       │   ├── SessionList.tsx
│       │   ├── MessageList.tsx
│       │   ├── MessageBubble.tsx
│       │   ├── Composer.tsx
│       │   └── ParamsPanel.tsx
│       └── chat/useChatStream.ts         (hook: SSE → message state)
└── lib/
    └── services/
        └── playground.ts                  (fetchPlaygroundToken, listChatModels)
```

`controller/user.go` (or new `controller/playground.go`):

```go
func GetPlaygroundToken(c *gin.Context) { … }
```

Register in `router/api.go` inside the `selfRoute` group:

```go
selfRoute.GET("/playground_token", controller.GetPlaygroundToken)
```

## 6. Model picker — which models surface in chat?

We already have `GET /api/user/self/available_models` that returns the
user's group-allowed models. Filter client-side to **chat-capable**
models. v0 heuristic: include a model iff its name appears in our
known-chat list.

We **don't** want to hard-code that list per Pricing.tsx — it'll
drift. Add a tiny backend helper:

```go
// controller/model.go
func GetUserAvailableChatModels(c *gin.Context) { … }
```

Implementation: same as `GetUserAvailableModels`, but cross-reference
with `relay.GetAdaptor(...).GetModelList()` filtered by modality.

**Modality tagging is the actual blocker** — adaptors don't currently
declare modality. Two ways out:

- **(a)** Add a small const map in `controller/playground.go`:
  `var chatModelPrefixes = []string{"gpt-", "claude-", "qwen", "deepseek", "gemini-", "moonshot", "doubao-", …}` — whatever shows up in the
  default seed channels. Fast, slightly hacky.
- **(b)** Add a `Modality` field on the adaptor interface and have
  every adaptor declare it. Right thing, but touches every adaptor.

v0 ships **(a)** with a `TODO` comment pointing at (b). v1 (image
playground) is the right moment to do (b) — image/video modality
detection will be needed anyway.

## 7. Conversation storage

`localStorage` key: `playground.chat.sessions.v1`.

```ts
type ChatSession = {
  id: string                // uuid
  title: string             // first user msg, truncated
  model: string
  systemPrompt: string
  params: { temperature: number; max_tokens: number; top_p: number }
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
  createdAt: number
  updatedAt: number
}
```

Cap at 50 sessions; oldest dropped on overflow. Single-tab — no
cross-tab sync (v0).

## 8. SSE / fetch logic

Use **native `fetch` + ReadableStream**, not EventSource (EventSource
can't send POST or custom headers).

```ts
const res = await fetch(`${API_BASE}/v1/chat/completions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer sk-${playgroundToken}`,
    'Accept': 'text/event-stream',
  },
  body: JSON.stringify({ model, messages, stream: true, ...params }),
  signal: abortCtrl.signal,
})
// Parse `data: ...` lines, JSON.parse, append delta.content
```

API base: the relay path lives at root `/v1/*`, not `/api/*`. Need a
new `RELAY_BASE` export from `lib/api.ts` (or reuse `API_BASE` and
strip the `/api` suffix).

## 9. i18n keys (en + zh)

Add to both `web/wavy/src/locales/en.json` and `web/wavy/src/locales/zh-CN.json`:

```text
console.nav.playground = "Playground" / "Playground"
console.playground.title = "Playground" / "Playground"
console.playground.subtitle = "Try any model with your own quota" / "用你自己的额度来试任意模型"
console.playground.modality.chat = "Chat" / "对话"
console.playground.modality.image = "Image" / "图像"
console.playground.modality.video = "Video" / "视频"
console.playground.modality.comingSoon = "Coming soon" / "即将上线"
console.playground.chat.newSession = "New chat" / "新对话"
console.playground.chat.send = "Send" / "发送"
console.playground.chat.stop = "Stop" / "停止"
console.playground.chat.placeholder = "Ask anything…" / "说点什么…"
console.playground.chat.params.model = "Model" / "模型"
console.playground.chat.params.temperature = "Temperature" / "温度"
console.playground.chat.params.maxTokens = "Max tokens" / "最大 tokens"
console.playground.chat.params.topP = "Top-p" / "Top-p"
console.playground.chat.params.system = "System prompt" / "系统提示"
console.playground.chat.quota.remaining = "Remaining: {{quota}}" / "剩余: {{quota}}"
console.playground.chat.quota.lastRequest = "Last request: {{tokens}} tokens · ${{cost}}" / "上次请求: {{tokens}} tokens · ${{cost}}"
console.playground.chat.error.noModels = "No chat models available for your group." / "你的分组暂时没有可用的对话模型。"
console.playground.chat.error.quotaExhausted = "Out of quota. Top up to continue." / "额度已用尽，请充值后继续。"
```

## 10. Implementation tasks (PR-by-PR)

Single PR — the surface is small enough. Branch:
`feat/playground-v0-chat`. Worktree:
`../wavydanceai-feat-playground-v0-chat`.

### Backend (Go)

1. `controller/playground.go` (new file):
   - `GetPlaygroundToken(c *gin.Context)` — finds-or-creates the
     `__playground__` token for `c.GetInt(ctxkey.Id)`, returns sk-key.
   - `GetPlaygroundChatModels(c *gin.Context)` — same logic as
     `GetUserAvailableModels` filtered by `chatModelPrefixes`.
2. `router/api.go` — register two routes under `selfRoute`:
   ```go
   selfRoute.GET("/playground_token", controller.GetPlaygroundToken)
   selfRoute.GET("/playground/chat_models", controller.GetPlaygroundChatModels)
   ```
3. Tests:
   - `controller/playground_test.go` — find-or-create idempotency, group
     inheritance, chat-model filter excludes embedding models, exclude
     image/video models.

### Frontend (React)

4. `lib/services/playground.ts`:
   ```ts
   export const playgroundService = {
     async getToken(): Promise<string>,
     async listChatModels(): Promise<string[]>,
   }
   ```
5. `lib/services/tokens.ts` — filter out rows where
   `name === '__playground__'` in the list method.
6. `routes/console.playground.tsx` — layout shell with `<Outlet />`.
7. `routes/console.playground.index.tsx` — 3-card modality picker.
8. `routes/console.playground.chat.tsx` — full chat page wiring.
9. `components/playground/chat/*` — split components per §5.
10. `components/playground/chat/useChatStream.ts` — abortable SSE hook.
11. `components/console/Sidebar.tsx` — add `Playground` entry, import
    `Sparkles` from lucide-react.
12. `locales/en.json`, `locales/zh-CN.json` — add the strings in §9.
13. Tests (co-located, follow `TESTING.md`):
    - `useChatStream.test.ts` — parses SSE chunks correctly, aborts on
      signal.
    - `SessionList.test.tsx` — renders, switches, deletes.
    - `ParamsPanel.test.tsx` — debounces parameter changes.
    - `ModalityCard.test.tsx` — disabled state, click handler.

### Verification (manual, before PR)

- [ ] Sidebar shows `Playground` between Models and Tokens for a
      common user, admin user, and root.
- [ ] `/console/playground` shows 3 cards; image+video disabled.
- [ ] `/console/playground/chat`:
  - [ ] Model picker populated with the user's chat models only
        (no `text-embedding-*`, no `dall-e-*`, no Sora).
  - [ ] Send a message → stream renders incrementally.
  - [ ] Stop button cancels mid-stream.
  - [ ] Header quota updates after each request.
  - [ ] Logs row appears at `/console/logs` with token name
        `__playground__` and correct model + token count.
- [ ] `/console/tokens` does NOT show the `__playground__` token.
- [ ] Top up resets the quota and re-enables sending.
- [ ] Refresh page → conversations restored from localStorage.
- [ ] Switch language to 中文 → all strings translated.

## 11. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Browser fetch CORS: `/v1/chat/completions` may not allow cookies / `Authorization` from the wavy origin | `SetRelayRouter` already uses `middleware.CORS()`. Verify it allows `Authorization` and our origin. Add a smoke test. |
| `__playground__` token gets revoked by user manually via `/api/token/` | Recreate on next playground load. Already handled by find-or-create. |
| Future image / video playgrounds want to stream upload (multipart) | Out of v0 scope. v1 will introduce a different request shape; the shell stays the same. |
| `chatModelPrefixes` drifts as we add Doubao / Kimi / Moonshot etc. | Add a `// TODO: replace with adaptor-declared modality (see §6b)` comment and revisit in v1. |
| Streaming responses leak the sk-key into browser DevTools network tab | Acceptable — the token is the user's own. The key never leaves the user's session. |

## 12. Out-of-scope work tracked for v1 / v2

These are explicitly **not** in this PR but are the obvious next steps:

- **v1 — Image playground**: `/console/playground/image`. Same shell,
  different parameter panel (size, n, quality), grid output, link to
  saved images in R2 (per the existing hero-video R2 migration).
- **v1 — Adaptor modality field**: refactor `adaptor.Adaptor` to
  declare `Modality() string` so we can stop hard-coding prefixes.
- **v2 — Video playground**: `/console/playground/video`. Async job
  pattern (submit → poll → render), aligned with the Seedance / Kling
  / Sora adapters in the current video relay milestone.
- **v2 — Server-side conversation history** (optional, only if users
  ask): store in MySQL, share-by-link.
- **v2 — Prompt library / saved presets**.

---

**Estimated effort:** 1.5 days of focused work for v0 chat.
Backend: ~2 hrs (one endpoint + tests). Frontend: ~1 day (chat UI is
the bulk). Polish + verification: ~3 hrs.
