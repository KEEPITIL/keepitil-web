// Self-serve publish: the form asks for published, the dashboard drops the review-queue copy,
// and the SQL migration is owner-scoped. Run: node --test tests/self-serve-publish.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const create = read("create-event.html");
const dash = read("dashboard.html");
const sql = read("supabase/migrations/20261127170000_self_serve_publish.sql");

test("create-event submits status published and does not describe a review queue", () => {
  assert.match(create, /status:'published'/);
  assert.doesNotMatch(create, /status:'review'/);
  assert.doesNotMatch(create, /Nothing publishes until/);
  assert.doesNotMatch(create, /Your event is in review/);
  assert.match(create, /rpcOr\('kil_publish_own_event'/);
  assert.match(create, /rpcOr\('kil_update_own_event'/);
  assert.match(create, /rpcOr\('kil_publish_own_series'/);
});

test("dashboard hosted-event empty state has no review-queue copy", () => {
  assert.doesNotMatch(dash, /reviewed before it goes live/);
  assert.doesNotMatch(dash, /Listings are reviewed before they go live/);
  assert.match(dash, /It goes live as soon as you submit it/);
});

test("publish migration is owner-scoped, not anon-writable, and keeps takedowns", () => {
  assert.match(sql, /if uid is null then/);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /set search_path = public/);
  assert.match(sql, /'taken_down'/);
  assert.match(sql, /with check \(%s\)/);
  assert.match(sql, /grant execute on function public\.kil_publish_own_event\(jsonb, jsonb\) to authenticated/);
  assert.match(sql, /revoke all on function public\.kil_publish_own_event\(jsonb, jsonb\) from public, anon/);
  assert.match(sql, /revoke all on function public\.kil_events_apply\(text, jsonb, jsonb\) from public, anon, authenticated/);
  assert.doesNotMatch(sql, /grant execute on function public\.kil_publish_own_event\(jsonb, jsonb\) to anon/);
  assert.doesNotMatch(sql, /user_metadata/);
  assert.doesNotMatch(sql, /auth\.role\(\)/);
});
