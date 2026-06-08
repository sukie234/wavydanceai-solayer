import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ParamsPanel } from './ParamsPanel'
import { DEFAULT_PARAMS, type ChatParams } from './types'

describe('<ParamsPanel>', () => {
  it('renders the model dropdown with provided options', () => {
    render(
      <ParamsPanel
        models={['gpt-4o', 'claude-3-5-sonnet']}
        model="gpt-4o"
        systemPrompt=""
        params={DEFAULT_PARAMS}
        onModelChange={vi.fn()}
        onSystemPromptChange={vi.fn()}
        onParamsChange={vi.fn()}
      />,
    )
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('gpt-4o')
    expect(screen.getByRole('option', { name: 'claude-3-5-sonnet' })).toBeInTheDocument()
  })

  it('fires onModelChange when a new model is picked', async () => {
    const onModelChange = vi.fn()
    render(
      <ParamsPanel
        models={['gpt-4o', 'claude-3-5-sonnet']}
        model="gpt-4o"
        systemPrompt=""
        params={DEFAULT_PARAMS}
        onModelChange={onModelChange}
        onSystemPromptChange={vi.fn()}
        onParamsChange={vi.fn()}
      />,
    )
    await userEvent.selectOptions(screen.getByRole('combobox'), 'claude-3-5-sonnet')
    expect(onModelChange).toHaveBeenCalledWith('claude-3-5-sonnet')
  })

  it('fires onParamsChange when max_tokens is edited', () => {
    // Wrap in a stateful container so the controlled input behaves like in
    // real usage. fireEvent.change sets the value directly — userEvent.type
    // accumulates characters which makes the assertion brittle for numeric
    // inputs.
    const onParamsChange = vi.fn()
    function Harness() {
      const [params, setParams] = useState<ChatParams>(DEFAULT_PARAMS)
      return (
        <ParamsPanel
          models={['gpt-4o']}
          model="gpt-4o"
          systemPrompt=""
          params={params}
          onModelChange={vi.fn()}
          onSystemPromptChange={vi.fn()}
          onParamsChange={(p) => {
            setParams(p)
            onParamsChange(p)
          }}
        />
      )
    }
    render(<Harness />)
    const input = screen.getByRole('spinbutton') as HTMLInputElement
    fireEvent.change(input, { target: { value: '2048' } })
    expect(onParamsChange).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 2048 }))
  })

  it('disables interactive controls when disabled', () => {
    render(
      <ParamsPanel
        models={['gpt-4o']}
        model="gpt-4o"
        systemPrompt=""
        params={DEFAULT_PARAMS}
        disabled
        onModelChange={vi.fn()}
        onSystemPromptChange={vi.fn()}
        onParamsChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(screen.getByRole('spinbutton')).toBeDisabled()
  })
})
