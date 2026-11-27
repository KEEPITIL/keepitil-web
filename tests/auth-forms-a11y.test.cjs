// Sign-in (apply.html) and sign-up (signup.html) must have a heading, a name for every
// field, and autocomplete tokens so password managers and screen readers work.
// Run: node --test tests/auth-forms-a11y.test.cjs
const test = require("node:test");
const __A = require("./helpers/event-assembled.cjs").assemble;
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.env.AUTH_A11Y_ROOT || path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const inputs = (html) =>
  [...html.matchAll(/<input\b[^>]*>/gi)].map((m) => m[0]).filter((t) => !/type="(hidden|range|checkbox|file)"/i.test(t) && !/\bkilo-input\b/.test(t));
const attr = (tag, name) => (tag.match(new RegExp("\\b" + name + "=\"([^\"]*)\"", "i")) || [])[1];

for (const f of ["apply.html", "signup.html"]) {
  test(f + " has exactly one h1", () => {
    const n = (read(f).match(/<h1\b/gi) || []).length;
    assert.equal(n, 1, f + " needs one <h1>, found " + n);
  });
  test(f + " every visible field has an accessible name and autocomplete", () => {
    const tags = inputs(read(f));
    assert.ok(tags.length >= 2, "expected form fields in " + f);
    for (const t of tags) {
      assert.ok(attr(t, "aria-label"), "field without aria-label: " + t);
      assert.ok(attr(t, "autocomplete"), "field without autocomplete: " + t);
    }
  });
}

test("signup password fields use new-password, login uses current-password", () => {
  const up = inputs(__A(read("signup.html"))).filter((t) => /type="password"/.test(t));
  assert.equal(up.length, 2);
  for (const t of up) assert.equal(attr(t, "autocomplete"), "new-password");
  const inn = inputs(__A(read("apply.html"))).filter((t) => /type="password"/.test(t));
  assert.equal(inn.length, 1);
  assert.equal(attr(inn[0], "autocomplete"), "current-password");
});
