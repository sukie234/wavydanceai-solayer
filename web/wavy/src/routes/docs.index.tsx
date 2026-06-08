import { Link, createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArrowRight, MessageSquare, Image as ImageIcon, Film, Zap } from 'lucide-react'
import { DOCS } from '@/lib/docs-catalog'
import { CodeBlock } from '@/components/docs/CodeBlock'

export const Route = createFileRoute('/docs/')({
  component: DocsIndex,
})

function DocsIndex() {
  const { t } = useTranslation()
  const chat = DOCS.find((d) => d.id === 'chat')!
  const image = DOCS.find((d) => d.id === 'image')!
  const video = DOCS.find((d) => d.id === 'video')!

  return (
    <article className="mx-auto w-full max-w-[960px] px-6 py-12 lg:px-10">
      <div className="kicker">{t('docs.index.kicker')}</div>
      <h1 className="font-display text-[clamp(2.2rem,4.5vw,3.4rem)] font-bold leading-[1.05] tracking-[-1px]">
        {t('docs.index.title1')}
        <br />
        <span className="text-current-ink">{t('docs.index.title2')}</span>
      </h1>
      <p className="mt-5 max-w-2xl text-[1.05rem] leading-[1.65] text-[color:var(--muted)]">
        {t('docs.index.lead')}
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <ModalityCard
          icon={<MessageSquare className="h-4 w-4" />}
          label={t('docs.index.modality.chat')}
          count={chat.items.length}
          category="chat"
          model={chat.items[0]!.slug}
        />
        <ModalityCard
          icon={<ImageIcon className="h-4 w-4" />}
          label={t('docs.index.modality.image')}
          count={image.items.length}
          category="image"
          model={image.items[0]!.slug}
        />
        <ModalityCard
          icon={<Film className="h-4 w-4" />}
          label={t('docs.index.modality.video')}
          count={video.items.length}
          category="video"
          model={video.items[0]!.slug}
        />
      </div>

      <section className="mt-14">
        <div className="kicker">{t('docs.index.quickstart.kicker')}</div>
        <h2 className="mb-4 font-display text-[1.7rem] font-bold tracking-[-0.5px]">
          {t('docs.index.quickstart.title')}
        </h2>
        <ol className="mb-6 grid gap-3 sm:grid-cols-3">
          <Step n="01" title={t('docs.index.step1.t')} body={t('docs.index.step1.d')} />
          <Step n="02" title={t('docs.index.step2.t')} body={t('docs.index.step2.d')} />
          <Step n="03" title={t('docs.index.step3.t')} body={t('docs.index.step3.d')} />
        </ol>
        <CodeBlock
          lang="bash"
          code={`curl https://api.solayer.org/v1/chat/completions \\
  -H "Authorization: Bearer $WAVY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-5.2",
    "messages": [{ "role": "user", "content": "Hello, wave!" }]
  }'`}
        />
      </section>

      <section className="mt-14 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-7 shadow-[var(--shadow-jelly)]">
        <div className="flex items-center gap-2 text-[color:var(--cyan)]">
          <Zap className="h-4 w-4" />
          <span className="font-mono text-[0.72rem] uppercase tracking-[2px]">{t('docs.index.tip.kicker')}</span>
        </div>
        <h3 className="mt-2 font-display text-[1.3rem] font-bold">{t('docs.index.tip.title')}</h3>
        <p className="mt-2 max-w-prose text-[0.94rem] leading-[1.65] text-[color:var(--muted)]">
          {t('docs.index.tip.body')}
        </p>
        <Link
          to="/console/playground"
          className="mt-4 inline-flex items-center gap-1.5 text-[0.92rem] font-semibold text-[color:var(--cyan)] hover:underline"
        >
          {t('docs.index.tip.cta')} <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </article>
  )
}

function ModalityCard({
  icon,
  label,
  count,
  category,
  model,
}: {
  icon: React.ReactNode
  label: string
  count: number
  category: 'chat' | 'image' | 'video'
  model: string
}) {
  return (
    <Link
      to="/docs/$category/$model"
      params={{ category, model }}
      className="group flex flex-col gap-2 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 transition hover:-translate-y-px hover:border-[color:var(--cyan)] hover:shadow-[var(--shadow-jelly)]"
    >
      <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--cyan)]/10 text-[color:var(--cyan)]">
        {icon}
      </div>
      <div className="flex items-center justify-between">
        <span className="font-display text-[1.05rem] font-semibold">{label}</span>
        <span className="font-mono text-[0.8rem] text-[color:var(--muted)]">{count} models</span>
      </div>
      <span className="inline-flex items-center gap-1 text-[0.85rem] text-[color:var(--cyan)] opacity-0 transition group-hover:opacity-100">
        Browse <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  )
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
      <div className="font-mono text-[0.72rem] uppercase tracking-[2px] text-[color:var(--cyan)]">{n}</div>
      <div className="mt-1 font-display text-[1rem] font-semibold">{title}</div>
      <p className="mt-1 text-[0.85rem] leading-[1.5] text-[color:var(--muted)]">{body}</p>
    </li>
  )
}
