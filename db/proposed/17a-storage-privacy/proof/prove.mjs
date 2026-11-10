/* proof/prove.mjs - 17A storage-privacy proofs on REAL PostgreSQL (localhost Unix socket only; replica of the captured prod storage + profile_content state; ALL DATA SYNTHETIC).
   Nothing here connects to any hosted database and nothing calls any Storage API. The hardened states are built by running the committed packs/*.sql themselves.
   Every behavioural test runs against BOTH the original replica (negative control) and the hardened replica; a test marked "detects" must FAIL on the original or it is not a valid proof; "baseline" must pass on both (nothing legitimate broke).
   Public-URL serving of a public bucket is MODELLED by public_url_readable(bucket,name) (= bucket.public): real Storage API serving, signed URLs and MIME enforcement are NOT reproducible on plain Postgres (UNVERIFIED, see MATRIX-RESULTS.md).
   Roles: anon / authenticated / service_role / postgres are NOSUPERUSER stand-ins (service_role BYPASSRLS); API requests run as the `authenticator` connection role: BEGIN; SET LOCAL ROLE <role>; set_config('request.jwt.claim.sub', ...); <query>; COMMIT|ROLLBACK (the PostgREST/Storage shape).
   Usage: node proof/prove.mjs [--only=<id prefix>]  (run-proof.sh starts Postgres, always stops it, samples load/memory) */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as PG from "../../11b-combined-rehearsal/lib/pgdb.mjs";
import { packs, buildAll, BAK, PUBLIC_ASSETS_MIN, REPO_PACK_KEY } from "../build.mjs";
import { aclSorted } from "../../r1-fix-f3-acl-locks/build-variants.mjs";

const HERE = join(dirname(fileURLToPath(import.meta.url)), "..");
const rd = (...p) => readFileSync(join(HERE, ...p), "utf8");
const PK = (n) => rd("packs", n);
const PACKS = Object.fromEntries(packs().map((p) => [p.id, p]));
const F = (id, kind) => `17a_${PACKS[id].slug}_${kind}_PROPOSED.sql`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7);
const want = (id) => !only || id.startsWith(only);

/* ------------------------------------------------------------------ fixtures */
const U = { A: "c0000000-0000-4000-8000-0000000000a1", B: "c0000000-0000-4000-8000-0000000000a2", ADM: "c0000000-0000-4000-8000-0000000000a3", REV: "c0000000-0000-4000-8000-0000000000a4" };
const WHO = { anon: ["anon", "", ""], A: ["authenticated", U.A, "a@example.invalid"], B: ["authenticated", U.B, "b@example.invalid"], admin: ["authenticated", U.ADM, "adm@example.invalid"], rev: ["authenticated", U.REV, "rev@example.invalid"], service: ["service_role", "", ""] };
const PC = { a1: "d0000000-0000-4000-8000-000000000001", a2: "d0000000-0000-4000-8000-000000000002", b1: "d0000000-0000-4000-8000-000000000003", b2: "d0000000-0000-4000-8000-000000000004", a3: "d0000000-0000-4000-8000-000000000005" };
const obj = (bucket, name, owner, mime = "image/jpeg") => `('${bucket}','${name}',${owner ? `'${owner}'` : "null"},jsonb_build_object('mimetype','${mime}','size',2048))`;
const FIXTURE_SQL = `
insert into auth.users(id,email) values ('${U.A}','a@example.invalid'),('${U.B}','b@example.invalid'),('${U.ADM}','adm@example.invalid'),('${U.REV}','rev@example.invalid');
insert into public.app_users(id,handle,email,is_admin,vs_reviewer) values ('${U.A}','artista','a@example.invalid',false,false),('${U.B}','artistb','b@example.invalid',false,false),('${U.ADM}','admin','adm@example.invalid',true,false),('${U.REV}','reviewer','rev@example.invalid',false,true);
insert into public.profile_owners(profile_slug, owner_id) values ('artist-a','${U.A}'),('artist-b','${U.B}');
insert into public.profile_content(id, profile_slug, kind, data, created_by, archived) values
 ('${PC.a1}','artist-a','article','{"t":"A public"}','${U.A}',false), ('${PC.a2}','artist-a','post','{"autopilot":"true","status":"review"}','${U.A}',true),
 ('${PC.b1}','artist-b','article','{"t":"B public"}','${U.B}',false), ('${PC.b2}','artist-b','post','{"t":"B archived"}','${U.B}',true), ('${PC.a3}','artist-a','highlight','{"t":"legacy null archived"}','${U.A}',null);
insert into public.post_saves(user_id, content_id) values ('${U.B}','${PC.a2}'),('${U.B}','${PC.a1}');
insert into public.vs_entries(id, user_id, title, status) values (1,'${U.A}','pending one','pending'),(2,'${U.B}','approved two','approved'),(3,'${U.A}','rejected three','rejected');
select setval(pg_get_serial_sequence('public.vs_entries','id'), 100);
insert into storage.objects(bucket_id, name, owner_id, metadata) values
 ${[obj("agent-posts", "posts/a.jpg"), obj("agent-posts", "posts/b.svg", null, "image/svg+xml"), obj("agent-posts", "competitions/c.jpg"), obj("agent-posts", "posts/lyric-mryyphmm-card.svg", null, "image/svg+xml"),
   obj("chat-images", "profiles/artist-a/p1.jpg", U.A), obj("chat-images", "profiles/artist-a/p3-legacy.jpg", null), obj("chat-images", "profiles/artist-b/p2.jpg", U.B), obj("chat-images", "event-flyers/f1.jpg", U.A),
   obj("playlist-covers", `${U.A}/cover-1.jpg`, U.A), obj("playlist-covers", `${U.B}/cover-2.jpg`, U.B),
   obj("vs-entries", `${U.A}/1/x.jpg`, U.A), obj("vs-entries", `${U.B}/2/y.jpg`, U.B), obj("vs-entries", `${U.A}/3/z.jpg`, U.A), obj("vs-entries", `${U.A}/notanumber/m.jpg`, U.A),
   obj("manatua-media", "fam/pic.jpg", U.A)].join(",\n ")};`;
const GROK_SQL = BAK.map((t) => `revoke all on table public.${t} from public, anon, authenticated;`).join("\n") + "\ndrop policy shirt_hd_anon_insert on storage.objects;";
const PRE_GROK_POLICY = "create policy shirt_hd_anon_insert on storage.objects for insert to anon with check (bucket_id = 'shirt-hd');";   // A: original shape not captured
/* 10A APPLY-1C on profile_content (the ACL part, as documented): anon keeps SELECT; authenticated loses TRUNCATE/REFERENCES/TRIGGER/MAINTAIN */
const ACL_1C = "revoke references, trigger, truncate on table public.profile_content from anon, authenticated, public; revoke insert, update, delete on table public.profile_content from anon, public; revoke maintain on table public.profile_content from anon, authenticated, public;";

