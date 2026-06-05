# wavy theme

The wavydance.ai frontend — Jelly Sea brand, single-page React app embedded into the Go binary.

## Stack

- **Vite 6** + **React 19** + **TypeScript 5**
- **Tailwind CSS v4** (CSS-first config with `@theme`)
- **TanStack Router** (file-based, type-safe)
- **TanStack Query** (server state)
- **i18next** (en + zh-CN)
- **shadcn/ui** style primitives (built on Radix conventions, written inline)
- **bun** for package management

## Scripts

```bash
bun install              # install deps
bun run dev              # dev server (http://localhost:5173)
bun run build            # production build → ../build/wavy/ (Go embed target)
bun run build:only       # production build → ./dist/ without moving
bun run typecheck        # tsc --noEmit
```

## How it ships

The Go server (`main.go`) does `//go:embed web/build/*`. Setting env `THEME=wavy`
makes the backend serve files from `web/build/wavy/`. Register the theme in
`common/config/config.go` (`ValidThemes`) and `web/THEMES`.

## Layout

```
src/
  routes/          file-based routes (TanStack Router)
    __root.tsx
    index.tsx      landing
  components/
    ui/            primitives (button, card, ...)
    landing/       landing-page sections
  lib/
    api.ts         axios instance + base API client
    i18n.ts        i18next bootstrap
    queryClient.ts react-query setup
    cn.ts          className helper
  styles/
    globals.css    Tailwind v4 + Jelly Sea tokens
  locales/         en.json, zh-CN.json
```
