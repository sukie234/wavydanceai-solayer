import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { statusService } from '@/lib/services/status'

/**
 * Cloudflare Turnstile integration for the auth flows.
 *
 * The backend middleware (middleware/turnstile-check.go) reads the token from
 * the `turnstile` query param on /api/verification, /api/reset_password and
 * /api/user/register, verifies it against siteverify, then marks the session
 * (`turnstile=true`) so follow-up requests in the same session skip the check.
 *
 * Tokens are single-use (consumed by siteverify) and expire after ~5 minutes,
 * so callers must `reset()` after any failed request that carried a token.
 *
 * Usage:
 *   const turnstile = useTurnstile()
 *   <TurnstileWidget state={turnstile} />          // renders null when the
 *                                                  // admin switch is off
 *   <Button disabled={!turnstile.ready} />         // gate submit on token
 *   service.call(..., turnstile.token ?? undefined)
 *   catch { turnstile.reset() }
 */

interface TurnstileRenderOptions {
  sitekey: string
  theme?: 'auto' | 'light' | 'dark'
  callback?: (token: string) => void
  'expired-callback'?: () => void
  'error-callback'?: () => void
}

interface TurnstileApi {
  render: (el: HTMLElement, options: TurnstileRenderOptions) => string
  reset: (widgetId?: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let scriptPromise: Promise<void> | null = null

/** Load the Cloudflare script once per page; resolve immediately if present. */
function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = SCRIPT_SRC
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => {
        scriptPromise = null // allow a retry on next mount
        script.remove()
        reject(new Error('failed to load turnstile script'))
      }
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

export interface TurnstileState {
  /** Admin toggled Turnstile on AND a site key is configured. */
  enabled: boolean
  siteKey: string
  /** Current token; null before solve, after expiry, and after reset(). */
  token: string | null
  /** True when the caller may submit: Turnstile is off or a token exists. */
  ready: boolean
  /** Drop the (consumed) token and ask the widget for a fresh one. */
  reset: () => void
  /** @internal wired up by <TurnstileWidget> */
  _setToken: (token: string | null) => void
  /** @internal wired up by <TurnstileWidget> */
  _widgetIdRef: { current: string | null }
}

export function useTurnstile(): TurnstileState {
  const { data: status } = useQuery({
    queryKey: ['public-status'],
    queryFn: () => statusService.get(),
    staleTime: 60_000,
  })
  const enabled = !!status?.turnstile_check && !!status?.turnstile_site_key
  const [token, setToken] = useState<string | null>(null)
  const widgetIdRef = useRef<string | null>(null)

  const reset = useCallback(() => {
    setToken(null)
    if (widgetIdRef.current !== null) window.turnstile?.reset(widgetIdRef.current)
  }, [])

  return {
    enabled,
    siteKey: status?.turnstile_site_key ?? '',
    token,
    ready: !enabled || token !== null,
    reset,
    _setToken: setToken,
    _widgetIdRef: widgetIdRef,
  }
}

/**
 * Renders the Turnstile challenge. Returns null while the admin switch is off
 * so callers can mount it unconditionally — same toggle↔UI principle as the
 * passkey gate (#68).
 */
export function TurnstileWidget({ state, className }: { state: TurnstileState; className?: string }) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { enabled, siteKey, _setToken: setToken, _widgetIdRef: widgetIdRef } = state

  useEffect(() => {
    if (!enabled || !siteKey) return
    let cancelled = false
    loadTurnstileScript()
      .then(() => {
        const turnstile = window.turnstile
        if (cancelled || !turnstile || !containerRef.current || widgetIdRef.current !== null) return
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'auto',
          callback: (token) => setToken(token),
          // Tokens expire after ~5 minutes — clear ours and ask for a fresh one.
          'expired-callback': () => {
            setToken(null)
            if (widgetIdRef.current !== null) window.turnstile?.reset(widgetIdRef.current)
          },
          'error-callback': () => setToken(null),
        })
      })
      .catch(() => {
        // Script blocked / offline: token stays null so submit stays disabled
        // rather than letting a doomed request through.
      })
    return () => {
      cancelled = true
      if (widgetIdRef.current !== null) {
        window.turnstile?.remove(widgetIdRef.current)
        widgetIdRef.current = null
        setToken(null)
      }
    }
  }, [enabled, siteKey, setToken, widgetIdRef])

  if (!enabled) return null

  return (
    <div className={className ?? 'mb-4'}>
      <div ref={containerRef} />
      {state.token === null && (
        <span className="mt-1 block text-xs text-[color:var(--muted)]/80">
          {t('turnstile.hint')}
        </span>
      )}
    </div>
  )
}
