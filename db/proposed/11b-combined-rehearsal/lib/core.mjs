/* lib/core.mjs - shared helpers for the 11B combined rehearsal (PGlite loader, role-switching query helper, catalog snapshot/diff, file readers, identities).
   Nothing here touches a hosted database. PGlite is located the way the earlier proofs did: `import "@electric-sql/pglite"`, else $PGLITE_DIR/node_modules/..., else ~/work/pgl-scratch. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export const HERE = dirname(dirname(fileURLToPath(import.meta.url)));        // .../db/proposed/11b-combined-rehearsal
export const PROPOSED = join(HERE, "..");                                     // .../db/proposed
export const P10A = join(PROPOSED, "10a-privacy-dependency"), UP = join(P10A, "upstream"), F3 = join(PROPOSED, "f3-publish-gate"), A11 = join(PROPOSED, "11a-upload-ownership");
export const rd = (...p) => readFileSync(join(...p), "utf8");

export let PGlite = null;
export async function loadPGlite() {
  if (PGlite) return PGlite;
  const tries = [async () => (await import("@electric-sql/pglite")).PGlite];
  for (const dir of [process.env.PGLITE_DIR, join(homedir(), "work/pgl-scratch")].filter(Boolean))
    tries.push(async () => (await import(pathToFileURL(join(dir, "node_modules/@electric-sql/pglite/dist/index.js")).href)).PGlite);
  for (const t of tries) { try { PGlite = await t(); if (PGlite) return PGlite; } catch {} }
  console.error("PGlite not importable; set PGLITE_DIR=<dir containing node_modules/@electric-sql/pglite>"); process.exit(3);
}

/* ---------------- identities (all synthetic) */
export const U = {
  TUI: "4f1ff687-e287-496e-8eb4-c444f8e556d1", FOB: "d1ef5687-7410-4027-b94d-e4de393c27d9", AUD: "aaaaaaaa-0000-4000-8000-000000000001",
  ADM2: "bbbbbbbb-0000-4000-8000-000000000001", HOUSE: "cccccccc-0000-4000-8000-000000000001", STRG: "dddddddd-0000-4000-8000-000000000001",
  OWN: "a0000000-0000-4000-8000-000000000001", OWN2: "a0000000-0000-4000-8000-000000000002", STR: "a0000000-0000-4000-8000-000000000003",
  ADM: "a0000000-0000-4000-8000-000000000004", SUB: "a0000000-0000-4000-8000-000000000005",
};

/* ---------------- column sets (copied from the packs; checked against the live grants by the harness) */
export const UPD14 = ["display_name", "handle", "location", "bio", "about", "links", "links_label", "socials", "avatar_url", "cover_url", "cover_mobile_url", "profile_public", "public_fields", "updated_at"];
export const INS19 = ["slug", ...UPD14, "tagline", "pronouns", "book_email", "highlights"];
export const A22 = ["slug", "display_name", "handle", "location", "bio", "tagline", "pronouns", "book_email", "about", "links", "links_label", "badges", "account_type", "status", "avatar_url", "cover_url", "cover_mobile_url", "socials", "highlights", "updated_at", "profile_public", "public_fields"];
export const E45 = "accent_color,city,county,cover_url,created_at,dedupe_key,description,end_time_public,ends_at,extra_links,featured,features,gallery,genres,hide_guest_count,id,imported_at,link_checked_at,link_detail,link_last_ok_at,link_status,owner_handle,password_protected,reg_questions,review_reason,series_id,show_feed,show_gallery,show_lineup,show_on_explore,slug,source,source_url,spotify_url,starts_at,state,status,submitted_by,tagline,title,title_font,tz,venue,waitlist_enabled,youtube_url".split(",");
export const E44 = E45.filter((c) => c !== "submitted_by");
export const F3_CONTENT19 = ["slug", "display_name", "handle", "location", "bio", "tagline", "pronouns", "avatar_url", "cover_url", "book_email", "socials", "highlights", "about", "links", "account_type", "links_label", "badges", "cover_mobile_url", "entity_category"];
export const sorted = (a) => [...a].sort();
export const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const lit = (v) => v === null || v === undefined ? "null" : "'" + String(v).replace(/'/g, "''") + "'";

/* ---------------- database helpers */
const dbs = new Set();
/* ENGINE: "pglite" (default) or "pg" (real PostgreSQL over a Unix socket; --engine=pg or KIL_ENGINE=pg). In "pg" mode a blob is {pgTemplate: dbname}. */
export const ENGINE = (process.argv.find((a) => a.startsWith("--engine=")) || "").slice(9) || process.env.KIL_ENGINE || "pglite";
export const PGM = ENGINE === "pg" ? await import("./pgdb.mjs") : null;
export async function open(blob) { if (PGM) { const db = await PGM.createDb(blob && blob.pgTemplate); dbs.add(db); return db; } const P = await loadPGlite(); const db = blob ? new P({ loadDataDir: blob }) : new P(); await db.waitReady; dbs.add(db); return db; }
export async function closeDb(db) { try { await db.close(); } catch {} dbs.delete(db); }
export async function dump(db) { await db.exec("reset role"); if (PGM) return await PGM.snapshotDb(db); return await db.dumpDataDir("gzip"); }
export async function clone(blob) { return open(blob); }
export const su = async (db, sql) => { await db.exec("reset role"); return (await db.query(sql)).rows; };
export const one = async (db, sql) => (await su(db, sql))[0];
/* run `sql` as a database role with a JWT subject; never throws: {rows,n,err,code}. Roles are REAL (SET ROLE), not "postgres pretending". */
export async function as(db, role, sub, sql) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${sub || ""}', false); set role ${role};`);
  try { const r = await db.query(sql); return { rows: r.rows, fields: (r.fields || []).map((f) => f.name), n: r.affectedRows ?? r.rows.length }; }
  catch (e) { try { await db.exec("rollback"); } catch {} return { err: String(e.message || e), code: e.code }; }
  finally { await db.exec("reset role"); }
}
/* run a (possibly multi-statement, possibly transactional) script as the owner; never throws */
export async function tx(db, sql) { await db.exec("reset role"); try { await db.exec(sql); return { ok: true }; } catch (e) { try { await db.exec("rollback"); } catch {} return { ok: false, err: String(e.message || e), code: e.code }; } }
export const denied = (r) => !!r.err && /permission denied/i.test(r.err);
export const rlsDenied = (r) => !!r.err && /row-level security/i.test(r.err);
export const colset = async (db, role, table, priv) => (await su(db, `select a.attname::text n from pg_attribute a where a.attrelid='public.${table}'::regclass and a.attnum>0 and not a.attisdropped and has_column_privilege('${role}','public.${table}',a.attname,'${priv}') order by a.attname::text collate "C"`)).map((r) => r.n);
export const tp = async (db, role, table, priv) => (await one(db, `select has_table_privilege('${role}','public.${table}','${priv}') v`)).v;
export const fnp = async (db, role, sig) => (await one(db, `select has_function_privilege('${role}','${sig}','EXECUTE') v`)).v;
export const mutate = (sql, from, to, what) => { const i = sql.indexOf(from); if (i < 0) throw new Error("mutation anchor not found: " + what); if (sql.indexOf(from, i + 1) >= 0) throw new Error("mutation anchor not unique: " + what); return sql.slice(0, i) + to + sql.slice(i + from.length); };

