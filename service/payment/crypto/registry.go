package crypto

import (
	"sort"
	"strings"
	"sync"

	"github.com/songquanpeng/one-api/common/config"
)

var (
	registryMu sync.RWMutex
	registry   = map[string]CryptoAdapter{}
)

// Register installs an adapter into the registry. Called from each adapter's
// init(). Panics on duplicate Name() — duplicate names break URL routing and
// are always a bug.
func Register(a CryptoAdapter) {
	registryMu.Lock()
	defer registryMu.Unlock()
	name := a.Name()
	if name == "" {
		panic("crypto: adapter Name() is empty")
	}
	if _, exists := registry[name]; exists {
		panic("crypto: duplicate adapter name: " + name)
	}
	registry[name] = a
}

// Get returns an adapter by its Name() regardless of enabled state. Used by
// webhook routing so we can still ack callbacks for adapters that were
// temporarily disabled.
func Get(name string) (CryptoAdapter, bool) {
	registryMu.RLock()
	defer registryMu.RUnlock()
	a, ok := registry[name]
	return a, ok
}

// All returns every registered adapter sorted by Name().
// Includes disabled ones — for admin listing.
func All() []CryptoAdapter {
	registryMu.RLock()
	defer registryMu.RUnlock()
	out := make([]CryptoAdapter, 0, len(registry))
	for _, a := range registry {
		out = append(out, a)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name() < out[j].Name() })
	return out
}

// EnabledList returns only adapters whose IsEnabled() is true.
// Used by the user-facing topup info endpoint.
func EnabledList() []CryptoAdapter {
	all := All()
	out := make([]CryptoAdapter, 0, len(all))
	for _, a := range all {
		if a.IsEnabled() {
			out = append(out, a)
		}
	}
	return out
}

// IsAdapterEnabled reports whether the given adapter name appears in the
// CryptoAdaptersEnabled whitelist. Adapters call this from their IsEnabled().
func IsAdapterEnabled(name string) bool {
	for _, n := range config.CryptoAdaptersEnabled {
		if strings.EqualFold(strings.TrimSpace(n), name) {
			return true
		}
	}
	return false
}
