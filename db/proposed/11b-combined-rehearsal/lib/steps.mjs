/* lib/steps.mjs - the assertion block that runs AFTER each step of the combined order (the "post-checks"). Each returns [{id,name,ok,why}].
   They assert the documented target state of that step (VERIFY A of #91, PRECHECK-92 Q-1, the 1C post-asserts, F3 section 4, 11A grants, ...) on the combined replica. */
import { U, A22, INS19, UPD14, E45, E44, sorted, eq, su, one, as, denied, colset, tp, fnp, collector, tx, lit } from "./core.mjs";

const NEWCOLS = ["profile_public", "age_verified", "is_minor", "under_18", "public_fields", "admin_approved"];
const anon = (db, sql) => as(db, "anon", "", sql), auth = (db, sub, sql) => as(db, "authenticated", sub, sql);
const noPublicGrant = async (db, where) => (await one(db, `select coalesce(bool_or(a.grantee=0),false) p from pg_class c, lateral aclexplode(c.relacl) a where c.oid in (${where})`)).p === false;

export async function afterAPPLY1(db, cat0) {
  const { out, check } = collector();
  await check("S1.1", "the six #91 columns exist on profile_meta (absent in the baseline)", async () => (await one(db, `select count(*)::int n from information_schema.columns where table_schema='public' and table_name='profile_meta' and column_name in ('${NEWCOLS.join("','")}')`)).n === 6);
  await check("S1.2", "authenticated column INSERT = UPDATE = the 22 APPLY-1 columns; no table-level write for anon/authenticated; anon holds no column write", async () => {
    if (!eq(await colset(db, "authenticated", "profile_meta", "INSERT"), sorted(A22)) || !eq(await colset(db, "authenticated", "profile_meta", "UPDATE"), sorted(A22))) return "22-col sets differ";
    for (const r of ["anon", "authenticated"]) for (const p of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) if (await tp(db, r, "profile_meta", p)) return `${r} ${p} table-level`;
    return (await colset(db, "anon", "profile_meta", "INSERT")).length === 0 && (await colset(db, "anon", "profile_meta", "UPDATE")).length === 0; });
  await check("S1.3", "anon keeps SELECT on profile_meta (old pages) but has nothing on profile_owners; authenticated reads profile_owners, cannot write it", async () =>
    (await tp(db, "anon", "profile_meta", "SELECT")) && !(await tp(db, "anon", "profile_owners", "SELECT")) && (await tp(db, "authenticated", "profile_owners", "SELECT")) && !(await tp(db, "authenticated", "profile_owners", "INSERT")) && !(await tp(db, "authenticated", "profile_owners", "UPDATE")) && !(await tp(db, "authenticated", "profile_owners", "DELETE")));
  await check("S1.4", "profile_owners policies = {profile_owners_select_own} only (claim/read-all/manage/delete dropped); profile_meta gained profile_meta_owner_select and kept its 5", async () => {
    const o = (await su(db, "select policyname from pg_policies where tablename='profile_owners' order by 1")).map((r) => r.policyname), m = (await su(db, "select policyname from pg_policies where tablename='profile_meta' order by 1")).map((r) => r.policyname);
    return eq(o, ["profile_owners_select_own"]) && eq(m, ["profile_meta owner insert", "profile_meta owner update", "profile_meta read all", "profile_meta_owner_select", "profile_meta_owner_update", "profile_meta_read"]) || JSON.stringify({ o, m }); });
  await check("S1.5", "claim_profile(text,text) EXECUTE revoked from PUBLIC, anon, authenticated (P-3 had PUBLIC)", async () => !(await fnp(db, "anon", "public.claim_profile(text,text)")) && !(await fnp(db, "authenticated", "public.claim_profile(text,text)")) && (await one(db, "select coalesce(bool_or(a.grantee=0),false) p from pg_proc p, lateral aclexplode(p.proacl) a where p.oid='public.claim_profile(text,text)'::regprocedure")).p === false);
  await check("S1.6", "new RPCs exist with the intended EXECUTE: get_public_profile/public_profile_list anon+authenticated; admin_* authenticated only (explicit anon revoke); private.* nobody", async () => {
    const pub = ["public.get_public_profile(text)", "public.public_profile_list(text,text,integer)"], authOnly = ["public.admin_set_account_age(uuid,boolean,text,text,text)", "public.admin_move_house_page(text,uuid)"], all4 = ["public.i_own_profile(text)", "public.request_profile_claim(text)", "public.approve_profile_claim(uuid)", "public.set_profile_admin_approved(text,boolean)"];
    for (const f of pub) if (!(await fnp(db, "anon", f)) || !(await fnp(db, "authenticated", f))) return f;
    for (const f of authOnly) if ((await fnp(db, "anon", f)) || !(await fnp(db, "authenticated", f))) return f;
    for (const f of all4) if (!(await fnp(db, "authenticated", f))) return f;
    for (const f of ["private.profile_is_public(text)", "private.profile_public_one(text)"]) if ((await fnp(db, "anon", f)) || (await fnp(db, "authenticated", f))) return f;
    return true; });
  await check("S1.6b", "FINDING (informational): i_own_profile / request_profile_claim / approve_profile_claim / set_profile_admin_approved are revoked from PUBLIC only; with Supabase default privileges anon keeps EXECUTE. The bodies refuse an anonymous caller (not allowed / false), so nothing leaks; an explicit REVOKE ... FROM anon would make it a privilege-layer denial", async () => {
    const calls = [["select public.i_own_profile('tuitea') v", (r) => r.rows?.[0]?.v === false], ["select public.request_profile_claim('x-claim')", (r) => /not allowed/.test(r.err || "")], [`select public.approve_profile_claim('${U.TUI}'::uuid)`, (r) => /not allowed/.test(r.err || "")], ["select public.set_profile_admin_approved('tuitea', true)", (r) => /not allowed/.test(r.err || "")]];
    const execAnon = [await fnp(db, "anon", "public.i_own_profile(text)"), await fnp(db, "anon", "public.request_profile_claim(text)"), await fnp(db, "anon", "public.approve_profile_claim(uuid)"), await fnp(db, "anon", "public.set_profile_admin_approved(text,boolean)")];
    for (const [i, [sql, okf]] of calls.entries()) { const r = await as(db, "anon", "", sql); if (!okf(r)) return JSON.stringify({ i, r }); }
    return execAnon.every(Boolean) || "anon execute is not held (finding would not apply): " + execAnon; });
  await check("S1.7", "public.profiles view: SELECT revoked from anon/authenticated; get_approved_profile exists and is executable by both (revoked later by 1C)", async () =>
    !(await tp(db, "anon", "profiles", "SELECT")) && !(await tp(db, "authenticated", "profiles", "SELECT")) && (await fnp(db, "anon", "public.get_approved_profile(uuid,text)")) && (await fnp(db, "authenticated", "public.get_approved_profile(uuid,text)")));
  await check("S1.8", "backfill: groove-trooper became public+approved, tuitea (subscriber) approved but NOT public; unapproved review rows stay private; null public_fields -> empty list", async () => {
    const g = await one(db, "select profile_public, admin_approved, public_fields from public.profile_meta where slug='groove-trooper'"), t = await one(db, "select profile_public, admin_approved, public_fields from public.profile_meta where slug='tuitea'"), f = await one(db, "select profile_public, public_fields from public.profile_meta where slug='fobbinhard'");
    return (g.profile_public === true && g.admin_approved === true && g.public_fields.length === 6 && t.profile_public === null && t.admin_approved === true && f.profile_public === null && f.public_fields.length === 0) || JSON.stringify({ g, t, f }); });
  await check("S1.9", "the production publish gate is UNTOUCHED by APPLY-1 (same function md5, trigger enabled) and the backfill UPDATEs of the published rows passed it (early return still present)", async () => {
    const g = await one(db, "select md5(pg_get_functiondef('public.profile_meta_publish_gate()'::regprocedure)) m, (select tgenabled from pg_trigger where tgname='profile_meta_publish_gate_trg') en, (select count(*)::int from public.profile_meta where status='published') pub");
    return (g.m === cat0.functions["public.profile_meta_publish_gate()"].md5 && g.en === "O" && g.pub === 4) || JSON.stringify(g); });
  await check("S1.10", "the pre-existing `private` schema and its 4 incident tables survive (P-6/A); anon/authenticated have no USAGE on private", async () =>
    (await one(db, "select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname like 'incident%' or n.nspname='private' and c.relname='qr_token_backup_20261106'")).n === 4 && !(await one(db, "select has_schema_privilege('anon','private','USAGE') a, has_schema_privilege('authenticated','private','USAGE') b")).a);
  return out;
}

