import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PasskeyCard } from './PasskeyCard'
import { AppDialogsProvider } from '@/components/ui/AppDialogs'
import type { PasskeyView } from '@/lib/services/passkey'

vi.mock('@/lib/services/passkey', () => ({
  passkeyService: {
    list: vi.fn(),
    register: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
  },
}))

vi.mock('./passkey-ceremonies', () => ({
  isWebAuthnSupported: vi.fn(() => true),
}))

import { passkeyService } from '@/lib/services/passkey'
import { isWebAuthnSupported } from './passkey-ceremonies'

const mockList = passkeyService.list as ReturnType<typeof vi.fn>
const mockRegister = passkeyService.register as ReturnType<typeof vi.fn>
const mockIsSupported = isWebAuthnSupported as ReturnType<typeof vi.fn>

/** Minimal inline wrapper — no shared helper file per TESTING.md conventions. */
function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={qc}>
      <AppDialogsProvider>{ui}</AppDialogsProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIsSupported.mockReturnValue(true)
})

describe('<PasskeyCard>', () => {
  it('renders empty state when list resolves to []', async () => {
    mockList.mockResolvedValue([])

    renderWithQuery(<PasskeyCard />)

    expect(await screen.findByText('No passkeys registered yet.')).toBeInTheDocument()
  })

  it('renders passkey names and "never" for last_used_at === 0', async () => {
    const passkeys: PasskeyView[] = [
      { id: 1, name: 'MacBook', transports: 'usb', created_at: 1_700_000_000, last_used_at: 1_710_000_000 },
      { id: 2, name: 'iPhone', transports: 'internal', created_at: 1_700_000_000, last_used_at: 0 },
    ]
    mockList.mockResolvedValue(passkeys)

    renderWithQuery(<PasskeyCard />)

    expect(await screen.findByText('MacBook')).toBeInTheDocument()
    expect(screen.getByText('iPhone')).toBeInTheDocument()
    expect(screen.getByText(/never/)).toBeInTheDocument()
  })

  it('shows Loading… while the query is pending', () => {
    // Never-resolving promise keeps the component in loading state
    mockList.mockReturnValue(new Promise(() => {}))

    renderWithQuery(<PasskeyCard />)

    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('disables "Add passkey" button with title when WebAuthn is unsupported', async () => {
    mockIsSupported.mockReturnValue(false)
    mockList.mockResolvedValue([])

    renderWithQuery(<PasskeyCard />)

    // Wait for query to settle so the button is rendered in its final state
    await screen.findByText('No passkeys registered yet.')

    const btn = screen.getByRole('button', { name: /add passkey/i })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', 'This browser does not support WebAuthn')
  })

  it('does not call register when the name prompt is left empty', async () => {
    mockList.mockResolvedValue([])

    renderWithQuery(<PasskeyCard />)
    await screen.findByText('No passkeys registered yet.')

    await userEvent.click(screen.getByRole('button', { name: /add passkey/i }))

    // Themed prompt dialog opens — clear the prefilled value and confirm.
    const input = await screen.findByPlaceholderText(/MacBook Pro/i)
    await userEvent.clear(input)
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))

    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('calls register and invalidates list on successful add', async () => {
    const newKey: PasskeyView = {
      id: 99, name: 'YubiKey', transports: 'usb', created_at: 1_700_000_000, last_used_at: 0,
    }
    mockList
      .mockResolvedValueOnce([])       // initial fetch
      .mockResolvedValueOnce([newKey]) // refetch after invalidation

    mockRegister.mockResolvedValue(newKey)

    renderWithQuery(<PasskeyCard />)
    await screen.findByText('No passkeys registered yet.')

    await userEvent.click(screen.getByRole('button', { name: /add passkey/i }))

    const input = await screen.findByPlaceholderText(/MacBook Pro/i)
    await userEvent.clear(input)
    await userEvent.type(input, 'YubiKey')
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith('YubiKey')
    })
    await waitFor(() => {
      expect(screen.getByText('YubiKey')).toBeInTheDocument()
    })
  })
})
