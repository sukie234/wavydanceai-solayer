import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { playgroundService } from '@/lib/services/playground'
import { authService } from '@/lib/services/auth'
import {
  defaultParamsFor,
  resolveModelSpec,
  type Modality,
} from '../modelSpecs'
import { DynamicParamsPanel } from '../DynamicParamsPanel'
import { SessionList } from '../SessionList'
import { ResultGallery } from './ResultGallery'
import { PromptComposer } from './PromptComposer'
import { useMediaGenerate } from './useMediaGenerate'
import { mediaSessionStore } from './sessionStore'
import type { MediaSession } from './types'

type Props = { modality: Modality }

/**
 * Shared playground shell for image and video generation. The only thing that
 * varies between the two routes is which model list to load and which model
 * spec resolver to use — both are picked from `modality`.
 */
export function MediaPlayground({ modality }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const { data: token, isError: tokenError } = useQuery({
    queryKey: ['playground', 'token'],
    queryFn: () => playgroundService.getToken(),
    staleTime: Infinity,
  })

  const { data: models = [], isLoading: loadingModels } = useQuery({
    queryKey: ['playground', `${modality}_models`],
    queryFn: () =>
      modality === 'image'
        ? playgroundService.listImageModels()
        : playgroundService.listVideoModels(),
    staleTime: 5 * 60_000,
  })

  const { data: user } = useQuery({
    queryKey: ['self'],
    queryFn: () => authService.getSelf(),
    staleTime: 30_000,
  })

  const [sessions, setSessions] = useState<MediaSession[]>(() =>
    mediaSessionStore.list(modality),
  )
  const [activeId, setActiveId] = useState<string | null>(
    () => mediaSessionStore.list(modality)[0]?.id ?? null,
  )
  const active = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId],
  )

  const spec = useMemo(
    () => resolveModelSpec(modality, active?.model ?? models[0] ?? ''),
    [modality, active?.model, models],
  )

  // Default the active session's model when the model list arrives, or when
  // the user picks a session whose model is no longer in the allowed list.
  useEffect(() => {
    if (!active || models.length === 0) return
    if (!active.model || !models.includes(active.model)) {
      const next = models[0]
      const nextSpec = resolveModelSpec(modality, next)
      updateActive({ ...active, model: next, params: defaultParamsFor(nextSpec) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models.join('|'), active?.id])

  const { busy, error, task, generate, resume, abort } = useMediaGenerate()

  const persist = useCallback(
    (next: MediaSession) => {
      mediaSessionStore.save(modality, next)
      setSessions(mediaSessionStore.list(modality))
    },
    [modality],
  )

  // Patch a single job in any session without changing focus. Re-reads the
  // freshest copy from the store so background polling can't clobber edits
  // the user made in the meantime.
  const patchJob = useCallback(
    (sessionId: string, jobId: string, patch: Partial<MediaSession['jobs'][number]>) => {
      const current = mediaSessionStore.list(modality).find((s) => s.id === sessionId)
      if (!current) return
      const idx = current.jobs.findIndex((j) => j.id === jobId)
      if (idx < 0) return
      const updated = [...current.jobs]
      updated[idx] = { ...updated[idx], ...patch, updatedAt: Date.now() }
      persist({ ...current, jobs: updated })
    },
    [modality, persist],
  )

  const updateActive = useCallback(
    (next: MediaSession) => {
      persist(next)
      setActiveId(next.id)
    },
    [persist],
  )

  const onCreate = () => {
    if (loadingModels || models.length === 0) return
    const fresh = mediaSessionStore.create(modality, models[0] ?? '')
    setSessions(mediaSessionStore.list(modality))
    setActiveId(fresh.id)
  }

  const onDelete = (id: string) => {
    mediaSessionStore.remove(modality, id)
    const remaining = mediaSessionStore.list(modality)
    setSessions(remaining)
    if (activeId === id) setActiveId(remaining[0]?.id ?? null)
  }

  const onModelChange = (next: string) => {
    if (!active) return
    const nextSpec = resolveModelSpec(modality, next)
    updateActive({ ...active, model: next, params: defaultParamsFor(nextSpec) })
  }

  const onParamsChange = (params: Record<string, unknown>) => {
    if (!active) return
    updateActive({ ...active, params })
  }

  const onSend = async (prompt: string) => {
    if (!active || !token || !active.model) return

    const job = mediaSessionStore.newJob(prompt, active.model, active.params)
    const optimistic: MediaSession = {
      ...active,
      title: active.jobs.length === 0 ? truncateTitle(prompt) : active.title,
      jobs: [...active.jobs, job],
    }
    updateActive(optimistic)

    const sessionId = active.id
    try {
      const results = await generate({
        apiKey: token,
        spec,
        model: active.model,
        prompt,
        params: active.params,
        // Persist the relay task id so the job survives a refresh with a
        // pointer back to GET /v1/videos/:id.
        onTask: (taskId) => patchJob(sessionId, job.id, { taskId }),
      })
      patchJob(sessionId, job.id, { status: 'succeeded', results })
    } catch (e) {
      patchJob(sessionId, job.id, {
        status: 'failed',
        error: e instanceof Error ? e.message : String(e),
      })
    } finally {
      qc.invalidateQueries({ queryKey: ['self'] })
    }
  }

  // Resume polling for a pending video job left over from a previous mount
  // (page reload / tab revisit). The original generate() promise is gone, so
  // without this the progress indicator would hang and the job would never
  // settle. Only the active session's most-recent pending task is resumed —
  // the submit button is disabled while one is in flight, so there's at most
  // one. A fresh submit doesn't retrigger this (active.id is unchanged), so it
  // never double-polls a job generate() is already driving.
  useEffect(() => {
    if (modality !== 'video' || !token || !active) return
    const pending = [...active.jobs].reverse().find((j) => j.status === 'pending' && j.taskId)
    if (!pending?.taskId) return
    const sessionId = active.id
    let cancelled = false
    resume(pending.taskId, token)
      .then((results) => {
        if (cancelled || results.length === 0) return
        patchJob(sessionId, pending.id, { status: 'succeeded', results })
      })
      .catch((e) => {
        if (cancelled) return
        patchJob(sessionId, pending.id, {
          status: 'failed',
          error: e instanceof Error ? e.message : String(e),
        })
      })
    return () => {
      cancelled = true
      abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, token, modality])

  // On mount, settle stale 'pending' jobs from a previous session: their
  // generate() promise died with the old mount. Resumable video tasks (with a
  // taskId) are revived by the effect above; everything else — notably any
  // interrupted synchronous image — is marked failed so it stops showing an
  // infinite spinner and the composer unlocks.
  useEffect(() => {
    let sweptAny = false
    for (const s of mediaSessionStore.list(modality)) {
      let changed = false
      const jobs = s.jobs.map((j) => {
        if (j.status !== 'pending') return j
        if (modality === 'video' && j.taskId) return j
        changed = true
        return {
          ...j,
          status: 'failed' as const,
          error: t('console.playground.interrupted'),
          updatedAt: Date.now(),
        }
      })
      if (changed) {
        mediaSessionStore.save(modality, { ...s, jobs })
        sweptAny = true
      }
    }
    if (sweptAny) setSessions(mediaSessionStore.list(modality))
    // run once per mount; modality is stable for a mounted playground
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
            {t(`console.playground.${modality}.title`)}
          </h1>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs text-[color:var(--muted)]">
          <span>
            {t('console.playground.chat.quota.remaining', {
              quota: formatQuota(remainingQuota),
            })}
          </span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 border-b border-[color:var(--border)] bg-[color:var(--bg2)] px-6 py-2 text-xs text-[color:var(--text)]">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          <span className="flex-1 break-words">{error}</span>
          <Link to="/console/topup" className="ml-auto text-[color:var(--cyan)] hover:underline">
            {t('console.playground.chat.error.topup')}
          </Link>
        </div>
      )}

      {tokenError && (
        <div className="flex items-center gap-2 border-b border-[color:var(--border)] bg-[color:var(--bg2)] px-6 py-2 text-xs text-[color:var(--text)]">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          <span className="flex-1 break-words">{t('console.playground.chat.error.token')}</span>
        </div>
      )}

      {loadingModels ? (
        <div className="flex flex-1 items-center justify-center p-10 text-sm text-[color:var(--muted)]">
          {t('console.playground.chat.loadingModels')}
        </div>
      ) : noModels ? (
        <div className="flex flex-1 items-center justify-center p-10">
          <div className="max-w-md rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-center">
            <h2 className="font-display text-lg font-semibold">
              {t(`console.playground.${modality}.error.noModels`)}
            </h2>
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              {t(`console.playground.${modality}.error.noModelsHint`)}
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
            createLabelKey={`console.playground.${modality}.newSession`}
            emptyLabelKey={`console.playground.${modality}.empty`}
            untitledLabelKey="console.playground.chat.untitled"
          />

          <div className="flex min-h-0 min-w-0 flex-col">
            {active ? (
              <>
                <ResultGallery modality={modality} jobs={active.jobs} activeTask={task} />
                <PromptComposer
                  busy={busy}
                  disabled={!token || !active.model}
                  placeholderKey={`console.playground.${modality}.placeholder`}
                  maxLength={spec.promptMaxLength}
                  onSend={onSend}
                  onAbort={abort}
                />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-[color:var(--muted)]">
                <Button size="sm" onClick={onCreate} disabled={models.length === 0}>
                  {t(`console.playground.${modality}.newSession`)}
                </Button>
              </div>
            )}
          </div>

          <DynamicParamsPanel
            models={models}
            model={active?.model ?? ''}
            params={active?.params ?? {}}
            spec={spec}
            disabled={!active || busy}
            onModelChange={onModelChange}
            onParamsChange={onParamsChange}
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
