/* PokaSnap app shell: routing, launch, persistence hooks. */

import { load, get, update, onChange } from './game/state.js';
import { track } from './platform/analytics.js';
import { openingCredits } from './platform/opening.js';
import * as introMusic from './platform/intromusic.js';
import { initQA } from './platform/qa.js';
import { toast } from './ui.js';
import * as album from './game/album.js';
import { unlockAudio, music } from './platform/sound.js';
import { checkIn } from './game/companion.js';
import { session, onAuth } from './platform/auth.js';
import { welcomeScreen, emailScreen, onboardingScreen, createScreen } from './screens/flow.js';
import { homeScreen, briefScreen } from './screens/home.js';
import { cameraScreen } from './screens/camera.js';
import { resultScreen } from './screens/result.js';
import { missionsScreen, albumScreen, closetScreen, settingsScreen } from './screens/lists.js';
import { musicScreen } from './screens/music.js';
import { friendsScreen } from './screens/friends.js';
import { helpScreen } from './screens/help.js';
import { careScreen } from './screens/care.js';
import { adventuresScreen } from './screens/adventures.js';
import { walkScreen } from './screens/walk.js';
import { recapScreen } from './screens/recap.js';
import { storeScreen, itemScreen, plusScreen, rewardedScreen, ensureProducts } from './screens/shop.js';
import * as purchases from './platform/purchases.js';
import * as notify from './platform/notify.js';
import * as cloud from './platform/cloud.js';
import { refreshEntitlements, applyTransaction, applyPlusGrants, pruneEquipped, plusSubscribed } from './game/entitlements.js';
import { currentEvent } from './game/events.js';
import { dailyDone, fridayClaimable, isFriday } from './game/adventure.js';
import { clockOk } from './game/ledger.js';
import { trainScreen, gameScreen, learnedScreen } from './screens/train.js';
import { academyScreen, disciplineScreen, academyPlayScreen } from './screens/academy.js';
import { catalogScreen, starsScreen } from './screens/catalog.js';
import { homelandScreen, snapScreen } from './screens/homeland.js';
import { winsScreen, pokaScreen, pokaProfileScreen, petsScreen, seasonAlbumScreen, event2Screen } from './screens/tabs.js';
import { packScreen, lifeAlbumScreen, journalScreen, lifeScreen, partyScreen, communityScreen, leagueScreen, lookbackScreen, chaptersScreen } from './screens/world.js';
import * as World from './game/world.js';
import './data/challenges.js';

window.POKASNAP_VERSION = '2.0.0 (14)';

const ROUTES = {
  welcome: welcomeScreen, email: emailScreen, onboarding: onboardingScreen, create: createScreen,
  home: snapScreen, snap: snapScreen, wins: winsScreen, poka: pokaScreen, pokaprofile: pokaProfileScreen, pets: petsScreen, album: seasonAlbumScreen, snaps: albumScreen, event2: event2Screen,
  home1: homeScreen, brief: briefScreen, camera: cameraScreen, result: resultScreen,
  missions: missionsScreen, closet: closetScreen, settings: settingsScreen,
  care: careScreen, train: trainScreen, game: gameScreen, learned: learnedScreen,
  adventures: adventuresScreen, walk: walkScreen, recap: recapScreen,
  store: storeScreen, item: (app, p) => itemScreen(app, p.id), plus: plusScreen, rewarded: rewardedScreen,
  academy: academyScreen, discipline: disciplineScreen, academyPlay: academyPlayScreen,
  catalog: catalogScreen, stars: starsScreen,
  homeland: homelandScreen, pack: packScreen, 'album-life': lifeAlbumScreen, journal: journalScreen, life: lifeScreen, party: partyScreen,
  community: communityScreen, music: musicScreen, friends: friendsScreen, help: helpScreen, league: leagueScreen, lookback: lookbackScreen, chapters: chaptersScreen,
};
const NEEDS_PET = new Set(['snap', 'wins', 'poka', 'pokaprofile', 'pets', 'snaps', 'event2', 'home1', 'music', 'friends', 'homeland', 'pack', 'album-life', 'journal', 'life', 'party', 'community', 'league', 'lookback', 'chapters', 'catalog', 'stars', 'academy', 'discipline', 'academyPlay', 'home', 'brief', 'camera', 'result', 'missions', 'album', 'closet', 'care', 'train', 'game', 'learned', 'adventures', 'walk', 'recap', 'store', 'item', 'plus', 'rewarded']);
// menu music plays everywhere except where it would compete (never over the camera or an ad)
const QUIET = new Set(['camera', 'result', 'game', 'rewarded', 'music']);
QUIET.add('academyPlay');   // 1.3: Academy games have their own sounds

