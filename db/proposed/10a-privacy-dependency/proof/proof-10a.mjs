/* proof-10a.mjs - local PGlite proof for slice 10A (APPLY-1C grant narrowing + submitted_by + ROLLBACK-1C + ordering). NOTHING touches any hosted project.
   Stack under test (all verbatim from the packs / this slice): replica-91 + replica-92-add + replica-10a-add, then APPLY-1, APPLY-1B, APPLY-92, the #91 data steps, then 1C.
   Run:  PGLITE_DIR=$HOME/work/pgl-scratch node proof-10a.mjs      (exit 0 only if every positive check passes AND every negative control fails its named checks)
   What the replica stands in for: see proof/README-PROOF-10A.md. It is NOT production: PGlite is PostgreSQL 18 (prod is 17.6), roles are created by hand, the real policies of
   events/profile_content/applications and the real function bodies (get_event_view, claim_profile, get_profile_events) are stand-ins. */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
const HERE = dirname(fileURLToPath(import.meta.url)), DIR = join(HERE, ".."), ROOT = join(HERE, "..", "..", "..", "..");
const rd = (f) => readFileSync(join(DIR, f), "utf8"), up = (f) => readFileSync(join(DIR, "upstream", f), "utf8"), pr = (f) => readFileSync(join(HERE, f), "utf8");
let PGlite = null;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { if (process.env.PGLITE_DIR) ({ PGlite } = await import(pathToFileURL(join(process.env.PGLITE_DIR, "node_modules/@electric-sql/pglite/dist/index.js")).href)); }
if (!PGlite) { console.error("PGlite not importable; set PGLITE_DIR"); process.exit(3); }

const REPLICA = pr("replica-91.sql") + "\n" + pr("replica-92-add.sql") + "\n" + pr("replica-10a-add.sql");
const A1 = up("APPLY-1.sql"), A1B = up("APPLY-1B-kind-check.sql"), A2 = up("APPLY-2.sql"), A92 = up("APPLY-92.sql");
const C = rd("APPLY-1C-grant-narrowing_PROPOSED.sql"), RB = rd("ROLLBACK-1C_PROPOSED.sql"), A92_44 = rd("APPLY-92-44col_PROPOSED.sql"), R2X = rd("ROLLBACK-2-after-1C_PROPOSED.sql"), PRE = rd("PRECHECK-10A.sql");
const TUI = "4f1ff687-e287-496e-8eb4-c444f8e556d1", FOB = "d1ef5687-7410-4027-b94d-e4de393c27d9", ADM2 = "bbbbbbbb-0000-4000-8000-000000000001", HOUSE = "cccccccc-0000-4000-8000-000000000001", STR = "dddddddd-0000-4000-8000-000000000001";

const UPD14 = ["display_name", "handle", "location", "bio", "about", "links", "links_label", "socials", "avatar_url", "cover_url", "cover_mobile_url", "profile_public", "public_fields", "updated_at"];
const INS19 = ["slug", ...UPD14, "tagline", "pronouns", "book_email", "highlights"];
const A22 = ["slug", "display_name", "handle", "location", "bio", "tagline", "pronouns", "book_email", "about", "links", "links_label", "badges", "account_type", "status", "avatar_url", "cover_url", "cover_mobile_url", "socials", "highlights", "updated_at", "profile_public", "public_fields"];
const E45 = "accent_color,city,county,cover_url,created_at,dedupe_key,description,end_time_public,ends_at,extra_links,featured,features,gallery,genres,hide_guest_count,id,imported_at,link_checked_at,link_detail,link_last_ok_at,link_status,owner_handle,password_protected,reg_questions,review_reason,series_id,show_feed,show_gallery,show_lineup,show_on_explore,slug,source,source_url,spotify_url,starts_at,state,status,submitted_by,tagline,title,title_font,tz,venue,waitlist_enabled,youtube_url".split(",");
const E44 = E45.filter((c) => c !== "submitted_by");
const sorted = (a) => [...a].sort();
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

process.on("uncaughtException", (e) => { console.log("FATAL: " + String(e && e.message || e).slice(0, 400)); process.exit(2); });
const dbs = [];
async function world(...chain) { const db = new PGlite(); dbs.push(db); await db.exec(REPLICA); for (const s of chain) await db.exec(s); return db; }
async function as(db, role, sub, sql) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${sub || ""}', false); set role ${role};`);
  try { const r = await db.query(sql); return { rows: r.rows, fields: (r.fields || []).map((f) => f.name) }; } catch (e) { return { err: String(e.message || e) }; } finally { await db.exec("reset role"); }
}
const su = async (db, sql) => (await db.query(sql)).rows;
const denied = (r) => !!r.err && /permission denied/i.test(r.err);
const rlsDenied = (r) => !!r.err && /row-level security/i.test(r.err);
const results = []; const skipped = []; let current = null;
const check = async (id, name, fn) => { let ok = false, why = ""; try { const v = await fn(); ok = v === true; if (!ok) why = "returned " + JSON.stringify(v); } catch (e) { why = String(e.message || e); } results.push({ scen: current, id, name, ok, why }); };
const raises = async (db, sql, re) => { try { await db.exec(sql); return "did not raise"; } catch (e) { try { await db.exec("rollback"); } catch {} return re.test(String(e.message || e)) ? true : "raised: " + String(e.message || e).slice(0, 160); } };

