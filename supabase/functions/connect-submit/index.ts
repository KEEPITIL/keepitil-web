// Deno entry for connect-submit (draft, not deployed). Logic and tests: ./logic.mjs.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (set by Supabase), RESEND_API_KEY,
// MAIL_FROM (optional, a sender on a Resend-verified domain). Deploy with --no-verify-jwt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { handle } from "./logic.mjs";

const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(Deno.env.get("SUPABASE_URL")!, SVC, { auth: { persistSession: false } });
const env = { SALT: SVC, RESEND_API_KEY: Deno.env.get("RESEND_API_KEY") ?? "", MAIL_FROM: Deno.env.get("MAIL_FROM") ?? "" };

Deno.serve((req) => handle(req, env, { db, fetch }));
