import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@/lib/services/passkey'

function b64uToBuf(b64u: string): ArrayBuffer {
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64u.length % 4)) % 4)
  const bin = atob(b64)
  const buf = new ArrayBuffer(bin.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i)
  return buf
}

function bufToB64u(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function isWebAuthnSupported(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials
}

export async function beginPasskeyRegistration(
  options: PublicKeyCredentialCreationOptionsJSON
): Promise<PublicKeyCredential> {
  const pk = options.publicKey
  const cred = await navigator.credentials.create({
    publicKey: {
      ...pk,
      challenge: b64uToBuf(pk.challenge),
      user: { ...pk.user, id: b64uToBuf(pk.user.id) },
      excludeCredentials: pk.excludeCredentials?.map(c => ({ ...c, id: b64uToBuf(c.id) })),
    } as unknown as PublicKeyCredentialCreationOptions,
  })
  if (!cred) throw new Error('passkey creation cancelled')
  return cred as PublicKeyCredential
}

export async function beginPasskeyLogin(
  options: PublicKeyCredentialRequestOptionsJSON
): Promise<PublicKeyCredential> {
  const pk = options.publicKey
  const cred = await navigator.credentials.get({
    publicKey: {
      ...pk,
      challenge: b64uToBuf(pk.challenge),
      allowCredentials: pk.allowCredentials?.map(c => ({ ...c, id: b64uToBuf(c.id) })),
    } as unknown as PublicKeyCredentialRequestOptions,
  })
  if (!cred) throw new Error('passkey assertion cancelled')
  return cred as PublicKeyCredential
}

export function encodeAttestationResponse(cred: PublicKeyCredential): Record<string, unknown> {
  const r = cred.response as AuthenticatorAttestationResponse
  return {
    id: cred.id,
    rawId: bufToB64u(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bufToB64u(r.clientDataJSON),
      attestationObject: bufToB64u(r.attestationObject),
      transports: (r as AuthenticatorAttestationResponse & { getTransports?: () => string[] }).getTransports?.() ?? [],
    },
    clientExtensionResults: cred.getClientExtensionResults(),
  }
}

export function encodeAssertionResponse(cred: PublicKeyCredential): Record<string, unknown> {
  const r = cred.response as AuthenticatorAssertionResponse
  return {
    id: cred.id,
    rawId: bufToB64u(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bufToB64u(r.clientDataJSON),
      authenticatorData: bufToB64u(r.authenticatorData),
      signature: bufToB64u(r.signature),
      userHandle: r.userHandle ? bufToB64u(r.userHandle) : null,
    },
    clientExtensionResults: cred.getClientExtensionResults(),
  }
}
