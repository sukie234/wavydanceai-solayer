import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'
import '@/lib/i18n'

// Route-level component test: stub the router surface so we can grab the
// component off the route options without a full <RouterProvider> (no router
// test helper yet — TESTING.md).
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  redirect: vi.fn((loc: unknown) => loc),
}))

vi.mock('@/lib/services/options', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/services/options')>()
  return {
    ...mod,
    optionsService: {
      list: vi.fn(),
      update: vi.fn(),
    },
  }
})

import { optionsService } from '@/lib/services/options'
import { Route } from './console.settings'

const mockListOptions = optionsService.list as ReturnType<typeof vi.fn>
const mockUpdateOption = optionsService.update as ReturnType<typeof vi.fn>

const SettingsPage = (Route as unknown as { options: { component: React.ComponentType } }).options
  .component

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <SettingsPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockListOptions.mockResolvedValue([{ key: 'PasswordLoginEnabled', value: 'true' }])
})

describe('/console/settings option save errors', () => {
  it('surfaces the API error when saving an option fails', async () => {
    mockUpdateOption.mockRejectedValue(new ApiError('option write refused'))

    renderPage()
    // First switch is PasswordLoginEnabled (first field of the auth section).
    const toggles = await screen.findAllByRole('switch')
    await userEvent.click(toggles[0])

    await waitFor(() => {
      expect(mockUpdateOption).toHaveBeenCalledWith('PasswordLoginEnabled', 'false')
    })
    expect(await screen.findByText('option write refused')).toBeInTheDocument()
  })

  it('falls back to the i18n message for non-API errors', async () => {
    mockUpdateOption.mockRejectedValue(new Error('network blip'))

    renderPage()
    const toggles = await screen.findAllByRole('switch')
    await userEvent.click(toggles[0])

    expect(await screen.findByText('Save failed')).toBeInTheDocument()
  })

  it('clears the error after a subsequent successful save', async () => {
    mockUpdateOption
      .mockRejectedValueOnce(new ApiError('option write refused'))
      .mockResolvedValueOnce(undefined)

    renderPage()
    const toggles = await screen.findAllByRole('switch')
    await userEvent.click(toggles[0])
    expect(await screen.findByText('option write refused')).toBeInTheDocument()

    await userEvent.click(toggles[0])
    await waitFor(() => {
      expect(screen.queryByText('option write refused')).not.toBeInTheDocument()
    })
  })
})
