import { useTranslation } from 'react-i18next'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { Modality } from '../modelSpecs'
import type { TaskState } from './useMediaGenerate'
import type { MediaJob } from './types'

type Props = {
  modality: Modality
  jobs: MediaJob[]
  /** Live state of the in-flight async video task, if any. */
  activeTask?: TaskState | null
}

export function ResultGallery({ modality, jobs, activeTask }: Props) {
  const { t } = useTranslation()

  if (jobs.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center text-sm text-[color:var(--muted)]">
        <p>{t(`console.playground.${modality}.emptyResults`)}</p>
        <p className="font-mono text-[11px] uppercase tracking-[2px] text-[color:var(--muted)]/70">
          {t(`console.playground.${modality}.emptyResultsHint`)}
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} modality={modality} activeTask={activeTask} />
        ))}
      </div>
    </div>
  )
}

function JobCard({
  job,
  modality,
  activeTask,
}: {
  job: MediaJob
  modality: Modality
  activeTask?: TaskState | null
}) {
  const { t } = useTranslation()
  const liveTask = activeTask && job.taskId === activeTask.id ? activeTask : null

  return (
    <article className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm text-[color:var(--text)]">{job.prompt}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[1.5px] text-[color:var(--muted)]">
            <span>{job.model}</span>
            {Object.entries(job.params).map(([k, v]) => (
              <span key={k}>
                {k}: {String(v)}
              </span>
            ))}
          </div>
        </div>
        <StatusBadge status={job.status} />
      </header>

      {job.status === 'pending' && (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-[color:var(--border)] bg-[color:var(--bg2)] p-6 text-sm text-[color:var(--muted)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[color:var(--cyan)]" />
          {liveTask
            ? liveTask.status === 'in_progress'
              ? t('console.playground.video.task.inProgress', { progress: liveTask.progress })
              : t('console.playground.video.task.queued')
            : t(`console.playground.${modality}.generating`)}
        </div>
      )}

      {job.status === 'failed' && (
        <div className="flex items-start gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--bg2)] p-4 text-sm text-[color:var(--text)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span className="flex-1 break-words">{job.error}</span>
        </div>
      )}

      {job.status === 'succeeded' && job.results.length > 0 && (
        <div
          className={
            job.results.length === 1
              ? 'grid grid-cols-1 gap-3'
              : 'grid grid-cols-2 gap-3 sm:grid-cols-3'
          }
        >
          {job.results.map((r, i) => (
            <a
              key={`${job.id}-${i}`}
              href={r.url}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--bg2)] transition-colors hover:border-[color:var(--cyan)]"
            >
              {modality === 'image' ? (
                <img
                  src={r.url}
                  alt={`${job.prompt.slice(0, 60)}`}
                  className="h-auto w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <video
                  src={r.url}
                  className="h-auto w-full"
                  controls
                  preload="metadata"
                />
              )}
            </a>
          ))}
        </div>
      )}
    </article>
  )
}

function StatusBadge({ status }: { status: MediaJob['status'] }) {
  const { t } = useTranslation()
  const color =
    status === 'succeeded'
      ? 'border-emerald-500/40 text-emerald-500'
      : status === 'failed'
        ? 'border-red-500/40 text-red-500'
        : status === 'pending'
          ? 'border-[color:var(--cyan)]/40 text-[color:var(--cyan)]'
          : 'border-[color:var(--border)] text-[color:var(--muted)]'

  return (
    <span
      className={`shrink-0 rounded-full border bg-[color:var(--bg2)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[1.5px] ${color}`}
    >
      {t(`console.playground.status.${status}`)}
    </span>
  )
}
