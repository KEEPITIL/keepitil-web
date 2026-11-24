// Axe sweep 2026-11-24 (live pages): every content page has exactly one <main>; the culture video iframe has a title; the signup logo is not a redundant
// alt; the create calendar rows that scroll sideways are keyboard-focusable. Run: node --test tests/main-landmarks.test.cjs
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const R = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
for (const f of ["about.html", "artists.html", "business.html", "venues/index.html", "terms.html", "privacy.html", "event.html", "culture/index.html"]) {
  test(f + " has exactly one <main> and no leftover div.wrap", () => {
    const h = R(f); assert.equal((h.match(/<main\b/g) || []).length, 1); assert.equal((h.match(/<\/main>/g) || []).length, 1);
    assert.match(h, /<main class="wrap">/); assert.doesNotMatch(h, /<div class="wrap">/);
  });
}
test("the prerender template anchors the generator needs are still present after the main swap", () => {
  const h = R("event.html"); for (const a of ['<div class="flyer" id="ev-flyer"></div>', '<h1 id="ev-title">Event</h1>', "function canonFor(slug)"]) assert.ok(h.includes(a), a);
});
test("culture: the video iframe is given a title", () => assert.match(R("culture/index.html"), /var f = document\.createElement\('iframe'\);\n\s+f\.title = 'KEEPITIL culture video player';/));
test("signup: the brand logo next to the visible brand text has empty alt", () => assert.match(R("signup.html"), /<img src="\/keepitil-x-blue\.png" alt=""\/><span class="nav-brand">KEEPITIL<\/span>/));
test("create calendar rows are focusable groups with a name, and the vs-app stamp moved to b on create", () => {
  const v = R("vs-app.js"); assert.equal((v.match(/<div class="ce-grid" tabindex="0" role="group" aria-label="Events, scroll sideways">/g) || []).length, 2);
  assert.match(R("create/index.html"), /\/vs-app\.js\?v=20261124b/);
});
test("control: a bare ce-grid or a div.wrap would fail these checks", () => { assert.doesNotMatch('<div class="ce-grid">', /tabindex/); assert.match('<div class="wrap">', /<div class="wrap">/); });
test("culture: the scrolling feed column is keyboard-focusable and named", () => assert.match(R("culture/index.html"), /<section class="feedcol" tabindex="0" aria-label="Culture feed">/));
test("culture has a real h1 even though its hero block is display:none; connect filters are a labelled search landmark", () => {
  const c = R("culture/index.html"); assert.match(c, /<main class="wrap">\n\s+<h1 class="kil-sr-only">CULTURE: stories, media and community<\/h1>/); assert.match(c, /<h1 aria-hidden="true">CULTURE<\/h1>/);
  assert.match(c, /\.kil-sr-only\{position:absolute;width:1px;height:1px/);
  assert.match(R("connect/index.html"), /<div class="controls kil-filter-shell" role="search" aria-label="Filter and search profiles">/);
});
