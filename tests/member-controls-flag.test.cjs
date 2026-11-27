// Gate 11: Unpublish / Delete / Download-my-data are hidden behind ONE flag until gh.io #95 (server functions) is applied.
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const R = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const se = R("submit-event.html"), st = R("settings.html");
const flag = (s) => (s.match(/var MEMBER_DATA_CONTROLS=(true|false);/) || [])[1];
test("the flag exists in both pages, is equal in both, and is ON (gh.io #95 applied + verified on prod 2026-11-25 15:30 window)", () => {
  assert.ok(flag(se) && flag(st)); assert.equal(flag(se), flag(st)); assert.equal(flag(se), "true");
});
function rowsHtml(on) {   // run the real row-building expression from submit-event.html
  const m = se.match(/var acts=mine\s*\?'([\s\S]*?)\s*:'<a class="ed"/)[0];
  const code = "var MEMBER_DATA_CONTROLS=" + on + ";var MEMBER_LIVE=['published','review','sold_out'];var e={source:'community',status:'published',has_orders:false,slug:'x'};var i=0;var mine=true;" + m.replace(/\s*:'<a class="ed"$/, "") .replace(/^var acts=mine\s*\?/, "var acts=") + ";acts;";
  return vm.runInNewContext(code);
}
test("submit-event: flag off renders Edit only; flag on renders Edit + Unpublish + Delete", () => {
  const off = rowsHtml(false), on = rowsHtml(true);
  assert.match(off, />Edit</); assert.doesNotMatch(off, /Unpublish|Delete/);
  assert.match(on, /Unpublish/); assert.match(on, /Delete/);
});
test("submit-event: flag off shows the email fallback line; the unpublish/delete handlers stay in the file for when it is on", () => {
  assert.match(se, /id="recentHelp"/); assert.match(se, /memberAct\(/); assert.match(se, /delete_my_community_event/);
});
test("settings: flag off hides the Download button row and shows an email row (JS toggle present)", () => {
  assert.match(st, /id="exp-row"/); assert.match(st, /id="exp-mail-row" hidden/);
  assert.match(st, /if\(!MEMBER_DATA_CONTROLS\)\{ if\(d\) d\.hidden=true; if\(m\) m\.hidden=false;/);
});
test("control: flipping the flag on in a copy would show the controls again (the test is not vacuous)", () => {
  assert.notEqual(rowsHtml(true), rowsHtml(false));
});
