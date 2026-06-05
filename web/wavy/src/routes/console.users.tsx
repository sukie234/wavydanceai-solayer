import { useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, ShieldCheck, ShieldOff, Power, PowerOff, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/console/PageHeader'
import { DataTable, Pager, StatusPill, type Column } from '@/components/console/DataTable'
import { ROLE_LABEL, usersService, type UserAction } from '@/lib/services/users'
import { getSession, isAdmin } from '@/lib/session'
import { Role, type User } from '@/lib/types'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'

export const Route = createFileRoute('/console/users')({
  beforeLoad: async () => {
    const user = await getSession()
    if (!isAdmin(user)) throw redirect({ to: '/console' })
    return { me: user! }
  },
  component: UsersPage,
})

const PAGE_SIZE = 10

function UsersPage() {
  const { t } = useTranslation()
  const { me } = Route.useRouteContext()
  const qc = useQueryClient()
  const [p, setP] = useState(0)
  const [showCreate, setShowCreate] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['users', p],
    queryFn: () => usersService.list(p),
  })

  const manage = useMutation({
    mutationFn: ({ username, action }: { username: string; action: UserAction }) =>
      usersService.manage(username, action),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'manage failed'),
  })

  const remove = useMutation({
    mutationFn: (id: number) => usersService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'delete failed'),
  })

  const cols: Column<User>[] = [
    { key: 'id', header: 'ID', width: '64px', mono: true, cell: (u) => u.id },
    {
      key: 'username',
      header: t('users.col.username'),
      width: '1.4fr',
      cell: (u) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{u.username}</div>
          {u.display_name && (
            <div className="truncate text-xs text-[color:var(--muted)]">{u.display_name}</div>
          )}
        </div>
      ),
    },
    {
      key: 'role',
      header: t('users.col.role'),
      width: '110px',
      cell: (u) => <RoleBadge role={u.role} />,
    },
    {
      key: 'status',
      header: t('users.col.status'),
      width: '110px',
      cell: (u) => <StatusPill active={u.status === 1} label={u.status === 1 ? 'active' : 'disabled'} />,
    },
    {
      key: 'group',
      header: t('users.col.group'),
      width: '110px',
      mono: true,
      cell: (u) => <span className="text-[color:var(--muted)]">{u.group || '—'}</span>,
    },
    {
      key: 'quota',
      header: t('users.col.quota'),
      width: '160px',
      mono: true,
      align: 'right',
      cell: (u) => (
        // `quota` from the Go model is the remaining balance (decremented on use);
        // `used_quota` is the cumulative spend. Don't subtract.
        <div className="text-right">
          <div className="tabular-nums">{formatQuota(u.quota)}</div>
          <div className="text-xs text-[color:var(--muted)]">
            {formatQuota(u.used_quota)} used
          </div>
        </div>
      ),
    },
    {
      key: 'requests',
      header: t('users.col.requests'),
      width: '90px',
      mono: true,
      align: 'right',
      cell: (u) => <span className="tabular-nums">{u.request_count.toLocaleString()}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: '180px',
      align: 'right',
      cell: (u) => <RowActions me={me} user={u} onManage={manage.mutate} onRemove={remove.mutate} />,
    },
  ]

  const rows = data ?? []
  const hasMore = rows.length >= PAGE_SIZE

  return (
    <div className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-8 lg:px-10">
      <PageHeader
        kicker={t('users.kicker')}
        title={t('users.title')}
        lead={t('users.lead')}
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t('users.newUser')}
          </Button>
        }
      />

      {err && (
        <div className="mb-4 rounded-lg border border-[color:var(--coral)]/30 bg-[color:var(--coral)]/8 px-3 py-2 text-sm text-[color:var(--coral)]">
          {err}
        </div>
      )}

      <DataTable
        columns={cols}
        rows={rows}
        rowKey={(u) => u.id}
        loading={isLoading}
        emptyHint={t('users.empty')}
        minRows={PAGE_SIZE}
      />
      <Pager p={p} onP={setP} hasMore={hasMore} />

      {showCreate && (
        <CreateUserDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            qc.invalidateQueries({ queryKey: ['users'] })
          }}
        />
      )}
    </div>
  )
}

function RoleBadge({ role }: { role: number }) {
  const label = ROLE_LABEL[role] ?? `r${role}`
  const isRoot = role >= Role.RootUser
  const isAdmin = role >= Role.AdminUser
  // Mutually exclusive branches so Tailwind's "last wins" can't paint admin styles over root.
  const tone =
    isRoot
      ? 'bg-[color:var(--coral)]/12 text-[color:var(--coral)]'
      : isAdmin
        ? 'bg-[color:var(--primary)]/15 text-[color:var(--primary)]'
        : 'bg-[color:var(--border)]/40 text-[color:var(--muted)]'
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-xs uppercase tracking-[1px]', tone)}>
      {isAdmin && <ShieldCheck className="h-3 w-3" strokeWidth={2.5} />}
      {label}
    </span>
  )
}

