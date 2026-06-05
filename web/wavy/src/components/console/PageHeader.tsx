import type { ReactNode } from 'react'

type Props = {
  kicker: string
  title: string
  lead?: string
  actions?: ReactNode
}

export function PageHeader({ kicker, title, lead, actions }: Props) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="font-mono text-xs uppercase tracking-[2.5px] text-[color:var(--cyan)]">{kicker}</div>
        <h1 className="mt-2 font-display text-[2rem] font-bold leading-tight tracking-[-1px]">{title}</h1>
        {lead && <p className="mt-1.5 text-sm text-[color:var(--muted)]">{lead}</p>}
      </div>
      {actions && <div className="flex gap-2.5">{actions}</div>}
    </header>
  )
}
