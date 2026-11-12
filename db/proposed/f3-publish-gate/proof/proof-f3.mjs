/* proof-f3.mjs - LOCAL PGlite stand-in proof for Atlas's "Media RLS + Connect publish-gate proposal v2".
   NOTHING touches any hosted database. It loads replica-f3-LOCAL-REPLICA-NOT-FOR-PROD.sql into an in-memory PGlite
   (Postgres WASM), runs the proposal's FORWARD and ROLLBACK SQL files EXACTLY as committed (only the 32-hex baseline
   fingerprint literal is swapped for the replica's own fingerprint, because the production baseline can never match a
   replica), then exercises the executable parts of Atlas's isolated test matrix.
   THIS IS A STAND-IN, NOT A REPLACEMENT FOR SENTINEL'S MATRIX AGAINST THE REAL CATALOG (see README.md and proof/README-PROOF.md).
   Run (tower):  set PGLITE_DIR=D:\work\delrunbook\pgl & node proof-f3.mjs
   Exit 0 only if every positive check passes AND every negative control fails the checks it is expected to fail. */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
const HERE = dirname(fileURLToPath(import.meta.url));
const rd = (f) => readFileSync(join(HERE, f), "utf8");
let PGlite = null;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { if (process.env.PGLITE_DIR) ({ PGlite } = await import(pathToFileURL(join(process.env.PGLITE_DIR, "node_modules/@electric-sql/pglite/dist/index.js")).href)); }
if (!PGlite) { console.error("PGlite not importable; set PGLITE_DIR"); process.exit(3); }

const P = "2026-11-09_f3_media_rls_connect_publish_gate_";
const REPLICA = rd("replica-f3-LOCAL-REPLICA-NOT-FOR-PROD.sql");
const FW0 = rd(`../${P}FORWARD_PROPOSED.sql`), RB0 = rd(`../${P}ROLLBACK_PROPOSED.sql`);
const GR = rd(`../${P}GATE_READINESS_READONLY_PROPOSED.sql`), PC = rd(`../${P}POSTCHECKS_PROPOSED.sql`), DQ = rd(`../${P}DRIFT_QUERY_PROPOSED.sql`);
const ORIG_FP = "c917a7dfbc778913b7e46b332aeeb348";
if (!FW0.includes(ORIG_FP) || !RB0.includes(ORIG_FP)) { console.error("baseline literal not found in forward/rollback"); process.exit(4); }

const OWN = "a0000000-0000-4000-8000-000000000001", OWN2 = "a0000000-0000-4000-8000-000000000002", STR = "a0000000-0000-4000-8000-000000000003",
  ADM = "a0000000-0000-4000-8000-000000000004", SUB = "a0000000-0000-4000-8000-000000000005";
const lit = (v) => v === null || v === undefined ? "null" : "'" + String(v).replace(/'/g, "''") + "'";

let curDb = null;
async function open() { const db = new PGlite(); await db.exec(REPLICA); return db; }
async function fingerprint(db, path = "public, extensions") { await db.exec(`reset role; set search_path = ${path}`); const r = await db.query(DQ); await db.exec("set search_path = \"$user\", public"); return r.rows[0].fingerprint; }
async function tx(db, sql) { try { await db.exec(sql); return { ok: true }; } catch (e) { try { await db.exec("rollback"); } catch {} return { ok: false, err: String(e.message || e) }; } }
const patch = (sql, fp) => sql.split(ORIG_FP).join(fp);
function mutate(sql, from, to, what) { const i = sql.indexOf(from); if (i < 0) throw new Error("mutation anchor not found: " + what); if (sql.indexOf(from, i + 1) >= 0) throw new Error("mutation anchor not unique: " + what); return sql.slice(0, i) + to + sql.slice(i + from.length); }
async function as(db, role, sub, sql) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${sub || ""}', false); set role ${role};`);
  try { const r = await db.query(sql); return { rows: r.rows, n: r.affectedRows ?? r.rows.length }; }
  catch (e) { return { err: String(e.message || e), code: e.code }; }
  finally { await db.exec("reset role"); }
}
const su = async (db, sql, params) => (await db.query(sql, params)).rows;
const one = async (db, sql) => (await su(db, sql))[0];
const denied = (r) => !!r.err && /permission denied|row-level security/i.test(r.err);
const RLSV = (r) => !!r.err && /row-level security/i.test(r.err);
const EVID = (r) => !!r.err && /publication evidence is server-managed/.test(r.err) && r.code === "42501";
const CHK = (r) => !!r.err && /cannot be published/.test(r.err) && r.code === "23514";

/* ---------- worlds ---------- */
async function worldFwd(fwMut) { // replica + FORWARD (baseline literal replaced by the replica's own fingerprint)
  const db = await open(); const F0 = await fingerprint(db);
  const fw = patch(fwMut ? fwMut(FW0) : FW0, F0);
  const r = await tx(db, fw); if (!r.ok) throw new Error("forward failed on replica: " + r.err);
  return { db, F0, fw, rb: patch(RB0, F0) };
}

/* ---------- profile fixtures ---------- */
const BASE = { slug: "pub-a", display_name: "Pub A", handle: "pub-a", location: "LA", bio: "bio a", tagline: "tag a", pronouns: "they", avatar_url: "https://x.test/a.png", cover_url: "https://x.test/ac.png", book_email: "a@x.test",
  socials: { instagram: "a" }, highlights: [], about: "about a", links: ["https://x.test/l"], account_type: "editorial_artist", links_label: "Links", badges: ["b1"], status: "published", cover_mobile_url: "https://x.test/am.png",
  sources: [{ url: "https://x.test/src", http_status: "200" }], entity_category: "dj" };
const JSONC = new Set(["socials", "highlights", "links", "badges", "sources"]);
const sqlv = (k, v) => v === null ? "null" : k === "last_reviewed_at" ? lit(v) + "::timestamptz" : JSONC.has(k) ? lit(JSON.stringify(v)) + "::jsonb" : lit(v);
async function seed(db, over = {}) { // as postgres; trusted path (the proposal's gate still runs on published rows)
  const row = { ...BASE, last_reviewed_at: new Date().toISOString(), ...over };
  await db.exec(`delete from public.profile_meta where slug=${lit(row.slug)}`);
  await db.exec(`insert into public.profile_meta(${Object.keys(row).join(",")}) values (${Object.entries(row).map(([k, v]) => sqlv(k, v)).join(",")})`);
}
const getRow = async (db, slug) => one(db, `select * from public.profile_meta where slug=${lit(slug)}`);
// exactly the 19 keys saveEditProfile sends (profile.html: .upsert(meta)); PostgREST turns it into INSERT .. ON CONFLICT (slug) DO UPDATE SET <every sent column> = EXCLUDED.<col>
const PAYLOAD_KEYS = ["slug", "display_name", "handle", "location", "bio", "tagline", "pronouns", "book_email", "about", "links", "links_label", "badges", "account_type", "avatar_url", "cover_url", "cover_mobile_url", "socials", "highlights", "updated_at"];
function upsertSql(over = {}) {
  const p = {}; for (const k of PAYLOAD_KEYS) p[k] = k === "updated_at" ? new Date().toISOString() : BASE[k];
  Object.assign(p, over);
  const cols = PAYLOAD_KEYS;
  return `insert into public.profile_meta(${cols.join(",")}) values (${cols.map((k) => k === "updated_at" ? lit(p[k]) + "::timestamptz" : sqlv(k, p[k])).join(",")}) on conflict (slug) do update set ${cols.map((k) => `${k}=excluded.${k}`).join(",")}`;
}
const isReset = (r) => r.status === "review" && JSON.stringify(r.sources) === "[]" && r.last_reviewed_at === null;

