/* build.mjs - generator for the 17A storage-privacy packs (PROPOSAL ONLY; nothing here touches any database).
   Inputs  : baseline/PROD-FACTS-17A.md (live prod catalog facts captured read-only by KODE; the expectations below are transcribed from it)
   Outputs : packs/*.sql, PRECHECK-17A.sql, PRECHECK-17A-INVENTORY_READONLY.sql (every fingerprint literal is computed here, never typed by hand)
   Pack frame = R1 #136 / 12A / 13A: BEGIN; lock_timeout 5s; repo-wide advisory lock; lock_timeout 5s; DRIFT GUARD (abort on anything but the captured state);
   invariant snapshot; THE FIX; POST-CHECKS (assert); INVARIANT compare (nothing else changed); retained evidence; COMMIT.  ROLLBACK pack = the exact inverse.
   Packs (apply order in README): P0 record Grok 21:47 | P4 profile_content | P1 listing policies | P5 agent-posts limits | P2 private drafts bucket | P3a public-assets | P3b chat-images scoped insert+limits | P3c chat-images private | P6 vs-entries reviewer/approved
   NO DELETE of any object or row appears in any pack (bucket rows created here are left in place by their rollbacks, see README).
   Usage: node build.mjs [--check] */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { aclSorted, LOCK_KEY } from "../r1-fix-f3-acl-locks/build-variants.mjs";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_PACK_KEY = "2979301232487107403";
if (LOCK_KEY !== REPO_PACK_KEY) throw new Error("repo-wide pack key changed: " + LOCK_KEY);
export const PUBLIC_ASSETS_MIN = 6;           // P3c refuses unless public-assets already holds at least this many objects (the 6 public event/profile assets)
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const ABS = "ABSENT";

/* ---------- captured expectations (baseline/PROD-FACTS-17A.md) */
export const BAK = ["_bak_agent_knowledge_corrupt_20260814", "_bak_app_users_seed_20260815", "_bak_cron_config_20260814", "_bak_events_no_image_20260815", "_bak_profile_content_corrupt_20260815",
  "_bak_profile_content_orphan_articles_20260815", "_bak_profile_meta_20260814", "_bak_profile_owners_20260815", "_bak_venue_queue_20260818", "_bak_venues_20260814", "_bak_venues_20260818"];
const PC_ACL_A0 = "{anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}";          // captured prod (before 10A APPLY-1C)
const PC_ACL_A1 = "{anon=r/postgres,authenticated=arwd/postgres,postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}";                      // after 10A APPLY-1C (anon SELECT only; authenticated loses TRUNCATE/REFERENCES/TRIGGER/MAINTAIN)
export const IMG_MIME = ["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"];
export const AP_MIME_KEEP_SVG = [...IMG_MIME, "image/svg+xml"].sort();      // P5 (default): SVG stays allowed: the 211 existing .svg cards imply the generators upload SVG, generator source NOT available (UNVERIFIED)
export const AP_MIME_NO_SVG = IMG_MIME;                                     // P5B variant: only after the generators are confirmed not to upload SVG
export const AP_LIMIT = 10485760;                                           // 10 MiB (= agent-masters)
export const CI_MIME = ["image/gif", "image/heic", "image/jpeg", "image/png", "image/webp"];
export const CI_LIMIT = 10485760;
export const PA_MIME = IMG_MIME, PA_LIMIT = 5242880;                        // public-assets: 5 MiB
export const DR_MIME = [...IMG_MIME, "image/svg+xml"].sort(), DR_LIMIT = 10485760;   // agent-drafts (private)
const pgarr = (a) => "ARRAY[" + a.map(q).join(",") + "]::text[]";
const joinS = (a) => [...a].sort().join(",");

/* ---------- fact expressions: each returns ONE text value */
const OBJ = "p.schemaname = 'storage' AND p.tablename = 'objects'";
const bk = (id, expr) => `(SELECT ${expr} FROM storage.buckets b WHERE b.id = ${q(id)})`;
const bkpub = (id) => bk(id, "b.public::text");
const bklim = (id) => bk(id, "coalesce(b.file_size_limit::text,'(null)')");
const bkmime = (id) => bk(id, `coalesce((SELECT string_agg(m, ',' ORDER BY m COLLATE "C") FROM unnest(b.allowed_mime_types) m),'(null)')`);
const bkrow = (id) => `(SELECT md5(b::text) FROM storage.buckets b WHERE b.id = ${q(id)})`;
const polSel = (bucket) => `(SELECT coalesce(string_agg(p.policyname::text, ',' ORDER BY p.policyname::text COLLATE "C"),'(none)') FROM pg_policies p WHERE ${OBJ} AND p.cmd IN ('SELECT','ALL') AND (coalesce(p.qual,'') || ' ' || coalesce(p.with_check,'')) ~ ${q(bucket)})`;
const polIns = (bucket) => `(SELECT coalesce(string_agg(p.policyname::text, ',' ORDER BY p.policyname::text COLLATE "C"),'(none)') FROM pg_policies p WHERE ${OBJ} AND p.cmd IN ('INSERT','ALL') AND (coalesce(p.qual,'') || ' ' || coalesce(p.with_check,'')) ~ ${q(bucket)})`;
const polShape = (name) => `(SELECT p.cmd || '|' || array_to_string(p.roles, ',') || '|' || p.permissive FROM pg_policies p WHERE ${OBJ} AND p.policyname = ${q(name)})`;
const polNorm = (name) => `(SELECT regexp_replace(coalesce(p.qual,'') || '~' || coalesce(p.with_check,''), '[\\s()]|::text', '', 'g') FROM pg_policies p WHERE ${OBJ} AND p.policyname = ${q(name)})`;
const polHas = (name, ...res) => `(SELECT (${res.map((r) => `(coalesce(p.qual,'') || ' ' || coalesce(p.with_check,'')) ~ ${q(r)}`).join(" AND ")})::text FROM pg_policies p WHERE ${OBJ} AND p.policyname = ${q(name)})`;
const aclx = (expr) => `coalesce(${aclSorted(expr)},'(default)')`;
const relacl = (reg) => `(SELECT ${aclx("c.relacl")} FROM pg_class c WHERE c.oid = ${q(reg)}::regclass)`;
const fnExists = (sig) => `(to_regprocedure(${q(sig)}) IS NOT NULL)::text`;
const fnExec = (sig, role) => `(SELECT has_function_privilege(${q(role)}, to_regprocedure(${q(sig)}), 'EXECUTE')::text)`;
const colsPresent = (t, cols) => `(SELECT count(*)::text FROM unnest(ARRAY[${cols.map(q).join(",")}]) c WHERE EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass(${q(t)}) AND a.attname = c AND NOT a.attisdropped))`;
const objRls = `(SELECT c.relrowsecurity::text || '/' || c.relforcerowsecurity::text FROM pg_class c WHERE c.oid = 'storage.objects'::regclass)`;
const bakAnyPriv = (t) => `(SELECT (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES') OR has_any_column_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES') OR coalesce((SELECT bool_or(x.grantee = 0) FROM aclexplode(c.relacl) x), false))::text FROM pg_class c WHERE c.oid = to_regclass('public.${t}'))`;
/* dynamic read-only scan (counts only): table.column pairs in public base tables (text/varchar/json/jsonb) with at least one row mentioning the needle. Never returns row contents. */
export const SCAN_CTE = (needle) => `cols AS (
  SELECT c.table_name::text AS t, c.column_name::text AS col FROM information_schema.columns c JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
  WHERE c.table_schema = 'public' AND tb.table_type = 'BASE TABLE' AND c.data_type IN ('text','character varying','json','jsonb') AND c.table_name NOT LIKE '\\_bak\\_%'
), hits AS (
  SELECT t, col, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I where strpos(%I::text, %L) > 0', t, col, ${q(needle)}), false, true, '')))[1]::text::int AS n FROM cols
)`;
const refsScan = (needle) => `(WITH ${SCAN_CTE(needle)} SELECT coalesce(string_agg(t || '.' || col || '=' || n, ',' ORDER BY t, col), 'none') FROM hits WHERE n > 0)`;
const objsMeta = (bucket) => `(SELECT count(*)::text FROM storage.objects o WHERE o.bucket_id = ${q(bucket)})`;
const mimeOutside = (bucket, list) => `(SELECT count(*)::text FROM storage.objects o WHERE o.bucket_id = ${q(bucket)} AND coalesce(o.metadata->>'mimetype','(none)') <> ALL (${pgarr(list)}))`;

/* invariants: evaluated before and after the fix inside the transaction; must be EQUAL (the pack changed nothing else) */
function storageInv(changedPolicies, targetBuckets) {
  const np = changedPolicies.map(q).join(",") || "''", nb = targetBuckets.map(q).join(",") || "''";
  return [
    ["inv.objects_acl_sorted", relacl("storage.objects")],
    ["inv.buckets_acl_sorted", relacl("storage.buckets")],
    ["inv.objects_rls", objRls],
    ["inv.objects_rows_md5", `(SELECT count(*)::text || ':' || coalesce(md5(string_agg(o.bucket_id || '/' || o.name || '/' || coalesce(o.owner_id,''), '|' ORDER BY o.bucket_id, o.name)),'-') FROM storage.objects o)`],
    ["inv.other_policies_md5", `(SELECT count(*)::text || ':' || coalesce(md5(string_agg(p.policyname || '|' || p.cmd || '|' || array_to_string(p.roles,',') || '|' || p.permissive || '|' || coalesce(p.qual,'') || '|' || coalesce(p.with_check,''), E'\\n' ORDER BY p.policyname COLLATE "C")),'-') FROM pg_policies p WHERE ${OBJ} AND p.policyname NOT IN (${np}))`],
    ["inv.other_buckets_md5", `(SELECT count(*)::text || ':' || coalesce(md5(string_agg(b::text, '|' ORDER BY b.id)),'-') FROM storage.buckets b WHERE b.id NOT IN (${nb}))`],
  ];
}

