import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Dialog, DialogActions, DialogError, Field, Select } from './Dialog'
import { usersService } from '@/lib/services/users'
import { groupsService } from '@/lib/services/groups'
import { ApiError } from '@/lib/api'
import { Role, type User } from '@/lib/types'

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

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!target) return
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
      if (form.password.trim()) payload.password = form.password.trim()
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
              hint={t('userDialog.field.passwordHint')}
            />
          </>
        )}

        <DialogError message={err} />

        <DialogActions>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={submitting || isLoading || !target}>
            {submitting ? '…' : t('common.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
