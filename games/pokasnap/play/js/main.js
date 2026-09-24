/* PokaSnap app shell: routing, launch, persistence hooks. */

import { load, get, update } from './game/state.js';
import { track } from './platform/analytics.js';
import { unlockAudio } from './platform/sound.js';
import { session, onAuth } from './platform/auth.js';
import { welcomeScreen, emailScreen, onboardingScreen, createScreen } from './screens/flow.js';
import { homeScreen, briefScreen } from './screens/home.js';
import { cameraScreen } from './screens/camera.js';
import { resultScreen } from './screens/result.js';
import { missionsScreen, albumScreen, closetScreen, settingsScreen } from './screens/lists.js';

window.POKASNAP_VERSION = '1.0.0 (1)';

const ROUTES = {
  welcome: welcomeScreen, email: emailScreen, onboarding: onboardingScreen, create: createScreen,
  home: homeScreen, brief: briefScreen, camera: cameraScreen, result: resultScreen,
  missions: missionsScreen, album: albumScreen, closet: closetScreen, settings: settingsScreen,
};
const NEEDS_PET = new Set(['home', 'brief', 'camera', 'result', 'missions', 'album', 'closet']);

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
    const r = ROUTES[name] || homeScreen;
    const ret = r(app, params);
    if (typeof ret === 'function') cleanup = ret;
    window.scrollTo(0, 0);
  },
};
window.PokaApp = app;   // test hook

async function boot() {
  load();
  track('app_open', { platform: window.Capacitor ? 'ios' : 'web' });
  document.addEventListener('pointerdown', unlockAudio, { once: true });

  // A returning OAuth/email-confirm redirect lands here with a session in the URL.
  onAuth(s => {
    if (s && get().account.userId !== s.user.id) {
      update(st => { st.account = { mode: s.user.app_metadata?.provider || 'email', userId: s.user.id, email: s.user.email || null }; });
      track('signup_completed', { method: s.user.app_metadata?.provider || 'email' });
    }
  });

  const st = get();
  if (st.pet) app.go('home');
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