/* ---------- the packs.  pre/post: [name, sqlExpr, expected | [accepted...] | null(record only)]; reqs: guard-only; inv: must be equal before/after */
const ADMIN_OWNER_BUCKET = (bucket, own) => `bucket_id = ${q(bucket)} AND (${own} OR public.is_admin())`;
const UID = "(SELECT auth.uid())::text";
const FNAME1 = "(storage.foldername(name))[1]";
const CI_PROFILE_OWNER = `(${FNAME1} = 'profiles' AND EXISTS (SELECT 1 FROM public.profile_owners po WHERE po.owner_id = (SELECT auth.uid()) AND po.profile_slug = (storage.foldername(name))[2]))`;
export const P1_FIX = `-- 1. drop the four bucket-wide LISTING policies (public buckets serve /storage/v1/object/public/<bucket>/<path> WITHOUT any SELECT policy, so public URLs keep working; these policies only let anyone list/select/download through the API)
DROP POLICY agent_posts_public_read ON storage.objects;
DROP POLICY "chat images public read" ON storage.objects;
DROP POLICY "playlist covers are publicly readable" ON storage.objects;
DROP POLICY vs_media_read ON storage.objects;
-- 2. owner/admin-scoped replacements (authenticated only; anon gets none)
-- agent-posts is written by service_role only (posts/, competitions/): admin-only SELECT.
CREATE POLICY agent_posts_admin_read ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (bucket_id = 'agent-posts' AND public.is_admin());
-- chat-images: the uploader (storage owner_id), the owner of the profile for profiles/<slug>/..., or an admin. (Paths are NOT uid-prefixed: profile.html uses profiles/<slug>/..., create-event.html event-flyers/...)
CREATE POLICY chat_images_owner_admin_read ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (${ADMIN_OWNER_BUCKET("chat-images", `owner_id = ${UID} OR ${CI_PROFILE_OWNER}`)});
CREATE POLICY playlist_covers_owner_admin_read ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (${ADMIN_OWNER_BUCKET("playlist-covers", `${FNAME1} = ${UID}`)});
CREATE POLICY vs_media_owner_admin_read ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (${ADMIN_OWNER_BUCKET("vs-entries", `${FNAME1} = ${UID}`)});`;
export const P1_ROLLBACK = `DROP POLICY agent_posts_admin_read ON storage.objects;
DROP POLICY chat_images_owner_admin_read ON storage.objects;
DROP POLICY playlist_covers_owner_admin_read ON storage.objects;
DROP POLICY vs_media_owner_admin_read ON storage.objects;
CREATE POLICY agent_posts_public_read ON storage.objects AS PERMISSIVE FOR SELECT TO public USING (bucket_id = 'agent-posts');
CREATE POLICY "chat images public read" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING (bucket_id = 'chat-images');
CREATE POLICY "playlist covers are publicly readable" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING (bucket_id = 'playlist-covers');
CREATE POLICY vs_media_read ON storage.objects AS PERMISSIVE FOR SELECT TO public USING (bucket_id = 'vs-entries');`;

export const P4_FIX = `-- profile_content: "profile_content read all" (USING true) lets anon read ARCHIVED rows (autopilot review-queue items, owner-archived posts). Replace with three scoped policies.
-- Public: archived IS NOT TRUE (not "= false": a NULL archived row stays public exactly as today). Owners: their own rows incl. archived (the profile page Archive list and Unarchive flow need it). Admins: everything (review queue).
DROP POLICY "profile_content read all" ON public.profile_content;
CREATE POLICY "profile_content read public" ON public.profile_content AS PERMISSIVE FOR SELECT TO public USING (archived IS NOT TRUE);
CREATE POLICY "profile_content read owner" ON public.profile_content AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profile_owners po WHERE po.profile_slug = profile_content.profile_slug AND po.owner_id = (SELECT auth.uid())));
CREATE POLICY "profile_content read admin" ON public.profile_content AS PERMISSIVE FOR SELECT TO authenticated USING (public.is_admin());`;
export const P4_ROLLBACK = `DROP POLICY "profile_content read public" ON public.profile_content;
DROP POLICY "profile_content read owner" ON public.profile_content;
DROP POLICY "profile_content read admin" ON public.profile_content;
CREATE POLICY "profile_content read all" ON public.profile_content AS PERMISSIVE FOR SELECT TO public USING (true);`;

const bucketInsert = (id, pub, lim, mime) => `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES (${q(id)}, ${q(id)}, ${pub}, ${lim}, ${pgarr(mime)}) ON CONFLICT (id) DO NOTHING;`;
const PA_UID_POL = (cmd) => cmd;
export const P3A_FIX = `-- dedicated PUBLIC bucket for the public event flyers / profile images that today live in chat-images. Public READ is by URL only (no SELECT policy for anon, no listing policy).
-- Paths: profiles/<profile slug>/<file>  (writer = an owner of that profile)   |   event-flyers/<uid>/<file>  (writer = that user).  service_role bypasses RLS.
-- NO DELETE of any object or row anywhere in this pack. (The bucket row is created with ON CONFLICT DO NOTHING; the guard accepts an absent bucket or an exact pre-existing copy.)
${bucketInsert("public-assets", "true", PA_LIMIT, PA_MIME)}
CREATE POLICY public_assets_owner_insert ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (bucket_id = 'public-assets' AND (
  (${FNAME1} = 'profiles' AND EXISTS (SELECT 1 FROM public.profile_owners po WHERE po.owner_id = (SELECT auth.uid()) AND po.profile_slug = (storage.foldername(name))[2]))
  OR (${FNAME1} = 'event-flyers' AND (storage.foldername(name))[2] = ${UID})));
-- owner-scoped SELECT (own uploads only; needed so a signed-in owner can list/remove their files, e.g. the app's delete-my-account sweep), admins see all. NOT bucket-wide, anon gets none.
CREATE POLICY public_assets_owner_admin_read ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (bucket_id = 'public-assets' AND (owner_id = ${UID}
  OR (${FNAME1} = 'profiles' AND EXISTS (SELECT 1 FROM public.profile_owners po WHERE po.owner_id = (SELECT auth.uid()) AND po.profile_slug = (storage.foldername(name))[2])) OR public.is_admin()));
CREATE POLICY public_assets_owner_delete ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (bucket_id = 'public-assets' AND (owner_id = ${UID}
  OR (${FNAME1} = 'profiles' AND EXISTS (SELECT 1 FROM public.profile_owners po WHERE po.owner_id = (SELECT auth.uid()) AND po.profile_slug = (storage.foldername(name))[2]))));`;
export const P3A_ROLLBACK = `-- the bucket row is intentionally LEFT IN PLACE (no DELETE in any pack); an empty public bucket with no policies is inert. Only the three policies are dropped.
DROP POLICY public_assets_owner_insert ON storage.objects;
DROP POLICY public_assets_owner_admin_read ON storage.objects;
DROP POLICY public_assets_owner_delete ON storage.objects;`;

export const P2_FIX = `-- private bucket for UNPUBLISHED agent drafts (covers, cards). Admin-only SELECT (signed URLs for the review dashboard); service_role writes. Moving the actual object is a Storage API operation: see RUNBOOK-STORAGE-MOVES.md (NO DML on storage.objects here).
${bucketInsert("agent-drafts", "false", DR_LIMIT, DR_MIME)}
CREATE POLICY agent_drafts_admin_read ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (bucket_id = 'agent-drafts' AND public.is_admin());`;
export const P2_ROLLBACK = `-- bucket row intentionally LEFT IN PLACE (private, empty or not): deleting it would be a DELETE, and a bucket that already holds a moved draft must not be removed by a pack. Only the policy is dropped.
DROP POLICY agent_drafts_admin_read ON storage.objects;`;

const P3B_INS = `CREATE POLICY chat_images_scoped_upload ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-images' AND (
  ${FNAME1} = ${UID}
  OR ${CI_PROFILE_OWNER}
  OR (array_length(storage.foldername(name), 1) = 1 AND ${FNAME1} = 'event-flyers')));`;
export const P3B_FIX = `-- chat-images writes: uid-prefixed paths (the chat convention), OR the two LEGACY shapes the shipped clients still use (profiles/<owned slug>/..., event-flyers/<file>) so old web/app builds keep uploading until they are retired.
-- It replaces 'chat images auth upload' (WITH CHECK bucket_id = 'chat-images': any signed-in user, any path). Bucket limits apply to NEW uploads only (the 17 existing objects are not touched).
DROP POLICY "chat images auth upload" ON storage.objects;
${P3B_INS}
UPDATE storage.buckets SET file_size_limit = ${CI_LIMIT}, allowed_mime_types = ${pgarr(CI_MIME)} WHERE id = 'chat-images';`;
export const P3B_ROLLBACK = `DROP POLICY chat_images_scoped_upload ON storage.objects;
CREATE POLICY "chat images auth upload" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-images');
UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL WHERE id = 'chat-images';`;

