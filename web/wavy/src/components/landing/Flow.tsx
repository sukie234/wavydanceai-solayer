import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'

export function Flow() {
  const { t } = useTranslation()
  const [active, setActive] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setActive((i) => (i + 1) % 3), 1600)
    return () => clearInterval(id)
  }, [])

  return (
    <section id="flow" className="px-[6vw] py-24">
      <div className="mx-auto mb-14 max-w-[1180px] text-center">
        <div className="kicker">{t('flow.kicker')}</div>
        <h2 className="font-display text-[clamp(1.8rem,3.6vw,2.6rem)] font-bold tracking-[-1px]">{t('flow.title')}</h2>
        <p className="mx-auto mt-3 max-w-xl leading-[1.6] text-[color:var(--muted)]">{t('flow.lead')}</p>
      </div>

      <div className="mx-auto mt-14 grid max-w-[1180px] items-stretch gap-5 md:grid-cols-[1fr_64px_1fr_64px_1fr] md:gap-0">
        <Step n={1} active={active === 0} title={t('flow.s1.t')} desc={t('flow.s1.d')}>
          <Snippet>model: "claude-opus-4-6"</Snippet>
        </Step>
        <Connector />
        <Step n={2} active={active === 1} title={t('flow.s2.t')} desc={t('flow.s2.d')}>
          <Snippet>POST /v1/chat/completions</Snippet>
        </Step>
        <Connector delay />
        <Step n={3} active={active === 2} title={t('flow.s3.t')} desc={t('flow.s3.d')}>
          <div className="flex flex-wrap gap-2">
            <Chip>{t('flow.chip.webhook')}</Chip>
            <Chip>{t('flow.chip.poll')}</Chip>
            <Chip>SSE</Chip>
          </div>
        </Step>
      </div>
    </section>
  )
}

function Step({
  n,
  active,
  title,
  desc,
  children,
}: {
  n: number
  active: boolean
  title: string
  desc: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-[26px_24px] shadow-[var(--shadow-jelly)] transition-all duration-500',
        active && '-translate-y-1.5 border-[color:var(--primary)] shadow-[0_26px_50px_-18px_rgba(46,143,176,0.45)]',
      )}
    >
      <span className="font-mono text-[0.78rem] font-bold tracking-[2px] text-current-ink">STEP {String(n).padStart(2, '0')}</span>
      <span className="font-display text-[1.12rem] font-bold">{title}</span>
      <p className="flex-1 text-[0.88rem] leading-[1.55] text-[color:var(--muted)]">{desc}</p>
      {children}
    </div>
  )
}

function Snippet({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden text-ellipsis whitespace-nowrap rounded-xl bg-[#062B36] px-3 py-2.5 font-mono text-[0.74rem] text-[#a4e58f]">
      {children}
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-[color:var(--primary)]/40 px-2.5 py-0.5 font-mono text-[0.7rem] tracking-[1px] text-[color:var(--primary)]">
      {children}
    </span>
  )
}

function Connector({ delay }: { delay?: boolean }) {
  return (
    <div className="relative hidden items-center px-2 md:flex">
      <style>{`
        @keyframes wavy-dash{to{background-position:16px 0}}
        @keyframes wavy-pkt{0%{left:8px;opacity:0}12%{opacity:1}88%{opacity:1}100%{left:calc(100% - 18px);opacity:0}}
      `}</style>
      <div
        className="h-0.5 w-full"
        style={{
          background:
            'repeating-linear-gradient(90deg,color-mix(in srgb,var(--primary) 55%,transparent) 0 8px,transparent 8px 16px)',
          backgroundSize: '16px 2px',
          animation: 'wavy-dash .9s linear infinite',
        }}
      />
      <span
        className="absolute top-1/2 -translate-y-1/2"
        style={{
          left: 8,
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: 'var(--mint)',
          boxShadow: '0 0 12px var(--mint)',
          animation: `wavy-pkt 2.4s ease-in-out infinite ${delay ? '1.2s' : '0s'}`,
        }}
      />
    </div>
  )
}
