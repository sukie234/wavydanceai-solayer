import { api, unwrap } from '@/lib/api'
import type { ApiResponse, User } from '@/lib/types'

/** Action verbs accepted by POST /api/user/manage. */
export type UserAction = 'enable' | 'disable' | 'promote' | 'demote' | 'delete'

export const usersService = {
  async list(p = 0, order = ''): Promise<User[]> {
    const res = await api.get<ApiResponse<User[]>>('/user/', { params: { p, order } })
    return unwrap(res) ?? []
  },

  async get(id: number): Promise<User> {
    const res = await api.get<ApiResponse<User>>(`/user/${id}`)
    return unwrap(res)
  },

  async create(user: Partial<User> & { password: string }): Promise<void> {
    const res = await api.post<ApiResponse>('/user/', user)
    unwrap(res)
  },

  /** Admin update. The backend binds the whole User struct — pass only the
   * fields you want changed plus `id`. Leave `password` empty to keep the
   * current one (backend special-cases an "$I_LOVE_U" sentinel internally). */
  async update(user: Partial<User> & { id: number }): Promise<void> {
    const res = await api.put<ApiResponse>('/user/', user)
    unwrap(res)
  },

  async manage(username: string, action: UserAction): Promise<void> {
    const res = await api.post<ApiResponse>('/user/manage', { username, action })
    unwrap(res)
  },

  async remove(id: number): Promise<void> {
    const res = await api.delete<ApiResponse>(`/user/${id}`)
    unwrap(res)
  },
}

export const ROLE_LABEL: Record<number, string> = {
  1: 'user',
  10: 'admin',
  100: 'root',
}

export const adminPasskeyService = {
  async deleteOne(userId: number, credId: number): Promise<void> {
    const res = await api.delete<ApiResponse>(`/user/${userId}/passkeys/${credId}`)
    unwrap(res)
  },
  async clear(userId: number): Promise<void> {
    const res = await api.delete<ApiResponse>(`/user/${userId}/passkeys`)
    unwrap(res)
  },
}
