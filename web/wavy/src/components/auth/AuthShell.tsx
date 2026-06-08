import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/lib/theme'

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
            <LogoMark />
          </div>
          <div className="kicker">{t(kickerKey)}</div>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-[-1px]">{t(titleKey)}</h1>
        </div>

        {children}
      </div>
    </div>
  )
}

function LogoMark() {
  const { theme } = useTheme()
  const src =
    theme === 'dark'
      ? 'https://mintcdn.com/solayerlabsinc/ehaIHrCi02AamVTV/images/logo-dark.svg?fit=max&auto=format&n=ehaIHrCi02AamVTV&q=85&s=2f6e56d868d5149426f1c475850b010c'
      : 'https://mintcdn.com/solayerlabsinc/ehaIHrCi02AamVTV/images/logo-light.svg?fit=max&auto=format&n=ehaIHrCi02AamVTV&q=85&s=db21e2d43a937526636dbee85dd895b3'
  return <img src={src} alt="Solayer" className="h-8 w-auto" />
}
