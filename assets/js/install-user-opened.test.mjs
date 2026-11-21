// Install UI opens only when the user asks (owner rule 2026-11-20: no self-opening pop-ups).
// Run: node --test assets/js/install-user-opened.test.mjs
//
// METHOD: the REAL keepitil-shell.js is evaluated inside jsdom with a fake clock, so every
// setTimeout/setInterval it schedules (including the self-heal loop) can be driven forward
// deterministically. Each scenario loads a page, fires beforeinstallprompt, advances 60s of
// timers, scrolls, and only then looks for anything install-shaped on screen.
//
// NEGATIVE CONTROL: OLD_BLOCK below is the install block from main @ 2663aa7
// (keepitil-shell.js:385-454) verbatim. Swapping it back into the current shell must make the
// "nothing shows by itself" check FAIL, which proves that check can see a banner at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHELL = readFileSync(path.join(root, 'keepitil-shell.js'), 'utf8');

const START = '  /* Install: OPENS ONLY WHEN THE USER ASKS';
const END = '  /* ── KIL.eventDate / KIL.localDate';

const OLD_BLOCK = String.raw`  /* Install banner: Android/desktop via beforeinstallprompt; iOS gets a one-time Share hint. */
  try{
    var _IK='kil-pwa-hint-2026';
    /* The capacitor:// arm is why the banner was appearing INSIDE the native app: the WKWebView
       wrapper reports neither display-mode:standalone nor navigator.standalone, so both original
       tests passed and it offered to install an app the user was already standing in. */
    var _standalone=(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)
      ||window.navigator.standalone===true
      ||/capacitor|ionic/i.test(location.protocol);
    /* FOUNDER DIRECTIVE 2026-08-07: install UI is ON — ship the free installable PWA now,
       native Expo app later. (Supersedes the 2026-07-16 "off until App Store launch" hold.)
       Banner is dismissible and remembers the dismissal via localStorage key _IK. */
    var _INSTALL_UI=true;
    if(_INSTALL_UI && !_standalone && !localStorage.getItem(_IK)){
      var _dismiss=function(){ try{localStorage.setItem(_IK,'1');}catch(e){} var b=document.getElementById('kil-pwa-banner'); if(b)b.remove(); };
      var _show=function(msg,btnLabel,onBtn){
        if(document.getElementById('kil-pwa-banner'))return;
        var b=document.createElement('div'); b.id='kil-pwa-banner';
        /* Bottom-docked, ABOVE the chat button (Founder 2026-08-21 — it was covering the middle
           of every page on a phone).
           History: it was bottom:104px/z-index:900 and sat UNDER the chat button, so on 2026-08-15
           it was centred to escape by geometry. That traded a small overlap for a worse one — a
           fixed, undismissed banner parked over the centre of the viewport on every page, following
           the scroll, hiding whatever the visitor came to read.
           This keeps the geometric fix and drops the collision: the banner is a full-width bar
           stacked above the chat FAB and the bottom nav, so nothing overlaps at any z-index and
           the content it interrupts is empty page margin instead of the middle of the feed. */
        var _lift = 'calc(var(--kil-bnav-h,62px) + var(--kil-mbar-h,0px) + 86px + env(safe-area-inset-bottom,0px))';
        b.style.cssText='position:fixed;left:12px;right:12px;bottom:'+_lift+';margin:0 auto;'
          +'max-width:520px;z-index:1150;background:#12121c;border:1px solid #2a2a3a;border-radius:14px;'
          +'padding:14px;display:flex;align-items:center;gap:10px;box-shadow:0 18px 48px rgba(0,0,0,.6);'
          +'font-family:Inter,system-ui,sans-serif;font-size:.85rem;color:#f0f0f0';
        b.innerHTML='<img src="/icon-192.png" alt="" style="width:34px;height:34px;border-radius:8px;flex:0 0 34px">'+
          '<span style="flex:1;line-height:1.35">'+msg+'</span>'+
          (btnLabel?'<button id="kil-pwa-go" style="background:linear-gradient(90deg,#00b4ff,#22e39b);color:#04121b;border:0;border-radius:9px;padding:8px 14px;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap">'+btnLabel+'</button>':'')+
          '<button id="kil-pwa-x" aria-label="Dismiss" style="background:none;border:0;color:#9aa0b0;font-size:1.1rem;cursor:pointer;padding:4px">&times;</button>';
        document.body.appendChild(b);
        var x=document.getElementById('kil-pwa-x'); if(x)x.addEventListener('click',_dismiss);
        var g=document.getElementById('kil-pwa-go'); if(g&&onBtn)g.addEventListener('click',onBtn);
      };
      var _ios=/iphone|ipad|ipod/i.test(navigator.userAgent||'');
      var _dp=null;
      /* Full-screen step-by-step overlay for when no native prompt is available (iOS always; Android if the prompt was consumed). */
      var _instr=function(){
        if(document.getElementById('kil-pwa-instr'))return;
        var steps=_ios
          ? '1. Tap the <b>&#8943;</b> menu in Safari, then <b>Share</b> <span style="font-size:1.1em">&#x2191;</span>. On older iOS the Share icon is in the bottom bar instead.<br>2. Scroll down and tap <b>Add to Home Screen</b>.<br>3. Tap <b>Add</b> — KEEPITIL lands on your home screen.'
          : '1. Open your browser menu <b>&#8942;</b> (top-right).<br>2. Tap <b>Install app</b> or <b>Add to Home screen</b>.<br>3. Confirm — KEEPITIL lands on your home screen.';
        var o=document.createElement('div'); o.id='kil-pwa-instr';
        o.style.cssText='position:fixed;inset:0;z-index:1200;background:rgba(4,6,12,.88);display:flex;align-items:center;justify-content:center;padding:24px;font-family:Inter,system-ui,sans-serif';
        o.innerHTML='<div style="background:#12121c;border:1px solid #2a2a3a;border-radius:16px;max-width:360px;width:100%;padding:22px;color:#f0f0f0;box-shadow:0 20px 60px rgba(0,0,0,.6)">'+
          '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><img src="/icon-192.png" alt="" style="width:38px;height:38px;border-radius:9px">'+
          '<span style="font-weight:800;font-size:1.05rem">Install KEEPITIL</span></div>'+
          '<p style="line-height:1.6;font-size:.9rem;color:#d5d8e2;margin:0 0 16px">'+steps+'</p>'+
          '<button id="kil-pwa-instr-x" style="width:100%;background:linear-gradient(90deg,#00b4ff,#22e39b);color:#04121b;border:0;border-radius:10px;padding:11px;font-weight:800;cursor:pointer;font-family:inherit">Got it</button></div>';
        o.addEventListener('click',function(e){ if(e.target===o||e.target.id==='kil-pwa-instr-x'){ o.remove(); } });
        document.body.appendChild(o);
      };
      /* The banner button ALWAYS does something: native prompt if we have it, else instructions. */
      var _onInstall=function(){
        if(_dp){ try{ _dp.prompt(); _dp.userChoice.then(_dismiss); _dp=null; return; }catch(e){} }
        _instr();
      };
      var _showBanner=function(){ _show('Add <b>KEEPITIL</b> to your home screen — events, scene &amp; radio, one tap away.','Install',_onInstall); };
      window.addEventListener('beforeinstallprompt',function(ev){ ev.preventDefault(); _dp=ev; _showBanner(); });
      window.addEventListener('appinstalled',_dismiss);
      /* iOS never fires beforeinstallprompt, so show the banner ourselves; its button opens the instructions. */
      if(_ios){ setTimeout(_showBanner,2600); }
    }
  }catch(e){}
`;

