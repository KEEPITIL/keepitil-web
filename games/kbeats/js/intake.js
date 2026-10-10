/* KBeats artist intake — pure, deterministic rules shared by the browser and the kbeats-api edge
   function (synced into supabase/functions/kbeats-api/shared/). No I/O here: the server supplies
   records, these functions decide. Nexus owns the workflow; KBeats owns these domain rules.

   - SoundCloud URLs are identity REFERENCES, never proof and never an audio source.
   - Catalog matching is conservative: title-only matches are never auto-eligible.
   - Inbound-mail parsing is provider-neutral; no SoundCloud template is assumed until a real
     notification is supplied as a fixture (until then every message is NEEDS_REVIEW). */

export const INTAKE_PARSER_VERSION = 'kbeats-intake-1';
export const RIGHTS_ITEMS = ['master', 'composition', 'samples', 'storage_gameplay', 'analysis_charts', 'previews', 'agreement'];

/* ── SoundCloud references ─────────────────────────────────────────────── */
const SC_HOSTS = /^(www\.|m\.)?soundcloud\.com$/;
const SC_RESERVED = new Set(['discover', 'search', 'upload', 'you', 'stream', 'charts', 'pages', 'terms-of-use', 'settings', 'messages', 'notifications', 'imprint', 'jobs', 'mobile', 'pro', 'artists', 'people', 'tags', 'stations']);

/** Canonicalise a SoundCloud profile or track URL. Returns null for anything that is not a plain
 *  public profile (/user) or track (/user/track) URL — sets, likes, private share links and other
 *  hosts are rejected so they can never be recorded as an identity. */