export const P3C_FIX = `-- flip chat-images to PRIVATE. Public URLs of this bucket stop working immediately: the guard above refuses unless NO public table still references it and public-assets already holds the moved assets.
UPDATE storage.buckets SET public = false WHERE id = 'chat-images';`;
export const P3C_ROLLBACK = `UPDATE storage.buckets SET public = true WHERE id = 'chat-images';`;

const apFix = (mime) => `-- agent-posts is a PUBLIC bucket with NO size limit and NO MIME allow-list: any uploader holding a key could store script-capable SVG/HTML. Bucket limits apply to NEW uploads only (the 474 existing objects are not touched).
UPDATE storage.buckets SET file_size_limit = ${AP_LIMIT}, allowed_mime_types = ${pgarr(mime)} WHERE id = 'agent-posts';`;
export const P5_ROLLBACK = `UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL WHERE id = 'agent-posts';`;

export const P6_FIX = `-- vs-entries stays PUBLIC (vs-app.js still uses getPublicUrl). These policies only add the reviewer/approved read paths that createSignedUrl needs, so the bucket can be flipped private later.
CREATE OR REPLACE FUNCTION public.vs_entry_media_is_approved(p_name text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $f$
  SELECT CASE WHEN (string_to_array(p_name, '/'))[2] ~ '^[0-9]{1,18}$'
              THEN EXISTS (SELECT 1 FROM public.vs_entries e WHERE e.id = ((string_to_array(p_name, '/'))[2])::bigint AND e.status = 'approved')
              ELSE false END
$f$;
REVOKE ALL ON FUNCTION public.vs_entry_media_is_approved(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vs_entry_media_is_approved(text) TO anon, authenticated, service_role;
CREATE POLICY vs_media_reviewer_read ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (bucket_id = 'vs-entries' AND public.vs_is_admin());
CREATE POLICY vs_media_approved_read ON storage.objects AS PERMISSIVE FOR SELECT TO anon, authenticated USING (bucket_id = 'vs-entries' AND public.vs_entry_media_is_approved(name));`;
export const P6_ROLLBACK = `DROP POLICY vs_media_reviewer_read ON storage.objects;
DROP POLICY vs_media_approved_read ON storage.objects;
DROP FUNCTION public.vs_entry_media_is_approved(text);`;

