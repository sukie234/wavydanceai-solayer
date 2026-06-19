import { describe, it, expect, vi, beforeEach } from 'vitest'

// Models is now a redirect into the merged /console/channels page. Stub the
// router surface so `throw redirect(...)` rejects with the location object.
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  redirect: vi.fn((loc: unknown) => loc),
}))

import { Route } from './console.models'

function beforeLoad(): Promise<unknown> {
  const { options } = Route as unknown as { options: { beforeLoad: () => Promise<unknown> } }
  return Promise.resolve().then(() => options.beforeLoad())
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('/console/models redirect', () => {
  it('redirects to the merged /console/channels page', async () => {
    await expect(beforeLoad()).rejects.toEqual({ to: '/console/channels' })
  })
})
