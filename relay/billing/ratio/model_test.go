package ratio

import (
	"encoding/json"
	"math"
	"testing"
)

func snapshotModelRatios(t *testing.T) {
	t.Helper()
	origModel := make(map[string]float64, len(ModelRatio))
	for k, v := range ModelRatio {
		origModel[k] = v
	}
	origCompletion := make(map[string]float64, len(CompletionRatio))
	for k, v := range CompletionRatio {
		origCompletion[k] = v
	}
	t.Cleanup(func() {
		modelRatioLock.Lock()
		ModelRatio = origModel
		modelRatioLock.Unlock()
		CompletionRatio = origCompletion
	})
}

func approxEqual(a, b float64) bool {
	return math.Abs(a-b) < 1e-9
}

func TestGetModelRatio_KnownModel(t *testing.T) {
	snapshotModelRatios(t)
	if got := GetModelRatio("gpt-4", 0); got != 15 {
		t.Errorf("gpt-4 = %v, want 15", got)
	}
}

func TestGetModelRatio_UnknownFallsBackTo30(t *testing.T) {
	snapshotModelRatios(t)
	if got := GetModelRatio("totally-unknown-model", 0); got != 30 {
		t.Errorf("unknown = %v, want 30", got)
	}
}

func TestGetModelRatio_StripsQwenInternetSuffix(t *testing.T) {
	snapshotModelRatios(t)
	ModelRatio["qwen-test-model"] = 42
	if got := GetModelRatio("qwen-test-model-internet", 0); got != 42 {
		t.Errorf("qwen-test-model-internet = %v, want 42 (suffix should strip)", got)
	}
}

func TestGetModelRatio_StripsCommandInternetSuffix(t *testing.T) {
	snapshotModelRatios(t)
	ModelRatio["command-test"] = 17
	if got := GetModelRatio("command-test-internet", 0); got != 17 {
		t.Errorf("command-test-internet = %v, want 17 (suffix should strip)", got)
	}
}

func TestGetModelRatio_ChannelTypedKeyTakesPrecedence(t *testing.T) {
	snapshotModelRatios(t)
	ModelRatio["foo"] = 1
	ModelRatio["foo(7)"] = 99
	if got := GetModelRatio("foo", 7); got != 99 {
		t.Errorf("foo channel=7 = %v, want 99 (channel-typed key should win)", got)
	}
	if got := GetModelRatio("foo", 8); got != 1 {
		t.Errorf("foo channel=8 = %v, want 1 (plain name fallback)", got)
	}
}

func TestModelRatio_JSONRoundtrip(t *testing.T) {
	snapshotModelRatios(t)

	jsonStr := ModelRatio2JSONString()
	var parsed map[string]float64
	if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
		t.Fatalf("ModelRatio2JSONString produced invalid JSON: %v", err)
	}
	if parsed["gpt-4"] != ModelRatio["gpt-4"] {
		t.Errorf("roundtrip lost gpt-4")
	}
}

func TestUpdateModelRatioByJSONString_ReplacesAndInvalidErrors(t *testing.T) {
	snapshotModelRatios(t)

	if err := UpdateModelRatioByJSONString(`{"only-this": 5}`); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := GetModelRatio("only-this", 0); got != 5 {
		t.Errorf("only-this = %v, want 5", got)
	}
	// Previous map entries are wiped — but DefaultModelRatio still backs it,
	// so gpt-4 still resolves via the default fallback.
	if got := GetModelRatio("gpt-4", 0); got != 15 {
		t.Errorf("gpt-4 = %v, want 15 (from DefaultModelRatio fallback)", got)
	}

	if err := UpdateModelRatioByJSONString("not json"); err == nil {
		t.Fatal("expected error for invalid JSON, got nil")
	}
}

