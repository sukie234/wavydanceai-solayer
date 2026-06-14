import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})

import { api } from '@/lib/api'
import { usersService, adminPasskeyService } from './users'

const mockGet = api.get as ReturnType<typeof vi.fn>
const mockPost = api.post as ReturnType<typeof vi.fn>
const mockPut = api.put as ReturnType<typeof vi.fn>
const mockDelete = api.delete as ReturnType<typeof vi.fn>

const ok = <T>(data: T) => ({ data: { success: true, data }, status: 200 })
const fail = (message: string, status = 400) => ({ data: { success: false, message }, status })

beforeEach(() => vi.clearAllMocks())

describe('usersService reads', () => {
  it('list paginates and defaults to []', async () => {
    mockGet.mockResolvedValue(ok(null))
    expect(await usersService.list(1, 'id')).toEqual([])
    expect(mockGet).toHaveBeenCalledWith('/user/', { params: { p: 1, order: 'id' } })
  })

  it('get fetches a single user by id', async () => {
    mockGet.mockResolvedValue(ok({ id: 5, username: 'bob' }))
    const u = await usersService.get(5)
    expect(u.username).toBe('bob')
    expect(mockGet).toHaveBeenCalledWith('/user/5')
  })

  it('get propagates a backend failure', async () => {
    mockGet.mockResolvedValue(fail('not found', 404))
    await expect(usersService.get(99)).rejects.toThrow('not found')
  })
})

describe('usersService writes', () => {
  it('create posts the new user', async () => {
    mockPost.mockResolvedValue(ok(null))
    await usersService.create({ username: 'new', password: 'pw' })
    expect(mockPost).toHaveBeenCalledWith('/user/', { username: 'new', password: 'pw' })
  })

  it('update puts the partial user', async () => {
    mockPut.mockResolvedValue(ok(null))
    await usersService.update({ id: 2, display_name: 'X' })
    expect(mockPut).toHaveBeenCalledWith('/user/', { id: 2, display_name: 'X' })
  })

  it('manage posts username + action verb', async () => {
    mockPost.mockResolvedValue(ok(null))
    await usersService.manage('bob', 'disable')
    expect(mockPost).toHaveBeenCalledWith('/user/manage', { username: 'bob', action: 'disable' })
  })

  it('remove deletes by id', async () => {
    mockDelete.mockResolvedValue(ok(null))
    await usersService.remove(4)
    expect(mockDelete).toHaveBeenCalledWith('/user/4')
  })
})

describe('adminPasskeyService', () => {
  it('deleteOne targets the user + credential', async () => {
    mockDelete.mockResolvedValue(ok(null))
    await adminPasskeyService.deleteOne(3, 8)
    expect(mockDelete).toHaveBeenCalledWith('/user/3/passkeys/8')
  })

  it('clear removes all passkeys for a user', async () => {
    mockDelete.mockResolvedValue(ok(null))
    await adminPasskeyService.clear(3)
    expect(mockDelete).toHaveBeenCalledWith('/user/3/passkeys')
  })
})
