/* MASTER CATALOG — every collectible in PokaSnap, data only.
   ---------------------------------------------------------------------------
   Categories (launch target ~260; pets counted separately):
     outfit (BODY + LOOK) · headwear (HEAD) · accessory (NECK/FACE/BACK) ·
     prop (PROP) · background (BG) · filter (FILTER) · frame (FRAME) · pose (POSE)

   ACQUISITION ROUTES (an item declares one or more; first grant = OWNED forever)
     COIN {cost}            DIAMOND {cost}          LEVEL {level}  (0 = starter)
     STAR {stars}           TRAINING {discipline, rank} | {skill}
     EVENT {event, points, plusAuto?} | {monthlyDays[, month], plusAuto?} | {friday}
     WALKING {steps}        ADVENTURE_BOOK {collection, part}
     ACHIEVEMENT {badge}    PRESTIGE {event|level|mastery}  (earn-only status)
     PLUS_PURCHASE {diamonds}   Plus members may buy now with Diamonds
     PLUS_ACCESS {months}   usable while subscribed; NOT owned
     DIRECT_PURCHASE {product}  App Store product (data/store.js)
     SEASONAL {from, to}    offer window (MM-DD)

   EARN-ONLY = no COIN / DIAMOND / PLUS_PURCHASE / PLUS_ACCESS / DIRECT_PURCHASE.
   PRESTIGE is an accomplishment flag, not more power: perks share the same caps.
   Existing 1.0-1.2 itemIDs are preserved so every save keeps what it owns. */

import { PRICE } from './economy.js';

export const SLOTS = ['HEAD', 'NECK', 'BODY', 'FACE', 'BACK', 'FRAME', 'POSE', 'LOOK', 'PROP', 'BG', 'FILTER', 'SPECIAL'];
export const WEARABLE = ['HEAD', 'NECK', 'BODY', 'FACE', 'BACK', 'FRAME', 'PROP', 'BG', 'FILTER'];
export const CATEGORY_OF = { BODY: 'outfit', LOOK: 'outfit', HEAD: 'headwear', NECK: 'accessory', FACE: 'accessory', BACK: 'accessory', PROP: 'prop', BG: 'background', FILTER: 'filter', FRAME: 'frame', POSE: 'pose' };
export const CATEGORIES = ['outfit', 'headwear', 'accessory', 'prop', 'background', 'filter', 'frame', 'pose'];
export const CLOSET_TABS = ['OWNED', 'HEAD', 'NECK', 'BODY', 'FACE', 'BACK', 'FRAME', 'LOOK'];
export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const ENTITLEMENTS = ['COIN', 'DIAMOND', 'LEVEL', 'STAR', 'TRAINING', 'EVENT', 'WALKING', 'ADVENTURE_BOOK', 'ACHIEVEMENT', 'PRESTIGE', 'PLUS_PURCHASE', 'PLUS_ACCESS', 'DIRECT_PURCHASE', 'SEASONAL'];
export const PAID_ROUTES = ['COIN', 'DIAMOND', 'PLUS_PURCHASE', 'PLUS_ACCESS', 'DIRECT_PURCHASE'];
export const EARN_ROUTES = ['LEVEL', 'STAR', 'TRAINING', 'EVENT', 'WALKING', 'ADVENTURE_BOOK', 'ACHIEVEMENT', 'PRESTIGE'];

const ALL = ['cat_fluffy', 'cat_short', 'dog_golden', 'dog_small', 'bunny'];
const R = {
  coin: cost => ({ type: 'COIN', cost }), dia: cost => ({ type: 'DIAMOND', cost }), lvl: level => ({ type: 'LEVEL', level }),
  star: stars => ({ type: 'STAR', stars }), train: (discipline, rank) => ({ type: 'TRAINING', discipline, rank }), skill: skill => ({ type: 'TRAINING', skill }),
  event: (event, points, plusAuto = false) => ({ type: 'EVENT', event, points, plusAuto }), monthly: (monthlyDays, month, plusAuto) => ({ type: 'EVENT', monthlyDays, month, plusAuto: !!plusAuto }),
  friday: () => ({ type: 'EVENT', friday: true }), walk: steps => ({ type: 'WALKING', steps }), book: (collection, part) => ({ type: 'ADVENTURE_BOOK', collection, part }),
  badge: badge => ({ type: 'ACHIEVEMENT', badge }), prestige: o => ({ type: 'PRESTIGE', ...o }), plusBuy: diamonds => ({ type: 'PLUS_PURCHASE', diamonds }),
  plusAccess: months => ({ type: 'PLUS_ACCESS', months }), buy: product => ({ type: 'DIRECT_PURCHASE', product }), season: (from, to) => ({ type: 'SEASONAL', from, to }),
};
const LIVE = '2026-09-28';
const I = (itemID, name, slot, rarity, draw, color, trim, paths, x = {}) => ({
  itemID, name, slot, category: CATEGORY_OF[slot], rarity, draw, color, trim, paths,
  petCompatibility: x.fits || ALL, perks: x.perks || [], set: x.set || null, pattern: x.pattern || null, tags: x.tags || [],
  prestige: !!x.prestige, pose: x.pose, icon: x.icon, season: x.season || null, fx: x.fx, blurb: x.blurb || null,
  release: { status: x.planned ? 'PLANNED' : 'LIVE', date: x.date || (x.planned ? null : LIVE), week: x.week ?? null },
});
const P = (perk, value) => ({ perk, value });   // value omitted = the perk's standard strength

