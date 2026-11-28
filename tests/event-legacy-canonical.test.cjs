// Legacy /event?e=<slug> upgrades its canonical to the prerendered /event/<slug>/ only when that page exists. Existence is read from
// sitemap-events.xml (the prerender's own list), never probed with a HEAD request: a probe for a page that does not exist yet returned 404,
// which the browser logs as a console error that no .catch can hide (live QA 2026-11-27).
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs");
const src = require("./helpers/event-assembled.cjs").assemble(fs.readFileSync(require("node:path").join(__dirname, "..", "event.html"), "utf8"));
const block = (src.match(/if\(!window\.__kilPrerenderSlug && ev\.slug && window\.fetch\)\{[\s\S]*?\n    \}\n/) || [])[0] || "";
const SITEMAP = (locs) => '<urlset>' + locs.map((l) => '<url><loc>https://keepitil.com' + l + '</loc></url>').join('') + '</urlset>';
function run(answer, prerendered, code = block) {
  const attrs = {}, og = {};
  const cl = { setAttribute: (k, v) => { attrs[k] = v; } };
  const $ = () => ({ setAttribute: (k, v) => { og[k] = v; } });
  const calls = [];
  const fetchFn = (u, o) => { calls.push([u, (o && o.method) || "GET"]); return answer === "throw" ? Promise.reject(new Error("x")) : Promise.resolve(answer === 404 ? { ok: false, text: async () => "" } : { ok: true, text: async () => answer }); };
  const window = { fetch: fetchFn };
  if (prerendered) window.__kilPrerenderSlug = "a";
  new Function("window", "fetch", "ev", "cl", "$", "encodeURIComponent", code)(window, fetchFn, { slug: "a b" }, cl, $, encodeURIComponent);
  return new Promise((r) => setTimeout(() => r({ attrs, og, calls }), 5));
}
test("block is present", () => assert.ok(block.length > 100));
test("listed in sitemap-events.xml: canonical and og:url move to /event/<slug>/; the only request is the sitemap, never a HEAD probe of the page", async () => {
  const r = await run(SITEMAP(["/event/other/", "/event/a%20b/"]), false);
  assert.deepEqual(r.calls, [["/sitemap-events.xml", "GET"]]);
  assert.equal(r.attrs.href, "https://keepitil.com/event/a%20b/"); assert.equal(r.og.content, "https://keepitil.com/event/a%20b/");
});
test("not listed, sitemap missing or a network error: canonical untouched (never points at a missing page), and no request to the page itself", async () => {
  for (const v of [SITEMAP(["/event/other/", "/event/a%20b-2/"]), 404, "throw", ""]) { const r = await run(v, false); assert.deepEqual(r.attrs, {}, String(v)); assert.ok(r.calls.every(([u]) => u === "/sitemap-events.xml")); }
});
test("the prerendered page itself does no upgrade", async () => { const r = await run(SITEMAP(["/event/a%20b/"]), true); assert.deepEqual(r.calls, []); });
test("canonFor adapts at runtime: the prerendered page (slug present) canonicalises to /event/<slug>/, the legacy page keeps /event?e=<slug>", () => { const m = src.match(/function canonFor\(slug\)\{[^\n]*\}/); assert.ok(m); const f = (pre) => new Function("window", m[0] + "; return canonFor('a b');")({ __kilPrerenderSlug: pre }); assert.equal(f("a-b"), "https://keepitil.com/event/a%20b/"); assert.equal(f(undefined), "https://keepitil.com/event?e=a%20b"); });
test("control: a block that skips the membership check is caught", async () => {
  const bad = block.replace(/if\(x && x\.indexOf\('<loc>https:\/\/keepitil\.com'\+_pp\+'<\/loc>'\)>=0\)\{/, "if(true){");
  assert.notEqual(bad, block);
  const r = await run(SITEMAP(["/event/other/"]), false, bad); assert.ok(r.attrs.href, "bad variant sets the canonical for an unlisted page, so the real test would fail it");
});
test("the old HEAD probe is gone (it logged a 404 console error for every event without a prerendered page)", () => { assert.doesNotMatch(block, /method:\s*'HEAD'/); });
