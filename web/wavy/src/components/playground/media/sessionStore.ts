import type { MediaSession } from './types'
import type { Modality } from '../modelSpecs'
import { defaultParamsFor, resolveModelSpec } from '../modelSpecs'
import { readSessions, sessionUuid, writeSessions } from '../sessionStorage'

const MAX_SESSIONS = 30
const MAX_JOBS_PER_SESSION = 50

function storageKey(modality: Modality): string {
  return `playground.${modality}.sessions.v1`
}

function load(modality: Modality): MediaSession[] {
  return readSessions<MediaSession>(storageKey(modality))
}

function persist(modality: Modality, sessions: MediaSession[]): void {
  // Cap jobs per session so localStorage doesn't bloat over time.
  const capped = sessions.slice(0, MAX_SESSIONS).map((s) => ({
    ...s,
    jobs: s.jobs.slice(-MAX_JOBS_PER_SESSION),
  }))
  writeSessions(storageKey(modality), capped)
}

export const mediaSessionStore = {
  list(modality: Modality): MediaSession[] {
    return load(modality).sort((a, b) => b.updatedAt - a.updatedAt)
  },

  create(modality: Modality, defaultModel: string): MediaSession {
    const spec = resolveModelSpec(modality, defaultModel)
    const session: MediaSession = {
      id: sessionUuid('m'),
      modality,
      title: modality === 'image' ? 'New image' : 'New video',
      model: defaultModel,
      params: defaultParamsFor(spec),
      jobs: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    persist(modality, [session, ...load(modality)])
    return session
  },

  save(modality: Modality, session: MediaSession): void {
    const all = load(modality).filter((s) => s.id !== session.id)
    persist(modality, [{ ...session, updatedAt: Date.now() }, ...all])
  },

  remove(modality: Modality, id: string): void {
    persist(modality, load(modality).filter((s) => s.id !== id))
  },

  newJob(prompt: string, model: string, params: Record<string, unknown>): MediaSession['jobs'][number] {
    return {
      id: sessionUuid('m'),
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
