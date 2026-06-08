import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BrandMark } from '@/components/BrandMark'

type Props = {
  /** i18n key for the small uppercase eyebrow above the title. */
  kickerKey: string
  /** i18n key for the page H1. */
  titleKey: string
  children: ReactNode
}

/**
 * Centered shell shared by all unauthenticated routes (login, register,
 * forgot/reset password). Renders the wordmark + ambient glows + page title;
 * the caller plugs in their own card (typically a `<form>` element).
 */
export function AuthShell({ kickerKey, titleKey, children }: Props) {
  const { t } = useTranslation()
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-[color:var(--bg)] to-[color:var(--bg2)] px-6">
      {/* ambient glows */}
      <div
        className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full opacity-60 blur-[120px]"
        style={{ background: 'radial-gradient(circle, var(--mint), transparent 65%)', opacity: 'var(--glow-op)' }}
      />
      <div
        className="pointer-events-none absolute -right-32 bottom-0 h-[460px] w-[460px] rounded-full opacity-50 blur-[120px]"
        style={{ background: 'radial-gradient(circle, var(--cyan), transparent 65%)', opacity: 'var(--glow-op)' }}
      />

      <div className="relative z-10 w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2.5">
            <BrandMark size={32} />
            <span className="font-display text-xl font-bold tracking-[-0.5px]">
              wavydance<span className="text-current-ink">.ai</span>
            </span>
          </div>
          <div className="kicker">{t(kickerKey)}</div>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-[-1px]">{t(titleKey)}</h1>
        </div>

        {children}
      </div>
    </div>
  )
}
