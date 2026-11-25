package main

import (
	"html/template"
	"io/ioutil"
	"strings"
	"testing"
)

func render(t *testing.T, file string, data map[string]interface{}) string {
	b, err := ioutil.ReadFile(file)
	if err != nil { t.Fatal(err) }
	tpl, err := template.New("t").Parse(string(b))
	if err != nil { t.Fatal(err) }
	var sb strings.Builder
	if err := tpl.Execute(&sb, data); err != nil { t.Fatalf("render error: %v", err) }
	return sb.String()
}

func data(redirect string) map[string]interface{} {
	return map[string]interface{}{"SiteURL": "https://keepitil.com", "ConfirmationURL": "https://x.supabase.co/auth/v1/verify?token=abc&type=magiclink&redirect_to=r", "Email": "a@b.co", "Token": "123456", "TokenHash": "h", "Data": map[string]interface{}{}, "RedirectTo": redirect}
}

const (
	FMW = "Find My Weed"
	TUI = "TUITEA"
	KEP = "KEEPITIL, Garden"
	ICON = "https://keepitil.com/app/tuitea/icon-192.png"
)

// name, redirect_to, brand that MUST appear, brands that must NOT appear
var cases = []struct{ name, redirect, brand string; other []string }{
	{"fmw account page", "https://keepitil.com/app/findmyweed/account.html", FMW, []string{"KEEPITIL, Garden", TUI}},
	{"fmw root", "https://keepitil.com/app/findmyweed/", FMW, []string{TUI, "KEEPITIL, Garden"}},
	{"tuitea web app", "https://keepitil.com/app/tuitea/app/", TUI, []string{FMW, "KEEPITIL"}},
	{"tuitea confirm page", "https://keepitil.com/app/tuitea/password/?flow=confirm", TUI, []string{FMW, "KEEPITIL"}},
	{"tuitea native iOS magic link (/join/auth)", "https://keepitil.com/join/auth", TUI, []string{FMW, "KEEPITIL"}},
	{"tuitea invite link (/join/?t=)", "https://keepitil.com/join/?t=0123456789abcdef0123456789abcdef", TUI, []string{FMW, "KEEPITIL"}},
	{"keepitil apply", "https://keepitil.com/apply", KEP, []string{FMW, TUI}},
	{"keepitil any page", "https://keepitil.com/event/stick-figure/", KEP, []string{FMW, TUI}},
	{"keepitil reset-password page", "https://keepitil.com/reset-password", KEP, []string{FMW, TUI}},
	{"empty redirect", "", KEP, []string{FMW, TUI}},
	{"short redirect (slice must not panic)", "https://a.co", KEP, []string{FMW, TUI}},
	{"near-prefix not fmw", "https://keepitil.com/app/findmyweedx", KEP, []string{FMW, TUI}},
	{"other host with fmw path", "https://evil.example/app/findmyweed/x", KEP, []string{FMW, TUI}},
	{"NEG near-prefix not tuitea (/app/tuiteax/)", "https://keepitil.com/app/tuiteax/", KEP, []string{FMW, TUI}},
	{"NEG near-prefix not tuitea (/app/tuitea no slash)", "https://keepitil.com/app/tuitea", KEP, []string{FMW, TUI}},
	{"NEG near-prefix not join (/joinery/)", "https://keepitil.com/joinery/", KEP, []string{FMW, TUI}},
	{"NEG near-prefix not join (/join no slash)", "https://keepitil.com/join", KEP, []string{FMW, TUI}},
	{"NEG other host with join path", "https://evil.example/join/auth", KEP, []string{FMW, TUI}},
	{"NEG other host with tuitea path", "https://evil.example/app/tuitea/app/", KEP, []string{FMW, TUI}},
	{"NEG http (not https) join", "http://keepitil.com/join/auth", KEP, []string{FMW, TUI}},
	{"unicode redirect", "https://keepitil.com/ünï/ç", KEP, []string{FMW, TUI}},
}

