import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { MessageSquare, Image as ImageIcon, Video } from 'lucide-react'
import { PageHeader } from '@/components/console/PageHeader'
import { ModalityCard } from '@/components/playground/ModalityCard'

export const Route = createFileRoute('/console/playground/')({
  component: PlaygroundIndex,
})

function PlaygroundIndex() {
  const { t } = useTranslation()

  return (
    <div className="mx-auto w-full max-w-[1200px] flex-1 px-6 py-8 lg:px-10">
      <PageHeader
        kicker={t('console.playground.kicker')}
        title={t('console.playground.title')}
        lead={t('console.playground.subtitle')}
      />

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/console/playground/chat">
          <ModalityCard
            icon={MessageSquare}
            title={t('console.playground.modality.chat')}
            description={t('console.playground.modality.chatDesc')}
            cta={t('console.playground.modality.open')}
          />
        </Link>

        <Link to="/console/playground/image">
          <ModalityCard
            icon={ImageIcon}
            title={t('console.playground.modality.image')}
            description={t('console.playground.modality.imageDesc')}
            cta={t('console.playground.modality.open')}
          />
        </Link>

        <Link to="/console/playground/video">
          <ModalityCard
            icon={Video}
            title={t('console.playground.modality.video')}
            description={t('console.playground.modality.videoDesc')}
            cta={t('console.playground.modality.open')}
          />
        </Link>
      </section>
    </div>
  )
}
