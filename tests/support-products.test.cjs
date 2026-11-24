// /support product list must match what is live: TUITEA, KMOB, WiFi Remote on the App Store; Kai Tarako and Find My Weed on the web.
// Run: node --test tests/support-products.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = process.env.SP_ROOT || path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "support/index.html"), "utf8");
function lit(name) {
  const m = html.match(new RegExp("var " + name + " = (\\[[\\s\\S]*?\\n  \\]|\\{[\\s\\S]*?\\n  \\});"));
  assert.ok(m, name + " not found");
  return vm.runInNewContext("(" + m[1] + ")");
}
const PRODUCTS = lit("PRODUCTS"), LINKS = lit("LINKS");
const note = (id) => (PRODUCTS.find((p) => p.id === id) || {}).note || "";
test("nothing live is marked coming soon", () => {
  for (const p of PRODUCTS) assert.doesNotMatch(p.note, /coming soon/i, p.id);
});
test("App Store apps say so and link to the right store page", () => {
  const ids = { tuitea: "id6806472413", kmob: "id6822852714", "wifi-remote": "id6790006312" };
  for (const [k, v] of Object.entries(ids)) {
    assert.match(note(k), /App Store/, k);
    assert.ok(LINKS[k].some((l) => l[1] === "https://apps.apple.com/app/" + v), k + " store link");
  }
});
test("Kai Tarako and Find My Weed are web, with their own entry", () => {
  assert.match(note("kaitarako"), /web/);
  assert.match(note("fmw"), /web/);
  assert.ok(LINKS.kaitarako.some((l) => l[1] === "/app/kaitarako/"));
  assert.ok(LINKS.fmw.some((l) => l[1] === "/app/findmyweed/"));
});
test("every product has links and short names resolve", () => {
  for (const p of PRODUCTS) assert.ok(LINKS[p.id] && LINKS[p.id].length, p.id);
  assert.match(html, /'kai':'kaitarako'/);
  assert.match(html, /'findmyweed':'fmw'/);
});
