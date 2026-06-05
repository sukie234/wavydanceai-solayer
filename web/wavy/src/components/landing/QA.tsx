import { useTranslation } from 'react-i18next'

const Q_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5'] as const

export function QA() {
  const { t } = useTranslation()

  return (
    <section id="qa" className="bg-[color:var(--bg2)] px-[6vw] py-24">
      <div className="mx-auto grid max-w-[1180px] items-start gap-12 md:grid-cols-[1.15fr_0.85fr]">
        <div>
          <div className="kicker">{t('qa.kicker')}</div>
          <h2 className="font-display text-[clamp(1.8rem,3.6vw,2.6rem)] font-bold tracking-[-1px]">{t('qa.title')}</h2>
          <p className="mb-7 mt-3 max-w-xl leading-[1.6] text-[color:var(--muted)]">{t('qa.lead')}</p>

          {Q_KEYS.map((k, i) => (
            <details
              key={k}
              open={i === 0}
              className="group mb-3 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] transition hover:border-[color:var(--primary)]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3.5 p-4 text-[0.95rem] font-semibold [&::-webkit-details-marker]:hidden">
                <span>{t(`qa.${k}.q`)}</span>
                <span className="flex-none font-mono text-[1.15rem] text-[color:var(--primary)] transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="px-4 pb-4 text-[0.9rem] leading-[1.65] text-[color:var(--muted)]">{t(`qa.${k}.a`)}</p>
            </details>
          ))}
        </div>

        <aside className="sticky top-24 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-7 shadow-[var(--shadow-jelly)] max-md:static">
          <h3 className="mb-2 font-display text-[1.25rem]">{t('community.title')}</h3>
          <p className="mb-5 text-[0.9rem] leading-[1.6] text-[color:var(--muted)]">{t('community.lead')}</p>

          <SocRow href="https://discord.com/invite/solayerlabs" color="#5865F2" name="Discord" sub="discord.com/invite/solayerlabs" icon={DiscordIcon} />
          <SocRow href="https://github.com/solayer-labs" color="#24292F" name="GitHub" sub="github.com/solayer-labs" icon={GithubIcon} />
          <SocRow href="https://x.com/solayer_labs" color="#0F1419" name="X / Twitter" sub="@solayer_labs" icon={XIcon} />
          <SocRow href="https://solayer.org/" color="#084d3e" name="Website" sub="solayer.org" icon={GlobeIcon} />
        </aside>
      </div>
    </section>
  )
}

function SocRow({
  href,
  color,
  name,
  sub,
  icon: Icon,
}: {
  href: string
  color: string
  name: string
  sub: string
  icon: React.ComponentType
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3.5 rounded-xl border border-transparent p-3 transition hover:translate-x-1 hover:border-[color:var(--primary)]"
    >
      <span
        className="flex h-9 w-9 flex-none items-center justify-center rounded-xl text-white"
        style={{ background: color }}
      >
        <Icon />
      </span>
      <span className="leading-tight">
        <span className="block text-[0.93rem] font-semibold">{name}</span>
        <span className="block font-mono text-[0.76rem] text-[color:var(--muted)]">{sub}</span>
      </span>
      <span className="ml-auto text-[1.1rem] text-[color:var(--muted)]">›</span>
    </a>
  )
}

const ICON_PROPS = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'currentColor' } as const
function DiscordIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.4c1.8.4 2.6 1.1 3.5 1.9a13.3 13.3 0 0 0-11.4 0c.9-.8 1.9-1.5 3.5-1.9L10.6 3a19.8 19.8 0 0 0-4.9 1.4C2.6 9 1.9 13.4 2.2 17.8c2 1.5 3.9 2.4 5.8 3l1.2-2c-.6-.2-1.3-.5-1.9-1l.5-.4a14 14 0 0 0 12.4 0l.5.4c-.6.4-1.3.8-1.9 1l1.2 2c1.9-.6 3.8-1.5 5.8-3 .4-5-.7-9.4-3.5-13.4zM8.7 14.8c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2z" />
    </svg>
  )
}
function GithubIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.25.8-.55v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2.8.9 1.2 1.9 1.2 3.2 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.55A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  )
}
function XIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-6.4L6.4 22H3.3l7.3-8.3L1.2 2h6.5l4.4 5.9L18.9 2zm-1.1 18h1.7L7.1 3.9H5.3L17.8 20z" />
    </svg>
  )
}
function GlobeIcon() {
  return (
    <span
      className="block h-5 w-5"
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
