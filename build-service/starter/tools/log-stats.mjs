// Analytics-free stats from the host's access log. No script on the site, no cookies, no stored IPs.
//   node tools/log-stats.mjs access.log [--days 30]
// Reads Common/Combined Log Format. Counts successful GETs of pages (not assets), skips bots,
// and prints page views per page, per day and the top referrer hosts. IPs are used only to count
// "visitors" in memory (per day) and are never written out.
import { readFileSync } from 'node:fs';
const LINE = /^(\S+) \S+ \S+ \[(\d{2})\/(\w{3})\/(\d{4}):[^\]]*\] "(\w+) (\S+)[^"]*" (\d{3}) \S+(?: "([^"]*)" "([^"]*)")?/;
const MON = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
const BOT = /bot|crawl|spider|slurp|preview|monitor|uptime|curl|wget|python-requests|headless/i;
export function stats(text) {
  const pages = {}, days = {}, refs = {}, seen = new Set(); let views = 0;
  for (const raw of text.split(/\r?\n/)) {
    const m = LINE.exec(raw); if (!m) continue;
    const [, ip, dd, mon, yyyy, method, url, status, ref, ua] = m;
    if (method !== 'GET' || status !== '200' || (ua && BOT.test(ua))) continue;
    const p = url.split('?')[0]; if (!(p === '/' || p.endsWith('/') || /\.html?$/.test(p))) continue;
    const day = `${yyyy}-${MON[mon]}-${dd}`, page = p === '/' ? '/index.html' : p;
    views++; pages[page] = (pages[page] || 0) + 1; days[day] = days[day] || { views: 0, visitors: 0 }; days[day].views++;
    const key = day + ip + (ua || ''); if (!seen.has(key)) { seen.add(key); days[day].visitors++; }
    if (ref && ref !== '-') { try { const h = new URL(ref).hostname; refs[h] = (refs[h] || 0) + 1; } catch {} }
  }
  return { views, pages, days, refs };
}
const top = (o, n = 10) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2]; if (!file) { console.error('usage: node tools/log-stats.mjs access.log'); process.exit(1); }
  const r = stats(readFileSync(file, 'utf8'));
  console.log(`Page views: ${r.views}\n\nTop pages`); for (const [p, n] of top(r.pages)) console.log(`  ${String(n).padStart(6)}  ${p}`);
  console.log('\nBy day (views / visitors)'); for (const d of Object.keys(r.days).sort()) console.log(`  ${d}  ${r.days[d].views} / ${r.days[d].visitors}`);
  console.log('\nTop referrers'); for (const [h, n] of top(r.refs)) console.log(`  ${String(n).padStart(6)}  ${h}`);
}
