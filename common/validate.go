package common

import (
	"unicode"
	"unicode/utf8"

	"github.com/go-playground/validator/v10"
)

var Validate *validator.Validate

func init() {
	Validate = validator.New()
}

// IsPasswordComplexEnough enforces the user-facing password complexity rule:
// length 8–24 characters, must contain at least one letter AND one digit.
// Length is counted by Unicode code points to match the rune-based length
// enforced by the `validate:"min=8,max=24"` struct tag on User.Password
// (go-playground/validator measures string min/max via utf8.RuneCountInString).
func IsPasswordComplexEnough(p string) bool {
	n := utf8.RuneCountInString(p)
	if n < 8 || n > 24 {
		return false
	}
	var hasLetter, hasDigit bool
	for _, r := range p {
		switch {
		case unicode.IsLetter(r):
			hasLetter = true
		case unicode.IsDigit(r):
			hasDigit = true
		}
		if hasLetter && hasDigit {
			return true
		}
	}
	return false
}
