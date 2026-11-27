// CSP migration (inline <script> step 5): create/, connect/, earn/ and 404.html have NO executable inline script. Each block moved VERBATIM, at the same position, to assets/js/pages/*.js;
// the sha256 of main's inline block is embedded. The detector ignores HTML comments (connect/index.html has a comment that mentions "<script src>" and would otherwise pair with a real block).
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const ROOT = path.join(__dirname, ".."), read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8"), sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const mask = (h) => h.replace(/<!--[\s\S]*?-->/g, (m) => " ".repeat(m.length));
const executableInline = (html) => [...mask(html).matchAll(/<script((?:\s[^>]*)?)>([\s\S]*?)<\/script>/g)].filter((m) => !/\ssrc\b/.test(m[1]) && !/type="(application\/(ld\+)?json|importmap|speculationrules)"/.test(m[1]));
const BLOCKS = [
{
"page": "create/index.html",
"file": "assets/js/pages/create-view.js",
"hash": "417f35f0b81cad52df573cb71fa50cd23784c816872b05b752d6e81ddb830493"
},
{
"page": "create/index.html",
"file": "assets/js/pages/create-switch.js",
"hash": "67d8d150b4907a4b079ddd606b823195e7706fc20ea4c7cb0f6cd154858a3997"
},
{
"page": "connect/index.html",
"file": "assets/js/pages/connect-roster.js",
"hash": "b4e0ce3e1bf74341d2efe4cf9e2f42aec43565bdbc8350a7c5da2b4bf8bf0879"
},
{
"page": "connect/index.html",
"file": "assets/js/pages/connect-main.js",
"hash": "a5c8321733ab54504289da726724c7e61a49a033e1b7ac029900828b0e430d4a"
},
{
"page": "earn/index.html",
"file": "assets/js/pages/earn-scroll.js",
"hash": "db51e77ef728d35c11f1967abfe612068d631b52dc92ac9227cfb4e3d7cddd38"
},
{
"page": "earn/index.html",
"file": "assets/js/pages/earn-layout.js",
"hash": "2863bc88001a5cf2ee2fb4d95f5ebfd4056a9a45b19a8f942cc64b534989779a"
},
{
"page": "earn/index.html",
"file": "assets/js/pages/earn-main.js",
"hash": "3dec10777c9d8d8ad75b75824a2915f6b88104abb3d5748b25e03625237e6964"
},
{
"page": "404.html",
"file": "assets/js/pages/404-router.js",
"hash": "c210bde48afefd2e43ca3743612f35b482ed93b1f8044a27e163220553f2accd"
},
{
"page": "404.html",
"file": "assets/js/pages/404-reveal.js",
"hash": "a70808de70d06fb53cef60db4687180d581cd61b76610031f702dd68ad984fc7"
}
];   // [page, file, sha256 of main's inline block (outer newlines trimmed)]
const body = (file) => read(file).replace(/^\/\*[\s\S]*?\*\/\n/, "").replace(/^\n+|\n+$/g, "");

test("control: the detector finds an executable inline block, ignores src / JSON blocks, and is not fooled by a comment that mentions <script src>", () => {
  assert.equal(executableInline("<script>x()</script>").length, 1);
  assert.equal(executableInline('<script src="/a.js"></script><script type="application/json">1</script>').length, 0);
  assert.equal(executableInline("<!-- it was inside the shell's\n <script src> element, where inline content is ignored -->\n<script>real()</script>").length, 1);
  assert.equal(executableInline("<!-- <script>commented()</script> -->").length, 0);
});
test("the four pages have no executable inline script; each moved script is referenced once, stamped, in the original order", () => {
  const pages = [...new Set(BLOCKS.map((b) => b.page))]; assert.equal(pages.length, 4);
  for (const p of pages) {
    const h = read(p); assert.deepEqual(executableInline(h).map((m) => m[2].slice(0, 40)), [], p);
    const mine = BLOCKS.filter((b) => b.page === p).map((b) => b.file);
    const order = [...mask(h).matchAll(/<script src="\/(assets\/js\/[\w\/-]+\.js)\?v=h[0-9a-f]{8}"><\/script>/g)].map((m) => m[1]).filter((f) => mine.includes(f));
    assert.deepEqual(order, mine, p);
  }
});
test("every moved script is byte-identical to the inline block it replaced; parses; cannot close its own <script>", () => {
  for (const { page, file, hash } of BLOCKS) { assert.equal(sha(body(file)), hash, page + " <- " + file); assert.doesNotThrow(() => new vm.Script(read(file)), file); assert.equal(/<\/script/i.test(read(file)), false, file); }
});
test("control: a changed byte is caught by the hash check", () => assert.notEqual(sha(body(BLOCKS[0].file) + " "), BLOCKS[0].hash));
test("connect: the COMMUNITY comment and its script are both still in place, the module is its own external script after the shell tag", () => {
  const h = read("connect/index.html");
  assert.match(h, /<!-- COMMUNITY: its own tag\.[\s\S]*?-->\n<script src="\/assets\/js\/pages\/connect-main\.js\?v=h[0-9a-f]{8}"><\/script>/);
  assert.ok(h.indexOf("keepitil-shell.js") < h.indexOf("connect-main.js"));
});
test("404.html: the clean-URL router stays a parser-blocking external script in <head> (it uses document.write on the redirect fallback) and the reveal script still comes after the page body", () => {
  const h = read("404.html");
  const r = h.indexOf("404-router.js"), rv = h.indexOf("404-reveal.js");
  assert.ok(r > 0 && r < h.indexOf("</head>"), "router in <head>"); assert.ok(rv > h.indexOf("<body"), "reveal script after the body starts");
  assert.doesNotMatch(h.match(/<script src="[^"]*404-router\.js[^"]*"[^>]*>/)[0], /\b(async|defer)\b/);
  assert.match(read("assets/js/pages/404-router.js"), /document\.write\(/);
});
