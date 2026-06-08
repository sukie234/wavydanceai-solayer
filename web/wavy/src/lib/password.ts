// Password complexity rule — mirrors `common.IsPasswordComplexEnough` on the
// backend so the UI can fail fast with the same constraint.
//
// Length is counted in Unicode code points (not JS UTF-16 units) so it matches
// the rune-based length that go-playground/validator and the backend helper
// both use. The digit class uses `\p{Nd}` (decimal digits only) so it tracks
// Go's `unicode.IsDigit` rather than the broader `\p{N}` (which would also
// admit Roman numerals, superscripts, etc.).
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 24

const HAS_LETTER = /\p{L}/u
const HAS_DIGIT = /\p{Nd}/u

export type PasswordIssue = 'too_short' | 'too_long' | 'needs_letter_and_digit'

function codePointLength(s: string): number {
  // Spread iterates by Unicode code point, correctly counting surrogate pairs
  // as a single character (matches Go's utf8.RuneCountInString).
  return [...s].length
}

export function checkPassword(pw: string): PasswordIssue | null {
  const n = codePointLength(pw)
  if (n < PASSWORD_MIN) return 'too_short'
  if (n > PASSWORD_MAX) return 'too_long'
  if (!HAS_LETTER.test(pw) || !HAS_DIGIT.test(pw)) return 'needs_letter_and_digit'
  return null
}
