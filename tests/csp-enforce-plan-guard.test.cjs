// Guards docs/cloudflare/csp-enforce-plan.md (a PROPOSAL, nothing applied): the enforce policy keeps script-src strict,
// the doc stays a separate fence from the report-only proposal, and the documented kmob hash is the real hash of the page's block.
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const ROOT = path.join(__dirname, "..");
const doc = fs.readFileSync(path.join(ROOT, "docs/cloudflare/csp-enforce-plan.md"), "utf8");
const ro = fs.readFileSync(path.join(ROOT, "docs/cloudflare/csp-report-only.md"), "utf8");
const m = doc.match(/```csp-enforce\nContent-Security-Policy: ([^\n]+)\n```/);
const parse = (p) => { const d = {}; for (const part of p.split(";")) { const t = part.trim().split(/\s+/); if (t[0]) d[t[0]] = t.slice(1); } return d; };

test("the doc says NOT APPLIED and carries exactly one enforce block", () => {
  assert.ok(m, "csp-enforce block present");
  assert.match(doc, /NOT APPLIED/);
  assert.equal((doc.match(/^Content-Security-Policy:/gm) || []).length, 1);
});
test("the enforce script-src is strict and matches the report-only one", () => {
  const e = parse(m[1]), r = parse(ro.match(/```csp\nContent-Security-Policy-Report-Only: ([^\n]+)\n```/)[1]);
  assert.deepEqual(e["script-src"], r["script-src"]);
  assert.equal(e["script-src"].some((x) => /unsafe-|^\*$|^https?:$|data:/.test(x) || x.startsWith("'sha256-")), false);
  assert.deepEqual(e["object-src"], ["'none'"]);
});
test("the documented kmob hash is the hash of the page's one executable inline block", () => {
  const html = fs.readFileSync(path.join(ROOT, "games/kmob/index.html"), "utf8");
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g)].map((x) => x[1]).filter((t) => t.trim());
  assert.equal(blocks.length, 1);
  const h = "sha256-" + crypto.createHash("sha256").update(blocks[0]).digest("base64");
  assert.ok(doc.includes("'" + h + "'"), "doc carries " + h);
});
test("control: a changed block would not match the documented hash", () => {
  const h = "sha256-" + crypto.createHash("sha256").update("window.KMOB_LT = { html: performance.now() };;").digest("base64");
  assert.equal(doc.includes("'" + h + "'"), false);
});
