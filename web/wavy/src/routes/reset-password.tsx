import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { authService } from '@/lib/services/auth'
import { ApiError } from '@/lib/api'
import { BrandMark } from '@/components/BrandMark'

/**
 * Landing page for the reset link emailed by /api/reset_password. The link
 * carries ?email=...&token=...; we POST those to /api/user/reset, which
 * generates a fresh 12-character random password and returns it for the user
 * to copy. The user is expected to sign in with the new password and then
 * change it via profile.
 */
export const Route = createFileRoute('/reset-password')({
  validateSearch: (search: Record<string, unknown>) => ({
    email: typeof search.email === 'string' ? search.email : '',
    token: typeof search.token === 'string' ? search.token : '',
  }),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const { t } = useTranslation()
  const { email, token } = Route.useSearch()

  const [submitting, setSubmitting] = useState(false)
  const [newPassword, setNewPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onConfirm() {
    setErr(null)
    setSubmitting(true)
    try {
      const { password } = await authService.resetPassword(email, token)
      setNewPassword(password)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t('reset.failed'))
    } finally {
      setSubmitting(false)
    }
  }

  async function copyPassword() {
    if (!newPassword || !navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(newPassword)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard blocked — silent
    }
  }

  const linkInvalid = !email || !token

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-[color:var(--bg)] to-[color:var(--bg2)] px-6">
      <div className="relative z-10 w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2.5">
            <BrandMark size={32} />
            <span className="font-display text-xl font-bold tracking-[-0.5px]">
              wavydance<span className="text-current-ink">.ai</span>
            </span>
          </div>
          <div className="kicker">{t('reset.kicker')}</div>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-[-1px]">{t('reset.title')}</h1>
        </div>

        <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8 shadow-[var(--shadow-jelly)]">
          {linkInvalid ? (
            <div className="text-center">
              <XCircle className="mx-auto mb-3 h-10 w-10 text-[color:var(--coral)]" />
              <h2 className="font-display text-lg font-semibold">{t('reset.invalidTitle')}</h2>
              <p className="mt-2 text-sm text-[color:var(--muted)]">{t('reset.invalidBody')}</p>
              <Link to="/forgot-password" className="mt-5 inline-block">
                <Button size="sm">{t('reset.requestAgain')}</Button>
              </Link>
            </div>
          ) : newPassword ? (
            <div className="text-center">
              <Check className="mx-auto mb-3 h-10 w-10 text-[color:var(--live)]" />
              <h2 className="font-display text-lg font-semibold">{t('reset.successTitle')}</h2>
              <p className="mt-2 text-sm text-[color:var(--muted)]">
                {t('reset.successBody', { email })}
              </p>
              <div className="mt-5 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-4 py-3 text-left">
                <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[2px] text-[color:var(--muted)]">
                  {t('reset.newPasswordLabel')}
                </span>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate font-mono text-sm text-[color:var(--text)]">
                    {newPassword}
                  </code>
                  <button
                    type="button"
                    onClick={copyPassword}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-[color:var(--muted)] hover:text-[color:var(--cyan)]"
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? t('reset.copied') : t('reset.copy')}
                  </button>
                </div>
              </div>
              <p className="mt-3 text-xs text-[color:var(--muted)]">{t('reset.changeReminder')}</p>
              <Link to="/login" className="mt-5 inline-block">
                <Button size="sm">{t('reset.goSignIn')}</Button>
              </Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-[color:var(--muted)]">
                {t('reset.confirmLead', { email })}
              </p>
              {err && (
                <div className="mt-4 rounded-lg border border-[color:var(--coral)]/30 bg-[color:var(--coral)]/8 px-3 py-2 text-sm text-[color:var(--coral)]">
                  {err}
                </div>
              )}
              <Button type="button" onClick={onConfirm} disabled={submitting} className="mt-5 w-full">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('reset.confirm')}
              </Button>
            </>
          )}

          <p className="mt-5 text-center text-xs text-[color:var(--muted)]">
            <Link to="/login" className="text-[color:var(--cyan)] hover:underline">
              {t('reset.backToLogin')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
