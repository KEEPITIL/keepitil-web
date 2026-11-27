// csp-report: pure logic for the CSP violation collector (no Deno or Supabase APIs here, so node:test can import it).
// Browsers POST a Content-Security-Policy(-Report-Only) violation to report-uri (application/csp-report: { "csp-report": {...} }) or to a
// Reporting-Endpoints group (application/reports+json: [ { type: "csp-violation", url, body: {...} } ]). We keep ONE compact JSON log line per
// violation and nothing else: no table, no migration, no cookies. Privacy: query strings and fragments are removed from every URL, userinfo
// is removed, script samples are dropped, the policy text is not logged, and the client address is only ever a salted per-isolate hash.
export const MAX_BODY_BYTES = 8 * 1024;
export const MAX_REPORTS_PER_REQUEST = 10;
export const RATE_PER_MINUTE = 30;        // per hashed address, per isolate
export const MAX_FIELD = 200;
const KEYWORDS = new Set(['inline', 'eval', 'wasm-eval', 'data', 'blob', 'about', 'self', 'filesystem', 'trusted-types-policy', 'trusted-types-sink', 'url']);
const DIRECTIVE_RE = /^[a-z][a-z-]{1,40}$/;

export function kindOf(contentType) {
  const t = String(contentType || '').split(';')[0].trim().toLowerCase();
  return t === 'application/csp-report' ? 'csp-report' : t === 'application/reports+json' ? 'reports' : null;
}

// scheme://host[:port]/path only: no userinfo, no query, no fragment. A bare keyword (inline, eval, data...) passes through; anything else is dropped.
export function cleanUrl(v) {
  if (typeof v !== 'string') return '';
  const s = v.trim().slice(0, 2000);
  if (!s) return '';
  const low = s.toLowerCase();
  if (KEYWORDS.has(low)) return low;
  const scheme = low.match(/^([a-z][a-z0-9+.-]{0,15}):/);
  if (!scheme) return '';
  if (!/^(https?|wss?|ftp)$/.test(scheme[1])) return scheme[1];          // data:, blob:, about:, javascript:, chrome-extension: ... -> the scheme only (never the payload)
  try {
    const u = new URL(s);
    return (u.protocol + '//' + u.host + u.pathname).replace(/[^\x20-\x7e]/g, '').slice(0, MAX_FIELD);
  } catch { return ''; }
}
const directive = (v) => (typeof v === 'string' && DIRECTIVE_RE.test(v.trim().toLowerCase()) ? v.trim().toLowerCase() : '');
const int = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n < 1e7 ? Math.floor(n) : 0; };

// accepts both field spellings: report-uri ("document-uri") and Reporting API ("documentURL")
export function normalize(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  const pick = (...ks) => { for (const k of ks) if (b[k] != null) return b[k]; return undefined; };
  const eff = directive(pick('effective-directive', 'effectiveDirective')) || directive(pick('violated-directive', 'violatedDirective'));
  const out = {
    d: eff,
    b: cleanUrl(pick('blocked-uri', 'blockedURL', 'blockedURI')),
    u: cleanUrl(pick('document-uri', 'documentURL', 'documentURI')),
    s: cleanUrl(pick('source-file', 'sourceFile')),
    l: int(pick('line-number', 'lineNumber')),
    c: int(pick('column-number', 'columnNumber')),
    m: String(pick('disposition') || '').toLowerCase() === 'enforce' ? 'enforce' : 'report'
  };
  if (!out.d && !out.b && !out.u) return null;
  return out;
}

export function parseReports(kind, text) {
  let j; try { j = JSON.parse(text); } catch { return null; }
  const items = [];
  if (kind === 'csp-report') { if (j && typeof j === 'object' && j['csp-report']) items.push(j['csp-report']); }
  else if (kind === 'reports' && Array.isArray(j)) for (const r of j.slice(0, MAX_REPORTS_PER_REQUEST * 2)) if (r && r.type === 'csp-violation' && r.body) items.push(Object.assign({}, r.body, r.url && !r.body.documentURL ? { documentURL: r.url } : {}));
  const out = [];
  for (const it of items) { const n = normalize(it); if (n) out.push(n); if (out.length >= MAX_REPORTS_PER_REQUEST) break; }
  return out;
}

export function createLimiter(max = RATE_PER_MINUTE, windowMs = 60000, cap = 5000) {
  const hits = new Map();
  return (key, now = Date.now()) => {
    if (hits.size > cap) for (const [k, v] of hits) if (now - v.t > windowMs) hits.delete(k);
    const e = hits.get(key);
    if (!e || now - e.t > windowMs) { hits.set(key, { t: now, n: 1 }); return true; }
    e.n++; return e.n <= max;
  };
}

export async function hashIp(salt, ip) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(String(ip))));
  return Array.from(sig.slice(0, 8), (x) => x.toString(16).padStart(2, '0')).join('');
}
export function clientIp(get) {
  const cf = get('cf-connecting-ip'); if (cf) return cf.trim();
  const xf = get('x-forwarded-for'); if (xf) return xf.split(',')[0].trim();
  return 'unknown';
}

// read at most MAX_BODY_BYTES + 1 bytes: a missing or lying Content-Length cannot make us buffer more
async function readCapped(req) {
  const len = Number(req.headers.get('content-length'));
  if (Number.isFinite(len) && len > MAX_BODY_BYTES) return null;
  if (!req.body) return '';
  const reader = req.body.getReader(); const chunks = []; let n = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.byteLength; if (n > MAX_BODY_BYTES) { try { await reader.cancel(); } catch { /* ignore */ } return null; } chunks.push(value); }
  const buf = new Uint8Array(n); let o = 0; for (const c of chunks) { buf.set(c, o); o += c.byteLength; }
  return new TextDecoder().decode(buf);
}

const respond = (status, extra = {}) => new Response(null, { status, headers: Object.assign({ 'Cache-Control': 'no-store' }, extra) });

// deps: { limiter(key)->bool, hash(ip)->Promise<string>, log(line) }
export async function handleReport(req, deps) {
  if (req.method !== 'POST') return respond(405, { Allow: 'POST' });
  const kind = kindOf(req.headers.get('content-type'));
  if (!kind) return respond(415);
  const text = await readCapped(req);
  if (text === null) return respond(413);
  const ip = await deps.hash(clientIp((n) => req.headers.get(n)));
  if (!deps.limiter(ip)) return respond(429);
  const reports = parseReports(kind, text);
  if (!reports) return respond(400);
  for (const r of reports) deps.log(JSON.stringify(Object.assign({ t: 'csp', ip: ip.slice(0, 8) }, r)));
  return respond(204);
}
