// Legacy /event?e=<slug> upgrades its canonical to the prerendered /event/<slug>/ only when that page exists (HEAD ok).
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs");
const src = require("./helpers/event-assembled.cjs").assemble(fs.readFileSync(require("node:path").join(__dirname, "..", "event.html"), "utf8"));
const block = (src.match(/if\(!window\.__kilPrerenderSlug && ev\.slug && window\.fetch\)\{[\s\S]*?\n    \}\n/) || [])[0] || "";
function run(headOk, prerendered) {
  const attrs = {}, og = {};
  const cl = { setAttribute: (k, v) => { attrs[k] = v; } };
  const $ = () => ({ setAttribute: (k, v) => { og[k] = v; } });
  const calls = [];
  const window = { fetch: (u, o) => { calls.push([u, o.method]); return headOk === "throw" ? Promise.reject(new Error("x")) : Promise.resolve({ ok: headOk }); } };
  if (prerendered) window.__kilPrerenderSlug = "a";
  new Function("window", "fetch", "ev", "cl", "$", "encodeURIComponent", block)(window, window.fetch, { slug: "a b" }, cl, $, encodeURIComponent);
  return new Promise((r) => setTimeout(() => r({ attrs, og, calls }), 5));
}
test("block is present", () => assert.ok(block.length > 100));
test("HEAD ok: canonical and og:url move to /event/<slug>/", async () => {
  const r = await run(true, false);
  assert.deepEqual(r.calls, [["/event/a%20b/", "HEAD"]]);
  assert.equal(r.attrs.href, "https://keepitil.com/event/a%20b/"); assert.equal(r.og.content, "https://keepitil.com/event/a%20b/");
});
test("HEAD 404 or network error: canonical untouched (never points at a missing page)", async () => {
  for (const v of [false, "throw"]) { const r = await run(v, false); assert.deepEqual(r.attrs, {}); }
});
test("the prerendered page itself does no upgrade", async () => { const r = await run(true, true); assert.deepEqual(r.calls, []); });
test("canonFor adapts at runtime: the prerendered page (slug present) canonicalises to /event/<slug>/, the legacy page keeps /event?e=<slug>", () => { const m = src.match(/function canonFor\(slug\)\{[^\n]*\}/); assert.ok(m); const f = (pre) => new Function("window", m[0] + "; return canonFor('a b');")({ __kilPrerenderSlug: pre }); assert.equal(f("a-b"), "https://keepitil.com/event/a%20b/"); assert.equal(f(undefined), "https://keepitil.com/event?e=a%20b"); });
test("control: a block that skips the HEAD check is caught", async () => {
  const bad = block.replace(/\.then\(function\(r\)\{\s*if\(r&&r\.ok\)\{/, ".then(function(r){ {");
  assert.notEqual(bad, block);
  const attrs = {}; const fk = () => Promise.resolve({ ok: false }); new Function("window","fetch","ev","cl","$","encodeURIComponent",bad)({ fetch: fk }, fk, { slug: "a" }, { setAttribute: (k, v) => { attrs[k] = v; } }, () => ({ setAttribute() {} }), encodeURIComponent);
  await new Promise((r) => setTimeout(r, 5)); assert.ok(attrs.href, "bad variant sets canonical on 404, so the real test would fail it");
});
