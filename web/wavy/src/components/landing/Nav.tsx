import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

export function Nav() {
  const { t, i18n } = useTranslation()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const cycleLang = () => {
    const next = i18n.language?.startsWith('zh') ? 'en' : 'zh-CN'
    i18n.changeLanguage(next)
  }

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
        <Link to="/" className="flex items-center gap-2.5 font-display text-[1.25rem] font-bold tracking-[-0.5px]">
          <Logo />
          <span>
            wavydance<span className="text-current-ink">.ai</span>
          </span>
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
          <Button size="sm">{t('nav.getStarted')}</Button>
        </div>
      </div>
    </nav>
  )
}

function Logo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <defs>
        <linearGradient id="wavy-mark" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3FB3D9" />
          <stop offset="60%" stopColor="#4ED4DC" />
          <stop offset="100%" stopColor="#B5ECF2" />
        </linearGradient>
      </defs>
      <path
        d="M2 14 Q5 8 8 14 T14 14 T20 14"
        stroke="url(#wavy-mark)"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="20" cy="14" r="2.4" fill="url(#wavy-mark)" />
    </svg>
  )
}
