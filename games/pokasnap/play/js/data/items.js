/* CATALOG — every collectible, data only.
   ---------------------------------------------------------------------------
   Business fields (from 1.0): itemID, name, category, slot, petCompatibility,
   rarity, premiumEligible, assetPath, thumbnailPath.

   1.2 adds ACQUISITION PATHS. An item may have several; the first one that
   grants it makes it OWNED, and ownership never disappears.

     FREE_BASE            { level }            starters (level 0) and level rewards
     COIN_UNLOCK          { cost }             spend Poka Coins
     EVENT_EARNED         { event, points } | { monthlyDays[, month] } | { collection, part }
                                               earned by play (events, monthly track, collections)
     ACHIEVEMENT_LIMITED  { event, points } | { badge } | { collection, part:'full' }
                                               gameplay only: never sold, never auto-granted to Plus
     POKASNAP_PLUS        { headline:event } | { keepsakeMonth }   Plus grants it OWNED
     PLUS_ROTATING_ACCESS { months:[..] }      usable while Plus is active; NOT owned
     PERMANENT_PURCHASE   { product }          App Store product (see data/store.js)
     SEASONAL             { from, to }         MM-DD window the item is offered in
     PREVIEW              {}                   can be tried on in the store, never granted

   isOwned / isEquipped / access are player state, derived by game/entitlements.js.
   Items attach to the pose-computed anchors (render/pet.js), so every item fits
   every pet in every pose. FRAME items draw over the whole photo instead. */

import { PRICE } from './economy.js';

export const SLOTS = ['HEAD', 'NECK', 'BODY', 'FACE', 'FRAME', 'POSE', 'LOOK', 'SPECIAL'];
export const WEARABLE = ['HEAD', 'NECK', 'BODY', 'FACE', 'FRAME'];
export const CLOSET_TABS = ['OWNED', 'HEAD', 'NECK', 'BODY', 'FACE', 'FRAME', 'LOOK'];
export const ENTITLEMENTS = ['FREE_BASE', 'COIN_UNLOCK', 'EVENT_EARNED', 'ACHIEVEMENT_LIMITED', 'POKASNAP_PLUS', 'PLUS_ROTATING_ACCESS', 'PERMANENT_PURCHASE', 'SEASONAL', 'PREVIEW'];

const ALL = ['cat_fluffy', 'cat_short', 'dog_golden', 'dog_small', 'bunny'];
const P = {
  free: (level = 0) => ({ type: 'FREE_BASE', level }),
  coins: cost => ({ type: 'COIN_UNLOCK', cost }),
  event: (event, points) => ({ type: 'EVENT_EARNED', event, points }),
  limited: o => ({ type: 'ACHIEVEMENT_LIMITED', ...o }),
  earned: o => ({ type: 'EVENT_EARNED', ...o }),
  plus: o => ({ type: 'POKASNAP_PLUS', ...o }),
  rotating: months => ({ type: 'PLUS_ROTATING_ACCESS', months }),
  buy: product => ({ type: 'PERMANENT_PURCHASE', product }),
  seasonal: (from, to) => ({ type: 'SEASONAL', from, to }),
  preview: () => ({ type: 'PREVIEW' }),
};
const I = (itemID, name, slot, rarity, draw, color, trim, paths, extra = {}) =>
  ({ itemID, name, category: extra.category || draw, slot, petCompatibility: extra.fits || ALL, rarity, draw, color, trim, paths,
     premiumEligible: paths.some(p => p.type === 'PERMANENT_PURCHASE' || p.type.startsWith('PLUS') || p.type === 'POKASNAP_PLUS'), ...extra });

