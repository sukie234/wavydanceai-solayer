import { api } from '@/lib/api'
import type { ChannelModel } from '@/lib/types'

interface OpenAIListResponse<T> {
  object: 'list'
  data: T[]
}

export const modelsService = {
  /** Admin: full OpenAI-format model catalog across all channels.
   * This endpoint does NOT use the standard {success,message,data} envelope;
   * it returns `{object: 'list', data}` directly. */
  async list(): Promise<ChannelModel[]> {
    const res = await api.get<OpenAIListResponse<ChannelModel>>('/channel/models')
    return res.data?.data ?? []
  },
}
