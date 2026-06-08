import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Square } from 'lucide-react'

type Props = {
  busy: boolean
  disabled?: boolean
  placeholderKey: string
  maxLength?: number
  onSend: (text: string) => void
  onAbort: () => void
}

export function PromptComposer({
  busy,
  disabled,
  placeholderKey,
  maxLength,
  onSend,
  onAbort,
}: Props) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  const submit = () => {
    const text = value.trim()
    if (!text || disabled) return
    onSend(text)
    setValue('')
  }

  return (
    <div className="border-t border-[color:var(--border)] bg-[color:var(--surface)] px-6 py-4">
      <div className="flex items-end gap-2 rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg2)] px-3 py-2 focus-within:border-[color:var(--cyan)]">
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (busy) onAbort()
              else submit()
            }
          }}
          rows={1}
          maxLength={maxLength}
          placeholder={t(placeholderKey)}
          disabled={disabled && !busy}
          className="flex-1 resize-none bg-transparent px-1 py-1.5 text-sm leading-relaxed outline-none placeholder:text-[color:var(--muted)]/70 disabled:cursor-not-allowed disabled:opacity-50"
        />

        {busy ? (
          <button
            type="button"
            onClick={onAbort}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text)] transition-colors hover:border-[color:var(--cyan)] hover:text-[color:var(--cyan)]"
            aria-label={t('console.playground.chat.stop')}
          >
            <Square className="h-3.5 w-3.5" strokeWidth={2.5} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!value.trim() || disabled}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[color:var(--cyan)] text-[color:var(--bg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
            aria-label={t('console.playground.chat.send')}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {maxLength && (
        <p className="mt-1 text-right font-mono text-[10px] uppercase tracking-[1.5px] text-[color:var(--muted)]/70">
          {value.length}/{maxLength}
        </p>
      )}
    </div>
  )
}
