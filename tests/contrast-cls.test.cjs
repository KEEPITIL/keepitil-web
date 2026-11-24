// Tower 2 baseline (2026-11-23) items: color contrast on the home calendar and the shared footer, links that rely on colour alone, and the
// /support layout shift (CLS 0.496). Source probes; the values were also verified with axe-core 4.10.2 and a layout-shift observer in real Chrome.
// Run: node --test tests/contrast-cls.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = process.env.CC_ROOT || path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const BG = "#0a0a0f";
function colorOf(src, selector) {
  const i = src.indexOf(selector + "{"); assert.ok(i >= 0, selector + " rule not found");
  const m = src.slice(i, src.indexOf("}", i)).match(/[;{]color:(#[0-9a-f]{6})/i); assert.ok(m, selector + " has no hex color"); return m[1];
}
test("home calendar text is at least 4.5:1 on the page background", () => {
  const s = read("index.html");
  for (const sel of ["#evx .evx-empty", "#evx .evx-mhead-c", "#evx .evx-gn", "#evx .evx-daycount", "#evx .evx-daycount-inline"]) {
    const c = colorOf(s, sel); assert.ok(ratio(c, BG) >= 4.5, sel + " " + c + " = " + ratio(c, BG).toFixed(2));
  }
});
test("the shared footer no longer fades its text with opacity", () => {
  const s = read("keepitil-shell.js");
  for (const re of [/v3-foot-addr\{[^}]*opacity/, /v3-foot-entity\{[^}]*opacity/, /class="v3-foot-legal" style="[^"]*opacity/, /font-size:\.7rem;line-height:1\.7;opacity/, /'opacity:\.6;padding-top:6px\}'/]) assert.doesNotMatch(s, re, String(re));
  assert.match(s, /v3-foot-addr a\{[^}]*text-decoration:underline/);
});
test("links inside text are underlined, not distinguished by colour alone", () => {
  assert.match(read("support/index.html"), /\.contact a\{[^}]*text-decoration:underline/);
  assert.match(read("signup.html"), /\.row a\{text-decoration:underline\}/);
});
test("/support first paint already matches the layout the shell applies (no layout shift)", () => {
  const shell = read("keepitil-shell.js"), s = read("support/index.html");
  const max = shell.match(/--kil-page-max:(\d+)px/)[1], pad = shell.match(/--kil-page-pad:(\d+)px/)[1], nav = shell.match(/paddingTop='(\d+)px'/)[1];
  assert.match(s, new RegExp("@media\\(min-width:861px\\)\\{body\\{padding-top:" + nav + "px\\}\\.wrap\\{max-width:" + max + "px;padding-left:" + pad + "px;padding-right:" + pad + "px\\}\\}"));
  assert.match(s, /#main-nav\{position:absolute;left:-9999px/);
});
test("every page loads the same keepitil-shell.js stamp (a stale CDN copy would hide the fix)", () => {
  const stamps = new Set();
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if ([".git", "node_modules"].includes(e.name)) continue; const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else if (/\.(html|js)$/.test(e.name)) for (const m of fs.readFileSync(p, "utf8").matchAll(/keepitil-shell\.js\?v=(\d+[a-z]*)/g)) stamps.add(m[1]); } })(ROOT);
  assert.deepEqual([...stamps], ["20261124a"]);
});
