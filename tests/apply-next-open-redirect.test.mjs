// tests/apply-next-open-redirect.test.mjs  (run: node --test tests/apply-next-open-redirect.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function kilNext(search) {
  const src = readFileSync('apply.html', 'utf8');
  const start = src.indexOf('function kilNext()');
  assert.ok(start >= 0, 'kilNext() not found in apply.html');
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  const ctx = vm.createContext({ URLSearchParams, decodeURIComponent, location: { search } });
  vm.runInContext(src.slice(start, i + 1) + '\nthis.f = kilNext;', ctx);
  return ctx.f();
}
const lands = (r) => new URL(r, 'https://keepitil.com/apply').origin;

test('?next= with a backslash or a URL-stripped control character is refused', () => {
  for (const n of ['/\\evil.example', '/%5Cevil.example', '/%09/evil.example', '/%0a/evil.example', '/%0d/evil.example', '/\t/evil.example', '/\u0000/evil.example']) {
    for (const search of ['?next=' + encodeURIComponent(n), '?next=' + n]) {
      const r = kilNext(search);
      assert.equal(r, '', JSON.stringify(n) + ' must be refused, got ' + JSON.stringify(r) + (r ? ' which lands on ' + lands(r) : ''));
    }
  }
});

test('?next= still returns same-site paths and refuses // and absolute URLs', () => {
  assert.equal(kilNext('?next=' + encodeURIComponent('/connect/?c=house')), '/connect/?c=house');
  assert.equal(kilNext('?next=%2Fevent%3Fe%3Dwarehouse-night'), '/event?e=warehouse-night');
  assert.equal(kilNext('?next=' + encodeURIComponent('//evil.example')), '');
  assert.equal(kilNext('?next=' + encodeURIComponent('https://evil.example')), '');
});

test('control: the check really detects the bug (a kilNext without the new line returns an evil path)', () => {
  const old = (s) => { const n = decodeURIComponent(new URLSearchParams(s).get('next') || ''); return n.charAt(0) !== '/' || n.charAt(1) === '/' ? '' : n; };
  assert.equal(lands(old('?next=%2F%5Cevil.example')), 'https://evil.example');
  assert.equal(lands(old('?next=%2F%09%2Fevil.example')), 'https://evil.example');
});
