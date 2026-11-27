// Member control: unpublish / delete own submitted events (submit-event) and data export (settings).
// Runs the REAL handlers in a vm with a fake supabase client. Run: node --test tests/member-data-control.test.cjs
const test = require("node:test");
const __A = require("./helpers/event-assembled.cjs").assemble;
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = process.env.MD_ROOT || path.resolve(__dirname, "..");
const se = __A(fs.readFileSync(path.join(ROOT, "submit-event.html"), "utf8"));
const st = __A(fs.readFileSync(path.join(ROOT, "settings.html"), "utf8"));

function extract(src, name) {
  const start = src.indexOf("function " + name + "(");
  assert.ok(start > 0, name + " not found");
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i += 1) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error("unbalanced " + name);
}
function seBox(opts) {
  const calls = [], msg = { className: "", textContent: "" };
  const box = {
    $: () => msg, loadRecent: () => { calls.push("reload"); return Promise.resolve(); },
    window: { confirm: () => opts.confirm },
    supa: { rpc: (name, args) => { calls.push([name, args]); return Promise.resolve(opts.reply || { data: { ok: true } }); } },
  };
  vm.createContext(box);
  vm.runInContext("var MEMBER_LIVE=['published','review','sold_out'];\n" + extract(se, "memberFnMissing") + "\n" + extract(se, "memberAct"), box);
  return { box, calls, msg };
}
const row = { id: 7, title: "My Show" };
const tick = () => new Promise((r) => setImmediate(r));

test("declining the confirm dialog calls nothing", async () => {
  const { box, calls } = seBox({ confirm: false });
  box.memberAct("delete", row, { disabled: false });
  await tick();
  assert.equal(calls.length, 0);
});
test("delete and unpublish call their own owner-only function with the event id, then reload", async () => {
  for (const [act, fn, text] of [["delete", "delete_my_community_event", /deleted/], ["unpublish", "unpublish_my_community_event", /unpublished/]]) {
    const { box, calls, msg } = seBox({ confirm: true });
    box.memberAct(act, row, { disabled: false });
    await tick();
    assert.equal(JSON.stringify(calls[0]), JSON.stringify([fn, { p_id: 7 }]));
    assert.ok(calls.includes("reload"));
    assert.match(msg.textContent, text);
  }
});
test("server refusal (tickets sold) is shown and nothing reloads; missing function says not available yet", async () => {
  let t = seBox({ confirm: true, reply: { data: { ok: false, error: "has_sales", message: "Tickets have been sold" } } });
  t.box.memberAct("delete", row, { disabled: false });
  await tick();
  assert.match(t.msg.textContent, /Tickets have been sold/);
  assert.ok(!t.calls.includes("reload"));
  t = seBox({ confirm: true, reply: { error: { code: "PGRST202", message: "Could not find the function" } } });
  t.box.memberAct("unpublish", row, { disabled: false });
  await tick();
  assert.match(t.msg.textContent, /not available yet/);
  assert.ok(!t.calls.includes("reload"));
});
test("the list offers Unpublish only for live-ish statuses, Delete always", () => {
  assert.match(se, /MEMBER_LIVE\.indexOf\(e\.status\)>-1\?'<button[^']*data-act="unpublish"/);
  assert.match(se, /class="ed danger" data-act="delete"/);
  assert.match(se, /var MEMBER_LIVE=\['published','review','sold_out'\]/);
});
test("settings export: one call site, own filename, graceful when the function is missing", () => {
  assert.equal((st.match(/rpc\('export_my_data'\)/g) || []).length, 1);
  const box = {};
  vm.createContext(box);
  vm.runInContext(extract(st, "exportFileName"), box);
  assert.equal(box.exportFileName(new Date("2026-11-23T12:00:00Z")), "keepitil-my-data-2026-11-23.json");
  const fn = extract(st, "exportMyData");
  assert.match(fn, /PGRST202/);
  assert.match(fn, /Log in to download your data/);
  assert.match(st, /id="exp-go" type="button" data-click="exportMyData"/);
});
