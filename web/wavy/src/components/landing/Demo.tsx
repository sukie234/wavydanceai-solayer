import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'

type Tab = 'chat' | 'image' | 'video'

export function Demo() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('chat')

  return (
    <section className="relative overflow-hidden px-[6vw] py-24">
      {/* Ambient glows that the water-glass code panel refracts — slightly brighter so they read through the lighter glass */}
      <div
        className="pointer-events-none absolute right-[6%] top-1/2 z-0 h-[460px] w-[460px] -translate-y-1/2 rounded-full opacity-70 blur-[120px]"
        style={{ background: 'radial-gradient(circle, #0d6b53 0%, transparent 65%)' }}
      />
      <div
        className="pointer-events-none absolute right-[28%] top-[18%] z-0 h-[280px] w-[280px] rounded-full opacity-60 blur-[100px]"
        style={{ background: 'radial-gradient(circle, #084D3E 0%, transparent 60%)' }}
      />
      <div
        className="pointer-events-none absolute right-0 bottom-[8%] z-0 h-[220px] w-[220px] rounded-full opacity-45 blur-[80px]"
        style={{ background: 'radial-gradient(circle, #a4e58f 0%, transparent 60%)' }}
      />

      <div className="relative z-10 mx-auto grid max-w-[1180px] items-center gap-14 md:grid-cols-2">
        <div>
          <div className="kicker mb-3.5">{t('demo.kicker')}</div>
          <h2 className="font-display text-[clamp(1.8rem,3.6vw,2.6rem)] font-bold leading-tight tracking-[-1px]">
            {t('demo.title1')}
            <br />
            {t('demo.title2')}
          </h2>
          <p className="mt-3.5 max-w-xl text-[color:var(--muted)] leading-[1.6]">{t('demo.lead')}</p>
        </div>

        {/* Water-glass code panel — alpha switched per theme via --glass-bg so
            light mode stays readable while dark mode keeps the see-through depth */}
        <div
          className="relative overflow-hidden rounded-2xl border"
          style={{
            background: 'var(--glass-bg)',
            borderColor: 'var(--glass-border)',
            backdropFilter: 'blur(42px) saturate(200%)',
            WebkitBackdropFilter: 'blur(42px) saturate(200%)',
            boxShadow: 'var(--glass-shadow)',
          }}
        >
          {/* top-edge light refraction */}
          <span
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, var(--glass-edge), transparent)` }}
          />
          {/* diagonal glass sheen */}
          <span
            className="pointer-events-none absolute -inset-px"
            style={{
              background:
                'linear-gradient(125deg, rgba(255,255,255,0.10) 0%, transparent 28%, transparent 72%, rgba(78,212,220,0.08) 100%)',
            }}
          />

          <div className="relative flex items-center gap-2 border-b border-white/10 px-[18px] py-3.5">
            <i className="block h-[11px] w-[11px] rounded-full bg-[#F49BAB] shadow-[0_0_8px_rgba(244,155,171,0.5)]" />
            <i className="block h-[11px] w-[11px] rounded-full bg-[#F5C26B] shadow-[0_0_8px_rgba(245,194,107,0.5)]" />
            <i className="block h-[11px] w-[11px] rounded-full bg-[#0d6b53] shadow-[0_0_8px_rgba(78,212,220,0.5)]" />
            <div className="ml-auto flex gap-1.5">
              {(['chat', 'image', 'video'] as Tab[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    'rounded-full border border-white/10 bg-white/[.03] px-3.5 py-1 font-mono text-xs tracking-[1px] text-[#9FBFCA] backdrop-blur-sm transition hover:text-[#EAFBFE]',
                    tab === id &&
                      'border-transparent bg-gradient-to-r from-[#084D3E] to-[#0d6b53] font-bold text-[#0c0d0e] hover:text-[#0c0d0e]',
                  )}
                >
                  {t(`demo.tab.${id}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="relative overflow-x-auto p-[22px] font-mono text-[0.84rem] leading-[1.75] text-[#EAFBFE]">
            {tab === 'chat' && <ChatCode />}
            {tab === 'image' && <ImageCode />}
            {tab === 'video' && <VideoCode />}
          </div>
        </div>
      </div>
    </section>
  )
}

const K = ({ children }: { children: React.ReactNode }) => <span className="text-[#a4e58f]">{children}</span>
const S = ({ children }: { children: React.ReactNode }) => <span className="text-[color:var(--primary)]">{children}</span>
const C = ({ children }: { children: React.ReactNode }) => <span className="text-[#7FA9B5]">{children}</span>
const F = ({ children }: { children: React.ReactNode }) => <span className="text-[#F49BAB]">{children}</span>

function ChatCode() {
  return (
    <pre className="m-0 whitespace-pre-wrap">
      <K>from</K> openai <K>import</K> OpenAI{'\n\n'}
      client = <F>OpenAI</F>({'\n'}    base_url=<S>"https://api.solayer.org/v1"</S>,{'\n'}    api_key=
      <S>"wd-••••••••••••"</S>,{'\n'}
      ){'\n\n'}
      resp = client.chat.completions.<F>create</F>({'\n'}    model=<S>"claude-opus-4-6"</S>,  <C># or gpt-5.2, deepseek-v4…</C>
      {'\n'}    messages=[{'{'}<S>"role"</S>: <S>"user"</S>,{'\n'}               <S>"content"</S>: <S>"Hello, wave!"</S>{'}'}],{'\n'}
      )  <C># ← OpenAI-compatible: change one line</C>
    </pre>
  )
}

function ImageCode() {
  return (
    <pre className="m-0 whitespace-pre-wrap">
      <C># unified async task API — same shape for every vendor</C>
      {'\n'}
      <F>POST</F> /v1/tasks{'\n'}
      {'{'}
      {'\n'}  <S>"model"</S>: <S>"flux-1.1-pro"</S>,   <C># or gpt-image-2, sd-3.5…</C>
      {'\n'}  <S>"task"</S>: <S>"image.generate"</S>,{'\n'}  <S>"input"</S>: {'{'} <S>"prompt"</S>:{' '}
      <S>"a jelly sea at noon"</S>,{'\n'}             <S>"size"</S>: <S>"1024x1024"</S>, <S>"n"</S>: 2 {'}'},{'\n'}  <S>"webhook"</S>:{' '}
      <S>"https://your.app/hooks/wavy"</S>
      {'\n'}
      {'}'}
      {'\n'}
      <C>→</C> {'{'} <S>"task_id"</S>: <S>"t_8f3k"</S>, <S>"status"</S>: <S>"queued"</S> {'}'}
    </pre>
  )
}

function VideoCode() {
  return (
    <pre className="m-0 whitespace-pre-wrap">
      <C># video = same task API, different input schema</C>
      {'\n'}
      <F>POST</F> /v1/tasks{'\n'}
      {'{'}
      {'\n'}  <S>"model"</S>: <S>"veo-3.1"</S>,        <C># or sora-2, kling-2.5…</C>
      {'\n'}  <S>"task"</S>: <S>"video.generate"</S>,{'\n'}  <S>"input"</S>: {'{'} <S>"prompt"</S>:{' '}
      <S>"waves rolling in jelly sea"</S>,{'\n'}             <S>"duration"</S>: 8, <S>"ratio"</S>: <S>"16:9"</S> {'}'},{'\n'}  <S>"webhook"</S>:{' '}
      <S>"https://your.app/hooks/wavy"</S>
      {'\n'}
      {'}'}
      {'\n'}
      <F>GET</F> /v1/tasks/t_8f3k   <C># …or poll until "succeeded"</C>
    </pre>
  )
}