/* =========================================================== OUTFITS (60) */
const OUTFITS = [
  I('body_hoodie', 'Snuggle Hoodie', 'BODY', 'rare', 'hoodie', '#8f6ad8', '#c9b6f2', [R.lvl(9)], { perks: [P('bond')] }),
  I('body_raincoat', 'Rain Slicker', 'BODY', 'rare', 'raincoat', '#ffd23f', '#e0a800', [R.coin(PRICE.premiumAccessory), R.buy('pack.rainyday')], { tags: ['rain', 'yellow'], set: 'rainy', perks: [P('explorer')] }),
  I('body_hoodie_explorer', 'Explorer Hoodie', 'BODY', 'rare', 'hoodie', '#4f9a5b', '#cfe8c4', [R.event('explorer', 100, true), R.buy('item.explorerhoodie')], { set: 'explorer', perks: [P('explorer')], tags: ['green'] }),
  I('body_hoodie_sunset', 'Explorer Hoodie — Sunset Edition', 'BODY', 'epic', 'hoodie', '#ff8a5b', '#ffd08a', [R.prestige({ event: 'explorer', points: 150 })], { prestige: true, set: 'explorer', perks: [P('explorer'), P('discovery')], tags: ['orange'] }),
  I('body_raincoat_puddle', 'Puddle Raincoat', 'BODY', 'rare', 'raincoat', '#5ec8f2', '#2f86c0', [R.event('rainy', 100, true), R.buy('item.puddleraincoat')], { set: 'rainy', perks: [P('pose')], tags: ['rain', 'blue'] }),
  I('body_raincoat_rainbow', 'Puddle Raincoat — Rainbow Edition', 'BODY', 'epic', 'raincoat', '#b28cff', '#ff8fb1', [R.prestige({ event: 'rainy', points: 150 })], { prestige: true, set: 'rainy', perks: [P('pose'), P('framing')] }),
  I('body_hoodie_galaxy', 'Galaxy Hoodie', 'BODY', 'epic', 'hoodie', '#3a3470', '#a98bf0', [R.plusAccess(['2026-09', '2026-11', '2026-12']), R.dia(320)], { pattern: 'stars', perks: [P('shutter')] }),
  I('body_cape_constellation', 'Constellation Cape', 'BODY', 'legendary', 'cape', '#1f2a5c', '#ffd84a', [R.star(300)], { pattern: 'stars', prestige: true, perks: [P('shutter'), P('pose')] }),
  I('body_suit_aurora', 'Aurora Suit', 'BODY', 'legendary', 'jersey', '#53d3a2', '#a98bf0', [R.star(650)], { pattern: 'aurora', prestige: true, perks: [P('framing'), P('discovery')] }),
  I('body_cape_master', 'Master Photographer Cape', 'BODY', 'legendary', 'cape', '#e0496c', '#ffd84a', [R.prestige({ level: 100 })], { prestige: true, pattern: 'lens', perks: [P('shutter'), P('framing')], blurb: 'Only for players who reach Level 100.' }),
];
const BODY_STYLES = [
  ['sweater', 'Sweater', [['Cozy Cream', '#f4e4c1', '#c9384f', 'stripes'], ['Berry', '#c9384f', '#ffd3de', 'stripes'], ['Forest', '#3f7f4a', '#f4e4c1', 'zigzag'], ['Snowflake', '#2f6fd6', '#ffffff', 'snow'], ['Pumpkin Spice', '#e8812f', '#fff0d6', 'stripes'], ['Lavender', '#a98bf0', '#ffffff', 'dots'], ['Candy Cane', '#ffffff', '#e0474c', 'stripes']]],
  ['vest', 'Vest', [['Trail', '#7a5a3c', '#f4e4c1', 'pockets'], ['Camp', '#4f7a3c', '#ffd23f', 'pockets'], ['Safari', '#c9a86b', '#6b4a2a', 'pockets'], ['Denim', '#3f6aa0', '#dfe8f5', 'stitch'], ['Puffer Pink', '#ff8fb1', '#ffffff', 'quilt'], ['Puffer Sky', '#5ec8f2', '#ffffff', 'quilt'], ['Ranger', '#2f5a3c', '#e8812f', 'pockets']]],
  ['tee', 'Tee', [['Sunny', '#ffd84a', '#ff6b8b', 'heart'], ['Mint', '#bfe8d6', '#2fae7f', 'star'], ['Peach', '#ffd2b0', '#e0496c', 'heart'], ['Night Sky', '#2c3e7a', '#ffd84a', 'moon'], ['Lemonade', '#fff3a0', '#e8aa14', 'lemon'], ['Watermelon', '#ff8fa3', '#3f9a5b', 'seed'], ['PokaSnap Logo', '#ffffff', '#ff6b8b', 'logo']]],
  ['jersey', 'Jersey', [['Home Team', '#e0474c', '#ffffff', 'num'], ['Away Team', '#2f6fd6', '#ffffff', 'num'], ['Goalkeeper', '#53d3a2', '#1f2230', 'num'], ['Champion', '#ffcc33', '#1f2230', 'num'], ['Retro Ringer', '#fff6ec', '#e0474c', 'ringer'], ['Racing', '#1f2230', '#ffd84a', 'stripe2']]],
  ['pajamas', 'Pajamas', [['Cloud', '#dff3ff', '#5ec8f2', 'clouds'], ['Moon', '#3a3470', '#ffd84a', 'moon'], ['Strawberry', '#ffe1ea', '#e0474c', 'berry'], ['Plaid', '#c9384f', '#1f2230', 'plaid'], ['Sheep', '#f7f4f0', '#b8a2d9', 'dots'], ['Dino', '#9fd67f', '#2f7a3c', 'spikes']]],
  ['cape', 'Cape', [['Hero', '#e0474c', '#ffd84a', 'bolt'], ['Royal', '#6b3fa0', '#ffcc33', 'trim'], ['Wizard', '#2c3e7a', '#c9b6f2', 'stars'], ['Autumn', '#b5452b', '#ffd08a', 'leaves'], ['Snow Queen', '#dff3ff', '#8fd3ff', 'snow'], ['Spooky', '#3a2a4a', '#ff8a2a', 'bats']]],
  ['overalls', 'Overalls', [['Garden', '#6fa3d8', '#ffd84a', 'buttons'], ['Painter', '#ffffff', '#ff6b8b', 'splat'], ['Farmer', '#3f6aa0', '#e8453c', 'buttons'], ['Picnic', '#ff8fa3', '#ffffff', 'gingham'], ['Pumpkin Patch', '#e8812f', '#3f7f4a', 'buttons'], ['Snow Day', '#8fd3ff', '#ffffff', 'buttons'], ['Carnival', '#ffd84a', '#a98bf0', 'stripes']]],
];
const DISC = ['yarn', 'agility', 'fetch', 'scent', 'trick', 'focus'];
const ROUTE_PLAN = (i, n) => {
  const k = i % 10;
  if (k === 0) return { r: 'common', paths: [R.coin(PRICE.basicAccessory)] };
  if (k === 1) return { r: 'common', paths: [R.lvl(3 + (n % 60))] };
  if (k === 2) return { r: 'uncommon', paths: [R.coin(PRICE.outfit)] };
  if (k === 3) return { r: 'uncommon', paths: [R.train(DISC[n % 6], 3 + (n % 5))] };
  if (k === 4) return { r: 'rare', paths: [R.dia(180), R.coin(PRICE.highValue * 2)] };
  if (k === 5) return { r: 'uncommon', paths: [R.walk(50000 + (n % 7) * 25000)] };
  if (k === 6) return { r: 'rare', paths: [R.coin(PRICE.highValue)] };
  if (k === 7) return { r: 'rare', paths: [R.plusBuy(220), R.star(120 + (n % 5) * 40), R.coin(PRICE.highValue * 3)] };
  if (k === 8) return { r: 'epic', paths: [R.dia(420)] };
  return { r: 'uncommon', paths: [R.coin(PRICE.outfit)] };
};
const PERK_CYCLE = ['framing', 'pose', 'practice', 'explorer', 'discovery', 'bond', 'catch', 'lucky'];
const slug = s => s.toLowerCase().replace(/[^a-z]+/g, '');
let n = 0;
for (const [draw, base, variants] of BODY_STYLES) for (const [label, color, trim, pattern] of variants) {
  const plan = ROUTE_PLAN(n, n * 7 + 3);
  const tags = /Pumpkin|Autumn|Spice|Ranger/.test(label) ? ['orange'] : [];
  const season = /Snow|Candy Cane/.test(label) ? 'winter' : /Pumpkin|Autumn|Spooky/.test(label) ? 'autumn' : /Strawberry|Watermelon|Lemonade|Picnic/.test(label) ? 'summer' : null;
  OUTFITS.push(I(`body_${draw}_${slug(label)}`, `${label} ${base}`, 'BODY', plan.r, draw, color, trim, plan.paths,
    { pattern, perks: [P(PERK_CYCLE[n % PERK_CYCLE.length])], tags, season, set: draw === 'vest' && /Trail|Camp|Ranger/.test(label) ? 'explorer' : null }));
  n++;
}
OUTFITS.push(I('body_sweater_maple', 'Maple Leaf Sweater', 'BODY', 'rare', 'sweater', '#b5452b', '#ffd08a', [R.book('autumn', 'goal'), R.coin(PRICE.outfit)], { pattern: 'leaves', tags: ['orange'], season: 'autumn', perks: [P('discovery')] }));
OUTFITS.push(
  I('look_candy', 'Candy Looks (all 5 pets)', 'LOOK', 'epic', 'look', '#f5a9b8', '#d9c6f2', [R.coin(PRICE.highValue), R.buy('pack.candylooks')]),
  I('look_galaxy', 'Galaxy Looks (all 5 pets)', 'LOOK', 'epic', 'look', '#3a3470', '#a98bf0', [R.dia(480), R.plusBuy(380)]),
  I('look_golden', 'Golden Looks (all 5 pets)', 'LOOK', 'legendary', 'look', '#ffcc33', '#fff6c9', [R.prestige({ mastery: 'allTrainingRank10' })], { prestige: true, blurb: 'Master all six Academy disciplines.' }),
);

