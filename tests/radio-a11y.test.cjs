// Radio a11y (Tower 2 baseline items 7a/7b): the SoundCloud iframe has a title and the LIVE RADIO button's accessible name contains its visible text.
// Run: node --test tests/radio-a11y.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = process.env.RA_ROOT || path.resolve(__dirname, "..");
const js = fs.readFileSync(path.join(ROOT, "assets/js/keepitil-radio.js"), "utf8");
test("the LIVE RADIO button's accessible name contains its visible text", () => {
  const m = js.match(/id="kr-live"[^>]*aria-label="([^"]+)"/);
  assert.ok(m, "kr-live aria-label");
  assert.match(m[1], /LIVE RADIO/);
  const f = js.match(/function _gwLabel\(st\)\{[\s\S]*?\n  \}/);
  assert.ok(f, "_gwLabel");
  assert.equal((f[0].match(/'LIVE RADIO: /g) || []).length, 2, "both states carry the visible text");
});
test("every place that creates #kil-sc gives the iframe a title", () => {
  const creators = [...js.matchAll(/\.id='kil-sc'|\.id = 'kil-sc'/g)].length;
  const titled = [...js.matchAll(/setAttribute\('title','KEEPITIL Radio audio player'\)/g)].length;
  assert.ok(creators >= 2, "found creators: " + creators);
  assert.ok(titled >= creators, titled + " titles for " + creators + " creators");
});
test("every page that loads keepitil-radio.js uses the current stamp (stale CDN/SW copy would hide the fix)", () => {
  const stamps = new Set();
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if ([".git", "node_modules"].includes(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(html|js)$/.test(e.name)) for (const m of fs.readFileSync(p, "utf8").matchAll(/keepitil-radio\.js\?v=(\d+[a-z]*)/g)) stamps.add(m[1]);
    }
  })(ROOT);
  assert.deepEqual([...stamps], ["20261124a"]);
});
