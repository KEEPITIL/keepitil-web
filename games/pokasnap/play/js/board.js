/* PokaSnap 2.2 C1.5 board rules — pure, no DOM. Tested by tools/tests/v22.mjs.
   move -> land -> animate -> earn -> continue. Every number lives in config.js. */
import { SPACE_COUNT, SPACES, TILE_TYPES, MOVE, STAGE, TREATS, TILE_REWARDS, SCALED, LUCKY, STASH, STASH_TARGETS, MILESTONE_EVENTS, ALBUM_SEASON, KEYMAP, MULTIPLIERS } from './config.js';

const wrap = i => ((i % SPACE_COUNT) + SPACE_COUNT) % SPACE_COUNT;
const pickW = (table, r) => { let a = 0; for (const t of table) { a += t.w; if (r < a) return t; } return table[table.length - 1]; };

/* ---------------------------------------------------------- movement -- */
/* Distance never reads the multiplier: the signature does not even accept one. */
export function moveDistance(rand) { return MOVE.parts.reduce((n, sides) => n + 1 + Math.floor(rand() * sides), 0); }
export const MOVE_RANGE = { min: MOVE.parts.length, max: MOVE.parts.reduce((a, b) => a + b, 0) };

/* One SNAP press: spend `mult` Snaps, resolve ONE movement. Returns null when the reserve can't cover it. */
export function snapMove(state, mult, rand) {
  if (!MULTIPLIERS.includes(mult)) throw new Error('bad multiplier ' + mult);
  if (state.snaps < mult) return null;
  const distance = moveDistance(rand);
  const from = state.pos, to = from + distance;
  return { snaps: state.snaps - mult, spent: mult, mult, from, to, distance, landing: wrap(to), ...stageCrossing(from, to) };
}
/* STAGE is index 0. Landing exactly on it is a LAND (enhanced), not also a PASS. */
export function stageCrossing(from, to) {
  const laps = Math.floor(to / SPACE_COUNT) - Math.floor(from / SPACE_COUNT);
  const lands = wrap(to) === 0 && to !== from;
  const passes = Math.max(0, laps - (lands ? 1 : 0));
  return { passesStage: passes, landsStage: lands };
}
export function stageReward(kind, mult) { const r = STAGE[kind]; if (!r) throw new Error('bad stage kind ' + kind); return { ...scaleReward(r, mult), speedshot: { ...STAGE.speedshot[kind] } }; }

/* Multiplier scales eligible economy only (coins, snaps, milestone points). */
export function scaleReward(r, mult) { const o = {}; for (const [k, v] of Object.entries(r)) o[k] = SCALED.includes(k) && typeof v === 'number' ? v * mult : v; return o; }

/* ------------------------------------------------------------ landing -- */
export function tileAt(i) { return SPACES[wrap(i)]; }
/* What a landing grants, before any interactive part (stash dig, pose window) runs. */
export function landingOutcome(i, mult, rand) {
  const sp = tileAt(i), t = sp.type;
  if (t === 'stage') return { type: t, ...stageReward('land', mult) };
  if (t === 'lucky') { const l = pickW(LUCKY, rand()); const { id, w, ...rest } = l; return { type: t, lucky: id, ...scaleReward(rest, mult) }; }
  if (t === 'rush') { const [a, b] = TILE_REWARDS.rush.extraSpaces; return { type: t, extraSpaces: a + Math.floor(rand() * (b - a + 1)), speedshot: { seconds: 3, shots: 3 } }; }
  if (t === 'stash') return { type: t, dig: true };
  return { type: t, ...scaleReward(TILE_REWARDS[t] || {}, mult) };
}

/* -------------------------------------------------------------- treats -- */
/* Treats are pet-native protection, max 5 visible. A pickup at 5/5 converts to Snaps. */
export function addTreats(state, n = 1, mult = 1) {
  let treats = state.treats, overflowSnaps = 0;
  for (let k = 0; k < n; k++) { if (treats < TREATS.max) treats++; else overflowSnaps += TREATS.overflowSnaps * mult; }
  return { treats, overflowSnaps };
}
/* One Treat absorbs one incoming Stash loss. */
export function protect(state) { return state.treats > 0 ? { treats: state.treats - 1, protected: true } : { treats: 0, protected: false }; }

