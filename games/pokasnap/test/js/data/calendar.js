/* CONTENT CALENDAR — 12 monthly seasons, 52 weekly adventures, a 13-week
   production runway and a duplicate/theme detector.
   ---------------------------------------------------------------------------
   Weeks start Monday. Week 1 = 2026-09-28 (the 1.3 launch week). Every week
   names a theme, a mechanic focus (so weeks feel different, not just recoloured),
   a headline item (earn / Plus / buy), a prestige item (earn only) and its
   production status. `validate()` is run by the tests and the Echo package. */

export const SEASONS = [
  { month: 1,  id: 'winterglow', name: 'New Beginnings / Winter Glow', theme: 'Fresh goals, soft snow, glowing indoor studio', palette: ['#5ec8f2', '#ffffff'], collection: 'winter_studio' },
  { month: 2,  id: 'friendship', name: 'Friendship Festival',           theme: 'Kindness, hearts, best-friend poses',            palette: ['#ff6b8b', '#ffd6e0'], collection: 'friendship' },
  { month: 3,  id: 'springtrails', name: 'Spring Trails',               theme: 'First flowers, trail walks, gardens',            palette: ['#53d3a2', '#fff3a8'], collection: 'garden' },
  { month: 4,  id: 'rainy',      name: 'Rainy Adventures',              theme: 'Rain gear, puddles, rainbows',                   palette: ['#5ec8f2', '#b28cff'], collection: 'rainbow' },
  { month: 5,  id: 'picnic',     name: 'Garden & Picnic',               theme: 'Picnics, blossoms, flower crowns',               palette: ['#ff8fb1', '#9be37a'], collection: 'picnic' },
  { month: 6,  id: 'splash',     name: 'Summer Splash',                 theme: 'Beach, pool, bubbles, sun hats',                 palette: ['#ffd23f', '#5ec8f2'], collection: 'beach' },
  { month: 7,  id: 'starlight',  name: 'Starlight Adventure',           theme: 'Night skies, fireflies, stargazing',             palette: ['#3a3470', '#ffd84a'], collection: 'starlight' },
  { month: 8,  id: 'camp',       name: 'Camp & Explorer',               theme: 'Campfires, trails, explorer gear',               palette: ['#4f9a5b', '#ff8a5b'], collection: 'campfire' },
  { month: 9,  id: 'cozytrails', name: 'Cozy Trails',                   theme: 'Sweaters, books, first autumn walks',            palette: ['#a98bf0', '#ffd08a'], collection: 'classroom' },
  { month: 10, id: 'spooky',     name: 'Spooky Paws',                   theme: 'Friendly costumes, pumpkins, lanterns (never scary)', palette: ['#e8812f', '#3a3470'], collection: 'autumn' },
  { month: 11, id: 'harvest',    name: 'Harvest Adventure',             theme: 'Leaves, harvest, thankful moments',              palette: ['#b5452b', '#ffd08a'], collection: 'harvest' },
  { month: 12, id: 'winterlights', name: 'Winter Lights',               theme: 'Twinkle lights, snow, gifts, sparkle',           palette: ['#2f86c0', '#ffffff'], collection: 'winter_lights' },
];

/* Per-month content plan, filled from the real catalog so every ID exists.
   Picks rotate through each category, so no month reuses another's prop/pose/
   background/filter, and the monthly headline outfit never shares a silhouette
   (draw) with the previous month's. */
