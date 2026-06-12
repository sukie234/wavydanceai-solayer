import type { Modality } from '../modelSpecs'

export type MediaJobStatus = 'idle' | 'pending' | 'succeeded' | 'failed'

export interface MediaResult {
  /** Output URL for the generated image / video. */
  url: string
  /** Optional base64-encoded payload for image responses that opt into it. */
  b64?: string
  /** When the result first arrived locally (ms). */
  receivedAt: number
}

export interface MediaJob {
  id: string
  prompt: string
  model: string
  /** Wire params snapshot — what we actually sent. */
  params: Record<string, unknown>
  status: MediaJobStatus
  /** Relay task id for async video jobs (`POST /v1/videos`). */
  taskId?: string
  /** Populated when status === 'succeeded'. */
  results: MediaResult[]
  /** Populated when status === 'failed'. */
  error?: string
  createdAt: number
  updatedAt: number
}

export interface MediaSession {
  id: string
  modality: Modality
  title: string
  model: string
  /** Latest params snapshot for this model — re-applied when reopening. */
  params: Record<string, unknown>
  jobs: MediaJob[]
  createdAt: number
  updatedAt: number
}
