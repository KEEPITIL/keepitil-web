'use strict';
// Run: node --test tests/event-seller-link.test.cjs
// Grok 2026-11-24 (b): event pages said "KEEPITIL links to the official seller" but had no link. They now carry a plain outbound link to the listing's own address
// (source_url): http(s) only, no checkout, no payment. Skipped when the page already has the same address as its Buy Tickets button.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..');
const PAGES = ['event.html', ...fs.readdirSync(path.join(root, 'event'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => 'event/' + e.name + '/index.html').filter((p) => fs.existsSync(path.join(root, p)))];
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');   // the same escaper the page defines
function fnSource(html) { const a = html.indexOf('function sellerLinkHtml('); assert.ok(a > 0, 'sellerLinkHtml exists'); const b = html.indexOf('\n  }\n', a); return html.slice(a, b + 4); }
// the page declares its OWN `const URL = '<supabase address>'`, so the browser's constructor is only reachable as window.URL: the sandbox does the same (a bare URL here is a string)
const load = (html) => vm.runInNewContext('(' + fnSource(html).replace(/^function sellerLinkHtml/, 'function') + ')', { URL: 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co', window: { URL }, esc });

test('every event page (the template and all prerendered pages) carries the same function, the link in the About block, and the button style', () => {
  assert.ok(PAGES.length >= 11, 'template + 10 prerendered pages, got ' + PAGES.length);
  const ref = fnSource(read('event.html'));
  for (const p of PAGES) { const h = read(p); assert.equal(fnSource(h), ref, p + ': same function'); assert.match(h, /sellerLinkHtml\(row\.source_url, ev\.ticket\)/, p); assert.match(h, /\.ev-about \.seller\{/, p); }
});

test('an official-seller address becomes one outbound link: new tab, noopener noreferrer nofollow, www. dropped from the label', () => {
  const f = load(read('event.html'));
  const out = f('https://www.seatgeek.com/barbara-mason-tickets/long-beach/2026-11-28/123', '');
  assert.match(out, /^<a class="seller" href="https:\/\/www\.seatgeek\.com\/barbara-mason-tickets\/long-beach\/2026-11-28\/123" target="_blank" rel="noopener noreferrer nofollow">Tickets \/ info on seatgeek\.com &#8599;<\/a>$/);
  assert.match(f('http://ra.co/events/2348305', null), /Tickets \/ info on ra\.co/);
});

test('only http(s) addresses: javascript:, data:, ftp:, garbage, empty and missing give NO link; an address already used as the Buy Tickets button is not repeated', () => {
  const f = load(read('event.html'));
  for (const bad of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'ftp://x.com/a', 'not a url', '', null, undefined, '//evil.example/x']) assert.equal(f(bad, ''), '', String(bad));
  assert.equal(f('https://ra.co/events/1', 'https://ra.co/events/1'), '');
  assert.notEqual(f('https://ra.co/events/1', 'https://other.example/'), '');
});

test('the address cannot break out of the attribute or inject markup', () => {
  const f = load(read('event.html')), out = f('https://x.com/a"><script>alert(1)</script>', '');
  assert.doesNotMatch(out, /<script|"><|onerror/i); assert.equal((out.match(/<a /g) || []).length, 1);
});

test('NEGATIVE CONTROL: without the protocol check a javascript: address would be linked', () => {
  const broken = read('event.html').replace("if(u.protocol !== 'https:' && u.protocol !== 'http:') return '';", '');
  assert.notEqual(broken, read('event.html')); assert.match(load(broken)('javascript:alert(1)', ''), /javascript:alert/);
});

test('no checkout, payment or money word is added: the link block has no Stripe, price, buy or checkout', () => {
  const fn = fnSource(read('event.html')); assert.doesNotMatch(fn, /stripe|checkout|price|payment|\$\{/i);
});

test('the page\'s own const URL (a string) hides the browser URL: neither the source-line host nor the seller link may use a bare `new URL`', () => {
  for (const p of PAGES) {
    const h = read(p); assert.match(h, /const URL\s*=|var URL\s*=|let URL\s*=/, p + ': the page still declares its own URL (if this fails, the shadowing is gone and this guard can be relaxed)');
    assert.doesNotMatch(fnSource(h), /new URL\(/, p + ': sellerLinkHtml uses window.URL'); assert.match(h, /host = row\.source_url \? new window\.URL\(row\.source_url\)/, p + ': host line uses window.URL');
  }
});
