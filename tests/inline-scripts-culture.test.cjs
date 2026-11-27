// CSP migration (inline <script> step 6): culture/index.html has NO executable inline script. Its 16 blocks moved VERBATIM, at the same positions, to assets/js/pages/culture-*.js;
// the sha256 of main's inline block is embedded. The detector ignores HTML comments.
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const ROOT = path.join(__dirname, ".."), read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8"), sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const mask = (h) => h.replace(/<!--[\s\S]*?-->/g, (m) => " ".repeat(m.length));
const executableInline = (html) => [...mask(html).matchAll(/<script((?:\s[^>]*)?)>([\s\S]*?)<\/script>/g)].filter((m) => !/\ssrc\b/.test(m[1]) && !/type="(application\/(ld\+)?json|importmap|speculationrules)"/.test(m[1]));
const BLOCKS = [
{
"file": "assets/js/pages/culture-head-snap.js",
"hash": "1b2de4cad473b207f2144d1f078d30caf8d56c513ef2205a7b769ce594ec97d5"
},
{
"file": "assets/js/pages/culture-head-warm.js",
"hash": "4f36752c7567e2329a0095e19920d451d5f6c1b79a4884b0cd913d4db4c38b61"
},
{
"file": "assets/js/pages/culture-feed-removed.js",
"hash": "48db4f40847cc0757cccb88c7913ec322b5d6480a8d3bbeca6b30074ee6fb6f1"
},
{
"file": "assets/js/pages/culture-tpl.js",
"hash": "9ed230c4abeeb89767ccf6e402151d178a0363781d0b867296c973dd6f0ab953"
},
{
"file": "assets/js/pages/culture-community.js",
"hash": "c0c8ac0fc6b0fd98938623a428bfe08ebf0e755f778a59303a048930880b4ca5"
},
{
"file": "assets/js/pages/culture-mobile.js",
"hash": "cc8e24cee5d48f85428828569872d903f59e037a8cd89dce06cb453fd4ccb5ee"
},
{
"file": "assets/js/pages/culture-feed-gate.js",
"hash": "df8f7cdde51e7491ed3afc916ac49641fb26baa9a010f5d224c16633520d809a"
},
{
"file": "assets/js/pages/culture-sidebar.js",
"hash": "3a8722b7b534374b5f94b3aaa505ecd2e93ab2934ead4cdf0a67946668948396"
},
{
"file": "assets/js/pages/culture-supabase-cfg.js",
"hash": "2ca567d4d06b50f0e119504ab365e220651863f7b4c36214a82fa91042c1e630"
},
{
"file": "assets/js/pages/culture-kildebug.js",
"hash": "0360a29c6fff553572fc3a4943f1122821417ca77530e9bad3a7a83c4c3ee3f5"
},
{
"file": "assets/js/pages/culture-discovery.js",
"hash": "97df7c0aa40b1df746691112bd2c94cb2eb185b3007ed0081293f8b50a4053d6"
},
{
"file": "assets/js/pages/culture-article.js",
"hash": "04a6a2cc36bfd3b0ea1c76ffb859120ccc2b1a808132dcb6a082a810e8245a51"
},
{
"file": "assets/js/pages/culture-landing.js",
"hash": "a6e563ffe7c907296d50c119e8965e8f3c2708bcffd6538d7f28d5acd960eab5"
},
{
"file": "assets/js/pages/culture-month.js",
"hash": "f07e9d09ed2c751ea181c1ca3c96c26c0fdd0353390190e14f65ac8737481cfc"
},
{
"file": "assets/js/pages/culture-footer.js",
"hash": "f513421c23042ecc31a05d46fd498499d0abc07f7703248fc997c1369d26b21a"
},
{
"file": "assets/js/pages/culture-autoadvance.js",
"hash": "10020b770e84addc189633f45d916f7e41b3ef043d5f877e2364fb2999052fb0"
}
];   // [file, sha256 of main's inline block (outer newlines trimmed)], in page order
const body = (file) => read(file).replace(/^\/\*[\s\S]*?\*\/\n/, "").replace(/^\n+|\n+$/g, "");

test("control: the detector finds an executable inline block and ignores src / JSON blocks / comments", () => {
  assert.equal(executableInline("<script>x()</script>").length, 1);
  assert.equal(executableInline('<script src="/a.js"></script><script type="application/json">1</script><!-- <script>c()</script> -->').length, 0);
});
test("culture/index.html: no executable inline script; the 16 scripts are referenced once each, stamped, in the original order", () => {
  const h = read("culture/index.html"); assert.equal(BLOCKS.length, 16);
  assert.deepEqual(executableInline(h).map((m) => m[2].slice(0, 40)), []);
  const mine = BLOCKS.map((b) => b.file);
  const order = [...mask(h).matchAll(/<script src="\/(assets\/js\/pages\/culture-[\w-]+\.js)\?v=h[0-9a-f]{8}"><\/script>/g)].map((m) => m[1]);
  assert.deepEqual(order, mine);
});
test("every moved script is byte-identical to the inline block it replaced; parses; cannot close its own <script>", () => {
  for (const { file, hash } of BLOCKS) { assert.equal(sha(body(file)), hash, file); assert.doesNotThrow(() => new vm.Script(read(file)), file); assert.equal(/<\/script/i.test(read(file)), false, file); }
});
test("control: a changed byte is caught by the hash check", () => assert.notEqual(sha(body(BLOCKS[3].file) + " "), BLOCKS[3].hash));
test("the two <head> scripts (landing no-snap, video warm-up) still run before any body markup, and the delegated-actions loader still precedes the script that registers its allow-list", () => {
  const h = read("culture/index.html"), head = h.slice(0, h.indexOf("</head>"));
  assert.ok(head.includes("culture-head-snap.js") && head.includes("culture-head-warm.js"));
  assert.ok(h.indexOf("/assets/js/kil-actions.js") < h.indexOf("culture-feed-removed.js"), "kil-actions.js before the script that calls KilActions.allow");
  assert.match(read("assets/js/pages/culture-feed-removed.js"), /KilActions\.allow\(/);
});
