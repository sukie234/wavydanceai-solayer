import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Loader2, XCircle } from 'lucide-react'
import { completeOAuthCallback, type OAuthProvider } from '@/lib/services/oauth'
import { clearSessionCache } from '@/lib/session'
import { Button } from '@/components/ui/button'
import { Link } from '@tanstack/react-router'

const KNOWN: OAuthProvider[] = ['github', 'google']
function isKnown(p: string): p is OAuthProvider {
  return (KNOWN as string[]).includes(p)
}

/**
 * Landing route for `/oauth/:provider` — the URL we hand to providers as the
 * redirect_uri. We read `code` + `state` from the query, hand them to the
 * backend handler, and on success drop the user into the console.
 */
export const Route = createFileRoute('/oauth/$provider')({
  validateSearch: (s: Record<string, unknown>) => ({
    code: typeof s.code === 'string' ? s.code : undefined,
    state: typeof s.state === 'string' ? s.state : undefined,
    error: typeof s.error === 'string' ? s.error : undefined,
  }),
  component: OAuthCallbackPage,
})

function OAuthCallbackPage() {
  const { t } = useTranslation()
  const { provider } = Route.useParams()
  const { code, state, error } = Route.useSearch()
  const navigate = useNavigate()
  const [err, setErr] = useState<string | null>(error ?? null)

  useEffect(() => {
    if (error) return
    if (!isKnown(provider)) {
      setErr(`unknown provider: ${provider}`)
      return
    }
    if (!code || !state) {
      setErr('missing code or state')
      return
    }
    let cancelled = false
    completeOAuthCallback(provider, code, state)
      .then(() => {
        if (cancelled) return
        clearSessionCache()
        navigate({ to: '/console' })
      })
      .catch((e) => {
        if (cancelled) return
        setErr(e?.message ?? 'oauth callback failed')
      })
    return () => {
      cancelled = true
    }
  }, [provider, code, state, error, navigate])

  if (err) {
    return (
      <Frame
        icon={<XCircle className="h-12 w-12 text-[color:var(--coral)]" />}
        title={t('oauth.failedTitle')}
        body={err}
        footer={
          <div className="mt-6 flex justify-center gap-2">
            <Link to="/login">
              <Button size="sm">{t('oauth.backToLogin')}</Button>
            </Link>
          </div>
        }
      />
    )
  }
  return (
    <Frame
      icon={<Loader2 className="h-12 w-12 animate-spin text-[color:var(--cyan)]" />}
      title={t('oauth.workingTitle')}
      body={t('oauth.workingBody', { provider })}
    />
  )
}

function Frame({ icon, title, body, footer }: { icon: React.ReactNode; title: string; body: string; footer?: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[color:var(--bg)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-center shadow-[var(--shadow-jelly)]">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center">{icon}</div>
        <h1 className="font-display text-2xl font-bold tracking-[-0.5px]">{title}</h1>
        <p className="mt-3 text-sm text-[color:var(--muted)]">{body}</p>
        {footer}
      </div>
    </main>
  )
}
