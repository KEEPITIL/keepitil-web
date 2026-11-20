/* lib/pgdb.mjs - REAL PostgreSQL adapter for the 11B rehearsal harness (localhost-only, Unix socket, no password anywhere).
   Exposes the small PGlite-shaped surface the harness uses: exec(sql) -> Result[], query(sql) -> {rows, fields, affectedRows}.
   dumpDataDir()/loadDataDir() are replaced by CREATE DATABASE ... TEMPLATE: a "blob" is the name of a template database.
   Connection: node-postgres over the Unix-domain socket, user `postgres` (a NOSUPERUSER stand-in for Supabase's postgres owner) or pgadmin for DDL of databases.
   Nothing here reads or stores a password. Environment: KIL_PG_SOCKET_DIR (default ~/work/pg-local/run), KIL_PG_PORT (54329), KIL_PG_NODE_MODULES (where `pg` lives). */
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
const PGL = process.env.KIL_PG_HOME || join(homedir(), "work/pg-local");
const require = createRequire(join(process.env.KIL_PG_NODE_MODULES || PGL, "x.js"));
const pg = require("pg");
pg.types.setTypeParser(20, (v) => { const n = BigInt(v); return n <= 9007199254740991n && n >= -9007199254740991n ? Number(n) : n; });   // int8 like PGlite
const CONN = { host: process.env.KIL_PG_SOCKET_DIR || join(PGL, "run"), port: Number(process.env.KIL_PG_PORT || 54329) };
export const RUN = Math.random().toString(36).slice(2, 7);
let seq = 0; const owned = new Set();         // databases created by this run
let admin = null;
const adm = async () => { if (!admin) { admin = new pg.Client({ ...CONN, user: "pgadmin", database: "postgres" }); await admin.connect(); } return admin; };
const nm = (k) => `kil_rehearsal_${RUN}_${k}${++seq}`;
const quote = (s) => '"' + s.replace(/"/g, '""') + '"';

export const STANDIN_ROLES = ["authenticator", "anon", "authenticated", "service_role", "postgres"];
export async function ensureRoles() {
  const a = await adm();
  for (const [r, attrs] of [["anon", "NOLOGIN"], ["authenticated", "NOLOGIN"], ["service_role", "NOLOGIN BYPASSRLS"], ["postgres", "LOGIN NOSUPERUSER CREATEROLE CREATEDB BYPASSRLS"], ["authenticator", "LOGIN NOINHERIT NOSUPERUSER"]]) {
    const ex = (await a.query("select 1 from pg_roles where rolname=$1", [r])).rowCount;
    if (ex) throw new Error(`role ${r} already exists in the cluster: refusing to reuse (a previous run did not clean up?)`);
    await a.query(`CREATE ROLE ${r} ${attrs}`); }
  await a.query("GRANT anon, authenticated, service_role TO postgres");   // like Supabase: the owner role may SET ROLE into the API roles (PG requires membership)
  await a.query("GRANT anon, authenticated, service_role TO authenticator");   // PostgREST-style connection role: no privileges of its own (NOINHERIT), switches with SET LOCAL ROLE
  await a.query("GRANT pg_read_all_stats TO postgres");                          // lets the harness watch pg_stat_activity wait events of the other test sessions
}
export async function dropRoles() { const a = await adm(); for (const r of STANDIN_ROLES) { await a.query(`DROP OWNED BY ${r}`).catch(() => {}); await a.query(`DROP ROLE IF EXISTS ${r}`).catch((e) => console.log("dropRole " + r + ": " + e.message)); } }

function normalize(r) { return { rows: r.rows || [], fields: r.fields || [], affectedRows: r.rowCount ?? undefined, command: r.command }; }
export class PgDb {
  constructor(name, user = "postgres") { this.name = name; this.user = user; this.client = null; }
  async connect() { this.client = new pg.Client({ ...CONN, user: this.user, database: this.name }); this.client.on("error", () => {}); await this.client.connect(); return this; }
  async exec(sql) { const r = await this.client.query(sql); return (Array.isArray(r) ? r : [r]).map(normalize); }
  async query(sql) { const r = await this.client.query(sql); return normalize(Array.isArray(r) ? r[r.length - 1] : r); }
  async disconnect() { if (this.client) { const c = this.client; this.client = null; try { await c.end(); } catch {} } }
  async close() { await this.disconnect(); await dropDb(this.name); }
}
export async function createDb(template) {
  const a = await adm(); const name = nm(template ? "c" : "b");
  await a.query(`CREATE DATABASE ${quote(name)} OWNER postgres ${template ? "TEMPLATE " + quote(template) : "TEMPLATE template0"}`); owned.add(name);
  return new PgDb(name).connect(); }
/* snapshot: copy this database to a (never connected) template database. The source session is closed and reopened (CREATE DATABASE needs no other sessions on the source). */
export async function snapshotDb(db) {
  await db.client.query("reset role"); await db.disconnect();
  const a = await adm(); const name = nm("s");
  try { await a.query(`CREATE DATABASE ${quote(name)} OWNER postgres TEMPLATE ${quote(db.name)}`); owned.add(name); } finally { await db.connect(); }
  return { pgTemplate: name }; }
export async function dropDb(name) { const a = await adm(); await a.query(`DROP DATABASE IF EXISTS ${quote(name)} WITH (FORCE)`); owned.delete(name); }
export async function cleanupAll() { for (const n of [...owned]) { try { await dropDb(n); } catch (e) { console.log("cleanup " + n + ": " + e.message); } } }
export async function adminQuery(sql, params) { return (await adm()).query(sql, params); }
export async function shutdownAdmin() { if (admin) { try { await admin.end(); } catch {} admin = null; } }
export const newClient = async (dbname, user = "postgres") => new PgDb(dbname, user).connect();
export const connInfo = () => ({ ...CONN });
