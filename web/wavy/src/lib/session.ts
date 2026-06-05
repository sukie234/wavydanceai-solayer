import { authService } from '@/lib/services/auth'
import type { User } from '@/lib/types'

/** A 5-second in-memory cache to keep route guards from hammering /user/self. */
let cached: { user: User | null; at: number } | null = null
const TTL = 5_000

export async function getSession(force = false): Promise<User | null> {
  const now = Date.now()
  if (!force && cached && now - cached.at < TTL) return cached.user
  const user = await authService.getSelf()
  cached = { user, at: now }
  return user
}

export function clearSessionCache() {
  cached = null
}

export function isAdmin(u: User | null | undefined): boolean {
  return !!u && u.role >= 10
}
