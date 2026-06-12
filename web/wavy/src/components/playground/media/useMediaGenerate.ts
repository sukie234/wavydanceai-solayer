import { useCallback, useEffect, useRef, useState } from 'react'
import type { ModelSpec } from '../modelSpecs'
import { buildRequestBody } from '../modelSpecs'
import type { MediaResult } from './types'

interface GenerateArgs {
  apiKey: string
  spec: ModelSpec
  model: string
  prompt: string
  params: Record<string, unknown>
  /** Called once when an async task is created, with the relay task id. */
  onTask?: (taskId: string) => void
}

/** Live state of an in-flight async video task, for progress display. */
export interface TaskState {
  id: string
  status: 'queued' | 'in_progress'
  progress: number
}

interface UseMediaGenerate {
  busy: boolean
  error: string | null
  /** Non-null while an async video task is being polled. */
  task: TaskState | null
  /**
   * Submits a generation request and resolves with the parsed result URLs.
   * Throws on network / API error so the caller can mark the job as failed.
   */
  generate: (args: GenerateArgs) => Promise<MediaResult[]>
  abort: () => void
}

const POLL_INTERVAL_MS = 5_000
const POLL_TIMEOUT_MS = 5 * 60_000

/**
 * Submits a one-shot generation request against the spec's relay endpoint.
 *
 * Two response styles are supported:
 *
 *   - Synchronous (images): OpenAI `{ data: [{ url } | { b64_json }] }` and a
 *     few permissive variants — resolved immediately.
 *   - Async video tasks (OpenAI Video, `POST /v1/videos`): the submit returns
 *     `{ id, object: "video", status: "queued" }`; we poll
 *     `GET /v1/videos/:id` until `completed` (URL in `metadata.url`) or
 *     `failed` (message in `error.message`). Polling stops on abort/unmount
 *     and gives up after {@link POLL_TIMEOUT_MS} — the task keeps running
 *     server-side.
 */
export function useMediaGenerate(): UseMediaGenerate {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [task, setTask] = useState<TaskState | null>(null)
  const ctrlRef = useRef<AbortController | null>(null)

  const abort = useCallback(() => {
    ctrlRef.current?.abort()
    ctrlRef.current = null
  }, [])

  // Stop any in-flight polling when the component unmounts.
  useEffect(() => () => ctrlRef.current?.abort(), [])

  const generate = useCallback(async (args: GenerateArgs): Promise<MediaResult[]> => {
    const { apiKey, spec, model, prompt, params } = args
    setError(null)
    setBusy(true)
    const ctrl = new AbortController()
    ctrlRef.current = ctrl

    try {
      const body = buildRequestBody(spec, model, prompt, params)
      const data = await fetchJson(spec.endpoint, apiKey, ctrl.signal, body)

      const videoTask = parseVideoTask(data)
      if (videoTask) {
        args.onTask?.(videoTask.id)
        return await pollVideoTask(videoTask, apiKey, ctrl.signal, setTask)
      }

      const results = parseResults(data)
      if (results.length === 0) {
        // kie-style providers return a task id against a /task endpoint we
        // don't poll; surface that explicitly rather than appearing stuck.
        const taskId = extractTaskId(data)
        if (taskId) {
          throw new Error(`async task ${taskId} — polling not yet implemented`)
        }
        throw new Error('upstream returned no media URLs')
      }
      return results
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') {
        return []
      }
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      throw e
    } finally {
      setBusy(false)
      setTask(null)
      ctrlRef.current = null
    }
  }, [])

  return { busy, error, task, generate, abort }
}

/**
 * Issues an authenticated request and decodes the JSON body, throwing the
 * relay's error message on non-2xx responses.
 */
