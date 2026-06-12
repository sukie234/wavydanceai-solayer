import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Braces, Plus, Save, Table2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Pager } from '@/components/console/DataTable'
import { useConfirm } from '@/components/ui/AppDialogs'
import { ApiError } from '@/lib/api'
import { formatNum, parseRatio, parseRatioMap, ratioToUsd, usdToRatio } from '@/lib/pricing'
import { cn } from '@/lib/cn'

export type RatioKey = 'GroupRatio' | 'ModelRatio' | 'CompletionRatio'

type RatioMap = Record<string, number>

type Props = {
  groupRatio: RatioMap
  modelRatio: RatioMap
  completionRatio: RatioMap
  onSave: (key: RatioKey, value: string) => Promise<void>
}

const PAGE_SIZE = 50

type GroupRow = { id: number; name: string; ratio: string }
type ModelRow = {
  id: number
  name: string
  ratio: string
  inputPrice: string
  /** '' = no CompletionRatio entry — backend falls back to its default. */
  completion: string
  outputPrice: string
}

let rowId = 1
const newId = () => rowId++

function groupRowsFrom(map: RatioMap): GroupRow[] {
  return Object.entries(map).map(([name, ratio]) => ({ id: newId(), name, ratio: formatNum(ratio) }))
}

function makeModelRow(name: string, ratio: string, completion: string): ModelRow {
  const r = parseRatio(ratio)
  const c = parseRatio(completion)
  return {
    id: newId(),
    name,
    ratio,
    inputPrice: r === null ? '' : formatNum(ratioToUsd(r)),
    completion,
    outputPrice: r === null || c === null ? '' : formatNum(ratioToUsd(r) * c),
  }
}

function modelRowsFrom(model: RatioMap, completion: RatioMap): ModelRow[] {
  return Object.entries(model).map(([name, ratio]) => {
    const c = completion[name]
    return makeModelRow(name, formatNum(ratio), c === undefined ? '' : formatNum(c))
  })
}

type ModelField = 'name' | 'ratio' | 'inputPrice' | 'completion' | 'outputPrice'

/** Bidirectional edit: ratio ↔ input $/M, completion ↔ output $/M. */
function editModelRow(row: ModelRow, field: ModelField, value: string): ModelRow {
  const next = { ...row, [field]: value }
  const num = parseRatio(value)
  const syncOutput = () => {
    const c = parseRatio(next.completion)
    const input = parseRatio(next.inputPrice)
    next.outputPrice = c === null || input === null ? '' : formatNum(input * c)
  }
  if (field === 'ratio') {
    next.inputPrice = num === null ? '' : formatNum(ratioToUsd(num))
    syncOutput()
  } else if (field === 'inputPrice') {
    next.ratio = num === null ? '' : formatNum(usdToRatio(num))
    syncOutput()
  } else if (field === 'completion') {
    syncOutput()
  } else if (field === 'outputPrice') {
    const input = parseRatio(next.inputPrice)
    if (value.trim() === '') next.completion = ''
    else if (num !== null && input !== null && input > 0) next.completion = formatNum(num / input)
  }
  return next
}

/** A non-zero output price is unstorable when the input price is 0 —
 * output is persisted as completion = output / input. */
function outputPriceInvalid(row: ModelRow): boolean {
  if (row.outputPrice.trim() === '') return false
  const out = parseRatio(row.outputPrice)
  if (out === null) return true
  return parseRatio(row.ratio) === 0 && out !== 0
}

function dupNames(names: string[]): Set<string> {
  const seen = new Set<string>()
  const dup = new Set<string>()
  for (const raw of names) {
    const n = raw.trim()
    if (seen.has(n)) dup.add(n)
    seen.add(n)
  }
  return dup
}

const pretty = (map: RatioMap) => JSON.stringify(map, null, 2)

