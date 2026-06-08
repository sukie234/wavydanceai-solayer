import { useMemo, useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { PageHeader } from '@/components/console/PageHeader'
import { DataTable, type Column } from '@/components/console/DataTable'
import { modelsService } from '@/lib/services/models'
import { getSession, isAdmin } from '@/lib/session'
import type { ChannelModel } from '@/lib/types'
import { cn } from '@/lib/cn'

export const Route = createFileRoute('/console/models')({
  beforeLoad: async () => {
    const user = await getSession()
    if (!isAdmin(user)) throw redirect({ to: '/console' })
  },
  component: ModelsPage,
})

function ModelsPage() {
  const { t } = useTranslation()
  const [filter, setFilter] = useState('')
  const [owner, setOwner] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['models'],
    queryFn: () => modelsService.list(),
    staleTime: 5 * 60_000, // model catalog changes rarely
  })

  // Group by owner (provider) for the filter pills and the summary cards.
  const ownerStats = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of data ?? []) map.set(m.owned_by, (map.get(m.owned_by) ?? 0) + 1)
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [data])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return (data ?? []).filter((m) => {
      if (owner && m.owned_by !== owner) return false
      if (q && !m.id.toLowerCase().includes(q) && !m.owned_by.toLowerCase().includes(q)) return false
      return true
    })
  }, [data, filter, owner])

  const cols: Column<ChannelModel>[] = [
    {
      key: 'id',
      header: t('models.col.model'),
      width: '1.5fr',
      cell: (m) => <span className="font-medium">{m.id}</span>,
    },
    {
      key: 'owned_by',
      header: t('models.col.owner'),
      width: '160px',
      cell: (m) => <OwnerBadge owner={m.owned_by} />,
    },
    {
      key: 'created',
      header: t('models.col.created'),
      width: '140px',
      mono: true,
      align: 'right',
      cell: (m) =>
        m.created ? (
          <span className="text-[color:var(--muted)]">
            {new Date(m.created * 1000).toISOString().slice(0, 10)}
          </span>
        ) : (
          <span className="text-[color:var(--muted)]/50">—</span>
        ),
    },
  ]

  return (
    <div className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-8 lg:px-10">
      <PageHeader
        kicker={t('models.kicker')}
        title={t('models.title')}
        lead={t('models.lead', { count: data?.length ?? 0 })}
      />

      {/* Provider summary tiles */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <SummaryTile label="all" count={data?.length ?? 0} active={!owner} onClick={() => setOwner(null)} />
        {ownerStats.slice(0, 11).map(([name, n]) => (
          <SummaryTile key={name} label={name} count={n} active={owner === name} onClick={() => setOwner(name)} />
        ))}
      </div>

      {/* Search */}
      <div className="mb-4 max-w-sm">
        <div className="flex items-center gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 transition focus-within:border-[color:var(--cyan)]">
          <Search className="h-3.5 w-3.5 text-[color:var(--muted)]" />
          <input
            type="search"
            placeholder={t('models.searchPlaceholder')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex-1 bg-transparent text-sm placeholder:text-[color:var(--muted)]/70 focus:outline-none"
          />
          {filter && (
            <button
              type="button"
              onClick={() => setFilter('')}
              className="text-xs text-[color:var(--muted)] hover:text-[color:var(--text)]"
            >
              clear
            </button>
          )}
        </div>
      </div>

      <DataTable
        columns={cols}
        rows={filtered}
        rowKey={(m) => m.id}
        loading={isLoading}
        emptyHint={filter || owner ? t('models.noMatch') : t('models.empty')}
        minRows={10}
      />

      <p className="mt-4 text-center font-mono text-xs text-[color:var(--muted)]/70">
        {filtered.length} {filtered.length === 1 ? 'model' : 'models'} shown
      </p>
    </div>
  )
}

function SummaryTile({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex flex-col items-start gap-1 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3.5 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-[color:var(--cyan)]/60',
        active && 'border-[color:var(--cyan)]/80 bg-[color:var(--cyan)]/[.06]',
      )}
    >
      <span className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium text-[color:var(--muted)] group-hover:text-[color:var(--text)]">
        {label}
      </span>
      <span className={cn('font-display text-xl font-bold tabular-nums', active && 'text-current-ink')}>
        {count}
      </span>
    </button>
  )
}

function OwnerBadge({ owner }: { owner: string }) {
  // Tiny color-coded chip; falls back to muted for unknown providers.
  const color = OWNER_COLOR[owner.toLowerCase()] ?? null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-xs',
        color ? '' : 'bg-[color:var(--border)]/40 text-[color:var(--muted)]',
      )}
      style={color ? { background: `color-mix(in srgb, ${color} 12%, transparent)`, color } : undefined}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: color ?? 'currentColor' }}
      />
      {owner}
    </span>
  )
}

const OWNER_COLOR: Record<string, string> = {
  openai: '#10A37F',
  anthropic: '#D97757',
  google: '#4285F4',
  deepseek: '#4D6BFE',
  alibaba: '#615CED',
  qwen: '#615CED',
  meta: '#0082FB',
  mistralai: '#FF7000',
  xai: 'var(--muted-soft)',
  moonshot: 'var(--aqua)',
  zhipuai: '#3859FF',
  baichuan: 'var(--rose)',
  '01.ai': '#9D4EDD',
  cohere: '#39594D',
}
