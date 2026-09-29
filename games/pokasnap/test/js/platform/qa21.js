/* DEVICE-QA DRIVER for 2.1 — loaded ONLY by qa.js when the native bundle is a device-QA build (POKA_DEVICE_QA).
   The App Store / owner build never imports this file. It cannot touch the screen with a finger, so it dispatches
   real PointerEvent / click events into the real WKWebView ON THE PHONE (synthetic input, disclosed as such); the
   pixels in every snapshot are the device's own. Every action is logged; nothing mutates state directly except the
   two labelled QA actions (seed profile reload, event-window clock shift for events not live today).
   Plans (POKA_QA_PLAN): v21core | v21tabs | v21g:<racing|build|puzzle|fashion|dance> | v21train | v21persist-a | v21persist-b */
import { PROFILE } from './profile.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
const q = s => document.querySelector(s);
const qa = s => [...document.querySelectorAll(s)];
const vis = e => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
const rect = e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
const route = () => window.PokaApp?.route;

export async function runV21(plan, { log, snap, app }) {
  const R = (k, v) => log(`RESULT ${k} ${JSON.stringify(v)}`);
  const shot = async name => { await wait(450); await Promise.race([snap(name), wait(1500)]); };
  const ptr = (type, x, y, buttons, target) => { const t = target || document.elementFromPoint(x, y); t?.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 7, pointerType: 'touch', isPrimary: true, buttons, view: window })); return t; };
  let taps = 0, drags = 0;
  const tapAt = async (x, y) => { const t = ptr('pointerdown', x, y, 1); await wait(70); ptr('pointerup', x, y, 0, t); t?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window })); taps++; await wait(450); };
  const dragAt = async (x0, y0, x1, y1, ms = 200, steps = 8, holdMs = 0) => { const t = ptr('pointerdown', x0, y0, 1); if (holdMs) await wait(holdMs); for (let i = 1; i <= steps; i++) { await wait(ms / steps); ptr('pointermove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, 1, t); } ptr('pointerup', x1, y1, 0, t); drags++; await wait(300); };
  const tap = async (text, css = 'button') => {
    const el = qa(css).filter(vis).find(e => ((e.innerText || '') + ' ' + (e.getAttribute('aria-label') || '')).replace(/\s+/g, ' ').includes(text));
    if (!el) { log(`ACTION MISSING tap "${text}" (${css}) on ${route()}`); throw new Error('missing ' + text); }
    el.scrollIntoView({ block: 'center' }); let c = rect(el); for (let i = 0; i < 25; i++) { await wait(120); const c2 = rect(el); const still = Math.abs(c2.x - c.x) < 1 && Math.abs(c2.y - c.y) < 1 && Math.abs(c2.w - c.w) < 1; c = c2; if (still) break; }   // wait until it stops moving (pop-in animation)
    const top = document.elementFromPoint(c.x, c.y);
    if (top && !(el === top || el.contains(top))) { log(`ACTION COVERED tap "${text}" by ${top.tagName}.${top.className}`); throw new Error('covered ' + text); }
    log(`ACTION tap "${text}" (${css}) route=${route()}`); await tapAt(c.x, c.y); };
  const nav = id => tap(id.toUpperCase(), `.navbar [data-nav="${id}"]`);
  const snapBtn = async () => { const c = rect(q('.navbar .nav-snap')); log('ACTION tap the ONE SNAP (nav centre)'); await tapAt(c.x, c.y); };
  const world = () => window.PokaWorld;
  const shutters = () => ({ nav: qa('.nav-snap').length, extra: qa('.snap-btn,.shutter,.shutter-btn').length });
  const save = () => JSON.parse(localStorage.getItem(PROFILE === 'seed' ? 'pokasnap-save-v1:seed' : 'pokasnap-save-v1') || '{}');
  const albumCount = st => Object.values(st.v21?.album?.slots || {}).reduce((n, x) => n + Object.values(x).reduce((a, b) => a + Object.keys(b).length, 0), 0);
  const throwBall = async (dx = 90, dy = -170) => { const b = world().ballScreen(); log(`ACTION drag ball (${Math.round(b.x)},${Math.round(b.y)}) → (${Math.round(b.x + dx)},${Math.round(b.y + dy)})`); await dragAt(b.x, b.y, b.x + dx, b.y + dy, 170, 8); };
  const goWorld = async () => { qa('.snap-result,.levelup,.sheet,.sheet-back').forEach(e => e.remove()); if (route() !== 'snap') await nav('snap'); await wait(700); };
  const earn = async n => { for (let k = 0; k < n; k++) { await throwBall(60 + k * 14, -150); await wait(1500); await snapBtn(); await wait(3300); const card = q('.snap-result .card'); log(`SNAPRESULT score=${q('.photo-dims b')?.innerText} sp=${q('.sp-total b')?.innerText} lines=${JSON.stringify(qa('.sp-lines span').map(x => x.innerText))} ev=${JSON.stringify(q('.ev-line')?.innerText)} album=${JSON.stringify(q('.album-unlock')?.innerText.replace(/\n/g, ' ') || null)} cardFits=${card ? card.scrollHeight <= card.clientHeight + 2 : null} buttonsVisible=${qa('.res-actions .btn').every(b => b.getBoundingClientRect().bottom <= innerHeight)}`); if (k === 0) await shot('v21-result'); await tap('KEEP PLAYING', '.snap-result .btn'); await wait(500); } };
  const gold = () => { const c = q('.g21-canvas'); if (!c) return false; const d = c.getContext('2d').getImageData(4, 4, 1, 1).data; return d[0] > 230 && d[1] > 190 && d[2] < 130; };   // the gold frame = "SNAP now"
  const waitGold = async (on, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (gold() === on) return true; await wait(80); } return false; };
  const ballFree = async (ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const b = world().state().ball; if (b.state === 'rest' && !b.heldBy) return true; await wait(300); } return false; };
  const clockShift = ms => { const R0 = Date, OFF = ms; class D extends R0 { constructor(...a) { if (!a.length) super(R0.now() + OFF); else super(...a); } static now() { return R0.now() + OFF; } } window.Date = D; log(`ACTION QA clock shift +${(ms / 864e5).toFixed(2)} days (event window not live today — logged)`); };

  if (PROFILE !== 'seed') { log('ACTION reload to ?profile=seed (device tours never use the owner save)'); location.replace(location.pathname + '?profile=seed'); return; }
  await wait(2500); qa('.w21-coach button').forEach(b => b.click());
  const err = []; window.addEventListener('error', e => err.push(e.message)); window.addEventListener('unhandledrejection', e => err.push(String(e.reason)));
  const done = () => log(`PLAN-DONE ${plan} taps=${taps} drags=${drags} errors=${JSON.stringify(err)} shutters=${JSON.stringify(shutters())} route=${route()}`);

  if (plan === 'v21core') {
    const nb = rect(q('.navbar')), st0 = rect(q('.w21-stage')), snapIc = rect(q('.nav-snap .ni')), win = rect(q('.nav-wins .ni'));
    R('layout', { vw: innerWidth, vh: innerHeight, stagePctOfUsable: Math.round(100 * st0.h / nb.top), stagePctOfViewport: Math.round(100 * st0.h / innerHeight), hudH: Math.round(rect(q('.w21-hud')).h), snapDiam: Math.round(snapIc.w), otherNavIcon: Math.round(win.w), snapAboveBar: snapIc.top < nb.top, snapVisible: snapIc.top >= 0 && snapIc.bottom <= innerHeight, hscroll: document.documentElement.scrollWidth > innerWidth,
      shutters: shutters(), locChip: !!q('.w21-loc'), locStrip: !!q('.loc-tabs'), giantInteract: !!q('.side-btn,.snap-cluster'), navOrder: qa('.navbar [data-nav]').map(b => b.dataset.nav).join(','), label: getComputedStyle(document.body, '::after').content });
    await shot('v21-world'); await wait(4000); await shot('v21-world-alive');
    await tap('Location', '.w21-loc'); await shot('v21-location'); R('locationSheet', { rows: qa('.loc-row').length, locked: qa('.loc-row.locked').length }); qa('.sheet-back').forEach(e => e.click()); await wait(400);
    const samples = []; for (let i = 0; i < 24; i++) { samples.push(world().state().actors.map(a => [a.x, a.y, a.kind])); await wait(500); }
    R('bounds', { minX: Math.min(...samples.flat().map(a => a[0])), maxX: Math.max(...samples.flat().map(a => a[0])), minY: Math.min(...samples.flat().map(a => a[1])), maxY: Math.max(...samples.flat().map(a => a[1])), behaviours: [...new Set(samples.flat().map(a => a[2]))].length });
    const pic0 = world().furnitureScreen('picture'); let c0 = null;
    for (let tries = 0; tries < 10 && !world().state().edit; tries++) for (const o of ['couch', 'toybox', 'table']) { const f = world().furnitureScreen(o); if (!f || world().state().edit) continue; if (world().state().actors.some(a => Math.abs(a.x - f.px) < 0.17 && a.y > f.py - 0.25 && a.y < f.py + 0.15)) { await wait(1200); continue; }   // a Poka in front correctly wins the touch
      log(`ACTION long-press ${o} (750 ms) → Edit Room`); { const t = ptr('pointerdown', f.x, f.y, 1); await wait(750); ptr('pointerup', f.x, f.y, 0, t); await wait(500); } if (world().state().edit) { c0 = f; break; } }
    R('editOn', world().state().edit); await shot('v21-edit-room');
    await dragAt(c0.x, c0.y, c0.x + 110, c0.y + 40, 500, 12); await tap('Rotate', '.w21-editbar button'); await shot('v21-rotated');
    await tapAt(pic0.x, pic0.y); await dragAt(pic0.x, pic0.y, pic0.x - 60, pic0.y + 10, 300, 8); await tap('Rotate', '.w21-editbar button'); await tap('Done', '.w21-editbar .eb-done'); await wait(800);
    const c1 = world().furnitureScreen('couch'), p1 = world().furnitureScreen('picture');
    R('furniture', { movedCouch: Math.abs(c1.px - c0.px) > 0.05, rotatedCouch: c1.rot !== c0.rot, movedPicture: Math.abs(p1.px - pic0.px) > 0.02, couchX: [c0.px, c1.px], couchRot: [c0.rot, c1.rot], pictureX: [pic0.px, p1.px] });
    const M = await import('../game/room.js'); R('perspective', { wall: [0.2, 0.3, 0.45].map(y => +M.scaleOf({ obj: 'picture', y }).toFixed(3)), floor: [0.6, 0.8, 0.95].map(y => +M.scaleOf({ obj: 'couch', y }).toFixed(3)) });
    const balls = []; for (const [dx, dy] of [[90, -170], [-110, -140], [40, -200]]) { await ballFree(); await throwBall(dx, dy); await wait(350); const fly = world().state().ball; await wait(2300); const s = world().state(); balls.push({ flew: fly.state === 'flying', restIn: s.ball.x >= 0.1 && s.ball.x <= 0.9 && s.ball.y >= 0.6 && s.ball.y <= 0.97, reactions: s.actors.map(a => `${a.name}(${a.personality}/${a.trait}):${a.reaction}`) }); if (balls.length === 1) await shot('v21-ball-reaction'); await wait(2500); }
    R('ball', balls);
    await tap('Food', '.w21-tool'); await tap('Fish', '.food-btn'); { const cv = rect(q('.w21-canvas')); await tapAt(cv.left + cv.w * 0.55, cv.top + cv.h * 0.86); } await wait(2500); R('food', { bowls: world().state().bowls, reactions: world().state().actors.map(a => `${a.name}:${a.reaction}`) }); await shot('v21-food');
    { const cv = rect(q('.w21-canvas')), y = save().v21.rooms.living_room.find(o => o.obj === 'yarn'); await dragAt(cv.left + y.x * cv.w, cv.top + (y.y - 0.03) * cv.h, cv.left + y.x * cv.w + 130, cv.top + (y.y - 0.03) * cv.h - 10, 500, 10); await wait(1200); R('toy', { moved: Math.abs(save().v21.rooms.living_room.find(o => o.obj === 'yarn').x - y.x) > 0.05, states: world().state().actors.map(a => `${a.name}:${a.kind}`) }); }
    { let p = world().petScreen(1); await tapAt(p.x, p.y); const boop = q('.w21-bubble')?.innerText; p = world().petScreen(1); await dragAt(p.x - 40, p.y, p.x + 40, p.y, 400, 8); const stroke = q('.w21-bubble')?.innerText;
      for (let tries = 0; tries < 5 && !qa('.food-btn').filter(vis).some(b => b.innerText.includes('Poke')); tries++) { p = world().petScreen(1); log(`ACTION long-press Poka at its CURRENT position (try ${tries + 1}) → small action menu`); const t = ptr('pointerdown', p.x, p.y, 1); await wait(700); ptr('pointerup', p.x, p.y, 0, t); await wait(500); } await tap('Poke', '.food-btn'); const poke = q('.w21-bubble')?.innerText; await tap('Call', '.w21-tool'); R('touch', { boop, stroke, poke, call: q('.w21-bubble')?.innerText }); }
    const turnsB = save().v2?.turns?.n; const cards = [];
    for (let k = 0; k < 4; k++) { const ab = albumCount(save()); await throwBall(60 + k * 30, -160); await wait(1600); await snapBtn(); await wait(3300); const card = q('.snap-result .card'); const btns = qa('.res-actions .btn').map(b => b.getBoundingClientRect());
      cards.push({ score: q('.photo-dims b')?.innerText, sp: q('.sp-total b')?.innerText, lines: qa('.sp-lines span').map(x => x.innerText), ev: q('.ev-line')?.innerText, album: q('.album-unlock')?.innerText.replace(/\n/g, ' ') || null, dup: q('.dup-line')?.innerText || null, unlockImg: !!q('.au-card img')?.src, buttonsVisible: btns.every(b => b.top >= 0 && b.bottom <= innerHeight), cardFits: card ? card.scrollHeight <= card.clientHeight + 2 : null, albumDelta: albumCount(save()) - ab });
      if (k === 0) { await shot('v21-result'); } await tap('KEEP PLAYING', '.snap-result .btn'); await wait(600); }
    R('economy', { cards, turnsBefore: turnsB, turnsAfter: save().v2?.turns?.n, maxAlbumDeltaPerPhoto: Math.max(...cards.map(c => c.albumDelta)), spTotal: save().v21.sp });
    await nav('album'); await wait(1000); await shot('v21-album'); R('album', { header: q('.tab-head .sub')?.innerText, sets: qa('.setcard').length, locked: qa('.setcard.locked').length, dailyLine: qa('.tab-body p.small').map(x => x.innerText).find(t => /New Album photos today/.test(t)) });
    const setName = (cards.find(c => c.album) || {}).album || ''; const want = (setName.match(/(Playtime|Best Friends|Fashion Week|Mealtime|Cozy Home|Racing Stars|Builder Crew|Rare Moments|Funny Faces)/) || [''])[0];
    await tap(want, '.setcard'); await wait(1200); await shot('v21-album-set'); R('albumSet', { set: q('.tab-head h1')?.innerText, cards: qa('.acard').length, got: qa('.acard.got').length, realPhotoCards: qa('.acard.got .aphoto img').length });
    done(); return;
  }
  if (plan === 'v21tabs') {
    const per = {}; const seen = async (name, fn) => { try { await fn(); await wait(900); per[name] = shutters(); } catch (e) { per[name] = 'ERR ' + e.message; } };
    await seen('world', async () => {}); await seen('wins', () => nav('wins')); await shot('v21-wins'); R('wins', { sections: qa('.win-sec .sec-head h2').map(h => h.innerText), goals: qa('.win .win-top b').map(b => b.innerText) });
    const c0 = save().progress.coins; if (qa('.btn.claim').length) { await tap('CLAIM', '.btn.claim'); await wait(700); qa('.celebrate').forEach(e => e.click()); R('winClaim', { paid: save().progress.coins - c0 }); const V = await import('../game/v2.js'), S = await import('../game/state.js'); const all = (w => [...w.day, ...w.week, ...w.road])(V.winsView(S.get())), cl = all.find(x => x.claimed); let r; S.update(x => { r = V.claimWin(x, cl.claimId); }); R('winClaimAgain', r.reason); }
    await seen('poka', () => nav('poka')); await shot('v21-poka'); R('poka', { grid: qa('.pcell').length, links: qa('.link-grid button span').map(x => x.innerText) });
    await seen('training', () => tap('Training', '.link-grid button')); await shot('v21-training'); R('training', qa('.train-card b').map(b => b.innerText));
    await seen('profile', async () => { await nav('poka'); await tap('Milo', '.pcell'); }); await shot('v21-profile'); R('profile', { h1: q('h1')?.innerText, labelsWrapped: qa('.brow .k').some(k => k.getBoundingClientRect().height > 24) });
    await seen('pets', () => nav('pets')); await shot('v21-pets'); R('pets', qa('.card b').map(b => b.innerText));
    await seen('album', () => nav('album')); await seen('event hub', async () => { await goWorld(); await tap('', '.w21-event'); }); await shot('v21-event-hub'); R('eventHub', { conv: q('.conv-row')?.innerText.replace(/\n/g, ' '), milestones: qa('.win .win-top b').map(b => b.innerText) });
    await seen('poka shop', async () => { await goWorld(); await tap('coins', '.w21-hud .cur.coins'); }); await shot('v21-shop'); R('shop', { route: route(), h1: q('h1')?.innerText });
    R('shuttersPerScreen', per); const bad = []; for (const r of ['snap', 'wins', 'poka', 'pets', 'album', 'event21', 'store', 'training21']) { app.go(r); await wait(700); bad.push(...[...document.body.innerText.matchAll(/\b(undefined|NaN|null)\b|\b[a-z]+_[a-z_]+\b|\[object Object\]/g)].map(m => r + ':' + m[0])); } R('copy', [...new Set(bad)]);
    done(); return;
  }
  if (plan.startsWith('v21g:')) {
    const id = plan.split(':')[1]; const M = await import('../game/core21.js');
    if (id !== 'racing') { const now = Date.now(); let off = null; for (let hh = 0; hh < 24 * 40; hh++) { const e = M.eventAt(now + hh * 3600e3); if (e.id === id) { off = e.start + (e.end - e.start) / 2 - now; break; } } clockShift(Math.round(off)); }
    await wait(500); await goWorld(); await earn(id === 'puzzle' ? 4 : id === 'racing' ? 3 : 2);
    R('sp', save().v21.sp); await tap('', '.w21-event'); await wait(900); R('hubConversion', q('.conv-row')?.innerText.replace(/\n/g, ' ')); await shot('v21-g-hub'); await tap('PLAY', '.btn.big'); await wait(1200); R('teamPanel', q('.team-panel')?.innerText.replace(/\n/g, ' ') || null); await shot('v21-g-' + id);
    const cv = () => rect(q('.g21-canvas'));
    if (id === 'racing') { await tap('RUN', '.g21-start .btn'); const t0 = Date.now(); for (let k = 0; k < 90; k++) { const c = cv(); await tapAt(c.left + c.w / 2, c.top + c.h * 0.55); await wait(240); if (q('.g21-finish')) break; } R('race', { seconds: +((Date.now() - t0) / 1000).toFixed(1), end: q('.g21-finish')?.innerText.replace(/\n/g, ' | ') || 'no finish' }); await shot('v21-g-race-done'); }
    if (id === 'build') { const tr = rect(q('.build-tray .piece')), c = cv(), before = q('.build-tray span')?.innerText; log('ACTION drag Build piece to the glowing spot'); await dragAt(tr.x, tr.y, c.left + c.w * 0.2, c.top + c.h * 0.78, 600, 14); await wait(1500); R('build', { toast: document.getElementById('toast')?.innerText, actionsBefore: before, actionsAfter: q('.build-tray span')?.innerText, note: 'guest session: server requires a signed-in account, the Build Action is returned' }); }
    if (id === 'puzzle') { const m0 = q('.g21-hud .chip')?.innerText; let n = 0; for (let i = 0; i < 12; i++) { const d = qa('.dig:not(.dug)'); if (!d.length || /^0 /.test(q('.g21-hud .chip')?.innerText || '')) break; const e = d[Math.floor(d.length / 2) + (i % 3)] || d[0]; const c = rect(e); await tapAt(c.x, c.y); n++; await wait(500); } R('puzzle', { digs: n, movesBefore: m0, movesAfter: q('.g21-hud .chip')?.innerText, hints: qa('.dig.dug').map(d => d.innerText || '?').join('') }); await shot('v21-g-puzzle-play'); }
    if (id === 'fashion') { await tap('', '.outfit-grid .chipbtn').catch(() => {}); R('fashionPrep', { theme: q('.g21-start p b')?.innerText, match: qa('.g21-start p.small').map(x => x.innerText).find(t => /Theme match/.test(t)) }); await tap('WALK', '.btn.big'); const peaks = []; for (let k = 0; k < 3; k++) { const on = await waitGold(true, 5000); if (on) { await snapBtn(); peaks.push('snapped at gold'); await waitGold(false, 3000); } else peaks.push('no gold frame seen'); } R('fashionPeaks', peaks); await wait(3500); R('fashion', q('.g21-finish')?.innerText.replace(/\n/g, ' | ') || q('.snap-result')?.innerText.replace(/\n/g, ' | ').slice(0, 220)); await shot('v21-g-fashion-result'); }
    if (id === 'dance') { R('danceStart', { padsHidden: q('.dance-pads').hidden, startCovered: (b => { const r = rect(b), t = document.elementFromPoint(r.x, r.y); return !(t === b || b.contains(t)); })(q('.g21-start .btn')) }); await tap('DANCE', '.g21-start .btn'); await wait(3600); const pr = rect(q('.dance-pads')), ov = rect(q('.g21-overlay')); R('dancePads', { padsVisible: !q('.dance-pads').hidden, instructionsOverlapPads: !!q('.g21-overlay').innerText.trim() && ov.bottom > pr.top + 1 }); await shot('v21-g-dance');
      const pads = qa('.dance-pads .pad').map(rect); for (let beat = 0; beat < 16 && q('.navbar .nav-snap').dataset.state !== 'challenge'; beat++) for (const p of pads) { await tapAt(p.x, p.y); await wait(100); } for (let k = 0; k < 40 && q('.navbar .nav-snap').dataset.state !== 'challenge'; k++) await wait(300); await snapBtn(); await wait(3500); R('dance', q('.g21-finish')?.innerText.replace(/\n/g, ' | ') || q('.snap-result')?.innerText.replace(/\n/g, ' | ').slice(0, 220)); await shot('v21-g-dance-result'); }
    done(); return;
  }
  if (plan === 'v21train') {
    await nav('poka'); await tap('Training', '.link-grid button'); R('hub', qa('.train-card b').map(b => b.innerText));
    await tap('Agility', '.train-card'); await tap('START PRACTICE', '.g21-start .btn'); { const t0 = Date.now(); for (let k = 0; k < 70; k++) { const c = rect(q('.g21-canvas')); await tapAt(c.left + c.w / 2, c.top + c.h * 0.55); await wait(240); if (q('.g21-finish')) break; } R('agility', { seconds: +((Date.now() - t0) / 1000).toFixed(1), end: q('.g21-finish')?.innerText.replace(/\n/g, ' | ') || 'no finish' }); await shot('v21-t-agility'); }
    qa('.levelup').forEach(e => e.remove()); await tap('Back', '[aria-label="Back"]'); await wait(600);
    await tap('Fetch', '.train-card'); await wait(700); { const c = rect(q('.g21-canvas')); for (let t = 0; t < 5; t++) { await dragAt(c.left + c.w * 0.3, c.top + c.h * 0.9, c.left + c.w * 0.65, c.top + c.h * 0.9 - 140, 200, 8); await wait(4000); } for (let k = 0; k < 90 && !q('.g21-finish'); k++) await wait(300); R('fetch', q('.g21-finish')?.innerText.replace(/\n/g, ' | ') || 'in progress'); await shot('v21-t-fetch'); }
    qa('.levelup').forEach(e => e.remove()); await tap('Back', '[aria-label="Back"]'); await wait(600);
    await tap('Posing', '.train-card'); await wait(700); const gl = []; for (let cue = 0; cue < 5; cue++) { await tap('CUE', '.g21-cue'); gl.push(await waitGold(true, 4000)); await snapBtn(); await wait(1100); qa('.snap-result').forEach(e => e.remove()); } R('poseGold', gl); await wait(1500); R('pose', q('.g21-finish')?.innerText.replace(/\n/g, ' | ') || 'no finish'); await shot('v21-t-pose');
    qa('.levelup').forEach(e => e.remove()); await tap('Back', '[aria-label="Back"]'); await wait(600);
    await tap('Building', '.train-card'); await wait(700); for (let k = 0; k < 6; k++) { const c = rect(q('.g21-canvas')); await tapAt(c.left + c.w / 2, c.top + c.h * 0.4); await wait(900 + k * 137); } R('build', q('.g21-finish')?.innerText.replace(/\n/g, ' | ') || 'in progress');
    qa('.levelup').forEach(e => e.remove()); await tap('Back', '[aria-label="Back"]'); await wait(600);
    await tap('Dance', '.train-card'); await wait(700); { await tap('PRACTICE', '.g21-start .btn'); await wait(3600); const pads = qa('.dance-pads .pad').map(rect); for (let beat = 0; beat < 16 && q('.navbar .nav-snap').dataset.state !== 'challenge'; beat++) for (const p of pads) { await tapAt(p.x, p.y); await wait(100); } for (let k = 0; k < 40 && q('.navbar .nav-snap').dataset.state !== 'challenge'; k++) await wait(300); await snapBtn(); await wait(3500); R('dancePractice', q('.g21-finish')?.innerText.replace(/\n/g, ' | ') || 'no finish'); }
    R('levels', save().v21.training);
    done(); return;
  }
  if (plan === 'v21persist-a' || plan === 'v21persist-b') {
    const st = save(), rec = { coins: st.progress.coins, sp: st.v21.sp, photos: (st.world.photos || []).length, album: albumCount(st), couch: st.v21.rooms.living_room.find(o => o.obj === 'couch'), events: Object.values(st.v21.events || {}).map(w => ({ made: w.made, spent: w.spent, progress: w.progress })), wins: Object.keys(st.ledger?.ids || {}).filter(k => k.startsWith('wins:')).length, training: st.v21.training };
    R(plan, rec); await goWorld(); await shot(plan); done(); return;
  }
  log(`PLAN unknown ${plan}`); done();
}