// ---------- helpers
const SNAP_SQL = `select k, n, g, p from (
  select 'T' k, c.relname::text n, case a.grantee when 0 then 'PUBLIC' else pg_get_userbyid(a.grantee)::text end g, a.privilege_type p from pg_class c join pg_namespace ns on ns.oid=c.relnamespace, lateral aclexplode(c.relacl) a where ns.nspname='public' and c.relname in ('profile_meta','profile_owners','profile_content','events','applications')
  union all select 'C', c.relname||'.'||at.attname, case a.grantee when 0 then 'PUBLIC' else pg_get_userbyid(a.grantee)::text end, a.privilege_type from pg_attribute at join pg_class c on c.oid=at.attrelid join pg_namespace ns on ns.oid=c.relnamespace, lateral aclexplode(at.attacl) a where ns.nspname='public' and c.relname in ('profile_meta','profile_owners','profile_content','events','applications') and at.attnum>0 and not at.attisdropped and at.attacl is not null
  union all select 'F', p.oid::regprocedure::text, case a.grantee when 0 then 'PUBLIC' else pg_get_userbyid(a.grantee)::text end, a.privilege_type from pg_proc p, lateral aclexplode(p.proacl) a where p.oid = to_regprocedure('public.get_approved_profile(uuid,text)')) s order by 1,2,3,4`;
