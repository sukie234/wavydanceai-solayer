import { useCallback, useRef, useState } from 'react'
import type { ModelSpec } from '../modelSpecs'
import { buildRequestBody } from '../modelSpecs'
import type { MediaResult } from './types'

interface GenerateArgs {
  apiKey: string
  spec: ModelSpec
  model: string
  prompt: string
  params: Record<string, unknown>
}

interface UseMediaGenerate {
  busy: boolean
  error: string | null
  /**
   * Submits a generation request and resolves with the parsed result URLs.
   * Throws on network / API error so the caller can mark the job as failed.
   */
  generate: (args: GenerateArgs) => Promise<MediaResult[]>
  abort: () => void
}

/**
 * Submits a one-shot generation request against the spec's relay endpoint.
 *
 * The response parser is permissive because upstreams disagree on shape:
 *
 *   - OpenAI `/v1/images/generations`: `{ data: [{ url } | { b64_json }] }`
 *   - kie.ai task creation: `{ data: { taskId } }` (async, requires polling
 *     against a /task endpoint we don't yet support — surfaced as an error).
 *   - Some providers return `{ data: { output: [url] } }` synchronously.
 *
 * Anything we can't decode into `{ url | b64 }` triggers an error with the
 * upstream message so the user can debug.
 */
export function useMediaGenerate(): UseMediaGenerate {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ctrlRef = useRef<AbortController | null>(null)

  const abort = useCallback(() => {
    ctrlRef.current?.abort()
    ctrlRef.current = null
  }, [])

  const generate = useCallback(async (args: GenerateArgs): Promise<MediaResult[]> => {
    const { apiKey, spec, model, prompt, params } = args
    setError(null)
    setBusy(true)
    const ctrl = new AbortController()
    ctrlRef.current = ctrl

    try {
      const body = buildRequestBody(spec, model, prompt, params)
      const res = await fetch(spec.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer sk-${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
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
      const results = parseResults(data)
      if (results.length === 0) {
        // Task-based providers return a task id and require polling we don't
        // yet implement; surface that explicitly rather than appearing stuck.
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
      ctrlRef.current = null
    }
  }, [])

  return { busy, error, generate, abort }
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
