#!/usr/bin/env node
// Per-event prerender (design GO'd by Grok 2026-11-24). For every PUBLISHED event this writes event/<slug>/index.html:
// event.html (the single template) with the event's real head (title, description, canonical, OG/Twitter, JSON-LD) and the
// above-the-fold content (flyer <img fetchpriority=high>, h1, date, venue, genre, description) already in the HTML.
// The page's own script still runs and hydrates the live parts (tickets, going count, lineup, social); it reads the slug from
// window.__kilPrerenderSlug because the URL has no ?e=. /event?e=<slug> keeps working exactly as before.
//
//   node scripts/build-event-pages.mjs [--out .] [--dry]       needs network (public anon key, read-only: published events + get_event_view)
//
// Safety: every event field is untrusted text. HTML text and attributes go through esc(); URLs must be http(s); the JSON-LD block is
// JSON.stringify'd with "<", U+2028 and U+2029 escaped; slugs must match SLUG_RE or the event is skipped. Output has no timestamps,
// so an unchanged event produces a byte-identical file and no commit.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MARKER = '<!-- kil-prerender v1 -->';
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,120}$/;
const SITE = 'https://keepitil.com';
const DEFAULT_DESC = 'KEEPITIL is a culture platform built to discover, connect, create, share and earn through people, events, media and community.';

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"'`]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
export const safeUrl = (u) => { try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (e) { return ''; } };
export const jsonLd = (o) => JSON.stringify(o).replace(/</g, '\\u003c').split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function localDate(iso, tz) {
  try { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return ''; return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); } catch (e) { return ''; }
}
export function fmt(d) { if (!d) return ''; const a = d.split('-'); if (a.length < 3) return d; const dt = new Date(Date.UTC(+a[0], +a[1] - 1, +a[2])); return DOW[dt.getUTCDay()] + ', ' + MON[+a[1] - 1] + ' ' + (+a[2]) + ', ' + a[0]; }

function replaceOnce(html, from, to, label) {
  const i = html.indexOf(from);
  if (i < 0) throw new Error('template changed: ' + label + ' not found');
  if (html.indexOf(from, i + from.length) >= 0) throw new Error('template changed: ' + label + ' is not unique');
  return html.slice(0, i) + to + html.slice(i + from.length);
}