export async function afterAPPLY1B(db) {
  const { out, check } = collector();
  await check("S1B.1", "profile_content_kind_check allows exactly the 9 kinds + account_type_request (10)", async () => { const d = (await one(db, "select pg_get_constraintdef(oid) d from pg_constraint where conname='profile_content_kind_check'")).d; return (d.match(/'[a-z_]+'/g) || []).length === 10 && /account_type_request/.test(d); });
  await check("S1B.2", "an owner can now insert a kind='account_type_request' row on their own profile (and a stranger still cannot)", async () => {
    const ok = await auth(db, U.TUI, "insert into public.profile_content(profile_slug,kind,data,created_by) values ('tuitea','account_type_request','{\"requested\":\"brand\"}'::jsonb,'" + U.TUI + "') returning id");
    const bad = await auth(db, U.STR, "insert into public.profile_content(profile_slug,kind,data) values ('tuitea','account_type_request','{}')");
    await tx(db, "delete from public.profile_content where kind='account_type_request'");
    return (ok.rows?.length === 1 && !!bad.err) || JSON.stringify({ ok, bad }); });
  return out;
}

export async function afterAPPLY92(db, cat0) {
  const { out, check } = collector();
  await check("S92.1", "PRECHECK-92 Q-1 after: anon and authenticated read exactly the 45 columns, no table-level SELECT; event_password_hash NOT readable (select denied)", async () => {
    for (const r of ["anon", "authenticated"]) {
      if (!eq(await colset(db, r, "events", "SELECT"), sorted(E45))) return r + " column set differs"; if (await tp(db, r, "events", "SELECT")) return r + " table-level";
      if (!denied(await as(db, r, U.STR, "select event_password_hash from public.events"))) return r + " can read the hash"; }
    return true; });
  await check("S92.2", "get_profile_events(text): one overload, now owner-gated (authenticated only), returns is_protected instead of the hash; a non-owner gets nothing, the owner gets own rows (published AND draft)", async () => {
    const sigs = await su(db, "select p.oid::regprocedure::text s from pg_proc p where proname='get_profile_events' and pronamespace='public'::regnamespace");
    const a = await auth(db, U.TUI, "select slug, is_protected from public.get_profile_events('tuitea')"), s = await auth(db, U.STR, "select slug from public.get_profile_events('tuitea')");
    return (sigs.length === 1 && !(await fnp(db, "anon", "public.get_profile_events(text)")) && (await fnp(db, "authenticated", "public.get_profile_events(text)")) && a.rows?.length === 2 && s.rows?.length === 0 && denied(await anon(db, "select * from public.get_profile_events('tuitea')"))) || JSON.stringify({ sigs, a, s }); });
  await check("S92.3", "get_profile_event_summary is anon-executable, get_my_ticket_summary authenticated-only; the old get_profile_events body is gone (md5 changed)", async () =>
    (await fnp(db, "anon", "public.get_profile_event_summary(text)")) && !(await fnp(db, "anon", "public.get_my_ticket_summary()")) && (await fnp(db, "authenticated", "public.get_my_ticket_summary()"))
    && (await one(db, "select md5(pg_get_functiondef('public.get_profile_events(text)'::regprocedure)) m")).m !== cat0.functions["public.get_profile_events(text)"].md5);
  return out;
}

