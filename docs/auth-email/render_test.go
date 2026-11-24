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

var cases = []struct{ name, redirect, brand, other string }{
	{"fmw account page", "https://keepitil.com/app/findmyweed/account.html", "Find My Weed", "KEEPITIL, Garden"},
	{"fmw root", "https://keepitil.com/app/findmyweed/", "Find My Weed", "TUITEA"},
	{"tuitea", "https://keepitil.com/app/tuitea/app/", "TUITEA", "Find My Weed"},
	{"keepitil apply", "https://keepitil.com/apply", "KEEPITIL, Garden", "Find My Weed"},
	{"keepitil any page", "https://keepitil.com/event/stick-figure/", "KEEPITIL, Garden", "TUITEA"},
	{"empty redirect", "", "KEEPITIL, Garden", "Find My Weed"},
	{"short redirect (slice must not panic)", "https://a.co", "KEEPITIL, Garden", "Find My Weed"},
	{"near-prefix not fmw", "https://keepitil.com/app/findmyweedx", "KEEPITIL, Garden", "Find My Weed"},
	{"other host with fmw path", "https://evil.example/app/findmyweed/x", "KEEPITIL, Garden", "Find My Weed"},
	{"unicode redirect", "https://keepitil.com/ünï/ç", "KEEPITIL, Garden", "Find My Weed"},
}

func TestBody(t *testing.T) {
	for _, c := range cases {
		out := render(t, "magic-link.shared.html", data(c.redirect))
		if !strings.Contains(out, c.brand) { t.Errorf("%s: missing %q", c.name, c.brand) }
		if strings.Contains(out, c.other) { t.Errorf("%s: contains %q", c.name, c.other) }
		if strings.Count(out, "https://x.supabase.co/auth/v1/verify?token=abc&amp;type=magiclink&amp;redirect_to=r") < 2 { t.Errorf("%s: link must appear in href and fallback", c.name) }
		if strings.Contains(out, "<no value>") || strings.Contains(out, c.redirect) && c.redirect != "" { t.Errorf("%s: leaked <no value> or the redirect", c.name) }
	}
}

func TestSubject(t *testing.T) {
	want := map[string]string{"fmw account page": "Your Find My Weed sign-in link", "tuitea": "Your TUITEA sign-in link", "keepitil apply": "Your KEEPITIL sign-in link", "short redirect (slice must not panic)": "Your KEEPITIL sign-in link", "empty redirect": "Your KEEPITIL sign-in link"}
	for _, c := range cases {
		w, ok := want[c.name]; if !ok { continue }
		if got := strings.TrimSpace(render(t, "subject.tmpl", data(c.redirect))); got != w { t.Errorf("%s: subject %q want %q", c.name, got, w) }
	}
}

func TestMissingRedirectKey(t *testing.T) {   // a data map with no RedirectTo key at all must still render the KEEPITIL default (len of nil is 0)
	d := data(""); delete(d, "RedirectTo")
	b, _ := ioutil.ReadFile("magic-link.shared.html")
	tpl, err := template.New("t").Parse(string(b)); if err != nil { t.Fatal(err) }
	var sb strings.Builder
	if err := tpl.Execute(&sb, d); err != nil { t.Fatalf("absent RedirectTo key must not error: %v", err) }
	if !strings.Contains(sb.String(), "KEEPITIL, Garden") { t.Error("default branch expected") }
}