const root = document.getElementById('app');
let cleanup = null;
let opening = null;

export const app = {
  route: null,
  mount(el) { root.replaceChildren(el); },
  go(name, params = {}) {
    if (NEEDS_PET.has(name) && !get().pet) name = get().account.mode ? 'create' : 'welcome';
    if (typeof cleanup === 'function') { try { cleanup(); } catch (e) {} }
    cleanup = null;
    document.querySelectorAll('.sheet, .sheet-back, .viewer, .levelup').forEach(n => n.remove());
    app.route = name;
    if (QUIET.has(name)) { music.stop(); introMusic.stop('quiet'); } else if (audioReady) music.start();
    const r = ROUTES[name] || snapScreen;
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
  let r, care = []; update(st => { clockOk(st); r = checkIn(st); applyPlusGrants(st); pruneEquipped(st); World.ensure(st); care = World.careTick(st); World.earnRevivalTreats(st); });
  // care news is factual and restrained: one line, never a threat
  const warn = care.find(c => c.warning), passed = care.find(c => c.passed), change = care.find(c => c.to && c.to !== 'healthy');
  if (passed) setTimeout(() => toast(`🕯️ ${passed.pet.name} has gone to rest in the Memorial Garden. Their Life Album is kept forever.`, 4200), 1200);
  else if (warn) setTimeout(() => { if (app.route !== 'home') toast(`⚠️ ${warn.pet.name} needs care soon — a meal, play or a walk will help.`, 4200); }, 1200);   // Home shows it in its care banner
  else if (change) care.forEach(c => c.to && track('neglect_state_changed', { from: c.from, to: c.to }));
  retroOnce();
  if (r.returning) track('returning_user', { awayDays: r.awayDays, gift: r.gift });
  rescheduleNotifications();
  return r;
}

/* 1.4: anything photographed before a Journal/collection/challenge existed is credited once. */
async function retroOnce() {
  try {
    const snaps = await album.list(); const { CHALLENGES } = await import('./data/challenges.js'); const { requirementsMet } = await import('./game/score.js'); const { starsFor } = await import('./data/progression.js');
    let notes = []; update(st => { World.backfillFromAlbum(st, snaps); notes = World.retroCredit(st, { challenges: CHALLENGES, requirementsMet, starsFor }); });
    if (notes.length) toast(`📔 You've already captured this memory! ${notes.length} credited.`, 3200);
  } catch (e) {}
}

/* App Store entitlements: verified transactions -> OWNED items / Plus state.
   Expiry only removes ACCESS (Premium Closet); owned things stay. */
async function syncStore() {
  if (!purchases.available()) return;
  purchases.listenNative();
  purchases.onTransaction(tx => { let ch; update(s => { ch = applyTransaction(s, tx); pruneEquipped(s); }); });
  ensureProducts();
  const list = await purchases.entitlements();
  let ch; update(s => { ch = refreshEntitlements(s, list); pruneEquipped(s); });
  if (ch.expired) track('plus_expired', {});
}

/* Notifications are planned in JS and scheduled natively (no-op on the web). */
async function rescheduleNotifications() {
  const st = get(); if (!st.pet || !st.notify?.asked || !notify.supported()) return;
  if ((await notify.permission()) !== 'granted') return;
  const ev = currentEvent();
  notify.schedule(notify.plan(st.notify.prefs, { dailyDoneToday: dailyDone(st), eventEndsAt: ev?.end, fridayClaimedThisWeek: isFriday() && !fridayClaimable(st) }, st.pet.name));
}
window.PokaNotifyReschedule = rescheduleNotifications;

/* Signed-in players: progress backs up quietly after changes (debounced);
   Plus auto-backs-up favourite photos. Guests: nothing leaves the device. */
let backupTimer = 0;
onChange(() => { clearTimeout(backupTimer); backupTimer = setTimeout(async () => {
  const st = get(); if (!st.account?.userId) return;
  try { await cloud.backupProgress(); if (cloud.autoBackup(st)) { const r = await cloud.autoBackupFavorites(); if (r.uploaded) track('cloud_backup', { auto: true, count: r.uploaded }); } } catch (e) {}
}, 8000); });

// Surface uncaught errors in the native log (Capacitor forwards console.error).
window.addEventListener('error', e => console.error('uncaught', e.message, e.filename + ':' + e.lineno));
window.addEventListener('unhandledrejection', e => console.error('unhandled rejection', String(e.reason?.message || e.reason)));

// Tell the native shell the first screen is painted (drops the branded boot cover) and
// log the boot timeline so a slow start is diagnosable from the device log.
function nativeReady() {
  const b = window.__boot, marks = b ? b.marks.map(([n, ms]) => `${n}=${ms}`).join(' ') : '';
  console.log('[boot] timeline ' + marks);
  try {
    Promise.resolve(window.Capacitor?.nativePromise?.('PokaNative', 'ready', { marks }))
      .catch(() => {}).finally(() => opening?.start());
  } catch (e) { opening?.start(); }
}

async function boot() {
  window.__mark?.('main-eval');
  load();
  window.__mark?.('save-loaded');
  track('app_open', { platform: window.Capacitor ? 'ios' : 'web' });
  track('session_started', { returning: !!get().pet });
  document.addEventListener('pointerdown', () => { unlockAudio(); audioReady = true; if (!QUIET.has(app.route)) music.start(); }, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { music.stop(); return; }
    if (audioReady && !QUIET.has(app.route)) music.start();
    const r = arrive(); syncStore(); if (r?.returning && (app.route === 'snap' || app.route === 'home')) app.go('snap', { welcome: r });
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
  window.__mark?.('world-ready');
  syncStore();
  if (st.pet) app.go('snap', r?.returning ? { welcome: r } : {});
  else if (st.account.mode) app.go(st.onboarded ? 'create' : 'onboarding');
  else {
    // returning from an OAuth redirect: skip the welcome screen
    const s = location.hash.includes('access_token') ? await session() : null;
    app.go(s ? 'onboarding' : 'welcome');
  }
  window.__mark?.('first-route');
  opening = openingCredits();
  initQA(app).catch(() => {});   // inert unless the native bundle is a device-QA build
  if (window.__boot) window.__boot.rendered = true;
  // WKWebView runs the first rAF before its compositor has shown the frame; waiting two more
  // frames + a beat keeps the native cover up until real pixels are on screen (no cream flash).
  requestAnimationFrame(() => { window.__mark?.('first-paint'); setTimeout(() => window.__mark?.('interactive'), 0);
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(nativeReady, 120))); });
}
boot().catch(e => { console.error('[boot] failed', e); const m = document.getElementById('boot-msg'); if (m) m.textContent = 'Something went wrong starting PokaSnap. Close and reopen the app.'; });

if ('serviceWorker' in navigator && !window.Capacitor && (location.protocol === 'https:' || location.hostname === 'localhost')) {   // localhost: offline QA
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
