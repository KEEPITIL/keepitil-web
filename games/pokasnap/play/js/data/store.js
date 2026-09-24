/* DIGITAL GOODS — architecture only. Nothing here is sold in this build.
   ---------------------------------------------------------------------------
   Product rule: money buys expression and variety, never permission to enjoy
   PokaSnap. Pets you start with, camera play, missions, scoring, album, care,
   training and progression are free and can never appear in a bundle.

   iOS digital goods MUST go through Apple In-App Purchase (App Review 3.1.1),
   so `priceProductID` is the App Store Connect product ID. The web may use an
   approved web checkout separately. No loot boxes: a bundle lists exactly
   what you get.

   A bundle is shown ONLY when platform/purchases.js reports a working store;
   until then there is no store UI at all (no dead buttons). */

export const PRODUCT_TYPES = ['non_consumable', 'consumable'];
export const FAMILIES = ['pet_pack', 'outfit_pack', 'pose_pack', 'season_pack', 'effect_pack'];

export const BUNDLES = [
  { bundleID: 'rainy_day', name: 'Rainy Day Pack', family: 'outfit_pack', type: 'non_consumable',
    description: 'Splash through puddles in style.', priceProductID: 'com.keepitil.pokasnap.pack.rainyday', displayPrice: '$1.99',
    includedItems: ['body_raincoat_yellow', 'head_rainhat', 'frame_puddle', 'pose_splash'], theme: 'rain',
    availabilityStart: null, availabilityEnd: null, featured: true },
  { bundleID: 'dance_pack', name: 'Dance Pose Pack', family: 'pose_pack', type: 'non_consumable',
    description: 'Three new dance moves for your photos.', priceProductID: 'com.keepitil.pokasnap.pack.dance', displayPrice: '$0.99',
    includedItems: ['pose_moonwalk', 'pose_twirl', 'pose_disco'], theme: 'party',
    availabilityStart: null, availabilityEnd: null, featured: false },
  { bundleID: 'baby_dragon', name: 'Baby Dragon', family: 'pet_pack', type: 'non_consumable',
    description: 'A tiny dragon with a very big sneeze.', priceProductID: 'com.keepitil.pokasnap.pet.babydragon', displayPrice: '$2.99',
    includedItems: ['pet_dragon_baby'], theme: 'magical',
    availabilityStart: null, availabilityEnd: null, featured: false },
];

// Things that may never be sold. A test enforces this against BUNDLES.
export const NEVER_SOLD = ['camera', 'missions', 'scoring', 'album', 'care', 'training', 'progression', 'starter_pets'];
