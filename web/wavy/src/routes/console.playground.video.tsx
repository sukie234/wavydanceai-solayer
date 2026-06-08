import { createFileRoute } from '@tanstack/react-router'
import { MediaPlayground } from '@/components/playground/media/MediaPlayground'

export const Route = createFileRoute('/console/playground/video')({
  component: () => <MediaPlayground modality="video" />,
})
