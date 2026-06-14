import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, api: { get: vi.fn(), put: vi.fn() } }
})

import { api } from '@/lib/api'
import { optionsService, optionsToMap, asBool } from './options'

const mockGet = api.get as ReturnType<typeof vi.fn>
const mockPut = api.put as ReturnType<typeof vi.fn>

const ok = <T>(data: T) => ({ data: { success: true, data }, status: 200 })
const fail = (message: string, status = 400) => ({ data: { success: false, message }, status })

beforeEach(() => vi.clearAllMocks())

describe('optionsService.list', () => {
  it('returns the option list and defaults to []', async () => {
    mockGet.mockResolvedValue(ok(null))
    expect(await optionsService.list()).toEqual([])
    expect(mockGet).toHaveBeenCalledWith('/option/')
  })
})

describe('optionsService.update', () => {
  it('PUTs a single key/value', async () => {
    mockPut.mockResolvedValue(ok(null))
    await optionsService.update('SystemName', 'Wavy')
    expect(mockPut).toHaveBeenCalledWith('/option/', { key: 'SystemName', value: 'Wavy' })
  })
})

describe('optionsService.updateBatch', () => {
  it('PUTs all keys to the atomic /option/batch endpoint', async () => {
    mockPut.mockResolvedValue(ok(null))
    await optionsService.updateBatch({ ModelRatio: '{"a":1}', CompletionRatio: '{"a":2}' })
    expect(mockPut).toHaveBeenCalledWith('/option/batch', {
      keys: { ModelRatio: '{"a":1}', CompletionRatio: '{"a":2}' },
    })
  })

  it('propagates a backend failure (atomic batch rejected)', async () => {
    mockPut.mockResolvedValue(fail('batch failed'))
    await expect(optionsService.updateBatch({ ModelRatio: '{}' })).rejects.toThrow('batch failed')
  })
})

describe('options helpers', () => {
  it('optionsToMap keys by option name', () => {
    expect(optionsToMap([{ key: 'a', value: '1' }, { key: 'b', value: '2' }])).toEqual({ a: '1', b: '2' })
  })

  it('asBool only treats the literal "true" as true', () => {
    expect(asBool('true')).toBe(true)
    expect(asBool('false')).toBe(false)
    expect(asBool(undefined)).toBe(false)
  })
})
