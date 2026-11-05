// Deno entry for client-contact (draft, not deployed). Logic and tests: ./logic.mjs.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (set by Supabase), RESEND_API_KEY,
// MAIL_FROM (optional, a sender on a Resend-verified domain). Deploy with --no-verify-jwt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { handle } from "./logic.mjs";

const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(Deno.env.get("SUPABASE_URL")!, SVC, { auth: { persistSession: false } });
const env = { SALT: SVC, RESEND_API_KEY: Deno.env.get("RESEND_API_KEY") ?? "", MAIL_FROM: Deno.env.get("MAIL_FROM") ?? "" };

const store = {
  async site(id: string) {
    const { data } = await db.from("client_sites").select("site_id,name,to_email,allowed_origins,active").eq("site_id", id).maybeSingle();
    return data;
  },
  async recent(site_id: string, ip_hash: string, since: string) {
    const { count } = await db.from("client_contact_messages").select("id", { count: "exact", head: true })
      .eq("site_id", site_id).eq("ip_hash", ip_hash).gte("created_at", since);
    return count ?? 0;
  },
  async insert(row: Record<string, unknown>) {
    const { data, error } = await db.from("client_contact_messages").insert(row).select("id").single();
    return error ? null : data.id;
  },
  async update(id: string, patch: Record<string, unknown>) {
    await db.from("client_contact_messages").update(patch).eq("id", id);
  },
};

Deno.serve((req) => handle(req, env, { store, fetch }));
