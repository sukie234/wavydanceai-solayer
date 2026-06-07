import { useTranslation } from 'react-i18next'
import type { ChatParams } from './types'

type Props = {
  models: string[]
  model: string
  systemPrompt: string
  params: ChatParams
  disabled?: boolean
  onModelChange: (model: string) => void
  onSystemPromptChange: (value: string) => void
  onParamsChange: (params: ChatParams) => void
}

export function ParamsPanel({
  models,
  model,
  systemPrompt,
  params,
  disabled,
  onModelChange,
  onSystemPromptChange,
  onParamsChange,
}: Props) {
  const { t } = useTranslation()

  return (
    <aside className="flex h-full w-full flex-col gap-5 overflow-y-auto border-l border-[color:var(--border)] bg-[color:var(--surface)] p-5">
      <Field label={t('console.playground.chat.params.model')}>
        <select
          value={model}
          disabled={disabled || models.length === 0}
          onChange={(e) => onModelChange(e.target.value)}
          className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-2.5 py-1.5 text-sm outline-none focus:border-[color:var(--cyan)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {models.length === 0 && <option value="">—</option>}
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>

      <Slider
        label={t('console.playground.chat.params.temperature')}
        min={0}
        max={2}
        step={0.05}
        value={params.temperature}
        disabled={disabled}
        onChange={(v) => onParamsChange({ ...params, temperature: v })}
      />

      <Slider
        label={t('console.playground.chat.params.topP')}
        min={0}
        max={1}
        step={0.05}
        value={params.top_p}
        disabled={disabled}
        onChange={(v) => onParamsChange({ ...params, top_p: v })}
      />

      <Field label={t('console.playground.chat.params.maxTokens')}>
        <input
          type="number"
          min={1}
          max={32_000}
          step={64}
          value={params.max_tokens}
          disabled={disabled}
          onChange={(e) => onParamsChange({ ...params, max_tokens: Math.max(1, Number(e.target.value) || 1) })}
          className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-2.5 py-1.5 text-sm outline-none focus:border-[color:var(--cyan)]"
        />
      </Field>

      <Field label={t('console.playground.chat.params.system')}>
        <textarea
          rows={5}
          value={systemPrompt}
          disabled={disabled}
          onChange={(e) => onSystemPromptChange(e.target.value)}
          placeholder={t('console.playground.chat.params.systemPlaceholder')}
          className="w-full resize-none rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-2.5 py-2 text-sm leading-relaxed outline-none focus:border-[color:var(--cyan)] disabled:cursor-not-allowed disabled:opacity-50"
        />
      </Field>
    </aside>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[2px] text-[color:var(--muted)]">{label}</span>
      {children}
    </label>
  )
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  disabled,
  onChange,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  disabled?: boolean
  onChange: (v: number) => void
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[2px] text-[color:var(--muted)]">{label}</span>
        <span className="font-mono text-xs tabular-nums text-[color:var(--text)]">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[color:var(--bg2)] accent-[color:var(--cyan)] disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  )
}
