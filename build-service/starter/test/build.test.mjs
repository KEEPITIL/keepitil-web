import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render } from '../build.mjs';

const site = JSON.parse(readFileSync(new URL('../site.json', import.meta.url), 'utf8'));
const pages = render(site);

test('renders the four pages', () => {
  assert.deepEqual(Object.keys(pages).sort(), ['about.html', 'contact.html', 'index.html', 'services.html']);
});
test('content comes from site.json', () => {
  assert.match(pages['index.html'], new RegExp(site.home.headline));
  assert.match(pages['services.html'], new RegExp(site.services.items[0].title));
  assert.match(pages['contact.html'], new RegExp(site.contact.email));
});
test('no scripts, no external requests, no trackers', () => {
  for (const [f, html] of Object.entries(pages)) {
    assert.doesNotMatch(html, /<script/i, f);
    assert.doesNotMatch(html, /googletagmanager|google-analytics|clarity\.ms|facebook\.net|fonts\.googleapis/i, f);
    assert.doesNotMatch(html, /(src|href)="https?:\/\/(?!example\.com)/i, f);
  }
});
test('escapes content and drops javascript: links', () => {
  const evil = structuredClone(site);
  evil.home.headline = '<img src=x onerror=alert(1)>';
  evil.home.cta.href = 'javascript:alert(1)';
  const html = render(evil)['index.html'];
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /javascript:/);
});
test('bad theme colour falls back instead of injecting CSS', () => {
  const evil = structuredClone(site);
  evil.theme.brand = 'red;}body{display:none';
  assert.match(render(evil)['index.html'], /--brand:#00b4ff/);
});
test('marks the current page in the nav', () => {
  assert.match(pages['about.html'], /href="about.html" aria-current="page"/);
});
