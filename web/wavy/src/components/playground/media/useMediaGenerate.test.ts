import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMediaGenerate } from './useMediaGenerate'
import { resolveModelSpec } from '../modelSpecs'

describe('useMediaGenerate', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('parses an OpenAI-shaped image response', async () => {
    ;(globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            data: [{ url: 'https://cdn.example.com/a.png' }],
          }),
        ),
    })
    const { result } = renderHook(() => useMediaGenerate())
    let urls: { url: string }[] = []
    await act(async () => {
      urls = await result.current.generate({
        apiKey: 'k',
        spec: resolveModelSpec('image', 'dall-e-3'),
        model: 'dall-e-3',
        prompt: 'a cat',
        params: { size: '1024x1024' },
      })
    })
    expect(urls).toEqual([
      expect.objectContaining({ url: 'https://cdn.example.com/a.png' }),
    ])
  })

  it('decodes a b64_json response into a data URL', async () => {
    ;(globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({ data: [{ b64_json: 'ABCD' }] }),
        ),
    })
    const { result } = renderHook(() => useMediaGenerate())
    let urls: { url: string }[] = []
    await act(async () => {
      urls = await result.current.generate({
        apiKey: 'k',
        spec: resolveModelSpec('image', 'dall-e-3'),
        model: 'dall-e-3',
        prompt: 'a cat',
        params: {},
      })
    })
    expect(urls[0].url).toBe('data:image/png;base64,ABCD')
  })

  it('surfaces upstream error messages on non-2xx responses', async () => {
    ;(globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 402,
      text: () =>
        Promise.resolve(
          JSON.stringify({ error: { message: 'insufficient quota' } }),
        ),
    })
    const { result } = renderHook(() => useMediaGenerate())
    await act(async () => {
      await expect(
        result.current.generate({
          apiKey: 'k',
          spec: resolveModelSpec('image', 'dall-e-3'),
          model: 'dall-e-3',
          prompt: 'a cat',
          params: {},
        }),
      ).rejects.toThrow('insufficient quota')
    })
    expect(result.current.error).toBe('insufficient quota')
  })

  it('reports task-style responses as not-yet-implemented', async () => {
    ;(globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: () =>
        Promise.resolve(JSON.stringify({ data: { taskId: 't_123' } })),
    })
    const { result } = renderHook(() => useMediaGenerate())
    await act(async () => {
      await expect(
        result.current.generate({
          apiKey: 'k',
          spec: resolveModelSpec('video', 'kling-2.6/text-to-video'),
          model: 'kling-2.6/text-to-video',
          prompt: 'a robot dog',
          params: { aspect_ratio: '16:9', duration: '5', sound: false },
        }),
      ).rejects.toThrow(/t_123/)
    })
  })

  it('targets the spec endpoint with sk- prefixed bearer auth', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({ data: [{ url: 'https://cdn/x.png' }] }),
        ),
    })
    const { result } = renderHook(() => useMediaGenerate())
    await act(async () => {
      await result.current.generate({
        apiKey: 'rawkey',
        spec: resolveModelSpec('image', 'dall-e-3'),
        model: 'dall-e-3',
        prompt: 'a cat',
        params: {},
      })
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/v1/images/generations')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-rawkey')
  })
})
