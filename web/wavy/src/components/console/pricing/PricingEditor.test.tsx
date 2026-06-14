import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppDialogsProvider } from '@/components/ui/AppDialogs'
import { PricingEditor } from './PricingEditor'
import '@/lib/i18n'

function renderEditor(overrides?: Partial<Parameters<typeof PricingEditor>[0]>) {
  const onSave = vi.fn().mockResolvedValue(undefined)
  render(
    <AppDialogsProvider>
      <PricingEditor
        groupRatio={{ default: 1 }}
        modelRatio={{ 'gpt-4o': 1.25, 'claude-3-haiku': 0.35 }}
        completionRatio={{ 'gpt-4o': 4 }}
        onSave={onSave}
        {...overrides}
      />
    </AppDialogsProvider>,
  )
  return { onSave }
}

function modelsSection() {
  const section = screen.getByText('Model ratios').closest('section')
  expect(section).not.toBeNull()
  return within(section!)
}

function groupsSection() {
  const section = screen.getByText('Group ratios').closest('section')
  expect(section).not.toBeNull()
  return within(section!)
}

/** Click through the danger confirm dialog ("Apply"). */
async function confirmApply() {
  await userEvent.click(await screen.findByRole('button', { name: 'Apply' }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('<PricingEditor> rendering', () => {
  it('renders model rows with derived dollar prices', () => {
    renderEditor()
    // gpt-4o: ratio 1.25 → $2.5/M input, completion 4 → $10/M output
    expect(screen.getByLabelText('gpt-4o input price')).toHaveValue('2.5')
    expect(screen.getByLabelText('gpt-4o output price')).toHaveValue('10')
    // claude-3-haiku: ratio 0.35 → $0.7/M input
    expect(screen.getByLabelText('claude-3-haiku input price')).toHaveValue('0.7')
  })

  it('shows the inherited-default placeholder for models without a completion entry', () => {
    renderEditor()
    const completion = screen.getByLabelText('claude-3-haiku completion ratio')
    expect(completion).toHaveValue('')
    expect(completion).toHaveAttribute('placeholder', 'default')
  })

  it('filters models by name substring', async () => {
    renderEditor()
    await userEvent.type(screen.getByLabelText('Search models…'), 'haiku')
    expect(screen.getByLabelText('claude-3-haiku model ratio')).toBeInTheDocument()
    expect(screen.queryByLabelText('gpt-4o model ratio')).not.toBeInTheDocument()
  })
})

describe('<PricingEditor> bidirectional editing', () => {
  it('editing the dollar price recomputes the ratio (0.70 → 0.35)', async () => {
    renderEditor()
    const price = screen.getByLabelText('claude-3-haiku input price')
    await userEvent.clear(price)
    await userEvent.type(price, '0.70')
    expect(screen.getByLabelText('claude-3-haiku model ratio')).toHaveValue('0.35')
  })

  it('editing the ratio recomputes the dollar price and output price', async () => {
    renderEditor()
    const ratio = screen.getByLabelText('gpt-4o model ratio')
    await userEvent.clear(ratio)
    await userEvent.type(ratio, '2')
    expect(screen.getByLabelText('gpt-4o input price')).toHaveValue('4')
    // completion ratio 4 stays → output = 4 × 4 = 16
    expect(screen.getByLabelText('gpt-4o output price')).toHaveValue('16')
  })

  it('editing the output price recomputes the completion ratio', async () => {
    renderEditor()
    const output = screen.getByLabelText('claude-3-haiku output price')
    await userEvent.type(output, '1.4') // input is 0.7 → completion 2
    expect(screen.getByLabelText('claude-3-haiku completion ratio')).toHaveValue('2')
  })
})

describe('<PricingEditor> dirty state and save', () => {
  it('save stays disabled until something changes', async () => {
    renderEditor()
    const save = modelsSection().getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    const ratio = screen.getByLabelText('claude-3-haiku model ratio')
    await userEvent.clear(ratio)
    await userEvent.type(ratio, '0.5')
    expect(save).toBeEnabled()
  })

  it('saving the model section PUTs ModelRatio and CompletionRatio after confirm', async () => {
    const { onSave } = renderEditor()
    const ratio = screen.getByLabelText('claude-3-haiku model ratio')
    await userEvent.clear(ratio)
    await userEvent.type(ratio, '0.5')
    await userEvent.click(modelsSection().getByRole('button', { name: 'Save' }))
    await confirmApply()

    expect(onSave).toHaveBeenCalledTimes(2)
    const [modelCall, completionCall] = onSave.mock.calls
    expect(modelCall[0]).toBe('ModelRatio')
    expect(JSON.parse(modelCall[1] as string)).toEqual({ 'gpt-4o': 1.25, 'claude-3-haiku': 0.5 })
    expect(completionCall[0]).toBe('CompletionRatio')
    expect(JSON.parse(completionCall[1] as string)).toEqual({ 'gpt-4o': 4 })
  })

  it('saving the group section PUTs GroupRatio', async () => {
    const { onSave } = renderEditor()
    const ratio = screen.getByLabelText('default group ratio')
    await userEvent.clear(ratio)
    await userEvent.type(ratio, '1.3')
    await userEvent.click(groupsSection().getByRole('button', { name: 'Save' }))
    await confirmApply()

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith('GroupRatio', JSON.stringify({ default: 1.3 }))
  })

  it('cancelling the confirm dialog does not save', async () => {
    const { onSave } = renderEditor()
    const ratio = screen.getByLabelText('default group ratio')
    await userEvent.clear(ratio)
    await userEvent.type(ratio, '1.3')
    await userEvent.click(groupsSection().getByRole('button', { name: 'Save' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('a non-numeric ratio blocks saving', async () => {
    renderEditor()
    const ratio = screen.getByLabelText('claude-3-haiku model ratio')
    await userEvent.clear(ratio)
    await userEvent.type(ratio, 'abc')
    expect(modelsSection().getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(modelsSection().getByText('Fix the highlighted values before saving.')).toBeInTheDocument()
  })

  it('adding a model prepends an empty row that must be filled before saving', async () => {
    renderEditor()
    await userEvent.click(screen.getByRole('button', { name: /Add model/ }))
    expect(screen.getByLabelText('new model name')).toHaveValue('')
    expect(modelsSection().getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})

describe('<PricingEditor> free models and orphan completion keys', () => {
  it('a non-zero output price on a free model (ratio 0) blocks saving', async () => {
    renderEditor({ modelRatio: { 'glm-4-flash': 0 }, completionRatio: {} })
    await userEvent.type(screen.getByLabelText('glm-4-flash output price'), '5')
    expect(modelsSection().getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(modelsSection().getByText('Fix the highlighted values before saving.')).toBeInTheDocument()
  })

  it('preserves an orphan CompletionRatio key that no table row claims', async () => {
    const { onSave } = renderEditor({ completionRatio: { 'gpt-4o': 4, 'o1-mini': 3 } })
    const ratio = screen.getByLabelText('claude-3-haiku model ratio')
    await userEvent.clear(ratio)
    await userEvent.type(ratio, '0.5')
    await userEvent.click(modelsSection().getByRole('button', { name: 'Save' }))
    await confirmApply()

    const completionCall = onSave.mock.calls[1]
    expect(JSON.parse(completionCall[1] as string)).toEqual({ 'gpt-4o': 4, 'o1-mini': 3 })
  })

  it('a newly added row takes over its orphan completion key instead of inheriting it', async () => {
    const { onSave } = renderEditor({ completionRatio: { 'gpt-4o': 4, 'o1-mini': 3 } })
    await userEvent.click(screen.getByRole('button', { name: /Add model/ }))
    await userEvent.type(screen.getByLabelText('new model name'), 'o1-mini')
    await userEvent.type(screen.getByLabelText('o1-mini model ratio'), '1')
    await userEvent.click(modelsSection().getByRole('button', { name: 'Save' }))
    await confirmApply()

    const completionCall = onSave.mock.calls[1]
    // completion left blank → backend default, the stale orphan value must not survive
    expect(JSON.parse(completionCall[1] as string)).toEqual({ 'gpt-4o': 4 })
  })

  it('a CompletionRatio save failure surfaces the error and keeps the section dirty for retry', async () => {
    const onSave = vi
      .fn()
      .mockResolvedValueOnce(undefined) // ModelRatio
      .mockRejectedValueOnce(new Error('boom')) // CompletionRatio
    renderEditor({ onSave })
    const completion = screen.getByLabelText('gpt-4o completion ratio')
    await userEvent.clear(completion)
    await userEvent.type(completion, '5')
    await userEvent.click(modelsSection().getByRole('button', { name: 'Save' }))
    await confirmApply()

    expect(await screen.findByText('Save failed')).toBeInTheDocument()
    expect(modelsSection().getByRole('button', { name: 'Save' })).toBeEnabled()
  })
})

describe('<PricingEditor> raw JSON mode', () => {
  it('switches to three JSON textareas and saves a pasted blob', async () => {
    const { onSave } = renderEditor()
    await userEvent.click(screen.getByRole('button', { name: 'Raw JSON' }))

    const groupArea = screen.getByLabelText('GroupRatio JSON')
    expect(groupArea).toHaveValue(JSON.stringify({ default: 1 }, null, 2))

    await userEvent.clear(groupArea)
    // userEvent.type treats { and [ as modifier syntax — paste instead.
    await userEvent.click(groupArea)
    await userEvent.paste('{"default": 1, "vip": 0.9}')

    const section = screen.getByText('GroupRatio').closest('section')!
    await userEvent.click(within(section).getByRole('button', { name: 'Save' }))
    await confirmApply()

    expect(onSave).toHaveBeenCalledWith('GroupRatio', JSON.stringify({ default: 1, vip: 0.9 }))
  })

  it('resets the textarea to canonical JSON after a save so it is no longer dirty', async () => {
    renderEditor()
    await userEvent.click(screen.getByRole('button', { name: 'Raw JSON' }))
    const groupArea = screen.getByLabelText('GroupRatio JSON')
    await userEvent.clear(groupArea)
    await userEvent.click(groupArea)
    await userEvent.paste('{"default":1,"vip":0.9}')

    const section = screen.getByText('GroupRatio').closest('section')!
    await userEvent.click(within(section).getByRole('button', { name: 'Save' }))
    await confirmApply()

    expect(groupArea).toHaveValue(JSON.stringify({ default: 1, vip: 0.9 }, null, 2))
    expect(within(section).getByRole('button', { name: /^Saved?$/ })).toBeDisabled()
  })

  it('flags invalid JSON and blocks saving', async () => {
    renderEditor()
    await userEvent.click(screen.getByRole('button', { name: 'Raw JSON' }))
    const groupArea = screen.getByLabelText('GroupRatio JSON')
    await userEvent.clear(groupArea)
    await userEvent.click(groupArea)
    await userEvent.paste('{oops')

    const section = screen.getByText('GroupRatio').closest('section')!
    expect(within(section).getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(
      within(section).getByText('Invalid JSON: must be an object of name → non-negative number.'),
    ).toBeInTheDocument()
  })
})