/* ---------- the executable part of Atlas's matrix, as suites that return [{name, ok, why}] ---------- */
function mk() { const res = []; return { res, check: async (name, fn) => { let ok = false, why = ""; try { const v = await fn(); ok = v === true; if (!ok) why = "returned " + JSON.stringify(v); } catch (e) { ok = false; why = String(e.message || e); } res.push({ name, ok, why }); } }; }

async function suiteConnect(db) {
  const { res, check } = mk();
  const contentFields = { display_name: "X name", handle: "x-handle", location: "SF", bio: "x bio", tagline: "x tag", pronouns: "x/x", avatar_url: "https://x.test/new.png", cover_url: "https://x.test/newc.png", book_email: "n@x.test",
    socials: { instagram: "changed" }, highlights: [{ label: "h", img: "i" }], about: "x about", links: ["https://x.test/other"], account_type: "editorial_brand", links_label: "Other", badges: ["zz"], cover_mobile_url: "https://x.test/newm.png", entity_category: "band" };
  // ---- C1: owner cannot set status / sources / last_reviewed_at, alone or together
  await seed(db, { slug: "rev-a", status: "review", sources: [], last_reviewed_at: null }); await db.exec(`insert into public.profile_owners(profile_slug,owner_id) values ('rev-a','${OWN}') on conflict do nothing`);
  const forged = [["status", "update public.profile_meta set status='published' where slug='rev-a'"],
    ["sources", `update public.profile_meta set sources='[{"url":"https://fake.test","http_status":"200"}]'::jsonb where slug='rev-a'`],
    ["last_reviewed_at", "update public.profile_meta set last_reviewed_at=now() where slug='rev-a'"],
    ["all three together", `update public.profile_meta set status='published', sources='[{"url":"https://fake.test","http_status":"200"}]'::jsonb, last_reviewed_at=now() where slug='rev-a'`]];
  for (const [label, sql] of forged) await check(`C1 owner UPDATE forging ${label} -> 42501 and nothing persisted`, async () => { const r = await as(db, "authenticated", OWN, sql); const row = await getRow(db, "rev-a"); return EVID(r) && row.status === "review" && JSON.stringify(row.sources) === "[]" && row.last_reviewed_at === null; });
  // ---- C2: owner INSERT / upsert of a new owned profile with fabricated evidence
  await db.exec(`insert into public.profile_owners(profile_slug,owner_id) values ('new-a','${OWN}') on conflict do nothing`);
  const goodSrc = `'[{"url":"https://fake.test","http_status":"200"}]'::jsonb`;
  const ins = (cols, vals) => `insert into public.profile_meta(slug,display_name,account_type,entity_category,about,location,avatar_url,${cols}) values ('new-a','N','editorial_artist','dj','a','LA','https://x/y.png',${vals})`;
  for (const [label, sql] of [
    ["status=published + evidence", ins("status,sources,last_reviewed_at", `'published',${goodSrc},now()`)],
    ["sources only", ins("sources", goodSrc)], ["last_reviewed_at only", ins("last_reviewed_at", "now()")], ["status=published only", ins("status", "'published'")],
    ["upsert with forged evidence", ins("status,sources,last_reviewed_at", `'published',${goodSrc},now()`) + " on conflict (slug) do update set status=excluded.status"]])
    await check(`C2 owner INSERT (${label}) denied with 42501, zero rows`, async () => { const r = await as(db, "authenticated", OWN, sql); const c = (await one(db, "select count(*)::int c from public.profile_meta where slug='new-a'")).c; return EVID(r) && c === 0; });
  await check("C2 owner INSERT with default review/empty evidence still allowed (normal first save)", async () => { const r = await as(db, "authenticated", OWN, ins("status", "'review'")); await db.exec("delete from public.profile_meta where slug='new-a'"); return !r.err; });
  await check("C2 owner INSERT omitting status/sources/last_reviewed_at (live payload shape) is allowed and lands as review", async () => { const r = await as(db, "authenticated", OWN, `insert into public.profile_meta(slug,display_name) values ('new-a','N')`); const row = await getRow(db, "new-a"); await db.exec("delete from public.profile_meta where slug='new-a'"); return !r.err && isReset(row); });
  // ---- C3: every content column edit on a published row -> review + evidence cleared + server stamp
  for (const [col, val] of Object.entries(contentFields)) await check(`C3 owner edit of ${col} on published row -> review, sources=[], last_reviewed_at=null, updated_at server-stamped`, async () => {
    await seed(db, {}); const before = await getRow(db, "pub-a");
    const r = await as(db, "authenticated", OWN, `update public.profile_meta set ${col}=${sqlv(col, val)}, updated_at='2001-01-01'::timestamptz where slug='pub-a'`);
    const row = await getRow(db, "pub-a"); return !r.err && isReset(row) && new Date(row.updated_at) > new Date("2020-01-01") && new Date(row.updated_at) >= new Date(before.updated_at); });
  for (const [col, sql] of [["about -> NULL", "about=null"], ["links -> NULL", "links=null"], ["badges -> []", "badges='[]'::jsonb"], ["socials -> {}", "socials='{}'::jsonb"], ["highlights -> null json element", "highlights='[null]'::jsonb"]])
    await check(`C3 NULL/JSON transition (${col}) resets review`, async () => { await seed(db, {}); const r = await as(db, "authenticated", OWN, `update public.profile_meta set ${sql} where slug='pub-a'`); return !r.err && isReset(await getRow(db, "pub-a")); });
  await check("C3 combined multi-field edit resets review", async () => { await seed(db, {}); const r = await as(db, "authenticated", OWN, "update public.profile_meta set display_name='Z', bio='z', links=null where slug='pub-a'"); return !r.err && isReset(await getRow(db, "pub-a")); });
  // ---- C4: real saveEditProfile payload (19 keys, conflict key slug) on an existing published row
  await check("C4 19-key owner upsert with changed content on published row succeeds (no grant/trigger error) and resets review", async () => { await seed(db, {}); const r = await as(db, "authenticated", OWN, upsertSql({ bio: "edited bio" })); return !r.err && isReset(await getRow(db, "pub-a")); });
  await check("C4 same 19-key upsert never contains status/sources/last_reviewed_at", async () => PAYLOAD_KEYS.length === 19 && !PAYLOAD_KEYS.some((k) => ["status", "sources", "last_reviewed_at"].includes(k)));
  // ---- C5: no-op except updated_at
  await check("C5 19-key upsert identical to stored content except updated_at keeps published + evidence", async () => { await seed(db, {}); const b = await getRow(db, "pub-a"); const r = await as(db, "authenticated", OWN, upsertSql({})); const a = await getRow(db, "pub-a"); return !r.err && a.status === "published" && JSON.stringify(a.sources) === JSON.stringify(b.sources) && String(a.last_reviewed_at) === String(b.last_reviewed_at); });
  await check("C5 plain updated_at-only UPDATE keeps published + evidence", async () => { await seed(db, {}); const r = await as(db, "authenticated", OWN, "update public.profile_meta set updated_at=now() where slug='pub-a'"); const a = await getRow(db, "pub-a"); return !r.err && a.status === "published" && a.sources.length === 1; });
  await check("C5-INFO (Atlas MF1 blocker) legacy form payload with account_type:null on a published row IS a content change -> review reset (client must be fixed first)", async () => { await seed(db, {}); const r = await as(db, "authenticated", OWN, upsertSql({ account_type: null })); const a = await getRow(db, "pub-a"); return !r.err && isReset(a) && a.account_type === null; });
  // ---- C6
  await check("C6 owner changes content AND forges sources in one UPDATE -> 42501, statement rolled back (content unchanged)", async () => { await seed(db, {}); const r = await as(db, "authenticated", OWN, `update public.profile_meta set display_name='ZZ', sources='[]'::jsonb, last_reviewed_at=now() where slug='pub-a'`); const a = await getRow(db, "pub-a"); return EVID(r) && a.display_name === "Pub A" && a.status === "published"; });
  await check("C6 explicitly assigning the OLD identical gate values while editing content is permitted but still resets review", async () => { await seed(db, {}); const r = await as(db, "authenticated", OWN, `update public.profile_meta set display_name='ZZ', status='published' where slug='pub-a'`); return !r.err && isReset(await getRow(db, "pub-a")); });
  // ---- C7
  await check("C7 owner content change on a review row with stale evidence clears evidence and stays non-published", async () => { await seed(db, { status: "review" }); const r = await as(db, "authenticated", OWN, "update public.profile_meta set bio='new' where slug='pub-a'"); return !r.err && isReset(await getRow(db, "pub-a")); });
  // ---- C8: trusted paths run the completeness gate on every published write (old early return removed)
  await check("C8a service_role publishes a complete reviewed row (review -> published) OK", async () => { await seed(db, { status: "review" }); const r = await as(db, "service_role", "", `update public.profile_meta set status='published' where slug='pub-a'`); return !r.err && (await getRow(db, "pub-a")).status === "published"; });
  await check("C8b service_role edit of an ALREADY-published row that violates the gate (no short description) -> check_violation 23514", async () => { await seed(db, {}); const r = await as(db, "service_role", "", "update public.profile_meta set about=null, bio=null where slug='pub-a'"); return CHK(r) && (await getRow(db, "pub-a")).about === "about a"; });
  await check("C8c postgres (trusted) edit of a published row that drops last_reviewed_at -> check_violation", async () => { await seed(db, {}); try { await db.exec("update public.profile_meta set last_reviewed_at=null where slug='pub-a'"); return false; } catch (e) { return e.code === "23514"; } });
  await check("C8d signed-in is_admin who OWNS a profile may set evidence (exempt from owner guard) but the completeness gate still runs", async () => {
    await db.exec(`delete from public.profile_owners where profile_slug='adm-own'; insert into public.profile_owners(profile_slug,owner_id) values ('adm-own','${ADM}')`);
    await seed(db, { slug: "adm-own", status: "review", sources: [], last_reviewed_at: null });
    const ok = await as(db, "authenticated", ADM, `update public.profile_meta set status='published', sources='[{"url":"https://r.test","http_status":"200"}]'::jsonb, last_reviewed_at=now() where slug='adm-own'`);
    const published = (await getRow(db, "adm-own")).status === "published";
    const bad = await as(db, "authenticated", ADM, "update public.profile_meta set about=null, bio=null where slug='adm-own'");
    const kept = (await getRow(db, "adm-own")).about === "about a";
    await db.exec("delete from public.profile_meta where slug='adm-own'; delete from public.profile_owners where profile_slug='adm-own'");
    return (!ok.err && ok.n === 1 && published && CHK(bad) && kept) || JSON.stringify({ ok: ok.err, n: ok.n, published, bad: bad.err, code: bad.code, kept }); });
  // ---- C9
  await check("C9 signed-in is_admin who does not own the profile: direct UPDATE touches 0 rows (owner RLS unchanged)", async () => { await seed(db, {}); const r = await as(db, "authenticated", ADM, "update public.profile_meta set bio='admin edit' where slug='pub-a'"); return !r.err && r.n === 0 && (await getRow(db, "pub-a")).bio === "bio a"; });
  // ---- C10
  await check("C10 anonymous INSERT/UPDATE on profile_meta denied (no uid is not a bypass)", async () => { await seed(db, {});
    const i = await as(db, "anon", "", `insert into public.profile_meta(slug,display_name) values ('anon-x','A')`); const u = await as(db, "anon", "", "update public.profile_meta set bio='anon' where slug='pub-a'"); return denied(i) && (denied(u) || u.n === 0) && (await getRow(db, "pub-a")).bio === "bio a"; });
  await check("C10 unrelated authenticated user cannot INSERT (RLS) or UPDATE (0 rows) another owner's profile", async () => { await seed(db, {}); await db.exec(`insert into public.profile_owners(profile_slug,owner_id) values ('pub-a','${OWN}') on conflict do nothing`);
    const i = await as(db, "authenticated", STR, `insert into public.profile_meta(slug,display_name) values ('pub-a','H') on conflict (slug) do update set display_name='H'`); const u = await as(db, "authenticated", STR, "update public.profile_meta set bio='x' where slug='pub-a'"); return RLSV(i) && !u.err && u.n === 0; });
  await check("C10 claim_profile normal creation succeeds and lands with fixed review defaults", async () => { const r = await as(db, "authenticated", STR, "select public.claim_profile('str-new','Str New') s"); const row = await getRow(db, "str-new"); return !r.err && row.status === "review" && JSON.stringify(row.sources) === "[]" && row.last_reviewed_at === null; });
  // ---- X1: documented side effect of removing the early return
  await check("X1-INFO side effect: a trusted UPDATE of an evidence-less published row (e.g. a backfill touching updated_at) now raises check_violation", async () => {
    await db.exec("alter table public.profile_meta disable trigger profile_meta_publish_gate_trg");
    await seed(db, { slug: "legacy-x", sources: [], last_reviewed_at: null }); await db.exec("alter table public.profile_meta enable trigger profile_meta_publish_gate_trg");
    try { await db.exec("update public.profile_meta set updated_at=now() where slug='legacy-x'"); return false; } catch (e) { return e.code === "23514"; } finally { await db.exec("delete from public.profile_meta where slug='legacy-x'"); } });
  return res;
}

