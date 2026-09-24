/* COSMETIC CATALOGUE — data only.
   ---------------------------------------------------------------------------
   Every item carries the fields the business model needs from day one:

     itemID, name, category, slot, petCompatibility, rarity,
     unlockRequirement, premiumEligible, assetPath, thumbnailPath

   isOwned / isEquipped are NOT stored here. They are player state and are
   derived from the inventory by itemView(), so this catalogue can be shipped,
   cached and extended as pure content.

   Items attach to named ANCHORS that every pose computes (render/pet.js):
     HEAD    -> head_top      NECK -> neck      BODY -> body
     FACE    -> face          SPECIAL -> body (drawn behind or around the pet)
   so an item fits every pet in every pose without per-pose tuning.

   unlockRequirement:
     { type:'starter' }              chosen during pet creation
     { type:'level',  level:N }      earned by playing
     { type:'coins',  amount:N }     bought with coins earned in missions
     { type:'achievement', id:'…' }  earned by a badge (data/achievements.js)
     { type:'premium', sku:'…' }     FUTURE: Stripe on the web, StoreKit on iOS.
                                     premium items are filtered out of V1 UI
                                     entirely -- there is no fake store.        */

export const SLOTS = ['HEAD', 'NECK', 'BODY', 'FACE', 'SPECIAL'];
export const CLOSET_TABS = ['OWNED', 'HEAD', 'NECK', 'BODY', 'FACE'];

const ALL = ['cat_fluffy', 'cat_short', 'dog_golden', 'dog_small', 'bunny'];

export const ITEMS = [
  // ---- starters (pick one during creation) ----
  { itemID: 'neck_collar_red',  name: 'Red Collar',    category: 'collar',  slot: 'NECK', petCompatibility: ALL, rarity: 'common',
    unlockRequirement: { type: 'starter' },           premiumEligible: false, draw: 'collar',  color: '#e0474c', trim: '#f5c542' },
  { itemID: 'neck_bowtie_blue', name: 'Blue Bow Tie',  category: 'bowtie',  slot: 'NECK', petCompatibility: ALL, rarity: 'common',
    unlockRequirement: { type: 'starter' },           premiumEligible: false, draw: 'bowtie',  color: '#3f8ae0', trim: '#2c6bb8' },
  { itemID: 'head_daisy',       name: 'Daisy Clip',    category: 'flower',  slot: 'HEAD', petCompatibility: ALL, rarity: 'common',
    unlockRequirement: { type: 'starter' },           premiumEligible: false, draw: 'daisy',   color: '#ffffff', trim: '#ffcf33' },

  // ---- earned by level ----
  { itemID: 'neck_bandana',     name: 'Bandana',       category: 'bandana', slot: 'NECK', petCompatibility: ALL, rarity: 'common',
    unlockRequirement: { type: 'level', level: 2 },   premiumEligible: false, draw: 'bandana', color: '#e8453c', trim: '#ffffff' },
  { itemID: 'head_cap',         name: 'Baseball Cap',  category: 'hat',     slot: 'HEAD', petCompatibility: ALL, rarity: 'uncommon',
    unlockRequirement: { type: 'level', level: 4 },   premiumEligible: true,  draw: 'cap',     color: '#2f6fd6', trim: '#ffffff' },
  { itemID: 'head_beanie',      name: 'Cozy Beanie',   category: 'hat',     slot: 'HEAD', petCompatibility: ALL, rarity: 'uncommon',
    unlockRequirement: { type: 'level', level: 7 },   premiumEligible: true,  draw: 'beanie',  color: '#f28c38', trim: '#ffffff' },
  { itemID: 'neck_scarf',       name: 'Winter Scarf',  category: 'scarf',   slot: 'NECK', petCompatibility: ALL, rarity: 'uncommon',
    unlockRequirement: { type: 'level', level: 8 },   premiumEligible: true,  draw: 'scarf',   color: '#c9384f', trim: '#f4e4c1' },
  { itemID: 'body_hoodie',      name: 'Snuggle Hoodie',category: 'hoodie',  slot: 'BODY', petCompatibility: ALL, rarity: 'rare',
    unlockRequirement: { type: 'level', level: 9 },   premiumEligible: true,  draw: 'hoodie',  color: '#8f6ad8', trim: '#c9b6f2' },
  { itemID: 'head_crown',       name: 'Tiny Crown',    category: 'crown',   slot: 'HEAD', petCompatibility: ALL, rarity: 'epic',
    unlockRequirement: { type: 'level', level: 10 },  premiumEligible: true,  draw: 'crown',   color: '#ffcc33', trim: '#e0474c' },

  // ---- earned by a badge ----
  { itemID: 'neck_medal',       name: 'Gold Medal',    category: 'medal',   slot: 'NECK', petCompatibility: ALL, rarity: 'rare',
    unlockRequirement: { type: 'achievement', id: 'snaps_10' }, premiumEligible: false, draw: 'medal', color: '#ffcc33', trim: '#3f8ae0' },

  // ---- bought with earned coins (gives coins a real use in V1) ----
  { itemID: 'face_sunnies',     name: 'Sunnies',       category: 'glasses', slot: 'FACE', petCompatibility: ALL, rarity: 'uncommon',
    unlockRequirement: { type: 'coins', amount: 120 }, premiumEligible: true, draw: 'sunnies', color: '#1f2230', trim: '#ff5fa2' },
  { itemID: 'head_party',       name: 'Party Hat',     category: 'hat',     slot: 'HEAD', petCompatibility: ALL, rarity: 'uncommon',
    unlockRequirement: { type: 'coins', amount: 150 }, premiumEligible: true, draw: 'party',   color: '#ff5fa2', trim: '#ffd84a' },
  { itemID: 'body_raincoat',    name: 'Rain Slicker',  category: 'coat',    slot: 'BODY', petCompatibility: ALL, rarity: 'rare',
    unlockRequirement: { type: 'coins', amount: 260 }, premiumEligible: true, draw: 'raincoat',color: '#ffd23f', trim: '#e0a800' },
  { itemID: 'head_bunnyears',   name: 'Bunny Ears',    category: 'ears',    slot: 'HEAD', petCompatibility: ['cat_fluffy','cat_short','dog_golden','dog_small'], rarity: 'rare',
    unlockRequirement: { type: 'coins', amount: 200 }, premiumEligible: true, draw: 'bunnyears', color: '#ffffff', trim: '#f7b9c4' },
];

// Derived asset paths follow one convention so the art pipeline is predictable.
for (const it of ITEMS) {
  it.assetPath = it.assetPath || `img/items/item_${it.itemID}.png`;
  it.thumbnailPath = it.thumbnailPath || `img/items/thumb_${it.itemID}.png`;
}

export function item(id) { return ITEMS.find(i => i.itemID === id) || null; }
export function starterItems() { return ITEMS.filter(i => i.unlockRequirement.type === 'starter'); }

/* V1 never lists premium-only items: a store that cannot sell is a dead button. */
export function visibleItems() { return ITEMS.filter(i => i.unlockRequirement.type !== 'premium'); }

/* The full §5 record, with player state folded in. */
export function itemView(it, inv, equipped, speciesId) {
  return {
    ...it,
    isOwned: inv.includes(it.itemID),
    isEquipped: Object.values(equipped || {}).includes(it.itemID),
    fits: it.petCompatibility.includes(speciesId),
  };
}
