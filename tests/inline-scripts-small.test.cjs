// CSP migration (inline <script> step 3): the small pages. Redirect stubs, the coming-soon game gates, the KBeats legacy redirects and the discover config are PARAMETERISED shared files / data blocks;
// seven larger one-block pages moved verbatim. Every page ends with no executable inline script. The ORIGINAL inline code is embedded here and run side by side with the new files.
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const ROOT = path.join(__dirname, ".."), read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8"), sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const executableInline = (html) => [...html.matchAll(/<script((?:\s[^>]*)?)>([\s\S]*?)<\/script>/g)].filter((m) => !/\ssrc=/.test(m[1]) && !/type="(application\/(ld\+)?json|importmap|speculationrules)"/.test(m[1]));
const ORIG = {
"findmyweed.html": "location.replace(\"/app/findmyweed/\" + location.search + location.hash);",
"findmyweed/index.html": "location.replace(\"/app/findmyweed/\" + location.search + location.hash);",
"for-artists/index.html": "window.location.replace(\"https://keepitil.com/shop/\");",
"privacy/index.html": "window.location.replace(\"https://keepitil.com/privacy\");",
"terms/index.html": "window.location.replace(\"https://keepitil.com/terms\");",
"get-featured/index.html": "location.replace('/connect/get-featured');",
"tuiteaapp/index.html": "window.location.replace(\"https://keepitil.com/support/?product=tuitea\");",
"games/13/index.html": "\n(function(){ var go = function(){ location.replace(\"/games/#coming-soon\"); };\n  if (!('serviceWorker' in navigator)) return go();\n  // Retire this route's own worker and caches only (the Cache API is origin-wide; other games keep theirs). Saves are untouched.\n  navigator.serviceWorker.getRegistrations().then(function(rs){ return Promise.all(rs.filter(function(r){ return r.scope.indexOf(\"/games/13/\") !== -1; }).map(function(r){ return r.unregister(); })); })\n    .then(function(){ return window.caches ? caches.keys() : []; })\n    .then(function(ks){ return Promise.all(ks.filter(function(k){ return [\"thirteen-\",\"13-\"].some(function(p){ return k.indexOf(p) === 0; }); }).map(function(k){ return caches.delete(k); })); })\n    .then(go, go);\n})();\n",
"games/kwars/index.html": "\n(function(){ var go = function(){ location.replace(\"/games/#coming-soon\"); };\n  if (!('serviceWorker' in navigator)) return go();\n  // Retire this route's own worker and caches only (the Cache API is origin-wide; other games keep theirs). Saves are untouched.\n  navigator.serviceWorker.getRegistrations().then(function(rs){ return Promise.all(rs.filter(function(r){ return r.scope.indexOf(\"/games/kwars/\") !== -1; }).map(function(r){ return r.unregister(); })); })\n    .then(function(){ return window.caches ? caches.keys() : []; })\n    .then(function(ks){ return Promise.all(ks.filter(function(k){ return [\"kwars-\"].some(function(p){ return k.indexOf(p) === 0; }); }).map(function(k){ return caches.delete(k); })); })\n    .then(go, go);\n})();\n",
"games/kwars1/index.html": "\n(function(){ var go = function(){ location.replace(\"/games/#coming-soon\"); };\n  if (!('serviceWorker' in navigator)) return go();\n  // Retire this route's own worker and caches only (the Cache API is origin-wide; other games keep theirs). Saves are untouched.\n  navigator.serviceWorker.getRegistrations().then(function(rs){ return Promise.all(rs.filter(function(r){ return r.scope.indexOf(\"/games/kwars1/\") !== -1; }).map(function(r){ return r.unregister(); })); })\n    .then(function(){ return window.caches ? caches.keys() : []; })\n    .then(function(ks){ return Promise.all(ks.filter(function(k){ return [\"kwars1-\"].some(function(p){ return k.indexOf(p) === 0; }); }).map(function(k){ return caches.delete(k); })); })\n    .then(go, go);\n})();\n",
"games/pokasnap/index.html": "\n(function(){ var go = function(){ location.replace(\"/games/#coming-soon\"); };\n  if (!('serviceWorker' in navigator)) return go();\n  // Retire this route's own worker and caches only (the Cache API is origin-wide; other games keep theirs). Saves are untouched.\n  navigator.serviceWorker.getRegistrations().then(function(rs){ return Promise.all(rs.filter(function(r){ return r.scope.indexOf(\"/games/pokasnap/\") !== -1; }).map(function(r){ return r.unregister(); })); })\n    .then(function(){ return window.caches ? caches.keys() : []; })\n    .then(function(ks){ return Promise.all(ks.filter(function(k){ return [\"pokasnap-\"].some(function(p){ return k.indexOf(p) === 0; }); }).map(function(k){ return caches.delete(k); })); })\n    .then(go, go);\n})();\n",
"games/pokasnap/play/index.html": "\n(function(){ var go = function(){ location.replace(\"/games/#coming-soon\"); };\n  if (!('serviceWorker' in navigator)) return go();\n  // Retire this route's own worker and caches only (the Cache API is origin-wide; other games keep theirs). Saves are untouched.\n  navigator.serviceWorker.getRegistrations().then(function(rs){ return Promise.all(rs.filter(function(r){ return r.scope.indexOf(\"/games/pokasnap/play/\") !== -1; }).map(function(r){ return r.unregister(); })); })\n    .then(function(){ return window.caches ? caches.keys() : []; })\n    .then(function(ks){ return Promise.all(ks.filter(function(k){ return [\"pokasnap-\"].some(function(p){ return k.indexOf(p) === 0; }); }).map(function(k){ return caches.delete(k); })); })\n    .then(go, go);\n})();\n",
"games/pokasnap/test/index.html": "\n(function(){ var go = function(){ location.replace(\"/games/#coming-soon\"); };\n  if (!('serviceWorker' in navigator)) return go();\n  // Retire this route's own worker and caches only (the Cache API is origin-wide; other games keep theirs). Saves are untouched.\n  navigator.serviceWorker.getRegistrations().then(function(rs){ return Promise.all(rs.filter(function(r){ return r.scope.indexOf(\"/games/pokasnap/test/\") !== -1; }).map(function(r){ return r.unregister(); })); })\n    .then(function(){ return window.caches ? caches.keys() : []; })\n    .then(function(ks){ return Promise.all(ks.filter(function(k){ return [\"pokasnap-\"].some(function(p){ return k.indexOf(p) === 0; }); }).map(function(k){ return caches.delete(k); })); })\n    .then(go, go);\n})();\n",
"games/kbeats/artist/index.html": "var q=new URLSearchParams(location.search).get('id')||location.pathname.split('/').filter(Boolean)[3]||'';location.replace('/games/kbeats/play/'+(q?'#/artist/'+encodeURIComponent(q):''))",
"games/kbeats/track/index.html": "var q=new URLSearchParams(location.search).get('id')||location.pathname.split('/').filter(Boolean)[3]||'';location.replace('/games/kbeats/play/'+(q?'#/track/'+encodeURIComponent(q):''))",
"games/kbeats/challenge/index.html": "var c=(new URLSearchParams(location.search).get('c')||'').split('~');location.replace('/games/kbeats/play/'+(c[0]?'#/challenge/'+c.map(encodeURIComponent).join('/'):''))",
"games/kbeats/leaderboards/index.html": "location.replace('/games/kbeats/play/#/leaderboard')",
"discover/index.html": "window.KIL_DISCOVER = { kind: 'cities', fallbackTz: 'America/Los_Angeles' };",
"discover/los-angeles/index.html": "\nwindow.KIL_DISCOVER = {\n  kind: 'events',\n  city: 'los-angeles',\n  cityExact: ['Los Angeles', 'LA'],\n  cityName: 'Los Angeles',\n  state: 'CA',\n  view: 'hub',\n  genre: '',\n  genreLabel: '',\n  cityHref: '/discover/los-angeles/',\n  fallbackTz: 'America/Los_Angeles'\n};\n",
"discover/los-angeles/techno/index.html": "\nwindow.KIL_DISCOVER = {\n  kind: 'events',\n  city: 'los-angeles',\n  cityExact: ['Los Angeles', 'LA'],\n  cityName: 'Los Angeles',\n  state: 'CA',\n  view: 'genre',\n  genre: 'techno',\n  genreLabel: 'Techno',\n  cityHref: '/discover/los-angeles/',\n  fallbackTz: 'America/Los_Angeles'\n};\n",
"discover/los-angeles/this-weekend/index.html": "\nwindow.KIL_DISCOVER = {\n  kind: 'events',\n  city: 'los-angeles',\n  cityExact: ['Los Angeles', 'LA'],\n  cityName: 'Los Angeles',\n  state: 'CA',\n  view: 'weekend',\n  genre: '',\n  genreLabel: '',\n  cityHref: '/discover/los-angeles/',\n  fallbackTz: 'America/Los_Angeles'\n};\n"
};
const VERBATIM = [{"page": "findmyweed-directory.html", "file": "assets/js/pages/findmyweed-directory-directory.js", "hash": "e559d6ec233022a8c7b83d1a3d26a059b9a3c3621a52402ea312bb71070127be"}, {"page": "join/auth/index.html", "file": "assets/js/pages/join-auth-main.js", "hash": "a837fd7df8fd808056d0e9818dd0452faaa951bbb5933897338ca263f772a1f8"}, {"page": "join/index.html", "file": "assets/js/pages/join-main.js", "hash": "636e98b7da17a3ec2a23cbb3ccf8dc10dac37ae28a7fc317b555c44cd68708bc"}, {"page": "reset-password.html", "file": "assets/js/pages/reset-password-main.js", "hash": "061db521e3d6ff1cf029ca355504f6320358358c963f024eaf5d6fb160983521"}, {"page": "radio-tuner/index.html", "file": "assets/js/pages/radio-tuner-main.js", "hash": "28851b5686699b9317acca4d6fe657d2fe496568f9fe4b2629492e19a44d709c"}, {"page": "support/index.html", "file": "assets/js/pages/support-main.js", "hash": "5264f5fdacbdad42ff83e0fdc1b2bf07872a4d6eab7aed35ceec62eddfcc48a1"}, {"page": "games/kbeats/index.html", "file": "assets/js/pages/kbeats-index-main.js", "hash": "8aadcc4cb28e5ab6f16bd9e01615354d76e1d291b924b655cf7b919ee8203306"}];   // [name, file, sha256 of main's inline block text, outer newlines trimmed]
const REDIRECTS = ["findmyweed.html", "findmyweed/index.html", "for-artists/index.html", "privacy/index.html", "terms/index.html", "get-featured/index.html", "tuiteaapp/index.html"];
const GATES = ["games/13/index.html", "games/kwars/index.html", "games/kwars1/index.html", "games/pokasnap/index.html", "games/pokasnap/play/index.html", "games/pokasnap/test/index.html"];
const KBEATS = { "games/kbeats/artist/index.html": "artist", "games/kbeats/track/index.html": "track", "games/kbeats/challenge/index.html": "challenge", "games/kbeats/leaderboards/index.html": "leaderboards" };
const DISCOVER = Object.keys(ORIG).filter((p) => p.startsWith("discover/"));
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/\s([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const tagOf = (page, srcRe) => { const m = read(page).match(new RegExp("<script[^>]*" + srcRe + "[^>]*></script>")); assert.ok(m, page + " has the script tag"); return m[0]; };
const stripHdr = (t) => t.replace(/^\/\*[\s\S]*?\*\/\n/, "");

test("control: the detector finds an executable inline block and ignores src / JSON blocks", () => {
  assert.equal(executableInline("<script>x()</script>").length, 1);
  assert.equal(executableInline('<script src="/a.js"></script><script type="application/json">1</script>').length, 0);
});
test("none of the converted pages has an executable inline script left", () => {
  const pages = [...REDIRECTS, ...GATES, ...Object.keys(KBEATS), ...DISCOVER, ...VERBATIM.map((v) => v.page)];
  assert.ok(pages.length >= 25);
  for (const p of pages) assert.deepEqual(executableInline(read(p)).map((m) => m[2].slice(0, 40)), [], p);
});

// ---- verbatim moves ----
test("the seven verbatim pages: each moved file is byte-identical to the inline block it replaced; module scripts stay modules; files parse and cannot close their tag", () => {
  for (const { page, file, hash } of VERBATIM) {
    const t = stripHdr(read(file)).replace(/^\n+|\n+$/g, ""); assert.equal(sha(t), hash, file);
    assert.doesNotThrow(() => new vm.Script(t.replace(/^\s*import\s[^\n]*\n/gm, "")), file); assert.equal(/<\/script/i.test(t), false, file);
    assert.match(read(page), new RegExp('<script( type="module")? src="/' + file.replace(/[.\/]/g, "\\$&") + '\\?v=h[0-9a-f]{8}"></script>'), page);
  }
  assert.match(read("games/kbeats/index.html"), /<script type="module" src="\/assets\/js\/pages\/kbeats-index-main\.js\?v=h[0-9a-f]{8}"><\/script>/);
});

// ---- redirects ----
function runRedirect(code, scriptAttrs, search, hash) {
  const calls = []; const loc = { search, hash, replace: (u) => calls.push(u) };
  const cs = { getAttribute: (k) => (k in scriptAttrs ? scriptAttrs[k] : null) };
  vm.runInNewContext(code, { location: loc, window: { location: loc }, document: { currentScript: cs } }); return calls;
}
test("the seven redirect stubs: the shared file sends every visitor exactly where the old inline one-liner did (with and without ?query#hash)", () => {
  const shared = read("assets/js/kil-redirect.js");
  for (const p of REDIRECTS) {
    const a = attrs(tagOf(p, "kil-redirect\\.js"));
    for (const [s, h] of [["", ""], ["?x=1&y=2", "#frag"], ["?q=a%20b", ""]]) assert.deepEqual(runRedirect(shared, a, s, h), runRedirect(ORIG[p], {}, s, h), p + " " + s + h);
  }
});
test("kil-redirect.js refuses anything that is not a site path or an https://keepitil.com/ URL (control: javascript:, protocol-relative, other hosts)", () => {
  const shared = read("assets/js/kil-redirect.js");
  for (const to of ["javascript:alert(1)", "//evil.example/x", "https://evil.example/", "http://keepitil.com/", "data:text/html,x", "", "keepitil.com/x"]) assert.deepEqual(runRedirect(shared, { "data-to": to }, "?a", "#b"), [], to);
  assert.deepEqual(runRedirect(shared, { "data-to": "/x/", "data-keep": "search" }, "?a=1", "#b"), ["/x/?a=1"]); assert.deepEqual(runRedirect(shared, { "data-to": "https://keepitil.com/p", "data-keep": "hash" }, "?a", "#b"), ["https://keepitil.com/p#b"]);
  assert.deepEqual(runRedirect(shared, {}, "", ""), []);
  assert.deepEqual(vm.runInNewContext(shared, { location: { replace() { throw new Error("no"); } }, document: {} }), undefined);   // no currentScript: nothing happens
});

// ---- game gates ----
async function runGate(code, scriptAttrs, env) {
  const log = []; const loc = { replace: (u) => log.push(["replace", u]) };
  const nav = env.noSW ? {} : { serviceWorker: { getRegistrations: () => (env.regsFail ? Promise.reject(new Error("x")) : Promise.resolve(env.regs.map((scope) => ({ scope, unregister: () => { log.push(["unregister", scope]); return Promise.resolve(true); } })))) } };
  const win = {}; if (!env.noCaches) { win.caches = { keys: () => Promise.resolve(env.keys), delete: (k) => { log.push(["delete", k]); return Promise.resolve(true); } }; }
  const ctx = { location: loc, navigator: nav, window: win, document: { currentScript: { getAttribute: (k) => (k in scriptAttrs ? scriptAttrs[k] : null) } }, Promise, caches: win.caches };
  vm.runInNewContext(code, ctx); await new Promise((r) => setTimeout(r, 20)); return log;
}
test("the six game gates: unregisters / deletes exactly what the old inline block did and then goes to /games/#coming-soon, in every environment", async () => {
  const shared = read("assets/js/kil-game-gate.js");
  const envs = [
    { regs: ["https://k.test/games/13/", "https://k.test/games/kwars/", "https://k.test/games/kwars1/", "https://k.test/games/pokasnap/play/", "https://k.test/"], keys: ["thirteen-v1", "13-x", "kwars-v9", "kwars1-v2", "pokasnap-v3", "other", "kil-pages-v49", "x13-"] },
    { regs: [], keys: [] }, { noSW: true, regs: [], keys: [] }, { regs: ["https://k.test/games/kwars/"], keys: ["kwars-a"], noCaches: true }, { regsFail: true, regs: [], keys: [] },
  ];
  for (const p of GATES) for (const env of envs) assert.deepEqual(await runGate(shared, attrs(tagOf(p, "kil-game-gate\\.js")), env), await runGate(ORIG[p], {}, env), p + " " + JSON.stringify(env).slice(0, 60));
});
test("kil-game-gate.js without its parameters removes nothing and just sends the visitor on (control: an empty scope would otherwise match every registration)", async () => {
  const shared = read("assets/js/kil-game-gate.js"), env = { regs: ["https://k.test/games/13/", "https://k.test/"], keys: ["thirteen-a", "kwars-b"] };
  assert.deepEqual(await runGate(shared, {}, env), [["replace", "/games/#coming-soon"]]);
  assert.deepEqual(await runGate(shared, { "data-scope": "/games/13/" }, env), [["replace", "/games/#coming-soon"]]);
});

// ---- KBeats redirects ----
function runKb(code, attrs0, search, pathname) { const calls = []; vm.runInNewContext(code, { location: { search, pathname, replace: (u) => calls.push(u) }, URLSearchParams, encodeURIComponent, document: { currentScript: { getAttribute: (k) => (k in attrs0 ? attrs0[k] : null) } } }); return calls; }
test("the four KBeats redirects send visitors where the old one-liners did (query id, path id, none, weird characters; challenge lists)", () => {
  const shared = read("games/kbeats/js/redirect.js");
  const cases = [["?id=abc", "/games/kbeats/artist/"], ["", "/games/kbeats/artist/zed%20x"], ["", "/games/kbeats/track/"], ["?id=a%2Fb&c=1~2~3", "/games/kbeats/track/q"], ["?c=aa~b%20b~c", "/games/kbeats/challenge/"], ["?c=", "/games/kbeats/challenge/"], ["", "/games/kbeats/leaderboards/"]];
  for (const [p, kind] of Object.entries(KBEATS)) { assert.equal(attrs(tagOf(p, "kbeats\\/js\\/redirect\\.js"))["data-kind"], kind); for (const [s, pth] of cases) assert.deepEqual(runKb(shared, { "data-kind": kind }, s, pth), runKb(ORIG[p], {}, s, pth), p + " " + s + pth); }
  assert.deepEqual(runKb(shared, { "data-kind": "nope" }, "?id=1", "/x"), []); assert.deepEqual(runKb(shared, {}, "?id=1", "/x"), []);
});

// ---- discover ----
test("discover pages: the JSON config equals the old window.KIL_DISCOVER literal; kil-discover.js reads it, and an existing global still wins", () => {
  assert.equal(DISCOVER.length, 4);
  for (const p of DISCOVER) {
    const w = {}; new Function("window", ORIG[p])(w);
    const m = read(p).match(/<script type="application\/json" id="kil-discover-config">([^<]*)<\/script>/); assert.ok(m, p);
    assert.deepEqual(JSON.parse(m[1]), JSON.parse(JSON.stringify(w.KIL_DISCOVER)), p);
  }
  const src = read("assets/js/kil-discover.js"), i = src.indexOf("    var cfg = root.KIL_DISCOVER;"), snippet = src.slice(i, src.indexOf("\n    if (!cfg || cfg.kind === 'static') return;", i));
  const run = (root) => { vm.runInNewContext("(function(root){" + snippet + "; root.__cfg = cfg; })(R)", { R: root, JSON }); return root.__cfg; };
  const doc = (txt) => ({ getElementById: (id) => (id === "kil-discover-config" && txt !== null ? { textContent: txt } : null) });
  assert.deepEqual(run({ document: doc('{"kind":"cities"}') }), { kind: "cities" });
  assert.equal(run({ document: doc("{bad") }), null); assert.equal(run({ document: doc(null) }), undefined);
  assert.deepEqual(run({ KIL_DISCOVER: { kind: "static" }, document: doc('{"kind":"cities"}') }), { kind: "static" });
});