/* ---------------- check collector */
export function collector(sink) {
  const out = sink || [];
  const check = async (id, name, fn, extra = {}) => { let ok = false, why = ""; try { const v = await fn(); ok = v === true; if (!ok) why = typeof v === "string" ? v : "returned " + JSON.stringify(v); } catch (e) { ok = false; why = "threw: " + String(e.message || e).slice(0, 300); } const r = { id, name, ok, why, ...extra }; out.push(r); return r; };
  return { out, check };
}

/* ---------------- catalog snapshot + exact diff */
export const snapshot = async (db) => (await one(db, "select rehearsal.catalog_snapshot() s")).s;
export function diffSnap(a, b, sections) {
  const out = {}; let n = 0;
  for (const sec of sections || Object.keys({ ...a, ...b })) {
    const A = a[sec] ?? {}, B = b[sec] ?? {}; const d = { removed: [], added: [], changed: [] };
    if (Array.isArray(A) || Array.isArray(B)) { if (JSON.stringify(A) !== JSON.stringify(B)) d.changed.push({ key: "(array)", from: A, to: B }); }
    else for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
      if (!(k in B)) d.removed.push(k); else if (!(k in A)) d.added.push(k);
      else if (JSON.stringify(A[k]) !== JSON.stringify(B[k])) d.changed.push({ key: k, from: A[k], to: B[k] });
    }
    if (d.removed.length || d.added.length || d.changed.length) { out[sec] = d; n += d.removed.length + d.added.length + d.changed.length; }
  }
  return { n, sections: out };
}
export const brief = (d, max = 6) => Object.entries(d.sections).map(([s, x]) => `${s}: ${x.removed.length} removed, ${x.added.length} added, ${x.changed.length} changed` + [...x.removed.map((k) => " -" + k), ...x.added.map((k) => " +" + k), ...x.changed.map((c) => " ~" + c.key)].slice(0, max).join(";")).join(" | ");

/* ---------------- PRECHECK-10A block H (privilege fingerprint, same expression as ROLLBACK-1C) */
function stmts(sqlText) {
  const clean = sqlText.split("\n").map((l) => l.replace(/^\s*--.*$/, "").replace(/;\s*--.*$/, ";")).join("\n");
  return clean.split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);
}
const PRE10A = rd(P10A, "PRECHECK-10A.sql");
export const FP_STMT = stmts(PRE10A).find((s) => /^SELECT md5\(string_agg/.test(s));
export const fp = async (db) => (await one(db, FP_STMT)).acl_fingerprint;
export const PRECHECK_10A_STMTS = stmts(PRE10A);

export function ensureDir(d) { if (!existsSync(d)) mkdirSync(d, { recursive: true }); return d; }
export { writeFileSync, existsSync };
