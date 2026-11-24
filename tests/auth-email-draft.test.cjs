// Static guards for the DRAFT shared auth email (docs/auth-email). The behaviour is proven by render_test.go (Go html/template); this keeps the JS CI
// honest about the properties that must never regress. Run: node --test tests/auth-email-draft.test.cjs
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const D = path.join(__dirname, "..", "docs", "auth-email");
const body = fs.readFileSync(path.join(D, "magic-link.shared.html"), "utf8"), subj = fs.readFileSync(path.join(D, "subject.tmpl"), "utf8"), readme = fs.readFileSync(path.join(D, "README.md"), "utf8");
test("every slice is guarded by a len check on the same string (slice panics past the end and the email would not send)", () => {
  for (const [name, t] of [["body", body], ["subject", subj]]) {
    for (const m of t.matchAll(/slice \$r 0 (\d+)/g)) assert.ok(new RegExp("ge \\(len \\$r\\) " + m[1]).test(t), name + ": slice 0 " + m[1] + " has no len guard");
    assert.ok(/\$r := print \.RedirectTo/.test(t), name + ": uses print so an absent key cannot error");
  }
});
test("prefix lengths match the prefixes", () => {
  assert.equal("https://keepitil.com/app/findmyweed/".length, 36); assert.equal("https://keepitil.com/app/tuitea".length, 31);
  assert.ok(body.includes('"https://keepitil.com/app/findmyweed/"') && subj.includes('"https://keepitil.com/app/findmyweed/"'));
});
test("each branch has the link twice (button + fallback), never prints the redirect or a token, and the default is KEEPITIL", () => {
  assert.equal((body.match(/\{\{ \.ConfirmationURL \}\}/g) || []).length, 6);
  assert.doesNotMatch(body, /\{\{ \.RedirectTo|\{\{ \.Token|\{\{ \.TokenHash|\{\{ \.Email/);
  assert.match(body, /\{\{- else -\}\}\s*<div style="background:#0a0a0f/);
});
test("the draft is marked not applied and says what could not be read", () => { assert.match(readme, /NOT APPLIED/); assert.match(readme, /could not be read from this session/); });
test("control: an unguarded slice would be caught by the check", () => { const bad = "{{ if eq (slice $r 0 36) \"x\" }}"; assert.ok(!/ge \(len \$r\) 36/.test(bad)); });
test("the Find My Weed branch carries only the product name in its header (no 'BY KEEPITIL' line, Joe's Nov 16 name rule)", () => {
  const fmw = body.slice(body.indexOf('{{- if eq $app "findmyweed" -}}'), body.indexOf('{{- else if eq $app "tuitea" -}}'));
  assert.match(fmw, /Find My <span style="color:#3ddc74">Weed<\/span>/); assert.doesNotMatch(fmw, /BY KEEPITIL/i);
});
