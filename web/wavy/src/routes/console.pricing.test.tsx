import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Role, type User } from '@/lib/types'

// Route-level guard test: stub the router surface so we can inspect the
// route options without a full <RouterProvider> (no router test helper yet —
// TESTING.md). `redirect` returns its argument so `throw redirect(...)`
// rejects with the location object.
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  redirect: vi.fn((loc: unknown) => loc),
}))

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
}))

import { getSession } from '@/lib/session'
import { Route } from './console.pricing'

const mockGetSession = getSession as ReturnType<typeof vi.fn>

function beforeLoad(): Promise<unknown> {
  const { options } = Route as unknown as { options: { beforeLoad: () => Promise<unknown> } }
  return options.beforeLoad()
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('/console/pricing root guard', () => {
  it('redirects guests to /console', async () => {
    mockGetSession.mockResolvedValue(null)
    await expect(beforeLoad()).rejects.toEqual({ to: '/console' })
  })

  it('redirects admin (non-root) users to /console', async () => {
    mockGetSession.mockResolvedValue({ role: Role.AdminUser } as User)
    await expect(beforeLoad()).rejects.toEqual({ to: '/console' })
  })

  it('lets root users through', async () => {
    mockGetSession.mockResolvedValue({ role: Role.RootUser } as User)
    await expect(beforeLoad()).resolves.toBeUndefined()
  })
})
