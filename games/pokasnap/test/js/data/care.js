/* CARE — tiny, optional, never punitive. Data only.
   Every action always works and always animates. Rewards (a little XP and a
   couple of coins) pay at most once per action per COOLDOWN so care can't be
   farmed -- but nothing is ever blocked and nothing decays while you're away. */

export const COOLDOWN_MS = 2 * 60 * 60 * 1000;
export const REWARD = { xp: 6, coins: 2 };

export const FOODS = [
  { id: 'kibble', name: 'Kibble',  icon: '🥣' },
  { id: 'fish',   name: 'Fish',    icon: '🐟' },
  { id: 'carrot', name: 'Carrot',  icon: '🥕' },
  { id: 'apple',  name: 'Apple',   icon: '🍎' },
  { id: 'cookie', name: 'Cookie',  icon: '🍪' },
];
// the cheap trick that makes a pet feel like YOUR pet
export const FAVORITE_FOOD = { cat: 'fish', dog: 'cookie', rabbit: 'carrot' };

export const ACTIONS = [
  { id: 'feed',  name: 'FEED',  icon: '🍽️', pose: 'happy' },
  { id: 'pet',   name: 'PET',   icon: '🤚', pose: 'happy' },
  { id: 'treat', name: 'TREAT', icon: '🦴', pose: 'jump'  },
  { id: 'rest',  name: 'REST',  icon: '😴', pose: 'sleep' },
];
