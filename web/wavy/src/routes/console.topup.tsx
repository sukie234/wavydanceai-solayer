import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CreditCard, Coins, Bitcoin, Loader2, CheckCircle2, Clock, XCircle, ExternalLink, Wrench } from 'lucide-react'
import { PageHeader } from '@/components/console/PageHeader'
import { DataTable, StatusPill, type Column } from '@/components/console/DataTable'
import { topupService } from '@/lib/services/topup'
import { usePrompt } from '@/components/ui/AppDialogs'
import { getSession, isAdmin } from '@/lib/session'
import type { Topup, TopupAmountOption } from '@/lib/types'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'

export const Route = createFileRoute('/console/topup')({
  loader: async () => ({ me: await getSession() }),
  component: TopupPage,
})

type GatewayKind = 'stripe' | 'epay' | 'crypto'
type GatewayChoice = { kind: GatewayKind; adapter?: string }

function TopupPage() {
  const { t } = useTranslation()
  const { me } = Route.useLoaderData()
  const admin = isAdmin(me)
  const qc = useQueryClient()

  const { data: info, isLoading: infoLoading, error: infoErr } = useQuery({
    queryKey: ['topup-info'],
    queryFn: () => topupService.info(),
    retry: false,
  })

  if (infoLoading) {
    return <PageShell><InfoStateBox icon={<Loader2 className="h-5 w-5 animate-spin" />} text={t('topup.loading')} /></PageShell>
  }
  if (infoErr) {
    const msg = infoErr instanceof ApiError ? infoErr.message : 'topup unavailable'
    return <PageShell><InfoStateBox icon={<XCircle className="h-5 w-5" />} text={msg} tone="warn" /></PageShell>
  }
  if (!info) return null

  const noGateways =
    !info.stripe_enabled && !info.epay_enabled && info.crypto_adapters.length === 0
  if (noGateways) {
    return <PageShell><InfoStateBox icon={<XCircle className="h-5 w-5" />} text={t('topup.noGateways')} tone="warn" /></PageShell>
  }

  return (
    <PageShell>
      <RechargeCard
        info={info}
        onSuccess={() => qc.invalidateQueries({ queryKey: ['my-topups'] })}
      />

      <MyTopupsSection />

      {admin && <AdminTopupsSection />}
    </PageShell>
  )
}

function PageShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-8 lg:px-10">
      <PageHeader kicker={t('topup.kicker')} title={t('topup.title')} lead={t('topup.lead')} />
      {children}
    </div>
  )
}

function InfoStateBox({ icon, text, tone = 'info' }: { icon: React.ReactNode; text: string; tone?: 'info' | 'warn' }) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border px-5 py-4 text-sm',
        tone === 'warn'
          ? 'border-[color:var(--coral)]/30 bg-[color:var(--coral)]/8 text-[color:var(--coral)]'
          : 'border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--muted)]',
      )}
    >
      {icon}
      <span>{text}</span>
    </div>
  )
}

