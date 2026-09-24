/* ADVENTURE — Daily Snap, Poka Friday, Rare Moments, seasonal collections,
   and the orchestrators screens call after play (onSnap / onCare / onTraining).
   ---------------------------------------------------------------------------
   Screens stay thin: they report what happened, this module decides every
   reward through the ledger (idempotent, capped) and returns a summary the
   UI can show. Nothing here ever blocks the camera. */

import { EARN, XP, CAPS, DAILY_SNAP_PROMPTS, FRIDAY_GIFTS, COLLECTIONS, PLUS } from '../data/economy.js';
import { mission as missionOf } from '../data/missions.js';
import { item as itemOf } from '../data/items.js';
import * as ledger from './ledger.js';
import { grant, plusSubscribed } from './entitlements.js';
import { grantXP } from './progress.js';
import { qualify } from './activity.js';
import { addPoints, bonusPoints } from './events.js';
import { useJourney } from './walk.js';

const hash = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

/* ---------------------------------------------------------------- daily snap -- */
export function dailyPrompt(now = Date.now()) { return DAILY_SNAP_PROMPTS[hash('ds' + ledger.dayKey(now)) % DAILY_SNAP_PROMPTS.length]; }
export function dailyDone(st, now = Date.now()) { return ledger.has(st, `dailysnap:${ledger.dayKey(now)}`); }
/** Does this snap satisfy today's prompt? Trust-based prompts accept any snap. */
export function dailyCheck(prompt, snap) {
  switch (prompt.check) {
    case 'pose': return snap.poseId === prompt.pose;
    case 'tiny': return snap.box && snap.frame && snap.box.h / snap.frame.h < 0.22;
    case 'journey': return !!snap.journey || prompt.fallback === 'any';
    case 'outfit': return (snap.equippedCount || 0) >= 1;
    default: return true;
  }
}

/* ---------------------------------------------------------------- friday -- */
export function isFriday(now = Date.now()) { return new Date(now).getDay() === 5; }
export function fridayKey(now = Date.now()) { return `friday:${ledger.dayKey(now)}`; }
export function fridayGift(now = Date.now()) {
  const d = new Date(now), weekOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 1)) / 6048e5);
  return FRIDAY_GIFTS[weekOfYear % FRIDAY_GIFTS.length];
}
export function fridayClaimable(st, now = Date.now()) { return isFriday(now) && !ledger.has(st, fridayKey(now)) && ledger.clockOk(st, now); }
export function claimFriday(st, now = Date.now()) {
  if (!fridayClaimable(st, now)) return null;
  const g = fridayGift(now), r = { gift: g };
  if (g.coins) r.coins = ledger.earn(st, { id: fridayKey(now), source: 'friday', amount: g.coins, now }).amount;
  else ledger.mark(st, fridayKey(now));
  if (g.xp) { grantXP(st, g.xp); r.xp = g.xp; }
  if (g.item) { if (grant(st, g.item, 'EVENT_EARNED', 'friday', now)) r.item = g.item; else r.coins = ledger.earn(st, { id: fridayKey(now) + ':dup', source: 'friday', amount: g.fallbackCoins || 50, now }).amount; }
  if (g.points) { const p = bonusPoints(st, g.points, now); if (p.points) r.points = p.points; else r.coins = ledger.earn(st, { id: fridayKey(now) + ':ap', source: 'friday', amount: g.fallbackCoins || 40, now }).amount; }
  return r;
}

