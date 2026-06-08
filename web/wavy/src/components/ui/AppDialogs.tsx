import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'

type Tone = 'default' | 'danger'

type ConfirmOptions = {
  title: string
  message?: ReactNode
  confirmText?: string
  cancelText?: string
  tone?: Tone
}

type PromptOptions = {
  title: string
  message?: ReactNode
  defaultValue?: string
  placeholder?: string
  confirmText?: string
  cancelText?: string
  multiline?: boolean
}

type ConfirmState = ConfirmOptions & { kind: 'confirm' }
type PromptState = PromptOptions & { kind: 'prompt' }
type DialogState = ConfirmState | PromptState

type Ctx = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>
  prompt: (opts: PromptOptions) => Promise<string | null>
}

const AppDialogsContext = createContext<Ctx | null>(null)

export function AppDialogsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null)
  const [promptValue, setPromptValue] = useState('')
  const resolverRef = useRef<((v: unknown) => void) | null>(null)

  // Resolve any pending dialog with a "cancel" value (false / null) before
  // accepting a new one. Without this, an overlapping confirm() / prompt()
  // call silently overwrites resolverRef and the previous awaiter hangs.
  const resolvePending = useCallback((kind: DialogState['kind']) => {
    const prev = resolverRef.current
    if (prev) prev(kind === 'prompt' ? null : false)
    resolverRef.current = null
  }, [])

  const close = useCallback((value: unknown) => {
    resolverRef.current?.(value)
    resolverRef.current = null
    setState(null)
  }, [])

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolvePending('confirm')
        resolverRef.current = resolve as (v: unknown) => void
        setState({ kind: 'confirm', ...opts })
      }),
    [resolvePending],
  )

  const prompt = useCallback(
    (opts: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        resolvePending('prompt')
        resolverRef.current = resolve as (v: unknown) => void
        setPromptValue(opts.defaultValue ?? '')
        setState({ kind: 'prompt', ...opts })
      }),
    [resolvePending],
  )

  return (
    <AppDialogsContext.Provider value={{ confirm, prompt }}>
      {children}
      <DialogShell
        state={state}
        promptValue={promptValue}
        onPromptChange={setPromptValue}
        onCancel={() => close(state?.kind === 'prompt' ? null : false)}
        onConfirm={() => close(state?.kind === 'prompt' ? promptValue : true)}
      />
    </AppDialogsContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(AppDialogsContext)
  if (!ctx) throw new Error('useConfirm must be used within <AppDialogsProvider>')
  return ctx.confirm
}

export function usePrompt() {
  const ctx = useContext(AppDialogsContext)
  if (!ctx) throw new Error('usePrompt must be used within <AppDialogsProvider>')
  return ctx.prompt
}

function DialogShell({
  state,
  promptValue,
  onPromptChange,
  onCancel,
  onConfirm,
}: {
  state: DialogState | null
  promptValue: string
  onPromptChange: (v: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const titleId = useId()
  const messageId = useId()

  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      } else if (e.key === 'Enter' && state.kind === 'confirm') {
        e.preventDefault()
        onConfirm()
      } else if (e.key === 'Enter' && state.kind === 'prompt' && !state.multiline && !e.shiftKey) {
        e.preventDefault()
        onConfirm()
      } else if (e.key === 'Tab') {
        // Focus trap — keep Tab cycling between focusable elements inside the
        // dialog so keyboard users can't reach controls behind the backdrop.
        const card = cardRef.current
        if (!card) return
        const focusables = card.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement as HTMLElement | null
        if (e.shiftKey) {
          if (active === first || !card.contains(active)) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (active === last || !card.contains(active)) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [state, onCancel, onConfirm])

  useEffect(() => {
    if (state?.kind === 'prompt') {
      // Defer to ensure ref is bound after render.
      requestAnimationFrame(() => inputRef.current?.focus())
    } else if (state?.kind === 'confirm') {
      // Seed focus inside the dialog so the focus trap has somewhere to start
      // and the first Tab press doesn't escape the modal.
      requestAnimationFrame(() => {
        const card = cardRef.current
        const btn = card?.querySelector<HTMLButtonElement>('button:not([disabled])')
        btn?.focus()
      })
    }
  }, [state])

  if (!state) return null

  const tone: Tone = state.kind === 'confirm' ? state.tone ?? 'default' : 'default'
  const confirmText =
    state.confirmText ??
    (state.kind === 'confirm'
      ? tone === 'danger'
        ? t('common.delete')
        : t('common.confirm')
      : t('common.confirm'))
  const cancelText = state.cancelText ?? t('common.cancel')

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={state.message ? messageId : undefined}
    >
      <div
        ref={cardRef}
        className="w-full max-w-md rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-7 shadow-[var(--shadow-jelly)]"
      >
        <h2 id={titleId} className="mb-3 font-display text-xl font-bold tracking-[-0.5px]">
          {state.title}
        </h2>
        {state.message && (
          <div id={messageId} className="mb-5 text-sm leading-[1.6] text-[color:var(--muted)]">
            {state.message}
          </div>
        )}

        {state.kind === 'prompt' &&
          (state.multiline ? (
            <textarea
              ref={(el) => {
                inputRef.current = el
              }}
              value={promptValue}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder={state.placeholder}
              rows={4}
              className="mb-5 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-3 py-2 font-mono text-sm transition focus:border-[color:var(--cyan)] focus:outline-none focus:ring-2 focus:ring-[color:var(--cyan)]/20"
            />
          ) : (
            <input
              ref={(el) => {
                inputRef.current = el
              }}
              type="text"
              value={promptValue}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder={state.placeholder}
              className="mb-5 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-3 py-2 text-sm transition focus:border-[color:var(--cyan)] focus:outline-none focus:ring-2 focus:ring-[color:var(--cyan)]/20"
            />
          ))}

        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg2)] px-4 py-2 text-sm font-medium text-[color:var(--text)] transition hover:border-[color:var(--muted)]/40 hover:bg-[color:var(--surface)]"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={
              tone === 'danger'
                ? 'rounded-lg border border-[color:var(--coral)]/40 bg-[color:var(--coral)]/15 px-4 py-2 text-sm font-semibold text-[color:var(--coral)] transition hover:bg-[color:var(--coral)]/25'
                : 'rounded-lg bg-current-grad px-4 py-2 text-sm font-semibold text-[color:var(--cta-ink)] transition hover:brightness-110'
            }
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
