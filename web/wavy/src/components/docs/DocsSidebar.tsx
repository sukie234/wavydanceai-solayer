import { useMemo, useState } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { DOCS, type DocItem } from '@/lib/docs-catalog'
import { cn } from '@/lib/cn'

export function DocsSidebar() {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const location = useLocation()

  const sections = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return DOCS
    return DOCS.map((s) => ({
      ...s,
      items: s.items.filter(
        (i) =>
          i.name.toLowerCase().includes(needle) ||
          (i.family ?? '').toLowerCase().includes(needle),
      ),
    })).filter((s) => s.items.length > 0)
  }, [q])

  return (
    <aside className="sticky top-[72px] hidden h-[calc(100vh-72px)] w-[280px] flex-none overflow-y-auto border-r border-[color:var(--border)] bg-[color:var(--bg2)]/40 px-5 py-7 lg:block">
      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--muted)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('docs.sidebar.searchPlaceholder')}
          className="h-9 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] pl-8 pr-3 text-[0.85rem] text-[color:var(--text)] outline-none transition focus:border-[color:var(--cyan)]"
        />
      </div>

      <nav className="flex flex-col gap-6">
        {sections.map((s) => (
          <div key={s.id}>
            <div className="mb-2 px-1 font-mono text-[0.7rem] uppercase tracking-[2px] text-[color:var(--muted)]">
              {t(s.titleKey)}
            </div>
            <ul className="flex flex-col gap-0.5">
              {s.items.map((item) => (
                <SidebarRow key={`${s.id}-${item.slug}`} item={item} pathname={location.pathname} />
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}

function SidebarRow({ item, pathname }: { item: DocItem; pathname: string }) {
  const { t } = useTranslation()
  const expected =
    item.category === 'overview' ? `/docs/${item.slug}` : `/docs/${item.category}/${item.slug}`
  // Approximate active state by comparing the pathname suffix — keeps the
  // sidebar working even when the route also accepts deeper anchors.
  const active = pathname === expected
  const rowClass = cn(
    'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[0.85rem] text-[color:var(--muted)] transition hover:bg-[color:var(--surface)] hover:text-[color:var(--text)]',
    active &&
      'bg-[color:var(--surface)] font-semibold text-[color:var(--text)] shadow-[inset_2px_0_0_var(--cyan)]',
  )
  const inner = (
    <>
      <span className="truncate font-mono text-[0.82rem]">{item.nameKey ? t(item.nameKey) : item.name}</span>
      {item.badge && (
        <span
          className={cn(
            'ml-auto rounded-full px-1.5 py-px font-mono text-[0.62rem] uppercase tracking-[1px]',
            item.badge === 'new'
              ? 'bg-[color:var(--cyan)]/15 text-[color:var(--cyan)]'
              : 'bg-[color:var(--coral)]/20 text-[color:var(--coral)]',
          )}
        >
          {item.badge}
        </span>
      )}
    </>
  )
  return (
    <li>
      {item.category === 'overview' ? (
        <Link to="/docs/$slug" params={{ slug: item.slug }} className={rowClass}>
          {inner}
        </Link>
      ) : (
        <Link
          to="/docs/$category/$model"
          params={{ category: item.category, model: item.slug }}
          className={rowClass}
        >
          {inner}
        </Link>
      )}
    </li>
  )
}
