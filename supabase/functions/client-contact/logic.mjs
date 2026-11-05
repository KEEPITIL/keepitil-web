// client-contact: the contact-form endpoint for build-service client sites (draft, not deployed).
// Modeled on connect-submit (#61). POST multipart/form-data from build-service/starter:
//   site, name, email, message, source, website (honeypot), elapsed_ms.
// Per-client config lives in public.client_sites (site id -> to_email, allowed_origins, active).
// Spam rules: honeypot + min 3 s on page get a fake success and store nothing; per-IP limits per site
// (IP kept only as an HMAC). The row is stored first; the Resend email (Reply-To = visitor) follows,
// and if it fails the row keeps email_error. Free of Deno APIs so node --test can run it.

export const MIN_MS = 3000, PER_HOUR = 3, PER_DAY = 10;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function cors(origin, site) {
  const allowed = site && origin && site.allowed_origins.includes(origin) ? origin : "null";
  return { "Access-Control-Allow-Origin": allowed, "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type", "Vary": "Origin", "Cache-Control": "no-store" };
}

export function validate(f) {
  const s = (k, n) => (typeof f[k] === "string" ? f[k].trim().slice(0, n + 1) : "");
  const name = s("name", 120), email = s("email", 254).toLowerCase(), message = s("message", 2000);
  const source = s("source", 60).replace(/[^a-z0-9_-]/gi, "").slice(0, 60);
  if (name.length < 1 || name.length > 120) return { ok: false, error: "Add your name." };
  if (email.length > 254 || !EMAIL.test(email)) return { ok: false, error: "Enter an email address we can reply to." };
  if (message.length < 10 || message.length > 2000) return { ok: false, error: "Write a message (10 to 2,000 characters)." };
  return { ok: true, v: { name, email, message, source: source || null } };
}

export function reference(rand = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const A = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const c = Array.from(rand(8), (x) => A[x % A.length]).join("");
  return `CC-${c.slice(0, 4)}-${c.slice(4)}`;
}

const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function emailFor(site, row) {
  const lines = [["Reference", row.reference], ["Name", row.name], ["Email", row.email], ["Source", row.source], ["Message", row.message]].filter(([, v]) => v);
  return {
    to: [site.to_email], reply_to: row.email,
    subject: `New enquiry from ${row.name} via ${site.name} (${row.reference})`.replace(/[\r\n]/g, " ").slice(0, 200),
    text: lines.map(([k, v]) => `${k}: ${v}`).join("\n"),
    html: "<table>" + lines.map(([k, v]) => `<tr><th align="left" valign="top">${esc(k)}</th><td style="white-space:pre-wrap">${esc(v)}</td></tr>`).join("") + "</table>",
  };
}

export async function hmac(key, msg) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig), (x) => x.toString(16).padStart(2, "0")).join("");
}

/** store: { site(id), recent(site_id, ip_hash, sinceIso) -> count, insert(row) -> id, update(id, patch) }
 *  env: { SALT, RESEND_API_KEY, MAIL_FROM } ; deps: { store, fetch, now } */
export async function handle(req, env, deps) {
  const origin = req.headers.get("origin");
  const siteHint = new URL(req.url).searchParams.get("site");
  const { store } = deps, now = deps.now ?? (() => Date.now());
  if (req.method === "OPTIONS") {
    const site = siteHint ? await store.site(siteHint) : null;
    return new Response("ok", { headers: cors(origin, site?.active ? site : null) });
  }
  const bare = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (req.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "Method not allowed." }), { status: 405, headers: bare });
  if (Number(req.headers.get("content-length") ?? "0") > 32 * 1024) return new Response(JSON.stringify({ ok: false, error: "Message too long." }), { status: 413, headers: bare });
  let fd;
  try { fd = await req.formData(); } catch { return new Response(JSON.stringify({ ok: false, error: "Could not read the form." }), { status: 400, headers: bare }); }
  const f = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string"));

  const siteId = String(f.site || siteHint || "").toLowerCase();
  const site = /^[a-z0-9][a-z0-9-]{1,40}$/.test(siteId) ? await store.site(siteId) : null;
  // Unknown or inactive site, or a browser posting from an origin the site doesn't allow: refuse.
  // (No Origin header = native form post with JS off, or a server; those are allowed through.)
  if (!site || !site.active) return new Response(JSON.stringify({ ok: false, error: "This form is not set up." }), { status: 404, headers: bare });
  const h = { ...cors(origin, site), "Content-Type": "application/json" };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: h });
  if (origin && !site.allowed_origins.includes(origin)) return json({ ok: false, error: "This form is not set up for this website." }, 403);

  const elapsed = Number(f.elapsed_ms ?? 0);
  if ((f.website ?? "").length > 0 || !(elapsed >= MIN_MS)) return json({ ok: true, reference: reference(), stored: false });
  const v = validate(f);
  if (!v.ok) return json(v, 400);

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ip_hash = await hmac(env.SALT, `client-contact|${site.site_id}|${ip}`);
  const since = (m) => new Date(now() - m * 60000).toISOString();
  const [hour, day] = await Promise.all([store.recent(site.site_id, ip_hash, since(60)), store.recent(site.site_id, ip_hash, since(1440))]);
  if (hour >= PER_HOUR || day >= PER_DAY) return json({ ok: false, error: `You have sent several messages recently. Please email ${site.to_email} instead.` }, 429);

  const row = { site_id: site.site_id, reference: reference(), ...v.v, ip_hash };
  let id;
  try { id = await store.insert(row); } catch { id = null; }
  if (!id) return json({ ok: false, error: `We could not save your message. Please email ${site.to_email}.` }, 503);

  let email_error = null;
  if (!env.RESEND_API_KEY) email_error = "no_resend_key";
  else {
    try {
      const r = await deps.fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: env.MAIL_FROM || `${site.name.replace(/[<>"\r\n]/g, "")} <noreply@keepitil.com>`, ...emailFor(site, row) }),
      });
      if (!r.ok) email_error = `resend_${r.status}`;
    } catch { email_error = "network"; }
  }
  await store.update(id, email_error ? { email_error } : { email_sent_at: new Date(now()).toISOString() });
  return json({ ok: true, reference: row.reference, stored: true });
}
