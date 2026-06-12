import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'
import type { StatusInfo } from '@/lib/services/status'
import '@/lib/i18n'

// Route-level component: stub the router surface so we can render the page
// without a full <RouterProvider> (no router test helper yet — TESTING.md).
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ children }: { children?: React.ReactNode }) => <a>{children}</a>,
  redirect: vi.fn(),
  useNavigate: () => vi.fn(),
  useSearch: () => ({ next: '/console' }),
}))

vi.mock('@/lib/services/status', () => ({
  statusService: { get: vi.fn() },
}))

vi.mock('@/lib/services/auth', () => ({
  authService: { login: vi.fn() },
  isTwoFAChallenge: vi.fn(() => false),
}))

vi.mock('@/components/passkey/passkey-ceremonies', () => ({
  isWebAuthnSupported: vi.fn(() => true),
  beginPasskeyRegistration: vi.fn(),
  beginPasskeyLogin: vi.fn(),
  encodeAttestationResponse: vi.fn(),
  encodeAssertionResponse: vi.fn(),
}))

import { statusService } from '@/lib/services/status'
import { authService } from '@/lib/services/auth'
import { Route } from './login'

const mockStatus = statusService.get as ReturnType<typeof vi.fn>
const mockLogin = authService.login as ReturnType<typeof vi.fn>

/** Minimal status payload — only the fields the login page reads. */
function status(overrides: Partial<StatusInfo>): StatusInfo {
  return {
    google_oauth: false,
    google_client_id: '',
    github_oauth: false,
    github_client_id: '',
    passkey_login: false,
    ...overrides,
  } as StatusInfo
}

function renderLogin() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const LoginPage = (Route as unknown as { options: { component: React.ComponentType } }).options
    .component
  return render(
    <QueryClientProvider client={qc}>
      <LoginPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('login page passkey gate', () => {
  it('renders "Sign in with Passkey" when status.passkey_login is true', async () => {
    mockStatus.mockResolvedValue(status({ passkey_login: true }))

    renderLogin()

    expect(await screen.findByText('Sign in with Passkey')).toBeInTheDocument()
  })

  it('hides the passkey button when status.passkey_login is false', async () => {
    // Google enabled so we can detect when the status payload has been applied.
    mockStatus.mockResolvedValue(
      status({ passkey_login: false, google_oauth: true, google_client_id: 'cid' }),
    )

    renderLogin()

    // Status has loaded once the OAuth button shows up …
    expect(await screen.findByText('Continue with Google')).toBeInTheDocument()
    // … and the passkey entry point is still absent.
    expect(screen.queryByText('Sign in with Passkey')).not.toBeInTheDocument()
  })
})

describe('login page error display', () => {
  it('surfaces the backend business message through the ApiError gate', async () => {
    mockStatus.mockResolvedValue(status({}))
    // The api interceptor rejects normalized ApiError instances — the page's
    // `e instanceof ApiError ? e.message : t('login.failed')` gate must let
    // the backend copy through instead of the generic fallback.
    mockLogin.mockRejectedValue(new ApiError('用户名或密码错误', 400))

    renderLogin()

    await userEvent.type(screen.getByLabelText('Username or email'), 'jimmy')
    await userEvent.type(screen.getByLabelText('Password'), 'hunter22')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('用户名或密码错误')).toBeInTheDocument()
    expect(screen.queryByText('Login failed')).not.toBeInTheDocument()
  })
})