function RowActions({
  me,
  user,
  onManage,
  onRemove,
}: {
  me: User
  user: User
  onManage: (args: { username: string; action: UserAction }) => void
  onRemove: (id: number) => void
}) {
  const isMe = me.id === user.id
  const meRole = me.role
  const canManage = !isMe && meRole > user.role // can only act on lower-ranked users

  const promote = () => onManage({ username: user.username, action: 'promote' })
  const demote = () => onManage({ username: user.username, action: 'demote' })
  const enable = () => onManage({ username: user.username, action: 'enable' })
  const disable = () => onManage({ username: user.username, action: 'disable' })
  const del = () => {
    if (confirm(`Delete user "${user.username}"? This cannot be undone.`)) onRemove(user.id)
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {canManage && user.role < Role.AdminUser && meRole >= Role.AdminUser && (
        <IconBtn label="Promote to admin" onClick={promote}>
          <ArrowUp className="h-3.5 w-3.5" />
        </IconBtn>
      )}
      {canManage && user.role >= Role.AdminUser && meRole >= Role.RootUser && (
        <IconBtn label="Demote to user" onClick={demote}>
          <ArrowDown className="h-3.5 w-3.5" />
        </IconBtn>
      )}
      {canManage && user.status === 1 && (
        <IconBtn label="Disable" tone="warn" onClick={disable}>
          <PowerOff className="h-3.5 w-3.5" />
        </IconBtn>
      )}
      {canManage && user.status !== 1 && (
        <IconBtn label="Enable" onClick={enable}>
          <Power className="h-3.5 w-3.5" />
        </IconBtn>
      )}
      {canManage && (
        <IconBtn label="Delete" tone="coral" onClick={del}>
          <Trash2 className="h-3.5 w-3.5" />
        </IconBtn>
      )}
      {!canManage && (
        <span className="font-mono text-xs text-[color:var(--muted)]/60">
          {isMe ? '— you —' : <ShieldOff className="inline h-3.5 w-3.5" />}
        </span>
      )}
    </div>
  )
}

function IconBtn({
  label,
  tone = 'default',
  onClick,
  children,
}: {
  label: string
  tone?: 'default' | 'warn' | 'coral'
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md border border-[color:var(--border)] text-[color:var(--muted)] transition',
        tone === 'default' && 'hover:border-[color:var(--primary)] hover:text-[color:var(--primary)]',
        tone === 'warn' && 'hover:border-[#F5C26B]/70 hover:text-[#F5C26B]',
        tone === 'coral' && 'hover:border-[color:var(--coral)]/70 hover:text-[color:var(--coral)]',
      )}
    >
      {children}
    </button>
  )
}

function CreateUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setSubmitting(true)
    try {
      await usersService.create({ username, password, display_name: displayName })
      onCreated()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'create failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-7 shadow-[var(--shadow-jelly)]"
      >
        <div className="kicker mb-1.5">{t('users.kicker')}</div>
        <h2 className="mb-6 font-display text-xl font-bold tracking-[-0.5px]">{t('users.newUser')}</h2>

        <DialogField label={t('users.col.username')} value={username} onChange={setUsername} autoFocus />
        <DialogField label="Password" type="password" value={password} onChange={setPassword} />
        <DialogField label="Display name" value={displayName} onChange={setDisplayName} optional />

        {err && (
          <div className="mb-4 rounded-lg border border-[color:var(--coral)]/30 bg-[color:var(--coral)]/8 px-3 py-2 text-sm text-[color:var(--coral)]">
            {err}
          </div>
        )}

        <div className="mt-2 flex justify-end gap-2.5">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={submitting || !username || !password}>
            {submitting ? '…' : t('users.newUser')}
          </Button>
        </div>
      </form>
    </div>
  )
}

function DialogField({
  label,
  value,
  onChange,
  type = 'text',
  optional,
  autoFocus,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  optional?: boolean
  autoFocus?: boolean
}) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 flex items-center gap-1.5 font-mono text-xs uppercase tracking-[2px] text-[color:var(--muted)]">
        {label}
        {optional && <span className="text-[color:var(--muted)]/50">(optional)</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-3 py-2 text-sm transition focus:border-[color:var(--primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/20"
      />
    </label>
  )
}

function formatQuota(n: number): string {
  if (n < 0) return '0'
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toString()
}