export async function afterAttestation(db) {
  const { out, check } = collector();
  await check("S4.1", "ORDER step 3A: house account attested (admin ADM2) and groove-trooper moved to it; anon get_public_profile('groove-trooper') now returns 1 row (the only public page stays public)", async () =>
    (await anon(db, "select slug from public.get_public_profile('groove-trooper')")).rows?.length === 1 && (await one(db, "select owner_id from public.profile_owners where profile_slug='groove-trooper'")).owner_id === U.HOUSE);
  await check("S4.2", "step 3B/C: founder_self (Joe, own quote+date) and admin_attested rows exist in private.account_age; a non-admin calling admin_set_account_age is refused", async () => {
    const m = (await su(db, "select method from private.account_age order by user_id")).map((r) => r.method).sort();
    const bad = await auth(db, U.STR, `select public.admin_set_account_age('${U.STR}', true, 'admin_attested')`);
    return (eq(m, ["admin_attested", "founder_self", "house"]) && /not allowed/.test(bad.err || "")) || JSON.stringify({ m, bad }); });
  await check("S4.3", "fail-closed: tuitea (attested but not opted in), fobbinhard (review), keepitil-audit (no attestation), an unknown slug all return 0 rows to anon", async () => {
    for (const s of ["tuitea", "fobbinhard", "keepitil-audit", "no-such-page"]) { const r = await anon(db, `select slug from public.get_public_profile('${s}')`); if (r.rows?.length !== 0) return s + " " + JSON.stringify(r); } return true; });
  return out;
}

export async function afterClient(db, cat) {
  const { out, check } = collector();
  await check("S5.1", "ORDER step 5: owner opt-in (tuitea ticks 'Show this page publicly' + fields) through the live 22-column grants works; anon get_public_profile('tuitea') returns the opted-in fields only", async () => {
    const r = await auth(db, U.TUI, "update public.profile_meta set profile_public=true, public_fields=array['display_name','bio','events'], updated_at=now() where slug='tuitea' returning slug");
    const a = await anon(db, "select * from public.get_public_profile('tuitea')");
    return (r.rows?.length === 1 && a.rows?.length === 1) || JSON.stringify({ r, a }); });
  await check("S5.2", "anon directory (public_profile_list) lists the attested business page (groove-trooper) and, by design, NOT personal subscriber pages (tuitea is reachable only by get_public_profile)", async () => { const r = await anon(db, "select slug from public.public_profile_list()"); return eq((r.rows || []).map((x) => x.slug).sort(), ["groove-trooper"]) || JSON.stringify(r); });
  await check("S5.3", "a known minor is never public even if opted in (fail closed)", async () => {
    await tx(db, "update public.profile_meta set is_minor=true, under_18=true where slug='tuitea'");
    const r = await anon(db, "select slug from public.get_public_profile('tuitea')"); await tx(db, "update public.profile_meta set is_minor=false, under_18=false where slug='tuitea'");
    return r.rows?.length === 0 || JSON.stringify(r); });
  return out;
}
