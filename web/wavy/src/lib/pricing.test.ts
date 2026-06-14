import { describe, it, expect } from 'vitest'
import { formatNum, parseRatio, parseRatioMap, ratioToUsd, usdToRatio } from './pricing'

describe('ratio ↔ USD conversion', () => {
  it('ratio 0.35 → $0.70 per million input tokens', () => {
    expect(ratioToUsd(0.35)).toBeCloseTo(0.7, 10)
  })

  it('$0.70/M → ratio 0.35 (round trip)', () => {
    expect(usdToRatio(0.7)).toBeCloseTo(0.35, 10)
    expect(usdToRatio(ratioToUsd(0.35))).toBeCloseTo(0.35, 10)
  })

  it('ratio 1.0 → $2/M (the backend anchor)', () => {
    expect(ratioToUsd(1)).toBe(2)
  })
})

describe('formatNum', () => {
  it('trims binary float noise', () => {
    expect(formatNum(0.35 * 2)).toBe('0.7')
    expect(formatNum(0.1 + 0.2)).toBe('0.3')
  })

  it('keeps exact values as-is', () => {
    expect(formatNum(1.25)).toBe('1.25')
    expect(formatNum(0)).toBe('0')
  })
})

describe('parseRatio', () => {
  it('accepts finite numbers (0 = free model)', () => {
    expect(parseRatio('0.35')).toBe(0.35)
    expect(parseRatio('0')).toBe(0)
    expect(parseRatio(' 2 ')).toBe(2)
  })

  it('accepts negative ratios — the backend ships them as sentinels (openrouter/auto = -500000)', () => {
    expect(parseRatio('-500000')).toBe(-500000)
    expect(parseRatio('-1')).toBe(-1)
  })

  it('rejects empty, non-finite, and non-numeric input', () => {
    expect(parseRatio('')).toBeNull()
    expect(parseRatio('  ')).toBeNull()
    expect(parseRatio('abc')).toBeNull()
    expect(parseRatio('Infinity')).toBeNull()
  })
})

describe('parseRatioMap', () => {
  it('parses a valid name → number object', () => {
    expect(parseRatioMap('{"gpt-4o": 1.25, "free": 0}')).toEqual({ 'gpt-4o': 1.25, free: 0 })
  })

  it('parses a map containing the backend negative sentinel without discarding it', () => {
    expect(parseRatioMap('{"openrouter/auto": -500000, "gpt-4o": 1.25}')).toEqual({
      'openrouter/auto': -500000,
      'gpt-4o': 1.25,
    })
  })

  it('rejects malformed JSON, arrays, and non-numeric values', () => {
    expect(parseRatioMap('not json')).toBeNull()
    expect(parseRatioMap('[1,2]')).toBeNull()
    expect(parseRatioMap('"str"')).toBeNull()
    expect(parseRatioMap('{"a": "1"}')).toBeNull()
  })
})