/* ========================================================= HEADWEAR (40) */
const HEADWEAR = [
  I('head_daisy', 'Daisy Clip', 'HEAD', 'common', 'daisy', '#ffffff', '#ffcf33', [R.lvl(0)]),
  I('head_cap', 'Baseball Cap', 'HEAD', 'uncommon', 'cap', '#2f6fd6', '#ffffff', [R.lvl(4)], { perks: [P('catch')] }),
  I('head_beanie', 'Cozy Beanie', 'HEAD', 'uncommon', 'beanie', '#f28c38', '#ffffff', [R.lvl(7)], { tags: ['orange'] }),
  I('head_crown', 'Tiny Crown', 'HEAD', 'epic', 'crown', '#ffcc33', '#e0474c', [R.lvl(10)], { perks: [P('shutter')] }),
  I('head_party', 'Party Hat', 'HEAD', 'uncommon', 'party', '#ff5fa2', '#ffd84a', [R.coin(PRICE.basicAccessory)]),
  I('head_bunnyears', 'Bunny Ears', 'HEAD', 'rare', 'bunnyears', '#ffffff', '#f7b9c4', [R.coin(PRICE.basicAccessoryPlus)], { fits: ['cat_fluffy', 'cat_short', 'dog_golden', 'dog_small'] }),
  I('head_starclip', 'Star Clip', 'HEAD', 'uncommon', 'starclip', '#ffd84a', '#e8aa14', [R.coin(PRICE.basicAccessory), R.friday()]),
  I('head_cap_explorer', 'Explorer Cap', 'HEAD', 'rare', 'cap', '#3f7f4a', '#f4e4c1', [R.event('explorer', 125)], { set: 'explorer', perks: [P('explorer')] }),
  I('head_rainhat', 'Rain Hat', 'HEAD', 'rare', 'rainhat', '#ffd23f', '#e0a800', [R.event('rainy', 125), R.buy('pack.rainyday')], { set: 'rainy', tags: ['rain', 'yellow'] }),
  I('head_leafcrown', 'Leaf Crown', 'HEAD', 'epic', 'leafcrown', '#e8812f', '#c9384f', [R.book('autumn', 'full'), R.season('09-15', '11-30')], { prestige: true, tags: ['orange'], season: 'autumn', perks: [P('discovery')] }),
  I('head_beanie_autumn', 'Maple Beanie', 'HEAD', 'rare', 'beanie', '#b5452b', '#ffd08a', [R.coin(PRICE.premiumAccessory), R.buy('pack.autumn'), R.season('09-15', '11-30')], { tags: ['orange'], season: 'autumn' }),
  I('head_crown_rose', 'Rose Gold Crown', 'HEAD', 'epic', 'crown', '#f2b8a2', '#ff6b8b', [R.plusAccess(['2026-09', '2026-10', '2026-11']), R.plusBuy(260), R.coin(PRICE.highValue * 3)], { perks: [P('pose')] }),
  I('head_beret_autumn', 'Harvest Beret', 'HEAD', 'uncommon', 'beret', '#e8812f', '#6b4a2a', [R.coin(PRICE.basicAccessoryPlus), R.season('09-15', '11-30')], { tags: ['orange'], season: 'autumn', perks: [P('pose')] }),
  I('head_starcrown', 'Star Crown', 'HEAD', 'legendary', 'crown', '#ffd84a', '#5ec8f2', [R.star(200)], { prestige: true, perks: [P('shutter'), P('discovery')] }),
];
const HEAD_STYLES = [
  ['bow', 'Bow', [['Pink', '#ff8fb1', '#e0496c'], ['Polka', '#5ec8f2', '#ffffff'], ['Velvet', '#8e2f4f', '#ffcc33']]],
  ['flowercrown', 'Flower Crown', [['Spring', '#ff8fb1', '#9fd67f'], ['Sunflower', '#ffd84a', '#6b4a2a'], ['Winter Berry', '#c9384f', '#3f7f4a']]],
  ['tophat', 'Top Hat', [['Dapper', '#1f2230', '#e0474c'], ['Magician', '#3a3470', '#ffd84a']]],
  ['beret', 'Beret', [['Artist', '#c9384f', '#1f2230'], ['Mint', '#53d3a2', '#ffffff']]],
  ['wizard', 'Wizard Hat', [['Starlight', '#2c3e7a', '#ffd84a'], ['Pumpkin', '#e8812f', '#3a2a4a']]],
  ['helmet', 'Explorer Helmet', [['Pith', '#e8dcc0', '#7a5a3c'], ['Spelunker', '#ffd23f', '#1f2230']]],
  ['sunhat', 'Sun Hat', [['Straw', '#f2d49b', '#ff6b8b'], ['Beach', '#ffffff', '#5ec8f2']]],
  ['antlers', 'Antlers', [['Reindeer', '#8a5a3c', '#e0474c'], ['Glow', '#ffd84a', '#ffffff']]],
  ['halo', 'Halo', [['Golden', '#ffd84a', '#fff6c9'], ['Rainbow', '#a98bf0', '#5ec8f2']]],
  ['headphones', 'Headphones', [['Studio', '#1f2230', '#ff6b8b'], ['Pastel', '#bfe8d6', '#ffffff']]],
  ['chefhat', 'Chef Hat', [['Classic', '#ffffff', '#e0e0e0']]],
  ['visor', 'Visor', [['Tennis', '#ffffff', '#53d3a2'], ['Neon', '#ff5fa2', '#1f2230']]],
  ['captain', 'Captain Hat', [['Sea', '#1f2230', '#ffffff']]],
];
n = 0;
for (const [draw, base, variants] of HEAD_STYLES) for (const [label, color, trim] of variants) {
  const plan = ROUTE_PLAN(n + 3, n * 5 + 11);
  HEADWEAR.push(I(`head_${draw}_${slug(label)}`, `${label} ${base}`, 'HEAD', plan.r, draw, color, trim, plan.paths,
    { perks: [P(PERK_CYCLE[(n + 2) % PERK_CYCLE.length])], season: /Winter|Reindeer|Glow/.test(label) ? 'winter' : /Pumpkin/.test(label) ? 'autumn' : /Straw|Beach/.test(label) ? 'summer' : null,
      set: draw === 'helmet' && label === 'Pith' ? 'explorer' : draw === 'wizard' && label === 'Starlight' ? 'starlight' : null }));
  n++;
}

