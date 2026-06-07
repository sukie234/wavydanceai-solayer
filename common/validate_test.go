package common

import "testing"

func TestIsPasswordComplexEnough(t *testing.T) {
	cases := []struct {
		name string
		pw   string
		want bool
	}{
		{"empty", "", false},
		{"too short", "abc12", false},
		{"min ok letter+digit", "abcdefg1", true},
		{"max ok 24 letter+digit", "abcdefghijklmnopqrstuvw1", true},
		{"too long 25", "abcdefghijklmnopqrstuvwx1", false},
		{"letters only at min", "abcdefgh", false},
		{"digits only at min", "12345678", false},
		{"non-ascii letter + digit", "пароль123", true},
		{"symbols + letter + digit", "Aa1!_-_-", true},
		{"symbols only", "!@#$%^&*", false},
		// Multibyte boundary cases: each CJK char is 3 bytes in UTF-8 but
		// counts as 1 rune. These lock in character-count (not byte-count)
		// enforcement at the 24/25-rune boundary.
		{"non-ascii max ok 24 runes", "我是一个安全的密码字符串组合一二三四五六七八九1", true},
		{"non-ascii too long 25 runes", "我是一个安全的密码字符串组合一二三四五六七八九十1", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := IsPasswordComplexEnough(tc.pw)
			if got != tc.want {
				t.Fatalf("IsPasswordComplexEnough(%q) = %v, want %v", tc.pw, got, tc.want)
			}
		})
	}
}