const none = "(none)";
export function packs() {
  const P = [];
  /* ---------------- P0 */
  P.push({
    id: "P0", slug: "P0_grok_applied_record", title: "P0 RECORD of Grok's 2026-11-09 21:47 prod changes (11 _bak_ tables revoked from anon/authenticated; shirt_hd_anon_insert gone). Idempotent: a no-op when already applied.",
    idempotent: true, noRollback: true,
    reqs: [["req.rls_objects_enabled", objRls, "true/false"], ...BAK.map((t) => [`req.bak_exists:${t}`, `(to_regclass('public.${t}') IS NOT NULL)::text`, "true"])],
    pre: [], post: [
      ...BAK.map((t) => [`bak.no_anon_authenticated_public_privs:${t}`, bakAnyPriv(t), "false"]),
      ["bak.service_role_postgres_keep_select", `(SELECT bool_and(has_table_privilege('service_role', to_regclass('public.' || t), 'SELECT') AND has_table_privilege('postgres', to_regclass('public.' || t), 'SELECT'))::text FROM unnest(ARRAY[${BAK.map(q).join(",")}]) t)`, "true"],
      ["bak.acl_sorted_record", `(SELECT string_agg(t || '=' || ${aclx("c.relacl")}, ' ; ' ORDER BY t COLLATE "C") FROM unnest(ARRAY[${BAK.map(q).join(",")}]) t JOIN pg_class c ON c.oid = to_regclass('public.' || t))`, null],
      ["policy.shirt_hd_anon_insert_absent", `(SELECT count(*)::text FROM pg_policies p WHERE ${OBJ} AND p.policyname = 'shirt_hd_anon_insert')`, "0"],
      ["policy.no_anon_write_on_shirt_hd", `(SELECT count(*)::text FROM pg_policies p WHERE ${OBJ} AND p.cmd IN ('INSERT','UPDATE','DELETE','ALL') AND (p.roles && ARRAY['public','anon']::name[]) AND (coalesce(p.qual,'') || ' ' || coalesce(p.with_check,'')) ~ 'shirt-hd')`, "0"],
    ],
    inv: storageInv(["shirt_hd_anon_insert"], []),
    fix: `-- idempotent ensure-section: both statements are no-ops when Grok's 21:47 changes are already in place.
${BAK.map((t) => `REVOKE ALL ON TABLE public.${t} FROM PUBLIC, anon, authenticated;`).join("\n")}
DROP POLICY IF EXISTS shirt_hd_anon_insert ON storage.objects;`,
  });
  /* ---------------- P1 */
  const p1Pre = [
    ["sel.agent-posts", polSel("agent-posts"), "agent_posts_public_read"], ["sel.chat-images", polSel("chat-images"), "chat images public read"],
    ["sel.playlist-covers", polSel("playlist-covers"), "playlist covers are publicly readable"], ["sel.vs-entries", polSel("vs-entries"), "vs_media_read"],
    ["pol.agent_posts_public_read.shape", polShape("agent_posts_public_read"), "SELECT|public|PERMISSIVE"], ["pol.agent_posts_public_read.norm", polNorm("agent_posts_public_read"), "bucket_id='agent-posts'~"],
    ["pol.chat_images_public_read.norm", polNorm("chat images public read"), "bucket_id='chat-images'~"], ["pol.playlist_public_read.norm", polNorm("playlist covers are publicly readable"), "bucket_id='playlist-covers'~"],
    ["pol.vs_media_read.norm", polNorm("vs_media_read"), "bucket_id='vs-entries'~"],
    ["pol.chat_images_public_read.shape", polShape("chat images public read"), "SELECT|public|PERMISSIVE"], ["pol.playlist_public_read.shape", polShape("playlist covers are publicly readable"), "SELECT|public|PERMISSIVE"], ["pol.vs_media_read.shape", polShape("vs_media_read"), "SELECT|public|PERMISSIVE"],
    ["pol.chat_images_auth_upload.shape", polShape("chat images auth upload"), "INSERT|authenticated|PERMISSIVE"],
    ["ins.vs-entries", polIns("vs-entries"), "vs_media_insert"],
  ];
  const p1Post = [
    ["sel.agent-posts", polSel("agent-posts"), "agent_posts_admin_read"], ["sel.chat-images", polSel("chat-images"), "chat_images_owner_admin_read"],
    ["sel.playlist-covers", polSel("playlist-covers"), "playlist_covers_owner_admin_read"], ["sel.vs-entries", polSel("vs-entries"), ["vs_media_owner_admin_read", "vs_media_approved_read,vs_media_owner_admin_read,vs_media_reviewer_read"]],
    ...["agent_posts_admin_read", "chat_images_owner_admin_read", "playlist_covers_owner_admin_read", "vs_media_owner_admin_read"].map((n) => [`pol.${n}.shape`, polShape(n), "SELECT|authenticated|PERMISSIVE"]),
    ["pol.agent_posts_admin_read.tokens", polHas("agent_posts_admin_read", "agent-posts", "is_admin"), "true"],
    ["pol.chat_images_owner_admin_read.tokens", polHas("chat_images_owner_admin_read", "chat-images", "owner_id", "profile_owners", "is_admin"), "true"],
    ["pol.playlist_covers_owner_admin_read.tokens", polHas("playlist_covers_owner_admin_read", "playlist-covers", "foldername", "is_admin"), "true"],
    ["pol.vs_media_owner_admin_read.tokens", polHas("vs_media_owner_admin_read", "vs-entries", "foldername", "is_admin"), "true"],
    ["ins.vs-entries", polIns("vs-entries"), "vs_media_insert"],
  ];
  P.push({
    id: "P1", slug: "P1_listing_policies", title: "P1 item (1): drop the four bucket-wide listing SELECT policies, add owner/admin-scoped ones (public URLs keep working; none of the four buckets lose their public flag)",
    reqs: [["req.is_admin_exists", fnExists("public.is_admin()"), "true"], ["req.is_admin_exec_authenticated", fnExec("public.is_admin()", "authenticated"), "true"], ["req.profile_owners_cols", colsPresent("public.profile_owners", ["profile_slug", "owner_id"]), "2"],
      ["req.rls_objects_enabled", objRls, "true/false"], ["req.foldername_exists", fnExists("storage.foldername(text)"), "true"],
      ["req.no_bucketless_anon_select", `(SELECT count(*)::text FROM pg_policies p WHERE ${OBJ} AND p.cmd IN ('SELECT','ALL') AND (p.roles && ARRAY['public','anon']::name[]) AND (coalesce(p.qual,'') || ' ' || coalesce(p.with_check,'')) !~ 'bucket_id')`, "0"],
      ...["agent-posts", "chat-images", "playlist-covers", "vs-entries"].map((b) => [`req.bucket_public:${b}`, bkpub(b), "true"])],
    pre: p1Pre, post: p1Post,
    inv: [...storageInv(["agent_posts_public_read", "chat images public read", "playlist covers are publicly readable", "vs_media_read", "agent_posts_admin_read", "chat_images_owner_admin_read", "playlist_covers_owner_admin_read", "vs_media_owner_admin_read"], []),
      ["inv.buckets_public_flags", `(SELECT string_agg(b.id || '=' || b.public::text, ',' ORDER BY b.id) FROM storage.buckets b)`]],
    fix: P1_FIX, rollback: P1_ROLLBACK,
  });
  /* ---------------- P4 */
  P.push({
    id: "P4", slug: "P4_profile_content_read", title: "P4 item (4): profile_content 'read all' -> public (archived IS NOT TRUE) + owners (own rows incl. archived) + admins (all). Table ACL untouched (order-independent of 10A APPLY-1C).",
    reqs: [["req.rls_on_not_forced", `(SELECT c.relrowsecurity::text || '/' || c.relforcerowsecurity::text FROM pg_class c WHERE c.oid = 'public.profile_content'::regclass)`, "true/false"],
      ["req.acl_class_A0_or_A1", `(SELECT CASE WHEN ${aclx("c.relacl")} = ${q(PC_ACL_A0)} THEN 'A0_before_1C' WHEN ${aclx("c.relacl")} = ${q(PC_ACL_A1)} THEN 'A1_after_1C' ELSE 'OTHER:' || ${aclx("c.relacl")} END FROM pg_class c WHERE c.oid = 'public.profile_content'::regclass)`, ["A0_before_1C", "A1_after_1C"]],
      ["req.archived_column", `(SELECT format_type(a.atttypid, a.atttypmod) FROM pg_attribute a WHERE a.attrelid = 'public.profile_content'::regclass AND a.attname = 'archived' AND NOT a.attisdropped)`, "boolean"],
      ["req.columns", colsPresent("public.profile_content", ["id", "profile_slug", "kind", "data", "created_by", "created_at", "archived"]), "7"],
      ["req.profile_owners_cols", colsPresent("public.profile_owners", ["profile_slug", "owner_id"]), "2"],
      ["req.is_admin_exists", fnExists("public.is_admin()"), "true"], ["req.is_admin_exec_authenticated", fnExec("public.is_admin()", "authenticated"), "true"],
      ["req.write_policies_present", `(SELECT count(*)::text FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'profile_content' AND p.cmd IN ('INSERT','UPDATE','DELETE'))`, "3"],
      ["req.no_all_cmd_policy", `(SELECT count(*)::text FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'profile_content' AND p.cmd = 'ALL')`, "0"],
      ["rec.null_archived_rows", `(SELECT count(*)::text FROM public.profile_content WHERE archived IS NULL)`, null], ["rec.archived_true_rows", `(SELECT count(*)::text FROM public.profile_content WHERE archived)`, null],
      ["rec.acl_sorted", relacl("public.profile_content"), null]],
    pre: [["pc.read_policies", `(SELECT coalesce(string_agg(p.policyname::text, ',' ORDER BY p.policyname::text COLLATE "C"),'(none)') FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'profile_content' AND p.cmd = 'SELECT')`, "profile_content read all"],
      ["pc.read_all.shape", `(SELECT p.cmd || '|' || array_to_string(p.roles, ',') || '|' || p.permissive || '|' || coalesce(p.qual,'(null)') FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'profile_content' AND p.policyname = 'profile_content read all')`, "SELECT|public|PERMISSIVE|true"]],
    post: [["pc.read_policies", `(SELECT coalesce(string_agg(p.policyname::text, ',' ORDER BY p.policyname::text COLLATE "C"),'(none)') FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'profile_content' AND p.cmd = 'SELECT')`, "profile_content read admin,profile_content read owner,profile_content read public"],
      ["pc.read_public.shape", `(SELECT p.cmd || '|' || array_to_string(p.roles, ',') || '|' || p.permissive || '|' || (p.qual ~ 'archived IS NOT TRUE')::text FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'profile_content' AND p.policyname = 'profile_content read public')`, "SELECT|public|PERMISSIVE|true"],
      ["pc.read_owner.shape", `(SELECT p.cmd || '|' || array_to_string(p.roles, ',') || '|' || p.permissive || '|' || (p.qual ~ 'profile_owners' AND p.qual ~ 'auth.uid')::text FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'profile_content' AND p.policyname = 'profile_content read owner')`, "SELECT|authenticated|PERMISSIVE|true"],
      ["pc.read_admin.shape", `(SELECT p.cmd || '|' || array_to_string(p.roles, ',') || '|' || p.permissive || '|' || (p.qual ~ 'is_admin')::text FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'profile_content' AND p.policyname = 'profile_content read admin')`, "SELECT|authenticated|PERMISSIVE|true"]],
    inv: [["inv.pc_acl_sorted", relacl("public.profile_content")], ["inv.pc_rls", `(SELECT c.relrowsecurity::text || '/' || c.relforcerowsecurity::text FROM pg_class c WHERE c.oid = 'public.profile_content'::regclass)`],
      ["inv.pc_write_policies_md5", `(SELECT count(*)::text || ':' || coalesce(md5(string_agg(p.policyname || '|' || p.cmd || '|' || array_to_string(p.roles,',') || '|' || coalesce(p.qual,'') || '|' || coalesce(p.with_check,''), E'\\n' ORDER BY p.policyname COLLATE "C")),'-') FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'profile_content' AND p.cmd <> 'SELECT')`],
      ["inv.pc_rows_md5", `(SELECT count(*)::text || ':' || coalesce(md5(string_agg(c.id::text || coalesce(c.archived::text,'n'), '|' ORDER BY c.id)),'-') FROM public.profile_content c)`],
      ["inv.pc_columns_md5", `(SELECT md5(string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' ORDER BY a.attnum)) FROM pg_attribute a WHERE a.attrelid = 'public.profile_content'::regclass AND a.attnum > 0 AND NOT a.attisdropped)`]],
    fix: P4_FIX, rollback: P4_ROLLBACK,
    rbReqs: [["req.rls_on_not_forced", `(SELECT c.relrowsecurity::text || '/' || c.relforcerowsecurity::text FROM pg_class c WHERE c.oid = 'public.profile_content'::regclass)`, "true/false"]],
  });
  /* ---------------- P5 (default: SVG kept) and P5B (SVG blocked) */
  for (const [id, slug, mime, title] of [["P5", "P5_agent_posts_limits", AP_MIME_KEEP_SVG, "P5 item (5): agent-posts size limit 10 MiB + MIME allow-list for NEW uploads (raster images AND image/svg+xml kept, because the 211 existing SVG cards show the generators upload SVG; HTML and everything else blocked)"],
    ["P5B", "P5B_agent_posts_limits_no_svg", AP_MIME_NO_SVG, "P5B VARIANT (do NOT apply until the gen-post-image / gen-product-post source is confirmed to upload no SVG): same limits, image/svg+xml NOT allowed"]]) {
    P.push({
      id, slug, title, variant: id === "P5B",
      reqs: [["req.agent_posts_public", bkpub("agent-posts"), "true"], ["req.existing_objects_have_allowed_mime", mimeOutside("agent-posts", mime), "0"], ["rec.object_count", objsMeta("agent-posts"), null],
        ["rec.max_object_bytes", `(SELECT coalesce(max((o.metadata->>'size')::bigint),0)::text FROM storage.objects o WHERE o.bucket_id = 'agent-posts')`, null]],
      pre: [["bucket.agent-posts.limit", bklim("agent-posts"), "(null)"], ["bucket.agent-posts.mime", bkmime("agent-posts"), "(null)"]],
      post: [["bucket.agent-posts.limit", bklim("agent-posts"), String(AP_LIMIT)], ["bucket.agent-posts.mime", bkmime("agent-posts"), joinS(mime)], ["bucket.agent-posts.public", bkpub("agent-posts"), "true"]],
      inv: storageInv([], ["agent-posts"]), fix: apFix(mime), rollback: P5_ROLLBACK,
    });
  }
  /* ---------------- P2 */
  const drOk = (what, expr, exact) => [what, expr, [ABS, exact]];
  P.push({
    id: "P2", slug: "P2_private_drafts_bucket", title: "P2 item (2) SQL part: private bucket 'agent-drafts' + admin-only SELECT for the unpublished cover (the object itself is moved by the Storage API: RUNBOOK-STORAGE-MOVES.md)",
    reqs: [["req.is_admin_exists", fnExists("public.is_admin()"), "true"], ["req.agent_posts_public", bkpub("agent-posts"), "true"]],
    pre: [drOk("bucket.agent-drafts.public", bkpub("agent-drafts"), "false"), drOk("bucket.agent-drafts.limit", bklim("agent-drafts"), String(DR_LIMIT)), drOk("bucket.agent-drafts.mime", bkmime("agent-drafts"), joinS(DR_MIME)),
      ["sel.agent-drafts", polSel("agent-drafts"), none]],
    post: [["bucket.agent-drafts.public", bkpub("agent-drafts"), "false"], ["bucket.agent-drafts.limit", bklim("agent-drafts"), String(DR_LIMIT)], ["bucket.agent-drafts.mime", bkmime("agent-drafts"), joinS(DR_MIME)],
      ["sel.agent-drafts", polSel("agent-drafts"), "agent_drafts_admin_read"], ["pol.agent_drafts_admin_read.shape", polShape("agent_drafts_admin_read"), "SELECT|authenticated|PERMISSIVE"], ["pol.agent_drafts_admin_read.tokens", polHas("agent_drafts_admin_read", "agent-drafts", "is_admin"), "true"]],
    inv: storageInv(["agent_drafts_admin_read"], ["agent-drafts"]), fix: P2_FIX, rollback: P2_ROLLBACK, bucketLeft: "agent-drafts",
  });
  /* ---------------- P3a */
  P.push({
    id: "P3a", slug: "P3a_public_assets_bucket", title: "P3 step (i): dedicated PUBLIC bucket 'public-assets' (images only, 5 MiB, no listing policy) for the public event/profile assets that must leave chat-images before it goes private",
    reqs: [["req.profile_owners_cols", colsPresent("public.profile_owners", ["profile_slug", "owner_id"]), "2"], ["req.is_admin_exists", fnExists("public.is_admin()"), "true"]],
    pre: [drOk("bucket.public-assets.public", bkpub("public-assets"), "true"), drOk("bucket.public-assets.limit", bklim("public-assets"), String(PA_LIMIT)), drOk("bucket.public-assets.mime", bkmime("public-assets"), joinS(PA_MIME)),
      ["sel.public-assets", polSel("public-assets"), none], ["ins.public-assets", polIns("public-assets"), none]],
    post: [["bucket.public-assets.public", bkpub("public-assets"), "true"], ["bucket.public-assets.limit", bklim("public-assets"), String(PA_LIMIT)], ["bucket.public-assets.mime", bkmime("public-assets"), joinS(PA_MIME)],
      ["sel.public-assets", polSel("public-assets"), "public_assets_owner_admin_read"], ["ins.public-assets", polIns("public-assets"), "public_assets_owner_insert"],
      ["pol.public_assets_owner_insert.shape", polShape("public_assets_owner_insert"), "INSERT|authenticated|PERMISSIVE"], ["pol.public_assets_owner_admin_read.shape", polShape("public_assets_owner_admin_read"), "SELECT|authenticated|PERMISSIVE"],
      ["pol.public_assets_owner_delete.shape", polShape("public_assets_owner_delete"), "DELETE|authenticated|PERMISSIVE"],
      ["pol.no_public_or_anon_policy", `(SELECT count(*)::text FROM pg_policies p WHERE ${OBJ} AND (coalesce(p.qual,'') || ' ' || coalesce(p.with_check,'')) ~ 'public-assets' AND (p.roles && ARRAY['public','anon']::name[]))`, "0"]],
    inv: storageInv(["public_assets_owner_insert", "public_assets_owner_admin_read", "public_assets_owner_delete"], ["public-assets"]), fix: P3A_FIX, rollback: P3A_ROLLBACK, bucketLeft: "public-assets",
  });
  /* ---------------- P3b */
  P.push({
    id: "P3b", slug: "P3b_chat_images_scoped_insert", title: "P3 step (iii): chat-images INSERT scoped (uid-prefixed OR the two legacy client shapes) + bucket size/MIME limits for new uploads. Requires P1.",
    reqs: [["req.P1_applied_chat_images", polSel("chat-images"), "chat_images_owner_admin_read"], ["req.chat_images_public", bkpub("chat-images"), "true"]],
    pre: [["ins.chat-images", polIns("chat-images"), "chat images auth upload"], ["pol.chat_images_auth_upload.norm", polNorm("chat images auth upload"), "~bucket_id='chat-images'"], ["bucket.chat-images.limit", bklim("chat-images"), "(null)"], ["bucket.chat-images.mime", bkmime("chat-images"), "(null)"]],
    post: [["ins.chat-images", polIns("chat-images"), "chat_images_scoped_upload"], ["pol.chat_images_scoped_upload.shape", polShape("chat_images_scoped_upload"), "INSERT|authenticated|PERMISSIVE"], ["pol.chat_images_scoped_upload.tokens", polHas("chat_images_scoped_upload", "chat-images", "profile_owners", "event-flyers", "foldername"), "true"],
      ["bucket.chat-images.limit", bklim("chat-images"), String(CI_LIMIT)], ["bucket.chat-images.mime", bkmime("chat-images"), joinS(CI_MIME)]],
    inv: storageInv(["chat images auth upload", "chat_images_scoped_upload"], ["chat-images"]), fix: P3B_FIX, rollback: P3B_ROLLBACK,
  });
  /* ---------------- P3c */
  P.push({
    id: "P3c", slug: "P3c_chat_images_private", title: "P3 step (ii): flip chat-images to PRIVATE. Refuses unless P1 + P3a are applied, public-assets holds the moved assets, and NO public table still references 'chat-images'.",
    reqs: [["req.P1_applied_chat_images", polSel("chat-images"), "chat_images_owner_admin_read"], ["req.public_assets_bucket_public", bkpub("public-assets"), "true"],
      ["req.public_assets_object_count_ge_min", `((SELECT count(*) FROM storage.objects o WHERE o.bucket_id = 'public-assets') >= ${PUBLIC_ASSETS_MIN})::text`, "true"],
      ["req.no_public_table_references_chat_images", refsScan("chat-images"), "none"]],
    pre: [["bucket.chat-images.public", bkpub("chat-images"), "true"]],
    post: [["bucket.chat-images.public", bkpub("chat-images"), "false"]],
    inv: storageInv([], ["chat-images"]), fix: P3C_FIX, rollback: P3C_ROLLBACK, stmtTimeout: "120s",
  });
  /* ---------------- P6 */
  P.push({
    id: "P6", slug: "P6_vs_entries_reviewer_approved", title: "P6 item (6): vs-entries reviewer (vs_is_admin) + approved-entry SELECT so createSignedUrl works for owner/reviewer/approved media; the bucket STAYS PUBLIC. Requires P1.",
    reqs: [["req.vs_is_admin_exists", fnExists("public.vs_is_admin()"), "true"], ["req.vs_is_admin_exec_authenticated", fnExec("public.vs_is_admin()", "authenticated"), "true"],
      ["req.vs_entries_cols", colsPresent("public.vs_entries", ["id", "status"]), "2"], ["req.vs_entries_id_bigint", `(SELECT format_type(a.atttypid, a.atttypmod) FROM pg_attribute a WHERE a.attrelid = 'public.vs_entries'::regclass AND a.attname = 'id')`, "bigint"],
      ["req.vs_entries_public", bkpub("vs-entries"), "true"]],
    pre: [["fn.vs_entry_media_is_approved", fnExists("public.vs_entry_media_is_approved(text)"), "false"], ["sel.vs-entries", polSel("vs-entries"), "vs_media_owner_admin_read"]],
    post: [["fn.vs_entry_media_is_approved", fnExists("public.vs_entry_media_is_approved(text)"), "true"],
      ["fn.secdef_owner_config", `(SELECT p.prosecdef::text || '/' || pg_get_userbyid(p.proowner) || '/' || coalesce((SELECT string_agg(c,',') FROM unnest(p.proconfig) c),'(none)') FROM pg_proc p WHERE p.oid = to_regprocedure('public.vs_entry_media_is_approved(text)'))`, "true/postgres/search_path=\"\""],
      ["fn.exec_anon_authenticated_public", `(SELECT has_function_privilege('anon', p.oid, 'EXECUTE')::text || '/' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text || '/' || coalesce((SELECT bool_or(x.grantee = 0) FROM aclexplode(p.proacl) x), false)::text FROM pg_proc p WHERE p.oid = to_regprocedure('public.vs_entry_media_is_approved(text)'))`, "true/true/false"],
      ["sel.vs-entries", polSel("vs-entries"), "vs_media_approved_read,vs_media_owner_admin_read,vs_media_reviewer_read"],
      ["pol.vs_media_reviewer_read.shape", polShape("vs_media_reviewer_read"), "SELECT|authenticated|PERMISSIVE"], ["pol.vs_media_approved_read.shape", polShape("vs_media_approved_read"), "SELECT|anon,authenticated|PERMISSIVE"],
      ["bucket.vs-entries.public", bkpub("vs-entries"), "true"]],
    inv: storageInv(["vs_media_reviewer_read", "vs_media_approved_read"], []), fix: P6_FIX, rollback: P6_ROLLBACK,
  });
  return P;
}

