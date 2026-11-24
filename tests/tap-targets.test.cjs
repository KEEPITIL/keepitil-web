// Footer link rows and FAQ rows on text pages must be comfortable tap targets (found by the 390px sweep:
// links were 16-20px tall). Source probe with a negative control. Run: node --test tests/tap-targets.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = process.env.TT_ROOT || path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
function padV(rule) { const m = rule.match(/padding:\s*(\d+)px/); return m ? +m[1] : 0; }
test("support: legal links are padded and FAQ rows are at least 44px", () => {
  const s = read("support/index.html");
  const legal = s.match(/\.legal a\{([^}]*)\}/);
  assert.ok(legal && /inline-block/.test(legal[1]) && padV(legal[1]) >= 8, ".legal a padding");
  const sum = s.match(/\.faq summary\{([^}]*)\}/);
  assert.ok(sum && /min-height:\s*(4[4-9]|[5-9]\d)px/.test(sum[1]), "faq summary min-height");
});
test("ticket-terms and community-guidelines: cross-link row is padded", () => {
  for (const f of ["ticket-terms.html", "community-guidelines.html"]) {
    const s = read(f);
    const r = s.match(/\.xlinks a\{([^}]*)\}/);
    assert.ok(r && /inline-block/.test(r[1]) && padV(r[1]) >= 8, f + " .xlinks a");
    assert.match(s, /<p class="xlinks"[^>]*><a href="\/terms">Terms of Service<\/a>/, f + " row uses it");
  }
});