/* ---------------------------------------------------------------- collections -- */
const md = now => { const d = new Date(now); return String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
export function activeCollections(now = Date.now()) { const x = md(now); return COLLECTIONS.filter(c => x >= c.from && x <= c.to); }
function goalMet(test, snap, m) {
  const [k, v] = test.split(':');
  switch (k) {
    case 'category': return m?.category === v;
    case 'mission': return m?.missionID === v;
    case 'pose': return snap.poseId === v;
    case 'color': return (snap.itemIds || []).some(id => itemOf(id)?.tags?.includes(v));
    case 'journey': return !!snap.journey;
    case 'rare': return !!snap.rare;
    default: return false;
  }
}
export function collectionView(st, c) { const s = (st.collections || {})[c.id] || { done: {} }; return { ...c, done: s.done, count: Object.keys(s.done).length }; }
function progressCollections(st, snap, m, now) {
  st.collections = st.collections || {}; const out = [];
  for (const c of activeCollections(now)) {
    const s = st.collections[c.id] = st.collections[c.id] || { done: {} };
    for (const g of c.goals) if (!s.done[g.id] && goalMet(g.test, snap, m)) { s.done[g.id] = now; out.push({ collection: c.id, goal: g.label }); }
    const n = Object.keys(s.done).length;
    if (n >= c.partial.need && ledger.mark(st, `collection:${c.id}:partial`)) {
      out.push({ collection: c.id, partial: true, coins: ledger.earn(st, { id: `collection:${c.id}:partialcoins`, source: 'collection', amount: c.partial.coins, now }).amount, item: grant(st, c.partial.item, 'EVENT_EARNED', c.id, now) ? c.partial.item : null });
    }
    if (n >= c.goals.length && ledger.mark(st, `collection:${c.id}:full`)) {
      out.push({ collection: c.id, full: true, item: grant(st, c.full.item, 'ACHIEVEMENT_LIMITED', c.id, now) ? c.full.item : null });
    }
  }
  return out;
}

/* ---------------------------------------------------------------- orchestrators -- */
/**
 * After a snap has been scored and applied (progress.applySnap). Returns a summary:
 * { coins:[{label,amount}], points, eventRewards[], activity[], daily, journey, rare, collections[] }
 * snap: { id, missionId, poseId, total, first, journey, rare, dailyPromptId, equippedCount, itemIds, box, frame }
 */
export function onSnap(st, snap, now = Date.now()) {
  const m = missionOf(snap.missionId), sum = { coins: [], points: 0, eventRewards: [], activity: [], collections: [] };
  const add = (label, r) => { if (r?.ok || r?.amount) sum.coins.push({ label, amount: r.amount }); };
  const pts = action => { const p = addPoints(st, action, now, snap.id); sum.points += p.points; sum.eventRewards.push(...p.rewards); };

  // mission first clear pays coins; replays pay XP/score only (CAPS.missionReplayCoins)
  if (!snap.daily && snap.first) add('First clear', ledger.earn(st, { id: `mission:${snap.missionId}`, source: 'mission', amount: EARN.missionFirstClear[m.difficulty] || 25, ref: snap.missionId, now }));
  if (!snap.daily) { pts('mission'); qualifyInto(st, 'mission', now, sum); }
  if (snap.total >= 4000) pts('greatShot');

  // Daily Snap
  if (snap.daily) {
    const prompt = dailyPrompt(now);
    if (!dailyDone(st, now) && dailyCheck(prompt, snap) && ledger.clockOk(st, now)) {
      const amount = plusSubscribed(st, now) ? EARN.dailySnapPlus : EARN.dailySnap;
      add('Daily Snap', ledger.earn(st, { id: `dailysnap:${ledger.dayKey(now)}`, source: 'dailySnap', amount, now }));
      grantXP(st, XP.dailySnap); sum.daily = { done: true, prompt, xp: XP.dailySnap };
      pts('dailySnap'); qualifyInto(st, 'dailySnap', now, sum);
    } else sum.daily = { done: dailyDone(st, now), missed: !dailyCheck(prompt, snap), prompt };
  }

  // Journey Snap
  if (snap.journey) {
    const j = useJourney(st, snap.id, now);
    if (j) { if (j.coins) sum.coins.push({ label: 'Journey Snap', amount: j.coins }); sum.journey = j; pts('journeySnap'); qualifyInto(st, 'journeySnap', now, sum); }
  }
  // Rare Moment captured
  if (snap.rare) {
    const r = ledger.earn(st, { id: `rare:${snap.id}`, source: 'rareMoment', amount: EARN.rareMoment, cap: CAPS.rareMoment, now });
    if (r.ok) { add('Rare Moment', r); grantXP(st, XP.rareMoment); pts('rareMoment'); }
    sum.rare = { moment: snap.rare, rewarded: r.ok };
    qualifyInto(st, 'rareMoment', now, sum);
  }
  sum.collections = progressCollections(st, snap, m, now);
  return sum;
}
function qualifyInto(st, action, now, sum) { const q = qualify(st, action, now); if (q.newDay) sum.activity.push(...q.rewards); }

/** Care: always animates; the first CAPS.care actions of the day pay. */
export function onCare(st, action, now = Date.now()) {
  const n = ledger.countToday(st, 'care', now);
  const r = ledger.earn(st, { id: `care:${ledger.dayKey(now)}:${n + 1}`, source: 'care', amount: EARN.care, cap: CAPS.care, now });
  if (r.ok) grantXP(st, XP.care);
  const p = r.ok ? addPoints(st, 'care', now) : { points: 0, rewards: [] };
  const q = r.ok ? qualify(st, 'care', now) : { rewards: [] };
  return { rewarded: r.ok, coins: r.amount || 0, xp: r.ok ? XP.care : 0, points: p.points, eventRewards: p.rewards, activity: q.rewards };
}
/** Training: the first completion each day pays coins; a learned trick adds event points. */
export function onTraining(st, { learnedNow = false, gameId = 't' } = {}, now = Date.now()) {
  const r = ledger.earn(st, { id: `training:${ledger.dayKey(now)}`, source: 'training', amount: EARN.training, cap: CAPS.training, now });
  grantXP(st, XP.training);
  const p = addPoints(st, 'training', now); const p2 = learnedNow ? addPoints(st, 'trick', now) : { points: 0, rewards: [] };
  const q = qualify(st, 'training', now);
  return { coins: r.amount || 0, xp: XP.training, points: p.points + p2.points, eventRewards: [...p.rewards, ...p2.rewards], activity: q.rewards };
}
/** Walking rewards feed events and the active day. */
export function onWalk(st, kind, now = Date.now()) {
  const p = addPoints(st, kind === 'session' ? 'walk' : 'steps', now); const q = qualify(st, kind === 'session' ? 'walk' : 'steps', now);
  return { points: p.points, eventRewards: p.rewards, activity: q.rewards };
}
