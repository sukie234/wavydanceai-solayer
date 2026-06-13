import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PasskeyCard } from './PasskeyCard'
import { AppDialogsProvider } from '@/components/ui/AppDialogs'
import type { PasskeyView } from '@/lib/services/passkey'
import '@/lib/i18n'

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

vi.mock('@/lib/services/status', () => ({
  statusService: { get: vi.fn() },
}))

import { passkeyService } from '@/lib/services/passkey'
import { statusService } from '@/lib/services/status'
import { isWebAuthnSupported } from './passkey-ceremonies'

const mockList = passkeyService.list as ReturnType<typeof vi.fn>
const mockRegister = passkeyService.register as ReturnType<typeof vi.fn>
const mockRename = passkeyService.rename as ReturnType<typeof vi.fn>
const mockRemove = passkeyService.remove as ReturnType<typeof vi.fn>
const mockStatus = statusService.get as ReturnType<typeof vi.fn>
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
  // Feature flag on by default — individual tests flip it off.
  mockStatus.mockResolvedValue({ passkey_login: true })
})

describe('<PasskeyCard>', () => {
  it('renders nothing when the passkey feature flag is off', async () => {
    mockStatus.mockResolvedValue({ passkey_login: false })
    mockList.mockResolvedValue([])

    const { container } = renderWithQuery(<PasskeyCard />)

    await waitFor(() => expect(mockStatus).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
    expect(mockList).not.toHaveBeenCalled()
  })

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

  it('shows Loading… while the query is pending', async () => {
    // Never-resolving promise keeps the component in loading state
    mockList.mockReturnValue(new Promise(() => {}))

    renderWithQuery(<PasskeyCard />)

    // findBy: the section only mounts once the status query resolves.
    expect(await screen.findByText('Loading…')).toBeInTheDocument()
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

  it('surfaces the error when renaming a passkey fails', async () => {
    const passkey: PasskeyView = {
      id: 1, name: 'MacBook', transports: 'usb', created_at: 1_700_000_000, last_used_at: 0,
    }
    mockList.mockResolvedValue([passkey])
    mockRename.mockRejectedValue(new Error('rename rejected by server'))

    renderWithQuery(<PasskeyCard />)
    await screen.findByText('MacBook')

    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))
    const input = await screen.findByPlaceholderText('New name')
    await userEvent.clear(input)
    await userEvent.type(input, 'Laptop')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('rename rejected by server')).toBeInTheDocument()
  })

  it('surfaces the error when deleting a passkey fails', async () => {
    const passkey: PasskeyView = {
      id: 1, name: 'MacBook', transports: 'usb', created_at: 1_700_000_000, last_used_at: 0,
    }
    mockList.mockResolvedValue([passkey])
    mockRemove.mockRejectedValue(new Error('delete rejected by server'))

    renderWithQuery(<PasskeyCard />)
    await screen.findByText('MacBook')

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('delete rejected by server')).toBeInTheDocument()
  })
})
