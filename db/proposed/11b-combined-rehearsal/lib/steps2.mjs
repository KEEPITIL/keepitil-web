/* lib/steps2.mjs - post-check blocks for 1C, F3, 11A, APPLY-2 and the client-payload replays that run at several stages of the order. */
import { U, A22, INS19, UPD14, E45, E44, sorted, eq, su, one, as, tx, denied, colset, tp, fnp, collector, lit, diffSnap } from "./core.mjs";
import { WEB, APP, SLUG, replay, metaWrites, seedNova, getMeta, isReset } from "./payloads.mjs";

const anon = (db, sql) => as(db, "anon", "", sql), auth = (db, sub, sql) => as(db, "authenticated", sub, sql);
const T3 = ["profile_meta", "profile_owners", "profile_content"];

/* ---------- replay helpers */
export async function webRun(db, name, { role = "authenticated", sub = U.OWN, slug = SLUG, seed = true } = {}) {
  if (seed) await seedNova(db, { slug }); const before = await getMeta(db, slug);
  const res = await replay(as, db, role, sub, WEB.scenarios[name].writes, slug); return { res, before, row: await getMeta(db, slug) }; }
export async function appRun(db, { role = "authenticated", sub = U.OWN, slug = SLUG } = {}) {
  await seedNova(db, { slug }); const before = await getMeta(db, slug);
  const res = await replay(as, db, role, sub, APP.writes, slug); return { res, before, row: await getMeta(db, slug) }; }
export const contentCalls = (r) => r.res.filter((x) => x.call.startsWith("profile_content"));
export const metaCalls = (r) => r.res.filter((x) => x.call.startsWith("profile_meta"));
const sameContent = (a, b) => ["display_name", "bio", "links", "socials", "account_type", "status"].every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));

