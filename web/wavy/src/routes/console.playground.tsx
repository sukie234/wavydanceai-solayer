import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/console/playground')({
  component: PlaygroundLayout,
})

function PlaygroundLayout() {
  // Layout just renders children; the modality picker is the index route and
  // each modality (chat / image / video) has its own child route. Keeping a
  // dedicated layout means future shared UI (header tabs, breadcrumbs, quota
  // banner) lands here without restructuring routes.
  return <Outlet />
}
