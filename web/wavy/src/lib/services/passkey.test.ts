import { describe, it, expect, vi, beforeEach } from 'vitest'
import { passkeyService } from './passkey'

// Mock the api module at the module boundary.
// unwrap is the real export from @/lib/api — we mock it to extract .data.data
// matching the real implementation: throw on !success, return data.data on success.
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  unwrap: vi.fn((res) => {
    if (!res.data.success) throw new Error(res.data.message || 'request failed')
    return res.data.data
  }),
}))

vi.mock('@/components/passkey/passkey-ceremonies', () => ({
  beginPasskeyRegistration: vi.fn(),
  beginPasskeyLogin: vi.fn(),
  encodeAttestationResponse: vi.fn((c) => ({ encoded: 'attestation', cred: c })),
  encodeAssertionResponse: vi.fn((c) => ({ encoded: 'assertion', cred: c })),
}))

// Import mocks AFTER vi.mock hoisting completes
import { api, unwrap } from '@/lib/api'
import {
  beginPasskeyRegistration,
  beginPasskeyLogin,
  encodeAttestationResponse,
  encodeAssertionResponse,
} from '@/components/passkey/passkey-ceremonies'

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
  patch: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}
const mockUnwrap = unwrap as unknown as ReturnType<typeof vi.fn>
const mockBeginReg = beginPasskeyRegistration as ReturnType<typeof vi.fn>
const mockBeginLogin = beginPasskeyLogin as ReturnType<typeof vi.fn>
const mockEncodeAttestation = encodeAttestationResponse as ReturnType<typeof vi.fn>
const mockEncodeAssertion = encodeAssertionResponse as ReturnType<typeof vi.fn>

/** Build a minimal success-envelope AxiosResponse stub. */
function ok<T>(data: T) {
  return { data: { success: true, message: '', data } }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Restore default unwrap behaviour after clearAllMocks
  mockUnwrap.mockImplementation((res) => {
    if (!res.data.success) throw new Error(res.data.message || 'request failed')
    return res.data.data
  })
})

describe('passkeyService.list', () => {
  it('calls GET /user/passkey/credentials and returns the array', async () => {
    const passkeys = [{ id: 1, name: 'MacBook', transports: 'usb', created_at: 1000, last_used_at: 2000 }]
    mockApi.get.mockResolvedValue(ok(passkeys))

    const result = await passkeyService.list()

    expect(mockApi.get).toHaveBeenCalledWith('/user/passkey/credentials')
    expect(result).toEqual(passkeys)
  })

  it('returns [] when unwrap yields undefined (null data field)', async () => {
    // unwrap returns undefined when data.data is absent
    mockApi.get.mockResolvedValue({ data: { success: true, message: '' } })
    // unwrap sees data.data as undefined → returns undefined
    mockUnwrap.mockReturnValue(undefined)

    const result = await passkeyService.list()

    expect(result).toEqual([])
  })
})

describe('passkeyService.register', () => {
  it('calls begin, runs ceremony, calls finish, and returns the new PasskeyView', async () => {
    const beginOptions = { publicKey: { challenge: 'abc' } }
    const fakeCred = { id: 'cred-id', rawId: new ArrayBuffer(4), type: 'public-key' }
    const finishedKey = { id: 1, name: 'Test Key', transports: 'internal', created_at: 100, last_used_at: 0 }

    mockApi.post
      .mockResolvedValueOnce(ok(beginOptions))   // begin
      .mockResolvedValueOnce(ok(finishedKey))    // finish
    mockBeginReg.mockResolvedValue(fakeCred)
    mockEncodeAttestation.mockReturnValue({ encoded: 'attestation', cred: fakeCred })

    const result = await passkeyService.register('Test Key')

    expect(mockApi.post).toHaveBeenNthCalledWith(
      1,
      '/user/passkey/credentials/register/begin',
      { name: 'Test Key' },
    )
    expect(mockBeginReg).toHaveBeenCalledWith(beginOptions)
    expect(mockEncodeAttestation).toHaveBeenCalledWith(fakeCred)
    expect(mockApi.post).toHaveBeenNthCalledWith(
      2,
      '/user/passkey/credentials/register/finish',
      { encoded: 'attestation', cred: fakeCred },
    )
    expect(result).toEqual(finishedKey)
  })
})

describe('passkeyService.rename', () => {
  it('calls PATCH /user/passkey/credentials/{id} with name', async () => {
    mockApi.patch.mockResolvedValue(ok(null))

    await passkeyService.rename(42, 'New Name')

    expect(mockApi.patch).toHaveBeenCalledWith('/user/passkey/credentials/42', { name: 'New Name' })
    expect(mockUnwrap).toHaveBeenCalledTimes(1)
  })
})

describe('passkeyService.remove', () => {
  it('calls DELETE /user/passkey/credentials/{id}', async () => {
    mockApi.delete.mockResolvedValue(ok(null))

    await passkeyService.remove(7)

    expect(mockApi.delete).toHaveBeenCalledWith('/user/passkey/credentials/7')
    expect(mockUnwrap).toHaveBeenCalledTimes(1)
  })
})

describe('passkeyService.loginPasswordless', () => {
  it('calls begin → ceremony → finish on /user/login/passkey/*', async () => {
    const beginOptions = { publicKey: { challenge: 'xyz' } }
    const fakeCred = { id: 'assert-id', rawId: new ArrayBuffer(4), type: 'public-key' }

    mockApi.post
      .mockResolvedValueOnce(ok(beginOptions))
      .mockResolvedValueOnce(ok(null))
    mockBeginLogin.mockResolvedValue(fakeCred)
    mockEncodeAssertion.mockReturnValue({ encoded: 'assertion', cred: fakeCred })

    await passkeyService.loginPasswordless('alice')

    expect(mockApi.post).toHaveBeenNthCalledWith(
      1,
      '/user/login/passkey/begin',
      { username: 'alice' },
    )
    expect(mockBeginLogin).toHaveBeenCalledWith(beginOptions)
    expect(mockEncodeAssertion).toHaveBeenCalledWith(fakeCred)
    expect(mockApi.post).toHaveBeenNthCalledWith(
      2,
      '/user/login/passkey/finish',
      { encoded: 'assertion', cred: fakeCred },
    )
  })
})

describe('passkeyService.loginSecondFactor', () => {
  it('calls begin → ceremony → finish on /user/login/2fa/passkey/*', async () => {
    const beginOptions = { publicKey: { challenge: 'zzz' } }
    const fakeCred = { id: 'assert-2fa', rawId: new ArrayBuffer(4), type: 'public-key' }

    mockApi.post
      .mockResolvedValueOnce(ok(beginOptions))
      .mockResolvedValueOnce(ok(null))
    mockBeginLogin.mockResolvedValue(fakeCred)
    mockEncodeAssertion.mockReturnValue({ encoded: 'assertion', cred: fakeCred })

    await passkeyService.loginSecondFactor()

    expect(mockApi.post).toHaveBeenNthCalledWith(
      1,
      '/user/login/2fa/passkey/begin',
      {},
    )
    expect(mockBeginLogin).toHaveBeenCalledWith(beginOptions)
    expect(mockEncodeAssertion).toHaveBeenCalledWith(fakeCred)
    expect(mockApi.post).toHaveBeenNthCalledWith(
      2,
      '/user/login/2fa/passkey/finish',
      { encoded: 'assertion', cred: fakeCred },
    )
  })
})
