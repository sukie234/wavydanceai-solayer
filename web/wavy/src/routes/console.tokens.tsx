import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Copy, Check, Power, PowerOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/console/PageHeader'
import { DataTable, Pager, StatusPill, type Column } from '@/components/console/DataTable'
import { tokensService } from '@/lib/services/tokens'
import { Dialog } from '@/components/console/Dialog'
import { useConfirm } from '@/components/ui/AppDialogs'
import { ApiError } from '@/lib/api'
import { TokenStatus, type Token } from '@/lib/types'

export const Route = createFileRoute('/console/tokens')({
  component: TokensPage,
})

const PAGE_SIZE = 10 // visual hint; backend uses its own ItemsPerPage

function TokensPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const confirmDialog = useConfirm()
  const [p, setP] = useState(0)
  const [showCreate, setShowCreate] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['tokens', p],
    queryFn: () => tokensService.list(p),
  })

  const remove = useMutation({
    mutationFn: tokensService.remove,
    onSuccess: () => {
      setErr(null)
      qc.invalidateQueries({ queryKey: ['tokens'] })
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : t('tk.actionFailed')),
  })

  const update = useMutation({
    mutationFn: tokensService.update,
    onSuccess: () => {
      setErr(null)
      qc.invalidateQueries({ queryKey: ['tokens'] })
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : t('tk.actionFailed')),
  })

  const columns: Column<Token>[] = [
    {
      key: 'name',
      header: t('tk.col.name'),
      width: 'minmax(160px,1.4fr)',
      cell: (r) => <span className="font-medium">{r.name || '—'}</span>,
    },
    {
      key: 'status',
      header: t('tk.col.status'),
      width: '120px',
      cell: (r) => (
        <StatusPill
          active={r.status === TokenStatus.Enabled}
          label={
            r.status === TokenStatus.Enabled
              ? 'active'
              : r.status === TokenStatus.Expired
              ? 'expired'
              : r.status === TokenStatus.Exhausted
              ? 'exhausted'
              : 'disabled'
          }
        />
      ),
    },
    {
      key: 'key',
      header: t('tk.col.key'),
      width: 'minmax(180px,1.2fr)',
      mono: true,
      cell: (r) => <KeyCell value={r.key} />,
    },
    {
      key: 'remain',
      header: t('tk.col.remain'),
      width: '120px',
      align: 'right',
      mono: true,
      cell: (r) => (r.unlimited_quota ? '∞' : fmtQuota(r.remain_quota)),
    },
    {
      key: 'used',
      header: t('tk.col.used'),
      width: '120px',
      align: 'right',
      mono: true,
      cell: (r) => fmtQuota(r.used_quota),
    },
    {
      key: 'created',
      header: t('tk.col.created'),
      width: '140px',
      mono: true,
      cell: (r) => fmtDate(r.created_time),
    },
    {
      key: 'expires',
      header: t('tk.col.expires'),
      width: '140px',
      mono: true,
      cell: (r) => (r.expired_time === -1 ? 'never' : fmtDate(r.expired_time)),
    },
    {
      key: 'actions',
      header: '',
      width: '110px',
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1.5">
          <IconBtn
            label={r.status === TokenStatus.Enabled ? 'Disable' : 'Enable'}
            onClick={() =>
              update.mutate({
                ...r,
                status: r.status === TokenStatus.Enabled ? TokenStatus.Disabled : TokenStatus.Enabled,
              })
            }
          >
            {r.status === TokenStatus.Enabled ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
          </IconBtn>
          <IconBtn
            label="Delete"
            tone="coral"
            onClick={async () => {
              const ok = await confirmDialog({
                title: t('common.delete'),
                message: t('tk.deleteConfirm', { name: r.name }),
                tone: 'danger',
              })
              if (ok) remove.mutate(r.id)
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
        kicker={t('tk.kicker')}
        title={t('tk.title')}
        lead={t('tk.lead')}
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t('tk.newKey')}
          </Button>
        }
      />
      {err && (
        <div className="mb-4 rounded-lg border border-[color:var(--coral)]/30 bg-[color:var(--coral)]/8 px-3 py-2 text-sm text-[color:var(--coral)]">
          {err}
        </div>
      )}
      <DataTable
        columns={columns}
        rows={data}
        rowKey={(r) => r.id}
        loading={isLoading}
        minRows={PAGE_SIZE}
        emptyHint={t('tk.empty')}
      />
      <Pager p={p} onP={setP} hasMore={(data?.length ?? 0) >= PAGE_SIZE} />

      {showCreate && <CreateTokenModal onClose={() => setShowCreate(false)} onCreated={() => {
        setShowCreate(false)
        qc.invalidateQueries({ queryKey: ['tokens'] })
      }} />}
    </div>
  )
}

function KeyCell({ value }: { value: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const display = value ? `sk-${value.slice(0, 4)}…${value.slice(-4)}` : '—'

  async function onCopy() {
    if (!value || !navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(`sk-${value}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard blocked (insecure context, permission, etc.) — silently ignore
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--border)] bg-[color:var(--bg2)] px-2 py-0.5 font-mono text-xs text-[color:var(--muted)] hover:border-[color:var(--cyan)] hover:text-[color:var(--text)]"
      title={t('tk.copyKey')}
    >
      {copied ? <Check className="h-3 w-3 text-[color:var(--cyan)]" /> : <Copy className="h-3 w-3" />}
      {copied ? t('tk.copied') : display}
    </button>
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
          : 'flex h-7 w-7 items-center justify-center rounded-md border border-[color:var(--border)] text-[color:var(--muted)] transition hover:border-[color:var(--cyan)] hover:text-[color:var(--text)]'
      }
    >
      {children}
    </button>
  )
}

function CreateTokenModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [unlimited, setUnlimited] = useState(true)
  const [quotaInDollars, setQuotaInDollars] = useState('10')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    setErr(null)
    setSubmitting(true)
    try {
      await tokensService.create({
        name: name.trim() || 'untitled',
        remain_quota: unlimited ? 0 : Math.round(Number(quotaInDollars) * 500_000), // 500K quota ≈ $1 USD (one-api default)
        unlimited_quota: unlimited,
        expired_time: -1,
      })
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onClose={onClose} title={t('tk.modal.title')} kicker={t('tk.modal.kicker')}>
      <label className="mb-4 block">
        <span className="mb-1.5 block font-mono text-xs uppercase tracking-[2px] text-[color:var(--muted)]">
          {t('tk.modal.name')}
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          placeholder="production-app"
          className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-3 py-2 text-sm placeholder:text-[color:var(--muted)]/70 focus:border-[color:var(--cyan)] focus:outline-none focus:ring-2 focus:ring-[color:var(--cyan)]/20"
        />
      </label>

      <label className="mb-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} />
        {t('tk.modal.unlimited')}
      </label>

      {!unlimited && (
        <label className="mb-4 block">
          <span className="mb-1.5 block font-mono text-xs uppercase tracking-[2px] text-[color:var(--muted)]">
            {t('tk.modal.quota')}
          </span>
          <input
            type="number"
            min="1"
            value={quotaInDollars}
            onChange={(e) => setQuotaInDollars(e.target.value)}
            className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-3 py-2 text-sm focus:border-[color:var(--cyan)] focus:outline-none focus:ring-2 focus:ring-[color:var(--cyan)]/20"
          />
        </label>
      )}

      {err && <div className="mb-3 text-sm text-[color:var(--coral)]">{err}</div>}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>{t('tk.modal.cancel')}</Button>
        <Button size="sm" disabled={submitting} onClick={submit}>{t('tk.modal.create')}</Button>
      </div>
    </Dialog>
  )
}

function fmtQuota(n: number): string {
  if (n === 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function fmtDate(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts * 1000)
  return d.toLocaleDateString(undefined, { year: '2-digit', month: 'short', day: 'numeric' })
}
