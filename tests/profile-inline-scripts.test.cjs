// CSP migration (inline <script> step 2): profile.html has NO executable inline script. The six blocks are external files at the same positions; the moved code is proven unchanged by hash.
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const ROOT = path.join(__dirname, ".."), read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8"), sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const executableInline = (html) => [...html.matchAll(/<script((?:\s[^>]*)?)>([\s\S]*?)<\/script>/g)].filter((m) => !/\ssrc=/.test(m[1]) && !/type="(application\/(ld\+)?json|importmap|speculationrules)"/.test(m[1]));
// [name, file, sha256 of the block text exactly as it was inline in profile.html on main (between <script> and </script>, outer newlines trimmed)]
const BLOCKS = [
 [
  "/assets/js/kil-theme-init.js",
  "assets/js/kil-theme-init.js",
  "5c5c3c18d65667dce28f83e5fdcf5299851ee0869a6fed25fceb94c0eeb6a855"
 ],
 [
  "labels",
  "assets/js/pages/profile-labels.js",
  "99a172b98fe00fe029e5361df21f96bb898034b2f689b5ffcb57f0dae1502a5b"
 ],
 [
  "gate",
  "assets/js/pages/profile-gate.js",
  "4951dc30c03b6ee42c1e7503bf9ac9a48dbdd7ac32983807e3821bff33a85f06"
 ],
 [
  "main",
  "assets/js/pages/profile-main.js",
  "b9e764853922bdc19b4692aa7528f3f636278347b2cf47cd36d1e5df1ac01e1f"
 ],
 [
  "links",
  "assets/js/pages/profile-links.js",
  "8a309f37465eaa3bdaf2402453aaf9a43322eb561c0d66efab6fdfd27ecc26c9"
 ],
 [
  "ig",
  "assets/js/pages/profile-ig.js",
  "fe2aa588de938951861e4087ab4b70b3f81e0391ba12fb171587ff3001c1928a"
 ]
];

test("control: the detector finds an executable inline block and ignores src / JSON blocks", () => {
  assert.equal(executableInline("<script>x()</script>").length, 1);
  assert.equal(executableInline('<script src="/a.js"></script><script type="application/json">1</script>').length, 0);
});
test("profile.html: no executable inline script; the six scripts are referenced once each, stamped, in the original order", () => {
  const h = read("profile.html");
  assert.deepEqual(executableInline(h).map((m) => m[2].slice(0, 40)), []);
  const order = [...h.matchAll(/<script src="\/(assets\/js\/[\w\/-]+\.js)\?v=h[0-9a-f]{8}"><\/script>/g)].map((m) => m[1]);
  const mine = BLOCKS.map((b) => b[1]);
  assert.deepEqual(order.filter((f) => mine.includes(f)), mine);
  assert.ok(h.indexOf("/assets/js/kil-actions.js") < h.indexOf("profile-main.js"), "the delegated-actions script still loads before the page script that registers its allow-list");
});
test("every moved script is byte-identical to the inline block it replaced (sha256 of main's block)", () => {
  for (const [name, file, hash] of BLOCKS) {
    const t = read(file).replace(/^\/\*[\s\S]*?\*\/\n/, "").replace(/^\n+|\n+$/g, "");
    assert.equal(sha(t), hash, name + " (" + file + ")");
  }
});
test("every moved script parses and cannot close its own <script> tag", () => {
  for (const [, file] of BLOCKS) { const s = read(file); assert.doesNotThrow(() => new vm.Script(s), file); assert.equal(/<\/script/i.test(s), false, file); }
});
test("control: a changed byte is caught by the hash check", () => {
  const [, file, hash] = BLOCKS[2]; const t = read(file).replace(/^\/\*[\s\S]*?\*\/\n/, "").replace(/^\n+|\n+$/g, "");
  assert.notEqual(sha(t + " "), hash);
});