async function suiteMedia(db) {
  const { res, check } = mk();
  const cnt = async (t, w = "true") => (await one(db, `select count(*)::int c from public.${t} where ${w}`)).c;
  const evIns = (slug, extra = "", cols = "", vals = "") => `insert into public.event_media(event_slug,media_url${cols ? "," + cols : ""}) values ('${slug}','https://x.test/u.jpg'${vals ? "," + vals : ""}) ${extra}`;
  const vnIns = (slug, cols = "", vals = "") => `insert into public.venue_media(venue_slug,media_url${cols ? "," + cols : ""}) values ('${slug}','https://x.test/u.jpg'${vals ? "," + vals : ""})`;
  const e0 = await cnt("event_media"), v0 = await cnt("venue_media");
  // post-state (Atlas section 4 expectations)
  const priv = await one(db, `select ${["event_media", "venue_media", "profile_meta"].flatMap((t) => ["TRUNCATE"].map((p) => `has_table_privilege('anon','public.${t}','${p}') a_${t}_trunc, has_table_privilege('authenticated','public.${t}','${p}') u_${t}_trunc`)).join(",")},
    has_table_privilege('anon','public.event_media','INSERT') a_em_ins, has_table_privilege('anon','public.venue_media','INSERT') a_vm_ins,
    has_table_privilege('anon','public.event_media','UPDATE') a_em_upd, has_table_privilege('anon','public.profile_meta','UPDATE') a_pm_upd, has_table_privilege('anon','public.profile_meta','DELETE') a_pm_del,
    has_table_privilege('anon','public.venue_media','REFERENCES') a_vm_ref, has_table_privilege('anon','public.event_media','TRIGGER') a_em_trg,
    has_table_privilege('authenticated','public.event_media','DELETE') u_em_del, has_table_privilege('authenticated','public.venue_media','DELETE') u_vm_del`);
  await check("POST anon INSERT privilege is false on event_media and venue_media", async () => priv.a_em_ins === false && priv.a_vm_ins === false);
  await check("POST anon/authenticated TRUNCATE privilege is false on all three tables", async () => Object.entries(priv).filter(([k]) => k.endsWith("_trunc")).every(([, v]) => v === false));
  await check("POST anon UPDATE/DELETE/REFERENCES/TRIGGER false and authenticated DELETE false on media tables (S1)", async () => !priv.a_em_upd && !priv.a_pm_upd && !priv.a_pm_del && !priv.a_vm_ref && !priv.a_em_trg && !priv.u_em_del && !priv.u_vm_del);
  await check("POST both media status defaults are 'pending' and venue CHECK allows pending", async () => { const d = await su(db, "select c.relname, pg_get_expr(d.adbin,d.adrelid) e from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where c.oid in ('public.event_media'::regclass,'public.venue_media'::regclass) and a.attname='status'"); const k = await one(db, "select pg_get_constraintdef(oid,true) d from pg_constraint where conname='venue_media_status_check'"); return d.length === 2 && d.every((x) => /pending/.test(x.e)) && /pending/.test(k.d); });
  await check("POST S2 quarantine: 19 hidden, 0 orphan published, 19 backup rows, the one parented row untouched", async () => { const q = await one(db, "select (select count(*)::int from atlas_media_guard.orphan_event_media_backup) b, count(*) filter (where status='hidden')::int h, count(*) filter (where status='published')::int p from public.event_media m where not exists (select 1 from public.events e where e.slug=m.event_slug)"); return q.b === 19 && q.h === 19 && q.p === 0 && (await cnt("event_media", "event_slug='ev-pub' and status='published'")) === 1; });
  await check("POST function shapes: wrappers INVOKER + search_path '', private helpers DEFINER + search_path '', wrappers have no anon/PUBLIC execute, publish gate INVOKER + search_path ''", async () => {
    const f = await su(db, "select n.nspname, p.proname, p.prosecdef, coalesce(p.proconfig @> array['search_path=\"\"'], false) sp, has_function_privilege('anon',p.oid,'EXECUTE') a from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='atlas_media_guard' or (n.nspname='public' and p.proname in ('tag_event_media','tag_venue_media','profile_meta_publish_gate')) order by 1,2");
    const priv3 = f.filter((x) => x.nspname === "atlas_media_guard"), pub = f.filter((x) => x.nspname === "public");
    return priv3.length === 3 && priv3.every((x) => x.prosecdef && x.sp === true && x.a === false) && pub.length === 3 && pub.every((x) => !x.prosecdef && x.sp === true) && pub.filter((x) => x.proname !== "profile_meta_publish_gate").every((x) => x.a === false); });
  await check("POST rollback_guard holds exactly one fingerprint row; backup/guard tables are unreadable by anon/authenticated/service_role", async () => { const g = await one(db, "select count(*)::int n from atlas_media_guard.rollback_guard"); const a = await as(db, "authenticated", STR, "select * from atlas_media_guard.orphan_event_media_backup"); const b = await as(db, "anon", "", "select * from atlas_media_guard.rollback_guard"); const c = await as(db, "service_role", "", "select * from atlas_media_guard.orphan_event_media_backup"); return g.n === 1 && denied(a) && denied(b) && denied(c); });
  await check("POST Atlas section-4 post-check statements all execute (8 statements) and report 19/19/0", async () => { const r = await db.exec(PC); const last = r[r.length - 1].rows[0]; return r.length === 8 && Number(last.quarantine_backup_count) === 19 && Number(last.orphan_hidden_count) === 19 && Number(last.orphan_published_count) === 0; });
  // M1
  for (const [t, mk2] of [["event_media", (s) => evIns("ev-pub", "", s ? "status" : "", s ? "'published'" : "")], ["venue_media", (s) => vnIns("v-pub", s ? "status" : "", s ? "'published'" : "")]])
    for (const forgedPub of [false, true]) await check(`M1 anonymous direct INSERT into ${t} (${forgedPub ? "forged published" : "default status"}) denied, zero rows`, async () => { const r = await as(db, "anon", "", mk2(forgedPub)); return denied(r) && (await cnt(t)) === (t === "event_media" ? e0 : v0); });
  // M2
  await check("M2 non-owner authenticated direct INSERT denied by RLS on published + draft parents, with RETURNING and as upsert; zero rows", async () => {
    const rs = [await as(db, "authenticated", STR, evIns("ev-pub", "returning id", "status", "'pending'")), await as(db, "authenticated", STR, evIns("ev-draft", "", "status", "'pending'")),
      await as(db, "authenticated", STR, evIns("ev-pub", "on conflict (id) do update set title='x'", "status", "'pending'")), await as(db, "authenticated", STR, vnIns("v-pub", "status", "'pending'")), await as(db, "authenticated", STR, vnIns("v-draft", "status", "'pending'"))];
    return rs.every(RLSV) && (await cnt("event_media")) === e0 && (await cnt("venue_media")) === v0; });
  // M3
  let evId, vnId;
  await check("M3 mapped owner INSERT with omitted status lands 'pending' (event and venue) and RETURNING works", async () => {
    const a = await as(db, "authenticated", OWN, evIns("ev-draft", "returning id, status")); const b = await as(db, "authenticated", OWN, vnIns("v-draft").replace(/$/, " returning id, status"));
    evId = a.rows?.[0]?.id; vnId = b.rows?.[0]?.id; return !a.err && !b.err && a.rows[0].status === "pending" && b.rows[0].status === "pending"; });
  await check("M3 other signed-in user and anon cannot read the pending rows; owner can", async () => { const q = (id1, id2) => `select count(*)::int c from (select id from public.event_media where id=${id1} union all select id from public.venue_media where id=${id2}) z`;
    const s = await as(db, "authenticated", STR, q(evId, vnId)); const an = await as(db, "anon", "", q(evId, vnId)); const o = await as(db, "authenticated", OWN, q(evId, vnId)); return s.rows[0].c === 0 && an.rows[0].c === 0 && o.rows[0].c === 2; });
  // M4
  await check("M4 submitted_by owner (no profile mapping) can INSERT pending on own draft event; unrelated user cannot", async () => { const a = await as(db, "authenticated", SUB, evIns("ev-sub", "returning status")); const b = await as(db, "authenticated", STR, evIns("ev-sub")); return !a.err && a.rows[0].status === "pending" && RLSV(b); });
  await check("M4 owner of ANOTHER profile cannot insert for this profile's event", async () => { const r = await as(db, "authenticated", OWN2, evIns("ev-draft", "", "status", "'pending'")); return RLSV(r); });
  // M5
  await check("M5 owner INSERT with status published/hidden/NULL/arbitrary denied (event and venue)", async () => {
    const rs = []; for (const s of ["'published'", "'hidden'", "null", "'bogus'"]) { rs.push(await as(db, "authenticated", OWN, evIns("ev-draft", "", "status", s))); rs.push(await as(db, "authenticated", OWN, vnIns("v-draft", "status", s))); }
    return rs.every((r) => !!r.err); });
  await check("M5 event pending_upload accepted for owner; venue pending_upload denied; invalid kind fails existing CHECK", async () => {
    const a = await as(db, "authenticated", OWN, evIns("ev-draft", "returning status", "status", "'pending_upload'")); const b = await as(db, "authenticated", OWN, vnIns("v-draft", "status", "'pending_upload'")); const c = await as(db, "authenticated", OWN, evIns("ev-draft", "", "kind,status", "'bogus','pending'"));
    return !a.err && a.rows[0].status === "pending_upload" && !!b.err && !!c.err && /check constraint|violates/i.test(c.err); });
  // M6
  await check("M6 fan calls original tag RPC signatures on published parents: id returned, count +1 each, author from session, status pending, not publicly readable", async () => {
    const before = [await cnt("event_media"), await cnt("venue_media")];
    const a = await as(db, "authenticated", STR, "select public.tag_event_media('ev-pub','image','https://x.test/f.jpg','fan','https://src.test') id"); const b = await as(db, "authenticated", STR, "select public.tag_venue_media('v-pub','image','https://x.test/g.jpg','fan','https://src.test', true) id");
    if (a.err || b.err) return a.err || b.err; const rows = [await one(db, `select status, author_handle from public.event_media where id=${a.rows[0].id}`), await one(db, `select status, author_handle, is_artist from public.venue_media where id=${b.rows[0].id}`)];
    const pubRead = await as(db, "anon", "", `select count(*)::int c from public.event_media where id=${a.rows[0].id}`);
    return (await cnt("event_media")) === before[0] + 1 && (await cnt("venue_media")) === before[1] + 1 && rows.every((r) => r.status === "pending" && r.author_handle === "str") && pubRead.rows[0].c === 0; });
  await check("M6 the RPC signatures expose no status/evidence argument (5 and 6 args, unchanged names/return type)", async () => { const f = await su(db, "select proname, pg_get_function_identity_arguments(p.oid) a, pg_get_function_result(p.oid) r from pg_proc p where pronamespace='public'::regnamespace and proname in ('tag_event_media','tag_venue_media') order by 1"); return f.length === 2 && f.every((x) => x.r === "bigint" && !/status/.test(x.a)) && f[0].a.split(",").length === 5 && f[1].a.split(",").length === 6; });
  // M7
  await check("M7 anonymous cannot call the wrappers or any private function, nor see the private schema; no row added", async () => {
    const before = await cnt("event_media");
    const rs = [await as(db, "anon", "", "select public.tag_event_media('ev-pub','image','u','t')"), await as(db, "anon", "", "select public.tag_venue_media('v-pub','image','u','t')"), await as(db, "anon", "", "select atlas_media_guard.submit_event_media('ev-pub','image','u','t')"),
      await as(db, "anon", "", "select atlas_media_guard.owns_parent('event','ev-pub')")]; return rs.every(denied) && (await cnt("event_media")) === before; });
  // M8
  await check("M8 fan RPC on absent parent and on someone else's draft denied; owner on own draft accepted pending; invalid kind rejected; quarantine unchanged", async () => {
    const a = await as(db, "authenticated", STR, "select public.tag_event_media('ev-nope','image','u','t')"); const b = await as(db, "authenticated", STR, "select public.tag_event_media('ev-draft','image','u','t')");
    const c = await as(db, "authenticated", OWN, "select public.tag_event_media('ev-draft','image','u','t') id"); const d = await as(db, "authenticated", STR, "select public.tag_event_media('ev-pub','bogus','u','t')"); const e = await as(db, "authenticated", STR, "select public.tag_venue_media('v-nope','image','u','t')");
    const st = !c.err && (await one(db, `select status from public.event_media where id=${c.rows[0].id}`)).status === "pending"; const hid = await cnt("event_media", "event_slug like 'orphan-%' and status='hidden'");
    return !!a.err && !!b.err && st && !!d.err && !!e.err && hid === 19; });
  // M10
  await check("M10 owner cannot UPDATE pending -> published (0 rows); service_role can after review; public read then exposes only the reviewed row", async () => {
    const o = await as(db, "authenticated", OWN, `update public.event_media set status='published' where id=${evId}`); const still = (await one(db, `select status from public.event_media where id=${evId}`)).status;
    const s = await as(db, "service_role", "", `update public.event_media set status='published' where id=${evId} and status in ('pending','pending_upload')`); const seen = await as(db, "anon", "", `select count(*)::int c from public.event_media where id=${evId}`);
    return !o.err && o.n === 0 && still === "pending" && s.n === 1 && seen.rows[0].c === 1; });
  await check("M10 anon still reads only published curated rows (hidden orphans and pending rows invisible)", async () => { const r = await as(db, "anon", "", "select count(*)::int c, count(*) filter (where status<>'published')::int np from public.event_media"); return r.rows[0].np === 0 && r.rows[0].c === (await cnt("event_media", "status='published'")); });
  // M12 (last: service_role TRUNCATE empties venue_media)
  await check("M12 anon and authenticated TRUNCATE denied on all three tables; service_role maintenance TRUNCATE still works", async () => {
    const rs = []; for (const t of ["event_media", "venue_media", "profile_meta"]) { rs.push(await as(db, "anon", "", `truncate table public.${t}`)); rs.push(await as(db, "authenticated", OWN, `truncate table public.${t}`)); }
    const s = await as(db, "service_role", "", "truncate table public.venue_media"); return rs.every((r) => /permission denied/i.test(r.err || "")) && !s.err && (await cnt("venue_media")) === 0; });
  return res;
}


