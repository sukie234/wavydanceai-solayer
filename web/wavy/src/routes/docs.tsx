import { useEffect } from 'react'
import { Outlet, createFileRoute } from '@tanstack/react-router'
import { DocsSidebar } from '@/components/docs/DocsSidebar'
import { DocsTopbar } from '@/components/docs/DocsTopbar'

export const Route = createFileRoute('/docs')({
  component: DocsLayout,
})

function DocsLayout() {
  // Match the marketing site's light-mode treatment so users coming from
  // the landing nav don't get a jarring theme flip.
  useEffect(() => {
    const root = document.documentElement
    const prev = root.getAttribute('data-theme')
    root.setAttribute('data-theme', 'light')
    return () => {
      if (prev) root.setAttribute('data-theme', prev)
      else root.removeAttribute('data-theme')
    }
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-[color:var(--bg)]">
      <DocsTopbar />
      <div className="flex min-h-0 flex-1">
        <DocsSidebar />
        <main className="flex min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
