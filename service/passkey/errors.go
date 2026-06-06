package passkey

import "errors"

// Sentinels mapped 1:1 to user-facing controller errors. Service callers
// type-check these; the controller layer translates them to HTTP codes.
var (
	ErrDisabled            = errors.New("passkey: disabled")
	ErrNoPendingChallenge  = errors.New("passkey: no pending challenge")
	ErrVerifyFailed        = errors.New("passkey: verification failed")
	ErrSignCountRegression = errors.New("passkey: sign count regression detected")
	ErrInvalidConfig       = errors.New("passkey: invalid configuration")
)
