import { api, unwrap } from '@/lib/api'
import type { ApiResponse } from '@/lib/types'

/**
 * Shape of GET /api/status. The backend exposes every public-facing
 * deployment switch here — most importantly which OAuth providers are
 * enabled, so the login / register pages can render the right buttons.
 */
export interface StatusInfo {
  system_name: string
  logo: string
  footer_html: string
  server_address: string
  start_time: number
  version: string

  // Sign-in / sign-up gates
  email_verification: boolean
  turnstile_check: boolean
  turnstile_site_key: string
  passkey_login?: boolean

  // OAuth providers
  github_oauth: boolean
  github_client_id: string
  google_oauth: boolean
  google_client_id: string
  oidc: boolean
  oidc_client_id: string
  oidc_well_known: string
  oidc_authorization_endpoint: string
  oidc_token_endpoint: string
  oidc_userinfo_endpoint: string
  wechat_login: boolean
  wechat_qrcode: string
  lark_client_id: string

  // Misc, included for completeness
  quota_per_unit: number
  display_in_currency: boolean
  top_up_link: string
  chat_link: string
}

let _cached: Promise<StatusInfo> | null = null

export const statusService = {
  /** Cached because nearly every page calls this and the data rarely changes. */
  async get(): Promise<StatusInfo> {
    if (!_cached) {
      _cached = api.get<ApiResponse<StatusInfo>>('/status').then(unwrap)
    }
    return _cached
  },

  /** Bust the cache (e.g. after admin updates options). */
  invalidate() {
    _cached = null
  },
}
