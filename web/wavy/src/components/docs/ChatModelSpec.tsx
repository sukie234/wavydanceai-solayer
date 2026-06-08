import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ChevronRight, ExternalLink, Sparkles, Zap, Network, Layers } from 'lucide-react'
import type { DocItem } from '@/lib/docs-catalog'
import { categoryLabel } from '@/lib/docs-catalog'
import { CodeBlock } from './CodeBlock'
import { cn } from '@/lib/cn'

type CodeLang = 'curl' | 'python' | 'node' | 'java'

export function ChatModelSpec({ model }: { model: DocItem }) {
  const { t } = useTranslation()
  const [lang, setLang] = useState<CodeLang>('curl')

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1500px] flex-1 items-start gap-6 px-6 py-10 lg:px-10 2xl:max-w-[1600px]">
      <article className="min-w-0 flex-1 max-w-[820px] 2xl:max-w-[920px]">
        <Breadcrumb model={model} />

        <header id="overview" className="mt-4 scroll-mt-24">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[clamp(2rem,3.5vw,2.75rem)] font-bold tracking-[-0.5px]">
              <span className="font-mono text-[0.85em] text-current-ink">{model.name}</span>
              <span className="text-[color:var(--muted)]"> (response)</span>
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--cyan)]/30 bg-[color:var(--cyan)]/10 px-3 py-1 font-mono text-[0.72rem] uppercase tracking-[1.5px] text-[color:var(--cyan)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--live)]" />
              {t('docs.spec.badge')}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[0.82rem] text-[color:var(--muted)]">
            <Method method="POST" />
            <code className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-0.5 text-[color:var(--text)]">
              https://api.solayer.org/v1/chat/completions
            </code>
          </div>
          <p className="mt-5 max-w-prose text-[0.98rem] leading-[1.7] text-[color:var(--muted)]">
            {t('docs.spec.intro', { model: model.name, family: model.family ?? 'Provider' })}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/console/playground"
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-current-grad px-4 py-2 text-[0.9rem] font-semibold text-[color:var(--cta-ink)] transition hover:-translate-y-px hover:brightness-110"
            >
              {t('docs.spec.tryInPlayground')}
              <ChevronRight className="h-4 w-4" />
            </Link>
            <a
              href="https://github.com/solayer-labs"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-[color:var(--border)] px-4 py-2 text-[0.9rem] font-semibold text-[color:var(--text)] transition hover:border-[color:var(--cyan)]"
            >
              {t('docs.spec.openapiSpec')}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </header>

        <section id="features" className="mt-14 scroll-mt-24">
          <div className="grid gap-4 sm:grid-cols-2">
            <FeatureCard
              icon={<Layers className="h-4 w-4" />}
              title={t('docs.spec.features.multimodal.t')}
              body={t('docs.spec.features.multimodal.d')}
            />
            <FeatureCard
              icon={<Sparkles className="h-4 w-4" />}
              title={t('docs.spec.features.reasoning.t')}
              body={t('docs.spec.features.reasoning.d')}
            />
            <FeatureCard
              icon={<Network className="h-4 w-4" />}
              title={t('docs.spec.features.tools.t')}
              body={t('docs.spec.features.tools.d')}
            />
            <FeatureCard
              icon={<Zap className="h-4 w-4" />}
              title={t('docs.spec.features.unified.t')}
              body={t('docs.spec.features.unified.d')}
            />
          </div>
        </section>

        <section id="tools" className="mt-14 scroll-mt-24">
          <SectionHeading n="01" title={t('docs.spec.tools.title')} sub={t('docs.spec.tools.sub')} />
          <p className="mb-6 max-w-prose text-[0.94rem] leading-[1.7] text-[color:var(--muted)]">
            {t('docs.spec.tools.lead')}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <ToolCard
              tag={t('docs.spec.tools.webSearch.tag')}
              title={t('docs.spec.tools.webSearch.title')}
              body={t('docs.spec.tools.webSearch.body')}
              snippet={`"tools": [{ "type": "web_search" }],\n"tool_choice": "auto"`}
            />
            <ToolCard
              tag={t('docs.spec.tools.fn.tag')}
              title={t('docs.spec.tools.fn.title')}
              body={t('docs.spec.tools.fn.body')}
              snippet={`"tools": [{\n  "type": "function",\n  "function": { "name": "get_weather", ... }\n}]`}
            />
          </div>
        </section>

        <section id="parameters" className="mt-14 scroll-mt-24">
          <SectionHeading n="02" title={t('docs.spec.params.title')} sub={t('docs.spec.params.sub')} />
          <ParamTable model={model.name} />
        </section>

        <footer className="mt-16 flex flex-col gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-[var(--shadow-jelly)]">
          <div className="kicker !mb-1">{t('docs.spec.next.kicker')}</div>
          <div className="font-display text-[1.25rem] font-semibold">{t('docs.spec.next.title')}</div>
          <p className="text-[0.92rem] leading-[1.6] text-[color:var(--muted)]">
            {t('docs.spec.next.body')}
          </p>
          <div className="mt-1 flex flex-wrap gap-3">
            <Link
              to="/docs/$slug"
              params={{ slug: 'quickstart' }}
              className="inline-flex items-center gap-1.5 text-[0.92rem] font-semibold text-[color:var(--cyan)] hover:underline"
            >
              {t('docs.spec.next.quickstart')} <ChevronRight className="h-4 w-4" />
            </Link>
            <Link
              to="/docs/$slug"
              params={{ slug: 'authentication' }}
              className="inline-flex items-center gap-1.5 text-[0.92rem] font-semibold text-[color:var(--cyan)] hover:underline"
            >
              {t('docs.spec.next.auth')} <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </footer>
      </article>

      <aside className="sticky top-[88px] hidden h-[calc(100vh-96px)] w-[460px] flex-none overflow-y-auto lg:block xl:w-[520px] 2xl:w-[600px]">
        <div className="flex flex-col gap-6">
          <section id="examples" className="scroll-mt-24">
            <SectionHeading n="03" title={t('docs.spec.examples.title')} sub={t('docs.spec.examples.sub')} />
            <div className="mb-3 flex flex-wrap gap-1.5">
              {(['curl', 'python', 'node', 'java'] as CodeLang[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLang(id)}
                  className={cn(
                    'rounded-full border border-[color:var(--border)] px-3.5 py-1 font-mono text-xs uppercase tracking-[1px] text-[color:var(--muted)] transition hover:border-[color:var(--cyan)] hover:text-[color:var(--text)]',
                    lang === id &&
                      'border-transparent bg-current-grad text-[color:var(--cta-ink)] shadow-[0_8px_24px_rgba(63,179,217,0.25)]',
                  )}
                >
                  {id}
                </button>
              ))}
            </div>
            <CodeBlock lang={lang} code={EXAMPLES[lang](model.name)} />
          </section>

          <section id="responses" className="scroll-mt-24">
            <SectionHeading n="04" title={t('docs.spec.responses.title')} sub={t('docs.spec.responses.sub')} />
            <div className="mb-4 grid gap-2 sm:grid-cols-2">
              <StatusRow code="200" label={t('docs.spec.status.200')} variant="ok" />
              <StatusRow code="400" label={t('docs.spec.status.400')} variant="warn" />
              <StatusRow code="401" label={t('docs.spec.status.401')} variant="warn" />
              <StatusRow code="429" label={t('docs.spec.status.429')} variant="warn" />
              <StatusRow code="500" label={t('docs.spec.status.500')} variant="err" />
            </div>
            <CodeBlock lang="json" code={RESPONSE_SAMPLE(model.name)} />
          </section>
        </div>
      </aside>
    </div>
  )
}