/* ---------- client payload checks at a stage. flags: { appWorks, f3 } */
export async function clientStage(db, tag, { appWorks, f3 }) {
  const { out, check } = collector(); const id = (n) => `${tag}.${n}`;
  await check(id("web-keys"), "STATIC: every profile_meta key the real web save can send is inside 1C's UPDATE-14 set (and the insert fallback is exactly its INSERT-19), none of account_type/status/sources/last_reviewed_at/admin flags/slug-on-update", async () => {
    const upd = new Set(); for (const [n, s] of Object.entries(WEB.scenarios)) for (const w of metaWrites(s.writes)) if (w.op === "update") Object.keys(w.payload).forEach((k) => upd.add(k));
    const ins = Object.keys(WEB.scenarios.insert_fallback.writes.find((w) => w.table === "profile_meta" && w.op === "insert").payload);
    const NEVER = ["account_type", "status", "sources", "last_reviewed_at", "admin_approved", "age_verified", "is_minor", "under_18"];
    const bad = [...upd].filter((k) => !UPD14.includes(k)).concat(ins.filter((k) => !INS19.includes(k)), [...upd, ...ins].filter((k) => NEVER.includes(k)));
    return (bad.length === 0 && eq(sorted(ins), sorted(INS19))) || JSON.stringify({ bad, ins: sorted(ins) }); });
  await check(id("web-noop"), "web NO-OP save (open + Save, nothing edited): ZERO profile_meta writes; its profile_content category rewrite succeeds; the published page is byte-identical afterwards", async () => {
    const r = await webRun(db, "noop"); const nm = WEB.scenarios.noop.writes.filter((w) => w.table === "profile_meta").length;
    return (nm === 0 && contentCalls(r).every((x) => !x.err) && contentCalls(r).length === 2 && JSON.stringify(r.row) === JSON.stringify(r.before)) || JSON.stringify(r.res.filter((x) => x.err)); });
  await check(id("web-bio"), f3 ? "web BIO edit (update {bio,updated_at}): succeeds, and the F3 gate sends the published page to review with evidence cleared" : "web BIO edit (update {bio,updated_at}): succeeds; the page stays published (no F3 trigger yet: the reset appears only after F3)", async () => {
    const r = await webRun(db, "bio_edit"); const m = metaCalls(r)[0];
    return (!m.err && m.rows?.length === 1 && r.row.bio === "A new bio" && (f3 ? isReset(r.row) : r.row.status === "published")) || JSON.stringify({ m, status: r.row.status }); });
  await check(id("web-link"), f3 ? "web LINK edit: succeeds; other members preserved; reset to review under F3" : "web LINK edit: succeeds; other members preserved; stays published", async () => {
    const r = await webRun(db, "link_edit"); const m = metaCalls(r)[0];
    return (!m.err && JSON.stringify(r.row.links) === JSON.stringify(["https://a.test/1", "instagram.com/nova", "https://c.test/3", "https://new.test/4", "https://e.test/5", "https://f.test/6-extra"]) && (f3 ? isReset(r.row) : r.row.status === "published")) || JSON.stringify({ m, links: r.row.links }); });
  await check(id("web-btype"), "web BUSINESS-TYPE request: writes only profile_content (kind account_type_request, needs 1B); profile_meta untouched, page stays published", async () => {
    const r = await webRun(db, "btype_request"); const ins = r.res.filter((x) => x.call === "profile_content.insert");
    const row = await su(db, `select data->>'requested' q from public.profile_content where profile_slug='${SLUG}' and kind='account_type_request'`);
    return (metaCalls(r).length === 0 && ins.length === 2 && ins.every((x) => !x.err) && row[0]?.q === "brand" && JSON.stringify(r.row) === JSON.stringify(r.before)) || JSON.stringify(r.res.filter((x) => x.err)); });
  await check(id("web-public"), "web 'Show this page publicly' toggle (profile_public only): allowed; NOT one of F3's 19 content columns so it does not reset review (F3 README collision row 6)", async () => {
    const r = await webRun(db, "public_toggle"); const m = metaCalls(r)[0];
    return (!m.err && m.rows?.length === 1 && r.row.profile_public === false && r.row.status === "published" && r.row.sources.length === 1) || JSON.stringify({ m, row: [r.row.profile_public, r.row.status] }); });
  await check(id("web-insert"), "web INSERT fallback (newly approved owner, no row yet): update touches 0 rows, then the 19-column insert succeeds and lands as review with default evidence", async () => {
    await tx(db, "delete from public.profile_meta where slug='novanew'; delete from public.profile_owners where profile_slug='novanew'; insert into public.profile_owners(profile_slug,owner_id) values ('novanew','" + U.OWN + "')");
    const r = await webRun(db, "insert_fallback", { slug: "novanew", seed: false }); const [u, i] = metaCalls(r);
    const row = await getMeta(db, "novanew"); await tx(db, "delete from public.profile_content where profile_slug='novanew'; delete from public.profile_meta where slug='novanew'; delete from public.profile_owners where profile_slug='novanew'");
    return (u.rows?.length === 0 && !i.err && row && row.status === "review" && row.account_type === null && JSON.stringify(row.sources) === "[]" && row.last_reviewed_at === null) || JSON.stringify({ u, i }); });
  if (appWorks) {
    await check(id("app"), "BUNDLED APP save (old 19-key upsert incl account_type:null): still WORKS in this window (grants are the 22 APPLY-1 columns); " + (f3 ? "under F3 it silently DEMOTES the published page (C5-INFO)" : "page stays published (no gate yet)"), async () => {
      const r = await appRun(db); const m = metaCalls(r)[0]; return (!m.err && m.rows?.length === 1 && (f3 ? isReset(r.row) : r.row.status === "published")) || JSON.stringify({ m, status: r.row.status }); });
  } else {
    await check(id("app"), "BUNDLED APP save (old 19-key upsert incl account_type): REFUSED with 42501 permission denied for table profile_meta (account_type/badges are not INSERT-able any more); nothing written; published page unchanged", async () => {
      const r = await appRun(db); const m = metaCalls(r)[0]; return (m.code === "42501" && /permission denied for table profile_meta/.test(m.err) && JSON.stringify(r.row) === JSON.stringify(r.before)) || JSON.stringify({ code: m.code, err: m.err }); });
    await check(id("app-update-leg"), "BUNDLED APP save, UPDATE leg alone (ON CONFLICT DO UPDATE would set slug/account_type/badges): also refused, so the app cannot use the fallback path either", async () => {
      await seedNova(db); const k = Object.entries(APP.writes[0].payload).filter(([c]) => ["slug", "account_type", "badges", "display_name"].includes(c));
      const r = await auth(db, U.OWN, `update public.profile_meta set ${k.map(([c, v]) => c + "=" + (v === null ? "null" : lit(typeof v === "object" ? JSON.stringify(v) : v))).join(",")} where slug='${SLUG}'`); return (r.code === "42501") || JSON.stringify(r); });
  }
  return out;
}

