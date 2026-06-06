import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

export function Footer() {
  const { t } = useTranslation()
  return (
    <footer className="border-t border-[color:var(--border)] bg-[color:var(--bg2)] px-[6vw] pb-9 pt-14 text-[0.88rem] text-[color:var(--muted)]">
      <div className="mx-auto flex max-w-[1180px] flex-wrap justify-between gap-7">
        <div>
          <div className="font-display text-[1.05rem] font-bold">
            wavydance<span className="text-current-ink">.ai</span>
          </div>
          <div className="mt-2.5 font-mono text-[0.8rem] tracking-[2px] text-[color:var(--muted)]/60">
            ONE WAVE. EVERY MODEL.
          </div>
        </div>
        <Col title={t('footer.product')}>
          <a href="#models">{t('nav.models')}</a>
          <a href="#pricing">{t('nav.pricing')}</a>
          <a href="#">{t('footer.playground')}</a>
        </Col>
        <Col title={t('footer.dev')}>
          <Link to="/docs">{t('nav.docs')}</Link>
          <a href="#">{t('footer.status')}</a>
          <a href="#">{t('footer.changelog')}</a>
        </Col>
        <Col title={t('footer.company')}>
          <a href="#">{t('footer.about')}</a>
          <a href="#">{t('footer.privacy')}</a>
          <a href="#">{t('footer.terms')}</a>
        </Col>
      </div>
    </footer>
  )
}

function Col({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="mb-2 text-[color:var(--text)]">{title}</span>
      {children}
    </div>
  )
}
