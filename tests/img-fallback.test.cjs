// Delegated image fallback (assets/js/kil-img-fallback.js) replaces the inline onerror="..." handlers on the event template and its ~1000 generated pages,
// so a Content-Security-Policy without 'unsafe-inline' for script can be enforced later (docs/cloudflare/csp-report-only.md).
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const src = read("assets/js/kil-img-fallback.js");

function env() {
  const listeners = {}, doc = { readyState: "complete", addEventListener(t, f, c) { (listeners[t] = listeners[t] || []).push({ f, c }); }, querySelectorAll: () => [], createElement(tag) { return { tagName: tag.toUpperCase(), className: "", textContent: "" }; } };
  const win = {}; const ctx = vm.createContext({ window: win, document: doc });
  vm.runInContext(src, ctx);
  const fire = (target) => (listeners.error || []).forEach((l) => l.f({ target }));
  const img = (attrs, parent) => { const el = { tagName: "IMG", attrs, parentNode: parent, getAttribute: (k) => (k in attrs ? attrs[k] : null) }; return el; };
  const parent = () => { const p = { style: {}, replaced: null, replaceChild(n, o) { p.replaced = { n, o }; } }; return p; };
  return { listeners, fire, img, parent, win };
}

test("one capture-phase error listener on document (error does not bubble)", () => {
  const { listeners } = env();
  assert.equal(listeners.error.length, 1);
  assert.equal(listeners.error[0].c, true);
});

test("data-fb=hide-parent hides the parent box; data-fb=ph swaps in a text-only initials placeholder", () => {
  const e = env();
  const p1 = e.parent(); e.fire(e.img({ "data-fb": "hide-parent" }, p1)); assert.equal(p1.style.display, "none");
  const p2 = e.parent(), i2 = e.img({ "data-fb": "ph", "data-ini": "A" }, p2); e.fire(i2);
  assert.equal(p2.replaced.o, i2); assert.equal(p2.replaced.n.className, "ph"); assert.equal(p2.replaced.n.textContent, "A"); assert.equal(p2.replaced.n.tagName, "DIV");
});

test("hostile data-ini stays text (textContent, never HTML); unmarked images and non-images are untouched; a second error does not repeat", () => {
  const e = env(), p = e.parent(), evil = '"><img src=x onerror=alert(1)>', i = e.img({ "data-fb": "ph", "data-ini": evil }, p);
  e.fire(i); assert.equal(p.replaced.n.textContent, evil); assert.equal(p.replaced.n.innerHTML, undefined);
  const p2 = e.parent(); e.fire(e.img({}, p2)); assert.equal(p2.style.display, undefined); assert.equal(p2.replaced, null);
  const p3 = e.parent(); e.fire({ tagName: "SCRIPT", getAttribute: () => "hide-parent", parentNode: p3 }); assert.equal(p3.style.display, undefined);
  const p4 = e.parent(), i4 = e.img({ "data-fb": "bogus" }, p4); e.fire(i4); assert.equal(p4.style.display, undefined); assert.equal(p4.replaced, null);
  const p5 = e.parent(), i5 = e.img({ "data-fb": "hide-parent" }, p5); e.fire(i5); p5.style.display = ""; e.fire(i5); assert.equal(p5.style.display, "", "applied once");
});

const INLINE_ERR = /\sonerror=/i;
test("control: the inline-handler detector flags the old markup", () => {
  assert.ok(INLINE_ERR.test('<img src="x" onerror="this.parentNode.style.display=\'none\'">'));
  assert.ok(INLINE_ERR.test("'<img src=\"'+u+'\" onerror=\"this.outerHTML=&quot;x&quot;\">'"));
  assert.equal(INLINE_ERR.test('<img data-fb="hide-parent">'), false);
});

test("event.html and every generated event page: no inline onerror, the shared script is loaded before the page script", () => {
  const t = require("./helpers/event-assembled.cjs").assemble(read("event.html"));
  assert.equal(INLINE_ERR.test(t), false, "event.html");
  assert.match(t, /<script src="\/assets\/js\/kil-img-fallback\.js\?v=h[0-9a-f]{8}"><\/script>\n<script src="\/assets\/js\/kil-rsvp\.js/);
  assert.equal((t.match(/data-fb="/g) || []).length, 3);
  const dirs = fs.readdirSync(path.join(ROOT, "event")).filter((d) => fs.existsSync(path.join(ROOT, "event", d, "index.html")));
  assert.ok(dirs.length > 500, "scan sees the generated pages");
  const bad = [];
  for (const d of dirs) {
    const s = require("./helpers/event-assembled.cjs").assemble(read("event/" + d + "/index.html"));
    if (INLINE_ERR.test(s) || !/<script src="\/assets\/js\/kil-img-fallback\.js[^"]*"><\/script>\n<script src="\/assets\/js\/kil-rsvp\.js/.test(s) || (s.match(/data-fb="/g) || []).length !== 3) bad.push(d);
  }
  assert.deepEqual(bad.slice(0, 5), []);
});

test("the shared script is a tracked asset with a valid cache stamp on the template (tests/asset-stamps runs the full check)", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "assets/js/kil-img-fallback.js")));
  assert.match(read("event.html"), /kil-img-fallback\.js\?v=h[0-9a-f]{8}/);
});
