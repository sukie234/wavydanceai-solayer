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

// Field labels / hints / placeholders are i18n keys (resolved against the
// `settings.*` namespace at render). The literal `key` is the backend option
// name and stays untranslated — it doubles as the mono-font caption below
// the label.
type Field =
  | { key: string; kind: 'bool'; labelKey: string; hintKey?: string }
  | { key: string; kind: 'text'; labelKey: string; hintKey?: string; placeholderKey?: string }
  | { key: string; kind: 'number'; labelKey: string; hintKey?: string }

type Section = {
  id: string
  titleKey: string
  descKey?: string
  fields: Field[]
}

const SECTIONS: Section[] = [
  {
    id: 'auth',
    titleKey: 'settings.sec.auth.title',
    descKey: 'settings.sec.auth.desc',
    fields: [
      { key: 'PasswordLoginEnabled', kind: 'bool', labelKey: 'settings.field.PasswordLoginEnabled' },
      { key: 'PasswordRegisterEnabled', kind: 'bool', labelKey: 'settings.field.PasswordRegisterEnabled' },
      { key: 'RegisterEnabled', kind: 'bool', labelKey: 'settings.field.RegisterEnabled', hintKey: 'settings.field.RegisterEnabled_hint' },
      { key: 'EmailVerificationEnabled', kind: 'bool', labelKey: 'settings.field.EmailVerificationEnabled' },
      { key: 'GitHubOAuthEnabled', kind: 'bool', labelKey: 'settings.field.GitHubOAuthEnabled' },
      { key: 'WeChatAuthEnabled', kind: 'bool', labelKey: 'settings.field.WeChatAuthEnabled' },
      { key: 'OidcEnabled', kind: 'bool', labelKey: 'settings.field.OidcEnabled' },
      { key: 'TurnstileCheckEnabled', kind: 'bool', labelKey: 'settings.field.TurnstileCheckEnabled' },
    ],
  },
  {
    id: 'channels',
    titleKey: 'settings.sec.channels.title',
    descKey: 'settings.sec.channels.desc',
    fields: [
      { key: 'AutomaticDisableChannelEnabled', kind: 'bool', labelKey: 'settings.field.AutomaticDisableChannelEnabled' },
      { key: 'AutomaticEnableChannelEnabled', kind: 'bool', labelKey: 'settings.field.AutomaticEnableChannelEnabled' },
      { key: 'ChannelDisableThreshold', kind: 'number', labelKey: 'settings.field.ChannelDisableThreshold', hintKey: 'settings.field.ChannelDisableThreshold_hint' },
      { key: 'ApproximateTokenEnabled', kind: 'bool', labelKey: 'settings.field.ApproximateTokenEnabled', hintKey: 'settings.field.ApproximateTokenEnabled_hint' },
      { key: 'LogConsumeEnabled', kind: 'bool', labelKey: 'settings.field.LogConsumeEnabled' },
    ],
  },
  {
    id: 'display',
    titleKey: 'settings.sec.display.title',
    descKey: 'settings.sec.display.desc',
    fields: [
      { key: 'DisplayInCurrencyEnabled', kind: 'bool', labelKey: 'settings.field.DisplayInCurrencyEnabled' },
      { key: 'DisplayTokenStatEnabled', kind: 'bool', labelKey: 'settings.field.DisplayTokenStatEnabled' },
    ],
  },
  {
    id: 'email',
    titleKey: 'settings.sec.email.title',
    descKey: 'settings.sec.email.desc',
    fields: [
      { key: 'EmailDomainRestrictionEnabled', kind: 'bool', labelKey: 'settings.field.EmailDomainRestrictionEnabled' },
      { key: 'EmailDomainWhitelist', kind: 'text', labelKey: 'settings.field.EmailDomainWhitelist', placeholderKey: 'settings.field.EmailDomainWhitelist_placeholder' },
    ],
  },
  {
    id: 'smtp',
    titleKey: 'settings.sec.smtp.title',
    descKey: 'settings.sec.smtp.desc',
    fields: [
      { key: 'SMTPServer', kind: 'text', labelKey: 'settings.field.SMTPServer' },
      { key: 'SMTPPort', kind: 'number', labelKey: 'settings.field.SMTPPort' },
      { key: 'SMTPFrom', kind: 'text', labelKey: 'settings.field.SMTPFrom', placeholderKey: 'settings.field.SMTPFrom_placeholder' },
      { key: 'SMTPAccount', kind: 'text', labelKey: 'settings.field.SMTPAccount' },
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
          {t('settings.loading')}
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
  const { t } = useTranslation()
  return (
    <section className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-jelly)]">
      <header className="border-b border-[color:var(--border)] bg-[color:var(--bg2)]/50 px-6 py-4">
        <h2 className="font-display text-base font-bold tracking-[-0.3px]">{t(section.titleKey)}</h2>
        {section.descKey && <p className="mt-0.5 text-xs text-[color:var(--muted)]">{t(section.descKey)}</p>}
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
  const { t } = useTranslation()
  const [draft, setDraft] = useState(value)
  const [savedFlash, setSavedFlash] = useState(false)
  // Optimistic local state for bool fields: render from `boolDraft` so the
  // toggle flips the moment the user clicks, instead of waiting for the
  // mutation to finish and react-query to invalidate / refetch. If the
  // server rejects or returns a different value, the useEffect below
  // re-syncs from `value` (which is the canonical truth).
  const [boolDraft, setBoolDraft] = useState(asBool(value))

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

  useEffect(() => {
    if (field.kind === 'bool') setBoolDraft(asBool(value))
  }, [field.kind, value])

  if (field.kind === 'bool') {
    return (
      <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-6 py-4">
        <div className="min-w-0">
          <div className="text-sm font-medium">{t(field.labelKey)}</div>
          {field.hintKey && <div className="mt-0.5 text-xs text-[color:var(--muted)]">{t(field.hintKey)}</div>}
          <div className="mt-1 font-mono text-[11px] uppercase tracking-[1.5px] text-[color:var(--muted)]/60">
            {field.key}
          </div>
        </div>
        <Toggle
          checked={boolDraft}
          disabled={saving}
          onChange={(next) => {
            setBoolDraft(next)
            onSave({ key: field.key, value: next ? 'true' : 'false' })
          }}
        />
      </div>
    )
  }

  const dirty = draft !== value
  return (
    <div className="grid grid-cols-[260px_1fr_auto] items-center gap-4 px-6 py-4">
      <div className="min-w-0">
        <div className="text-sm font-medium">{t(field.labelKey)}</div>
        {field.hintKey && <div className="mt-0.5 text-xs text-[color:var(--muted)]">{t(field.hintKey)}</div>}
        <div className="mt-1 font-mono text-[11px] uppercase tracking-[1.5px] text-[color:var(--muted)]/60">
          {field.key}
        </div>
      </div>
      <input
        type={field.kind === 'number' ? 'number' : 'text'}
        value={draft}
        placeholder={field.kind === 'text' && field.placeholderKey ? t(field.placeholderKey) : ''}
        onChange={(e) => setDraft(e.target.value)}
        className={cn(
          'w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-3 py-2 font-mono text-sm transition focus:border-[color:var(--cyan)] focus:outline-none focus:ring-2 focus:ring-[color:var(--cyan)]/20',
          dirty && 'border-[color:var(--cyan)]/60',
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
        {savedFlash ? t('settings.saved') : t('settings.save')}
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
          ? 'border-transparent bg-gradient-to-r from-[#3FB3D9] to-[#4ED4DC]'
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
