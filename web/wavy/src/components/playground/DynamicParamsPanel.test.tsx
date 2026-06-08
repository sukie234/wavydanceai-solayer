import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DynamicParamsPanel } from './DynamicParamsPanel'
import { defaultParamsFor, resolveModelSpec } from './modelSpecs'

describe('<DynamicParamsPanel>', () => {
  it('renders one field per spec entry plus the model select', () => {
    const spec = resolveModelSpec('image', 'dall-e-3')
    render(
      <DynamicParamsPanel
        models={['dall-e-3']}
        model="dall-e-3"
        params={defaultParamsFor(spec)}
        spec={spec}
        onModelChange={vi.fn()}
        onParamsChange={vi.fn()}
      />,
    )
    // 1 model select + 1 select per enum field (size, quality, style) = 4
    expect(screen.getAllByRole('combobox')).toHaveLength(4)
  })

  it('renders a number input for numeric fields', () => {
    const spec = resolveModelSpec('image', 'dall-e-2')
    render(
      <DynamicParamsPanel
        models={['dall-e-2']}
        model="dall-e-2"
        params={defaultParamsFor(spec)}
        spec={spec}
        onModelChange={vi.fn()}
        onParamsChange={vi.fn()}
      />,
    )
    const input = screen.getByRole('spinbutton') as HTMLInputElement
    expect(input.value).toBe('1')
    expect(input.min).toBe('1')
    expect(input.max).toBe('10')
  })

  it('renders a toggle for boolean fields and flips on click', async () => {
    const spec = resolveModelSpec('video', 'kling-2.6/text-to-video')
    function Harness() {
      const [params, setParams] = useState(defaultParamsFor(spec))
      return (
        <DynamicParamsPanel
          models={['kling-2.6/text-to-video']}
          model="kling-2.6/text-to-video"
          params={params}
          spec={spec}
          onModelChange={vi.fn()}
          onParamsChange={setParams}
        />
      )
    }
    render(<Harness />)
    const sound = screen.getByRole('switch')
    expect(sound.getAttribute('aria-checked')).toBe('false')
    await userEvent.click(sound)
    expect(sound.getAttribute('aria-checked')).toBe('true')
  })

  it('fires onParamsChange when an enum field changes', async () => {
    const spec = resolveModelSpec('image', 'dall-e-3')
    const onParamsChange = vi.fn()
    function Harness() {
      const [params, setParams] = useState(defaultParamsFor(spec))
      return (
        <DynamicParamsPanel
          models={['dall-e-3']}
          model="dall-e-3"
          params={params}
          spec={spec}
          onModelChange={vi.fn()}
          onParamsChange={(p) => {
            setParams(p)
            onParamsChange(p)
          }}
        />
      )
    }
    render(<Harness />)
    // The second combobox is the `size` enum (first is the model selector).
    const selects = screen.getAllByRole('combobox')
    await userEvent.selectOptions(selects[1], '1792x1024')
    expect(onParamsChange).toHaveBeenCalledWith(
      expect.objectContaining({ size: '1792x1024' }),
    )
  })

  it('disables all controls when disabled', () => {
    const spec = resolveModelSpec('image', 'dall-e-3')
    render(
      <DynamicParamsPanel
        models={['dall-e-3']}
        model="dall-e-3"
        params={defaultParamsFor(spec)}
        spec={spec}
        disabled
        onModelChange={vi.fn()}
        onParamsChange={vi.fn()}
      />,
    )
    for (const sel of screen.getAllByRole('combobox')) {
      expect(sel).toBeDisabled()
    }
  })
})
