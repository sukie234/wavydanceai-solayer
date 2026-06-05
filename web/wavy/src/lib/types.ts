/** Wire-format types mirroring Go models in `/model`. */

export interface ApiResponse<T = unknown> {
  success: boolean
  message: string
  data?: T
}

export interface User {
  id: number
  username: string
  display_name: string
  role: number // 1 = user, 10 = admin, 100 = root
  status: number // 1 = enabled, 2 = disabled
  email: string
  github_id: string
  wechat_id: string
  lark_id: string
  oidc_id: string
  access_token: string
  quota: number
  used_quota: number
  request_count: number
  group: string
  aff_code: string
  inviter_id: number
}

export const Role = {
  Guest: 0,
  CommonUser: 1,
  AdminUser: 10,
  RootUser: 100,
} as const

export const TokenStatus = {
  Enabled: 1,
  Disabled: 2,
  Expired: 3,
  Exhausted: 4,
} as const

export interface Token {
  id: number
  user_id: number
  key: string
  status: number
  name: string
  created_time: number
  accessed_time: number
  expired_time: number // -1 = never expires
  remain_quota: number
  unlimited_quota: boolean
  used_quota: number
  models: string | null
  subnet: string | null
}

export interface Channel {
  id: number
  type: number
  key: string
  status: number
  name: string
  weight: number | null
  created_time: number
  test_time: number
  response_time: number // ms
  base_url: string | null
  balance: number
  balance_updated_time: number
  models: string
  group: string
  used_quota: number
  model_mapping: string | null
  priority: number | null
  config: string
  system_prompt: string | null
}

export const LogType = {
  Unknown: 0,
  Topup: 1,
  Consume: 2,
  Manage: 3,
  System: 4,
  Test: 5,
} as const

export interface Log {
  id: number
  user_id: number
  created_at: number
  type: number
  content: string
  username: string
  token_name: string
  model_name: string
  quota: number
  prompt_tokens: number
  completion_tokens: number
  channel: number
  request_id: string
  elapsed_time: number // ms
  is_stream: boolean
  system_prompt_reset: boolean
}

export interface LogFilters {
  p?: number
  type?: number
  start_timestamp?: number
  end_timestamp?: number
  token_name?: string
  model_name?: string
  username?: string
  channel?: number
}

/** OpenAI-format model row returned by `GET /api/channel/models`. */
export interface ChannelModel {
  id: string
  object: string
  created: number
  owned_by: string
  parent: string | null
  permission: unknown[]
  root: string
}

/** Per-day per-model log aggregate returned by `GET /api/user/dashboard`. */
export interface DashboardEntry {
  Day: string
  ModelName: string
  RequestCount: number
  Quota: number
  PromptTokens: number
  CompletionTokens: number
}

export interface Redemption {
  id: number
  user_id: number
  key: string
  status: number
  name: string
  quota: number
  created_time: number
  redeemed_time: number
  count?: number
}
