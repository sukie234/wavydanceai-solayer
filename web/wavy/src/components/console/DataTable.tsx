import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type Column<T> = {
  key: string
  header: ReactNode
  width?: string
  align?: 'left' | 'right' | 'center'
  mono?: boolean
  cell: (row: T) => ReactNode
}

type Props<T> = {
  columns: Column<T>[]
  rows: T[] | undefined
  rowKey: (row: T) => string | number
  loading?: boolean
  emptyHint?: ReactNode
  /** Stretch to at least this many rows (uses dashed spacers to lock height). */
  minRows?: number
}

export function DataTable<T>({ columns, rows, rowKey, loading, emptyHint, minRows = 0 }: Props<T>) {
  const cols = columns
  const hasData = (rows?.length ?? 0) > 0
  const padCount = !loading && hasData ? Math.max(0, minRows - rows!.length) : 0
  const gridCols = cols.map((c) => c.width ?? '1fr').join(' ')

  return (
    <div className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-jelly)]">
      {/* Header */}
      <div
        className="grid items-center border-b border-[color:var(--border)] bg-[color:var(--bg2)]/70 px-5 py-3 font-mono text-[11px] uppercase tracking-[2px] text-[color:var(--muted)]"
        style={{ gridTemplateColumns: gridCols, gap: '14px' }}
      >
        {cols.map((c) => (
          <div
            key={c.key}
            className={cn(c.align === 'right' && 'text-right', c.align === 'center' && 'text-center')}
          >
            {c.header}
          </div>
        ))}
      </div>

      {/* Body */}
      <div className="divide-y divide-[color:var(--border)]/60">
        {loading && (
          <div className="px-5 py-16 text-center text-sm text-[color:var(--muted)]">Loading…</div>
        )}
        {!loading && !hasData && (
          <div className="px-5 py-20 text-center text-sm text-[color:var(--muted)]">
            {emptyHint ?? 'No records yet.'}
          </div>
        )}
        {!loading && hasData &&
          rows!.map((row) => (
            <div
              key={rowKey(row)}
              className="grid items-center px-5 py-3 text-sm transition-colors hover:bg-[color:var(--bg2)]/50"
              style={{ gridTemplateColumns: gridCols, gap: '14px' }}
            >
              {cols.map((c) => (
                <div
                  key={c.key}
                  className={cn(
                    'min-w-0 truncate',
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center',
                    c.mono && 'font-mono tabular-nums',
                  )}
                >
                  <Fragment>{c.cell(row)}</Fragment>
                </div>
              ))}
            </div>
          ))}
        {Array.from({ length: padCount }).map((_, i) => (
          <div key={`pad-${i}`} className="h-[52px]" />
        ))}
      </div>
    </div>
  )
}

export function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-xs uppercase tracking-[1px]',
        active
          ? 'bg-[color:var(--live)]/12 text-[color:var(--live)]'
          : 'bg-[color:var(--rose)]/12 text-[color:var(--rose)]',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-[color:var(--live)]' : 'bg-[color:var(--rose)]')} />
      {label}
    </span>
  )
}

export function Pager({ p, onP, hasMore }: { p: number; onP: (next: number) => void; hasMore: boolean }) {
  return (
    <div className="mt-4 flex items-center justify-between font-mono text-xs text-[color:var(--muted)]">
      <span>Page {p + 1}</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onP(Math.max(0, p - 1))}
          disabled={p === 0}
          className="rounded-md border border-[color:var(--border)] px-3 py-1 transition hover:border-[color:var(--cyan)] hover:text-[color:var(--text)] disabled:opacity-40"
        >
          ← Prev
        </button>
        <button
          type="button"
          onClick={() => onP(p + 1)}
          disabled={!hasMore}
          className="rounded-md border border-[color:var(--border)] px-3 py-1 transition hover:border-[color:var(--cyan)] hover:text-[color:var(--text)] disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  )
}
