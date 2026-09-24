/* PokaSnap app shell: routing, launch, persistence hooks. */

import { load, get, update } from './game/state.js';
import { track } from './platform/analytics.js';
import { unlockAudio, music } from './platform/sound.js';
import { checkIn } from './game/companion.js';
import { session, onAuth } from './platform/auth.js';
import { welcomeScreen, emailScreen, onboardingScreen, createScreen } from './screens/flow.js';
import { homeScreen, briefScreen } from './screens/home.js';
import { cameraScreen } from './screens/camera.js';
import { resultScreen } from './screens/result.js';
import { missionsScreen, albumScreen, closetScreen, settingsScreen } from './screens/lists.js';
import { careScreen } from './screens/care.js';
import { trainScreen, gameScreen, learnedScreen } from './screens/train.js';

window.POKASNAP_VERSION = '1.1.0 (2)';

const ROUTES = {
  welcome: welcomeScreen, email: emailScreen, onboarding: onboardingScreen, create: createScreen,
  home: homeScreen, brief: briefScreen, camera: cameraScreen, result: resultScreen,
  missions: missionsScreen, album: albumScreen, closet: closetScreen, settings: settingsScreen,
  care: careScreen, train: trainScreen, game: gameScreen, learned: learnedScreen,
};
const NEEDS_PET = new Set(['home', 'brief', 'camera', 'result', 'missions', 'album', 'closet', 'care', 'train', 'game', 'learned']);
// menu music plays everywhere except where it would compete
const QUIET = new Set(['camera', 'result', 'game']);

const root = document.getElementById('app');
let cleanup = null;

export const app = {
  route: null,
  mount(el) { root.replaceChildren(el); },
  go(name, params = {}) {
    if (NEEDS_PET.has(name) && !get().pet) name = get().account.mode ? 'create' : 'welcome';
    if (typeof cleanup === 'function') { try { cleanup(); } catch (e) {} }
    cleanup = null;
    document.querySelectorAll('.sheet, .sheet-back, .viewer, .levelup').forEach(n => n.remove());
    app.route = name;
    if (QUIET.has(name)) music.stop(); else if (audioReady) music.start();
    const r = ROUTES[name] || homeScreen;
    const ret = r(app, params);
    if (typeof ret === 'function') cleanup = ret;
    window.scrollTo(0, 0);
  },
};
window.PokaApp = app;   // test hook
let audioReady = false;

/* Launch or return to the foreground: a break is celebrated, never punished. */
function arrive() {
  if (!get().pet) return null;
  let r; update(st => { r = checkIn(st); });
  if (r.returning) track('returning_user', { awayDays: r.awayDays, gift: r.gift });
  return r;
}

// Surface uncaught errors in the native log (Capacitor forwards console.error).
window.addEventListener('error', e => console.error('uncaught', e.message, e.filename + ':' + e.lineno));
window.addEventListener('unhandledrejection', e => console.error('unhandled rejection', String(e.reason?.message || e.reason)));

async function boot() {
  load();
  track('app_open', { platform: window.Capacitor ? 'ios' : 'web' });
  track('session_started', { returning: !!get().pet });
  document.addEventListener('pointerdown', () => { unlockAudio(); audioReady = true; if (!QUIET.has(app.route)) music.start(); }, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { music.stop(); return; }
    if (audioReady && !QUIET.has(app.route)) music.start();
    const r = arrive(); if (r?.returning && app.route === 'home') app.go('home', { welcome: r });
  });

  // A returning OAuth/email-confirm redirect lands here with a session in the URL.
  onAuth(s => {
    if (s && get().account.userId !== s.user.id) {
      update(st => { st.account = { mode: s.user.app_metadata?.provider || 'email', userId: s.user.id, email: s.user.email || null }; });
      track('signup_completed', { method: s.user.app_metadata?.provider || 'email' });
    }
  });

  const st = get();
  const r = arrive();
  if (st.pet) app.go('home', r?.returning ? { welcome: r } : {});
  else if (st.account.mode) app.go(st.onboarded ? 'create' : 'onboarding');
  else {
    // returning from an OAuth redirect: skip the welcome screen
    const s = location.hash.includes('access_token') ? await session() : null;
    app.go(s ? 'onboarding' : 'welcome');
  }
}
boot();

if ('serviceWorker' in navigator && !window.Capacitor && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
