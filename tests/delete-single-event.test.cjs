// An organizer editing a SINGLE event (no series) must be able to delete it from the edit page. Before, the only Delete lived in the
// series manager, which get_event_for_edit leaves empty for non-series events. delete_event stays the only writer (owner-only, refuses once tickets sold).
// Run: node --test tests/delete-single-event.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = process.env.DS_ROOT || path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "create-event.html"), "utf8");

test("the Delete card exists, is hidden by default, and is shown only when editing a non-series event", () => {
  assert.match(html, /<div class="card" id="delCard" style="display:none">/);
  assert.match(html, /_dc\.style\.display=\(EDIT_SLUG && !SERIES\.length\)\?'block':'none'/);
  assert.equal((html.match(/getElementById\('delEventBtn'\)/g) || []).length, 1);
});
function load() {
  const src = html.match(/async function deleteThisEvent\(\)\{[\s\S]*?\n\}\n/)[0];
  const els = { delEventBtn: { disabled: false }, delMsg: { className: "", textContent: "" } };
  const calls = [];
  const ctx = { EDIT_SLUG: "my-night", $: (id) => els[id], confirm: () => ctx.__ok, __ok: true, location: { href: "" }, calls,
    supa: { rpc: async (n, a) => { calls.push([n, a]); return ctx.__res; } } };
  vm.createContext(ctx); vm.runInContext(src + "\nthis.run=deleteThisEvent;", ctx);
  return { ctx, els };
}
test("confirm then delete_event for this slug only, then back to the dashboard", async () => {
  const { ctx } = load(); ctx.__res = { data: { ok: true } };
  await ctx.run();
  assert.equal(JSON.stringify(ctx.calls), JSON.stringify([["delete_event", { p_slug: "my-night" }]]));
  assert.equal(ctx.location.href, "/dashboard");
});
test("negative controls: declining the confirm calls nothing; a server refusal shows its message and keeps the page", async () => {
  let t = load(); t.ctx.__ok = false; await t.ctx.run();
  assert.equal(t.ctx.calls.length, 0);
  t = load(); t.ctx.__res = { data: { error: "has_orders", message: "This event has sold tickets." } };
  await t.ctx.run();
  assert.equal(t.els.delMsg.textContent, "This event has sold tickets.");
  assert.equal(t.els.delEventBtn.disabled, false);
  assert.equal(t.ctx.location.href, "");
});
