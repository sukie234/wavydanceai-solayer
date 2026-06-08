import { api, unwrap } from '@/lib/api'
import type { ApiResponse, Topup, TopupInfo } from '@/lib/types'

export interface TopupQuotePreview {
  money: number
  quota: number
}

export interface CreateTopupResponse {
  trade_no: string
  pay_url: string
}

export interface AdminTopupFilters {
  user_id?: number
  status?: 'pending' | 'success' | 'failed' | 'refunded'
  gateway?: string
  start?: number
  end?: number
  p?: number
  size?: number
}

export const topupService = {
  /** Read which gateways are currently enabled + tier list. */
  async info(): Promise<TopupInfo> {
    const res = await api.get<ApiResponse<TopupInfo>>('/user/topup/info')
    return unwrap(res)
  },

  /** Read the calling user's own topup history (most recent first). */
  async mine(p = 1, size = 20): Promise<Topup[]> {
    const res = await api.get<ApiResponse<Topup[]>>('/user/topup/self', { params: { p, size } })
    return unwrap(res) ?? []
  },

  /** "If I pay this money, how much quota do I get?" — pure preview, no side effects. */
  async quote(money: number): Promise<TopupQuotePreview> {
    const res = await api.post<ApiResponse<TopupQuotePreview>>('/user/topup/amount', { money })
    return unwrap(res)
  },

  /** Create a Stripe Checkout Session. Frontend should redirect to the returned URL. */
  async startStripe(money: number): Promise<CreateTopupResponse> {
    const res = await api.post<ApiResponse<CreateTopupResponse>>('/user/topup/stripe', { money })
    return unwrap(res)
  },

  /** Create an E-Pay (alipay/wxpay/qqpay) order. */
  async startEpay(money: number, pay_method?: string): Promise<CreateTopupResponse> {
    const res = await api.post<ApiResponse<CreateTopupResponse>>('/user/topup/epay', { money, pay_method })
    return unwrap(res)
  },

  /** Create a crypto order via the named adapter (e.g. "nowpayments"). */
  async startCrypto(adapter: string, money: number): Promise<CreateTopupResponse> {
    const res = await api.post<ApiResponse<CreateTopupResponse>>(`/user/topup/crypto/${adapter}`, { money })
    return unwrap(res)
  },

  // ---- admin ----

  async adminList(filters: AdminTopupFilters = {}): Promise<Topup[]> {
    const res = await api.get<ApiResponse<Topup[]>>('/user/topup', { params: filters })
    return unwrap(res) ?? []
  },

  /** Force a pending order to success. Same idempotent CompleteTopup path. */
  async adminComplete(trade_no: string, note: string): Promise<void> {
    const res = await api.post<ApiResponse>('/user/topup/complete', { trade_no, note })
    unwrap(res)
  },
}
