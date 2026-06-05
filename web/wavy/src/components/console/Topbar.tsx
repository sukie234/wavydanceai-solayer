import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Search, Bell, Moon, Sun, ChevronRight, Activity, LogOut, User as UserIcon } from 'lucide-react'
import { useTheme } from '@/lib/theme'
import { authService } from '@/lib/services/auth'
import { clearSessionCache } from '@/lib/session'
import type { User } from '@/lib/types'
import { cn } from '@/lib/cn'

const PATH_KEYS: Record<string, string> = {
  '': 'console.nav.overview',
  channels: 'console.nav.channels',
  models: 'console.nav.models',
  tokens: 'console.nav.tokens',
  logs: 'console.nav.logs',
  analytics: 'console.nav.analytics',
  billing: 'console.nav.billing',
  users: 'console.nav.users',
  settings: 'console.nav.settings',
}

export function Topbar() {
  const { t } = useTranslation()
  const { theme, toggle } = useTheme()
  const { pathname } = useLocation()

  const seg = pathname.replace(/^\/console\/?/, '').split('/')[0] || ''
  const crumbKey = PATH_KEYS[seg] ?? 'console.nav.overview'

  // Live user for avatar initials + menu — cheap because session.ts caches it.
  const { data: user } = useQuery({
    queryKey: ['self'],
    queryFn: () => authService.getSelf(),
    staleTime: 30_000,
  })

  return (
    <header className="sticky top-0 z-30 flex h-[60px] items-center gap-3 border-b border-[color:var(--border)] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] px-6 [backdrop-filter:blur(14px)_saturate(1.3)]">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-[0.85rem]">
        <Link to="/console" className="text-[color:var(--muted)] hover:text-[color:var(--text)]">
          Console
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-[color:var(--muted)]/60" />
        <span className="font-medium text-[color:var(--text)]">{t(crumbKey)}</span>
      </nav>

      {/* Search */}
      <div className="mx-auto w-full max-w-md">
        <div className="group relative flex items-center gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-3 py-2 transition-colors focus-within:border-[color:var(--primary)]">
          <Search className="h-3.5 w-3.5 text-[color:var(--muted)]" strokeWidth={2} />
          <input
            type="search"
            placeholder={t('console.searchPlaceholder')}
            className="flex-1 bg-transparent text-sm text-[color:var(--text)] placeholder:text-[color:var(--muted)]/70 focus:outline-none"
          />
          <kbd className="hidden rounded border border-[color:var(--border)] bg-[color:var(--surface)] px-1.5 py-0.5 font-mono text-xs text-[color:var(--muted)] sm:inline-block">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Live status indicator */}
      <div className="hidden items-center gap-2 rounded-full border border-[color:var(--live)]/30 bg-[color:var(--live)]/10 px-2.5 py-1 font-mono text-xs text-[color:var(--live)] lg:flex">
        <Activity className="h-3 w-3" strokeWidth={2.5} />
        <span className="tracking-[1px]">{t('console.allFlowing')}</span>
      </div>

      <button
        type="button"
        onClick={toggle}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--border)] text-[color:var(--muted)] transition hover:border-[color:var(--primary)] hover:text-[color:var(--text)]"
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <button
        type="button"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--border)] text-[color:var(--muted)] transition hover:border-[color:var(--primary)] hover:text-[color:var(--text)]"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[color:var(--coral)]" />
      </button>

      <UserMenu user={user ?? null} />
    </header>
  )
}

function UserMenu({ user }: { user: User | null }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const username = user?.username ?? '—'
  const display = user?.display_name || username
  const initials = (username.slice(0, 2) || '··').toUpperCase()

  async function signOut() {
    try {
      await authService.logout()
    } catch {
      // Best-effort; even if the server rejects, clear local state.
    }
    clearSessionCache()
    setOpen(false)
    navigate({ to: '/login' })
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'flex items-center gap-2.5 rounded-full border border-[color:var(--border)] bg-[color:var(--bg2)] py-0.5 pl-0.5 pr-3 transition hover:border-[color:var(--primary)]',
          open && 'border-[color:var(--primary)]',
        )}
      >
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-[#0c0d0e]"
          style={{ background: 'linear-gradient(135deg,#084D3E,#0d6b53,#a4e58f)' }}
        >
          {initials}
        </span>
        <span className="hidden text-sm font-medium md:inline">{username}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-60 overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-jelly)]"
        >
          <div className="border-b border-[color:var(--border)] px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <UserIcon className="h-3.5 w-3.5 text-[color:var(--muted)]" />
              {display}
            </div>
            {user?.email && (
              <div className="mt-0.5 truncate font-mono text-xs text-[color:var(--muted)]">{user.email}</div>
            )}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-[color:var(--text)] transition hover:bg-[color:var(--bg2)] hover:text-[color:var(--coral)]"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