/* ---------- SQL fragments */
const BANNER = (title, extra = "") => `-- ${title}
-- 17A STORAGE PRIVACY: PROPOSAL ONLY. NOT APPLIED ANYWHERE. GENERATED by db/proposed/17a-storage-privacy/build.mjs (node build.mjs --check fails if this file drifts from its inputs).
-- Apply gate: NO prod SQL and NO Storage API operation without Joe's relayed yes + Sentinel's pass + Atlas's review of the migrations + a backup. Sentinel's inventory/backup files were NOT available to this draft (see README). Order: README.md.
-- Run as postgres, ONE transaction, ON_ERROR_STOP (psql -v ON_ERROR_STOP=1) or a single-call SQL executor; right after BEGIN come SET LOCAL lock_timeout = '5s', the repo-wide pack advisory lock, and SET LOCAL lock_timeout = '5s' again.
${extra}`;
const LOCK = (stmt = "60s") => `-- repo-wide pack key (same as R1 #136 / 12A / 13A): serialises every pack run; transaction-scoped; a second run waits for a running pack to commit or roll back, for at most 5 s:
-- lock_timeout is set BEFORE the lock (so the lock wait itself is bounded) and again right after it (every later lock wait). Expiry = SQLSTATE 55P03, nothing changed.
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(${REPO_PACK_KEY});
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '${stmt}';`;
const accept = (e) => (e === null ? null : Array.isArray(e) ? e : [e]);
function guardDo(tag, label, list) {
  const rows = list.filter(([, , e]) => e !== null).map(([n, x, e]) => {
    const ac = accept(e), cond = ac.length === 1 ? `v IS DISTINCT FROM ${q(ac[0])}` : `v <> ALL (ARRAY[${ac.map(q).join(",")}])`;
    return `  v := coalesce(${x}, ${q(ABS)});\n  IF ${cond} THEN f := f || (${q(n + ": expected " + ac.join(" OR ") + " but live is ")} || v); END IF;`;
  }).join("\n");
  return `DO $${tag}$
DECLARE
  f text[] := ARRAY[]::text[];
  v text;
BEGIN
  IF current_user <> 'postgres' THEN f := f || ('run as postgres; current_user=' || current_user); END IF;
${rows}
  IF array_length(f, 1) IS NOT NULL THEN
    RAISE EXCEPTION '17A ${label}: DRIFT, ABORT, nothing applied. % mismatch(es): %', array_length(f, 1), array_to_string(f, ' ; ');
  END IF;
END
$${tag}$;`;
}
function rowsCte(list) {
  const a = list.map(([n, x]) => `SELECT ${q(n)} AS name, coalesce(${x}, ${q(ABS)}) AS actual`).join("\n  UNION ALL ");
  const e = list.map(([n, , ex]) => `(${q(n)}, ${ex === null ? "NULL" : q(accept(ex).join(" OR "))}, ${ex === null ? "NULL" : `ARRAY[${accept(ex).map(q).join(",")}]::text[]`})`).join(",\n  ");
  return `WITH a(name, actual) AS (
  ${a}
), e(name, expected, accepted) AS (VALUES
  ${e}
), r AS (SELECT e.name, coalesce(e.expected, 'RECORD ONLY') AS expected, a.actual, (e.accepted IS NULL OR a.actual = ANY (e.accepted)) AS ok FROM e LEFT JOIN a USING (name))`;
}
const evidenceSql = (list, state) => `${rowsCte(list)}
SELECT '000_ALL_OK' AS name, ${q(state)} AS expected, ${q(state)} AS actual, bool_and(ok) AS ok FROM r
UNION ALL SELECT name, expected, actual, ok FROM r
ORDER BY 1;`;
const assertAllOk = (tag, label, list) => `DO $${tag}$
DECLARE bad text;
BEGIN
  SELECT string_agg(name || ' (expected ' || expected || ', got ' || actual || ')', ' ; ') INTO bad FROM (
${rowsCte(list)}
SELECT name, expected, actual, ok FROM r
  ) z WHERE NOT ok;
  IF bad IS NOT NULL THEN RAISE EXCEPTION '17A ${label}: POST-CHECK FAILED (transaction rolls back): %', bad; END IF;
END
$${tag}$;`;
const invSnap = (inv) => `CREATE TEMP TABLE _kil17a_inv ON COMMIT DROP AS
${inv.map(([n, x]) => `SELECT ${q(n)}::text AS name, coalesce(${x}, '(null)')::text AS val`).join("\nUNION ALL ")};`;
const invCheck = (label, inv) => `DO $invcheck$
DECLARE bad text;
BEGIN
  SELECT string_agg(a.name, ', ') INTO bad FROM _kil17a_inv a JOIN (
    ${inv.map(([n, x]) => `SELECT ${q(n)}::text AS name, coalesce(${x}, '(null)')::text AS val`).join("\n    UNION ALL ")}
  ) b USING (name) WHERE a.val IS DISTINCT FROM b.val;
  IF bad IS NOT NULL THEN RAISE EXCEPTION '17A ${label}: INVARIANT CHANGED (the pack must change nothing else; transaction rolls back): %', bad; END IF;
END
$invcheck$;`;

