import { useTranslation } from 'react-i18next'
import { CreditCard } from 'lucide-react'

/**
 * Display-only marketing banner for the Solayer U-Card cashback offer.
 * Sits at the top of the top-up page. No payment logic — purely promotional.
 */
export function UCardCashbackBanner() {
  const { t } = useTranslation()
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-2xl border border-[color:var(--cyan)]/30 bg-gradient-to-r from-[color:var(--cyan)]/12 to-[color:var(--surface)] px-6 py-5 shadow-[var(--shadow-jelly)]">
      <div className="flex items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[color:var(--cyan)]/15 text-[color:var(--cyan)]">
          <CreditCard className="h-5 w-5" />
        </span>
        <div>
          <div className="font-display text-lg font-bold tracking-[-0.4px]">{t('topup.ucard.brand')}</div>
          <div className="mt-0.5 text-sm font-semibold text-[color:var(--cyan)]">{t('topup.ucard.cashback')}</div>
          <div className="mt-0.5 text-xs text-[color:var(--muted)]">{t('topup.ucard.sub')}</div>
        </div>
      </div>
      <span className="rounded-full bg-[color:var(--cyan)]/20 px-3 py-1 font-mono text-xs font-bold uppercase tracking-[1.5px] text-[color:var(--cyan)]">
        {t('topup.ucard.badge')}
      </span>
    </div>
  )
}
