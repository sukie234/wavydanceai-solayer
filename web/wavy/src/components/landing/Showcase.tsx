import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { VendorIcon } from './VendorIcons'

const CARDS = [
  { id: 'vision', icon: 'ic-openai', model: 'GPT-5.2', tag: 'show.tag.vision', lat: '412ms', kind: 'vision' },
  { id: 'code', icon: 'ic-anthropic', model: 'Claude Opus 4.6', tag: 'show.tag.code', lat: '388ms', kind: 'code' },
  { id: 'audio', icon: 'ic-google', model: 'Gemini 3 Pro', tag: 'show.tag.audio', lat: '356ms', kind: 'audio' },
  { id: 'reason', icon: 'ic-deepseek', model: 'DeepSeek-V4', tag: 'show.tag.reason', lat: '1.2s', kind: 'reason' },
  { id: 'zh', icon: 'ic-qwen', model: 'Qwen3-Max', tag: 'show.tag.zh', lat: '298ms', kind: 'zh' },
] as const

export function Showcase() {
  const { t } = useTranslation()
  const [idx, setIdx] = useState(0)
  const [leaving, setLeaving] = useState(-1)
  const pausedRef = useRef(false)

  useEffect(() => {
    const id = setInterval(() => {
      if (pausedRef.current) return
      setLeaving(idx)
      setIdx((i) => (i + 1) % CARDS.length)
    }, 3000)
    return () => clearInterval(id)
  }, [idx])

  return (
    <section id="showcase" className="bg-[color:var(--bg2)] px-[6vw] py-24">
      <div className="mx-auto mb-14 max-w-[1180px] text-center">
        <div className="kicker">{t('show.kicker')}</div>
        <h2 className="font-display text-[clamp(1.8rem,3.6vw,2.6rem)] font-bold tracking-[-1px]">{t('show.title')}</h2>
        <p className="mx-auto mt-3 max-w-xl leading-[1.6] text-[color:var(--muted)]">{t('show.lead')}</p>
      </div>

      <div
        className="relative mx-auto h-[440px] max-w-[780px] [perspective:1200px] max-md:h-[560px]"
        onMouseEnter={() => (pausedRef.current = true)}
        onMouseLeave={() => (pausedRef.current = false)}
      >
        {CARDS.map((c, i) => {
          const rel = (i - idx + CARDS.length) % CARDS.length
          const state = i === leaving ? 'out' : rel === 0 ? 'active' : rel === 1 ? 'next' : rel === 2 ? 'back' : ''
          return (
            <article
              key={c.id}
              className={cn(
                'absolute inset-0 flex flex-col gap-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-[28px_30px] shadow-[0_35px_60px_-22px_rgba(7,57,74,0.35)]',
                'transition-[transform,opacity] duration-700 ease-[cubic-bezier(.22,.8,.3,1)]',
                state === 'active' && 'z-30 translate-y-0 scale-100 opacity-100 [pointer-events:auto]',
                state === 'next' && 'z-20 translate-y-[22px] scale-[.94] opacity-55 [pointer-events:none]',
                state === 'back' && 'z-10 translate-y-[40px] scale-[.89] opacity-25 [pointer-events:none]',
                state === 'out' && 'z-40 -translate-y-11 scale-[1.02] opacity-0 [pointer-events:none]',
                state === '' && 'opacity-0 [pointer-events:none]',
              )}
            >
              <header className="flex items-center gap-3">
                <VendorIcon id={c.icon} size={26} />
                <span className="font-display text-[1.05rem] font-bold">{c.model}</span>
                <span className="rounded-full border border-[color:var(--cyan)]/40 px-2.5 py-0.5 font-mono text-[0.7rem] uppercase tracking-[1.5px] text-[color:var(--cyan)]">
                  {t(c.tag)}
                </span>
                <span className="ml-auto flex items-center gap-1.5 font-mono text-[0.78rem] text-[color:var(--live)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--live)]" />
                  {c.lat}
                </span>
              </header>
              <CardBody kind={c.kind} t={t} />
            </article>
          )
        })}
      </div>

      <div className="mx-auto mt-12 h-6 w-[62%] max-w-[780px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(7,57,74,0.30)_0%,rgba(7,57,74,0)_70%)] blur-[7px]" />

      <div className="mt-5 flex justify-center gap-2">
        {CARDS.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Slide ${i + 1}`}
            onClick={() => {
              setLeaving(idx)
              setIdx(i)
            }}
            className={cn(
              'h-1.5 w-1.5 rounded-full bg-[color:var(--border)] transition',
              i === idx && 'scale-125 bg-[color:var(--cyan)]',
            )}
          />
        ))}
      </div>
    </section>
  )
}

function CardBody({ kind, t }: { kind: string; t: (k: string) => string }) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[1fr_1.25fr]">
      {kind === 'vision' && (
        <>
          <Box label={t('show.lbl.in_image')}>
            <div className="flex flex-1 items-center justify-center">
              <svg width="150" height="100" viewBox="0 0 150 100">
                <rect width="150" height="100" rx="10" fill="#062B36" />
                <polyline
                  points="12,80 40,58 68,66 96,38 124,46 140,20"
                  fill="none"
                  stroke="var(--mint)"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <circle cx="96" cy="38" r="4" fill="var(--coral)" />
              </svg>
            </div>
            <span className="text-[0.9rem] text-[color:var(--muted)]">{t('show.c1.q')}</span>
          </Box>
          <Box label={t('show.lbl.out')}>
            <p className="text-[0.9rem] leading-[1.55] text-[color:var(--text)]">{t('show.c1.a')}</p>
          </Box>
        </>
      )}
      {kind === 'code' && (
        <>
          <Box label={t('show.lbl.prompt')}>
            <p className="text-[0.9rem] leading-[1.55] text-[color:var(--muted)]">{t('show.c2.q')}</p>
          </Box>
          <Box label={t('show.lbl.out')}>
            <pre className="overflow-hidden font-mono text-[0.76rem] leading-[1.6] text-[color:var(--text)]">
              {`def rate_limit(rps: float):
    bucket = TokenBucket(rps)
    def deco(fn):
        @wraps(fn)
        async def wrap(*a, **kw):
            await bucket.acquire()
            return await fn(*a, **kw)
        return wrap
    return deco`}
            </pre>
          </Box>
        </>
      )}
      {kind === 'audio' && (
        <>
          <Box label={t('show.lbl.in_audio')}>
            <div className="flex flex-1 items-center justify-center">
              <svg width="170" height="60" viewBox="0 0 170 60">
                <g fill="var(--cyan)">
                  {[6, 16, 26, 36, 46, 56, 66, 76, 86, 96, 106, 116, 126, 136, 146].map((x, i) => {
                    const h = [16, 32, 44, 24, 12, 36, 20, 48, 28, 16, 40, 24, 8, 32, 16][i]
                    const y = (60 - h) / 2
                    return <rect key={x} x={x} y={y} width="5" height={h} rx="2.5" />
                  })}
                </g>
              </svg>
            </div>
            <span className="text-[0.9rem] text-[color:var(--muted)]">{t('show.c3.q')}</span>
          </Box>
          <Box label={t('show.lbl.out')}>
            <p className="text-[0.9rem] leading-[1.55] text-[color:var(--text)]">{t('show.c3.a')}</p>
          </Box>
        </>
      )}
      {kind === 'reason' && (
        <>
          <Box label={t('show.lbl.prompt')}>
            <p className="text-[0.9rem] leading-[1.55] text-[color:var(--muted)]">{t('show.c4.q')}</p>
          </Box>
          <Box label={t('show.lbl.thinking')}>
            <p className="text-[0.9rem] leading-[1.55] text-[color:var(--text)]">{t('show.c4.a')}</p>
          </Box>
        </>
      )}
      {kind === 'zh' && (
        <>
          <Box label={t('show.lbl.prompt')}>
            <p className="text-[0.9rem] leading-[1.55] text-[color:var(--muted)]">{t('show.c5.q')}</p>
          </Box>
          <Box label={t('show.lbl.out')}>
            <p className="text-[0.9rem] leading-[1.55] text-[color:var(--text)]">{t('show.c5.a')}</p>
          </Box>
        </>
      )}
    </div>
  )
}

function Box({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--bg2)_60%,transparent)] p-4">
      <span className="font-mono text-[0.68rem] uppercase tracking-[2px] text-[color:var(--muted)]">{label}</span>
      {children}
    </div>
  )
}
