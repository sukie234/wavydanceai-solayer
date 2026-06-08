import type { MediaSession } from './types'
import type { Modality } from '../modelSpecs'
import { defaultParamsFor, resolveModelSpec } from '../modelSpecs'

const MAX_SESSIONS = 30
const MAX_JOBS_PER_SESSION = 50

function storageKey(modality: Modality): string {
  return `playground.${modality}.sessions.v1`
}

function safeGet(modality: Modality): MediaSession[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(storageKey(modality))
    if (!raw) return []
    const parsed = JSON.parse(raw) as MediaSession[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function safeSet(modality: Modality, sessions: MediaSession[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    const capped = sessions.slice(0, MAX_SESSIONS).map((s) => ({
      ...s,
      // Cap jobs per session so localStorage doesn't bloat over time.
      jobs: s.jobs.slice(-MAX_JOBS_PER_SESSION),
    }))
    localStorage.setItem(storageKey(modality), JSON.stringify(capped))
  } catch {
    // Quota exceeded or private mode — silently drop.
  }
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export const mediaSessionStore = {
  list(modality: Modality): MediaSession[] {
    return safeGet(modality).sort((a, b) => b.updatedAt - a.updatedAt)
  },

  create(modality: Modality, defaultModel: string): MediaSession {
    const spec = resolveModelSpec(modality, defaultModel)
    const session: MediaSession = {
      id: uuid(),
      modality,
      title: modality === 'image' ? 'New image' : 'New video',
      model: defaultModel,
      params: defaultParamsFor(spec),
      jobs: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    safeSet(modality, [session, ...safeGet(modality)])
    return session
  },

  save(modality: Modality, session: MediaSession): void {
    const all = safeGet(modality).filter((s) => s.id !== session.id)
    safeSet(modality, [{ ...session, updatedAt: Date.now() }, ...all])
  },

  remove(modality: Modality, id: string): void {
    safeSet(modality, safeGet(modality).filter((s) => s.id !== id))
  },

  newJob(prompt: string, model: string, params: Record<string, unknown>): MediaSession['jobs'][number] {
    return {
      id: uuid(),
      prompt,
      model,
      params,
      status: 'pending',
      results: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  },
}