/* ======================================================= ACCESSORIES (30) */
const ACCESSORIES = [
  I('neck_collar_red', 'Red Collar', 'NECK', 'common', 'collar', '#e0474c', '#f5c542', [R.lvl(0)]),
  I('neck_bowtie_blue', 'Blue Bow Tie', 'NECK', 'common', 'bowtie', '#3f8ae0', '#2c6bb8', [R.lvl(0)]),
  I('neck_bandana', 'Bandana', 'NECK', 'common', 'bandana', '#e8453c', '#ffffff', [R.lvl(2)], { perks: [P('explorer')], set: 'explorer' }),
  I('neck_bandana_denim', 'Denim Bandana', 'NECK', 'common', 'bandana', '#3f6aa0', '#dfe8f5', [R.coin(PRICE.basicAccessory)], { perks: [P('catch')] }),
  I('neck_scarf', 'Winter Scarf', 'NECK', 'uncommon', 'scarf', '#c9384f', '#f4e4c1', [R.lvl(8)]),
  I('neck_medal', 'Gold Medal', 'NECK', 'rare', 'medal', '#ffcc33', '#3f8ae0', [R.badge('snaps_10')], { perks: [P('lucky')] }),
  I('face_sunnies', 'Sunnies', 'FACE', 'uncommon', 'sunnies', '#1f2230', '#ff5fa2', [R.coin(PRICE.basicAccessory)], { perks: [P('framing')] }),
  I('face_sunnies_star', 'Star Sunnies', 'FACE', 'epic', 'sunnies', '#ffcc33', '#ff6b8b', [R.plusAccess(['2026-09', '2026-10', '2026-12']), R.plusBuy(240), R.coin(PRICE.highValue * 3)], { perks: [P('framing')] }),
  I('neck_bowtie_velvet', 'Velvet Bow Tie', 'NECK', 'epic', 'bowtie', '#8e2f4f', '#5c1d33', [R.plusAccess(['2026-10', '2026-11', '2026-12']), R.dia(260)]),
  I('neck_scarf_autumn', 'Pumpkin Scarf', 'NECK', 'rare', 'scarf', '#e8812f', '#fff0d6', [R.coin(PRICE.premiumAccessory), R.buy('pack.autumn'), R.season('09-15', '11-30')], { tags: ['orange'], season: 'autumn' }),
  I('neck_star_scarf', 'Starry Scarf', 'NECK', 'rare', 'scarf', '#2c3e7a', '#ffd84a', [R.monthly(16), R.coin(PRICE.premiumAccessory)], { set: 'starlight' }),
  I('neck_master_lens', 'Master Lens Pendant', 'NECK', 'legendary', 'medal', '#1f2230', '#ffd84a', [R.star(500)], { prestige: true, perks: [P('shutter'), P('framing')] }),
  I('keepsake_2026_09', 'September Keepsake Pin', 'NECK', 'epic', 'medal', '#a98bf0', '#ffcc33', [R.monthly(25, '2026-09', true)], { tags: ['keepsake'] }),
  I('keepsake_2026_10', 'October Keepsake Pin', 'NECK', 'epic', 'medal', '#e8812f', '#3a3470', [R.monthly(25, '2026-10', true)], { tags: ['keepsake', 'orange'] }),
  I('keepsake_2026_11', 'November Keepsake Pin', 'NECK', 'epic', 'medal', '#b5452b', '#ffd08a', [R.monthly(25, '2026-11', true)], { tags: ['keepsake'] }),
  I('keepsake_2026_12', 'December Keepsake Pin', 'NECK', 'epic', 'medal', '#2f86c0', '#ffffff', [R.monthly(25, '2026-12', true)], { tags: ['keepsake'] }),
];
const ACC_STYLES = [
  ['bell', 'NECK', 'Bell Collar', [['Jingle', '#e0474c', '#ffd84a'], ['Silver', '#5ec8f2', '#dfe6f7']]],
  ['lei', 'NECK', 'Flower Lei', [['Tropical', '#ff8fb1', '#ffd84a']]],
  ['necktie', 'NECK', 'Necktie', [['Office', '#2f6fd6', '#ffffff'], ['Party', '#ff5fa2', '#ffd84a']]],
  ['pearls', 'NECK', 'Pearl Necklace', [['Classic', '#fff6ec', '#e0d0c0']]],
  ['locket', 'NECK', 'Heart Locket', [['Rose', '#ff6b8b', '#ffd84a']]],
  ['roundglasses', 'FACE', 'Round Glasses', [['Scholar', '#6b4a2a', '#dff3ff'], ['Mint', '#2fae7f', '#dff3ff']]],
  ['heartglasses', 'FACE', 'Heart Glasses', [['Pink', '#ff5fa2', '#ffd3de']]],
  ['backpack', 'BACK', 'Backpack', [['Trail', '#7a5a3c', '#e8812f'], ['School', '#2f6fd6', '#ffd84a']]],
  ['wings', 'BACK', 'Wings', [['Butterfly', '#a98bf0', '#ff8fb1'], ['Angel', '#ffffff', '#dff3ff']]],
];
n = 0;
for (const [draw, slot, base, variants] of ACC_STYLES) for (const [label, color, trim] of variants) {
  const plan = ROUTE_PLAN(n + 6, n * 3 + 17);
  ACCESSORIES.push(I(`${slot.toLowerCase()}_${draw}_${slug(label)}`, `${label} ${base}`, slot, plan.r, draw, color, trim, plan.paths,
    { perks: [P(PERK_CYCLE[(n + 4) % PERK_CYCLE.length])], set: draw === 'backpack' && label === 'Trail' ? 'explorer' : null }));
  n++;
}

