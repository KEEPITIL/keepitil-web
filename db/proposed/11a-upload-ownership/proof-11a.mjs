/* proof-11a.mjs - local PGlite proof for slice 11A (public.can_upload_event_media). NOTHING touches any hosted project.
   Stack: proof/replica-91.sql + replica-92-add.sql + replica-10a-add.sql (copies of the 10A proof replicas: events with submitted_by/owner_handle,
   profile_owners, auth.uid() stand-in, Supabase-style default grants), then can_upload_event_media_PROPOSED.sql VERBATIM.
   "post-1C" worlds additionally run copies of the 1C statements that matter here (REVOKE SELECT (submitted_by) ON events; owner-only reads on profile_owners).
   Run:  PGLITE_DIR=$HOME/work/pgl-scratch node proof-11a.mjs      (exit 0 only if every positive check passes AND every negative control fails its named checks)
   Stand-ins (see README): PGlite is not Postgres 17.6, roles/auth.uid() are hand-made, real events RLS policies are stand-ins. */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const rd = (f) => readFileSync(join(HERE, f), "utf8");
let PGlite = null;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch {
  if (process.env.PGLITE_DIR) ({ PGlite } = await import(pathToFileURL(join(process.env.PGLITE_DIR, "node_modules/@electric-sql/pglite/dist/index.js")).href));
}
if (!PGlite) { console.error("PGlite not importable; set PGLITE_DIR"); process.exit(3); }

const REPLICA = rd("proof/replica-91.sql") + "\n" + rd("proof/replica-92-add.sql") + "\n" + rd("proof/replica-10a-add.sql");
const FN = rd("can_upload_event_media_PROPOSED.sql"), ROLLBACK = rd("ROLLBACK_PROPOSED.sql");
const U = {
  MAPPED: "00000000-0000-4000-8000-0000000000a1", SUBMITTER: "00000000-0000-4000-8000-0000000000a2", STRANGER: "00000000-0000-4000-8000-0000000000a3",
  MULTI: "00000000-0000-4000-8000-0000000000a4", OTHERPROF: "00000000-0000-4000-8000-0000000000a5", SOMEONE: "00000000-0000-4000-8000-0000000000a6",
};
// copies of the 1C statements this proof depends on (10A APPLY-1C line 167; profile_owners read narrowing = APPLY-1 behaviour, PRECHECK "1.04")
const C1 = `REVOKE SELECT (submitted_by) ON TABLE public.events FROM anon, authenticated, PUBLIC;
REVOKE SELECT ON TABLE public.profile_owners FROM anon, authenticated, PUBLIC;`;
const SEED = `
insert into auth.users(id, email) values ${Object.values(U).map((u, i) => `('${u}', 'u${i}@example.test')`).join(",")};
insert into public.profile_owners(profile_slug, owner_id) values ('band-a','${U.MAPPED}'),('band-b','${U.MULTI}'),('band-c','${U.MULTI}'),('band-d','${U.OTHERPROF}');
insert into public.events(slug, title, status, owner_handle, submitted_by) values
 ('pub-mapped','p1','published','band-a',null),
 ('pub-submitted','p2','published','unmapped-handle','${U.SUBMITTER}'),
 ('draft-mapped','d1','draft','band-a',null),
 ('draft-submitted','d2','draft',null,'${U.SUBMITTER}'),
 ('pub-band-b','p5','published','band-b','${U.SOMEONE}');`;

const dbs = [];
async function world({ fn = FN, post1c = false } = {}) {
  const db = new PGlite(); dbs.push(db);
  await db.exec(REPLICA); await db.exec(SEED);
  await db.exec(fn);
  if (post1c) await db.exec(C1);
  return db;
}
async function as(db, role, sub, sql) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${sub || ""}', false); set role ${role};`);
  try { const r = await db.query(sql); return { rows: r.rows, fields: (r.fields || []).map((f) => f.name) }; }
  catch (e) { return { err: String(e.message || e) }; } finally { await db.exec("reset role"); }
}
const su = async (db, sql) => (await db.query(sql)).rows;
const can = async (db, sub, slug, role = "authenticated") => {
  const r = await as(db, role, sub, slug === null ? "select public.can_upload_event_media(null) as v" : `select public.can_upload_event_media('${slug}') as v`);
  return r.err ? "ERR:" + r.err : r.rows[0].v;
};

