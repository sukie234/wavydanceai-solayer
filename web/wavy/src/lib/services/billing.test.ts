import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }
})

import { api } from '@/lib/api'
import { billingService } from './billing'

const mockGet = api.get as ReturnType<typeof vi.fn>
const mockPost = api.post as ReturnType<typeof vi.fn>
const mockDelete = api.delete as ReturnType<typeof vi.fn>

const ok = <T>(data: T) => ({ data: { success: true, data }, status: 200 })
const fail = (message: string, status = 400) => ({ data: { success: false, message }, status })

beforeEach(() => vi.clearAllMocks())

describe('billingService.redeem', () => {
  it('posts the key and returns the quota added', async () => {
    mockPost.mockResolvedValue(ok(500))
    const quota = await billingService.redeem('CODE-123')
    expect(quota).toBe(500)
    expect(mockPost).toHaveBeenCalledWith('/user/topup', { key: 'CODE-123' })
  })

  it('defaults to 0 when the server returns no quota', async () => {
    mockPost.mockResolvedValue(ok(null))
    expect(await billingService.redeem('x')).toBe(0)
  })

  it('throws on an invalid code', async () => {
    mockPost.mockResolvedValue(fail('invalid redemption code'))
    await expect(billingService.redeem('bad')).rejects.toThrow('invalid redemption code')
  })
})

describe('billingService redemption admin', () => {
  it('listRedemptions paginates and defaults to []', async () => {
    mockGet.mockResolvedValue(ok(null))
    expect(await billingService.listRedemptions(3)).toEqual([])
    expect(mockGet).toHaveBeenCalledWith('/redemption/', { params: { p: 3 } })
  })

  it('createRedemption posts name/quota/count and returns generated keys', async () => {
    mockPost.mockResolvedValue(ok(['k1', 'k2']))
    const keys = await billingService.createRedemption('batch', 100, 2)
    expect(keys).toEqual(['k1', 'k2'])
    expect(mockPost).toHaveBeenCalledWith('/redemption/', { name: 'batch', quota: 100, count: 2 })
  })

  it('createRedemption defaults to [] when data is missing', async () => {
    mockPost.mockResolvedValue(ok(null))
    expect(await billingService.createRedemption('b', 1, 1)).toEqual([])
  })

  it('deleteRedemption deletes by id', async () => {
    mockDelete.mockResolvedValue(ok(null))
    await billingService.deleteRedemption(9)
    expect(mockDelete).toHaveBeenCalledWith('/redemption/9')
  })
})
