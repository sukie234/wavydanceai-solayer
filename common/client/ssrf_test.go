package client

import (
	"net"
	"testing"
)

func TestBlockedIP(t *testing.T) {
	cases := []struct {
		ip      string
		blocked bool
	}{
		{"169.254.169.254", true},       // cloud metadata (link-local)
		{"127.0.0.1", true},             // loopback
		{"10.1.2.3", true},              // private
		{"192.168.0.1", true},           // private
		{"172.16.5.4", true},            // private
		{"0.0.0.0", true},               // unspecified
		{"::1", true},                   // loopback v6
		{"fe80::1", true},               // link-local v6
		{"fd00::1", true},               // unique local v6
		{"8.8.8.8", false},              // public
		{"1.1.1.1", false},              // public
		{"2606:4700:4700::1111", false}, // public v6
	}
	for _, c := range cases {
		ip := net.ParseIP(c.ip)
		if got := blockedIP(ip); got != c.blocked {
			t.Errorf("blockedIP(%s) = %v, want %v", c.ip, got, c.blocked)
		}
	}
	if !blockedIP(nil) {
		t.Errorf("blockedIP(nil) = false, want true")
	}
}
