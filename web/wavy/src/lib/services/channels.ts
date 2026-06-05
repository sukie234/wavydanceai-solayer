import { api, unwrap } from '@/lib/api'
import type { ApiResponse, Channel } from '@/lib/types'

export const channelsService = {
  async list(p = 0): Promise<Channel[]> {
    const res = await api.get<ApiResponse<Channel[]>>('/channel/', { params: { p } })
    return unwrap(res) ?? []
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
  36: 'DeepSeek',
  37: 'Cloudflare',
  39: 'Cohere',
  41: 'Replicate',
  42: 'VertexAI',
  43: 'Proxy',
  44: 'SiliconFlow',
}
