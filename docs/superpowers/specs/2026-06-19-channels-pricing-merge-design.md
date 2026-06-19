# Design: Merge Channels + Pricing into one root/admin page, with models derived from channels

Date: 2026-06-19
Status: Approved design — pending spec review

## Problem

The console has three separate admin pages whose model lists drift apart:

- `/console/models` (Admin) — shows a **static catalog** baked in at server boot from every
  provider adaptor (`controller/model.go` → `GET /api/channel/models`). It lists every model the
  software *could* support, even with zero channels configured.
- `/console/channels` (Admin) — the real channels, each with a `models` field (comma-separated
  list of what that channel actually serves). This drives routing via the `Ability` table.
- `/console/pricing` (Root) — edits `ModelRatio` / `CompletionRatio` / `GroupRatio` via
  `GET/PUT /api/option/`. Lists **every model that has a ratio entry** (hundreds of hardcoded
  defaults from `relay/billing/ratio/model.go` plus DB overrides).

Three independent "model universes" — **provided** (channels), **priced** (ratios), **catalog**
(adaptor constants) — that can disagree. Two concrete failure modes:

- **Priced but not provided** → already safe: a request for a model no channel serves returns
  HTTP 503 (`middleware/distributor.go:47` → `CacheGetRandomSatisfiedChannel`). No change needed.
- **Provided but not priced** → unsafe today: billing silently falls back to a punitive **30×**
  input ratio and logs a server-side error (`relay/billing/ratio/model.go:852`,
  `return 30`); completion ratio falls back to 1×. The request succeeds and over-charges silently.

## Goal

Make **the set of models the channels provide** the single source of truth the admin works
against, and put channel management and pricing on one page so the data visibly stays in sync.

## Decisions (settled with stakeholder)

1. The models list is **derived from channels** — the union of every channel's `models` field.
2. **All** channels contribute regardless of status (mirrors the full channels list).
3. The three pages are **consolidated into one page** under the **Account** nav section.
4. Layout: **channel management on top → pricing below**.
5. Access: page guard is **Admin (10)**. The **pricing section renders only for Root (100)**;
   Admins see only the channel section. (Channels stay Admin-manageable, as today.)
6. The standalone **Models** and **Channels** nav items are **removed**; old `/console/models`
   and `/console/pricing` URLs **redirect** to the merged page.
7. Nav label stays **"Channels"**.
8. Provided-but-unpriced models are **surfaced in the pricing section** (blank/flagged row to fill
   in) rather than rejected at request time. Backend billing/routing is **untouched** this round.
9. Model-list population stays **manual entry** this round. Live upstream fetch (new-api parity)
   is a **follow-up PR** — see "Out of scope / follow-up".

## Architecture

### Navigation & routing (`web/wavy/src/components/console/Sidebar.tsx`)

- Remove `{ to: '/console/channels', i18n: 'console.nav.channels', minRole: AdminUser }` and
  `{ to: '/console/models', i18n: 'console.nav.models', minRole: AdminUser }` from `OPERATIONS`.
- Add `{ to: '/console/channels', i18n: 'console.nav.channels', minRole: AdminUser }` to the
  `ACCOUNT` list (label key unchanged → renders "Channels").
- Remove `{ to: '/console/pricing', ... }` from `ACCOUNT` (its editor moves into the merged page).

Routes:
- `console.channels.tsx` becomes the **merged page** (guard: `isAdmin`).
- `console.models.tsx` → thin route that `redirect`s to `/console/channels`.
- `console.pricing.tsx` → thin route that `redirect`s to `/console/channels`.

### Merged page (`console.channels.tsx`)

Renders, top to bottom:

1. **`ChannelsSection`** — extracted verbatim from today's `ChannelsPage` body (table, pager,
   `ChannelDialog`, create/edit/test/disable/delete mutations). No behavior change. Extraction
   is purely to compose two sections on one route and keep each file focused.
2. **`PricingSection`** (rendered only when `user.role >= Role.RootUser`) — owns the options query
   (`optionsService.list()`) and renders `PricingEditor`. For non-root users this section and its
   query do not run.

The page-level guard remains `isAdmin`. Root-gating of pricing is a render-time check on the
session user already available in the console layout context.

