import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChannelsSection } from '@/components/console/ChannelsSection'
import { PricingSection } from '@/components/console/pricing/PricingSection'
import { authService } from '@/lib/services/auth'
import { getSession, isAdmin } from '@/lib/session'
import { Role } from '@/lib/types'

export const Route = createFileRoute('/console/channels')({
  beforeLoad: async () => {
    const user = await getSession()
    if (!isAdmin(user)) throw redirect({ to: '/console' })
  },
  component: ChannelsPage,
})

function ChannelsPage() {
  // Channels management is admin; the pricing editor below is root-only. Mirror
  // the sidebar's ['self'] query so this reacts to role without a reload.
  const { data: user } = useQuery({
    queryKey: ['self'],
    queryFn: () => authService.getSelf(),
    staleTime: 30_000,
  })
  const isRoot = (user?.role ?? Role.Guest) >= Role.RootUser

  return (
    <div className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-8 lg:px-10">
      <ChannelsSection />
      {isRoot && (
        <div className="mt-12 border-t border-[color:var(--border)] pt-10">
          <PricingSection />
        </div>
      )}
    </div>
  )
}