/* ============================================================ PROPS (35) */
const PROP_LIST = [
  ['ball', 'Bouncy Ball', 'common', '#e0474c', '#ffffff', 'bounce', [R.lvl(20)]], ['yarn', 'Yarn Ball', 'common', '#a98bf0', '#ffffff', 'roll', [R.lvl(20)]],
  ['frisbee', 'Frisbee', 'common', '#5ec8f2', '#ffffff', 'fly', [R.lvl(21)]], ['treat', 'Treat Bone', 'common', '#f4e4c1', '#b89a6a', 'hold', [R.lvl(20)]],
  ['toycamera', 'Toy Camera', 'uncommon', '#ff6b8b', '#1f2230', 'hold', [R.lvl(22)]], ['flower', 'Flower', 'common', '#ff8fb1', '#9fd67f', 'hold', [R.lvl(23)]],
  ['umbrella', 'Umbrella', 'uncommon', '#ffd23f', '#e0a800', 'hold', [R.coin(PRICE.prop)], { tags: ['rain'], set: 'rainy' }], ['stick', 'Stick', 'common', '#8a5a3c', '#6b422a', 'fly', [R.walk(20000)]],
  ['bubbles', 'Bubble Wand', 'uncommon', '#bfe8ff', '#ff8fb1', 'float', [R.coin(PRICE.prop)]], ['donut', 'Donut', 'common', '#ffb46b', '#ff8fb1', 'hold', [R.coin(PRICE.prop)]],
  ['plush', 'Plush Bear', 'uncommon', '#c49a6c', '#fff0d6', 'hold', [R.train('trick', 3)]], ['pumpkin', 'Pumpkin', 'rare', '#e8812f', '#3f7f4a', 'roll', [R.season('09-15', '11-30'), R.coin(PRICE.prop * 2)], { tags: ['orange'], season: 'autumn' }],
  ['snowball', 'Snowball', 'uncommon', '#ffffff', '#bfe6ff', 'fly', [R.season('12-01', '02-28'), R.coin(PRICE.prop)], { season: 'winter' }], ['feather', 'Feather Toy', 'common', '#ff8fb1', '#5ec8f2', 'float', [R.train('yarn', 2)]],
  ['box', 'Cardboard Box', 'common', '#c9a86b', '#8a6a3c', 'hold', [R.coin(PRICE.prop)]], ['mouse', 'Toy Mouse', 'common', '#b8b8c8', '#ff8fb1', 'roll', [R.train('scent', 2)]],
  ['squeaky', 'Squeaky Duck', 'common', '#ffd84a', '#ff8a2a', 'bounce', [R.train('fetch', 2)]], ['carrot', 'Carrot', 'common', '#ff8a2a', '#3f9a5b', 'hold', [R.coin(PRICE.prop)]],
  ['kite', 'Kite', 'rare', '#ff6b8b', '#5ec8f2', 'float', [R.walk(100000), R.dia(120)]], ['book', 'Storybook', 'uncommon', '#2f6fd6', '#ffd84a', 'hold', [R.train('focus', 4)]],
  ['guitar', 'Tiny Guitar', 'rare', '#c9384f', '#f4e4c1', 'hold', [R.dia(160), R.coin(PRICE.highValue * 2)]], ['leaf', 'Big Leaf', 'common', '#e8812f', '#b5452b', 'float', [R.book('autumn', 'goal')], { tags: ['orange'], season: 'autumn' }],
  ['starwand', 'Star Wand', 'epic', '#ffd84a', '#a98bf0', 'hold', [R.plusBuy(200), R.star(160), R.coin(PRICE.highValue * 3)]], ['gift', 'Gift Box', 'uncommon', '#e0474c', '#ffd84a', 'hold', [R.friday()]],
  ['icecream', 'Ice Cream', 'uncommon', '#ffd3de', '#c49a6c', 'hold', [R.season('06-01', '08-31'), R.coin(PRICE.prop)], { season: 'summer' }], ['cupcake', 'Cupcake', 'common', '#ff8fb1', '#c49a6c', 'hold', [R.coin(PRICE.prop)]],
  ['wateringcan', 'Watering Can', 'uncommon', '#53d3a2', '#2fae7f', 'hold', [R.train('scent', 5)]], ['soccer', 'Soccer Ball', 'uncommon', '#ffffff', '#1f2230', 'bounce', [R.train('agility', 4)]],
  ['beachball', 'Beach Ball', 'uncommon', '#ff6b8b', '#5ec8f2', 'bounce', [R.season('06-01', '08-31'), R.coin(PRICE.prop)], { season: 'summer' }], ['shell', 'Seashell', 'common', '#ffd2b0', '#ff8fb1', 'hold', [R.walk(35000)]],
  ['lantern', 'Paper Lantern', 'rare', '#ff8a2a', '#ffd84a', 'hold', [R.lvl(60)], { tags: ['night'] }], ['glowstick', 'Glow Stick', 'rare', '#53ffb0', '#bfffe3', 'hold', [R.lvl(61)], { tags: ['night'] }],
  ['pinecone', 'Pinecone', 'common', '#8a5a3c', '#c9a86b', 'roll', [R.walk(15000)]], ['goldball', 'Golden Ball', 'legendary', '#ffcc33', '#fff6c9', 'bounce', [R.star(100)], { prestige: true }],
  ['balloon', 'Balloon', 'uncommon', '#ff5fa2', '#ffffff', 'float', [R.dia(60), R.coin(PRICE.prop * 2)]],
];
const PROPS = PROP_LIST.map(([id, name, r, c, t, action, paths, x = {}]) => I(`prop_${id}`, name, 'PROP', r, 'prop_' + id, c, t, paths, { ...x, perks: [P('catch')], fx: action }));

