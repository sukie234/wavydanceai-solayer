import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/console/PageHeader'
import { asBool, optionsService, optionsToMap } from '@/lib/services/options'
import { getSession } from '@/lib/session'
import { Role } from '@/lib/types'
import { cn } from '@/lib/cn'

export const Route = createFileRoute('/console/settings')({
  beforeLoad: async () => {
    const user = await getSession()
    if (!user || user.role < Role.RootUser) throw redirect({ to: '/console' })
  },
  component: SettingsPage,
})

type Field =
  | { key: string; kind: 'bool'; label: string; hint?: string }
  | { key: string; kind: 'text'; label: string; hint?: string; placeholder?: string }
  | { key: string; kind: 'number'; label: string; hint?: string }

type Section = {
  id: string
  title: string
  desc?: string
  fields: Field[]
}

const SECTIONS: Section[] = [
  {
    id: 'auth',
    title: 'Login & registration',
    desc: 'Control how users sign in to solayer.org.',
    fields: [
      { key: 'PasswordLoginEnabled', kind: 'bool', label: 'Password login' },
      { key: 'PasswordRegisterEnabled', kind: 'bool', label: 'Password registration' },
      { key: 'RegisterEnabled', kind: 'bool', label: 'Open registration', hint: 'Allow new users to sign up.' },
      { key: 'EmailVerificationEnabled', kind: 'bool', label: 'Email verification' },
      { key: 'GitHubOAuthEnabled', kind: 'bool', label: 'GitHub OAuth' },
      { key: 'WeChatAuthEnabled', kind: 'bool', label: 'WeChat OAuth' },
      { key: 'OidcEnabled', kind: 'bool', label: 'OIDC SSO' },
      { key: 'TurnstileCheckEnabled', kind: 'bool', label: 'Turnstile (Cloudflare bot check)' },
    ],
  },
  {
    id: 'channels',
    title: 'Channels & routing',
    desc: 'How channels behave on failure and how usage is tracked.',
    fields: [
      { key: 'AutomaticDisableChannelEnabled', kind: 'bool', label: 'Auto-disable failing channels' },
      { key: 'AutomaticEnableChannelEnabled', kind: 'bool', label: 'Auto-enable recovered channels' },
      { key: 'ChannelDisableThreshold', kind: 'number', label: 'Disable threshold (sec)', hint: 'Channels slower than this for too long get disabled.' },
      { key: 'ApproximateTokenEnabled', kind: 'bool', label: 'Approximate token count', hint: 'Use a fast heuristic instead of running the tokenizer.' },
      { key: 'LogConsumeEnabled', kind: 'bool', label: 'Log consumption events' },
    ],
  },
  {
    id: 'display',
    title: 'Display',
    desc: 'How quota and tokens are shown to users.',
    fields: [
      { key: 'DisplayInCurrencyEnabled', kind: 'bool', label: 'Show quota as currency ($)' },
      { key: 'DisplayTokenStatEnabled', kind: 'bool', label: 'Show token statistics in token list' },
    ],
  },
  {
    id: 'email',
    title: 'Email domain restriction',
    desc: 'Restrict registration to specific email domains.',
    fields: [
      { key: 'EmailDomainRestrictionEnabled', kind: 'bool', label: 'Enable domain whitelist' },
      { key: 'EmailDomainWhitelist', kind: 'text', label: 'Whitelist (comma-separated)', placeholder: 'gmail.com,company.com' },
    ],
  },
  {
    id: 'smtp',
    title: 'SMTP',
    desc: 'Outgoing mail for verification and password reset.',
    fields: [
      { key: 'SMTPServer', kind: 'text', label: 'Server' },
      { key: 'SMTPPort', kind: 'number', label: 'Port' },
      { key: 'SMTPFrom', kind: 'text', label: 'From address', placeholder: 'no-reply@solayer.org' },
      { key: 'SMTPAccount', kind: 'text', label: 'Account' },
      // Token/Secret fields are intentionally NOT returned by the backend's GetOptions.
      // We render them as write-only inputs that update without showing the current value.
    ],
  },
]

function SettingsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['options'],
    queryFn: () => optionsService.list(),
  })
  const map = useMemo(() => optionsToMap(data ?? []), [data])

  const update = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => optionsService.update(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['options'] }),
  })

  return (
    <div className="mx-auto w-full max-w-[1100px] flex-1 px-6 py-8 lg:px-10">
      <PageHeader kicker={t('settings.kicker')} title={t('settings.title')} lead={t('settings.lead')} />

      {isLoading && (
        <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-5 py-16 text-center text-sm text-[color:var(--muted)]">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
          Loading options…
        </div>
      )}

      {!isLoading && (
        <div className="space-y-7">
          {SECTIONS.map((sec) => (
            <SectionCard key={sec.id} section={sec} map={map} onSave={update.mutate} saving={update.isPending} />
          ))}
        </div>
      )}
    </div>
  )
}

