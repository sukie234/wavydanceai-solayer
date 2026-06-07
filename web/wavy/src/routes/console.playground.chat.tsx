import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SessionList } from '@/components/playground/chat/SessionList'
import { MessageList } from '@/components/playground/chat/MessageList'
import { Composer } from '@/components/playground/chat/Composer'
import { ParamsPanel } from '@/components/playground/chat/ParamsPanel'
import { useChatStream } from '@/components/playground/chat/useChatStream'
import { sessionStore } from '@/components/playground/chat/sessionStore'
import { DEFAULT_PARAMS, type ChatMessage, type ChatSession } from '@/components/playground/chat/types'
import { playgroundService } from '@/lib/services/playground'
import { authService } from '@/lib/services/auth'

export const Route = createFileRoute('/console/playground/chat')({
  component: PlaygroundChat,
})

function PlaygroundChat() {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const { data: token } = useQuery({
    queryKey: ['playground', 'token'],
    queryFn: () => playgroundService.getToken(),
    staleTime: Infinity,
  })

  const { data: models = [], isLoading: loadingModels } = useQuery({
    queryKey: ['playground', 'chat_models'],
    queryFn: () => playgroundService.listChatModels(),
    staleTime: 5 * 60_000,
  })

  const { data: user } = useQuery({
    queryKey: ['self'],
    queryFn: () => authService.getSelf(),
    staleTime: 30_000,
  })

  const [sessions, setSessions] = useState<ChatSession[]>(() => sessionStore.list())
  const [activeId, setActiveId] = useState<string | null>(() => sessionStore.list()[0]?.id ?? null)
  const active = useMemo(() => sessions.find((s) => s.id === activeId) ?? null, [sessions, activeId])

  // When the model list arrives and the active session has no model (or its
  // model is no longer in the allowed list), default to the first available.
  useEffect(() => {
    if (!active || models.length === 0) return
    if (!active.model || !models.includes(active.model)) {
      updateActive({ ...active, model: models[0] })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models.join('|'), active?.id])

  const { streaming, error, usage, send, stop } = useChatStream()

  const persist = useCallback((next: ChatSession) => {
    sessionStore.save(next)
    setSessions(sessionStore.list())
  }, [])

  const updateActive = useCallback(
    (next: ChatSession) => {
      persist(next)
      setActiveId(next.id)
    },
    [persist],
  )

  const onCreate = () => {
    // Defence against the race where the model list is still loading or the
    // user has zero channels: clicking "New chat" otherwise spawns sessions
    // that can never send (every message would error with "no model").
    if (loadingModels || models.length === 0) return
    const fresh = sessionStore.create(models[0] ?? '')
    setSessions(sessionStore.list())
    setActiveId(fresh.id)
  }

  const onDelete = (id: string) => {
    sessionStore.remove(id)
    const remaining = sessionStore.list()
    setSessions(remaining)
    if (activeId === id) setActiveId(remaining[0]?.id ?? null)
  }

  const onSend = async (text: string) => {
    if (!active || !token || !active.model) return

    const userMsg: ChatMessage = { role: 'user', content: text }
    const placeholder: ChatMessage = { role: 'assistant', content: '' }
    const withUser: ChatSession = {
      ...active,
      title: active.messages.length === 0 ? truncateTitle(text) : active.title,
      messages: [...active.messages, userMsg, placeholder],
    }
    updateActive(withUser)

    try {
      let acc = ''
      await send(
        {
          apiKey: token,
          model: active.model,
          systemPrompt: active.systemPrompt,
          messages: [...active.messages, userMsg],
          params: active.params,
        },
        (chunk) => {
          acc += chunk
          // Read from store rather than closure so concurrent persistence is consistent.
          const current = sessionStore.list().find((s) => s.id === active.id)
          if (!current) return
          const msgs = [...current.messages]
          msgs[msgs.length - 1] = { role: 'assistant', content: acc }
          updateActive({ ...current, messages: msgs })
        },
      )
    } catch {
      // useChatStream already surfaces the message via its `error` state.
    } finally {
      // Refresh user quota so the header reflects the spend.
      qc.invalidateQueries({ queryKey: ['self'] })
    }
  }

  const noModels = !loadingModels && models.length === 0
  const remainingQuota = user?.quota ?? 0

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      {/* Header band */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border)] bg-[color:var(--surface)] px-6 py-3">
        <div className="flex items-center gap-3">
          <Link to="/console/playground">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-3.5 w-3.5" />
              {t('console.playground.chat.back')}
            </Button>
          </Link>
          <h1 className="font-display text-lg font-semibold tracking-[-0.3px]">
            {t('console.playground.chat.title')}
          </h1>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs text-[color:var(--muted)]">
          <span>
            {t('console.playground.chat.quota.remaining', { quota: formatQuota(remainingQuota) })}
          </span>
          {usage?.total_tokens != null && (
            <span>
              {t('console.playground.chat.quota.lastRequest', { tokens: usage.total_tokens })}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 border-b border-[color:var(--border)] bg-[color:var(--bg2)] px-6 py-2 text-xs text-[color:var(--text)]">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          <span>{error}</span>
          <Link to="/console/topup" className="ml-auto text-[color:var(--cyan)] hover:underline">
            {t('console.playground.chat.error.topup')}
          </Link>
        </div>
      )}

      {loadingModels ? (
        <div className="flex flex-1 items-center justify-center p-10 text-sm text-[color:var(--muted)]">
          {t('console.playground.chat.loadingModels')}
        </div>
      ) : noModels ? (
        <div className="flex flex-1 items-center justify-center p-10">
          <div className="max-w-md rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-center">
            <h2 className="font-display text-lg font-semibold">{t('console.playground.chat.error.noModels')}</h2>
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              {t('console.playground.chat.error.noModelsHint')}
            </p>
            <Link to="/console" className="mt-5 inline-block">
              <Button size="sm">{t('console.playground.chat.error.backHome')}</Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-[240px_1fr_280px] overflow-hidden">
          <SessionList
            sessions={sessions}
            activeId={activeId}
            onSelect={setActiveId}
            onCreate={onCreate}
            onDelete={onDelete}
            canCreate={models.length > 0}
          />

          <div className="flex min-w-0 flex-col">
            {active ? (
              <>
                <MessageList messages={active.messages} />
                <Composer
                  streaming={streaming}
                  disabled={!token || !active.model}
                  onSend={onSend}
                  onStop={stop}
                />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-[color:var(--muted)]">
                <Button size="sm" onClick={onCreate} disabled={models.length === 0}>
                  {t('console.playground.chat.newSession')}
                </Button>
              </div>
            )}
          </div>

          <ParamsPanel
            models={models}
            model={active?.model ?? ''}
            systemPrompt={active?.systemPrompt ?? ''}
            params={active?.params ?? DEFAULT_PARAMS}
            disabled={!active || streaming}
            onModelChange={(m) => active && updateActive({ ...active, model: m })}
            onSystemPromptChange={(v) => active && updateActive({ ...active, systemPrompt: v })}
            onParamsChange={(p) => active && updateActive({ ...active, params: p })}
          />
        </div>
      )}
    </div>
  )
}

function truncateTitle(s: string): string {
  const trimmed = s.trim().replace(/\s+/g, ' ')
  return trimmed.length > 40 ? trimmed.slice(0, 40) + '…' : trimmed
}

function formatQuota(q: number): string {
  if (q >= 1_000_000) return `${(q / 1_000_000).toFixed(2)}M`
  if (q >= 1_000) return `${(q / 1_000).toFixed(1)}K`
  return String(q)
}
