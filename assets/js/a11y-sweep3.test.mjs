// Live axe sweep part 3 (signed out, 390 / 360): /venue (no slug) had no h1 (the deferred shell had not defined KIL_NOT_FOUND yet, so a bare-text fallback replaced the loading h1), /offline.html and /join/ had no main
// landmark, /wifi-remote's side-scrolling screenshot strip was not keyboard reachable, /connect/get-featured had no h1 and an unlabeled photo input, /kode/'s .tag was 3.68:1.   node --test assets/js/a11y-sweep3.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

test('/venue: load() waits for the deferred shell before it can show the not-found state, and even the bare fallback keeps an h1', () => {
  const h = read('venue.html');
  assert.match(h, /async function load\(\)\{[\s\S]{0,1400}document\.readyState==='loading'\) await new Promise\(function\(r\)\{ document\.addEventListener\('DOMContentLoaded', r, \{once:true\}\); \}\);/);
  const lb = h.slice(h.indexOf('async function load(){'), h.indexOf('function render(){')), ready = lb.indexOf("document.readyState==='loading'");
  assert.ok(lb.indexOf("SB.rpc('get_venue'") > 0 && lb.indexOf("SB.rpc('get_venue'") < ready, 'the venue request starts BEFORE the DOMContentLoaded wait (perf)');
  assert.ok(lb.indexOf('venueNF();') > ready && lb.indexOf('render();') > ready, 'but not-found and render still wait for the shell');
  assert.ok(h.includes('fetchpriority="high" decoding="async" data-fb="hide"'), 'the hero img is high priority (the LCP element)');
  assert.ok(h.includes("cur.getAttribute('data-hero')===v.cover_url) return;") && h.includes('if(req) req.then(function(r){ var v=r&&r.data&&r.data[0]; if(v&&v.cover_url) setHero(v); });'), 'the hero is drawn when the data arrives and render() does not draw it twice');
  assert.match(h, /el\.textContent=''; var h=document\.createElement\('h1'\); h\.className='vh'; h\.textContent='Venue';/);
  assert.doesNotMatch(h, /else if\(el\) el\.textContent='This venue is not available\.';/, 'NEGATIVE CONTROL: the old fallback that dropped the h1 is gone');
});
test('/offline.html and /join/: one main landmark that holds the card', () => {
  for (const [f, marker] of [['offline.html', '<h1>You&rsquo;re offline</h1>'], ['join/index.html', "<h1>You're invited to TUITEA</h1>"]]) {
    const h = read(f); assert.equal((h.match(/<main\b/gi) || []).length, 1, f); assert.equal((h.match(/<\/main>/gi) || []).length, 1, f);
    assert.ok(/<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(h)[1].includes(marker), f + ': the card is inside main');
  }
  assert.equal((read('offline.html').replace(/<\/?main\b[^>]*>/gi, '').match(/<main\b/gi) || []).length, 0, 'NEGATIVE CONTROL');
});
test('/wifi-remote: the sideways screenshot strip is a labelled, keyboard-focusable region', () => {
  assert.match(read('wifi-remote.html'), /<div class="shots" tabindex="0" role="region" aria-label="App screenshots \(scrolls sideways\)">/);
});
test('/connect/get-featured: the form heading is the page h1 (styled like before) and the photo input has a label', () => {
  const j = read('assets/js/kil-get-featured-v2.js');
  assert.match(j, /<h1>Get Featured on KEEPITIL Connect<\/h1>/); assert.doesNotMatch(j, /<h2>Get Featured on KEEPITIL Connect<\/h2>/);
  assert.equal((j.match(/#get-featured h1,#get-featured h2\{/g) || []).length, 2, 'both styling rules cover the h1');
  assert.match(j, /<label for="gf-photos">Your best photos \* \(up to 5\)<\/label>' \+\s+'<input id="gf-photos" type="file" name="photos"/);
});
test('/kode/: the .tag colour reads at 4.5:1 on the page background and on white (the old teal did not)', () => {
  const h = read('kode/index.html'), col = /\.tag\{[^}]*color:(#[0-9a-f]{6})/i.exec(h)[1], bg = /--bg:(#[0-9a-f]{6})/i.exec(h)[1];
  assert.ok(ratio(col, bg) >= 4.5 && ratio(col, '#ffffff') >= 4.5, col + ' on ' + bg + ': ' + ratio(col, bg).toFixed(2));
  assert.ok(ratio('#0891b2', '#ffffff') < 4.5, 'NEGATIVE CONTROL: the old colour fails');
});

test('/kode/: one main around the sections (header and footer outside) and the footer column headings follow the h2s (level 3)', () => {
  const h = read('kode/index.html'); assert.equal((h.match(/<main\b/gi) || []).length, 1); const m = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(h)[1];
  assert.ok(m.includes('class="hero wrap"') && m.includes('id="how"') && m.includes('class="final wrap"')); assert.ok(!/<header\b/i.test(m) && !/<footer\b/i.test(m));
  for (const w of ['Product', 'Platforms', 'Company']) assert.match(h, new RegExp('<h4 aria-level="3">' + w + '</h4>'));
  assert.equal((h.replace(/ aria-level="3"/g, '').match(/<h4>/g) || []).length, 3, 'NEGATIVE CONTROL: without the override they would be bare h4s again');
});
