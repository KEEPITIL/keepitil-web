// My events list: uses get_my_events (paged, organizer + community, has_orders) and falls back to
// get_my_community_events until the server function exists. Runs the REAL loadRecent in a vm.
// Run: node --test tests/my-events-list.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = process.env.ME_ROOT || path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "submit-event.html"), "utf8");
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
function make(replies) {
  const calls = [], el = { innerHTML: "", querySelectorAll: () => [], addEventListener() {} };
  const box = {
    $: () => el, esc: (x) => String(x == null ? "" : x), console, startEdit() {}, memberAct() {},
    supa: { rpc: (n, a) => { calls.push(n + (a ? JSON.stringify(a) : "")); return Promise.resolve(replies[n]); } },
  };
  vm.createContext(box);
  vm.runInContext("var MEMBER_LIVE=['published','review','sold_out']; var RECENT=[];\n" + extract("memberFnMissing") + "\nvar RECENT_OFFSET=0, RECENT_PAGE=2;\n" + extract("loadRecent"), box);
  return { box, calls, el };
}
const ev = (o) => Object.assign({ id: 1, slug: "s", title: "T", venue: "V", city: "C", starts_at: null, status: "published", source: "community", has_orders: false }, o);

test("organizer rows link to create-event, community rows get edit/unpublish/delete, rows with orders hide Delete", async () => {
  const rows = [ev({ id: 1, title: "Mine" }), ev({ id: 2, source: "organizer", slug: "org-show", title: "Org" }), ev({ id: 3, has_orders: true, title: "Sold" })];
  const t = make({ get_my_events: { data: rows } });
  rows.length = 3; t.box.RECENT_PAGE = 2;
  await t.box.loadRecent();
  assert.match(t.el.innerHTML, /href="\/create-event\?e=org-show"/);
  const sold = t.el.innerHTML.split('<div class="rc">').find((h) => h.includes("Sold"));
  assert.ok(sold && !/data-act="delete"/.test(sold), "no Delete on a row with orders");
  assert.match(t.el.innerHTML.split('<div class="rc">').find((h) => h.includes("Mine")), /data-act="delete"/);
});
test("falls back to get_my_community_events when get_my_events is not deployed", async () => {
  const t = make({ get_my_events: { error: { code: "PGRST202", message: "Could not find the function" } }, get_my_community_events: { data: [ev({ source: undefined, title: "Old" })] } });
  await t.box.loadRecent();
  assert.deepEqual(t.calls.map((c) => c.split("{")[0]), ["get_my_events", "get_my_community_events"]);
  assert.match(t.el.innerHTML, /Old/);
  assert.doesNotMatch(t.el.innerHTML, /recentMore/);
});
test("a full page offers Show more and asks for the next offset", async () => {
  const t = make({ get_my_events: { data: [ev({ id: 1 }), ev({ id: 2 })] } });
  await t.box.loadRecent();
  assert.match(t.el.innerHTML, /id="recentMore"/);
  await t.box.loadRecent(true);
  assert.ok(t.calls.some((c) => c === 'get_my_events{"p_limit":2,"p_offset":2}'), t.calls.join("|"));
});
test("a real error (not a missing function) says so instead of showing nothing", async () => {
  const t = make({ get_my_events: { error: { code: "500", message: "boom" } } });
  await t.box.loadRecent();
  assert.match(t.el.innerHTML, /Could not load your events\. Try again\./);
  assert.deepEqual(t.calls.map((c) => c.split("{")[0]), ["get_my_events"]);
});