function SectionCard({
  section,
  map,
  onSave,
  saving,
}: {
  section: Section
  map: Record<string, string>
  onSave: (args: { key: string; value: string }) => void
  saving: boolean
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-jelly)]">
      <header className="border-b border-[color:var(--border)] bg-[color:var(--bg2)]/50 px-6 py-4">
        <h2 className="font-display text-base font-bold tracking-[-0.3px]">{section.title}</h2>
        {section.desc && <p className="mt-0.5 text-xs text-[color:var(--muted)]">{section.desc}</p>}
      </header>
      <div className="divide-y divide-[color:var(--border)]/60">
        {section.fields.map((f) => (
          <FieldRow key={f.key} field={f} value={map[f.key] ?? ''} onSave={onSave} saving={saving} />
        ))}
      </div>
    </section>
  )
}

function FieldRow({
  field,
  value,
  onSave,
  saving,
}: {
  field: Field
  value: string
  onSave: (args: { key: string; value: string }) => void
  saving: boolean
}) {
  const [draft, setDraft] = useState(value)
  const [savedFlash, setSavedFlash] = useState(false)

  // Sync draft once when the server value arrives after an initial empty render.
  // Using useEffect instead of a render-body setState avoids clobbering user edits
  // (e.g. a deliberate "clear field" action) and silences a StrictMode warning.
  const initialSyncDone = useState(false)
  const [synced, setSynced] = initialSyncDone
  useEffect(() => {
    if (!synced && field.kind !== 'bool' && draft === '' && value !== '') {
      setDraft(value)
      setSynced(true)
    }
  }, [synced, field.kind, draft, value])

  if (field.kind === 'bool') {
    const on = asBool(value)
    return (
      <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-6 py-4">
        <div className="min-w-0">
          <div className="text-sm font-medium">{field.label}</div>
          {field.hint && <div className="mt-0.5 text-xs text-[color:var(--muted)]">{field.hint}</div>}
          <div className="mt-1 font-mono text-[11px] uppercase tracking-[1.5px] text-[color:var(--muted)]/60">
            {field.key}
          </div>
        </div>
        <Toggle
          checked={on}
          disabled={saving}
          onChange={(next) => {
            onSave({ key: field.key, value: next ? 'true' : 'false' })
            setSavedFlash(true)
            setTimeout(() => setSavedFlash(false), 1200)
          }}
        />
        {savedFlash && (
          <span className="absolute right-20 mt-1 text-xs text-[color:var(--live)]">
            <Check className="inline h-3 w-3" />
          </span>
        )}
      </div>
    )
  }

  const dirty = draft !== value
  return (
    <div className="grid grid-cols-[260px_1fr_auto] items-center gap-4 px-6 py-4">
      <div className="min-w-0">
        <div className="text-sm font-medium">{field.label}</div>
        {field.hint && <div className="mt-0.5 text-xs text-[color:var(--muted)]">{field.hint}</div>}
        <div className="mt-1 font-mono text-[11px] uppercase tracking-[1.5px] text-[color:var(--muted)]/60">
          {field.key}
        </div>
      </div>
      <input
        type={field.kind === 'number' ? 'number' : 'text'}
        value={draft}
        placeholder={field.kind === 'text' ? field.placeholder : ''}
        onChange={(e) => setDraft(e.target.value)}
        className={cn(
          'w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-3 py-2 font-mono text-sm transition focus:border-[color:var(--primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/20',
          dirty && 'border-[color:var(--primary)]/60',
        )}
      />
      <Button
        type="button"
        size="sm"
        variant={dirty ? 'primary' : 'ghost'}
        disabled={!dirty || saving}
        onClick={() => {
          onSave({ key: field.key, value: draft })
          setSavedFlash(true)
          setTimeout(() => setSavedFlash(false), 1200)
        }}
      >
        {savedFlash ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
        {savedFlash ? 'Saved' : 'Save'}
      </Button>
    </div>
  )
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  // Geometry: 44px track with 1px border = 42px inner. 20px knob slides between
  // left-0.5 (2px gap left) and translate-x-[20px] (2px gap right). Symmetric.
  // inline-flex + items-center handles vertical centering automatically.
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50',
        checked
          ? 'border-transparent bg-gradient-to-r from-[#084D3E] to-[#0d6b53]'
          : 'border-[color:var(--border)] bg-[color:var(--bg2)]',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ease-out',
          checked ? 'translate-x-[20px]' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}
