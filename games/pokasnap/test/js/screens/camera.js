/* CAMERA — the heart of PokaSnap.
   ---------------------------------------------------------------------------
   Preview = the live <video> (hardware-rendered, smooth) with the pet drawn on
   a transparent canvas above it. Capture re-draws the SAME visible crop of the
   video at camera resolution and the SAME pet transform scaled to match, so the
   saved photo is exactly what the player framed -- by construction, not by
   hoping two render paths agree. UI chrome is DOM and never enters the photo.

   Gestures on the pet:  drag = move · pinch = resize + rotate · tap = poke
                         long-press = pose selector
   No camera (denied, missing, desktop without one): the player can pick a
   photo from their library or use a built-in scene -- the game never dead-ends. */

import { drawPet } from '../render/pet.js';
import { pose as poseOf, POSES, POSE_ORDER } from '../data/poses.js';
import { mission as missionOf, dailyMissionFor } from '../data/missions.js';
import { dailyPrompt } from '../game/adventure.js';
import { drawFrame, drawProp, drawBackdrop, applyLook, drawEffect, LOOKS, EFFECTS } from '../render/items.js';
import { ITEMS, item as itemOf } from '../data/items.js';
import { gateUnlocked, GATES } from '../data/progression.js';
import { hasAccess } from '../game/entitlements.js';
import { perkTotals } from '../game/build.js';
import * as Wd from '../game/world.js';
import { PACK } from '../data/world.js';
import '../data/challenges.js';
import { RARE } from '../data/economy.js';
import { line, reaction } from '../data/personality.js';
import { get } from '../game/state.js';
import { poseAvailable } from '../game/progress.js';
import { skill as skillOf } from '../data/skills.js';
import { track } from '../platform/analytics.js';
import { haptic } from '../platform/native.js';
import { sfx } from '../platform/sound.js';
import { h, sheet, toast } from '../ui.js';

const PIVOT_Y = -175;          // pet-space y of the rotation/scale centre (mid-body)
const PET_H = 380;             // approximate pet height in pet units

