import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { statusService } from '@/lib/services/status'
import { startOAuthFlow, type OAuthProvider } from '@/lib/services/oauth'
import { cn } from '@/lib/cn'

/**
 * Renders one button per enabled OAuth provider plus a divider when followed
 * by an email form. Drop into both /login and /register — same component,
 * same providers, copy varies by `mode`.
 */
export function OAuthButtons({ mode }: { mode: 'login' | 'register' }) {
  const { t } = useTranslation()
  const { data: status } = useQuery({
    queryKey: ['public-status'],
    queryFn: () => statusService.get(),
    staleTime: 60_000,
  })
  const [pending, setPending] = useState<OAuthProvider | null>(null)
  const [err, setErr] = useState<string | null>(null)

  if (!status) return null

  const providers: { id: OAuthProvider; label: string; icon: React.ReactNode }[] = []
  if (status.google_oauth && status.google_client_id) {
    providers.push({ id: 'google', label: t(`${mode}.oauth.google`), icon: <GoogleIcon /> })
  }
  if (status.github_oauth && status.github_client_id) {
    providers.push({ id: 'github', label: t(`${mode}.oauth.github`), icon: <GitHubIcon /> })
  }

  if (providers.length === 0) return null

  async function start(p: OAuthProvider) {
    setErr(null)
    setPending(p)
    try {
      await startOAuthFlow(p)
      // No code after this — browser navigates away.
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'oauth init failed')
      setPending(null)
    }
  }

  return (
    <div className="mb-5 flex flex-col gap-2.5">
      {providers.map((p) => (
        <button
          key={p.id}
          type="button"
          disabled={pending !== null}
          onClick={() => start(p.id)}
          className={cn(
            'flex h-11 items-center justify-center gap-2.5 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] text-sm font-medium transition',
            pending === p.id
              ? 'opacity-60'
              : 'hover:border-[color:var(--cyan)] hover:bg-[color:var(--cyan)]/8',
          )}
        >
          {pending === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : p.icon}
          <span>{p.label}</span>
        </button>
      ))}

      {err && (
        <div className="rounded-lg border border-[color:var(--coral)]/30 bg-[color:var(--coral)]/8 px-3 py-2 text-xs text-[color:var(--coral)]">
          {err}
        </div>
      )}

      <div className="my-1 flex items-center gap-3">
        <span className="h-px flex-1 bg-[color:var(--border)]" />
        <span className="font-mono text-[10px] uppercase tracking-[2px] text-[color:var(--muted)]">
          {t('common.or')}
        </span>
        <span className="h-px flex-1 bg-[color:var(--border)]" />
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8a12 12 0 0 1 0-24c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 1 0 24 44c11 0 20-9 20-20 0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5 0 9.5-1.9 13-5l-6-5a12 12 0 0 1-18.6-5.5l-6.5 5A20 20 0 0 0 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.3 5.6l6 5c-.4.4 6.4-4.7 6.4-14.6 0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.44 9.8 8.21 11.39.6.11.82-.26.82-.57v-2c-3.34.72-4.04-1.61-4.04-1.61-.55-1.4-1.34-1.77-1.34-1.77-1.09-.74.08-.73.08-.73 1.21.09 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.66-.3-5.46-1.33-5.46-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.17 0 0 1.01-.32 3.3 1.23.96-.27 2-.4 3.04-.4 1.04 0 2.08.14 3.04.4 2.29-1.55 3.3-1.23 3.3-1.23.65 1.65.24 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}
