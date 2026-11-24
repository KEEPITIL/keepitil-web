// WCAG 1.4.4: no KEEPITIL site page may block pinch-zoom. Games, apps, kode and Find My Weed pages (other owners / intentional) are out of scope.
// Run: node --test tests/viewport-zoom.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = process.env.VZ_ROOT || path.resolve(__dirname, "..");
const SKIP_DIR = /^(node_modules|\.git|\.github|tests|games|app|kode|find-my-weed|apps\/tuitea|tuiteaapp)(\/|$)/;
const SKIP_FILE = /^(findmyweed|find-my-weed|google)/;
function walk(dir, rel, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) { if (!SKIP_DIR.test(r)) walk(path.join(dir, e.name), r, out); }
    else if (e.name.endsWith(".html") && !(rel === "" && SKIP_FILE.test(e.name))) out.push(r);
  }
  return out;
}
const pages = walk(ROOT, "", []);
const bad = [], noMeta = [];
for (const p of pages) {
  const s = fs.readFileSync(path.join(ROOT, p), "utf8");
  const m = s.match(/<meta\s+name=["']viewport["']\s+content=["']([^"']*)["']/i);
  if (!m) { noMeta.push(p); continue; }
  if (/maximum-scale|user-scalable|minimum-scale/i.test(m[1])) bad.push(p + " :: " + m[1]);
}
test("no page blocks pinch-zoom (maximum-scale / user-scalable)", () => { assert.deepEqual(bad, []); });
test("every checked page still declares width=device-width and initial-scale", () => {
  assert.ok(pages.length > 40, "scanned " + pages.length);
  for (const p of pages) {
    const s = fs.readFileSync(path.join(ROOT, p), "utf8");
    const m = s.match(/<meta\s+name=["']viewport["']\s+content=["']([^"']*)["']/i);
    if (m) assert.match(m[1], /width=device-width/, p), assert.match(m[1], /initial-scale=1/, p);
  }
});

// Without maximum-scale, iOS Safari zooms into any field under 16px when it gets focus. The text fields on the sign-in/sign-up/settings/profile/home forms must be >= 16px.
test("text fields on the account forms are at least 16px (no iOS focus zoom)", () => {
  const rules = {
    "signup.html": /\.card input\{[^}]*font-size:([^;}]+)/, "apply.html": /\.login-card input\{[^}]*font-size:([^;}]+)/,
    "settings.html": /select,input\[type=text\][^{]*\{[^}]*font-size:([^;}]+)/, "profile.html": /\.kil-mf input\[type=text\],\.kil-mf textarea\{[^}]*font-size:([^;}]+)/,
    "index.html": /\.kil-modal-card input\{[^}]*font-size:([^;}]+)/,
  };
  const px = (v) => (/rem$/.test(v) ? parseFloat(v) * 16 : parseFloat(v));
  for (const [f, re] of Object.entries(rules)) {
    const m = fs.readFileSync(path.join(ROOT, f), "utf8").match(re);
    assert.ok(m, f + " rule not found");
    assert.ok(px(m[1].trim()) >= 16, f + " font-size " + m[1]);
  }
  const idx = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").match(/\.subscribe-form input\{[^}]*font-size:([^;}]+)/);
  assert.ok(idx && px(idx[1].trim()) >= 16, "index subscribe input " + (idx && idx[1]));
});
