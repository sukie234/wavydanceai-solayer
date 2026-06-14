import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppDialogsProvider } from '@/components/ui/AppDialogs'
import { ApiError } from '@/lib/api'
import { TokenStatus, type Token } from '@/lib/types'
import '@/lib/i18n'

// Route-level component test: stub the router surface so we can grab the
// component off the route options without a full <RouterProvider> (no router
// test helper yet — TESTING.md).
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
}))

vi.mock('@/lib/services/tokens', () => ({
  tokensService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

import { tokensService } from '@/lib/services/tokens'
import { Route } from './console.tokens'

const mockList = tokensService.list as ReturnType<typeof vi.fn>
const mockUpdate = tokensService.update as ReturnType<typeof vi.fn>
const mockRemove = tokensService.remove as ReturnType<typeof vi.fn>

const TokensPage = (Route as unknown as { options: { component: React.ComponentType } }).options
  .component

const token: Token = {
  id: 7,
  user_id: 1,
  key: 'test-key', // low-entropy on purpose — gitleaks flags realistic-looking keys
  status: TokenStatus.Enabled,
  name: 'production-app',
  created_time: 1_700_000_000,
  accessed_time: 0,
  expired_time: -1,
  remain_quota: 0,
  unlimited_quota: true,
  used_quota: 0,
  models: null,
  subnet: null,
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <AppDialogsProvider>
        <TokensPage />
      </AppDialogsProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockList.mockResolvedValue([token])
})

describe('/console/tokens mutation errors', () => {
  it('surfaces the API error when disabling a key fails', async () => {
    mockUpdate.mockRejectedValue(new ApiError('token is exhausted'))

    renderPage()
    await screen.findByText('production-app')

    await userEvent.click(screen.getByRole('button', { name: 'Disable' }))

    expect(await screen.findByText('token is exhausted')).toBeInTheDocument()
  })

  it('surfaces the API error when deleting a key fails after confirm', async () => {
    mockRemove.mockRejectedValue(new ApiError('delete rejected'))

    renderPage()
    await screen.findByText('production-app')

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('delete rejected')).toBeInTheDocument()
  })

  it('falls back to the i18n message for non-API errors', async () => {
    mockUpdate.mockRejectedValue(new Error('network blip'))

    renderPage()
    await screen.findByText('production-app')

    await userEvent.click(screen.getByRole('button', { name: 'Disable' }))

    expect(await screen.findByText('Operation failed')).toBeInTheDocument()
  })
})
