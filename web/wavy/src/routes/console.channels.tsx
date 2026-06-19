import { createFileRoute, redirect } from '@tanstack/react-router'
import { ChannelsSection } from '@/components/console/ChannelsSection'
import { PricingSection } from '@/components/console/pricing/PricingSection'
import { getSession, isAdmin } from '@/lib/session'
import { Role } from '@/lib/types'

export const Route = createFileRoute('/console/channels')({
  beforeLoad: async () => {
    const user = await getSession()
    if (!isAdmin(user)) throw redirect({ to: '/console' })
    // Gate the root-only pricing editor on the same server-validated session
    // the route guard already trusts — not a mutable React Query cache that a
    // non-root user could tamper with to reveal the editor.
    return { isRoot: (user?.role ?? Role.Guest) >= Role.RootUser }
  },
  component: ChannelsPage,
})

function ChannelsPage() {
  // Channels management is admin; the pricing editor below is root-only.
  const { isRoot } = Route.useRouteContext()

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
