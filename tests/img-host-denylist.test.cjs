// A cover on a host that refuses hotlinking (images.ra.co: 403, Chrome ERR_BLOCKED_BY_ORB) is never requested: one list (assets/js/kil-img-host.js), used by the event page, the profile,
// the home cards, the discover cards and the event prerender. The shell's after-the-failure swap (tests/img-placeholder.test.cjs) stays as the safety net for every other host.
// Run: node --test tests/img-host-denylist.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const read = (f) => require("./helpers/event-assembled.cjs").assemble(fs.readFileSync(path.join(ROOT, f), "utf8"));
const H = require("../assets/js/kil-img-host.js");
const D = require("../assets/js/kil-discover.js");
const RA = "https://images.ra.co/c1eccd6e54b73b9be5bdb1633845e7c9dd794fc8.jpg";

test("the list: images.ra.co is denied (any path, any case); other hosts, lookalikes and our own images are not", () => {
  assert.equal(H.denied(RA), true); assert.equal(H.denied("HTTPS://IMAGES.RA.CO/x.jpg"), true);
  for (const ok of ["https://keepitil.com/img/a.jpg", "https://seatgeekimages.com/a.jpg", "https://images.ra.co.evil.example/a.jpg", "https://notimages.ra.co/a.jpg", "https://ra.co/a.jpg", "/assets/images/event-placeholder.svg", "data:image/png;base64,AAAA", ""]) assert.equal(H.denied(ok), false, ok);
  assert.equal(H.clean(RA), ""); assert.equal(H.clean("https://seatgeekimages.com/a.jpg"), "https://seatgeekimages.com/a.jpg"); assert.equal(H.clean(null), null);
});
test("discover cards: a denied cover gives the no-cover card (no <img>, no ra.co anywhere); a normal cover is unchanged (negative control)", () => {
  const base = { slug: "e1", title: "Night", venue: "Hall", city: "Los Angeles", starts_at: "2027-01-02T04:00:00Z", tz: "America/Los_Angeles", status: "published", show_on_explore: true };
  const html = (cover) => D.renderLists({ upcoming: [Object.assign({}, base, { cover_url: cover })], tz: "America/Los_Angeles" });
  const bad = html(RA), good = html("https://seatgeekimages.com/a.jpg");
  assert.doesNotMatch(bad, /ra\.co/); assert.doesNotMatch(bad, /<img/); assert.match(bad, /disc-dow/);
  assert.match(good, /<img src="https:\/\/seatgeekimages\.com\/a\.jpg"/);
});
test("the pages load the list before they use it, and use it where a cover becomes a picture", () => {
  for (const f of ["event.html", "profile.html", "index.html", "discover/index.html", "discover/los-angeles/index.html"]) assert.match(read(f), /<script src="\/assets\/js\/kil-img-host\.js\?v=h[0-9a-f]{8}"><\/script>/, f);
  assert.match(read("event.html"), /ev\.img=KH\(x\.cover_url\|\|ev\.img\)/); assert.match(read("event.html"), /\(KH\(e\.cover_url\)\?/);
  assert.match(read("profile.html"), /var bg=KH\(it\[4\]\)\?/, "the partner shelf images");
  assert.match(read("profile.html"), /cover:KH\(e\.cover_url\|\|''\)/); assert.match(read("profile.html"), /var flyer=KH\(t\.cover_url\)\?/);
  assert.match(read("index.html"), /window\.KilImgHost\.clean\(e\.cover_url\|\|e\.img\|\|''\)/);
  assert.doesNotMatch("ev.img=x.cover_url||ev.img;", /KH\(/, "negative control: the old assignment had no filter");
});
test("event prerender: a denied cover bakes in no flyer image, no og:image and no JSON-LD image; a normal cover still does", async () => {
  const { renderEventPage } = await import("../scripts/build-event-pages.mjs");
  const template = read("event.html");
  const row = (c) => ({ slug: "night-20270102", title: "Night", venue: "Hall", city: "Los Angeles", starts_at: "2027-01-02T04:00:00Z", tz: "America/Los_Angeles", cover_url: c, genres: "house", description: "" });
  const bad = renderEventPage(template, row(RA)), good = renderEventPage(template, row("https://seatgeekimages.com/a.jpg"));
  assert.doesNotMatch(bad, /images\.ra\.co/, "no request, no og:image, no JSON-LD image");
  assert.match(good, /<img fetchpriority="high"[^>]*src="https:\/\/seatgeekimages\.com\/a\.jpg"/);
});
test("no preconnect or dns-prefetch to a denied host (a connection to a host we never request from is pure waste)", () => {
  for (const f of ["event.html", "index.html", "profile.html"]) for (const h of H.DENY) assert.doesNotMatch(read(f), new RegExp('<link rel="(preconnect|dns-prefetch)" href="https://' + h.replace(/\./g, "\\.")), f + " " + h);
  assert.match('<link rel="preconnect" href="https://images.ra.co"/>', /rel="preconnect" href="https:\/\/images\.ra\.co/, "negative control: the old tag is what the check rejects");
});
