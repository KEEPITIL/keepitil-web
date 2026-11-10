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
    'kil-pwa-v105-20260912b', 'kil-pages-v42', 'kil-assets-v41', 'kil-code-v85',
  ];
  const otherApps = [
    'kwars-v88', 'kwars1-v88', 'tuitea-release-20261023',
    'kai-tarako-v5', 'kmob-cache-v1', 'kode-cache-v1',
    'future-game-cache', 'unrelated-decoy-cache',
  ];
  const worker = createWorker([...current, ...otherApps, 'kil-code-v84', 'kil-pwa-v104']);
  let activation;
  worker.handlers.get('activate')({ waitUntil(p) { activation = p; } });
  await activation;
  assert.deepEqual(worker.deleted.sort(), ['kil-code-v84', 'kil-pwa-v104']);
});

test('root worker does not intercept isolated app requests', () => {
  const worker = createWorker();
  for (const route of [
    '/games/kwars/index.html',
    '/games/kmob/index.html',
    '/kode/index.html',
    '/app/tuitea/index.html',
    '/app/kaitarako/assets/index-123.js',
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
