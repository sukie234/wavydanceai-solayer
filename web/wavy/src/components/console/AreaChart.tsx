import { useId } from 'react'

type Props = {
  data: { label: string; value: number }[]
  height?: number
  width?: number
}

export function AreaChart({ data, height = 240, width = 720 }: Props) {
  const id = useId().replace(/:/g, '')
  const pad = { top: 14, right: 20, bottom: 28, left: 44 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom

  const max = Math.max(...data.map((d) => d.value))
  const min = 0
  const range = max - min || 1
  const step = innerW / (data.length - 1)

  const pts = data.map((d, i) => {
    const x = pad.left + i * step
    const y = pad.top + (1 - (d.value - min) / range) * innerH
    return [x, y] as const
  })

  // Smooth curve via cardinal-like bezier
  const pathD = (() => {
    if (pts.length === 0) return ''
    let d = `M${pts[0][0]},${pts[0][1]}`
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1]
      const [x1, y1] = pts[i]
      const cx = (x0 + x1) / 2
      d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`
    }
    return d
  })()
  const areaD = `${pathD} L${pad.left + innerW},${pad.top + innerH} L${pad.left},${pad.top + innerH} Z`

  // Y ticks
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((p) => ({
    y: pad.top + (1 - p) * innerH,
    label: formatNumber(min + p * range),
  }))

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#084D3E" stopOpacity="0.45" />
          <stop offset="60%" stopColor="#0d6b53" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#a4e58f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`line-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#084D3E" />
          <stop offset="60%" stopColor="#0d6b53" />
          <stop offset="100%" stopColor="#a4e58f" />
        </linearGradient>
      </defs>

      {/* Grid */}
      {ticks.map((tk, i) => (
        <g key={i}>
          <line
            x1={pad.left}
            x2={pad.left + innerW}
            y1={tk.y}
            y2={tk.y}
            stroke="var(--border)"
            strokeOpacity="0.5"
            strokeDasharray="3 4"
            strokeWidth="1"
          />
          <text
            x={pad.left - 10}
            y={tk.y}
            textAnchor="end"
            dominantBaseline="middle"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: 'var(--muted)' }}
          >
            {tk.label}
          </text>
        </g>
      ))}

      {/* Area + line */}
      <path d={areaD} fill={`url(#grad-${id})`} />
      <path d={pathD} fill="none" stroke={`url(#line-${id})`} strokeWidth="2.5" strokeLinecap="round" />

      {/* Data points + bottom labels */}
      {pts.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={i === pts.length - 1 ? 5 : 3} fill="#0d6b53" stroke="var(--surface)" strokeWidth="2" />
          {i === pts.length - 1 && (
            <circle cx={x} cy={y} r="9" fill="none" stroke="#0d6b53" strokeOpacity="0.4" strokeWidth="1.5">
              <animate attributeName="r" values="5;12;5" dur="2s" repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
            </circle>
          )}
          <text
            x={x}
            y={pad.top + innerH + 18}
            textAnchor="middle"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: 'var(--muted)', letterSpacing: '1px' }}
          >
            {data[i].label}
          </text>
        </g>
      ))}
    </svg>
  )
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toFixed(0)
}
