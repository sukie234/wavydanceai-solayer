import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the HTTP client at the module boundary (TESTING.md pattern) so we can
// assert the exact wire shape — the Turnstile middleware reads the token from
// the `turnstile` query param, even on POST routes.
vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
  unwrap: (res: { data: { data?: unknown } }) => res.data.data,
}))

import { api } from '@/lib/api'
import { authService } from './auth'

const mockGet = api.get as ReturnType<typeof vi.fn>
const mockPost = api.post as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mockGet.mockResolvedValue({ data: { success: true } })
  mockPost.mockResolvedValue({ data: { success: true } })
})

describe('authService turnstile token plumbing', () => {
  it('sendVerificationCode appends the turnstile query param when given', async () => {
    await authService.sendVerificationCode('a@b.com', 'tok-1')
    expect(mockGet).toHaveBeenCalledWith('/verification', {
      params: { email: 'a@b.com', turnstile: 'tok-1' },
    })
  })

  it('sendVerificationCode omits the param without a token', async () => {
    await authService.sendVerificationCode('a@b.com')
    expect(mockGet).toHaveBeenCalledWith('/verification', {
      params: { email: 'a@b.com' },
    })
  })

  it('sendPasswordResetEmail appends the turnstile query param when given', async () => {
    await authService.sendPasswordResetEmail('a@b.com', 'tok-2')
    expect(mockGet).toHaveBeenCalledWith('/reset_password', {
      params: { email: 'a@b.com', turnstile: 'tok-2' },
    })
  })

  it('register sends the token as a query param, not in the body', async () => {
    const input = { username: 'jimmy', password: 'hunter22' }
    await authService.register(input, 'tok-3')
    expect(mockPost).toHaveBeenCalledWith('/user/register', input, {
      params: { turnstile: 'tok-3' },
    })
  })

  it('register sends no params without a token', async () => {
    const input = { username: 'jimmy', password: 'hunter22' }
    await authService.register(input)
    expect(mockPost).toHaveBeenCalledWith('/user/register', input, {
      params: undefined,
    })
  })
})
