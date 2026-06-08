import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChatStream } from './useChatStream'

type StreamChunk = string
function makeSseBody(chunks: StreamChunk[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      for (const c of chunks) {
        controller.enqueue(encoder.encode(c))
      }
      controller.close()
    },
  })
}

function deltaFrame(text: string, finish = false): string {
  return (
    `data: ${JSON.stringify({
      choices: [{ delta: { content: text }, finish_reason: finish ? 'stop' : null }],
    })}\n\n`
  )
}

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('useChatStream', () => {
  it('parses streamed deltas and resolves with full content', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(makeSseBody([deltaFrame('Hel'), deltaFrame('lo!', true), 'data: [DONE]\n\n']), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    ) as unknown as typeof fetch

    const { result } = renderHook(() => useChatStream())
    const chunks: string[] = []
    let full = ''
    await act(async () => {
      full = await result.current.send(
        {
          apiKey: 'k',
          model: 'gpt-4o',
          systemPrompt: '',
          messages: [{ role: 'user', content: 'Hi' }],
          params: { temperature: 0.7, max_tokens: 64, top_p: 1 },
        },
        (chunk) => chunks.push(chunk),
      )
    })
    expect(chunks).toEqual(['Hel', 'lo!'])
    expect(full).toBe('Hello!')
    expect(result.current.streaming).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('captures usage from a trailing usage frame', async () => {
    const usageFrame = `data: ${JSON.stringify({
      choices: [{ delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
    })}\n\n`

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(makeSseBody([deltaFrame('Hi'), usageFrame, 'data: [DONE]\n\n']), {
        status: 200,
      }),
    ) as unknown as typeof fetch

    const { result } = renderHook(() => useChatStream())
    await act(async () => {
      await result.current.send(
        {
          apiKey: 'k',
          model: 'm',
          systemPrompt: '',
          messages: [{ role: 'user', content: 'x' }],
          params: { temperature: 0.7, max_tokens: 64, top_p: 1 },
        },
        () => undefined,
      )
    })
    expect(result.current.usage?.total_tokens).toBe(8)
  })

  it('surfaces upstream HTTP error message in state', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Out of quota' } }), { status: 402 }),
    ) as unknown as typeof fetch

    const { result } = renderHook(() => useChatStream())
    await act(async () => {
      await expect(
        result.current.send(
          {
            apiKey: 'k',
            model: 'm',
            systemPrompt: '',
            messages: [{ role: 'user', content: 'x' }],
            params: { temperature: 0.7, max_tokens: 64, top_p: 1 },
          },
          () => undefined,
        ),
      ).rejects.toThrow(/Out of quota/)
    })
    expect(result.current.error).toBe('Out of quota')
    expect(result.current.streaming).toBe(false)
  })

  it('treats stop() as graceful abort, not error', async () => {
    // A fetch that never resolves until aborted.
    globalThis.fetch = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted') as Error & { name: string }
            err.name = 'AbortError'
            reject(err)
          })
        }),
    ) as unknown as typeof fetch

    const { result } = renderHook(() => useChatStream())
    let sendPromise: Promise<string> | undefined
    act(() => {
      sendPromise = result.current.send(
        {
          apiKey: 'k',
          model: 'm',
          systemPrompt: '',
          messages: [{ role: 'user', content: 'x' }],
          params: { temperature: 0.7, max_tokens: 64, top_p: 1 },
        },
        () => undefined,
      )
    })
    let got = ''
    await act(async () => {
      result.current.stop()
      got = (await sendPromise) ?? ''
    })
    expect(got).toBe('')
    expect(result.current.error).toBeNull()
    expect(result.current.streaming).toBe(false)
  })
})
