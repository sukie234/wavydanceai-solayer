import { createFileRoute, notFound } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { DOCS } from '@/lib/docs-catalog'
import { CodeBlock } from '@/components/docs/CodeBlock'

export const Route = createFileRoute('/docs/$slug')({
  loader: ({ params }) => {
    const overview = DOCS.find((d) => d.id === 'overview')!
    const item = overview.items.find((i) => i.slug === params.slug)
    if (!item) throw notFound()
    return { slug: params.slug }
  },
  component: OverviewPage,
})

function OverviewPage() {
  const { slug } = Route.useLoaderData()
  const { t } = useTranslation()
  const content = CONTENT[slug] ?? CONTENT.quickstart

  return (
    <article className="mx-auto w-full max-w-[820px] px-6 py-12 lg:px-10">
      <nav className="font-mono text-[0.78rem] text-[color:var(--muted)]">
        <span>docs</span>
        <span className="px-1.5">/</span>
        <span className="text-[color:var(--text)]">{slug}</span>
      </nav>
      <h1 className="mt-3 font-display text-[clamp(2rem,3.5vw,2.75rem)] font-bold tracking-[-0.5px]">
        {t(content.titleKey)}
      </h1>
      <p className="mt-4 max-w-prose text-[1rem] leading-[1.7] text-[color:var(--muted)]">
        {t(content.leadKey)}
      </p>

      {content.sections.map((sec) => (
        <section key={sec.h} className="mt-10">
          <h2 className="mb-3 font-display text-[1.35rem] font-bold tracking-[-0.5px]">{t(sec.h)}</h2>
          <p className="mb-4 max-w-prose leading-[1.7] text-[color:var(--muted)]">{t(sec.p)}</p>
          {sec.code && <CodeBlock lang={sec.lang} code={sec.code} />}
        </section>
      ))}
    </article>
  )
}

type Section = { h: string; p: string; code?: string; lang?: string }
type Page = { titleKey: string; leadKey: string; sections: Section[] }

const CONTENT: Record<string, Page> = {
  quickstart: {
    titleKey: 'docs.page.quickstart.title',
    leadKey: 'docs.page.quickstart.lead',
    sections: [
      {
        h: 'docs.page.quickstart.s1.h',
        p: 'docs.page.quickstart.s1.p',
        lang: 'bash',
        code: `export WAVY_API_KEY="wd-•••••"
curl https://api.solayer.org/v1/chat/completions \\
  -H "Authorization: Bearer $WAVY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-5.2",
    "messages": [{"role":"user","content":"Hello, wave!"}]
  }'`,
      },
      {
        h: 'docs.page.quickstart.s2.h',
        p: 'docs.page.quickstart.s2.p',
        lang: 'python',
        code: `from openai import OpenAI
client = OpenAI(base_url="https://api.solayer.org/v1", api_key="wd-•••")
r = client.chat.completions.create(
    model="claude-opus-4-6",
    messages=[{"role":"user","content":"hi"}],
)`,
      },
    ],
  },
  authentication: {
    titleKey: 'docs.page.auth.title',
    leadKey: 'docs.page.auth.lead',
    sections: [
      {
        h: 'docs.page.auth.s1.h',
        p: 'docs.page.auth.s1.p',
        lang: 'http',
        code: `GET /v1/models HTTP/1.1
Host: api.solayer.org
Authorization: Bearer wd-•••••`,
      },
    ],
  },
  errors: {
    titleKey: 'docs.page.errors.title',
    leadKey: 'docs.page.errors.lead',
    sections: [
      {
        h: 'docs.page.errors.s1.h',
        p: 'docs.page.errors.s1.p',
        lang: 'json',
        code: `{
  "error": {
    "type": "invalid_request_error",
    "code": "missing_model",
    "message": "Field 'model' is required."
  }
}`,
      },
    ],
  },
  'rate-limits': {
    titleKey: 'docs.page.rate.title',
    leadKey: 'docs.page.rate.lead',
    sections: [
      {
        h: 'docs.page.rate.s1.h',
        p: 'docs.page.rate.s1.p',
        lang: 'http',
        code: `HTTP/1.1 200 OK
x-ratelimit-limit-requests: 5000
x-ratelimit-remaining-requests: 4998
x-ratelimit-reset-requests: 8.6s`,
      },
    ],
  },
}
