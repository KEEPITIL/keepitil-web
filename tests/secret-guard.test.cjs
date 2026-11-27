// Anti-copy / anti-RE guardrail (Joe-approved 2026-11-24): nothing committed to this repo may leak a secret or a source map.
// The only credential allowed to ship is the Supabase ANON key of the KEEPITIL project (public by design, protected by RLS).
// Fails on: a JWT that is not role=anon of the allow-listed project; the word service_role in shipped files; Stripe sk_/rk_ keys;
// a private-key header; an AWS access key id; any *.map file; a sourceMappingURL comment that is not on the allow-list.
// No anti-debugger / anti-devtools code is, or will be, added: users' own browsers are theirs.
// Run: node --test tests/secret-guard.test.cjs        Negative controls: the last tests feed synthetic leaks (built at runtime) to the scanner.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = process.env.SG_ROOT || path.resolve(__dirname, "..");

const ALLOWED_JWT_ROLES = new Set(["anon"]);
const ALLOWED_PROJECT_REFS = new Set(["ovmqtzjfpzrbzrlkxwgw"]);   // KEEPITIL prod; the anon key is public
// sourceMappingURL comments in vendored / CI-built third-party code. The referenced map must NOT ship (checked below).
const ALLOWED_SOURCEMAP_COMMENTS = new Set([
  "assets/js/vendor/purify.min.js",
  "app/tuitea/app/flutter.js", "app/tuitea/app/flutter_bootstrap.js", "app/tuitea/app/index.html",
]);
const SKIP_DIR = /(^|\/)(node_modules|\.git)(\/|$)/;
const IS_TEST_FILE = (rel) => /(^|\/)tests\//.test(rel) || /\.test\.(m|c)?js$/.test(rel);

function scanText(rel, text) {
  const out = [];
  if (/\.map$/i.test(rel)) out.push("source map file");
  if (!IS_TEST_FILE(rel)) {
    if (/service_role/.test(text)) out.push("the word service_role in a shipped file");
  }
  if (/sk_(live|test)_[0-9a-zA-Z]{8,}/.test(text)) out.push("Stripe secret key");
  if (/rk_(live|test)_[0-9a-zA-Z]{8,}/.test(text)) out.push("Stripe restricted key");
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) out.push("private key header");
  if (/AKIA[0-9A-Z]{16}/.test(text)) out.push("AWS access key id");
  if (/sourceMappingURL\s*=/.test(text) && !ALLOWED_SOURCEMAP_COMMENTS.has(rel) && !IS_TEST_FILE(rel)) out.push("sourceMappingURL not on the allow-list");
  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g)) {
    let pl = null;
    try { pl = JSON.parse(Buffer.from(m[1], "base64url").toString()); } catch (e) { continue; }
    if (!pl || typeof pl !== "object") continue;
    if (!ALLOWED_JWT_ROLES.has(pl.role)) out.push("JWT with role " + pl.role);
    else if (!ALLOWED_PROJECT_REFS.has(pl.ref)) out.push("anon JWT of an unlisted project");
  }
  return out;
}
function listFiles(dir, rel, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + "/" + e.name : e.name;
    if (SKIP_DIR.test(r)) continue;
    if (e.isDirectory()) listFiles(path.join(dir, e.name), r, acc); else acc.push(r);
  }
  return acc;
}
const FILES = listFiles(ROOT, "", []);

test("no committed file leaks a secret, a service_role key or a source map", () => {
  const bad = [];
  for (const rel of FILES) {
    let text = "";
    try { const p = path.join(ROOT, rel); if (fs.statSync(p).size < 8e6) text = fs.readFileSync(p, "utf8"); } catch (e) { continue; }
    if (text.slice(0, 2000).includes("\0")) text = "";
    for (const why of scanText(rel, text)) bad.push(rel + " :: " + why);
  }
  assert.deepEqual(bad, []);
});

test("the build emits no source maps: no *.map file anywhere, and the allow-listed sourceMappingURL targets are not shipped", () => {
  assert.deepEqual(FILES.filter((f) => /\.map$/i.test(f)), []);
  for (const rel of ALLOWED_SOURCEMAP_COMMENTS) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const m of fs.readFileSync(p, "utf8").matchAll(/sourceMappingURL\s*=\s*(\S+)/g)) {
      const target = m[1].replace(/["'*\/>]+$/, "");
      assert.ok(!fs.existsSync(path.join(path.dirname(p), target)), rel + " references a map that ships: " + target);
    }
  }
});

test("the allow-list is tight: the repo uses exactly one credential, the anon key of the KEEPITIL project", () => {
  const seen = new Set();
  for (const rel of FILES) {
    let text = ""; try { text = fs.readFileSync(path.join(ROOT, rel), "utf8"); } catch (e) { continue; }
    for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g)) {
      try { const pl = JSON.parse(Buffer.from(m[1], "base64url").toString()); seen.add(pl.role + "|" + pl.ref); } catch (e) {}
    }
  }
  assert.deepEqual([...seen], ["anon|ovmqtzjfpzrbzrlkxwgw"]);
});

// ---- negative controls: the scanner must catch each synthetic leak (strings are assembled here so this file itself stays clean)
const jwt = (payload) => "eyJ" + Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url").slice(3) + "." + Buffer.from(JSON.stringify(payload)).toString("base64url") + "." + "sig_sig_sig_sig_sig";
test("control: a service_role JWT is caught", () => {
  assert.match(scanText("x.js", "var K='" + jwt({ role: "service_" + "role", ref: "ovmqtzjfpzrbzrlkxwgw" }) + "'").join(), /JWT with role service_role/);
});
test("control: an anon JWT of another project is caught; the allow-listed anon key passes", () => {
  assert.match(scanText("x.js", "k='" + jwt({ role: "anon", ref: "someotherproject" }) + "'").join(), /unlisted project/);
  assert.deepEqual(scanText("x.js", "k='" + jwt({ role: "anon", ref: "ovmqtzjfpzrbzrlkxwgw" }) + "'"), []);
});
test("control: Stripe keys, private key headers, AWS key ids, source maps and stray sourceMappingURL are caught", () => {
  assert.match(scanText("a.js", "k='sk_" + "live_abcdefgh12345678'").join(), /Stripe secret/);
  assert.match(scanText("a.js", "k='rk_" + "test_abcdefgh12345678'").join(), /Stripe restricted/);
  assert.match(scanText("a.pem", "-----BEGIN RSA " + "PRIVATE KEY-----\nabc").join(), /private key/);
  assert.match(scanText("a.js", "k='AK" + "IAABCDEFGHIJKLMNOP'").join(), /AWS/);
  assert.match(scanText("assets/app.js.map", "{}").join(), /source map file/);
  assert.match(scanText("assets/js/new-bundle.js", "//# sourceMapping" + "URL=new-bundle.js.map").join(), /sourceMappingURL/);
  assert.match(scanText("index.html", "role: 'service_" + "role'").join(), /service_role/);
  assert.deepEqual(scanText("tests/x.test.cjs", "assert.doesNotMatch(src, /service_" + "role/)"), [], "test files may name the word");
});
