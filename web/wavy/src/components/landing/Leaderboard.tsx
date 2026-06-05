import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { VendorIcon } from './VendorIcons'

type Cat = 'llm' | 'image' | 'video'
type TabId = 'all' | Cat

const DATA: { name: string; cat: Cat; icon: string; tok: number; trend: number }[] = [
  { name: 'Claude Opus 4.6', cat: 'llm', icon: 'ic-anthropic', tok: 184.2, trend: 12 },
  { name: 'GPT-5.2', cat: 'llm', icon: 'ic-openai', tok: 171.8, trend: 8 },
  { name: 'DeepSeek-V4', cat: 'llm', icon: 'ic-deepseek', tok: 96.4, trend: 21 },
  { name: 'Gemini 3 Pro', cat: 'llm', icon: 'ic-google', tok: 88.1, trend: -3 },
  { name: 'Qwen3-Max', cat: 'llm', icon: 'ic-qwen', tok: 64.0, trend: 5 },
  { name: 'Kimi K2', cat: 'llm', icon: 'ic-kimi', tok: 41.7, trend: -6 },
  { name: 'Llama 4', cat: 'llm', icon: 'ic-meta', tok: 38.2, trend: 2 },
  { name: 'GPT-Image-2', cat: 'image', icon: 'ic-openai', tok: 22.4, trend: 15 },
  { name: 'FLUX 1.1 Pro', cat: 'image', icon: 'ic-bfl', tok: 18.9, trend: 9 },
  { name: 'Gemini Image', cat: 'image', icon: 'ic-google', tok: 14.6, trend: -2 },
  { name: 'SD 3.5 Large', cat: 'image', icon: 'ic-sd', tok: 11.2, trend: 4 },
  { name: 'Qwen-Image', cat: 'image', icon: 'ic-qwen', tok: 8.7, trend: 7 },
  { name: 'Veo 3.1', cat: 'video', icon: 'ic-google', tok: 31.5, trend: 18 },
  { name: 'Sora 2', cat: 'video', icon: 'ic-openai', tok: 27.3, trend: 11 },
  { name: 'Kling 2.5', cat: 'video', icon: 'ic-kling', tok: 19.8, trend: 24 },
  { name: 'Runway Gen-4', cat: 'video', icon: 'ic-runway', tok: 12.1, trend: -5 },
  { name: 'Hailuo 02', cat: 'video', icon: 'ic-minimax', tok: 9.4, trend: 3 },
]

const TABS: { id: TabId; key: string }[] = [
  { id: 'all', key: 'lb.tab.all' },
  { id: 'llm', key: 'lb.tab.llm' },
  { id: 'image', key: 'lb.tab.image' },
  { id: 'video', key: 'lb.tab.video' },
]

export function Leaderboard() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<TabId>('all')

  const rows = useMemo(() => {
    const filtered = tab === 'all' ? DATA : DATA.filter((d) => d.cat === tab)
    return [...filtered].sort((a, b) => b.tok - a.tok).slice(0, 8)
  }, [tab])
  const max = rows[0]?.tok ?? 1

  const catKey = (c: Cat) => `lb.tab.${c}`

  return (
    <section id="leaderboard" className="px-[6vw] py-24">
      <div className="mx-auto mb-14 max-w-[1180px] text-center">
        <div className="kicker">{t('lb.kicker')}</div>
        <h2 className="font-display text-[clamp(1.8rem,3.6vw,2.6rem)] font-bold tracking-[-1px]">{t('lb.title')}</h2>
        <p className="mx-auto mt-3 max-w-xl leading-[1.6] text-[color:var(--muted)]">{t('lb.lead')}</p>
      </div>

      <div className="mx-auto max-w-[960px]">
        {/* Tab strip floats above the card */}
        <div className="mb-5 mt-10 flex flex-wrap justify-center gap-2.5">
          {TABS.map((tabItem) => (
            <button
              key={tabItem.id}
              type="button"
              onClick={() => setTab(tabItem.id)}
              className={cn(
                'rounded-full border border-[color:var(--border)] bg-transparent px-5 py-2 font-mono text-[0.8rem] tracking-[1px] text-[color:var(--muted)] transition hover:border-[color:var(--primary)] hover:text-[color:var(--text)]',
                tab === tabItem.id &&
                  'border-transparent bg-gradient-to-r from-[#084D3E] to-[#0d6b53] font-bold text-[#0c0d0e]',
              )}
            >
              {t(tabItem.key)}
            </button>
          ))}
        </div>

        {/* Fixed-height container — 8 rows worth of space so tab switches never reflow the page */}
        <div
          className="flex min-h-[600px] flex-col rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-[var(--shadow-jelly)] md:p-7"
        >
          <div className="flex flex-1 flex-col gap-2.5">
            {rows.map((d, i) => (
              <div
                key={d.name}
                className="grid grid-cols-[28px_minmax(0,1fr)_96px_60px] items-center gap-3.5 rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg2)]/60 px-4 py-3 md:grid-cols-[36px_240px_1fr_96px_64px]"
                style={{
                  animation: `wavy-lbin .45s ease ${i * 55}ms both`,
                }}
              >
                <span
                  className={cn(
                    'font-display text-base font-bold text-[color:var(--muted)]',
                    i < 3 && 'text-current-ink',
                  )}
                >
                  {i + 1}
                </span>
                <span className="flex min-w-0 items-center gap-2.5 text-sm font-semibold">
                  <VendorIcon id={d.icon} size={24} />
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap">{d.name}</span>
                  {tab === 'all' && (
                    <span className="flex-none rounded-full border border-[color:var(--border)] px-2 py-px font-mono text-[0.62rem] tracking-[1px] text-[color:var(--muted)]">
                      {t(catKey(d.cat))}
                    </span>
                  )}
                </span>
                <span className="hidden h-2 overflow-hidden rounded-full bg-[color:var(--border)]/55 md:block">
                  <i
                    className="block h-full rounded-full bg-gradient-to-r from-[#084D3E] via-[#0d6b53] to-[#a4e58f] transition-[width] duration-700"
                    style={{ width: `${(d.tok / max) * 100}%` }}
                  />
                </span>
                <span className="text-right font-mono text-xs tabular-nums text-[color:var(--muted)]">
                  {d.tok.toFixed(1)}B
                </span>
                <span
                  className={cn(
                    'text-right font-mono text-xs tabular-nums',
                    d.trend >= 0 ? 'text-[color:var(--live)]' : 'text-[#E2607B]',
                  )}
                >
                  {d.trend >= 0 ? '▲' : '▼'} {Math.abs(d.trend)}%
                </span>
              </div>
            ))}
            {/* Spacer rows so an under-filled category still preserves card height */}
            {Array.from({ length: Math.max(0, 8 - rows.length) }).map((_, i) => (
              <div key={`spacer-${i}`} className="h-[56px] rounded-2xl border border-dashed border-[color:var(--border)]/40" />
            ))}
          </div>
        </div>
        <p className="mt-5 text-center font-mono text-xs text-[color:var(--muted)]/80">{t('lb.note')}</p>
      </div>
      <style>{`@keyframes wavy-lbin{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}`}</style>
    </section>
  )
}