export function buildAll() {
  const out = new Map(), PK = packs();
  for (const p of PK) {
    const guardPre = [...p.reqs, ...p.pre], guardPost = [...p.reqs, ...p.post], stmt = p.stmtTimeout || "60s";
    const idem = p.idempotent ? "-- IDEMPOTENT: when the captured Grok 21:47 state is already in place every statement is a no-op; the post-checks assert the applied state either way.\n" : "-- Run it a second time and it refuses at the guard (state is no longer the captured one) with nothing changed.\n";
    out.set(`17a_${p.slug}_APPLY_PROPOSED.sql`, `${BANNER(`17A ${p.title} [APPLY]`, `${idem}-- No object, no row and no data is deleted by this pack.`)}
BEGIN;
${LOCK(stmt)}

-- 1. DRIFT GUARD: live state must be EXACTLY the captured prod state (policies by name/shape/predicate, bucket settings, ACL classes, prerequisite functions). Anything else aborts with nothing applied.
${guardDo("guard", `APPLY-${p.id}`, guardPre)}

-- 2. INVARIANT SNAPSHOT: everything this pack must NOT change (ACL fingerprints sorted, RLS flags, every other policy, every untouched bucket row, the object name set).
${invSnap(p.inv)}

-- 3. THE FIX
${p.fix}

-- 4. POST-CHECKS (assert; a failure rolls the whole transaction back)
${assertAllOk("post", `APPLY-${p.id}`, guardPost)}
${invCheck(`APPLY-${p.id}`, p.inv)}

-- 5. RETAINED OUTPUT: keep this result set with the change record (ok must be true on every row).
${evidenceSql(guardPost, "POST")}
COMMIT;
`);
    if (!p.noRollback) out.set(`17a_${p.slug}_ROLLBACK_PROPOSED.sql`, `${BANNER(`17A ${p.title} [ROLLBACK]`, `-- Restores the captured original policies/settings exactly (including the exposure they carried).${p.bucketLeft ? `\n-- The bucket row '${p.bucketLeft}' is left in place on purpose: no pack deletes any row or object.` : ""}`)}
BEGIN;
${LOCK(stmt)}

${guardDo("guard", `ROLLBACK-${p.id}`, [...(p.rbReqs || []), ...p.post])}

${invSnap(p.inv)}

${p.rollback}

${assertAllOk("post", `ROLLBACK-${p.id}`, [...(p.rbReqs || []), ...p.pre])}
${invCheck(`ROLLBACK-${p.id}`, p.inv)}

${evidenceSql([...(p.rbReqs || []), ...p.pre], "PRE")}
COMMIT;
`);
    for (const [st, lst] of [["PRE", guardPre], ["POST", guardPost]]) if (!(p.idempotent && st === "PRE")) out.set(`17a_POSTCHECKS_${p.slug}_${st}_PROPOSED.sql`, `${BANNER(`17A POSTCHECKS ${p.id} state ${st}: one read-only statement; ok must be true on every row`, "-- Read-only (a single SELECT over the catalog; the scan in P3c reads counts only).")}
${evidenceSql(lst, st)}
`);
  }
  /* DRIFT_QUERY: every pack classified PRE | POST | DRIFT (pre/post facts only; reqs are listed as informational rows) */
  const rows = [];
  const DRIFT_REQS = new Set(["req.rls_on_not_forced", "req.acl_class_A0_or_A1", "req.columns", "req.rls_objects_enabled", "req.no_bucketless_anon_select", "req.agent_posts_public"]);
  for (const p of PK) { const m = new Map(); for (const [n, x, e] of p.reqs) if (DRIFT_REQS.has(n) || (n.startsWith("req.bucket_public:") && n !== "req.bucket_public:chat-images") || n.startsWith("req.bak_exists:")) m.set(n, { x, pre: accept(e), post: accept(e), isreq: true }); for (const [n, x, e] of p.pre) m.set(n, { x, pre: accept(e), post: null }); for (const [n, x, e] of p.post) { const o = m.get(n) || { x, pre: null }; o.x = x; o.post = accept(e); m.set(n, o); }
    for (const [n, o] of m) rows.push({ grp: p.id, name: `${p.id}:${n}`, x: o.x, pre: o.pre, post: o.post, isreq: !!o.isreq }); }
  const A = rows.map((d) => `SELECT ${q(d.name)} AS name, coalesce(${d.x}, ${q(ABS)}) AS actual`).join("\n  UNION ALL ");
  const arr = (a) => (a === null ? "NULL::text[]" : `ARRAY[${a.map(q).join(",")}]::text[]`);
  const E = rows.map((d) => `(${q(d.name)}, ${q(d.grp)}, ${arr(d.pre)}, ${arr(d.post)}, ${d.isreq})`).join(",\n  ");
  const ids = PK.filter((p) => !p.idempotent || true).map((p) => p.id);
  out.set("17a_DRIFT_QUERY_PROPOSED.sql", `${BANNER("17A DRIFT_QUERY: read-only; classifies each pack's owned facts as PRE (captured, not applied) | POST (applied) | DRIFT, and lists every fact", "-- Safe to run any time, as any role that can read the catalog. P0 is reported as POST when Grok's change is in place. P5 and P5B share facts: P5B is reported POST only when the SVG-less allow-list is live.")}
WITH a(name, actual) AS (
  ${A}
), e(name, grp, pre, post, isreq) AS (VALUES
  ${E}
), r AS (SELECT e.name, e.grp, e.pre, e.post, e.isreq, a.actual FROM e LEFT JOIN a USING (name))
${ids.map((id) => `SELECT '000_STATE_${id}' AS name, CASE WHEN bool_and(pre IS NULL OR actual = ANY (pre)) AND bool_or(pre IS NOT NULL AND NOT isreq) THEN 'PRE' WHEN bool_and(post IS NULL OR actual = ANY (post)) AND bool_or(post IS NOT NULL AND NOT isreq) THEN 'POST' ELSE 'DRIFT' END AS actual, NULL::text AS pre, NULL::text AS post FROM r WHERE grp = '${id}'`).join("\nUNION ALL\n")}
UNION ALL SELECT name, actual, array_to_string(pre, ' OR '), array_to_string(post, ' OR ') FROM r
ORDER BY 1;
`);
  out.set("../PRECHECK-17A.sql", precheck());
  out.set("../PRECHECK-17A-INVENTORY_READONLY.sql", inventory());
  return out;
}

