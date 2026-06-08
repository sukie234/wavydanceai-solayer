# Frontend testing (Vitest)

Vitest + jsdom + React Testing Library. Co-located tests next to source.

## Run

```bash
cd web/wavy
bun run test            # one-shot
bun run test:watch      # watch mode
bun run test:ui         # browser UI (port 51204 by default)
bun run test:coverage   # text + HTML report under coverage/
```

CI should run `bun run test` (non-watch).

## Where tests live

Co-locate with source — Vitest picks up `src/**/*.{test,spec}.{ts,tsx}`.

```
src/lib/cn.ts
src/lib/cn.test.ts              ← pure util test
src/components/ui/button.tsx
src/components/ui/button.test.tsx   ← component test
```

Don't put tests in a separate `__tests__/` directory.

## Patterns

### Pure utility — see `src/lib/cn.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { cn } from './cn'

describe('cn', () => {
  it('joins truthy class names', () => {
    expect(cn('a', 'b')).toBe('a b')
  })
})
```

### Component — see `src/components/ui/button.test.tsx`

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './button'

describe('<Button>', () => {
  it('fires onClick', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Go</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
```

Always prefer `getByRole` over `getByTestId`. Use `userEvent` over `fireEvent`.

## What `src/test/setup.ts` does

- Loads `@testing-library/jest-dom/vitest` so matchers like `.toBeInTheDocument()` / `.toBeDisabled()` work
- Calls RTL `cleanup()` after every test to unmount components and reset the DOM

## Mocking axios / API calls

The project's HTTP client is `src/lib/api.ts` (axios). For service-layer tests, mock the
client at the module boundary:

```ts
import { vi } from 'vitest'
vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))
```

For higher-fidelity tests, install `msw` later and intercept at the network layer.
Not set up yet — add when first needed.

## Known gaps (add when you need them, not before)

- **No TanStack Router test helper.** Route-level components need `<RouterProvider>`
  wrapping. If you need this, add `src/test/render.tsx` that builds a memory router
  + QueryClientProvider wrapper and use it instead of plain `render`.
- **No MSW.** Network calls are mocked at the service-module boundary for now.
- **No visual regression / Playwright.** This framework is unit + component only.
  E2E lives outside this stack.

## For agents (Claude / Copilot / etc.)

When you add or modify a component, util, or service:

1. **Add a test in the same PR.** Tests live next to source as `*.test.ts(x)`.
2. **Run `bun run test` before declaring done.** Don't claim "tests pass" without
   running them — empty results count as not run.
3. **Don't expand scope.** Adding the test framework was one PR. Adding test
   helpers (router wrapper, MSW) is its own follow-up — don't pre-install
   speculatively.
4. **Strict TypeScript still applies.** Test files are typechecked by `tsc -b` like
   the rest of `src/`. Unused imports / parameters will fail CI.
5. **No `any`. No `// @ts-ignore`.** If a type is missing, fix it at the source.
