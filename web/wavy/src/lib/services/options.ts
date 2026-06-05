import { api, unwrap } from '@/lib/api'
import type { ApiResponse } from '@/lib/types'

export interface Option {
  key: string
  value: string
}

export const optionsService = {
  async list(): Promise<Option[]> {
    const res = await api.get<ApiResponse<Option[]>>('/option/')
    return unwrap(res) ?? []
  },

  async update(key: string, value: string): Promise<void> {
    const res = await api.put<ApiResponse>('/option/', { key, value })
    unwrap(res)
  },
}

/** Map raw option key → bool */
export function asBool(value: string | undefined): boolean {
  return value === 'true'
}

/** Convert OptionList[] to a keyed dict for easier lookup. */
export function optionsToMap(opts: Option[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const o of opts) out[o.key] = o.value
  return out
}
