import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MessageSquare } from 'lucide-react'
import { ModalityCard } from './ModalityCard'

describe('<ModalityCard>', () => {
  it('renders title, description, and active CTA when enabled', () => {
    render(
      <ModalityCard
        icon={MessageSquare}
        title="Chat"
        description="Talk to LLMs"
        cta="Open"
      />,
    )
    expect(screen.getByText('Chat')).toBeInTheDocument()
    expect(screen.getByText('Talk to LLMs')).toBeInTheDocument()
    expect(screen.getByText('Open')).toBeInTheDocument()
  })

  it('marks card as aria-disabled and shows the coming-soon pill when disabled', () => {
    render(
      <ModalityCard
        icon={MessageSquare}
        title="Video"
        description="Generate videos"
        cta="Coming soon"
        disabled
      />,
    )
    // The wrapping div is the aria-disabled element; query by description text
    // and walk up to find it.
    const desc = screen.getByText('Generate videos')
    const card = desc.closest('[aria-disabled]') as HTMLElement
    expect(card).not.toBeNull()
    expect(card.getAttribute('aria-disabled')).toBe('true')
    expect(card.getAttribute('data-disabled')).toBe('true')
    expect(screen.getByText('Coming soon')).toBeInTheDocument()
  })
})
