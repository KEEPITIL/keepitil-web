// A paid single event cannot be deleted (delete_event answers has_sales). After a refusal the same card offers "Hide this event" (archive_event, owner-only).
// archive_event itself refuses while tickets are active; its message is shown. Run: node --test tests/hide-single-event.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = process.env.HS_ROOT || path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "create-event.html"), "utf8");

test("the Hide button is on the delete card, hidden until delete is refused for sales", () => {
  assert.match(html, /id="hideEventBtn" style="display:none/);
  assert.match(html, /if\(d\.error==='has_sales'\)\{ var hb=\$\('hideEventBtn'\)/);
  assert.ok(html.indexOf('id="hideEventBtn"') > html.indexOf('id="delCard"') && html.indexOf('id="hideEventBtn"') < html.indexOf('id="delMsg"'));
});
function load() {
  const src = html.match(/async function deleteThisEvent\(\)\{[\s\S]*?\n\}\n/)[0] + html.match(/async function hideThisEvent\(\)\{[\s\S]*?\n\}\n/)[0];
  const els = { delEventBtn: { disabled: false, style: {} }, hideEventBtn: { disabled: false, style: { display: "none" } }, delMsg: { className: "", textContent: "" } };
  const calls = [];
  const ctx = { EDIT_SLUG: "paid-night", $: (id) => els[id], confirm: () => ctx.__ok, __ok: true, location: { href: "" }, calls,
    supa: { rpc: async (n, a) => { calls.push(n + ":" + a.p_slug); return ctx.__res[n]; } } };
  vm.createContext(ctx); vm.runInContext(src + "\nthis.del=deleteThisEvent;this.hide=hideThisEvent;", ctx);
  return { ctx, els };
}
test("delete refused for sales reveals Hide; Hide calls archive_event for this slug and confirms", async () => {
  const { ctx, els } = load();
  ctx.__res = { delete_event: { data: { error: "has_sales", message: "Tickets have been sold." } }, archive_event: { data: { archived: true } } };
  await ctx.del();
  assert.equal(els.hideEventBtn.style.display, "");
  await ctx.hide();
  assert.equal(ctx.calls.join(","), "delete_event:paid-night,archive_event:paid-night");
  assert.match(els.delMsg.textContent, /Event hidden/);
  assert.equal(els.delEventBtn.style.display, "none");
});
test("negative controls: other delete errors do not reveal Hide; declined confirm hides nothing; active tickets keep it visible with the server message", async () => {
  let t = load(); t.ctx.__res = { delete_event: { data: { error: "notyours", message: "Not yours." } } };
  await t.ctx.del(); assert.equal(t.els.hideEventBtn.style.display, "none");
  t = load(); t.ctx.__ok = false; t.ctx.__res = {}; await t.ctx.hide(); assert.equal(t.ctx.calls.length, 0);
  t = load(); t.ctx.__res = { archive_event: { data: { error: "active_tickets", message: "Some tickets are still active." } } };
  await t.ctx.hide();
  assert.equal(t.els.delMsg.textContent, "Some tickets are still active.");
  assert.equal(t.els.hideEventBtn.disabled, false);
});
