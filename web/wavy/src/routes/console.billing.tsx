import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Gift, Plus, Trash2, Copy, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/console/PageHeader'
import { DataTable, StatusPill, type Column } from '@/components/console/DataTable'
import { billingService } from '@/lib/services/billing'
import { Dialog } from '@/components/console/Dialog'
import { authService } from '@/lib/services/auth'
import { useConfirm } from '@/components/ui/AppDialogs'
import { getSession, isAdmin } from '@/lib/session'
import type { Redemption } from '@/lib/types'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'

export const Route = createFileRoute('/console/billing')({
  loader: async () => ({ me: await getSession() }),
  component: BillingPage,
})

function BillingPage() {
  const { t } = useTranslation()
  const { me } = Route.useLoaderData()
  const admin = isAdmin(me)
  const qc = useQueryClient()

  // Refresh /api/user/self so the quota cards stay live after a redeem.
  const { data: live } = useQuery({
    queryKey: ['self'],
    queryFn: () => authService.getSelf(),
    initialData: me,
    staleTime: 10_000,
  })
  const user = live ?? me

  const total = (user?.quota ?? 0) + (user?.used_quota ?? 0)
  const used = user?.used_quota ?? 0
  const remain = user?.quota ?? 0
  const usedPct = total > 0 ? Math.min(100, (used / total) * 100) : 0

  return (
    <div className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-8 lg:px-10">
      <PageHeader kicker={t('billing.kicker')} title={t('billing.title')} lead={t('billing.lead')} />

      {/* Quota summary */}
      <section className="mb-7 grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <QuotaCard total={total} used={used} remain={remain} usedPct={usedPct} requests={user?.request_count ?? 0} />
        <RedeemCard onRedeemed={() => qc.invalidateQueries({ queryKey: ['self'] })} />
      </section>

      {admin && <RedemptionsAdminSection />}
    </div>
  )
}