// ---- the suite: returns [{id, ok, why}] ; `tag` only labels the world
async function suite(db, tag) {
  const res = [];
  const check = async (id, name, fn) => { let ok = false, why = ""; try { const v = await fn(); ok = v === true; if (!ok) why = "returned " + JSON.stringify(v); } catch (e) { why = String(e.message || e); } res.push({ id, name, ok, why, tag }); };
  await check("S1", "owner via profile_owners -> true", async () => (await can(db, U.MAPPED, "pub-mapped")) === true);
  await check("S2", "submitted_by owner WITHOUT a profile mapping -> true", async () => (await can(db, U.SUBMITTER, "pub-submitted")) === true);
  await check("S3", "visible published event, NON-owner -> false", async () => (await can(db, U.STRANGER, "pub-mapped")) === false && (await can(db, U.STRANGER, "pub-submitted")) === false);
  await check("S4", "owner of ANOTHER profile -> false", async () => (await can(db, U.OTHERPROF, "pub-band-b")) === false && (await can(db, U.OTHERPROF, "pub-mapped")) === false);
  await check("S5", "multi-profile owner (band-b + band-c) accepted on band-b's event", async () => (await can(db, U.MULTI, "pub-band-b")) === true);
  await check("S6", "draft-parent owner -> true (both branches); non-owner of a draft -> false", async () =>
    (await can(db, U.MAPPED, "draft-mapped")) === true && (await can(db, U.SUBMITTER, "draft-submitted")) === true && (await can(db, U.STRANGER, "draft-mapped")) === false);
  await check("S7", "missing parent and NULL slug -> false (not an error, not true)", async () => (await can(db, U.MAPPED, "no-such")) === false && (await can(db, U.MAPPED, null)) === false);
  await check("S8", "signed-in role with no verified subject (auth.uid() NULL) -> false", async () => (await can(db, "", "pub-mapped")) === false);
  await check("S9", "anon has NO execute: call is permission denied", async () => /permission denied/i.test(String(await can(db, "", "pub-mapped", "anon"))));
  await check("S10", "grants: anon/public/service_role cannot execute, authenticated can", async () => {
    const r = (await su(db, `select has_function_privilege('anon','public.can_upload_event_media(text)','EXECUTE') a,
      has_function_privilege('service_role','public.can_upload_event_media(text)','EXECUTE') s,
      has_function_privilege('authenticated','public.can_upload_event_media(text)','EXECUTE') u,
      (select coalesce(bool_or(a.grantee = 0), false) from pg_proc p, lateral aclexplode(p.proacl) a where p.oid = 'public.can_upload_event_media(text)'::regprocedure) pub`))[0];
    return r.a === false && r.s === false && r.u === true && r.pub === false;
  });
  await check("S11", "does not leak submitted_by: returns boolean, one boolean column", async () => {
    const t = (await su(db, "select prorettype::regtype::text t, proretset from pg_proc where oid='public.can_upload_event_media(text)'::regprocedure"))[0];
    const q = await as(db, "authenticated", U.SUBMITTER, "select * from public.can_upload_event_media('pub-submitted')");
    return t.t === "boolean" && t.proretset === false && q.fields.length === 1 && q.rows.length === 1 && typeof q.rows[0][q.fields[0]] === "boolean";
  });
  await check("S12", "SECURITY DEFINER with search_path pinned to '' (proconfig)", async () => {
    const r = (await su(db, "select prosecdef, proconfig from pg_proc where oid='public.can_upload_event_media(text)'::regprocedure"))[0];
    return r.prosecdef === true && JSON.stringify(r.proconfig) === JSON.stringify(["search_path=\"\""]);
  });
  await check("S13", "search_path HIJACK: attacker schema with fake events/profile_owners naming the stranger as owner does not change the answer", async () => {
    await db.exec(`create schema evil; create table evil.events(slug text, submitted_by uuid, owner_handle text, status text); insert into evil.events values ('pub-mapped','${U.STRANGER}','x','published');
      create table evil.profile_owners(profile_slug text, owner_id uuid); insert into evil.profile_owners values ('band-a','${U.STRANGER}'); grant usage on schema evil to authenticated; grant select on all tables in schema evil to authenticated;`);
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','${U.STRANGER}', false); set role authenticated; set search_path = evil, public;`);
    let v; try { v = (await db.query("select public.can_upload_event_media('pub-mapped') as v")).rows[0].v; } finally { await db.exec("reset search_path; reset role; drop schema evil cascade;"); }
    return v === false;
  });
  await check("S14", "the caller cannot supply an identity: extra args / wrong arity are rejected", async () => {
    const a = await as(db, "authenticated", U.STRANGER, `select public.can_upload_event_media('pub-mapped', '${U.MAPPED}')`);
    const b = await as(db, "authenticated", U.STRANGER, `select public.can_upload_event_media(p_user_id => '${U.MAPPED}')`);
    return !!a.err && !!b.err;
  });
  return res;
}

