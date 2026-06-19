import { createFileRoute, redirect } from '@tanstack/react-router'

// The standalone models page was merged into /console/channels, where the model
// list is derived from channels and priced inline. Keep the path as a redirect
// so existing links/bookmarks don't 404.
export const Route = createFileRoute('/console/models')({
  beforeLoad: () => {
    throw redirect({ to: '/console/channels' })
  },
})
