import { TrendingUp, TrendingDown } from 'lucide-react'
import { Sparkline } from './Sparkline'
import { cn } from '@/lib/cn'

type Props = {
  kicker: string
  value: string
  delta: number
  spark: number[]
  unit?: string
  style?: React.CSSProperties
}

export function StatCard({ kicker, value, delta, spark, unit, style }: Props) {
  const up = delta >= 0
  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-[var(--shadow-jelly)] transition-all hover:border-[color:var(--cyan)]/50 hover:-translate-y-0.5"
      style={style}
    >
      {/* Corner glow */}
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-40 blur-3xl transition-opacity group-hover:opacity-60"
        style={{ background: 'radial-gradient(circle, var(--cyan), transparent 70%)' }}
      />

      <div className="relative">
        <div className="mb-3 font-mono text-xs uppercase tracking-[2px] text-[color:var(--muted)]">{kicker}</div>

        <div className="flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-1">
            <span className="font-display text-[2rem] font-bold leading-none tracking-[-1px] text-current-ink tabular-nums">
              {value}
            </span>
            {unit && <span className="text-sm font-medium text-[color:var(--muted)]">{unit}</span>}
          </div>
          <div className="opacity-90">
            <Sparkline values={spark} stroke="var(--cyan)" fill="var(--cyan)" />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1.5">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-xs font-medium tabular-nums',
              up ? 'bg-[color:var(--live)]/12 text-[color:var(--live)]' : 'bg-[color:var(--rose)]/12 text-[color:var(--rose)]',
            )}
          >
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {up ? '+' : ''}
            {delta.toFixed(1)}%
          </span>
          <span className="text-xs text-[color:var(--muted)]/80">vs last week</span>
        </div>
      </div>
    </div>
  )
}
