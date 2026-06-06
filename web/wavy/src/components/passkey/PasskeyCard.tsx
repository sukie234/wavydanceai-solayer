import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Trash2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { passkeyService } from '@/lib/services/passkey'
import { isWebAuthnSupported } from './passkey-ceremonies'

export function PasskeyCard() {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const supported = isWebAuthnSupported()

  const { data, isLoading } = useQuery({
    queryKey: ['passkeys'],
    queryFn: () => passkeyService.list(),
  })

  const add = useMutation({
    mutationFn: async () => {
      const name =
        window.prompt('Name this passkey (e.g. "MacBook Pro")', defaultDeviceLabel()) ?? ''
      if (!name.trim()) throw new Error('cancelled')
      return passkeyService.register(name.trim())
    },
    onSuccess: () => {
      setError(null)
      qc.invalidateQueries({ queryKey: ['passkeys'] })
    },
    onError: e => setError((e as Error).message),
  })

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => passkeyService.rename(id, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passkeys'] }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => passkeyService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passkeys'] }),
  })

  return (
    <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-7 shadow-[var(--shadow-jelly)]">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold tracking-[-0.5px]">Passkeys</h2>
          <p className="mt-0.5 text-sm text-[color:var(--muted)]">
            Use your device's biometric or screen lock to sign in without a password.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => add.mutate()}
          disabled={!supported || add.isPending}
          title={!supported ? 'This browser does not support WebAuthn' : undefined}
        >
          {add.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Add passkey
        </Button>
      </header>
      {error && (
        <div className="mb-3 rounded border border-[color:var(--coral)]/30 bg-[color:var(--coral)]/8 px-3 py-2 text-sm text-[color:var(--coral)]">
          {error}
        </div>
      )}
      {isLoading ? (
        <div className="flex items-center text-sm text-[color:var(--muted)]">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-[color:var(--muted)]">No passkeys registered yet.</p>
      ) : (
        <ul className="divide-y divide-[color:var(--border)]">
          {data.map(k => (
            <li key={k.id} className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm font-medium">{k.name || 'Unnamed Passkey'}</div>
                <div className="text-xs text-[color:var(--muted)]">
                  Added {fmt(k.created_at)} · Last used {k.last_used_at ? fmt(k.last_used_at) : 'never'}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    const name = window.prompt('New name', k.name) ?? ''
                    if (name.trim()) rename.mutate({ id: k.id, name: name.trim() })
                  }}
                  title="Rename"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm(`Delete passkey "${k.name}"?`)) remove.mutate(k.id)
                  }}
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function fmt(unix: number): string {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleString()
}

function defaultDeviceLabel(): string {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows PC'
  if (/Android/.test(ua)) return 'Android'
  return ''
}
