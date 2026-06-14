import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'
import '@/lib/i18n'

vi.mock('@tanstack/react-router', () => ({
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
import { MediaPlayground } from './MediaPlayground'

const mockGetToken = playgroundService.getToken as ReturnType<typeof vi.fn>
const mockListImageModels = playgroundService.listImageModels as ReturnType<typeof vi.fn>
const mockGetSelf = authService.getSelf as ReturnType<typeof vi.fn>

function renderPlayground() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <MediaPlayground modality="image" />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockListImageModels.mockResolvedValue(['gpt-image-1'])
  mockGetSelf.mockResolvedValue({ id: 1, quota: 1000 })
})

describe('<MediaPlayground> token errors', () => {
  it('shows an error banner when the playground token query fails', async () => {
    mockGetToken.mockRejectedValue(new ApiError('unauthorized'))

    renderPlayground()

    expect(
      await screen.findByText(/Could not load your playground API token/),
    ).toBeInTheDocument()
  })

  it('shows no token banner when the token loads', async () => {
    mockGetToken.mockResolvedValue('sk-playground')

    renderPlayground()
    await waitFor(() => expect(mockGetToken).toHaveBeenCalled())

    expect(screen.queryByText(/Could not load your playground API token/)).not.toBeInTheDocument()
  })
})
