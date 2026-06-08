import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/lib/theme'
import { Button } from '@/components/ui/button'

/**
 * Slim top bar for the docs route. Mirrors the marketing Nav visually but
 * uses absolute links so the section anchors (#models, #pricing) still
 * resolve when the user is on /docs.
 */
export function DocsTopbar() {
  const { t } = useTranslation()
  return (
    <header className="sticky top-0 z-40 flex h-[72px] items-center gap-6 border-b border-[color:var(--border)] bg-[color:var(--bg)]/85 px-6 backdrop-blur-md lg:px-8">
      <Link to="/" className="flex items-center gap-2.5">
        <LogoMark />
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

function LogoMark() {
  const { theme } = useTheme()
  const src =
    theme === 'dark'
      ? 'https://mintcdn.com/solayerlabsinc/ehaIHrCi02AamVTV/images/logo-dark.svg?fit=max&auto=format&n=ehaIHrCi02AamVTV&q=85&s=2f6e56d868d5149426f1c475850b010c'
      : 'https://mintcdn.com/solayerlabsinc/ehaIHrCi02AamVTV/images/logo-light.svg?fit=max&auto=format&n=ehaIHrCi02AamVTV&q=85&s=db21e2d43a937526636dbee85dd895b3'
  return <img src={src} alt="Solayer" className="h-7 w-auto" />
}
