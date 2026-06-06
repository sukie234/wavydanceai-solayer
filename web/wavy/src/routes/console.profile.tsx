import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, Check, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/console/PageHeader'
import { Field, DialogError } from '@/components/console/Dialog'
import { authService } from '@/lib/services/auth'
import { twofaService, type TwoFASetupArtifact } from '@/lib/services/twofa'
import { clearSessionCache } from '@/lib/session'
import { ApiError } from '@/lib/api'

export const Route = createFileRoute('/console/profile')({
  component: ProfilePage,
})

function ProfilePage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data: user, isLoading } = useQuery({
    queryKey: ['self'],
    queryFn: () => authService.getSelf(),
    staleTime: 30_000,
  })

  return (
    <div className="mx-auto w-full max-w-[920px] flex-1 px-6 py-8 lg:px-10">
      <PageHeader kicker={t('profile.kicker')} title={t('profile.title')} lead={t('profile.lead')} />

      {isLoading || !user ? (
        <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-5 py-16 text-center text-sm text-[color:var(--muted)]">
          Loading…
        </div>
      ) : (
        <div className="space-y-6">
          <PersonalInfoCard
            username={user.username}
            initialDisplayName={user.display_name ?? ''}
            email={user.email ?? ''}
            onSaved={() => {
              clearSessionCache()
              qc.invalidateQueries({ queryKey: ['self'] })
            }}
          />
          <ChangePasswordCard username={user.username} />
          <TwoFactorCard />
        </div>
      )}
    </div>
  )
}

function PersonalInfoCard({
  username,
  initialDisplayName,
  email,
  onSaved,
}: {
  username: string
  initialDisplayName: string
  email: string
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [flash, setFlash] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Re-sync the draft if the cached self value updates after mount.
  useEffect(() => setDisplayName(initialDisplayName), [initialDisplayName])

  const m = useMutation({
    mutationFn: (display_name: string) => authService.updateSelf({ username, display_name }),
    onSuccess: () => {
      setFlash(true)
      setTimeout(() => setFlash(false), 1500)
      onSaved()
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'save failed'),
  })

  const dirty = displayName !== initialDisplayName

  return (
    <section className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-jelly)]">
      <header className="border-b border-[color:var(--border)] bg-[color:var(--bg2)]/50 px-6 py-4">
        <h2 className="font-display text-base font-bold tracking-[-0.3px]">{t('profile.personal.title')}</h2>
        <p className="mt-0.5 text-xs text-[color:var(--muted)]">{t('profile.personal.desc')}</p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          setErr(null)
          m.mutate(displayName.trim())
        }}
        className="p-6"
      >
        <div className="grid gap-x-5 md:grid-cols-2">
          <Field label={t('profile.personal.username')} value={username} onChange={() => {}} disabled hint={t('profile.personal.usernameHint')} />
          <Field
            label={t('profile.personal.displayName')}
            value={displayName}
            onChange={setDisplayName}
            optional
          />
        </div>

        {email && (
          <Field
            label={t('profile.personal.email')}
            value={email}
            onChange={() => {}}
            disabled
            hint={t('profile.personal.emailHint')}
          />
        )}

        <DialogError message={err} />

        <div className="mt-2 flex justify-end">
          <Button
            type="submit"
            size="sm"
            variant={dirty ? 'primary' : 'ghost'}
            disabled={!dirty || m.isPending}
          >
            {flash ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {flash ? t('common.saved') : t('common.save')}
          </Button>
        </div>
      </form>
    </section>
  )
}