/* ---------- PRECHECK-17A.sql: ONE read-only statement, catalog + aggregate counts only, NEVER row contents or object names */
function precheck() {
  const pol = (t) => `SELECT '${t}.policy:' || p.policyname, 'cmd=' || p.cmd || ' roles=' || array_to_string(p.roles, ',') || ' ' || p.permissive || ' USING ' || coalesce(p.qual, '(null)') || ' WITH CHECK ' || coalesce(p.with_check, '(null)') FROM pg_policies p WHERE p.schemaname = '${t.split(".")[0]}' AND p.tablename = '${t.split(".")[1]}'`;
  return `${BANNER("17A PRECHECK: ONE read-only statement (catalog + aggregate counts; NEVER row contents, NEVER object names) to run against prod BEFORE any 17A pack", "-- Compare against baseline/PROD-FACTS-17A.md. Every guard in the packs asserts the captured state; if any row here differs, STOP and re-review.\n-- The object-NAME inventory that classifies the 11 unreferenced chat-images objects is a SEPARATE file: PRECHECK-17A-INVENTORY_READONLY.sql.")}
WITH items(k, v) AS (
  SELECT 'meta.server_version', current_setting('server_version') || ' as ' || current_user
  UNION ALL SELECT 'roles.flags', (SELECT string_agg(rolname || ':bypassrls=' || rolbypassrls || ',super=' || rolsuper, ' | ' ORDER BY rolname) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','postgres','authenticator','supabase_storage_admin'))
  UNION ALL SELECT 'storage.objects.owner_rls_acl', (SELECT pg_get_userbyid(c.relowner) || ' rls=' || c.relrowsecurity || ' force=' || c.relforcerowsecurity || ' acl=' || ${aclx("c.relacl")} FROM pg_class c WHERE c.oid = 'storage.objects'::regclass)
  UNION ALL SELECT 'storage.buckets.owner_rls_acl', (SELECT pg_get_userbyid(c.relowner) || ' rls=' || c.relrowsecurity || ' force=' || c.relforcerowsecurity || ' acl=' || ${aclx("c.relacl")} FROM pg_class c WHERE c.oid = 'storage.buckets'::regclass)
  UNION ALL SELECT 'storage.objects.columns:' || a.attnum || ':' || a.attname, format_type(a.atttypid, a.atttypmod) FROM pg_attribute a WHERE a.attrelid = 'storage.objects'::regclass AND a.attnum > 0 AND NOT a.attisdropped
  UNION ALL SELECT 'storage.buckets.columns:' || a.attnum || ':' || a.attname, format_type(a.atttypid, a.atttypmod) FROM pg_attribute a WHERE a.attrelid = 'storage.buckets'::regclass AND a.attnum > 0 AND NOT a.attisdropped
  UNION ALL SELECT 'storage.objects.triggers:' || t.tgname, pg_get_triggerdef(t.oid) FROM pg_trigger t WHERE t.tgrelid = 'storage.objects'::regclass AND NOT t.tgisinternal
  UNION ALL SELECT 'storage.buckets.triggers:' || t.tgname, pg_get_triggerdef(t.oid) FROM pg_trigger t WHERE t.tgrelid = 'storage.buckets'::regclass AND NOT t.tgisinternal
  UNION ALL SELECT 'storage.objects.unique_indexes:' || i.indexname, i.indexdef FROM pg_indexes i WHERE i.schemaname = 'storage' AND i.tablename = 'objects'
  UNION ALL SELECT 'storage.foldername.def', coalesce(pg_get_functiondef(to_regprocedure('storage.foldername(text)')), '(missing)')
  UNION ALL SELECT 'bucket:' || b.id, 'public=' || b.public || ' limit=' || coalesce(b.file_size_limit::text,'null') || ' mime=' || coalesce(b.allowed_mime_types::text,'null') || ' objects=' || (SELECT count(*) FROM storage.objects o WHERE o.bucket_id = b.id) FROM storage.buckets b
  UNION ALL SELECT 'bucket.exists:' || n, (EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id = n))::text FROM unnest(ARRAY['agent-drafts','public-assets']) n
  UNION ALL ${pol("storage.objects")}
  UNION ALL SELECT 'storage.objects.bucketless_select_policies', (SELECT count(*)::text FROM pg_policies p WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.cmd IN ('SELECT','ALL') AND (coalesce(p.qual,'') || ' ' || coalesce(p.with_check,'')) !~ 'bucket_id')
  UNION ALL SELECT 'agent-posts.agg_by_prefix_ext:' || split_part(o.name, '/', 1) || ':' || coalesce(nullif(lower(substring(o.name from '\\.([^./]+)$')), ''), '(none)'), count(*)::text || ' objects, max bytes ' || coalesce(max((o.metadata->>'size')::bigint), 0)::text || ', mimetypes ' || string_agg(DISTINCT coalesce(o.metadata->>'mimetype','(none)'), ',') FROM storage.objects o WHERE o.bucket_id = 'agent-posts' GROUP BY 1
  UNION ALL SELECT 'agent-posts.objects_with_mime_outside_P5_list', (SELECT count(*)::text FROM storage.objects o WHERE o.bucket_id = 'agent-posts' AND coalesce(o.metadata->>'mimetype','(none)') <> ALL (${pgarr(AP_MIME_KEEP_SVG)}))
  UNION ALL SELECT 'chat-images.agg_by_depth_prefix:' || array_length(string_to_array(o.name,'/'),1) || ':' || split_part(o.name,'/',1), count(*)::text || ' objects, owner_id null: ' || count(*) FILTER (WHERE o.owner_id IS NULL) FROM storage.objects o WHERE o.bucket_id = 'chat-images' GROUP BY 1
  UNION ALL SELECT 'objects.agg_by_bucket_owner_null:' || o.bucket_id, count(*)::text || ' objects, owner_id null ' || count(*) FILTER (WHERE o.owner_id IS NULL) FROM storage.objects o WHERE o.bucket_id IN ('agent-posts','chat-images','playlist-covers','vs-entries') GROUP BY o.bucket_id
  UNION ALL SELECT 'playlist-covers.vs-entries.paths_uid_prefixed', (SELECT string_agg(b || ': ' || x || ' of ' || n || ' uid-prefixed', ' ; ') FROM (SELECT o.bucket_id b, count(*) n, count(*) FILTER (WHERE (string_to_array(o.name,'/'))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') x FROM storage.objects o WHERE o.bucket_id IN ('playlist-covers','vs-entries') GROUP BY o.bucket_id) z)
  UNION ALL SELECT 'public.is_admin.def', coalesce(pg_get_functiondef(to_regprocedure('public.is_admin()')), '(missing)')
  UNION ALL SELECT 'public.is_admin.acl', coalesce((SELECT 'owner=' || pg_get_userbyid(p.proowner) || ' secdef=' || p.prosecdef || ' exec anon=' || has_function_privilege('anon', p.oid, 'EXECUTE') || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE') || ' acl=' || ${aclx("p.proacl")} FROM pg_proc p WHERE p.oid = to_regprocedure('public.is_admin()')), '(missing)')
  UNION ALL SELECT 'public.vs_is_admin.def', coalesce(pg_get_functiondef(to_regprocedure('public.vs_is_admin()')), '(missing)')
  UNION ALL SELECT 'public.vs_is_admin.acl', coalesce((SELECT 'owner=' || pg_get_userbyid(p.proowner) || ' secdef=' || p.prosecdef || ' exec anon=' || has_function_privilege('anon', p.oid, 'EXECUTE') || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE') FROM pg_proc p WHERE p.oid = to_regprocedure('public.vs_is_admin()')), '(missing)')
  UNION ALL SELECT 'public.vs_review_entry.exists', (to_regprocedure('public.vs_review_entry(bigint,text)') IS NOT NULL)::text
  UNION ALL SELECT 'vs_entries.columns:' || a.attnum || ':' || a.attname, format_type(a.atttypid, a.atttypmod) FROM pg_attribute a WHERE a.attrelid = to_regclass('public.vs_entries') AND a.attnum > 0 AND NOT a.attisdropped
  UNION ALL SELECT 'vs_entries.agg_by_status:' || coalesce(e.status,'(null)'), count(*)::text FROM public.vs_entries e GROUP BY e.status
  UNION ALL SELECT 'vs_entries.policies:' || p.policyname, 'cmd=' || p.cmd || ' roles=' || array_to_string(p.roles, ',') || ' USING ' || coalesce(p.qual,'(null)') FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'vs_entries'
  UNION ALL SELECT 'vs_tables_with_url_columns', (SELECT string_agg(c.table_name || '.' || c.column_name, ', ' ORDER BY 1) FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name LIKE 'vs\\_%' AND (c.column_name ~ 'url|media|cover|thumb|path'))
  UNION ALL SELECT 'profile_content.relkind_rls_force_owner', (SELECT c.relkind::text || '/' || c.relrowsecurity || '/' || c.relforcerowsecurity || '/' || pg_get_userbyid(c.relowner) FROM pg_class c WHERE c.oid = 'public.profile_content'::regclass)
  UNION ALL SELECT 'profile_content.columns:' || a.attnum || ':' || a.attname, format_type(a.atttypid, a.atttypmod) || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END || coalesce(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), '') FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum WHERE a.attrelid = 'public.profile_content'::regclass AND a.attnum > 0 AND NOT a.attisdropped
  UNION ALL SELECT 'profile_content.acl_raw_and_sorted', (SELECT coalesce(c.relacl::text,'(default)') || '  SORTED ' || ${aclx("c.relacl")} FROM pg_class c WHERE c.oid = 'public.profile_content'::regclass)
  UNION ALL SELECT 'profile_content.column_acl_rows', (SELECT count(*)::text FROM pg_attribute a WHERE a.attrelid = 'public.profile_content'::regclass AND a.attacl IS NOT NULL)
  UNION ALL ${pol("public.profile_content")}
  UNION ALL SELECT 'profile_content.constraints:' || c.conname, pg_get_constraintdef(c.oid) FROM pg_constraint c WHERE c.conrelid = 'public.profile_content'::regclass
  UNION ALL SELECT 'profile_content.agg', count(*)::text || ' rows; archived true ' || count(*) FILTER (WHERE archived) || '; archived NULL ' || count(*) FILTER (WHERE archived IS NULL) || '; autopilot-flagged ' || count(*) FILTER (WHERE data->>'autopilot' = 'true') FROM public.profile_content
  UNION ALL SELECT 'profile_content.agg_by_kind_archived:' || coalesce(kind,'(null)') || ':' || coalesce(archived::text,'null'), count(*)::text FROM public.profile_content GROUP BY kind, archived
  UNION ALL ${pol("public.profile_owners")}
  UNION ALL SELECT 'profile_owners.rls_acl', (SELECT c.relrowsecurity || ' acl=' || ${aclx("c.relacl")} FROM pg_class c WHERE c.oid = 'public.profile_owners'::regclass)
  UNION ALL SELECT 'readers.functions_mentioning_profile_content:' || p.oid::regprocedure::text, 'secdef=' || p.prosecdef || ' exec anon=' || has_function_privilege('anon', p.oid, 'EXECUTE') || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE') || ' md5=' || md5(p.prosrc) FROM pg_proc p WHERE p.pronamespace NOT IN (SELECT oid FROM pg_namespace WHERE nspname IN ('pg_catalog','information_schema')) AND p.prosrc ~* 'profile_content'
  UNION ALL SELECT 'readers.views_mentioning_profile_content:' || n.nspname || '.' || c.relname, c.relkind::text || ' reloptions=' || coalesce(c.reloptions::text,'(none)') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('v','m') AND n.nspname NOT IN ('pg_catalog','information_schema') AND pg_get_viewdef(c.oid) ~* 'profile_content'
  UNION ALL SELECT 'readers.policies_on_other_tables_mentioning_profile_content:' || p.schemaname || '.' || p.tablename || '.' || p.policyname, 'cmd=' || p.cmd || ' ' || coalesce(p.qual,'') FROM pg_policies p WHERE (coalesce(p.qual,'') || coalesce(p.with_check,'')) ~* 'profile_content' AND NOT (p.schemaname = 'public' AND p.tablename = 'profile_content')
  UNION ALL SELECT 'readers.fk_to_profile_content:' || c.conrelid::regclass::text, pg_get_constraintdef(c.oid) FROM pg_constraint c WHERE c.confrelid = 'public.profile_content'::regclass
  UNION ALL SELECT 'bak.acl:' || c.relname, 'rls=' || c.relrowsecurity || ' acl=' || ${aclx("c.relacl")} || ' column_acl_rows=' || (SELECT count(*) FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attacl IS NOT NULL) FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname LIKE '\\_bak\\_%' AND c.relkind = 'r'
  UNION ALL SELECT 'bak.expected_11_present', (SELECT count(*)::text FROM unnest(ARRAY[${BAK.map(q).join(",")}]) t WHERE to_regclass('public.' || t) IS NOT NULL)
  UNION ALL SELECT 'bak.any_other_bak_tables', (SELECT coalesce(string_agg(c.relname, ','), 'none') FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname LIKE '\\_bak\\_%' AND c.relkind IN ('r','v','m','p') AND c.relname <> ALL (ARRAY[${BAK.map(q).join(",")}]))
  UNION ALL SELECT 'policy.shirt_hd_anon_insert_count', (SELECT count(*)::text FROM pg_policies p WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.policyname = 'shirt_hd_anon_insert')
  UNION ALL SELECT 'default_acls_public_and_storage', coalesce((SELECT string_agg(pg_get_userbyid(d.defaclrole) || ':' || d.defaclobjtype::text || ':' || d.defaclacl::text, ' | ') FROM pg_default_acl d WHERE d.defaclnamespace IN (0, 'public'::regnamespace::oid, 'storage'::regnamespace::oid)), '(none)')
)
SELECT k AS name, v AS value FROM items ORDER BY k;
`;
}

