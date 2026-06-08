import { useEffect, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Clock, XCircle, Loader2 } from 'lucide-react'
import { topupService } from '@/lib/services/topup'
import { Button } from '@/components/ui/button'

/**
 * Landing page Stripe / 易支付 / NOWPayments send the user back to after
 * checkout (the PaymentReturnURL option in admin). We read trade_no from the
 * query string and poll the user's topup list for a matching row, surfacing
 * success / pending / failed.
 *
 * Lives at the root (not under /console) so it works even if the session
 * expired during checkout — user gets a clear message and a path back.
 */
export const Route = createFileRoute('/topup-result')({
  component: TopupResultPage,
  validateSearch: (search: Record<string, unknown>) => ({
    trade_no: typeof search.trade_no === 'string' ? search.trade_no : undefined,
    cancelled: search.cancelled === '1' || search.cancelled === 1 || search.cancelled === true,
  }),
})

function TopupResultPage() {
  const { t } = useTranslation()
  const { trade_no, cancelled } = Route.useSearch()
  const [polled, setPolled] = useState(0)

  // Poll the user's recent topups for up to 30s — gives the webhook time to
  // land. After that we surface a "still pending, check back" state rather
  // than blocking the UI forever.
  const { data: orders } = useQuery({
    queryKey: ['my-topups', 'result-poll', trade_no],
    queryFn: () => topupService.mine(1, 20),
    enabled: !!trade_no && !cancelled,
    refetchInterval: polled < 6 ? 5_000 : false,
  })

  useEffect(() => {
    if (orders) setPolled((n) => n + 1)
  }, [orders])

  if (cancelled) return <Frame icon={<XCircle className="h-12 w-12 text-[color:var(--coral)]" />} title={t('topup.result.cancelled')} body={t('topup.result.cancelledHint')} />
  if (!trade_no) return <Frame icon={<XCircle className="h-12 w-12 text-[color:var(--coral)]" />} title={t('topup.result.missingTrade')} body={t('topup.result.missingTradeHint')} />

  const match = orders?.find((o) => o.trade_no === trade_no)

  if (match?.status === 'success') {
    return (
      <Frame
        icon={<CheckCircle2 className="h-12 w-12 text-[color:var(--live)]" />}
        title={t('topup.result.successTitle')}
        body={t('topup.result.successBody', { quota: match.quota, money: (match.money / 100).toFixed(2), currency: match.currency })}
      />
    )
  }
  if (match?.status === 'failed') {
    return (
      <Frame icon={<XCircle className="h-12 w-12 text-[color:var(--coral)]" />} title={t('topup.result.failedTitle')} body={t('topup.result.failedBody')} />
    )
  }

  // No row yet, or still pending — webhook in flight.
  return (
    <Frame
      icon={polled < 6 ? <Loader2 className="h-12 w-12 animate-spin text-[color:var(--cyan)]" /> : <Clock className="h-12 w-12 text-[color:var(--cyan)]" />}
      title={polled < 6 ? t('topup.result.processingTitle') : t('topup.result.stillPendingTitle')}
      body={polled < 6 ? t('topup.result.processingBody') : t('topup.result.stillPendingBody')}
    />
  )
}

function Frame({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  const { t } = useTranslation()
  return (
    <main className="flex min-h-screen items-center justify-center bg-[color:var(--bg)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-center shadow-[var(--shadow-jelly)]">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center">{icon}</div>
        <h1 className="font-display text-2xl font-bold tracking-[-0.5px]">{title}</h1>
        <p className="mt-3 text-sm text-[color:var(--muted)]">{body}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link to="/console/topup">
            <Button size="sm">{t('topup.result.backToTopup')}</Button>
          </Link>
          <Link to="/console">
            <Button size="sm" variant="ghost">{t('topup.result.dashboard')}</Button>
          </Link>
        </div>
      </div>
    </main>
  )
}