export function normalizeScUrl(raw) {
  let u; try { u = new URL(String(raw || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (!SC_HOSTS.test(u.hostname.toLowerCase())) return null;
  const parts = u.pathname.split('/').filter(Boolean).map(p => decodeURIComponent(p).toLowerCase());
  if (!parts.length || parts.length > 2) return null;
  const valid = s => /^[a-z0-9_-]{1,100}$/.test(s);
  if (!parts.every(valid) || SC_RESERVED.has(parts[0])) return null;
  if (parts.length === 2 && ['sets', 'likes', 'tracks', 'albums', 'reposts', 'followers', 'following', 'popular-tracks', 'comments'].includes(parts[1])) return null;
  const user = parts[0];
  return parts.length === 1
    ? { kind: 'profile', user, permalink: `https://soundcloud.com/${user}` }
    : { kind: 'track', user, slug: parts[1], permalink: `https://soundcloud.com/${user}/${parts[1]}`, profile: `https://soundcloud.com/${user}` };
}

/* ── idempotency ──────────────────────────────────────────────────────── */
/** Stable intake key: mail provider message id (+ SoundCloud track identifier when present).
 *  Owner-import rows use the batch key + row identity.
 *  @param {{ source: string, provider?: string, messageId?: string, scTrackId?: string|null,
 *            scTrackUrl?: string|null, batchKey?: string, rowKey?: string|number }} key */
export function intakeKey({ source, provider, messageId, scTrackId, scTrackUrl, batchKey, rowKey }) {
  if (source === 'owner_import') { if (!batchKey || !rowKey) throw new Error('owner import key needs batch and row'); return `owner:${batchKey}:${rowKey}`; }
  if (source === 'artist_form') throw new Error('artist form hints never create intakes');
  if (!provider || !messageId) throw new Error('mail provider and message id are required');
  const track = scTrackId ? `sc:${scTrackId}` : scTrackUrl ? `url:${normalizeScUrl(scTrackUrl)?.permalink || 'raw:' + String(scTrackUrl).trim()}` : 'none';
  return `mail:${String(provider).toLowerCase()}:${String(messageId).trim()}:${track}`;
}

/** Canonical JSON (sorted keys) so the same logical request always hashes the same. */
export function canonicalJson(v) {
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}

/* ── identity / impersonation ─────────────────────────────────────────── */
/** Decide whether `claim` may link a SoundCloud identity given what is already recorded.
 *  existing: rows from sc_identities for the same permalink or sc_id. claim: { kind, artistId?, trackId? }.
 *  A different artist/track already holding the identity is a conflict — never overwritten. */
export function identityDecision(existing, claim) {
  const same = existing.filter(r => r.kind === claim.kind);
  if (!same.length) return { decision: 'link' };
  const owner = claim.kind === 'profile' ? 'artist_id' : 'track_id';
  const mine = claim.kind === 'profile' ? claim.artistId : claim.trackId;
  if (same.every(r => r[owner] === mine)) return { decision: 'already_linked', id: same[0].id };
  return { decision: 'conflict', heldBy: same.find(r => r[owner] !== mine)[owner] };
}

/* ── owner catalog matching ───────────────────────────────────────────── */
export const normTitle = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/\.(wav|flac|mp3|m4a|aac|aif|aiff)$/i, '')
  .replace(/\((feat|ft|prod|official|master|final|mix|explicit|clean)[^)]*\)|\[[^\]]*\]/g, ' ')
  .replace(/\b(feat|ft)\.?\s.*$/, ' ').replace(/^\d{1,3}\s*[-_. ]\s*/, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();
const isrcNorm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Match catalog metadata rows to owner-controlled master files.
 *  rows: [{ title, artist?, isrc?, durationMs?, scId?, scUrl?, sha256?, file? }]
 *  masters: [{ path, name, durationMs?, sha256?, isrc?, scId? }]
 *  Strong evidence: sha256, ISRC or SoundCloud id equal on both sides, or an explicit file name in
 *  the row. Supporting: normalised title equality + duration within 2 s. Title alone is reported
 *  but NEVER auto-eligible. A master can be claimed by at most one row (else ambiguous). */
export function matchCatalog(rows, masters, { durTolMs = 2000 } = {}) {
  const res = rows.map((r, i) => {
    const ev = []; const cands = [];
    for (const m of masters) {
      const e = [];
      if (r.sha256 && m.sha256 && r.sha256.toLowerCase() === m.sha256.toLowerCase()) e.push('sha256');
      if (r.isrc && m.isrc && isrcNorm(r.isrc) === isrcNorm(m.isrc)) e.push('isrc');
      if (r.scId && m.scId && String(r.scId) === String(m.scId)) e.push('soundcloud_id');
      if (r.file && (m.name === r.file || m.path.endsWith('/' + r.file))) e.push('file');
      const tEq = normTitle(r.title) && normTitle(r.title) === normTitle(m.name);
      const dOk = r.durationMs && m.durationMs && Math.abs(r.durationMs - m.durationMs) <= durTolMs;
      if (tEq) e.push('title'); if (dOk) e.push('duration');
      if (e.length) cands.push({ m, e });
    }
    const strong = c => c.e.some(x => ['sha256', 'isrc', 'soundcloud_id', 'file'].includes(x));
    const supported = c => c.e.includes('title') && c.e.includes('duration');
    const pick = cands.filter(strong).length ? cands.filter(strong) : cands.filter(supported).length ? cands.filter(supported) : cands.filter(c => c.e.includes('title'));
    if (!pick.length) return { row: i, status: 'unmatched', autoEligible: false, confidence: 0, evidence: [] };
    if (pick.length > 1) return { row: i, status: 'ambiguous', autoEligible: false, confidence: 0.3, evidence: pick.map(c => ({ path: c.m.path, by: c.e })) };
    const c = pick[0], isStrong = strong(c), isSup = supported(c);
    return { row: i, status: 'matched', master: c.m.path, autoEligible: isStrong || isSup, confidence: isStrong ? 1 : isSup ? 0.8 : 0.3, evidence: c.e,
      needsReview: !(isStrong || isSup) ? 'title-only match: needs owner confirmation' : null };
  });
  // a master claimed by two rows is ambiguous for both
  const byMaster = {};
  for (const r of res) if (r.master) (byMaster[r.master] ||= []).push(r);
  for (const list of Object.values(byMaster)) if (list.length > 1) for (const r of list) Object.assign(r, { status: 'ambiguous', autoEligible: false, confidence: 0.3, evidence: [{ path: r.master, by: r.evidence, sharedWithRows: list.map(x => x.row) }], master: undefined });
  return res;
}

/* ── Owner catalog upload: file checks and automatic preview inventory (no hand-made CSV) ── */
export const IMPORT_MAX_BYTES = 209715200;                       // the kbeats-masters bucket limit (200 MB)
export const IMPORT_EXTS = ['wav', 'flac', 'mp3', 'm4a', 'aac']; // what the private bucket accepts
const IMPORT_MIME = { wav: 'audio/wav', flac: 'audio/flac', mp3: 'audio/mpeg', m4a: 'audio/x-m4a', aac: 'audio/aac' };

/** owner-import/<folder> — one folder level of [a-z0-9_-], nothing else. */
export function importFolder(raw) {
  const f = String(raw || '').trim().replace(/^\/+|\/+$/g, '');
  const full = f.startsWith('owner-import/') ? f : 'owner-import/' + f;
  return /^owner-import\/[a-z0-9][a-z0-9_-]{0,79}$/.test(full) ? full : null;
}

/** Storage-safe version of an owner's file name (brackets → parentheses, accents folded, other symbols dropped). */
export function safeImportName(name) {
  const base = String(name || '').split(/[\\/]/).pop();
  return base.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\[/g, '(').replace(/\]/g, ')').replace(/[{]/g, '(').replace(/[}]/g, ')')
    .replace(/[^A-Za-z0-9 _.\-()&'!,+]/g, '').replace(/\.{2,}/g, '.').replace(/^[.\s]+/, '').replace(/\s+/g, ' ').trim().slice(-180);
}

/** Validates one file offered for upload: { name, bytes } → { name, ext, mime } or { error }. */
export function checkImportFile(f) {
  const name = String(f?.name || '').split(/[\\/]/).pop().trim();
  if (!name || name.length > 180) return { error: 'file name missing or longer than 180 characters' };
  if (name.startsWith('.') || name.includes('..')) return { error: 'file name may not start with a dot or contain ".."' };
  if (!/^[A-Za-z0-9 _.\-()&'!,+]+$/.test(name)) return { error: 'rename the file using letters, digits, spaces and - _ . ( ) & \' ! , + only' };
  const ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
  if (ext === 'aif' || ext === 'aiff') return { error: 'AIFF is not accepted by the masters bucket yet: export WAV (same quality) instead' };
  if (!IMPORT_EXTS.includes(ext)) return { error: `not an accepted audio file (${IMPORT_EXTS.join(', ')})` };
  const bytes = Number(f.bytes);
  if (!Number.isFinite(bytes) || bytes < 1024) return { error: 'file is empty or too small to be audio' };
  if (bytes > IMPORT_MAX_BYTES) return { error: 'file is larger than 200 MB' };
  return { name, ext, mime: IMPORT_MIME[ext] };
}

const FEAT = /\s*[\(\[]?\s*\b(?:feat\.?|ft\.?|featuring|with)\s+([^\)\]]+?)\s*[\)\]]?\s*$/i;
const FLAG_WORDS = [['remix', /\bremix\b|\brmx\b/i], ['cover', /\bcover\b/i], ['bootleg', /\bbootleg\b|\bflip\b/i],
  ['edit', /\b(?:vip|re-?edit|edit)\b/i], ['sample', /\bsample[ds]?\b|\binterpolat/i], ['beat', /\b(?:type beat|prod\.?\s|produced by|lease)\b/i]];

/** Reads credits from a master's file name. Never invents: what it cannot read stays undefined.
 *  "07 - Artist - Title (feat. X) [Master].wav" → { trackNo: 7, artist, title, featured: ['X'] } */
export function parseMasterName(file) {
  let base = String(file || '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const out = { file, flags: [] };
  const no = base.match(/^(\d{1,3})\s*[-.)]\s*/); if (no) { out.trackNo = Number(no[1]); base = base.slice(no[0].length); }
  base = base.replace(/\s*[\(\[](?:final|master(?:ed)?|mixdown|mix|v\d+|wav|24bit|clean|explicit)[^\)\]]*[\)\]]/gi, '').trim();
  for (const [k, re] of FLAG_WORDS) if (re.test(base)) out.flags.push(k);
  const parts = base.split(/\s+-\s+/);
  if (parts.length >= 2) { out.artist = parts.shift().trim(); base = parts.join(' - '); }
  const fm = base.match(FEAT);
  if (fm) { out.featured = fm[1].split(/\s*(?:,|&|\band\b)\s*/i).map(x => x.trim()).filter(Boolean); base = base.slice(0, fm.index).trim(); }
  if (out.artist && /\s(?:x|&|vs\.?)\s/i.test(out.artist)) out.flags.push('collaboration');
  if (out.featured?.length) out.flags.push('featured');
  out.title = base.replace(/\s*[\(\[][^\)\]]*[\)\]]\s*$/, m => (/remix|edit|version|mix/i.test(m) ? m : '')).trim() || undefined;
  out.flags = [...new Set(out.flags)];
  return out;
}

