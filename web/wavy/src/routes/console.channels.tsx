import { useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, Activity, Power, PowerOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/console/PageHeader'
import { DataTable, Pager, StatusPill, type Column } from '@/components/console/DataTable'
import { CHANNEL_TYPE, channelsService } from '@/lib/services/channels'
import { getSession, isAdmin } from '@/lib/session'
import type { Channel } from '@/lib/types'

export const Route = createFileRoute('/console/channels')({
  beforeLoad: async () => {
    const user = await getSession()
    if (!isAdmin(user)) throw redirect({ to: '/console' })
  },
  component: ChannelsPage,
})

const PAGE_SIZE = 10 // visual hint; backend uses its own ItemsPerPage

function ChannelsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [p, setP] = useState(0)

  const { data, isLoading } = useQuery({
    queryKey: ['channels', p],
    queryFn: () => channelsService.list(p),
  })

  const update = useMutation({
    mutationFn: channelsService.update,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  })

  const remove = useMutation({
    mutationFn: channelsService.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  })

  const test = useMutation({
    mutationFn: (id: number) => channelsService.test(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  })

  const columns: Column<Channel>[] = [
    {
      key: 'name',
      header: t('ch.col.name'),
      width: 'minmax(160px,1.5fr)',
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{r.name || '—'}</div>
          <div className="truncate font-mono text-xs text-[color:var(--muted)]">{CHANNEL_TYPE[r.type] ?? `type ${r.type}`}</div>
        </div>
      ),
    },
    {
      key: 'group',
      header: t('ch.col.group'),
      width: '120px',
      mono: true,
      cell: (r) => r.group || 'default',
    },
    {
      key: 'status',
      header: t('ch.col.status'),
      width: '110px',
      cell: (r) => (
        <StatusPill
          active={r.status === 1}
          label={r.status === 1 ? 'enabled' : r.status === 2 ? 'disabled' : 'auto-off'}
        />
      ),
    },
    {
      key: 'response',
      header: t('ch.col.response'),
      width: '100px',
      align: 'right',
      mono: true,
      cell: (r) => (r.response_time ? `${r.response_time}ms` : '—'),
    },
    {
      key: 'balance',
      header: t('ch.col.balance'),
      width: '110px',
      align: 'right',
      mono: true,
      cell: (r) => (r.balance ? `$${r.balance.toFixed(2)}` : '—'),
    },
    {
      key: 'used',
      header: t('ch.col.used'),
      width: '110px',
      align: 'right',
      mono: true,
      cell: (r) => fmtQuota(r.used_quota),
    },
    {
      key: 'priority',
      header: t('ch.col.priority'),
      width: '80px',
      align: 'right',
      mono: true,
      cell: (r) => String(r.priority ?? 0),
    },
    {
      key: 'actions',
      header: '',
      width: '130px',
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1.5">
          <IconBtn label="Test" onClick={() => test.mutate(r.id)}>
            <Activity className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn
            label={r.status === 1 ? 'Disable' : 'Enable'}
            onClick={() => update.mutate({ ...r, status: r.status === 1 ? 2 : 1 })}
          >
            {r.status === 1 ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
          </IconBtn>
          <IconBtn
            label="Delete"
            tone="coral"
            onClick={() => {
              if (confirm(t('ch.deleteConfirm', { name: r.name }))) remove.mutate(r.id)
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      ),
    },
  ]

  return (
    <div className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-8 lg:px-10">
      <PageHeader
        kicker={t('ch.kicker')}
        title={t('ch.title')}
        lead={t('ch.lead')}
        actions={
          <Button size="sm" onClick={() => alert(t('ch.todoAdd'))}>
            + {t('ch.addChannel')}
          </Button>
        }
      />
      <DataTable columns={columns} rows={data} rowKey={(r) => r.id} loading={isLoading} minRows={10} emptyHint={t('ch.empty')} />
      <Pager p={p} onP={setP} hasMore={(data?.length ?? 0) >= PAGE_SIZE} />
    </div>
  )
}

function IconBtn({
  label,
  children,
  onClick,
  tone,
}: {
  label: string
  children: React.ReactNode
  onClick: () => void
  tone?: 'coral'
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={
        tone === 'coral'
          ? 'flex h-7 w-7 items-center justify-center rounded-md border border-[color:var(--border)] text-[color:var(--muted)] transition hover:border-[color:var(--coral)] hover:text-[color:var(--coral)]'
          : 'flex h-7 w-7 items-center justify-center rounded-md border border-[color:var(--border)] text-[color:var(--muted)] transition hover:border-[color:var(--primary)] hover:text-[color:var(--text)]'
      }
    >
      {children}
    </button>
  )
}

function fmtQuota(n: number): string {
  if (!n) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
