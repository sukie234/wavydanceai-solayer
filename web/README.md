# wavydance.ai frontend

Single SPA theme served from the Go binary via `//go:embed web/build/wavy/`.

## Layout

```
web/
  wavy/            React 19 + TS + Tailwind v4 + TanStack Router (source)
  build/wavy/      Production build output, consumed by go:embed
  web_reference/   Brand guide & HTML design reference (not shipped)
  THEMES           Newline-separated theme list — used by build.sh
  build.sh         Builds all themes listed in THEMES
```

## Local development

```bash
cd web/wavy
bun install
bun run dev          # http://localhost:5173 with /api proxied to :3000
```

## Production build

Either:
```bash
cd web/wavy && bun run build      # → ../build/wavy/
```
or from `web/`:
```bash
./build.sh
```

## How it ships

`Dockerfile` builds the frontend with bun, copies `web/wavy/dist` into the Go
build stage, which `go:embed`s `web/build/wavy/` into the final binary. The
backend defaults to `THEME=wavy` (see `common/config/config.go`).

## Adding a new theme

This codebase intentionally ships **one** theme. If you fork to add more:
1. Create `web/<name>/` with its own `package.json` and build that outputs to `../build/<name>/`.
2. Register the name in `common/config/config.go` `ValidThemes` and in `THEMES`.
3. Update `Dockerfile` and `build.sh` accordingly.
