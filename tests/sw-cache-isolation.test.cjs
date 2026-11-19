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

test('root worker never caches or answers /games/kai/ (Kai Tarako web build: pages, navigations, assets, its own sw.js)', () => {
  const worker = createWorker();
  const fetchHandler = worker.handlers.get('fetch');
  const intercepted = (route, mode) => {
    let hit = false;
    fetchHandler({ request: { method: 'GET', url: 'https://keepitil.com' + route, mode }, respondWith() { hit = true; } });
    return hit;
  };
  for (const route of [
    '/games/kai/', '/games/kai/index.html', '/games/kai/privacy.html', '/games/kai/licenses.html',
    '/games/kai/sw.js', '/games/kai/manifest.webmanifest', '/games/kai/frame-guard.js',
    '/games/kai/assets/index-abc123.js', '/games/kai/assets/index-abc123.css', '/games/kai/brand/logo.png',
    '/games/kai/mascot/kai-hero.svg', '/games/kai/icon-192.png',
  ]) {
    assert.equal(intercepted(route, 'navigate'), false, 'root intercepted navigation ' + route);
    assert.equal(intercepted(route, 'no-cors'), false, 'root intercepted ' + route);
  }
  // NEGATIVE CONTROLS: the /games hub and any main-site page next to the folder are still the root's
  // (no /games/kai marketing page exists today; a bare /games/kai without the slash is the root's too).
  for (const route of ['/games/', '/games/index.html', '/games/kai', '/games/kai.html', '/games-kai.html']) {
    assert.equal(intercepted(route, 'navigate'), true, 'root no longer handles ' + route);
  }
  assert.equal(intercepted('/games-kai/app.js', 'no-cors'), true, 'a look-alike path outside /games/ is still the root\'s');
});

test('activation never deletes a Kai Tarako cache (kai-tarako-<build>), at /app/kaitarako/ or /games/kai/', async () => {
  const kai = ['kai-tarako-426837e6f54f', 'kai-tarako-0123456789ab'];
  const worker = createWorker(['kil-pwa-v104', ...kai]);
  let activation;
  worker.handlers.get('activate')({ waitUntil(p) { activation = p; } });
  await activation;
  assert.deepEqual(worker.deleted, ['kil-pwa-v104']);
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