export const ITEMS = [
  // ---- starters (pick one during creation) ----
  I('neck_collar_red',  'Red Collar',     'NECK', 'common',   'collar',  '#e0474c', '#f5c542', [P.free(0)]),
  I('neck_bowtie_blue', 'Blue Bow Tie',   'NECK', 'common',   'bowtie',  '#3f8ae0', '#2c6bb8', [P.free(0)]),
  I('head_daisy',       'Daisy Clip',     'HEAD', 'common',   'daisy',   '#ffffff', '#ffcf33', [P.free(0)]),

  // ---- earned by level (free for everyone) ----
  I('neck_bandana',     'Bandana',        'NECK', 'common',   'bandana', '#e8453c', '#ffffff', [P.free(2)]),
  I('head_cap',         'Baseball Cap',   'HEAD', 'uncommon', 'cap',     '#2f6fd6', '#ffffff', [P.free(4)]),
  I('head_beanie',      'Cozy Beanie',    'HEAD', 'uncommon', 'beanie',  '#f28c38', '#ffffff', [P.free(7)], { tags: ['orange'] }),
  I('neck_scarf',       'Winter Scarf',   'NECK', 'uncommon', 'scarf',   '#c9384f', '#f4e4c1', [P.free(8)]),
  I('body_hoodie',      'Snuggle Hoodie', 'BODY', 'rare',     'hoodie',  '#8f6ad8', '#c9b6f2', [P.free(9)]),
  I('head_crown',       'Tiny Crown',     'HEAD', 'epic',     'crown',   '#ffcc33', '#e0474c', [P.free(10)]),

  // ---- Poka Coins (time substitutes for money) ----
  I('face_sunnies',     'Sunnies',        'FACE', 'uncommon', 'sunnies', '#1f2230', '#ff5fa2', [P.coins(PRICE.basicAccessory)]),
  I('head_party',       'Party Hat',      'HEAD', 'uncommon', 'party',   '#ff5fa2', '#ffd84a', [P.coins(PRICE.basicAccessory)]),
  I('head_bunnyears',   'Bunny Ears',     'HEAD', 'rare',     'bunnyears', '#ffffff', '#f7b9c4', [P.coins(PRICE.basicAccessoryPlus)], { fits: ['cat_fluffy', 'cat_short', 'dog_golden', 'dog_small'] }),
  I('body_raincoat',    'Rain Slicker',   'BODY', 'rare',     'raincoat', '#ffd23f', '#e0a800', [P.coins(PRICE.premiumAccessory), P.buy('pack.rainyday')], { tags: ['rain'] }),
  I('head_starclip',    'Star Clip',      'HEAD', 'uncommon', 'starclip', '#ffd84a', '#e8aa14', [P.coins(PRICE.basicAccessory)]),

  // ---- badges ----
  I('neck_medal',       'Gold Medal',     'NECK', 'rare',     'medal',   '#ffcc33', '#3f8ae0', [P.limited({ badge: 'snaps_10' })]),

  // ---- Explorer Week ----
  I('frame_trail',          'Trail Frame',            'FRAME', 'uncommon', 'frame_trail',  '#6fbf73', '#8a5a3c', [P.event('explorer', 60), P.coins(PRICE.frame)]),
  I('body_hoodie_explorer', 'Explorer Hoodie',        'BODY',  'rare',     'hoodie',       '#4f9a5b', '#cfe8c4', [P.event('explorer', 100), P.plus({ headline: 'explorer' }), P.buy('item.explorerhoodie')], { category: 'hoodie' }),
  I('head_cap_explorer',    'Explorer Cap',           'HEAD',  'rare',     'cap',          '#3f7f4a', '#f4e4c1', [P.event('explorer', 125)], { category: 'hat' }),
  I('body_hoodie_sunset',   'Explorer Hoodie — Sunset Edition', 'BODY', 'epic', 'hoodie', '#ff8a5b', '#ffd08a', [P.limited({ event: 'explorer', points: 150 })], { category: 'hoodie', tags: ['orange'], prestige: true }),

  // ---- Rainy Day Week ----
  I('frame_puddle',         'Puddle Frame',           'FRAME', 'uncommon', 'frame_puddle', '#5ec8f2', '#2fa4d6', [P.event('rainy', 60), P.coins(PRICE.frame), P.buy('pack.rainyday')]),
  I('body_raincoat_puddle', 'Puddle Raincoat',        'BODY',  'rare',     'raincoat',     '#5ec8f2', '#2f86c0', [P.event('rainy', 100), P.plus({ headline: 'rainy' }), P.buy('item.puddleraincoat')], { category: 'coat', tags: ['rain'] }),
  I('head_rainhat',         'Rain Hat',               'HEAD',  'rare',     'rainhat',      '#ffd23f', '#e0a800', [P.event('rainy', 125), P.buy('pack.rainyday')], { category: 'hat', tags: ['rain'] }),
  I('body_raincoat_rainbow','Puddle Raincoat — Rainbow Edition', 'BODY', 'epic', 'raincoat', '#b28cff', '#ff8fb1', [P.limited({ event: 'rainy', points: 150 })], { category: 'coat', prestige: true }),

  // ---- frames & effects ----
  I('frame_sparkle',  'Sparkle Frame',  'FRAME', 'uncommon', 'frame_sparkle',  '#ffd84a', '#ffffff', [P.coins(PRICE.framePremium), P.buy('pack.frames')]),
  I('frame_confetti', 'Confetti Frame', 'FRAME', 'uncommon', 'frame_confetti', '#ff6b8b', '#5ec8f2', [P.earned({ monthlyDays: 8 }), P.coins(PRICE.framePremium), P.buy('pack.frames')]),
  I('frame_hearts',   'Hearts Frame',   'FRAME', 'uncommon', 'frame_hearts',   '#ff5f8f', '#ffd3de', [P.coins(PRICE.framePremium), P.buy('pack.frames')]),
  I('frame_leaves',   'Autumn Leaves Frame', 'FRAME', 'rare', 'frame_leaves', '#e8812f', '#c9384f', [P.earned({ collection: 'autumn', part: 'partial' }), P.buy('pack.autumn'), P.seasonal('09-15', '11-30')], { tags: ['orange'] }),

  // ---- seasonal ----
  I('head_leafcrown',   'Leaf Crown',     'HEAD', 'epic',     'leafcrown', '#e8812f', '#c9384f', [P.limited({ collection: 'autumn', part: 'full' }), P.seasonal('09-15', '11-30')], { tags: ['orange'], prestige: true }),
  I('neck_scarf_autumn','Pumpkin Scarf',  'NECK', 'rare',     'scarf',     '#e8812f', '#fff0d6', [P.coins(PRICE.premiumAccessory), P.buy('pack.autumn'), P.seasonal('09-15', '11-30')], { category: 'scarf', tags: ['orange'] }),
  I('head_beanie_autumn','Maple Beanie',  'HEAD', 'rare',     'beanie',    '#b5452b', '#ffd08a', [P.coins(PRICE.premiumAccessory), P.buy('pack.autumn'), P.seasonal('09-15', '11-30')], { category: 'hat', tags: ['orange'] }),
  I('neck_star_scarf',  'Starry Scarf',   'NECK', 'rare',     'scarf',     '#2c3e7a', '#ffd84a', [P.earned({ monthlyDays: 16 }), P.coins(PRICE.premiumAccessory)], { category: 'scarf' }),

  // ---- poses ----
  I('pose_bow',      'Take a Bow',  'POSE', 'rare', 'pose', '#ff6b8b', '#ffffff', [P.earned({ monthlyDays: 20 }), P.coins(PRICE.pose)], { pose: 'bow', icon: '🙇' }),
  I('pose_disco',    'Disco',       'POSE', 'rare', 'pose', '#a98bf0', '#ffffff', [P.coins(PRICE.pose), P.buy('pack.dance')], { pose: 'disco', icon: '🪩' }),
  I('pose_moonwalk', 'Moonwalk',    'POSE', 'rare', 'pose', '#5ec8f2', '#ffffff', [P.coins(PRICE.pose), P.buy('pack.dance')], { pose: 'moonwalk', icon: '🌙' }),
  I('pose_twirl',    'Twirl',       'POSE', 'rare', 'pose', '#53d3a2', '#ffffff', [P.coins(PRICE.pose), P.buy('pack.dance')], { pose: 'twirl', icon: '💫' }),

  // ---- pet looks ----
  I('look_candy', 'Candy Looks (all 5 pets)', 'LOOK', 'epic', 'look', '#f5a9b8', '#d9c6f2', [P.coins(PRICE.highValue), P.buy('pack.candylooks')]),

  // ---- PokaSnap+ rotating Premium Closet (access while subscribed, not owned) ----
  I('head_crown_rose',     'Rose Gold Crown',  'HEAD', 'epic', 'crown',   '#f2b8a2', '#ff6b8b', [P.rotating(['2026-09', '2026-10', '2026-11']), P.preview()], { category: 'crown' }),
  I('face_sunnies_star',   'Star Sunnies',     'FACE', 'epic', 'sunnies', '#ffcc33', '#ff6b8b', [P.rotating(['2026-09', '2026-10', '2026-12']), P.preview()], { category: 'glasses' }),
  I('body_hoodie_galaxy',  'Galaxy Hoodie',    'BODY', 'epic', 'hoodie',  '#3a3470', '#a98bf0', [P.rotating(['2026-09', '2026-11', '2026-12']), P.preview()], { category: 'hoodie' }),
  I('neck_bowtie_velvet',  'Velvet Bow Tie',   'NECK', 'epic', 'bowtie',  '#8e2f4f', '#5c1d33', [P.rotating(['2026-10', '2026-11', '2026-12']), P.preview()], { category: 'bowtie' }),

  // ---- monthly Member Keepsakes: Plus gets it automatically, anyone can earn it (25 active days) ----
  I('keepsake_2026_09', 'September Keepsake Pin', 'NECK', 'epic', 'medal', '#a98bf0', '#ffcc33', [P.plus({ keepsakeMonth: '2026-09' }), P.earned({ monthlyDays: 25, month: '2026-09' })], { category: 'keepsake' }),
  I('keepsake_2026_10', 'October Keepsake Pin',   'NECK', 'epic', 'medal', '#e8812f', '#3a3470', [P.plus({ keepsakeMonth: '2026-10' }), P.earned({ monthlyDays: 25, month: '2026-10' })], { category: 'keepsake' }),
  I('keepsake_2026_11', 'November Keepsake Pin',  'NECK', 'epic', 'medal', '#b5452b', '#ffd08a', [P.plus({ keepsakeMonth: '2026-11' }), P.earned({ monthlyDays: 25, month: '2026-11' })], { category: 'keepsake' }),
  I('keepsake_2026_12', 'December Keepsake Pin',  'NECK', 'epic', 'medal', '#2f86c0', '#ffffff', [P.plus({ keepsakeMonth: '2026-12' }), P.earned({ monthlyDays: 25, month: '2026-12' })], { category: 'keepsake' }),
];

