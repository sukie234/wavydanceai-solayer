import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ScrollText } from 'lucide-react'
import type { Log } from '@/lib/types'
import { LOG_TYPE_LABEL } from '@/lib/services/logs'

type Props = {
  logs?: Log[]
  loading?: boolean
}

/**
 * Recent API-call activity sourced from /api/log/self. There is no
 * separate audit-events endpoint on the backend, so "recent activity"
 * for an LLM gateway is most usefully the last few real requests.
 */
export function ActivityFeed({ logs, loading }: Props) {
  const { t } = useTranslation()
  const rows = (logs ?? []).slice(0, 5)

  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
      <header className="mb-5 flex items-baseline justify-between">
        <h3 className="font-display text-base font-bold tracking-[-0.3px]">{t('console.dash.activity')}</h3>
        <Link
          to="/console/logs"
          className="font-mono text-xs uppercase tracking-[1.5px] text-[color:var(--cyan)] hover:underline"
        >
          {t('console.dash.openLog')} →
        </Link>
      </header>

      <ol className="relative">
        <span className="absolute bottom-3 left-[15px] top-3 w-px bg-[color:var(--border)]" />
        {loading && <Skeleton n={5} />}
        {!loading && rows.length === 0 && (
          <li className="py-6 text-center text-xs text-[color:var(--muted)]">{t('console.dash.noActivity')}</li>
        )}
        {!loading &&
          rows.map((log) => (
            <li key={log.id} className="relative grid grid-cols-[32px_1fr_auto] items-start gap-3 py-2.5">
              <span
                className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--cyan)]/40 bg-[color:var(--surface)]"
              >
                <ScrollText className="h-3.5 w-3.5 text-[color:var(--cyan)]" strokeWidth={2.25} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-[color:var(--text)]">
                  {log.model_name || LOG_TYPE_LABEL[log.type] || '—'}
                </div>
                <div className="mt-0.5 truncate font-mono text-xs text-[color:var(--muted)]">
                  {log.token_name && `tk:${log.token_name} · `}
                  {log.prompt_tokens.toLocaleString()} in / {log.completion_tokens.toLocaleString()} out
                  {log.elapsed_time ? ` · ${log.elapsed_time}ms` : ''}
                </div>
              </div>
              <span className="font-mono text-xs tabular-nums text-[color:var(--muted)]/70">
                {relativeTime(log.created_at)}
              </span>
            </li>
          ))}
      </ol>
    </div>
  )
}

function Skeleton({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <li key={i} className="relative grid grid-cols-[32px_1fr_auto] items-start gap-3 py-2.5">
          <span className="h-8 w-8 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)]" />
          <div className="min-w-0 space-y-1.5">
            <div className="h-3.5 w-40 rounded bg-[color:var(--border)]/40" />
            <div className="h-3 w-56 rounded bg-[color:var(--border)]/30" />
          </div>
          <div className="h-3 w-10 rounded bg-[color:var(--border)]/40" />
        </li>
      ))}
    </>
  )
}

/** Compact "5m / 1h / 3d" style for a unix-second timestamp. */
function relativeTime(unixSec: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - unixSec))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}