function Breadcrumb({ model }: { model: DocItem }) {
  return (
    <nav className="flex items-center gap-1.5 font-mono text-[0.78rem] text-[color:var(--muted)]">
      <Link to="/docs" className="hover:text-[color:var(--text)]">
        docs
      </Link>
      <ChevronRight className="h-3 w-3" />
      <span className="hover:text-[color:var(--text)]">{categoryLabel(model.category).toLowerCase()}</span>
      <ChevronRight className="h-3 w-3" />
      <span className="text-[color:var(--text)]">{model.name}</span>
    </nav>
  )
}

function Method({ method }: { method: 'POST' | 'GET' }) {
  return (
    <span
      className={cn(
        'rounded-md px-2 py-0.5 font-mono text-[0.7rem] font-bold uppercase tracking-[1px]',
        method === 'POST' ? 'bg-[color:var(--live)]/15 text-[color:var(--live)]' : 'bg-[color:var(--cyan)]/15 text-[color:var(--cyan)]',
      )}
    >
      {method}
    </span>
  )
}

function SectionHeading({ n, title, sub }: { n: string; title: string; sub?: string }) {
  return (
    <div className="mb-6">
      <div className="mb-1.5 font-mono text-[0.72rem] uppercase tracking-[2.5px] text-[color:var(--cyan)]">
        {n} · {sub}
      </div>
      <h2 className="font-display text-[1.55rem] font-bold tracking-[-0.5px]">{title}</h2>
    </div>
  )
}

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 transition hover:-translate-y-px hover:border-[color:var(--cyan)] hover:shadow-[var(--shadow-jelly)]">
      <div className="mb-2.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--cyan)]/10 text-[color:var(--cyan)]">
        {icon}
      </div>
      <div className="mb-1 font-display text-[1rem] font-semibold">{title}</div>
      <p className="text-[0.85rem] leading-[1.55] text-[color:var(--muted)]">{body}</p>
    </div>
  )
}

function ToolCard({ tag, title, body, snippet }: { tag: string; title: string; body: string; snippet: string }) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
      <div className="mb-2 inline-flex rounded-full border border-[color:var(--border)] px-2.5 py-0.5 font-mono text-[0.68rem] uppercase tracking-[1.5px] text-[color:var(--muted)]">
        {tag}
      </div>
      <div className="mb-1 font-display text-[1.05rem] font-semibold">{title}</div>
      <p className="mb-3 text-[0.86rem] leading-[1.55] text-[color:var(--muted)]">{body}</p>
      <pre className="overflow-x-auto rounded-lg bg-[color:var(--bg2)] p-3 font-mono text-[0.78rem] leading-[1.6] text-[color:var(--text)]">
        <code>{snippet}</code>
      </pre>
    </div>
  )
}