/* ---------- X2: coexistence with the checklist's "Step 1 additions" (column grants for authenticated on profile_meta) ---------- */
async function suiteStep1Coexist(db) {
  const { res, check } = mk(); const cols = PAYLOAD_KEYS.join(",");
  await db.exec(`revoke insert, update on table public.profile_meta from authenticated; grant insert (${cols}) on table public.profile_meta to authenticated; grant update (${cols}) on table public.profile_meta to authenticated;`);
  await seed(db, {});
  await check("X2 with 19-column grants: the live 19-key upsert with edited content still succeeds and the trigger still resets review", async () => { const r = await as(db, "authenticated", OWN, upsertSql({ bio: "edited" })); return !r.err && isReset(await getRow(db, "pub-a")); });
  await check("X2 with 19-column grants: the no-op upsert keeps the row published", async () => { await seed(db, {}); const r = await as(db, "authenticated", OWN, upsertSql({})); return !r.err && (await getRow(db, "pub-a")).status === "published"; });
  await check("X2 with 19-column grants: first-save upsert of a new owned slug (INSERT leg) works and lands as review", async () => { await db.exec(`insert into public.profile_owners(profile_slug,owner_id) values ('new-a','${OWN}')`); const r = await as(db, "authenticated", OWN, upsertSql({ slug: "new-a" })); const row = await getRow(db, "new-a"); await db.exec("delete from public.profile_meta where slug='new-a'; delete from public.profile_owners where profile_slug='new-a'"); return !r.err && isReset(row); });
  await check("X2 with 19-column grants: writing status/sources/last_reviewed_at is refused at the privilege layer (column ACL) before the trigger", async () => { await seed(db, {}); const rs = [await as(db, "authenticated", OWN, "update public.profile_meta set status='published' where slug='pub-a'"), await as(db, "authenticated", OWN, "update public.profile_meta set sources='[]'::jsonb where slug='pub-a'"), await as(db, "authenticated", OWN, "update public.profile_meta set last_reviewed_at=now() where slug='pub-a'")]; return rs.every((r) => /permission denied for table profile_meta/.test(r.err || "")); });
  await check("X2 with 19-column grants: authenticated has no TRUNCATE (also after the REVOKE TRUNCATE in the proposal)", async () => (await as(db, "authenticated", OWN, "truncate table public.profile_meta")).err?.includes("permission denied") === true);
  return res;
}

