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

test("publish migration is RPC-only, owner-scoped (submitted_by / owner_handle), payouts-gated, capped, and fails closed", () => {
  const code = sql.replace(/^\s*--.*$/gm, "");
  assert.match(code, /if uid is null then/);
  assert.match(code, /set search_path = ''/);
  assert.doesNotMatch(code, /set search_path = public/);
  assert.match(code, /function public\.kil_err\(p_code text, p_message text\)[\s\S]{0,160}set search_path = ''/);
  assert.match(code, /grant execute on function public\.kil_publish_own_event\(jsonb, jsonb\) to authenticated/);
  assert.match(code, /revoke all on function public\.kil_publish_own_event\(jsonb, jsonb\) from public, anon/);
  assert.match(code, /revoke all on function public\.kil_insert_event\(uuid, text, jsonb, jsonb, timestamptz, uuid\) from public, anon, authenticated/);
  assert.doesNotMatch(code, /grant execute on function public\.kil_publish_own_event\(jsonb, jsonb\) to anon/);
  assert.doesNotMatch(code, /create policy/i, "RPC-only: no owner insert/update policy and no table grant");
  assert.doesNotMatch(code, /grant (select|insert|update|delete|all)[^;]* on public\.(events|ticket_tiers)/i);
  assert.match(code, /payouts_required/); assert.match(code, /payouts_enabled/); assert.match(code, /public\.is_admin\(\)/);
  assert.match(code, /submitted_by = auth\.uid\(\)/); assert.match(code, /handle_required/);
  assert.match(code, /public\.event_orders/); assert.match(code, /qty_sold/);
  assert.doesNotMatch(code, /public\.orders|public\.tickets|event_tiers|information_schema|when others|to_regclass/i);
  assert.match(code, /events_apply_extras/); assert.match(code, /sales_start/); assert.match(code, /show_qty/); assert.match(code, /publish_limit/);
  assert.match(code, /drop policy if exists tiers_owner_insert on public\.ticket_tiers/);
  assert.doesNotMatch(code, /user_metadata|auth\.role\(\)/);
});

test("security definer functions use an empty search_path, hit rows are force-RLS, and members cannot write payout columns", () => {
  const files = ["20261127170000_self_serve_publish", "20261127171000_creator_promo", "20261127172000_owner_attendees", "20261127173000_connect_account"];
  for (const f of files) {
    const code = read("supabase/migrations/" + f + ".sql").replace(/^\s*--.*$/gm, "");
    assert.doesNotMatch(code, /set search_path = public/, f);
    for (const part of code.split(/security definer/i).slice(1)) assert.match(part.slice(0, 180), /set search_path = ''/, f);
  }
  const promo = read("supabase/migrations/20261127171000_creator_promo.sql");
  assert.match(promo, /alter table public\.event_link_hits force row level security/);
  assert.match(read("supabase/migrations/20261127171000_creator_promo.rollback.sql"), /no force row level security/);
  const connect = read("supabase/migrations/20261127173000_connect_account.sql");
  assert.match(connect, /revoke update \(payouts_enabled, stripe_account_id\) on table public\.app_users from public, anon, authenticated/);
  assert.match(connect, /kil_block_payout_columns/);
  assert.match(connect, /current_user in \('anon', 'authenticated'\)/);
  const rb = read("supabase/migrations/20261127173000_connect_account.rollback.sql");
  assert.match(rb, /drop trigger if exists kil_block_payout_columns/);
  assert.doesNotMatch(rb, /drop column/i);
});

test("every self-serve migration has a rollback; the Connect rollback never drops the existing stripe_account_id column; promo rollback keeps event_promo_codes", () => {
  for (const f of ["20261127170000_self_serve_publish", "20261127171000_creator_promo", "20261127172000_owner_attendees", "20261127173000_connect_account"]) assert.ok(fs.existsSync(path.join(ROOT, "supabase/migrations", f + ".rollback.sql")), f);
  const strip = (f) => read("supabase/migrations/" + f + ".rollback.sql").replace(/^\s*--.*$/gm, "");
  assert.doesNotMatch(strip("20261127173000_connect_account"), /drop column/i);
  assert.match(strip("20261127173000_connect_account"), /drop index if exists public\.app_users_stripe_account_id_idx/);
  assert.doesNotMatch(strip("20261127171000_creator_promo"), /drop table if exists public\.event_promo_codes/i);
  assert.match(strip("20261127170000_self_serve_publish"), /create policy tiers_owner_insert on public\.ticket_tiers/);
});

test("the create form says KEEPITIL never hosts cannabis events (and the calendar form too), and shows an RPC error message instead of ignoring it", () => {
  const NOTICE = /KEEPITIL does not host or sell tickets to cannabis events\. Cannabis events and businesses belong on <a href="https:\/\/findmyweedapp\.com" rel="noopener">Find My Weed<\/a>\./;
  assert.match(create, NOTICE); assert.match(read("submit-event.html"), NOTICE);
  assert.match(create, /var res=rc\.data\|\|\{\}; if\(res\.error\) throw new Error\(res\.message\|\|res\.error\)/);
  assert.match(create, /du\.message\|\|du\.error/); assert.match(create, /res2\.message\|\|res2\.error/);
  // NEGATIVE CONTROL: the old line that ignored a returned error would not match
  assert.doesNotMatch("var res=rc.data||{}; newSlug=res.slug||ev.slug;", /if\(res\.error\) throw/);
});