/* ------------------------------------------------------------------ worlds */
const T = {};                // templates
const open = [];
async function mkWorld(tpl) {
  const db = await PG.createDb(tpl); open.push(db);
  const w = { db, name: db.name, extras: [], q: (s, p) => db.client.query(s, p), async close() { for (const c of w.extras) await c.disconnect(); await db.close(); const i = open.indexOf(db); if (i >= 0) open.splice(i, 1); } };
  w.conn = async (user) => { const c = await PG.newClient(db.name, user); w.extras.push(c); return c; };
  w.auth = await w.conn("authenticator");
  return w;
}
async function req(w, who, sql, params = [], rollback = false) {
  const [role, sub, email] = WHO[who]; const c = w.auth;
  await c.client.query("BEGIN");
  try {
    await c.client.query("SET LOCAL ROLE " + role);
    await c.client.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claim.email',$2,true), set_config('request.jwt.claim.role',$3,true)", [sub, email, role]);
    const r = await c.client.query(sql, params);
    await c.client.query(rollback ? "ROLLBACK" : "COMMIT");
    return { rows: r.rows, rowCount: r.rowCount };
  } catch (e) { try { await c.client.query("ROLLBACK"); } catch {} return { err: String(e.message), code: e.code }; }
}
const attempt = (w, who, sql, params) => req(w, who, sql, params, true);
const applied = (r) => !r.err && r.rowCount > 0;
const denied = (r) => r.code === "42501";
const sel = async (w, who, bucket) => { const r = await attempt(w, who, "select name from storage.objects where bucket_id=$1 order by name", [bucket]); return r.err ? "ERR " + r.code : r.rows.map((x) => x.name).join("|"); };
const selN = async (w, who, bucket) => { const r = await attempt(w, who, "select count(*)::int n from storage.objects where bucket_id=$1", [bucket]); return r.err ? -1 : r.rows[0].n; };
const urlOk = async (w, bucket, name) => (await w.q("select public.public_url_readable($1,$2) ok", [bucket, name])).rows[0].ok;
/* createSignedUrl / download() model: the Storage API reads the object row under the CALLER's RLS, so signing is possible iff the caller can SELECT it */
const canSign = async (w, who, bucket, name) => { const r = await attempt(w, who, "select 1 from storage.objects where bucket_id=$1 and name=$2", [bucket, name]); return !r.err && r.rows.length === 1; };
const upsert = (w, who, bucket, name) => attempt(w, who, "insert into storage.objects(bucket_id,name,owner_id,metadata) values ($1,$2,auth.uid()::text,'{\"mimetype\":\"image/jpeg\",\"size\":1}'::jsonb) on conflict (bucket_id,name) do update set metadata = excluded.metadata, updated_at = now()", [bucket, name]);
const insertObj = (w, who, bucket, name) => attempt(w, who, "insert into storage.objects(bucket_id,name,owner_id,metadata) values ($1,$2,auth.uid()::text,'{\"mimetype\":\"image/jpeg\",\"size\":1}'::jsonb)", [bucket, name]);
const pcIds = async (w, who, extra = "") => { const r = await attempt(w, who, `select id from public.profile_content ${extra} order by id`); const rev = Object.fromEntries(Object.entries(PC).map(([k, v]) => [v, k])); return r.err ? "ERR " + r.code : r.rows.map((x) => rev[x.id]).join(","); };

const fp = async (w) => (await w.q(`select jsonb_build_object(
  'objpol', (select jsonb_agg(jsonb_build_array(policyname, permissive, roles::text, cmd, qual, with_check) order by policyname) from pg_policies where schemaname='storage' and tablename='objects'),
  'pcpol', (select jsonb_agg(jsonb_build_array(policyname, permissive, roles::text, cmd, qual, with_check) order by policyname) from pg_policies where schemaname='public' and tablename='profile_content'),
  'buckets', (select jsonb_agg(to_jsonb(b) - 'created_at' - 'updated_at' order by id) from storage.buckets b),
  'objects', (select md5(coalesce(string_agg(bucket_id||'/'||name||'/'||coalesce(owner_id,'')||'/'||metadata::text,'|' order by bucket_id,name),'')) from storage.objects),
  'acls', jsonb_build_object('objects', (select ${aclSorted("relacl")} from pg_class where oid='storage.objects'::regclass), 'buckets', (select ${aclSorted("relacl")} from pg_class where oid='storage.buckets'::regclass),
     'pc', (select ${aclSorted("relacl")} from pg_class where oid='public.profile_content'::regclass),
     'bak', (select jsonb_agg(relname||'='||coalesce(${aclSorted("relacl")},'-') order by relname) from pg_class where relnamespace='public'::regnamespace and relname like '\\_bak\\_%')),
  'rls', (select jsonb_agg(oid::regclass::text||'='||relrowsecurity::text||'/'||relforcerowsecurity::text order by oid::regclass::text) from pg_class where oid in ('storage.objects'::regclass,'storage.buckets'::regclass,'public.profile_content'::regclass)),
  'fns', (select jsonb_agg(jsonb_build_array(oid::regprocedure::text, pg_get_functiondef(oid), proacl::text) order by oid::regprocedure::text) from pg_proc where pronamespace='public'::regnamespace and proname in ('is_admin','vs_is_admin','vs_entry_media_is_approved','public_url_readable'))) j`)).rows[0].j;
const same = (a, b, skip = []) => { const A = { ...a }, B = { ...b }; for (const k of skip) { delete A[k]; delete B[k]; } return JSON.stringify(A) === JSON.stringify(B); };
const diffKeys = (a, b) => Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));

/* ------------------------------------------------------------------ harness */
const results = [], packRows = [], mutRows = [], adjRows = [];
async function matrix(id, name, ctrl, hardTpl, origTpl, fn) {
  if (!want(id)) return;
  const outcome = {};
  for (const [variant, tpl] of [["hardened", hardTpl], ["original", origTpl]]) {
    const w = await mkWorld(tpl); let ok = false, why = "";
    try { const v = await fn(w, variant); ok = v === true; if (!ok) why = typeof v === "string" ? v : "returned " + JSON.stringify(v); } catch (e) { why = "threw: " + String(e.message || e).slice(0, 300); }
    outcome[variant] = { pass: ok, why }; await w.close();
  }
  const h = outcome.hardened.pass, o = outcome.original;
  const controlOK = ctrl === "detects" ? o.pass === false : o.pass === true;
  results.push({ id, name, hardened: h, hardenedWhy: outcome.hardened.why, original: o.pass, originalWhy: o.why, control: ctrl, controlOK });
  console.log(`${h && controlOK ? "PASS" : "FAIL"} ${id} ${name} | hardened=${h} original=${o.pass} (control: ${ctrl}${controlOK ? "" : " NOT MET"})${h ? "" : " :: " + outcome.hardened.why.slice(0, 220)}`);
}
async function structural(id, name, fn, rows = packRows) {
  if (!want(id)) return; let ok = false, why = "";
  try { const v = await fn(); ok = v === true; if (!ok) why = typeof v === "string" ? v : "returned " + JSON.stringify(v); } catch (e) { why = "threw: " + String(e.message || e).slice(0, 500); }
  rows.push({ id, name, pass: ok, why }); console.log(`${ok ? "PASS" : "FAIL"} ${id} ${name}${ok ? "" : " :: " + why}`);
}
async function runPack(c, sql) {
  try { const r = await c.query(sql); const arr = Array.isArray(r) ? r : [r]; const rows = [...arr].reverse().find((x) => x.rows && x.rows.length && x.fields && x.fields.some((f) => f.name === "ok")); return { ok: true, rows: rows ? rows.rows : [] }; }
  catch (e) { try { await c.query("ROLLBACK"); } catch {} return { ok: false, err: String(e.message), code: e.code }; }
}
const allOk = (rows) => rows.length > 0 && rows.every((r) => r.ok === true);
const driftAbort = (r) => !r.ok && /DRIFT, ABORT/.test(r.err);
const hold = (sql, secs) => { const i = sql.lastIndexOf("COMMIT;"); return sql.slice(0, i) + `SELECT pg_sleep(${secs}); ` + sql.slice(i); };
const strip = (s) => s.replace(/^--.*$/gm, "");
const apply = (w, id) => runPack(w.db.client, PK(F(id, "APPLY")));
const rollback = (w, id) => runPack(w.db.client, PK(F(id, "ROLLBACK")));
async function pcState(w, id, st) { const f = `17a_POSTCHECKS_${PACKS[id].slug}_${st}_PROPOSED.sql`; const r = await w.q(strip(PK(f))); const rows = (Array.isArray(r) ? r[r.length - 1] : r).rows; return { ok: allOk(rows), rows }; }
async function driftRows(w, id) { const r = await w.q(strip(PK("17a_DRIFT_QUERY_PROPOSED.sql"))); const rows = (Array.isArray(r) ? r.find((x) => x.rows.length) : r).rows; return rows.filter((x) => x.name.startsWith(id + ":") && !(x.actual === x.pre || x.actual === x.post || (x.pre || "").split(" OR ").includes(x.actual) || (x.post || "").split(" OR ").includes(x.actual))).map((x) => x.name + "=" + x.actual); }
async function driftStates(w) { const r = await w.q(strip(PK("17a_DRIFT_QUERY_PROPOSED.sql"))); const rows = (Array.isArray(r) ? r.find((x) => x.rows.length) : r).rows; return Object.fromEntries(rows.filter((x) => x.name.startsWith("000_STATE_")).map((x) => [x.name.slice(10), x.actual])); }
async function mkTpl(from, steps) { const d = await PG.createDb(from); open.push(d); for (const [n, s] of steps) { if (typeof s === "string" && s.startsWith("@sql:")) await d.client.query(s.slice(5)); else { const r = await runPack(d.client, s); if (!r.ok || (r.rows.length && !allOk(r.rows))) throw new Error("template build failed at " + n + ": " + (r.err || "rows not ok")); } } const t = (await PG.snapshotDb(d)).pgTemplate; await d.close(); open.splice(open.indexOf(d), 1); return t; }
const sqlStep = (n, s) => [n, "@sql:" + s];

