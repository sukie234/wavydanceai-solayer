import { api, unwrap } from '@/lib/api'
import type { ApiResponse } from '@/lib/types'
import { statusService } from './status'

/**
 * Hits GET /api/oauth/state — backend sets a cookie with the random state
 * and returns it. We pin it to the URL we redirect to so the callback
 * route can verify it.
 */
async function getOAuthState(): Promise<string> {
  const res = await api.get<ApiResponse<string>>('/oauth/state')
  return unwrap(res) ?? ''
}

/**
 * Provider lookup table. URL builder + scope per provider. Only the
 * providers we have a dedicated backend handler for are listed here;
 * adding a new one means adding a row + a backend route.
 */
const PROVIDERS = {
  github: {
    authorize: (clientId: string, _redirectUri: string, state: string) =>
      `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&state=${encodeURIComponent(state)}&scope=user:email`,
  },
  google: {
    authorize: (clientId: string, redirectUri: string, state: string) =>
      `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code&scope=${encodeURIComponent('openid email profile')}` +
      `&state=${encodeURIComponent(state)}` +
      // access_type=online keeps Google from issuing refresh tokens we
      // don't intend to manage; prompt=select_account lets users pick a
      // different Google account if they're already signed in there.
      `&access_type=online&prompt=select_account`,
  },
} as const

export type OAuthProvider = keyof typeof PROVIDERS

/**
 * Starts an OAuth round-trip. Browser leaves the SPA and ends up at the
 * provider's consent page; provider redirects back to /oauth/:provider.
 */
export async function startOAuthFlow(provider: OAuthProvider): Promise<void> {
  const status = await statusService.get()
  const clientId =
    provider === 'github' ? status.github_client_id : status.google_client_id
  if (!clientId) throw new Error(`${provider} client_id not configured`)
  const redirectUri = `${status.server_address}/oauth/${provider}`
  const state = await getOAuthState()
  const url = PROVIDERS[provider].authorize(clientId, redirectUri, state)
  window.location.href = url
}

/**
 * Called from the /oauth/:provider callback route once the provider has
 * redirected back with code + state. Hits the backend handler which
 * verifies state, exchanges code, sets session cookie, returns user.
 */
export async function completeOAuthCallback(
  provider: OAuthProvider,
  code: string,
  state: string,
): Promise<void> {
  const res = await api.get<ApiResponse>(`/oauth/${provider}`, {
    params: { code, state },
  })
  unwrap(res)
}
