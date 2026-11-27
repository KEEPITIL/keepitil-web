// The prerender must list EVERY published event, not the first 1000: on 2026-11-25 prod had 1,834 published events and the single `limit=1000` request (oldest first) left 834 of them
// (from 2026-12-04 on, e.g. /event/obscene-goth-industrial-ebm-darkwave-20261217/) without a page, so they answered 404 through the fallback.
// Run: node --test tests/event-prerender-paging.test.cjs   (dry runs: nothing is written)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = process.env.EPP_ROOT || path.resolve(__dirname, "..");
const TEMPLATE = fs.readFileSync(path.join(ROOT, "event.html"), "utf8");
const lib = () => import(path.join(ROOT, "scripts/build-event-pages.mjs"));
const os = require("node:os");

// a fake PostgREST: N published events ordered by (starts_at, slug); honours limit/offset; `maxRows` caps any response (Supabase's max-rows); `honourOffset:false` ignores offset
function server(N, { maxRows = 1000, honourOffset = true } = {}) {
  const all = Array.from({ length: N }, (_, i) => ({ slug: "ev-" + String(i).padStart(5, "0") + "-20270101" }));
  const calls = { list: [], rpc: [] };
  const fetchImpl = async (u, init) => {
    u = String(u);
    if (u.includes("/rest/v1/events?")) {
      calls.list.push(u);
      const q = new URL(u).searchParams, limit = Math.min(+q.get("limit") || maxRows, maxRows), off = honourOffset ? (+q.get("offset") || 0) : 0;
      return { ok: true, status: 200, json: async () => all.slice(off, off + limit) };
    }
    if (u.includes("/rpc/get_event_view")) {
      const slug = JSON.parse(init.body).p_slug; calls.rpc.push(slug);
      return { ok: true, status: 200, json: async () => [{ slug, title: "Show " + slug, venue: "V", city: "Los Angeles", starts_at: "2027-01-02T04:00:00+00:00", tz: "America/Los_Angeles", status: "published", genres: "house" }] };
    }
    throw new Error("unexpected " + u);
  };
  return { fetchImpl, calls, all };
}
async function run(srv) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pp-")); fs.writeFileSync(path.join(dir, "event.html"), TEMPLATE); require("./helpers/event-assembled.cjs").stage(dir);
  const { main } = await lib(), log = console.log; console.log = () => {};
  try { return await main(["--out", dir, "--dry"], srv.fetchImpl); } finally { console.log = log; fs.rmSync(dir, { recursive: true, force: true }); }
}

test("2,500 published events: every one is fetched and rendered (pages of 1000, offsets 0, 1000, 2000)", async () => {
  const s = server(2500), r = await run(s);
  assert.equal(r.same.length, 2500, "all 2500 rendered, not 1000");
  assert.equal(new Set(s.calls.rpc).size, 2500);
  assert.ok(s.calls.rpc.includes("ev-02499-20270101"), "the last event is covered");
  const offsets = s.calls.list.map((u) => +new URL(u).searchParams.get("offset"));
  assert.deepEqual(offsets.slice(0, 3), [0, 1000, 2000]);
  assert.match(s.calls.list[0], /order=starts_at,slug/, "a tiebreak keeps pages stable");
});
test("a server that caps responses below the page size (max-rows 500) still yields everything: a short page is not the last page", async () => {
  const s = server(1200, { maxRows: 500 });
  assert.equal((await run(s)).same.length, 1200);
});
test("NEGATIVE CONTROLS: a server that ignores offset cannot loop forever (stops when a page adds nothing new); the old single-request logic would have lost the tail", async () => {
  const s = server(1500, { honourOffset: false }), r = await run(s);
  assert.equal(r.same.length, 1000, "only what the server ever returned");
  assert.ok(s.calls.list.length <= 3, "stopped after the repeated page");
  const oldCount = Math.min(2500, 1000);   // what the old `limit=1000` request returned for the same 2,500 events
  assert.equal(oldCount, 1000); assert.ok((await run(server(2500))).same.length - oldCount === 1500, "1,500 events would have had no page");
});
test("an empty calendar and a failed list request behave: no pages, and the failure is an error (never a silent shrink)", async () => {
  assert.equal((await run(server(0))).same.length, 0);
  await assert.rejects(async () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pp-")); fs.writeFileSync(path.join(dir, "event.html"), TEMPLATE); require("./helpers/event-assembled.cjs").stage(dir); const { main } = await lib(); try { await main(["--out", dir, "--dry"], async () => ({ ok: false, status: 503 })); } finally { fs.rmSync(dir, { recursive: true, force: true }); } }, /events list failed: HTTP 503/);
});
