// Event page: the flyer is the LCP element (phone LCP 7.4 s in the 2026-11-23 baseline). It must be a real <img fetchpriority=high>,
// not a CSS background, and a link that already carries ?img= must start the fetch early. Run: node --test tests/event-flyer-lcp.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = process.env.EF_ROOT || path.resolve(__dirname, "..");
const html = require("./helpers/event-assembled.cjs").assemble(fs.readFileSync(path.join(ROOT, "event.html"), "utf8"));
test("the flyer is an <img> with fetchpriority=high, not a CSS background", () => {
  assert.doesNotMatch(html, /\$\('ev-flyer'\)\.style\.backgroundImage/);
  const i = html.indexOf("The flyer is the LCP element");
  assert.ok(i > 0, "render block present");
  const block = html.slice(i, i + 700);
  assert.match(block, /createElement\('img'\)/);
  assert.match(block, /setAttribute\('fetchpriority','high'\)/);
  assert.match(block, /decoding='async'/);
  assert.match(block, /_im\.alt=ev\.title\?\('Flyer for '\+ev\.title\)/);
  assert.ok(block.indexOf("_fl.appendChild(_im); }") < block.indexOf("_im.alt="), "alt is re-set after the creation branch, on every render");
});
function runPreload(search) {
  const links = [];
  const box = { location: { search }, document: { head: { appendChild: (l) => links.push(l) }, createElement: () => { const l = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }; return l; } }, decodeURIComponent };
  vm.createContext(box);
  const m = html.match(/<script>\/\* flyer-preload:[\s\S]*?\*\/([\s\S]*?)<\/script>/);
  assert.ok(m, "flyer-preload script present");
  vm.runInContext(m[1], box);
  return links;
}
test("a link with ?img= preloads that image at high priority; non-http(s) and missing values do not", () => {
  const l = runPreload("?e=x&img=" + encodeURIComponent("https://seatgeekimages.com/a.jpg"));
  assert.equal(l.length, 1);
  assert.equal(l[0].rel, "preload"); assert.equal(l[0].as, "image"); assert.equal(l[0].href, "https://seatgeekimages.com/a.jpg");
  assert.equal(l[0].attrs.fetchpriority, "high");
  assert.equal(runPreload("?e=x&img=" + encodeURIComponent("javascript:alert(1)")).length, 0);
  assert.equal(runPreload("?e=x&img=" + encodeURIComponent("data:image/png;base64,AAAA")).length, 0);
  assert.equal(runPreload("?e=x").length, 0);
});
test("the most common flyer host is preconnected", () => {
  assert.match(html, /<link rel="preconnect" href="https:\/\/seatgeekimages\.com"\/>/);
});