/* ---------- 1C */
export async function afterC1C(db, { fp2, fp3 }) {
  const { out, check } = collector();
  await check("C1C.1", "profile_meta authenticated column INSERT = the 19, UPDATE = the 14 (exactly #129's payload); anon none; no table-level INSERT/UPDATE", async () =>
    eq(await colset(db, "authenticated", "profile_meta", "INSERT"), sorted(INS19)) && eq(await colset(db, "authenticated", "profile_meta", "UPDATE"), sorted(UPD14)) && (await colset(db, "anon", "profile_meta", "INSERT")).length === 0 && (await colset(db, "anon", "profile_meta", "UPDATE")).length === 0 && !(await tp(db, "authenticated", "profile_meta", "UPDATE")) && !(await tp(db, "authenticated", "profile_meta", "INSERT")));
  await check("C1C.2", "owners can NOT write account_type, status, sources, last_reviewed_at, entity_category, the four server flags; slug is INSERT-only", async () => {
    for (const c of ["account_type", "status", "sources", "last_reviewed_at", "entity_category", "admin_approved", "age_verified", "is_minor", "under_18"]) for (const p of ["INSERT", "UPDATE"]) if ((await one(db, `select has_column_privilege('authenticated','public.profile_meta','${c}','${p}') v`)).v) return c + " " + p;
    return !(await one(db, "select has_column_privilege('authenticated','public.profile_meta','slug','UPDATE') v")).v && (await one(db, "select has_column_privilege('authenticated','public.profile_meta','slug','INSERT') v")).v; });
  await check("C1C.3", "REFERENCES / TRIGGER / TRUNCATE / MAINTAIN gone for anon+authenticated on profile_meta, profile_owners, profile_content", async () => {
    for (const r of ["anon", "authenticated"]) for (const t of T3) for (const p of ["REFERENCES", "TRIGGER", "TRUNCATE", "MAINTAIN"]) if (await tp(db, r, t, p)) return `${r} ${t} ${p}`; return true; });
  await check("C1C.4", "profile_content: anon SELECT only; authenticated SELECT/INSERT/UPDATE/DELETE; profile_meta anon SELECT still open (until APPLY-2)", async () => {
    for (const p of ["INSERT", "UPDATE", "DELETE"]) if (await tp(db, "anon", "profile_content", p)) return "anon " + p;
    for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE"]) if (!(await tp(db, "authenticated", "profile_content", p))) return "auth " + p;
    return (await tp(db, "anon", "profile_content", "SELECT")) && (await tp(db, "anon", "profile_meta", "SELECT")); });
  await check("C1C.5", "events: anon+authenticated read exactly the 44 columns (45 minus submitted_by); submitted_by, hash, select * denied", async () => {
    for (const r of ["anon", "authenticated"]) { if (!eq(await colset(db, r, "events", "SELECT"), sorted(E44))) return r + " set differs"; for (const q of ["select submitted_by from public.events", "select event_password_hash from public.events", "select * from public.events"]) if (!denied(await as(db, r, U.STR, q))) return r + " " + q; } return true; });
  await check("C1C.6", "events RLS policy that references submitted_by keeps working (submitter sees own draft, stranger does not) and a DEFINER reader of submitted_by (get_event_view) still answers anon", async () =>
    (await auth(db, U.SUB, "select slug from public.events where slug='ev-sub'")).rows?.length === 1 && (await auth(db, U.STR, "select slug from public.events where slug='ev-sub'")).rows?.length === 0 && (await anon(db, "select has_submitter from public.get_event_view('t-up-1')")).rows?.[0]?.has_submitter === true);
  await check("C1C.7", "get_approved_profile EXECUTE revoked (anon, authenticated); public.profiles still closed; the public RPC path is unchanged", async () =>
    !(await fnp(db, "anon", "public.get_approved_profile(uuid,text)")) && !(await fnp(db, "authenticated", "public.get_approved_profile(uuid,text)")) && denied(await anon(db, "select * from public.profiles")) && (await anon(db, "select slug from public.get_public_profile('groove-trooper')")).rows?.length === 1);
  await check("C1C.8", "TRUNCATE as a real role (not postgres) is denied on all three tables for anon and authenticated", async () => { for (const r of ["anon", "authenticated"]) for (const t of T3) if (!denied(await as(db, r, U.OWN, `truncate public.${t}`))) return r + " " + t; return true; });
  await check("C1C.9", "the privilege fingerprint (PRECHECK-10A block H) changed: FP2 (before) != FP3 (after)", async () => fp2 !== fp3 || "unchanged");
  return out;
}

