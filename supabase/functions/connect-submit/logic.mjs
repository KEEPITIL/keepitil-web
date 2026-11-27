// connect-submit: the one write path for keepitil.com/connect/get-listed/ (draft, not deployed).
//
// POST multipart/form-data. Validates, stores the row in public.connect_submissions (service
// role), puts an optional file in the private connect-uploads bucket, then emails a copy to
// info@keepitil.com through Resend. If the email fails the submission is still stored and
// answered; email_sent_at stays null and email_error says why.
//
// Spam protection (same rules as support-request): honeypot field "website", a minimum time on
// the page, per-IP limits (IP stored only as a salted HMAC), allow-listed kinds, length limits,
// and a file type/size allow-list. Bots get a fake success and nothing is stored.
// Kept free of Deno APIs so node --test can run it; index.ts wires in the real clients.

export const KINDS = { artist: "Artist", brand: "Brand", community: "Community", venue: "Venue" };
export const FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const MAX_FILE = 5 * 1024 * 1024;
export const INBOX = "info@keepitil.com";
const ORIGINS = new Set(["https://keepitil.com", "https://www.keepitil.com"]);
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin && ORIGINS.has(origin) ? origin : "https://keepitil.com",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}

/** Pure: the validated submission, or the first problem in plain words. */
export function validate(f) {
  const s = (k, n) => (typeof f[k] === "string" ? f[k].trim().slice(0, n + 1) : "");
  const kind = s("kind", 20), name = s("name", 120), contact_name = s("contact_name", 120);
  const email = s("email", 254).toLowerCase(), city = s("city", 120), about = s("about", 2000);
  const source = s("source", 60).replace(/[^a-z0-9_-]/gi, "").slice(0, 60);
  const links = (typeof f.links === "string" ? f.links : "").split(/\s+/).filter(Boolean);
  if (!(kind in KINDS)) return { ok: false, error: "Choose what you want listed." };
  if (name.length < 2 || name.length > 120) return { ok: false, error: "Add the name to list (2 to 120 characters)." };
  if (contact_name.length > 120 || city.length > 120) return { ok: false, error: "Keep name and city under 120 characters." };
  if (email.length > 254 || !EMAIL.test(email)) return { ok: false, error: "Enter an email address we can reply to." };
  if (links.length > 5 || links.some((l) => !/^https:\/\/[^\s]{3,300}$/.test(l))) return { ok: false, error: "Links must start with https:// (up to 5)." };
  if (about.length < 10 || about.length > 2000) return { ok: false, error: "Tell us about it (10 to 2,000 characters)." };
  return { ok: true, v: { kind, name, contact_name: contact_name || null, email, city: city || null, links, about, source: source || null } };
}

export function checkFile(file) {
  if (!file || !file.size) return { ok: true, file: null };
  if (!FILE_TYPES.includes(file.type)) return { ok: false, error: "Upload a JPEG, PNG, WebP or PDF." };
  if (file.size > MAX_FILE) return { ok: false, error: "Keep the upload under 5 MB." };
  return { ok: true, file };
}

/** KL-XXXX-XXXX from an alphabet with no look-alikes. */
export function reference(rand = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const A = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const c = Array.from(rand(8), (x) => A[x % A.length]).join("");
  return `KL-${c.slice(0, 4)}-${c.slice(4)}`;
}

const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** The copy that goes to the inbox. Reply-To is the submitter so a reply goes straight back. */
export function emailFor(row) {
  const lines = [
    ["Reference", row.reference], ["Listing", KINDS[row.kind]], ["Name", row.name], ["Contact", row.contact_name],
    ["Email", row.email], ["City", row.city], ["Links", (row.links || []).join("\n")], ["Upload", row.upload_path],
    ["Source", row.source], ["About", row.about],
  ].filter(([, v]) => v);
  return {
    to: [INBOX], reply_to: row.email,
    subject: `Get Listed: ${KINDS[row.kind]} · ${row.name} (${row.reference})`.slice(0, 200),
    text: lines.map(([k, v]) => `${k}: ${v}`).join("\n"),
    html: "<table>" + lines.map(([k, v]) => `<tr><th align="left" valign="top">${esc(k)}</th><td style="white-space:pre-wrap">${esc(v)}</td></tr>`).join("") + "</table>",
  };
}

async function hmac(key, msg) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig), (x) => x.toString(16).padStart(2, "0")).join("");
}

/** deps: { db (supabase-js client, service role), fetch, now } ; env: { SALT, RESEND_API_KEY, MAIL_FROM } */
export async function handle(req, env, deps) {
  const h = cors(req.headers.get("origin"));
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...h, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);
  if (Number(req.headers.get("content-length") ?? "0") > MAX_FILE + 64 * 1024) return json({ ok: false, error: "Keep the upload under 5 MB." }, 413);
  let fd;
  try { fd = await req.formData(); } catch { return json({ ok: false, error: "Something went wrong reading the form. Please try again." }, 400); }
  const f = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string"));

  const elapsed = Number(f.elapsed_ms ?? 0);
  if ((f.website ?? "").length > 0 || !(elapsed >= 3000)) return json({ ok: true, reference: reference(), stored: false });
  const v = validate(f);
  if (!v.ok) return json(v, 400);
  const fc = checkFile(fd.get("upload"));
  if (!fc.ok) return json(fc, 400);

  const { db } = deps, now = deps.now ?? (() => Date.now());
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ip_hash = await hmac(env.SALT, `connect|${ip}`);
  const since = (m) => new Date(now() - m * 60000).toISOString();
  const [{ count: hour }, { count: day }] = await Promise.all([
    db.from("connect_submissions").select("id", { count: "exact", head: true }).eq("ip_hash", ip_hash).gte("created_at", since(60)),
    db.from("connect_submissions").select("id", { count: "exact", head: true }).eq("ip_hash", ip_hash).gte("created_at", since(1440)),
  ]);
  if ((hour ?? 0) >= 3 || (day ?? 0) >= 10) return json({ ok: false, error: `You have sent several requests recently. Please email ${INBOX} instead.` }, 429);

  const ref = reference();
  let upload_path = null;
  if (fc.file) {
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[fc.file.type];
    upload_path = `submissions/${ref}/upload.${ext}`;
    const up = await db.storage.from("connect-uploads").upload(upload_path, fc.file, { contentType: fc.file.type, upsert: false });
    if (up.error) return json({ ok: false, error: `We could not save your upload. Try without it, or email ${INBOX}.` }, 503);
  }
  const row = { reference: ref, ...v.v, upload_path, ip_hash };
  const ins = await db.from("connect_submissions").insert(row).select("id").single();
  if (ins.error || !ins.data) return json({ ok: false, error: `We could not save your request. Please email ${INBOX}.` }, 503);

  let email_error = null;
  if (!env.RESEND_API_KEY) email_error = "no_resend_key";
  else {
    try {
      const r = await deps.fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: env.MAIL_FROM || "KEEPITIL Connect <connect@keepitil.com>", ...emailFor(row) }),
      });
      if (!r.ok) email_error = `resend_${r.status}`;
    } catch { email_error = "network"; }
  }
  await db.from("connect_submissions").update(email_error ? { email_error } : { email_sent_at: new Date(now()).toISOString() }).eq("id", ins.data.id);
  return json({ ok: true, reference: ref, stored: true });
}
