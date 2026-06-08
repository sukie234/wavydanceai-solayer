import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

export function Pricing() {
  const { t } = useTranslation()

  return (
    <section id="pricing" className="px-[6vw] py-24">
      <div className="mx-auto max-w-[1080px] text-center">
        <div className="kicker">{t('pricing.kicker')}</div>
        <h2 className="font-display text-[clamp(1.8rem,3.6vw,2.6rem)] font-bold tracking-[-1px]">{t('pricing.title')}</h2>

        <div className="mt-12 grid gap-[22px] text-left md:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
          <Tier
            name="Surf"
            price="$0"
            per={t('pricing.surf.per')}
            features={[t('pricing.surf.f1'), t('pricing.surf.f2'), t('pricing.surf.f3')]}
            cta={t('pricing.surf.cta')}
            variant="ghost"
          />
          <Tier
            name="Current"
            price={t('pricing.current.price')}
            features={[
              t('pricing.current.f1'),
              t('pricing.current.f2'),
              t('pricing.current.f3'),
              t('pricing.current.f4'),
            ]}
            cta={t('pricing.current.cta')}
            badge={t('pricing.current.badge')}
            highlight
            priceSmall
          />
          <Tier
            name="Tsunami"
            price={t('pricing.tsunami.price')}
            per={t('pricing.tsunami.per')}
            features={[t('pricing.tsunami.f1'), t('pricing.tsunami.f2'), t('pricing.tsunami.f3')]}
            cta={t('pricing.tsunami.cta')}
            variant="ghost"
          />
        </div>
      </div>
    </section>
  )
}

function Tier({
  name,
  price,
  per,
  features,
  cta,
  highlight,
  badge,
  variant = 'primary',
  priceSmall,
}: {
  name: string
  price: string
  per?: string
  features: string[]
  cta: string
  highlight?: boolean
  badge?: string
  variant?: 'primary' | 'ghost'
  priceSmall?: boolean
}) {
  return (
    <div
      className="relative rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-[34px_30px] shadow-[var(--shadow-jelly)]"
      style={
        highlight
          ? {
              border: '1.5px solid transparent',
              background:
                'linear-gradient(var(--surface),var(--surface)) padding-box, linear-gradient(110deg,var(--cyan) 0%,var(--mint) 55%,var(--glass) 100%) border-box',
            }
          : undefined
      }
    >
      {badge && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[color:var(--cyan)] to-[color:var(--mint)] px-3.5 py-1 text-[0.72rem] font-bold tracking-[1px] text-[color:var(--cta-ink)]">
          {badge}
        </span>
      )}
      <h3 className="font-display text-[1.1rem]">{name}</h3>
      <div className={`mt-4 font-display font-bold ${priceSmall ? 'text-2xl' : 'text-[2rem]'}`}>
        {price}
        {per && <small className="ml-1 text-[0.95rem] font-normal text-[color:var(--muted)]">{per}</small>}
      </div>
      <ul className="mb-7 mt-5 list-none text-[0.9rem] text-[color:var(--muted)]">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2.5 py-1.5">
            <span className="font-mono font-bold text-[color:var(--mint)]">~</span>
            {f}
          </li>
        ))}
      </ul>
      <Button variant={variant}>{cta}</Button>
    </div>
  )
}