/* ====================================================== BACKGROUNDS (25) */
const BG_LIST = [
  ['park', 'Sunny Park', 'common', [R.lvl(12)]], ['beach', 'Beach Day', 'uncommon', [R.coin(PRICE.background)], { season: 'summer' }], ['bedroom', 'Cozy Bedroom', 'common', [R.lvl(14)]],
  ['kitchen', 'Kitchen', 'common', [R.coin(PRICE.background)]], ['snowhill', 'Snowy Hill', 'rare', [R.season('12-01', '02-28'), R.coin(PRICE.background * 2)], { season: 'winter' }], ['forest', 'Forest Trail', 'uncommon', [R.walk(75000)]],
  ['citynight', 'City Lights', 'rare', [R.lvl(62)], { tags: ['night'] }], ['stage', 'Spotlight Stage', 'rare', [R.train('trick', 7)]], ['space', 'Outer Space', 'epic', [R.dia(260), R.plusBuy(200), R.coin(PRICE.highValue * 3)]],
  ['rainbow', 'Rainbow Sky', 'uncommon', [R.coin(PRICE.background)]], ['garden', 'Flower Garden', 'uncommon', [R.lvl(18)]], ['cafe', 'Little Café', 'uncommon', [R.coin(PRICE.background)]],
  ['library', 'Library', 'uncommon', [R.train('focus', 6)]], ['lakesunset', 'Lake Sunset', 'rare', [R.lvl(64)]], ['autumntrail', 'Autumn Trail', 'rare', [R.season('09-15', '11-30'), R.coin(PRICE.background * 2)], { season: 'autumn', tags: ['orange'] }],
  ['campsite', 'Campsite', 'uncommon', [R.walk(150000)]], ['pool', 'Pool Party', 'uncommon', [R.season('06-01', '08-31'), R.coin(PRICE.background)], { season: 'summer' }], ['observatory', 'Observatory', 'legendary', [R.star(400)], { prestige: true }],
  ['underwater', 'Underwater', 'epic', [R.dia(300)]], ['sakura', 'Cherry Blossoms', 'rare', [R.season('03-01', '05-15'), R.coin(PRICE.background * 2)], { season: 'spring' }], ['desert', 'Desert Dunes', 'uncommon', [R.train('agility', 6)]],
  ['mountain', 'Mountain View', 'rare', [R.walk(250000)]], ['carnival', 'Carnival', 'epic', [R.plusAccess(['2026-10', '2026-11', '2026-12']), R.dia(280)]], ['studio', 'Photo Studio', 'common', [R.lvl(10)]],
  ['hallmasters', 'Hall of Masters', 'legendary', [R.prestige({ level: 100 })], { prestige: true }],
];
const BACKGROUNDS = BG_LIST.map(([id, name, r, paths, x = {}]) => I(`bg_${id}`, name, 'BG', r, 'bg_' + id, '#ffffff', '#000000', paths, { ...x, perks: [] }));