func TestAddNewMissingRatio_FillsMissingFromDefault(t *testing.T) {
	snapshotModelRatios(t)

	// Old user-saved ratio is missing gpt-4 entirely.
	merged := AddNewMissingRatio(`{"gpt-3.5-turbo": 0.25}`)

	var parsed map[string]float64
	if err := json.Unmarshal([]byte(merged), &parsed); err != nil {
		t.Fatalf("AddNewMissingRatio returned invalid JSON: %v", err)
	}
	if parsed["gpt-3.5-turbo"] != 0.25 {
		t.Errorf("user value clobbered: gpt-3.5-turbo = %v, want 0.25", parsed["gpt-3.5-turbo"])
	}
	if parsed["gpt-4"] != DefaultModelRatio["gpt-4"] {
		t.Errorf("default not filled: gpt-4 = %v, want %v", parsed["gpt-4"], DefaultModelRatio["gpt-4"])
	}
}

func TestAddNewMissingRatio_InvalidJSONReturnedAsIs(t *testing.T) {
	snapshotModelRatios(t)
	input := "{broken"
	if got := AddNewMissingRatio(input); got != input {
		t.Errorf("invalid JSON should be echoed back, got %q", got)
	}
}

func TestGetCompletionRatio_ExplicitMapEntries(t *testing.T) {
	snapshotModelRatios(t)

	cases := []struct {
		name        string
		channelType int
		want        float64
	}{
		// CompletionRatio explicit entries.
		{"whisper-1", 0, 0},
		{"deepseek-chat", 0, 0.28 / 0.14},
		{"deepseek-reasoner", 0, 2.19 / 0.55},
		// Channel-typed key wins over deepseek- prefix fallback.
		{"llama3-8b-8192", 33, 0.0006 / 0.0003},
		{"llama3-70b-8192", 33, 0.0035 / 0.00265},
	}
	for _, tc := range cases {
		got := GetCompletionRatio(tc.name, tc.channelType)
		if !approxEqual(got, tc.want) {
			t.Errorf("GetCompletionRatio(%q, %d) = %v, want %v", tc.name, tc.channelType, got, tc.want)
		}
	}
}

