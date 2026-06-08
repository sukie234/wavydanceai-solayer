import { api, unwrap } from '@/lib/api'
import type { ApiResponse } from '@/lib/types'
import {
  beginPasskeyRegistration,
  beginPasskeyLogin,
  encodeAssertionResponse,
  encodeAttestationResponse,
} from '@/components/passkey/passkey-ceremonies'

export interface PasskeyView {
  id: number
  name: string
  transports: string
  created_at: number
  last_used_at: number
}

export const passkeyService = {
  async list(): Promise<PasskeyView[]> {
    const res = await api.get<ApiResponse<PasskeyView[]>>('/user/passkey/credentials')
    return unwrap(res) ?? []
  },

  /** Profile-page registration: name is the user-visible label. */
  async register(name: string): Promise<PasskeyView> {
    const beginRes = await api.post<ApiResponse<unknown>>(
      '/user/passkey/credentials/register/begin',
      { name }
    )
    const options = unwrap(beginRes) as PublicKeyCredentialCreationOptionsJSON
    const cred = await beginPasskeyRegistration(options)
    const finishRes = await api.post<ApiResponse<PasskeyView>>(
      '/user/passkey/credentials/register/finish',
      encodeAttestationResponse(cred)
    )
    return unwrap(finishRes)
  },

  async rename(id: number, name: string): Promise<void> {
    const res = await api.patch<ApiResponse>(`/user/passkey/credentials/${id}`, { name })
    unwrap(res)
  },

  async remove(id: number): Promise<void> {
    const res = await api.delete<ApiResponse>(`/user/passkey/credentials/${id}`)
    unwrap(res)
  },

  /** Passwordless login (login page). */
  async loginPasswordless(username: string): Promise<void> {
    const beginRes = await api.post<ApiResponse<unknown>>('/user/login/passkey/begin', { username })
    const options = unwrap(beginRes) as PublicKeyCredentialRequestOptionsJSON
    const cred = await beginPasskeyLogin(options)
    const finishRes = await api.post<ApiResponse>('/user/login/passkey/finish', encodeAssertionResponse(cred))
    unwrap(finishRes)
  },

  /** Second-factor after password (login page chooser). */
  async loginSecondFactor(): Promise<void> {
    const beginRes = await api.post<ApiResponse<unknown>>('/user/login/2fa/passkey/begin', {})
    const options = unwrap(beginRes) as PublicKeyCredentialRequestOptionsJSON
    const cred = await beginPasskeyLogin(options)
    const finishRes = await api.post<ApiResponse>('/user/login/2fa/passkey/finish', encodeAssertionResponse(cred))
    unwrap(finishRes)
  },
}

// --- WebAuthn JSON types (subset; matches go-webauthn server emission) ---
// Browsers expect base64url strings for byte fields; we decode on receipt
// and re-encode the response. Strict typing kept narrow to what we use.
export interface PublicKeyCredentialCreationOptionsJSON {
  publicKey: {
    challenge: string
    rp: { id: string; name: string }
    user: { id: string; name: string; displayName: string }
    pubKeyCredParams: { type: 'public-key'; alg: number }[]
    timeout?: number
    excludeCredentials?: { type: 'public-key'; id: string; transports?: AuthenticatorTransport[] }[]
    authenticatorSelection?: AuthenticatorSelectionCriteria
    attestation?: 'none' | 'indirect' | 'direct'
  }
}

export interface PublicKeyCredentialRequestOptionsJSON {
  publicKey: {
    challenge: string
    timeout?: number
    rpId?: string
    allowCredentials?: { type: 'public-key'; id: string; transports?: AuthenticatorTransport[] }[]
    userVerification?: UserVerificationRequirement
  }
}