/* =================================================== FILTERS/EFFECTS (20) */
const FILTER_LIST = [
  ['warm', 'Warm', 'common', 'filter', [R.lvl(40)]], ['cool', 'Cool', 'common', 'filter', [R.lvl(40)]], ['vintage', 'Vintage', 'uncommon', 'filter', [R.lvl(41)]],
  ['dreamy', 'Dreamy', 'uncommon', 'filter', [R.lvl(42)]], ['bw', 'Black & White', 'common', 'filter', [R.lvl(40)]], ['glow', 'Soft Glow', 'uncommon', 'filter', [R.coin(PRICE.filter)]],
  ['vignette', 'Vignette', 'common', 'filter', [R.lvl(43)]], ['sepia', 'Sepia', 'uncommon', 'filter', [R.coin(PRICE.filter)]], ['pastel', 'Pastel', 'rare', 'filter', [R.dia(90), R.coin(PRICE.filter * 3)]],
  ['vivid', 'Vivid', 'uncommon', 'filter', [R.train('focus', 5)]],
  ['snow', 'Snowfall', 'rare', 'effect', [R.season('12-01', '02-28'), R.coin(PRICE.filter * 2)], { season: 'winter' }], ['rain', 'Rain Shower', 'uncommon', 'effect', [R.event('rainy', 80), R.coin(PRICE.filter)], { tags: ['rain'] }],
  ['leaves', 'Falling Leaves', 'rare', 'effect', [R.season('09-15', '11-30'), R.coin(PRICE.filter * 2)], { season: 'autumn', tags: ['orange'] }], ['sparkle', 'Sparkle', 'uncommon', 'effect', [R.lvl(44)]],
  ['bubbles', 'Bubbles', 'uncommon', 'effect', [R.train('fetch', 5)]], ['hearts', 'Floating Hearts', 'uncommon', 'effect', [R.coin(PRICE.filter)]], ['confetti', 'Confetti', 'rare', 'effect', [R.dia(110), R.plusAccess(['2026-09', '2026-10', '2026-11', '2026-12'])]],
  ['stardust', 'Stardust', 'legendary', 'effect', [R.star(150)], { prestige: true }], ['fireflies', 'Fireflies', 'epic', 'effect', [R.lvl(66)], { tags: ['night'] }], ['petals', 'Petals', 'rare', 'effect', [R.season('03-01', '05-15'), R.coin(PRICE.filter * 2)], { season: 'spring' }],
];
const FILTERS = FILTER_LIST.map(([id, name, r, kind, paths, x = {}]) => I(`filter_${id}`, name, 'FILTER', r, 'filter_' + id, '#ffffff', '#000000', paths, { ...x, fx: kind, perks: [] }));

/* ============================================================ FRAMES (25) */
const FRAMES_LIST = [
  ['frame_trail', 'Trail Frame', 'uncommon', '#6fbf73', '#8a5a3c', [R.event('explorer', 60), R.coin(PRICE.frame)], { set: 'explorer' }],
  ['frame_puddle', 'Puddle Frame', 'uncommon', '#5ec8f2', '#2fa4d6', [R.event('rainy', 60), R.coin(PRICE.frame), R.buy('pack.rainyday')], { set: 'rainy' }],
  ['frame_sparkle', 'Sparkle Frame', 'uncommon', '#ffd84a', '#ffffff', [R.coin(PRICE.framePremium), R.buy('pack.frames'), R.friday()]],
  ['frame_confetti', 'Confetti Frame', 'uncommon', '#ff6b8b', '#5ec8f2', [R.monthly(8), R.coin(PRICE.framePremium), R.buy('pack.frames')]],
  ['frame_hearts', 'Hearts Frame', 'uncommon', '#ff5f8f', '#ffd3de', [R.coin(PRICE.framePremium), R.buy('pack.frames')]],
  ['frame_leaves', 'Autumn Leaves Frame', 'rare', '#e8812f', '#c9384f', [R.book('autumn', 'partial'), R.buy('pack.autumn'), R.season('09-15', '11-30')], { tags: ['orange'], season: 'autumn' }],
  ['frame_starlight', 'Starlight Frame', 'rare', '#2c3e7a', '#ffd84a', [R.star(50)], { set: 'starlight' }],
  ['frame_polaroid', 'Instant Photo', 'common', '#ffffff', '#e8e2da', [R.lvl(5)]], ['frame_film', 'Film Strip', 'uncommon', '#1f2230', '#ffffff', [R.coin(PRICE.frame)]],
  ['frame_stamp', 'Postage Stamp', 'uncommon', '#ffffff', '#e0474c', [R.walk(40000)]], ['frame_washi', 'Washi Tape', 'common', '#ffd3de', '#5ec8f2', [R.coin(PRICE.frame)]],
  ['frame_scallop', 'Scalloped', 'common', '#fff0f4', '#ff8fb1', [R.lvl(15)]], ['frame_neon', 'Neon Night', 'rare', '#ff5fa2', '#5ef2ff', [R.lvl(63)], { tags: ['night'] }],
  ['frame_gold', 'Gold Ornate', 'epic', '#ffcc33', '#c98f0e', [R.dia(240), R.plusBuy(180), R.coin(PRICE.highValue * 3)]], ['frame_wood', 'Wooden Frame', 'common', '#b88c63', '#8a5a3c', [R.train('agility', 2)]],
  ['frame_doodle', 'Doodles', 'uncommon', '#ffffff', '#2f6fd6', [R.train('trick', 4)]], ['frame_clouds', 'Clouds', 'uncommon', '#dff3ff', '#ffffff', [R.coin(PRICE.frame)]],
  ['frame_flowers', 'Flower Border', 'rare', '#ff8fb1', '#9fd67f', [R.season('03-01', '05-15'), R.coin(PRICE.frame * 2)], { season: 'spring' }], ['frame_stars', 'Star Border', 'uncommon', '#ffd84a', '#2c3e7a', [R.lvl(25)]],
  ['frame_rainbow', 'Rainbow', 'rare', '#ff6b8b', '#5ec8f2', [R.dia(140)]], ['frame_snow', 'Snowflakes', 'rare', '#dff3ff', '#8fd3ff', [R.season('12-01', '02-28'), R.coin(PRICE.frame * 2)], { season: 'winter' }],
  ['frame_pumpkin', 'Pumpkin Patch', 'rare', '#e8812f', '#3f7f4a', [R.season('10-01', '10-31'), R.coin(PRICE.frame * 2)], { season: 'autumn', tags: ['orange'] }],
  ['frame_comic', 'Comic Pop', 'uncommon', '#ffd84a', '#1f2230', [R.train('focus', 3)]], ['frame_ribbon', 'Ribbon', 'uncommon', '#e0474c', '#ffd84a', [R.coin(PRICE.frame)]],
  ['frame_master', 'Master Gallery', 'legendary', '#1f2230', '#ffd84a', [R.prestige({ level: 100 })], { prestige: true }],
];
const FRAMES = FRAMES_LIST.map(([id, name, r, c, t, paths, x = {}]) => I(id, name, 'FRAME', r, id, c, t, paths, { ...x, perks: [P('framing', 0.01)] }));