/* ---------- D1 drift: single-point mutations of the replica AFTER its fingerprint was taken must abort the forward ---------- */
const DRIFTS = [
  ["extra policy on event_media", "create policy zz_extra on public.event_media for select using (true)", /Catalog drift/],
  ["ACL change: anon SELECT revoked on profile_meta", "revoke select on public.profile_meta from anon", /Catalog drift/],
  ["publish-gate trigger disabled", "alter table public.profile_meta disable trigger profile_meta_publish_gate_trg", /Catalog drift/],
  ["is_admin() body changed", "create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select true $$", /Catalog drift/],
  ["unrelated public function added", "create function public.some_new_fn() returns int language sql as 'select 1'", /Catalog drift/],
  ["column default changed", "alter table public.event_media alter column status set default 'hidden'", /Catalog drift/],
  ["global postgres function default privileges present", "alter default privileges for role postgres grant execute on functions to anon", /Global function\/schema\/table defaults/],
  ["private schema already exists", "create schema atlas_media_guard", /Private schema already exists/]];
async function driftChecks(fw0 /* forward text with baseline literal intact */, mutated /* true for the negative control */) {
  const { res, check } = mk();
  for (const [label, ddl, re] of DRIFTS) await check(`D1 forward aborts before any change on drift: ${label}`, async () => {
    const db = await open(); try { const F0 = await fingerprint(db); await db.exec(ddl); const r = await tx(db, patch(fw0, F0));
      const st = await one(db, "select to_regclass('atlas_media_guard.orphan_event_media_backup') is null a, (select count(*)::int from public.event_media where status='hidden') h, (select with_check from pg_policies where tablename='event_media' and policyname='event_media_ins') w");
      const untouched = st.a === true && st.h === 0 && st.w === "true";
      return !r.ok && re.test(r.err) && untouched; } finally { await db.close(); } });
  await check("D1 STALE-BASELINE demonstration: the committed forward with Atlas's literal baseline c917a7df... aborts on a catalog it does not match", async () => {
    const db = await open(); try { const r = await tx(db, fw0); return !r.ok && /Catalog drift/.test(r.err); } finally { await db.close(); } });
  return res;
}