/* ---------- F3 */
export async function afterF3(db, { catBefore, catAfter }) {
  const { out, check } = collector();
  await check("F3.2", "media INSERT policies are authenticated-only and parent-owner-gated (pending|pending_upload; venue pending only); two owner-read policies exist; anon INSERT/TRUNCATE and authenticated TRUNCATE are gone on all three tables", async () => {
    const p = Object.fromEntries((await su(db, "select policyname, roles::text r, with_check w from pg_policies where tablename in ('event_media','venue_media') order by 1")).map((x) => [x.policyname, x]));
    if (!(/authenticated/.test(p.event_media_ins?.r) && /pending/.test(p.event_media_ins?.w) && /pending_upload/.test(p.event_media_ins?.w))) return "event ins " + JSON.stringify(p.event_media_ins);
    if (!(/authenticated/.test(p.venue_media_insert?.r) && /pending/.test(p.venue_media_insert?.w) && !/pending_upload/.test(p.venue_media_insert?.w))) return "venue ins";
    if (!p.atlas_event_media_owner_read || !p.atlas_venue_media_owner_read) return "owner read";
    for (const t of ["event_media", "venue_media"]) if (await tp(db, "anon", t, "INSERT")) return "anon insert " + t;
    for (const t of ["event_media", "venue_media", "profile_meta"]) for (const r of ["anon", "authenticated"]) if (await tp(db, r, t, "TRUNCATE")) return r + " truncate " + t; return true; });
  await check("F3.3", "event_media/venue_media status defaults are 'pending'; venue CHECK admits pending; both original fan RPCs are INVOKER wrappers (search_path '') over private DEFINER bodies; wrappers have no anon/PUBLIC execute", async () => {
    const d = await su(db, "select c.relname, pg_get_expr(d.adbin,d.adrelid) e from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where c.oid in ('public.event_media'::regclass,'public.venue_media'::regclass) and a.attname='status'");
    const f = await su(db, "select n.nspname, p.proname, p.prosecdef, coalesce(p.proconfig @> array['search_path=\"\"'],false) sp, has_function_privilege('anon',p.oid,'EXECUTE') a from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='atlas_media_guard' or (n.nspname='public' and p.proname in ('tag_event_media','tag_venue_media','profile_meta_publish_gate'))");
    const priv = f.filter((x) => x.nspname === "atlas_media_guard"), pub = f.filter((x) => x.nspname === "public");
    return d.length === 2 && d.every((x) => /pending/.test(x.e)) && priv.length === 3 && priv.every((x) => x.prosecdef && x.sp && !x.a) && pub.filter((x) => x.proname !== "profile_meta_publish_gate").every((x) => !x.prosecdef && x.sp && !x.a) || JSON.stringify(f); });
  await check("F3.4", "the publish gate is replaced (body has the 'server-managed' owner guard), is still an INVOKER trigger function bound to profile_meta_publish_gate_trg, and no longer has the published->published early return", async () => {
    const g = await one(db, "select pg_get_functiondef('public.profile_meta_publish_gate()'::regprocedure) d, (select tgenabled from pg_trigger where tgname='profile_meta_publish_gate_trg') en, (select prosecdef from pg_proc where oid='public.profile_meta_publish_gate()'::regprocedure) sd");
    const d = g.d.replace(/\s+/g, " ");
    return (g.en === "O" && g.sd === false && /server-managed/.test(d) && !/tg_op = 'UPDATE' and old\.status = 'published' then return new/.test(d)) || "gate body check failed"; });
  await check("F3.5", "F3's profile_meta ACL lines are NO-OPS after 1C: relation + column ACLs of profile_meta are identical before and after F3", async () => {
    const d = diffSnap({ relations: { x: catBefore.relations["public.profile_meta"] }, columns: Object.fromEntries(Object.entries(catBefore.columns).filter(([k]) => k.startsWith("public.profile_meta."))) }, { relations: { x: catAfter.relations["public.profile_meta"] }, columns: Object.fromEntries(Object.entries(catAfter.columns).filter(([k]) => k.startsWith("public.profile_meta."))) });
    return d.n === 0 || JSON.stringify(d.sections).slice(0, 300); });
  await check("F3.6", "S2 quarantine and rollback guard: backup table holds 19 rows, rollback_guard 1 row, both unreadable by anon/authenticated/service_role", async () => {
    const g = await one(db, "select (select count(*)::int from atlas_media_guard.rollback_guard) g, (select count(*)::int from atlas_media_guard.orphan_event_media_backup) b");
    return g.g === 1 && g.b === 19 && denied(await auth(db, U.STR, "select * from atlas_media_guard.orphan_event_media_backup")) && denied(await anon(db, "select * from atlas_media_guard.rollback_guard")) && denied(await as(db, "service_role", "", "select * from atlas_media_guard.orphan_event_media_backup")); });
  return out;
}