### Models derived from channels

Add to `web/wavy/src/lib/services/channels.ts`:

```ts
/** Drains all channel pages (backend paginates at ItemsPerPage). */
async listAll(): Promise<Channel[]>
```

It loops `list(p)` from `p = 0`, accumulating until a page returns fewer than `PAGE_SIZE` (10)
rows, then returns the concatenation.

The **provided set** = union of `channel.models` split on commas, trimmed, blanks dropped, across
all channels from `listAll()`. This is the same data routing uses (the `Ability` table is built
from these strings server-side).

### Pricing section behavior

The `PricingEditor` **Model ratios** table is driven by the provided set instead of by the full
`ModelRatio` map:

- Provided **and** priced → row pre-filled with its current ratio / completion ratio.
- Provided but **unpriced** → row shown with a blank ratio, visually flagged so the admin notices
  and fills it in (this is the fix for the silent 30× fallback).
- A manual **"Add model"** escape hatch remains, for pricing a model ahead of its channel.

Group ratios section is unchanged.

### Save safety (critical)

Today `saveModels` rebuilds `ModelRatio` from the visible table rows only. If the table shows only
provided models, a naive save would **delete ratios for every non-provided model**. The save must
**merge**:

- Start from the existing saved `ModelRatio` map.
- Preserve entries whose model is **not** in the provided/table set (keep as-is).
- Overlay the edited rows on top.
- Apply the identical preservation to `CompletionRatio` (it already preserves prefix-style keys;
  extend that to all non-table entries).

Persist `ModelRatio` + `CompletionRatio` together via the existing atomic
`onSaveBatch` → `PUT /api/option/batch`.

## Data flow

```
channelsService.listAll()  ──► provided set (union of channel.models)
        │                                   │
        ▼                                   ▼
ChannelsSection (Admin)            PricingSection (Root only)
  channel CRUD                       PricingEditor model rows = provided set
  add/edit channel ──────────────►   (refetch channels → new rows appear)
                                     save = merge(provided edits, preserved non-provided ratios)
                                       └► PUT /api/option/batch
```

## Testing (Vitest, co-located)

- `channels.listAll()` — pagination: stops on a short page; concatenates multi-page results;
  empty result for zero channels.
- Provided-set derivation — splits/trims/dedupes `models` strings; ignores blanks; unions across
  channels.
- Pricing merge-on-save — a `ModelRatio` entry for a non-provided model is **preserved** after
  saving edits to provided rows; an edited provided row is written; a newly-priced unpriced
  provided row is written.
- Pricing section is not rendered (and options query not issued) for a non-root admin user.

## Out of scope / follow-up (separate PR)

Port new-api's **live upstream model fetch** into the channel dialog:

- `POST /api/channel/fetch_models` (Root-only) for an unsaved channel — body `{base_url, type, key}`,
  generic `GET {base_url}/v1/models` with bearer key, plus **Gemini** special-casing
  (`gemini.FetchGeminiModels`). (Ollama special-casing intentionally **excluded**.)
- `GET /api/channel/fetch_models/:id` (Admin) for an existing channel — uses the stored key/base_url.
- A "Fetch models" button in `ChannelDialog` that fills the returned IDs into the models field with
  loading + failure states (no silent failure).

Also explicitly **not** changing this round: backend billing/routing. "Model not provided → 503"
already works; the 30× unpriced fallback remains as the runtime safety net.

## Files touched (this round)

- `web/wavy/src/components/console/Sidebar.tsx` — nav restructure.
- `web/wavy/src/routes/console.channels.tsx` — merged page (channels + root-gated pricing).
- `web/wavy/src/routes/console.models.tsx` — redirect to `/console/channels`.
- `web/wavy/src/routes/console.pricing.tsx` — redirect to `/console/channels`.
- `web/wavy/src/components/console/ChannelsSection.tsx` — extracted from `ChannelsPage`.
- `web/wavy/src/components/console/pricing/PricingEditor.tsx` — provided-driven rows + merge save.
- `web/wavy/src/lib/services/channels.ts` — `listAll()`.
- `web/wavy/src/locales/*.json` — nav/label/string adjustments as needed.
- Co-located `*.test.ts(x)` for the above.
