// Username constraints — mirror the backend rules on `model.User.Username`:
//   * `validate:"min=3,max=12,username_chars"`
//   * `username_chars` (see common/validate.go) = letters / digits / `_` / `-`
//
// The frontend fails fast with the same constraints so users see the
// problem in-line instead of submitting and getting a backend rejection.
//
// Length counts in Unicode code points to match Go's `utf8.RuneCountInString`.
export const USERNAME_MIN = 3
export const USERNAME_MAX = 12

// Letters / digits / underscore / hyphen. Uses Unicode `\p{L}` and `\p{Nd}`
// so non-ASCII letters and decimal digits are allowed too (matches Go's
// `unicode.IsLetter` / `unicode.IsDigit` used in the backend validator).
const USERNAME_CHAR_PATTERN = /^[\p{L}\p{Nd}_-]+$/u

export type UsernameIssue = 'too_short' | 'too_long' | 'invalid_chars'

function codePointLength(s: string): number {
  return [...s].length
}

export function checkUsername(name: string): UsernameIssue | null {
  const n = codePointLength(name)
  if (n < USERNAME_MIN) return 'too_short'
  if (n > USERNAME_MAX) return 'too_long'
  if (!USERNAME_CHAR_PATTERN.test(name)) return 'invalid_chars'
  return null
}