func TestGetCompletionRatio_PrefixFallbacks(t *testing.T) {
	snapshotModelRatios(t)

	cases := []struct {
		name string
		want float64
	}{
		// gpt-3.5 variants.
		{"gpt-3.5-turbo", 3},
		{"gpt-3.5-turbo-0125", 3},
		{"gpt-3.5-turbo-1106", 2},
		{"gpt-3.5-turbo-instruct", 4.0 / 3.0},
		// gpt-4 / gpt-4o / turbo / preview.
		{"gpt-4", 2},
		{"gpt-4-turbo", 3},
		{"gpt-4-0125-preview", 3},
		{"gpt-4o", 4},
		{"gpt-4o-2024-05-13", 3},
		{"gpt-4o-mini", 4},
		// o1 family.
		{"o1", 4},
		{"o1-mini", 4},
		// chatgpt-4o-latest.
		{"chatgpt-4o-latest", 3},
		// claude.
		{"claude-3-opus", 5},
		{"claude-2", 3},
		// mistral / gemini / deepseek prefix.
		{"mistral-large", 3},
		{"gemini-pro", 3},
		{"deepseek-coder", 2},
	}
	for _, tc := range cases {
		got := GetCompletionRatio(tc.name, 0)
		if !approxEqual(got, tc.want) {
			t.Errorf("GetCompletionRatio(%q) = %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestGetCompletionRatio_SwitchCases(t *testing.T) {
	snapshotModelRatios(t)

	cases := []struct {
		name string
		want float64
	}{
		{"llama2-70b-4096", 0.8 / 0.64},
		{"llama3-8b-8192", 2},            // channel 0 misses channel-typed key, hits switch
		{"llama3-70b-8192", 0.79 / 0.59}, // same
		{"command", 2},
		{"command-light", 2},
		{"command-r", 3},
		{"command-r-plus", 5},
		{"grok-beta", 3},
		{"ibm-granite/granite-20b-code-instruct-8k", 5},
		{"meta/llama-2-70b", 2.750 / 0.650},
		{"meta/meta-llama-3.1-405b-instruct", 1},
		{"mistralai/mixtral-8x7b-instruct-v0.1", 1.000 / 0.300},
	}
	for _, tc := range cases {
		got := GetCompletionRatio(tc.name, 0)
		if !approxEqual(got, tc.want) {
			t.Errorf("GetCompletionRatio(%q) = %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestGetCompletionRatio_UnknownFallsBackToOne(t *testing.T) {
	snapshotModelRatios(t)
	if got := GetCompletionRatio("totally-unknown-model", 0); got != 1 {
		t.Errorf("unknown completion ratio = %v, want fallback 1", got)
	}
}

func TestGetCompletionRatio_StripsQwenInternetSuffix(t *testing.T) {
	snapshotModelRatios(t)
	CompletionRatio["qwen-foo"] = 7
	if got := GetCompletionRatio("qwen-foo-internet", 0); got != 7 {
		t.Errorf("qwen-foo-internet = %v, want 7 (suffix should strip)", got)
	}
}

func TestCompletionRatio_JSONRoundtrip(t *testing.T) {
	snapshotModelRatios(t)

	jsonStr := CompletionRatio2JSONString()
	var parsed map[string]float64
	if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
		t.Fatalf("CompletionRatio2JSONString produced invalid JSON: %v", err)
	}
	if !approxEqual(parsed["deepseek-chat"], CompletionRatio["deepseek-chat"]) {
		t.Errorf("roundtrip lost deepseek-chat")
	}
}

func TestUpdateCompletionRatioByJSONString_Replaces(t *testing.T) {
	snapshotModelRatios(t)

	if err := UpdateCompletionRatioByJSONString(`{"my-model": 9}`); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := GetCompletionRatio("my-model", 0); got != 9 {
		t.Errorf("my-model = %v, want 9", got)
	}
	// Previous CompletionRatio["deepseek-chat"] is wiped, but DefaultCompletionRatio
	// still backs it.
	if got := GetCompletionRatio("deepseek-chat", 0); !approxEqual(got, 0.28/0.14) {
		t.Errorf("deepseek-chat = %v, want default fallback %v", got, 0.28/0.14)
	}
}

func TestUpdateCompletionRatioByJSONString_InvalidErrors(t *testing.T) {
	snapshotModelRatios(t)
	if err := UpdateCompletionRatioByJSONString("nope"); err == nil {
		t.Fatal("expected error for invalid JSON, got nil")
	}
}

// Worldrouter live-tested prices (2026-06-13). Pins a few representative
// entries so a future table edit can't silently revert to the 30x fallback
// that over-billed claude-haiku-4-5 by 86x in staging.
func TestGetModelRatio_WorldrouterEntries(t *testing.T) {
	snapshotModelRatios(t)
	cases := map[string]float64{
		"claude-haiku-4-5":  0.35,   // $0.70/M in — the 86x incident model
		"claude-fable-5":    3.5,    // $7/M in
		"gpt-5.4":           0.875,  // $1.75/M in
		"deepseek-v4-flash": 0.049,  // $0.098/M in
		"qwen3.5-flash":     0.0102, // $0.0203/M in
		"glm-5":             0.275,  // $0.55/M in
	}
	for model, want := range cases {
		if got := GetModelRatio(model, 0); got != want {
			t.Errorf("GetModelRatio(%q) = %v, want %v", model, got, want)
		}
	}
}

func TestGetCompletionRatio_WorldrouterEntries(t *testing.T) {
	snapshotModelRatios(t)
	cases := map[string]float64{
		"claude-haiku-4-5":       5,   // explicit entry, not the claude- prefix fallback (3)
		"qwen3.5-flash":          9.9, // $0.2009 out / $0.0203 in
		"llama-3.1-70b-instruct": 1,
	}
	for model, want := range cases {
		if got := GetCompletionRatio(model, 0); got != want {
			t.Errorf("GetCompletionRatio(%q) = %v, want %v", model, got, want)
		}
	}
}
