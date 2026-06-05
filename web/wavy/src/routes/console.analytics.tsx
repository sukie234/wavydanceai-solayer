import { useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/console/PageHeader'
import { AreaChart } from '@/components/console/AreaChart'
import { DataTable, type Column } from '@/components/console/DataTable'
import { analyticsService } from '@/lib/services/analytics'
import type { DashboardEntry } from '@/lib/types'

export const Route = createFileRoute('/console/analytics')({
  component: AnalyticsPage,
})

type ModelRow = {
  model: string
  requests: number
  promptTokens: number
  completionTokens: number
  quota: number
}

function AnalyticsPage() {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: () => analyticsService.dashboard(),
    staleTime: 60_000,
  })

  const { totals, requestSeries, quotaSeries, byModel } = useMemo(
    () => aggregate(data ?? []),
    [data],
  )

  const cols: Column<ModelRow>[] = [
    {
      key: 'model',
      header: t('analytics.col.model'),
      width: '1.5fr',
      cell: (r) => <span className="font-medium">{r.model || '—'}</span>,
    },
    {
      key: 'requests',
      header: t('analytics.col.requests'),
      width: '130px',
      mono: true,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{r.requests.toLocaleString()}</span>,
    },
    {
      key: 'prompt',
      header: t('analytics.col.promptTokens'),
      width: '150px',
      mono: true,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{formatNum(r.promptTokens)}</span>,
    },
    {
      key: 'completion',
      header: t('analytics.col.completionTokens'),
      width: '170px',
      mono: true,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{formatNum(r.completionTokens)}</span>,
    },
    {
      key: 'quota',
      header: t('analytics.col.quota'),
      width: '120px',
      mono: true,
      align: 'right',
      cell: (r) => <span className="tabular-nums text-current-ink">{formatNum(r.quota)}</span>,
    },
  ]

  return (
    <div className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-8 lg:px-10">
      <PageHeader kicker={t('analytics.kicker')} title={t('analytics.title')} lead={t('analytics.lead')} />

      {/* KPI tiles */}
      <section className="mb-7 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={t('analytics.kpi.requests')} value={totals.requests.toLocaleString()} />
        <Kpi label={t('analytics.kpi.prompt')} value={formatNum(totals.promptTokens)} />
        <Kpi label={t('analytics.kpi.completion')} value={formatNum(totals.completionTokens)} />
        <Kpi label={t('analytics.kpi.quota')} value={formatNum(totals.quota)} accent />
      </section>

      {/* Chart cards */}
      <section className="mb-7 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title={t('analytics.chart.requests')}>
          <AreaChart data={requestSeries} />
        </ChartCard>
        <ChartCard title={t('analytics.chart.quota')}>
          <AreaChart data={quotaSeries} />
        </ChartCard>
      </section>

      {/* Per-model breakdown */}
      <section>
        <h3 className="mb-3 font-display text-base font-bold tracking-[-0.3px] text-[color:var(--title)]">
          {t('analytics.byModel')}
        </h3>
        <DataTable
          columns={cols}
          rows={byModel}
          rowKey={(r) => r.model}
          loading={isLoading}
          emptyHint={t('analytics.empty')}
          minRows={6}
        />
      </section>
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
      <h3 className="mb-4 font-display text-base font-bold tracking-[-0.3px] text-[color:var(--title)]">{title}</h3>
      {children}
    </div>
  )
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
      <div className="font-mono text-xs uppercase tracking-[2px] text-[color:var(--muted)]">{label}</div>
      <div className={`mt-2 font-display text-[2rem] font-bold leading-none tracking-[-1px] tabular-nums ${accent ? 'text-current-ink' : ''}`}>
        {value}
      </div>
    </div>
  )
}

/**
 * Group LogStatistic[] into:
 *  - totals across the 7-day window
 *  - day-series for requests + quota (zero-fills missing days)
 *  - per-model breakdown sorted by quota desc
 */
function aggregate(entries: DashboardEntry[]) {
  const totals = { requests: 0, promptTokens: 0, completionTokens: 0, quota: 0 }
  const byDay = new Map<string, { requests: number; quota: number }>()
  const byModel = new Map<string, ModelRow>()

  for (const e of entries) {
    totals.requests += e.RequestCount
    totals.promptTokens += e.PromptTokens
    totals.completionTokens += e.CompletionTokens
    totals.quota += e.Quota

    const day = byDay.get(e.Day) ?? { requests: 0, quota: 0 }
    day.requests += e.RequestCount
    day.quota += e.Quota
    byDay.set(e.Day, day)

    const m = byModel.get(e.ModelName) ?? {
      model: e.ModelName,
      requests: 0,
      promptTokens: 0,
      completionTokens: 0,
      quota: 0,
    }
    m.requests += e.RequestCount
    m.promptTokens += e.PromptTokens
    m.completionTokens += e.CompletionTokens
    m.quota += e.Quota
    byModel.set(e.ModelName, m)
  }

  // Build last-7-days x-axis (today inclusive) and zero-fill.
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().slice(0, 10))
  }
  const label = (iso: string) => {
    const d = new Date(iso)
    return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()]
  }
  const requestSeries = days.map((d) => ({ label: label(d), value: byDay.get(d)?.requests ?? 0 }))
  const quotaSeries = days.map((d) => ({ label: label(d), value: byDay.get(d)?.quota ?? 0 }))

  return {
    totals,
    requestSeries,
    quotaSeries,
    byModel: Array.from(byModel.values()).sort((a, b) => b.quota - a.quota),
  }
}

function formatNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}
