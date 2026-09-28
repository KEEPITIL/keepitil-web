/* Opening credits: every COLD launch (this module runs once per app process), never on resume.
   Presented by KEEPITIL → Developed by Tuitea → PokaSnap + intro song, ~4.6 s, Enter any time.
   No permissions or saved-game changes. The optional intro song is the official SoundCloud
   widget (intromusic.js): Music setting ON + online only, and nothing here waits for it. */
import * as introMusic from './intromusic.js';
export function openingCredits() {
  const app = document.getElementById('app');
  const previousFocus = document.activeElement;
  const wasInert = app.inert;
  const overlay = document.createElement('section');
  overlay.className = 'opening-credits';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'PokaSnap opening credits');
  overlay.innerHTML = `
    <div class="opening-orbit opening-orbit-one" aria-hidden="true"></div>
    <div class="opening-orbit opening-orbit-two" aria-hidden="true"></div>
    <div class="opening-topline">A LITTLE WONDER, EVERY DAY</div>
    <div class="opening-center">
      <div class="opening-mark" aria-hidden="true"><span>✦</span></div>
      <div class="opening-card" data-credit="presenter">
        <p>Presented by</p><h1>KEEPITIL</h1><div class="opening-rule"></div>
      </div>
      <div class="opening-card" data-credit="developer" hidden>
        <p>Developed by</p><h1 class="opening-tuitea">Tuitea</h1><div class="opening-rule"></div>
      </div>
      <div class="opening-card" data-credit="brand" hidden>
        <img class="opening-pet" src="img/icon-512.png" alt="" width="112" height="112">
        <p class="opening-music" aria-live="polite"></p>
      </div>
      <div class="opening-wordmark"><span>Poka</span><span>Snap</span></div>
      <div class="opening-tagline">POKE · POSE · SNAP</div>
    </div>
    <div class="opening-footer"><span class="opening-dots" aria-hidden="true"><i class="selected"></i><i></i><i></i></span>
      <button type="button" class="opening-skip">Enter PokaSnap <span aria-hidden="true">→</span></button></div>`;
  const skip = overlay.querySelector('button');
  let started = false, closed = false, timers = [];
  function close() {
    if (closed) return;
    closed = true;
    timers.forEach(clearTimeout);
    overlay.remove();
    introMusic.dock();   // the song (if any) keeps playing in a small visible bar
    window.__introShownAt = window.__introShownAt || Date.now(); window.__introClosedAt = Date.now();
    app.inert = wasInert;
    document.removeEventListener('keydown', keydown);
    if (previousFocus && previousFocus !== document.body && previousFocus.isConnected) previousFocus.focus();
    else {
      const target = app.querySelector('h1, button, a');
      if (target) { if (target.tagName === 'H1') target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
    }
  }
  function keydown(event) {
    if (event.key === 'Escape') close();
    if (event.key === 'Tab') { event.preventDefault(); skip.focus(); }
  }
  const card = n => { for (const c of overlay.querySelectorAll('.opening-card')) c.hidden = c.dataset.credit !== n;
    overlay.querySelectorAll('.opening-dots i').forEach((d, i) => d.classList.toggle('selected', i === ['presenter', 'developer', 'brand'].indexOf(n))); };
  function start() {
    if (started || closed) return;
    started = true;
    overlay.classList.add('opening-running');
    timers.push(setTimeout(() => card('developer'), 1500));
    timers.push(setTimeout(() => card('brand'), 3000));
    timers.push(setTimeout(close, 4600));
  }
  app.inert = true;
  document.body.append(overlay);
  window.__introShownAt = Date.now();
  introMusic.start().then(m => { const n = overlay.querySelector('.opening-music'); if (n) n.textContent = m.mounted ? '♪ Meow Meow · Raving Animals · KEEPITIL' : ''; }).catch(() => {});
  skip.addEventListener('click', close);
  document.addEventListener('keydown', keydown);
  skip.focus({ preventScroll: true });
  // Even a native bridge that never answers cannot hold the intro indefinitely.
  timers.push(setTimeout(start, 1200));
  return { start, close };
}