import { ITEMS as CAT } from './items.js';
import { PRODUCTS } from './store.js';
const KEYS = {
  winterglow: 'snow winter glow cozy cream studio star', friendship: 'heart love pink friend bow pearl', springtrails: 'flower spring garden trail leaf sakura petal',
  rainy: 'rain puddle umbrella rainbow boot', picnic: 'picnic garden flower cupcake donut sunflower', splash: 'beach pool bubble sunny sunhat splash shell swim watermelon lemonade',
  starlight: 'star night firefl moon galaxy space observ', camp: 'camp explorer trail lantern mountain hiker backpack', cozytrails: 'sweater book library scholar cozy glasses',
  spooky: 'pumpkin lantern witch wizard cape night bat', harvest: 'harvest leaf autumn maple pinecone acorn orange', winterlights: 'snow sparkle gift candy light winter',
};
const used = new Set();
const themed = (S, list) => {
  const kw = KEYS[S.id].split(' ');
  const hit = list.find(it => !used.has(it.itemID) && kw.some(k => (it.itemID + ' ' + it.name + ' ' + (it.tags || []).join(' ') + ' ' + (it.season || '')).toLowerCase().includes(k)))
    || list.find(it => !used.has(it.itemID));
  if (hit) used.add(hit.itemID); return hit || null;
};
const byCat = c => CAT.filter(i => i.category === c && !i.prestige);
const packs = PRODUCTS.filter(p => p.type === 'non_consumable' && p.key.startsWith('pack.'));
const plusItems = CAT.filter(i => i.paths.some(p => p.type === 'PLUS_ACCESS' || p.type === 'PLUS_PURCHASE'));
const prestige = CAT.filter(i => i.prestige);
// Backgrounds are hand-picked per month: keyword matching + uniqueness gave November a
// snowy hill (1.4 K2), August an autumn trail and October a kitchen.
const BG_PIN = { 1: 'bg_snowhill', 2: 'bg_rainbow', 3: 'bg_sakura', 4: 'bg_park', 5: 'bg_garden', 6: 'bg_beach',
  7: 'bg_observatory', 8: 'bg_campsite', 9: 'bg_library', 10: 'bg_citynight', 11: 'bg_autumntrail', 12: 'bg_stage' };
let prevDraw = null;
for (const [i, S] of SEASONS.entries()) {
  let head = themed(S, byCat('outfit').filter(o => o.slot === 'BODY' && o.draw !== prevDraw));
  prevDraw = head?.draw;
  Object.assign(S, {
    majorPack: i < packs.length ? packs[i].key : `pack.${S.id} (planned)`,
    headline: head?.itemID, prestige: themed(S, prestige)?.itemID, plusDrop: themed(S, plusItems)?.itemID,
    prop: themed(S, byCat('prop'))?.itemID, pose: themed(S, byCat('pose'))?.itemID, background: BG_PIN[S.month] || themed(S, byCat('background'))?.itemID, filter: themed(S, byCat('filter'))?.itemID,
    adventureGoals: [`Take 5 ${S.name} photos`, 'Complete a themed Journey Snap', 'Earn 15 new stars this month'],
  });
}

/* Weekly templates: [id, name, mechanic focus, headline, prestige] — a template
   may recur at most once per 12 weeks and never in adjacent weeks. */
export const WEEK_TEMPLATES = {
  explorer:  { name: 'Explorer Week',        focus: 'walking',     headline: 'body_hoodie_explorer', prestige: 'body_hoodie_sunset' },
  rainy:     { name: 'Rainy Day Week',       focus: 'filters',     headline: 'body_raincoat_puddle', prestige: 'body_raincoat_rainbow' },
  fetchfest: { name: 'Fetch Fest',           focus: 'props',       headline: 'prop_frisbee',         prestige: 'prop_goldball' },
  studio:    { name: 'Studio Week',          focus: 'composition', headline: 'bg_studio',            prestige: 'frame_starlight' },
  yarnweek:  { name: 'Yarn Lab Challenge',   focus: 'training',    headline: 'prop_yarn',            prestige: 'body_sweater_snowflake' },
  night:     { name: 'Night Owl Week',       focus: 'time',        headline: 'filter_fireflies',     prestige: 'filter_stardust' },
  tricks:    { name: 'Trick Show',           focus: 'training',    headline: 'bg_stage',             prestige: 'body_cape_master' },
  combo:     { name: 'Combo Carnival',       focus: 'combination', headline: 'filter_confetti',      prestige: 'head_starcrown' },
  rare:      { name: 'Rare Moment Hunt',     focus: 'rare',        headline: 'filter_sparkle',       prestige: 'neck_master_lens' },
  picnic:    { name: 'Picnic Week',          focus: 'props',       headline: 'bg_garden',            prestige: 'head_leafcrown' },
  scent:     { name: 'Detective Week',       focus: 'training',    headline: 'prop_book',            prestige: 'bg_observatory' },
  dress:     { name: 'Fashion Week',         focus: 'gear',        headline: 'body_hoodie_galaxy',   prestige: 'body_suit_aurora' },
  journey:   { name: 'Grand Tour',           focus: 'walking',     headline: 'bg_campsite',          prestige: 'body_cape_constellation' },
};
const ORDER = ['explorer', 'rainy', 'fetchfest', 'studio', 'yarnweek', 'night', 'tricks', 'combo', 'rare', 'picnic', 'scent', 'dress', 'journey'];

