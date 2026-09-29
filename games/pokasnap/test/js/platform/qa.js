/* DEVICE QA HOOKS — inert unless the NATIVE bundle is a device-QA build (POKA_DEVICE_QA compile
   flag; the App Store build reports qa:false and this file does nothing). Writes a timeline and
   web-view snapshots into the app's Documents/qa for the operator to pull with devicectl.
   Plans (POKA_QA_PLAN launch env): cold | owner-check | v2tour (runs on the SEPARATE seed profile) | settings-current | settings-update | settings-offline | resume.
   Every non-tap action a plan takes is logged as "ACTION jump|click …" — nothing is hidden. */
import { appInfo } from './update.js';
import { setSink } from './analytics.js';
import { PROFILE } from './profile.js';

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
  if (plan.startsWith('v21')) { const m = await import('./qa21.js'); await m.runV21(plan, { log, snap, app }); return; }   // 2.1 device driver: only ever loaded in a device-QA build
  if (plan === 'owner-check') {   // the owner's real save after migration: read-only
    const st = JSON.parse(localStorage.getItem('pokasnap-save-v1') || '{}'), bk = localStorage.getItem('pokasnap-save-v1.pre2-backup');
    log(`owner-save pet=${st.pet?.name || '-'} residents=${(st.residents || []).map(p => p.name).join('+') || '-'} level=${st.progress?.level} coins=${st.progress?.coins} diamonds=${st.progress?.diamonds} photos=${st.world?.photos?.length || 0} v2=${!!st.v2} backup=${!!bk} backupCoins=${bk ? JSON.parse(bk).progress?.coins : '-'} v21=${!!st.v21} rooms=${Object.keys(st.v21?.rooms || {}).length} sp=${JSON.stringify(st.v21?.sp)} album21=${JSON.stringify(st.v21?.album?.slots || {})} legacyAlbum=${(st.v21?.album?.legacy || []).length} migrated20=${!!st.v21?.album?.migrated20} pre21backup=${!!localStorage.getItem('pokasnap-save-v1.pre21-backup')} pre21backupCoins=${JSON.parse(localStorage.getItem('pokasnap-save-v1.pre21-backup') || '{}').progress?.coins ?? '-'} pre21backupPhotos=${(JSON.parse(localStorage.getItem('pokasnap-save-v1.pre21-backup') || '{}').world?.photos || []).length} inventory=${(st.inventory || []).length} ownership=${Object.keys(st.ownership || {}).length} navOrder=${[...document.querySelectorAll('.navbar [data-nav]')].map(b => b.dataset.nav).join(',')}`);
    snap('owner-check');
  }
  if (plan === 'v2tour') {
    if (PROFILE !== 'seed') { log('ACTION reload to ?profile=seed (the tour never uses the owner save)'); location.replace(location.pathname + '?profile=seed'); return; }
    const shot = async name => { await wait(450); await Promise.race([snap(name), wait(1500)]); };   // after the screen-in animation, and wait for the native snapshot
    const q = s => document.querySelector(s), r = el => { const b = el.getBoundingClientRect(); return `${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.width)}x${Math.round(b.height)}`; };
    const click = (sel, why) => { const el = q(sel); log(`ACTION click ${why} (${sel}) ${el ? 'found' : 'MISSING'}`); el?.click(); return !!el; };
    log(`layout vw=${innerWidth} vh=${innerHeight} snap=${r(q('.snap-btn'))} interact=${r(q('.side-btn.interact'))} event=${r(q('.side-btn.event'))} turns="${q('.turns')?.innerText.replace(/\n/g, ' ')}" nav=${r(q('.navbar'))} stage=${r(q('.world-stage'))} order=${[...document.querySelectorAll('.navbar [data-nav]')].map(b => b.dataset.nav).join(',')}`);
    await shot('v2-snap'); await wait(3000); log(`world ${JSON.stringify(window.PokaHomeland?.state().map(a => [a.pet, a.kind, a.pose]))}`); await shot('v2-snap-alive');
    for (const tool of ['Ball', 'Food', 'Toy', 'Poke', 'Call']) {
      click('.side-btn.interact', 'INTERACT'); await wait(600); if (tool === 'Ball') await shot('v2-interact');
      const b = [...document.querySelectorAll('.tool')].find(x => x.innerText.includes(tool)); log(`ACTION click tool ${tool} ${b ? 'found' : 'MISSING'}`); b?.click(); await wait(1500);
      log(`reaction ${tool} "${q('.react-bubble')?.innerText}"`); if (tool === 'Ball') await shot('v2-reaction-ball');
    }
    window.PokaHomeland?.interact('pet', 1); await wait(1400); log(`reaction Pet "${q('.react-bubble')?.innerText}"`);
    window.PokaHomeland?.interact('ball'); await wait(1400);
    const t0 = q('.turns')?.innerText.replace(/\n/g, ' ');
    click('.snap-btn', 'SNAP'); await wait(3800);
    log(`snap-result turnsBefore="${t0}" score="${q('.photo-dims b')?.innerText}" lines=${JSON.stringify([...document.querySelectorAll('.res-lines .reward-line')].map(x => x.innerText))} albumSlots=${document.querySelectorAll('.album-line:not(.done)').length} actionsVisible=${[...document.querySelectorAll('.res-actions .btn')].every(x => x.getBoundingClientRect().bottom <= innerHeight)}`);
    await shot('v2-snap-result'); click('.res-actions .btn:not(.ghost)', 'KEEP PLAYING'); await wait(900); log(`turnsAfter="${q('.turns')?.innerText.replace(/\n/g, ' ')}"`);
    click('.side-btn.event', 'EVENT'); await wait(1500); log(`event route=${app.route} "${q('h1')?.innerText}" "${q('.tab-head .sub')?.innerText}"`); await shot('v2-event');
    for (const tab of ['wins', 'poka', 'pets', 'album']) { click(`.navbar [data-nav=${tab}]`, tab.toUpperCase()); await wait(1500); log(`tab ${tab} route=${app.route} h1="${q('h1')?.innerText}" hscroll=${document.documentElement.scrollWidth > innerWidth}`); await shot(`v2-${tab}`); }
    click('.navbar [data-nav=snap]', 'SNAP tab'); await wait(1200); click('.cur.coins', 'coins pill'); await wait(1500); log(`shop route=${app.route} "${q('h1')?.innerText}"`); await shot('v2-shop');
    click('.navbar [data-nav=snap]', 'SNAP tab'); await wait(1000); if (app.route !== 'snap') { app.go('snap'); log('ACTION jump snap'); await wait(1200); }
    window.PokaHomeland?.forceMoment('rare'); log('ACTION QA hook forceMoment(rare)'); await wait(800); await shot('v2-rare'); log(`rare banner="${q('.moment-banner')?.innerText}"`);
    const st = JSON.parse(localStorage.getItem('pokasnap-save-v1:seed')); log(`tour-done seedPhotos=${st.world.photos.length} seedAlbum=${Object.values(st.v2.album.slots).reduce((n, x) => n + Object.values(x).reduce((a, b) => a + Object.keys(b).length, 0), 0)} ownerSaveUntouchedCoins=${JSON.parse(localStorage.getItem('pokasnap-save-v1') || '{}').progress?.coins}`);
  }
}
