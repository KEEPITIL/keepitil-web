/* POKA BRAINS (2.1) — how each Poka decides what to do about a ball, food, a toy or a touch.
   Pure and DOM-free (rnd injected) so every rule is testable. The same input never produces the
   same sequence: personality, a second TRAIT, mood, hunger, favourite food, bond and who else is
   already doing something all weigh in, then a weighted roll decides. */

export const TRAITS = ['competitive', 'lazy', 'curious', 'social'];
export const FOODS = [
  { id: 'kibble', icon: '🥣', name: 'Kibble' }, { id: 'fish', icon: '🐟', name: 'Fish' },
  { id: 'carrot', icon: '🥕', name: 'Carrot' }, { id: 'cookie', icon: '🍪', name: 'Cookie' },
];
const hash = s => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
/** Every Poka gets a stable trait + favourite food (added on migration; never re-rolled). */
export function ensureTraits(pet) {
  if (!pet) return pet;
  if (!TRAITS.includes(pet.trait)) pet.trait = TRAITS[hash(pet.id + ':t') % TRAITS.length];
  if (!FOODS.some(f => f.id === pet.favFood)) pet.favFood = FOODS[hash(pet.id + ':f') % FOODS.length].id;
  return pet;
}
const UNWELL = new Set(['snappy', 'withdrawn', 'critical', 'memorial']);
const roll = (opts, rnd) => { const tot = opts.reduce((a, o) => a + Math.max(0, o.w), 0); let x = rnd() * tot; for (const o of opts) if ((x -= Math.max(0, o.w)) <= 0) return o; return opts[opts.length - 1]; };
const LINE = {
  chase: '{n} bolts after it!', race: '{n} races to beat the others!', watch: '{n} just watches.', investigate: '{n} waits to see where it lands…',
  wait_join: '{n} waits for a friend to go first.', guard: '{n} grabs it and guards it — mine!', ignore: '{n} isn\'t interested.', refuse: '{n} doesn\'t feel like it.',
  rush: '{n} rushes to the bowl!', polite: '{n} politely waits a turn.', share: '{n} shares with a friend.', steal: '{n} sneaks a bite!', reject: '{n} sniffs it… no thanks.',
  beg: '{n} begs you for more.', guard_food: '{n} guards the bowl.', invite: '{n} fetches a friend to eat together.',
  boop: '{n} blinks at you.', pet: '{n} leans into the pets.', poke: '{n} jumps!', hide: '{n} hides with the toy.', carry: '{n} carries the toy off.', tug: '{n} wants that toy too!',
};
const say = (k, n) => (LINE[k] || '').replace('{n}', n);

/**
 * The ball just landed (or was thrown). pets: [{ id, name, personality, trait, mood, dist }] (dist 0..1 to the ball).
 * Returns one plan per Poka: { id, action, delay (s), speed, line }.
 */
export function reactToBall(pets, rnd = Math.random) {
  const plans = [];
  for (const p of pets) {
    if (UNWELL.has(p.mood) && rnd() < 0.8) { plans.push({ id: p.id, action: 'refuse', delay: 0, line: say('refuse', p.name) }); continue; }
    const base = { playful: 0.85, mischievous: 0.6, cuddly: 0.3 }[p.personality] ?? 0.5;
    const others = plans.filter(x => x.action === 'chase' || x.action === 'race').length;
    const o = [
      { a: others && p.trait === 'competitive' ? 'race' : 'chase', w: base * 10 * (p.trait === 'lazy' ? 0.35 : 1) * (1.2 - (p.dist || 0) * 0.5) },
      { a: 'watch', w: (1 - base) * 6 + (p.trait === 'lazy' ? 5 : 0) },
      { a: 'investigate', w: p.trait === 'curious' ? 7 : 1.5 },
      { a: 'wait_join', w: p.trait === 'social' ? (others ? 1 : 6) : 0.5 },
      { a: 'guard', w: p.personality === 'mischievous' ? 4 : 0.3 },
      { a: 'ignore', w: p.personality === 'cuddly' ? 2 : 0.6 },
    ];
    const pick = roll(o, rnd);
    const delay = pick.a === 'investigate' ? 0.9 + rnd() * 0.6 : pick.a === 'wait_join' ? 1.2 + rnd() : pick.a === 'guard' ? 0.3 : rnd() * 0.25;
    const speed = { chase: 1.5, race: 1.8, guard: 1.4, investigate: 0.8, wait_join: 1.3 }[pick.a] || 0;
    plans.push({ id: p.id, action: pick.a, delay: +delay.toFixed(2), speed, line: say(pick.a, p.name) });
  }
  // a social Poka waiting to join follows whoever chases; if nobody does, it goes alone
  for (const p of plans) if (p.action === 'wait_join') p.follow = plans.find(x => x.action === 'chase' || x.action === 'race')?.id || null;
  return plans;
}
/** Two Pokas reached the ball: who gets it, and what the loser does. */
export function resolveBallContest(a, b, rnd = Math.random) {
  const ea = (a.personality === 'mischievous' ? 1.3 : 1) * (a.trait === 'competitive' ? 1.25 : 1) * (0.7 + rnd() * 0.6);
  const eb = (b.personality === 'mischievous' ? 1.3 : 1) * (b.trait === 'competitive' ? 1.25 : 1) * (0.7 + rnd() * 0.6);
  const [win, lose] = ea >= eb ? [a, b] : [b, a];
  const loser = roll([{ a: 'stumble', w: 3 }, { a: 'surprised', w: 3 }, { a: 'steal_try', w: lose.personality === 'mischievous' ? 4 : 1 }, { a: 'tug', w: 2 }], rnd).a;
  return { winner: win.id, loser: lose.id, loserAction: loser, funny: loser === 'stumble' || loser === 'steal_try' };
}
/** What the Poka does once it has the ball. */
export function afterCatch(p, rnd = Math.random) {
  if (p.personality === 'mischievous' && rnd() < 0.6) return 'keep_away';
  if (p.personality === 'playful' || p.trait === 'social') return rnd() < 0.8 ? 'return' : 'play';
  return rnd() < 0.5 ? 'return' : 'play';
}