export const WEEK1 = '2026-09-28';
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

/* 52 weeks: the 13 templates rotate four times (each recurs every 13 weeks, so
   each lands in a different season every quarter); the season comes from the month. */
export const WEEKS = Array.from({ length: 52 }, (_, i) => {
  const start = addDays(WEEK1, i * 7), month = +start.slice(5, 7);
  const tpl = ORDER[i % 13];
  const T = WEEK_TEMPLATES[tpl], S = SEASONS[month - 1];
  return {
    week: i + 1, start, end: addDays(start, 6), template: tpl, name: `${T.name}`, season: S.id, seasonName: S.name,
    focus: T.focus, headline: T.headline, prestige: T.prestige,
    status: i < 8 ? 'READY' : i < 13 ? 'IN_PRODUCTION' : 'PLANNED',   // 13-week runway: 8 production-ready
  };
});

/** Duplicate / theme detector. Returns a list of human-readable problems ([] = clean). */
export function validate(weeks = WEEKS, items = null) {
  const out = [];
  for (let i = 1; i < weeks.length; i++) if (weeks[i].template === weeks[i - 1].template) out.push(`weeks ${i} and ${i + 1} repeat ${weeks[i].template}`);
  for (let i = 0; i < weeks.length; i++) for (let j = i + 1; j < Math.min(weeks.length, i + 12); j++)
    if (weeks[i].template === weeks[j].template) out.push(`${weeks[i].template} recurs within 12 weeks (w${i + 1}, w${j + 1})`);
  const heads = {}; for (const w of weeks) (heads[w.headline] = heads[w.headline] || []).push(w.week);
  for (const w of weeks) if (w.headline === w.prestige) out.push(`w${w.week} headline equals prestige`);
  if (items) for (const w of weeks) for (const id of [w.headline, w.prestige]) if (!items.some(it => it.itemID === id)) out.push(`w${w.week} names unknown item ${id}`);
  const ready = weeks.slice(0, 13).filter(w => w.status === 'READY').length;
  if (ready < 8) out.push(`runway has only ${ready} production-ready weeks (need 8)`);
  const names = weeks.map(w => `${w.name}|${w.season}`); const dup = names.filter((n, i) => names.indexOf(n) !== i);
  if (dup.length) out.push(`same template + season repeats: ${[...new Set(dup)].join(', ')}`);
  if (items) for (let m = 1; m < SEASONS.length; m++) {
    const a = items.find(i => i.itemID === SEASONS[m - 1].headline), b = items.find(i => i.itemID === SEASONS[m].headline);
    if (a && b && a.draw === b.draw) out.push(`months ${m} and ${m + 1} share the headline silhouette "${a.draw}"`);
  }
  return out;
}
/** Near-duplicate WARNINGS for the owner (never auto-rejected): releases that share
    category + silhouette + primary colour, or name stem + perk. */
export function nearDuplicates(items = CAT) {
  const warn = [], seen = new Map();
  for (const it of items.filter(i => !['POSE', 'LOOK'].includes(i.slot))) {
    const k1 = `${it.category}|${it.draw}|${(it.color || '').toLowerCase()}`;
    if (seen.has(k1)) warn.push({ a: seen.get(k1), b: it.itemID, why: 'same category, silhouette and primary colour' }); else seen.set(k1, it.itemID);
  }
  const stem = it => it.name.toLowerCase().replace(/[—-].*$/, '').trim();
  const s2 = new Map();
  for (const it of items) { const k = `${stem(it)}|${it.perks.map(p => p.perk).join(',')}`; if (s2.has(k)) warn.push({ a: s2.get(k), b: it.itemID, why: 'same name stem and perk' }); else s2.set(k, it.itemID); }
  return warn;
}
export const weekFor = (iso) => WEEKS.find(w => iso >= w.start && iso <= w.end) || null;
export const seasonFor = month => SEASONS[month - 1];