function QuotaCard({
  total,
  used,
  remain,
  usedPct,
  requests,
}: {
  total: number
  used: number
  remain: number
  usedPct: number
  requests: number
}) {
  const { t } = useTranslation()
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-[var(--shadow-jelly)]">
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--cyan), transparent 70%)' }}
      />

      <div className="relative">
        <div className="font-mono text-xs uppercase tracking-[2px] text-[color:var(--muted)]">
          {t('billing.quota.label')}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-display text-[2.5rem] font-bold leading-none tracking-[-1px] text-current-ink tabular-nums">
            {formatNum(remain)}
          </span>
          <span className="text-sm text-[color:var(--muted)]">
            / {formatNum(total)} {t('billing.quota.tokens')}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-[color:var(--border)]/55">
          <span
            className="block h-full rounded-full bg-gradient-to-r from-[color:var(--cyan)] via-[color:var(--mint)] to-[color:var(--glass)] transition-[width] duration-700"
            style={{ width: `${usedPct}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-xs text-[color:var(--muted)]">
          <span>{usedPct.toFixed(1)}% used</span>
          <span>{formatNum(used)} consumed</span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-[color:var(--border)] pt-5">
          <SubMetric label={t('billing.metric.requests')} value={requests.toLocaleString()} />
          <SubMetric label={t('billing.metric.avg')} value={requests > 0 ? formatNum(used / requests) : '—'} />
        </div>
      </div>
    </div>
  )
}

function SubMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[11px] uppercase tracking-[1.5px] text-[color:var(--muted)]/70">{label}</div>
      <div className="mt-1 font-display text-lg font-bold tabular-nums">{value}</div>
    </div>
  )
}

function RedeemCard({ onRedeemed }: { onRedeemed: () => void }) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const m = useMutation({
    mutationFn: (key: string) => billingService.redeem(key),
    onSuccess: (added) => {
      setOkMsg(`+${formatNum(added)} ${t('billing.quota.tokens')}`)
      setErr(null)
      setCode('')
      onRedeemed()
      setTimeout(() => setOkMsg(null), 4_000)
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'redeem failed'),
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setErr(null)
        if (code.trim()) m.mutate(code.trim())
      }}
      className="flex flex-col rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-[var(--shadow-jelly)]"
    >
      <div className="mb-3 flex items-center gap-2">
        <Gift className="h-4 w-4 text-[color:var(--cyan)]" />
        <h3 className="font-display text-base font-bold">{t('billing.redeem.title')}</h3>
      </div>
      <p className="mb-4 text-xs text-[color:var(--muted)]">{t('billing.redeem.help')}</p>

      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={t('billing.redeem.placeholder')}
        className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-3 py-2 font-mono text-sm transition focus:border-[color:var(--cyan)] focus:outline-none focus:ring-2 focus:ring-[color:var(--cyan)]/20"
      />

      {err && (
        <div className="mt-3 rounded-lg border border-[color:var(--coral)]/30 bg-[color:var(--coral)]/8 px-3 py-2 text-xs text-[color:var(--coral)]">
          {err}
        </div>
      )}
      {okMsg && (
        <div className="mt-3 rounded-lg border border-[color:var(--live)]/30 bg-[color:var(--live)]/10 px-3 py-2 text-xs text-[color:var(--live)]">
          <Check className="mr-1 inline h-3 w-3" />
          {okMsg}
        </div>
      )}

      <Button type="submit" size="sm" className="mt-4" disabled={m.isPending || !code.trim()}>
        {m.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gift className="h-3.5 w-3.5" />}
        {t('billing.redeem.submit')}
      </Button>
    </form>
  )
}

function RedemptionsAdminSection() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const confirmDialog = useConfirm()
  const [showCreate, setShowCreate] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['redemptions'],
    queryFn: () => billingService.listRedemptions(0),
  })

  const remove = useMutation({
    mutationFn: (id: number) => billingService.deleteRedemption(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['redemptions'] }),
  })

  const cols: Column<Redemption>[] = [
    { key: 'id', header: 'ID', width: '64px', mono: true, cell: (r) => r.id },
    {
      key: 'name',
      header: t('billing.redemption.col.name'),
      width: '1.2fr',
      cell: (r) => <span className="font-medium">{r.name || '—'}</span>,
    },
    {
      key: 'key',
      header: t('billing.redemption.col.key'),
      width: '1.6fr',
      cell: (r) => <CodeCell value={r.key} />,
    },
    {
      key: 'quota',
      header: t('billing.redemption.col.quota'),
      width: '120px',
      mono: true,
      align: 'right',
      cell: (r) => <span className="tabular-nums text-current-ink">{formatNum(r.quota)}</span>,
    },
    {
      key: 'status',
      header: t('billing.redemption.col.status'),
      width: '120px',
      cell: (r) => <StatusPill active={r.status === 1} label={r.status === 1 ? 'unused' : 'redeemed'} />,
    },
    {
      key: 'actions',
      header: '',
      width: '60px',
      align: 'right',
      cell: (r) => (
        <button
          type="button"
          onClick={async () => {
            const ok = await confirmDialog({
              title: t('billing.redemption.deleteTitle'),
              message: t('billing.redemption.deleteConfirm', {
                name: r.name || r.key.slice(0, 8),
              }),
              tone: 'danger',
            })
            if (ok) remove.mutate(r.id)
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-[color:var(--border)] text-[color:var(--muted)] transition hover:border-[color:var(--coral)]/70 hover:text-[color:var(--coral)]"
          aria-label="Delete"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ),
    },
  ]

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="font-mono text-xs uppercase tracking-[2px] text-[color:var(--cyan)]">
            {t('billing.redemption.kicker')}
          </div>
          <h2 className="mt-1 font-display text-xl font-bold tracking-[-0.5px]">
            {t('billing.redemption.title')}
          </h2>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5" />
          {t('billing.redemption.create')}
        </Button>
      </div>

      <DataTable
        columns={cols}
        rows={data}
        rowKey={(r) => r.id}
        loading={isLoading}
        emptyHint={t('billing.redemption.empty')}
        minRows={6}
      />

      {showCreate && (
        <CreateRedemptionDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            qc.invalidateQueries({ queryKey: ['redemptions'] })
          }}
        />
      )}
    </section>
  )
}

function CodeCell({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <code className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-[color:var(--muted)]">
        {value}
      </code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        className={cn(
          'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded transition hover:text-[color:var(--cyan)]',
          copied ? 'text-[color:var(--live)]' : 'text-[color:var(--muted)]',
        )}
        title="Copy"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  )
}

function CreateRedemptionDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [quota, setQuota] = useState('500000')
  const [count, setCount] = useState('1')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [generatedKeys, setGeneratedKeys] = useState<string[] | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    const q = Number(quota)
    const c = Number(count)
    if (!q || q <= 0 || !c || c <= 0) {
      setErr('quota and count must be positive')
      return
    }
    setSubmitting(true)
    try {
      const keys = await billingService.createRedemption(name, q, c)
      setGeneratedKeys(keys)
      onCreated()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'create failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (generatedKeys) {
    return <CreatedKeysView keys={generatedKeys} onClose={onClose} />
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('billing.redemption.create')}
      kicker={t('billing.redemption.kicker')}
    >
      <form onSubmit={submit}>
        <DialogField label={t('billing.redemption.col.name')} value={name} onChange={setName} autoFocus />
        <DialogField label={t('billing.redemption.col.quota')} value={quota} onChange={setQuota} type="number" />
        <DialogField label={t('billing.redemption.count')} value={count} onChange={setCount} type="number" />

        {err && (
          <div className="mb-4 rounded-lg border border-[color:var(--coral)]/30 bg-[color:var(--coral)]/8 px-3 py-2 text-sm text-[color:var(--coral)]">
            {err}
          </div>
        )}

        <div className="mt-2 flex justify-end gap-2.5">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting ? '…' : t('billing.redemption.create')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function CreatedKeysView({ keys, onClose }: { keys: string[]; onClose: () => void }) {
  const { t } = useTranslation()
  const [copiedIdx, setCopiedIdx] = useState<number | 'all' | null>(null)

  async function copy(text: string, idx: number | 'all') {
    if (!navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIdx(idx)
      window.setTimeout(() => setCopiedIdx((v) => (v === idx ? null : v)), 1500)
    } catch {
      // insecure context — silent
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('billing.redemption.success.title', { count: keys.length })}
      kicker={t('billing.redemption.kicker')}
    >
      <p className="mb-5 -mt-4 text-sm text-[color:var(--muted)]">
        {t('billing.redemption.success.lead')}
      </p>

      <div className="mb-5 max-h-[40vh] space-y-1.5 overflow-y-auto">
        {keys.map((k, i) => (
          <div
            key={k}
            className="flex items-center gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-3 py-2"
          >
            <code className="flex-1 truncate font-mono text-xs text-[color:var(--text)]">{k}</code>
            <button
              type="button"
              onClick={() => copy(k, i)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-[color:var(--muted)] hover:text-[color:var(--cyan)]"
              title={t('billing.redemption.success.copy')}
            >
              {copiedIdx === i ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copiedIdx === i ? t('billing.redemption.success.copied') : t('billing.redemption.success.copy')}
            </button>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2.5">
        <Button type="button" variant="ghost" size="sm" onClick={() => copy(keys.join('\n'), 'all')}>
          {copiedIdx === 'all' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copiedIdx === 'all' ? t('billing.redemption.success.copied') : t('billing.redemption.success.copyAll')}
        </Button>
        <Button type="button" size="sm" onClick={onClose}>
          {t('billing.redemption.success.close')}
        </Button>
      </div>
    </Dialog>
  )
}

function DialogField({
  label,
  value,
  onChange,
  type = 'text',
  autoFocus,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  autoFocus?: boolean
}) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block font-mono text-xs uppercase tracking-[2px] text-[color:var(--muted)]">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-3 py-2 text-sm transition focus:border-[color:var(--cyan)] focus:outline-none focus:ring-2 focus:ring-[color:var(--cyan)]/20"
      />
    </label>
  )
}

function formatNum(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return Math.round(n).toLocaleString()
}