function StatusRow({ code, label, variant }: { code: string; label: string; variant: 'ok' | 'warn' | 'err' }) {
  const color =
    variant === 'ok' ? 'var(--live)' : variant === 'warn' ? 'var(--coral)' : 'var(--coral)'
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2.5">
      <span
        className="font-mono text-[0.85rem] font-bold"
        style={{ color }}
      >
        {code}
      </span>
      <span className="truncate text-[0.85rem] text-[color:var(--muted)]">{label}</span>
    </div>
  )
}

function ParamTable({ model }: { model: string }) {
  const rows: Array<[string, string, string, string]> = [
    ['model', 'string', 'required', `Model id, e.g. "${model}".`],
    ['messages', 'array', 'required', 'Conversation as { role, content[] }. role: system | user | assistant | tool.'],
    ['stream', 'boolean', 'optional', 'If true, server streams the response as Server-Sent Events.'],
    ['temperature', 'number', 'optional', 'Sampling temperature, 0–2. Default 1.'],
    ['top_p', 'number', 'optional', 'Nucleus sampling probability, 0–1. Default 1.'],
    ['max_tokens', 'integer', 'optional', 'Hard cap on response tokens.'],
    ['reasoning_effort', 'string', 'optional', 'one of: low | medium | high | xhigh. Routes to the model\'s reasoning ladder.'],
    ['tools', 'array', 'optional', 'List of tools the model may call. Mutually exclusive with web_search.'],
    ['tool_choice', 'string | object', 'optional', '"auto" | "none" | { type: "function", function: { name } }.'],
    ['response_format', 'object', 'optional', '{ type: "json_object" } forces strict JSON output.'],
  ]
  return (
    <div className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)]">
      <table className="w-full border-collapse text-left text-[0.86rem]">
        <thead>
          <tr className="border-b border-[color:var(--border)] bg-[color:var(--bg2)]/60 font-mono text-[0.72rem] uppercase tracking-[1.5px] text-[color:var(--muted)]">
            <th className="px-4 py-2.5 font-medium">field</th>
            <th className="px-4 py-2.5 font-medium">type</th>
            <th className="px-4 py-2.5 font-medium">required</th>
            <th className="px-4 py-2.5 font-medium">description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([field, type, req, desc]) => (
            <tr key={field} className="border-t border-[color:var(--border)] align-top">
              <td className="whitespace-nowrap px-4 py-3 font-mono text-[0.84rem] font-semibold text-[color:var(--text)]">{field}</td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-[0.8rem] text-[color:var(--cyan)]">{type}</td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-[0.78rem] uppercase tracking-[1px] text-[color:var(--muted)]">{req}</td>
              <td className="px-4 py-3 text-[color:var(--muted)]">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const EXAMPLES: Record<CodeLang, (model: string) => string> = {
  curl: (m) => `curl https://api.solayer.org/v1/chat/completions \\
  -H "Authorization: Bearer $WAVY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${m}",
    "stream": true,
    "messages": [
      { "role": "user", "content": "Hello, wave!" }
    ],
    "reasoning_effort": "medium"
  }'`,
  python: (m) => `from openai import OpenAI

client = OpenAI(
    base_url="https://api.solayer.org/v1",
    api_key="wd-••••••••••••",
)

resp = client.chat.completions.create(
    model="${m}",
    messages=[{"role": "user", "content": "Hello, wave!"}],
    stream=True,
    extra_body={"reasoning_effort": "medium"},
)
for chunk in resp:
    print(chunk.choices[0].delta.content or "", end="")`,
  node: (m) => `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.solayer.org/v1",
  apiKey: process.env.WAVY_API_KEY,
});

const stream = await client.chat.completions.create({
  model: "${m}",
  messages: [{ role: "user", content: "Hello, wave!" }],
  stream: true,
  // @ts-expect-error — solayer extension
  reasoning_effort: "medium",
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0].delta?.content ?? "");
}`,
  java: (m) => `import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse.BodyHandlers;

var body = """
    {
      "model": "${m}",
      "stream": true,
      "messages": [{"role": "user", "content": "Hello, wave!"}],
      "reasoning_effort": "medium"
    }
    """;

var client = HttpClient.newHttpClient();
var req = HttpRequest.newBuilder()
    .uri(URI.create("https://api.solayer.org/v1/chat/completions"))
    .header("Authorization", "Bearer " + System.getenv("WAVY_API_KEY"))
    .header("Content-Type", "application/json")
    .POST(BodyPublishers.ofString(body))
    .build();

client.send(req, BodyHandlers.ofLines())
    .body()
    .forEach(System.out::println);`,
}

const RESPONSE_SAMPLE = (m: string) => `{
  "id": "chatcmpl-wd-8f3k",
  "object": "chat.completion",
  "created": 1730000000,
  "model": "${m}",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello back — wave received."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 9,
    "completion_tokens": 7,
    "total_tokens": 16
  }
}`
