import { api, unwrap } from '@/lib/api'
import type { ApiResponse, Token } from '@/lib/types'

export const tokensService = {
  async list(p = 0, order = ''): Promise<Token[]> {
    const res = await api.get<ApiResponse<Token[]>>('/token/', { params: { p, order } })
    return unwrap(res) ?? []
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
