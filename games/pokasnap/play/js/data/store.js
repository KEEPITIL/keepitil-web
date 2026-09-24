/* PRODUCTS — what can be bought with real money. Data only.
   ---------------------------------------------------------------------------
   Rule: money buys expression, variety, time and service -- never permission
   to enjoy PokaSnap. Camera play, missions, scoring, album, care, training,
   walking, events and progression are free and can never appear here.

   iOS digital goods go through Apple In-App Purchase (App Review 3.1.1): each
   `product` key maps to an App Store Connect product id. Display prices come
   from StoreKit at runtime; `referencePrice` is only the planning value and is
   never shown as a buy button. No loot boxes: a product lists exactly what you get.
   Web commerce, if ever added, is a separate adapter (platform/purchases.js). */

export const APP_ID_PREFIX = 'com.keepitil.pokasnap.';

export const PRODUCTS = [
  // ---- non-consumable packs (permanent ownership) ----
  { key: 'pack.dance',      type: 'non_consumable', family: 'pose_pack',   name: 'Dance Pose Pack',     referencePrice: '$1.99',
    description: 'Three new poses for your photos: Disco, Moonwalk and Twirl.', grants: ['pose_disco', 'pose_moonwalk', 'pose_twirl'], featured: true },
  { key: 'pack.candylooks', type: 'non_consumable', family: 'pet_pack',    name: 'Candy Looks',          referencePrice: '$2.99',
    description: 'A sweet new colour for every pet: Lilac, Blue Moon, Strawberry, Mint and Peach.', grants: ['look_candy'], featured: true },
  { key: 'pack.frames',     type: 'non_consumable', family: 'effect_pack', name: 'Photo Frame Pack',     referencePrice: '$1.99',
    description: 'Sparkle, Confetti and Hearts frames for your snaps.', grants: ['frame_sparkle', 'frame_confetti', 'frame_hearts'] },
  { key: 'pack.rainyday',   type: 'non_consumable', family: 'outfit_pack', name: 'Rainy Day Pack',       referencePrice: '$1.99',
    description: 'Rain Slicker, Rain Hat and Puddle Frame.', grants: ['body_raincoat', 'head_rainhat', 'frame_puddle'] },
  { key: 'pack.autumn',     type: 'non_consumable', family: 'season_pack', name: 'Autumn Bundle',        referencePrice: '$4.99',
    description: 'Pumpkin Scarf, Maple Beanie and the Autumn Leaves Frame.', grants: ['neck_scarf_autumn', 'head_beanie_autumn', 'frame_leaves'],
    availabilityStart: '09-15', availabilityEnd: '11-30' },
  // ---- single headline items (Earn / Plus / Buy) ----
  { key: 'item.explorerhoodie',  type: 'non_consumable', family: 'outfit_pack', name: 'Explorer Hoodie',  referencePrice: '$1.99',
    description: 'The Explorer Week headline hoodie — yours forever.', grants: ['body_hoodie_explorer'] },
  { key: 'item.puddleraincoat',  type: 'non_consumable', family: 'outfit_pack', name: 'Puddle Raincoat',  referencePrice: '$1.99',
    description: 'The Rainy Day Week headline raincoat — yours forever.', grants: ['body_raincoat_puddle'] },
  // ---- PokaSnap+ (auto-renewing; no free trial -- the non-billing Preview lives in economy.PLUS) ----
  { key: 'plus.monthly', type: 'subscription', family: 'plus', name: 'PokaSnap+ Monthly', referencePrice: '$4.99/month', grants: [] },
  { key: 'plus.yearly',  type: 'subscription', family: 'plus', name: 'PokaSnap+ Yearly',  referencePrice: '$39.99/year', grants: [] },
];

export const productId = key => APP_ID_PREFIX + key;
export const productByKey = key => PRODUCTS.find(p => p.key === key) || null;
export const productById = id => PRODUCTS.find(p => productId(p.key) === id) || null;

// Things that may never be sold. A test enforces this against PRODUCTS.
export const NEVER_SOLD = ['camera', 'missions', 'scoring', 'album', 'care', 'training', 'walking', 'events', 'progression', 'starter_pets'];
// Families deliberately NOT offered at launch.
export const DEFERRED = ['coin_packs', 'prime_tier', 'random_pulls'];
