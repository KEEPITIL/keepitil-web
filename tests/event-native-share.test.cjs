// Event page native Share: a Share button only where navigator.share exists; otherwise the existing Copy link row is untouched.
// Run: node --test tests/event-native-share.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = process.env.NS_ROOT || path.resolve(__dirname, "..");
const html = require("./helpers/event-assembled.cjs").assemble(fs.readFileSync(path.join(ROOT, "event.html"), "utf8"));
const block = html.match(/try\{ if\(typeof navigator\.share==='function'\)\{[\s\S]*?\} \}catch\(_n\)\{\}/)[0];

function run(nav) {
  const inserted = [], els = {}, clicks = [];
  const sh = { insertAdjacentHTML: (pos, h) => { inserted.push([pos, h]); els["ev-share-native"] = {}; } };
  els["ev-copy"] = { click: () => clicks.push("copy") };
  const ctx = { navigator: nav, sh, ev: { title: "Night", date: null }, url: "https://keepitil.com/event/night/", fmt: (d) => d, $: (id) => els[id] };
  vm.createContext(ctx); vm.runInContext(block, ctx);
  return { inserted, els, clicks };
}
test("no navigator.share: nothing is added (negative control)", () => {
  assert.equal(run({}).inserted.length, 0);
});
test("with navigator.share: a Share button is added first and shares the title and page address", async () => {
  const calls = [];
  const r = run({ share: (d) => { calls.push(JSON.stringify(d)); return Promise.resolve(); } });
  assert.equal(r.inserted[0][0], "afterbegin"); assert.match(r.inserted[0][1], /id="ev-share-native">↗ Share/);
  r.els["ev-share-native"].onclick(); await new Promise((x) => setImmediate(x));
  assert.equal(calls[0], JSON.stringify({ title: "Night", text: "Night", url: "https://keepitil.com/event/night/" }));
  assert.deepEqual(r.clicks, []);
});
test("a cancelled sheet does nothing; any other failure falls back to Copy link", async () => {
  let r = run({ share: () => Promise.reject({ name: "AbortError" }) }); r.els["ev-share-native"].onclick(); await new Promise((x) => setImmediate(x));
  assert.deepEqual(r.clicks, []);
  r = run({ share: () => Promise.reject({ name: "NotAllowedError" }) }); r.els["ev-share-native"].onclick(); await new Promise((x) => setImmediate(x));
  assert.deepEqual(r.clicks, ["copy"]);
});
test("the Copy link, X, Facebook and WhatsApp row is still there", () => {
  for (const w of ['id="ev-copy">🔗 Copy link', "Post on X", "Facebook", "WhatsApp"]) assert.ok(html.includes(w), w);
});