/** Builds the preview inventory from what was uploaded (+ an optional SoundCloud/owner export).
 *  masters: [{ path, name, bytes, durationMs? }]; exportRows: parseCatalog() rows; existing: [{ path, title }] already imported.
 *  Status per row (nothing is ever "approved" here — that needs rights attestation + review):
 *    'Missing original audio' | 'Rights review required' | 'Duplicate: resolve before import' |
 *    'Needs WAV for automatic charts' | 'Ready for gameplay QA' */
export function buildImportInventory(masters, exportRows = [], existing = [], { owner } = {}) {
  const items = masters.map(m => ({ ...parseMasterName(m.name), path: m.path, bytes: m.bytes, durationMs: m.durationMs,
    format: m.format || (m.name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase(), issues: [] }));
  const ownerN = owner ? normTitle(owner) : null;
  const seenTitle = {}, seenSize = {};
  for (const it of items) {
    const k = normTitle(it.title || it.file);
    (seenTitle[k] ||= []).push(it);
    if (it.bytes && it.durationMs) (seenSize[`${it.bytes}:${it.durationMs}`] ||= []).push(it);
  }
  for (const list of Object.values(seenTitle)) if (list.length > 1) for (const it of list) it.issues.push(`duplicate title in this upload (${list.map(x => x.file).join(', ')})`);
  for (const list of Object.values(seenSize)) if (list.length > 1) for (const it of list) it.issues.push('identical size and length to another file: likely the same audio twice');
  const done = new Set(existing.map(e => e.path)), doneTitles = new Set(existing.map(e => normTitle(e.title)));
  for (const it of items) {
    if (done.has(it.path)) it.issues.push('already imported (this exact file)');
    else if (doneTitles.has(normTitle(it.title))) it.issues.push('a track with this title was already imported');
    if (!it.title) it.issues.push('title could not be read from the file name');
    if (!it.artist) it.issues.push('artist not in the file name: confirm the credit');
    else if (ownerN && normTitle(it.artist) !== ownerN && !it.flags.includes('collaboration')) it.flags.push('other_artist');
  }
  // reconcile with the optional export: link SoundCloud data, list songs with no master
  const used = new Set(), missing = [];
  exportRows.forEach((r, i) => {
    const hits = items.filter(it => normTitle(it.title) && normTitle(it.title) === normTitle(r.title));
    if (hits.length === 1 && !used.has(hits[0].path)) {
      const it = hits[0]; used.add(it.path);
      Object.assign(it, { scUrl: r.scUrl, scId: r.scId, isrc: it.isrc || r.isrc, exportRow: i });
      if (r.artist && !it.artist) it.artist = r.artist;
      if (r.durationMs && it.durationMs && Math.abs(r.durationMs - it.durationMs) > 3000) it.issues.push('length differs from the export by more than 3 s: different version?');
    } else if (hits.length > 1) hits.forEach(it => it.issues.push(`export row "${r.title}" matches several files`));
    else missing.push({ title: r.title, artist: r.artist, scUrl: r.scUrl, durationMs: r.durationMs, status: 'Missing original audio' });
  });
  for (const it of items) {
    const rightsFlags = it.flags.filter(f => f !== 'edit');
    it.status = rightsFlags.length || it.issues.some(x => /confirm the credit|could not be read/.test(x)) ? 'Rights review required' : 'Ready for gameplay QA';
    if (it.issues.some(x => /already imported|same audio twice|duplicate title/.test(x))) it.status = 'Duplicate: resolve before import';
    // automatic chart analysis reads WAV only: any other accepted format is stored, never "ready"
    it.chartAnalysis = !it.format || it.format === 'wav' ? 'automatic' : 'manual only (artist editor) or re-upload as WAV';
    if (it.format && it.format !== 'wav' && it.status === 'Ready for gameplay QA') it.status = 'Needs WAV for automatic charts';
  }
  const count = s => items.filter(i => i.status === s).length;
  return { items, missing, summary: { files: items.length, exportRows: exportRows.length, linkedToExport: used.size, missingAudio: missing.length,
    ready: count('Ready for gameplay QA'), rightsReview: count('Rights review required'), duplicates: count('Duplicate: resolve before import'),
    needsWav: count('Needs WAV for automatic charts') } };
}

/** Uploads files through server-signed, single-use URLs. Pure: `sign(files)` and `put(path, token, file, mime)`
 *  are injected, so the upload page and the tests share this exact logic.
 *  Each file ends as: 'uploaded' | 'already uploaded …' | 'refused: …' | 'failed: …'. Re-running resumes:
 *  finished files come back from the server as already uploaded and are not sent again. */
export async function uploadQueue(files, { sign, put, onChange = () => {}, chunk = 20, attempts = 3, wait = ms => new Promise(r => setTimeout(r, ms)) }) {
  const rows = files.map(file => {
    const name = safeImportName(file.name), chk = checkImportFile({ name, bytes: file.size });
    return { file, name, renamed: name !== file.name, state: chk.error ? 'refused: ' + chk.error : 'waiting' };
  });
  const seen = new Set();
  for (const r of rows) if (r.state === 'waiting') { if (seen.has(r.name)) r.state = 'refused: two selected files have the same name'; seen.add(r.name); }
  onChange(rows);
  const todo = rows.filter(r => r.state === 'waiting');
  for (let i = 0; i < todo.length; i += chunk) {
    const part = todo.slice(i, i + chunk);
    let signed;
    try { signed = await sign(part.map(r => ({ name: r.name, bytes: r.file.size }))); }
    catch (e) { part.forEach(r => { r.state = 'failed: ' + (e.message || e) + ' (press Upload again to resume)'; }); onChange(rows); continue; }
    for (const r of part) {
      const s = (signed.files || []).find(x => x.name === r.name) || { error: 'the server did not sign this file' };
      if (s.error) { r.state = 'refused: ' + s.error; onChange(rows); continue; }
      if (s.skipped) { r.state = s.skipped; onChange(rows); continue; }
      for (let a = 1; a <= attempts; a++) {
        r.state = a === 1 ? 'uploading…' : `uploading… (retry ${a - 1})`; onChange(rows);
        try { await put(s.path, s.token, r.file, s.mime); r.state = 'uploaded'; break; }
        catch (e) { r.state = a < attempts ? 'retrying…' : 'failed: ' + (e.message || e) + ' (press Upload again to resume)'; if (a < attempts) await wait(1500 * a); }
      }
      onChange(rows);
    }
  }
  const n = re => rows.filter(r => re.test(r.state)).length;
  return { rows, uploaded: n(/^uploaded$/), already: n(/^already uploaded/), refused: n(/^refused/), failed: n(/^failed/) };
}

/** Inventory items → catalog rows for admin_import_plan, in parseCatalog's column names. The explicit file name is strong evidence. */
export const inventoryToRows = inv => inv.items.filter(i => i.status !== 'Duplicate: resolve before import')
  .map(i => ({ title: i.title || i.file, artist: i.artist, duration_ms: i.durationMs, soundcloud_url: i.scUrl, soundcloud_id: i.scId, isrc: i.isrc, file: i.file }));

/** Parse a structured catalog export (CSV with a header row, or JSON array). Recognised columns:
 *  title, artist, album, isrc, duration (s or m:ss) / duration_ms, soundcloud_url, soundcloud_id, sha256, file. */
export function parseCatalog(text) {
  const t = String(text || '').trim(); if (!t) return [];
  if (t[0] === '[') return JSON.parse(t).map(normRow);
  const lines = []; let cur = '', row = [], q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; continue; }
    if (ch === '"') q = true; else if (ch === ',') { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cur); lines.push(row); row = []; cur = ''; } else cur += ch;
  }
  row.push(cur); lines.push(row);
  const head = lines.shift().map(h => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'));
  return lines.filter(l => l.some(x => x.trim())).map(l => normRow(Object.fromEntries(head.map((h, i) => [h, (l[i] ?? '').trim()]))));
}
function normRow(o) {
  const dur = o.duration_ms ? Number(o.duration_ms) : o.duration ? (String(o.duration).includes(':') ? String(o.duration).split(':').reduce((a, x) => a * 60 + Number(x), 0) * 1000 : Number(o.duration) * 1000) : undefined;
  const sc = o.soundcloud_url || o.permalink_url || o.url;
  return { title: String(o.title || '').trim(), artist: o.artist ? String(o.artist).trim() : undefined, album: o.album || undefined,
    isrc: o.isrc || undefined, durationMs: Number.isFinite(dur) ? Math.round(dur) : undefined,
    scUrl: sc && normalizeScUrl(sc)?.kind === 'track' ? normalizeScUrl(sc).permalink : undefined,
    scId: o.soundcloud_id || o.id || undefined, sha256: o.sha256 || undefined, file: o.file || o.filename || undefined };
}

