/* POKA WORLD LOGIC (1.4) — one place where life, pets, photos and memories meet.
   ---------------------------------------------------------------------------
   Every photograph (camera or Homeland) is recorded ONCE as metadata by
   recordPhoto(). That single record feeds the Species Journal, each pet's Life
   Album, Photo Honors, Collections, Community Projects, the League and the
   certification counters. Metadata is stored in st.world, separately from the
   image file in IndexedDB, so deleting a photo never deletes an accomplishment.

   No new currency: projects advance with progress points from normal play.
   Pets decide what to do with a small weighted state machine — no inference. */

import { onPhoto } from './v2.js';
import { PACK, RELATION_TYPES, RELATION_GAIN, LOCATIONS, TIMES_OF_DAY, OBJECTS, BEHAVIORS, PUZZLES, HINT_AFTER, LIFE_ADVENTURES, LIFE_GOAL,
  PROJECTS, SPECIALTIES, LEAGUE_ROTATION, LEAGUE, COLLECTIONS, HONORS, HONOR_TIERS, JOURNAL_CATEGORIES, JOURNAL_ENTRIES, JOURNAL_MILESTONES,
  LIFE_MILESTONES, RARITY_ORDER, RARITY_XP, NEGLECT, REVIVAL, NOVELTY, XP_SOURCES } from '../data/world.js';
import { SPECIES } from '../data/pets.js';
import { item as itemOf } from '../data/items.js';
import * as ledger from './ledger.js';