const snap = async (db) => JSON.stringify(await su(db, SNAP_SQL));
function stmts(sqlText) {   // PRECHECK file -> statements (comments stripped; split on ';' at end of line)
  const clean = sqlText.split("\n").map((l) => l.replace(/^\s*--.*$/, "").replace(/;\s*--.*$/, ";")).join("\n");
  return clean.split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);
}
const FP_STMT = stmts(PRE).find((s) => /^SELECT md5\(string_agg/.test(s));
const fp = async (db) => (await su(db, FP_STMT))[0].acl_fingerprint;
const colset = async (db, role, table, priv) => (await su(db, `select a.attname from pg_attribute a where a.attrelid='public.${table}'::regclass and a.attnum>0 and not a.attisdropped and has_column_privilege('${role}','public.${table}',a.attname,'${priv}') order by a.attname::text collate "C"`)).map((r) => r.attname);
const tp = async (db, role, table, priv) => (await su(db, `select has_table_privilege('${role}','public.${table}','${priv}') v`))[0].v;
const mutate = (sql, from, to, what) => { const o = sql.replace(from, to); if (o === sql) throw new Error("control not built: " + what); return o; };
const cut = (sql, startMarker, endMarker, what) => { const a = sql.indexOf(startMarker), b = sql.indexOf(endMarker, a); if (a < 0 || b < 0) throw new Error("cut not built: " + what); return sql.slice(0, a) + sql.slice(b); };
const noPost = (sql) => cut(sql, "-- ---------------------------------------------------------------- post-assert", "COMMIT;", "post-assert");
const noGuard = (sql) => cut(sql, "-- ---------------------------------------------------------------- drift guard", "-- ---------------------------------------------------------------- 1. profile_meta", "guard");

async function seedEvents(db) {
  await su(db, `insert into public.events(slug,title,status,starts_at,city,venue,owner_handle,owner_id,submitted_by,event_password_hash,password_protected) values
   ('t-up-1','Up 1','published', now()+interval '10 days','Los Angeles','V1','tuitea','${TUI}','${TUI}',null,false),
   ('t-draft','Draft','draft', now()+interval '13 days','Draft City','V4','tuitea','${TUI}','${TUI}',null,false),
   ('g-up','G up','published', now()+interval '9 days','Long Beach','V6','groove-trooper','${HOUSE}','${HOUSE}',null,false)`);
}
async function publicize(db) {   // the #91 data steps (ATTESTATION-BATCH A + B + owner opt-in)
  await as(db, "authenticated", ADM2, `select public.admin_set_account_age('${HOUSE}',true,'house')`);
  await as(db, "authenticated", ADM2, `select public.admin_move_house_page('groove-trooper','${HOUSE}')`);
  await as(db, "authenticated", TUI, `select public.admin_set_account_age('${TUI}',true,'founder_self','q','d')`);
  await as(db, "authenticated", TUI, "update public.profile_meta set profile_public=true, public_fields=array['display_name','bio','events'] where slug='tuitea'");
  await seedEvents(db);
}
const stackPre = async () => { const db = await world(A1, A1B, A92); await publicize(db); return db; };      // state immediately BEFORE 1C
const stackPost = async (c = C) => { const db = await stackPre(); await db.exec(c); return db; };                 // + 1C

const FULL_SAVE = `update public.profile_meta set display_name='N', handle='nova', location='L', bio='B', about='A', links='["https://x.test"]'::jsonb, links_label='LL', socials='{"instagram":"i"}'::jsonb,
  avatar_url='u', cover_url='c', cover_mobile_url='m', profile_public=true, public_fields=array['display_name','bio','events'], updated_at=now() where slug='tuitea' returning slug`;
const INSERT_FALLBACK = `insert into public.profile_meta(slug,display_name,handle,location,bio,about,links,links_label,socials,avatar_url,cover_url,cover_mobile_url,profile_public,public_fields,updated_at,tagline,pronouns,book_email,highlights)
  values ('newbie','Newbie','newbie','L','B',null,null,null,'{}'::jsonb,null,null,null,false,array[]::text[],now(),null,null,null,'[]'::jsonb) returning slug,status,account_type`;

// ---------- check groups (each takes a world in the post-1C state)
async function G_owner(db, t) {
  await check("OWN-1", `${t} owner saves all 14 columns the #129 form can send, on their own page`, async () => { const r = await as(db, "authenticated", TUI, FULL_SAVE); return r.rows?.length === 1 || JSON.stringify(r); });
  await check("OWN-2", `${t} owner saves one field (bio only), like #129 diff saves`, async () => { const r = await as(db, "authenticated", TUI, "update public.profile_meta set bio='only bio', updated_at=now() where slug='tuitea' returning slug"); return r.rows?.length === 1 || JSON.stringify(r); });
  await check("OWN-3", `${t} insert fallback (slug + 18 columns) for a newly approved owner works; status defaults to review, account_type stays NULL`, async () => {
    await su(db, `insert into public.profile_owners(profile_slug, owner_id) values ('newbie','${STR}')`);   // what approve_profile_claim does
    const r = await as(db, "authenticated", STR, INSERT_FALLBACK); return (r.rows?.length === 1 && r.rows[0].status === "review" && r.rows[0].account_type === null) || JSON.stringify(r); });
  await check("OWN-4", `${t} a non-owner updating someone else's page changes 0 rows`, async () => (await as(db, "authenticated", FOB, "update public.profile_meta set bio='hack' where slug='tuitea' returning slug")).rows?.length === 0);
}
async function G_deny(db, t) {
  const cols = { account_type: "'editorial_brand'", status: "'published'", admin_approved: "true", age_verified: "true", is_minor: "false", under_18: "false", entity_category: "'x'", sources: "'[]'::jsonb", last_reviewed_at: "now()", slug: "'tuitea2'" };
  for (const [c, v] of Object.entries(cols))
    await check(`DENY-${c}`, `${t} owner CANNOT update profile_meta.${c} (permission denied)`, async () => { const r = await as(db, "authenticated", TUI, `update public.profile_meta set ${c}=${v} where slug='tuitea'`); return denied(r) || JSON.stringify(r); });
  await check("DENY-ins-account_type", `${t} owner CANNOT insert account_type`, async () => { await su(db, `insert into public.profile_owners(profile_slug, owner_id) values ('p2','${STR}') on conflict do nothing`); return denied(await as(db, "authenticated", STR, "insert into public.profile_meta(slug,account_type) values ('p2','editorial_brand')")); });
  await check("DENY-ins-status", `${t} owner CANNOT insert status`, async () => denied(await as(db, "authenticated", STR, "insert into public.profile_meta(slug,status) values ('p2','published')")));
  await check("DENY-ins-flags", `${t} owner CANNOT insert any of the four server flags`, async () => { for (const c of ["admin_approved=true", "age_verified=true", "is_minor=false", "under_18=false"]) { const [k, v] = c.split("="); if (!denied(await as(db, "authenticated", STR, `insert into public.profile_meta(slug,${k}) values ('p2',${v})`))) return c; } return true; });
  await check("DENY-tripwire", `${t} columns the #129 form cannot send (tagline, pronouns, book_email, badges, highlights) are NOT UPDATE-able (tripwire if an editor returns)`, async () => {
    for (const c of ["tagline='x'", "pronouns='x'", "book_email='x@x.test'", "badges='[]'::jsonb", "highlights='[]'::jsonb"]) if (!denied(await as(db, "authenticated", TUI, `update public.profile_meta set ${c} where slug='tuitea'`))) return c; return true; });
  await check("COMPAT-legacy", `${t} the pre-#129 save (upsert with slug + account_type, as main/iOS bundle send) is refused: documented break`, async () =>
    denied(await as(db, "authenticated", TUI, "insert into public.profile_meta(slug,display_name,account_type,updated_at) values ('tuitea','T3','subscriber_profile',now()) on conflict (slug) do update set display_name=excluded.display_name, account_type=excluded.account_type, updated_at=excluded.updated_at")));
  await check("GRANTSET", `${t} authenticated column sets on profile_meta are exactly INSERT=19 and UPDATE=14; anon has none; no table-level write`, async () =>
    eq(await colset(db, "authenticated", "profile_meta", "INSERT"), sorted(INS19)) && eq(await colset(db, "authenticated", "profile_meta", "UPDATE"), sorted(UPD14))
    && (await colset(db, "anon", "profile_meta", "INSERT")).length === 0 && (await colset(db, "anon", "profile_meta", "UPDATE")).length === 0
    && !(await tp(db, "authenticated", "profile_meta", "UPDATE")) && !(await tp(db, "authenticated", "profile_meta", "INSERT")));
}
async function G_trunc(db, t) {
  await check("TRUNC-1", `${t} TRUNCATE denied for anon and authenticated on profile_meta, profile_owners, profile_content`, async () => {
    for (const role of ["anon", "authenticated"]) for (const tb of ["profile_meta", "profile_owners", "profile_content"]) { const r = await as(db, role, TUI, `truncate public.${tb}`); if (!denied(r)) return role + "/" + tb + " " + JSON.stringify(r); }
    return (await su(db, "select (select count(*) from public.profile_content)::int c, (select count(*) from public.profile_meta)::int m"))[0].c === 5; });
  await check("TRUNC-2", `${t} DELETE denied on profile_meta and profile_owners for both roles`, async () => {
    for (const role of ["anon", "authenticated"]) for (const tb of ["profile_meta", "profile_owners"]) if (!denied(await as(db, role, TUI, `delete from public.${tb}`))) return role + "/" + tb; return true; });
}
async function G_content(db, t) {
  await check("CONTENT-1", `${t} owner insert/update/delete OWN profile_content row still works (owner flows keep their DML)`, async () => {
    const i = await as(db, "authenticated", TUI, `insert into public.profile_content(profile_slug,kind,data,created_by) values ('tuitea','post','{"t":1}','${TUI}') returning id`);
    if (!i.rows?.length) return "insert " + JSON.stringify(i); const id = i.rows[0].id;
    const u = await as(db, "authenticated", TUI, `update public.profile_content set data='{"t":2}' where id='${id}' returning id`);
    const d = await as(db, "authenticated", TUI, `delete from public.profile_content where id='${id}' returning id`);
    return (u.rows?.length === 1 && d.rows?.length === 1) || JSON.stringify({ u, d }); });
  await check("CONTENT-2", `${t} a stranger cannot insert content onto someone else's profile (RLS) and anon cannot write at all (privilege)`, async () =>
    !!(await as(db, "authenticated", STR, `insert into public.profile_content(profile_slug,kind,data,created_by) values ('tuitea','post','{}','${STR}')`)).err

    && denied(await as(db, "anon", "", "insert into public.profile_content(profile_slug,kind) values ('tuitea','post')"))
    && denied(await as(db, "anon", "", "update public.profile_content set data='{}'")) && denied(await as(db, "anon", "", "delete from public.profile_content")));
  await check("CONTENT-3", `${t} profile_content stays world-readable (decision D13 is not changed by 1C)`, async () => (await as(db, "anon", "", "select count(*)::int c from public.profile_content")).rows?.[0]?.c >= 5);
}
async function G_priv(db, t) {
  await check("PRIV-1", `${t} REFERENCES / TRIGGER / TRUNCATE / MAINTAIN(PG17+) gone for anon + authenticated on the three tables; remaining DML is exactly what the flows need`, async () => {
    const v17 = (await su(db, "select current_setting('server_version_num')::int >= 170000 v"))[0].v;
    for (const role of ["anon", "authenticated"]) for (const tb of ["profile_meta", "profile_owners", "profile_content"]) for (const p of ["REFERENCES", "TRIGGER", "TRUNCATE", ...(v17 ? ["MAINTAIN"] : [])]) if (await tp(db, role, tb, p)) return `${role} ${tb} ${p}`;
    const want = { authenticated: { profile_meta: "SELECT", profile_owners: "SELECT", profile_content: "SELECT,INSERT,UPDATE,DELETE" }, anon: { profile_meta: "SELECT", profile_owners: "", profile_content: "SELECT" } };
    for (const role of Object.keys(want)) for (const [tb, privs] of Object.entries(want[role])) for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE"]) { const should = privs.split(",").includes(p); if ((await tp(db, role, tb, p)) !== should) return `${role} ${tb} ${p} expected ${should}`; }
    return true; });
  await check("PRIV-2", `${t} owners can still read their own profile_owners row; strangers see none; i_own_profile works`, async () =>
    (await as(db, "authenticated", TUI, "select profile_slug from public.profile_owners")).rows?.length === 1 && (await as(db, "authenticated", "99999999-0000-4000-8000-000000000009", "select profile_slug from public.profile_owners")).rows?.length === 0
    && (await as(db, "authenticated", TUI, "select public.i_own_profile('tuitea') v")).rows?.[0]?.v === true);
}
async function G_events(db, t) {
  await check("EV-1", `${t} events: anon + authenticated read exactly the 44 columns (45 minus submitted_by); submitted_by and the hash are denied; no table-level SELECT`, async () => {
    for (const role of ["anon", "authenticated"]) {
      if (!eq(await colset(db, role, "events", "SELECT"), sorted(E44))) return role + " " + JSON.stringify(await colset(db, role, "events", "SELECT"));
      if (await tp(db, role, "events", "SELECT")) return role + " table-level";
      for (const q of ["select submitted_by from public.events", "select event_password_hash from public.events", "select * from public.events"]) if (!denied(await as(db, role, STR, q))) return role + " " + q;
      if ((await as(db, role, STR, `select ${E44.join(",")} from public.events`)).err) return role + " cannot read the 44";
    } return true; });
  await check("EV-2", `${t} an events RLS policy that references submitted_by keeps working (policy quals need no column privilege): the submitter sees their own draft, others do not`, async () =>
    (await as(db, "authenticated", TUI, "select slug from public.events where slug='t-draft'")).rows?.length === 1 && (await as(db, "authenticated", STR, "select slug from public.events where slug='t-draft'")).rows?.length === 0 && (await as(db, "anon", "", "select slug from public.events where slug='t-draft'")).rows?.length === 0);
  await check("EV-3", `${t} a SECURITY DEFINER reader of submitted_by (get_event_view stand-in) still works for anon`, async () => { const r = await as(db, "anon", "", "select * from public.get_event_view('t-up-1')"); return (r.rows?.length === 1 && r.rows[0].has_submitter === true) || JSON.stringify(r); });
}
async function G_rpc(db, t) {
  await check("RPC-1", `${t} anon still reads the public profile through get_public_profile and the directory through public_profile_list`, async () =>
    (await as(db, "anon", "", "select slug from public.get_public_profile('tuitea')")).rows?.length === 1 && (await as(db, "anon", "", "select slug from public.public_profile_list()")).rows?.map((r) => r.slug).includes("groove-trooper"));
  await check("RPC-2", `${t} get_profile_event_summary still answers anon for a public profile with 'events' on; the organiser's draft is not counted`, async () => { const r = await as(db, "anon", "", "select * from public.get_profile_event_summary('tuitea')"); return (r.rows?.length === 1 && r.rows[0].organizer === "tuitea") || JSON.stringify(r); });
  await check("PROFILES-1", `${t} public.profiles view: SELECT denied to anon + authenticated; get_approved_profile EXECUTE denied to anon + authenticated (no caller exists on this project)`, async () =>
    denied(await as(db, "anon", "", "select * from public.profiles")) && denied(await as(db, "authenticated", STR, "select * from public.profiles"))
    && denied(await as(db, "anon", "", "select * from public.get_approved_profile(null,'tuitea')")) && denied(await as(db, "authenticated", STR, "select * from public.get_approved_profile(null,'tuitea')"))
    && !(await as(db, "anon", "", "select * from public.get_public_profile('tuitea')")).err);
  await check("BOOK-1", `${t} (information) 1C alone does NOT close book_email: anon can still read profile_meta.book_email until APPLY-2`, async () => (await as(db, "anon", "", "select book_email from public.profile_meta")).rows?.length >= 4);
}
const ALL_GROUPS = [G_owner, G_deny, G_trunc, G_content, G_priv, G_events, G_rpc];
async function runAll(db, tag) { for (const g of ALL_GROUPS) await g(db, tag); }

// ================================================================= scenarios
const POS = [];
current = "S1 stack: APPLY-1 + 1B + 92 + data steps, then 1C";
const pre = await stackPre();
const preSnap = await snap(pre), preFp = await fp(pre);
await check("PRE-state", "before 1C the replica is the documented APPLY-1+92 state: authenticated INSERT=UPDATE=the 22 columns (incl account_type/status), events 45 readable, profile_content has ALL", async () =>
  eq(await colset(pre, "authenticated", "profile_meta", "INSERT"), sorted(A22)) && eq(await colset(pre, "authenticated", "profile_meta", "UPDATE"), sorted(A22)) && eq(await colset(pre, "anon", "events", "SELECT"), sorted(E45))
  && (await tp(pre, "anon", "profile_content", "TRUNCATE")) && (await tp(pre, "authenticated", "profile_content", "TRUNCATE")) && (await tp(pre, "authenticated", "profile_meta", "REFERENCES")));
await check("PRE-legacy", "before 1C the legacy save (account_type via upsert) works for the owner (this is why 1C comes after the #129 web)", async () => !(await as(pre, "authenticated", TUI, "insert into public.profile_meta(slug,display_name,account_type,updated_at) values ('tuitea','T3','subscriber_profile',now()) on conflict (slug) do update set display_name=excluded.display_name, account_type=excluded.account_type, updated_at=excluded.updated_at")).err);
const w1 = await stackPost();
await runAll(w1, "1C");
await check("IDEM-1", "1C applied twice: no error, privilege snapshot identical", async () => { const a = await snap(w1); await w1.exec(C); return a === (await snap(w1)); });

current = "S2 trigger-set status survives the narrowing (F3-style trigger stand-in)";
{ const w = await stackPre(); await w.exec(`create function public.zz_reset_review() returns trigger language plpgsql as $$ begin
    if tg_op='UPDATE' and old.status='published' and (new.bio is distinct from old.bio or new.display_name is distinct from old.display_name) and current_user not in ('postgres','service_role') then
      new.status := 'review'; new.sources := '[]'::jsonb; new.last_reviewed_at := null; end if; return new; end $$;
    create trigger zz_reset_review before update on public.profile_meta for each row execute function public.zz_reset_review();`);
  await w.exec(C);
  await check("TRIG-1", "an owner edit of a published page is sent back to review by a BEFORE trigger even though the owner holds no UPDATE on status/sources/last_reviewed_at (the F3 gate and 1C compose)", async () => {
    const r = await as(w, "authenticated", TUI, "update public.profile_meta set bio='edited' where slug='tuitea' returning slug"); const s = (await su(w, "select status, last_reviewed_at is null as cleared from public.profile_meta where slug='tuitea'"))[0];
    return (r.rows?.length === 1 && s.status === "review" && s.cleared === true) || JSON.stringify({ r, s }); }); }

current = "S3 drift guard and ordering guard";
{ const g = async (mut, re, label, id) => { const w = await stackPre(); await w.exec(mut); const before = await snap(w); const res = await raises(w, C, re); const same = before === (await snap(w));
    await check(id, `1C refuses (and changes nothing) when ${label}`, async () => (res === true && same) || JSON.stringify({ res, same })); };
  await g("grant update (entity_category) on public.profile_meta to authenticated", /1C guard: authenticated column-UPDATE/, "authenticated holds UPDATE on an extra profile_meta column (entity_category)", "GUARD-extra-col");
  await g("grant update on public.profile_meta to authenticated", /TABLE-level UPDATE/, "authenticated has table-wide UPDATE on profile_meta", "GUARD-table-wide");
  await g("grant insert (admin_approved) on public.profile_meta to authenticated", /server flag|column-INSERT/, "a server flag is INSERT-able", "GUARD-flag");
  await g("grant select (event_password_hash) on public.events to anon", /neither the 45 nor the 44/, "anon can read an extra events column (the hash)", "GUARD-events-extra");
  await g("revoke select (owner_handle) on public.events from anon", /neither the 45 nor the 44/, "an events column was already removed (not the 45 or 44 set)", "GUARD-events-missing");
  await g("create policy anon_w on public.profile_content for insert to anon with check (true)", /write policy on public.profile_content applies to anon/, "a profile_content write policy admits anon", "GUARD-anon-policy");
  await g("grant select on public.profile_content to public", /PUBLIC privilege/, "a PUBLIC privilege exists on a target table", "GUARD-public");
  await g("grant truncate on public.profile_owners to authenticated", /holds TRUNCATE on public.profile_owners|client role holds/, "authenticated holds TRUNCATE on profile_owners", "GUARD-owners");
  const w0 = await world(); const r0 = await raises(w0, C, /APPLY-1 is not applied/);
  await check("GUARD-order", "1C refuses before APPLY-1 (private.profile_is_public missing)", async () => r0); }

current = "S4 ordering: 1C before #92 (44-col variant) vs the stale-baseline abort";
{ const wA = await stackPost();                                   // main order: 92 (45) then 1C
  const wB = await world(A1, A1B); await publicize(wB); await wB.exec(C); await wB.exec(A92_44);   // alternate: 1C then 92-44
  await check("ORD-alt", "alternate order (APPLY-1, 1C, then APPLY-92-44col) ends in the SAME privilege state as APPLY-1, APPLY-92, 1C", async () => (await snap(wA)) === (await snap(wB)));
  await check("ORD-alt-events", "alternate order: events readable = the 44 columns for both roles", async () => eq(await colset(wB, "anon", "events", "SELECT"), sorted(E44)) && eq(await colset(wB, "authenticated", "events", "SELECT"), sorted(E44)));
  const wC = await world(A1, A1B); await publicize(wC); await wC.exec(C);
  await check("ORD-stale", "STALE BASELINE: the stock APPLY-92 (45-column guard) refuses after 1C, nothing changes (this is why the 44-col variant exists)", async () => { const b = await snap(wC); const r = await raises(wC, A92, /events guard: .* column SELECT set differs from the 45 expected/); return (r === true && b === (await snap(wC))) || r; });
  await check("ORD-44-before-1C", "the 44-col variant refuses BEFORE 1C (guard expects 44; live is 45)", async () => { const w = await world(A1, A1B); return await raises(w, A92_44, /events guard: .* differs from the 44 expected/); }); }

{ const w = await stackPost(); await w.exec(A1);
  await check("RERUN-A1", "HAZARD (documented): re-running APPLY-1 after 1C re-grants account_type/status to owners, because APPLY-1 is not 1C-aware. Never re-run APPLY-1 after 1C; re-run 1C if you must", async () =>
    !(await as(w, "authenticated", TUI, "update public.profile_meta set account_type='editorial_brand' where slug='tuitea'")).err);
  await w.exec(C);
  await check("RERUN-A1-fix", "...and re-running 1C afterwards narrows them again", async () => denied(await as(w, "authenticated", TUI, "update public.profile_meta set account_type='editorial_brand' where slug='tuitea'"))); }

current = "S5 APPLY-2 composition and ROLLBACK-2-after-1C";
{ const w = await stackPost(); await w.exec(A2); const g = await snap(w);
  await check("COMP-1", "APPLY-2 after 1C leaves the narrowed grants untouched (INSERT=19, UPDATE=14) and the owner save still works", async () =>
    eq(await colset(w, "authenticated", "profile_meta", "INSERT"), sorted(INS19)) && eq(await colset(w, "authenticated", "profile_meta", "UPDATE"), sorted(UPD14)) && !!(await as(w, "authenticated", TUI, FULL_SAVE)).rows?.length);
  await check("BOOK-2", "after 1C + APPLY-2: anon cannot read profile_meta (book_email closed), the owner reads their own book_email, and cannot read another owner's row", async () =>
    denied(await as(w, "anon", "", "select book_email from public.profile_meta")) && denied(await as(w, "anon", "", "select slug from public.profile_meta"))
    && (await as(w, "authenticated", TUI, "select book_email from public.profile_meta")).rows?.length === 1);
  await w.exec(R2X);
  await check("RB2-x", "ROLLBACK-2-after-1C restores anon SELECT + the open read policies but does NOT re-grant account_type/status to owners", async () =>
    !(await as(w, "anon", "", "select slug from public.profile_meta")).err && denied(await as(w, "authenticated", TUI, "update public.profile_meta set account_type='editorial_brand' where slug='tuitea'")) && (await snap(w)) === (await snap(await stackPost())) || "mismatch");
  const w2 = await stackPost(); await w2.exec(A2); await w2.exec(up("ROLLBACK-2.sql"));
  await check("RB2-stock", "NEGATIVE-BY-DESIGN: the STOCK ROLLBACK-2 after 1C re-grants account_type/status to owners (undoes the narrowing): that is why ROLLBACK-2-after-1C exists", async () =>
    !(await as(w2, "authenticated", TUI, "update public.profile_meta set account_type='editorial_brand' where slug='tuitea'")).err); }

current = "S6 ROLLBACK-1C";
{ const w = await stackPost(); const filled = RB.replaceAll("{{PRE_1C_FINGERPRINT}}", preFp);
  await check("RB-unfilled", "rollback with the placeholder unfilled aborts and changes nothing", async () => { const b = await snap(w); const r = await raises(w, RB, /do not equal the saved pre-1C fingerprint/); return (r === true && b === (await snap(w))) || r; });
  await check("RB-wrongfp", "rollback with a wrong fingerprint aborts and changes nothing", async () => { const b = await snap(w); const r = await raises(w, RB.replaceAll("{{PRE_1C_FINGERPRINT}}", "0".repeat(32)), /do not equal/); return (r === true && b === (await snap(w))) || r; });
  await w.exec(filled);
  await check("RB-1", "rollback restores the EXACT pre-1C privileges (table, column and function ACLs identical) and the fingerprint equals the saved one", async () => (await snap(w)) === preSnap && (await fp(w)) === preFp);
  await check("RB-2", "after rollback the legacy save works again and TRUNCATE/submitted_by/get_approved_profile are back to their pre-1C state", async () =>
    !(await as(w, "authenticated", TUI, "insert into public.profile_meta(slug,display_name,account_type,updated_at) values ('tuitea','T3','subscriber_profile',now()) on conflict (slug) do update set display_name=excluded.display_name, account_type=excluded.account_type, updated_at=excluded.updated_at")).err
    && (await tp(w, "authenticated", "profile_content", "TRUNCATE")) && !(await as(w, "anon", "", "select submitted_by from public.events limit 1")).err && !(await as(w, "anon", "", "select * from public.get_approved_profile(null,'tuitea')")).err);
  await check("RB-idem", "rollback is idempotent (second run: same snapshot, no error)", async () => { await w.exec(filled); return (await snap(w)) === preSnap; });
  const wx = await stackPost(); await wx.exec(A2);
  await check("RB-after-APPLY2", "rollback after APPLY-2 refuses (fingerprint differs: anon SELECT gone) and points at ROLLBACK-2-after-1C first", async () => { const b = await snap(wx); const r = await raises(wx, filled, /do not equal the saved pre-1C fingerprint/); return (r === true && b === (await snap(wx))) || r; }); }

current = "S7 PRECHECK-10A runs read-only on the replica";
{ const w = await stackPost(); const all = stmts(PRE); let bad = []; await w.exec("begin transaction read only");
  for (const s of all) { try { await w.query(s); } catch (e) { bad.push(String(e.message).slice(0, 100) + " <= " + s.slice(0, 60)); } }
  await w.exec("rollback");
  await check("PRE-10A-runs", `all ${all.length} PRECHECK-10A statements parse and run inside a READ ONLY transaction`, async () => bad.length === 0 || bad.join(" | "));
  await check("PRE-10A-fp", "block H fingerprint is stable across runs and differs between pre-1C and post-1C", async () => (await fp(w)) === (await fp(w)) && (await fp(w)) !== preFp);
  const E = stmts(PRE).find((s) => s.includes("AS assigns_account_type_or_status")); const rows = E ? await su(w, E) : [];
  await check("PRE-10A-writers", "block E finds the profile_meta writers (admin_set_account_age, admin_move_house_page, set_profile_admin_approved, claim_profile) and flags none as assigning account_type/status", async () => {
    const names = rows.map((r) => String(r.signature).replace(/\(.*/, "")); return ["admin_set_account_age", "admin_move_house_page", "set_profile_admin_approved", "claim_profile"].every((n) => names.includes(n)) && rows.every((r) => r.assigns_account_type_or_status === false) || JSON.stringify(rows.map((r) => [r.signature, r.assigns_account_type_or_status])); }); }

current = "S8 grants vs the #129 owner save (static)";
{ let src = null, test = null;
  try { src = execSync("git -C \"" + ROOT + "\" show origin/draft/10b-noop-save:profile.html", { encoding: "utf8", maxBuffer: 1 << 26 }); test = execSync("git -C \"" + ROOT + "\" show origin/draft/10b-noop-save:assets/js/profile-noop-save.test.mjs", { encoding: "utf8", maxBuffer: 1 << 26 }); } catch { /* not available */ }
  if (!src) skipped.push("S8 static #129 checks (origin/draft/10b-noop-save not fetchable here)");
  else {
    const a = src.indexOf("function epBuildMeta"), b = src.indexOf("function openEditProfile", a), fn = src.slice(a, b);
    const allowed = [...(/const ALLOWED = new Set\(\[([^\]]*)\]/.exec(test) || [, ""])[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    const never = [...(/const NEVER = \[([^\]]*)\]/.exec(test) || [, ""])[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    const putKeys = [...fn.matchAll(/put\('([a-z_]+)'/g)].map((m) => m[1]), fullKeys = [...fn.matchAll(/full\.([a-z_]+)\s*=/g)].map((m) => m[1]), loopKeys = [...(/\['tagline','pronouns','book_email'\]/.test(fn) ? ["tagline", "pronouns", "book_email"] : [])];
    const conditional = new Set(["tagline", "pronouns", "book_email", "badges", "highlights"]);
    await check("STATIC-1", "#129 test ALLOWED set (the update keys the real form can emit) == the 14 UPDATE grants", async () => eq(sorted(allowed), sorted(UPD14)) || JSON.stringify({ allowed }));
    await check("STATIC-2", "every key the #129 builder can put in an INSERT fallback (slug + put()/full.* keys) is INSERT-granted, except the badges editor (no such control is rendered)", async () => {
      const keys = new Set(["slug", ...putKeys, ...fullKeys, ...loopKeys]); const missing = [...keys].filter((k) => !INS19.includes(k) && k !== "badges"); return missing.length === 0 || JSON.stringify(missing); });
    await check("STATIC-3", "the controls behind the conditional keys (epTag, epPro, epBook, epHls, .epBadge) are NOT rendered by #129's form, so the strict UPDATE set loses no live field", async () => !/id=["']epTag["']|id=["']epPro["']|id=["']epBook["']|id=["']epHls["']|class=["'][^"']*\bepBadge\b/.test(src));
    await check("STATIC-4", "#129 NEVER list (account_type, status, sources, last_reviewed_at, the 4 flags, slug on update) is disjoint from the UPDATE grants", async () => never.filter((k) => !["badges", "highlights", "tagline", "pronouns", "book_email"].includes(k)).every((k) => !UPD14.includes(k)) && never.length > 8);
    await check("STATIC-5", "#129 sends nothing to profile_meta that is not in the INSERT 19 / UPDATE 14 sets; account_type/status are never written by profile.html", async () => !/account_type\s*:\s*\(?document|status\s*:\s*['"]published/.test(fn)); } }

// ================================================================= negative controls
console.log("... negative controls");
const NEG = [];
async function negative(id, why, world_, expectFail) {
  current = "NEG " + id; const before = results.length; const w = await world_(); for (const g of ALL_GROUPS) await g(w, "ctl");
  const mine = results.slice(before); results.splice(before);
  const failed = mine.filter((r) => !r.ok).map((r) => r.id); const caught = expectFail.filter((x) => failed.includes(x));
  NEG.push({ id, why, expect: expectFail, failed, ok: caught.length === expectFail.length });
}
await negative("N1", "1C leaves account_type UPDATE-able (grant list keeps it)", () => stackPost(noPost(mutate(C, "GRANT UPDATE (display_name,", "GRANT UPDATE (account_type, display_name,", "N1"))), ["DENY-account_type", "GRANTSET"]);
await negative("N2", "1C forgets TRUNCATE on profile_content", () => stackPost(noPost(mutate(C, "REVOKE REFERENCES, TRIGGER, TRUNCATE ON TABLE public.profile_content FROM anon, authenticated, PUBLIC;", "REVOKE REFERENCES, TRIGGER ON TABLE public.profile_content FROM anon, authenticated, PUBLIC;", "N2"))), ["TRUNC-1", "PRIV-1"]);
await negative("N3", "1C leaves events.submitted_by readable", () => stackPost(noPost(mutate(C, "REVOKE SELECT (submitted_by) ON TABLE public.events FROM anon, authenticated, PUBLIC;", "", "N3"))), ["EV-1"]);
await negative("N4", "table-wide UPDATE shortcut instead of the column list", () => stackPost(noPost(mutate(C, "GRANT UPDATE (display_name, handle, location, bio, about, links, links_label, socials, avatar_url, cover_url, cover_mobile_url, profile_public, public_fields, updated_at)\n  ON TABLE public.profile_meta TO authenticated;", "GRANT UPDATE ON TABLE public.profile_meta TO authenticated;", "N4"))), ["DENY-account_type", "DENY-status", "DENY-admin_approved", "DENY-is_minor", "GRANTSET"]);
await negative("N5", "over-revocation: 1C also removes the owner's INSERT/DELETE on profile_content", () => stackPost(noPost(mutate(C, "REVOKE INSERT, UPDATE, DELETE        ON TABLE public.profile_content FROM anon, PUBLIC;", "REVOKE INSERT, UPDATE, DELETE        ON TABLE public.profile_content FROM anon, PUBLIC;\nREVOKE INSERT, DELETE ON TABLE public.profile_content FROM authenticated;", "N5"))), ["CONTENT-1", "PRIV-1"]);
await negative("N6", "1C leaves get_approved_profile executable", () => stackPost(noPost(mutate(C, "REVOKE ALL ON FUNCTION public.get_approved_profile(uuid, text) FROM PUBLIC, anon, authenticated;", "PERFORM 1;", "N6"))), ["PROFILES-1"]);
await negative("N7", "1C forgets REFERENCES/TRIGGER on profile_owners", () => stackPost(noPost(mutate(C, "REVOKE REFERENCES, TRIGGER, TRUNCATE ON TABLE public.profile_owners  FROM anon, authenticated, PUBLIC;", "", "N7"))), ["PRIV-1"]);
await negative("N13", "1C forgets the PostgreSQL 17+ MAINTAIN revoke (APPLY-1's REVOKEs leave it behind)", () => stackPost(noPost(mutate(C, "EXECUTE 'REVOKE MAINTAIN ON TABLE public.profile_meta, public.profile_owners, public.profile_content FROM anon, authenticated, PUBLIC';", "NULL;", "N13"))), ["PRIV-1"]);
await negative("N8", "guard removed AND the live state has drifted (authenticated already holds UPDATE on entity_category)", async () => { const w = await stackPre(); await w.exec("grant update (entity_category) on public.profile_meta to authenticated"); await w.exec(noPost(noGuard(C))); return w; }, ["GRANTSET"]);
await negative("N9", "1C leaves slug UPDATE-able (copy of the old upsert grant)", () => stackPost(noPost(mutate(C, "GRANT UPDATE (display_name,", "GRANT UPDATE (slug, display_name,", "N9"))), ["DENY-slug", "GRANTSET"]);
// rollback controls: a rollback that forgets the column grants / has no fingerprint check must fail RB-1
{ current = "NEG N10"; const w = await stackPost(); const bad = cut(mutate(RB, "GRANT INSERT (slug, display_name, handle, location, bio, tagline, pronouns, book_email, about, links, links_label, badges, account_type, status, avatar_url, cover_url, cover_mobile_url, socials, highlights, updated_at, profile_public, public_fields)\n  ON TABLE public.profile_meta TO authenticated;", "", "N10"), "-- proof of an exact restore", "COMMIT;", "fp");
  await w.exec(bad); const same = (await snap(w)) === preSnap; NEG.push({ id: "N10", why: "rollback forgets the INSERT column re-grant and has no fingerprint check", expect: ["RB-1"], failed: same ? [] : ["RB-1"], ok: !same }); }
{ current = "NEG N11"; const w = await stackPost(); const bad = cut(mutate(RB, "GRANT ALL ON TABLE public.profile_content TO anon, authenticated;", "", "N11"), "-- proof of an exact restore", "COMMIT;", "fp");
  await w.exec(bad); const same = (await snap(w)) === preSnap; NEG.push({ id: "N11", why: "rollback forgets profile_content ALL and has no fingerprint check", expect: ["RB-1"], failed: same ? [] : ["RB-1"], ok: !same }); }
{ current = "NEG N12"; const w = await stackPost(); await w.exec(A2);
  let r = "applied"; try { await w.exec(RB.replaceAll("{{PRE_1C_FINGERPRINT}}", preFp)); } catch { r = "refused"; try { await w.exec("rollback"); } catch {} }
  NEG.push({ id: "N12", why: "rollback run on a database where APPLY-2 followed 1C (must be refused by the fingerprint, not silently mix states)", expect: ["RB-after-APPLY2"], failed: r === "refused" ? [] : ["RB-after-APPLY2"], ok: r === "refused" }); }

// ================================================================= report
const pass = results.filter((r) => r.ok).length, fail = results.filter((r) => !r.ok);
let lastScen = null;
for (const r of results) { if (r.scen !== lastScen) { console.log("\n== " + r.scen); lastScen = r.scen; } console.log((r.ok ? "PASS " : "FAIL ") + r.id.padEnd(22) + r.name + (r.ok ? "" : "\n      -> " + r.why)); }
console.log("\n== negative controls (each mutated 1C / rollback must FAIL its named checks)");
for (const n of NEG) console.log((n.ok ? "CAUGHT " : "MISSED ") + n.id.padEnd(4) + n.why + "   expected-to-fail: " + n.expect.join(",") + (n.id.match(/N1[012]/) ? "" : "   failed: " + n.failed.length + " checks incl " + n.expect.filter((x) => n.failed.includes(x)).join(",")));
for (const s of skipped) console.log("SKIP " + s);
console.log(`\npositive checks: ${pass}/${results.length} pass; negative controls: ${NEG.filter((n) => n.ok).length}/${NEG.length} caught; skipped groups: ${skipped.length}`);
for (const d of dbs) { try { await d.close(); } catch {} }
process.exit(fail.length === 0 && NEG.every((n) => n.ok) ? 0 : 1);
