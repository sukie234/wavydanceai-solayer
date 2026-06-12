package task

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// Register must panic on wiring bugs (nil factory, duplicate platform or
// model) instead of silently re-routing models — database/sql style.
func TestRegisterGuards(t *testing.T) {
	require.Panics(t, func() {
		Register("guard-nil", nil)
	})

	Register("guard-a", func() Adaptor { return &fakeAdaptor{} }, "guard-model-1")
	require.Equal(t, "guard-a", GetPlatform("guard-model-1"))
	require.NotNil(t, GetAdaptor("guard-a"))

	require.Panics(t, func() {
		Register("guard-a", func() Adaptor { return &fakeAdaptor{} })
	}, "duplicate platform")
	require.Panics(t, func() {
		Register("guard-b", func() Adaptor { return &fakeAdaptor{} }, "guard-model-1")
	}, "duplicate model")
}