const DAY = 864e5;
const dkey = (now = Date.now()) => { const d = new Date(now); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const rank = r => RARITY_ORDER.indexOf(r);

/* ================================================================ STATE */
export function ensure(st, now = Date.now()) {
  const w = st.world = st.world || {};
  w.photos = w.photos || [];                 // photo METADATA log (never the image)
  w.journal = w.journal || {};               // species -> { entryId: { at, photoId, petId } }
  w.journalClaims = w.journalClaims || {};   // species -> { milestoneKey: at }
  w.albums = w.albums || {};                 // petId -> { milestoneId: { at, photoId, note } }
  w.relations = w.relations || {};           // 'a|b' -> { points, type, via:{}, history:[] }
  w.honors = w.honors || {};                 // honorId -> tier claimed
  w.counts = w.counts || {};                 // counter -> n
  w.collections = w.collections || {};       // id -> { done:{goal:at}, claimed:at }
  w.projects = w.projects || {};             // id -> { points, done:at, log:{} }
  w.puzzles = w.puzzles || {};               // id -> { attempts, solved:at }
  w.locations = w.locations || {};           // id -> { visits, photos, placed:[objects] }
  w.life = w.life || { day: null, done: {}, goalPaid: {} };
  w.league = w.league || { entries: {}, wins: 0, top3: 0 };
  w.xpSeen = w.xpSeen || {};                 // novelty ledger: key -> { n, day }
  w.care = w.care || {};                     // petId -> { lastCare, warnedAt, state, recovery, dead, memorialAt }
  w.revival = w.revival || { treats: 0, earned: {}, used: [] };
  w.hint = w.hint || {};
  w.retro = w.retro || [];                   // retroactive-credit notices to show
  for (const p of pets(st)) { w.care[p.id] = w.care[p.id] || { lastCare: now, warnedAt: 0, state: 'healthy', recovery: 0 }; w.albums[p.id] = w.albums[p.id] || {};
    if (!w.albums[p.id].adopted) w.albums[p.id].adopted = { at: p.createdAt || now, photoId: null, note: null }; }   // pets from before 1.4 keep their adoption day
  return w;
}

/* ================================================================ PACK */
export function pets(st) {
  if (!st.pet) return [];
  if (!st.pet.id) st.pet.id = 'p1';
  st.residents = st.residents || [];
  return [st.pet, ...st.residents];
}
export const petById = (st, id) => pets(st).find(p => p.id === id) || null;
export function activePets(st) {
  const all = pets(st).filter(p => !p.memorial);
  st.activeIds = (st.activeIds || [st.pet?.id]).filter(id => all.some(p => p.id === id));
  if (!st.activeIds.length && all[0]) st.activeIds = [all[0].id];
  return st.activeIds.map(id => petById(st, id));
}
export const activeLimit = st => ((st.progress?.level || 1) >= PACK.thirdActiveLevel ? 3 : (st.progress?.level || 1) >= PACK.secondPetLevel ? 2 : 1);
export const canAdopt = st => (st.progress?.level || 1) >= PACK.secondPetLevel && pets(st).length < ((st.progress?.level || 1) >= PACK.thirdActiveLevel ? PACK.maxResidents : 2);
export function adopt(st, { species, appearance, name, personality }, now = Date.now()) {
  if (!canAdopt(st)) return { ok: false, reason: 'locked' };
  if (!SPECIES[species]) return { ok: false, reason: 'species' };
  const id = 'p' + (pets(st).length + 1) + '_' + (now % 100000).toString(36);
  const pet = { id, species, appearance: appearance || SPECIES[species].appearances[0].id, name: String(name || 'Buddy').slice(0, 16), personality: personality || 'playful', equipped: {}, createdAt: now };
  st.residents.push(pet);
  const w = ensure(st, now);
  albumMark(st, id, 'adopted', null, now);
  if (activePets(st).length < activeLimit(st)) st.activeIds.push(id);
  for (const o of pets(st)) if (o.id !== id) relation(st, o.id, id);
  return { ok: true, pet };
}
export function setActive(st, ids) {
  const lim = activeLimit(st), ok = ids.filter(id => petById(st, id) && !petById(st, id).memorial).slice(0, lim);
  if (!ok.length) return { ok: false };
  st.activeIds = ok; return { ok: true, active: ok };
}

/* ================================================================ RELATIONSHIPS */
const pairKey = (a, b) => [a, b].sort().join('|');
export function relation(st, a, b) {
  const w = ensure(st), k = pairKey(a, b);
  return w.relations[k] = w.relations[k] || { points: 0, type: 'acquainted', via: {}, history: [] };
}
/** Add relationship points; the TYPE depends on how they were earned (behaviour, not just a number). */
export function bond(st, a, b, via, mult = 1, now = Date.now()) {
  if (!a || !b || a === b) return null;
  const r = relation(st, a, b), before = r.type;
  const neglectMult = Math.min(careEffect(st, a).relationGain ?? 1, careEffect(st, b).relationGain ?? 1);
  const gain = (RELATION_GAIN[via] || 1) * mult * neglectMult;
  r.points = Math.min(100, r.points + gain); r.via[via] = (r.via[via] || 0) + gain;
  r.type = typeFor(st, a, b, r);
  if (r.type !== before) { r.history.push({ at: now, type: r.type }); count(st, 'relations_formed');
    for (const id of [a, b]) { albumMark(st, id, r.type === 'best_friend' ? 'best_friend' : 'first_friend', null, now); }
    novelXP(st, `relation:${pairKey(a, b)}:${r.type}`, XP_SOURCES.relationship_milestone, now);
    return { upgraded: r.type, from: before };
  }
  return { points: r.points };
}
function typeFor(st, a, b, r) {
  const p = r.points, v = r.via, T = RELATION_TYPES;
  const rankGap = Math.abs((petRank(st, a)) - (petRank(st, b)));
  if (p >= T.best_friend.at && (v.play || 0) + (v.care || 0) + (v.meal || 0) >= p * 0.4) return 'best_friend';
  if (p >= T.mentor.at && rankGap >= 3 && (v.train || 0) >= p * 0.3) return 'mentor';
  if (p >= T.adventure_buddy.at && (v.walk || 0) >= p * 0.4) return 'adventure_buddy';
  if (p >= T.training_partner.at && (v.train || 0) >= p * 0.4) return 'training_partner';
  if (p >= T.playful_rival.at && (v.rival || 0) >= p * 0.3) return 'playful_rival';
  if (p >= T.friend.at) return 'friend';
  return 'acquainted';
}
function petRank(st, id) { return (st.world?.petRanks?.[id]) ?? (id === st.pet?.id ? Object.values(st.academy?.disciplines || {}).reduce((a, d) => a + Object.keys(d.nodes || {}).length, 0) / 25 : 0); }
export function relationsOf(st, id) {
  ensure(st);
  return Object.entries(st.world.relations).filter(([k]) => k.split('|').includes(id)).map(([k, r]) => ({ other: k.split('|').find(x => x !== id), ...r }));
}
export const relationTypes = st => new Set(Object.values(ensure(st).relations).map(r => r.type).filter(t => t !== 'acquainted'));

/* ================================================================ HOMELAND */
export function timeOfDay(now = Date.now()) {
  const h = new Date(now).getHours();
  return TIMES_OF_DAY.find(t => (t.from <= t.to ? h >= t.from && h < t.to : h >= t.from || h < t.to)).id;
}
export function seasonOf(now = Date.now()) { const m = new Date(now).getMonth(); return m <= 1 || m === 11 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn'; }
export const locationsOpen = st => LOCATIONS.filter(l => (st.progress?.level || 1) >= l.level);
export function locationState(st, id, now = Date.now()) {
  const w = ensure(st), L = LOCATIONS.find(l => l.id === id);
  const s = w.locations[id] = w.locations[id] || { visits: 0, photos: 0, placed: [] };
  const facilities = Object.values(w.projects).filter(p => p.done).map(p => p.unlocks?.facility).filter(Boolean);
  const unlockedObjects = new Set([...L.objects.filter(o => objectUnlocked(st, o)), ...PROJECTS.filter(p => w.projects[p.id]?.done && p.unlocks.object).map(p => p.unlocks.object).filter(o => L.objects.includes(o) || o === 'music_box' && id === 'photo_studio')]);
  return { ...L, time: timeOfDay(now), season: seasonOf(now), placed: s.placed, visits: s.visits, facilities, objects: [...unlockedObjects] };
}
function objectUnlocked(st, id) {
  const o = OBJECTS[id]; if (!o) return false;
  const gated = PROJECTS.find(p => p.unlocks.object === id);
  if (gated) return !!st.world?.projects?.[gated.id]?.done || (st.inventory || []).includes(o.prop);
  return true;
}
export function placeObject(st, locId, obj) {
  const s = ensure(st).locations[locId] = st.world.locations[locId] || { visits: 0, photos: 0, placed: [] };
  if (!OBJECTS[obj]) return { ok: false };
  if (!s.placed.includes(obj)) s.placed = [...s.placed.slice(-2), obj];   // max 3 objects out at once
  count(st, 'objects_used');
  return { ok: true, placed: s.placed };
}
/** Weighted autonomous behaviour for one pet at one moment. Pure (seeded rnd). */
export function pickBehavior(st, pet, loc, others, rnd = Math.random) {
  const care = careEffect(st, pet.id);
  if (care.hides && rnd() < 0.6) return { id: 'nap', pose: 'sleep', hiding: true };
  const opts = [];
  for (const [id, b] of Object.entries(BEHAVIORS)) if (!b.duo && id !== 'use_object' && id !== 'visit_pet') opts.push({ id, pose: b.pose, w: b.weight });
  for (const obj of loc.placed) { const o = OBJECTS[obj]; if (o && (o.pets === 'all' || o.pets.includes(pet.species))) opts.push({ id: 'use_object', object: obj, pose: o.pose, w: 5 }); }
  for (const other of others) {
    const r = relation(st, pet.id, other.id), T = RELATION_TYPES[r.type];
    opts.push({ id: 'visit_pet', with: other.id, pose: 'wave', w: 2 });
    for (const bid of T.behaviors || []) opts.push({ id: bid, with: other.id, pose: BEHAVIORS[bid].pose, w: 3 + r.points / 25, duo: true });
  }
  const tot = opts.reduce((a, o) => a + o.w, 0); let x = rnd() * tot;
  for (const o of opts) { if ((x -= o.w) <= 0) return o; }
  return opts[0];
}
/** Chance that what's happening right now is a Rare/Legendary moment worth snapping. */
export function momentRoll(st, behavior, loc, rnd = Math.random) {
  const o = behavior.object ? OBJECTS[behavior.object] : null;
  let p = 0.03 + (o?.rare || 0) + (behavior.duo ? 0.04 : 0) + (loc.time === 'night' || loc.time === 'sunset' ? 0.02 : 0);
  if (o?.night && (loc.time === 'evening' || loc.time === 'night')) p += 0.12;
  const x = rnd();
  if (x < p * 0.12) return 'legendary';
  if (x < p * 0.5) return 'rare';
  if (x < p) return 'uncommon';
  return null;
}

/* ================================================================ PUZZLES (three-hint rule) */
export function puzzleMatches(st, pz, ctx) {
  const n = pz.needs, subj = ctx.subjects || [];
  if (pz.location !== ctx.location) return false;
  if (n.object && !(ctx.placed || []).includes(n.object)) return false;
  if (n.pets && subj.length < n.pets) return false;
  if (n.species && !subj.some(id => n.species.includes(petById(st, id)?.species))) return false;
  if (n.time && !n.time.includes(ctx.time)) return false;
  if (n.relation && !pairTypes(st, subj).includes(n.relation)) return false;
  if (n.petState === 'sleepy' && !subj.some(id => ctx.poses?.[id] === 'sleep' || ctx.poses?.[id] === 'sleepyroll')) return false;
  if (n.petState === 'lonely' && !subj.some(id => ['lonely', 'stressed'].includes(careState(st, id).id))) return false;
  if (n.specialty && !subj.some(id => specialtyOf(st, id) === n.specialty)) return false;
  return true;
}
const pairTypes = (st, ids) => { const out = []; for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out.push(relation(st, ids[i], ids[j]).type); return out; };
/** Called when a Homeland photo is taken. Solves, or escalates the hint. */
export function tryPuzzles(st, ctx, now = Date.now()) {
  const w = ensure(st), out = [];
  for (const pz of PUZZLES.filter(p => p.location === ctx.location)) {
    const s = w.puzzles[pz.id] = w.puzzles[pz.id] || { attempts: 0, solved: 0 };
    if (s.solved) continue;
    if (puzzleMatches(st, pz, ctx)) { s.solved = now; count(st, 'puzzles'); out.push({ solved: pz, rarity: pz.reward.rarity }); novelXP(st, `puzzle:${pz.id}`, XP_SOURCES.adventure_story, now); }
    else s.attempts++;
  }
  return out;
}
/** The hint to show for a puzzle: mystery → stronger → clear instruction. Never needs the web. */
export function hintFor(st, pz) {
  const a = ensure(st).puzzles[pz.id]?.attempts || 0;
  const i = a >= HINT_AFTER[2] ? 2 : a >= HINT_AFTER[1] ? 1 : 0;
  return { level: i + 1, text: pz.hints[i] };
}

/* ================================================================ SPECIALTIES */
export function specialtyOf(st, id) {
  const c = ensure(st).counts, a = st.world.albums[id] || {};
  if (id === st.pet?.id && (c.journeys || 0) >= 20) return 'explorer';
  const s = { explorer: c[`journeys:${id}`] || 0, photographer: c[`five:${id}`] || 0, trainer: id === st.pet?.id ? Object.keys(st.academy?.disciplines?.trick?.nodes || {}).length / 5 : 0,
    performer: c[`dance:${id}`] || 0, companion: c[`care:${id}`] / 5 || 0, collector: Object.keys(a).length / 3 };
  const best = Object.entries(s).sort((x, y) => y[1] - x[1])[0];
  return best && best[1] >= 3 ? best[0] : null;
}

/* ================================================================ NOVELTY XP */
/** Discovery > improvement > repetition. The same key repeated the same day decays. */
export function noveltyFactor(st, key, kind = 'auto', now = Date.now()) {
  const w = ensure(st), day = dkey(now), s = w.xpSeen[key];
  if (!s) return kind === 'improvement' ? NOVELTY.improvement : NOVELTY.newExperience;
  const sameDayN = s.day === day ? s.n : 0;
  if (kind === 'improvement') return NOVELTY.improvement;
  return Math.max(NOVELTY.repeatFloor, NOVELTY.repeat * Math.pow(0.5, sameDayN / NOVELTY.repeatHalfLifePerDay));
}
let grantHook = null;   // progress.grantXP registers itself (avoids an import cycle)
export function registerGrant(fn) { grantHook = fn; }
export function novelXP(st, key, base, now = Date.now(), kind = 'auto') {
  const f = noveltyFactor(st, key, kind, now), w = ensure(st), day = dkey(now), s = w.xpSeen[key];
  w.xpSeen[key] = { n: s && s.day === day ? s.n + 1 : 1, day, total: (s?.total || 0) + 1 };
  const xp = Math.round(base * f);
  if (xp && grantHook) grantHook(st, xp);
  return xp;
}

/* ================================================================ COUNTERS */
export function count(st, k, by = 1) { const c = ensure(st).counts; c[k] = (c[k] || 0) + by; return c[k]; }
export const counter = (st, k) => ensure(st).counts[k] || 0;

/* ================================================================ PHOTO RECORD (the spine)
   meta: { id, at, missionId, score, stars, poseId, poses:{petId:pose}, prop, propAction, object, location,
           time, season, subjects:[petId], journey, rarity, tag, filter, puzzle, relationType } */
export function recordPhoto(st, meta, now = Date.now()) {
  const w = ensure(st, now);
  meta = { ...meta, at: meta.at || now, time: meta.time || timeOfDay(meta.at || now), season: meta.season || seasonOf(meta.at || now),
    subjects: meta.subjects && meta.subjects.length ? meta.subjects : [st.pet?.id].filter(Boolean) };
  if (meta.subjects.length >= 2 && !meta.relationType) meta.relationType = pairTypes(st, meta.subjects).sort((a, b) => (RELATION_TYPES[b]?.at || 0) - (RELATION_TYPES[a]?.at || 0))[0];
  w.photos.push(meta); if (w.photos.length > 2000) w.photos.shift();
  const out = { journal: [], album: [], honors: [], collections: [], projects: [], xp: 0, retro: [] };
  // counters
  count(st, 'photos');
  if (meta.stars >= 5) { if (count(st, 'five_star') && novelXP(st, `five:${meta.missionId}`, XP_SOURCES.new_five_star, now)) {} for (const id of meta.subjects) count(st, `five:${id}`); }
  if (meta.journey) { count(st, 'journeys'); for (const id of meta.subjects) count(st, `journeys:${id}`); }
  if (meta.rarity && rank(meta.rarity) >= rank('rare')) count(st, 'rares');
  if (meta.rarity === 'legendary') { count(st, 'legendary'); out.xp += novelXP(st, `legend:${meta.id}`, XP_SOURCES.legendary_moment, now); }
  else if (meta.rarity && rank(meta.rarity) >= rank('rare')) out.xp += novelXP(st, `rare:${meta.object || meta.poseId}`, XP_SOURCES.rare_moment, now);
  if (meta.location) { w.locations[meta.location] = w.locations[meta.location] || { visits: 0, photos: 0, placed: [] }; w.locations[meta.location].photos++; }
  if (['dance', 'disco', 'twirl', 'moonwalk'].includes(meta.poseId)) for (const id of meta.subjects) count(st, `dance:${id}`);
  // relationships grow from shared photos
  for (let i = 0; i < meta.subjects.length; i++) for (let j = i + 1; j < meta.subjects.length; j++) bond(st, meta.subjects[i], meta.subjects[j], meta.tag === 'meal' ? 'meal' : meta.journey ? 'walk' : meta.object ? 'play' : 'photo', 1, now);
  // journal (per subject species)
  for (const id of meta.subjects) {
    const pet = petById(st, id); if (!pet) continue;
    const mine = { ...meta, poseId: meta.poses?.[id] || meta.poseId, poses: null };   // judge each pet by its OWN pose
    for (const e of journalEntriesFor(pet.species)) if (!w.journal[pet.species]?.[e.id] && journalTest(st, e.test, mine)) {
      (w.journal[pet.species] = w.journal[pet.species] || {})[e.id] = { at: now, photoId: meta.id, petId: id };
      out.journal.push({ species: pet.species, entry: e }); out.xp += novelXP(st, `journal:${pet.species}:${e.id}`, XP_SOURCES.journal_entry, now);
    }
    out.album.push(...albumFromPhoto(st, id, mine, now));
  }
  out.honors = checkHonors(st, now);
  out.collections = checkCollections(st, meta, now);
  out.projects = projectEvent(st, meta.stars >= 5 ? 'five_star' : 'photo', now);
  if (meta.rarity && rank(meta.rarity) >= rank('rare')) out.projects.push(...projectEvent(st, 'rare', now));
  if (meta.tag === 'meal') out.projects.push(...projectEvent(st, 'meal', now));
  if (meta.journey) out.projects.push(...projectEvent(st, 'journey', now));
  out.v2 = onPhoto(st, meta, now);   // 2.0: the same photo advances Album, Wins and the live event
  return out;
}
export function journalEntriesFor(species) {
  const fam = SPECIES[species]?.family === 'house' ? (species.startsWith('cat') ? 'cat' : species.startsWith('dog') ? 'dog' : species) : species;
  return [...JOURNAL_ENTRIES.common, ...(JOURNAL_ENTRIES[fam] || []), ...JOURNAL_ENTRIES.puzzle].map(([id, name, category, test]) => ({ id, name, category, test }));
}
export function journalTest(st, t, m) {
  if (t.poseAny && !t.poseAny.includes(m.poseId) && !Object.values(m.poses || {}).some(p => t.poseAny.includes(p))) return false;   // collections/league: anyone in frame
  if (t.propAction && m.propAction !== t.propAction) return false;
  if (t.object && m.object !== t.object && m.prop !== OBJECTS[t.object]?.prop) return false;
  if (t.anyObject && !t.anyObject.includes(m.object)) return false;
  if (t.subjects && (m.subjects?.length || 1) < t.subjects) return false;
  if (t.relationAtLeast && !(m.relationType && RELATION_TYPES[m.relationType]?.at >= RELATION_TYPES[t.relationAtLeast].at)) return false;
  if (t.relationType && m.relationType !== t.relationType) return false;
  if (t.relation && !(m.relationType && m.relationType !== 'acquainted')) return false;
  if (t.journey && !m.journey) return false;
  if (t.location && m.location !== t.location) return false;
  if (t.anyLocation && !t.anyLocation.includes(m.location)) return false;
  if (t.time && !t.time.includes(m.time)) return false;
  if (t.season && m.season !== t.season) return false;
  if (t.seasonal && !m.season) return false;
  if (t.rarityAtLeast && !(m.rarity && rank(m.rarity) >= rank(t.rarityAtLeast))) return false;
  if (t.puzzle && m.puzzle !== t.puzzle) return false;
  if (t.tag && m.tag !== t.tag) return false;
  if (t.starsAtLeast && (m.stars || 0) < t.starsAtLeast) return false;
  return true;
}
export function journalView(st, species) {
  const w = ensure(st), got = w.journal[species] || {};
  const entries = journalEntriesFor(species).map(e => ({ ...e, found: got[e.id] || null }));
  const byCat = JOURNAL_CATEGORIES.map(c => ({ ...c, entries: entries.filter(e => e.category === c.id) })).filter(c => c.entries.length);
  return { species, total: entries.length, found: entries.filter(e => e.found).length, categories: byCat };
}
export const journalCount = st => Object.values(ensure(st).journal).reduce((a, s) => a + Object.keys(s).length, 0);
/** Claim every Journal milestone reached on a species page (once each). */
export function claimJournal(st, species, now = Date.now()) {
  const w = ensure(st), v = journalView(st, species), c = w.journalClaims[species] = w.journalClaims[species] || {}, out = [];
  for (const m of JOURNAL_MILESTONES) {
    const key = String(m.at);
    const reached = typeof m.at === 'number' ? v.found >= m.at : m.at === 'category' ? v.categories.some(x => x.entries.every(e => e.found)) : v.found === v.total;
    if (!reached || c[key]) continue;
    c[key] = now;
    const r = { at: m.at, ...m.reward };
    if (m.reward.coins) r.coins = ledger.earn(st, { id: `journal:${species}:${key}`, source: 'journal', amount: m.reward.coins, now }).amount;
    if (m.reward.item && !(st.inventory || []).includes(m.reward.item)) { st.inventory.push(m.reward.item); st.ownership = st.ownership || {}; st.ownership[m.reward.item] = { via: 'ACHIEVEMENT', at: now, ref: `journal:${species}:${key}` }; }
    if (m.reward.title) { st.titles = st.titles || []; if (!st.titles.includes(`${SPECIES[species].name} ${m.reward.title}`)) st.titles.push(`${SPECIES[species].name} ${m.reward.title}`); }
    out.push(r);
  }
  return out;
}

/* ================================================================ LIFE ALBUM (per individual pet) */
export function albumMark(st, petId, id, photoId = null, now = Date.now(), note = null) {
  const a = ensure(st).albums[petId] = st.world.albums[petId] || {};
  if (a[id]) return null;
  a[id] = { at: now, photoId, note };
  count(st, 'album_milestones');
  return { petId, id, name: LIFE_MILESTONES.find(m => m[0] === id)?.[1] || id };
}
function albumFromPhoto(st, petId, m, now) {
  const out = [], mark = (id, note) => { const r = albumMark(st, petId, id, m.id, now, note); if (r) out.push(r); };
  mark('first_photo');
  if (m.stars >= 5) mark('first_five');
  if (m.journey) mark('first_journey');
  if (m.tag === 'meal') mark('first_meal');
  if (m.rarity && rank(m.rarity) >= rank('rare')) mark('first_rare');
  if (m.rarity === 'legendary') mark('first_legendary');
  if (['roll', 'spin', 'dance', 'highfive', 'bow', 'salute', 'statue'].includes(m.poseId)) mark('first_trick');
  const n = ensure(st).photos.filter(p => (p.subjects || []).includes(petId)).length;
  if (n >= 100) mark('photos_100');
  // favourites: most used toy / pose / location
  const fav = k => { const c = {}; for (const p of st.world.photos) if ((p.subjects || []).includes(petId) && p[k]) c[p[k]] = (c[p[k]] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || null; };
  const a = st.world.albums[petId]; a.favorites = { toy: fav('object') || fav('prop'), pose: fav('poseId'), location: fav('location') };
  return out;
}
export function albumView(st, petId) {
  const a = ensure(st).albums[petId] || {};
  return { milestones: LIFE_MILESTONES.map(([id, name]) => ({ id, name, ...(a[id] || {}), done: !!a[id] })), favorites: a.favorites || {}, relations: relationsOf(st, petId), care: careState(st, petId), specialty: specialtyOf(st, petId) };
}

/* ================================================================ HONORS */
function honorCount(st, counts) {
  const w = st.world, P = w.photos;
  switch (counts) {
    case 'portrait': return P.filter(p => ['idle', 'sit', 'happy', 'look', 'wink', 'surprised', 'sleep'].includes(p.poseId) && (p.stars || 0) >= 3).length;
    case 'action': return P.filter(p => ['jump', 'leap', 'catch', 'roll', 'spin', 'dance'].includes(p.poseId) && (p.stars || 0) >= 3).length;
    case 'multi': return P.filter(p => (p.subjects || []).length >= 2).length;
    case 'night': return P.filter(p => ['evening', 'night'].includes(p.time)).length;
    case 'journey': return P.filter(p => p.journey).length;
    case 'album': return w.counts.album_milestones || 0;
    case 'rare': return P.filter(p => p.rarity && rank(p.rarity) >= rank('rare')).length;
    case 'relation': return P.filter(p => p.relationType && p.relationType !== 'acquainted').length;
    case 'meal': return P.filter(p => p.tag === 'meal').length;
    case 'homeland': return P.filter(p => p.location).length;
    case 'trained': return P.filter(p => ['roll', 'bow', 'highfive', 'salute', 'statue', 'weave', 'leap'].includes(p.poseId)).length;
    case 'seasonal': return P.filter(p => p.seasonal).length;
  }
  return 0;
}
export function checkHonors(st, now = Date.now()) {
  const w = ensure(st), out = [];
  for (const h of HONORS) {
    const n = honorCount(st, h.counts), have = w.honors[h.id] || 0;
    for (const t of HONOR_TIERS) if (t.n > have && n >= t.need) {
      w.honors[h.id] = t.n;
      const coins = h.reward.coins[t.n - 1] || 0, item = (h.reward.item || [])[t.n - 1];
      const r = { honor: h, tier: t, coins: coins ? ledger.earn(st, { id: `honor:${h.id}:${t.n}`, source: 'honor', amount: coins, now }).amount : 0 };
      if (item && !(st.inventory || []).includes(item)) { st.inventory.push(item); st.ownership = st.ownership || {}; st.ownership[item] = { via: 'ACHIEVEMENT', at: now, ref: `honor:${h.id}` }; r.item = item; }
      if (t.n === 4) { st.titles = st.titles || []; if (!st.titles.includes(h.name)) st.titles.push(h.name); }
      out.push(r);
    }
  }
  return out;
}
export const honorTiers = st => Object.values(ensure(st).honors).reduce((a, b) => a + b, 0);
export const honorView = st => { ensure(st); return HONORS.map(h => { const n = honorCount(st, h.counts), tier = st.world.honors[h.id] || 0, next = HONOR_TIERS.find(t => t.n > tier); return { ...h, n, tier, next }; }); };

/* ================================================================ COLLECTIONS */
export function checkCollections(st, meta, now = Date.now()) {
  const w = ensure(st), out = [];
  for (const c of COLLECTIONS) {
    const s = w.collections[c.id] = w.collections[c.id] || { done: {} };
    for (const g of c.goals) if (!s.done[g.id] && journalTest(st, g.test, meta)) { s.done[g.id] = now; out.push({ collection: c, goal: g }); }
    if (!s.claimed && c.goals.every(g => s.done[g.id])) {
      s.claimed = now; count(st, 'collections');
      if (c.reward && !(st.inventory || []).includes(c.reward)) { st.inventory.push(c.reward); st.ownership = st.ownership || {}; st.ownership[c.reward] = { via: 'ACHIEVEMENT', at: now, ref: `collection:${c.id}` }; }
      novelXP(st, `collection:${c.id}`, XP_SOURCES.collection_complete, now);
      out.push({ collection: c, complete: true, reward: c.reward });
    }
  }
  return out;
}

/* ================================================================ COMMUNITY PROJECTS (progress, not currency) */
export function activeProject(st) {
  const w = ensure(st), L = st.progress?.level || 1;
  return PROJECTS.find(p => L >= p.level && !w.projects[p.id]?.done) || null;
}
/** Normal play events push the current project. Returns completions. */
export function projectEvent(st, kind, now = Date.now()) {
  const p = activeProject(st); if (!p || !p.weights[kind]) return [];
  const s = st.world.projects[p.id] = st.world.projects[p.id] || { points: 0, log: {} };
  s.points = Math.min(p.goal, s.points + p.weights[kind]); s.log[kind] = (s.log[kind] || 0) + p.weights[kind];
  novelXP(st, `project:${p.id}:${kind}`, XP_SOURCES.project_contribution, now);
  if (s.points >= p.goal && !s.done) {
    s.done = now; s.unlocks = p.unlocks; count(st, 'projects');
    for (const pet of pets(st)) albumMark(st, pet.id, 'home_built', null, now, p.name);
    novelXP(st, `project_done:${p.id}`, XP_SOURCES.project_complete, now);
    return [{ project: p, complete: true }];
  }
  return [{ project: p, points: s.points }];
}

/* ================================================================ POKA LIFE */
export function lifeView(st, now = Date.now()) {
  const L = ensure(st).life, day = dkey(now);
  if (L.day !== day) { L.day = day; L.done = {}; }
  return { day, done: L.done, count: Object.keys(L.done).length, goal: LIFE_GOAL.any, paid: !!L.goalPaid[day], list: LIFE_ADVENTURES };
}
/** Any 3 of the 7 count — no rigid chore list. */
export function completeLife(st, id, extra = {}, now = Date.now()) {
  const v = lifeView(st, now), L = st.world.life, out = { id, first: !L.done[id] };
  if (!LIFE_ADVENTURES.some(a => a.id === id)) return { ok: false };
  if (!L.done[id]) { L.done[id] = now; count(st, 'life_adventures'); out.xp = novelXP(st, `life:${id}`, XP_SOURCES.life_adventure, now); }
  for (const p of activePets(st)) careAction(st, p.id, id, now);
  if (id === 'eat') { for (const p of activePets(st)) albumMark(st, p.id, 'first_meal', null, now); out.projects = projectEvent(st, 'meal', now); }
  if (id === 'walk') out.projects = projectEvent(st, 'walk', now);
  if (id === 'play') out.projects = projectEvent(st, 'play', now);
  if (id === 'train') out.projects = projectEvent(st, 'train', now);
  const v2 = lifeView(st, now);
  if (v2.count >= LIFE_GOAL.any && !L.goalPaid[v2.day]) { L.goalPaid[v2.day] = now; out.goal = true; out.xp = (out.xp || 0) + novelXP(st, `lifegoal:${v2.day}`, LIFE_GOAL.bonusXP, now); }
  return { ok: true, ...out };
}

/* ================================================================ ADVENTURE PARTY (1–3 pets on a walk) */
export function adventureResult(st, { party, steps = 0, minutes = 0 }, now = Date.now()) {
  const ids = party.filter(id => petById(st, id)).slice(0, 3);
  if (!ids.length) return { ok: false };
  // Rewards scale with walk TIME only. HealthKit steps stay on the device (walk.js) and must not
  // leak into bonds, discoveries or other progress that is backed up to the cloud.
  const bondEach = Math.min(30, Math.round(6 + minutes / 2));
  const res = { steps, minutes, bonds: [], friendships: [], community: 0, discoveries: 0, journeyReady: minutes >= 10 };
  for (const id of ids) { const c = careAction(st, id, 'walk', now); res.bonds.push({ id, name: petById(st, id).name, bond: bondEach }); count(st, `walks:${id}`); albumMark(st, id, 'first_walk', null, now); }
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const r = bond(st, ids[i], ids[j], 'walk', 1 + Math.min(minutes, 60) / 20, now); res.friendships.push({ a: ids[i], b: ids[j], gain: Math.round(RELATION_GAIN.walk * (1 + Math.min(minutes, 60) / 20)), upgraded: r?.upgraded || null }); }
  const pr = projectEvent(st, 'walk', now); res.community = pr[0]?.project ? pr[0].project.weights.walk : 0; res.project = pr[0] || null;
  if (minutes >= 20) { res.discoveries = 1; count(st, 'discoveries'); novelXP(st, `discovery:${dkey(now)}`, XP_SOURCES.journey_discovery, now); }
  completeLife(st, 'walk', {}, now);
  return { ok: true, ...res };
}

/* ================================================================ POKA LEAGUE (friendly; money can't guarantee a win) */
export function leagueEvent(now = Date.now()) {
  const week = Math.floor((now - Date.UTC(2026, 8, 28)) / (7 * DAY));
  const e = LEAGUE_ROTATION[((week % LEAGUE_ROTATION.length) + LEAGUE_ROTATION.length) % LEAGUE_ROTATION.length];
  return { ...e, week, key: `${e.id}:${week}` };
}
function leagueMatch(st, e, m) {
  const t = e.match; let s = 0, n = 0;
  const chk = ok => { n++; if (ok) s++; };
  if (t.poseAny) chk(t.poseAny.includes(m.poseId)); if (t.tag) chk(m.tag === t.tag); if (t.subjects) chk((m.subjects || []).length >= t.subjects);
  if (t.journey) chk(!!m.journey); if (t.time) chk(t.time.includes(m.time)); if (t.object) chk(m.object === t.object);
  if (t.relation) chk(!!m.relationType && m.relationType !== 'acquainted'); if (t.rarityAtLeast) chk(!!m.rarity && rank(m.rarity) >= rank(t.rarityAtLeast)); if (t.seasonal) chk(!!m.seasonal);
  if (t.academy) chk(true);
  return n ? s / n : 0;
}
/** Enter a photo (or, for academy divisions, a discipline's best stars). Score ignores gear bonuses. */
export function leagueEnter(st, photoId, now = Date.now(), rnd = Math.random) {
  const w = ensure(st), e = leagueEvent(now), m = w.photos.find(p => p.id === photoId);
  if (!m && !e.match.academy) return { ok: false, reason: 'photo' };
  if (w.league.entries[e.key]) return { ok: false, reason: 'entered' };
  const W = LEAGUE.weights;
  const creativity = m ? Math.min(1, ((m.filter ? 0.4 : 0) + (m.object ? 0.3 : 0) + ((m.subjects || []).length - 1) * 0.15)) : 0.5;
  const quality = e.match.academy ? Math.min(1, Object.values(st.academy?.disciplines?.[e.match.academy]?.nodes || {}).reduce((a, b) => a + b, 0) / 60) : ((m.score - (m.gear || 0)) / 100);
  const you = W.match * (m ? leagueMatch(st, e, m) : 1) + W.quality * quality + W.rarity * (m?.rarity ? (rank(m.rarity) + 1) / 4 : 0.1) + W.creativity * creativity;
  const field = Array.from({ length: LEAGUE.entrants - 1 }, (_, i) => ({ name: ['Mochi', 'Pepper', 'Noodle', 'Biscuit', 'Clover', 'Waffles', 'Juniper'][i], score: 0.35 + rnd() * 0.5 }));
  const all = [...field, { name: 'You', score: you, you: true }].sort((a, b) => b.score - a.score);
  const place = all.findIndex(x => x.you) + 1;
  w.league.entries[e.key] = { photoId, place, score: +you.toFixed(3), at: now, event: e.id };
  if (place <= 3) w.league.top3++; if (place === 1) w.league.wins++;
  count(st, 'league_entries');
  for (const pet of activePets(st)) albumMark(st, pet.id, 'first_league', photoId, now);
  if (place <= 3) novelXP(st, `league:${e.key}`, XP_SOURCES.league_place * (place === 1 ? 1 : 0.6), now);
  return { ok: true, event: e, place, board: all.map(x => ({ name: x.name, score: Math.round(x.score * 100), you: !!x.you })) };
}

/* ================================================================ CARE, NEGLECT, RECOVERY, REVIVAL */
/** Meaningful care resets neglect; recovery from a bad state needs several actions, never money. */
export function careAction(st, petId, kind = 'care', now = Date.now()) {
  const c = ensure(st).care[petId]; if (!c || c.dead) return null;
  const s = careState(st, petId, now);
  count(st, `care:${petId}`);
  if (s.id === 'healthy') { c.lastCare = now; c.recovery = 0; return { state: 'healthy' }; }
  c.recovery = (c.recovery || 0) + 1;
  if (!c.recoveryStarted) c.recoveryStarted = now;
  if (c.recovery >= NEGLECT.recoveryCareActions) { c.lastCare = now; c.recovery = 0; c.warnedAt = 0; c.recoveryStarted = 0; return { state: 'healthy', recovered: true }; }
  return { state: s.id, recovering: c.recovery, of: NEGLECT.recoveryCareActions };
}
/** Days of neglect -> state. Long absences (vacation) count at half speed after the first week away. */
/** Inverse of careState's time rule (days after the first week count at half speed, up to vacationCap). */
export function rawDaysFor(effective) {
  const cap = NEGLECT.vacationCap;
  if (effective <= 7) return effective;
  if (effective <= 7 + cap * 0.5) return 7 + (effective - 7) * 2;
  return 7 + cap + (effective - 7 - cap * 0.5);
}
export function careState(st, petId, now = Date.now()) {
  const c = ensure(st).care[petId]; if (!c) return NEGLECT.states[0];
  if (c.dead) return { id: 'memorial', name: 'In the Memorial Garden' };
  let days = (now - c.lastCare) / DAY;
  if (days > 7) days = 7 + Math.min(days - 7, NEGLECT.vacationCap) * 0.5 + Math.max(0, days - 7 - NEGLECT.vacationCap);
  let s = NEGLECT.states[0];
  for (const x of NEGLECT.states) if (days >= x.after) s = x;
  if (c.recovery) s = { ...s, recovering: c.recovery };
  return { ...s, days: Math.floor(days) };
}
export function careEffect(st, petId) { const s = careState(st, petId); return s.effect || {}; }
/** Call on app open: shows warnings; only a pet whose Critical warning was SEEN can pass on after the grace period. */
export function careTick(st, now = Date.now()) {
  const w = ensure(st), out = [];
  for (const p of pets(st)) {
    const c = w.care[p.id]; if (c.dead) continue;
    const s = careState(st, p.id, now);
    if (s.id !== c.state) { out.push({ pet: p, from: c.state, to: s.id }); c.state = s.id; }
    if (s.id === 'critical' && !c.warnedAt) { c.warnedAt = now; out.push({ pet: p, warning: true }); }
    if (s.id === 'critical' && c.warnedAt && now - c.warnedAt >= NEGLECT.graceAfterWarning * DAY && pets(st).filter(x => !x.memorial).length > 0) {
      c.dead = now; p.memorial = { at: now }; count(st, 'memorials');
      albumMark(st, p.id, 'memorial', null, now, 'Resting in the Memorial Garden');
      if (st.activeIds) st.activeIds = st.activeIds.filter(id => id !== p.id);
      out.push({ pet: p, passed: true });
    }
  }
  return out;
}
/** Revival Treats are earned at L50 and L100 (never bought). A Diamond route exists but is never pushed at the moment of loss. */
export function earnRevivalTreats(st, now = Date.now()) {
  const w = ensure(st), L = st.progress?.level || 1, out = [];
  for (const lvl of REVIVAL.treatsEarnedAt) if (L >= lvl && !w.revival.earned[lvl]) { w.revival.earned[lvl] = now; w.revival.treats++; out.push(lvl); }
  return out;
}
export function revive(st, petId, { with: method = 'treat' } = {}, now = Date.now()) {
  const w = ensure(st), p = petById(st, petId), c = w.care[petId];
  if (!p || !c?.dead) return { ok: false, reason: 'not-memorial' };
  if (method === 'treat') { if (w.revival.treats < 1) return { ok: false, reason: 'no-treat' }; w.revival.treats--; }
  else if (method === 'diamonds') {
    if (now - c.dead < REVIVAL.promoteAfterLossHours * 3600e3) return { ok: false, reason: 'too-soon' };   // no paid revival pushed in grief
    const r = ledger.spend(st, { id: `revive:${petId}:${now}`, source: 'revival', amount: REVIVAL.diamondCost, currency: 'dia', now }); if (!r.ok) return { ok: false, reason: 'short' };
  } else return { ok: false, reason: 'method' };
  delete p.memorial; c.dead = 0; c.warnedAt = 0; c.recovery = 0;
  c.lastCare = now - rawDaysFor(NEGLECT.states.find(s => s.id === REVIVAL.returnsAs).after + 0.5) * DAY;   // comes back withdrawn: trust must be rebuilt
  for (const r of relationsOf(st, petId)) { const rel = relation(st, petId, r.other); rel.points = Math.round(rel.points * REVIVAL.relationKeep); rel.type = typeFor(st, petId, r.other, rel); }
  w.revival.used.push({ petId, at: now, method });
  albumMark(st, petId, 'revived', null, now, 'Came back home');   // the album is never erased
  return { ok: true, state: careState(st, petId, now).id };
}

/* ================================================================ MOMENT RARITY (third photo dimension) */
export function momentRarity(ctx) {
  if (ctx.puzzle?.rarity) return ctx.puzzle.rarity;
  if (ctx.rolled) return ctx.rolled;
  if (ctx.rare) return ctx.rare.legendary ? 'legendary' : 'rare';
  if ((ctx.subjects || []).length >= 2 && ctx.relationType && ['best_friend', 'mentor'].includes(ctx.relationType)) return 'rare';
  if (ctx.object || (ctx.subjects || []).length >= 2 || ctx.journey || ['evening', 'night'].includes(ctx.time)) return 'uncommon';
  return 'common';
}

/* ================================================================ RETROACTIVE CREDIT */
/** When a new Journal/collection/challenge appears, anything already photographed counts. */
export function retroCredit(st, { challenges = [], requirementsMet, starsFor } = {}, now = Date.now()) {
  const w = ensure(st), notes = [];
  // journal & collections re-evaluated from the whole metadata log
  for (const m of w.photos) {
    for (const id of m.subjects || []) { const pet = petById(st, id); if (!pet) continue;
      const mine = { ...m, poseId: m.poses?.[id] || m.poseId, poses: null };
      for (const e of journalEntriesFor(pet.species)) if (!w.journal[pet.species]?.[e.id] && journalTest(st, e.test, mine)) {
        (w.journal[pet.species] = w.journal[pet.species] || {})[e.id] = { at: now, photoId: m.id, petId: id, retro: true }; notes.push({ journal: e.name });
      } }
    for (const c of COLLECTIONS) { const s = w.collections[c.id] = w.collections[c.id] || { done: {} }; for (const g of c.goals) if (!s.done[g.id] && journalTest(st, g.test, m)) { s.done[g.id] = now; notes.push({ collection: c.name, goal: g.text }); } }
  }
  // photo challenges: an earlier qualifying photo clears a newly appeared challenge
  if (requirementsMet) for (const ch of challenges) {
    if (st.progress.missions[ch.missionID] != null || !ch.req) continue;
    const hit = w.photos.filter(m => (m.score || 0) >= 50 && requirementsMet(ch.req, { ...m, itemIds: m.itemIds || [], at: m.at }, m.at).length === 0).sort((a, b) => b.score - a.score)[0];
    if (hit) { st.progress.missions[ch.missionID] = hit.score; st.stars = st.stars || {}; st.stars[ch.missionID] = Math.max(st.stars[ch.missionID] || 0, starsFor(hit.score)); notes.push({ challenge: ch.title, score: hit.score }); }
  }
  if (notes.length) w.retro.push(...notes.map(n => ({ ...n, at: now })));
  return notes;
}
/** One-time 1.4 backfill: turn existing album photos into metadata so nothing earned before 1.4 is lost. */
export function backfillFromAlbum(st, snaps, now = Date.now()) {
  const w = ensure(st); if (w.backfilled) return 0;
  let n = 0;
  for (const s of snaps) {
    if (w.photos.some(p => p.id === s.id)) continue;
    w.photos.push({ id: s.id, at: s.createdAt || s.at || now, missionId: s.missionID, score: s.score > 100 ? Math.round(s.score / 50) : s.score, stars: null, poseId: s.poseId, journey: !!s.journey,
      rarity: s.rare ? 'rare' : 'common', subjects: [st.pet?.id].filter(Boolean), backfill: true });
    n++;
  }
  w.backfilled = now;
  return n;
}

/* ================================================================ LOOKBACK */
export function lookback(st, span = 'day', now = Date.now()) {
  const w = ensure(st), ms = span === 'day' ? DAY : span === 'week' ? 7 * DAY : 31 * DAY;
  const from = span === 'day' ? +new Date(new Date(now).setHours(0, 0, 0, 0)) : span === 'month' ? +new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1) : now - ms;
  const photos = w.photos.filter(p => p.at >= from && p.at <= now);
  const best = [...photos].sort((a, b) => (b.score || 0) - (a.score || 0))[0] || null;
  return {
    span, from, photos: photos.length, best, rare: photos.filter(p => p.rarity && rank(p.rarity) >= rank('rare')).length,
    fiveStars: photos.filter(p => p.stars >= 5).length, journeys: photos.filter(p => p.journey).length,
    steps: (st.walk?.history || []).filter(h => h.at >= from).reduce((a, h) => a + (h.steps || 0), 0) || (span === 'day' ? st.walk?.steps || 0 : 0),
    life: Object.keys(w.life.done || {}).length, relations: Object.values(w.relations).flatMap(r => r.history).filter(h => h.at >= from),
    journal: Object.values(w.journal).flatMap(s => Object.values(s)).filter(e => e.at >= from).length,
  };
}