/* --------------------------------------------------------------- stash -- */
export function pickStashTarget(players = [], rand) {
  const valid = players.filter(p => p && p.id && p.coins > 0);
  const pool = valid.length ? valid : STASH_TARGETS;
  return pool[Math.floor(rand() * pool.length) % pool.length];
}
/* A dig bed of STASH.cells cells; every cell holds exactly one item (no duplicates are paid twice). */
export function createDig(target, rand) {
  const cells = Array.from({ length: STASH.cells }, (_, k) => { const l = pickW(STASH.loot, rand()); return { k, loot: l.id, clue: l.clue, dug: false }; });
  if (rand() < STASH.jackpotChance) { const j = Math.floor(rand() * STASH.cells); cells[j] = { k: j, loot: 'jackpot', clue: STASH.jackpot.clue, dug: false }; }
  return { target, cells, digsLeft: STASH.digs, finds: [] };
}
export function dig(d, k, mult = 1) {
  const c = d.cells[k];
  if (!c || c.dug || d.digsLeft <= 0) return { d, find: null };
  const cells = d.cells.map(x => x.k === k ? { ...x, dug: true } : x);
  const base = c.loot === 'jackpot' ? STASH.jackpot : STASH.loot.find(l => l.id === c.loot);
  const { id, w, clue, ...reward } = base;
  const find = { k, loot: c.loot, ...scaleReward(reward, mult) };
  return { d: { ...d, cells, digsLeft: d.digsLeft - 1, finds: [...d.finds, find] }, find };
}
/* What the target loses: capped, share-based, and fully absorbed by one Treat. Never a spiral. */
export function stashLoss(target, takenCoins) {
  const want = Math.min(STASH.maxLossCoins, Math.round(target.coins * STASH.lossShare), takenCoins);
  if (target.treats > 0) return { lost: 0, treatsLeft: target.treats - 1, protected: true };
  return { lost: Math.max(0, want), treatsLeft: 0, protected: false };
}

/* --------------------------------------------------------------- album -- */
export function createAlbum(season = ALBUM_SEASON) { return { season: season.id, slots: season.slots.map(s => ({ id: s.id, label: s.label, photoId: null })) }; }
/* Only a real photo can complete a slot; the photo's own id is attached. */
export function albumAttach(album, photo, season = ALBUM_SEASON) {
  if (!photo || !photo.id || !photo.real) return { album, slot: null };
  const open = album.slots.find(s => !s.photoId && season.slots.find(x => x.id === s.id).need(photo));
  if (!open) return { album, slot: null };
  return { album: { ...album, slots: album.slots.map(s => s.id === open.id ? { ...s, photoId: photo.id } : s) }, slot: open.id };
}
export const albumDone = a => a.slots.filter(s => s.photoId).length;

/* ---------------------------------------------------------- milestones -- */
export function createMilestone(id, now) { const ev = MILESTONE_EVENTS[id]; if (!ev) throw new Error('bad event ' + id); return { id, points: 0, claimed: [], endsAt: now + ev.hours * 3600e3 }; }
export function milestonePoints(id, kind, mult = 1) { const r = MILESTONE_EVENTS[id].rules; return (r[kind] ?? 0) * mult; }
/* Adds points; returns the tiers crossed by THIS add (each tier can only ever be claimed once). */
export function addPoints(ms, pts, now) {
  if (now >= ms.endsAt || pts <= 0) return { ms, crossed: [] };
  const ev = MILESTONE_EVENTS[ms.id], points = ms.points + pts;
  const crossed = ev.tiers.map((t, i) => ({ ...t, i })).filter(t => points >= t.at && !ms.claimed.includes(t.i));
  return { ms: { ...ms, points, claimed: [...ms.claimed, ...crossed.map(t => t.i)] }, crossed };
}
export function nextTier(ms) { const ev = MILESTONE_EVENTS[ms.id]; return ev.tiers.find((t, i) => !ms.claimed.includes(i)) || null; }
export function countdown(ms, now) { const s = Math.max(0, Math.floor((ms.endsAt - now) / 1000)); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return s <= 0 ? 'ended' : d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; }

/* ------------------------------------------------------------ keyboard -- */
/* Keys map to paw ROLES; the caller then runs the same pawTap(role) a click runs.
   Typing in an editable control is never hijacked. */
export function isEditable(el) { if (!el) return false; const tag = (el.tagName || '').toUpperCase(); return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el.isContentEditable; }
export function keyRole(mode, key, target) {
  if (isEditable(target)) return null;
  const m = KEYMAP[mode]; if (!m) return null;
  return m[key === 'Spacebar' ? ' ' : key] || null;
}
export const TYPE_LABEL = t => TILE_TYPES[t].label;

/* One movement as a timed plan the renderer samples (same shape as core.planRun):
   a short ready crouch, one rabbit hop per space, a landing squash. */
export const HOP_S = 0.21;
export function planMove(from, distance, rand, kind = 'move') {
  const beats = []; let t = 0;
  const push = (phase, dur, extra = {}) => { beats.push({ phase, t0: t, t1: t + dur, ...extra }); t += dur; };
  push('ready', kind === 'rush' ? 0.12 : 0.22);
  for (let h = 0; h < distance; h++) push('hop', HOP_S * (kind === 'rush' ? 0.7 : 1), { p0: h / distance, p1: (h + 1) / distance, apex: (kind === 'rush' ? 0.16 : 0.24) + rand() * 0.08 });
  push('land', 0.2);
  return { object: null, kind, from, to: from + distance, distance, duration: t, beats };
}
