import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppDialogsProvider } from '@/components/ui/AppDialogs'
import { ApiError } from '@/lib/api'
import type { Channel } from '@/lib/types'
import '@/lib/i18n'

// Controllable route context — the component reads isRoot from here (set in
// beforeLoad) to gate the pricing editor. Mutate per test.
const routeContext = vi.hoisted(() => ({ isRoot: false }))

// Route-level component test: stub the router surface so we can grab the
// component off the route options without a full <RouterProvider> (no router
// test helper yet — TESTING.md).
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useRouteContext: () => routeContext,
  }),
  redirect: vi.fn((loc: unknown) => loc),
}))

// Stub the root-only pricing editor so the gate can be asserted without its
// own data dependencies (optionsService / channelsService.listAll).
vi.mock('@/components/console/pricing/PricingSection', () => ({
  PricingSection: () => <div>PRICING_EDITOR</div>,
}))

vi.mock('@/lib/services/channels', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/services/channels')>()
  return {
    ...mod,
    channelsService: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      test: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  }
})

import { channelsService } from '@/lib/services/channels'
import { Route } from './console.channels'

const mockList = channelsService.list as ReturnType<typeof vi.fn>
const mockTest = channelsService.test as ReturnType<typeof vi.fn>
const mockUpdate = channelsService.update as ReturnType<typeof vi.fn>
const mockRemove = channelsService.remove as ReturnType<typeof vi.fn>

const ChannelsPage = (Route as unknown as { options: { component: React.ComponentType } }).options
  .component

const channel: Channel = {
  id: 1,
  type: 1,
  key: '',
  status: 1,
  name: 'worldrouter',
  weight: null,
  created_time: 0,
  test_time: 0,
  response_time: 0,
  base_url: null,
  balance: 0,
  balance_updated_time: 0,
  models: '',
  group: 'default',
  used_quota: 0,
  model_mapping: null,
  priority: 0,
  config: '',
  system_prompt: null,
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <AppDialogsProvider>
        <ChannelsPage />
      </AppDialogsProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockList.mockResolvedValue([channel])
  routeContext.isRoot = false
})

describe('/console/channels pricing gate', () => {
  it('hides the pricing editor for non-root admins', async () => {
    routeContext.isRoot = false

    renderPage()
    await screen.findByText('worldrouter')

    expect(screen.queryByText('PRICING_EDITOR')).toBeNull()
  })

  it('shows the pricing editor for root', async () => {
    routeContext.isRoot = true

    renderPage()

    expect(await screen.findByText('PRICING_EDITOR')).toBeInTheDocument()
  })
})

describe('/console/channels mutation errors', () => {
  it('surfaces the API error when testing a channel fails', async () => {
    mockTest.mockRejectedValue(new ApiError('upstream returned 500'))

    renderPage()
    await screen.findByText('worldrouter')

    await userEvent.click(screen.getByRole('button', { name: 'Test' }))

    expect(await screen.findByText('upstream returned 500')).toBeInTheDocument()
  })

  it('surfaces the API error when toggling a channel fails', async () => {
    mockUpdate.mockRejectedValue(new ApiError('channel is locked'))

    renderPage()
    await screen.findByText('worldrouter')

    await userEvent.click(screen.getByRole('button', { name: 'Disable' }))

    expect(await screen.findByText('channel is locked')).toBeInTheDocument()
  })

  it('surfaces the API error when deleting a channel fails after confirm', async () => {
    mockRemove.mockRejectedValue(new ApiError('cannot delete: in use'))

    renderPage()
    await screen.findByText('worldrouter')

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('cannot delete: in use')).toBeInTheDocument()
  })

  it('falls back to the i18n message for non-API errors', async () => {
    mockTest.mockRejectedValue(new Error('network blip'))

    renderPage()
    await screen.findByText('worldrouter')

    await userEvent.click(screen.getByRole('button', { name: 'Test' }))

    expect(await screen.findByText('Operation failed')).toBeInTheDocument()
  })
})
