package client

import (
	"fmt"
	"net"
	"syscall"
)

// blockedIP reports whether ip falls in a range that user-supplied URLs must
// not reach: loopback, link-local (which covers the 169.254.169.254 cloud
// metadata endpoint), private (RFC1918 / IPv6 ULA), and unspecified addresses.
func blockedIP(ip net.IP) bool {
	return ip == nil ||
		ip.IsLoopback() ||
		ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() ||
		ip.IsPrivate() ||
		ip.IsUnspecified()
}

// ssrfDialControl is a net.Dialer Control hook guarding outbound connections
// for user-supplied content (e.g. vision-model image URLs). It runs after DNS
// resolution with the concrete IP about to be dialed, so it also defeats DNS
// rebinding: a host that resolves to a public IP on the first lookup but a
// private one at connect time is still rejected here.
func ssrfDialControl(_, address string, _ syscall.RawConn) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return err
	}
	if ip := net.ParseIP(host); blockedIP(ip) {
		return fmt.Errorf("ssrf: refusing to connect to non-public address %s", host)
	}
	return nil
}
