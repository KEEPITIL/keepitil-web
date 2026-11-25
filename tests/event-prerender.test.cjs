// Per-event prerender: output correctness, XSS safety on every event field, idempotence, stale cleanup, failure handling, template drift.
// Run: node --test tests/event-prerender.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { after } = require("node:test");
const __made = [];
after(() => { for (const d of __made) fs.rmSync(d, { recursive: true, force: true }); });   // temp dirs are removed when the file's tests finish
const mk = (prefix) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); __made.push(d); return d; };
const ROOT = process.env.EP_ROOT || path.resolve(__dirname, "..");
const TEMPLATE = fs.readFileSync(path.join(ROOT, "event.html"), "utf8");
const lib = () => import(path.join(ROOT, "scripts/build-event-pages.mjs"));
const row = (o) => Object.assign({ slug: "sample-show-20270101", title: "Sample Show", venue: "The Venue", city: "Long Beach", starts_at: "2027-01-02T04:00:00+00:00", tz: "America/Los_Angeles", genres: "house techno", cover_url: "https://seatgeekimages.com/a/b.jpg", description: "A real description.", status: "published" }, o || {});
const dom = (html) => new JSDOM(html).window.document;

test("a normal event gets its real head and above-the-fold content in the HTML", async () => {
  const { renderEventPage } = await lib();
  const d = dom(renderEventPage(TEMPLATE, row()));
  assert.equal(d.querySelector("h1#ev-title").textContent, "Sample Show");
  assert.equal(d.title, "Sample Show — Fri, Jan 1, 2027 | KEEPITIL");
  assert.equal(d.querySelector("link[rel=canonical]").href, "https://keepitil.com/event/sample-show-20270101/");
  assert.equal(d.querySelector("#og-url").content, "https://keepitil.com/event/sample-show-20270101/");
  assert.equal(d.querySelector("#og-img").content, "https://seatgeekimages.com/a/b.jpg");
  const img = d.querySelector("#ev-flyer img");
  assert.equal(img.getAttribute("fetchpriority"), "high"); assert.equal(img.alt, "Flyer for Sample Show");
  assert.equal(d.querySelector("#ev-venue").textContent, "📍 The Venue, Long Beach");
  assert.equal(d.querySelector("#ev-genre").textContent, "house techno");
  assert.equal(d.querySelector("#ev-desc").textContent, "A real description.");
  const ld = JSON.parse(d.querySelector("#ld-event").textContent);
  assert.equal(ld["@type"], "MusicEvent"); assert.equal(ld.url, "https://keepitil.com/event/sample-show-20270101/"); assert.equal(ld.location.name, "The Venue");
  assert.match(d.documentElement.outerHTML, /window\.__kilPrerenderSlug="sample-show-20270101"/);
  assert.match(TEMPLATE.length ? renderEventPage(TEMPLATE, row()) : "", /slug:g\('e'\)\|\|window\.__kilPrerenderSlug\|\|''/);
  assert.match(renderEventPage(TEMPLATE, row()), /function canonFor\(slug\)\{ return 'https:\/\/keepitil\.com\/event\/'\+encodeURIComponent\(slug\|\|''\)\+'\/'; \}/);
});

