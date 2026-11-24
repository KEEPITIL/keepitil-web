// /support: the product tiles and topic chips are in the HTML already, so the JS render replaces them with identical markup instead of growing an empty box
// (layout shift 0.04 left after the earlier fix). The static markup must equal what the page script renders. Run: node --test tests/support-static-tiles.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = process.env.SS_ROOT || path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "support/index.html"), "utf8");
const lit = (name) => vm.runInNewContext("(" + html.match(new RegExp("var " + name + " = (\\[[\\s\\S]*?\\n  \\]);"))[1] + ")");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const inner = (id) => html.match(new RegExp('id="' + id + '"[^>]*>([\\s\\S]*?)</div>'))[1];
test("static product tiles equal the rendered ones (no product selected)", () => {
  const want = lit("PRODUCTS").map((p) => '<button type="button" class="prod" data-id="' + p.id + '" aria-pressed="false"><b>' + esc(p.name) + "</b><span>" + esc(p.note) + "</span></button>").join("");
  assert.equal(inner("prods"), want);
});
test("static topic chips equal the rendered ones", () => {
  const want = lit("TOPICS").map((t) => '<button type="button" class="chip" data-q="' + esc(t[1]) + '">' + esc(t[0]) + "</button>").join("");
  assert.equal(inner("topics"), want);
});
test("the page script still renders them (so a ?product= selection and edits keep working)", () => {
  assert.match(html, /function renderProducts\(\)/);
  assert.match(html, /document\.getElementById\('topics'\)\.innerHTML = TOPICS\.map/);
});
