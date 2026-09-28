/* ATTRIBUTES, ARCHETYPES, PERKS — every displayed number does something.
   ---------------------------------------------------------------------------
   Six pet attributes (0-100). Base values come from the species archetype;
   they grow through Training Academy ranks and Bond (care). Effects are
   deliberately small and ALL go through perkTotals() caps, so no build --
   bought or earned -- can produce five-star photos by itself, and a
   mission's required conditions can never be bypassed. */

export const ATTRS = {
  focus:       { name: 'Focus',       icon: '🎯', effect: 'Holds poses longer and follows commands reliably (pose duration, Focus/Trick timing windows).' },
  agility:     { name: 'Agility',     icon: '💨', effect: 'Moves smoothly (Agility Course timing windows, Jump/Spin timing bonus).' },
  playfulness: { name: 'Playfulness', icon: '🎾', effect: 'Better with toys (prop catch window in camera and Fetch).' },
  curiosity:   { name: 'Curiosity',   icon: '🔍', effect: 'Spots more (Rare Moment frequency, Scent Hunt clue radius).' },
  bond:        { name: 'Bond',        icon: '💞', effect: 'Your relationship (small XP bonus, happier reactions).' },
  endurance:   { name: 'Endurance',   icon: '🥾', effect: 'Keeps going (Journey Snap chances on walks, longer training streak bonuses).' },
};
export const ATTR_ORDER = ['focus', 'agility', 'playfulness', 'curiosity', 'bond', 'endurance'];

/* How much an attribute point is worth, before caps. */
export const ATTR_EFFECT = {
  focus:       { poseDuration: 0.0015, trainingAssist: 0.0006 },   // at 100 -> +15% pose hold, +6% timing
  agility:     { trainingAssist: 0.0008 },
  playfulness: { propWindow: 0.002 },                                // at 100 -> +20% catch window (capped)
  curiosity:   { rareRate: 0.004 },                                  // at 100 -> Rare Moments 40% more often (capped)
  bond:        { xpBonus: 0.0004 },                                  // at 100 -> +4% XP
  endurance:   { journeyChance: 0.003 },
};

/* Hard caps on the SUM of every source (attributes + gear + sets + imbues). */
export const CAPS = {
  photoScore: 5,          // max points gear/perks can add to a 0-100 photo score
  framingAssist: 0.10, poseDuration: 0.15, trainingAssist: 0.10, propWindow: 0.20,
  rareRate: 0.40, journeyChance: 0.30, coinBonus: 0.05, xpBonus: 0.05, discovery: 0.20,
};

/* Perk vocabulary used by items, sets and imbues. Values are per item at Style 1. */
export const PERKS = {
  framing:   { name: 'Steady Frame',   stat: 'framingAssist',  per: 0.02, family: 'photo',    desc: 'Composition tolerance' },
  pose:      { name: 'Pose Hold',      stat: 'poseDuration',   per: 0.03, family: 'photo',    desc: 'Pose lasts longer' },
  shutter:   { name: 'Quick Shutter',  stat: 'photoScore',     per: 1,    family: 'photo',    desc: '+Photo score (capped at +5 total)' },
  catch:     { name: 'Soft Paws',      stat: 'propWindow',     per: 0.04, family: 'photo',    desc: 'Easier prop catches' },
  practice:  { name: 'Practice Buddy', stat: 'trainingAssist', per: 0.02, family: 'training', desc: 'Training timing tolerance' },
  explorer:  { name: 'Trailblazer',    stat: 'journeyChance',  per: 0.05, family: 'explore',  desc: 'Journey Snap chances on walks' },
  discovery: { name: 'Keen Eye',       stat: 'rareRate',       per: 0.06, family: 'explore',  desc: 'Rare Moments more often' },
  bond:      { name: 'Warm Heart',     stat: 'xpBonus',        per: 0.01, family: 'companion',desc: 'Small XP bonus' },
  lucky:     { name: 'Lucky Charm',    stat: 'coinBonus',      per: 0.01, family: 'economy',  desc: 'Small coin bonus' },
};
/* Style Mastery: each style level multiplies the item's perk; Style 3 adds a
   second perk slot (sets/imbue), Style 5 enables Imbue. */
