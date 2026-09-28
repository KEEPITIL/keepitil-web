/* DEVICE QA HOOKS — inert unless the NATIVE bundle is a device-QA build (POKA_DEVICE_QA compile
   flag; the App Store build reports qa:false and this file does nothing). Writes a timeline and
   web-view snapshots into the app's Documents/qa for the operator to pull with devicectl.
   Plans (POKA_QA_PLAN launch env): cold | settings-current | settings-update | settings-offline | resume.
   Every non-tap action a plan takes is logged as "ACTION jump|click …" — nothing is hidden. */
import { appInfo } from './update.js';
import { setSink } from './analytics.js';

const call = (m, o) => window.Capacitor.nativePromise('PokaNative', m, o);
const wait = ms => new Promise(r => setTimeout(r, ms));
export async function initQA(app) {
  const info = await appInfo(); if (!info.qa) return;
  const log = line => call('qaLog', { line: `js ${line}` }).catch(() => {});
  const snap = name => call('qaSnapshot', { name }).catch(() => {});
  const plan = info.qaPlan || 'cold';
  const qa = window.__pokaQA = { log, snap, plan };
  const ver = `${info.version} (${info.build})`;
  if (plan === 'settings-current') qa.manifestUrl = 'data:application/json,' + encodeURIComponent(JSON.stringify({ latestVersion: info.version, latestBuild: +info.build, appStoreURL: 'itms-apps://apps.apple.com/app/pokasnap' }));
  if (plan === 'settings-update') qa.manifestUrl = 'data:application/json,' + encodeURIComponent(JSON.stringify({ latestVersion: '9.9.9', latestBuild: 999, appStoreURL: 'itms-apps://apps.apple.com/app/pokasnap', releaseNotes: 'QA fixture: pretend newer version' }));
  if (plan === 'settings-offline') qa.manifestUrl = 'https://pokasnap-qa-unreachable.invalid/version.json';
  // Hardware QA: the owner's real taps become evidence (QA builds only; the store build has no sink).
  const SNAP_ON = new Set(['photo_taken', 'photo_saved', 'walk_permission_granted', 'walk_permission_denied', 'step_milestone', 'notification_permission_requested', 'music_played', 'plus_viewed', 'purchase_restored', 'plus_started', 'help_opened', 'friends_opened', 'update_open']);
  setSink(ev => { const { name, at, ...props } = ev; log(`event ${name} ${JSON.stringify(props).slice(0, 160)} route=${app.route}`); if (SNAP_ON.has(name)) setTimeout(() => snap(`ev-${name}-${Date.now()}`), 900); });
  log(`boot plan=${plan} installed=${ver} channel=${info.channel} route=${app.route} introVisible=${!!document.querySelector('.opening-credits')} music=${!!window.__externalAudio}`);
  const b = window.__boot; if (b) log(`web-timeline ${b.marks.map(([n, ms]) => `${n}=${ms}`).join(' ')}`);
  document.addEventListener('visibilitychange', () => { log(`visibility ${document.hidden ? 'hidden' : 'visible'} introVisible=${!!document.querySelector('.opening-credits')} route=${app.route}`); if (!document.hidden) setTimeout(() => snap(`resume-${Date.now()}`), 700); });
  for (const [t, n] of [[150, 'intro-0.15s'], [1700, 'intro-1.7s'], [3300, 'intro-3.3s']]) { await wait(t - (t === 150 ? 0 : t === 1700 ? 150 : 1700)); snap(`cold-${n}`); log(`at ${t}ms introVisible=${!!document.querySelector('.opening-credits')} card=${document.querySelector('.opening-card:not([hidden])')?.dataset.credit || '-'}`); }
  await wait(2100); snap('cold-after-intro'); log(`after-intro introVisible=${!!document.querySelector('.opening-credits')} route=${app.route} pet=${!!window.PokaApp && JSON.parse(localStorage.getItem('pokasnap-save-v1') || '{}').pet?.name || '-'} introShown=${window.__introShownAt || 0} introClosed=${window.__introClosedAt || 0} musicBar=${!!document.querySelector('.intro-music')}`);
  if (plan.startsWith('settings')) {
    log('ACTION jump settings (route jump: no human on the device)'); app.go('settings'); await wait(2500); log(`after-jump route=${app.route}`);
    const bottom = () => { const s = document.querySelector('.screen'); s.scrollTo(0, s.scrollHeight); };
    bottom(); await wait(3500); bottom(); await wait(800);
    const v = document.querySelector('.about-ver'); log(`settings version-shown="${v?.textContent}" data-version=${v?.dataset.version} data-build=${v?.dataset.build} status="${document.querySelector('.update-status')?.innerText.replace(/\n/g, ' | ')}" badge=${!document.querySelector('.update-badge')?.hidden}`);
    snap(`${plan}-bottom`);
  }
}
