import { api, unwrap } from '@/lib/api'
import type { ApiResponse } from '@/lib/types'

export const groupsService = {
  /** Admin: list configured group names (e.g. "default", "vip"). */
  async list(): Promise<string[]> {
    const res = await api.get<ApiResponse<string[]>>('/group/')
    return unwrap(res) ?? []
  },
}
