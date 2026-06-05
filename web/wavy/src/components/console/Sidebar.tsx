import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { Link, useLocation } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard,
  PlugZap,
  Boxes,
  KeyRound,
  ScrollText,
  BarChart3,
  Receipt,
  Wallet,
  Users,
  Settings,
  UserCircle,
} from 'lucide-react'
import { authService } from '@/lib/services/auth'
import { Role, type User } from '@/lib/types'
import { cn } from '@/lib/cn'

type NavItem = {
  to: string
  icon: typeof LayoutDashboard
  i18n: string
  /** Minimum role required to see this item. Default = common user. */
  minRole?: number
}

const OPERATIONS: NavItem[] = [
  { to: '/console', icon: LayoutDashboard, i18n: 'console.nav.overview' },
  { to: '/console/channels', icon: PlugZap, i18n: 'console.nav.channels', minRole: Role.AdminUser },
  { to: '/console/models', icon: Boxes, i18n: 'console.nav.models', minRole: Role.AdminUser },
  { to: '/console/tokens', icon: KeyRound, i18n: 'console.nav.tokens' },
  { to: '/console/logs', icon: ScrollText, i18n: 'console.nav.logs' },
  { to: '/console/analytics', icon: BarChart3, i18n: 'console.nav.analytics' },
  { to: '/console/billing', icon: Receipt, i18n: 'console.nav.billing' },
  { to: '/console/topup', icon: Wallet, i18n: 'console.nav.topup' },
]

const ACCOUNT: NavItem[] = [
  // Profile is for every signed-in user — no role gate.
  { to: '/console/profile', icon: UserCircle, i18n: 'console.nav.profile' },
  { to: '/console/users', icon: Users, i18n: 'console.nav.users', minRole: Role.AdminUser },
  { to: '/console/settings', icon: Settings, i18n: 'console.nav.settings', minRole: Role.RootUser },
]

function visibleFor(items: NavItem[], user: User | null | undefined): NavItem[] {
  const role = user?.role ?? Role.Guest
  return items.filter((it) => (it.minRole ?? Role.CommonUser) <= role)
}

export function Sidebar() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const listRef = useRef<HTMLDivElement>(null)
  const [packetTop, setPacketTop] = useState(0)

  // Live user — the console layout's beforeLoad already gated entry, so this
  // query will hit the 5s session cache and return immediately. We re-query
  // here so the sidebar reacts to logout/role changes without a full reload.
  const { data: user } = useQuery({
    queryKey: ['self'],
    queryFn: () => authService.getSelf(),
    staleTime: 30_000,
  })
  const ops = useMemo(() => visibleFor(OPERATIONS, user), [user])
  const account = useMemo(() => visibleFor(ACCOUNT, user), [user])

  // Move the glowing "packet" on the current line to align with the active item.
  // Re-run when nav items change so the packet doesn't strand on a hidden row.
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const active = list.querySelector<HTMLElement>('[data-active="true"]')
    if (!active) return
    const listRect = list.getBoundingClientRect()
    const itemRect = active.getBoundingClientRect()
    setPacketTop(itemRect.top - listRect.top + itemRect.height / 2)
  }, [pathname, ops.length, account.length])

  return (
    <aside className="sticky top-0 hidden h-screen w-[260px] flex-shrink-0 flex-col border-r border-[color:var(--border)] bg-[color:var(--surface)] md:flex">
      {/* Brand — clicking returns to landing */}
      <Link
        to="/"
        className="group flex items-center gap-2.5 px-6 py-5 transition-opacity hover:opacity-80"
        aria-label="Back to solayer.org homepage"
      >
        <LogoMark />
      </Link>

      {/* Nav with vertical "current" accent line */}
      <div ref={listRef} className="relative flex-1 overflow-y-auto px-3 pb-4">
        <style>{`
          @keyframes wavy-dash-v{to{background-position:0 16px}}
          .wavy-current-line{
            background: repeating-linear-gradient(180deg,
              color-mix(in srgb, var(--primary) 55%, transparent) 0 8px,
              transparent 8px 16px);
            background-size: 2px 16px;
            animation: wavy-dash-v .9s linear infinite;
          }
        `}</style>
        <span className="wavy-current-line pointer-events-none absolute bottom-3 left-[18px] top-2 w-[2px]" />
        <span
          className="pointer-events-none absolute left-[14px] z-10 h-2.5 w-2.5 rounded-full bg-[color:var(--primary)] transition-[top] duration-500 ease-out"
          style={{
            top: `${packetTop}px`,
            transform: 'translateY(-50%)',
            boxShadow: '0 0 14px var(--primary), 0 0 4px var(--primary)',
          }}
        />

        <SectionLabel>{t('console.section.operations')}</SectionLabel>
        {ops.map((item) => (
          <NavRow key={item.to} item={item} t={t} pathname={pathname} />
        ))}

        {account.length > 0 && (
          <>
            <SectionLabel className="mt-7">{t('console.section.account')}</SectionLabel>
            {account.map((item) => (
              <NavRow key={item.to} item={item} t={t} pathname={pathname} />
            ))}
          </>
        )}
      </div>

      <SupportRow />
    </aside>
  )
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'mb-2 ml-5 mt-3 font-mono text-[11px] font-medium uppercase tracking-[2.5px] text-[color:var(--muted)]/70',
        className,
      )}
    >
      {children}
    </div>
  )
}