/* ---------------------------------------------------------------- food */
export const hungerOf = (lastFed, now = Date.now()) => Math.max(0, Math.min(1, (now - (lastFed || 0)) / (8 * 3600e3)));
/**
 * Food dropped. pets: [{ id, name, personality, trait, mood, hunger, favFood, bond: {otherId: points}, relation: {otherId: type} }].
 * Returns plans { id, action, delay, line, with? }.
 */
export function reactToFood(pets, food, rnd = Math.random) {
  const plans = [];
  const sorted = [...pets].sort((a, b) => b.hunger - a.hunger);   // the hungriest decides first
  for (const p of sorted) {
    if (UNWELL.has(p.mood) && rnd() < 0.6) { plans.push({ id: p.id, action: 'refuse', delay: 0, line: say('refuse', p.name) }); continue; }
    const fav = p.favFood === food, hungry = p.hunger > 0.45, eating = plans.filter(x => x.action === 'rush' || x.action === 'share' || x.action === 'guard_food');
    const friend = eating.find(x => ['friend', 'best_friend'].includes(p.relation?.[x.id]));
    const o = [
      { a: 'rush', w: (hungry ? 8 : 2) + (fav ? 6 : 0) - eating.length * 2 },
      { a: 'polite', w: eating.length && p.personality === 'cuddly' ? 6 : 0.5 },
      { a: 'share', w: friend ? 7 : 0 },
      { a: 'steal', w: eating.length && p.personality === 'mischievous' ? 6 : 0 },
      { a: 'reject', w: !hungry && !fav ? 6 : 0.2 },
      { a: 'beg', w: p.personality === 'cuddly' && !hungry ? 3 : 0.8 },
      { a: 'guard_food', w: fav && p.personality === 'mischievous' ? 5 : 0.2 },
      { a: 'invite', w: p.trait === 'social' && pets.length > 1 && !eating.length ? 5 : 0 },
    ];
    const pick = roll(o, rnd);
    plans.push({ id: p.id, action: pick.a, delay: +(rnd() * 0.4 + (pick.a === 'polite' ? 1.5 : 0)).toFixed(2), line: say(pick.a, p.name), with: pick.a === 'share' ? friend.id : pick.a === 'invite' ? pets.find(x => x.id !== p.id)?.id : undefined, fav });
  }
  return plans;
}

/* ---------------------------------------------------------------- toys (autonomous) */
/** A Poka noticed a toy. holder = id of whoever has it (or null). */
export function reactToToy(p, holder, relationToHolder, rnd = Math.random) {
  if (UNWELL.has(p.mood)) return 'ignore';
  const o = [
    { a: 'approach', w: holder ? 0 : p.trait === 'curious' ? 6 : 3 },
    { a: 'carry', w: holder ? 0 : p.personality === 'playful' ? 4 : 2 },
    { a: 'hide', w: holder ? 0 : p.personality === 'mischievous' ? 4 : 0.5 },
    { a: 'tug', w: holder ? (relationToHolder === 'playful_rival' ? 7 : p.personality === 'mischievous' ? 4 : 1.5) : 0 },
    { a: 'share', w: holder && ['friend', 'best_friend'].includes(relationToHolder) ? 5 : 0 },
    { a: 'ignore', w: p.trait === 'lazy' ? 5 : 1.5 },
  ];
  return roll(o, rnd).a;
}

/* ---------------------------------------------------------------- touch */
/** tap | stroke | poke | hold → pose + line. */
export function reactToTouch(p, kind, rnd = Math.random) {
  if (UNWELL.has(p.mood) && kind !== 'stroke') return { action: 'refuse', pose: 'confused', line: say('refuse', p.name) };
  const T = {
    tap: { playful: ['happy', 'jump', 'wave'], cuddly: ['heart', 'happy', 'sitpretty'], mischievous: ['wink', 'surprised', 'peek'] },
    stroke: { playful: ['happy', 'roll'], cuddly: ['heart', 'sleep'], mischievous: ['wink', 'happy'] },
    poke: { playful: ['jump', 'surprised'], cuddly: ['surprised', 'confused'], mischievous: ['sneeze', 'confused', 'surprised'] },
  };
  const opts = (T[kind] || T.tap)[p.personality] || T.tap.cuddly;
  const pose = opts[Math.floor(rnd() * opts.length)];
  return { action: kind === 'stroke' ? 'pet' : kind === 'poke' ? 'poke' : 'boop', pose, line: say(kind === 'stroke' ? 'pet' : kind === 'poke' ? 'poke' : 'boop', p.name), hearts: kind === 'stroke' };
}
/** Several Pokas answering the same input differently is itself a moment. */
export const divergent = plans => new Set(plans.map(p => p.action)).size >= 2 && plans.length >= 2;
