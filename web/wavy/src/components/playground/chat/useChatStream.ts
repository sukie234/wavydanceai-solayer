import { useCallback, useRef, useState } from 'react'
import type { ChatMessage, ChatParams } from './types'

export interface ChatUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

interface StreamArgs {
  apiKey: string
  model: string
  systemPrompt: string
  messages: ChatMessage[]
  params: ChatParams
}

interface UseChatStream {
  streaming: boolean
  error: string | null
  usage: ChatUsage | null
  /** Streams a completion, calling `onDelta` for each text chunk. Resolves
   *  with the full assistant message text. Throws on network / API error. */
  send: (args: StreamArgs, onDelta: (chunk: string) => void) => Promise<string>
  /** Aborts an in-flight stream. No-op when idle. */
  stop: () => void
}

const RELAY_BASE = '/v1'

/** Parse a single SSE `data:` payload from /v1/chat/completions and return
 *  the incremental text content (may be empty for non-content chunks). */
function extractDelta(payload: string): { text: string; usage?: ChatUsage; done: boolean } {
  if (payload === '[DONE]') return { text: '', done: true }
  try {
    const json = JSON.parse(payload) as {
      choices?: { delta?: { content?: string }; finish_reason?: string | null }[]
      usage?: ChatUsage
    }
    const choice = json.choices?.[0]
    return {
      text: choice?.delta?.content ?? '',
      usage: json.usage,
      done: choice?.finish_reason != null,
    }
  } catch {
    // Some upstreams emit keep-alive comments or partial frames; ignore.
    return { text: '', done: false }
  }
}

export function useChatStream(): UseChatStream {
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usage, setUsage] = useState<ChatUsage | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const send = useCallback(async (args: StreamArgs, onDelta: (chunk: string) => void): Promise<string> => {
    const { apiKey, model, systemPrompt, messages, params } = args
    setError(null)
    setUsage(null)
    setStreaming(true)

    const ctrl = new AbortController()
    abortRef.current = ctrl

    const wireMessages: ChatMessage[] = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages

    try {
      const res = await fetch(`${RELAY_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer sk-${apiKey}`,
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model,
          messages: wireMessages,
          stream: true,
          temperature: params.temperature,
          max_tokens: params.max_tokens,
          top_p: params.top_p,
        }),
        signal: ctrl.signal,
      })

      if (!res.ok || !res.body) {
        // Surface the upstream error message if there is one.
        let msg = `HTTP ${res.status}`
        try {
          const data = (await res.json()) as { error?: { message?: string } }
          if (data.error?.message) msg = data.error.message
        } catch {
          /* ignore */
        }
        throw new Error(msg)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let full = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })

        // SSE frames are separated by blank lines; lines starting with "data:"
        // carry the payload. There can be multiple data: lines per frame.
        let nl: number
        while ((nl = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (!payload) continue
          const { text, usage: chunkUsage, done: chunkDone } = extractDelta(payload)
          if (text) {
            full += text
            onDelta(text)
          }
          if (chunkUsage) setUsage(chunkUsage)
          if (chunkDone) {
            // Don't break here — some providers emit a trailing usage frame
            // after the finish_reason. Let the reader drain naturally.
          }
        }
      }
      return full
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') {
        return '' // user-initiated stop is not an error
      }
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      throw e
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [])

  return { streaming, error, usage, send, stop }
}
