/**
 * Ratio ↔ USD helpers for the root pricing editor.
 *
 * Backend convention (one-api lineage): ModelRatio 1.0 = $0.002 / 1K input
 * tokens = $2 per million input tokens. CompletionRatio is the output/input
 * price multiplier; GroupRatio multiplies on top of every model cost.
 *
 * Zero is a legal ratio — free models (glm-4-flash, …) ship with 0 in the
 * backend defaults. Negative ratios are legal too: the backend ships
 * sentinels like openrouter/auto = -500000 for dynamic/passthrough pricing.
 * So "valid" here means any finite number — matching the backend's domain.
 */

export const USD_PER_MILLION_AT_RATIO_1 = 2

export function ratioToUsd(ratio: number): number {
  return ratio * USD_PER_MILLION_AT_RATIO_1
}

export function usdToRatio(usd: number): number {
  return usd / USD_PER_MILLION_AT_RATIO_1
}

/** Trim binary float noise (0.7000000000000001 → "0.7") for inputs + JSON. */
export function formatNum(n: number): string {
  return String(Number(n.toPrecision(12)))
}

/** Parse a user-typed ratio/price; null unless finite. */
export function parseRatio(s: string): number | null {
  const t = s.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/**
 * Parse an option JSON blob into a name → ratio map.
 * Null when the text is not a JSON object of finite numbers.
 */
export function parseRatioMap(text: string): Record<string, number> | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null
    out[k] = v
  }
  return out
}