export function cameraScreen(app, { missionId, daily = false, journey = false, meal = false }) {
  const st = get(), pet = st.pet, m = daily ? dailyMissionFor(dailyPrompt()) : missionOf(missionId);
  // 1.4 pack photos: active companions stand beside the lead pet (from level 20)
  const companions = (st.progress.level || 1) >= PACK.multiPhotoLevel ? Wd.activePets(st).filter(p => p.id !== pet.id) : [];
  let packOn = companions.length > 0;
  const COMP_POSE = ['sit', 'happy', 'wave'];
  const frameItem = pet.equipped?.FRAME || null;
  let rare = null, rareUntil = 0, nextRareAt = performance.now() + 9000 + Math.random() * 7000;   // the first one comes soon
  let facing = m.camera === 'front' ? 'user' : 'environment';
  let stream = null, raf = 0, alive = true, source = null;   // source: video | img element
  let poseId = 'idle';
  let squash = 0, pokedAt = -1e9, blinkUntil = 0, nextBlink = performance.now() + 2500;
  let pokeIdx = 0, dblIdx = 0, lastTapAt = 0;
  const T = { x: 0, y: 0, s: 1, r: 0, flip: 1 };
  // ---- 1.3 studio: props (L20), filters & effects (L40), backdrops ----
  const lvl = st.progress.level || 1, perks = perkTotals(st).total;
  let propIt = null, propMode = null, propT0 = 0, catchAt = 0, placeAt = null;   // propMode: 'air' | 'held' | 'placed'
  let filterIt = null, backdropIt = null;
  const CATCH_WINDOW = 1100 * (1 + (perks.propWindow || 0));
  const FLIGHT_MS = 850;

  track('mission_started', { mission: m.missionID });

  // ------------------------------------------------------------ DOM ----
  const video = h('video', { playsinline: '', muted: '', autoplay: '' });
  video.muted = true; video.setAttribute('playsinline', ''); video.setAttribute('webkit-playsinline', '');
  const still = h('img', { class: 'still', alt: '' }); still.hidden = true;
  const overlay = h('canvas', { class: 'overlay', 'aria-label': 'Your pet. Drag to move, pinch to resize, tap to poke.' });
  const flash = h('div', { class: 'flash' });
  const hint = h('div', { class: 'cam-hint' }, 'Drag · pinch · tap to poke · hold for poses');
  const loading = h('div', { class: 'cam-loading', role: 'status' }, h('div', { class: 'spin' }), 'Starting camera…');
  const rareBanner = h('div', { class: 'rare-banner', role: 'status', 'aria-live': 'polite' }); rareBanner.hidden = true;
  const bubble = h('div', { class: 'bubble', style: 'position:absolute;display:none;pointer-events:none;transform:translate(-50%,-100%);z-index:3' });
  const blocked = h('div', { class: 'cam-blocked' }); blocked.hidden = true;
  const torchBtn = h('button', { class: 'icon-btn', 'aria-label': 'Flash', onclick: toggleTorch }, '⚡'); torchBtn.hidden = true;

  const root = h('div', { class: 'cam' },
    video, still, overlay, bubble, flash, hint, loading, rareBanner, blocked,
    h('div', { class: 'cam-top' },
      h('button', { class: 'icon-btn', 'aria-label': 'Close camera', onclick: () => app.go('home') }, '✕'),
      h('div', { class: 'mission-card' }, daily ? h('span', { class: 'mc-tag' }, '☀️ DAILY SNAP') : journey ? h('span', { class: 'mc-tag' }, '🥾 JOURNEY SNAP') : null,
        h('b', {}, `${m.icon} ${m.title}`), h('span', {}, m.instruction),
        h('span', { class: 'mc-pose' }, m.anySkill ? 'Best pose: 🎓 any trained trick' : `Best pose: ${poseOf(m.recommendedPose).icon} ${poseOf(m.recommendedPose).name}`),
        needs(m.req) ? h('span', { class: 'mc-needs' }, '✔ Needs: ' + needs(m.req)) : null)),
    h('div', { class: 'cam-side' },
      h('button', { class: 'icon-btn', 'aria-label': 'Switch camera', onclick: flipCamera }, '🔄'),
      torchBtn,
      h('button', { class: 'icon-btn', 'aria-label': 'Mirror pet', onclick: () => { T.flip *= -1; sfx.tap(); } }, '↔️'),
      h('button', { class: 'icon-btn', 'aria-label': 'Reset pet', onclick: () => { placeDefault(); sfx.tap(); } }, '🎯'),
      h('button', { class: 'icon-btn', 'aria-label': 'Self-timer: snap in 3 seconds', onclick: () => selfTimer() }, '⏱')),
    h('div', { class: 'cam-studio' },
      studioBtn('🎾', 'PROP', 'props', openProps),
      studioBtn('🎞️', 'FILTER', 'filters', openFilters),
      studioBtn('🖼️', 'SCENE', null, openScenes),
      companions.length ? h('button', { class: 'cam-chip on', onclick: e => { packOn = !packOn; e.currentTarget.classList.toggle('on', packOn); e.currentTarget.lastChild.textContent = packOn ? ` PACK ${companions.length + 1}` : ' SOLO'; sfx.tap(); } }, '🐾', ` PACK ${companions.length + 1}`) : null),
    h('div', { class: 'cam-bottom' },
      h('button', { class: 'cam-action', onclick: openPoses, 'aria-label': 'Choose a pose' }, h('div', { class: 'disc' }, '🎭'), 'POSE'),
      h('button', { class: 'shutter', onclick: snap, 'aria-label': 'Take photo' }, '📸'),
      h('button', { class: 'cam-action', onclick: () => poke(true), 'aria-label': 'Poke your pet' }, h('div', { class: 'disc' }, '👆'), 'POKE')),
  );
  app.mount(root, { full: true });
  setTimeout(() => { hint.style.opacity = '0'; }, 4200);

  // ------------------------------------------------------------ camera ----
  async function startCamera() {
    stopStream();
    blocked.hidden = true;
    if (!navigator.mediaDevices?.getUserMedia) return showBlocked('nocam');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } } });
      if (!alive) return stopStream();
      video.srcObject = stream; still.hidden = true; video.hidden = false;
      video.classList.toggle('mirror', facing === 'user');
      await video.play().catch(() => {});
      source = video; loading.hidden = true;
      const track0 = stream.getVideoTracks()[0];
      const caps = track0?.getCapabilities?.() || {};
      torchBtn.hidden = !caps.torch;
    } catch (e) {
      showBlocked(e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'denied' : 'nocam');
    }
  }
  function stopStream() { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } }
  function flipCamera() { if (still.hidden === false && !stream) return; facing = facing === 'user' ? 'environment' : 'user'; sfx.tap(); startCamera(); }
  let torchOn = false;
  async function toggleTorch() {
    const t = stream?.getVideoTracks()[0]; if (!t) return;
    torchOn = !torchOn;
    try { await t.applyConstraints({ advanced: [{ torch: torchOn }] }); } catch (e) { torchOn = false; }
    torchBtn.style.background = torchOn ? '#ffe27a' : '';
  }

  function showBlocked(why) {
    loading.hidden = true;
    blocked.hidden = false; video.hidden = true;
    blocked.replaceChildren(
      h('div', { style: 'font-size:56px' }, why === 'denied' ? '📷' : '🌤️'),
      h('h2', { style: 'color:#fff;margin:0' }, why === 'denied' ? 'Camera is turned off' : 'No camera found'),
      h('p', {}, why === 'denied'
        ? 'PokaSnap uses your camera so you can take photos with your pet. You can allow it in Settings — or play with a photo instead!'
        : 'You can still play! Pick a photo from your library or use a fun scene.'),
      h('button', { class: 'btn block', onclick: () => pickPhoto() }, '🖼️ Use a photo'),
      h('button', { class: 'btn sun block', onclick: () => useScene() }, '🌳 Use a fun scene'),
      why === 'denied' ? h('button', { class: 'linkbtn', style: 'color:#fff', onclick: startCamera }, 'Try the camera again') : null,
    );
  }
  function pickPhoto() {
    const inp = h('input', { type: 'file', accept: 'image/*' });
    inp.onchange = () => { const f = inp.files?.[0]; if (f) useImage(URL.createObjectURL(f)); };
    inp.click();
  }
  function useImage(src) {
    stopStream();
    still.onload = () => { loading.hidden = true; blocked.hidden = true; still.hidden = false; video.hidden = true; still.classList.remove('mirror'); source = still; };
    still.src = src;
  }
  function useScene() { useImage(sceneDataURL()); }

  // ------------------------------------------------------------ layout ----
  let W = 0, H = 0, dpr = 1;
  function resize() {
    const r = root.getBoundingClientRect(); W = r.width; H = r.height;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    overlay.width = Math.round(W * dpr); overlay.height = Math.round(H * dpr);
    if (!T.s || T.s === 1) placeDefault();
  }
  function placeDefault() {
    const want = m.size === 'big' ? 0.7 : m.size === 'tiny' ? 0.16 : 0.42;
    T.s = (H * want) / PET_H; T.r = 0;
    T.x = W / 2; T.y = H * (m.size === 'big' ? 0.5 : 0.6);
  }
  window.addEventListener('resize', resize);

  // ------------------------------------------------------------ draw ----
  function petMatrix(ctx) {
    ctx.translate(T.x, T.y); ctx.rotate(T.r); ctx.scale(T.s * T.flip, T.s); ctx.translate(0, -PIVOT_Y);
  }
  let lastBox = null;
  function frame(now) {
    if (!alive) return;
    const ctx = overlay.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    if (now > nextBlink) { blinkUntil = now + 140; nextBlink = now + 2200 + Math.random() * 2600; }
    squash *= 0.86;
    ctx.save(); petMatrix(ctx);
    propTick(now);
    const r = drawPet(ctx, pet, curPose(now), { t: now / 1000, blink: now < blinkUntil, squash: squash > 0.02 ? Math.sin(squash * Math.PI) * squash : 0, held: propMode === 'held', drawHeld: c => drawProp(c, propIt, now / 1000) });
    drawCompanions(ctx, now);
    ctx.restore();
    lastBox = r.bbox;
    drawLoosePropScreen(ctx, now);
    if (filterIt) { applyLook(ctx, filterIt, W, H); drawEffect(ctx, filterIt, W, H, now / 1000); }
    if (frameItem) drawFrame(ctx, frameItem, W, H, now / 1000);
    rareTick(now);
    placeBubble();
    raf = requestAnimationFrame(frame);
  }

  // pet-space -> screen
  function toScreen(px, py) {
    const y0 = py - PIVOT_Y, x0 = px * T.s * T.flip, y1 = y0 * T.s;
    const c = Math.cos(T.r), s = Math.sin(T.r);
    return { x: T.x + x0 * c - y1 * s, y: T.y + x0 * s + y1 * c };
  }
  function screenBox(b) {
    const pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].map(([x, y]) => toScreen(x, y));
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  function hitPet(x, y) {
    if (!lastBox) return false;
    const b = screenBox(lastBox), pad = 16;
    return x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;
  }

  // ------------------------------------------------------------ gestures ----
  const ptrs = new Map();
  let drag = null, pinch = null, press = null;
  overlay.addEventListener('pointerdown', e => {
    try { overlay.setPointerCapture(e.pointerId); } catch (_) { /* synthetic/cancelled pointer: carry on */ }
    const p = { x: e.clientX, y: e.clientY };
    ptrs.set(e.pointerId, p);
    if (ptrs.size === 1) {
      const onPet = hitPet(p.x, p.y);
      drag = onPet ? { ox: p.x - T.x, oy: p.y - T.y, sx: p.x, sy: p.y, moved: false } : null;
      press = onPet ? { t: performance.now(), timer: setTimeout(() => { if (drag && !drag.moved) { drag = null; openPoses(); haptic('medium'); } }, 480) } : null;
    } else if (ptrs.size === 2) {
      clearTimeout(press?.timer); press = null; drag = null;
      const [a, b] = [...ptrs.values()];
      pinch = { d: Math.hypot(b.x - a.x, b.y - a.y), a: Math.atan2(b.y - a.y, b.x - a.x), s: T.s, r: T.r, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, x: T.x, y: T.y };
    }
  });
  overlay.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(b.x - a.x, b.y - a.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
      T.s = clampScale(pinch.s * d / pinch.d);
      T.r = pinch.r + (ang - pinch.a);
      T.x = pinch.x + ((a.x + b.x) / 2 - pinch.mx); T.y = pinch.y + ((a.y + b.y) / 2 - pinch.my);
    } else if (drag) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 8) { drag.moved = true; clearTimeout(press?.timer); }
      if (drag.moved) { T.x = e.clientX - drag.ox; T.y = e.clientY - drag.oy; }
    }
  });
  const up = e => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (drag && !drag.moved && press && performance.now() - press.t < 480) {
      const now = performance.now();
      if (now - lastTapAt < 320) { lastTapAt = 0; poke(false, 'double'); } else { lastTapAt = now; poke(false); }
    }
    clearTimeout(press?.timer); press = null;
    if (ptrs.size === 0) drag = null;
  };
  overlay.addEventListener('pointerup', up); overlay.addEventListener('pointercancel', up);
  overlay.addEventListener('wheel', e => {           // desktop: wheel = size, shift+wheel = rotate
    e.preventDefault();
    if (e.shiftKey) T.r += e.deltaY * 0.004; else T.s = clampScale(T.s * Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  function clampScale(s) { const k = H / PET_H; return Math.max(k * 0.08, Math.min(k * 2.6, s)); }

  // ------------------------------------------------------------ poke & pose ----
  function poke(fromButton, kind = 'tap') {
    const cur = get(), can = id => POSES[id] && !POSES[id].reaction && poseAvailable(cur, id);
    poseId = reaction(pet.personality, kind, can, kind === 'double' ? dblIdx++ : pokeIdx++);
    squash = 1; pokedAt = performance.now();
    say(line(pet.personality, kind === 'double' ? 'double' : 'poke', pet.name));
    kind === 'double' ? sfx.pose() : sfx.poke(); haptic(kind === 'double' ? 'medium' : 'light');
    track('pet_poked', { pose: poseId, via: fromButton ? 'button' : 'tap', gesture: kind });
  }
  function setPose(id) { poseId = id; squash = 0.6; sfx.pose(); haptic('light'); track('pose_selected', { pose: id }); }
  function openPoses() {
    const cur = get();
    const s = sheet(
      h('h2', {}, 'Pick a pose'),
      h('p', { class: 'small', style: 'margin:0 0 12px' }, m.anySkill ? `Tip: "${m.title}" wants a trick ${pet.name} learned in Train.` : `Tip: "${m.title}" loves ${poseOf(m.recommendedPose).icon} ${poseOf(m.recommendedPose).name}.`),
      h('div', { class: 'poses' }, ...POSE_ORDER.map(id => {
        const p = POSES[id], ok = poseAvailable(cur, id), rec = id === m.recommendedPose && !m.anySkill;
        return h('button', {
          class: 'pose' + (id === poseId ? ' on' : '') + (ok ? '' : ' locked') + (rec ? ' rec' : ''),
          onclick: () => { if (!ok) { toast(p.skill ? `Teach ${pet.name} ${skillOf(p.skill)?.name || p.name} in 🎓 Train` : `${p.name}: see how to get it in the Store`); return; } setPose(id); s.close(); },
        }, h('span', { class: 'e' }, ok ? p.icon : '🔒'), p.name, ok ? (rec ? h('span', { class: 'lock' }, '★ BEST') : null) : h('span', { class: 'lock' }, p.skill ? '🎓 Train' : '🛍️ Store'));
      })));
  }

  let bubbleUntil = 0;
  function say(text) { bubble.textContent = text; bubble.style.display = 'block'; bubbleUntil = performance.now() + 1600; }
  function placeBubble() {
    if (performance.now() > bubbleUntil) { bubble.style.display = 'none'; return; }
    if (!lastBox) return;
    const b = screenBox(lastBox);
    bubble.style.left = Math.max(90, Math.min(W - 90, b.x + b.w / 2)) + 'px';
    bubble.style.top = Math.max(120, b.y - 8) + 'px';
  }

  // ------------------------------------------------------------ rare moments ----
  /* Every 25-60 s (the first within ~15 s) the pet does something rare for a
     few seconds. Snap during it for RARE MOMENT CAPTURED. Purely a bonus. */
  function rareTick(now) {
    if (rare && now >= rareUntil) { rare = null; rareBanner.hidden = true; nextRareAt = now + RARE.minGapMs + Math.random() * (RARE.maxGapMs - RARE.minGapMs); }
    if (!rare && now >= nextRareAt && source) {
      rare = RARE.moments[Math.floor(Math.random() * RARE.moments.length)];
      rareUntil = now + RARE.windowMs; squash = 0.8;
      rareBanner.textContent = `✨ Rare moment: ${rare.name}! Snap now!`; rareBanner.hidden = false;
      haptic('light'); sfx.pose();
    }
  }
  window.PokaCamera = { forceRare: id => { const mo = RARE.moments.find(x => x.id === id) || RARE.moments[0]; nextRareAt = 0; rare = null; setTimeout(() => { if (rare) return; rare = mo; rareUntil = performance.now() + RARE.windowMs * 2; rareBanner.textContent = `✨ Rare moment: ${mo.name}! Snap now!`; rareBanner.hidden = false; }, 0); } };   // QA hook

  function selfTimer() {   // pose timer: 3-2-1 then the shutter, so both hands can play with the pet
    let n = 3; say('3…'); sfx.tap();
    const iv = setInterval(() => { n--; if (!alive) return clearInterval(iv); if (n > 0) { say(n + '…'); sfx.tap(); } else { clearInterval(iv); snap(); } }, 1000);
  }
  /* Companions share the lead's transform (so framing math still describes the group). */
  function drawCompanions(ctx, now) {
    if (!packOn) return;
    companions.forEach((c, i) => { ctx.save(); ctx.translate((i % 2 ? -1 : 1) * 175 * (1 + Math.floor(i / 2) * 0.6), 30); ctx.scale(0.68, 0.68);
      drawPet(ctx, c, COMP_POSE[i % COMP_POSE.length], { t: now / 1000 + i, blink: Math.sin(now / 800 + i * 3) > 0.97 }); ctx.restore(); });
  }
  // ------------------------------------------------------------ studio (1.3) ----
  function studioBtn(icon, label, gate, fn) {
    const open = !gate || gateUnlocked(lvl, gate);
    const g = GATES.find(x => x.id === gate);
    return h('button', { class: 'cam-chip' + (open ? '' : ' locked'), onclick: () => open ? fn() : toast(`${g.icon} ${g.name} unlocks at level ${g.level}`), 'aria-label': label },
      open ? icon : '🔒', ' ', label);
  }
  const owned = slot => ITEMS.filter(it => it.slot === slot && hasAccess(get(), it.itemID));
  function pickSheet(title, list, onPick, extra) {
    const s = sheet(h('h2', {}, title), extra || null,
      h('div', { class: 'studio-grid' }, ...list.map(it => {
        const c = h('canvas', { width: 120, height: 120 }); import('../render/items.js').then(R => R.drawItemThumb(c, it.itemID));
        return h('button', { class: 'studio-item', onclick: () => { onPick(it); s.close(); } }, c, h('span', {}, it.name));
      })),
      list.length ? null : h('p', { class: 'small' }, 'Nothing here yet — earn more in the Store, Academy and events.'));
  }
  function openProps() {
    const list = owned('PROP');
    pickSheet('Prop Play', list, it => { propIt = it; propMode = null; catchAt = 0; placeAt = null; propMenu(); },
      h('p', { class: 'small', style: 'margin:0 0 10px' }, 'Pick a prop, then TOSS it (snap the catch!), GIVE it to hold, or PLACE it in the scene.'));
  }
  function propMenu() {
    const s = sheet(h('h2', {}, propIt.name),
      h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;justify-content:center' },
        h('button', { class: 'btn', onclick: () => { s.close(); toss(); } }, '🤾 TOSS'),
        h('button', { class: 'btn mint', onclick: () => { s.close(); propMode = 'held'; catchAt = 0; sfx.pose(); } }, '🤲 GIVE'),
        h('button', { class: 'btn sky', onclick: () => { s.close(); propMode = 'placed'; catchAt = 0; placeAt = { dx: 0.62, dy: 0 }; poseId = 'look'; sfx.tap(); } }, '📍 PLACE'),
        propMode === 'held' ? h('button', { class: 'btn ghost', onclick: () => { s.close(); propMode = 'placed'; placeAt = { dx: 0.35, dy: 0 }; catchAt = 0; say('Oops!'); sfx.tap(); } }, '⬇️ DROP') : null,
        propMode === 'placed' ? h('button', { class: 'btn ghost', onclick: () => { s.close(); placeAt = { dx: placeAt.dx + 0.35, dy: 0 }; poseId = 'surprised'; squash = 0.8; say('Boop!'); sfx.poke(); setTimeout(() => { poseId = 'jump'; say('Chase!'); }, 700); } }, '👉 NUDGE') : null,
        h('button', { class: 'btn ghost', onclick: () => { s.close(); propIt = null; propMode = null; } }, 'Remove')));
  }
  function toss() { propMode = 'air'; propT0 = performance.now(); catchAt = propT0 + FLIGHT_MS; sfx.tap(); haptic('light'); say('Ready…'); track('prop_toss', { prop: propIt.itemID }); }
  function propTick(now) {
    if (propMode === 'air' && now >= catchAt) { propMode = 'held'; squash = 0.8; sfx.pose(); haptic('medium'); say('Got it!'); }
  }
  function propActionAt(now) {
    if (!propIt) return null;
    if (catchAt && Math.abs(now - catchAt) <= CATCH_WINDOW) return 'catch';
    return propMode === 'held' ? 'hold' : propMode === 'placed' ? 'place' : null;
  }
  function curPose(now) {
    if (rare && now < rareUntil) return rare.pose;
    if (catchAt && now > catchAt - 250 && now < catchAt + 700) return POSES.catch && poseAvailable(get(), 'catch') ? 'catch' : 'jump';
    return poseId;
  }
  /* Air and placed props live in screen space (CSS px), sized to the pet. */
  function drawLoosePropScreen(ctx, now) {
    if (!propIt || !lastBox || (propMode !== 'air' && propMode !== 'placed')) return;
    const b = screenBox(lastBox), k = b.h / 260;
    let x, y;
    if (propMode === 'air') {
      const u = Math.min(1, (now - propT0) / FLIGHT_MS);
      const x0 = W * 0.5, y0 = H * 1.02, x1 = b.x + b.w * 0.55, y1 = b.y + b.h * 0.35;
      x = x0 + (x1 - x0) * u; y = y0 + (y1 - y0) * u - Math.sin(u * Math.PI) * H * 0.28;
    } else { x = b.x + b.w * (placeAt.dx + 0.5); y = b.y + b.h * 0.86; }
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k); if (propMode === 'air') ctx.rotate((now - propT0) / 120); drawProp(ctx, propIt, now / 1000); ctx.restore();
  }
  function openFilters() {
    const list = owned('FILTER');
    pickSheet('Creative Camera', list, it => { filterIt = it; const L = LOOKS[it.itemID]; video.style.filter = still.style.filter = L && L.css !== 'none' ? L.css : ''; track('filter_selected', { filter: it.itemID }); },
      h('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:8px' }, h('p', { class: 'small', style: 'margin:0' }, 'Filters change the whole photo. Effects add particles.'),
        h('button', { class: 'linkbtn', onclick: () => { filterIt = null; video.style.filter = still.style.filter = ''; document.querySelector('.sheet-back')?.click(); } }, 'No filter')));
  }
  function openScenes() {
    const list = owned('BG');
    pickSheet('Backdrop Studio', list, it => {
      backdropIt = it;
      const c = document.createElement('canvas'); c.width = 1080; c.height = 1440; drawBackdrop(c.getContext('2d'), it, 1080, 1440, 0);
      useImage(c.toDataURL('image/jpeg', 0.92)); track('backdrop_selected', { backdrop: it.itemID });
    }, h('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:8px' }, h('p', { class: 'small', style: 'margin:0' }, 'Photograph your pet in a studio scene instead of the camera.'),
      h('button', { class: 'linkbtn', onclick: () => { backdropIt = null; startCamera(); document.querySelector('.sheet-back')?.click(); } }, '📷 Use camera')));
  }

  // ------------------------------------------------------------ capture ----
  async function snap() {
    if (!source || (source === video && !video.videoWidth)) { toast('Camera is still starting…'); return; }
    sfx.shutter(); haptic('heavy');
    flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
    const now = performance.now();
    const out = composite(now);
    const blob = await new Promise(r => out.canvas.toBlob(r, 'image/jpeg', 0.9));
    track('photo_taken', { mission: m.missionID, pose: poseId });
    const b = screenBox(lastBox);
    const k = out.canvas.width / W;
    const snapInfo = {
      frame: { w: out.canvas.width, h: out.canvas.height },
      box: { x: b.x * k, y: b.y * k, w: b.w * k, h: b.h * k },
      rot: T.r, flipped: T.flip < 0, poseId,
      equippedCount: Object.values(pet.equipped || {}).filter(Boolean).length,
      pokedRecently: now - pokedAt < 3000,
      daily, journey, frameItem,
      rare: rare && now < rareUntil ? rare : null,
      prop: propIt?.itemID || null, propAction: propActionAt(now), catchDelta: catchAt ? now - catchAt : null,
      filter: filterIt?.itemID || null, backdrop: backdropIt?.itemID || null, at: Date.now(),
      subjects: [pet.id || 'p1', ...(packOn ? companions.map(c => c.id) : [])], meal,
    };
    alive = false; cancelAnimationFrame(raf); stopStream();
    app.go('result', { missionId: m.missionID, blob, snapInfo });
  }

  /* The photo: the visible crop of the source at native resolution, then the
     pet with the identical transform, scaled from CSS px to photo px. */
  function composite(now) {
    const src = source, iw = src.videoWidth || src.naturalWidth, ih = src.videoHeight || src.naturalHeight;
    const k = Math.max(W / iw, H / ih);                 // object-fit: cover
    const sw = W / k, sh = H / k, sx = (iw - sw) / 2, sy = (ih - sh) / 2;
    const cap = Math.min(1, 2048 / Math.max(sw, sh));
    const OW = Math.round(sw * cap), OH = Math.round(sh * cap);
    const c = document.createElement('canvas'); c.width = OW; c.height = OH;
    const ctx = c.getContext('2d');
    const mirrored = src === video && video.classList.contains('mirror');
    ctx.save();
    if (mirrored) { ctx.translate(OW, 0); ctx.scale(-1, 1); }
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, OW, OH);
    ctx.restore();
    const f = OW / W;
    ctx.save(); ctx.scale(f, f); petMatrix(ctx);
    drawPet(ctx, pet, curPose(now), { t: now / 1000, blink: false, squash: 0, held: propMode === 'held', drawHeld: c2 => drawProp(c2, propIt, now / 1000) });
    drawCompanions(ctx, now);
    ctx.restore();
    ctx.save(); ctx.scale(f, f); drawLoosePropScreen(ctx, now); ctx.restore();
    let outC = c;
    if (filterIt) {
      const L = LOOKS[filterIt.itemID];
      if (L && L.css && L.css !== 'none') { const c2 = document.createElement('canvas'); c2.width = OW; c2.height = OH; const x2 = c2.getContext('2d'); x2.filter = L.css; x2.drawImage(c, 0, 0); x2.filter = 'none'; outC = c2; }
      const xo = outC.getContext('2d'); applyLook(xo, filterIt, OW, OH); drawEffect(xo, filterIt, OW, OH, now / 1000);
    }
    const ctxo = outC.getContext('2d');
    if (frameItem) drawFrame(ctxo, frameItem, OW, OH, now / 1000);
    // a small, tasteful watermark so shared snaps carry the brand
    ctxo.save(); ctxo.font = `900 ${Math.round(OW * 0.034)}px ui-rounded, system-ui, sans-serif`;
    ctxo.fillStyle = 'rgba(255,255,255,.85)'; ctxo.shadowColor = 'rgba(0,0,0,.35)'; ctxo.shadowBlur = OW * 0.01;
    ctxo.textAlign = 'right'; ctxo.fillText('PokaSnap', OW * 0.965, OH * 0.965); ctxo.restore();
    return { canvas: outC };
  }

  // ------------------------------------------------------------ go ----
  resize();
  raf = requestAnimationFrame(frame);
  startCamera();
  say(line(pet.personality, 'mission', pet.name));

  return () => { alive = false; cancelAnimationFrame(raf); stopStream(); window.removeEventListener('resize', resize); };
}

