type Props = {
  size?: number
  className?: string
}

/**
 * Theme-aware wavydance.ai brand mark. Renders both light/dark PNGs and
 * lets CSS in globals.css show the one matching the current [data-theme].
 */
export function BrandMark({ size = 24, className }: Props) {
  return (
    <span
      className={`wavy-brand-mark relative inline-block flex-shrink-0 ${className ?? ''}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <img
        src="/icon-light.png"
        alt=""
        className="wavy-brand-mark__light absolute inset-0 h-full w-full object-contain"
      />
      <img
        src="/icon-dark.png"
        alt=""
        className="wavy-brand-mark__dark absolute inset-0 h-full w-full object-contain"
      />
    </span>
  )
}
