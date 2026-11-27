// /discover city pages: a visitor can type an event's name (or venue, city, genre) and the loaded list narrows. Client-side only.
// Run: node --test tests/discover-search.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = process.env.DSR_ROOT || path.resolve(__dirname, "..");
const D = require(path.join(ROOT, "assets/js/kil-discover.js"));
const js = fs.readFileSync(path.join(ROOT, "assets/js/kil-discover.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "assets/css/discover.css"), "utf8");

test("every typed word must appear; case, accents and punctuation are ignored", () => {
  const t = "Winter Wonderland Thu Nov 26 Watermark Bar · New York pop rock";
  assert.equal(D.searchMatch(t, "winter"), true);
  assert.equal(D.searchMatch(t, "WATERMARK  bar"), true);
  assert.equal(D.searchMatch("Café Del Mar", "cafe"), true);
  assert.equal(D.searchMatch(t, "   "), true, "an empty search shows everything");
  assert.equal(D.searchMatch(t, "winter jazz"), false, "negative control: one word missing = no match");
  assert.equal(D.searchMatch(t, "zzz"), false);
});

function fakeList(titles) {
  const mk = (txt) => ({ textContent: txt, hidden: false });
  const cards = titles.map(mk);
  const secs = [{ hidden: false, cs: cards.slice(0, 1) }, { hidden: false, cs: cards.slice(1) }];
  secs.forEach((s) => { s.querySelector = () => (s.cs.some((c) => !c.hidden) ? {} : null); });
  const rootEl = { querySelectorAll: (sel) => (sel === ".disc-card" ? cards : secs) };
  const status = { textContent: "" };
  global.document = { getElementById: (id) => (id === "disc-q-status" ? status : null) };
  return { rootEl, cards, secs, status };
}
test("applySearch hides non-matching cards, hides emptied sections and says how many match", () => {
  const f = fakeList(["Winter Wonderland Watermark Bar", "Techno Night Echo Park", "Winter Rave Warehouse"]);
  assert.equal(D.applySearch(f.rootEl, "winter"), 2);
  assert.deepEqual(f.cards.map((c) => c.hidden), [false, true, false]);
  assert.match(f.status.textContent, /2 events match/);
  assert.equal(D.applySearch(f.rootEl, "echo"), 1);
  assert.equal(f.secs[0].hidden, true, "a section with no visible card is hidden");
  assert.equal(f.secs[1].hidden, false);
});
test("negative controls: no match says so; clearing restores everything", () => {
  const f = fakeList(["A Night", "B Night"]);
  assert.equal(D.applySearch(f.rootEl, "nothing here"), 0);
  assert.match(f.status.textContent, /No events match/);
  assert.equal(D.applySearch(f.rootEl, ""), 2);
  assert.deepEqual(f.cards.map((c) => c.hidden), [false, false]);
  assert.deepEqual(f.secs.map((s) => s.hidden), [false, false]);
  assert.equal(f.status.textContent, "");
});
test("the search box is added after a successful draw only, is labelled, and hidden cards stay hidden by CSS", () => {
  assert.match(js, /if \(!result\.failed\) \{ try \{ addSearch\(rootEl\);/);
  assert.match(js, /<label for="disc-q">Search events<\/label><input id="disc-q" type="search"/);
  assert.match(css, /\.disc-card\[hidden\],\.disc-sec\[hidden\]\{display:none!important\}/);
});