export function PricingEditor({ groupRatio, modelRatio, completionRatio, onSave }: Props) {
  const { t } = useTranslation()
  const confirm = useConfirm()

  // Canonical last-saved state. Table rows / raw textareas are derived from
  // this on (re-)entry into their mode; successful saves write back into it.
  const [saved, setSaved] = useState(() => ({
    group: groupRatio,
    model: modelRatio,
    completion: completionRatio,
  }))

  const [raw, setRaw] = useState(false)
  const [rawTexts, setRawTexts] = useState<Record<RatioKey, string>>(() => ({
    GroupRatio: '',
    ModelRatio: '',
    CompletionRatio: '',
  }))

  const [groups, setGroups] = useState(() => groupRowsFrom(groupRatio))
  const [models, setModels] = useState(() => modelRowsFrom(modelRatio, completionRatio))

  const [q, setQ] = useState('')
  const [pageState, setPageState] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current)
  }, [])

  function flashSaved(section: string) {
    setFlash(section)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), 1500)
  }

  // ----- dirty tracking ------------------------------------------------

  const groupRowDirty = (r: GroupRow) => {
    const sv = saved.group[r.name.trim()]
    return sv === undefined || r.ratio !== formatNum(sv)
  }
  const modelRowDirty = (r: ModelRow) => {
    const sv = saved.model[r.name.trim()]
    if (sv === undefined || r.ratio !== formatNum(sv)) return true
    const sc = saved.completion[r.name.trim()]
    return r.completion !== (sc === undefined ? '' : formatNum(sc))
  }
  const groupsDirty = groups.length !== Object.keys(saved.group).length || groups.some(groupRowDirty)
  const modelsDirty = models.length !== Object.keys(saved.model).length || models.some(modelRowDirty)
  const rawDirtyOf = (key: RatioKey) => rawTexts[key] !== pretty(saved[FIELD_OF[key]])
  const anyDirty = raw
    ? (['GroupRatio', 'ModelRatio', 'CompletionRatio'] as const).some(rawDirtyOf)
    : groupsDirty || modelsDirty

  useEffect(() => {
    if (!anyDirty) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [anyDirty])

  // ----- validation -----------------------------------------------------

  const groupDups = useMemo(() => dupNames(groups.map((g) => g.name)), [groups])
  const modelDups = useMemo(() => dupNames(models.map((m) => m.name)), [models])
  const groupRowInvalid = (r: GroupRow) =>
    r.name.trim() === '' || groupDups.has(r.name.trim()) || parseRatio(r.ratio) === null
  const modelRowInvalid = (r: ModelRow) =>
    r.name.trim() === '' ||
    modelDups.has(r.name.trim()) ||
    parseRatio(r.ratio) === null ||
    (r.completion.trim() !== '' && parseRatio(r.completion) === null) ||
    outputPriceInvalid(r)
  const groupsInvalid = groups.some(groupRowInvalid)
  const modelsInvalid = models.some(modelRowInvalid)

  // ----- save flows -----------------------------------------------------

  async function confirmApply(): Promise<boolean> {
    return confirm({
      title: t('ratios.confirmTitle'),
      message: t('ratios.confirmMessage'),
      tone: 'danger',
      confirmText: t('ratios.confirmApply'),
    })
  }

  async function runSave(section: string, fn: () => Promise<void>) {
    if (!(await confirmApply())) return
    setBusy(true)
    setErr(null)
    try {
      await fn()
      flashSaved(section)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t('ratios.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  function saveGroups() {
    void runSave('groups', async () => {
      const map: RatioMap = {}
      for (const r of groups) map[r.name.trim()] = parseRatio(r.ratio)!
      await onSave('GroupRatio', JSON.stringify(map))
      setSaved((s) => ({ ...s, group: map }))
    })
  }

  function saveModels() {
    void runSave('models', async () => {
      const modelMap: RatioMap = {}
      for (const r of models) modelMap[r.name.trim()] = parseRatio(r.ratio)!
      // CompletionRatio entries whose key never appeared in the table
      // (prefix-style keys without a ModelRatio entry) are preserved as-is —
      // unless a row with that exact name now exists, which takes over.
      const completionMap: RatioMap = Object.fromEntries(
        Object.entries(saved.completion).filter(([k]) => !(k in saved.model) && !(k in modelMap)),
      )
      for (const r of models) {
        const name = r.name.trim()
        if (r.completion.trim() !== '') completionMap[name] = parseRatio(r.completion)!
      }
      await onSave('ModelRatio', JSON.stringify(modelMap))
      try {
        await onSave('CompletionRatio', JSON.stringify(completionMap))
      } catch (e) {
        // ModelRatio is already persisted — record it so dirty tracking
        // compares against server state and a retry only re-sends the rest.
        setSaved((s) => ({ ...s, model: modelMap }))
        throw e
      }
      setSaved((s) => ({ ...s, model: modelMap, completion: completionMap }))
    })
  }

  function saveRaw(key: RatioKey) {
    const parsed = parseRatioMap(rawTexts[key])
    if (!parsed) return
    void runSave(key, async () => {
      await onSave(key, JSON.stringify(parsed))
      setSaved((s) => ({ ...s, [FIELD_OF[key]]: parsed }))
      setRawTexts((s) => ({ ...s, [key]: pretty(parsed) }))
    })
  }

  // ----- mode switch ----------------------------------------------------

  async function toggleRaw() {
    if (anyDirty) {
      const ok = await confirm({
        title: t('ratios.discardTitle'),
        message: t('ratios.discardMessage'),
        tone: 'danger',
        confirmText: t('ratios.discardConfirm'),
      })
      if (!ok) return
    }
    if (raw) {
      setGroups(groupRowsFrom(saved.group))
      setModels(modelRowsFrom(saved.model, saved.completion))
      setRaw(false)
    } else {
      setRawTexts({
        GroupRatio: pretty(saved.group),
        ModelRatio: pretty(saved.model),
        CompletionRatio: pretty(saved.completion),
      })
      setRaw(true)
    }
  }

  // ----- model table paging --------------------------------------------

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return models
    return models.filter((m) => m.name.toLowerCase().includes(needle))
  }, [models, q])
  const maxPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1)
  const page = Math.min(pageState, maxPage)
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function addModel() {
    setModels((rows) => [{ ...makeModelRow('', '', '') }, ...rows])
    setQ('')
    setPageState(0)
  }

  // ----- render ----------------------------------------------------------

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between gap-4">
        {err ? (
          <div className="flex-1 rounded-lg border border-[color:var(--coral)]/30 bg-[color:var(--coral)]/8 px-3 py-2 text-sm text-[color:var(--coral)]">
            {err}
          </div>
        ) : (
          <span />
        )}
        <Button type="button" variant="ghost" size="sm" onClick={() => void toggleRaw()}>
          {raw ? <Table2 className="h-3.5 w-3.5" /> : <Braces className="h-3.5 w-3.5" />}
          {raw ? t('ratios.tableMode') : t('ratios.rawMode')}
        </Button>
      </div>

      {raw ? (
        (['GroupRatio', 'ModelRatio', 'CompletionRatio'] as const).map((key) => (
          <RawPanel
            key={key}
            optionKey={key}
            text={rawTexts[key]}
            dirty={rawDirtyOf(key)}
            busy={busy}
            flash={flash === key}
            onChange={(v) => setRawTexts((s) => ({ ...s, [key]: v }))}
            onSave={() => saveRaw(key)}
          />
        ))
      ) : (
        <>
          <SectionCard
            title={t('ratios.groups.title')}
            desc={t('ratios.groups.desc')}
            dirty={groupsDirty}
            invalid={groupsInvalid}
            flash={flash === 'groups'}
            busy={busy}
            onSave={saveGroups}
          >
            <div
              className="grid items-center gap-x-3.5 border-b border-[color:var(--border)] bg-[color:var(--bg2)]/70 px-5 py-2.5 font-mono text-[11px] uppercase tracking-[2px] text-[color:var(--muted)]"
              style={{ gridTemplateColumns: GROUP_GRID }}
            >
              <div>{t('ratios.groups.colGroup')}</div>
              <div className="text-right">{t('ratios.groups.colRatio')}</div>
              <div />
            </div>
            <div className="divide-y divide-[color:var(--border)]/60">
              {groups.map((r) => {
                const dirty = groupRowDirty(r)
                return (
                  <div
                    key={r.id}
                    className="grid items-center gap-x-3.5 px-5 py-2.5"
                    style={{ gridTemplateColumns: GROUP_GRID }}
                  >
                    <CellInput
                      label={`${r.name || 'new'} group name`}
                      value={r.name}
                      align="left"
                      dirty={dirty}
                      invalid={r.name.trim() === '' || groupDups.has(r.name.trim())}
                      onChange={(v) =>
                        setGroups((rows) => rows.map((x) => (x.id === r.id ? { ...x, name: v } : x)))
                      }
                    />
                    <CellInput
                      label={`${r.name || 'new'} group ratio`}
                      value={r.ratio}
                      dirty={dirty}
                      invalid={parseRatio(r.ratio) === null}
                      onChange={(v) =>
                        setGroups((rows) => rows.map((x) => (x.id === r.id ? { ...x, ratio: v } : x)))
                      }
                    />
                    <DeleteBtn
                      label={`${t('ratios.delete')} ${r.name || 'group'}`}
                      onClick={() => setGroups((rows) => rows.filter((x) => x.id !== r.id))}
                    />
                  </div>
                )
              })}
            </div>
            <div className="px-5 py-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setGroups((rows) => [...rows, { id: newId(), name: '', ratio: '' }])}
              >
                <Plus className="h-3.5 w-3.5" />
                {t('ratios.groups.add')}
              </Button>
            </div>
          </SectionCard>

          <SectionCard
            title={t('ratios.models.title')}
            desc={t('ratios.models.desc')}
            dirty={modelsDirty}
            invalid={modelsInvalid}
            flash={flash === 'models'}
            busy={busy}
            onSave={saveModels}
          >
            <div className="flex flex-wrap items-center gap-3 border-b border-[color:var(--border)] px-5 py-3">
              <input
                type="text"
                value={q}
                placeholder={t('ratios.models.search')}
                aria-label={t('ratios.models.search')}
                onChange={(e) => {
                  setQ(e.target.value)
                  setPageState(0)
                }}
                className="w-72 max-w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-3 py-2 text-sm transition focus:border-[color:var(--cyan)] focus:outline-none focus:ring-2 focus:ring-[color:var(--cyan)]/20"
              />
              <span className="font-mono text-xs text-[color:var(--muted)]">
                {t('ratios.models.count', { shown: filtered.length, total: models.length })}
              </span>
              <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={addModel}>
                <Plus className="h-3.5 w-3.5" />
                {t('ratios.models.add')}
              </Button>
            </div>
            <div
              className="grid items-center gap-x-3.5 border-b border-[color:var(--border)] bg-[color:var(--bg2)]/70 px-5 py-2.5 font-mono text-[11px] uppercase tracking-[2px] text-[color:var(--muted)]"
              style={{ gridTemplateColumns: MODEL_GRID }}
            >
              <div>{t('ratios.models.colModel')}</div>
              <div className="text-right">{t('ratios.models.colRatio')}</div>
              <div className="text-right">{t('ratios.models.colInput')}</div>
              <div className="text-right">{t('ratios.models.colCompletion')}</div>
              <div className="text-right">{t('ratios.models.colOutput')}</div>
              <div />
            </div>
            <div className="divide-y divide-[color:var(--border)]/60">
              {pageRows.length === 0 && (
                <div className="px-5 py-12 text-center text-sm text-[color:var(--muted)]">
                  {t('ratios.models.empty')}
                </div>
              )}
              {pageRows.map((r) => (
                <ModelRowView
                  key={r.id}
                  row={r}
                  dirty={modelRowDirty(r)}
                  dup={modelDups.has(r.name.trim())}
                  deleteLabel={`${t('ratios.delete')} ${r.name || 'model'}`}
                  defaultPlaceholder={t('ratios.models.default')}
                  onEdit={(field, value) =>
                    setModels((rows) => rows.map((x) => (x.id === r.id ? editModelRow(x, field, value) : x)))
                  }
                  onDelete={() => setModels((rows) => rows.filter((x) => x.id !== r.id))}
                />
              ))}
            </div>
            {maxPage > 0 && (
              <div className="px-5 pb-3">
                <Pager p={page} onP={setPageState} hasMore={page < maxPage} />
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  )
}

const FIELD_OF = { GroupRatio: 'group', ModelRatio: 'model', CompletionRatio: 'completion' } as const
const GROUP_GRID = '1fr 160px 36px'
const MODEL_GRID = 'minmax(180px,1.6fr) 110px 110px 110px 110px 36px'

function ModelRowView({
  row,
  dirty,
  dup,
  deleteLabel,
  defaultPlaceholder,
  onEdit,
  onDelete,
}: {
  row: ModelRow
  dirty: boolean
  dup: boolean
  deleteLabel: string
  defaultPlaceholder: string
  onEdit: (field: ModelField, value: string) => void
  onDelete: () => void
}) {
  const name = row.name || 'new'
  return (
    <div className="grid items-center gap-x-3.5 px-5 py-2" style={{ gridTemplateColumns: MODEL_GRID }}>
      <CellInput
        label={`${name} model name`}
        value={row.name}
        align="left"
        dirty={dirty}
        invalid={row.name.trim() === '' || dup}
        onChange={(v) => onEdit('name', v)}
      />
      <CellInput
        label={`${name} model ratio`}
        value={row.ratio}
        dirty={dirty}
        invalid={parseRatio(row.ratio) === null}
        onChange={(v) => onEdit('ratio', v)}
      />
      <CellInput
        label={`${name} input price`}
        value={row.inputPrice}
        dirty={dirty}
        invalid={parseRatio(row.ratio) === null}
        onChange={(v) => onEdit('inputPrice', v)}
      />
      <CellInput
        label={`${name} completion ratio`}
        value={row.completion}
        placeholder={defaultPlaceholder}
        dirty={dirty}
        invalid={row.completion.trim() !== '' && parseRatio(row.completion) === null}
        onChange={(v) => onEdit('completion', v)}
      />
      <CellInput
        label={`${name} output price`}
        value={row.outputPrice}
        placeholder={defaultPlaceholder}
        dirty={dirty}
        invalid={outputPriceInvalid(row)}
        onChange={(v) => onEdit('outputPrice', v)}
      />
      <DeleteBtn label={deleteLabel} onClick={onDelete} />
    </div>
  )
}

function SectionCard({
  title,
  desc,
  dirty,
  invalid,
  flash,
  busy,
  onSave,
  children,
}: {
  title: string
  desc: string
  dirty: boolean
  invalid: boolean
  flash: boolean
  busy: boolean
  onSave: () => void
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <section className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-jelly)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border)] bg-[color:var(--bg2)]/50 px-6 py-4">
        <div>
          <h2 className="font-display text-base font-bold tracking-[-0.3px]">{title}</h2>
          <p className="mt-0.5 text-xs text-[color:var(--muted)]">{desc}</p>
        </div>
        <div className="flex items-center gap-3">
          {invalid && <span className="text-xs text-[color:var(--coral)]">{t('ratios.invalid')}</span>}
          <Button
            type="button"
            size="sm"
            variant={dirty ? 'primary' : 'ghost'}
            disabled={!dirty || invalid || busy}
            onClick={onSave}
          >
            <Save className="h-3.5 w-3.5" />
            {flash ? t('ratios.saved') : t('ratios.save')}
          </Button>
        </div>
      </header>
      {children}
    </section>
  )
}