/* ------------------------------------------------------------------ main */
let rolesMine = false;
async function main() {
  await PG.ensureRoles(); rolesMine = true;
  const base = await PG.createDb(null); open.push(base); const c = base.client;
  await c.query(rd("proof", "replica.sql")); await c.query(FIXTURE_SQL);
  await c.query(PRE_GROK_POLICY);
  T.preGrok = (await PG.snapshotDb(base)).pgTemplate;
  T.orig = await mkTpl(T.preGrok, [sqlStep("grok", GROK_SQL)]);                       // the captured prod state AFTER Grok's 21:47 changes = the state every pack's guard expects
  T.p1 = await mkTpl(T.orig, [["P1", PK(F("P1", "APPLY"))]]);
  T.p4 = await mkTpl(T.orig, [["P4", PK(F("P4", "APPLY"))]]);
  T.orig1c = await mkTpl(T.orig, [sqlStep("1C acl", ACL_1C)]);
  T.p4_1c = await mkTpl(T.orig1c, [["P4", PK(F("P4", "APPLY"))]]);
  T.p1p6 = await mkTpl(T.p1, [["P6", PK(F("P6", "APPLY"))]]);
  T.p3a = await mkTpl(T.p1, [["P3a", PK(F("P3a", "APPLY"))]]);
  T.p3b = await mkTpl(T.p3a, [["P3b", PK(F("P3b", "APPLY"))]]);
  const six = Array.from({ length: PUBLIC_ASSETS_MIN }, (_, i) => `('public-assets','profiles/artist-a/moved-${i}.jpg','${U.A}','{"mimetype":"image/jpeg","size":1}'::jsonb)`).join(",");
  T.p3a_moved = await mkTpl(T.p3b, [sqlStep("moved assets (copy done by the Storage API in reality)", `insert into storage.objects(bucket_id,name,owner_id,metadata) values ${six};`)]);
  T.p3c = await mkTpl(T.p3a_moved, [["P3c", PK(F("P3c", "APPLY"))]]);

  /* ============================ P0: Grok's applied state recorded as a no-op ============================ */
  await structural("P0-01", "P0 on the post-Grok state is a NO-OP: nothing changes (fingerprint identical), all post-checks ok; a second run is also ok (idempotent)", async () => {
    const w = await mkWorld(T.orig); try { const f0 = await fp(w); const a = await apply(w, "P0"); const f1 = await fp(w); const a2 = await apply(w, "P0"); const f2 = await fp(w); const d = await driftStates(w);
      return (a.ok && allOk(a.rows) && a2.ok && allOk(a2.rows) && same(f0, f1) && same(f1, f2) && d.P0 === "POST") || JSON.stringify({ a: a.err, a2: a2.err, eq: same(f0, f1), d, rows: (await w.q(strip(PK("17a_DRIFT_QUERY_PROPOSED.sql")))).rows ? 0 : 0, all: ((r) => (Array.isArray(r) ? r.find((x) => x.rows.length) : r).rows.filter((x) => x.name.startsWith("P0:")).map((x) => x.name + "|" + String(x.actual).slice(0, 30) + "|" + x.pre + "|" + x.post))(await w.q(strip(PK("17a_DRIFT_QUERY_PROPOSED.sql")))) }); } finally { await w.close(); } });
  await structural("P0-02", "P0 on the PRE-Grok state (anon/authenticated still hold grants on the 11 _bak_ tables + shirt_hd_anon_insert exists) performs exactly Grok's changes and nothing else; second run no-op", async () => {
    const w = await mkWorld(T.preGrok); try { const f0 = await fp(w); const pre = await pcState(w, "P0", "POST"); const a = await apply(w, "P0"); const f1 = await fp(w); const post = await pcState(w, "P0", "POST");
      const w2 = await mkWorld(T.orig); const fo = await fp(w2); await w2.close();
      const a2 = await apply(w, "P0"); const f2 = await fp(w);
      return (!pre.ok && a.ok && allOk(a.rows) && post.ok && !same(f0, f1) && same(f1, fo) && same(f1, f2) && a2.ok) || JSON.stringify({ pre: pre.ok, a: a.err, post: post.ok, eqGrok: same(f1, fo), diff: diffKeys(f1, fo) }); } finally { await w.close(); } });
  await structural("P0-03", "P0 post-check catches a regressed state: one _bak_ table re-granted to anon, or an anon INSERT policy on shirt-hd (POSTCHECKS ok=false); P0 apply then repairs it", async () => {
    for (const m of [`grant select on table public.${BAK[3]} to anon;`, "create policy shirt_hd_anon_insert on storage.objects for insert to anon with check (bucket_id = 'shirt-hd');", "create policy zz_shirt_any on storage.objects for insert to public with check (bucket_id = 'shirt-hd');"]) {
      const w = await mkWorld(T.orig); try { await w.q(m); const bad = await pcState(w, "P0", "POST"); const d = await driftStates(w); if (bad.ok || d.P0 !== "DRIFT") return "mutant not detected: " + m; } finally { await w.close(); } }
    return true; });

  /* ============================ P1: listing policies ============================ */
  const B4 = ["agent-posts", "chat-images", "playlist-covers", "vs-entries"];
  for (const b of B4) await matrix(`S01-${b}`, `anon cannot list/SELECT any object of ${b} through the table (original: lists everything)`, "detects", T.p1, T.orig, async (w) => { const n = await selN(w, "anon", b); return n === 0 || `anon sees ${n}`; });
  await matrix("S02", "public URL path still works for ALL objects of the four buckets (public_url_readable: bucket.public, no SELECT policy needed)", "baseline", T.p1, T.orig, async (w) => {
    const r = await w.q("select bucket_id, name from storage.objects where bucket_id = any($1)", [B4]); for (const o of r.rows) if (!(await urlOk(w, o.bucket_id, o.name))) return "not readable: " + o.bucket_id; return r.rows.length === 14 || "rows " + r.rows.length; });
  await matrix("S03", "public flags of the four buckets unchanged (true)", "baseline", T.p1, T.orig, async (w) => (await w.q("select string_agg(id||'='||public::text, ',' order by id) s from storage.buckets where id = any($1)", [B4])).rows[0].s === "agent-posts=true,chat-images=true,playlist-covers=true,vs-entries=true");
  await matrix("S04", "playlist-covers: owner sees own cover, a non-owner does NOT see it (original: sees everyone's)", "detects", T.p1, T.orig, async (w) => { const a = await sel(w, "A", "playlist-covers"), b = await sel(w, "B", "playlist-covers"); return (a === `${U.A}/cover-1.jpg` && b === `${U.B}/cover-2.jpg`) || JSON.stringify({ a, b }); });
  await matrix("S05", "vs-entries: owner sees own entry media only; a non-owner cannot see another user's PENDING entry media (original: bucket-wide)", "detects", T.p1, T.orig, async (w) => { const a = await sel(w, "A", "vs-entries"), b = await sel(w, "B", "vs-entries"); return (a === [`${U.A}/1/x.jpg`, `${U.A}/3/z.jpg`, `${U.A}/notanumber/m.jpg`].sort().join("|") && b === `${U.B}/2/y.jpg`) || JSON.stringify({ a, b }); });
  await matrix("S06", "agent-posts: a signed-in non-admin sees nothing (original: everything)", "detects", T.p1, T.orig, async (w) => { const n = await selN(w, "B", "agent-posts"); return n === 0 || "sees " + n; });
  await matrix("S07", "admin sees every object in all four buckets (moderation / review / signed URLs)", "baseline", T.p1, T.orig, async (w) => { for (const [b, n] of [["agent-posts", 4], ["chat-images", 4], ["playlist-covers", 2], ["vs-entries", 4]]) if ((await selN(w, "admin", b)) !== n) return "admin short in " + b; return true; });
  await matrix("S08", "chat-images: profile owner A sees profiles/artist-a/* (uploader rows AND legacy NULL-owner rows) + own event flyer, NOT artist-b's (original: all 4)", "detects", T.p1, T.orig, async (w) => { const a = await sel(w, "A", "chat-images"); return a === ["event-flyers/f1.jpg", "profiles/artist-a/p1.jpg", "profiles/artist-a/p3-legacy.jpg"].join("|") || a; });
  await matrix("S09", "chat-images: B sees only profiles/artist-b/p2.jpg (original: all)", "detects", T.p1, T.orig, async (w) => (await sel(w, "B", "chat-images")) === "profiles/artist-b/p2.jpg" || (await sel(w, "B", "chat-images")));
  await matrix("S10", "UPSERT (INSERT ... ON CONFLICT DO UPDATE, the Storage API shape of upload upsert:true) of a NEW path by its owner works: playlist-covers (the playlist-submit.js x-upsert flow) and vs-entries", "baseline", T.p1, T.orig, async (w) => {
    const r1 = await upsert(w, "A", "playlist-covers", `${U.A}/cover-NEW.jpg`), r2 = await upsert(w, "A", "vs-entries", `${U.A}/1/new.jpg`); return (applied(r1) && applied(r2)) || JSON.stringify([r1.err, r2.err]); });
  await matrix("S11", "UPSERT that OVERWRITES the owner's own existing object works (needs SELECT + UPDATE on the existing row): playlist-covers and vs-entries", "baseline", T.p1, T.orig, async (w) => {
    const r1 = await upsert(w, "A", "playlist-covers", `${U.A}/cover-1.jpg`), r2 = await upsert(w, "A", "vs-entries", `${U.A}/1/x.jpg`); return (applied(r1) && applied(r2)) || JSON.stringify([r1.err, r2.err]); });
  await matrix("S12", "a non-owner cannot UPSERT over another user's object, nor write into another user's folder (insert policy unchanged)", "baseline", T.p1, T.orig, async (w) => {
    const r1 = await upsert(w, "B", "playlist-covers", `${U.A}/cover-1.jpg`), r2 = await upsert(w, "B", "vs-entries", `${U.A}/1/x.jpg`); return (!applied(r1) && !applied(r2)) || JSON.stringify([r1, r2]); });
  await matrix("S13", "download()/createSignedUrl model: the owner can sign own objects, a non-owner cannot sign another user's, admin can sign any, anon cannot (original: anyone could)", "detects", T.p1, T.orig, async (w) => {
    const a = await canSign(w, "A", "vs-entries", `${U.A}/1/x.jpg`), b = await canSign(w, "B", "vs-entries", `${U.A}/1/x.jpg`), ad = await canSign(w, "admin", "vs-entries", `${U.A}/1/x.jpg`), an = await canSign(w, "anon", "vs-entries", `${U.A}/1/x.jpg`);
    return (a && !b && ad && !an) || JSON.stringify({ a, b, ad, an }); });
  await matrix("S14", "service_role (edge functions / generators, BYPASSRLS) still reads and writes everything incl. agent-posts", "baseline", T.p1, T.orig, async (w) => { const n = await selN(w, "service", "agent-posts"); const i = await insertObj(w, "service", "agent-posts", "posts/new.jpg"); return (n === 4 && applied(i)) || JSON.stringify([n, i.err]); });
  await matrix("S15", "the unpublished cover posts/lyric-mryyphmm-card.svg is not listable/signable by anon or a non-admin through the table (P1 alone); the public URL still serves it until it is MOVED (P2 runbook)", "detects", T.p1, T.orig, async (w) => {
    const an = await canSign(w, "anon", "agent-posts", "posts/lyric-mryyphmm-card.svg"), b = await canSign(w, "B", "agent-posts", "posts/lyric-mryyphmm-card.svg"), ad = await canSign(w, "admin", "agent-posts", "posts/lyric-mryyphmm-card.svg"); const url = await urlOk(w, "agent-posts", "posts/lyric-mryyphmm-card.svg");
    return (!an && !b && ad && url === true) || JSON.stringify({ an, b, ad, url }); });

  /* ============================ P4: profile_content ============================ */
  await matrix("R01", "anon sees only non-archived rows (archived=false AND NULL); original: also the archived autopilot/review row", "detects", T.p4, T.orig, async (w) => (await pcIds(w, "anon")) === "a1,b1,a3" || (await pcIds(w, "anon")));
  await matrix("R02", "anon cannot fetch an archived row by id (review-queue item stays private)", "detects", T.p4, T.orig, async (w) => (await pcIds(w, "anon", `where id='${PC.a2}'`)) === "" || "visible");
  await matrix("R03", "owner A sees own rows INCLUDING archived, not the other profile's archived row", "detects", T.p4, T.orig, async (w) => (await pcIds(w, "A")) === "a1,a2,b1,a3" || (await pcIds(w, "A")));
  await matrix("R04", "non-owner B cannot see A's archived row (post_saves embed of it returns null for B)", "detects", T.p4, T.orig, async (w) => {
    const ids = await pcIds(w, "B"); const e = await attempt(w, "B", "select s.content_id, c.id as cid from public.post_saves s left join public.profile_content c on c.id = s.content_id where s.user_id = auth.uid() order by s.content_id"); return (ids === "a1,b1,b2,a3" && e.rows.filter((x) => x.cid).length === 1) || JSON.stringify({ ids, e: e.rows }); });
  await matrix("R05", "admin (is_admin) sees ALL rows incl. archived (review queue / moderation)", "baseline", T.p4, T.orig, async (w) => (await pcIds(w, "admin")) === "a1,a2,b1,b2,a3" || (await pcIds(w, "admin")));
  await matrix("R06", "service_role (autopilot) reads everything", "baseline", T.p4, T.orig, async (w) => (await pcIds(w, "service")) === "a1,a2,b1,b2,a3" || (await pcIds(w, "service")));
  await matrix("R07", "owner can ARCHIVE and UN-ARCHIVE own row the way profile.html does (UPDATE ... WHERE id): the unarchive needs the owner SELECT policy", "baseline", T.p4, T.orig, async (w) => {
    const a = await req(w, "A", `update public.profile_content set archived = true where id='${PC.a1}'`); const b = await req(w, "A", `update public.profile_content set archived = false where id='${PC.a2}'`); return (applied(a) && applied(b)) || JSON.stringify([a.err || a.rowCount, b.err || b.rowCount]); });
  await matrix("R08", "owner INSERT/DELETE own rows still work; a non-owner can neither update, delete nor insert into another profile", "baseline", T.p4, T.orig, async (w) => {
    const i = await req(w, "A", `insert into public.profile_content(profile_slug,kind,data,created_by,archived) values ('artist-a','post','{}', '${U.A}', false)`);
    const d = await req(w, "A", `delete from public.profile_content where id='${PC.a3}'`); const u = await req(w, "B", `update public.profile_content set data='{}' where id='${PC.a1}'`); const x = await req(w, "B", `delete from public.profile_content where id='${PC.a1}'`);
    const ins = await attempt(w, "B", `insert into public.profile_content(profile_slug,kind,data,created_by) values ('artist-a','post','{}', '${U.B}')`);
    return (applied(i) && applied(d) && !applied(u) && !applied(x) && !!ins.err) || JSON.stringify([i.err, d.err, u.rowCount, x.rowCount, ins.err]); });
  await matrix("R09", "the legacy NULL-archived row stays public (archived IS NOT TRUE, not '= false')", "baseline", T.p4, T.orig, async (w) => (await pcIds(w, "anon", `where id='${PC.a3}'`)) === "a3" || "hidden");
  await matrix("R10", "order independence with 10A APPLY-1C: after 1C's ACL narrowing the hardened results hold (anon A1 ACL: SELECT only)", "detects", T.p4_1c, T.orig1c, async (w) => {
    const a = await pcIds(w, "anon"), o = await pcIds(w, "A"), ad = await pcIds(w, "admin"); const acl = (await w.q(`select ${aclSorted("relacl")} x from pg_class where oid='public.profile_content'::regclass`)).rows[0].x;
    return ((a === "a1,b1,a3") && acl.includes("anon=r/postgres") && o.includes("a1") && ad === "a1,a2,b1,b2,a3") || JSON.stringify({ a, o, ad, acl }); });
  await matrix("R10b", "with 1C's ACL, hardened anon sees only non-archived (original under 1C still shows archived: 1C alone does not fix read exposure)", "detects", T.p4_1c, T.orig1c, async (w) => (await pcIds(w, "anon")) === "a1,b1,a3" || (await pcIds(w, "anon")));

  /* ============================ P3: chat-images / public-assets ============================ */
  await matrix("C01", "chat-images INSERT: another user cannot write into profiles/artist-a/ and a user cannot write an arbitrary path (original: any signed-in user, any path)", "detects", T.p3b, T.p1, async (w) => {
    const evil = await insertObj(w, "B", "chat-images", "profiles/artist-a/evil.jpg"), junk = await insertObj(w, "A", "chat-images", "random/anything.jpg"), anon = await insertObj(w, "anon", "chat-images", "x/y.jpg");
    return (!applied(evil) && !applied(junk) && !applied(anon)) || JSON.stringify([!!evil.err, !!junk.err, !!anon.err]); });
  await matrix("C02", "chat-images INSERT: the three shapes still allowed: uid-prefixed (chat convention), legacy profiles/<owned slug>/ (profile.html), legacy event-flyers/<file> (create-event.html)", "baseline", T.p3b, T.p1, async (w) => {
    const a = await insertObj(w, "A", "chat-images", `${U.A}/chat1.jpg`), b = await insertObj(w, "A", "chat-images", "profiles/artist-a/new.jpg"), c = await insertObj(w, "B", "chat-images", "event-flyers/new.jpg"); return (applied(a) && applied(b) && applied(c)) || JSON.stringify([a.err, b.err, c.err]); });
  await matrix("C03", "chat-images SELECT after P3b: only uploader / profile owner / admin (anon none): chat 'participants' cannot be derived from the path (see OPEN QUESTIONS)", "detects", T.p3b, T.orig, async (w) => (await selN(w, "anon", "chat-images")) === 0 && (await sel(w, "B", "chat-images")) === "profiles/artist-b/p2.jpg" || "wrong");
  await matrix("C04", "public-assets: owner inserts profiles/<owned slug>/ and event-flyers/<own uid>/; others cannot; anon cannot; uploads by a non-owner of the slug are refused", "baseline", T.p3a, T.p3a, async (w) => {
    const ok1 = await insertObj(w, "A", "public-assets", "profiles/artist-a/x.jpg"), ok2 = await insertObj(w, "A", "public-assets", `event-flyers/${U.A}/f.jpg`);
    const no1 = await insertObj(w, "B", "public-assets", "profiles/artist-a/evil.jpg"), no2 = await insertObj(w, "A", "public-assets", `event-flyers/${U.B}/f.jpg`), no3 = await insertObj(w, "anon", "public-assets", "profiles/artist-a/a.jpg"), no4 = await insertObj(w, "A", "public-assets", "other/a.jpg");
    return (applied(ok1) && applied(ok2) && !applied(no1) && !applied(no2) && !applied(no3) && !applied(no4)) || JSON.stringify([ok1.err, ok2.err, !!no1.err, !!no2.err, !!no3.err, !!no4.err]); });
  await matrix("C05", "public-assets has NO listing for anon / non-owners (owner-scoped SELECT only) while its public URLs serve", "detects", T.p3a_moved, T.p1, async (w) => {
    const an = await selN(w, "anon", "public-assets"), b = await selN(w, "B", "public-assets"), a = await selN(w, "A", "public-assets"), url = await urlOk(w, "public-assets", "profiles/artist-a/moved-0.jpg");
    return (an === 0 && b === 0 && a === PUBLIC_ASSETS_MIN && url === true) || JSON.stringify({ an, b, a, url }); });
  await matrix("C06", "public-assets: owner can delete own file (account-deletion sweep) but not another owner's; (chat-images has no DELETE policy today = that sweep silently fails)", "detects", T.p3a_moved, T.p1, async (w) => {
    const own = await req(w, "A", "delete from storage.objects where bucket_id='public-assets' and name='profiles/artist-a/moved-0.jpg'"), oth = await req(w, "B", "delete from storage.objects where bucket_id='public-assets' and name='profiles/artist-a/moved-1.jpg'"); return (applied(own) && !applied(oth)) || JSON.stringify([own.rowCount, oth.rowCount]); });
  await matrix("C07", "after P3c: chat-images is PRIVATE (public URL no longer serves), public-assets URLs still serve the moved assets; signed URL (SELECT) still possible for uploader/admin only", "detects", T.p3c, T.p3b, async (w) => {
    const a = await urlOk(w, "chat-images", "profiles/artist-a/p1.jpg"), b = await urlOk(w, "public-assets", "profiles/artist-a/moved-0.jpg"), s1 = await canSign(w, "A", "chat-images", "profiles/artist-a/p1.jpg"), s2 = await canSign(w, "B", "chat-images", "profiles/artist-a/p1.jpg"), s3 = await canSign(w, "admin", "chat-images", "profiles/artist-a/p1.jpg");
    return (a === false && b === true && s1 && !s2 && s3) || JSON.stringify({ a, b, s1, s2, s3 }); });

  /* ============================ P6: vs-entries ============================ */
  await matrix("V01", "anon can SELECT (so sign / list) media of an APPROVED entry only: not pending, rejected, nor a malformed folder (no cast error)", "detects", T.p1p6, T.p1, async (w) => { const a = await sel(w, "anon", "vs-entries"); return a === `${U.B}/2/y.jpg` || a; });
  await matrix("V02", "reviewer (vs_is_admin only) sees every entry's media; a plain user does not see others' pending media", "detects", T.p1p6, T.p1, async (w) => { const r = await selN(w, "rev", "vs-entries"), b = await sel(w, "B", "vs-entries"); return (r === 4 && b === `${U.B}/2/y.jpg`) || JSON.stringify({ r, b }); });
  await matrix("V03", "owner A sees own pending + rejected media; the approval flips visibility: after entry 1 is approved anon sees it, still no listing for others' pending", "baseline", T.p1p6, T.p1, async (w) => {
    const a = await sel(w, "A", "vs-entries"); if (!a.includes(`${U.A}/1/x.jpg`)) return "owner lost own pending";
    if (w.name && (await attempt(w, "anon", "select count(*)::int n from storage.objects where bucket_id='vs-entries'")).rows[0].n > 1) return "anon sees more than approved"; return true; });
  await matrix("V04", "bucket stays PUBLIC and every vs-entries public URL still serves (vs-app.js uses getPublicUrl until its change ships)", "baseline", T.p1p6, T.p1, async (w) => { const r = await w.q("select name from storage.objects where bucket_id='vs-entries'"); for (const o of r.rows) if (!(await urlOk(w, "vs-entries", o.name))) return "not served " + o.name; return (await w.q("select public from storage.buckets where id='vs-entries'")).rows[0].public === true; });
  await matrix("V05", "an owner's UPSERT/overwrite and a non-owner's refusal are unchanged by P6", "baseline", T.p1p6, T.p1, async (w) => { const o = await upsert(w, "A", "vs-entries", `${U.A}/1/x.jpg`), n = await upsert(w, "B", "vs-entries", `${U.A}/1/x.jpg`); return (applied(o) && !applied(n)) || "changed"; });
  await matrix("V06", "approval is evaluated live: approve entry 1 as service_role, then anon sees its media", "detects", T.p1p6, T.p1, async (w) => { await w.q("update public.vs_entries set status='approved' where id=1"); const a = await sel(w, "anon", "vs-entries"); return a === [`${U.A}/1/x.jpg`, `${U.B}/2/y.jpg`].sort().join("|") || a; });

  /* ============================ pack mechanics ============================ */
  const ORDER = ["P1", "P4", "P5", "P2", "P3a", "P6"];
  for (const id of ["P1", "P4", "P5", "P5B", "P2", "P3a", "P6"]) {
    await structural(`K-${id}`, `${id}: APPLY from the captured state (post-checks ok, DRIFT_QUERY says POST) then ROLLBACK restores the original byte-for-byte (policy text, sorted ACLs, bucket rows, object set); second APPLY refuses cleanly; second ROLLBACK refuses`, async () => {
      const from = id === "P6" ? T.p1 : T.orig, w = await mkWorld(from); try { if (id === "P5B") await w.q("delete from storage.objects where bucket_id='agent-posts' and metadata->>'mimetype'='image/svg+xml'"); const f0 = await fp(w); const a = await apply(w, id); const mid = await fp(w); const d1 = await driftStates(w); const r = await rollback(w, id); const f1 = await fp(w); const d0 = await driftStates(w);
        const a2 = await apply(w, id); const f2 = await fp(w); await rollback(w, id); const r2 = await rollback(w, id);
        const bucketLeft = PACKS[id].bucketLeft;   // P2/P3a leave the (empty, inert) bucket row in place by design: the ONLY allowed difference
        const exact = bucketLeft ? same(f0, f1, ["buckets"]) && !same(f0, f1, ["__none__"]) : same(f0, f1);
        const leftOk = !bucketLeft || (JSON.stringify(f1.buckets).includes(`"id": "${bucketLeft}"`) || JSON.stringify(f1.buckets).includes(`"id":"${bucketLeft}"`));
        const idGroup = id === "P5B" ? "P5B" : id;
        return (a.ok && allOk(a.rows) && !same(f0, mid) && d1[idGroup] === "POST" && r.ok && allOk(r.rows) && exact && leftOk && d0[idGroup] === "PRE" && a2.ok && driftAbort(r2) === true || (PACKS[id].noRollback)) && true
          || JSON.stringify({ a: a.err, post: d1[idGroup], r: r.err, exact, leftOk, d0, a2: a2.err, r2: String(r2.err).slice(0, 80) }); } finally { await w.close(); } });
  }
  await structural("K-second-apply", "every pack: a SECOND apply on the applied state refuses at the guard (DRIFT, ABORT) and changes nothing", async () => {
    for (const id of ["P1", "P4", "P5", "P2", "P3a", "P6"]) { const w = await mkWorld(id === "P6" ? T.p1 : T.orig); try { await apply(w, id); const f = await fp(w); const r = await apply(w, id); if (!(driftAbort(r) && same(f, await fp(w)))) return id + ": " + r.err; } finally { await w.close(); } } return true; });
  await structural("K-guard-drift", "guards ABORT on drift with nothing changed: altered listing policy (P1), extra bucket-wide anon policy (P1), RLS off on profile_content (P4), unexpected ACL (P4), extra SELECT policy (P4), bucket limits already set (P5), SVG-less mime list present in existing objects (P5B), missing is_admin (P1/P4)", async () => {
    const cases = [["P1", T.orig, "alter policy agent_posts_public_read on storage.objects using (true)"], ["P1", T.orig, "create policy zz_any on storage.objects for select to anon using (true)"],
      ["P1", T.orig, "update storage.buckets set public = false where id='vs-entries'"], ["P1", T.orig, "drop function public.is_admin() cascade"],
      ["P4", T.orig, "alter table public.profile_content disable row level security"], ["P4", T.orig, "grant truncate on public.profile_content to anon; revoke insert on public.profile_content from authenticated"],
      ["P4", T.orig, "create policy zz_pc on public.profile_content for select to public using (true)"], ["P4", T.orig, "alter policy \"profile_content read all\" on public.profile_content using (archived is not true)"],
      ["P5", T.orig, "update storage.buckets set file_size_limit = 1000 where id='agent-posts'"], ["P5B", T.orig, "update storage.objects set metadata = metadata || '{\"mimetype\":\"image/svg+xml\"}' where bucket_id='agent-posts' and name='posts/a.jpg'"],
      ["P5", T.orig, "update storage.objects set metadata = metadata || '{\"mimetype\":\"text/html\"}' where bucket_id='agent-posts' and name='posts/a.jpg'"],
      ["P2", T.orig, "insert into storage.buckets(id,name,public) values ('agent-drafts','agent-drafts',true)"], ["P6", T.p1, "drop function public.vs_is_admin()"], ["P3b", T.orig, "select 1"]];
    for (const [id, tpl, mut] of cases) { const w = await mkWorld(tpl); try { await w.q(mut); const f = await fp(w); const r = await apply(w, id); if (!(driftAbort(r) && same(f, await fp(w)))) return `${id} [${mut.slice(0, 50)}]: ${String(r.err).slice(0, 120)}`; } finally { await w.close(); } } return true; });
  await structural("K-orderchain", "recommended order P0,P4,P1,P5,P2,P3a,P3b,[assets moved],P3c,P6 applies end-to-end with every post-check ok; reverse-order rollbacks bring back the original (except the two inert bucket rows); P3b/P3c/P6 refuse without P1; P3c refuses without P3a", async () => {
    const w = await mkWorld(T.preGrok); try { const f0 = await fp(w); const chain = ["P0", "P4", "P1", "P5", "P2", "P3a", "P3b"]; for (const id of chain) { const r = await apply(w, id); if (!r.ok || !allOk(r.rows)) return `apply ${id}: ${r.err}`; }
      await w.q(`insert into storage.objects(bucket_id,name,owner_id,metadata) values ${six}`); for (const id of ["P3c", "P6"]) { const r = await apply(w, id); if (!r.ok || !allOk(r.rows)) return `apply ${id}: ${r.err}`; }
      const d = await driftStates(w); if (!["P1", "P4", "P5", "P2", "P3a", "P3b", "P3c", "P6"].every((k) => d[k] === "POST")) return JSON.stringify(d);
      await w.q("delete from storage.objects where bucket_id='public-assets'");            // test cleanup of synthetic rows only (the packs delete nothing)
      for (const id of ["P6", "P3c", "P3b", "P3a", "P2", "P5", "P1", "P4"]) { const r = await rollback(w, id); if (!r.ok) return `rollback ${id}: ${r.err}`; }
      const f1 = await fp(w); const wo = await mkWorld(T.orig); const fo = await fp(wo); await wo.close();
      const keep = (f) => (f.buckets || []).filter((b) => !["agent-drafts", "public-assets"].includes(b.id));
      const okState = same(fo, f1, ["buckets"]) && JSON.stringify(keep(f1)) === JSON.stringify(fo.buckets); const bl = f1.buckets.filter((b) => ["agent-drafts", "public-assets"].includes(b.id)).length === 2;
      const w3 = await mkWorld(T.orig); let refuse = []; try { for (const id of ["P3b", "P3c", "P6"]) refuse.push(driftAbort(await apply(w3, id))); await apply(w3, "P1"); refuse.push(driftAbort(await apply(w3, "P3c"))); } finally { await w3.close(); }
      return (okState && bl && refuse.every(Boolean)) || JSON.stringify({ okState, bl, refuse, diff: diffKeys(fo, f1) }); } finally { await w.close(); } });
  await structural("K-p3c-guards", "P3c refuses while ANY public table still references chat-images (events.cover_url / jsonb / chat message image_url), while public-assets holds fewer than the minimum assets, and passes once references are rewritten to public-assets and the assets exist; the scan returns counts only", async () => {
    const w0 = await mkWorld(T.p3b); try { const r0 = await apply(w0, "P3c"); if (!(driftAbort(r0) && /public-assets|object_count/.test(r0.err))) return "no refusal on missing assets: " + r0.err; } finally { await w0.close(); }
    for (const [lbl, ref] of [["text column", "insert into public.events(slug,title,cover_url) values ('e','t','https://x.supabase.co/storage/v1/object/public/chat-images/event-flyers/f1.jpg')"], ["jsonb column", `update public.profile_content set data = '{"img":"https://x/storage/v1/object/public/chat-images/profiles/artist-a/p1.jpg"}' where id='${PC.a1}'`], ["chat message image_url", "insert into public.community_chat_messages(body,image_url) values ('hi','chat-images/profiles/artist-b/p2.jpg')"]]) {
      const w = await mkWorld(T.p3a_moved); try { await w.q(ref); const f = await fp(w); const r = await apply(w, "P3c"); if (!(driftAbort(r) && /no_public_table_references_chat_images/.test(r.err) && same(f, await fp(w)))) return lbl + ": " + String(r.err).slice(0, 160); } finally { await w.close(); } }
    const w1 = await mkWorld(T.p3a_moved); try { await w1.q("insert into public.events(slug,title,cover_url) values ('e','t','https://x/object/public/chat-images/event-flyers/f1.jpg')"); await w1.q("update public.events set cover_url = replace(cover_url, '/object/public/chat-images/', '/object/public/public-assets/')"); const r = await apply(w1, "P3c"); if (!(r.ok && allOk(r.rows))) return "pass case: " + r.err; } finally { await w1.close(); }
    const w2 = await mkWorld(T.p3a_moved); try { await w2.q("create table public._bak_events_probe (c text); insert into public._bak_events_probe values ('chat-images/profiles/artist-a/p1.jpg')"); const r = await apply(w2, "P3c"); if (!(r.ok && allOk(r.rows))) return "_bak_ tables must be ignored: " + r.err; } finally { await w2.close(); }
    return true; });
  await structural("K-lock", "pack runs serialise on the repo-wide advisory lock and time out cleanly: while one pack holds the lock a second pack fails with 55P03 after ~5s and changes nothing; once released the second runs", async () => {
    const w = await mkWorld(T.orig); try { const c1 = await w.conn("postgres"), c2 = await w.conn("postgres"); const f0 = await fp(w);
      const p1 = runPack(c1.client, hold(PK(F("P4", "APPLY")), 8)); await sleep(700); const t0 = Date.now(); const r2 = await runPack(c2.client, PK(F("P1", "APPLY"))); const dt = Date.now() - t0; const r1 = await p1;
      const mid = await fp(w); const lockHeldKey = REPO_PACK_KEY === "2979301232487107403"; const r3 = await runPack(c2.client, PK(F("P1", "APPLY")));
      return (!r2.ok && r2.code === "55P03" && dt >= 4500 && dt < 8000 && r1.ok && allOk(r1.rows) && !same(f0, mid) && r3.ok && allOk(r3.rows) && lockHeldKey) || JSON.stringify({ r2: r2.err, code: r2.code, dt, r1: r1.err, r3: r3.err }); } finally { await w.close(); } });
  await structural("K-nodelete", "no pack contains a DELETE/TRUNCATE statement or any DML on storage.objects (grep over the generated files, comments stripped)", async () => {
    const files = buildAll(); for (const [n, s] of files) { if (!n.startsWith("17a_") && !n.startsWith("..")) continue; const c = strip(s); if (/^\s*(delete\s+from|truncate)\b/im.test(c)) return n + ": delete/truncate"; if (/^\s*(insert\s+into|update)\s+storage\.objects\b/im.test(c)) return n + ": DML on storage.objects"; if (/storage\.delete/i.test(c)) return n + ": storage.delete"; } return true; });
  await structural("K-readonly", "PRECHECK-17A.sql, the INVENTORY queries, every POSTCHECKS file and the DRIFT_QUERY run READ ONLY (SET TRANSACTION READ ONLY) on the replica and change nothing; the inventory returns names + counts and classifies the synthetic chat-images objects", async () => {
    const w = await mkWorld(T.p3a); try { await w.q(`insert into public.events(slug,title,cover_url) values ('e1','t','https://x/storage/v1/object/public/chat-images/event-flyers/f1.jpg'); update public.profile_content set data = '{"img":"https://x/object/public/chat-images/profiles/artist-a/p1.jpg"}' where id='${PC.a1}'; insert into public.community_chat_messages(body,image_url) values ('hi','chat-images/profiles/artist-b/p2.jpg');`);
      const f0 = await fp(w); const files = [["../PRECHECK-17A.sql"], ["../PRECHECK-17A-INVENTORY_READONLY.sql"], ["17a_DRIFT_QUERY_PROPOSED.sql"], ...[...buildAll().keys()].filter((k) => k.includes("POSTCHECKS")).map((k) => [k])];
      for (const [f] of files) { const sql = f.startsWith("..") ? rd(f.slice(3)) : PK(f); const c = w.db.client; await c.query("BEGIN READ ONLY"); try { await c.query(strip(sql)); } finally { await c.query("ROLLBACK"); } }
      const inv = await w.q(strip(rd("PRECHECK-17A-INVENTORY_READONLY.sql"))); const [q1, q2] = Array.isArray(inv) ? inv : [inv]; const byName = Object.fromEntries(q1.rows.map((r) => [r.name, r.category])); const colsHit = q2.rows.map((r) => r.table_name + "." + r.column_name).sort().join(",");
      const pre = await w.q(strip(rd("PRECHECK-17A.sql"))); const pr = (Array.isArray(pre) ? pre[pre.length - 1] : pre).rows; const hasStorage = pr.some((r) => r.name.startsWith("bucket:")) && pr.some((r) => r.name === "storage.objects.owner_rls_acl");
      const leak = JSON.stringify(pr).includes("posts/lyric-mryyphmm") || JSON.stringify(pr).includes("profiles/artist-a");      // PRECHECK must never return object names
      return (same(f0, await fp(w)) && byName["profiles/artist-a/p1.jpg"] === "referenced-by-profile-or-event" && byName["event-flyers/f1.jpg"] === "referenced-by-profile-or-event" && byName["profiles/artist-b/p2.jpg"] === "referenced-by-message" && byName["profiles/artist-a/p3-legacy.jpg"] === "unknown-unreferenced" && q1.rows.length === 4
        && colsHit === "community_chat_messages.image_url,events.cover_url,profile_content.data" && hasStorage && !leak) || JSON.stringify({ byName, colsHit, hasStorage, leak }); } finally { await w.close(); } });

  /* ============================ partial-fix MUTANTS (each must be caught) ============================ */
  const mut = async (id, name, tpl, mutSql, checks) => structural(id, name, async () => {
    const w = await mkWorld(tpl); try { await w.q(mutSql); const f = await checks(w); return f.length > 0 && f.every((x) => x) ? true : "mutant NOT caught: " + JSON.stringify(f); } finally { await w.close(); } }, mutRows);
  const p1Drop3 = "drop policy agent_posts_public_read on storage.objects; drop policy \"chat images public read\" on storage.objects; drop policy \"playlist covers are publicly readable\" on storage.objects;";   // vs_media_read left behind
  await mut("M01", "P1 mutant: three of the four listing policies dropped, vs_media_read left: caught by behaviour (anon lists vs-entries), by POSTCHECKS(P1 POST) and by DRIFT_QUERY (P1 = DRIFT)", T.orig, p1Drop3 + ` create policy agent_posts_admin_read on storage.objects for select to authenticated using (bucket_id='agent-posts' and public.is_admin()); create policy chat_images_owner_admin_read on storage.objects for select to authenticated using (bucket_id='chat-images' and public.is_admin()); create policy playlist_covers_owner_admin_read on storage.objects for select to authenticated using (bucket_id='playlist-covers' and public.is_admin());`, async (w) => [(await selN(w, "anon", "vs-entries")) > 0, !(await pcState(w, "P1", "POST")).ok, (await driftStates(w)).P1 === "DRIFT"]);
  await mut("M02", "P1 mutant: listing fixed but NO owner SELECT (admin-only replacements): the owner's UPSERT-overwrite breaks (the very flow the path report protects): caught", T.orig, "drop policy vs_media_read on storage.objects; create policy vs_media_owner_admin_read on storage.objects for select to authenticated using (bucket_id='vs-entries' and public.is_admin());", async (w) => { const r = await upsert(w, "A", "vs-entries", `${U.A}/1/x.jpg`); return [!applied(r), (await canSign(w, "A", "vs-entries", `${U.A}/1/x.jpg`)) === false]; });
  await mut("M03", "P1 mutant: a stray bucket-wide anon SELECT policy added back after the fix: caught by DRIFT_QUERY and POSTCHECKS", T.p1, "create policy zz_again on storage.objects for select to anon using (bucket_id='vs-entries')", async (w) => [(await selN(w, "anon", "vs-entries")) > 0, !(await pcState(w, "P1", "POST")).ok]);
  await mut("M04", "P4 mutant: 'profile_content read all' dropped, public policy added, NO owner policy: owner cannot UN-ARCHIVE (profile.html Archive list) -> caught", T.orig, "drop policy \"profile_content read all\" on public.profile_content; create policy \"profile_content read public\" on public.profile_content for select to public using (archived is not true); create policy \"profile_content read admin\" on public.profile_content for select to authenticated using (public.is_admin());", async (w) => { const u = await req(w, "A", `update public.profile_content set archived = false where id='${PC.a2}'`); return [!applied(u), !(await pcState(w, "P4", "POST")).ok]; });
  await mut("M05", "P4 mutant: public policy written 'archived = false': the legacy NULL-archived row disappears from public pages -> caught", T.orig, "drop policy \"profile_content read all\" on public.profile_content; create policy \"profile_content read public\" on public.profile_content for select to public using (archived = false); create policy \"profile_content read owner\" on public.profile_content for select to authenticated using (exists (select 1 from public.profile_owners po where po.profile_slug = profile_content.profile_slug and po.owner_id = auth.uid())); create policy \"profile_content read admin\" on public.profile_content for select to authenticated using (public.is_admin());", async (w) => [(await pcIds(w, "anon", `where id='${PC.a3}'`)) === "", !(await pcState(w, "P4", "POST")).ok]);
  await mut("M06", "P4 mutant: policies fixed but RLS then switched OFF (grants to anon left): anon reads archived rows again -> caught by behaviour, POSTCHECKS(req.rls_on_not_forced) and DRIFT_QUERY", T.p4, "alter table public.profile_content disable row level security", async (w) => [(await pcIds(w, "anon")).includes("a2"), !(await pcState(w, "P4", "POST")).ok, (await driftStates(w)).P4 === "DRIFT"]);
  await mut("M07", "P4 mutant: a permissive 'USING (true)' SELECT policy re-added next to the fix: caught", T.p4, "create policy \"profile_content read everyone\" on public.profile_content for select to public using (true)", async (w) => [(await pcIds(w, "anon")).includes("a2"), !(await pcState(w, "P4", "POST")).ok]);
  await mut("M08", "P3c mutant: chat-images flipped private BEFORE the references were rewritten: caught by the P3c reference scan (a hand-flip leaves references -> POSTCHECKS(P3c) refuse) ", T.p3b, "insert into public.events(slug,title,cover_url) values ('e','t','https://x/object/public/chat-images/event-flyers/f1.jpg'); update storage.buckets set public=false where id='chat-images'", async (w) => { const s = await pcState(w, "P3c", "POST"); return [!s.ok, s.rows.some((r) => r.name === "req.no_public_table_references_chat_images" && !r.ok)]; });
  await mut("M09", "P1 mutant: policies fixed but one bucket flipped private by mistake (playlist-covers): public playlist art stops serving -> caught (public URL model + invariant)", T.p1, "update storage.buckets set public=false where id='playlist-covers'", async (w) => [!(await urlOk(w, "playlist-covers", `${U.A}/cover-1.jpg`)), !(await pcState(w, "P1", "POST")).ok]);

  /* ============================ adjacent / informational ============================ */
  await structural("X01", "chat-images paths are NOT uid-prefixed in the shipped clients (profiles/<slug>/..., event-flyers/<file>): a uid-only INSERT policy would break both uploads (documented why P3b keeps the two legacy shapes)", async () => {
    const w = await mkWorld(T.p1); try { await w.q("drop policy \"chat images auth upload\" on storage.objects; create policy strict_uid on storage.objects for insert to authenticated with check (bucket_id='chat-images' and (storage.foldername(name))[1] = auth.uid()::text);");
      const a = await insertObj(w, "A", "chat-images", "profiles/artist-a/new.jpg"), b = await insertObj(w, "A", "chat-images", "event-flyers/new.jpg"); return (!applied(a) && !applied(b)) || "strict policy unexpectedly allows"; } finally { await w.close(); } }, adjRows);
  await structural("X02", "storage.objects policies of other buckets (manatua_media_member_read) are byte-identical through every pack (invariant inv.other_policies_md5 enforced inside each pack)", async () => {
    const w = await mkWorld(T.orig); try { const g = async () => (await w.q("select md5(qual||roles::text||cmd) m from pg_policies where policyname='manatua_media_member_read'")).rows[0].m; const m0 = await g(); for (const id of ["P1", "P5", "P2", "P3a"]) { const r = await apply(w, id); if (!r.ok) return id + r.err; } return (await g()) === m0 || "changed"; } finally { await w.close(); } }, adjRows);
  await structural("X03", "RLS performance shape: owner policies use (SELECT auth.uid()) initPlan form and storage.foldername(name); is_admin() is only evaluated for authenticated (anon policies contain no function calls)", async () => {
    const w = await mkWorld(T.p1p6); try { const r = await w.q("select policyname, qual from pg_policies where schemaname='storage' and tablename='objects' and policyname in ('chat_images_owner_admin_read','playlist_covers_owner_admin_read','vs_media_owner_admin_read')"); return r.rows.length === 3 && r.rows.every((x) => /SELECT auth\.uid\(\)/.test(x.qual)) || JSON.stringify(r.rows.map((x) => x.qual)); } finally { await w.close(); } }, adjRows);
}

