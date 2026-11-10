/* lib/payloads.mjs - turns the recorded client calls (payload-fixtures/*.json) into the SQL PostgREST would generate, and seeds the replay row.
   web-payloads.json  = the REAL final web save (#129 / 10B profile.html) driven through the repo's own vm harness (extract-web-payloads.mjs)
   app-payload.json   = the REAL bundled-app save (www/profile.html copy inside the iOS bundle: 19-key upsert incl account_type) (extract-app-payload.mjs)            */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HERE, lit, U, su, tx } from "./core.mjs";

export const WEB = JSON.parse(readFileSync(join(HERE, "payload-fixtures/web-payloads.json"), "utf8"));
export const APP = JSON.parse(readFileSync(join(HERE, "payload-fixtures/app-payload.json"), "utf8"));
export const SLUG = "novahaze";                      // the slug the fixtures were recorded against

const JSONB = new Set(["links", "socials", "highlights", "badges", "sources", "data"]), TSTZ = new Set(["updated_at", "last_reviewed_at"]), BOOL = new Set(["profile_public", "admin_approved", "age_verified", "is_minor", "under_18"]), ARR = new Set(["public_fields"]);
export function val(k, v) {
  if (v === null || v === undefined) return "null";
  if (JSONB.has(k)) return lit(JSON.stringify(v)) + "::jsonb";
  if (ARR.has(k)) return v.length ? "array[" + v.map(lit).join(",") + "]::text[]" : "array[]::text[]";
  if (TSTZ.has(k)) return lit(v) + "::timestamptz";
  if (BOOL.has(k)) return v ? "true" : "false";
  return lit(v);
}
/* one recorded SB call -> SQL (slug/user rewritten to the replay row/owner) */
export function writeToSql(w, slug, userId) {
  const p = w.payload ? { ...w.payload } : null;
  if (w.table === "profile_meta") {
    if (p && "slug" in p) p.slug = slug;
    const cols = p ? Object.keys(p) : [];
    if (w.op === "update") return `update public.profile_meta set ${cols.map((c) => `${c}=${val(c, p[c])}`).join(", ")} where slug=${lit(slug)} returning slug`;
    if (w.op === "insert") return `insert into public.profile_meta(${cols.join(",")}) values (${cols.map((c) => val(c, p[c])).join(",")}) returning slug,status,account_type`;
    if (w.op === "upsert") return `insert into public.profile_meta(${cols.join(",")}) values (${cols.map((c) => val(c, p[c])).join(",")}) on conflict (slug) do update set ${cols.map((c) => `${c}=excluded.${c}`).join(", ")} returning slug`;
  }
  if (w.table === "profile_content") {
    if (w.op === "delete") { const kind = (w.eq.find((e) => e[0] === "kind") || [])[1]; return `delete from public.profile_content where profile_slug=${lit(slug)}${kind ? ` and kind=${lit(kind)}` : ""} returning id`; }
    if (w.op === "insert") { p.profile_slug = slug; p.created_by = userId; const cols = Object.keys(p); return `insert into public.profile_content(${cols.join(",")}) values (${cols.map((c) => val(c, p[c])).join(",")}) returning id`; }
  }
  throw new Error("unsupported recorded call " + w.table + "." + w.op);
}
export const metaWrites = (writes) => writes.filter((w) => w.table === "profile_meta");

/* replay the recorded calls as a role; returns one result per call */
export async function replay(as, db, role, sub, writes, slug = SLUG) {
  const out = [];
  for (const w of writes) { const r = await as(db, role, sub, writeToSql(w, slug, sub)); out.push({ call: `${w.table}.${w.op}`, keys: w.payload ? Object.keys(w.payload) : [], ...r }); }
  return out;
}

/* the owner row the fixtures were recorded against, as a COMPLETE published page (passes the production gate) owned by `owner` (default U.OWN).
   Inserted as postgres (trusted path); requires the six #91 columns (call only after APPLY-1). */
export async function seedNova(db, { slug = SLUG, owner = U.OWN, over = {} } = {}) {
  const S = WEB.stored;
  const row = { slug, display_name: S.name, handle: S.handle, location: S.location, bio: S.bio, tagline: S.tagline, pronouns: S.pronouns, book_email: S.book_email, about: S.about, links: S.links, links_label: S.links_label, badges: S.badges,
    socials: S.socials, highlights: S.highlights, avatar_url: S.avatar, cover_url: S.cover, cover_mobile_url: S.cover_mobile, account_type: S.account_type, status: "published", profile_public: S.profile_public, public_fields: S.public_fields,
    entity_category: "dj", sources: [{ url: "https://x.test/src-nova", http_status: "200" }], last_reviewed_at: new Date().toISOString(), ...over };
  await tx(db, `delete from public.profile_content where profile_slug=${lit(slug)}; delete from public.profile_owners where profile_slug=${lit(slug)}; delete from public.profile_meta where slug=${lit(slug)};`);
  const cols = Object.keys(row);
  const r = await tx(db, `insert into public.profile_meta(${cols.join(",")}) values (${cols.map((c) => val(c, row[c])).join(",")}); insert into public.profile_owners(profile_slug,owner_id) values (${lit(slug)},${lit(owner)});`);
  if (!r.ok) throw new Error("seedNova failed: " + r.err);
  return row;
}
export const getMeta = async (db, slug = SLUG) => (await su(db, `select * from public.profile_meta where slug=${lit(slug)}`))[0];
export const isReset = (r) => r && r.status === "review" && JSON.stringify(r.sources) === "[]" && r.last_reviewed_at === null;
