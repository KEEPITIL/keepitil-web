// /offline.html is served from the service worker's PRECACHE when a navigation fails. Its "Try again" button used an inline onclick (blocked by a strict script-src), so it now
// uses the delegated-actions scripts; those must be precached by EXACT url (no ?v=) or the button would be dead exactly when the page is shown.
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), cp = require("node:child_process");
const ROOT = path.join(__dirname, "..");
const page = fs.readFileSync(path.join(ROOT, "offline.html"), "utf8"), sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
const precache = () => vm.runInNewContext("(function(){" + sw.replace(/self\.addEventListener[\s\S]*$/m, "") + ";return PRECACHE})()", {});

test("offline.html: no inline handler; the button is a delegated action; the two scripts are referenced without a cache stamp", () => {
  assert.equal(/\son[a-z]+\s*=/i.test(page.replace(/<!--[\s\S]*?-->/g, "")), false);
  assert.match(page, /<button data-click="kilReload">Try again<\/button>/);
  const scripts = [...page.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ["/assets/js/kil-actions.js", "/assets/js/kil-common-actions.js"]);
  assert.ok(scripts.every((s) => !s.includes("?")));
});

test("every script the offline page loads is in sw.js PRECACHE, by the exact same url", () => {
  const list = precache(); const scripts = [...page.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  for (const s of scripts) assert.ok(list.includes(s), s + " is precached");
  for (const s of ["/offline.html", "/icon-192.png", "/manifest.webmanifest"]) assert.ok(list.includes(s), s);
  for (const s of scripts) assert.ok(fs.existsSync(path.join(ROOT, s.slice(1))), s + " exists");
});

test("control: dropping a script from PRECACHE (or stamping the reference) would be caught", () => {
  const list = precache().filter((u) => u !== "/assets/js/kil-common-actions.js");
  assert.equal(list.includes("/assets/js/kil-common-actions.js"), false);
  assert.ok("/assets/js/kil-actions.js?v=h12345678".includes("?"));
});

test("the stamp tool leaves offline.html alone, so the exact-url references stay exact", () => {
  const out = cp.execSync("node scripts/stamp-assets.cjs --check", { cwd: ROOT, encoding: "utf8" });
  assert.match(out, /asset stamps OK/);
  assert.ok(!/offline\.html/.test(out));
  assert.match(fs.readFileSync(path.join(ROOT, "scripts/stamp-assets.cjs"), "utf8"), /SKIP_FILE = \/\^offline\\\.html\$\//);
});

test("install precaches with cache:'reload' (never a copy the HTTP cache or CDN still holds stale) and the version name was bumped", async () => {
  const added = []; const handlers = new Map();
  class Req { constructor(u, o) { this.url = u; this.opts = o; } }
  const self = { addEventListener: (n, f) => handlers.set(n, f), skipWaiting: async () => {}, clients: { claim: async () => {} }, location: { origin: "https://keepitil.com" }, registration: {} };
  const caches = { open: async () => ({ add: async (r) => added.push(r), put: async () => {} }), keys: async () => [], match: async () => undefined, delete: async () => true };
  vm.runInNewContext(sw, { self, caches, URL, Promise, Request: Req, fetch: async () => ({ ok: false }) }, { filename: "sw.js" });
  let p; handlers.get("install")({ waitUntil: (x) => { p = x; } }); await p;
  assert.deepEqual(JSON.parse(JSON.stringify(added.map((r) => r.url).sort())), JSON.parse(JSON.stringify(precache().slice().sort())));
  assert.ok(added.every((r) => r.opts && r.opts.cache === "reload"));
  assert.match(sw, /var VERSION = 'kil-pwa-v114-20261128a'/);
});
