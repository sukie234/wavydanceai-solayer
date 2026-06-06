import { api, unwrap } from '@/lib/api'
import type { ApiResponse, User } from '@/lib/types'

/** Discriminant returned when the user has TOTP enabled — caller must then
 *  call `twofaService.verifyLogin(code)` to finish authentication. */
export interface TwoFAChallenge {
  two_fa_required: true
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
}
