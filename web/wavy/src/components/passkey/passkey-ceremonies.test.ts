import { describe, it, expect, vi, afterEach } from 'vitest'
import { isWebAuthnSupported } from './passkey-ceremonies'

// Note: b64uToBuf and bufToB64u are not exported — they are internal helpers
// and cannot be tested directly without source modification. Their behavior is
// exercised indirectly through beginPasskeyRegistration / beginPasskeyLogin /
// encode*Response, which require navigator.credentials (unavailable in jsdom).

describe('isWebAuthnSupported', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns false in jsdom where PublicKeyCredential and navigator.credentials are absent', () => {
    // jsdom does not define PublicKeyCredential or navigator.credentials by default
    expect(isWebAuthnSupported()).toBe(false)
  })

  it('returns true when both PublicKeyCredential and navigator.credentials are present', () => {
    vi.stubGlobal('PublicKeyCredential', class MockPKC {})
    // navigator is read-only but vi.stubGlobal handles it via defineProperty
    vi.stubGlobal('navigator', {
      ...navigator,
      credentials: { get: vi.fn(), create: vi.fn() },
    })

    expect(isWebAuthnSupported()).toBe(true)
  })

  it('returns false when only PublicKeyCredential is present but credentials is missing', () => {
    vi.stubGlobal('PublicKeyCredential', class MockPKC {})
    vi.stubGlobal('navigator', {
      ...navigator,
      credentials: undefined,
    })

    expect(isWebAuthnSupported()).toBe(false)
  })
})