/* One line naming a challenge's hard requirements (shown on the mission card). */
function needs(req) {
  if (!req) return '';
  const out = [];
  if (req.pose) out.push(req.poseName || req.pose); if (req.poseAny) out.push(req.poseAnyNames);
  if (req.prop) out.push((req.propAction ? { catch: 'catch ', hold: 'hold ', place: 'place ' }[req.propAction] : '') + (req.propName || 'a prop'));
  if (req.filter) out.push(req.filterName || 'a filter'); if (req.backdrop) out.push(req.backdropName);
  if (req.time) out.push(`${req.timeName} (${req.time[0]}:00–${req.time[1]}:00)`); if (req.outfitName) out.push(req.outfitName);
  if (req.equippedMin) out.push(`${req.equippedMin}+ items worn`); if (req.journey) out.push('Journey Snap'); if (req.rare) out.push('Rare Moment');
  return out.join(' · ');
}

/* A cheerful built-in park scene for players without a camera. */
function sceneDataURL() {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1440;
  const x = c.getContext('2d');
  let g = x.createLinearGradient(0, 0, 0, 900); g.addColorStop(0, '#8fd3ff'); g.addColorStop(1, '#dff3ff');
  x.fillStyle = g; x.fillRect(0, 0, 1080, 1440);
  x.fillStyle = '#fff8c4'; x.beginPath(); x.arc(860, 220, 110, 0, 7); x.fill();
  x.fillStyle = 'rgba(255,255,255,.9)';
  for (const [cx, cy, s] of [[220, 240, 1], [620, 160, .8], [420, 360, .6]]) { for (const [dx, r] of [[-60, 60], [0, 80], [70, 58]]) { x.beginPath(); x.arc(cx + dx * s, cy, r * s, 0, 7); x.fill(); } }
  x.fillStyle = '#9fdc7a'; x.beginPath(); x.moveTo(0, 820); x.quadraticCurveTo(540, 700, 1080, 820); x.lineTo(1080, 1440); x.lineTo(0, 1440); x.fill();
  x.fillStyle = '#7cc85a'; x.beginPath(); x.moveTo(0, 980); x.quadraticCurveTo(540, 880, 1080, 1000); x.lineTo(1080, 1440); x.lineTo(0, 1440); x.fill();
  x.fillStyle = '#8a5a3c'; x.fillRect(120, 560, 60, 360);
  x.fillStyle = '#5fb84a'; for (const [dx, dy, r] of [[150, 520, 140], [60, 600, 100], [250, 610, 110]]) { x.beginPath(); x.arc(dx, dy, r, 0, 7); x.fill(); }
  for (let i = 0; i < 26; i++) { const fx = (i * 173) % 1080, fy = 1040 + (i * 97) % 360; x.fillStyle = ['#ff8fb1', '#ffd84a', '#ffffff', '#b28cff'][i % 4]; for (let k = 0; k < 5; k++) { x.beginPath(); x.arc(fx + Math.cos(k * 1.26) * 12, fy + Math.sin(k * 1.26) * 12, 9, 0, 7); x.fill(); } x.fillStyle = '#ffcf33'; x.beginPath(); x.arc(fx, fy, 7, 0, 7); x.fill(); }
  return c.toDataURL('image/jpeg', 0.9);
}
