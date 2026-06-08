import { useEffect, useState } from 'react'
import { createFileRoute, redirect, useNavigate, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { authService } from '@/lib/services/auth'
import { clearSessionCache, getSession } from '@/lib/session'
import { ApiError } from '@/lib/api'
import { OAuthButtons } from '@/components/auth/OAuthButtons'
import { checkPassword, PASSWORD_MAX } from '@/lib/password'
import { AuthShell } from '@/components/auth/AuthShell'
import { statusService } from '@/lib/services/status'

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

  const [email, setEmail] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  // Email verification gate is admin-toggled at runtime, so fetch on mount.
  // statusService is cached so this is one round-trip per session.
  const [emailRequired, setEmailRequired] = useState(false)
  useEffect(() => {
    statusService.get().then((s) => setEmailRequired(!!s.email_verification)).catch(() => {})
  }, [])

  // Cooldown for the "Send code" button so users can't spam SMTP.
  const [sendingCode, setSendingCode] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  useEffect(() => {
    if (cooldown <= 0) return
    const t = window.setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [cooldown])

  const emailValid = email === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const mismatch = confirm.length > 0 && password !== confirm
  // Always evaluate against the actual password so an empty field can't slip
  // past `pwIssue === null`. Show the hint only after the user has started
  // typing, though, so the field doesn't shout at them on first render.
  const pwIssue = checkPassword(password)
  const pwIssueForHint = password.length > 0 ? pwIssue : null
  const codeOk = !emailRequired || verificationCode.trim().length > 0
  const emailOk = !emailRequired || (email !== '' && emailValid)
  const canSubmit =
    username.length >= 3 &&
    pwIssue === null &&
    emailValid &&
    !mismatch &&
    emailOk &&
    codeOk &&
    !loading

  async function onSendCode() {
    setErr(null)
    setInfo(null)
    if (!email || !emailValid) {
      setErr(t('register.emailInvalid'))
      return
    }
    setSendingCode(true)
    try {
      await authService.sendVerificationCode(email)
      setInfo(t('register.codeSent', { email }))
      setCooldown(60)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t('register.codeSendFailed'))
    } finally {
      setSendingCode(false)
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setInfo(null)
    if (mismatch || pwIssue !== null || !emailValid) return
    setLoading(true)
    try {
      await authService.register({
        username,
        password,
        ...(email ? { email } : {}),
        ...(emailRequired ? { verification_code: verificationCode.trim() } : {}),
      })
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
    <AuthShell kickerKey="register.kicker" titleKey="register.title">
        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8 shadow-[var(--shadow-jelly)]"
        >
          <OAuthButtons mode="register" />

          <Field
            label={t('register.email') + (emailRequired ? ' *' : '')}
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            autoFocus
            hint={!emailValid ? t('register.emailInvalid') : t('register.emailHint')}
            tone={!emailValid ? 'warn' : 'muted'}
          />

          {emailRequired && (
            <label className="mb-4 block">
              <span className="mb-1.5 block font-mono text-xs uppercase tracking-[2px] text-[color:var(--muted)]">
                {t('register.verificationCode')} *
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  className="w-full flex-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-3 py-2.5 font-mono text-sm tracking-wider text-[color:var(--text)] placeholder:text-[color:var(--muted)]/70 transition focus:border-[color:var(--cyan)] focus:outline-none focus:ring-2 focus:ring-[color:var(--cyan)]/20"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onSendCode}
                  disabled={!email || !emailValid || sendingCode || cooldown > 0}
                  className="shrink-0"
                >
                  {sendingCode ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {cooldown > 0
                    ? t('register.resendIn', { seconds: cooldown })
                    : t('register.sendCode')}
                </Button>
              </div>
              <span className="mt-1 block text-xs text-[color:var(--muted)]/80">
                {t('register.verificationCodeHint')}
              </span>
            </label>
          )}

          <Field
            label={t('register.username')}
            value={username}
            onChange={setUsername}
            autoComplete="username"
          />
          <Field
            label={t('register.password')}
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            hint={pwIssueForHint ? t(`register.password_${pwIssueForHint}`) : t('register.passwordHint')}
            tone={pwIssueForHint ? 'warn' : 'muted'}
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

          {info && (
            <div className="mt-4 rounded-lg border border-[color:var(--cyan)]/30 bg-[color:var(--cyan)]/8 px-3 py-2 text-sm text-[color:var(--cyan)]">
              {info}
            </div>
          )}
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
    </AuthShell>
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
  maxLength,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  autoComplete?: string
  autoFocus?: boolean
  hint?: string
  tone?: 'muted' | 'warn'
  maxLength?: number
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
        maxLength={maxLength}
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

