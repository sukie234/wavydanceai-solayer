import { cn } from '@/lib/cn'
import type { ChatRole } from './types'

type Props = {
  role: ChatRole
  content: string
}

export function MessageBubble({ role, content }: Props) {
  if (role === 'system') return null
  const isUser = role === 'user'

  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-[color:var(--cyan)] text-[color:var(--bg)]'
            : 'border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text)]',
        )}
      >
        {content || (isUser ? '' : <span className="text-[color:var(--muted)]">…</span>)}
      </div>
    </div>
  )
}
