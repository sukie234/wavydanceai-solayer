import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMediaGenerate } from './useMediaGenerate'
import { resolveModelSpec } from '../modelSpecs'
import type { MediaResult } from './types'

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

describe('useMediaGenerate — async video tasks (POST /v1/videos)', () => {
  const originalFetch = globalThis.fetch
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    vi.useRealTimers()
    globalThis.fetch = originalFetch
  })

  const jsonRes = (payload: unknown, ok = true, status = 200) => ({
    ok,
    status,
    text: () => Promise.resolve(JSON.stringify(payload)),
  })

  const videoTask = (status: string, extra: Record<string, unknown> = {}) => ({
    id: 'task_1',
    object: 'video',
    model: 'seedance-2.0',
    status,
    progress: 0,
    created_at: 1765432100,
    ...extra,
  })

  const seedanceArgs = (overrides: Record<string, unknown> = {}) => ({
    apiKey: 'rawkey',
    spec: resolveModelSpec('video', 'seedance-2.0'),
    model: 'seedance-2.0',
    prompt: 'a corgi running on the beach',
    params: { resolution: '720p', ratio: 'adaptive', seconds: 5, watermark: false },
    ...overrides,
  })

  it('submits, polls every 5s and resolves with metadata.url on completion', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes(videoTask('queued')))
      .mockResolvedValueOnce(jsonRes(videoTask('in_progress', { progress: 40 })))
      .mockResolvedValueOnce(
        jsonRes(
          videoTask('completed', {
            progress: 100,
            completed_at: 1765432200,
            metadata: { url: 'https://cdn.example.com/v.mp4' },
          }),
        ),
      )
    const onTask = vi.fn()
    const { result } = renderHook(() => useMediaGenerate())
    let p!: Promise<MediaResult[]>
    act(() => {
      p = result.current.generate(seedanceArgs({ onTask }))
    })

    // POST settles → task is queued, first poll timer armed.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(onTask).toHaveBeenCalledWith('task_1')
    expect(result.current.task).toEqual({ id: 'task_1', status: 'queued', progress: 0 })

    // First poll → in_progress with backend-reported progress.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(result.current.task).toEqual({ id: 'task_1', status: 'in_progress', progress: 40 })

    // Second poll → completed.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    const urls = await p
    expect(urls).toEqual([
      expect.objectContaining({ url: 'https://cdn.example.com/v.mp4' }),
    ])
    expect(result.current.task).toBeNull()
    expect(result.current.busy).toBe(false)

    // Submit hits /v1/videos; polls hit GET /v1/videos/:id with the same auth.
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const [submitUrl, submitInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(submitUrl).toBe('/v1/videos')
    expect(JSON.parse(submitInit.body as string)).toMatchObject({ seconds: '5' })
    const [pollUrl, pollInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(pollUrl).toBe('/v1/videos/task_1')
    expect(pollInit.method).toBe('GET')
    expect((pollInit.headers as Record<string, string>).Authorization).toBe('Bearer sk-rawkey')
  })

  it('rejects with error.message when the task fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes(videoTask('queued')))
      .mockResolvedValueOnce(
        jsonRes(
          videoTask('failed', {
            error: { message: 'The output video may contain sensitive information', type: 'video_generation_error' },
          }),
        ),
      )
    const { result } = renderHook(() => useMediaGenerate())
    let p!: Promise<MediaResult[]>
    act(() => {
      p = result.current.generate(seedanceArgs())
    })
    p.catch(() => {}) // avoid unhandled rejection before the assertion below
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    await expect(p).rejects.toThrow('sensitive information')
    expect(result.current.error).toContain('sensitive information')
    expect(result.current.task).toBeNull()
  })

  it('stops polling on abort and resolves empty', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(videoTask('queued')))
    const { result } = renderHook(() => useMediaGenerate())
    let p!: Promise<MediaResult[]>
    act(() => {
      p = result.current.generate(seedanceArgs())
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0) // POST settled, now sleeping
    })
    act(() => {
      result.current.abort()
    })
    let urls: MediaResult[] = []
    await act(async () => {
      urls = await p
    })
    expect(urls).toEqual([])
    // No further polls fire even if time keeps passing.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
  })

  it('gives up after the 5-minute polling cap', async () => {
    fetchMock.mockResolvedValue(jsonRes(videoTask('queued')))
    const { result } = renderHook(() => useMediaGenerate())
    let p!: Promise<MediaResult[]>
    act(() => {
      p = result.current.generate(seedanceArgs())
    })
    p.catch(() => {})
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000 + 10_000)
    })
    await expect(p).rejects.toThrow(/still running/)
    expect(result.current.task).toBeNull()
  })

  it('surfaces relay errors from the poll endpoint', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes(videoTask('queued')))
      .mockResolvedValueOnce(jsonRes({ error: { message: '任务不存在' } }, false, 404))
    const { result } = renderHook(() => useMediaGenerate())
    let p!: Promise<MediaResult[]>
    act(() => {
      p = result.current.generate(seedanceArgs())
    })
    p.catch(() => {})
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    await expect(p).rejects.toThrow('任务不存在')
  })
})
