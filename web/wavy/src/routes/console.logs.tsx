import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/console/PageHeader'
import { DataTable, Pager, type Column } from '@/components/console/DataTable'
import { LOG_TYPE_LABEL, logsService } from '@/lib/services/logs'
import { getSession, isAdmin } from '@/lib/session'
import type { Log, LogFilters } from '@/lib/types'
import { cn } from '@/lib/cn'

export const Route = createFileRoute('/console/logs')({
  loader: async () => ({ user: await getSession() }),
  component: LogsPage,
})

const PAGE_SIZE = 10 // visual hint; backend uses its own ItemsPerPage

function LogsPage() {
  const { t } = useTranslation()
  const { user } = Route.useLoaderData()
  const admin = isAdmin(user)
  const [p, setP] = useState(0)
  const [tokenName, setTokenName] = useState('')
  const [modelName, setModelName] = useState('')
  const [type, setType] = useState<number>(0)

  const filters: LogFilters = useMemo(() => {
    const f: LogFilters = { p }
    if (type) f.type = type
    if (tokenName) f.token_name = tokenName
    if (modelName) f.model_name = modelName
    return f
  }, [p, type, tokenName, modelName])

  const { data, isLoading } = useQuery({
    queryKey: ['logs', admin, filters],
    queryFn: () => (admin ? logsService.listAll(filters) : logsService.listSelf(filters)),
  })

  const columns: Column<Log>[] = [
    {
      key: 'time',
      header: t('lg.col.time'),
      width: '160px',
      mono: true,
      cell: (r) => fmtDateTime(r.created_at),
    },
    {
      key: 'type',
      header: t('lg.col.type'),
      width: '110px',
      cell: (r) => <TypePill type={r.type} />,
    },
    {
      key: 'model',
      header: t('lg.col.model'),
      width: 'minmax(140px,1.2fr)',
      cell: (r) => <span className="truncate font-medium">{r.model_name || '—'}</span>,
    },
    {
      key: 'token',
      header: t('lg.col.token'),
      width: '140px',
      cell: (r) => r.token_name || '—',
    },
    {
      key: 'prompt',
      header: t('lg.col.prompt'),
      width: '100px',
      align: 'right',
      mono: true,
      cell: (r) => r.prompt_tokens || '—',
    },
    {
      key: 'completion',
      header: t('lg.col.completion'),
      width: '110px',
      align: 'right',
      mono: true,
      cell: (r) => r.completion_tokens || '—',
    },
    {
      key: 'latency',
      header: t('lg.col.latency'),
      width: '100px',
      align: 'right',
      mono: true,
      cell: (r) => (r.elapsed_time ? `${r.elapsed_time}ms` : '—'),
    },
    {
      key: 'quota',
      header: t('lg.col.quota'),
      width: '100px',
      align: 'right',
      mono: true,
      cell: (r) => (r.quota ? r.quota.toLocaleString() : '—'),
    },
  ]

  if (admin) {
    columns.splice(3, 0, {
      key: 'user',
      header: t('lg.col.user'),
      width: '120px',
      cell: (r) => r.username || '—',
    })
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-8 lg:px-10">
      <PageHeader kicker={t('lg.kicker')} title={t('lg.title')} lead={t('lg.lead')} />

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterInput placeholder={t('lg.filter.token')} value={tokenName} onChange={(v) => { setTokenName(v); setP(0) }} />
        <FilterInput placeholder={t('lg.filter.model')} value={modelName} onChange={(v) => { setModelName(v); setP(0) }} />
        <select
          value={type}
          onChange={(e) => { setType(Number(e.target.value)); setP(0) }}
          className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-3 py-2 text-sm focus:border-[color:var(--cyan)] focus:outline-none"
        >
          <option value={0}>{t('lg.filter.allTypes')}</option>
          {Object.entries(LOG_TYPE_LABEL).filter(([k]) => k !== '0').map(([k, v]) => (
            <option key={k} value={Number(k)}>{v}</option>
          ))}
        </select>
      </div>

      <DataTable columns={columns} rows={data} rowKey={(r) => r.id} loading={isLoading} minRows={12} emptyHint={t('lg.empty')} />
      <Pager p={p} onP={setP} hasMore={(data?.length ?? 0) >= PAGE_SIZE} />
    </div>
  )
}

function FilterInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-44 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-3 py-2 text-sm placeholder:text-[color:var(--muted)]/70 focus:border-[color:var(--cyan)] focus:outline-none focus:ring-2 focus:ring-[color:var(--cyan)]/20"
    />
  )
}

const TYPE_TONE: Record<number, string> = {
  1: 'bg-[color:var(--live)]/12 text-[color:var(--live)]',
  2: 'bg-[color:var(--cyan)]/12 text-[color:var(--cyan)]',
  3: 'bg-[#F5C26B]/12 text-[#F5C26B]',
  4: 'bg-[color:var(--muted)]/12 text-[color:var(--muted)]',
  5: 'bg-[color:var(--coral)]/12 text-[color:var(--coral)]',
}

function TypePill({ type }: { type: number }) {
  const cls = TYPE_TONE[type] ?? 'bg-[color:var(--muted)]/12 text-[color:var(--muted)]'
  return (
    <span className={cn('rounded-full px-2 py-0.5 font-mono text-xs uppercase tracking-[1px]', cls)}>
      {LOG_TYPE_LABEL[type] ?? 'unknown'}
    </span>
  )
}

function fmtDateTime(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts * 1000)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
