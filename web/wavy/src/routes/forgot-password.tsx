import { useEffect, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Loader2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { authService } from '@/lib/services/auth'
import { ApiError } from '@/lib/api'
import { AuthShell } from '@/components/auth/AuthShell'

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = window.setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [cooldown])

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const canSubmit = emailValid && !loading && cooldown === 0

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!canSubmit) return
    setLoading(true)
    try {
      await authService.sendPasswordResetEmail(email)
      setSent(true)
      setCooldown(60)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t('forgot.failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell kickerKey="forgot.kicker" titleKey="forgot.title">
        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8 shadow-[var(--shadow-jelly)]"
        >
          {sent ? (
            <div className="text-center">
              <Mail className="mx-auto mb-3 h-10 w-10 text-[color:var(--cyan)]" />
              <h2 className="font-display text-lg font-semibold">{t('forgot.sentTitle')}</h2>
              <p className="mt-2 text-sm text-[color:var(--muted)]">
                {t('forgot.sentBody', { email })}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onSubmit}
                disabled={!canSubmit}
                className="mt-5"
              >
                {cooldown > 0 ? t('forgot.resendIn', { seconds: cooldown }) : t('forgot.resend')}
              </Button>
            </div>
          ) : (
            <>
              <p className="mb-5 text-sm text-[color:var(--muted)]">{t('forgot.lead')}</p>

              <label className="mb-4 block">
                <span className="mb-1.5 block font-mono text-xs uppercase tracking-[2px] text-[color:var(--muted)]">
                  {t('forgot.email')}
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                  className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-3 py-2.5 text-sm text-[color:var(--text)] placeholder:text-[color:var(--muted)]/70 transition focus:border-[color:var(--cyan)] focus:outline-none focus:ring-2 focus:ring-[color:var(--cyan)]/20"
                />
              </label>

              {err && (
                <div className="mt-4 rounded-lg border border-[color:var(--coral)]/30 bg-[color:var(--coral)]/8 px-3 py-2 text-sm text-[color:var(--coral)]">
                  {err}
                </div>
              )}

              <Button type="submit" className="mt-2 w-full" disabled={!canSubmit}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('forgot.send')}
              </Button>
            </>
          )}

          <p className="mt-5 text-center text-xs text-[color:var(--muted)]">
            {t('forgot.backToLogin')}{' '}
            <Link to="/login" className="text-[color:var(--cyan)] hover:underline">
              {t('forgot.signIn')}
            </Link>
          </p>
        </form>
    </AuthShell>
  )
}
