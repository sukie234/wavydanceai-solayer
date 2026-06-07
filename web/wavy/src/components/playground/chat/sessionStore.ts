import type { ChatSession } from './types'
import { DEFAULT_PARAMS } from './types'

const STORAGE_KEY = 'playground.chat.sessions.v1'
const MAX_SESSIONS = 50

function safeGet(): ChatSession[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ChatSession[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function safeSet(sessions: ChatSession[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    const capped = sessions.slice(0, MAX_SESSIONS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped))
  } catch {
    // Quota exceeded or private mode — silently drop. Conversations are best-effort.
  }
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export const sessionStore = {
  list(): ChatSession[] {
    return safeGet().sort((a, b) => b.updatedAt - a.updatedAt)
  },

  create(defaultModel: string): ChatSession {
    const session: ChatSession = {
      id: uuid(),
      title: 'New chat',
      model: defaultModel,
      systemPrompt: '',
      params: { ...DEFAULT_PARAMS },
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    safeSet([session, ...safeGet()])
    return session
  },

  save(session: ChatSession): void {
    const all = safeGet().filter((s) => s.id !== session.id)
    safeSet([{ ...session, updatedAt: Date.now() }, ...all])
  },

  remove(id: string): void {
    safeSet(safeGet().filter((s) => s.id !== id))
  },
}
