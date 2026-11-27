// After editing a community event the page must tell the truth about review state (Joe's G2 rule, 2026-11-23).
// Run: node --test tests/edit-message.test.cjs
const test = require("node:test");
const __A = require("./helpers/event-assembled.cjs").assemble;
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = process.env.EM_ROOT || path.resolve(__dirname, "..");
const html = __A(fs.readFileSync(path.join(ROOT, "submit-event.html"), "utf8"));
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
const box = {};
vm.createContext(box);
vm.runInContext(extract("editSavedMessage"), box);
test("only an explicit needs_review=false says the event stays live", () => {
  assert.match(box.editSavedMessage({ ok: true, needs_review: false }), /stays live/);
  for (const d of [{ ok: true, needs_review: true }, { ok: true }, {}, null, undefined]) assert.match(box.editSavedMessage(d), /back in review/, JSON.stringify(d));
});
test("the edit handler uses it", () => {
  assert.match(html, /msg\.textContent=editSavedMessage\(d\);/);
  assert.doesNotMatch(html, /msg\.textContent='Saved — back in review\. ✓';/);
});
