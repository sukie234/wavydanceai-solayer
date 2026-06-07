import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { ChatSession } from './types'

type Props = {
  sessions: ChatSession[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
  canCreate?: boolean
}

export function SessionList({ sessions, activeId, onSelect, onCreate, onDelete, canCreate = true }: Props) {
  const { t } = useTranslation()

  return (
    <div className="flex h-full flex-col border-r border-[color:var(--border)] bg-[color:var(--surface)]">
      <div className="border-b border-[color:var(--border)] p-3">
        <button
          type="button"
          onClick={onCreate}
          disabled={!canCreate}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--bg2)] px-3 py-2 text-sm font-medium transition-colors hover:border-[color:var(--cyan)] hover:text-[color:var(--cyan)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[color:var(--border)] disabled:hover:text-inherit"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('console.playground.chat.newSession')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 && (
          <div className="px-2 py-6 text-center text-xs text-[color:var(--muted)]">
            {t('console.playground.chat.empty')}
          </div>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            data-active={s.id === activeId}
            className={cn(
              'group mb-1 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
              s.id === activeId
                ? 'bg-[color:var(--bg2)] text-[color:var(--text)]'
                : 'text-[color:var(--muted)] hover:bg-[color:var(--bg2)]/60 hover:text-[color:var(--text)]',
            )}
            onClick={() => onSelect(s.id)}
          >
            <span className="flex-1 truncate">{s.title || t('console.playground.chat.untitled')}</span>
            <button
              type="button"
              aria-label="delete"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(s.id)
              }}
              className="invisible h-6 w-6 shrink-0 rounded-md text-[color:var(--muted)] hover:bg-[color:var(--bg)] hover:text-[color:var(--text)] group-hover:visible"
            >
              <Trash2 className="m-auto h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
