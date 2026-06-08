import { describe, it, expect } from 'vitest'
import { checkPassword, PASSWORD_MIN, PASSWORD_MAX } from './password'

describe('checkPassword', () => {
  it('flags empty as too_short', () => {
    expect(checkPassword('')).toBe('too_short')
  })

  it('flags PASSWORD_MIN - 1 as too_short', () => {
    expect(checkPassword('a'.repeat(PASSWORD_MIN - 1))).toBe('too_short')
  })

  it('accepts the minimum length when it contains a letter and a digit', () => {
    expect(checkPassword('abcdefg1')).toBeNull()
    expect(checkPassword('a'.repeat(PASSWORD_MIN - 1) + '1')).toBeNull()
  })

  it('flags PASSWORD_MAX + 1 as too_long', () => {
    expect(checkPassword('a'.repeat(PASSWORD_MAX) + '1')).toBe('too_long')
  })

  it('accepts the maximum length when it contains a letter and a digit', () => {
    expect(checkPassword('a'.repeat(PASSWORD_MAX - 1) + '1')).toBeNull()
  })

  it('flags letters-only as needs_letter_and_digit', () => {
    expect(checkPassword('abcdefgh')).toBe('needs_letter_and_digit')
  })

  it('flags digits-only as needs_letter_and_digit', () => {
    expect(checkPassword('12345678')).toBe('needs_letter_and_digit')
  })

  it('flags symbols-only as needs_letter_and_digit', () => {
    expect(checkPassword('!@#$%^&*')).toBe('needs_letter_and_digit')
  })

  it('rejects Roman-numeral / non-decimal numerics as the digit class', () => {
    // \p{Nd} matches decimal digits only — Roman numerals are \p{Nl}.
    // This mirrors Go's `unicode.IsDigit` which also rejects them.
    expect(checkPassword('abcdefgⅣ')).toBe('needs_letter_and_digit')
  })

  it('accepts non-ASCII letters paired with a decimal digit', () => {
    expect(checkPassword('пароль12')).toBeNull()
  })

  it('counts surrogate-pair code points as one character', () => {
    // 7 emoji (each is one code point, two UTF-16 units) + '1' = 8 code points.
    // Length-wise it should pass min; failure here would be 'needs_letter_and_digit'
    // because emoji aren't letters — that's the expected failure mode.
    expect(checkPassword('😀😀😀😀😀😀😀1')).toBe('needs_letter_and_digit')
  })

  it('locks character-count (not UTF-16-unit) at the max boundary', () => {
    // 23 surrogate-pair emoji = 46 UTF-16 units but 23 code points; plus 'a1'
    // = 25 code points → should be too_long, NOT accepted as 25-units.
    expect(checkPassword('😀'.repeat(23) + 'a1')).toBe('too_long')
  })
})
