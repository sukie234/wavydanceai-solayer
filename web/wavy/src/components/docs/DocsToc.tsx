import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'

export type TocEntry = { id: string; label: string }

/**
 * Right-side "On this page" anchor list. Scroll-spy highlights the section
 * currently in the upper third of the viewport.
 */
export function DocsToc({ entries }: { entries: TocEntry[] }) {
  const { t } = useTranslation()
  const [active, setActive] = useState<string | null>(entries[0]?.id ?? null)

  useEffect(() => {
    if (!entries.length) return
    const obs = new IntersectionObserver(
      (items) => {
        const visible = items.filter((i) => i.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-72px 0px -65% 0px', threshold: 0.01 },
    )
    entries.forEach((e) => {
      const el = document.getElementById(e.id)
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [entries])

  return (
    <aside className="sticky top-[72px] hidden h-[calc(100vh-72px)] w-[220px] flex-none overflow-y-auto py-10 pl-2 pr-6 xl:block">
      <div className="mb-3 font-mono text-[0.7rem] uppercase tracking-[2px] text-[color:var(--muted)]">
        {t('docs.toc.title')}
      </div>
      <ul className="flex flex-col gap-1.5 border-l border-[color:var(--border)] pl-3">
        {entries.map((e) => (
          <li key={e.id}>
            <a
              href={`#${e.id}`}
              className={cn(
                '-ml-3 block border-l-2 border-transparent pl-3 text-[0.84rem] text-[color:var(--muted)] transition hover:text-[color:var(--text)]',
                active === e.id && 'border-[color:var(--cyan)] font-semibold text-[color:var(--text)]',
              )}
            >
              {e.label}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  )
}