/* ---------- R: rollback ---------- */
async function rollbackChecks() {
  const { res, check } = mk();
  await check("R1 forward then rollback restores the ORIGINAL catalog fingerprint exactly, restores the 19 orphan statuses, drops the guard schema, and re-opens the old behaviour", async () => {
    const w = await worldFwd(); try {
      const before = await fingerprint(w.db); const r = await tx(w.db, w.rb); if (!r.ok) return r.err;
      const f = await fingerprint(w.db); const s = await one(w.db, "select (select count(*)::int from public.event_media where status='published' and event_slug like 'orphan-%') pub, exists(select 1 from pg_namespace where nspname='atlas_media_guard') g, has_table_privilege('anon','public.event_media','INSERT') ai, has_table_privilege('authenticated','public.profile_meta','TRUNCATE') tr");
      return f === w.F0 && before !== w.F0 && s.pub === 19 && !s.g && s.ai === true && s.tr === true; } finally { await w.db.close(); } });
  await check("R1 after rollback the pre-proposal behaviour is back (owner can forge publication; anon can insert media) - rollback restores the old vulnerabilities, as Atlas states", async () => {
    const w = await worldFwd(); try { const r = await tx(w.db, w.rb); if (!r.ok) return r.err;
      await w.db.exec(`insert into public.profile_owners(profile_slug,owner_id) values ('new-a','${OWN}')`);
      const a = await as(w.db, "authenticated", OWN, `insert into public.profile_meta(slug,display_name,account_type,entity_category,about,location,avatar_url,status,sources,last_reviewed_at) values ('new-a','N','editorial_artist','dj','a','LA','https://x/y.png','published','[{"url":"https://f.test","http_status":"200"}]'::jsonb, now())`);
      const b = await as(w.db, "anon", "", "insert into public.event_media(event_slug,media_url,status) values ('ev-pub','u','published')"); return !a.err && !b.err; } finally { await w.db.close(); } });
  await check("R1b rollback ABORTS (and changes nothing) while a pending venue submission exists", async () => {
    const w = await worldFwd(); try { await w.db.exec("insert into public.venue_media(venue_slug,media_url,status) values ('v-pub','u','pending')");
      const r = await tx(w.db, w.rb); const s = await one(w.db, "select exists(select 1 from pg_namespace where nspname='atlas_media_guard') g, (select count(*)::int from public.venue_media where status='pending') p, (select count(*)::int from public.event_media where status='hidden') h");
      return !r.ok && /Pending venue submissions exist/.test(r.err) && s.g && s.p === 1 && s.h === 19; } finally { await w.db.close(); } });
  await check("R2 rollback ABORTS before restoring anything when a patched policy was edited after forward", async () => {
    const w = await worldFwd(); try { await w.db.exec("create policy zz_late on public.venue_media for select using (true)"); const r = await tx(w.db, w.rb);
      const s = await one(w.db, "select (select count(*)::int from public.event_media where status='hidden') h, exists(select 1 from pg_namespace where nspname='atlas_media_guard') g"); return !r.ok && /Forward catalog changed/.test(r.err) && s.h === 19 && s.g; } finally { await w.db.close(); } });
  await check("R2 rollback ABORTS (nothing restored) when a PATCHED policy (event_media_ins) was edited after forward - the silent-overwrite case", async () => {
    const w = await worldFwd(); try { await w.db.exec("drop policy event_media_ins on public.event_media; create policy event_media_ins on public.event_media for insert to authenticated with check (status = 'pending')"); const r = await tx(w.db, w.rb);
      const s = await one(w.db, "select (select count(*)::int from public.event_media where status='hidden') h, (select with_check from pg_policies where policyname='event_media_ins') w"); return !r.ok && /Forward catalog changed/.test(r.err) && s.h === 19 && /pending/.test(s.w); } finally { await w.db.close(); } });
  await check("R2 rollback ABORTS when an unrelated public routine changed after forward", async () => {
    const w = await worldFwd(); try { await w.db.exec("create function public.late_fn() returns int language sql as 'select 2'"); const r = await tx(w.db, w.rb); return !r.ok && /Forward catalog changed/.test(r.err); } finally { await w.db.close(); } });
  await check("R2 rollback ABORTS if a quarantined row's content changed (no clobber of later media edits)", async () => {
    const w = await worldFwd(); try { await w.db.exec("update public.event_media set title='edited later' where event_slug='orphan-3'"); const r = await tx(w.db, w.rb); return !r.ok && /Quarantined rows changed/.test(r.err); } finally { await w.db.close(); } });
  await check("R3 forward, rollback, forward again succeeds (re-runnable on the same catalog) and ends with a stored guard fingerprint", async () => {
    const w = await worldFwd(); try { const r = await tx(w.db, w.rb); if (!r.ok) return r.err; const again = await tx(w.db, w.fw); return again.ok && (await one(w.db, "select count(*)::int n from atlas_media_guard.rollback_guard")).n === 1; } finally { await w.db.close(); } });
  await check("FP the fingerprint is search_path-sensitive: Appendix C under an empty search_path differs from the value under 'public, extensions' that the forward computes with", async () => {
    const db = await open(); try { const a = await fingerprint(db, "public, extensions"); const b = await fingerprint(db, "''"); const c = await fingerprint(db, "public, extensions"); return a === c && a !== b; } finally { await db.close(); } });
  await check("GR the added read-only gate-readiness query returns 2/0 on the clean replica and 3/1 once an evidence-less published row exists", async () => {
    const db = await open(); try { const a = (await db.query(GR)).rows[0]; await db.exec("alter table public.profile_meta disable trigger profile_meta_publish_gate_trg"); await seed(db, { slug: "legacy-x", sources: [], last_reviewed_at: null }); const b = (await db.query(GR)).rows[0];
      return Number(a.published_rows) === 2 && Number(a.published_failing_gate) === 0 && Number(b.published_rows) === 3 && Number(b.published_failing_gate) === 1; } finally { await db.close(); } });
  return res;
}