function ChangePasswordCard({ username }: { username: string }) {
  const { t } = useTranslation()
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [flash, setFlash] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const m = useMutation({
    mutationFn: (password: string) => authService.updateSelf({ username, password }),
    onSuccess: () => {
      setFlash(true)
      setPw('')
      setConfirm('')
      setTimeout(() => setFlash(false), 1500)
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'change failed'),
  })

  const tooShort = pw.length > 0 && pw.length < 8
  const mismatch = pw.length > 0 && confirm.length > 0 && pw !== confirm
  const canSubmit = pw.length >= 8 && pw === confirm

  return (
    <section className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-jelly)]">
      <header className="border-b border-[color:var(--border)] bg-[color:var(--bg2)]/50 px-6 py-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[color:var(--cyan)]" />
          <h2 className="font-display text-base font-bold tracking-[-0.3px]">{t('profile.password.title')}</h2>
        </div>
        <p className="mt-0.5 text-xs text-[color:var(--muted)]">{t('profile.password.desc')}</p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          setErr(null)
          if (!canSubmit) return
          m.mutate(pw)
        }}
        className="p-6"
      >
        <div className="grid gap-x-5 md:grid-cols-2">
          <Field
            label={t('profile.password.new')}
            type="password"
            value={pw}
            onChange={setPw}
            hint={t('profile.password.newHint')}
          />
          <Field
            label={t('profile.password.confirm')}
            type="password"
            value={confirm}
            onChange={setConfirm}
          />
        </div>

        {(tooShort || mismatch) && (
          <div className="mb-4 rounded-lg border border-[color:var(--coral)]/30 bg-[color:var(--coral)]/8 px-3 py-2 text-xs text-[color:var(--coral)]">
            {tooShort && t('profile.password.errTooShort')}
            {!tooShort && mismatch && t('profile.password.errMismatch')}
          </div>
        )}

        <DialogError message={err} />

        <div className="mt-2 flex justify-end">
          <Button type="submit" size="sm" disabled={!canSubmit || m.isPending}>
            {flash ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {flash ? t('common.saved') : t('profile.password.submit')}
          </Button>
        </div>
      </form>
    </section>
  )
}

// ---------- 2FA section ----------

