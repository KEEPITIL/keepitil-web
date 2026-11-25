// DRAFT — NOT DEPLOYED. profile-inquiry: a visitor's note to a profile owner.
// Stores the message (public.profile_inquiries, service role only) and emails the owner via Resend.
// The owner's address is resolved here (profile_meta.book_email, else the owner's auth email) and is
// never returned to the browser. Needs secrets RESEND_API_KEY and INQUIRY_FROM (verified sender).
// Spam: honeypot, minimum 3s on the form, per-IP limits (IP stored only as a salted hash).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("INQUIRY_FROM") ?? "";
const ORIGINS = new Set(["https://keepitil.com", "https://www.keepitil.com"]);
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const SLUG = /^[a-z0-9][a-z0-9._-]{0,63}$/;

const cors = (o: string | null) => ({
  "Access-Control-Allow-Origin": o && ORIGINS.has(o) ? o : "https://keepitil.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type",
  "Vary": "Origin", "Cache-Control": "no-store",
});
const s = (b: Record<string, unknown>, k: string) => (typeof b[k] === "string" ? (b[k] as string).trim() : "");
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function hmac(key: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg))), (x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const h = cors(req.headers.get("origin"));
  const json = (b: unknown, st = 200) => new Response(JSON.stringify(b), { status: st, headers: { ...h, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);
  if (Number(req.headers.get("content-length") ?? "0") > 10000) return json({ ok: false, error: "That message is too long." }, 413);
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b) return json({ ok: false, error: "Please try again." }, 400);
  // Bots look like success and store nothing.
  if ((typeof b.website === "string" && b.website.length > 0) || !(Number(b.elapsed_ms ?? 0) >= 3000)) return json({ ok: true });
  const slug = s(b, "slug"), name = s(b, "name"), email = s(b, "email").toLowerCase(), message = s(b, "message");
  if (!SLUG.test(slug)) return json({ ok: false, error: "That page could not be found." }, 400);
  if (name.length < 2 || name.length > 80) return json({ ok: false, error: "Add your name." }, 400);
  if (email.length > 254 || !EMAIL.test(email)) return json({ ok: false, error: "Enter an email address they can reply to." }, 400);
  if (message.length < 10 || message.length > 2000) return json({ ok: false, error: "Write a short message (10 to 2,000 characters)." }, 400);

  const db = createClient(SB_URL, SVC, { auth: { persistSession: false } });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ipHash = await hmac(SVC, `inquiry|${ip}`);
  const since = (m: number) => new Date(Date.now() - m * 60000).toISOString();
  const [{ count: hr }, { count: day }] = await Promise.all([
    db.from("profile_inquiries").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since(60)),
    db.from("profile_inquiries").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since(1440)),
  ]);
  if ((hr ?? 0) >= 3 || (day ?? 0) >= 10) return json({ ok: false, error: "You have sent several messages recently. Please try again later." }, 429);

  // Owner address: server side only.
  const { data: meta } = await db.from("profile_meta").select("display_name, book_email").eq("slug", slug).maybeSingle();
  let to = (meta?.book_email ?? "").trim();
  if (!EMAIL.test(to)) {
    const { data: own } = await db.from("profile_owners").select("owner_id").eq("profile_slug", slug).maybeSingle();
    if (own?.owner_id) to = (await db.auth.admin.getUserById(own.owner_id)).data.user?.email ?? "";
  }
  if (!EMAIL.test(to)) return json({ ok: false, error: "This page can't take messages yet." }, 422);

  const { data: row, error } = await db.from("profile_inquiries")
    .insert({ profile_slug: slug, sender_name: name, sender_email: email, message, ip_hash: ipHash }).select("id").single();
  if (error || !row) return json({ ok: false, error: "We could not send your message. Please try again." }, 503);

  let err = "";
  if (RESEND && FROM) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM, to: [to], reply_to: email, subject: `New message on your KEEPITIL page from ${name}`.slice(0, 120),
        html: `<p><b>${esc(name)}</b> (${esc(email)}) wrote on your KEEPITIL page:</p><p style="white-space:pre-wrap">${esc(message)}</p><p>Reply to this email to answer them.</p>`,
      }),
    }).catch(() => null);
    if (!r || !r.ok) err = `resend_${r?.status ?? "network"}`;
  } else err = "email_not_configured";
  await db.from("profile_inquiries").update(err ? { email_error: err } : { emailed_at: new Date().toISOString() }).eq("id", row.id);
  return err ? json({ ok: false, error: "We could not send your message. Please try again later." }, 502) : json({ ok: true });
});
