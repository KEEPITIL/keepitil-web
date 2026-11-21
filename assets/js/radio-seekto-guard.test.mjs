// Delayed SoundCloud widget calls must not outlive their iframe (Grok-approved draft 2026-11-20).
// Run: node --test assets/js/radio-seekto-guard.test.mjs
//
// LIVE ERROR (Android Chrome, 2 of 4 loads of https://keepitil.com/):
//   TypeError: Cannot read properties of null (reading 'postMessage')
//     at r.seekTo (w.soundcloud.com/player/api.js) at keepitil-radio.js?v=20261109a:1406
// epochSync() schedules seekTo 400ms after skip(); if #kil-sc is removed or replaced in that gap,
// SoundCloud's widget posts to a detached iframe whose contentWindow is null.
//
// METHOD: epochSync and the @kil-widget-guard block are sliced out of keepitil-radio.js and run in
// a vm against a fake widget that behaves like api.js (every call posts to el.contentWindow), with
// a timer queue the test drives by hand.
// NEGATIVE CONTROL: ORIGINAL_EPOCH is epochSync from main @ f86d225 (keepitil-radio.js:1393-1408)
// verbatim. Under the same removal it MUST throw the live error, which proves the harness can see it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, 'keepitil-radio.js'), 'latin1');

function slice(from, to) {
  const a = src.indexOf(from), b = src.indexOf(to, a + 1);
  assert.ok(a > 0 && b > a, 'markers not found: ' + from);
  return src.slice(a, b);
}
const GUARD = slice('/* @kil-widget-guard', '/* @end-kil-widget-guard */');
const EPOCH = slice('  function epochSync(){', '  function syncAndPlay(){');

const ORIGINAL_EPOCH = String.raw`  function epochSync(){
    widget.getSounds(function(sounds){
      if(!sounds||!sounds.length){widget.play();return;}
      var durations=[],totalMs=0;
      for(var i=0;i<sounds.length;i++){var d=sounds[i].duration||240000;durations.push(d);totalMs+=d;}
      var offset=(Date.now()-SYNC_EPOCH)%totalMs;
      var cumulative=0,trackIndex=0,trackOffset=0;
      for(var j=0;j<durations.length;j++){
        if(offset<cumulative+durations[j]){trackIndex=j;trackOffset=offset-cumulative;break;}
        cumulative+=durations[j];
      }
      widget.skip(trackIndex);widget.setVolume(0);
      setTimeout(function(){widget.seekTo(trackOffset);setTimeout(function(){widget.play();if(interacted)widget.setVolume(getVol());},200);},400);
    });
  }
`;

/* An iframe as the browser models it: removing it disconnects it and nulls contentWindow. */
function makeFrame(log, name) {
  const frame = {
    isConnected: true,
    contentWindow: { postMessage(msg) { log.push(name + ':' + msg); } },
    remove() { frame.isConnected = false; frame.contentWindow = null; },
  };
  return frame;
}
/* A widget the way api.js builds one: it keeps the element and posts to its contentWindow. */
function makeWidget(frame) {
  const post = (m) => frame.contentWindow.postMessage(m);
  return {
    getSounds(cb) { post('getSounds'); cb([{ duration: 200000 }, { duration: 300000 }]); },
    skip(i) { post('skip ' + i); },
    setVolume(v) { post('setVolume ' + v); },
    seekTo(ms) { post('seekTo ' + ms); },
    play() { post('play'); },
  };
}