/* ── inbound mail (provider-neutral) ──────────────────────────────────── */
/** Authenticity gate for an inbound message, independent of any template.
 *  msg: { from, to:[...], subject, headers:{ 'authentication-results'?, ... }, isForward? }
 *  policy: { mailbox, allowedSenderDomains:[], requireDkimPass } — with no allowed domains configured
 *  every message is NEEDS_REVIEW (nothing is trusted by default). */
export function checkMailAuthenticity(msg, policy = {}) {
  const reasons = [];
  const from = String(msg.from || '').toLowerCase(), domain = (from.match(/@([a-z0-9.-]+)>?\s*$/) || [])[1] || '';
  const allowed = (policy.allowedSenderDomains || []).map(d => d.toLowerCase());
  if (!allowed.length) reasons.push('no trusted sender domains configured');
  else if (!allowed.some(d => domain === d || domain.endsWith('.' + d))) reasons.push(`sender domain ${domain || '?'} not trusted`);
  const to = (msg.to || []).map(x => String(x).toLowerCase());
  if (!policy.mailbox) reasons.push('intake mailbox not configured');
  else if (!to.some(x => x.includes(policy.mailbox.toLowerCase()))) reasons.push('not addressed to the intake mailbox');
  const subj = String(msg.subject || '');
  if (msg.isForward || /^\s*(fwd?|fw):/i.test(subj) || /-{2,}\s*forwarded message/i.test(String(msg.text || ''))) reasons.push('forwarded message');
  const ar = String(msg.headers?.['authentication-results'] || '').toLowerCase();
  if (policy.requireDkimPass !== false) {
    const dkimOk = domain && new RegExp(`dkim=pass[^;]*header\\.(d|i)=@?([a-z0-9.-]*\\.)?${domain.replace(/\./g, '\\.')}`).test(ar);
    if (!dkimOk) reasons.push('no DKIM pass for the sender domain');
  }
  return { verified: reasons.length === 0, reasons, senderDomain: domain };
}