function RechargeCard({ info, onSuccess }: { info: NonNullable<Awaited<ReturnType<typeof topupService.info>>>; onSuccess: () => void }) {
  const { t } = useTranslation()
  const [selectedTier, setSelectedTier] = useState<TopupAmountOption | null>(info.amount_options[1] ?? info.amount_options[0] ?? null)
  const [customMoney, setCustomMoney] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const moneyCents = customMoney
    ? Math.max(0, Math.floor(Number(customMoney) * 100))
    : selectedTier?.money ?? 0

  const start = useMutation({
    mutationFn: async (g: GatewayChoice) => {
      if (moneyCents < 100) throw new ApiError(t('topup.errBelowMin'))
      if (g.kind === 'stripe') return topupService.startStripe(moneyCents)
      if (g.kind === 'epay') return topupService.startEpay(moneyCents)
      if (g.kind === 'crypto' && g.adapter) return topupService.startCrypto(g.adapter, moneyCents)
      throw new Error('unsupported gateway')
    },
    onSuccess: (r) => {
      onSuccess()
      // Redirect into the hosted payment page. Backend will call us back via
      // the gateway's webhook regardless of whether the user finishes.
      window.location.href = r.pay_url
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'failed to start payment'),
  })

  return (
    <section className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
      {/* Amount picker */}
      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-[var(--shadow-jelly)]">
        <div className="font-mono text-xs uppercase tracking-[2px] text-[color:var(--muted)]">{t('topup.amount.label')}</div>
        <h2 className="mt-1 font-display text-xl font-bold tracking-[-0.5px]">{t('topup.amount.title')}</h2>

        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {info.amount_options.map((tier) => (
            <button
              key={tier.money}
              type="button"
              onClick={() => {
                setSelectedTier(tier)
                setCustomMoney('')
                setErr(null)
              }}
              className={cn(
                'group relative flex flex-col rounded-xl border px-4 py-3 text-left transition',
                selectedTier?.money === tier.money && !customMoney
                  ? 'border-[color:var(--cyan)] bg-[color:var(--cyan)]/10 text-current-ink'
                  : 'border-[color:var(--border)] bg-[color:var(--bg2)] hover:border-[color:var(--cyan)]/50',
              )}
            >
              <span className="font-display text-lg font-bold tabular-nums">{tier.display}</span>
              <span className="mt-0.5 font-mono text-xs text-[color:var(--muted)]">
                {formatNum(tier.quota)} {t('topup.quotaUnit')}
              </span>
              {tier.discount && (
                <span className="absolute right-2 top-2 rounded-full bg-[color:var(--cyan)]/20 px-2 py-0.5 text-[10px] font-bold text-[color:var(--cyan)]">
                  {tier.discount}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-5">
          <label className="block">
            <span className="mb-1.5 block font-mono text-xs uppercase tracking-[2px] text-[color:var(--muted)]">
              {t('topup.amount.custom')}
            </span>
            <input
              type="number"
              min="1"
              step="0.01"
              value={customMoney}
              onChange={(e) => {
                setCustomMoney(e.target.value)
                setSelectedTier(null)
                setErr(null)
              }}
              placeholder={t('topup.amount.customPlaceholder')}
              className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-3 py-2 font-mono text-sm tabular-nums transition focus:border-[color:var(--cyan)] focus:outline-none focus:ring-2 focus:ring-[color:var(--cyan)]/20"
            />
          </label>
        </div>
      </div>

      {/* Gateway picker */}
      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-[var(--shadow-jelly)]">
        <div className="font-mono text-xs uppercase tracking-[2px] text-[color:var(--muted)]">{t('topup.pay.kicker')}</div>
        <h2 className="mt-1 font-display text-xl font-bold tracking-[-0.5px]">{t('topup.pay.title')}</h2>

        <div className="mt-2 text-xs text-[color:var(--muted)]">
          {moneyCents > 0
            ? t('topup.pay.summary', { money: (moneyCents / 100).toFixed(2) })
            : t('topup.pay.pickFirst')}
        </div>

        <div className="mt-5 flex flex-col gap-2.5">
          {info.stripe_enabled && (
            <GatewayButton
              icon={<CreditCard className="h-4 w-4" />}
              label={t('topup.gw.stripe')}
              hint={t('topup.gw.stripeHint')}
              disabled={start.isPending || moneyCents < 100}
              onClick={() => {
                setErr(null)
                start.mutate({ kind: 'stripe' })
              }}
            />
          )}
          {info.epay_enabled && (
            <GatewayButton
              icon={<Coins className="h-4 w-4" />}
              label={t('topup.gw.epay')}
              hint={t('topup.gw.epayHint')}
              disabled={start.isPending || moneyCents < 100}
              onClick={() => {
                setErr(null)
                start.mutate({ kind: 'epay' })
              }}
            />
          )}
          {info.crypto_adapters.map((a) => (
            <GatewayButton
              key={a.name}
              icon={<Bitcoin className="h-4 w-4" />}
              label={a.display_name}
              hint={a.assets.slice(0, 3).join(' · ')}
              disabled={start.isPending || moneyCents < 100}
              onClick={() => {
                setErr(null)
                start.mutate({ kind: 'crypto', adapter: a.name })
              }}
            />
          ))}
        </div>

        {err && (
          <div className="mt-4 rounded-lg border border-[color:var(--coral)]/30 bg-[color:var(--coral)]/8 px-3 py-2 text-xs text-[color:var(--coral)]">
            {err}
          </div>
        )}
      </div>
    </section>
  )
}

function GatewayButton({
  icon,
  label,
  hint,
  disabled,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  hint?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex items-center justify-between rounded-xl border px-4 py-3 text-left transition',
        disabled
          ? 'cursor-not-allowed border-[color:var(--border)] bg-[color:var(--bg2)] opacity-50'
          : 'border-[color:var(--border)] bg-[color:var(--bg2)] hover:border-[color:var(--cyan)] hover:bg-[color:var(--cyan)]/8',
      )}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color:var(--cyan)]/10 text-[color:var(--cyan)]">
          {icon}
        </span>
        <div>
          <div className="text-sm font-bold">{label}</div>
          {hint && <div className="font-mono text-[11px] text-[color:var(--muted)]">{hint}</div>}
        </div>
      </div>
      <ExternalLink className="h-4 w-4 text-[color:var(--muted)]" />
    </button>
  )
}

function MyTopupsSection() {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['my-topups'],
    queryFn: () => topupService.mine(1, 20),
  })

  const cols: Column<Topup>[] = [
    { key: 'created', header: t('topup.col.created'), width: '160px', mono: true, cell: (r) => formatTs(r.created_at) },
    { key: 'gateway', header: t('topup.col.gateway'), width: '160px', cell: (r) => <span className="font-medium">{r.gateway}</span> },
    {
      key: 'money',
      header: t('topup.col.money'),
      width: '140px',
      mono: true,
      align: 'right',
      cell: (r) => (
        <span className="tabular-nums">
          {(r.money / 100).toFixed(2)} {r.currency}
        </span>
      ),
    },
    {
      key: 'quota',
      header: t('topup.col.quota'),
      width: '140px',
      mono: true,
      align: 'right',
      cell: (r) => <span className="tabular-nums text-current-ink">{formatNum(r.quota)}</span>,
    },
    { key: 'status', header: t('topup.col.status'), width: '120px', cell: (r) => <TopupStatusPill status={r.status} /> },
    {
      key: 'trade_no',
      header: t('topup.col.trade'),
      width: '1.4fr',
      cell: (r) => <code className="font-mono text-[11px] text-[color:var(--muted)]">{r.trade_no.slice(0, 18)}…</code>,
    },
  ]

  return (
    <section className="mt-10">
      <div className="mb-4">
        <div className="font-mono text-xs uppercase tracking-[2px] text-[color:var(--cyan)]">{t('topup.history.kicker')}</div>
        <h2 className="mt-1 font-display text-xl font-bold tracking-[-0.5px]">{t('topup.history.title')}</h2>
      </div>
      <DataTable columns={cols} rows={data} rowKey={(t) => t.id} loading={isLoading} emptyHint={t('topup.history.empty')} minRows={4} />
    </section>
  )
}

