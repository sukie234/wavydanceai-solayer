import { api, unwrap } from '@/lib/api'
import type { ApiResponse } from '@/lib/types'

/**
 * Reserved name of the user's auto-provisioned playground token on the
 * backend. Surfaces here so the token list UI can filter it out.
 */
export const PLAYGROUND_TOKEN_NAME = '__playground__'

interface PlaygroundTokenResponse {
  key: string
}

export const playgroundService = {
  /**
   * Returns the user's playground token key (raw, without `sk-` prefix).
   * The backend lazily creates it on first call and reuses it thereafter.
   */
  async getToken(): Promise<string> {
    const res = await api.get<ApiResponse<PlaygroundTokenResponse>>('/user/self/playground_token')
    const data = unwrap(res)
    return data?.key ?? ''
  },

  /** Chat-capable subset of the user's group-allowed models. */
  async listChatModels(): Promise<string[]> {
    const res = await api.get<ApiResponse<string[]>>('/user/self/playground/chat_models')
    return unwrap(res) ?? []
  },

  /** Image-generation subset of the user's group-allowed models. */
  async listImageModels(): Promise<string[]> {
    const res = await api.get<ApiResponse<string[]>>('/user/self/playground/image_models')
    return unwrap(res) ?? []
  },

  /** Video-generation subset of the user's group-allowed models. */
  async listVideoModels(): Promise<string[]> {
    const res = await api.get<ApiResponse<string[]>>('/user/self/playground/video_models')
    return unwrap(res) ?? []
  },
}
