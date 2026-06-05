import { useMemo } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/console/StatCard'
import { AreaChart } from '@/components/console/AreaChart'
import { TopModelsPanel, type TopModelEntry } from '@/components/console/TopModelsPanel'
import { ActivityFeed } from '@/components/console/ActivityFeed'
import { analyticsService } from '@/lib/services/analytics'
import { logsService } from '@/lib/services/logs'
import type { DashboardEntry } from '@/lib/types'

export const Route = createFileRoute('/console/')({
  component: Dashboard,
})

export default function Dashboard() {
  const { t } = useTranslation()

  const { data: dash, isLoading: loadingDash } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => analyticsService.dashboard(),
    staleTime: 60_000,
  })
  const { data: logs, isLoading: loadingLogs } = useQuery({
    queryKey: ['logs', 'recent'],
    queryFn: () => logsService.listSelf({ p: 0 }),
    staleTime: 30_000,
  })

  const view = useMemo(() => aggregate(dash ?? []), [dash])

  return (
    <div className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-8 lg:px-10">
      <style>{`
        @keyframes wavy-rise {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .wavy-rise { animation: wavy-rise .55s cubic-bezier(.22,.8,.3,1) both; }
      `}</style>

      {/* Page header */}
      <header className="wavy-rise mb-8 flex flex-wrap items-end justify-between gap-4" style={{ animationDelay: '0ms' }}>
        <div>
          <div className="font-mono text-xs uppercase tracking-[2.5px] text-[color:var(--primary)]">
            {t('console.dash.kicker')}
          </div>
          <h1 className="mt-2 font-display text-[2rem] font-bold leading-tight tracking-[-1px] text-[color:var(--title)]">
            {t('console.dash.title')}
          </h1>
          <p className="mt-1.5 text-sm text-[color:var(--muted)]">{t('console.dash.lead')}</p>
        </div>
        <div className="flex gap-2.5">
          <Link to="/console/analytics">
            <Button variant="ghost" size="sm">
              <ArrowUpRight className="h-3.5 w-3.5" />
              {t('console.dash.openAnalytics')}
            </Button>
          </Link>
          <Link to="/console/tokens">
            <Button size="sm">
              <Plus className="h-3.5 w-3.5" />
              {t('console.dash.newKey')}
            </Button>
          </Link>
        </div>
      </header>

      {/* KPI grid */}
      <section className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="wavy-rise" style={{ animationDelay: '40ms' }}>
          <StatCard
            kicker={t('console.dash.kpi.requests7d')}
            value={view.totals.requests > 0 ? formatNum(view.totals.requests) : '—'}
            delta={view.deltas.requests}
            spark={view.requestSpark}
          />
        </div>
        <div className="wavy-rise" style={{ animationDelay: '90ms' }}>
          <StatCard
            kicker={t('console.dash.kpi.tokens7d')}
            value={view.totals.tokens > 0 ? formatNum(view.totals.tokens) : '—'}
            delta={view.deltas.tokens}
            spark={view.tokenSpark}
          />
        </div>
        <div className="wavy-rise" style={{ animationDelay: '140ms' }}>
          <StatCard
            kicker={t('console.dash.kpi.modelsUsed')}
            value={view.totals.models > 0 ? String(view.totals.models) : '—'}
            delta={0}
            spark={view.modelSpark}
          />
        </div>
        <div className="wavy-rise" style={{ animationDelay: '190ms' }}>
          <StatCard
            kicker={t('console.dash.kpi.quota7d')}
            value={view.totals.quota > 0 ? formatNum(view.totals.quota) : '—'}
            delta={view.deltas.quota}
            spark={view.quotaSpark}
          />
        </div>
      </section>

      {/* Chart + Top models */}
      <section className="mb-7 grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div
          className="wavy-rise xl:col-span-8 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5"
          style={{ animationDelay: '240ms' }}
        >
          <header className="mb-1 flex items-baseline justify-between">
            <div>
              <h3 className="font-display text-base font-bold tracking-[-0.3px] text-[color:var(--title)]">{t('console.dash.chart.title')}</h3>
              <p className="mt-1 text-xs text-[color:var(--muted)]">{t('console.dash.chart.sub')}</p>
            </div>
            <span className="rounded-md bg-gradient-to-r from-[#084D3E] to-[#0d6b53] px-2.5 py-1 font-mono text-xs font-bold tracking-[1px] text-[#0c0d0e]">
              7D
            </span>
          </header>
          <div className="mt-4">
            <AreaChart data={view.requestSeries} />
          </div>
        </div>

        <div className="wavy-rise xl:col-span-4" style={{ animationDelay: '290ms' }}>
          <TopModelsPanel data={view.topModels} loading={loadingDash} />
        </div>
      </section>

      {/* Activity feed full width */}
      <section className="wavy-rise" style={{ animationDelay: '340ms' }}>
        <ActivityFeed logs={logs} loading={loadingLogs} />
      </section>
    </div>
  )
}

