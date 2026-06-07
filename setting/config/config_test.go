package config

import (
	"testing"
)

type testConfigWithMap struct {
	Modes map[string]string `json:"modes"`
	Exprs map[string]string `json:"exprs"`
	Name  string            `json:"name"`
}

// Map update must replace the entire map, not merge. Bug fixed in new-api:
// json.Unmarshal merges by default, leaving deleted keys behind.
func TestUpdateConfigFromMap_MapReplacement(t *testing.T) {
	cfg := &testConfigWithMap{
		Modes: map[string]string{"model-a": "tiered_expr", "model-b": "tiered_expr"},
		Exprs: map[string]string{"model-a": "p * 5", "model-b": "p * 10"},
		Name:  "billing",
	}
	err := UpdateConfigFromMap(cfg, map[string]string{
		"modes": `{"model-b": "tiered_expr"}`,
		"exprs": `{"model-b": "p * 10"}`,
	})
	if err != nil {
		t.Fatalf("UpdateConfigFromMap failed: %v", err)
	}
	if _, ok := cfg.Modes["model-a"]; ok {
		t.Errorf("Modes still contains model-a after removal: %v", cfg.Modes)
	}
	if cfg.Modes["model-b"] != "tiered_expr" {
		t.Errorf("Modes[model-b] = %q", cfg.Modes["model-b"])
	}
}

func TestUpdateConfigFromMap_EmptyMapClearsAll(t *testing.T) {
	cfg := &testConfigWithMap{
		Modes: map[string]string{"model-a": "v"},
		Exprs: map[string]string{"model-a": "p"},
	}
	err := UpdateConfigFromMap(cfg, map[string]string{"modes": `{}`, "exprs": `{}`})
	if err != nil {
		t.Fatalf("UpdateConfigFromMap failed: %v", err)
	}
	if len(cfg.Modes) != 0 || len(cfg.Exprs) != 0 {
		t.Errorf("maps should be empty, got %v / %v", cfg.Modes, cfg.Exprs)
	}
}

func TestUpdateConfigFromMap_ScalarFieldsUnchanged(t *testing.T) {
	cfg := &testConfigWithMap{Modes: map[string]string{"m": "v"}, Name: "old"}
	err := UpdateConfigFromMap(cfg, map[string]string{"name": "new"})
	if err != nil {
		t.Fatalf("UpdateConfigFromMap failed: %v", err)
	}
	if cfg.Name != "new" {
		t.Errorf("Name = %q, want %q", cfg.Name, "new")
	}
	if cfg.Modes["m"] != "v" {
		t.Errorf("Modes should be unchanged, got %v", cfg.Modes)
	}
}

// Scalar round-trip: configToMap then back via updateConfigFromMap must
// preserve every supported type — this is the contract LoadFromDB relies on.
func TestRoundTrip_AllScalarKinds(t *testing.T) {
	type all struct {
		S   string  `json:"s"`
		B   bool    `json:"b"`
		I   int     `json:"i"`
		I64 int64   `json:"i64"`
		U   uint    `json:"u"`
		F   float64 `json:"f"`
	}
	orig := &all{S: "hello", B: true, I: -7, I64: 9_000_000_000, U: 42, F: 3.14}
	m, err := ConfigToMap(orig)
	if err != nil {
		t.Fatalf("ConfigToMap: %v", err)
	}
	dst := &all{}
	if err := UpdateConfigFromMap(dst, m); err != nil {
		t.Fatalf("UpdateConfigFromMap: %v", err)
	}
	if *dst != *orig {
		t.Errorf("round trip mismatch: got %+v want %+v", dst, orig)
	}
}

// Float-encoded int compatibility: legacy option rows written as "2.000000"
// must still decode into int64 fields after the migration.
func TestUpdateConfigFromMap_FloatEncodedInt(t *testing.T) {
	type x struct {
		N int64 `json:"n"`
	}
	c := &x{}
	if err := UpdateConfigFromMap(c, map[string]string{"n": "2.000000"}); err != nil {
		t.Fatalf("UpdateConfigFromMap: %v", err)
	}
	if c.N != 2 {
		t.Errorf("N = %d, want 2", c.N)
	}
}

// Registry: Register + Get returns the same pointer; LoadFromDB only
// touches keys with the registered prefix.
func TestRegistry_RegisterGetAndPrefixFilter(t *testing.T) {
	type s struct {
		V string `json:"v"`
	}
	cm := NewConfigManager()
	mod := &s{V: "init"}
	cm.Register("mymod", mod)
	if got := cm.Get("mymod"); got != mod {
		t.Errorf("Get returned different pointer")
	}
	if err := cm.LoadFromDB(map[string]string{
		"mymod.v":    "updated",
		"othermod.v": "ignored",
		"flat-key":   "ignored",
	}); err != nil {
		t.Fatalf("LoadFromDB: %v", err)
	}
	if mod.V != "updated" {
		t.Errorf("V = %q, want updated", mod.V)
	}
}

// SaveToDB + ExportAllConfigs produce identical flat maps for the same
// registered state.
func TestSaveAndExport_AreEquivalent(t *testing.T) {
	type s struct {
		V string `json:"v"`
		N int    `json:"n"`
	}
	cm := NewConfigManager()
	cm.Register("mod", &s{V: "x", N: 5})

	exported := cm.ExportAllConfigs()
	collected := make(map[string]string)
	if err := cm.SaveToDB(func(k, v string) error {
		collected[k] = v
		return nil
	}); err != nil {
		t.Fatalf("SaveToDB: %v", err)
	}
	if len(exported) != len(collected) {
		t.Fatalf("size mismatch: export=%d save=%d", len(exported), len(collected))
	}
	for k, v := range exported {
		if collected[k] != v {
			t.Errorf("key %q: export=%q save=%q", k, v, collected[k])
		}
	}
	if exported["mod.v"] != "x" || exported["mod.n"] != "5" {
		t.Errorf("unexpected export: %v", exported)
	}
}
