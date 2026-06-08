import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Dialog, DialogActions, DialogError, Field, Select, TextArea } from './Dialog'
import { CHANNEL_TYPE, channelsService } from '@/lib/services/channels'
import { groupsService } from '@/lib/services/groups'
import { ApiError } from '@/lib/api'
import type { Channel } from '@/lib/types'

type Mode = { kind: 'create' } | { kind: 'edit'; id: number }

type Props = {
  open: boolean
  mode: Mode
  onClose: () => void
  onSaved: () => void
}

const TYPE_OPTIONS = Object.entries(CHANNEL_TYPE)
  .map(([id, label]) => ({ value: Number(id), label: `${label} (${id})` }))
  .sort((a, b) => a.label.localeCompare(b.label))

type FormState = {
  name: string
  type: number
  key: string
  base_url: string
  models: string
  group: string
  priority: string
  model_mapping: string
  system_prompt: string
}

const EMPTY: FormState = {
  name: '',
  type: 1, // OpenAI
  key: '',
  base_url: '',
  models: '',
  group: 'default',
  priority: '0',
  model_mapping: '',
  system_prompt: '',
}

// One-API appends `/v1/chat/completions` (or the per-adaptor equivalent) to
// `base_url` itself. Pasting the full endpoint produces a double-suffix and a
// silent 404 at request time — surfaced here as a non-blocking warning so the
// admin can save anyway if they know what they're doing, but the first-time
// user gets a clear nudge. Matches anything ending in `/chat/completions`,
// `/v1/chat/completions`, `/messages`, or a stray trailing `/v1/`.
function baseUrlLooksFull(u: string): boolean {
  const trimmed = u.trim().replace(/\/+$/, '').toLowerCase()
  if (!trimmed) return false
  return (
    trimmed.endsWith('/chat/completions') ||
    trimmed.endsWith('/messages') ||
    trimmed.endsWith('/v1') ||
    trimmed.endsWith('/v1/')
  )
}

export function ChannelDialog({ open, mode, onClose, onSaved }: Props) {
  const { t } = useTranslation()
  const [form, setForm] = useState<FormState>(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Load groups for the dropdown (admin-scoped, cheap, cached).
  const { data: groups } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsService.list(),
    staleTime: 5 * 60_000,
    enabled: open,
  })

  // When editing, pull the channel's current state to pre-fill.
  const { data: current, isLoading: loadingCurrent } = useQuery({
    queryKey: ['channel', mode.kind === 'edit' ? mode.id : null],
    queryFn: () => channelsService.get((mode as { id: number }).id),
    enabled: open && mode.kind === 'edit',
  })

  useEffect(() => {
    if (!open) return
    if (mode.kind === 'create') {
      setForm(EMPTY)
      setErr(null)
      return
    }
    if (current) {
      setForm({
        name: current.name ?? '',
        type: current.type,
        key: '', // never echo the key back from server payload for safety
        base_url: current.base_url ?? '',
        models: current.models ?? '',
        group: current.group || 'default',
        priority: String(current.priority ?? 0),
        model_mapping: current.model_mapping ?? '',
        system_prompt: current.system_prompt ?? '',
      })
      setErr(null)
    }
  }, [open, mode, current])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setSubmitting(true)
    try {
      const payload: Partial<Channel> = {
        name: form.name.trim(),
        type: form.type,
        base_url: form.base_url.trim() || null,
        models: form.models.trim(),
        group: form.group.trim() || 'default',
        priority: Number(form.priority) || 0,
        model_mapping: form.model_mapping.trim() || null,
        system_prompt: form.system_prompt.trim() || null,
      }
      // Only send `key` if the user typed one — empty means "keep current".
      if (form.key.trim()) payload.key = form.key.trim()

      if (mode.kind === 'create') {
        if (!payload.key) {
          setErr(t('channelDialog.errors.keyRequired'))
          setSubmitting(false)
          return
        }
        await channelsService.create(payload)
      } else {
        await channelsService.update({ ...payload, id: mode.id })
      }
      onSaved()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'save failed')
    } finally {
      setSubmitting(false)
    }
  }

  const title = mode.kind === 'create' ? t('channelDialog.titleCreate') : t('channelDialog.titleEdit')
  const isLoading = mode.kind === 'edit' && loadingCurrent

  const groupOptions = (groups ?? ['default']).map((g) => ({ value: g, label: g }))

  return (
    <Dialog open={open} onClose={onClose} title={title} kicker={t('channelDialog.kicker')} width="max-w-xl">
      <form onSubmit={submit}>
        {isLoading ? (
          <div className="py-10 text-center text-sm text-[color:var(--muted)]">Loading…</div>
        ) : (
          <>
            <div className="grid gap-x-4 md:grid-cols-2">
              <Field
                label={t('channelDialog.field.name')}
                value={form.name}
                onChange={(v) => set('name', v)}
                autoFocus
                placeholder="My OpenAI account"
              />
              <Select
                label={t('channelDialog.field.type')}
                value={form.type}
                onChange={(v) => set('type', Number(v))}
                options={TYPE_OPTIONS}
              />
            </div>

            <Field
              label={t('channelDialog.field.key')}
              type="password"
              value={form.key}
              onChange={(v) => set('key', v)}
              placeholder={mode.kind === 'edit' ? t('channelDialog.field.keyEditPlaceholder') : 'sk-...'}
              hint={mode.kind === 'edit' ? t('channelDialog.field.keyEditHint') : undefined}
            />

            <Field
              label={t('channelDialog.field.baseUrl')}
              value={form.base_url}
              onChange={(v) => set('base_url', v)}
              optional
              placeholder="https://api.openai.com (leave empty for default)"
              hint={baseUrlLooksFull(form.base_url) ? t('channelDialog.field.baseUrlWarning') : undefined}
              hintTone={baseUrlLooksFull(form.base_url) ? 'warn' : 'muted'}
            />

            <TextArea
              label={t('channelDialog.field.models')}
              value={form.models}
              onChange={(v) => set('models', v)}
              rows={3}
              placeholder="gpt-4o,gpt-4o-mini,gpt-4-turbo"
              hint={t('channelDialog.field.modelsHint')}
            />

            <div className="grid gap-x-4 md:grid-cols-2">
              <Select
                label={t('channelDialog.field.group')}
                value={form.group}
                onChange={(v) => set('group', v)}
                options={groupOptions}
              />
              <Field
                label={t('channelDialog.field.priority')}
                type="number"
                value={form.priority}
                onChange={(v) => set('priority', v)}
                hint={t('channelDialog.field.priorityHint')}
              />
            </div>

            <TextArea
              label={t('channelDialog.field.modelMapping')}
              value={form.model_mapping}
              onChange={(v) => set('model_mapping', v)}
              rows={3}
              optional
              placeholder='{"gpt-4":"gpt-4-turbo"}'
              hint={t('channelDialog.field.modelMappingHint')}
            />

            <TextArea
              label={t('channelDialog.field.systemPrompt')}
              value={form.system_prompt}
              onChange={(v) => set('system_prompt', v)}
              rows={2}
              optional
            />
          </>
        )}

        <DialogError message={err} />

        <DialogActions>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={submitting || isLoading || !form.name || !form.models}>
            {submitting ? '…' : mode.kind === 'create' ? t('common.create') : t('common.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
