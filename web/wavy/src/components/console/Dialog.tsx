import { useEffect, type ReactNode } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  kicker?: string
  children: ReactNode
  /** Max-width Tailwind class. Default `max-w-md`. */
  width?: string
}

/** Modal shell shared by add/edit dialogs. Backdrop click + Escape close. */
export function Dialog({ open, onClose, title, kicker, children, width = 'max-w-md' }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full ${width} rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-7 shadow-[var(--shadow-jelly)]`}
      >
        {kicker && <div className="kicker mb-1.5">{kicker}</div>}
        <h2 className="mb-6 font-display text-xl font-bold tracking-[-0.5px]">{title}</h2>
        {children}
      </div>
    </div>
  )
}

type FieldProps = {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  optional?: boolean
  hint?: string
  autoFocus?: boolean
  disabled?: boolean
}

export function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  optional,
  hint,
  autoFocus,
  disabled,
}: FieldProps) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 flex items-center gap-1.5 font-mono text-xs uppercase tracking-[2px] text-[color:var(--muted)]">
        {label}
        {optional && <span className="text-[color:var(--muted)]/50">(optional)</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-3 py-2 text-sm transition focus:border-[color:var(--cyan)] focus:outline-none focus:ring-2 focus:ring-[color:var(--cyan)]/20 disabled:cursor-not-allowed disabled:opacity-60"
      />
      {hint && <span className="mt-1 block text-xs text-[color:var(--muted)]/70">{hint}</span>}
    </label>
  )
}

export function TextArea({
  label,
  value,
  onChange,
  rows = 4,
  placeholder,
  optional,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  rows?: number
  placeholder?: string
  optional?: boolean
  hint?: string
}) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 flex items-center gap-1.5 font-mono text-xs uppercase tracking-[2px] text-[color:var(--muted)]">
        {label}
        {optional && <span className="text-[color:var(--muted)]/50">(optional)</span>}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-3 py-2 font-mono text-sm transition focus:border-[color:var(--cyan)] focus:outline-none focus:ring-2 focus:ring-[color:var(--cyan)]/20"
      />
      {hint && <span className="mt-1 block text-xs text-[color:var(--muted)]/70">{hint}</span>}
    </label>
  )
}

type SelectOption = { value: string | number; label: string }

export function Select({
  label,
  value,
  onChange,
  options,
  optional,
  hint,
}: {
  label: string
  value: string | number
  onChange: (v: string) => void
  options: SelectOption[]
  optional?: boolean
  hint?: string
}) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 flex items-center gap-1.5 font-mono text-xs uppercase tracking-[2px] text-[color:var(--muted)]">
        {label}
        {optional && <span className="text-[color:var(--muted)]/50">(optional)</span>}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-3 py-2 text-sm transition focus:border-[color:var(--cyan)] focus:outline-none focus:ring-2 focus:ring-[color:var(--cyan)]/20"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <span className="mt-1 block text-xs text-[color:var(--muted)]/70">{hint}</span>}
    </label>
  )
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="mt-2 flex justify-end gap-2.5">{children}</div>
}

export function DialogError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="mb-4 rounded-lg border border-[color:var(--coral)]/30 bg-[color:var(--coral)]/8 px-3 py-2 text-sm text-[color:var(--coral)]">
      {message}
    </div>
  )
}
