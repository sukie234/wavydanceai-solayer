import { useTranslation } from 'react-i18next'

export type TopModelEntry = {
  name: string
  quota: number
  requests: number
}

/** Map a raw model name to a vendor icon id from VendorIcons defs. */
function iconForModel(name: string): string {
  const n = name.toLowerCase()
  if (n.startsWith('gpt') || n.includes('openai') || n.startsWith('o1') || n.startsWith('o3')) return 'ic-openai'
  if (n.includes('claude') || n.includes('anthropic')) return 'ic-anthropic'
  if (n.includes('gemini') || n.includes('google') || n.startsWith('veo')) return 'ic-google'
  if (n.includes('deepseek')) return 'ic-deepseek'
  if (n.includes('qwen')) return 'ic-qwen'
  if (n.includes('llama') || n.includes('meta')) return 'ic-meta'
  if (n.includes('mistral')) return 'ic-mistral'
  if (n.includes('grok') || n.includes('xai')) return 'ic-xai'
  if (n.includes('kimi') || n.includes('moonshot')) return 'ic-kimi'
  if (n.includes('glm') || n.includes('zhipu')) return 'ic-zhipu'
  if (n.includes('flux')) return 'ic-bfl'
  if (n.includes('runway')) return 'ic-runway'
  if (n.includes('kling')) return 'ic-kling'
  if (n.includes('minimax') || n.includes('hailuo')) return 'ic-minimax'
  if (n.startsWith('sd') || n.includes('stable-diffusion')) return 'ic-sd'
  return 'ic-openai'
}

type Props = {
  data?: TopModelEntry[]
  loading?: boolean
}

export function TopModelsPanel({ data, loading }: Props) {
  const { t } = useTranslation()
  const rows = (data ?? []).slice(0, 5)
  const max = rows.length ? Math.max(...rows.map((m) => m.quota), 1) : 1

  return (
    <div className="flex h-full flex-col rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
      <header className="mb-5 flex items-baseline justify-between">
        <h3 className="font-display text-base font-bold tracking-[-0.3px]">{t('console.dash.topModels')}</h3>
        <span className="font-mono text-xs tracking-[1.5px] text-[color:var(--muted)] uppercase">7d</span>
      </header>

      <div className="flex flex-1 flex-col gap-3.5">
        {loading && <Skeleton n={5} />}
        {!loading && rows.length === 0 && (
          <div className="flex flex-1 items-center justify-center py-6 text-center text-xs text-[color:var(--muted)]">
            {t('console.dash.noModels')}
          </div>
        )}
        {!loading &&
          rows.map((m, i) => (
            <div key={m.name} className="grid grid-cols-[20px_1fr_auto] items-center gap-2.5">
              <span className="font-mono text-xs font-bold text-[color:var(--muted)]/70">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0">
                <div className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium">{m.name}</div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-[color:var(--border)]/60">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-[#3FB3D9] via-[#4ED4DC] to-[#B5ECF2]"
                    style={{ width: `${(m.quota / max) * 100}%`, transition: 'width 700ms cubic-bezier(.22,.8,.3,1)' }}
                  />
                </div>
              </div>
              <span className="text-right font-mono text-xs tabular-nums text-[color:var(--muted)]">
                {formatQuota(m.quota)}
              </span>
            </div>
          ))}
      </div>
    </div>
  )
}

// Suppress unused-import warning when iconForModel ends up unused at a future
// trim — keep the helper exported for callers who want vendor chips.
export { iconForModel }

function Skeleton({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="grid grid-cols-[20px_1fr_auto] items-center gap-2.5">
          <span className="h-3 w-3 rounded bg-[color:var(--border)]/40" />
          <div className="min-w-0">
            <div className="h-3.5 w-32 rounded bg-[color:var(--border)]/40" />
            <div className="mt-1.5 h-1 rounded-full bg-[color:var(--border)]/30" />
          </div>
          <div className="h-3 w-8 rounded bg-[color:var(--border)]/40" />
        </div>
      ))}
    </>
  )
}

function formatQuota(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return Math.round(n).toString()
}
