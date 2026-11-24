// Article pages (axe sweep 2026-11-24): grey/blue/orange text on the light panel was 2.3-3.3:1, and the Sources / footnote blocks that sit
// outside the panel were dark ink on the dark page. Run: node --test tests/article-contrast.test.cjs
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const dirs = fs.readdirSync(path.join(ROOT, "article")).filter((d) => fs.existsSync(path.join(ROOT, "article", d, "index.html")));
const pages = dirs.map((d) => ({ d, html: fs.readFileSync(path.join(ROOT, "article", d, "index.html"), "utf8") })).filter((p) => p.html.includes("--ink3:#8b839e"));
const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const PANEL = "#dad8dd", PANEL_DARKEST = "#c9d9d8", DARK = "#0a0a0f";
test("every article page with the shared theme carries the contrast block (not an empty scan)", () => {
  assert.ok(pages.length >= 11, "only " + pages.length);
  assert.deepEqual(pages.filter((p) => !p.html.includes("a11y contrast (axe, 2026-11-24)")).map((p) => p.d), []);
});
test("the chosen colours pass 4.5:1 on the surface they are used on", () => {
  for (const [fg, bg] of [["#5a5372", PANEL], ["#004fa3", PANEL], ["#a63b00", PANEL], ["#544c6b", PANEL], ["#160f24", PANEL], ["#c9c3d9", DARK], ["#ffffff", DARK], ["#6aa9ff", DARK]])
    assert.ok(ratio(fg, bg) >= 4.5, fg + " on " + bg + " = " + ratio(fg, bg).toFixed(2));
  assert.ok(ratio("#5a5372", PANEL_DARKEST) >= 4.5);
});
test("control: the old colours fail, so the check can tell the difference", () => {
  for (const [fg, bg] of [["#8b839e", PANEL], ["#0071e3", PANEL], ["#ff5500", PANEL], ["#160f24", DARK]]) assert.ok(ratio(fg, bg) < 4.5, fg + " on " + bg);
});
test("outside-the-panel blocks are light, inside-the-panel blocks are dark (rules exist for both)", () => {
  for (const p of pages) {
    assert.match(p.html, /\.foot-note\{color:#c9c3d9\}/, p.d); assert.match(p.html, /\.artpanel \.foot-note\{color:#5a5372\}/, p.d);
    assert.match(p.html, /\.src-wrap h2\{color:#fff\}/, p.d); assert.match(p.html, /\.artpanel \.src-wrap h2\{color:#160f24\}/, p.d);
  }
});
