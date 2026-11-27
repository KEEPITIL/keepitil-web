// Sign-up offers the same Google / Apple providers as sign-in, and /reset-password uses the shared shell.
// Run: node --test tests/signup-social.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = process.env.SS_ROOT || path.resolve(__dirname, "..");
const su = fs.readFileSync(path.join(ROOT, "signup.html"), "utf8");
const rp = fs.readFileSync(path.join(ROOT, "reset-password.html"), "utf8");

function extract(src, name) {
  const start = src.indexOf("function " + name + "(");
  assert.ok(start > 0, name + " not found");
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error("unbalanced");
}
function run(provider, supa) {
  const said = [], calls = [];
  const box = { supa: supa(calls), location: { origin: "https://keepitil.com" }, say: (m) => said.push(m) };
  vm.createContext(box);
  vm.runInContext(extract(su, "oauth"), box);
  box.oauth(provider);
  return { said, calls };
}
test("both providers start OAuth with the profile landing", async () => {
  for (const p of ["google", "apple"]) {
    const { calls } = run(p, (calls) => ({ auth: { signInWithOAuth: (o) => { calls.push(JSON.stringify(o)); return Promise.resolve({}); } } }));
    assert.equal(calls[0], JSON.stringify({ provider: p, options: { redirectTo: "https://keepitil.com/profile" } }));
  }
});
test("provider error is shown, missing client says unavailable", async () => {
  let r = run("google", () => ({ auth: { signInWithOAuth: () => Promise.resolve({ error: { message: "nope" } }) } }));
  await new Promise((x) => setImmediate(x));
  assert.match(r.said.join(" "), /Google sign-up failed: nope/);
  r = run("apple", () => null);
  assert.match(r.said[0], /unavailable/);
});
test("buttons sit between the OR divider and the log-in link", () => {
  const d = su.indexOf('<div class="divider">OR</div>'), g = su.indexOf('id="btn-google"'), a = su.indexOf('id="btn-apple"'), l = su.indexOf("Already have an account?");
  assert.ok(d > 0 && d < g && g < a && a < l);
  assert.match(su, /Continue with Google/);
  assert.match(su, /Continue with Apple/);
});
test("/reset-password loads the shared shell and shows the standard wordmark", () => {
  assert.match(rp, /<script src="\/keepitil-shell\.js\?v=\d+[a-z]*" defer><\/script>/);
  assert.doesNotMatch(rp, /⚡/);
  assert.match(rp, /<div class="logo">KEEPITIL<\/div>/);
  assert.match(rp, /<main class="wrap">/);
});