/* ---------- 11A */
export async function after11A(db) {
  const { out, check } = collector();
  const can = async (sub, slug, role = "authenticated") => { const r = await as(db, role, sub, slug === null ? "select public.can_upload_event_media(null) v" : `select public.can_upload_event_media('${slug}') v`); return r.err ? "ERR:" + r.err : r.rows[0].v; };
  await check("11A.1", "can_upload_event_media(text): boolean, SECURITY DEFINER, search_path '', EXECUTE authenticated only (anon/service_role/PUBLIC none)", async () => {
    const f = await one(db, "select prorettype::regtype::text t, prosecdef sd, proconfig c, has_function_privilege('anon',oid,'EXECUTE') a, has_function_privilege('service_role',oid,'EXECUTE') s, has_function_privilege('authenticated',oid,'EXECUTE') u, (select coalesce(bool_or(x.grantee=0),false) from aclexplode(proacl) x) pub from pg_proc where oid='public.can_upload_event_media(text)'::regprocedure");
    return (f.t === "boolean" && f.sd && JSON.stringify(f.c) === JSON.stringify(['search_path=""']) && !f.a && !f.s && f.u && !f.pub) || JSON.stringify(f); });
  await check("11A.2", "AFTER 1C and F3: submitted_by owner (no profile mapping), mapped profile owner and a draft-parent owner pass; a stranger, another profile's owner, a missing slug and a NULL slug do not", async () =>
    (await can(U.SUB, "ev-sub")) === true && (await can(U.OWN, "ev-pub")) === true && (await can(U.OWN, "ev-draft")) === true && (await can(U.STR, "ev-pub")) === false && (await can(U.OWN2, "ev-pub")) === false && (await can(U.OWN, "no-such")) === false && (await can(U.OWN, null)) === false);
  await check("11A.3", "composition with 1C: the caller still cannot read events.submitted_by or profile_owners of others, yet the DEFINER function answers; anon is refused at the privilege layer", async () =>
    denied(await auth(db, U.SUB, "select submitted_by from public.events where slug='ev-sub'")) && /permission denied/i.test(String(await can("", "ev-pub", "anon"))));
  return out;
}

/* ---------- APPLY-2 */
export async function afterApply2(db) {
  const { out, check } = collector();
  await check("A2.1", "anon can no longer read profile_meta (book_email closed): select denied; both open read policies dropped; RLS enabled", async () =>
    denied(await anon(db, "select book_email from public.profile_meta")) && denied(await anon(db, "select slug from public.profile_meta")) && (await one(db, "select count(*)::int n from pg_policies where tablename='profile_meta' and policyname in ('profile_meta read all','profile_meta_read')")).n === 0 && (await one(db, "select relrowsecurity r from pg_class where oid='public.profile_meta'::regclass")).r);
  await check("A2.2", "owner still reads ONLY their own row (profile_meta_owner_select) incl book_email; another owner's row is invisible", async () => {
    const me = await auth(db, U.TUI, "select slug, book_email from public.profile_meta"); return (me.rows?.length === 1 && me.rows[0].slug === "tuitea" && me.rows[0].book_email === "private@example.test") || JSON.stringify(me); });
  await check("A2.3", "the public RPC path is unchanged: anon get_public_profile / public_profile_list answer exactly as before; claim-request table closed to anon", async () =>
    (await anon(db, "select slug from public.get_public_profile('groove-trooper')")).rows?.length === 1 && eq(((await anon(db, "select slug from public.public_profile_list()")).rows || []).map((x) => x.slug).sort(), ["groove-trooper"]) && (await anon(db, "select slug from public.get_public_profile('tuitea')")).rows?.length === 1 && !(await tp(db, "anon", "profile_claim_requests", "SELECT")));
  await check("A2.4", "1C narrowing untouched by APPLY-2 (INSERT=19, UPDATE=14) and the owner save still works", async () =>
    eq(await colset(db, "authenticated", "profile_meta", "INSERT"), sorted(INS19)) && eq(await colset(db, "authenticated", "profile_meta", "UPDATE"), sorted(UPD14)) && (await auth(db, U.TUI, "update public.profile_meta set bio='b', updated_at=now() where slug='tuitea' returning slug")).rows?.length === 1);
  return out;
}
