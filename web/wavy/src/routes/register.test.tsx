import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
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
}))

vi.mock('@/lib/services/status', () => ({
  statusService: { get: vi.fn() },
}))

vi.mock('@/lib/services/auth', () => ({
  authService: { register: vi.fn(), login: vi.fn(), sendVerificationCode: vi.fn() },
}))

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(async () => null),
  clearSessionCache: vi.fn(),
}))

import { statusService } from '@/lib/services/status'
import { authService } from '@/lib/services/auth'
import { Route } from './register'

const mockStatus = statusService.get as ReturnType<typeof vi.fn>
const mockRegister = authService.register as ReturnType<typeof vi.fn>
const mockLogin = authService.login as ReturnType<typeof vi.fn>
const mockSendCode = authService.sendVerificationCode as ReturnType<typeof vi.fn>

const HINT = 'Complete the verification above to continue.'

interface CapturedOptions {
  sitekey: string
  callback?: (token: string) => void
}

let captured: CapturedOptions | null = null
const renderWidget = vi.fn((_el: HTMLElement, opts: CapturedOptions) => {
  captured = opts
  return 'widget-1'
})
const resetWidget = vi.fn()
const removeWidget = vi.fn()

/** Minimal status payload — only the fields the register page reads. */
function status(overrides: Partial<StatusInfo>): StatusInfo {
  return {
    email_verification: false,
    turnstile_check: false,
    turnstile_site_key: '',
    google_oauth: false,
    google_client_id: '',
    github_oauth: false,
    github_client_id: '',
    ...overrides,
  } as StatusInfo
}

function renderRegister() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const RegisterPage = (Route as unknown as { options: { component: React.ComponentType } })
    .options.component
  return render(
    <QueryClientProvider client={qc}>
      <RegisterPage />
    </QueryClientProvider>,
  )
}

async function fillForm() {
  await userEvent.type(screen.getByLabelText(/^Email/), 'jimmy@example.com')
  await userEvent.type(screen.getByLabelText(/^Username/), 'jimmy')
  await userEvent.type(screen.getByLabelText(/^Password/), 'hunter22')
  await userEvent.type(screen.getByLabelText(/^Confirm password/), 'hunter22')
}

beforeEach(() => {
  vi.clearAllMocks()
  captured = null
  window.turnstile = { render: renderWidget, reset: resetWidget, remove: removeWidget }
})

afterEach(() => {
  delete window.turnstile
})

describe('register page with turnstile off', () => {
  it('submits without a turnstile token, flow unchanged', async () => {
    mockStatus.mockResolvedValue(status({}))
    mockRegister.mockResolvedValue(undefined)
    mockLogin.mockResolvedValue({ id: 1 })

    renderRegister()
    await fillForm()

    expect(screen.queryByText(HINT)).not.toBeInTheDocument()
    const submit = screen.getByRole('button', { name: 'Create account' })
    expect(submit).toBeEnabled()
    await userEvent.click(submit)

    await waitFor(() =>
      expect(mockRegister).toHaveBeenCalledWith(
        { username: 'jimmy', password: 'hunter22', email: 'jimmy@example.com' },
        undefined,
      ),
    )
  })
})

describe('register page with turnstile on', () => {
  beforeEach(() => {
    mockStatus.mockResolvedValue(
      status({ turnstile_check: true, turnstile_site_key: 'sk-test' }),
    )
  })

  it('disables submit until a token is solved, then sends it', async () => {
    mockRegister.mockResolvedValue(undefined)
    mockLogin.mockResolvedValue({ id: 1 })

    renderRegister()
    await screen.findByText(HINT)
    await fillForm()

    const submit = screen.getByRole('button', { name: 'Create account' })
    expect(submit).toBeDisabled()

    act(() => captured?.callback?.('tok-abc'))
    expect(submit).toBeEnabled()
    await userEvent.click(submit)

    await waitFor(() =>
      expect(mockRegister).toHaveBeenCalledWith(
        { username: 'jimmy', password: 'hunter22', email: 'jimmy@example.com' },
        'tok-abc',
      ),
    )
  })

  it('gates the send-code button on the token and passes it through', async () => {
    mockStatus.mockResolvedValue(
      status({
        email_verification: true,
        turnstile_check: true,
        turnstile_site_key: 'sk-test',
      }),
    )
    mockSendCode.mockResolvedValue(undefined)

    renderRegister()
    await screen.findByText(HINT)
    await userEvent.type(screen.getByLabelText(/^Email/), 'jimmy@example.com')

    const sendCode = screen.getByRole('button', { name: 'Send code' })
    expect(sendCode).toBeDisabled()

    act(() => captured?.callback?.('tok-abc'))
    expect(sendCode).toBeEnabled()
    await userEvent.click(sendCode)

    await waitFor(() =>
      expect(mockSendCode).toHaveBeenCalledWith('jimmy@example.com', 'tok-abc'),
    )
  })

  it('resets the widget after a failed register so the user can retry', async () => {
    // Tokens are single-use — after a failure the page must request a fresh one.
    mockRegister.mockRejectedValue(new ApiError('Turnstile 校验失败，请刷新重试！', 200))

    renderRegister()
    await screen.findByText(HINT)
    await fillForm()
    act(() => captured?.callback?.('tok-abc'))

    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Turnstile 校验失败，请刷新重试！')).toBeInTheDocument()
    expect(resetWidget).toHaveBeenCalledWith('widget-1')
  })
})
