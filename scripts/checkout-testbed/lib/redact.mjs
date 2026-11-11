/* redact.mjs - NO TOKEN IN ANY LOG (Atlas 2 / Sentinel S4). Import FIRST in a scenario. Patches console.* and process.stdout/stderr so a QR token (known value, "qr_token(s)" JSON field, KIL- payload, bare 32-hex)
   is replaced before it can reach a terminal, a log file or the evidence JSON. leaks() counts how many writes needed redaction: a source that logs tokens makes it > 0, so a clean source can PROVE it logs none. */
const known = new Set(); let leakCount = 0;
export const registerToken = (t) => { if (typeof t === "string" && t.length >= 16) known.add(t); };
export const leaks = () => leakCount;
export function redact(input) {
  let s = String(input), out = s;
  for (const t of known) out = out.split(t).join("[token-redacted]");
  out = out.replace(/("?qr_tokens?"?\s*[:=]\s*)(\[[^\]]*\]|"[^"]*")/g, '$1"[token-redacted]"');
  out = out.replace(/\bKIL-[0-9A-Za-z]{8,}/g, "KIL-[token-redacted]");
  out = out.replace(/(?<!md5[ :="']{0,3})(?<![0-9a-zA-Z])[0-9a-f]{32}(?![0-9a-zA-Z])/g, "[hex32-redacted]");
  if (out !== s) leakCount++;
  return out;
}
let installed = false;
export function installRedactor() {
  if (installed) return; installed = true;
  for (const k of ["log", "info", "warn", "error", "debug"]) { const o = console[k].bind(console); console[k] = (...a) => o(...a.map((x) => (typeof x === "string" ? redact(x) : x && typeof x === "object" ? redact(JSON.stringify(x)) : x))); }
  for (const st of [process.stdout, process.stderr]) { const w = st.write.bind(st); st.write = (chunk, ...r) => w(typeof chunk === "string" ? redact(chunk) : chunk, ...r); }
}
installRedactor();
