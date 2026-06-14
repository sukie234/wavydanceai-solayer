import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } }
})

import { api } from '@/lib/api'
import { topupService } from './topup'

const mockGet = api.get as ReturnType<typeof vi.fn>
const mockPost = api.post as ReturnType<typeof vi.fn>

const ok = <T>(data: T) => ({ data: { success: true, data }, status: 200 })
const fail = (message: string, status = 400) => ({ data: { success: false, message }, status })

beforeEach(() => vi.clearAllMocks())

describe('topupService reads', () => {
  it('info reads enabled gateways + tiers', async () => {
    mockGet.mockResolvedValue(ok({ stripe: true }))
    expect(await topupService.info()).toEqual({ stripe: true })
    expect(mockGet).toHaveBeenCalledWith('/user/topup/info')
  })

  it('mine paginates and defaults to []', async () => {
    mockGet.mockResolvedValue(ok(null))
    expect(await topupService.mine(2, 50)).toEqual([])
    expect(mockGet).toHaveBeenCalledWith('/user/topup/self', { params: { p: 2, size: 50 } })
  })
})

describe('topupService order creation', () => {
  it('quote previews quota for a money amount', async () => {
    mockPost.mockResolvedValue(ok({ money: 10, quota: 5000 }))
    const q = await topupService.quote(10)
    expect(q.quota).toBe(5000)
    expect(mockPost).toHaveBeenCalledWith('/user/topup/amount', { money: 10 })
  })

  it('startStripe returns the checkout url', async () => {
    mockPost.mockResolvedValue(ok({ trade_no: 't1', pay_url: 'https://pay' }))
    const r = await topupService.startStripe(20)
    expect(r.pay_url).toBe('https://pay')
    expect(mockPost).toHaveBeenCalledWith('/user/topup/stripe', { money: 20 })
  })

  it('startEpay forwards the optional pay method', async () => {
    mockPost.mockResolvedValue(ok({ trade_no: 't2', pay_url: 'u' }))
    await topupService.startEpay(15, 'alipay')
    expect(mockPost).toHaveBeenCalledWith('/user/topup/epay', { money: 15, pay_method: 'alipay' })
  })

  it('startCrypto puts the adapter in the path', async () => {
    mockPost.mockResolvedValue(ok({ trade_no: 't3', pay_url: 'u' }))
    await topupService.startCrypto('nowpayments', 30)
    expect(mockPost).toHaveBeenCalledWith('/user/topup/crypto/nowpayments', { money: 30 })
  })

  it('propagates a gateway error', async () => {
    mockPost.mockResolvedValue(fail('gateway disabled'))
    await expect(topupService.startStripe(20)).rejects.toThrow('gateway disabled')
  })
})

describe('topupService admin', () => {
  it('adminList forwards filters and defaults to []', async () => {
    mockGet.mockResolvedValue(ok(null))
    expect(await topupService.adminList({ status: 'pending', user_id: 7 })).toEqual([])
    expect(mockGet).toHaveBeenCalledWith('/user/topup', { params: { status: 'pending', user_id: 7 } })
  })

  it('adminComplete forces an order with a note', async () => {
    mockPost.mockResolvedValue(ok(null))
    await topupService.adminComplete('trade-9', 'manual')
    expect(mockPost).toHaveBeenCalledWith('/user/topup/complete', { trade_no: 'trade-9', note: 'manual' })
  })
})