function withOldBlock(src) {
  const a = src.indexOf(START), b = src.indexOf(END);
  assert.ok(a > 0 && b > a, 'install block markers not found in keepitil-shell.js');
  return src.slice(0, a) + OLD_BLOCK + src.slice(b);
}

const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

/* Load the shell into a fresh jsdom page. Timers go into a queue we control. */
function load(src, { ua, standalone = false } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><main><p>page</p></main></body></html>', {
    url: 'https://keepitil.com/', pretendToBeVisual: true, runScripts: 'outside-only',
    userAgent: ua || UA_ANDROID,
  });
  const w = dom.window;
  let now = 0, seq = 0;
  const q = new Map();
  w.setTimeout = (fn, ms = 0) => { const id = ++seq; q.set(id, { fn, at: now + (+ms || 0) }); return id; };
  w.setInterval = (fn, ms = 0) => { const id = ++seq; q.set(id, { fn, at: now + (+ms || 0), every: Math.max(1, +ms || 0) }); return id; };
  w.clearTimeout = w.clearInterval = (id) => { q.delete(id); };
  w.requestAnimationFrame = (fn) => w.setTimeout(() => fn(now), 16);
  w.cancelAnimationFrame = (id) => q.delete(id);
  const errors = [];
  const advance = (ms) => {
    const until = now + ms;
    for (let guard = 0; guard < 100000; guard++) {
      let next = null;
      for (const [id, t] of q) if (t.at <= until && (!next || t.at < next[1].at)) next = [id, t];
      if (!next) break;
      const [id, t] = next;
      now = t.at;
      if (t.every) t.at = now + t.every; else q.delete(id);
      try { t.fn(); } catch (e) { errors.push(e); }
    }
    now = until;
  };
  w.matchMedia = (qs) => ({ matches: standalone && /display-mode:\s*standalone/.test(qs), media: qs,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  Object.defineProperty(w.navigator, 'serviceWorker', { value: undefined, configurable: true });
  w.eval(src);
  return { dom, w, d: w.document, advance, errors };
}

/* Fire a beforeinstallprompt like Chromium does, with a prompt() spy. */
function fireBip(w) {
  const ev = new w.Event('beforeinstallprompt', { cancelable: true });
  ev.prompted = 0;
  ev.prompt = () => { ev.prompted++; return Promise.resolve(); };
  ev.userChoice = Promise.resolve({ outcome: 'dismissed' });
  w.dispatchEvent(ev);
  return ev;
}

/* Everything the browser does on its own: load, the install event, 60s of timers, scrolling. */
function idle({ w, d, advance }) {
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  w.dispatchEvent(new w.Event('load'));
  const ev = fireBip(w);
  advance(5000);
  for (let y = 200; y <= 3000; y += 200) {
    w.scrollY = y; w.pageYOffset = y;
    w.dispatchEvent(new w.Event('scroll'));
    d.dispatchEvent(new w.Event('scroll'));
    advance(500);
  }
  advance(60000);
  return ev;
}

/* Anything install-shaped visible on screen. */
function installUi(d) {
  return ['kil-pwa-banner', 'kil-pwa-instr'].map((id) => d.getElementById(id)).filter(Boolean);
}

for (const [name, ua] of [['Android/desktop Chrome', UA_ANDROID], ['iOS Safari', UA_IOS]]) {
  test(name + ': nothing install-shaped opens without a click', () => {
    const page = load(SHELL, { ua });
    const ev = idle(page);
    assert.equal(ev.defaultPrevented, true, 'beforeinstallprompt must still be captured (preventDefault)');
    assert.equal(ev.prompted, 0, 'prompt() must not be called without a click');
    assert.deepEqual(installUi(page.d).map((e) => e.id), [], 'an install banner/overlay opened by itself');
    page.dom.window.close();
  });
}

test('the footer Install app link exists when not installed', () => {
  const page = load(SHELL);
  idle(page);
  const links = page.d.querySelectorAll('#v3-footer [data-kil-install]');
  assert.equal(links.length, 1, 'exactly one Install app link in the footer legal row');
  assert.ok(links[0].closest('.v3-foot-legal'), 'it sits in the existing legal row');
  assert.match(links[0].textContent, /Install/);
  page.dom.window.close();
});

test('Chrome: clicking Install app calls the stashed prompt()', () => {
  const page = load(SHELL, { ua: UA_ANDROID });
  const ev = idle(page);
  assert.equal(ev.prompted, 0);
  page.d.querySelector('[data-kil-install]').dispatchEvent(new page.w.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(ev.prompted, 1, 'the click must call the stashed prompt()');
  // prompt() is single-use; a second click falls back to the steps instead of throwing.
  page.d.querySelector('[data-kil-install]').dispatchEvent(new page.w.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(ev.prompted, 1);
  assert.ok(page.d.getElementById('kil-pwa-instr'), 'second click shows the Add-to-Home steps');
  page.dom.window.close();
});

test('iOS Safari: clicking Install app shows the Add-to-Home steps, and Got it closes them', () => {
  const page = load(SHELL, { ua: UA_IOS });
  page.d.dispatchEvent(new page.w.Event('DOMContentLoaded'));
  page.advance(60000);
  assert.deepEqual(installUi(page.d), []);
  const click = page.d.querySelector('[data-kil-install]').dispatchEvent(new page.w.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(click, false, 'the link click is preventDefault-ed (no # navigation)');
  const o = page.d.getElementById('kil-pwa-instr');
  assert.ok(o, 'instructions overlay opened on click');
  assert.match(o.textContent, /Add to Home Screen/);
  page.d.getElementById('kil-pwa-instr-x').dispatchEvent(new page.w.MouseEvent('click', { bubbles: true }));
  assert.equal(page.d.getElementById('kil-pwa-instr'), null, 'Got it closes it');
  page.dom.window.close();
});

test('already installed (standalone): no Install link, nothing opens', () => {
  const page = load(SHELL, { ua: UA_ANDROID, standalone: true });
  const ev = idle(page);
  assert.equal(page.d.querySelectorAll('[data-kil-install]').length, 0, 'link hidden in standalone mode');
  assert.equal(ev.prompted, 0);
  assert.deepEqual(installUi(page.d), []);
  page.dom.window.close();
});

test('appinstalled removes the Install link', () => {
  const page = load(SHELL, { ua: UA_ANDROID });
  idle(page);
  assert.equal(page.d.querySelectorAll('[data-kil-install]').length, 1);
  page.w.dispatchEvent(new page.w.Event('appinstalled'));
  assert.equal(page.d.querySelectorAll('[data-kil-install]').length, 0);
  page.dom.window.close();
});

test('NEGATIVE CONTROL: the main@2663aa7 block opens a banner by itself (Chrome and iOS)', () => {
  const old = withOldBlock(SHELL);
  const chrome = load(old, { ua: UA_ANDROID });
  idle(chrome);
  assert.ok(chrome.d.getElementById('kil-pwa-banner'), 'old code: banner auto-opened from beforeinstallprompt');
  chrome.dom.window.close();
  const ios = load(old, { ua: UA_IOS });
  ios.d.dispatchEvent(new ios.w.Event('DOMContentLoaded'));
  assert.equal(ios.d.getElementById('kil-pwa-banner'), null, 'not yet before the timer');
  ios.advance(3000);
  assert.ok(ios.d.getElementById('kil-pwa-banner'), 'old code: banner auto-opened from the 2.6s iOS timer');
  ios.dom.window.close();
  // and the same assertion the real tests make would have failed:
  const again = load(old, { ua: UA_ANDROID });
  idle(again);
  assert.throws(() => assert.deepEqual(installUi(again.d).map((e) => e.id), []));
  again.dom.window.close();
});
