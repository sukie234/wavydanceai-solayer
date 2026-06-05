import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, Check, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/console/PageHeader'
import { Field, DialogError } from '@/components/console/Dialog'
import { authService } from '@/lib/services/auth'
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
