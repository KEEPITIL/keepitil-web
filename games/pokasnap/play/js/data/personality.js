/* PERSONALITY — structured data, no LLM in V1.
   ---------------------------------------------------------------------------
   Personality shapes dialogue, idle chatter, post-photo comments and which
   reactions a poke favours. Everything a future AI personality would replace
   lives behind line() and pokeOrder(), so swapping canned lines for generated
   ones is a change to this file only. {name} is filled with the pet's name. */

export const PERSONALITIES = {
  cuddly: {
    id: 'cuddly', name: 'Cuddly', icon: '🤗', blurb: 'Soft, sweet and always up for a snuggle.',
    pokeBias: ['happy', 'wave', 'wink'],
    lines: {
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
    lines: {
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
    lines: {
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
export function line(personalityId, kind, name) {
  const pool = personality(personalityId).lines[kind] || [''];
  const s = pool[Math.floor(Math.random() * pool.length)];
  return s.replace(/\{name\}/g, name || '');
}