// ---- extra post-1C checks (the 1C interaction)
async function post1cChecks(db) {
  const res = []; const check = async (id, name, fn) => { let ok = false, why = ""; try { const v = await fn(); ok = v === true; if (!ok) why = "returned " + JSON.stringify(v); } catch (e) { why = String(e.message || e); } res.push({ id, name, ok, why, tag: "post-1C extra" }); };
  await check("C1", "1C is in effect: authenticated can NOT select events.submitted_by (a caller-RLS ownership read would fail)", async () =>
    /permission denied/i.test((await as(db, "authenticated", U.SUBMITTER, "select submitted_by from public.events where slug='pub-submitted'")).err || ""));
  await check("C2", "1C is in effect: authenticated can NOT read profile_owners", async () =>
    /permission denied/i.test((await as(db, "authenticated", U.MAPPED, "select owner_id from public.profile_owners")).err || ""));
  await check("C3", "...yet the DEFINER function still answers true for the submitted_by owner and the mapped owner", async () =>
    (await can(db, U.SUBMITTER, "pub-submitted")) === true && (await can(db, U.MAPPED, "pub-mapped")) === true && (await can(db, U.STRANGER, "pub-mapped")) === false);
  await check("C4", "a non-owner learns nothing: nonexistent slug and a draft owned by someone else look identical (false)", async () =>
    (await can(db, U.STRANGER, "draft-mapped")) === (await can(db, U.STRANGER, "zzz")));
  return res;
}

// ---- mutants for negative controls: each must FAIL its named checks
const hdr = (body, opts = "security definer set search_path = ''") => `create or replace function public.can_upload_event_media(p_event_slug text) returns boolean language sql stable ${opts} as $$ ${body} $$;
revoke all on function public.can_upload_event_media(text) from public, anon, authenticated, service_role; grant execute on function public.can_upload_event_media(text) to authenticated;`;
const MUTANTS = {
  "M1 visibility-only (any signed-in caller on a published event)": { fn: hdr(`select auth.uid() is not null and exists (select 1 from public.events e where e.slug = p_event_slug and e.status = 'published')`), mustFail: ["S3", "S4", "S6"] },
  "M2 unpinned search_path + unqualified refs": { fn: `create or replace function public.can_upload_event_media(p_event_slug text) returns boolean language sql stable security definer as $$
      select auth.uid() is not null and exists (select 1 from events e where e.slug = p_event_slug and (e.submitted_by = auth.uid() or exists (select 1 from profile_owners po where po.profile_slug = e.owner_handle and po.owner_id = auth.uid()))) $$;
    revoke all on function public.can_upload_event_media(text) from public, anon, authenticated, service_role; grant execute on function public.can_upload_event_media(text) to authenticated;`, mustFail: ["S12", "S13"] },
  "M3 default grants left in place (anon may execute)": { fn: `drop function public.can_upload_event_media(text); create function public.can_upload_event_media(p_event_slug text) returns boolean language sql stable security definer set search_path = '' as $$
      select auth.uid() is not null and exists (select 1 from public.events e where e.slug = p_event_slug and (e.submitted_by = auth.uid() or exists (select 1 from public.profile_owners po where po.profile_slug = e.owner_handle and po.owner_id = auth.uid()))) $$;`, mustFail: ["S9", "S10"] },
  "M4 returns the submitter id instead of a boolean": { fn: `drop function public.can_upload_event_media(text); create function public.can_upload_event_media(p_event_slug text) returns uuid language sql stable security definer set search_path = '' as $$
      select e.submitted_by from public.events e where e.slug = p_event_slug and (e.submitted_by = auth.uid()) $$;
    revoke all on function public.can_upload_event_media(text) from public, anon, authenticated, service_role; grant execute on function public.can_upload_event_media(text) to authenticated;`, mustFail: ["S11"] },
  "M5 SECURITY INVOKER (caller-RLS read of submitted_by)": { fn: hdr(`select auth.uid() is not null and exists (select 1 from public.events e where e.slug = p_event_slug and (e.submitted_by = auth.uid() or exists (select 1 from public.profile_owners po where po.profile_slug = e.owner_handle and po.owner_id = auth.uid())))`, "security invoker set search_path = ''"), post1c: true, mustFail: ["S2", "S5", "C3"] },
  "M6 my_profile_slug-style LIMIT 1 (arbitrary single owned profile)": { fn: hdr(`select auth.uid() is not null and exists (select 1 from public.events e where e.slug = p_event_slug and (e.submitted_by = auth.uid() or e.owner_handle = (select po.profile_slug from public.profile_owners po where po.owner_id = auth.uid() order by po.profile_slug desc limit 1)))`), mustFail: ["S5"] },
  "M7 trusts a caller-supplied handle claim via settings (user-controlled GUC)": { fn: hdr(`select exists (select 1 from public.events e where e.slug = p_event_slug and e.owner_handle = nullif(current_setting('request.jwt.claim.handle', true), ''))`), mustFail: ["S1", "S2"] },
};