export const STYLE = {
  max: 5, perkMult: [0, 1, 1.25, 1.5, 1.75, 2],
  cost: [0, 0, 150, 350, 700, 1200],          // coins to reach style N (from N-1)
  wearSnaps: [0, 0, 3, 8, 15, 25],             // photos taken wearing it before the next style
};
export const IMBUE = { threadCost: 3, requiresStyle: 5, maxImbuesPerItem: 1 };

/* Species archetypes. No pet is best at everything (tests enforce equal totals). */
export const ARCHETYPES = {
  Photographer: 'Poses beautifully; strongest in composition and pose challenges.',
  Trainer:      'Learns fast; strongest in Trick Studio and Focus.',
  Explorer:     'Loves walks and discovery; strongest on Journeys.',
  Trickster:    'Playful and quick; strongest with props and Agility.',
  Curious:      'Finds everything; strongest in Scent Hunt and Rare Moments.',
};
export const PET_PROFILES = {
  cat_fluffy: { archetype: 'Photographer', base: { focus: 26, agility: 14, playfulness: 16, curiosity: 18, bond: 16, endurance: 10 },
    signature: { id: 'poser', name: 'Natural Poser', text: 'Poses hold 5% longer (counts toward the cap).', stat: 'poseDuration', value: 0.05 },
    affinity: { training: 'Trick Studio', photography: 'Pose & Composition', walking: 'Short scenic strolls' },
    rare: ['yawn', 'wink', 'sleepy'], props: ['yarn', 'feather', 'flower'] },
  cat_short:  { archetype: 'Curious', base: { focus: 16, agility: 18, playfulness: 14, curiosity: 28, bond: 14, endurance: 10 },
    signature: { id: 'sleuth', name: 'Little Sleuth', text: 'Rare Moments appear 10% more often.', stat: 'rareRate', value: 0.10 },
    affinity: { training: 'Scent Hunt', photography: 'Rare Moment & Expression', walking: 'Explores side paths' },
    rare: ['surprised', 'tailchase', 'sneeze'], props: ['yarn', 'box', 'mouse'] },
  dog_golden: { archetype: 'Explorer', base: { focus: 14, agility: 18, playfulness: 18, curiosity: 12, bond: 16, endurance: 22 },
    signature: { id: 'trail', name: 'Trail Buddy', text: 'Journey Snap chances +10% on walks.', stat: 'journeyChance', value: 0.10 },
    affinity: { training: 'Fetch Training', photography: 'Journey & Outdoor', walking: 'Long walks' },
    rare: ['hop', 'roll', 'dance'], props: ['ball', 'frisbee', 'stick'] },
  dog_small:  { archetype: 'Trickster', base: { focus: 12, agility: 26, playfulness: 24, curiosity: 14, bond: 14, endurance: 10 },
    signature: { id: 'bouncy', name: 'Bouncy', text: 'Prop catch window +10%.', stat: 'propWindow', value: 0.10 },
    affinity: { training: 'Agility Course', photography: 'Action & Prop', walking: 'Zoomies in bursts' },
    rare: ['hop', 'tailchase', 'dance'], props: ['ball', 'bubbles', 'squeaky'] },
  bunny:      { archetype: 'Trainer', base: { focus: 24, agility: 20, playfulness: 12, curiosity: 16, bond: 18, endurance: 10 },
    signature: { id: 'studious', name: 'Studious', text: 'Training timing tolerance +5%.', stat: 'trainingAssist', value: 0.05 },
    affinity: { training: 'Focus Training', photography: 'Timing & Sequence', walking: 'Gentle hops' },
    rare: ['sneeze', 'hop', 'sleepy'], props: ['carrot', 'flower', 'bubbles'] },
};
/* Planned pets are listed separately and never mixed with live ones. */
export const PLANNED_PETS = [
  { id: 'fox', name: 'Fennec Fox', archetype: 'Explorer', family: 'house', status: 'PLANNED' },
  { id: 'raccoon', name: 'Raccoon', archetype: 'Trickster', family: 'house', status: 'PLANNED' },
  { id: 'dragon_baby', name: 'Baby Dragon', archetype: 'Curious', family: 'magical', status: 'PLANNED' },
  { id: 'unicorn', name: 'Pocket Unicorn', archetype: 'Photographer', family: 'magical', status: 'PLANNED' },
];
