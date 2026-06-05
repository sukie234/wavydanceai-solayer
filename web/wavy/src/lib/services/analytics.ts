import { api, unwrap } from '@/lib/api'
import type { ApiResponse, DashboardEntry } from '@/lib/types'

export const analyticsService = {
  /** Last 7 days, grouped by (day, model) for the current user. */
  async dashboard(): Promise<DashboardEntry[]> {
    const res = await api.get<ApiResponse<DashboardEntry[]>>('/user/dashboard')
    return unwrap(res) ?? []
  },
}
