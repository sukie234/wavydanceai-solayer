import { describe, it, expect, vi, beforeEach } from 'vitest'

// Partial mock: stub the axios methods but keep the REAL `unwrap` so we exercise
// its success/data extraction and its throw-on-failure behaviour.
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})

import { api } from '@/lib/api'
import { tokensService } from './tokens'
import { PLAYGROUND_TOKEN_NAME } from './playground'

const mockGet = api.get as ReturnType<typeof vi.fn>
const mockPost = api.post as ReturnType<typeof vi.fn>
const mockPut = api.put as ReturnType<typeof vi.fn>
const mockDelete = api.delete as ReturnType<typeof vi.fn>

const ok = <T>(data: T) => ({ data: { success: true, data }, status: 200 })
const fail = (message: string, status = 400) => ({ data: { success: false, message }, status })

beforeEach(() => vi.clearAllMocks())

describe('tokensService.list', () => {
  it('hides the system playground token from the key list', async () => {
    mockGet.mockResolvedValue(
      ok([
        { id: 1, name: 'mykey' },
        { id: 2, name: PLAYGROUND_TOKEN_NAME },
      ]),
    )
    const tokens = await tokensService.list()
    expect(tokens.map((t) => t.name)).toEqual(['mykey'])
  })

  it('passes pagination + order through', async () => {
    mockGet.mockResolvedValue(ok([]))
    await tokensService.list(2, 'created_time')
    expect(mockGet).toHaveBeenCalledWith('/token/', { params: { p: 2, order: 'created_time' } })
  })

  it('defaults to an empty list when data is null', async () => {
    mockGet.mockResolvedValue(ok(null))
    expect(await tokensService.list()).toEqual([])
  })

  it('throws when the backend reports failure', async () => {
    mockGet.mockResolvedValue(fail('nope'))
    await expect(tokensService.list()).rejects.toThrow('nope')
  })
})

describe('tokensService mutations', () => {
  it('create posts the token body', async () => {
    mockPost.mockResolvedValue(ok(null))
    await tokensService.create({ name: 'k' })
    expect(mockPost).toHaveBeenCalledWith('/token/', { name: 'k' })
  })

  it('update puts the token body', async () => {
    mockPut.mockResolvedValue(ok(null))
    await tokensService.update({ id: 3, name: 'k2' })
    expect(mockPut).toHaveBeenCalledWith('/token/', { id: 3, name: 'k2' })
  })

  it('remove deletes by id', async () => {
    mockDelete.mockResolvedValue(ok(null))
    await tokensService.remove(7)
    expect(mockDelete).toHaveBeenCalledWith('/token/7')
  })
})
