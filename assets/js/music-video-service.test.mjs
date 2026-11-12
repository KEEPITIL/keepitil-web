// Tests for the music video service page (job 19a, corrections job 28).
// Run with: node --test assets/js/music-video-service.test.mjs
// Static HTML parsing + the pure helpers of music-video-service.js evaluated in a vm (no jsdom, no network).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const html = rd('services/music-video/index.html');
const svc = rd('assets/js/music-video-service.js');
const cfg = rd('assets/js/music-video-config.js');
const text = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

function loadApi() {
  const sandbox = { module: { exports: {} }, window: {}, globalThis: {} };
  vm.createContext(sandbox);
  vm.runInContext(svc, sandbox);
  return sandbox.module.exports;
}
const api = loadApi();

function tierBlock(id) {
  const m = html.match(new RegExp('<article class="offer" data-tier="' + id + '">[\\s\\S]*?</article>'));
  assert.ok(m, 'tier ' + id);
  return text(m[0]);
}

test('three tiers with exact inclusions and time caps', () => {
  const hook = tierBlock('hook');
  for (const s of ['One 30–45s vertical 1080×1920 teaser', '1–3 supplied or reused scenes', 'Beat cuts, captions and 1 cover still',
    'One correction of our mistakes', 'No new custom character design', 'No concept revision', 'Time cap: 8 min active work']) assert.ok(hook.includes(s), s);
  const lyric = tierBlock('lyric_cut');
  for (const s of ['One song up to 4 min', 'One vertical full video', 'Up to 6 client-owned or reusable images', '2 stills',
    'One consolidated text and timing correction', 'No bespoke story', 'No new character set', 'Time cap: 25 min active work']) assert.ok(lyric.includes(s), s);
  const story = tierBlock('character_story');
  for (const s of ['one 30–45s cutdown', '1–2 original adult characters', 'Up to 9 scene artworks (14–18 shots)', 'reference sheet',
    '4 stills', 'One storyboard approval before render', 'One correction', 'Time cap: 40 min active work']) assert.ok(story.includes(s), s);
  assert.equal((html.match(/<article class="offer"/g) || []).length, 3);
});

test('prices are hidden in the default build (flag false, no dollar amounts in HTML or meta)', () => {
  assert.match(cfg, /KIL_MV_PRICES_LIVE\s*=\s*false/);
  assert.match(cfg, /KIL_MV_SUBMIT_MODE\s*=\s*'mailto'/);
  assert.doesNotMatch(html, /\$\s?\d/);
  assert.equal((html.match(/Pricing confirmed soon: request a quote/g) || []).length, 3);
  for (const id of ['hook', 'lyric_cut', 'character_story']) assert.equal(api.priceLabel(id, false), 'Pricing confirmed soon: request a quote');
  const els = ['hook', 'lyric_cut', 'character_story'].map((t) => ({ dataset: { tierPrice: t }, textContent: '' }));
  api.applyPrices(els, api.pricesLive({ KIL_MV_PRICES_LIVE: false }));
  assert.ok(els.every((e) => !/\$/.test(e.textContent)));
});

test('prices show only when the flag is exactly true', () => {
  assert.equal(api.pricesLive({ KIL_MV_PRICES_LIVE: 'true' }), false);
  assert.equal(api.pricesLive({}), false);
  assert.equal(api.pricesLive({ KIL_MV_PRICES_LIVE: true }), true);
  const els = ['hook', 'lyric_cut', 'character_story'].map((t) => ({ dataset: { tierPrice: t }, textContent: '' }));
  api.applyPrices(els, true);
  assert.deepEqual(els.map((e) => e.textContent), ['$4', '$14', '$24']);
});

test('noindex and not referenced from nav, footer, sitemap, robots, other pages', () => {
  assert.match(html, /<meta name="robots" content="noindex,nofollow"\/?>/);
  assert.doesNotMatch(html, /rel="canonical"/);
  assert.doesNotMatch(rd('sitemap.xml'), /music-video/);
  assert.doesNotMatch(rd('robots.txt'), /music-video/);
  for (const f of ['index.html', 'services/index.html', 'keepitil-shell.js', 'assets/js/keepitil-ai.js', 'connect/index.html', 'culture/index.html', 'earn/index.html']) {
    assert.doesNotMatch(rd(f), /music-video/, f);
  }
});

