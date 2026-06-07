import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionList } from './SessionList'
import type { ChatSession } from './types'

function makeSession(id: string, title: string): ChatSession {
  return {
    id,
    title,
    model: 'gpt-4o',
    systemPrompt: '',
    params: { temperature: 0.7, max_tokens: 1024, top_p: 1 },
    messages: [],
    createdAt: 1,
    updatedAt: 1,
  }
}

describe('<SessionList>', () => {
  it('shows empty state when there are no sessions', () => {
    render(
      <SessionList
        sessions={[]}
        activeId={null}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    // i18n is not initialized in tests so we assert on the raw key. The en/zh
    // copies are checked via plan §9 and visual QA, not unit tests.
    expect(screen.getByText('console.playground.chat.empty')).toBeInTheDocument()
  })

  it('renders sessions and fires onSelect when a row is clicked', async () => {
    const onSelect = vi.fn()
    render(
      <SessionList
        sessions={[makeSession('a', 'First'), makeSession('b', 'Second')]}
        activeId="a"
        onSelect={onSelect}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByText('Second'))
    expect(onSelect).toHaveBeenCalledWith('b')
  })

  it('fires onDelete without firing onSelect when delete is clicked', async () => {
    const onSelect = vi.fn()
    const onDelete = vi.fn()
    render(
      <SessionList
        sessions={[makeSession('a', 'First')]}
        activeId="a"
        onSelect={onSelect}
        onCreate={vi.fn()}
        onDelete={onDelete}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'delete' }))
    expect(onDelete).toHaveBeenCalledWith('a')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('fires onCreate when the new-chat button is clicked', async () => {
    const onCreate = vi.fn()
    render(
      <SessionList
        sessions={[]}
        activeId={null}
        onSelect={vi.fn()}
        onCreate={onCreate}
        onDelete={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'console.playground.chat.newSession' }))
    expect(onCreate).toHaveBeenCalledTimes(1)
  })
})
