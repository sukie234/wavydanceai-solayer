import { useState } from 'react'
import { createFileRoute, redirect, useNavigate, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { authService } from '@/lib/services/auth'
import { clearSessionCache, getSession } from '@/lib/session'
import { ApiError } from '@/lib/api'

export const Route = createFileRoute('/register')({
  beforeLoad: async () => {
    // Already signed in? Send the user to the console instead.
    const user = await getSession()
    if (user) throw redirect({ to: '/console' })
  },
  component: RegisterPage,
})

function RegisterPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const mismatch = confirm.length > 0 && password !== confirm
  const tooShort = password.length > 0 && password.length < 8
  const canSubmit = username.length >= 3 && password.length >= 8 && !mismatch && !loading

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (mismatch || tooShort) return
    setLoading(true)
    try {
      await authService.register({ username, password })
      // Backend creates the account but doesn't log us in. Hop through the
      // login endpoint so the session cookie lands without forcing the user
      // to retype credentials.
      await authService.login(username, password)
      clearSessionCache()
      navigate({ to: '/console' })
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t('register.failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-[color:var(--bg)] to-[color:var(--bg2)] px-6">
      <div
        className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full opacity-60 blur-[120px]"
        style={{ background: 'radial-gradient(circle, #4ED4DC, transparent 65%)', opacity: 'var(--glow-op)' }}
      />
      <div
        className="pointer-events-none absolute -right-32 bottom-0 h-[460px] w-[460px] rounded-full opacity-50 blur-[120px]"
        style={{ background: 'radial-gradient(circle, #3FB3D9, transparent 65%)', opacity: 'var(--glow-op)' }}
      />

      <div className="relative z-10 w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2.5">
            <Logo />
            <span className="font-display text-xl font-bold tracking-[-0.5px]">
              wavydance<span className="text-current-ink">.ai</span>
            </span>
          </div>
          <div className="kicker">{t('register.kicker')}</div>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-[-1px]">{t('register.title')}</h1>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8 shadow-[var(--shadow-jelly)]"
        >
          <Field
            label={t('register.username')}
            value={username}
            onChange={setUsername}
            autoComplete="username"
            autoFocus
          />
          <Field
            label={t('register.password')}
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            hint={tooShort ? t('register.passwordShort') : t('register.passwordHint')}
            tone={tooShort ? 'warn' : 'muted'}
          />
          <Field
            label={t('register.confirmPassword')}
            type="password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            hint={mismatch ? t('register.confirmMismatch') : undefined}
            tone={mismatch ? 'warn' : 'muted'}
          />

          {err && (
            <div className="mt-4 rounded-lg border border-[color:var(--coral)]/30 bg-[color:var(--coral)]/8 px-3 py-2 text-sm text-[color:var(--coral)]">
              {err}
            </div>
          )}

          <Button type="submit" className="mt-6 w-full" disabled={!canSubmit}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('register.createAccount')}
          </Button>

          <p className="mt-5 text-center text-xs text-[color:var(--muted)]">
            {t('register.haveAccount')}{' '}
            <Link to="/login" className="text-[color:var(--cyan)] hover:underline">
              {t('register.signIn')}
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  autoFocus,
  hint,
  tone = 'muted',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  autoComplete?: string
  autoFocus?: boolean
  hint?: string
  tone?: 'muted' | 'warn'
}) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block font-mono text-xs uppercase tracking-[2px] text-[color:var(--muted)]">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-3 py-2.5 text-sm text-[color:var(--text)] placeholder:text-[color:var(--muted)]/70 transition focus:border-[color:var(--cyan)] focus:outline-none focus:ring-2 focus:ring-[color:var(--cyan)]/20"
      />
      {hint && (
        <span
          className={
            tone === 'warn'
              ? 'mt-1 block text-xs text-[color:var(--coral)]'
              : 'mt-1 block text-xs text-[color:var(--muted)]/80'
          }
        >
          {hint}
        </span>
      )}
    </label>
  )
}

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <defs>
        <linearGradient id="register-mark" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3FB3D9" />
          <stop offset="60%" stopColor="#4ED4DC" />
          <stop offset="100%" stopColor="#B5ECF2" />
        </linearGradient>
      </defs>
      <path d="M2 14 Q5 8 8 14 T14 14 T20 14" stroke="url(#register-mark)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <circle cx="20" cy="14" r="2.4" fill="url(#register-mark)" />
    </svg>
  )
}