test("XSS: hostile text in every field stays text; no script, no event handler, no javascript: URL is created", async () => {
  const { renderEventPage } = await lib();
  const benign = renderEventPage(TEMPLATE, row());
  const P = '</script><img src=x onerror=alert(1)>"\'`<svg onload=alert(2)>';
  const hostile = renderEventPage(TEMPLATE, row({ title: P, venue: P, city: P, genres: P, description: P, cover_url: "javascript:alert(3)" }));
  const d = dom(hostile), b = dom(benign);
  assert.equal(d.querySelectorAll("script").length, b.querySelectorAll("script").length, "no extra <script> element");
  assert.equal(d.querySelectorAll("[onerror],[onload],[onclick],[onmouseover]").length, b.querySelectorAll("[onerror],[onload],[onclick],[onmouseover]").length, "no new event-handler attributes");
  assert.equal(d.querySelector("h1#ev-title").textContent, P);
  assert.equal(d.querySelector("#ev-desc").textContent, P);
  assert.equal(d.querySelector("#ev-genre").textContent, P);
  assert.ok(d.querySelector("#og-title").content.startsWith(P) && d.querySelector("#og-title").content.endsWith(" | KEEPITIL"), "og:title carries the text, escaped");
  assert.ok(d.querySelector("#m-desc").content.includes(P));
  assert.ok(d.title.includes(P));
  const ld = JSON.parse(d.querySelector("#ld-event").textContent);
  assert.equal(ld.name, P);
  assert.equal(d.querySelector("#ev-flyer img"), null, "javascript: cover_url is dropped, no <img>");
  assert.equal(d.querySelector("link[rel=preload][as=image]"), null, "and no preload");
  assert.equal(d.querySelector("#og-img").content, "https://keepitil.com/keepitil-og.png", "og:image keeps the default");
  assert.ok(!/<img src=x onerror/.test(hostile) && !/<svg onload/.test(hostile), "payload never appears as markup");
  const ldRaw = hostile.match(/<script type="application\/ld\+json" id="ld-event">([\s\S]*?)<\/script>/)[1];
  assert.ok(!ldRaw.includes("</script>") && !ldRaw.includes("<"), "JSON-LD cannot close its own script");
  for (const bad of ["data:text/html,hi", "file:///etc/passwd", "//evil.example/x.png", "vbscript:x"]) assert.equal(dom(renderEventPage(TEMPLATE, row({ cover_url: bad }))).querySelector("#ev-flyer img"), null, bad);
});

test("bad slugs are refused (path traversal, quotes, spaces, uppercase, empty)", async () => {
  const { renderEventPage, SLUG_RE } = await lib();
  for (const s of ["../x", "a/b", 'a"b', "a b", "<x>", "ABC", "", "-lead", "x".repeat(200)]) { assert.equal(SLUG_RE.test(s), false, s); assert.throws(() => renderEventPage(TEMPLATE, row({ slug: s })), /bad slug/); }
});

test("rendering twice gives byte-identical output (no timestamps, so no churn commits)", async () => {
  const { renderEventPage, writeIfChanged } = await lib();
  assert.equal(renderEventPage(TEMPLATE, row()), renderEventPage(TEMPLATE, row()));
  const f = path.join(mk("pr-"), "event", "x", "index.html");
  assert.equal(writeIfChanged(f, "a"), true); assert.equal(writeIfChanged(f, "a"), false); assert.equal(writeIfChanged(f, "b"), true);
});

test("removeStale deletes only generated pages of events that are no longer published", async () => {
  const { removeStale, MARKER } = await lib();
  const d = mk("pr-");
  for (const [n, c] of [["keep-me", MARKER], ["gone", MARKER], ["hand-made", "<html>mine</html>"]]) { fs.mkdirSync(path.join(d, "event", n), { recursive: true }); fs.writeFileSync(path.join(d, "event", n, "index.html"), c); }
  assert.deepEqual(removeStale(d, new Set(["keep-me"])), ["gone"]);
  assert.ok(fs.existsSync(path.join(d, "event", "keep-me")) && fs.existsSync(path.join(d, "event", "hand-made")) && !fs.existsSync(path.join(d, "event", "gone")));
});

test("main(): writes published events, skips bad slugs and unpublished rows, and a failed fetch never deletes an existing page", async () => {
  const { main, MARKER } = await lib();
  const d = mk("pr-");
  fs.writeFileSync(path.join(d, "event.html"), TEMPLATE);
  fs.mkdirSync(path.join(d, "event", "flaky-event"), { recursive: true }); fs.writeFileSync(path.join(d, "event", "flaky-event", "index.html"), MARKER + "old");
  fs.mkdirSync(path.join(d, "event", "was-published"), { recursive: true }); fs.writeFileSync(path.join(d, "event", "was-published", "index.html"), MARKER + "old");
  const calls = [];
  const fakeFetch = async (url, opt = {}) => {
    calls.push((opt.method || "GET") + " " + url.replace(/https:\/\/[a-z0-9]+\.supabase\.co/, ""));
    if (url.includes("/rest/v1/events?")) return { ok: true, json: async () => [{ slug: "good-one" }, { slug: "../evil" }, { slug: "flaky-event" }, { slug: "draft-now" }] };
    const slug = JSON.parse(opt.body).p_slug;
    if (slug === "flaky-event") return { ok: false, status: 503 };
    if (slug === "draft-now") return { ok: true, json: async () => [row({ slug, status: "draft" })] };
    return { ok: true, json: async () => [row({ slug })] };
  };
  const res = await main(["--out", d], fakeFetch);
  assert.deepEqual(res.changed, ["good-one"]);
  assert.deepEqual(res.skipped, ["../evil"]);
  assert.ok(fs.existsSync(path.join(d, "event", "good-one", "index.html")));
  assert.ok(!fs.existsSync(path.join(d, "event", "draft-now")), "an unpublished row is not written");
  assert.ok(fs.existsSync(path.join(d, "event", "flaky-event", "index.html")), "a failed fetch keeps the existing page");
  assert.ok(!fs.existsSync(path.join(d, "event", "was-published")), "an event that is no longer published is removed");
  assert.ok(calls.every((c) => /^(GET|POST) \/rest\/v1\/(events\?status=eq\.published|rpc\/get_event_view)/.test(c)), "only the two read calls: " + calls.join(" | "));
});

