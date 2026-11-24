// Public pages must not ship draft placeholders, and og/twitter/ld images on keepitil.com must exist in the repo.
// Run: node --test tests/article-placeholders.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = process.env.AP_ROOT || path.resolve(__dirname, "..");
const SKIP = /^(node_modules|\.git|\.github|tests|app\/tuitea)(\/|$)/;
function walk(d, out) {
  out = out || [];
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name), rel = path.relative(ROOT, p);
    if (SKIP.test(rel)) continue;
    if (f.isDirectory()) walk(p, out);
    else if (f.name.endsWith(".html") && !/\.play\.html$/.test(f.name)) out.push(rel); // *.play.html are not served (404 live)
  }
  return out;
}
const pages = walk(ROOT);

test("no draft placeholders on any shipped page", () => {
  const bad = [];
  for (const f of pages) {
    const s = fs.readFileSync(path.join(ROOT, f), "utf8");
    if (/APP_STORE_URL_PENDING|Draft note for review|href=["']#?(TODO|PLACEHOLDER)["']/i.test(s)) bad.push(f);
  }
  assert.deepEqual(bad, []);
});

test("og:image, twitter:image and ld image on keepitil.com exist in the repo", () => {
  const missing = [];
  for (const f of pages) {
    const s = fs.readFileSync(path.join(ROOT, f), "utf8");
    const urls = new Set();
    for (const m of s.matchAll(/(?:property=["']og:image["']|name=["']twitter:image["'])[^>]*content=["']([^"']+)["']/gi)) urls.add(m[1]);
    for (const m of s.matchAll(/content=["']([^"']+)["'][^>]*(?:property=["']og:image["']|name=["']twitter:image["'])/gi)) urls.add(m[1]);
    for (const m of s.matchAll(/"image":\s*\[?\s*"([^"]+)"/g)) urls.add(m[1]);
    for (const u of urls) {
      const m = u.match(/^https:\/\/keepitil\.com(\/[^?#]*)$/);
      if (!m) continue;
      const rel = decodeURIComponent(m[1]).slice(1);
      if (/^app\/tuitea\//.test(rel)) continue; // published by TUITEA CI, not in this repo's tree
      if (!fs.existsSync(path.join(ROOT, rel))) missing.push(f + " -> " + u);
    }
  }
  assert.deepEqual(missing, []);
});
