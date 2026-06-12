import { useState } from 'react'
import { createFileRoute, Link, redirect, useNavigate, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { authService, isTwoFAChallenge } from '@/lib/services/auth'
import { twofaService } from '@/lib/services/twofa'
import { clearSessionCache, getSession } from '@/lib/session'
import { ApiError } from '@/lib/api'
import { OAuthButtons } from '@/components/auth/OAuthButtons'
import { statusService } from '@/lib/services/status'
import { passkeyService } from '@/lib/services/passkey'
import { isWebAuthnSupported } from '@/components/passkey/passkey-ceremonies'
import { AuthShell } from '@/components/auth/AuthShell'

type LoginSearch = { next?: string }

/**
 * Validate that `next` is a single-leading-slash internal path. Rejects
 * protocol-relative (`//evil.com`), absolute URLs (`https://...`), and
 * `javascript:` URIs to prevent open-redirect / phishing attacks.
 */
function safeNext(raw: unknown): string {
  if (typeof raw !== 'string') return '/console'
  // Must start with a single "/" — not "//" and not "/\".
  if (!/^\/(?![/\\])/.test(raw)) return '/console'
  return raw
}

export const Route = createFileRoute('/login')({
  validateSearch: (s: Record<string, unknown>): LoginSearch => ({
    next: safeNext(s.next),
  }),
  beforeLoad: async ({ search }) => {
    const user = await getSession()
    if (user) throw redirect({ to: safeNext(search.next) as '/console' })
  },
  component: LoginPage,
})

function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { next } = useSearch({ from: '/login' })
  const { data: status } = useQuery({
    queryKey: ['public-status'],
    queryFn: () => statusService.get(),
    staleTime: 60_000,
  })
  const passkeyLoginEnabled = status?.passkey_login === true
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Set once the backend told us the account has 2FA. Null = no 2FA pending.
  // When set, `.methods` lists the available second factors.
  const [twoFAPending, setTwoFAPending] = useState<null | { methods: Array<'totp' | 'passkey'> }>(null)
  const [code, setCode] = useState('')

  function afterLogin() {
    clearSessionCache()
    // `next` already validated by validateSearch above.
    navigate({ to: safeNext(next) as '/console' })
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setLoading(true)
    try {
      if (twoFAPending) {
        await twofaService.verifyLogin(code.trim())
      } else {
        const r = await authService.login(username, password)
        if (isTwoFAChallenge(r)) {
          const methods = r.methods && r.methods.length > 0 ? r.methods : (['totp'] as const)
          if (methods.length === 1 && methods[0] === 'passkey' && isWebAuthnSupported()) {
            await passkeyService.loginSecondFactor()
            afterLogin()
            return
          }
          setTwoFAPending({ methods: [...methods] as Array<'totp' | 'passkey'> })
          setLoading(false)
          return
        }
      }
      afterLogin()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t('login.failed'))
    } finally {
      setLoading(false)
    }
  }

  // Method chooser: user has both passkey and TOTP available as second factors.
  const showChooser = twoFAPending !== null && twoFAPending.methods.length > 1
  // Show TOTP input: only TOTP is the active method.
  const showTotp =
    twoFAPending !== null &&
    !showChooser &&
    twoFAPending.methods.includes('totp')
  // Show passkey-only prompt: only passkey is the active method.
  const showPasskeyOnly =
    twoFAPending !== null &&
    !showChooser &&
    twoFAPending.methods.length === 1 &&
    twoFAPending.methods[0] === 'passkey'

  return (
    <AuthShell kickerKey="login.kicker" titleKey="login.title">
        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8 shadow-[var(--shadow-jelly)]"
        >
          {!twoFAPending && <OAuthButtons mode="login" />}

          {showChooser ? (
            <div className="flex flex-col gap-3">
              <p className="mb-1 text-xs text-[color:var(--muted)]">{t('login.chooseFactor')}</p>
              <Button
                type="button"
                className="w-full"
                onClick={async () => {
                  setErr(null)
                  setLoading(true)
                  try {
                    await passkeyService.loginSecondFactor()
                    afterLogin()
                  } catch (e) {
                    setErr(e instanceof ApiError ? e.message : t('login.failed'))
                  } finally {
                    setLoading(false)
                  }
                }}
                disabled={loading}
              >
                {t('login.usePasskey')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setTwoFAPending({ methods: ['totp'] })}
                disabled={loading}
              >
                {t('login.useTotp')}
              </Button>
            </div>
          ) : showPasskeyOnly ? (
            <div className="flex flex-col gap-3">
              <Button
                type="button"
                className="w-full"
                onClick={async () => {
                  setErr(null)
                  setLoading(true)
                  try {
                    await passkeyService.loginSecondFactor()
                    afterLogin()
                  } catch (e) {
                    setErr(e instanceof ApiError ? e.message : t('login.failed'))
                  } finally {
                    setLoading(false)
                  }
                }}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('login.usePasskey')}
              </Button>
            </div>
          ) : showTotp ? (
            <>
              <p className="mb-4 text-xs text-[color:var(--muted)]">{t('login.twoFAHint')}</p>
              <Field
                label={t('login.twoFACode')}
                value={code}
                onChange={setCode}
                autoComplete="one-time-code"
                autoFocus
              />
            </>
          ) : (
            <>
              <Field
                label={t('login.username')}
                value={username}
                onChange={setUsername}
                autoComplete="username"
                autoFocus
              />
              <Field
                label={t('login.password')}
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
              />
              <div className="-mt-2 mb-2 text-right">
                <Link
                  to="/forgot-password"
                  className="text-xs text-[color:var(--cyan)] hover:underline"
                >
                  {t('login.forgotPassword')}
                </Link>
              </div>
            </>
          )}

          {err && (
            <div className="mt-4 rounded-lg border border-[color:var(--coral)]/30 bg-[color:var(--coral)]/8 px-3 py-2 text-sm text-[color:var(--coral)]">
              {err}
            </div>
          )}

          {/* Submit button — hidden when the chooser is shown (chooser has its own buttons) */}
          {!showChooser && (
            <Button
              type="submit"
              className="mt-6 w-full"
              disabled={
                loading ||
                (showTotp ? code.trim().length < 6 : showPasskeyOnly ? false : !username || !password)
              }
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {showTotp || showPasskeyOnly ? t('login.verifyCode') : t('login.signIn')}
            </Button>
          )}

          {/* Passwordless passkey button — only when the deployment has passkey
              login enabled and the browser supports WebAuthn */}
          {passkeyLoginEnabled && isWebAuthnSupported() && !twoFAPending && (
            <button
              type="button"
              className="mt-3 w-full text-center text-sm text-[color:var(--cyan)] hover:underline"
              onClick={async () => {
                if (!username.trim()) {
                  setErr(t('login.usernameRequired'))
                  return
                }
                setErr(null)
                setLoading(true)
                try {
                  await passkeyService.loginPasswordless(username.trim())
                  afterLogin()
                } catch (e) {
                  setErr(e instanceof ApiError ? e.message : t('login.failed'))
                } finally {
                  setLoading(false)
                }
              }}
            >
              {t('login.signInWithPasskey')}
            </button>
          )}

          <p className="mt-5 text-center text-xs text-[color:var(--muted)]">
            {t('login.noAccount')}{' '}
            <Link to="/register" className="text-[color:var(--cyan)] hover:underline">
              {t('login.signUp')}
            </Link>
          </p>
          <p className="mt-2 text-center text-xs text-[color:var(--muted)]">
            {t('login.helper')}{' '}
            <a className="text-[color:var(--cyan)] hover:underline" href="/">
              {t('login.backHome')}
            </a>
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
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  autoComplete?: string
  autoFocus?: boolean
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
    </label>
  )
}

