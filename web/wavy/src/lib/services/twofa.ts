import { api, unwrap } from '@/lib/api'
import type { ApiResponse } from '@/lib/types'

export interface TwoFAStatus {
  enabled: boolean
  backup_codes_remaining: number
}

export interface TwoFASetupArtifact {
  secret: string
  otpauth_url: string
  /** base64-encoded PNG. Drop into <img src={`data:image/png;base64,${qr}`} /> */
  qr_png_b64: string
  backup_codes: string[]
}

export const twofaService = {
  async status(): Promise<TwoFAStatus> {
    const res = await api.get<ApiResponse<TwoFAStatus>>('/user/2fa/status')
    return unwrap(res)
  },

  /** Stage 1 of enrolment — returns secret + QR + plaintext recovery codes. */
  async setup(): Promise<TwoFASetupArtifact> {
    const res = await api.post<ApiResponse<TwoFASetupArtifact>>('/user/2fa/setup', {})
    return unwrap(res)
  },

  /** Stage 2 — confirm the code from the authenticator app to activate. */
  async enable(code: string): Promise<void> {
    const res = await api.post<ApiResponse>('/user/2fa/enable', { code })
    unwrap(res)
  },

  /** Disable; requires a current TOTP or recovery code. */
  async disable(code: string): Promise<void> {
    const res = await api.post<ApiResponse>('/user/2fa/disable', { code })
    unwrap(res)
  },

  /** Generate a fresh batch of recovery codes; invalidates the old ones. */
  async regenerateBackupCodes(code: string): Promise<string[]> {
    const res = await api.post<ApiResponse<{ backup_codes: string[] }>>('/user/2fa/backup-codes', { code })
    return unwrap(res).backup_codes
  },

  /** Step 2 of login — submit TOTP / recovery code after password step. */
  async verifyLogin(code: string): Promise<void> {
    const res = await api.post<ApiResponse>('/user/login/2fa', { code })
    unwrap(res)
  },
}
