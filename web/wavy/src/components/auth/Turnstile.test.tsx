import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { StatusInfo } from '@/lib/services/status'
import '@/lib/i18n'

vi.mock('@/lib/services/status', () => ({
  statusService: { get: vi.fn() },
}))

import { statusService } from '@/lib/services/status'
import { TurnstileWidget, useTurnstile } from './Turnstile'

const mockStatus = statusService.get as ReturnType<typeof vi.fn>

const HINT = 'Complete the verification above to continue.'

/** Options captured from the stubbed `window.turnstile.render` call. */
interface CapturedOptions {
  sitekey: string
  callback?: (token: string) => void
  'expired-callback'?: () => void
  'error-callback'?: () => void
}

let captured: CapturedOptions | null = null
const renderWidget = vi.fn((_el: HTMLElement, opts: CapturedOptions) => {
  captured = opts
  return 'widget-1'
})
const resetWidget = vi.fn()
const removeWidget = vi.fn()

function status(overrides: Partial<StatusInfo>): StatusInfo {
  return {
    turnstile_check: false,
    turnstile_site_key: '',
    ...overrides,
  } as StatusInfo
}

/** Minimal consumer mirroring how the auth pages use the hook + widget. */
function Harness() {
  const turnstile = useTurnstile()
  return (
    <div>
      <TurnstileWidget state={turnstile} />
      <button disabled={!turnstile.ready}>Submit</button>
      <button onClick={turnstile.reset}>Reset</button>
    </div>
  )
}

function renderHarness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <Harness />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  captured = null
  // Stub the Cloudflare API so tests never load the external script —
  // loadTurnstileScript() short-circuits when window.turnstile exists.
  window.turnstile = { render: renderWidget, reset: resetWidget, remove: removeWidget }
})

afterEach(() => {
  delete window.turnstile
})

describe('<TurnstileWidget> toggle off', () => {
  it('renders nothing and leaves callers ready', async () => {
    mockStatus.mockResolvedValue(status({}))

    renderHarness()

    await waitFor(() => expect(mockStatus).toHaveBeenCalledTimes(1))
    await act(async () => {}) // flush the resolved status into the query cache
    expect(renderWidget).not.toHaveBeenCalled()
    expect(screen.queryByText(HINT)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled()
  })
})

describe('<TurnstileWidget> toggle on', () => {
  beforeEach(() => {
    mockStatus.mockResolvedValue(
      status({ turnstile_check: true, turnstile_site_key: 'sk-test' }),
    )
  })

  it('renders with the site key and gates ready on a token', async () => {
    renderHarness()

    expect(await screen.findByText(HINT)).toBeInTheDocument()
    await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(1))
    expect(renderWidget.mock.calls[0][1].sitekey).toBe('sk-test')
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()

    act(() => captured?.callback?.('tok-1'))

    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled()
    expect(screen.queryByText(HINT)).not.toBeInTheDocument()
  })

  it('reset() drops the token and resets the Cloudflare widget', async () => {
    renderHarness()

    await screen.findByText(HINT)
    await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(1))
    act(() => captured?.callback?.('tok-1'))
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'Reset' }))

    expect(resetWidget).toHaveBeenCalledWith('widget-1')
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
  })

  it('expired-callback clears the token and asks for a fresh one', async () => {
    renderHarness()

    await screen.findByText(HINT)
    await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(1))
    act(() => captured?.callback?.('tok-1'))
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled()

    act(() => captured?.['expired-callback']?.())

    expect(resetWidget).toHaveBeenCalledWith('widget-1')
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
  })
})
