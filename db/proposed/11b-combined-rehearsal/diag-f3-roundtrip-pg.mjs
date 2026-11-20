/* diag-f3-roundtrip-pg.mjs - diagnostic for the real-PG17 difference in R1: F3 forward then F3 rollback (regenerated) does not restore the DRIFT_QUERY fingerprint.
   Builds the pre-F3 state (replica, APPLY-1, 1B, 92, 1C), records the DRIFT_QUERY state JSON, applies the forward, applies the regenerated rollback with ONLY its final fingerprint guard bypassed,
   then prints the path-level differences of the state JSON (raw, and with aclitem entry order normalised). Run: node db/proposed/11b-combined-rehearsal/diag-f3-roundtrip-pg.mjs --engine=pg [--packs=orig|r1]  (orig = the committed F3 pair: reproduces R1 = DIFFERENT; r1 = the R1-FIX pair: EQUAL)  (needs the local PG on the Unix socket) */
import { HERE, UP, P10A, F3, rd, rdp, PACKS, open, closeDb, tx, mutate, PGM } from "./lib/core.mjs";
if (!PGM) { console.log("needs --engine=pg"); process.exit(3); }
const P = "2026-11-09_f3_media_rls_connect_publish_gate_", ORIG = "c917a7dfbc778913b7e46b332aeeb348";
const REPLICA = mutate(rd(HERE, "COMBINED-REPLICA.sql"), "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;", "", "roles");
const FW = rdp("f3", F3, P + "FORWARD_PROPOSED.sql"), RB = rdp("f3", F3, P + "ROLLBACK_PROPOSED.sql"), DQ = rdp("f3", F3, P + "DRIFT_QUERY_PROPOSED.sql");
const regen = (rb) => mutate(mutate(rb, "GRANT UPDATE,DELETE,REFERENCES,TRIGGER ON TABLE public.event_media,public.venue_media,public.profile_meta TO anon;", "GRANT UPDATE,DELETE,REFERENCES,TRIGGER ON TABLE public.event_media,public.venue_media TO anon;", "a"), "GRANT TRUNCATE ON TABLE public.event_media,public.venue_media,public.profile_meta TO anon,authenticated;", "GRANT TRUNCATE ON TABLE public.event_media,public.venue_media TO anon,authenticated;", "b");
console.log("packs =", PACKS); await PGM.ensureRoles();
let db;
try {
  db = await open(); await db.exec(REPLICA);
  for (const f of [rdp("pr91", UP, "APPLY-1.sql"), rdp("pr91", UP, "APPLY-1B-kind-check.sql"), rdp("pr92", UP, "APPLY-92.sql"), rdp("10a", P10A, "APPLY-1C-grant-narrowing_PROPOSED.sql")]) { const r = await tx(db, f); if (!r.ok) throw new Error(r.err); }
  const state = async () => { await db.exec("reset role; set search_path = public, extensions"); const r = (await db.query(DQ)).rows[0]; await db.exec('set search_path = "$user", public'); return r; };
  const s0 = await state(); console.log("pre-F3 fingerprint", s0.fingerprint);
  let r = await tx(db, FW.split(ORIG).join(s0.fingerprint)); if (!r.ok) throw new Error("fw " + r.err);
  const s1 = await state(); console.log("after forward   ", s1.fingerprint);
  const rb = regen(RB).split(ORIG).join(s0.fingerprint); const rbB = mutate(rb, `IF v_fingerprint IS DISTINCT FROM '${s0.fingerprint}' THEN`, "IF false THEN", "guard");
  r = await tx(db, rbB); if (!r.ok) throw new Error("rb " + r.err);
  const s2 = await state(); console.log("after rollback  ", s2.fingerprint, s2.fingerprint === s0.fingerprint ? "(EQUAL)" : "(DIFFERENT)");
  { const f = s0.state.functions || s0.state[Object.keys(s0.state).find((k) => /function/.test(k))]; if (Array.isArray(f)) for (const i of [22, 23]) console.log("  function #" + i + " =", JSON.stringify(f[i]).slice(0, 200)); }
  const norm = (v) => Array.isArray(v) ? v.map(norm) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, norm(x)])) : typeof v === "string" && /^\{.*=.*\/.*\}$/.test(v) ? "{" + v.slice(1, -1).split(",").sort().join(",") + "}" : v;
  const flat = (v, p = "", o = {}) => { if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) flat(x, p + "/" + k, o); else o[p] = v; return o; };
  for (const [label, f] of [["RAW", (x) => x], ["ACL-ORDER-NORMALISED", norm]]) {
    const a = flat(f(JSON.parse(JSON.stringify(s0.state)))), b = flat(f(JSON.parse(JSON.stringify(s2.state)))); const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]);
    console.log(`\n${label}: ${keys.length} differing state paths`); for (const k of keys.slice(0, 20)) console.log("  " + k + "\n     before: " + JSON.stringify(a[k]) + "\n     after:  " + JSON.stringify(b[k])); }
} catch (e) { console.log("ERR " + e.message); } finally { if (db) await closeDb(db); await PGM.dropRoles(); await PGM.shutdownAdmin(); }