// ------------------------------------------------------------------ run
const all = [];
const good = [];
for (const post1c of [false, true]) {
  const db = await world({ post1c });
  const r = await suite(db, post1c ? "post-1C" : "pre-1C"); good.push(...r);
  if (post1c) good.push(...await post1cChecks(db));
}
// rollback + idempotence
{
  const db = await world();
  const again = await db.exec(FN).then(() => true, () => false);     // CREATE OR REPLACE twice
  await db.exec(ROLLBACK);
  const gone = (await su(db, "select count(*)::int n from pg_proc where proname='can_upload_event_media'"))[0].n === 0;
  const callFails = /does not exist/i.test(String(await can(db, U.MAPPED, "pub-mapped")));
  await db.exec(FN);                                                 // and re-apply after rollback
  const back = (await can(db, U.MAPPED, "pub-mapped")) === true;
  good.push({ id: "R1", name: "idempotent re-apply, ROLLBACK drops the function (calls then error), re-apply works", ok: again && gone && callFails && back, why: JSON.stringify({ again, gone, callFails, back }), tag: "lifecycle" });
}
for (const r of good) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.id.padEnd(4)} [${r.tag}] ${r.name}${r.ok ? "" : "  <- " + r.why}`);
const goodFail = good.filter((r) => !r.ok);
console.log(`\nPOSITIVE: ${good.length - goodFail.length}/${good.length} pass`);

let controlsOk = true, controlChecks = 0;
for (const [name, m] of Object.entries(MUTANTS)) {
  const db = await world({ fn: FN, post1c: false });
  await db.exec("reset role");
  if (m.post1c) await db.exec(C1);
  await db.exec(m.fn);
  let r = await suite(db, "mutant"); if (m.post1c) r = r.concat(await post1cChecks(db));
  const failed = r.filter((x) => !x.ok).map((x) => x.id);
  const ok = m.mustFail.every((id) => failed.includes(id));
  controlChecks += m.mustFail.length;
  if (!ok) controlsOk = false;
  console.log(`CONTROL ${ok ? "OK  " : "BAD "} ${name}: fails [${failed.join(",")}] (required: ${m.mustFail.join(",")})`);
}
console.log(`NEGATIVE CONTROLS: ${Object.keys(MUTANTS).length} mutants, ${controlChecks} required failures, ${controlsOk ? "all observed" : "SOME MISSING"}`);
for (const d of dbs) await d.close().catch(() => {});
process.exit(goodFail.length === 0 && controlsOk ? 0 : 1);
