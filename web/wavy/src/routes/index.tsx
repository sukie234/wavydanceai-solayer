import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Nav } from '@/components/landing/Nav'
import { Hero } from '@/components/landing/Hero'
import { Marquee } from '@/components/landing/Marquee'
import { Demo } from '@/components/landing/Demo'
import { Leaderboard } from '@/components/landing/Leaderboard'
import { Showcase } from '@/components/landing/Showcase'
import { Flow } from '@/components/landing/Flow'
import { Pricing } from '@/components/landing/Pricing'
import { QA } from '@/components/landing/QA'
import { Footer } from '@/components/landing/Footer'
import { VendorIconDefs } from '@/components/landing/VendorIcons'

export const Route = createFileRoute('/')({
  component: Landing,
})

function Landing() {
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
    <>
      <VendorIconDefs />
      <Nav />
      <main>
        <Hero />
        <Marquee />
        <Demo />
        <Leaderboard />
        <Showcase />
        <Flow />
        <Pricing />
        <QA />
      </main>
      <Footer />
    </>
  )
}
