// CSP migration (inline <script> step 7): the 24 deployed article pages have NO executable inline script. Each page's single block moved VERBATIM to assets/js/pages/article-*.js (pages whose
// blocks were byte-identical share one file); the sha256 of main's inline block is embedded. (article/kform-lead-capture/index.play.html is undeployed: .github/pages-exclude.txt.)
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const ROOT = path.join(__dirname, ".."), read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8"), sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const mask = (h) => h.replace(/<!--[\s\S]*?-->/g, (m) => " ".repeat(m.length));
const executableInline = (html) => [...mask(html).matchAll(/<script((?:\s[^>]*)?)>([\s\S]*?)<\/script>/g)].filter((m) => !/\ssrc\b/.test(m[1]) && !/type="(application\/(ld\+)?json|importmap|speculationrules)"/.test(m[1]));
const BLOCKS = [
{
"page": "article/age-of-war-play-free/index.html",
"file": "assets/js/pages/article-share-f7b2cd6b.js",
"hash": "f7b2cd6b2a3d762490272b6bab94bb732f7144cddb2304682bdbcc3d1d0e52d0"
},
{
"page": "article/aow2-world-crusade/index.html",
"file": "assets/js/pages/article-share-0479f496.js",
"hash": "0479f496b07a9e2dbc3c627deda4ebe1618aea4c680fbb0f594762485693ce2e"
},
{
"page": "article/artist/ashleycordelia/index.html",
"file": "assets/js/pages/article-share-43b4acfc.js",
"hash": "43b4acfc6d49f6bf60e7101a59b361b322ecf760bb85acbdb954839896c86531"
},
{
"page": "article/artist/chlophonic/index.html",
"file": "assets/js/pages/article-share-43b4acfc.js",
"hash": "43b4acfc6d49f6bf60e7101a59b361b322ecf760bb85acbdb954839896c86531"
},
{
"page": "article/artist/djai/index.html",
"file": "assets/js/pages/article-share-43b4acfc.js",
"hash": "43b4acfc6d49f6bf60e7101a59b361b322ecf760bb85acbdb954839896c86531"
},
{
"page": "article/artist/djtension/index.html",
"file": "assets/js/pages/article-share-43b4acfc.js",
"hash": "43b4acfc6d49f6bf60e7101a59b361b322ecf760bb85acbdb954839896c86531"
},
{
"page": "article/artist/elysium/index.html",
"file": "assets/js/pages/article-share-43b4acfc.js",
"hash": "43b4acfc6d49f6bf60e7101a59b361b322ecf760bb85acbdb954839896c86531"
},
{
"page": "article/artist/groove-trooper/index.html",
"file": "assets/js/pages/article-share-43b4acfc.js",
"hash": "43b4acfc6d49f6bf60e7101a59b361b322ecf760bb85acbdb954839896c86531"
},
{
"page": "article/artist/pyprr/index.html",
"file": "assets/js/pages/article-share-43b4acfc.js",
"hash": "43b4acfc6d49f6bf60e7101a59b361b322ecf760bb85acbdb954839896c86531"
},
{
"page": "article/artist/richrunthat/index.html",
"file": "assets/js/pages/article-share-43b4acfc.js",
"hash": "43b4acfc6d49f6bf60e7101a59b361b322ecf760bb85acbdb954839896c86531"
},
{
"page": "article/artist/smoke/index.html",
"file": "assets/js/pages/article-share-43b4acfc.js",
"hash": "43b4acfc6d49f6bf60e7101a59b361b322ecf760bb85acbdb954839896c86531"
},
{
"page": "article/artist/swerve/index.html",
"file": "assets/js/pages/article-share-43b4acfc.js",
"hash": "43b4acfc6d49f6bf60e7101a59b361b322ecf760bb85acbdb954839896c86531"
},
{
"page": "article/artist/xeodin/index.html",
"file": "assets/js/pages/article-share-43b4acfc.js",
"hash": "43b4acfc6d49f6bf60e7101a59b361b322ecf760bb85acbdb954839896c86531"
},
{
"page": "article/bleu/index.html",
"file": "assets/js/pages/article-share-43b4acfc.js",
"hash": "43b4acfc6d49f6bf60e7101a59b361b322ecf760bb85acbdb954839896c86531"
},
{
"page": "article/california-love-history/index.html",
"file": "assets/js/pages/article-share-0c3a3bf7.js",
"hash": "0c3a3bf78de1ee3648430c6616748c4eb306ba17fd62a1eef502a4fb507b64f4"
},
{
"page": "article/countdown-nye-2026-sold-out-guide/index.html",
"file": "assets/js/pages/article-share-afcf8343.js",
"hash": "afcf8343ac9b182f178d55a1f4f17fd840946dc142c9e2b72daa07ec8a0aa219"
},
{
"page": "article/gifts-for-djs-under-100/index.html",
"file": "assets/js/pages/article-share-ddb0ed3d.js",
"hash": "ddb0ed3d95b4318717ab444f97ab8838f25aa1398e7fcc1546962a0b704f2cb3"
},
{
"page": "article/insomniac-edc-history/index.html",
"file": "assets/js/pages/article-share-1c197c69.js",
"hash": "1c197c69ca5d6f4c4e30ff234690475197a2580c1fdf0a3b4a4899fcd8df5b22"
},
{
"page": "article/keepitil-logo-tee/index.html",
"file": "assets/js/pages/article-share-87d98b11.js",
"hash": "87d98b11b8f8b509e11e7c0dfc00bb9554e2083bd0714e29045be419cde9c41f"
},
{
"page": "article/kform-lead-capture/index.html",
"file": "assets/js/pages/article-kform-gate.js",
"hash": "f08312ad3bc20c6603f16a7743531bbe987b9b586e75f7b67404de700180fd2c"
},
{
"page": "article/one-more-time-history/index.html",
"file": "assets/js/pages/article-share-0c3a3bf7.js",
"hash": "0c3a3bf78de1ee3648430c6616748c4eb306ba17fd62a1eef502a4fb507b64f4"
},
{
"page": "article/strings-of-life-history/index.html",
"file": "assets/js/pages/article-share-0c3a3bf7.js",
"hash": "0c3a3bf78de1ee3648430c6616748c4eb306ba17fd62a1eef502a4fb507b64f4"
},
{
"page": "article/underground-money-stack/index.html",
"file": "assets/js/pages/article-share-d9352d31.js",
"hash": "d9352d31ec8d50d0b07e8302ca26416180050f4805b7ad85c2f052c1b8c66df0"
},
{
"page": "article/wifi-remote-control-the-room/index.html",
"file": "assets/js/pages/article-share-fba0b550.js",
"hash": "fba0b5504b21dfdf5efb7a83dd0d00f27a5b2da553f5b9a0bef47a28f8a37e8f"
}
];   // [page, file, sha256 of main's inline block (outer newlines trimmed)]
const body = (file) => read(file).replace(/^\/\*[\s\S]*?\*\/\n/, "").replace(/^\n+|\n+$/g, "");

