// Guards initWidget() in keepitil-radio.js against a missing or detached SoundCloud frame.
// Whole radio file cannot run in a vm without a full DOM, so initWidget's source is sliced out of
// the file and evaluated against a fake SC / frame. KIL_RADIO_FILE lets a different copy of the
// file (e.g. unfixed origin/main) be tested, which is how the negative control is run.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.env.KIL_RADIO_FILE || path.join(here, 'keepitil-radio.js');
const src = fs.readFileSync(file, 'latin1');

const start = src.indexOf('function initWidget(){');
const end = src.indexOf('/* The SoundCloud API script is deferred');
assert.ok(start > 0 && end > start, 'initWidget source not found');
const initSrc = src.slice(start, end);

function run({ frame, withSC = true, widgetThrows = false }) {
  const calls = { widget: 0, bind: [] };
  const fakeWidget = { bind(ev) { calls.bind.push(ev); } };
  const SC = {
    Widget: Object.assign(function (el) {
      calls.widget++;
      if (widgetThrows) throw new TypeError("Cannot read properties of null (reading 'postMessage')");
      return fakeWidget;
    }, { Events: { READY: 'ready', PLAY: 'play', PLAY_PROGRESS: 'playProgress', PAUSE: 'pause', FINISH: 'finish', ERROR: 'error' } })
  };
  const ctx = { window: withSC ? { SC } : {}, SC, frame, widget: undefined, widgetReady: true };
  vm.createContext(ctx);
  vm.runInContext(initSrc + '\nthis.__init = initWidget;', ctx);
  ctx.__init();
  return { calls, ctx, fakeWidget };
}

test('null frame: does not throw and does not call SC.Widget', () => {
  const r = run({ frame: null });
  assert.equal(r.calls.widget, 0);
  assert.equal(r.calls.bind.length, 0);
});

test('detached frame (no contentWindow): does not throw and does not call SC.Widget', () => {
  const r = run({ frame: { id: 'kil-sc', contentWindow: null } });
  assert.equal(r.calls.widget, 0);
  assert.equal(r.calls.bind.length, 0);
});

test('window.SC absent: returns without calling anything', () => {
  const r = run({ frame: { contentWindow: {} }, withSC: false });
  assert.equal(r.calls.widget, 0);
});

test('valid frame: SC.Widget called once and all six events bound, as before', () => {
  const frame = { id: 'kil-sc', contentWindow: {} };
  const r = run({ frame });
  assert.equal(r.calls.widget, 1);
  assert.deepEqual(r.calls.bind, ['ready', 'play', 'playProgress', 'pause', 'finish', 'error']);
  assert.equal(r.ctx.widget, r.fakeWidget);
});

test('SC.Widget throwing on an apparently valid frame fails quietly and leaves widget null', () => {
  const r = run({ frame: { contentWindow: {} }, widgetThrows: true });
  assert.equal(r.calls.widget, 1);
  assert.equal(r.ctx.widget, null);
  assert.equal(r.ctx.widgetReady, false);
});

test('source: __kilRadioAttach still reaches initWidget on both paths', () => {
  assert.ok(/window\.__kilRadioAttach\s*=\s*function\(el\)\{[\s\S]*?if\(window\.SC\)\{ initWidget\(\); return; \}[\s\S]*?scApi\.onload=initWidget;/.test(src));
});