/**
 * Reduce 7×N daily-per-model rows into:
 *  - totals: requests / tokens / quota / distinct models (last 7d)
 *  - deltas: week-over-week percentage by comparing the last 3 days vs the
 *    prior 3 days (skipping the middle day for clearer signal)
 *  - sparklines for each KPI (7 values)
 *  - request series for the main chart (zero-filled local-day x-axis)
 *  - top models by quota
 */
function aggregate(entries: DashboardEntry[]) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    // Build the YYYY-MM-DD key from local fields so it matches the backend's
    // server-side day grouping for users in non-UTC timezones.
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    days.push(key)
  }
  const dayLabel = (iso: string) => {
    const d = new Date(iso + 'T00:00:00')
    return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()]
  }

  const byDay = new Map<string, { requests: number; tokens: number; quota: number; models: Set<string> }>()
  for (const e of entries) {
    const slot = byDay.get(e.Day) ?? {
      requests: 0,
      tokens: 0,
      quota: 0,
      models: new Set<string>(),
    }
    slot.requests += e.RequestCount
    slot.tokens += e.PromptTokens + e.CompletionTokens
    slot.quota += e.Quota
    if (e.ModelName) slot.models.add(e.ModelName)
    byDay.set(e.Day, slot)
  }

  const requestSpark: number[] = []
  const tokenSpark: number[] = []
  const quotaSpark: number[] = []
  const modelSpark: number[] = []
  const requestSeries: { label: string; value: number }[] = []
  const totals = { requests: 0, tokens: 0, quota: 0, models: 0 }
  const seenModels = new Set<string>()

  for (const day of days) {
    const slot = byDay.get(day)
    const req = slot?.requests ?? 0
    const tok = slot?.tokens ?? 0
    const quo = slot?.quota ?? 0
    const mc = slot?.models.size ?? 0
    requestSpark.push(req)
    tokenSpark.push(tok)
    quotaSpark.push(quo)
    modelSpark.push(mc)
    requestSeries.push({ label: dayLabel(day), value: req })
    totals.requests += req
    totals.tokens += tok
    totals.quota += quo
    if (slot) slot.models.forEach((m) => seenModels.add(m))
  }
  totals.models = seenModels.size

  // Week-over-week delta: last 3 days vs prior 3 days.
  const pct = (recent: number[], prior: number[]) => {
    const r = recent.reduce((a, b) => a + b, 0)
    const p = prior.reduce((a, b) => a + b, 0)
    if (p === 0) return r > 0 ? 100 : 0
    return ((r - p) / p) * 100
  }
  const deltas = {
    requests: pct(requestSpark.slice(-3), requestSpark.slice(0, 3)),
    tokens: pct(tokenSpark.slice(-3), tokenSpark.slice(0, 3)),
    quota: pct(quotaSpark.slice(-3), quotaSpark.slice(0, 3)),
  }

  // Top models by quota over the full 7-day window.
  const byModel = new Map<string, TopModelEntry>()
  for (const e of entries) {
    const name = e.ModelName || 'unknown'
    const m = byModel.get(name) ?? { name, quota: 0, requests: 0 }
    m.quota += e.Quota
    m.requests += e.RequestCount
    byModel.set(name, m)
  }
  const topModels = Array.from(byModel.values()).sort((a, b) => b.quota - a.quota)

  return {
    totals,
    deltas,
    requestSpark,
    tokenSpark,
    quotaSpark,
    modelSpark,
    requestSeries,
    topModels,
  }
}

function formatNum(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return Math.round(n).toLocaleString()
}
