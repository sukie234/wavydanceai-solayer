import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

export function Nav() {
  const { t } = useTranslation()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-[4vw] py-3.5">
      <div
        className={cn(
          'pointer-events-auto flex w-full max-w-[1800px] items-center gap-9 rounded-full border border-transparent px-[2vw] py-2 transition-all duration-500',
          scrolled &&
            'max-w-[960px] gap-6 border-[color:var(--border)]/70 px-5 py-2 shadow-[0_12px_40px_rgba(7,57,74,0.16)] [backdrop-filter:blur(18px)_saturate(1.4)]',
          scrolled && 'bg-[color-mix(in_srgb,var(--bg)_62%,transparent)]',
        )}
      >
        <Link to="/" className="flex items-center gap-2.5">
          <Logo />
        </Link>

        <div className="ml-auto hidden gap-8 text-[0.92rem] text-[color:var(--muted)] md:flex">
          <a href="#models" className="hover:text-[color:var(--text)]">
            {t('nav.models')}
          </a>
          <a href="#leaderboard" className="hover:text-[color:var(--text)]">
            {t('nav.leaderboard')}
          </a>
          <a href="#pricing" className="hover:text-[color:var(--text)]">
            {t('nav.pricing')}
          </a>
          <a href="#qa" className="hover:text-[color:var(--text)]">
            {t('nav.docs')}
          </a>
        </div>

        <div className="flex items-center gap-2.5">
          <Link to="/console" className="hidden sm:inline-flex">
            <Button variant="ghost" size="sm">{t('nav.console')}</Button>
          </Link>
          <Button size="sm">{t('nav.getStarted')}</Button>
        </div>
      </div>
    </nav>
  )
}

function Logo() {
  return (
    <img
      src="https://mintcdn.com/solayerlabsinc/ehaIHrCi02AamVTV/images/logo-light.svg?fit=max&auto=format&n=ehaIHrCi02AamVTV&q=85&s=db21e2d43a937526636dbee85dd895b3"
      alt="Solayer"
      className="h-7 w-auto"
    />
  )
}
