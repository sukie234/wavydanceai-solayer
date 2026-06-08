/**
 * Storage helpers shared by chat + media playground session stores.
 *
 * Each playground keeps its own typed wrapper on top of this so we don't bake
 * a "session shape" into the layer that just talks to localStorage.
 */

export function readSessions<T>(key: string): T[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as T[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeSessions<T>(key: string, sessions: T[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(sessions))
  } catch {
    // Quota exceeded or private mode — silently drop. Sessions are best-effort.
  }
}

/** RFC 4122 v4 when available, with a short random fallback for older runtimes. */
export function sessionUuid(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
