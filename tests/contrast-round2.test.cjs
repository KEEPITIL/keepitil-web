// Contrast round 2 (axe sweep of about/artists/business/venues, connect, create): source probes with computed ratios. Run: node --test tests/contrast-round2.test.cjs
const test = require("node:test");
const __A = require("./helpers/event-assembled.cjs").assemble;
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = process.env.C2_ROOT || path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
test("about, artists, business and venues underline their footer links (colour alone is not enough)", () => {
  for (const f of ["about.html", "artists.html", "business.html", "venues/index.html"]) assert.match(read(f), /footer a\{[^}]*text-decoration:underline\}/, f);
});
test("connect: white text on the artist button is >= 4.5:1 and the count/placeholder grey is >= 4.5:1 on the page background", () => {
  const s = __A(read("connect/index.html"));
  const bg = s.match(/\.seg button\[data-k=artist\]\.on\{background:(#[0-9a-f]{6});color:#fff;\}/i); assert.ok(bg, "artist rule");
  assert.ok(ratio(bg[1], "#ffffff") >= 4.5, "artist " + bg[1]);
  const ink3 = s.match(/--ink3:(#[0-9a-f]{6});/i)[1]; assert.ok(ratio(ink3, "#0b0b12") >= 4.5, "ink3 " + ink3);
  assert.ok(ratio(s.match(/\.comm-search input::placeholder\{color:(#[0-9a-f]{6})\}/i)[1], "#0b0b12") >= 4.5);
});
test("create: months with no entries are dimmed without dropping below 4.5:1 (dashed border marks them instead)", () => {
  const m = read("vs-app.js").match(/\.ce-chip\.ce-empty\{opacity:([0-9.]+);border-style:dashed\}/);
  assert.ok(m, "ce-empty rule"); assert.ok(parseFloat(m[1]) >= 0.85, "opacity " + m[1]);
});
test("vs-app.js is loaded with the current stamp", () => {
  const stamps = new Set();
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if ([".git", "node_modules"].includes(e.name)) continue; const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else if (/\.html$/.test(e.name)) for (const x of fs.readFileSync(p, "utf8").matchAll(/vs-app\.js\?v=(\d+[a-z]*)/g)) stamps.add(x[1]); } })(ROOT);
  assert.deepEqual([...stamps], ["20261124b"]);
});
