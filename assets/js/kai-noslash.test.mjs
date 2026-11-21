// Joe 2026-11-20: https://keepitil.com/app/kaitarako (no trailing slash) must be the Kai Tarako web app with a 200,
// not a 301 to /app/kaitarako/. Pages serves app/kaitarako.html at /app/kaitarako, so that file must be the
// current app/kaitarako/index.html plus a <base href="/app/kaitarako/"> as the first child of <head>.
// Same for app/kaitarako/support.html. If this fails after a Kai deploy: node scripts/kai-noslash.mjs
// Run: node --test assets/js/kai-noslash.test.mjs   (KAI_NOSLASH_ROOT overrides the repo root, for negative controls)
// Deliberately does not import scripts/kai-noslash.mjs: the check is written independently of the generator.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KAI_NOSLASH_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const PAGES = [
  { copy: 'app/kaitarako.html', index: 'app/kaitarako/index.html', href: '/app/kaitarako/' },
  { copy: 'app/kaitarako/support.html', index: 'app/kaitarako/support/index.html', href: '/app/kaitarako/support/' },
];

for (const p of PAGES) {
  test(`${p.copy} exists`, () => assert.ok(fs.existsSync(path.join(ROOT, p.copy)), `${p.copy} missing`));

  test(`${p.copy}: first child of <head> is <base href="${p.href}">`, () => {
    const html = read(p.copy);
    const m = /<head>\s*(<[^>]*>)/i.exec(html);
    assert.ok(m, 'no <head> element');
    const first = m[1];
    assert.match(first, /^<base\b/i, `first element in <head> is ${first}`);
    const href = /\bhref\s*=\s*"([^"]*)"/i.exec(first);
    assert.equal(href && href[1], p.href);
    assert.equal((html.match(/<base\b/gi) || []).length, 1, 'exactly one <base>');
    // CSP has base-uri 'none': a <base> after the CSP meta would be ignored, so it must precede it.
    const csp = html.search(/Content-Security-Policy/i);
    if (csp >= 0) assert.ok(html.indexOf('<base') < csp, '<base> must come before the CSP meta');
  });

  test(`${p.copy}: everything except the <base> line is byte-identical to ${p.index}`, () => {
    const copy = fs.readFileSync(path.join(ROOT, p.copy));
    const index = fs.readFileSync(path.join(ROOT, p.index));
    const line = Buffer.from(`\n<base href="${p.href}" />`);
    const at = index.indexOf('<head>') + '<head>'.length;
    assert.ok(at >= '<head>'.length, `${p.index} has no <head>`);
    const expected = Buffer.concat([index.subarray(0, at), line, index.subarray(at)]);
    assert.ok(copy.equals(expected), `${p.copy} is stale or edited by hand; regenerate with: node scripts/kai-noslash.mjs`);
  });
}
