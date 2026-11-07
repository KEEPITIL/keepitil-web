import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shell = readFileSync(new URL('../keepitil-shell.js', import.meta.url), 'utf8');

function take(startMark, endMark) {
  const start = shell.indexOf(startMark);
  const end = shell.indexOf(endMark);
  assert.ok(start !== -1 && end > start, startMark);
  const code = shell.slice(start + startMark.length, end);
  return new Function(`${code}\nreturn ${code.match(/function\s+(__kil\w+)/)[1]};`)();
}

const pageSkip = take('/* @kil-cf-page-skip */', '/* @kil-cf-page-skip-end */');
const tokenSkip = take('/* @kil-cf-token-skip */', '/* @kil-cf-token-skip-end */');

const web = { protocol: 'https:', pathname: '/shop/', search: '', view: '', pageType: '' };

test('GA4 and Clarity are not loaded by the shell', () => {
  assert.doesNotMatch(shell, /googletagmanager|google-analytics|G-ZR36NRE4MT|clarity\.ms|xk5iwishve|__kilGA4|__kilClarity/i);
  assert.doesNotMatch(shell, /window\.gtag\s*=/);
  assert.doesNotMatch(shell, /gtag\(/);
});

test('a placeholder Cloudflare token is skipped and a real token is not', () => {
  assert.equal(tokenSkip('{"token": "TODO_CF_TOKEN"}'), true);
  assert.equal(tokenSkip(''), true);
  assert.equal(tokenSkip('not-json'), true);
  assert.equal(tokenSkip('{"token": ""}'), true);
  assert.equal(tokenSkip('{"token": "abc123public"}'), false);
});

test('checkout, ticket, account, profile edit, and the app wrapper skip the beacon', () => {
  assert.equal(pageSkip(web), false);
  assert.equal(pageSkip({ ...web, pathname: '/tickets' }), true);
  assert.equal(pageSkip({ ...web, pathname: '/tickets.html' }), true);
  assert.equal(pageSkip({ ...web, pathname: '/ticket' }), true);
  assert.equal(pageSkip({ ...web, pathname: '/checkout' }), true);
  assert.equal(pageSkip({ ...web, pathname: '/scan' }), true);
  assert.equal(pageSkip({ ...web, pathname: '/settings' }), true);
  assert.equal(pageSkip({ ...web, pathname: '/dashboard.html' }), true);
  assert.equal(pageSkip({ ...web, pathname: '/account' }), true);
  assert.equal(pageSkip({ ...web, pathname: '/profile-edit' }), true);
  assert.equal(pageSkip({ ...web, pathname: '/profile', view: 'owner' }), true);
  assert.equal(pageSkip({ ...web, pathname: '/profile', search: '?slug=groove-trooper' }), true);
  assert.equal(pageSkip({ ...web, pathname: '/profile', view: 'public', search: '?slug=groove-trooper' }), false);
  assert.equal(pageSkip({ ...web, pathname: '/profile', search: '?slug=groove-trooper&view=public' }), false);
  assert.equal(pageSkip({ ...web, pathname: '/ticket-terms' }), false);
  assert.equal(pageSkip({ ...web, pageType: 'checkout' }), true);
  assert.equal(pageSkip({ ...web, pageType: 'profile-edit' }), true);
  assert.equal(pageSkip({ ...web, protocol: 'capacitor:' }), true);
  assert.equal(pageSkip({ ...web, protocol: 'file:' }), true);
  assert.equal(pageSkip({ ...web, wrapped: true }), true);
  assert.equal(pageSkip({ ...web, nativeApp: true }), true);
  assert.equal(pageSkip({ ...web, userAgent: 'Mozilla/5.0 KeepitilApp/1' }), true);
  assert.equal(pageSkip({ ...web, pathname: '/profile', view: 'public', userAgent: 'Mozilla/5.0 KeepitilApp/1' }), true);
});

test('gtag is not dispatched by the click or feedback scripts', () => {
  const clicks = readFileSync(new URL('../assets/js/kt-analytics.js', import.meta.url), 'utf8');
  const feedback = readFileSync(new URL('../assets/js/keepitil-feedback.js', import.meta.url), 'utf8');
  assert.doesNotMatch(clicks, /window\.gtag|dataLayer\.push|gtag\(/);
  assert.doesNotMatch(feedback, /gtag\(/);
});