test('form: consent + required attestation + honeypot, no payment or file inputs', () => {
  assert.match(html, /<input id="mv-attest" name="attest" type="checkbox" required/);
  assert.match(html, /<input id="mv-consent" name="consent" type="checkbox" required/);
  assert.match(html, /name="company_site"/);
  assert.doesNotMatch(html, /type="file"/i);
  assert.doesNotMatch(html, /stripe|card-?number|cc-number|cvc|name="payment/i);
  const att = text(html.match(/<label for="mv-attest">([\s\S]*?)<\/label>/)[1]).trim();
  assert.equal(att, api.ATTEST_TEXT);
  for (const w of ['master', 'composition', 'lyrics', 'face', 'logo', 'artwork']) assert.ok(api.ATTEST_TEXT.includes(w), w);
  const cons = text(html.match(/<label for="mv-consent">([\s\S]*?)<\/label>/)[1]).trim();
  assert.equal(cons, api.CONSENT_TEXT);
});

test('validation requires consent and attestation; mailto targets info@keepitil.com', () => {
  const good = { name: 'A', email: 'a@b.co', tier: 'hook', song: 'S', link: 'https://x.example/s', message: '', consent: true, attest: true };
  assert.equal(api.validate(good).ok, true);
  assert.ok(api.validate({ ...good, attest: false }).errors.attest);
  assert.ok(api.validate({ ...good, consent: false }).errors.consent);
  assert.ok(api.validate({ ...good, email: 'nope' }).errors.email);
  assert.ok(api.validate({ ...good, link: 'javascript:alert(1)' }).errors.link);
  assert.ok(api.validate({ ...good, tier: 'x' }).errors.tier);
  const m = api.buildMailto(good);
  assert.ok(m.startsWith('mailto:info@keepitil.com?subject='));
  assert.match(decodeURIComponent(m), /Rights confirmation: YES/);
  assert.doesNotMatch(decodeURIComponent(m), /\$\d/);
  assert.match(html, /action="mailto:info@keepitil\.com"/);
});

test('no external scripts, only same-origin ones; no analytics added', () => {
  const srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(srcs.length >= 2);
  for (const s of srcs) assert.ok(s.startsWith('/'), s);
  assert.doesNotMatch(html, /<script(?![^>]*\ssrc)[^>]*>/); // no inline scripts
  assert.doesNotMatch(html + svc, /gtag|googletagmanager|fbq\(|hotjar|localStorage|sessionStorage/i);
});

test('rpc path is off by default and needs explicit config', async () => {
  await assert.rejects(api.submitRpc({}, { tier: 'hook' }, () => { throw new Error('no network'); }), /rpc-not-configured/);
});

test('turnaround is "Quoted per project" with no day promise or timeframe', () => {
  const t = text(html) + ' ' + text(cfg);
  assert.ok(t.includes('Turnaround: Quoted per project.'));
  assert.equal((t.match(/Quoted per project/g) || []).length, 1);
  assert.doesNotMatch(t, /business day|\bdays?\b|3\s*[-–]\s*5|\brush\b|\bweeks?\b|\bhours?\b|within \d|next[- ]day/i);
  const readme = rd('docs/services/music-video/README.md');
  assert.doesNotMatch(readme, /business[- ]day|3\s*[-–]\s*5|\brush\b/i);
});

test('license/usage terms are a marked placeholder, with no legal-term language', () => {
  assert.ok(text(html).includes('License and usage terms: pending legal review.'));
  assert.match(html, /data-legal-placeholder/);
  const all = text(html) + ' ' + svc;
  assert.doesNotMatch(all, /indemnif|perpetual|exclusive license|royalt|sublicens|irrevocable|warrant(y|ies)|liabilit|governing law|content id|platform clearance|grants? no rights/i);
  assert.ok(!/review status|copy reviewer|sentinel|muse/i.test(text(html)), 'review status must not be on the public page');
});

test('sample is a self-hosted <video data-sample-src> with a poster; no third-party embeds', () => {
  const m = html.match(/<video[^>]*data-sample-src=""[^>]*>/);
  assert.ok(m, 'video element with empty data-sample-src');
  assert.match(m[0], /poster="\/assets\/images\//);
  assert.match(m[0], /\shidden/);
  assert.doesNotMatch(html + svc + cfg, /<iframe|<embed|<object|youtube|youtu\.be|vimeo|soundcloud|spotify|tiktok/i);
  assert.equal(api.sampleSrcOk('/assets/video/music-video/x.mp4'), true);
  assert.equal(api.sampleSrcOk('https://abc.supabase.co/storage/v1/object/public/public-assets/x.mp4'), true);
  for (const bad of ['', 'https://www.youtube.com/watch?v=1', 'https://vimeo.com/1', '//evil.example/x.mp4', 'https://evil.example/x.mp4', 'javascript:alert(1)', '/x.html']) assert.equal(api.sampleSrcOk(bad), false, bad);
  assert.ok(!fs.existsSync(path.join(ROOT, 'assets/video/music-video/vhs-hearts-v2-teaser.mp4')));
});

test('page makes no claim about tracking (the site shell, not this page, owns analytics)', () => {
  assert.doesNotMatch(text(html), /no tracking|tracking[- ]free|no analytics|no cookies/i);
});

test('KEEPITIL branding matches the services page shell pattern', () => {
  assert.match(html, /<title>Music Video Service \| KEEPITIL<\/title>/);
  assert.match(html, /<a class="nav-logo" href="\/"><span class="nav-brand">KEEPITIL<\/span><\/a>/);
  assert.match(rd('services/index.html'), /<a class="nav-logo" href="\/"><span class="nav-brand">KEEPITIL<\/span><\/a>/);
  assert.doesNotMatch(text(html), /ffmpeg|make_story_video|midjourney|dall-?e|stable diffusion|runway|sora|veo\b|suno/i);
});