function load(epochSrc, { guarded }) {
  const log = [];
  const timers = new Map();
  let seq = 0;
  const frame = makeFrame(log, 'f1');
  const ctx = {
    log, timers,
    setTimeout(fn, ms) { const id = ++seq; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    Date: { now: () => 250000 },          /* offset 250000 -> track 1, 50000ms in */
    SYNC_EPOCH: 0, interacted: true, getVol: () => 50,
    widget: makeWidget(frame), frame,
  };
  vm.createContext(ctx);
  vm.runInContext((guarded ? GUARD : '') + '\n' + epochSrc + '\nthis.__epoch = epochSync;', ctx);
  /* Fire every pending timer, including the ones they schedule, in order. */
  ctx.flush = () => {
    for (let n = 0; n < 100 && timers.size; n++) {
      const [id, t] = timers.entries().next().value;
      timers.delete(id);
      t.fn();
    }
  };
  return ctx;
}

test('NEGATIVE CONTROL: the original epochSync throws the live error when the iframe goes', () => {
  const c = load(ORIGINAL_EPOCH, { guarded: false });
  c.__epoch();
  c.frame.remove();
  assert.throws(() => c.flush(), /Cannot read properties of null \(reading 'postMessage'\)/);
});

test('guarded epochSync: iframe removed before the timer fires -> silent no-op', () => {
  const c = load(EPOCH, { guarded: true });
  c.__epoch();
  const before = c.log.slice();
  c.frame.remove();
  assert.doesNotThrow(() => c.flush());
  assert.deepEqual(c.log, before, 'no seekTo/play/setVolume may be posted after removal');
  assert.equal(c.timers.size, 0);
});

test('guarded epochSync: iframe removed between seekTo and play -> play never posts', () => {
  const c = load(EPOCH, { guarded: true });
  c.__epoch();
  const [id, t] = c.timers.entries().next().value;
  c.timers.delete(id); t.fn();                 /* the 400ms seekTo fires normally */
  assert.equal(c.log.at(-1), 'f1:seekTo 50000');
  c.frame.remove();
  assert.doesNotThrow(() => c.flush());
  assert.equal(c.log.at(-1), 'f1:seekTo 50000');
});

test('guarded epochSync: widget + iframe REPLACED (station change) -> old timers do not touch either', () => {
  const c = load(EPOCH, { guarded: true });
  c.__epoch();
  const n = c.log.length;
  c.frame.remove();
  const f2 = makeFrame(c.log, 'f2');
  c.frame = f2; c.widget = makeWidget(f2);
  assert.doesNotThrow(() => c.flush());
  assert.equal(c.log.length, n, 'the new widget must not receive the old seek');
});

test('guarded epochSync: iframe still there -> exactly the calls the original makes, same order', () => {
  const orig = load(ORIGINAL_EPOCH, { guarded: false });
  orig.__epoch(); orig.flush();
  const now = load(EPOCH, { guarded: true });
  now.__epoch(); now.flush();
  assert.deepEqual(now.log, orig.log);
  assert.deepEqual(now.log, ['f1:getSounds', 'f1:skip 1', 'f1:setVolume 0', 'f1:seekTo 50000', 'f1:play', 'f1:setVolume 50']);
});

test('kilClearTimers drops every pending widget timer (teardown)', () => {
  const c = load(EPOCH, { guarded: true });
  c.__epoch();
  assert.equal(c.timers.size, 1);
  vm.runInContext('kilClearTimers();', c);
  assert.equal(c.timers.size, 0);
  assert.equal(vm.runInContext('_kilTimers.length', c), 0);
});

test('source: no delayed widget call is scheduled with a bare setTimeout any more', () => {
  const bare = src.match(/setTimeout\(\s*function\(\)\s*\{\s*widget\./g) || [];
  assert.deepEqual(bare, []);
  for (const call of ['widget.seekTo(trackOffset)', 'widget.seekTo(resumePos)', 'widget.seekTo(position)', 'widget.seekTo(pos)']) {
    const i = src.indexOf(call);
    assert.ok(i > 0, call + ' not found');
    assert.ok(/kilLater\(function\(\)\{\s*$/.test(src.slice(Math.max(0, i - 40), i)), call + ' must be inside kilLater');
  }
});

test('source: kilLoadPlaylist clears pending timers when it tears the old frame down', () => {
  const body = slice('  function kilLoadPlaylist(dir){', '\n  }\n');
  assert.ok(/old\.remove\(\);\s*widget=null; widgetReady=false;\s*kilClearTimers\(\);/.test(body));
});
