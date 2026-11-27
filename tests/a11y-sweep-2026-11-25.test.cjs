// KEEPITIL live a11y sweep 2026-11-25 (fmw-web) + Black Friday leftovers. Source probes, each with a negative control.
// Run: node --test tests/a11y-sweep-2026-11-25.test.cjs
const test = require("node:test");
const __A = require("./helpers/event-assembled.cjs").assemble;
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = process.env.A11_ROOT || path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const count = (s, re) => (s.match(re) || []).length;

test("404.html has exactly one <main> in the markup; the revealed box gets role=main", () => {
  const s = __A(read("404.html"));
  assert.equal(count(s, /<main[\s>]/g), 1);
  assert.equal(count(s, /<\/main>/g), 1);
  assert.match(s, /id="fmwfourohfour"/);
  assert.match(s, /box\.setAttribute\('role','main'\)/);
  assert.equal(count("<main a><main b>", /<main[\s>]/g), 2, "negative control: the old markup would count 2");
});
test("#kilo-input has an accessible name", () => {
  const s = read("assets/js/keepitil-ai.js");
  const m = s.match(/<input id="kilo-input"[^>]*>/);
  assert.ok(m, "input found");
  assert.match(m[0], /aria-label="Ask KEEPITIL"/);
  assert.doesNotMatch('<input id="kilo-input" type="text" placeholder="x"/>'.match(/<input id="kilo-input"[^>]*>/)[0], /aria-label/, "negative control");
});
test("footer links, social icons, footer brand, shell nav links and Forgot password are at least 24px", () => {
  const s = read("keepitil-shell.js");
  for (const sel of ["#v3-footer .v3-foot-links a", "#v3-footer .v3-foot-social a", "#v3-footer .v3-foot-about a.v3-foot-brand", "#v3shell-nav .v3s-links a"]) {
    const rules = [];
    for (let i = s.indexOf("'" + sel + "{"); i > -1; i = s.indexOf("'" + sel + "{", i + 1)) rules.push(s.slice(i, s.indexOf("}", i)));
    assert.ok(rules.length, sel);
    assert.ok(rules.some((r) => /min-height:24px/.test(r)), sel);
  }
  const a = __A(read("apply.html")).match(/\.forgot\{([^}]*)\}/);
  assert.ok(a && /min-height:24px/.test(a[1]) && /padding:4px 0/.test(a[1]));
  assert.doesNotMatch(".forgot{display:inline-block;margin-top:16px;font-size:.82rem;}".match(/\.forgot\{([^}]*)\}/)[1], /min-height/, "negative control");
});
test("Black Friday leftovers are gone: no early-access script, lead line or season entry", () => {
  const e = __A(read("earn/index.html"));
  assert.doesNotMatch(e, /EARLY ACCESS ends with the sale/);
  assert.doesNotMatch(e, /getElementById\('early'\)/);
  assert.doesNotMatch(e, /early access/i);
  assert.match(e, /Ways to earn with KEEPITIL: partner programmes and creator rewards\./);
  assert.doesNotMatch(read("kil-seasons.js"), /black-friday/);
  assert.doesNotMatch(read("index.html"), /'black-friday'/);
  assert.match(read("kil-seasons.js"), /'thanksgiving'/, "other seasons are untouched");
});
