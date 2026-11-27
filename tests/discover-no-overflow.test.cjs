// /discover pages must not be wider than the phone: .disc is width:100% plus padding, so it needs border-box (it was 402px wide at 390 and clipped the right edge).
// Run: node --test tests/discover-no-overflow.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = process.env.DO_ROOT || path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(ROOT, "assets/css/discover.css"), "utf8");
// Pure model of the box: content width + padding, as the browser lays it out.
function outerWidth(rule, viewport) {
  const w = /width:100%/.test(rule) ? viewport : 0;
  const pad = (rule.match(/padding:\s*\d+px\s+(\d+)px/) || [0, 0])[1] * 2;
  return /box-sizing:border-box/.test(rule) ? w : w + pad;
}
const rule = css.split("\n").find((l) => l.startsWith(".disc{"));
const phone = (css.match(/@media[^{]*\{\s*\.disc\{([^}]*)\}/) || [])[0] || "";

test(".disc is border-box, so width:100% plus padding fits a 390px phone", () => {
  assert.ok(rule, ".disc rule found");
  assert.equal(outerWidth(rule, 390), 390);
});
test("negative control: the old rule (no box-sizing) is 32px too wide at 390", () => {
  const old = rule.replace(";box-sizing:border-box", "");
  assert.equal(outerWidth(old, 390), 422);
});
test("the phone media-query override only changes padding, so it cannot bring the overflow back", () => {
  assert.ok(phone, "phone override found");
  assert.doesNotMatch(phone, /box-sizing:content-box|[^-]width:/);
});
