import { createFileRoute, notFound } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { DOCS, type DocCategory } from '@/lib/docs-catalog'
import { ChatModelSpec } from '@/components/docs/ChatModelSpec'

export const Route = createFileRoute('/docs/$category/$model')({
  loader: ({ params }) => {
    const cat = params.category as DocCategory
    if (cat !== 'chat' && cat !== 'image' && cat !== 'video') throw notFound()
    const section = DOCS.find((d) => d.id === cat)
    const item = section?.items.find((i) => i.slug === params.model)
    if (!item) throw notFound()
    return { item, category: cat }
  },
  component: ModelDocPage,
})

function ModelDocPage() {
  const { item, category } = Route.useLoaderData()
  const { t } = useTranslation()

  if (category === 'chat') return <ChatModelSpec model={item} />

  // Image / video share the unified async-task API, not OpenAI-compat chat;
  // until their dedicated spec ships, render a focused stub that explains
  // the shape rather than a wall of placeholder.
  return (
    <div className="mx-auto w-full max-w-[820px] px-6 py-12 lg:px-10">
      <div className="kicker">{category}</div>
      <h1 className="font-display text-[clamp(2rem,3.5vw,2.75rem)] font-bold tracking-[-0.5px]">
        <span className="font-mono text-[0.85em] text-current-ink">{item.name}</span>
        <span className="text-[color:var(--muted)]"> (task)</span>
      </h1>
      <p className="mt-4 max-w-prose text-[1rem] leading-[1.7] text-[color:var(--muted)]">
        {t('docs.taskStub.body', { model: item.name })}
      </p>
      <div className="mt-6 rounded-2xl border border-[color:var(--cyan)]/30 bg-[color:var(--cyan)]/10 p-4 text-[0.92rem] text-[color:var(--text)]">
        {t('docs.taskStub.note')}
      </div>
    </div>
  )
}
