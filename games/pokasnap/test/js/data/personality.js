/* PERSONALITY — structured data, no LLM in V1.
   ---------------------------------------------------------------------------
   Personality shapes dialogue, idle chatter, post-photo comments and which
   reactions a poke favours. Everything a future AI personality would replace
   lives behind line() and pokeOrder(), so swapping canned lines for generated
   ones is a change to this file only. {name} is filled with the pet's name;
   {n} and {item} come from companion memory (game/companion.js).

   Reactions: `tap` answers a single poke, `double` a double-tap. Lists are in
   preference order and are filtered to poses the pet can currently do, so a
   personality's favourite trick shows up the moment it is learned. */

export const PERSONALITIES = {
  cuddly: {
    id: 'cuddly', name: 'Cuddly', icon: '🤗', blurb: 'Soft, sweet and always up for a snuggle.',
    pokeBias: ['happy', 'wave', 'wink'],
    tap: ['happy', 'wave', 'happy', 'sit', 'wink'], double: ['wave', 'highfive', 'wink', 'happy'],
    idle: ['look', 'sit', 'happy', 'yawn', 'wave', 'happy'],
    lines: {
      welcome: ['{name} missed you! ❤️', 'You came back! I saved you a snuggle.'],
      fed:     ['Yum! Thank you ❤️', 'My tummy is so happy!'],
      fav:     ['MY FAVOURITE! You remembered! ❤️'],
      pet:     ['Mmm, more please…', 'That\'s the spot ❤️'],
      rest:    ['Just a little nap… with you nearby.'],
      train:   ['I\'ll do my best for you!', 'Did I do it right?'],
      learned: ['I learned it for you! ❤️'],
      double:  ['Double boop! Double love!'],
      favpic:  ['That one\'s going in my favourites ❤️'],
      greet:   ['Hi hi! I missed you!', 'You\'re back! Best day ever.', 'Snuggle time? Photo time? Both?'],
      poke:    ['Hehe, that tickles!', 'More pats please!', 'Aww, hi!'],
      snap:    ['I love this picture!', 'We look SO cute together.', 'Frame it. Frame it right now.'],
      great:   ['That\'s the best one yet!', 'I\'m going to treasure this forever!'],
      mission: ['Ooh, a new adventure! Let\'s do it together.', 'Hold me close for this one!'],
      level:   ['I\'m growing up so fast!', 'Look how far we\'ve come!'],
    },
  },
  playful: {
    id: 'playful', name: 'Playful', icon: '🎾', blurb: 'Bouncy, bubbly and ready to go-go-go.',
    pokeBias: ['jump', 'surprised', 'happy'],
    tap: ['jump', 'happy', 'surprised', 'dance', 'spin'], double: ['dance', 'spin', 'jump', 'surprised'],
    idle: ['jump', 'look', 'happy', 'wave', 'dance', 'surprised'],
    lines: {
      welcome: ['YOU\'RE BACK! {name} missed you! ❤️', 'Finally! Let\'s play play PLAY!'],
      fed:     ['CRUNCH! More energy!', 'Fuel for zoomies!'],
      fav:     ['WOW my favourite!! Best. Day. Ever.'],
      pet:     ['Hehe! Now chase me!', 'Tickle attack!'],
      rest:    ['Okay… a power nap. Then ZOOMIES.'],
      train:   ['Watch this! Watch this!', 'Again! Let\'s go again!'],
      learned: ['I\'M A GENIUS! Take a photo!'],
      double:  ['Double poke = DANCE BREAK!'],
      favpic:  ['Again! Let\'s do a silly one!'],
      greet:   ['LET\'S GO! What are we doing?!', 'Play? Play! PLAY!', 'I\'ve been waiting SO long (5 minutes).'],
      poke:    ['Again! Again!', 'Boop!', 'Tag, you\'re it!'],
      snap:    ['Again! Again!', 'Take another one! Faster!', 'Wooo! Did I look cool?'],
      great:   ['WE\'RE UNSTOPPABLE!', 'High paw! That was epic!'],
      mission: ['A challenge? I was BORN for this!', 'Race you there!'],
      level:   ['Level up! Zoom zoom!', 'I got stronger! Let\'s play harder!'],
    },
  },
  mischievous: {
    id: 'mischievous', name: 'Mischievous', icon: '😼', blurb: 'Sneaky, cheeky and definitely up to something.',
    pokeBias: ['wink', 'surprised', 'look'],
    tap: ['look', 'wink', 'confused', 'surprised'], double: ['confused', 'wink', 'spin', 'look'],
    idle: ['look', 'confused', 'wink', 'yawn', 'sit'],
    lines: {
      welcome: ['Oh, you\'re back. {name} did NOT miss you. (I did.) ❤️', 'Where were you? …Never mind. Photo?'],
      fed:     ['Acceptable. Barely. More.', 'I\'ll allow it.'],
      fav:     ['…How did you know? Suspicious. Delicious.'],
      pet:     ['Fine. You may continue.', 'I didn\'t say stop.'],
      rest:    ['I\'m not sleeping. I\'m plotting.'],
      train:   ['I\'ll do it… if I feel like it.', 'Hmph. Easy.'],
      learned: ['I always knew that. Obviously.'],
      double:  ['Nope. Not doing it. 😏', 'Poke me again. I dare you.'],
      favpic:  ['You almost caught me 😏'],
      greet:   ['Oh. It\'s you. ...I didn\'t knock anything over.', 'I have a plan. Don\'t ask.', 'Shh. Act natural.'],
      poke:    ['Hey! Personal space!', 'You almost caught me!', 'Try that again. I dare you.'],
      snap:    ['You almost caught me!', 'I blinked on purpose.', 'This is going on my wanted poster.'],
      great:   ['Heh. We\'re a dangerous team.', 'Not bad... for a human.'],
      mission: ['Ooh, trouble. My favourite.', 'I\'ll allow it.'],
      level:   ['My power grows...', 'Soon, the whole house will be mine.'],
    },
  },
};

export const PERSONALITY_ORDER = ['cuddly', 'playful', 'mischievous'];

export function personality(id) { return PERSONALITIES[id] || PERSONALITIES.cuddly; }

/* Deterministic-per-call variety without an LLM. */
export function line(personalityId, kind, name, vars = {}) {
  const pool = personality(personalityId).lines[kind] || [''];
  const s = pool[Math.floor(Math.random() * pool.length)];
  return s.replace(/\{name\}/g, name || '').replace(/\{(\w+)\}/g, (m, k) => k in vars ? vars[k] : m);
}

/* Pick a poke reaction. `can(poseId)` says whether the pet can do it now;
   `i` advances through the list so repeated pokes vary. */
export function reaction(personalityId, kind, can, i = 0) {
  const list = (personality(personalityId)[kind === 'double' ? 'double' : 'tap']).filter(can);
  const pool = list.length ? list : ['happy', 'surprised'];
  return pool[i % pool.length];
}
