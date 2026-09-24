/* PET REGISTRY — data only.
   ---------------------------------------------------------------------------
   A pet is a SPECIES (body plan) plus an APPEARANCE (palette). Adding a pet is
   adding an entry here; the renderer, poses, cosmetics, scoring and missions
   never change.

   Every pet shares one standard canvas: 512 x 512 units, origin at the centre
   of the feet (the "ground" anchor). Parts are drawn by named part-renderers
   in render/pet.js, so a future dragon is a new species that names parts the
   registry already knows ("wings", "horns") or registers one new part.

   family:  'house'   -> cats, dogs, rabbits, hamsters, birds  (V1)
            'magical' -> dragons, cloud creatures, elementals   (FUTURE, schema only)

   art:     'procedural' (V1)  -> drawn by render/pet.js from these parameters
            'sprite'           -> future: assetPath pattern
                                  pet_<species>_<pose>.png on the same 512 canvas,
                                  same anchor names, so cosmetics still fit. */

export const PET_CANVAS = 512;

export const SPECIES = {
  cat_fluffy: {
    id: 'cat_fluffy', family: 'house', animal: 'cat', name: 'Fluffy Cat',
    blurb: 'A cloud of fur with a very important opinion.',
    art: 'procedural', assetPath: 'img/pets/pet_cat_fluffy_{pose}.png',
    ears: 'cat', tail: 'plume', muzzle: 'cat',
    fluff: 1.0,          // 0 = sleek, 1 = maximum fluff
    headR: 118, bodyW: 116, bodyH: 92, earSize: 1.0,
    appearances: [
      { id: 'cloud',   name: 'Cloud',    base: '#f4efe9', shade: '#dcd2c7', belly: '#ffffff', inner: '#f7b9c4', patch: null,      eye: '#6aa7d8' },
      { id: 'ginger',  name: 'Ginger',   base: '#f2a65a', shade: '#d98639', belly: '#fde7cf', inner: '#f7b0a4', patch: '#e08a3c', eye: '#7fae4f' },
      { id: 'smoke',   name: 'Smoke',    base: '#9aa3b0', shade: '#7b8492', belly: '#e3e7ec', inner: '#f2b3c0', patch: null,      eye: '#e7b84a' },
      { id: 'lilac',   name: 'Lilac (Candy)', base: '#d9c6f2', shade: '#b8a2d9', belly: '#f7f0ff', inner: '#f7b9c4', patch: null, eye: '#7a5fc4', item: 'look_candy' },
    ],
  },
  cat_short: {
    id: 'cat_short', family: 'house', animal: 'cat', name: 'Short-Hair Cat',
    blurb: 'Sleek, curious, and absolutely on the counter.',
    art: 'procedural', assetPath: 'img/pets/pet_cat_short_{pose}.png',
    ears: 'cat', tail: 'thin', muzzle: 'cat',
    fluff: 0.15, headR: 110, bodyW: 96, bodyH: 86, earSize: 1.12,
    appearances: [
      { id: 'tuxedo',  name: 'Tuxedo',   base: '#3a3d45', shade: '#25272d', belly: '#f6f6f4', inner: '#f0a8b4', patch: null,      eye: '#9ccc65' },
      { id: 'tabby',   name: 'Tabby',    base: '#c49a6c', shade: '#9e7a52', belly: '#f3e4cf', inner: '#f2aab0', patch: '#8b6a45', eye: '#d9a441' },
      { id: 'midnight',name: 'Midnight', base: '#2b2d38', shade: '#1a1b22', belly: '#3d4050', inner: '#e690a4', patch: null,      eye: '#f2c94c' },
      { id: 'bluemoon',name: 'Blue Moon (Candy)', base: '#4a5c8f', shade: '#34426b', belly: '#dfe6f7', inner: '#f0a8b4', patch: null, eye: '#ffd76a', item: 'look_candy' },
    ],
  },
  dog_golden: {
    id: 'dog_golden', family: 'house', animal: 'dog', name: 'Golden Pup',
    blurb: 'Loves you. Loves the photo. Loves everything.',
    art: 'procedural', assetPath: 'img/pets/pet_dog_golden_{pose}.png',
    ears: 'floppy', tail: 'feather', muzzle: 'dog',
    fluff: 0.75, headR: 116, bodyW: 120, bodyH: 96, earSize: 1.05,
    appearances: [
      { id: 'honey',   name: 'Honey',    base: '#e8b465', shade: '#c9923f', belly: '#fbe6bf', inner: '#c9923f', patch: null,      eye: '#5b3a22' },
      { id: 'cream',   name: 'Cream',    base: '#f3dfbd', shade: '#dcc39a', belly: '#fff6e6', inner: '#dcc39a', patch: null,      eye: '#4a2f1c' },
      { id: 'cocoa',   name: 'Cocoa',    base: '#8a5a3c', shade: '#6b422a', belly: '#d9b28f', inner: '#6b422a', patch: null,      eye: '#2e1d12' },
      { id: 'strawberry', name: 'Strawberry (Candy)', base: '#f5a9b8', shade: '#dc8599', belly: '#fff0f3', inner: '#f7b9c4', patch: null, eye: '#3a1f28', item: 'look_candy' },
    ],
  },
  dog_small: {
    id: 'dog_small', family: 'house', animal: 'dog', name: 'Puffball Pup',
    blurb: 'Small dog, enormous personality, maximum floof.',
    art: 'procedural', assetPath: 'img/pets/pet_dog_small_{pose}.png',
    ears: 'pom', tail: 'pom', muzzle: 'dogSmall',
    fluff: 1.0, headR: 122, bodyW: 104, bodyH: 84, earSize: 0.9,
    appearances: [
      { id: 'snow',    name: 'Snow',     base: '#fbfaf7', shade: '#e2ddd3', belly: '#ffffff', inner: '#e8d6c4', patch: null,      eye: '#2a1c14' },
      { id: 'apricot', name: 'Apricot',  base: '#f6c28b', shade: '#dea266', belly: '#fde6c9', inner: '#dea266', patch: null,      eye: '#2a1c14' },
      { id: 'mocha',   name: 'Mocha',    base: '#b98a66', shade: '#98694a', belly: '#ecd3bb', inner: '#98694a', patch: '#8a5b3d', eye: '#23160f' },
      { id: 'mint',    name: 'Mint (Candy)', base: '#bfe8d6', shade: '#98cdb7', belly: '#f2fff9', inner: '#f7b9c4', patch: null, eye: '#23413a', item: 'look_candy' },
    ],
  },
  bunny: {
    id: 'bunny', family: 'house', animal: 'rabbit', name: 'Bun Bun',
    blurb: 'Soft ears, softer heart, suspicious of carrots on camera.',
    art: 'procedural', assetPath: 'img/pets/pet_bunny_{pose}.png',
    ears: 'bunny', tail: 'cotton', muzzle: 'bunny',
    fluff: 0.6, headR: 112, bodyW: 108, bodyH: 92, earSize: 1.0,
    appearances: [
      { id: 'lop',     name: 'Snowdrop', base: '#f7f4f0', shade: '#e0d9d0', belly: '#ffffff', inner: '#f5b7c5', patch: null,      eye: '#b8434f' },
      { id: 'hazel',   name: 'Hazel',    base: '#b88c63', shade: '#977050', belly: '#eedcc5', inner: '#f1b2ae', patch: null,      eye: '#2c1b12' },
      { id: 'dusk',    name: 'Dusk',     base: '#8f8c9c', shade: '#716e7e', belly: '#dcd9e3', inner: '#f0b0c2', patch: null,      eye: '#2a2530' },
      { id: 'peach',   name: 'Peach (Candy)', base: '#ffd2b0', shade: '#e9ae86', belly: '#fff5ec', inner: '#f7b0b8', patch: null, eye: '#6b2f3a', item: 'look_candy' },
    ],
  },
};

/* Order shown in the picker. Future magical pets append here with
   family:'magical' and are filtered by the picker until released. */
export const LAUNCH_SPECIES = ['cat_fluffy', 'cat_short', 'dog_golden', 'dog_small', 'bunny'];

export function species(id) { return SPECIES[id] || SPECIES.cat_fluffy; }
/* Free looks (shown at creation). Premium looks carry `item` and appear once owned. */
export function freeAppearances(speciesId) { return species(speciesId).appearances.filter(a => !a.item); }
export function appearance(speciesId, appearanceId) {
  const s = species(speciesId);
  return s.appearances.find(a => a.id === appearanceId) || s.appearances[0];
}
