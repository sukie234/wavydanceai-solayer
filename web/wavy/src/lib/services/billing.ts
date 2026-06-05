import { api, unwrap } from '@/lib/api'
import type { ApiResponse, Redemption } from '@/lib/types'

export const billingService = {
  /** Redeem a code on behalf of the current user. Returns the quota added. */
  async redeem(key: string): Promise<number> {
    const res = await api.post<ApiResponse<number>>('/user/topup', { key })
    return unwrap(res) ?? 0
  },

  /** Admin: list redemption codes. */
  async listRedemptions(p = 0): Promise<Redemption[]> {
    const res = await api.get<ApiResponse<Redemption[]>>('/redemption/', { params: { p } })
    return unwrap(res) ?? []
  },

  /** Admin: create N redemption codes of `quota` each. */
  async createRedemption(name: string, quota: number, count: number): Promise<void> {
    const res = await api.post<ApiResponse>('/redemption/', { name, quota, count })
    unwrap(res)
  },

  /** Admin: delete a redemption code. */
  async deleteRedemption(id: number): Promise<void> {
    const res = await api.delete<ApiResponse>(`/redemption/${id}`)
    unwrap(res)
  },
}