/** Parser registry. A parser is { id, version, matches(msg) → bool, parse(msg) → fields }.
 *  None is registered for SoundCloud until a real notification is supplied as a fixture. */
export function parseInbound(msg, parsers = [], policy = {}) {
  const auth = checkMailAuthenticity(msg, policy);
  const p = parsers.find(x => { try { return x.matches(msg); } catch { return false; } });
  if (!p) return { status: 'NEEDS_REVIEW', reason: 'no parser recognises this message', authenticity: auth, parserVersion: INTAKE_PARSER_VERSION };
  let fields; try { fields = p.parse(msg); } catch (e) { return { status: 'NEEDS_REVIEW', reason: 'parser error: ' + e.message, authenticity: auth, parserVersion: `${p.id}@${p.version}` }; }
  const missing = ['artistName', 'trackTitle'].filter(k => !fields?.[k]);
  if (fields?.scTrackUrl && normalizeScUrl(fields.scTrackUrl)?.kind !== 'track') missing.push('scTrackUrl(valid)');
  if (fields?.scProfileUrl && normalizeScUrl(fields.scProfileUrl)?.kind !== 'profile') missing.push('scProfileUrl(valid)');
  const status = !auth.verified || missing.length ? 'NEEDS_REVIEW' : 'DETECTED';
  return { status, reason: missing.length ? 'missing ' + missing.join(', ') : auth.verified ? null : auth.reasons.join('; '), fields, authenticity: auth, parserVersion: `${p.id}@${p.version}` };
}