func isTuitea(redirect string) bool { return strings.HasPrefix(redirect, "https://keepitil.com/app/tuitea/") || strings.HasPrefix(redirect, "https://keepitil.com/join/") }

func TestBody(t *testing.T) {
	for _, c := range cases {
		for _, file := range []string{"magic-link.shared.html", "recovery.shared.html"} {
			out := render(t, file, data(c.redirect))
			if !strings.Contains(out, c.brand) { t.Errorf("%s %s: missing %q", file, c.name, c.brand) }
			for _, o := range c.other { if strings.Contains(out, o) { t.Errorf("%s %s: contains %q", file, c.name, o) } }
			if strings.Count(out, "https://x.supabase.co/auth/v1/verify?token=abc&amp;type=magiclink&amp;redirect_to=r") < 2 { t.Errorf("%s %s: link must appear in href and fallback", file, c.name) }
			if strings.Contains(out, "<no value>") || strings.Contains(out, c.redirect) && c.redirect != "" { t.Errorf("%s %s: leaked <no value> or the redirect", file, c.name) }
		}
	}
}

// The TUITEA branch: the green T icon (absolute https URL to a public TUITEA icon), the TUITEA teal palette from the join page, NOT purple, and the KEEPITIL / Find My Weed look absent.
func TestTuiteaLook(t *testing.T) {
	for _, file := range []string{"magic-link.shared.html", "recovery.shared.html"} {
		for _, c := range cases {
			out := render(t, file, data(c.redirect))
			has := strings.Contains(out, ICON)
			if isTuitea(c.redirect) {
				if !has { t.Errorf("%s %s: TUITEA branch must carry the icon %s", file, c.name, ICON) }
				if !strings.Contains(out, "#33777D") || !strings.Contains(out, "#FBF7EF") { t.Errorf("%s %s: TUITEA teal button / cream background missing", file, c.name) }
				for _, bad := range []string{"#5b3df5", "#f6f4fb", "#00b4ff", "#3ddc74", "#0a0a0f", "#0b0f0c"} { if strings.Contains(out, bad) { t.Errorf("%s %s: TUITEA branch has another app's colour %s", file, c.name, bad) } }
			} else if has {
				t.Errorf("%s %s: NEGATIVE CONTROL: the TUITEA icon leaked into a non-TUITEA email", file, c.name)
			}
		}
	}
}

func TestSubject(t *testing.T) {
	want := func(redirect string) (magic, reset string) {
		switch {
		case strings.HasPrefix(redirect, "https://keepitil.com/app/findmyweed/"): return "Your Find My Weed sign-in link", "Reset your Find My Weed password"
		case isTuitea(redirect): return "Your TUITEA sign-in link", "Reset your TUITEA password"
		}
		return "Your KEEPITIL sign-in link", "Reset your KEEPITIL password"
	}
	for _, c := range cases {
		m, r := want(c.redirect)
		if got := strings.TrimSpace(render(t, "subject.tmpl", data(c.redirect))); got != m { t.Errorf("%s: magic-link subject %q want %q", c.name, got, m) }
		if got := strings.TrimSpace(render(t, "recovery-subject.tmpl", data(c.redirect))); got != r { t.Errorf("%s: reset subject %q want %q", c.name, got, r) }
	}
}

func TestMissingRedirectKey(t *testing.T) {   // a data map with no RedirectTo key at all must still render the KEEPITIL default (len of nil is 0)
	for _, file := range []string{"magic-link.shared.html", "recovery.shared.html", "subject.tmpl", "recovery-subject.tmpl"} {
		d := data(""); delete(d, "RedirectTo")
		b, _ := ioutil.ReadFile(file)
		tpl, err := template.New("t").Parse(string(b)); if err != nil { t.Fatal(err) }
		var sb strings.Builder
		if err := tpl.Execute(&sb, d); err != nil { t.Fatalf("%s: absent RedirectTo key must not error: %v", file, err) }
		if !strings.Contains(sb.String(), "KEEPITIL") { t.Errorf("%s: default branch expected", file) }
	}
}
