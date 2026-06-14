import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppDialogsProvider } from '@/components/ui/AppDialogs'
import { ApiError } from '@/lib/api'
import { type Redemption, type User } from '@/lib/types'
import '@/lib/i18n'

const rootUser = {
  id: 1,
  username: 'root',
  role: 100,
  quota: 1000,
  used_quota: 0,
  request_count: 0,
} as User

// Route-level component test: stub the router surface so we can grab the
// component off the route options and feed it loader data without a full
// <RouterProvider> (no router test helper yet — TESTING.md).
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useLoaderData: () => ({
      me: {
        id: 1,
        username: 'root',
        role: 100,
        quota: 1000,
        used_quota: 0,
        request_count: 0,
      },
    }),
  }),
}))

vi.mock('@/lib/services/billing', () => ({
  billingService: {
    redeem: vi.fn(),
    listRedemptions: vi.fn(),
    createRedemption: vi.fn(),
    deleteRedemption: vi.fn(),
  },
}))

vi.mock('@/lib/services/auth', () => ({
  authService: { getSelf: vi.fn() },
}))

import { billingService } from '@/lib/services/billing'
import { authService } from '@/lib/services/auth'
import { Route } from './console.billing'

const mockListRedemptions = billingService.listRedemptions as ReturnType<typeof vi.fn>
const mockDeleteRedemption = billingService.deleteRedemption as ReturnType<typeof vi.fn>
const mockGetSelf = authService.getSelf as ReturnType<typeof vi.fn>

const BillingPage = (Route as unknown as { options: { component: React.ComponentType } }).options
  .component

const redemption: Redemption = {
  id: 11,
  user_id: 1,
  key: 'wd-aaaa-bbbb-cccc',
  status: 1,
  name: 'promo',
  quota: 500_000,
  created_time: 1_700_000_000,
  redeemed_time: 0,
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <AppDialogsProvider>
        <BillingPage />
      </AppDialogsProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSelf.mockResolvedValue(rootUser)
  mockListRedemptions.mockResolvedValue([redemption])
})

describe('/console/billing redemption delete errors', () => {
  it('surfaces the API error when deleting a redemption fails after confirm', async () => {
    mockDeleteRedemption.mockRejectedValue(new ApiError('redemption already used'))

    renderPage()
    await screen.findByText('promo')

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('redemption already used')).toBeInTheDocument()
  })

  it('falls back to the i18n message for non-API errors', async () => {
    mockDeleteRedemption.mockRejectedValue(new Error('network blip'))

    renderPage()
    await screen.findByText('promo')

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Delete failed')).toBeInTheDocument()
  })
})
