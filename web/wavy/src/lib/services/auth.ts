import { api, unwrap } from '@/lib/api'
import type { ApiResponse, User } from '@/lib/types'

/** Discriminant returned when the user has TOTP enabled — caller must then
 *  call `twofaService.verifyLogin(code)` to finish authentication. */
export interface TwoFAChallenge {
  two_fa_required: true
  /** New in P1 — present when backend supports method choice. May be absent
   *  on older deployments, in which case fall back to "totp". */
  two_factor_required?: true
  methods?: Array<'totp' | 'passkey'>
}

export function isTwoFAChallenge(r: User | TwoFAChallenge): r is TwoFAChallenge {
  return (r as TwoFAChallenge).two_fa_required === true
}

export const authService = {
  async login(username: string, password: string): Promise<User | TwoFAChallenge> {
    const res = await api.post<ApiResponse<User | TwoFAChallenge>>('/user/login', {
      username,
      password,
    })
    return unwrap(res)
  },

  /**
   * Self-service registration. Backend gates this on RegisterEnabled +
   * PasswordRegisterEnabled options; both default to true. When admin
   * enables email verification, callers must also pass `email` +
   * `verification_code`.
   */
  async register(input: {
    username: string
    password: string
    email?: string
    verification_code?: string
    aff_code?: string
  }): Promise<void> {
    const res = await api.post<ApiResponse>('/user/register', input)
    unwrap(res)
  },

  async logout(): Promise<void> {
    await api.get('/user/logout')
  },

  async getSelf(): Promise<User | null> {
    try {
      const res = await api.get<ApiResponse<User>>('/user/self')
      return res.data.success ? res.data.data ?? null : null
    } catch {
      return null
    }
  },

  /**
   * Update the signed-in user's own profile. The backend `PUT /api/user/self`
   * accepts {username, display_name, password}. Email is NOT mutable via this
   * endpoint — it's bound at registration / email verification only. Leave
   * `password` empty to keep the current one.
   */
  async updateSelf(input: { username: string; display_name?: string; password?: string }): Promise<void> {
    const res = await api.put<ApiResponse>('/user/self', input)
    unwrap(res)
  },

  /** Send a 6-digit registration verification code to the given email. The
   *  backend (a) checks domain whitelist + already-taken, (b) stores the code
   *  in Redis keyed by email, (c) sends via configured SMTP. Throws on
   *  validation / SMTP failure with a human-readable message. */
  async sendVerificationCode(email: string): Promise<void> {
    const res = await api.get<ApiResponse>('/verification', { params: { email } })
    unwrap(res)
  },

  /** Send a password-reset link to the given email. Backend mails a one-time
   *  token; the link points at /reset-password?email=...&token=... which is
   *  handled by the corresponding route. */
  async sendPasswordResetEmail(email: string): Promise<void> {
    const res = await api.get<ApiResponse>('/reset_password', { params: { email } })
    unwrap(res)
  },

  /** Submit a new password for the given email using the one-time token from
   *  the reset email. Backend invalidates the token on success. */
  async resetPassword(email: string, token: string): Promise<{ password: string }> {
    const res = await api.post<ApiResponse<string>>('/user/reset', { email, token })
    const password = unwrap(res)
    if (typeof password !== 'string') throw new Error('reset password: unexpected response')
    return { password }
  },
}