// Derived asset paths follow one convention so the art pipeline is predictable.
for (const it of ITEMS) {
  it.assetPath = it.assetPath || `img/items/item_${it.itemID}.png`;
  it.thumbnailPath = it.thumbnailPath || `img/items/thumb_${it.itemID}.png`;
  // 1.0 compatibility: the primary unlock, as older code and saves understood it
  const f = it.paths.find(p => p.type === 'FREE_BASE');
  const c = it.paths.find(p => p.type === 'COIN_UNLOCK');
  it.unlockRequirement = f ? (f.level ? { type: 'level', level: f.level } : { type: 'starter' })
    : c ? { type: 'coins', amount: c.cost }
    : it.paths.find(p => p.type === 'ACHIEVEMENT_LIMITED' && p.badge) ? { type: 'achievement', id: it.paths.find(p => p.badge).badge }
    : { type: 'special' };
}

export function item(id) { return ITEMS.find(i => i.itemID === id) || null; }
export function path(it, type) { return it?.paths.find(p => p.type === type) || null; }
export function starterItems() { return ITEMS.filter(i => i.paths.some(p => p.type === 'FREE_BASE' && p.level === 0)); }
/* Items that can appear in closet/store lists. PREVIEW-only extras are included (they say so). */
export function visibleItems() { return ITEMS.filter(i => i.paths.length); }
export function itemView(it, inv, equipped, speciesId) {
  return { ...it, isOwned: inv.includes(it.itemID), isEquipped: Object.values(equipped || {}).includes(it.itemID), fits: it.petCompatibility.includes(speciesId) };
}
