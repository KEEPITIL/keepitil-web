// CSP migration (inline <script> step 4): nine medium pages have NO executable inline script. Each page's block moved VERBATIM to an external file at the same position;
// the sha256 of main's inline block is embedded here. settings.html reuses the shared head theme-init file (byte-identical block).
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const ROOT = path.join(__dirname, ".."), read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8"), sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const executableInline = (html) => [...html.matchAll(/<script((?:\s[^>]*)?)>([\s\S]*?)<\/script>/g)].filter((m) => !/\ssrc=/.test(m[1]) && !/type="(application\/(ld\+)?json|importmap|speculationrules)"/.test(m[1]));
const BLOCKS = [
{
"page": "settings.html",
"file": "assets/js/kil-theme-init.js",
"hash": "5c5c3c18d65667dce28f83e5fdcf5299851ee0869a6fed25fceb94c0eeb6a855"
},
{
"page": "settings.html",
"file": "assets/js/pages/settings-main.js",
"hash": "03b4af28f5c08dea120a8e0b4e8733205afeff60e1788b1711ff0c5ab7327ac6"
},
{
"page": "apply.html",
"file": "assets/js/pages/apply-main.js",
"hash": "62e3e18e6659f9c4b59da2803e6dd2bfb1a6c1ba1088e8229e675131c55025ee"
},
{
"page": "tickets.html",
"file": "assets/js/pages/tickets-main.js",
"hash": "6ada471167e54f2e9c988431c3e5a140cb5466d97e5cad75b9a9399f60585a4d"
},
{
"page": "venue.html",
"file": "assets/js/pages/venue-main.js",
"hash": "c273cca21d6d767f89048b8803fdc00cab06d303b559aa35c24f3ae188e08b9d"
},
{
"page": "submit-event.html",
"file": "assets/js/pages/submit-event-main.js",
"hash": "4c3f59983ae0a8b5030e0bc7a9cb0fea8723cc78a2dce15f8b57bc7f4b8ee689"
},
{
"page": "signup.html",
"file": "assets/js/pages/signup-main.js",
"hash": "0f8864d076a86b758364fb8561646ae41006d2c66f7df1ee5d452a533f051c2c"
},
{
"page": "kode/app.html",
"file": "assets/js/pages/kode-app-main.js",
"hash": "086b9d4ab2b86e03fdba3cb1930a99227736c4e720fd3508dfef9952d793e7b1"
},
{
"page": "kode/embed.html",
"file": "assets/js/pages/kode-embed-main.js",
"hash": "dd9e26b96b99383eb123ef0dcaddc4c1dd0105d6b24b701754b47458707fa8d2"
},
{
"page": "organizers/dashboard.html",
"file": "assets/js/pages/organizers-main.js",
"hash": "fa276602a4d2be53395d838585611207f325ca30966fe837f440a792c1b18e1e"
}
];   // [page, file, sha256 of main's inline block (outer newlines trimmed)]
const body = (file) => read(file).replace(/^\/\*[\s\S]*?\*\/\n/, "").replace(/^\n+|\n+$/g, "");

test("control: the detector finds an executable inline block and ignores src / JSON blocks", () => {
  assert.equal(executableInline("<script>x()</script>").length, 1);
  assert.equal(executableInline('<script src="/a.js"></script><script type="application/json">1</script>').length, 0);
});
test("the nine pages have no executable inline script, and each moved script is referenced once, stamped (shared theme-init: unstamped is not allowed either), in the original order", () => {
  const pages = [...new Set(BLOCKS.map((b) => b.page))]; assert.equal(pages.length, 9);
  for (const p of pages) {
    const h = read(p); assert.deepEqual(executableInline(h).map((m) => m[2].slice(0, 40)), [], p);
    const mine = BLOCKS.filter((b) => b.page === p).map((b) => b.file);
    const order = [...h.matchAll(/<script src="\/(assets\/js\/[\w\/-]+\.js)\?v=h[0-9a-f]{8}"><\/script>/g)].map((m) => m[1]).filter((f) => mine.includes(f));
    assert.deepEqual(order, mine, p);
  }
});
test("every moved script is byte-identical to the inline block it replaced; parses; cannot close its own <script>", () => {
  for (const { page, file, hash } of BLOCKS) { assert.equal(sha(body(file)), hash, page + " <- " + file); assert.doesNotThrow(() => new vm.Script(read(file)), file); assert.equal(/<\/script/i.test(read(file)), false, file); }
});
test("control: a changed byte is caught by the hash check", () => assert.notEqual(sha(body(BLOCKS[1].file) + " "), BLOCKS[1].hash));
test("settings.html uses the same head theme-init file as profile.html (one block, one file)", () => {
  assert.equal(BLOCKS[0].file, "assets/js/kil-theme-init.js"); assert.match(read("profile.html") + read("settings.html"), /kil-theme-init\.js/);
  assert.ok(read("settings.html").indexOf("kil-theme-init.js") < read("settings.html").indexOf("settings-main.js"));
});