function AdminTopupsSection() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const promptDialog = usePrompt()
  const [statusFilter, setStatusFilter] = useState<'' | 'pending' | 'success' | 'failed' | 'refunded'>('')
  const { data, isLoading } = useQuery({
    queryKey: ['admin-topups', statusFilter],
    queryFn: () => topupService.adminList({ status: statusFilter || undefined, size: 50 }),
  })

  const complete = useMutation({
    mutationFn: ({ trade_no, note }: { trade_no: string; note: string }) =>
      topupService.adminComplete(trade_no, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-topups'] }),
  })

  const cols: Column<Topup>[] = [
    { key: 'id', header: 'ID', width: '60px', mono: true, cell: (r) => r.id },
    { key: 'user', header: t('topup.col.user'), width: '80px', mono: true, cell: (r) => r.user_id },
    { key: 'gateway', header: t('topup.col.gateway'), width: '140px', cell: (r) => r.gateway },
    {
      key: 'money',
      header: t('topup.col.money'),
      width: '130px',
      mono: true,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{(r.money / 100).toFixed(2)} {r.currency}</span>,
    },
    { key: 'status', header: t('topup.col.status'), width: '110px', cell: (r) => <TopupStatusPill status={r.status} /> },
    {
      key: 'trade_no',
      header: t('topup.col.trade'),
      width: '1.4fr',
      cell: (r) => <code className="font-mono text-[11px] text-[color:var(--muted)]">{r.trade_no.slice(0, 16)}…</code>,
    },
    {
      key: 'actions',
      header: '',
      width: '80px',
      align: 'right',
      cell: (r) => {
        if (r.status !== 'pending') return null
        return (
          <button
            type="button"
            onClick={async () => {
              const note = await promptDialog({
                title: t('topup.admin.complete'),
                message: t('topup.admin.completePrompt'),
                placeholder: t('topup.admin.completePlaceholder'),
                confirmText: t('topup.admin.complete'),
              })
              if (note !== null && r.trade_no) complete.mutate({ trade_no: r.trade_no, note })
            }}
            className="flex h-7 items-center gap-1 rounded-md border border-[color:var(--border)] px-2 text-[11px] font-medium text-[color:var(--muted)] transition hover:border-[color:var(--cyan)] hover:text-[color:var(--cyan)]"
            title={t('topup.admin.complete')}
          >
            <Wrench className="h-3 w-3" />
            {t('topup.admin.complete')}
          </button>
        )
      },
    },
  ]

  return (
    <section className="mt-12">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="font-mono text-xs uppercase tracking-[2px] text-[color:var(--cyan)]">{t('topup.admin.kicker')}</div>
          <h2 className="mt-1 font-display text-xl font-bold tracking-[-0.5px]">{t('topup.admin.title')}</h2>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-3 py-1.5 text-xs font-medium"
        >
          <option value="">{t('topup.admin.allStatus')}</option>
          <option value="pending">pending</option>
          <option value="success">success</option>
          <option value="failed">failed</option>
          <option value="refunded">refunded</option>
        </select>
      </div>
      <DataTable columns={cols} rows={data} rowKey={(t) => t.id} loading={isLoading} emptyHint={t('topup.admin.empty')} minRows={6} />
    </section>
  )
}

function TopupStatusPill({ status }: { status: Topup['status'] }) {
  switch (status) {
    case 'success':
      return <StatusPill active label="success" />
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--cyan)]/30 bg-[color:var(--cyan)]/10 px-2 py-0.5 text-[11px] font-medium text-[color:var(--cyan)]">
          <Clock className="h-3 w-3" />
          pending
        </span>
      )
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--coral)]/30 bg-[color:var(--coral)]/8 px-2 py-0.5 text-[11px] font-medium text-[color:var(--coral)]">
          <XCircle className="h-3 w-3" />
          failed
        </span>
      )
    case 'refunded':
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--muted)]/30 bg-[color:var(--muted)]/10 px-2 py-0.5 text-[11px] font-medium text-[color:var(--muted)]">
          <CheckCircle2 className="h-3 w-3" />
          refunded
        </span>
      )
  }
}

function formatNum(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return Math.round(n).toLocaleString()
}

function formatTs(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts * 1000)
  return d.toLocaleString()
}
