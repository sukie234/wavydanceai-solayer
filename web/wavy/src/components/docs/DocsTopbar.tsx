import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Slim top bar for the docs route. Mirrors the marketing Nav visually but
 * uses absolute links so the section anchors (#models, #pricing) still
 * resolve when the user is on /docs.
 */
export function DocsTopbar() {
  const { t, i18n } = useTranslation()
  const cycleLang = () => {
    const next = i18n.language?.startsWith('zh') ? 'en' : 'zh-CN'
    i18n.changeLanguage(next)
  }
  return (
    <header className="sticky top-0 z-40 flex h-[72px] items-center gap-6 border-b border-[color:var(--border)] bg-[color:var(--bg)]/85 px-6 backdrop-blur-md lg:px-8">
      <Link to="/" className="flex items-center gap-2.5 font-display text-[1.1rem] font-bold tracking-[-0.5px]">
        <Mark />
        <span>
          wavydance<span className="text-current-ink">.ai</span>
        </span>
      </Link>
      <span className="hidden font-mono text-[0.72rem] uppercase tracking-[2.5px] text-[color:var(--muted)] sm:inline">
        {t('docs.topbar.kicker')}
      </span>

      <nav className="ml-auto hidden gap-6 text-[0.9rem] text-[color:var(--muted)] md:flex">
        <Link to="/" hash="models" className="hover:text-[color:var(--text)]">{t('nav.models')}</Link>
        <Link to="/" hash="pricing" className="hover:text-[color:var(--text)]">{t('nav.pricing')}</Link>
        <Link to="/docs" className="text-[color:var(--text)]">{t('nav.docs')}</Link>
      </nav>

      <div className="ml-auto flex items-center gap-2 md:ml-0">
        <button
          type="button"
          onClick={cycleLang}
          aria-label={t('common.language')}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-[color:var(--border)] px-2.5 text-[0.85rem] text-[color:var(--muted)] transition hover:border-[color:var(--cyan)] hover:text-[color:var(--text)]"
        >
          <Globe className="h-3.5 w-3.5" />
          <span className="font-mono uppercase">{i18n.language?.startsWith('zh') ? 'zh' : 'en'}</span>
        </button>
        <Link to="/console" className="hidden sm:inline-flex">
          <Button variant="ghost" size="sm">{t('nav.console')}</Button>
        </Link>
        <Link to="/register">
          <Button size="sm">{t('nav.getStarted')}</Button>
        </Link>
      </div>
    </header>
  )
}

function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <defs>
        <linearGradient id="docs-mark" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3FB3D9" />
          <stop offset="60%" stopColor="#4ED4DC" />
          <stop offset="100%" stopColor="#B5ECF2" />
        </linearGradient>
      </defs>
      <path d="M2 14 Q5 8 8 14 T14 14 T20 14" stroke="url(#docs-mark)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <circle cx="20" cy="14" r="2.4" fill="url(#docs-mark)" />
    </svg>
  )
}
