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
}))

vi.mock('@/lib/services/status', () => ({
  statusService: { get: vi.fn() },
}))

vi.mock('@/lib/services/auth', () => ({
  authService: { sendPasswordResetEmail: vi.fn() },
}))

import { statusService } from '@/lib/services/status'
import { authService } from '@/lib/services/auth'
import { Route } from './forgot-password'

const mockStatus = statusService.get as ReturnType<typeof vi.fn>
const mockSendReset = authService.sendPasswordResetEmail as ReturnType<typeof vi.fn>

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

/** Minimal status payload — only the fields the forgot-password page reads. */
function status(overrides: Partial<StatusInfo>): StatusInfo {
  return {
    turnstile_check: false,
    turnstile_site_key: '',
    ...overrides,
  } as StatusInfo
}

function renderForgot() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const ForgotPage = (Route as unknown as { options: { component: React.ComponentType } })
    .options.component
  return render(
    <QueryClientProvider client={qc}>
      <ForgotPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  captured = null
  window.turnstile = { render: renderWidget, reset: resetWidget, remove: removeWidget }
})

afterEach(() => {
  delete window.turnstile
})

describe('forgot-password page with turnstile off', () => {
  it('sends the reset email without a token, flow unchanged', async () => {
    mockStatus.mockResolvedValue(status({}))
    mockSendReset.mockResolvedValue(undefined)

    renderForgot()
    await userEvent.type(screen.getByLabelText(/^Email/), 'jimmy@example.com')

    expect(screen.queryByText(HINT)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))

    await waitFor(() =>
      expect(mockSendReset).toHaveBeenCalledWith('jimmy@example.com', undefined),
    )
    expect(await screen.findByText('Check your email')).toBeInTheDocument()
  })
})

describe('forgot-password page with turnstile on', () => {
  beforeEach(() => {
    mockStatus.mockResolvedValue(
      status({ turnstile_check: true, turnstile_site_key: 'sk-test' }),
    )
  })

  it('disables submit until a token is solved, then sends it', async () => {
    mockSendReset.mockResolvedValue(undefined)

    renderForgot()
    await screen.findByText(HINT)
    await userEvent.type(screen.getByLabelText(/^Email/), 'jimmy@example.com')

    const submit = screen.getByRole('button', { name: 'Send reset link' })
    expect(submit).toBeDisabled()

    act(() => captured?.callback?.('tok-abc'))
    expect(submit).toBeEnabled()
    await userEvent.click(submit)

    await waitFor(() =>
      expect(mockSendReset).toHaveBeenCalledWith('jimmy@example.com', 'tok-abc'),
    )
    expect(await screen.findByText('Check your email')).toBeInTheDocument()
  })

  it('resets the widget after a failed send so the user can retry', async () => {
    // Tokens are single-use — after a failure the page must request a fresh one.
    mockSendReset.mockRejectedValue(new ApiError('Turnstile 校验失败，请刷新重试！', 200))

    renderForgot()
    await screen.findByText(HINT)
    await userEvent.type(screen.getByLabelText(/^Email/), 'jimmy@example.com')
    act(() => captured?.callback?.('tok-abc'))

    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByText('Turnstile 校验失败，请刷新重试！')).toBeInTheDocument()
    expect(resetWidget).toHaveBeenCalledWith('widget-1')
  })
})
