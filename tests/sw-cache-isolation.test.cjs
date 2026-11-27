'use strict';

// Run without dependencies: node --test tests/sw-cache-isolation.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
function createWorker(initialCaches = []) {
  const handlers = new Map();
  const deleted = [];
  const self = {
    location: { origin: 'https://keepitil.com' },
    clients: { claim: async () => {} },
    addEventListener(name, handler) { handlers.set(name, handler); },
    skipWaiting: async () => {},
  };
  const caches = {
    keys: async () => initialCaches,
    delete: async name => { deleted.push(name); return true; },
    open: async () => ({ addAll: async () => [], put: async () => {} }),
    match: async () => undefined,
  };
  vm.runInNewContext(source, {
    self, caches, URL, Promise,
    fetch: async () => ({ ok: false }),
  }, { filename: 'sw.js' });
  return { handlers, deleted };
}

test('activation only removes obsolete main-site kil-* caches', async () => {
  const current = [
    'kil-pwa-v112-20261127a', 'kil-pages-v49', 'kil-assets-v42', 'kil-code-v92',
  ];
  const otherApps = [
    'kwars-v88', 'kwars1-v88', 'tuitea-release-20261023',
    'kai-tarako-v5', 'kmob-cache-v1', 'kode-cache-v1',
    'future-game-cache', 'unrelated-decoy-cache',
  ];
  const worker = createWorker([...current, ...otherApps, 'kil-code-v88', 'kil-code-v89', 'kil-pages-v45', 'kil-pages-v46', 'kil-pwa-v108-20261120c', 'kil-pwa-v109-20261121a', 'kil-pwa-v110-20261121a', 'kil-pwa-v111-20261125a', 'kil-pages-v47', 'kil-assets-v41', 'kil-code-v90', 'kil-pages-v48', 'kil-code-v91'].sort());
  let activation;
  worker.handlers.get('activate')({ waitUntil(p) { activation = p; } });
  await activation;
  assert.deepEqual(worker.deleted.sort(), ['kil-code-v88', 'kil-code-v89', 'kil-pages-v45', 'kil-pages-v46', 'kil-pwa-v108-20261120c', 'kil-pwa-v109-20261121a', 'kil-pwa-v110-20261121a', 'kil-pwa-v111-20261125a', 'kil-pages-v47', 'kil-assets-v41', 'kil-code-v90', 'kil-pages-v48', 'kil-code-v91'].sort());
});

test('root worker does not intercept isolated app requests', () => {
  const worker = createWorker();
  for (const route of [
    '/games/kwars/index.html',
    '/games/kmob/index.html',
    '/kode/index.html',
    '/app/tuitea/index.html',
    '/app/kaitarako/assets/index-123.js',
    '/app/findmyweed/',
    '/app/findmyweed/js/fmw.js',
  ]) {
    let intercepted = false;
    worker.handlers.get('fetch')({
      request: { method: 'GET', url: 'https://keepitil.com' + route },
      respondWith() { intercepted = true; },
    });
    assert.equal(intercepted, false, 'root intercepted ' + route);
  }
});

test('root still handles its own JavaScript requests', async () => {
  const worker = createWorker();
  let responded;
  worker.handlers.get('fetch')({
    request: { method: 'GET', url: 'https://keepitil.com/keepitil-shell.js' },
    respondWith(p) { responded = p; },
  });
  assert.ok(responded && typeof responded.then === 'function');
  await responded;
});

test('cache names: PAGES and CODE changed for the shell restamp, and the name is the one KEEP and every caches.open uses (no stale literal anywhere)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const names = (s) => ({ pages: (s.match(/var PAGES = '([^']+)'/) || [])[1], code: (s.match(/var CODE = '([^']+)'/) || [])[1] });
  const n = names(src);
  assert.equal(n.pages, 'kil-pages-v49'); assert.equal(n.code, 'kil-code-v92');
  assert.notEqual(n.pages, 'kil-pages-v48'); assert.notEqual(n.code, 'kil-code-v91');
  assert.match(src, /var KEEP = \[VERSION, PAGES, ASSETS, CODE\];/);
  assert.deepEqual([...src.matchAll(/caches\.open\(([A-Za-z_]+)\)/g)].map((m) => m[1]).filter((v) => !['VERSION', 'PAGES', 'ASSETS', 'CODE'].includes(v)), [], 'every caches.open uses a named constant');
  assert.ok(!/kil-pages-v4[0-8]'|kil-code-v(?:8\d|9[01])'/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'no old cache name outside comments');
  assert.ok(!/cache\.add\([^)]*shell|cache\.add\([^)]*\.html/i.test(src), 'install does not fetch the shell or page HTML (so no HTTP-cache staleness at install)');
});
test('NEGATIVE CONTROL: the previous names (v48 / v91) would be flagged, and an install that precaches the shell would be', () => {
  const old = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8').replace("kil-pages-v49", "kil-pages-v48").replace("kil-code-v92", "kil-code-v91");
  assert.match(old, /var PAGES = 'kil-pages-v48'/); assert.match(old, /var CODE = 'kil-code-v91'/);
  assert.ok(/cache\.add\([^)]*shell/i.test("cache.add('/keepitil-shell.js')"));
});
