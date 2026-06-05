import { api, unwrap } from '@/lib/api'
import type { ApiResponse, Log, LogFilters } from '@/lib/types'

export const logsService = {
  /** User-scoped log listing (default for non-admins). */
  async listSelf(filters: LogFilters = {}): Promise<Log[]> {
    const res = await api.get<ApiResponse<Log[]>>('/log/self', { params: filters })
    return unwrap(res) ?? []
  },

  /** Admin: all logs. */
  async listAll(filters: LogFilters = {}): Promise<Log[]> {
    const res = await api.get<ApiResponse<Log[]>>('/log/', { params: filters })
    return unwrap(res) ?? []
  },
}

export const LOG_TYPE_LABEL: Record<number, string> = {
  0: 'Unknown',
  1: 'Top-up',
  2: 'Consume',
  3: 'Manage',
  4: 'System',
  5: 'Test',
}