async function fetchJson(
  url: string,
  apiKey: string,
  signal: AbortSignal,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer sk-${apiKey}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal,
  })
  const text = await res.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`upstream returned non-JSON: ${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    throw new Error(extractError(data) ?? `HTTP ${res.status}`)
  }
  return data
}

/** Decoded OpenAI Video task response (`object: "video"`). */
interface VideoTask {
  id: string
  status: string
  progress: number
  url: string | null
  errorMessage: string | null
}

function parseVideoTask(data: unknown): VideoTask | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (d.object !== 'video' || typeof d.id !== 'string' || typeof d.status !== 'string') {
    return null
  }
  const metadata = d.metadata as Record<string, unknown> | undefined
  const err = d.error as Record<string, unknown> | undefined
  return {
    id: d.id,
    status: d.status,
    progress: typeof d.progress === 'number' ? d.progress : 0,
    url: metadata && typeof metadata.url === 'string' ? metadata.url : null,
    errorMessage: err && typeof err.message === 'string' ? err.message : null,
  }
}

/**
 * Polls `GET /v1/videos/:id` until the task settles. `setTask` receives live
 * queued / in_progress states for the UI and is cleared by the caller.
 */
async function pollVideoTask(
  first: VideoTask,
  apiKey: string,
  signal: AbortSignal,
  setTask: (t: TaskState | null) => void,
): Promise<MediaResult[]> {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  let current = first
  for (;;) {
    if (current.status === 'completed') {
      if (!current.url) {
        throw new Error(`video task ${current.id} completed without a result URL`)
      }
      return [{ url: current.url, receivedAt: Date.now() }]
    }
    if (current.status === 'failed') {
      throw new Error(current.errorMessage ?? 'video generation failed')
    }
    setTask({
      id: current.id,
      status: current.status === 'in_progress' ? 'in_progress' : 'queued',
      progress: current.progress,
    })
    if (Date.now() >= deadline) {
      throw new Error(
        `video task ${current.id} still running after ${POLL_TIMEOUT_MS / 60_000} min — it may finish later`,
      )
    }
    await sleep(POLL_INTERVAL_MS, signal)
    const data = await fetchJson(`/v1/videos/${encodeURIComponent(current.id)}`, apiKey, signal)
    const next = parseVideoTask(data)
    if (!next) {
      throw new Error('unexpected response while polling video task')
    }
    current = next
  }
}

/** Abortable sleep — rejects with an AbortError when the signal fires. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('aborted', 'AbortError'))
    }
    if (signal.aborted) {
      onAbort()
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function extractError(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const err = d.error
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as Record<string, unknown>).message)
  }
  if (typeof d.message === 'string') return d.message
  return null
}

function extractTaskId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const candidate = d.data ?? d
  if (candidate && typeof candidate === 'object') {
    const c = candidate as Record<string, unknown>
    if (typeof c.taskId === 'string') return c.taskId
    if (typeof c.task_id === 'string') return c.task_id
    if (typeof c.id === 'string') return c.id
  }
  return null
}

function parseResults(data: unknown): MediaResult[] {
  if (!data || typeof data !== 'object') return []
  const root = data as Record<string, unknown>
  const now = Date.now()

  // OpenAI / OpenAI-compatible: { data: [{ url } | { b64_json }] }
  if (Array.isArray(root.data)) {
    const items = root.data as Array<Record<string, unknown>>
    const out: MediaResult[] = []
    for (const item of items) {
      if (typeof item.url === 'string') {
        out.push({ url: item.url, receivedAt: now })
      } else if (typeof item.b64_json === 'string') {
        out.push({
          url: `data:image/png;base64,${item.b64_json}`,
          b64: item.b64_json,
          receivedAt: now,
        })
      }
    }
    if (out.length > 0) return out
  }

  // Synchronous task-style: { data: { output: [url] | url } }
  if (root.data && typeof root.data === 'object') {
    const d = root.data as Record<string, unknown>
    const output = d.output ?? d.video_url ?? d.image_url ?? d.url
    if (typeof output === 'string') {
      return [{ url: output, receivedAt: now }]
    }
    if (Array.isArray(output)) {
      return output
        .filter((u): u is string => typeof u === 'string')
        .map((u) => ({ url: u, receivedAt: now }))
    }
  }

  // Some providers return a flat { url }.
  if (typeof root.url === 'string') {
    return [{ url: root.url, receivedAt: now }]
  }
  return []
}