function NavRow({ item, t, pathname }: { item: NavItem; t: (k: string) => string; pathname: string }) {
  const Icon = item.icon
  const active = item.to === '/console' ? pathname === '/console' : pathname.startsWith(item.to)
  return (
    <Link
      to={item.to}
      data-active={active}
      className={cn(
        'group relative ml-5 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200',
        'text-[color:var(--muted)] hover:bg-[color:var(--bg2)] hover:text-[color:var(--text)]',
        active && 'bg-[color:var(--bg2)] text-[color:var(--text)]',
      )}
    >
      <Icon
        className={cn(
          'h-4 w-4 flex-shrink-0 transition-colors',
          active ? 'text-[color:var(--primary)]' : 'text-[color:var(--muted)] group-hover:text-[color:var(--primary)]',
        )}
        strokeWidth={1.75}
      />
      <span>{t(item.i18n)}</span>
      {active && (
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[color:var(--primary)] [animation:wavy-pulse_2s_infinite]" />
      )}
      <style>{`@keyframes wavy-pulse{50%{opacity:.35}}`}</style>
    </Link>
  )
}

function SupportRow() {
  const { t } = useTranslation()
  return (
    <div className="border-t border-[color:var(--border)] px-5 py-4">
      <div className="mb-2.5 font-mono text-[11px] font-medium uppercase tracking-[2.5px] text-[color:var(--muted)]/70">
        {t('console.section.support')}
      </div>
      <div className="flex gap-1">
        <SocialBtn label="Discord" href="https://discord.com/invite/solayerlabs" color="#5865F2">
          <DiscordIcon />
        </SocialBtn>
        <SocialBtn label="GitHub" href="https://github.com/solayer-labs" color="#94A3B8">
          <GithubIcon />
        </SocialBtn>
        <SocialBtn label="X" href="https://x.com/solayer_labs" color="#94A3B8">
          <XIcon />
        </SocialBtn>
        <SocialBtn label="Website" href="https://solayer.org/" color="#084d3e">
          <GlobeIcon />
        </SocialBtn>
      </div>
    </div>
  )
}

function SocialBtn({
  label,
  href,
  color,
  children,
}: {
  label: string
  href: string
  color: string
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      aria-label={label}
      className="group relative flex h-9 w-9 flex-1 items-center justify-center rounded-lg border border-[color:var(--border)] text-[color:var(--muted)] transition-all hover:-translate-y-0.5"
      style={{ ['--hover' as never]: color }}
    >
      <span
        className="absolute inset-0 rounded-lg opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{ background: `linear-gradient(135deg, ${color}40, transparent)` }}
      />
      <span className="relative transition-colors group-hover:text-[color:var(--text)]" style={{ width: 14, height: 14 }}>
        {children}
      </span>
      <span className="pointer-events-none absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-1 text-[11px] text-[color:var(--muted)] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        {label}
      </span>
    </a>
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

const ICON = { viewBox: '0 0 24 24', fill: 'currentColor', width: 14, height: 14 } as const
function DiscordIcon() {
  return (
    <svg {...ICON}>
      <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.4c1.8.4 2.6 1.1 3.5 1.9a13.3 13.3 0 0 0-11.4 0c.9-.8 1.9-1.5 3.5-1.9L10.6 3a19.8 19.8 0 0 0-4.9 1.4C2.6 9 1.9 13.4 2.2 17.8c2 1.5 3.9 2.4 5.8 3l1.2-2c-.6-.2-1.3-.5-1.9-1l.5-.4a14 14 0 0 0 12.4 0l.5.4c-.6.4-1.3.8-1.9 1l1.2 2c1.9-.6 3.8-1.5 5.8-3 .4-5-.7-9.4-3.5-13.4zM8.7 14.8c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2z" />
    </svg>
  )
}
function GithubIcon() {
  return (
    <svg {...ICON}>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.25.8-.55v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2.8.9 1.2 1.9 1.2 3.2 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.55A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  )
}
function XIcon() {
  return (
    <svg {...ICON}>
      <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-6.4L6.4 22H3.3l7.3-8.3L1.2 2h6.5l4.4 5.9L18.9 2z" />
    </svg>
  )
}
function GlobeIcon() {
  return (
    <span
      className="block h-[14px] w-[14px]"
      style={{
        maskImage: 'url("https://d3gk2c5xim1je2.cloudfront.net/fontawesome/v7.2.0/duotone/globe.svg")',
        maskRepeat: 'no-repeat',
        maskPosition: 'center center',
        maskSize: 'contain',
        backgroundColor: 'currentColor',
      }}
      aria-hidden="true"
    />
  )
}