/* ── artist-facing timeline (no internal state names) ─────────────────── */
export function artistTimeline(s) {
  const steps = [
    ['Split received', !!s.splitReceived], ['Split accepted', s.splitDecision === 'accepted'],
    ['Authorization complete', !!s.authorized], ['Master received', !!s.masterReceived],
    ['Gameplay generated', !!s.chartsReady], ['Under review', ['review', 'approved', 'published'].includes(s.trackStatus)],
    ['Approved', ['approved', 'published'].includes(s.trackStatus)], ['Live', s.trackStatus === 'published']];
  let action = null;
  if (s.splitDecision === 'rejected') action = { label: 'Split not accepted', detail: 'We could not accept this split. Check your email for details.' };
  else if (s.intakeStatus === 'IDENTITY_CONFLICT' || s.intakeStatus === 'RIGHTS_CONFLICT') action = { label: 'We are reviewing this track', detail: 'Our team will contact you by email.' };
  else if (s.splitDecision === 'accepted' && !s.authorized) action = { label: 'ACTION NEEDED', detail: 'Authorize your track for KBeats using the link we emailed you.', needs: 'authorize' };
  else if (s.authorized && !s.masterReceived) action = { label: 'ACTION NEEDED', detail: 'Upload your master file using the secure link we emailed you.', needs: 'master' };
  else if (s.trackStatus === 'changes_requested') action = { label: 'ACTION NEEDED', detail: 'We need a change before your track can go live. Check your email.', needs: 'changes' };
  return { steps: steps.map(([label, done]) => ({ label, done })), current: (steps.find(x => !x[1]) || [null])[0], action };
}

