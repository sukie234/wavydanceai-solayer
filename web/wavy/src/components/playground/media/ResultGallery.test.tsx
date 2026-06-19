import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@/lib/i18n'
import { ResultGallery } from './ResultGallery'
import type { MediaJob } from './types'

function succeededJob(overrides: Partial<MediaJob> = {}): MediaJob {
  return {
    id: 'job-1',
    prompt: 'a red apple',
    model: 'gemini-2.5-flash-image',
    params: {},
    status: 'succeeded',
    results: [{ url: 'data:image/png;base64,AAAA', receivedAt: 0 }],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

describe('ResultGallery downloads', () => {
  it('renders a download link with the download attribute for image results', () => {
    render(<ResultGallery modality="image" jobs={[succeededJob()]} />)
    const dl = screen.getByTitle('Download') as HTMLAnchorElement
    expect(dl).toHaveAttribute('download', 'gemini-2.5-flash-image-1.png')
    expect(dl).toHaveAttribute('href', 'data:image/png;base64,AAAA')
  })

  it('renders a native video player (no download anchor) for video results', () => {
    const { container } = render(
      <ResultGallery
        modality="video"
        jobs={[succeededJob({ model: 'seedance-2.0', results: [{ url: 'https://cdn/x.mp4', receivedAt: 0 }] })]}
      />,
    )
    expect(container.querySelector('video')).toBeInTheDocument()
    // cross-origin video can't be force-downloaded — relies on native controls
    expect(screen.queryByTitle('Download')).toBeNull()
  })
})
