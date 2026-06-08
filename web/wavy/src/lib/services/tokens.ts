import { api, unwrap } from '@/lib/api'
import type { ApiResponse, Token } from '@/lib/types'
import { PLAYGROUND_TOKEN_NAME } from '@/lib/services/playground'

export const tokensService = {
  async list(p = 0, order = ''): Promise<Token[]> {
    const res = await api.get<ApiResponse<Token[]>>('/token/', { params: { p, order } })
    const tokens = unwrap(res) ?? []
    // Hide the system-managed playground token from the user's key list — it's
    // auto-provisioned by the in-app playground and shouldn't be revoked or
    // renamed by hand. See controller/playground.go.
    return tokens.filter((t) => t.name !== PLAYGROUND_TOKEN_NAME)
  },

  async create(token: Partial<Token>): Promise<void> {
    const res = await api.post<ApiResponse>('/token/', token)
    unwrap(res)
  },

  async update(token: Partial<Token>): Promise<void> {
    const res = await api.put<ApiResponse>('/token/', token)
    unwrap(res)
  },

  async remove(id: number): Promise<void> {
    const res = await api.delete<ApiResponse>(`/token/${id}`)
    unwrap(res)
  },
}