/* ============================================================= POSES (25) */
const POSE_LIST = [
  ['jump', 'Jump', 'common', [R.skill('jump')]], ['dance', 'Dance', 'uncommon', [R.skill('dance')]], ['spin', 'Spin', 'uncommon', [R.skill('spin')]],
  ['wink', 'Wink', 'uncommon', [R.skill('wink')]], ['highfive', 'High Five', 'rare', [R.skill('highfive')]],
  ['roll', 'Roll Over', 'uncommon', [R.train('trick', 2)]], ['catch', 'Mid-Air Catch', 'rare', [R.train('fetch', 4)]], ['leap', 'Agility Leap', 'rare', [R.train('agility', 5)]],
  ['weave', 'Weave Pose', 'uncommon', [R.train('agility', 3)]], ['sniff', 'Sniff Sniff', 'common', [R.train('scent', 1)]], ['statue', 'Statue Stay', 'rare', [R.train('focus', 7)]],
  ['peek', 'Peekaboo', 'uncommon', [R.train('scent', 4)]], ['stretch', 'Big Stretch', 'common', [R.lvl(8)]], ['sitpretty', 'Sit Pretty', 'uncommon', [R.lvl(16)]],
  ['bow', 'Take a Bow', 'rare', [R.monthly(20), R.coin(PRICE.pose)]], ['disco', 'Disco', 'rare', [R.coin(PRICE.pose), R.buy('pack.dance')]],
  ['moonwalk', 'Moonwalk', 'rare', [R.coin(PRICE.pose), R.buy('pack.dance')]], ['twirl', 'Twirl', 'rare', [R.coin(PRICE.pose), R.buy('pack.dance')]],
  ['heart', 'Heart Paws', 'epic', [R.dia(150), R.plusBuy(110), R.coin(PRICE.highValue * 2)]], ['superhero', 'Superhero', 'epic', [R.plusAccess(['2026-09', '2026-10', '2026-11', '2026-12']), R.dia(160)]],
  ['yoga', 'Tree Pose', 'uncommon', [R.walk(60000)]], ['salute', 'Salute', 'uncommon', [R.train('focus', 2)]], ['sleepyroll', 'Sleepy Roll', 'uncommon', [R.coin(PRICE.pose)]],
  ['master', 'Master Pose', 'legendary', [R.prestige({ level: 100 })], { prestige: true }], ['champion', 'Champion', 'legendary', [R.prestige({ mastery: 'fiveStar50' })], { prestige: true, blurb: '5 stars on 50 different challenges.' }],
];
const POSE_ITEMS = POSE_LIST.map(([pose, name, r, paths, x = {}]) => I(`pose_${pose}`, name, 'POSE', r, 'pose', '#ff6b8b', '#ffffff', paths, { ...x, pose, perks: [] }));

export const ITEMS = [...OUTFITS, ...HEADWEAR, ...ACCESSORIES, ...PROPS, ...BACKGROUNDS, ...FILTERS, ...FRAMES, ...POSE_ITEMS];

/* Sets: small, capped bonuses (counted in perkTotals under the same caps). */
export const SETS = {
  explorer:  { name: 'Explorer Set',  bonus: { 2: [P('explorer', 0.05)], 3: [P('explorer', 0.05), P('discovery', 0.05)] } },
  rainy:     { name: 'Rainy Day Set', bonus: { 2: [P('pose', 0.03)], 3: [P('pose', 0.03), P('framing', 0.03)] } },
  starlight: { name: 'Starlight Set', bonus: { 2: [P('shutter', 1)], 3: [P('shutter', 1), P('discovery', 0.05)] } },
};

export function path(it, type) { return it?.paths.find(p => p.type === type) || null; }
for (const it of ITEMS) {
  it.assetPath = `img/items/item_${it.itemID}.png`;
  it.thumbnailPath = `img/items/thumb_${it.itemID}.png`;
  const l = path(it, 'LEVEL'), c = path(it, 'COIN'), b = path(it, 'ACHIEVEMENT');
  it.unlockRequirement = l ? (l.level ? { type: 'level', level: l.level } : { type: 'starter' }) : c ? { type: 'coins', amount: c.cost } : b ? { type: 'achievement', id: b.badge } : { type: 'special' };
  it.premiumEligible = it.paths.some(p => PAID_ROUTES.includes(p.type));
  it.earnOnly = !it.paths.some(p => PAID_ROUTES.includes(p.type));
}

export function item(id) { return ITEMS.find(i => i.itemID === id) || null; }
export function starterItems() { return ITEMS.filter(i => i.paths.some(p => p.type === 'LEVEL' && p.level === 0)); }
export function visibleItems() { return ITEMS.filter(i => i.paths.length && i.release.status === 'LIVE'); }
export function itemView(it, inv, equipped, speciesId) {
  return { ...it, isOwned: inv.includes(it.itemID), isEquipped: Object.values(equipped || {}).includes(it.itemID), fits: it.petCompatibility.includes(speciesId) };
}
export const byCategory = cat => ITEMS.filter(i => i.category === cat);