/* ── evidence helpers ─────────────────────────────────────────────────── */
/** Minimal WAV probe (RIFF/PCM header) used to validate masters server-side without decoding. */
export function probeWav(u8) {
  if (u8.length < 44) return null;
  const s = (o, n) => String.fromCharCode(...u8.slice(o, o + n));
  if (s(0, 4) !== 'RIFF' || s(8, 4) !== 'WAVE') return null;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let o = 12, fmt = null, dataBytes = null, dataOffset = null;
  while (o + 8 <= u8.length) {
    const id = s(o, 4), len = dv.getUint32(o + 4, true);
    if (id === 'fmt ') fmt = { format: dv.getUint16(o + 8, true), channels: dv.getUint16(o + 10, true), sampleRate: dv.getUint32(o + 12, true), bits: dv.getUint16(o + 22, true) };
    if (id === 'data') { dataBytes = Math.min(len, u8.length - o - 8); dataOffset = o + 8; break; }
    o += 8 + len + (len & 1);
  }
  if (!fmt || dataBytes == null || !fmt.sampleRate || !fmt.channels || !fmt.bits) return null;
  const frameBytes = fmt.channels * fmt.bits / 8;
  const declared = dv.getUint32(dataOffset - 4, true);
  const frames = Math.floor(dataBytes / frameBytes);                 // decodable from these bytes
  const declaredFrames = Math.floor(declared / frameBytes);           // what the header says (works on a header-only slice)
  return { ...fmt, dataOffset, dataBytes, frames, declaredBytes: declared, truncated: dataBytes < declared,
    durationMs: Math.round(declaredFrames / fmt.sampleRate * 1000), decodableMs: Math.round(frames / fmt.sampleRate * 1000) };
}

/** Decode PCM WAV (16/24/32-bit int, 32-bit float) to a mono Float32Array for the shared analyzer. */
export function decodeWavMono(u8) {
  const p = probeWav(u8); if (!p) throw new Error('not a PCM WAV');
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), bps = p.bits / 8, out = new Float32Array(p.frames);
  for (let i = 0; i < p.frames; i++) {
    let acc = 0;
    for (let ch = 0; ch < p.channels; ch++) {
      const o = p.dataOffset + (i * p.channels + ch) * bps;
      let v;
      if (p.format === 3 && p.bits === 32) v = dv.getFloat32(o, true);
      else if (p.bits === 16) v = dv.getInt16(o, true) / 32768;
      else if (p.bits === 24) { const x = u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16); v = (x & 0x800000 ? x - 0x1000000 : x) / 8388608; }
      else if (p.bits === 32) v = dv.getInt32(o, true) / 2147483648;
      else throw new Error(`unsupported WAV bit depth ${p.bits}`);
      acc += v;
    }
    out[i] = acc / p.channels;
  }
  return { pcm: out, sampleRate: p.sampleRate, durationMs: p.decodableMs };
}
