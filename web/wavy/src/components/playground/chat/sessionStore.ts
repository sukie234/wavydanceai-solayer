import type { ChatSession } from './types'
import { DEFAULT_PARAMS } from './types'
import { readSessions, sessionUuid, writeSessions } from '../sessionStorage'

const STORAGE_KEY = 'playground.chat.sessions.v1'
const MAX_SESSIONS = 50

function load(): ChatSession[] {
  return readSessions<ChatSession>(STORAGE_KEY)
}

function persist(sessions: ChatSession[]): void {
  writeSessions(STORAGE_KEY, sessions.slice(0, MAX_SESSIONS))
}

export const sessionStore = {
  list(): ChatSession[] {
    return load().sort((a, b) => b.updatedAt - a.updatedAt)
  },

  create(defaultModel: string): ChatSession {
    const session: ChatSession = {
      id: sessionUuid('s'),
      title: 'New chat',
      model: defaultModel,
      systemPrompt: '',
      params: { ...DEFAULT_PARAMS },
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    persist([session, ...load()])
    return session
  },

  save(session: ChatSession): void {
    const all = load().filter((s) => s.id !== session.id)
    persist([{ ...session, updatedAt: Date.now() }, ...all])
  },

  remove(id: string): void {
    persist(load().filter((s) => s.id !== id))
  },
}
