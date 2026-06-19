import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AxiosResponse } from 'axios'
import type { ApiResponse, Channel } from '@/lib/types'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: { get: vi.fn() } }
})

import { api } from '@/lib/api'
import { channelsService } from './channels'

const mockGet = vi.mocked(api.get)

const ok = (data: Channel[]) =>
  ({ data: { success: true, message: '', data }, status: 200 }) as unknown as AxiosResponse<
    ApiResponse<Channel[]>
  >
const chan = (id: number): Channel => ({ id, models: '' }) as unknown as Channel

describe('channelsService.listAll', () => {
  beforeEach(() => mockGet.mockReset())

  it('returns [] when the first page is empty', async () => {
    mockGet.mockResolvedValueOnce(ok([]))
    expect(await channelsService.listAll()).toEqual([])
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('stops after the first short page', async () => {
    mockGet
      .mockResolvedValueOnce(ok([chan(1), chan(2), chan(3)])) // full page (size 3)
      .mockResolvedValueOnce(ok([chan(4)])) // short → last
    const all = await channelsService.listAll()
    expect(all.map((c) => c.id)).toEqual([1, 2, 3, 4])
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  it('keeps paging while pages stay full and stops on an empty tail page', async () => {
    mockGet
      .mockResolvedValueOnce(ok([chan(1), chan(2)])) // full (size 2)
      .mockResolvedValueOnce(ok([chan(3), chan(4)])) // full
      .mockResolvedValueOnce(ok([])) // empty tail
    const all = await channelsService.listAll()
    expect(all.map((c) => c.id)).toEqual([1, 2, 3, 4])
    expect(mockGet).toHaveBeenCalledTimes(3)
  })
})
