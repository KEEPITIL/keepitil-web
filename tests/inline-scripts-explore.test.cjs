// CSP migration: findmyweed-explore.html's one inline block (allow + showView) moved verbatim to an external file.
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const ROOT = path.join(__dirname, ".."), read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const ORIG = 'if(window.KilActions) KilActions.allow(["showView"]);\nfunction showView(v){\n  document.getElementById(\'listPanel\').style.display = v===\'list\' ? \'block\' : \'none\';\n  document.getElementById(\'mapPanel\').style.display = v===\'map\' ? \'block\' : \'none\';\n  document.getElementById(\'btnList\').classList.toggle(\'on\', v===\'list\');\n  document.getElementById(\'btnMap\').classList.toggle(\'on\', v===\'map\');\n}';
const F = "assets/js/pages/fmw-explore-view.js";
test("the page has no executable inline script and loads the file after kil-actions.js", () => {
  const h = read("findmyweed-explore.html");
  const inl = [...h.matchAll(/<script((?:\s[^>]*)?)>([\s\S]*?)<\/script>/g)].filter((m) => !/\ssrc=/.test(m[1]) && !/type="application\/ld\+json"/.test(m[1]));
  assert.equal(inl.length, 0);
  assert.ok(h.indexOf("/assets/js/kil-actions.js") < h.indexOf("/" + F));
});
test("the external file is the original block verbatim (after the header comment)", () => {
  const body = read(F).replace(/^\/\*[^\n]*\*\/\n/, "").replace(/\n$/, "");
  assert.equal(crypto.createHash("sha256").update(body).digest("hex"), crypto.createHash("sha256").update(ORIG).digest("hex"));
});
test("behaviour: allow() is called and showView toggles panels and buttons", () => {
  const els = {}; const mk = (id) => (els[id] = { style: {}, on: false, classList: { toggle(c, f) { els[id].on = f; } } });
  ["listPanel", "mapPanel", "btnList", "btnMap"].forEach(mk);
  const allowed = []; const ctx = { window: { KilActions: { allow: (a) => allowed.push(...a) } }, KilActions: { allow: (a) => allowed.push(...a) }, document: { getElementById: (i) => els[i] } };
  vm.runInNewContext(read(F), ctx);
  assert.deepEqual(allowed, ["showView"]);
  ctx.showView("map");
  assert.equal(els.listPanel.style.display, "none"); assert.equal(els.mapPanel.style.display, "block"); assert.equal(els.btnMap.on, true); assert.equal(els.btnList.on, false);
});
