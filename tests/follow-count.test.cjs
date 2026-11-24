// Profile follow button reads count + state from get_profile_stats, never lists the follows table.
// Run: node --test tests/follow-count.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = process.env.FC_ROOT || path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "profile.html"), "utf8");
function extract(name) {
  const start = html.indexOf("function " + name + "(");
  assert.ok(start > 0, name + " not found");
  let depth = 0;
  for (let i = html.indexOf("{", start); i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}" && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error("unbalanced");
}
function run(reply, session) {
  const calls = [];
  const box = { SB: { rpc: (n, a) => { calls.push(n + JSON.stringify(a)); return Promise.resolve(reply); } }, PROFILE_SLUG: "p", SESSION: session, FOLLOWERS: 0, FOLLOWING: false, rendered: 0, renderFollowBtn() { box.rendered++; } };
  vm.createContext(box);
  vm.runInContext(extract("loadFollow") + "\nloadFollow();", box);
  return { box, calls };
}
const tick = () => new Promise((r) => setImmediate(r));
test("count and is_following come from get_profile_stats", async () => {
  const t = run({ data: { followers: 7, is_following: true } }, { user: { id: "u" } });
  await tick();
  assert.deepEqual(t.calls, ['get_profile_stats{"p_slug":"p"}']);
  assert.equal(t.box.FOLLOWERS, 7); assert.equal(t.box.FOLLOWING, true); assert.equal(t.box.rendered, 1);
});
test("signed-out visitor is never 'following'; errors change nothing", async () => {
  let t = run({ data: { followers: 3, is_following: true } }, null);
  await tick(); assert.equal(t.box.FOLLOWING, false); assert.equal(t.box.FOLLOWERS, 3);
  t = run({ error: { message: "x" } }, { user: { id: "u" } });
  await tick(); assert.equal(t.box.rendered, 0);
});
test("the page no longer selects other people's rows from follows", () => {
  const code = html.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code, /from\('follows'\)\.select\('follower_id'/);
});