/* ---------- run ---------- */
const report = []; let allPos = true; const negRows = [];
async function runSuite(label, fn) { const r = await fn(); for (const x of r) { report.push({ scen: label, ...x }); if (!x.ok) allPos = false; } return r; }

{ const w = await worldFwd(); try {
  const c = await runSuite("CONNECT (forward applied to replica)", () => suiteConnect(w.db));
  const m = await runSuite("MEDIA (forward applied to replica)", () => suiteMedia(w.db)); } finally { await w.db.close(); } }
{ const w = await worldFwd(); try { await runSuite("COEXISTENCE X2 (forward + Step-1-style column grants)", () => suiteStep1Coexist(w.db)); } finally { await w.db.close(); } }
await runSuite("DRIFT D1", () => driftChecks(FW0));
await runSuite("ROLLBACK R / FP", () => rollbackChecks());

/* ---------- negative controls: each mutated forward must FAIL the specific cases it is meant to fail ---------- */
const NEG = [
  ["N1 owner-guard intact but the old published-row early return is KEPT", (s) => mutate(s, " if new.status is distinct from 'published' then\n return new;\n end if;\n\n if nullif", " if new.status is distinct from 'published' then\n return new;\n end if;\n if tg_op = 'UPDATE' and old.status = 'published' then return new; end if;\n\n if nullif", "early return"), "connect", [/^C8b/, /^C8c/, /^C8d/, /^X1-INFO/]],
  ["N2 owner INSERT guard omitted", (s) => mutate(s, " if new.status is distinct from 'review'\n or new.sources is distinct from '[]'::jsonb\n or new.last_reviewed_at is not null then\n raise exception 'publication evidence is server-managed' using errcode='42501';\n end if;\n else", " null;\n else", "insert guard"), "connect", [/^C2 owner INSERT \(status=published \+ evidence\)/, /^C2 owner INSERT \(sources only\)/, /^C2 owner INSERT \(last_reviewed_at only\)/, /^C2 owner INSERT \(upsert/]],
  ["N3 owner UPDATE evidence guard omitted", (s) => mutate(s, " if new.status is distinct from old.status\n or new.sources is distinct from old.sources\n or new.last_reviewed_at is distinct from old.last_reviewed_at then\n raise exception 'publication evidence is server-managed' using errcode='42501';\n end if;\n if new.slug", " if new.slug", "update guard"), "connect", [/^C1 owner UPDATE forging status/, /^C1 owner UPDATE forging sources/, /^C1 owner UPDATE forging last_reviewed_at/, /^C6 owner changes content AND forges/]],
  ["N4 content-edit review reset omitted", (s) => mutate(s, " if old.status = 'published' then new.status := 'review'; end if;\n new.sources := '[]'::jsonb;\n new.last_reviewed_at := null;\n new.updated_at := statement_timestamp();", " null;", "reset"), "connect", [/^C3 owner edit of display_name/, /^C3 combined/, /^C4 19-key owner upsert with changed/, /^C7/]],
  ["N5 TRUNCATE revoke omitted", (s) => mutate(s, "REVOKE TRUNCATE ON TABLE public.event_media,public.venue_media,public.profile_meta\n FROM anon,authenticated;", "", "truncate revoke"), "media", [/^POST anon\/authenticated TRUNCATE/, /^M12/]],
  ["N6 event insert policy also admits status 'published'", (s) => mutate(s, "WITH CHECK (status IN ('pending','pending_upload')", "WITH CHECK (status IN ('pending','pending_upload','published')", "ins policy"), "media", [/^M5 owner INSERT with status published/]],
  ["N7 owner-read policy omitted (INSERT ... RETURNING for the upload tool breaks)", (s) => mutate(s, "CREATE POLICY atlas_event_media_owner_read ON public.event_media AS PERMISSIVE\n FOR SELECT TO authenticated\n USING (atlas_media_guard.owns_parent('event',event_slug));", "", "owner read"), "media", [/^M3 mapped owner INSERT/, /^M5 event pending_upload accepted/]],
  ["N8 anon INSERT revoke omitted (RLS alone, no ACL layer)", (s) => mutate(s, "REVOKE INSERT ON TABLE public.event_media,public.venue_media FROM anon;", "", "anon insert revoke"), "media", [/^POST anon INSERT privilege/]],
  ["N9 S1 revoke of anon UPDATE/DELETE/REFERENCES/TRIGGER omitted", (s) => mutate(s, "REVOKE UPDATE,DELETE,REFERENCES,TRIGGER ON TABLE public.event_media,public.venue_media,public.profile_meta FROM anon;", "", "S1"), "media", [/^POST anon UPDATE\/DELETE/]],
  ["N10 fan RPC wrapper keeps publishing (private submit_event_media inserts 'published')", (s) => mutate(s, "p_slug,coalesce(p_kind,'image'),p_media_url,p_title,v_handle,p_source_url,'pending')", "p_slug,coalesce(p_kind,'image'),p_media_url,p_title,v_handle,p_source_url,'published')", "rpc published"), "media", [/^M6 fan calls original tag RPC/]],
];
for (const [id, mut, kind, expect] of NEG) {
  let w; try { w = await worldFwd(mut); } catch (e) { negRows.push({ id, ok: false, note: "mutated forward did not apply: " + e.message }); continue; }
  try { const r = kind === "connect" ? await suiteConnect(w.db) : await suiteMedia(w.db); const failed = r.filter((x) => !x.ok);
    const missed = expect.filter((re) => !failed.some((x) => re.test(x.name))); const collateral = failed.filter((x) => !expect.some((re) => re.test(x.name)));
    negRows.push({ id, ok: missed.length === 0, note: `${failed.length} of ${r.length} checks failed; expected-failures-missed=${missed.length}; other failures=${collateral.length}${collateral.length ? " (" + collateral.slice(0, 3).map((x) => x.name.slice(0, 60)).join(" | ") + ")" : ""}` }); }
  finally { await w.db.close(); } }
{ // N11: drift check bypassed -> D1 checks must FAIL
  const fw = mutate(FW0, `IF v_fingerprint IS DISTINCT FROM '${ORIG_FP}' THEN`, "IF false THEN", "drift bypass"); const r = await driftChecks(fw, true); const failed = r.filter((x) => !x.ok);
  negRows.push({ id: "N11 drift check bypassed (IF false)", ok: failed.some((x) => /extra policy/.test(x.name)) && failed.some((x) => /STALE-BASELINE/.test(x.name)), note: `${failed.length} of ${r.length} D1 checks failed` }); }
{ // N12: rollback without its forward-state pre-check -> the silent-overwrite case (R2) would NOT be stopped
  const w = await worldFwd(); try { const rbNo = mutate(w.rb, "IF v_fingerprint IS DISTINCT FROM v_expected THEN", "IF false THEN", "rollback precheck");
    await w.db.exec("drop policy event_media_ins on public.event_media; create policy event_media_ins on public.event_media for insert to authenticated with check (status = 'pending')"); const r = await tx(w.db, rbNo);
    negRows.push({ id: "N12 rollback forward-state pre-check bypassed", ok: r.ok === true, note: r.ok ? "rollback silently overwrote the later policy edit (so R2 'patched policy edited' check would FAIL)" : "still stopped: " + r.err.slice(0, 80) }); } finally { await w.db.close(); } }

/* ---------- report ---------- */
let pass = 0, fail = 0; for (const r of report) r.ok ? pass++ : fail++;
{ const t = await open(); console.log("PGlite stand-in proof for Atlas proposal v2 (replica, not production). " + (await one(t, "select version() v")).v); await t.close(); }
console.log("PGlite stand-in proof for Atlas proposal v2 (replica, not production)");
console.log("POSITIVE CHECKS: " + (pass + fail) + " run, " + pass + " pass, " + fail + " fail");
let last = ""; for (const r of report) { if (r.scen !== last) { console.log("\n== " + r.scen); last = r.scen; } console.log((r.ok ? "PASS " : "FAIL ") + r.name + (r.ok ? "" : "\n       -> " + r.why.slice(0, 600))); }
console.log("\nNEGATIVE CONTROLS (mutated proposal must fail the specific checks named):");
let negOk = true; for (const n of negRows) { if (!n.ok) negOk = false; console.log((n.ok ? "OK   " : "BAD  ") + n.id + "  [" + n.note + "]"); }
console.log("\nSUMMARY pass=" + pass + " fail=" + fail + " negatives=" + negRows.length + " negatives_all_caught=" + negOk);
process.exit(negOk && fail === 0 ? 0 : 1);
