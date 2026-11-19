// W-A1 (Sentinel advisory, keepitil-web#191): every Find My Weed page carries a strict meta Content-Security-Policy as the
// first tag of its head block, BEFORE any script, and nothing in the pages needs more than it allows. The source of the line is
// find-my-weed's tools/meta.js (the rebuild keeps it); this test holds keepitil-web's copy to the same rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, 'findmyweed');
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; font-src 'self'; " +
  "manifest-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'";
const pages = () => fs.readdirSync(DIR).filter((f) => f.endsWith('.html'));

function cspProblems(h) {
  const hd = h.slice(0, h.indexOf('</head>')), m = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(hd), out = [];
  if (!m) return ['no meta CSP'];
  if (m[1] !== CSP) out.push('not the strict policy');
  const s = hd.search(/<script\b/); if (s >= 0 && s < m.index) out.push('a script comes before the CSP');
  if (/unsafe-inline|unsafe-eval|https?:|\*/.test(m[1])) out.push('the policy allows inline, eval or another host');
  return out;
}

test('W-A1: every findmyweed/ page has the strict meta CSP before any script', () => {
  assert.ok(pages().length >= 6);
  for (const f of pages()) assert.deepEqual(cspProblems(fs.readFileSync(path.join(DIR, f), 'utf8')), [], f);
});

test('W-A1: nothing in the pages needs more than the policy allows (no inline script / style, no handlers, no other host)', () => {
  for (const f of pages()) {
    const h = fs.readFileSync(path.join(DIR, f), 'utf8');
    assert.doesNotMatch(h, /<script(?![^>]*\bsrc=)[^>]*>|<style\b|\sstyle="|\son[a-z]+="/i, f + ': nothing inline');
    for (const m of h.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)="([^"]+)"/g)) assert.doesNotMatch(m[1], /^(https?:)?\/\//, f + ' loads only from its own origin: ' + m[1]);
  }
  for (const f of fs.readdirSync(path.join(DIR, 'js'))) {
    const js = fs.readFileSync(path.join(DIR, 'js', f), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(js, /\beval\(|new Function\(|innerHTML\s*=|insertAdjacentHTML|document\.write/, 'js/' + f + ': nothing the CSP would block');
  }
});

test('W-A1 NEGATIVE CONTROLS: a missing, weakened or late CSP is caught', () => {
  const h = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8'), tag = /<meta http-equiv="Content-Security-Policy" content="[^"]*">\r?\n?/;
  assert.deepEqual(cspProblems(h.replace(tag, '')), ['no meta CSP']);
  assert.ok(cspProblems(h.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")).length > 0);
  assert.ok(cspProblems(h.replace(tag, '').replace('</head>', '<meta http-equiv="Content-Security-Policy" content="' + CSP + '">\n</head>')).includes('a script comes before the CSP'));
});
