import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'
import '@/lib/i18n'

// Route-level component test: stub the router surface so we can grab the
// component off the route options without a full <RouterProvider> (no router
// test helper yet — TESTING.md).
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ children }: { children?: React.ReactNode }) => <a>{children}</a>,
}))

vi.mock('@/lib/services/playground', () => ({
  playgroundService: {
    getToken: vi.fn(),
    listChatModels: vi.fn(),
    listImageModels: vi.fn(),
    listVideoModels: vi.fn(),
  },
}))

vi.mock('@/lib/services/auth', () => ({
  authService: { getSelf: vi.fn() },
}))

import { playgroundService } from '@/lib/services/playground'
import { authService } from '@/lib/services/auth'
import { Route } from './console.playground.chat'

const mockGetToken = playgroundService.getToken as ReturnType<typeof vi.fn>
const mockListChatModels = playgroundService.listChatModels as ReturnType<typeof vi.fn>
const mockGetSelf = authService.getSelf as ReturnType<typeof vi.fn>

const PlaygroundChat = (Route as unknown as { options: { component: React.ComponentType } })
  .options.component

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <PlaygroundChat />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockListChatModels.mockResolvedValue(['gpt-4o'])
  mockGetSelf.mockResolvedValue({ id: 1, quota: 1000 })
})

describe('/console/playground/chat token errors', () => {
  it('shows an error banner when the playground token query fails', async () => {
    mockGetToken.mockRejectedValue(new ApiError('unauthorized'))

    renderPage()

    expect(
      await screen.findByText(/Could not load your playground API token/),
    ).toBeInTheDocument()
  })

  it('shows no token banner when the token loads', async () => {
    mockGetToken.mockResolvedValue('sk-playground')

    renderPage()
    await waitFor(() => expect(mockGetToken).toHaveBeenCalled())

    expect(screen.queryByText(/Could not load your playground API token/)).not.toBeInTheDocument()
  })
})