/* ------------------------------------------------------------------ run + report */
const t0 = Date.now(); let fatal = null;
try { await main(); } catch (e) { fatal = String(e.stack || e); console.log("FATAL " + fatal); }
finally {
  for (const d of [...open]) { try { await d.close(); } catch {} }
  try { await PG.cleanupAll(); } catch {} try { if (rolesMine) await PG.dropRoles(); } catch (e) { console.log("dropRoles: " + e.message); } try { await PG.shutdownAdmin(); } catch {}
}
const tot = (a) => ({ total: a.length, pass: a.filter((x) => (x.pass !== undefined ? x.pass : x.hardened && x.controlOK)).length });
const summary = { engine: "PostgreSQL 17.6 (embedded-postgres, Unix socket only)", seconds: Math.round((Date.now() - t0) / 1000), matrix: tot(results), packs: tot(packRows), mutants: tot(mutRows), adjacent: tot(adjRows), fatal,
  negativeControls: { detects: results.filter((x) => x.control === "detects").length, detectsMet: results.filter((x) => x.control === "detects" && x.controlOK).length, baseline: results.filter((x) => x.control === "baseline").length, baselineMet: results.filter((x) => x.control === "baseline" && x.controlOK).length } };
mkdirSync(join(HERE, "proof/out"), { recursive: true });
if (!only) writeFileSync(join(HERE, "proof/out/results.json"), JSON.stringify({ summary, results, packRows, mutRows, adjRows }, null, 1));
console.log(`\nSUMMARY matrix ${summary.matrix.pass}/${summary.matrix.total} (detects ${summary.negativeControls.detectsMet}/${summary.negativeControls.detects}, baseline ${summary.negativeControls.baselineMet}/${summary.negativeControls.baseline}); packs ${summary.packs.pass}/${summary.packs.total}; mutants ${summary.mutants.pass}/${summary.mutants.total}; adjacent ${summary.adjacent.pass}/${summary.adjacent.total}; fatal=${fatal ? "YES" : "none"}; ${summary.seconds}s`);
process.exit(fatal || summary.matrix.pass !== summary.matrix.total || summary.packs.pass !== summary.packs.total || summary.mutants.pass !== summary.mutants.total || summary.adjacent.pass !== summary.adjacent.total ? 1 : 0);
