import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { ChatMessage } from './types'
import { MessageBubble } from './MessageBubble'

type Props = {
  messages: ChatMessage[]
}

export function MessageList({ messages }: Props) {
  const { t } = useTranslation()
  const endRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to the latest message / streaming chunk. We watch the last
  // message's content length so updates during a stream also scroll.
  const lastLen = messages[messages.length - 1]?.content.length ?? 0
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, lastLen])

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[color:var(--muted)]">
        {t('console.playground.chat.emptyMessages')}
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-6 py-6">
      {messages.map((m, i) => (
        <MessageBubble key={i} role={m.role} content={m.content} />
      ))}
      <div ref={endRef} />
    </div>
  )
}
