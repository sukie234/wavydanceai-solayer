import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { WavesBg } from './WavesBg'

export function Hero() {
  const { t } = useTranslation()

  return (
    // Height ≈ viewport minus the Marquee strip below (~80px), so on a fresh
    // load the scrolling vendor banner peeks at the bottom edge as a scroll cue.
    <header className="relative flex min-h-[calc(100vh-80px)] items-center overflow-hidden bg-gradient-to-b from-[color:var(--bg)] to-[color:var(--bg2)] px-[6vw] pb-20 pt-[140px]">
      <div
        className="pointer-events-none absolute -left-40 -top-56 z-0 h-[680px] w-[680px] rounded-full bg-[#084D3E] blur-[140px]"
        style={{ opacity: 'var(--glow-op)' }}
      />
      <div
        className="pointer-events-none absolute -right-52 -top-28 z-0 h-[680px] w-[680px] rounded-full bg-[#0d6b53] blur-[140px]"
        style={{ opacity: 'var(--glow-op)' }}
      />

      <div className="relative z-10 mx-auto grid w-full max-w-[1180px] items-center gap-14 md:grid-cols-[1.05fr_0.95fr]">
        <div className="text-left">
          <span className="mb-7 inline-flex items-center gap-2 rounded-full border border-[color:var(--primary)]/40 bg-[color:var(--primary)]/10 px-4 py-1.5 font-mono text-[0.82rem] text-[color:var(--primary)]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--primary)]" />
            {t('hero.tag')}
          </span>

          <h1 className="font-display text-[clamp(2.6rem,6.2vw,4.6rem)] font-bold leading-[1.06] tracking-[-2px]">
            {t('hero.title')}
            <br />
            <span className="text-current-ink">{t('hero.title_grad')}</span>
          </h1>

          <p className="mt-6 max-w-xl text-[1.15rem] leading-[1.65] text-[color:var(--muted)]">
            {t('hero.sub')}
          </p>

          <div className="mt-10 flex flex-wrap gap-4">
            <Button size="lg">{t('hero.ctaPrimary')}</Button>
            <Button variant="ghost" size="lg">
              {t('hero.ctaSecondary')}
            </Button>
          </div>

          <HeroStats />
        </div>

      </div>

      <WavesBg />
    </header>
  )
}

function HeroStats() {
  const { t } = useTranslation()
  const [models, setModels] = useState(0)
  const [lat, setLat] = useState('38ms')
  const [tick, setTick] = useState(false)

  useEffect(() => {
    let mc = 0
    const target = 200
    const id = setInterval(() => {
      mc += Math.ceil((target - mc) / 12) || 1
      if (mc >= target) {
        clearInterval(id)
        setModels(target)
      } else setModels(mc)
    }, 40)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      setTick(true)
      const next = 32 + Math.floor(Math.random() * 13)
      setTimeout(() => {
        setLat(`${next}ms`)
        setTick(false)
      }, 220)
    }, 2600)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="mt-14 flex flex-wrap gap-10">
      <Stat label={t('hero.st1')} value={models >= 200 ? '200+' : String(models)} />
      <Stat label={t('hero.st2')} value={lat} ticking={tick} />
      <Stat label={t('hero.st3')} value="99.99%" />
    </div>
  )
}

function Stat({ label, value, ticking }: { label: string; value: string; ticking?: boolean }) {
  return (
    <div>
      <b className="flex items-center gap-2 font-display text-[1.7rem] tabular-nums text-current-ink">
        <span className="h-2 w-2 flex-none rounded-full bg-[color:var(--primary)] [animation:wavy-ping_2.2s_infinite]" />
        <span className={`transition-opacity duration-200 ${ticking ? 'opacity-50' : 'opacity-100'}`}>
          {value}
        </span>
      </b>
      <span className="text-[0.85rem] text-[color:var(--muted)]">{label}</span>
      <style>{`@keyframes wavy-ping{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--primary) 55%,transparent)}70%{box-shadow:0 0 0 9px transparent}100%{box-shadow:0 0 0 0 transparent}}`}</style>
    </div>
  )
}

