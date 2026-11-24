// Settings: owner-only account deletion UI. Runs the real helper functions in a vm and checks the flow in source.
// Run: node --test tests/settings-delete-account.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = process.env.SD_ROOT || path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "settings.html"), "utf8");

function extract(name) {
  const start = html.indexOf("function " + name + "(");
  assert.ok(start > 0, name + " not found");
  let depth = 0;
  for (let i = html.indexOf("{", start); i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}" && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error("unbalanced " + name);
}
function helpers() {
  const box = {};
  vm.createContext(box);
  vm.runInContext(extract("delBlockerText") + "\n" + extract("delReady"), box);
  return box;
}

test("delete needs the exact word DELETE and no blockers", () => {
  const h = helpers();
  assert.equal(h.delReady("DELETE", []), true);
  assert.equal(h.delReady("  DELETE  ", []), true);
  for (const bad of ["", "delete", "DELET", "DELETE ME", null, undefined]) assert.equal(h.delReady(bad, []), false, String(bad));
  assert.equal(h.delReady("DELETE", ["household_with_members"]), false);
});
test("blocker codes get a human sentence, unknown codes point to support", () => {
  const h = helpers();
  assert.match(h.delBlockerText("household_with_members"), /TUITEA family household/);
  assert.match(h.delBlockerText("something_new"), /info@keepitil\.com/);
});
test("the panel starts closed and the delete button starts disabled", () => {
  assert.match(html, /<div id="del-panel" hidden/);
  assert.match(html, /id="del-go" type="button" onclick="delGo\(\)" disabled>/);
});
test("flow: blockers fetched first, delete only after delReady, sign out after success", () => {
  const open = extract("delOpen"), go = extract("delGo");
  assert.match(open, /rpc\('my_account_deletion_blockers'\)/);
  assert.ok(go.indexOf("delReady(") > 0 && go.indexOf("delReady(") < go.indexOf("rpc('delete_my_account')"), "delReady must gate the delete call");
  assert.ok(go.indexOf("rpc('delete_my_account')") < go.indexOf("signOut()"), "sign out only after the delete call");
  assert.match(go, /account_deletion_blocked/);
  assert.match(go, /Nothing was changed/);
  assert.equal((html.match(/rpc\('delete_my_account'\)/g) || []).length, 1, "exactly one call site");
});
test("the explanation uses the approved wording, word for word", () => {
  const want = "Your profile, profile page, saved events, follows and settings are deleted. Community posts and replies that other people answered stay, with your name and words removed. Events you submitted are not removed automatically: email info@keepitil.com before you delete your account if you want them taken down. Ticket orders you placed are kept for our records. This cannot be undone.";
  assert.ok(html.includes(want), "approved delete-account text missing");
});