// Pure: template html + one get_event_view row -> page html. Throws on a bad slug or when event.html no longer matches the anchors.
export function renderEventPage(template, row) {
  const slug = String(row && row.slug || '');
  if (!SLUG_RE.test(slug)) throw new Error('bad slug');
  const title = String(row.title || 'KEEPITIL Event');
  const date = localDate(row.starts_at, row.tz);
  const loc = [row.venue, row.city].filter(Boolean).join(', ');
  const img = safeUrl(row.cover_url);
  const genre = String(row.genres || '');
  const desc = String(row.description || '');
  const canon = SITE + '/event/' + slug + '/';
  const titledate = title + (date ? ' — ' + fmt(date) : '');
  const descTxt = title + (loc ? ' at ' + loc : '') + (date ? ' on ' + fmt(date) : '') + (genre ? ' · ' + genre : '') + '. Save it on KEEPITIL, join the event conversation, and grab tickets.';
  const ld = { '@context': 'https://schema.org', '@type': 'MusicEvent', name: title, url: canon, eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode' };
  if (row.starts_at) ld.startDate = row.starts_at; else if (date) ld.startDate = date;
  if (row.ends_at) ld.endDate = row.ends_at;
  if (img) ld.image = img;
  if (row.venue) ld.location = { '@type': 'Place', name: String(row.venue), address: { '@type': 'PostalAddress', addressLocality: row.city || 'Los Angeles', addressRegion: 'CA', addressCountry: 'US' } };
  ld.organizer = { '@type': 'Organization', name: 'KEEPITIL', url: SITE + '/' };

  let h = template;
  h = replaceOnce(h, '<!DOCTYPE html>', '<!DOCTYPE html>\n' + MARKER, 'doctype');
  h = replaceOnce(h, '<title>Event — KEEPITIL</title>', '<title>' + esc(titledate + ' | KEEPITIL') + '</title>', 'title');
  h = h.replace(/<meta name="description" id="m-desc" content="[^"]*"\/>/, '<meta name="description" id="m-desc" content="' + esc(descTxt) + '"/>');
  h = h.replace(/<meta property="og:title" id="og-title" content="[^"]*"\/>/, '<meta property="og:title" id="og-title" content="' + esc(titledate + ' | KEEPITIL') + '"/>');
  h = h.replace(/<meta property="og:description" id="og-desc" content="[^"]*"\/>/, '<meta property="og:description" id="og-desc" content="' + esc(descTxt) + '"/>');
  if (img) h = h.replace(/<meta property="og:image" id="og-img" content="[^"]*"\/>/, '<meta property="og:image" id="og-img" content="' + esc(img) + '"/>');
  h = h.replace('<meta property="og:url" id="og-url"/>', '<meta property="og:url" id="og-url" content="' + esc(canon) + '"/>');
  h = replaceOnce(h, '<meta name="twitter:card" content="summary_large_image"/>',
    '<meta name="twitter:card" content="summary_large_image"/>\n<link rel="canonical" id="m-canon" href="' + esc(canon) + '"/>\n' +
    '<script type="application/ld+json" id="ld-event">' + jsonLd(ld) + '</script>\n' +
    '<script>window.__kilPrerenderSlug=' + jsonLd(slug) + ';</script>' +
    (img ? '\n<link rel="preload" as="image" href="' + esc(img) + '" fetchpriority="high"/>' : ''), 'twitter:card');
  // the page script builds its canonical from this helper: point it at the prerendered URL, not the legacy one
  h = replaceOnce(h, "function canonFor(slug){ return 'https://keepitil.com/event?e='+encodeURIComponent(slug||''); }",
    "function canonFor(slug){ return 'https://keepitil.com/event/'+encodeURIComponent(slug||'')+'/'; }", 'canonFor');
  // the slug comes from the path, not ?e=
  h = replaceOnce(h, "slug:g('e'),", "slug:g('e')||window.__kilPrerenderSlug||'',", 'slug source');
  // above-the-fold content, in the HTML
  h = replaceOnce(h, '<div class="flyer" id="ev-flyer"></div>',
    '<div class="flyer" id="ev-flyer">' + (img ? '<img fetchpriority="high" decoding="async" alt="' + esc('Flyer for ' + title) + '" src="' + esc(img) + '">' : '') + '</div>', 'flyer');
  h = replaceOnce(h, '<h1 id="ev-title">Event</h1>', '<h1 id="ev-title">' + esc(title) + '</h1>', 'h1');
  h = replaceOnce(h, '<div class="meta" id="ev-date"></div>', '<div class="meta" id="ev-date">' + esc(fmt(date)) + '</div>', 'date');
  h = replaceOnce(h, '<div class="meta" id="ev-venue"></div>', '<div class="meta" id="ev-venue">' + esc(loc ? '📍 ' + loc : '') + '</div>', 'venue');
  if (genre) h = replaceOnce(h, '<span class="genre" id="ev-genre" style="display:none;"></span>', '<span class="genre" id="ev-genre" style="display:inline-block;">' + esc(genre) + '</span>', 'genre');
  if (desc) h = replaceOnce(h, '<p class="desc" id="ev-desc" style="display:none"></p>', '<p class="desc" id="ev-desc">' + esc(desc) + '</p>', 'desc');
  return h;
}

// Remove generated pages whose event is no longer published. Only directories whose index.html carries MARKER are touched.
export function removeStale(outDir, keepSlugs) {
  const base = path.join(outDir, 'event');
  const removed = [];
  if (!fs.existsSync(base)) return removed;
  for (const e of fs.readdirSync(base, { withFileTypes: true })) {
    if (!e.isDirectory() || keepSlugs.has(e.name)) continue;
    const f = path.join(base, e.name, 'index.html');
    if (fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes(MARKER)) { fs.rmSync(path.join(base, e.name), { recursive: true, force: true }); removed.push(e.name); }
  }
  return removed;
}

export function writeIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

export async function main(argv = process.argv.slice(2), fetchImpl = fetch) {
  const outIdx = argv.indexOf('--out');
  const out = outIdx >= 0 ? argv[outIdx + 1] : '.';
  const dry = argv.includes('--dry');
  const template = fs.readFileSync(path.join(out, 'event.html'), 'utf8');
  const url = (template.match(/var URL='(https:\/\/[a-z0-9]+\.supabase\.co)'/) || [])[1];
  const key = (template.match(/var KEY='(eyJ[A-Za-z0-9._-]+)'/) || [])[1];
  if (!url || !key) throw new Error('could not read the public Supabase URL and anon key from event.html');
  const H = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  const list = await fetchImpl(url + '/rest/v1/events?status=eq.published&select=slug&order=starts_at&limit=1000', { headers: H });
  if (!list.ok) throw new Error('events list failed: HTTP ' + list.status);
  const slugs = (await list.json()).map((r) => r.slug).filter((s) => typeof s === 'string');
  const keep = new Set(), skipped = [], changed = [], same = [];
  for (const slug of slugs) {
    if (!SLUG_RE.test(slug)) { skipped.push(slug); continue; }
    const r = await fetchImpl(url + '/rest/v1/rpc/get_event_view', { method: 'POST', headers: H, body: JSON.stringify({ p_slug: slug }) });
    if (!r.ok) { console.error('skip ' + slug + ': HTTP ' + r.status); keep.add(slug); continue; }   // a failed fetch must never delete an existing page
    const row = (await r.json())[0];
    if (!row || row.status !== 'published') continue;
    keep.add(slug);
    const html = renderEventPage(template, row);
    if (dry) { same.push(slug); continue; }
    (writeIfChanged(path.join(out, 'event', slug, 'index.html'), html) ? changed : same).push(slug);
  }
  const removed = dry ? [] : removeStale(out, keep);
  console.log(JSON.stringify({ published: slugs.length, written: changed.length, unchanged: same.length, removed: removed.length, skippedBadSlug: skipped.length }));
  return { changed, same, removed, skipped };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e.message); process.exit(1); });
