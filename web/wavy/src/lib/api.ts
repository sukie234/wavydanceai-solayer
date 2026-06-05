import axios, { type AxiosResponse } from 'axios'
import type { ApiResponse } from './types'

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // session cookie
  timeout: 30_000,
})

/**
 * The Go backend returns 200 with `{success: false, message}` for business errors.
 * Normalize all calls: throw on `success === false`, return `data` on success.
 */
export class ApiError extends Error {
  constructor(public message: string, public status?: number) {
    super(message)
    this.name = 'ApiError'
  }
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      // Skip /user/self probes — those expect 401 for unauthenticated users
      if (!err.config?.url?.includes('/user/self')) {
        const here = window.location.pathname
        if (!here.startsWith('/login')) {
          window.location.href = `/login?next=${encodeURIComponent(here)}`
        }
      }
    }
    return Promise.reject(err)
  },
)

/** Unwrap a response envelope; throw ApiError if backend returned `success: false`. */
export function unwrap<T>(res: AxiosResponse<ApiResponse<T>>): T {
  if (!res.data.success) throw new ApiError(res.data.message || 'request failed', res.status)
  return res.data.data as T
}
