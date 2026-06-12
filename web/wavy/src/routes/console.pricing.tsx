import { useMemo } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/console/PageHeader'
import { PricingEditor, type RatioKey } from '@/components/console/pricing/PricingEditor'
import { optionsService, optionsToMap } from '@/lib/services/options'
import { parseRatioMap } from '@/lib/pricing'
import { getSession } from '@/lib/session'
import { Role } from '@/lib/types'

export const Route = createFileRoute('/console/pricing')({
  beforeLoad: async () => {
    const user = await getSession()
    if (!user || user.role < Role.RootUser) throw redirect({ to: '/console' })
  },
  component: PricingPage,
})

/** Missing option → empty map; present-but-unparseable → null (refuse to edit). */
function parseOption(value: string | undefined) {
  if (value === undefined || value.trim() === '') return {}
  return parseRatioMap(value)
}

function PricingPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data, isError } = useQuery({
    queryKey: ['options'],
    queryFn: () => optionsService.list(),
  })

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

  return (
    <div className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-8 lg:px-10">
      <PageHeader kicker={t('ratios.kicker')} title={t('ratios.title')} lead={t('ratios.lead')} />

      {!initial && !isError && (
        <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-5 py-16 text-center text-sm text-[color:var(--muted)]">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
          {t('ratios.loading')}
        </div>
      )}

      {(isError || parseFailed) && (
        <div className="rounded-lg border border-[color:var(--coral)]/30 bg-[color:var(--coral)]/8 px-4 py-3 text-sm text-[color:var(--coral)]">
          {t(isError ? 'ratios.fetchError' : 'ratios.loadError')}
        </div>
      )}

      {initial && !parseFailed && (
        <PricingEditor
          groupRatio={initial.group!}
          modelRatio={initial.model!}
          completionRatio={initial.completion!}
          onSave={async (key: RatioKey, value: string) => {
            await optionsService.update(key, value)
            await qc.invalidateQueries({ queryKey: ['options'] })
          }}
        />
      )}
    </div>
  )
}