function RawPanel({
  optionKey,
  text,
  dirty,
  busy,
  flash,
  onChange,
  onSave,
}: {
  optionKey: RatioKey
  text: string
  dirty: boolean
  busy: boolean
  flash: boolean
  onChange: (v: string) => void
  onSave: () => void
}) {
  const { t } = useTranslation()
  const invalid = parseRatioMap(text) === null
  return (
    <SectionCard
      title={optionKey}
      desc={t(`ratios.raw.${optionKey}`)}
      dirty={dirty}
      invalid={invalid}
      flash={flash}
      busy={busy}
      onSave={onSave}
    >
      <div className="px-5 py-4">
        <textarea
          value={text}
          aria-label={`${optionKey} JSON`}
          rows={12}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-3 py-2 font-mono text-xs leading-[1.5] transition focus:border-[color:var(--cyan)] focus:outline-none focus:ring-2 focus:ring-[color:var(--cyan)]/20',
            invalid && 'border-[color:var(--coral)] focus:border-[color:var(--coral)] focus:ring-[color:var(--coral)]/20',
          )}
        />
        {invalid && <p className="mt-2 text-xs text-[color:var(--coral)]">{t('ratios.raw.invalid')}</p>}
      </div>
    </SectionCard>
  )
}

function CellInput({
  label,
  value,
  onChange,
  invalid,
  dirty,
  placeholder,
  align = 'right',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  invalid?: boolean
  dirty?: boolean
  placeholder?: string
  align?: 'left' | 'right'
}) {
  return (
    <input
      type="text"
      inputMode={align === 'right' ? 'decimal' : undefined}
      aria-label={label}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full min-w-0 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-2.5 py-1.5 font-mono text-sm transition placeholder:text-[color:var(--muted)]/50 focus:border-[color:var(--cyan)] focus:outline-none focus:ring-2 focus:ring-[color:var(--cyan)]/20',
        align === 'right' && 'text-right tabular-nums',
        dirty && 'border-[color:var(--cyan)]/60',
        invalid && 'border-[color:var(--coral)] focus:border-[color:var(--coral)] focus:ring-[color:var(--coral)]/20',
      )}
    />
  )
}

function DeleteBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-[color:var(--border)] text-[color:var(--muted)] transition hover:border-[color:var(--coral)]/70 hover:text-[color:var(--coral)]"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}
