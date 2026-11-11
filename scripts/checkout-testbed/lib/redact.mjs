/* redact.mjs - NO TOKEN IN ANY LOG (Atlas 2 / Sentinel S4). Import FIRST in a scenario. Patches console.* and process.stdout/stderr so a QR token (known value, "qr_token(s)" JSON field, KIL- payload, bare 32-hex)
   is replaced before it can reach a terminal, a log file or the evidence JSON. leaks() counts how many writes needed redaction: a source that logs tokens makes it > 0, so a clean source can PROVE it logs none. */
const known = new Set(); let leakCount = 0, contactCount = 0;
export const registerToken = (t) => { if (typeof t === "string" && t.length >= 16) known.add(t); };
/* Round 2 (Atlas 2): contact values (buyer / organiser emails, names, phones) are PII-shaped too, and reach logs through candidate ERROR paths
   (String(e), pg "Key (col)=(value)" details, error.message). registerSecret registers any synthetic value the scenario creates; the patterns below catch the rest. */
const secrets = new Set();
export const registerSecret = (t) => { if (typeof t === "string" && t.length >= 4) secrets.add(t); };
export const leaks = () => leakCount;                 // token-shaped redactions (QR tokens, KIL- payloads, hex32)
export const contactLeaks = () => contactCount;       // contact-shaped redactions (emails, phones, PG Key details, registered secrets)
export function redact(input) {
  let s = String(input), out = s;
  for (const t of known) out = out.split(t).join("[token-redacted]");
  out = out.replace(/("?qr_tokens?"?\s*[:=]\s*)(\[[^\]]*\]|"[^"]*")/g, '$1"[token-redacted]"');
  out = out.replace(/\bKIL-[0-9A-Za-z]{8,}/g, "KIL-[token-redacted]");
  out = out.replace(/(?<!md5[ :="']{0,3})(?<![0-9a-zA-Z])[0-9a-f]{32}(?![0-9a-zA-Z])/g, "[hex32-redacted]");
  const tokenOut = out;
  for (const t of secrets) out = out.split(t).join("[contact-redacted]");
  out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, "[email-redacted]");
  out = out.replace(/("?(?:buyer_)?(?:email|phone|name|handle|buyer_handle|customer_email)"?\s*[:=]\s*)("[^"]*"|'[^']*')/gi, '$1"[contact-redacted]"');
  out = out.replace(/\bKey \(([^)]*)\)=\(([^)]*)\)/g, "Key ($1)=([detail-redacted])");                       // PostgreSQL unique / FK violation DETAIL carries the row's values
  out = out.replace(/(?<![0-9A-Za-z])(?:\+?\d{1,2}[ .-])?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?![0-9A-Za-z])/g, "[phone-redacted]");
  if (tokenOut !== s) leakCount++;
  if (out !== tokenOut) contactCount++;
  return out;
}
let installed = false;
export function installRedactor() {
  if (installed) return; installed = true;
  for (const k of ["log", "info", "warn", "error", "debug"]) { const o = console[k].bind(console); console[k] = (...a) => o(...a.map((x) => (typeof x === "string" ? redact(x) : x && typeof x === "object" ? redact(JSON.stringify(x)) : x))); }
  for (const st of [process.stdout, process.stderr]) { const w = st.write.bind(st); st.write = (chunk, ...r) => w(typeof chunk === "string" ? redact(chunk) : chunk, ...r); }
}
installRedactor();
