package ratio

import (
	"encoding/json"
	"testing"
)

func snapshotGroupRatio(t *testing.T) {
	t.Helper()
	original := make(map[string]float64, len(GroupRatio))
	for k, v := range GroupRatio {
		original[k] = v
	}
	t.Cleanup(func() {
		groupRatioLock.Lock()
		defer groupRatioLock.Unlock()
		GroupRatio = original
	})
}

func TestGetGroupRatio_Defaults(t *testing.T) {
	snapshotGroupRatio(t)

	cases := []struct {
		name string
		want float64
	}{
		{"default", 1},
		{"vip", 1},
		{"svip", 1},
	}
	for _, tc := range cases {
		if got := GetGroupRatio(tc.name); got != tc.want {
			t.Errorf("GetGroupRatio(%q) = %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestGetGroupRatio_UnknownFallsBackToOne(t *testing.T) {
	snapshotGroupRatio(t)

	if got := GetGroupRatio("not-a-real-group"); got != 1 {
		t.Errorf("GetGroupRatio(unknown) = %v, want fallback 1", got)
	}
}

func TestGroupRatio2JSONString_Roundtrip(t *testing.T) {
	snapshotGroupRatio(t)

	jsonStr := GroupRatio2JSONString()

	var parsed map[string]float64
	if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
		t.Fatalf("GroupRatio2JSONString produced invalid JSON: %v", err)
	}
	if len(parsed) != len(GroupRatio) {
		t.Errorf("parsed size = %d, want %d", len(parsed), len(GroupRatio))
	}
	for k, v := range GroupRatio {
		if parsed[k] != v {
			t.Errorf("parsed[%q] = %v, want %v", k, parsed[k], v)
		}
	}
}

func TestUpdateGroupRatioByJSONString_ReplacesMap(t *testing.T) {
	snapshotGroupRatio(t)

	err := UpdateGroupRatioByJSONString(`{"alpha": 2, "beta": 3.5}`)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if got := GetGroupRatio("alpha"); got != 2 {
		t.Errorf("alpha = %v, want 2", got)
	}
	if got := GetGroupRatio("beta"); got != 3.5 {
		t.Errorf("beta = %v, want 3.5", got)
	}
	// Previous defaults must be wiped (update is a full replace, not a merge).
	if _, exists := GroupRatio["default"]; exists {
		t.Errorf("expected default to be wiped after replace, still present")
	}
}

func TestUpdateGroupRatioByJSONString_InvalidJSONReturnsError(t *testing.T) {
	snapshotGroupRatio(t)

	if err := UpdateGroupRatioByJSONString("{not json"); err == nil {
		t.Fatal("expected error for invalid JSON, got nil")
	}
}
