/* WALK WITH [PET] — step milestones, an optional timed Walk Session, and
   Journey Snaps that bring the walk back to photography.
   No GPS, no location, no route history: only today's step COUNT, and only
   after the player chooses to connect it. Denied / web = fully playable. */

import { h, fmt, coin, toast } from '../ui.js';
import { get, update } from '../game/state.js';
import { EARN, STEP_MILESTONES, WALK_SESSION_MILESTONES, JOURNEY } from '../data/economy.js';
import { readSteps, startSession, tickSession, endSession, journeyReady, ensure as walkState } from '../game/walk.js';
import { onWalk } from '../game/adventure.js';
import * as health from '../platform/health.js';
import { drawPet } from '../render/pet.js';
import { track } from '../platform/analytics.js';
import { sfx, music } from '../platform/sound.js';
import { haptic } from '../platform/native.js';
import { announce } from './result.js';

const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function walkScreen(app) {
  const pet = get().pet;
  let status = 'checking', alive = true, timers = [];
  const root = h('div', { class: 'screen walk' });
  const stage = h('canvas', { class: 'walk-stage', 'aria-label': `${pet.name} walking with you` });
  app.mount(root);

  async function refreshSteps() {
    const steps = await health.stepsToday(); if (steps == null || !alive) return;
    let r; update(st => { r = readSteps(st, steps); });
    const sum = { activity: [], eventRewards: [], points: 0 };
    for (const m of r.milestones) {
      track('step_milestone', { milestone: m.steps });
      toast(`🐾 ${fmt(m.steps)} steps with ${pet.name}! +${m.coins} coins${m.journey ? ' · Journey Snap ready!' : ''}`, 2600);
      let w; update(st => { w = onWalk(st, 'steps'); }); sum.activity.push(...w.activity); sum.eventRewards.push(...w.eventRewards); sum.points += w.points;
      sfx.reward(); haptic('success');
    }
    if (r.flagged) console.warn('[walk] implausible step jump ignored');
    announce(sum, 2800);
    draw();
  }
  function tick() {
    let paid; update(st => { paid = tickSession(st); });
    const sum = { activity: [], eventRewards: [], points: 0 };
    for (const p of paid) {
      toast(`⏱ ${p.minutes}-minute walk! +${p.coins} coins${p.journey ? ' · Journey Snap ready!' : ''}${p.chest ? ' · Adventure chest!' : ''}`, 2600);
      let w; update(st => { w = onWalk(st, 'session'); }); sum.activity.push(...w.activity); sum.eventRewards.push(...w.eventRewards); sum.points += w.points;
      sfx.reward(); haptic('success');
    }
    if (paid.length) { announce(sum, 2800); draw(); }
    const s = walkState(get()).session; if (s) { const el = root.querySelector('.timer'); if (el) el.textContent = mmss((Date.now() - s.start) / 1000); }
  }

  function draw() {
    const st = get(), W = walkState(st), today = W.day === new Date().toDateString() || true, steps = W.steps || 0, s = W.session;
    const nextM = STEP_MILESTONES.find(m => m > W.milestone) || null;
    const kids = [
      h('div', { class: 'row' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => app.go('home') }, '←'), h('h1', { style: 'margin:0' }, `Walk With ${pet.name}`)),
      stage,
    ];
    if (status === 'unavailable') kids.push(h('div', { class: 'card' },
      h('b', {}, '🚶 Step counting isn\'t available here'),
      h('p', { class: 'small', style: 'margin:6px 0 0' }, `Steps come from the Health app in the PokaSnap iPhone app. You can still start a timed walk below, and the Photographer and Best Friend adventures earn the same rewards.`)));
    else if (status === 'unknown') kids.push(h('div', { class: 'card perm' },
      h('b', {}, `🐾 Let ${pet.name} walk with you`),
      h('p', { style: 'margin:6px 0' }, `PokaSnap can read your **step count** from Apple Health so ${pet.name} can earn walk rewards and Journey Snaps.`.replace(/\*\*/g, '')),
      h('ul', { class: 'small perm-list' },
        h('li', {}, 'Only your step count — no heart rate, sleep, weight, calories or location.'),
        h('li', {}, 'Stays on your phone. Never used for ads.'),
        h('li', {}, 'Optional: say no and everything else still works.')),
      h('button', { class: 'btn block', onclick: async () => {
        track('walk_permission_requested', {});
        const r = await health.request(); status = r;
        track(r === 'available' ? 'walk_permission_granted' : 'walk_permission_denied', {});
        update(st => { walkState(st).permission = r; });
        await refreshSteps(); draw();
      } }, 'CONNECT STEPS'),
      h('button', { class: 'linkbtn', onclick: () => { status = 'declined'; update(st => { walkState(st).permission = 'declined'; }); track('walk_permission_denied', { via: 'not-now' }); draw(); } }, 'Not now')));
    else if (status === 'declined' || status === 'denied') kids.push(h('div', { class: 'card' },
      h('b', {}, 'Steps are off'),
      h('p', { class: 'small', style: 'margin:6px 0 0' }, `That's fine! Timed walks still work, and every other adventure path earns the same rewards. To turn steps on later: Settings › Health › Data Access & Devices › PokaSnap.`),
      h('button', { class: 'linkbtn', onclick: () => { status = 'unknown'; draw(); } }, 'Connect steps')));
    else if (status === 'available') {
      kids.push(h('div', { class: 'card steps' },
        h('div', { class: 'row between' }, h('b', {}, 'TODAY'), h('span', { class: 'small' }, nextM ? `Next: ${fmt(nextM)}` : 'All milestones done! 🎉')),
        h('p', { class: 'stepnum' }, fmt(steps), h('small', {}, ' steps')),
        h('div', { class: 'meter', role: 'progressbar', 'aria-valuenow': steps, 'aria-valuemax': 10000, 'aria-label': 'Steps today' },
          h('i', { style: `width:${Math.min(100, steps / 100)}%` }), h('span', {}, `${fmt(Math.min(steps, 10000))} / 10,000`)),
        h('div', { class: 'miles' }, ...STEP_MILESTONES.map(m => h('span', { class: 'mile' + (W.milestone >= m ? ' got' : '') }, `${W.milestone >= m ? '✓ ' : ''}${fmt(m)} · ${EARN.stepMilestones[m]} coins${m === 10000 ? ' + chest' : ''}`))),
        h('p', { class: 'small', style: 'margin:8px 0 0' }, 'Every milestone counts — 10,000 is a bonus, not a goal you need.'),
        steps === 0 ? h('p', { class: 'small', style: 'margin:6px 0 0' }, 'Still 0? If you have walked today, allow PokaSnap in Settings › Health › Data Access & Devices.') : null));
    }
    // journey
    if (journeyReady(get())) kids.push(h('div', { class: 'card journey' },
      h('b', {}, '🥾 JOURNEY SNAP READY!'),
      h('p', { style: 'margin:6px 0 10px' }, `You and ${pet.name} have been adventuring. Capture the moment.`),
      h('button', { class: 'btn block', onclick: () => app.go('camera', { missionId: 'outside_adv', journey: true }) }, '📸 TAKE A JOURNEY SNAP')));
    // session
    kids.push(s ? h('div', { class: 'card session' },
      h('div', { class: 'row between' }, h('b', {}, '⏱ WALK IN PROGRESS'), h('span', { class: 'timer' }, mmss((Date.now() - s.start) / 1000))),
      h('div', { class: 'miles' }, ...WALK_SESSION_MILESTONES.map(m => h('span', { class: 'mile' + (s.paid[m] ? ' got' : '') }, `${s.paid[m] ? '✓ ' : ''}${m} min · ${EARN.walkSession[m]} coins${m === JOURNEY.unlockAtWalkMinutes ? ' + Journey' : ''}${m === 30 ? ' + chest' : ''}`))),
      h('div', { class: 'row', style: 'margin-top:10px' },
        h('button', { class: 'btn ghost grow', onclick: () => { music.playing() ? music.stop() : music.start('walk'); draw(); } }, music.playing() ? '🔇 Music off' : '🎵 Walk music'),
        h('button', { class: 'btn grow', onclick: async () => {
          const stepsNow = await health.stepsToday(); let r; update(st => { r = endSession(st, stepsNow); });
          track('walk_session_completed', { minutes: r.minutes }); toast(`Walk complete: ${r.minutes} min${r.steps != null ? ` · ${fmt(r.steps)} steps` : ''}`, 2600); draw();
        } }, 'END WALK')))
      : h('div', { class: 'card session' },
        h('b', {}, '⏱ START A WALK'),
        h('p', { class: 'small', style: 'margin:4px 0 10px' }, `A timed walk with ${pet.name}. No GPS needed. 10 min unlocks a Journey Snap; 30 min earns an Adventure chest.`),
        h('button', { class: 'btn block big', onclick: async () => { const n = await health.stepsToday(); update(st => { startSession(st, n); }); track('walk_session_started', {}); sfx.tap(); draw(); } }, 'START WALK')));
    kids.push(h('button', { class: 'linkbtn', onclick: () => app.go('recap') }, '📋 Today\'s Adventure Recap ›'));
    root.replaceChildren(...kids);
  }

  // pet walking animation
  const loop = now => {
    if (!alive) return;
    if (stage.isConnected) {
      const r = stage.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
      if (stage.width !== Math.round(r.width * d)) { stage.width = Math.round(r.width * d); stage.height = Math.round(r.height * d); }
      const ctx = stage.getContext('2d'), W = r.width, H = r.height, t = now / 1000, moving = !!walkState(get()).session;
      ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, W, H);
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#dff3ff'); g.addColorStop(1, '#fff6ec'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#b9e59a'; ctx.fillRect(0, H * 0.78, W, H);
      ctx.fillStyle = '#9fd67f'; const off = moving ? (t * 60) % 60 : 0;
      for (let x = -60; x < W + 60; x += 60) { ctx.beginPath(); ctx.ellipse(x - off, H * 0.86, 16, 4, 0, 0, 7); ctx.fill(); }
      const k = H / 460, bob = moving ? Math.abs(Math.sin(t * 6)) * 6 : 0;
      ctx.save(); ctx.translate(W / 2, H * 0.8 - bob); ctx.scale(k, k);
      drawPet(ctx, pet, moving ? (Math.sin(t * 3) > 0 ? 'happy' : 'look') : 'idle', { t }); ctx.restore();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  (async () => {
    const saved = walkState(get()).permission;
    status = saved === 'declined' ? 'declined' : await health.status();
    draw(); if (status === 'available') await refreshSteps();
    timers.push(setInterval(() => { if (status === 'available') refreshSteps(); }, 15000));
    timers.push(setInterval(tick, 1000));
  })();
  return () => { alive = false; timers.forEach(clearInterval); };
}
