import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

type Props = {
  icon: LucideIcon
  title: string
  description: string
  cta: string
  disabled?: boolean
}

export function ModalityCard({ icon: Icon, title, description, cta, disabled = false }: Props) {
  return (
    <div
      data-disabled={disabled}
      aria-disabled={disabled}
      className={cn(
        'group relative flex h-full flex-col rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 transition-all',
        disabled
          ? 'cursor-not-allowed opacity-55'
          : 'hover:-translate-y-0.5 hover:border-[color:var(--cyan)] hover:shadow-[0_10px_40px_-12px_color-mix(in_srgb,var(--cyan)_45%,transparent)]',
      )}
    >
      {disabled && (
        <span className="absolute right-4 top-4 rounded-full border border-[color:var(--border)] bg-[color:var(--bg2)] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[1.5px] text-[color:var(--muted)]">
          {cta}
        </span>
      )}

      <div
        className={cn(
          'mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[color:var(--border)] bg-[color:var(--bg2)] transition-colors',
          !disabled && 'group-hover:border-[color:var(--cyan)] group-hover:text-[color:var(--cyan)]',
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>

      <h3 className="font-display text-lg font-semibold tracking-[-0.3px]">{title}</h3>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-[color:var(--muted)]">{description}</p>

      {!disabled && (
        <div className="mt-5 flex items-center gap-1.5 text-sm font-medium text-[color:var(--cyan)]">
          {cta}
          <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </div>
      )}
    </div>
  )
}
