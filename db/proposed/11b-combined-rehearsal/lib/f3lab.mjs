/* lib/f3lab.mjs - D1 (drift), R1 (rollback exactness), R2 (rollback drift guards) for Atlas's F3 forward/rollback on the COMBINED pre-F3 state (after 1C).
   The forward/rollback files run as committed; the ONLY edit is the 32-hex baseline literal, replaced by the fingerprint the DRIFT_QUERY returns on the same catalog (the documented re-baseline).
   The rollback is run twice: as committed (it must REFUSE after 1C: it would re-open what 1C closed) and regenerated (profile_meta removed from its two re-grant lines).        */
import { PGM, U, one, su, as, tx, clone, closeDb, snapshot, diffSnap, brief, collector, lit, mutate } from "./core.mjs";

export function makeF3Lab({ F3_FW, F3_RB, F3_DQ, ORIG, regen, pre /* gz blob of the pre-F3 state */, post11A }) {
  const patch = (sql, f) => sql.split(ORIG).join(f);
  async function fpOf(db) { await db.exec("reset role; set search_path = public, extensions"); const r = await db.query(F3_DQ); await db.exec('set search_path = "$user", public'); return r.rows[0].fingerprint; }
  async function worldPre() { const db = await clone(pre); const F0 = await fpOf(db); return { db, F0 }; }
  async function worldFwd() { const { db, F0 } = await worldPre(); const fw = patch(F3_FW, F0); const r = await tx(db, fw); if (!r.ok) throw new Error("forward failed on pre-F3 clone: " + r.err); return { db, F0, fw, rbStock: patch(F3_RB, F0), rbRegen: patch(regen(F3_RB), F0), rbRegenNoEnd: mutate(patch(regen(F3_RB), F0), `IF v_fingerprint IS DISTINCT FROM '${F0}' THEN`, "IF false THEN", "end guard (scratch only)") }; }
  const sink = [];
  const mk = () => { const c = collector(sink); return { check: async (id, name, fn, extra) => c.check(id, name, fn, { case: id.split(".")[0], ...extra }) }; };

  async function drift() {
    const { check } = mk();
    const DRIFTS = [
      ["extra policy on event_media", "create policy zz_extra on public.event_media for select using (true)", /Catalog drift/],
      ["ACL change: anon SELECT revoked on profile_meta", "revoke select on public.profile_meta from anon", /Catalog drift/],
      ["publish-gate trigger disabled", "alter table public.profile_meta disable trigger profile_meta_publish_gate_trg", /Catalog drift/],
      ["is_admin() body changed", "create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select true $$", /Catalog drift/],
      ["unrelated public function added", "create function public.some_new_fn() returns int language sql as 'select 1'", /Catalog drift/],
      ["column default changed", "alter table public.event_media alter column status set default 'hidden'", /Catalog drift/],
      ["COMBINED: 1C undone in part (TRUNCATE re-granted to anon on profile_meta)", "grant truncate on public.profile_meta to anon", /Catalog drift/],
      ["COMBINED: 92/1C events column grant changed (submitted_by re-granted to anon)", "grant select (submitted_by) on public.events to anon", /Catalog drift/],
      ["COMBINED: a #91 policy edited (profile_owners_select_own dropped)", "drop policy profile_owners_select_own on public.profile_owners", /Catalog drift/],
      ["global postgres function default privileges present", "alter default privileges for role postgres grant execute on functions to anon", /Global function\/schema\/table defaults/],
      ["private schema already exists", "create schema atlas_media_guard", /Private schema already exists/]];
    for (const [label, ddl, re] of DRIFTS) await check(`D1.${label.replace(/\W+/g, "_").slice(0, 60)}`, `D1 forward aborts before any change on drift: ${label}`, async () => {
      const { db, F0 } = await worldPre(); try { await db.exec(ddl); const before = await snapshot(db); const r = await tx(db, patch(F3_FW, F0)); const st = await one(db, "select to_regclass('atlas_media_guard.orphan_event_media_backup') is null a, (select count(*)::int from public.event_media where status='hidden') h, (select with_check from pg_policies where tablename='event_media' and policyname='event_media_ins') w");
        const d = diffSnap(before, await snapshot(db)); return (!r.ok && re.test(r.err) && st.a === true && st.h === 0 && st.w === "true" && d.n === 0) || (r.err || "applied"); } finally { await closeDb(db); } });
    await check("D1.stale", "D1 STALE-BASELINE demonstration: the COMMITTED forward (Atlas's literal c917a7df...) aborts on the combined catalog and changes nothing", async () => {
      const { db } = await worldPre(); try { const before = await snapshot(db); const r = await tx(db, F3_FW); return (!r.ok && /Catalog drift/.test(r.err) && diffSnap(before, await snapshot(db)).n === 0) || (r.err || "applied"); } finally { await closeDb(db); } });
    await check("D1.fp-sensitive", "D1 the fingerprint is search_path-sensitive: the DRIFT_QUERY under an empty search_path differs from the value under 'public, extensions' that the forward uses (prod capture MUST use the documented SET)", async () => {
      const { db } = await worldPre(); try { const a = await fpOf(db); await db.exec("reset role; set search_path = ''"); const b = (await db.query(F3_DQ)).rows[0].fingerprint; await db.exec('set search_path = "$user", public'); return a !== b; } finally { await closeDb(db); } });
    return sink.filter((c) => c.case === "D1");
  }

  async function rollback() {
    const { check } = mk(); const out0 = sink.length;
    await check("R1.exact", "R1 forward then the REGENERATED rollback restores the pre-F3 catalog snapshot EXACTLY (relations, columns, ACLs, policies, triggers, constraints, functions incl md5) and the 19 orphan statuses; the guard schema is gone", async () => {
      const { db, F0, rbRegen } = await worldFwd(); try { const pre0 = await clone(pre); const snapPre = await snapshot(pre0); await closeDb(pre0); const r = await tx(db, rbRegen); if (!r.ok) return r.err;
        const d = diffSnap(snapPre, await snapshot(db)); const s = await one(db, "select (select count(*)::int from public.event_media where status='published' and event_slug like 'orphan-%') pub, exists(select 1 from pg_namespace where nspname='atlas_media_guard') g");
        return (d.n === 0 && s.pub === 19 && !s.g) || (d.n ? brief(d) : JSON.stringify(s)); } finally { await closeDb(db); } });
    if (PGM) {   // real PostgreSQL only: judge SEMANTIC exactness separately from the fingerprint-exact check above (aclitem ENTRY ORDER differs after the rollback, see REAL-PG-REPORT.md)
      await check("R1.exact-semantic", "R1 (real PG, extra) forward then the regenerated rollback with ONLY its ORDER-sensitive final fingerprint guard bypassed (scratch) restores the pre-F3 catalog snapshot EXACTLY with sorted ACLs, the 19 orphan statuses, no guard schema", async () => {
        const { db, rbRegenNoEnd } = await worldFwd(); try { const pre0 = await clone(pre); const snapPre = await snapshot(pre0); await closeDb(pre0); const r = await tx(db, rbRegenNoEnd); if (!r.ok) return r.err;
          const d = diffSnap(snapPre, await snapshot(db)); const s = await one(db, "select (select count(*)::int from public.event_media where status='published' and event_slug like 'orphan-%') pub, exists(select 1 from pg_namespace where nspname='atlas_media_guard') g"); return (d.n === 0 && s.pub === 19 && !s.g) || (d.n ? brief(d) : JSON.stringify(s)); } finally { await closeDb(db); } });
      await check("R1.reapply-semantic", "R1 (real PG, extra) after the rollback a SECOND forward is only possible with a RE-BASELINED literal (the rollback changed relacl entry order, so the pre-F3 fingerprint no longer matches); with the new DRIFT_QUERY value it applies and stores one guard row", async () => {
        const { db, rbRegenNoEnd, fw, F0 } = await worldFwd(); try { const r = await tx(db, rbRegenNoEnd); if (!r.ok) return r.err; const F1 = await fpOf(db); const stale = await tx(db, fw); if (stale.ok || !/Catalog drift/.test(stale.err)) return "stale literal did not abort: " + (stale.err || "applied"); if (F1 === F0) return "fingerprint unchanged after rollback (no reorder observed)";
          const again = await tx(db, patch(F3_FW, F1)); return again.ok ? (await one(db, "select count(*)::int n from atlas_media_guard.rollback_guard")).n === 1 : again.err; } finally { await closeDb(db); } }); }
    await check("R1.stock-after-1C", "R1 FINDING: the rollback AS COMMITTED (only the baseline literal swapped) REFUSES after 1C - its own final fingerprint check aborts because its blanket re-grants (TRUNCATE to anon+authenticated, UPDATE/DELETE/REFERENCES/TRIGGER to anon on profile_meta) would re-open what 1C closed; nothing is changed (README row 3: 'rollback must be regenerated')", async () => {
      const { db, rbStock } = await worldFwd(); try { const before = await snapshot(db); const r = await tx(db, rbStock); const d = diffSnap(before, await snapshot(db)); return (!r.ok && /Rollback did not restore original catalog/.test(r.err) && d.n === 0) || (r.err || "stock rollback applied (it re-opened 1C)"); } finally { await closeDb(db); } });
    await check("R1.stock-would-reopen", "R1 PROOF of the reason: forcing the stock rollback past its fingerprint check (check bypassed in a scratch clone) leaves anon/authenticated holding TRUNCATE and anon UPDATE/DELETE/REFERENCES/TRIGGER on profile_meta again", async () => {
      const { db, rbStock, F0 } = await worldFwd(); try { const bypass = mutate(rbStock, `IF v_fingerprint IS DISTINCT FROM '${F0}' THEN`, "IF false THEN", "final fp"); const r = await tx(db, bypass); if (!r.ok) return r.err;
        const p = await one(db, "select has_table_privilege('anon','public.profile_meta','TRUNCATE') a, has_table_privilege('authenticated','public.profile_meta','TRUNCATE') b, has_table_privilege('anon','public.profile_meta','UPDATE') c, has_table_privilege('anon','public.profile_meta','TRIGGER') d"); return p.a && p.b && p.c && p.d; } finally { await closeDb(db); } });
    await check("R1.reapply", "R1 forward, rollback, forward again succeeds on the same catalog (re-runnable) and stores one guard fingerprint", async () => { const { db, rbRegen, fw } = await worldFwd(); try { const r = await tx(db, rbRegen); if (!r.ok) return r.err; const again = await tx(db, fw); return again.ok ? (await one(db, "select count(*)::int n from atlas_media_guard.rollback_guard")).n === 1 : again.err; } finally { await closeDb(db); } });
    await check("R1.pending", "R1 rollback ABORTS (and changes nothing) while a pending venue submission exists", async () => { const { db, rbRegen } = await worldFwd(); try { await tx(db, "insert into public.venue_media(venue_slug,media_url,status) values ('v-pub','u','pending')"); const before = await snapshot(db); const r = await tx(db, rbRegen); return (!r.ok && /Pending venue submissions exist/.test(r.err) && diffSnap(before, await snapshot(db)).n === 0 && (await one(db, "select count(*)::int p from public.venue_media where status='pending'")).p === 1) || (r.err || "applied"); } finally { await closeDb(db); } });
    const R2 = [["a policy was added after forward", "create policy zz_late on public.venue_media for select using (true)"], ["a PATCHED policy (event_media_ins) was edited after forward", "drop policy event_media_ins on public.event_media; create policy event_media_ins on public.event_media for insert to authenticated with check (status = 'pending')"], ["an unrelated public routine was added after forward", "create function public.late_fn() returns int language sql as 'select 2'"],
      ["COMBINED: the 11A function was added after forward and NOT rolled back first (ordering rule)", post11A], ["COMBINED: a 1C-closed privilege on an in-scope table (profile_meta TRUNCATE) was re-granted after forward", "grant truncate on public.profile_meta to anon"]];
    for (const [label, ddl] of R2) await check(`R2.${label.replace(/\W+/g, "_").slice(0, 50)}`, `R2 rollback ABORTS before restoring anything when ${label}; no partial restoration`, async () => {
      const { db, rbRegen } = await worldFwd(); try { await db.exec(ddl); const before = await snapshot(db); const r = await tx(db, rbRegen); const d = diffSnap(before, await snapshot(db)); return (!r.ok && /Forward catalog changed/.test(r.err) && d.n === 0) || (r.err || "applied"); } finally { await closeDb(db); } });
    await check("R2.quarantine", "R2 rollback ABORTS if a quarantined row's content changed (no clobber of later media edits)", async () => { const { db, rbRegen } = await worldFwd(); try { await db.exec("update public.event_media set title='edited later' where event_slug='orphan-3'"); const r = await tx(db, rbRegen); return !r.ok && /Quarantined rows changed/.test(r.err); } finally { await closeDb(db); } });
    return sink.slice(out0).filter((c) => c.case === "R1" || c.case === "R2");
  }
  return { drift, rollback, fpOf, worldPre, worldFwd, patch, sink };
}
