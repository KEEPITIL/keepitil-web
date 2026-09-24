/* POST-SNAP — show the photo, count the score up, pay the reward.
   The snap is filed in My Snaps immediately; SAVE puts it in the phone's
   Photos library, SHARE opens the share sheet. */

import { h, fmt, countUp, toast, coin } from '../ui.js';
import { scoreSnap, MAX } from '../game/score.js';
import { applySnap, nextMission, unlocksAt } from '../game/progress.js';
import { mission as missionOf } from '../data/missions.js';
import { line } from '../data/personality.js';
import { get, update } from '../game/state.js';
import * as album from '../game/album.js';
import { saveToPhotos, share, haptic } from '../platform/native.js';
import { track } from '../platform/analytics.js';
import { sfx } from '../platform/sound.js';
import { drawItemThumb } from '../render/items.js';

const ROWS = [['framing', 'FRAMING'], ['size', 'PET SIZE'], ['position', 'POSITION'], ['pose', 'POSE'], ['mission', 'MISSION'], ['bonus', 'BONUS']];

export async function resultScreen(app, { missionId, blob, snapInfo }) {
  const m = missionOf(missionId), pet = get().pet;
  const sc = scoreSnap(snapInfo, m);
  let rw;
  update(st => { rw = applySnap(st, missionId, sc.total); st.currentMission = nextMission(st, missionId); });
  const rec = await album.add({ blob, petName: pet.name, missionID: m.missionID, missionTitle: m.title, score: sc.total });
  track('score_received', { mission: m.missionID, total: sc.total });
  track('mission_completed', { mission: m.missionID, first: rw.first });

  const img = h('img', { class: 'result-photo', alt: `${pet.name} — ${m.title}`, src: album.urlFor(rec) });
  const total = h('span', {}, '0');
  const rows = ROWS.map(([k, label]) => {
    const v = h('span', { class: 'v' }, '0'), bar = h('i');
    return { k, v, bar, els: [h('span', { class: 'k' }, label), v, h('div', { class: 'bar' }, bar)] };
  });
  const pb = h('div', { class: 'pb' });
  const rewards = h('div', { class: 'rewards', style: 'visibility:hidden' },
    h('div', { class: 'reward' }, '+', rw.xpGain, ' XP'), h('div', { class: 'reward' }, '+', rw.coinGain, ' ', coin()));
  const comment = h('p', { class: 'bubble', style: 'align-self:center;visibility:hidden' }, line(pet.personality, sc.total >= 4000 ? 'great' : 'snap', pet.name));

  const saveBtn = h('button', { class: 'btn mint', onclick: async () => {
    const r = await saveToPhotos(blob, `pokasnap-${m.missionID}.jpg`);
    if (r.ok) { toast(r.how === 'download' ? 'Downloaded!' : 'Saved to Photos! 📸'); track('photo_saved', { how: r.how }); haptic('success'); }
    else if (!r.cancelled) toast(r.error?.includes('denied') ? 'Allow Photos access in Settings to save' : 'Could not save — try Share');
  } }, '💾 SAVE');
  const shareBtn = h('button', { class: 'btn sky', onclick: () => share(blob) }, '📤 SHARE');

  app.mount(h('div', { class: 'screen', style: 'gap:12px' },
    img,
    h('p', { class: 'score-title' }, sc.grade),
    h('p', { class: 'score-total' }, total, h('small', {}, ' POINTS')),
    pb,
    h('div', { class: 'card breakdown' }, ...rows.flatMap(r => r.els)),
    rewards, comment,
    h('div', { class: 'actions4' },
      saveBtn, shareBtn,
      h('button', { class: 'btn ghost', onclick: () => app.go('camera', { missionId: m.missionID }) }, '🔁 RETRY'),
      h('button', { class: 'btn', onclick: () => app.go('brief', { missionId: get().currentMission }) }, 'NEXT ➜')),
    h('button', { class: 'linkbtn', onclick: () => app.go('home') }, 'Home')));

  // the reveal
  sfx.score();
  await countUp(total, sc.total, 1100, () => sfx.tick());
  pb.textContent = rw.personalBest ? '★ NEW PERSONAL BEST ★' : rw.missionBest && !rw.first ? '★ NEW MISSION BEST ★' : '';
  for (const r of rows) { r.bar.style.width = (100 * sc.parts[r.k] / MAX[r.k]) + '%'; countUp(r.v, sc.parts[r.k], 500); await new Promise(res => setTimeout(res, 120)); }
  rewards.style.visibility = 'visible'; comment.style.visibility = 'visible';
  haptic('success');
  if (rw.levelUp) setTimeout(() => levelUp(rw), 700);
}

function levelUp(rw) {
  sfx.level(); haptic('success');
  track('level_up', { level: rw.levelUp });
  const un = unlocksAt(rw.levelUp);
  const items = un.items.map(it => { const c = h('canvas', { width: 120, height: 120, style: 'width:60px;height:60px' }); drawItemThumb(c, it.itemID); return h('div', { style: 'text-align:center;font-weight:800;font-size:12px' }, c, it.name); });
  const layer = h('div', { class: 'levelup', onclick: () => layer.remove() },
    h('div', { class: 'card' },
      h('p', { class: 'tag', style: 'margin:0' }, 'LEVEL UP!'),
      h('div', { class: 'big' }, rw.levelUp),
      h('p', { class: 'bubble', style: 'margin:10px 0 14px' }, line(get().pet.personality, 'level', get().pet.name)),
      items.length || un.poses.length ? h('p', { class: 'small', style: 'margin:0 0 6px' }, 'Unlocked:') : null,
      h('div', { class: 'row', style: 'justify-content:center;flex-wrap:wrap' }, ...items,
        ...un.poses.map(p => h('div', { style: 'text-align:center;font-weight:800;font-size:12px' }, h('div', { style: 'font-size:38px' }, p.icon), p.name + ' pose'))),
      h('button', { class: 'btn block', style: 'margin-top:14px' }, 'YAY!')));
  document.body.append(layer);
}
