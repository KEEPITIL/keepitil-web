// about, artists and business are served at both /x and /x.html (both 200), so each must name
// one canonical URL or search engines split them. Run: node --test tests/canonical-public-pages.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = process.env.CANON_ROOT || path.resolve(__dirname, "..");
for (const n of ["about", "artists", "business"]) {
  test(n + ".html has exactly one extensionless canonical", () => {
    const html = fs.readFileSync(path.join(ROOT, n + ".html"), "utf8");
    const m = [...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)];
    assert.equal(m.length, 1);
    assert.equal(m[0][1], "https://keepitil.com/" + n);
  });
}

// /venues 301s to /venues/ (a folder page); it names the slash form as its one canonical.
test("venues/index.html has exactly one canonical, the trailing-slash form", () => {
  const html = fs.readFileSync(path.join(ROOT, "venues/index.html"), "utf8");
  const m = [...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)];
  assert.equal(m.length, 1);
  assert.equal(m[0][1], "https://keepitil.com/venues/");
});
