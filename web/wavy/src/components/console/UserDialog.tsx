import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogActions, DialogError, Field, Select } from './Dialog'
import { usersService, adminPasskeyService } from '@/lib/services/users'
import { groupsService } from '@/lib/services/groups'
import { useConfirm } from '@/components/ui/AppDialogs'
import { ApiError } from '@/lib/api'
import { Role, type User } from '@/lib/types'
import { checkPassword, PASSWORD_MAX } from '@/lib/password'

type Props = {
  open: boolean
  userId: number | null
  me: User
  onClose: () => void
  onSaved: () => void
}

type FormState = {
  username: string
  display_name: string
  email: string
  group: string
  quota: string
  role: number
  password: string
}

const empty = (): FormState => ({
  username: '',
  display_name: '',
  email: '',
  group: 'default',
  quota: '0',
  role: Role.CommonUser,
  password: '',
})

/**
 * Admin-only "Edit User" modal. Bound to a userId; loads the user when opened,
 * filters role options against the editor's own role (only root can grant
 * admin or higher).
 */
export function UserDialog({ open, userId, me, onClose, onSaved }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const confirmDialog = useConfirm()
  const [form, setForm] = useState<FormState>(empty)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const { data: groups } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsService.list(),
    staleTime: 5 * 60_000,
    enabled: open,
  })
  const { data: target, isLoading } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => usersService.get(userId!),
    enabled: open && userId !== null,
  })

  useEffect(() => {
    if (!open) return
    setErr(null)
    if (target) {
      setForm({
        username: target.username,
        display_name: target.display_name ?? '',
        email: target.email ?? '',
        group: target.group || 'default',
        quota: String(target.quota ?? 0),
        role: target.role,
        password: '',
      })
    } else {
      setForm(empty())
    }
  }, [open, target])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  // Backend enforces role gating, but mirror it in the UI so the user doesn't
  // pick an option that's certain to be rejected.
  const isRoot = me.role >= Role.RootUser
  const roleOptions = [
    { value: Role.CommonUser, label: t('userDialog.role.user') },
    ...(isRoot
      ? [
          { value: Role.AdminUser, label: t('userDialog.role.admin') },
          // Root cannot be granted via UI — there should only ever be one.
        ]
      : []),
  ]

  const trimmedPassword = form.password.trim()
  const pwIssue = trimmedPassword.length > 0 ? checkPassword(trimmedPassword) : null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!target) return
    if (pwIssue) {
      setErr(t(`register.password_${pwIssue}`))
      return
    }
    setSubmitting(true)
    try {
      const payload: Partial<User> & { id: number; password?: string } = {
        id: target.id,
        username: form.username.trim(),
        display_name: form.display_name.trim(),
        email: form.email.trim(),
        group: form.group.trim() || 'default',
        quota: Number(form.quota) || 0,
        role: form.role,
      }
      if (trimmedPassword) payload.password = trimmedPassword
      await usersService.update(payload)
      onSaved()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'save failed')
    } finally {
      setSubmitting(false)
    }
  }

  const groupOptions = (groups ?? ['default']).map((g) => ({ value: g, label: g }))

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={target ? `${t('userDialog.title')} · ${target.username}` : t('userDialog.title')}
      kicker={t('userDialog.kicker')}
      width="max-w-xl"
    >
      <form onSubmit={submit}>
        {isLoading || !target ? (
          <div className="py-10 text-center text-sm text-[color:var(--muted)]">Loading…</div>
        ) : (
          <>
            <div className="grid gap-x-4 md:grid-cols-2">
              <Field
                label={t('userDialog.field.username')}
                value={form.username}
                onChange={(v) => set('username', v)}
                disabled
                hint={t('userDialog.field.usernameHint')}
              />
              <Field
                label={t('userDialog.field.displayName')}
                value={form.display_name}
                onChange={(v) => set('display_name', v)}
                optional
              />
            </div>

            <Field
              label={t('userDialog.field.email')}
              type="email"
              value={form.email}
              onChange={(v) => set('email', v)}
              optional
            />

            <div className="grid gap-x-4 md:grid-cols-2">
              <Select
                label={t('userDialog.field.group')}
                value={form.group}
                onChange={(v) => set('group', v)}
                options={groupOptions}
              />
              <Field
                label={t('userDialog.field.quota')}
                type="number"
                value={form.quota}
                onChange={(v) => set('quota', v)}
                hint={t('userDialog.field.quotaHint')}
              />
            </div>

            <Select
              label={t('userDialog.field.role')}
              value={form.role}
              onChange={(v) => set('role', Number(v))}
              options={roleOptions}
              hint={!isRoot ? t('userDialog.field.roleHint') : undefined}
            />

            <Field
              label={t('userDialog.field.password')}
              type="password"
              value={form.password}
              onChange={(v) => set('password', v)}
              optional
              maxLength={PASSWORD_MAX}
              hint={pwIssue ? t(`register.password_${pwIssue}`) : t('userDialog.field.passwordHint')}
            />
          </>
        )}

        <DialogError message={err} />

        <DialogActions>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={submitting || isLoading || !target || pwIssue !== null}>
            {submitting ? '…' : t('common.save')}
          </Button>
        </DialogActions>
      </form>

      {target && (
        <div className="mt-5 border-t border-[color:var(--border)] pt-5">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-[2px] text-[color:var(--muted)]">
              Passkeys
            </span>
            {target.passkeys && target.passkeys.length > 0 && (
              <button
                type="button"
                className="font-mono text-xs text-[color:var(--coral)] transition hover:opacity-70"
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: 'Clear all passkeys',
                    message: `Remove all ${target.passkeys!.length} passkeys for ${target.username}? They will need to re-register on every device.`,
                    tone: 'danger',
                    confirmText: 'Clear all',
                  })
                  if (ok) {
                    await adminPasskeyService.clear(target.id)
                    qc.invalidateQueries({ queryKey: ['user', userId] })
                  }
                }}
              >
                Clear all
              </button>
            )}
          </div>
          {target.passkeys && target.passkeys.length > 0 ? (
            <ul className="space-y-1.5">
              {target.passkeys.map((k) => (
                <li
                  key={k.id}
                  className="flex items-center justify-between rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-3 py-2"
                >
                  <span className="truncate text-sm">{k.name || 'Unnamed Passkey'}</span>
                  <button
                    type="button"
                    aria-label="Delete passkey"
                    title="Delete passkey"
                    className="ml-2 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-[color:var(--muted)] transition hover:text-[color:var(--coral)]"
                    onClick={async () => {
                      const ok = await confirmDialog({
                        title: 'Delete passkey',
                        message: `Delete "${k.name || 'Unnamed Passkey'}"?`,
                        tone: 'danger',
                      })
                      if (ok) {
                        await adminPasskeyService.deleteOne(target.id, k.id)
                        qc.invalidateQueries({ queryKey: ['user', userId] })
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[color:var(--muted)]">No passkeys registered.</p>
          )}
        </div>
      )}
    </Dialog>
  )
}
