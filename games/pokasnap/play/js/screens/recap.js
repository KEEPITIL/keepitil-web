/* ADVENTURE RECAP — "Today With [Pet]": a shareable daily card.
   Steps are HIDDEN by default and only appear if the player switches them on
   before saving/sharing. Branding is small: "PokaSnap · KEEPITIL". */

import { h, fmt, toast } from '../ui.js';
import { get } from '../game/state.js';
import * as album from '../game/album.js';
import * as ledger from '../game/ledger.js';
import { ensure as walkState } from '../game/walk.js';
import { pointsToday, currentEvent, ladderView } from '../game/events.js';
import { portrait } from '../render/pet.js';
import { saveToPhotos, share } from '../platform/native.js';
import { track } from '../platform/analytics.js';

export async function recapScreen(app) {
  const st = get(), pet = st.pet, now = Date.now(), k = ledger.dayKey(now);
  const snaps = (await album.list()).filter(s => ledger.dayKey(s.at) === k);
  const best = snaps.reduce((a, s) => (!a || s.score > a.score ? s : a), null);
  const hero = snaps.find(s => s.journey && s.fav) || snaps.find(s => s.journey) || snaps.find(s => s.fav) || best;
  const W = walkState(st), steps = W.day === k ? W.steps : 0;
  const lv = ladderView(st, now);
  const stats = {
    steps, snaps: snaps.length, best: best ? best.score : 0, coins: ledger.earnedOn(st, k),
    bond: st.progress.xpToday?.day === `${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate()}` ? st.progress.xpToday.xp : 0,
    ap: pointsToday(st, now), apTotal: lv ? `${lv.points}/${lv.max}` : null,
  };
  let showSteps = false;
  const cv = h('canvas', { width: 1080, height: 1350, class: 'recap-card', 'aria-label': `Today with ${pet.name} recap card` });
  const toggle = h('button', { class: 'btn ghost block', role: 'switch', 'aria-checked': 'false', onclick: async () => { showSteps = !showSteps; toggle.setAttribute('aria-checked', String(showSteps)); toggle.textContent = showSteps ? '👣 Steps shown on the card — tap to hide' : '👣 Steps hidden — tap to show'; await render(); } }, '👣 Steps hidden — tap to show');

  async function render() {
    const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, 1350); g.addColorStop(0, '#fff0f4'); g.addColorStop(1, '#eaf7ff'); c.fillStyle = g; c.fillRect(0, 0, 1080, 1350);
    c.fillStyle = '#3b2a33'; c.textAlign = 'left'; c.font = '900 64px ui-rounded, system-ui, sans-serif'; c.fillText(`Today With ${pet.name}`, 70, 120);
    c.font = '700 32px ui-rounded, system-ui, sans-serif'; c.fillStyle = '#7a6670'; c.fillText(new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }), 72, 170);
    // photo
    const px = 70, py = 210, pw = 560, ph = 746;
    c.save(); c.shadowColor = 'rgba(0,0,0,.18)'; c.shadowBlur = 30; c.fillStyle = '#fff'; c.beginPath(); c.roundRect(px - 14, py - 14, pw + 28, ph + 28, 30); c.fill(); c.restore();
    if (hero) {
      const img = await createImageBitmap(hero.blob), s = Math.max(pw / img.width, ph / img.height);
      c.save(); c.beginPath(); c.roundRect(px, py, pw, ph, 20); c.clip();
      c.drawImage(img, px + (pw - img.width * s) / 2, py + (ph - img.height * s) / 2, img.width * s, img.height * s); c.restore();
      if (hero.journey) { c.fillStyle = '#2fae7f'; c.beginPath(); c.roundRect(px + 20, py + 20, 250, 56, 28); c.fill(); c.fillStyle = '#fff'; c.font = '900 28px system-ui'; c.fillText('🥾 Journey Snap', px + 38, py + 58); }
    } else {
      c.fillStyle = '#ffe1ea'; c.beginPath(); c.roundRect(px, py, pw, ph, 20); c.fill();
      const pc = document.createElement('canvas'); pc.width = pc.height = 480; portrait(pc, pet, 'happy', { t: 0.3 }); c.drawImage(pc, px + 40, py + 160, 480, 480);
      c.fillStyle = '#7a6670'; c.font = '800 30px system-ui'; c.textAlign = 'center'; c.fillText('No snaps yet today', px + pw / 2, py + 120); c.textAlign = 'left';
    }
    // stats
    const rows = [
      showSteps && stats.steps ? ['👣', fmt(stats.steps), 'steps'] : null,
      ['📸', String(stats.snaps), stats.snaps === 1 ? 'Snap' : 'Snaps'],
      ['🏆', fmt(stats.best), 'best score'],
      ['🪙', fmt(stats.coins), 'coins earned'],
      ['💞', `+${stats.bond}`, 'Bond'],
      stats.apTotal ? ['🧭', stats.apTotal, 'Adventure Points'] : null,
    ].filter(Boolean);
    let y = 260;
    for (const [ic, v, l] of rows) {
      c.font = '56px system-ui'; c.fillText(ic, 680, y + 12);
      c.fillStyle = '#3b2a33'; c.font = '900 52px ui-rounded, system-ui'; c.fillText(v, 760, y + 10);
      c.fillStyle = '#7a6670'; c.font = '700 28px system-ui'; c.fillText(l, 762, y + 50); y += 128;
    }
    const pc = document.createElement('canvas'); pc.width = pc.height = 360; portrait(pc, pet, 'wave', { t: 0.8 }); c.drawImage(pc, 700, 1000 - 100, 300, 300);
    c.fillStyle = '#e0496c'; c.font = '900 40px ui-rounded, system-ui'; c.fillText('PokaSnap', 70, 1270);
    c.fillStyle = '#7a6670'; c.font = '800 28px system-ui'; c.fillText('· KEEPITIL', 262, 1270);
  }
  const blobOf = () => new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9));
  app.mount(h('div', { class: 'screen recap' },
    h('div', { class: 'row' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => app.go('home') }, '←'), h('h1', { style: 'margin:0' }, 'Adventure Recap')),
    h('p', { class: 'small', style: 'margin:0 0 8px' }, 'Your day, ready to keep or share. Nothing is shared unless you tap Share.'),
    cv, toggle,
    h('div', { class: 'actions4' },
      h('button', { class: 'btn mint', onclick: async () => { const r = await saveToPhotos(await blobOf(), `pokasnap-recap-${k}.jpg`); if (r.ok) toast('Saved!'); } }, '💾 SAVE'),
      h('button', { class: 'btn sky', onclick: async () => { const r = await share(await blobOf(), `Today with ${pet.name} on PokaSnap!`); if (r?.ok !== false) track('adventure_recap_shared', { stepsShown: showSteps }); } }, '📤 SHARE'))));
  await render();
}
