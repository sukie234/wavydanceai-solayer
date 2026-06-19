import { createFileRoute, redirect } from '@tanstack/react-router'

// Pricing moved into the merged /console/channels page (root-only section).
// Keep the path as a redirect so existing links/bookmarks don't 404.
export const Route = createFileRoute('/console/pricing')({
  beforeLoad: () => {
    throw redirect({ to: '/console/channels' })
  },
})
