import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/console/PageHeader'
import { PricingEditor, type RatioKey } from '@/components/console/pricing/PricingEditor'
import { optionsService, optionsToMap } from '@/lib/services/options'
import { channelsService } from '@/lib/services/channels'
import { parseRatioMap } from '@/lib/pricing'

/** Missing option → empty map; present-but-unparseable → null (refuse to edit). */
function parseOption(value: string | undefined) {
  if (value === undefined || value.trim() === '') return {}
  return parseRatioMap(value)
}

/** Pricing editor (root only) scoped to the models the channels provide. Shares
 * the ['channels'] query prefix so a channel add/edit refreshes the model rows. */
export function PricingSection() {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const { data, isError } = useQuery({
    queryKey: ['options'],
    queryFn: () => optionsService.list(),
  })

  const {
    data: channels,
    isLoading: channelsLoading,
    isError: channelsError,
  } = useQuery({
    queryKey: ['channels', 'all'],
    queryFn: () => channelsService.listAll(),
  })

  const providedModels = useMemo(() => {
    const set = new Set<string>()
    for (const c of channels ?? []) {
      for (const m of (c.models ?? '').split(',')) {
        const name = m.trim()
        if (name) set.add(name)
      }
    }
    return [...set].sort()
  }, [channels])

  const initial = useMemo(() => {
    if (!data) return null
    const map = optionsToMap(data)
    return {
      group: parseOption(map.GroupRatio),
      model: parseOption(map.ModelRatio),
      completion: parseOption(map.CompletionRatio),
    }
  }, [data])

  const parseFailed = initial !== null && (!initial.group || !initial.model || !initial.completion)
  const loading = (!initial && !isError) || channelsLoading

  return (
    <div>
      <PageHeader kicker={t('ratios.kicker')} title={t('ratios.title')} lead={t('ratios.lead')} />

      {loading && (
        <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-5 py-16 text-center text-sm text-[color:var(--muted)]">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
          {t('ratios.loading')}
        </div>
      )}

      {(isError || channelsError || parseFailed) && (
        <div className="rounded-lg border border-[color:var(--coral)]/30 bg-[color:var(--coral)]/8 px-4 py-3 text-sm text-[color:var(--coral)]">
          {t(isError || channelsError ? 'ratios.fetchError' : 'ratios.loadError')}
        </div>
      )}

      {!loading && initial && !parseFailed && !channelsError && (
        <PricingEditor
          // Remount when the provided set changes so newly-added channel models
          // flow in as fresh rows.
          key={providedModels.join(',')}
          groupRatio={initial.group!}
          modelRatio={initial.model!}
          completionRatio={initial.completion!}
          providedModels={providedModels}
          onSave={async (key: RatioKey, value: string) => {
            await optionsService.update(key, value)
            await qc.invalidateQueries({ queryKey: ['options'] })
          }}
          onSaveBatch={async (keys: Partial<Record<RatioKey, string>>) => {
            await optionsService.updateBatch(keys)
            await qc.invalidateQueries({ queryKey: ['options'] })
          }}
        />
      )}
    </div>
  )
}
