import { api, unwrap } from '@/lib/api'
import type { ApiResponse, User } from '@/lib/types'

export const authService = {
  async login(username: string, password: string): Promise<User> {
    const res = await api.post<ApiResponse<User>>('/user/login', { username, password })
    return unwrap(res)
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
}
