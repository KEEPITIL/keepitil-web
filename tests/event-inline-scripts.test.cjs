// CSP migration (inline <script> step 1): event.html and the 1,000 generated event pages carry NO executable inline script. The three blocks (flyer preload, page script, password overlay)
// are external files; the per-page slug is a non-executable JSON data block. The moved code is proven unchanged by hash against the pre-migration inline blocks (main @ 5baa419a).
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const ROOT = path.join(__dirname, ".."), read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8"), sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const BLOCK = /<script((?:\s[^>]*)?)>([\s\S]*?)<\/script>/g;
const executableInline = (html) => [...html.matchAll(BLOCK)].filter((m) => !/\ssrc=/.test(m[1]) && !/type="(application\/(ld\+)?json|importmap|speculationrules)"/.test(m[1]));
const body = (f) => read("assets/js/" + f + ".js").replace(/^\/\*[\s\S]*?\*\/\n/, "");   // without the header comment
// sha256 of the three inline blocks exactly as they were in event.html before the move (text between <script> and </script>)
const OLD = { pre: "87128489fb0eb94ab18cc3aa736ccbbbaa7f448ed5e3dc44266a3fc32110556d", main: "fa3ffc34eeefd0f74974ca6aa1369a7acdaacae92e361a87afc21239fa7fc6a6", pw: "a100c334cd4b50bb04a6120a69c9af91e572b571df87c7625df5a3bd80a8a02a" };

test("control: the detector finds an executable inline block and ignores src / JSON / ld+json blocks", () => {
  assert.equal(executableInline("<script>alert(1)</script>").length, 1);
  assert.equal(executableInline('<script src="/x.js"></script><script type="application/json" id="a">"b"</script><script type="application/ld+json">{}</script>').length, 0);
});

test("event.html: no executable inline script; the three external scripts are in the original positions and stamped", () => {
  const h = read("event.html");
  assert.deepEqual(executableInline(h).map((m) => m[2].slice(0, 40)), []);
  const order = [...h.matchAll(/<script src="\/assets\/js\/(event-preload|event-page|event-password)\.js\?v=h[0-9a-f]{8}"><\/script>/g)].map((m) => m[1]);
  assert.deepEqual(order, ["event-preload", "event-page", "event-password"]);
  assert.ok(h.indexOf("event-preload.js") < h.indexOf("kil-rsvp.js") && h.indexOf("kil-rsvp.js") < h.indexOf("event-page.js") && h.indexOf("event-page.js") < h.indexOf("event-password.js"));
});

test("moved code is unchanged: preload and password blocks byte-identical, the page script identical apart from the two documented lines and the slug shim", () => {
  assert.equal(sha(body("event-preload").trim()), OLD.pre); assert.equal(sha(body("event-password").trim()), OLD.pw);
  let main = body("event-page");
  const shim = main.slice(0, main.indexOf("})();\n") + 6); assert.match(shim, /kil-prerender-slug/); main = main.slice(shim.length);
  main = main.replace(/function canonFor\(slug\)\{ return window\.__kilPrerenderSlug \? [^\n]*?\/\* prerendered pages canonicalise[^\n]*?\*\//, "function canonFor(slug){ return 'https://keepitil.com/event?e='+encodeURIComponent(slug||''); }").replace("slug:g('e')||window.__kilPrerenderSlug||'',", "slug:g('e'),");
  // documented later change (buyer-paid ticket service fee, 2026-11-27): three additions to the page script, removed here so the rest is still proven byte-identical
  const FEE_FN = /  \/\* TICKET SERVICE FEE \(buyer-paid, Joe\)[^\n]*\*\/\n  function kilServiceFee\(sub\)\{[^\n]*\}\n/;
  assert.match(main, FEE_FN); main = main.replace(FEE_FN, "");
  const FEE_TAX = "var fee=kilServiceFee(sub); $('tf-tax').textContent=sub>0?('Service fee '+money(fee)+' · Total '+money(sub+fee)):'Service fee 5% + $0.50 per order';";
  assert.ok(main.includes(FEE_TAX)); main = main.replace(FEE_TAX, "$('tf-tax').textContent='Tax $0.00 · fees included';");
  const FEE_NOTE = /if\(tt\)\{ if\(!\$\('tix-fee'\)\)\{[^\n]*?tt\.parentNode\.insertBefore\(fl,tt\); \} tt\.style\.display=''; \} \}/;
  assert.match(main, FEE_NOTE); main = main.replace(FEE_NOTE, "if(tt) tt.style.display=''; }");
  assert.equal(sha(main.trim()), OLD.main);
});
test("the three files parse, and none can close its own <script> tag", () => {
  for (const f of ["event-preload", "event-page", "event-password"]) { assert.doesNotThrow(() => new vm.Script(read("assets/js/" + f + ".js")), f); assert.equal(/<\/script/i.test(read("assets/js/" + f + ".js")), false, f); }
});

test("slug shim: reads the JSON data block into window.__kilPrerenderSlug; ignores anything that is not a string; never overrides an existing value", () => {
  const shim = (() => { const m = body("event-page"); return m.slice(0, m.indexOf("})();\n") + 5); })();
  const run = (text, pre) => { const win = pre === undefined ? {} : { __kilPrerenderSlug: pre }; vm.runInNewContext(shim, { window: win, document: { getElementById: (id) => (id === "kil-prerender-slug" && text !== null ? { textContent: text } : null) }, JSON }); return win.__kilPrerenderSlug; };
  assert.equal(run('"my-event"'), "my-event"); assert.equal(run("123"), undefined); assert.equal(run("{bad"), undefined); assert.equal(run(null), undefined); assert.equal(run('"x"', "keep"), "keep");
});

const dirs = fs.readdirSync(path.join(ROOT, "event")).filter((d) => fs.existsSync(path.join(ROOT, "event", d, "index.html")));
test("all " + dirs.length + " generated event pages: no executable inline script, one slug data block that matches the folder, the template's three script tags in the same order", () => {
  assert.ok(dirs.length > 500);
  const tpl = [...read("event.html").matchAll(/<script src="\/assets\/js\/event-(?:preload|page|password)\.js\?v=h[0-9a-f]{8}"><\/script>/g)].map((m) => m[0]);
  assert.equal(tpl.length, 3); const bad = [];
  for (const d of dirs) {
    const h = read("event/" + d + "/index.html"); const own = [...h.matchAll(/<script src="\/assets\/js\/event-(?:preload|page|password)\.js\?v=h[0-9a-f]{8}"><\/script>/g)].map((m) => m[0]);
    const slug = [...h.matchAll(/<script type="application\/json" id="kil-prerender-slug">([^<]*)<\/script>/g)].map((m) => m[1]);
    let ok = executableInline(h).length === 0 && JSON.stringify(own) === JSON.stringify(tpl) && slug.length === 1;
    try { ok = ok && JSON.parse(slug[0]) === d; } catch { ok = false; }
    if (!ok) bad.push(d);
  }
  assert.deepEqual(bad.slice(0, 5), []);
});
