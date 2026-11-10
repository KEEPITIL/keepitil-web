import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import test from 'node:test';

// SHEET_OPTIN_FILE lets the negative control point this suite at an unmodified copy.
const file = process.env.SHEET_OPTIN_FILE || new URL('../../connect/index.html', import.meta.url);
const html = readFileSync(file, 'utf8');
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1UU2rPPwsIRCFnZBgk6Uzb9IRcckcBmvYVORNVMFtIoo/gviz/tq?sheet=Untitled&headers=1&tqx=out:json';

function iifeSource() {
  const start = html.indexOf('LIVE DIRECTORY: pull from Google Sheet master');
  assert.ok(start > 0, 'sheet IIFE marker present');
  const open = html.indexOf('(function(){', start);
  const end = html.indexOf('/* ---- LIVE DB PROFILES', open);
  assert.ok(open > 0 && end > open, 'IIFE bounds found');
  return html.slice(open, end);
}

function run(search, fetchImpl) {
  const calls = [];
  const rejections = [];
  const onRej = (e) => rejections.push(e);
  process.on('unhandledRejection', onRej);
  const el = () => ({ textContent: '' });
  const ctx = {
    fetch: (u) => { calls.push(String(u)); return fetchImpl(u); },
    location: { search },
    DATA: [{ name: 'builtin' }], cA: el(), cB: el(), cO: el(), cV: el(),
    cnt: () => 0, renderSubs() {}, render() {},
    JSON, String, parseFloat, Promise,
  };
  vm.createContext(ctx);
  vm.runInContext(iifeSource(), ctx);
  return new Promise((resolve) => setTimeout(() => {
    process.off('unhandledRejection', onRej);
    resolve({ calls, rejections, ctx });
  }, 30));
}

const failing = () => Promise.reject(new TypeError('Failed to fetch'));
const okSheet = () => Promise.resolve({ text: () => Promise.resolve(
  'google.visualization.Query.setResponse(' + JSON.stringify({ table: { rows: [
    { c: [{ v: 1 }, { v: 'artist' }, { v: 'Sheet Person' }] } ] } }) + ');') });

test('static: every fetch(TQ is gated by the explicit ?sheet=1 check', () => {
  const lines = html.split(/\r?\n/).filter((l) => l.includes('fetch(TQ'));
  assert.ok(lines.length >= 1, 'fetch(TQ call still present (code kept)');
  for (const l of lines) {
    assert.match(l, /^\s*if\(\/\[\?&\]sheet=1\(\?:&\|\$\)\/\.test\(location\.search\)\)\s*fetch\(TQ/, 'unconditional fetch(TQ: ' + l.trim());
  }
});

test('behaviour: default (no flag) makes zero requests to docs.google.com', async () => {
  const r = await run('', okSheet);
  assert.equal(r.calls.length, 0, 'fetch calls: ' + r.calls.join(','));
  assert.equal(r.ctx.DATA[0].name, 'builtin', 'built-in roster untouched');
});

test('behaviour: unrelated query strings and sheet=0 stay off', async () => {
  for (const s of ['?x=1', '?sheet=0', '?sheet=10', '?mysheet=1']) {
    const r = await run(s, okSheet);
    assert.equal(r.calls.length, 0, s);
  }
});

test('behaviour: ?sheet=1 fetches the sheet exactly once and maps rows', async () => {
  for (const s of ['?sheet=1', '?a=b&sheet=1', '?sheet=1&a=b']) {
    const r = await run(s, okSheet);
    assert.deepEqual(r.calls, [SHEET_URL], s);
    assert.equal(r.ctx.DATA[0].name, 'Sheet Person', 'mapping code intact');
  }
});

test('behaviour: ?sheet=1 with failing fetch does not throw or leave an unhandled rejection', async () => {
  const r = await run('?sheet=1', failing);
  assert.equal(r.calls.length, 1);
  assert.equal(r.rejections.length, 0);
  assert.equal(r.ctx.DATA[0].name, 'builtin', 'falls back to built-in roster');
});
