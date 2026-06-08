import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/cn'

export function CodeBlock({
  code,
  lang,
  className,
}: {
  code: string
  lang?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      // Clipboard can fail in iframes / insecure contexts — silently ignore;
      // the code is still selectable.
    }
  }

  return (
    <div
      className={cn('relative overflow-hidden rounded-2xl border', className)}
      style={{
        background: 'var(--glass-bg)',
        borderColor: 'var(--glass-border)',
        backdropFilter: 'blur(42px) saturate(200%)',
        WebkitBackdropFilter: 'blur(42px) saturate(200%)',
        boxShadow: 'var(--glass-shadow)',
      }}
    >
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, var(--glass-edge), transparent)` }}
      />
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <span className="font-mono text-[0.72rem] uppercase tracking-[2px] text-[color:var(--code-muted)]">
          {lang ?? 'shell'}
        </span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[0.7rem] uppercase tracking-[1.5px] text-[color:var(--code-muted)] transition hover:bg-white/5 hover:text-[color:var(--code-text)]"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre className="m-0 overflow-x-auto p-5 font-mono text-[0.83rem] leading-[1.7] text-[color:var(--code-text)]">
        <code>{code}</code>
      </pre>
    </div>
  )
}
