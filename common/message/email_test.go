package message

import (
	"strings"
	"testing"
)

func TestParseRecipients(t *testing.T) {
	t.Run("valid", func(t *testing.T) {
		cases := []struct {
			name     string
			receiver string
			want     []string
		}{
			{"single", "a@b.com", []string{"a@b.com"}},
			{"multiple", "a@b.com;c@d.com", []string{"a@b.com", "c@d.com"}},
			{"whitespace trimmed", " a@b.com ; c@d.com ", []string{"a@b.com", "c@d.com"}},
			{"display name stripped", "Alice <a@b.com>", []string{"a@b.com"}},
		}
		for _, c := range cases {
			t.Run(c.name, func(t *testing.T) {
				got, err := parseRecipients(c.receiver)
				if err != nil {
					t.Fatalf("parseRecipients(%q) returned error: %v", c.receiver, err)
				}
				if strings.Join(got, ",") != strings.Join(c.want, ",") {
					t.Errorf("parseRecipients(%q) = %v, want %v", c.receiver, got, c.want)
				}
			})
		}
	})

	t.Run("rejected", func(t *testing.T) {
		cases := []struct {
			name     string
			receiver string
		}{
			{"crlf header injection", "a@b.com\r\nBcc: evil@x.com"},
			{"lf injection", "a@b.com\nDATA"},
			{"empty", ""},
			{"blank", "   "},
			{"trailing separator", "a@b.com;"},
			{"not an address", "not-an-email"},
		}
		for _, c := range cases {
			t.Run(c.name, func(t *testing.T) {
				if _, err := parseRecipients(c.receiver); err == nil {
					t.Errorf("parseRecipients(%q) = nil error, want rejection", c.receiver)
				}
			})
		}
	})
}