test("template drift guard: the current event.html still has every anchor the generator needs", async () => {
  const { renderEventPage } = await lib();
  assert.doesNotThrow(() => renderEventPage(TEMPLATE, row()));
});
// appended to tests/event-prerender.test.cjs
test("sitemap: one /event/<slug>/ URL per prerendered, unfinished event, sorted, no run date, XML-safe", async () => {
  const { buildEventsSitemap } = await lib();
  const now = new Date("2026-11-24T12:00:00Z");
  const x = buildEventsSitemap([
    { slug: "zeta", ends_at: "2026-12-01T00:00:00Z" }, { slug: "alpha", starts_at: "2026-11-30T00:00:00Z" },
    { slug: "done", ends_at: "2026-11-01T00:00:00Z" }, { slug: "nodate" }, { slug: "../evil", ends_at: "2027-01-01T00:00:00Z" }, { slug: "a&b", ends_at: "2027-01-01T00:00:00Z" },
  ], now);
  assert.deepEqual([...x.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]), ["https://keepitil.com/event/alpha/", "https://keepitil.com/event/zeta/"]);
  assert.ok(!/event\?e=/.test(x) && !/lastmod/.test(x));
  assert.equal(x, buildEventsSitemap([{ slug: "alpha", starts_at: "2026-11-30T00:00:00Z" }, { slug: "zeta", ends_at: "2026-12-01T00:00:00Z" }], now).replace(/^/, "") );
});
test("main(): writes the sitemap when every fetch worked, and leaves it alone when any fetch failed", async () => {
  const { main } = await lib();
  const future = new Date(Date.now() + 864e5 * 30).toISOString();
  for (const flaky of [false, true]) {
    const d = mk("pr-");
    fs.writeFileSync(path.join(d, "event.html"), TEMPLATE);
    fs.writeFileSync(path.join(d, "sitemap-events.xml"), "OLD");
    const fakeFetch = async (url, opt = {}) => {
      if (url.includes("/rest/v1/events?")) return { ok: true, json: async () => [{ slug: "good-one" }, { slug: "flaky-event" }] };
      const slug = JSON.parse(opt.body).p_slug;
      if (flaky && slug === "flaky-event") return { ok: false, status: 503 };
      return { ok: true, json: async () => [row({ slug, ends_at: future, starts_at: future })] };
    };
    await main(["--out", d], fakeFetch);
    const sm = fs.readFileSync(path.join(d, "sitemap-events.xml"), "utf8");
    if (flaky) assert.equal(sm, "OLD", "a failed fetch must not rewrite (shrink) the sitemap");
    else assert.match(sm, /event\/flaky-event\/<\/loc>[\s\S]*event\/good-one\/<\/loc>|event\/good-one\/<\/loc>/);
    if (!flaky) assert.equal((sm.match(/<loc>/g) || []).length, 2);
  }
});

