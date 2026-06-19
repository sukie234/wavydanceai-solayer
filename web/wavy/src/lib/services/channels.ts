import { api, unwrap } from '@/lib/api'
import type { ApiResponse, Channel } from '@/lib/types'

export const channelsService = {
  async list(p = 0): Promise<Channel[]> {
    const res = await api.get<ApiResponse<Channel[]>>('/channel/', { params: { p } })
    return unwrap(res) ?? []
  },

  /** Drain every channel page into one array. Page 0 sets the page size; we
   * keep paging while pages come back full and stop once one comes back short.
   * Used to derive the full set of provided models across all channels. */
  async listAll(): Promise<Channel[]> {
    const first = await channelsService.list(0)
    if (first.length === 0) return []
    const pageSize = first.length
    const all = [...first]
    // Hard cap so a backend that never shrinks a page can't loop forever.
    for (let p = 1; p < 1000; p++) {
      const next = await channelsService.list(p)
      all.push(...next)
      if (next.length < pageSize) break
    }
    return all
  },

  async get(id: number): Promise<Channel> {
    const res = await api.get<ApiResponse<Channel>>(`/channel/${id}`)
    return unwrap(res)
  },

  async create(channel: Partial<Channel>): Promise<void> {
    const res = await api.post<ApiResponse>('/channel/', channel)
    unwrap(res)
  },

  /** Backend returns just {success, message} — success means the channel responded; throws on failure. */
  async test(id: number, model?: string): Promise<void> {
    const res = await api.get<ApiResponse>(`/channel/test/${id}`, {
      params: model ? { model } : undefined,
    })
    unwrap(res)
  },

  async update(channel: Partial<Channel>): Promise<void> {
    const res = await api.put<ApiResponse>('/channel/', channel)
    unwrap(res)
  },

  async remove(id: number): Promise<void> {
    const res = await api.delete<ApiResponse>(`/channel/${id}`)
    unwrap(res)
  },
}

/** Provider type → display name. Mirrors `relay/channeltype.go`. */
export const CHANNEL_TYPE: Record<number, string> = {
  1: 'OpenAI',
  2: 'API2D',
  3: 'Azure',
  8: 'Custom',
  14: 'Anthropic',
  15: 'Baidu',
  16: 'Zhipu',
  17: 'Ali',
  18: 'Xunfei',
  19: '360',
  22: 'FastGPT',
  23: 'Tencent',
  24: 'Google Gemini',
  25: 'Moonshot',
  26: 'Baichuan',
  27: 'MiniMax',
  28: 'Mistral',
  29: 'Groq',
  30: 'Ollama',
  31: 'LingYi',
  32: 'StepFun',
  33: 'AWS',
  34: 'Coze',
  35: 'Cohere',
  36: 'DeepSeek',
  37: 'Cloudflare',
  39: 'TogetherAI',
  40: 'Doubao (Volc Ark)',
  41: 'Novita',
  42: 'VertexAI',
  43: 'Proxy',
  44: 'SiliconFlow',
  46: 'Replicate',
}