function TwoFactorCard() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data: status, isLoading } = useQuery({
    queryKey: ['2fa-status'],
    queryFn: () => twofaService.status(),
    staleTime: 10_000,
  })
  const [setup, setSetup] = useState<TwoFASetupArtifact | null>(null)
  const [enableCode, setEnableCode] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [showDisable, setShowDisable] = useState(false)
  const [showRegen, setShowRegen] = useState(false)
  const [regenCode, setRegenCode] = useState('')
  const [regenResult, setRegenResult] = useState<string[] | null>(null)

  const startSetup = useMutation({
    mutationFn: () => twofaService.setup(),
    onSuccess: (a) => {
      setSetup(a)
      setErr(null)
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'failed'),
  })

  const enable = useMutation({
    mutationFn: () => twofaService.enable(enableCode.trim()),
    onSuccess: () => {
      setSetup(null)
      setEnableCode('')
      qc.invalidateQueries({ queryKey: ['2fa-status'] })
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'failed'),
  })

  const disable = useMutation({
    mutationFn: () => twofaService.disable(disableCode.trim()),
    onSuccess: () => {
      setShowDisable(false)
      setDisableCode('')
      qc.invalidateQueries({ queryKey: ['2fa-status'] })
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'failed'),
  })

  const regen = useMutation({
    mutationFn: () => twofaService.regenerateBackupCodes(regenCode.trim()),
    onSuccess: (codes) => {
      setRegenResult(codes)
      setRegenCode('')
      qc.invalidateQueries({ queryKey: ['2fa-status'] })
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'failed'),
  })

  if (isLoading || !status) return null

  return (
    <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-7 shadow-[var(--shadow-jelly)]">
      <div className="mb-2 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-[color:var(--cyan)]" />
        <h2 className="font-display text-lg font-bold tracking-[-0.5px]">{t('profile.twofa.title')}</h2>
      </div>
      <p className="mb-5 text-sm text-[color:var(--muted)]">{t('profile.twofa.desc')}</p>

      {/* Idle state ------------------------------------------------------ */}
      {!status.enabled && !setup && (
        <Button size="sm" onClick={() => startSetup.mutate()} disabled={startSetup.isPending}>
          {t('profile.twofa.enable')}
        </Button>
      )}

      {/* Setup state ----------------------------------------------------- */}
      {!status.enabled && setup && (
        <div className="space-y-4">
          <p className="text-xs text-[color:var(--muted)]">{t('profile.twofa.scanHint')}</p>
          <div className="flex items-start gap-5">
            <img
              src={`data:image/png;base64,${setup.qr_png_b64}`}
              alt="2FA QR"
              className="h-40 w-40 rounded-lg border border-[color:var(--border)] bg-white p-2"
            />
            <div className="min-w-0 flex-1 text-xs">
              <div className="mb-1 font-mono uppercase tracking-[1.5px] text-[color:var(--muted)]">
                {t('profile.twofa.secretLabel')}
              </div>
              <code className="block break-all rounded-md border border-[color:var(--border)] bg-[color:var(--bg2)] px-2 py-1.5 font-mono text-[11px]">
                {setup.secret}
              </code>
              <p className="mt-3 font-mono uppercase tracking-[1.5px] text-[color:var(--muted)]">
                {t('profile.twofa.backupLabel')}
              </p>
              <p className="mt-1 text-[color:var(--coral)]">{t('profile.twofa.backupHint')}</p>
              <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-[11px] tabular-nums">
                {setup.backup_codes.map((c) => (
                  <li key={c} className="rounded bg-[color:var(--bg2)] px-2 py-1">{c}</li>
                ))}
              </ul>
            </div>
          </div>
          <Field label={t('profile.twofa.confirmCode')} value={enableCode} onChange={setEnableCode} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => enable.mutate()} disabled={enableCode.trim().length < 6 || enable.isPending}>
              {t('profile.twofa.confirmEnable')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSetup(null)}>
              {t('common.cancel')}
            </Button>
          </div>
          {err && <DialogError message={err} />}
        </div>
      )}

      {/* Enabled state --------------------------------------------------- */}
      {status.enabled && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-[color:var(--live)]/30 bg-[color:var(--live)]/10 px-3 py-2 text-xs text-[color:var(--live)]">
            <Check className="h-3.5 w-3.5" />
            {t('profile.twofa.enabled', { count: status.backup_codes_remaining })}
          </div>
          {!showDisable && !showRegen && (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setShowRegen(true)}>
                {t('profile.twofa.regenerate')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowDisable(true)}>
                {t('profile.twofa.disable')}
              </Button>
            </div>
          )}
          {showDisable && (
            <div className="space-y-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] p-4">
              <p className="text-xs text-[color:var(--muted)]">{t('profile.twofa.disableHint')}</p>
              <Field label={t('profile.twofa.confirmCode')} value={disableCode} onChange={setDisableCode} />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => disable.mutate()} disabled={disableCode.trim().length < 6 || disable.isPending}>
                  {t('profile.twofa.confirmDisable')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowDisable(false); setErr(null) }}>
                  {t('common.cancel')}
                </Button>
              </div>
              {err && <DialogError message={err} />}
            </div>
          )}
          {showRegen && (
            <div className="space-y-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] p-4">
              <p className="text-xs text-[color:var(--muted)]">{t('profile.twofa.regenerateHint')}</p>
              <Field label={t('profile.twofa.confirmCode')} value={regenCode} onChange={setRegenCode} />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => regen.mutate()} disabled={regenCode.trim().length < 6 || regen.isPending}>
                  {t('profile.twofa.regenerate')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowRegen(false); setRegenResult(null); setErr(null) }}>
                  {t('common.cancel')}
                </Button>
              </div>
              {regenResult && (
                <>
                  <p className="text-[color:var(--coral)] text-xs">{t('profile.twofa.backupHint')}</p>
                  <ul className="grid grid-cols-2 gap-1 font-mono text-[11px] tabular-nums">
                    {regenResult.map((c) => (
                      <li key={c} className="rounded bg-[color:var(--bg2)] px-2 py-1">{c}</li>
                    ))}
                  </ul>
                </>
              )}
              {err && <DialogError message={err} />}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