/* ---------- INVENTORY (read-only, run by KODE): object NAMES appear here and only here; rows' contents are never returned (counts per table.column only) */
function inventory() {
  return `${BANNER("17A INVENTORY (READ-ONLY, for KODE to run): classify the 17 chat-images objects (11 expected unreferenced) and locate the public event/profile assets that reference chat-images", "-- DO NOT DELETE anything based on this output. It returns object NAMES (that is its purpose; run it only inside the KODE/Joe-approved window) plus COUNTS of referencing rows per table.column. It never returns the contents of any row.\n-- Read-only: two SELECT statements. The dynamic part uses query_to_xml() to count rows per column (text/varchar/json/jsonb columns of public base tables, excluding _bak_ tables). References are matched as 'chat-images/<object name>' substrings (URL or relative path).\n-- Fill CLASSIFICATION.md from query 1; query 2 is the discovery list for the data-update plan (RUNBOOK-STORAGE-MOVES.md step 3).")}
-- QUERY 1: per-object classification
WITH ${SCAN_CTE("chat-images")},
refcols AS (SELECT t, col FROM hits WHERE n > 0),
objs AS (SELECT o.name, o.id, o.owner_id, o.created_at, (o.metadata->>'size')::bigint AS bytes, o.metadata->>'mimetype' AS mimetype, split_part(o.name,'/',1) AS prefix, array_length(string_to_array(o.name,'/'),1) AS depth FROM storage.objects o WHERE o.bucket_id = 'chat-images'),
per AS (
  SELECT ob.name, rc.t, rc.col, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I where strpos(%I::text, %L) > 0', rc.t, rc.col, 'chat-images/' || ob.name), false, true, '')))[1]::text::int AS n
  FROM objs ob CROSS JOIN refcols rc
), refs AS (SELECT name, string_agg(t || '.' || col || ' x' || n, '; ' ORDER BY t, col) AS refd_by, sum(n) AS ref_rows, bool_or(t IN ('profile_content','profile_meta','profile_owners')) AS by_profile, bool_or(t IN ('events','event_media','venues','venue_media','event_orders','ticket_tiers')) AS by_event, bool_or(t ~ 'message|chat') AS by_message FROM per WHERE n > 0 GROUP BY name)
SELECT ob.name, ob.prefix, ob.depth, ob.bytes, ob.mimetype, ob.created_at, (ob.owner_id IS NOT NULL) AS has_owner,
  coalesce(r.ref_rows, 0) AS referencing_rows, coalesce(r.refd_by, '(none)') AS referenced_by,
  CASE WHEN coalesce(r.by_message, false) THEN 'referenced-by-message'
       WHEN coalesce(r.by_profile, false) OR coalesce(r.by_event, false) THEN 'referenced-by-profile-or-event'
       WHEN coalesce(r.ref_rows, 0) > 0 THEN 'referenced-other-table'
       WHEN ob.name ~* '(test|tmp|temp|sample|dummy|untitled)' THEN 'orphan-test-upload (name heuristic: confirm by eye)'
       ELSE 'unknown-unreferenced' END AS category
FROM objs ob LEFT JOIN refs r USING (name)
ORDER BY category, ob.name;

-- QUERY 2: which public table.columns mention chat-images at all (counts only), and how many DISTINCT chat-images objects each references
WITH ${SCAN_CTE("chat-images")},
refcols AS (SELECT t, col, n FROM hits WHERE n > 0)
SELECT rc.t AS table_name, rc.col AS column_name, rc.n AS rows_mentioning_chat_images,
  (SELECT count(*) FROM storage.objects o WHERE o.bucket_id = 'chat-images' AND (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I where strpos(%I::text, %L) > 0', rc.t, rc.col, 'chat-images/' || o.name), false, true, '')))[1]::text::int > 0) AS distinct_objects_referenced
FROM refcols rc ORDER BY rc.t, rc.col;
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes("--check"); let bad = 0;
  const files = buildAll();
  for (const [name, content] of files) {
    if (/[^\x00-\x7f]/.test(content)) throw new Error(name + ": non-ASCII");
    if (/^\s*(DELETE\s+FROM|TRUNCATE)\b|storage\.delete|\bDROP\s+(TABLE|BUCKET|SCHEMA)\b/im.test(content.replace(/^--.*$/gm, ""))) throw new Error(name + ": contains a delete-class statement (forbidden in 17A packs)");
    const p = join(HERE, "packs", name);
    if (check) { if (!existsSync(p) || readFileSync(p, "utf8") !== content) { console.log("DRIFT " + name); bad++; } }
    else { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); }
  }
  console.log(`${check ? "checked" : "wrote"} ${files.size} files${bad ? "; " + bad + " drifted" : ""}`);
  process.exit(bad ? 1 : 0);
}
