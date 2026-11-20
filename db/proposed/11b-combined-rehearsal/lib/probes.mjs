/* lib/probes.mjs - the compact probe set used by the NEGATIVE CONTROLS. The same probes run on the correct combined order (all must pass: positive control)
   and on each mutant (the named probes must fail). Each probe maps to the matrix case / step assertion it stands for.                                         */
import { U, INS19, UPD14, E44, sorted, eq, su, one, as, tx, denied, colset, tp, fnp, collector, clone, closeDb, dump } from "./core.mjs";
import { SLUG, seedNova, getMeta, isReset } from "./payloads.mjs";
import { appRun, webRun, metaCalls } from "./steps2.mjs";

const anon = (db, sql) => as(db, "anon", "", sql), auth = (db, sub, sql) => as(db, "authenticated", sub, sql);
const PRIV = (r) => !!r.err && r.code === "42501" && /permission denied for table profile_meta/.test(r.err);

export async function probes(db, { sink = [] } = {}) {
  const { out, check } = collector(sink);
  const p = (id, name, fn, maps) => check(id, name, fn, { maps });
  await p("p.c3type", "owner UPDATE of account_type is refused at the privilege layer (stricter #91 denial)", async () => { await seedNova(db); return PRIV(await auth(db, U.OWN, `update public.profile_meta set account_type='editorial_brand' where slug='${SLUG}'`)); }, "C3.account_type");
  await p("p.c1status", "owner UPDATE of status is refused at the privilege layer", async () => { await seedNova(db, { over: { status: "review", sources: [], last_reviewed_at: null } }); return PRIV(await auth(db, U.OWN, `update public.profile_meta set status='published' where slug='${SLUG}'`)); }, "C1.status");
  await p("p.grantset", "authenticated column grants on profile_meta are exactly INSERT=19 / UPDATE=14", async () => eq(await colset(db, "authenticated", "profile_meta", "INSERT"), sorted(INS19)) && eq(await colset(db, "authenticated", "profile_meta", "UPDATE"), sorted(UPD14)), "C1C.1");
  await p("p.ev44", "events: anon/authenticated read exactly 44 columns (submitted_by closed)", async () => eq(await colset(db, "anon", "events", "SELECT"), sorted(E44)) && eq(await colset(db, "authenticated", "events", "SELECT"), sorted(E44)), "C1C.5");
  await p("p.trunc-pc", "TRUNCATE denied for anon+authenticated on profile_content and profile_owners", async () => { for (const r of ["anon", "authenticated"]) for (const t of ["profile_content", "profile_owners"]) if (!denied(await as(db, r, U.OWN, `truncate public.${t}`))) return r + " " + t; return true; }, "M12.1");
  await p("p.trunc-media", "TRUNCATE denied for anon+authenticated on event_media, venue_media, profile_meta", async () => { for (const r of ["anon", "authenticated"]) for (const t of ["event_media", "venue_media", "profile_meta"]) if (!denied(await as(db, r, U.OWN, `truncate public.${t}`))) return r + " " + t; return true; }, "M12.1");
  await p("p.app-nodemote", "the bundled app save never demotes a published page (refused, or no gate)", async () => { const r = await appRun(db); return r.row.status === "published"; }, "C5.legacy-upsert");
  await p("p.web-reset", "a real web bio edit on a published page is sent back to review with evidence cleared (F3 gate active)", async () => { const r = await webRun(db, "bio_edit"); const m = metaCalls(r)[0]; return !m.err && isReset(r.row); }, "C4.bio");
  await p("p.m9fn", "can_upload_event_media exists: submitter/mapped owner true, stranger false", async () => {
    const c = async (sub, slug) => { const r = await auth(db, sub, `select public.can_upload_event_media('${slug}') v`); return r.err ? "ERR" : r.rows[0].v; };
    return (await c(U.SUB, "ev-sub")) === true && (await c(U.OWN, "ev-pub")) === true && (await c(U.STR, "ev-pub")) === false; }, "11A.2 (M9)");
  await p("p.m9grants", "can_upload_event_media: anon cannot execute, authenticated can", async () => !(await fnp(db, "anon", "public.can_upload_event_media(text)")) && (await fnp(db, "authenticated", "public.can_upload_event_media(text)")), "11A.1 (M9)");
  await p("p.house", "anon get_public_profile('groove-trooper') returns the attested house page", async () => (await anon(db, "select slug from public.get_public_profile('groove-trooper')")).rows?.length === 1, "S4.1");
  await p("p.hash", "events.event_password_hash is unreadable for anon and authenticated", async () => denied(await anon(db, "select event_password_hash from public.events")) && denied(await auth(db, U.STR, "select event_password_hash from public.events")), "S92.1 / C1C.5");
  await p("p.btype", "the web business-type request (profile_content kind account_type_request) is accepted", async () => { const r = await webRun(db, "btype_request"); return r.res.filter((x) => x.call === "profile_content.insert").every((x) => !x.err); }, "C4/C5 web-btype");
  await p("p.c8b", "a trusted edit of an already-published row that violates the gate raises check_violation (early return removed)", async () => { await seedNova(db); const r = await as(db, "service_role", "", `update public.profile_meta set about=null, bio=null where slug='${SLUG}'`); return r.code === "23514"; }, "C8.b");
  await p("p.trigger-layer", "defence in depth: even if status/sources/last_reviewed_at were re-granted, the F3 trigger refuses the owner (42501 'server-managed')", async () => {
    const w = await clone(await dump(db)); try { await seedNova(w, { over: { status: "review", sources: [], last_reviewed_at: null } }); await tx(w, "grant update (status) on table public.profile_meta to authenticated"); const r = await auth(w, U.OWN, `update public.profile_meta set status='published' where slug='${SLUG}'`); return !!r.err && r.code === "42501" && /publication evidence is server-managed/.test(r.err); } finally { await closeDb(w); } }, "C1.trigger-layer");
  return out;
}
export const PROBE_IDS = ["p.c3type", "p.c1status", "p.grantset", "p.ev44", "p.trunc-pc", "p.trunc-media", "p.app-nodemote", "p.web-reset", "p.m9fn", "p.m9grants", "p.house", "p.hash", "p.btype", "p.c8b", "p.trigger-layer"];
