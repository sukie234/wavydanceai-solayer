import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { Sidebar } from '@/components/console/Sidebar'
import { Topbar } from '@/components/console/Topbar'
import { VendorIconDefs } from '@/components/landing/VendorIcons'
import { getSession } from '@/lib/session'

export const Route = createFileRoute('/console')({
  beforeLoad: async ({ location }) => {
    const user = await getSession()
    if (!user) {
      // location.search is a parsed object; location.href is the string form.
      throw redirect({
        to: '/login',
        search: { next: location.href },
      })
    }
    return { user }
  },
  component: ConsoleLayout,
})

function ConsoleLayout() {
  return (
    <div className="flex min-h-screen bg-[color:var(--bg)]">
      <VendorIconDefs />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <Outlet />
      </div>
    </div>
  )
}