test("control: the detector finds an executable inline block and ignores src / JSON blocks / comments", () => {
  assert.equal(executableInline("<script>x()</script>").length, 1);
  assert.equal(executableInline('<script src="/a.js"></script><script type="application/json">1</script><!-- <script>c()</script> -->').length, 0);
});
test("every deployed article page: no executable inline script, exactly one moved-script tag for its file", () => {
  assert.equal(BLOCKS.length, 24);
  for (const { page, file } of BLOCKS) {
    const h = read(page); assert.deepEqual(executableInline(h).map((m) => m[2].slice(0, 40)), [], page);
    assert.equal((h.match(new RegExp('<script src="/' + file.replace(/[.\/]/g, "\\$&") + '"></script>', "g")) || []).length, 1, page);
  }
});
test("every moved script is byte-identical to the inline block it replaced (per page: sha256 of main's block); parses; cannot close its own <script>", () => {
  for (const { page, file, hash } of BLOCKS) { assert.equal(sha(body(file)), hash, page + " <- " + file); }
  for (const f of new Set(BLOCKS.map((b) => b.file))) { assert.doesNotThrow(() => new vm.Script(read(f)), f); assert.equal(/<\/script/i.test(read(f)), false, f); }
});
test("pages with the same block share one file (11 files for 24 pages); control: a changed byte is caught", () => {
  assert.equal(new Set(BLOCKS.map((b) => b.file)).size, 11);
  for (const [a, b] of [[BLOCKS[0], BLOCKS[0]]]) assert.notEqual(sha(body(a.file) + " "), b.hash);
  const byHash = {}; for (const b of BLOCKS) (byHash[b.hash] = byHash[b.hash] || new Set()).add(b.file); for (const s of Object.values(byHash)) assert.equal(s.size, 1);
});
test("the share button's delegated-actions loader still precedes the page script (allow-list registered before use)", () => {
  for (const { page, file } of BLOCKS.filter((b) => /article-share-/.test(b.file))) {
    const h = read(page); assert.ok(h.indexOf("/assets/js/kil-actions.js") < h.indexOf(file), page);
    assert.match(read(file), /KilActions\.allow\(\['kilShare'\]\)/);
  }
});
test("the kform gate keeps its own target (#keepitil-apps) and removes no caches (empty prefix list), unchanged from the inline block", () => {
  const f = read("assets/js/pages/article-kform-gate.js");
  assert.match(f, /location\.replace\("\/games\/#keepitil-apps"\)/); assert.match(f, /\[\]\.some\(/); assert.match(f, /\/article\/kform-lead-capture\//);
});