test("og:image is never an SVG: the branded placeholder (and any .svg cover) keeps the default raster share image, while the page still shows the cover", async () => {
  const { renderEventPage } = await lib();
  const DEFAULT_OG = "https://keepitil.com/keepitil-og.png";
  for (const cover of ["https://keepitil.com/assets/images/event-placeholder.svg", "https://cdn.example.com/a/Flyer.SVG", "https://cdn.example.com/a/flyer.svg?v=2#x"]) {
    const d = dom(renderEventPage(TEMPLATE, row({ cover_url: cover })));
    assert.equal(d.querySelector("#og-img").content, DEFAULT_OG, "svg cover -> default raster og:image: " + cover);
    assert.equal(d.querySelector("#ev-flyer img").getAttribute("src"), cover, "the page still shows the cover: " + cover);
    assert.equal(d.querySelector("link[rel=preload][as=image]").getAttribute("href"), cover);
    assert.equal(d.querySelectorAll('meta[property="og:image"]').length, 1, "exactly one og:image, no twitter:image invented");
    assert.equal(d.querySelector('meta[name="twitter:image"]'), null);
  }
});

test("negative controls: a raster cover still becomes og:image, including names or queries that merely contain 'svg'", async () => {
  const { renderEventPage } = await lib();
  for (const cover of ["https://seatgeekimages.com/a/b.jpg", "https://cdn.example.com/svg-banner.jpg", "https://cdn.example.com/a/flyer.png?fmt=svg", "https://cdn.example.com/a/flyer.svg.png", "https://cdn.example.com/svg/flyer.webp"]) {
    const d = dom(renderEventPage(TEMPLATE, row({ cover_url: cover })));
    assert.equal(d.querySelector("#og-img").content, cover, "raster kept: " + cover);
  }
  // and an unparseable / unsafe cover falls back to the default exactly as before (no og:image override, no flyer img)
  const d = dom(renderEventPage(TEMPLATE, row({ cover_url: "javascript:alert(1)" })));
  assert.equal(d.querySelector("#og-img").content, "https://keepitil.com/keepitil-og.png");
});

test("JSON-LD image: an SVG cover gets the site's raster default, raster covers (even with 'svg' in the name or query) stay (NEGATIVE CONTROL inside)", async () => {
  const { renderEventPage } = await lib();
  const DEFAULT_OG = "https://keepitil.com/keepitil-og.png", ldOf = (cover) => JSON.parse(dom(renderEventPage(TEMPLATE, row({ cover_url: cover }))).querySelector("#ld-event").textContent);
  for (const cover of ["https://keepitil.com/assets/images/event-placeholder.svg", "https://cdn.example.com/a/Flyer.SVG", "https://cdn.example.com/a/flyer.svg?v=2#x"]) assert.equal(ldOf(cover).image, DEFAULT_OG, "svg -> default: " + cover);
  for (const cover of ["https://seatgeekimages.com/a/b.jpg", "https://cdn.example.com/svg-banner.png", "https://cdn.example.com/a/flyer.webp?fmt=svg", "https://cdn.example.com/a/flyer.svg.jpg"]) assert.equal(ldOf(cover).image, cover, "raster kept: " + cover);
  assert.equal(ldOf(null).image, undefined, "no cover, no image (unchanged)");
});

test("runtime (event.html): og:image and the JSON-LD image use the raster default for an SVG cover; isSvgUrl is path-based (NEGATIVE CONTROL: a name or query containing 'svg' is not an SVG)", () => {
  const vm = require("node:vm");
  const m = TEMPLATE.match(/function isSvgUrl\(u\)\{[^\n]*\}/); assert.ok(m, "isSvgUrl exists");
  const f = vm.runInNewContext("(" + m[0].replace("function isSvgUrl", "function") + ")", { URL, location: { href: "https://keepitil.com/event?e=x" }, String });
  for (const u of ["/assets/images/event-placeholder.svg", "https://x.test/A.SVG", "https://x.test/a.svg?v=1#z"]) assert.equal(f(u), true, u);
  for (const u of ["https://x.test/a.jpg", "https://x.test/svg-banner.png", "https://x.test/a.webp?fmt=svg", "https://x.test/a.svg.jpg", "https://x.test/svg/a.png"]) assert.equal(f(u), false, u);
  assert.match(TEMPLATE, /if\(ev\.img && !isSvgUrl\(ev\.img\)\) \$\('og-img'\)\.setAttribute/);
  assert.match(TEMPLATE, /ld\.image=isSvgUrl\(ev\.img\)\?'https:\/\/keepitil\.com\/keepitil-og\.png':ev\.img;/);
  assert.doesNotMatch(TEMPLATE, /if\(ev\.img\) \$\('og-img'\)/, "the old unconditional og:image line is gone");
});
