import { useTranslation } from 'react-i18next'
import type { ModelSpec, ParamField } from './modelSpecs'

type Props = {
  models: string[]
  model: string
  params: Record<string, unknown>
  spec: ModelSpec
  disabled?: boolean
  onModelChange: (model: string) => void
  onParamsChange: (params: Record<string, unknown>) => void
}

/**
 * Renders a model selector plus one input per field declared on the resolved
 * {@link ModelSpec}. Shared by the image and video playgrounds — the only
 * difference is which spec resolver feeds it.
 */
export function DynamicParamsPanel({
  models,
  model,
  params,
  spec,
  disabled,
  onModelChange,
  onParamsChange,
}: Props) {
  const { t } = useTranslation()

  const setField = (key: string, value: unknown) => {
    onParamsChange({ ...params, [key]: value })
  }

  return (
    <aside className="flex h-full w-full flex-col gap-5 overflow-y-auto border-l border-[color:var(--border)] bg-[color:var(--surface)] p-5">
      <Field label={t('console.playground.field.model')}>
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

      {spec.fields.map((f) => (
        <DynamicField
          key={f.key}
          field={f}
          value={params[f.key]}
          disabled={disabled}
          onChange={(v) => setField(f.key, v)}
        />
      ))}

      <p className="mt-auto pt-2 font-mono text-[10px] uppercase tracking-[2px] text-[color:var(--muted)]/70">
        {t('console.playground.field.specHint', { spec: spec.id })}
      </p>
    </aside>
  )
}

function DynamicField({
  field,
  value,
  disabled,
  onChange,
}: {
  field: ParamField
  value: unknown
  disabled?: boolean
  onChange: (v: unknown) => void
}) {
  const { t } = useTranslation()
  const label = t(`console.playground.field.${field.labelKey}`)
  const hint = field.hintKey ? t(`console.playground.field.${field.hintKey}`) : null

  switch (field.spec.kind) {
    case 'enum':
      return (
        <Field label={label} hint={hint}>
          <select
            value={String(value ?? '')}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-2.5 py-1.5 text-sm outline-none focus:border-[color:var(--cyan)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {field.spec.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label ?? o.value}
              </option>
            ))}
          </select>
        </Field>
      )

    case 'number': {
      const { min, max, step } = field.spec
      return (
        <Field label={label} hint={hint}>
          <input
            type="number"
            min={min}
            max={max}
            step={step ?? 1}
            value={Number(value ?? field.default)}
            disabled={disabled}
            onChange={(e) => {
              const raw = Number(e.target.value)
              const clamped = Math.max(min, Math.min(max, isNaN(raw) ? min : raw))
              onChange(clamped)
            }}
            className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-2.5 py-1.5 text-sm outline-none focus:border-[color:var(--cyan)] disabled:cursor-not-allowed disabled:opacity-50"
          />
        </Field>
      )
    }

    case 'toggle':
      return (
        <label className="flex items-center justify-between gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[2px] text-[color:var(--muted)]">
            {label}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(value)}
            disabled={disabled}
            onClick={() => onChange(!value)}
            className="relative h-5 w-9 rounded-full border border-[color:var(--border)] bg-[color:var(--bg2)] transition-colors data-[on=true]:border-[color:var(--cyan)] data-[on=true]:bg-[color:var(--cyan)]/30 disabled:cursor-not-allowed disabled:opacity-50"
            data-on={Boolean(value)}
          >
            <span
              className="absolute top-0.5 h-3.5 w-3.5 rounded-full bg-[color:var(--text)] transition-transform"
              style={{ transform: value ? 'translateX(18px)' : 'translateX(2px)' }}
            />
          </button>
        </label>
      )

    case 'text':
      return (
        <Field label={label} hint={hint}>
          {field.spec.multiline ? (
            <textarea
              rows={3}
              value={String(value ?? '')}
              disabled={disabled}
              maxLength={field.spec.maxLength}
              placeholder={field.spec.placeholder}
              onChange={(e) => onChange(e.target.value)}
              className="w-full resize-none rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-2.5 py-2 text-sm outline-none focus:border-[color:var(--cyan)] disabled:cursor-not-allowed disabled:opacity-50"
            />
          ) : (
            <input
              type="text"
              value={String(value ?? '')}
              disabled={disabled}
              maxLength={field.spec.maxLength}
              placeholder={field.spec.placeholder}
              onChange={(e) => onChange(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-2.5 py-1.5 text-sm outline-none focus:border-[color:var(--cyan)] disabled:cursor-not-allowed disabled:opacity-50"
            />
          )}
        </Field>
      )

    case 'urlList': {
      const urls = Array.isArray(value) ? (value as string[]) : []
      const cap = field.spec.max
      return (
        <Field label={label} hint={hint}>
          <textarea
            rows={3}
            value={urls.join('\n')}
            disabled={disabled}
            placeholder="https://…"
            onChange={(e) => {
              const list = e.target.value
                .split(/\n+/)
                .map((s) => s.trim())
                .filter(Boolean)
              onChange(cap ? list.slice(0, cap) : list)
            }}
            className="w-full resize-none rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-2.5 py-2 font-mono text-xs outline-none focus:border-[color:var(--cyan)] disabled:cursor-not-allowed disabled:opacity-50"
          />
        </Field>
      )
    }
  }
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string | null
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[2px] text-[color:var(--muted)]">{label}</span>
      {children}
      {hint && <span className="text-[11px] leading-snug text-[color:var(--muted)]">{hint}</span>}
    </label>
  )
}
