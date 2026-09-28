/* The SEEDED 2.0 TEST SAVE (profile=seed only — never the owner's save).
   Enough state to inspect 2.0 quickly: three Pokas with different personalities and
   relationships, several open locations, partial Album progress, currencies and a cached
   friend count so team events show friend cheers. */
import { LEVEL_XP } from './progression.js';
export function seededSave(now) {
  const DAY = 864e5, ids = ['p1', 'p2', 'p3'];
  const pet = (id, species, appearance, name, personality, equipped, age) => ({ id, species, appearance, name, personality, equipped, createdAt: now - age * DAY });
  const season = (() => { const d = new Date(now), m = d.getMonth(), k = [11, 0, 1].includes(m) ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn'; return `${k}-${m <= 1 ? d.getFullYear() - 1 : d.getFullYear()}`; })();
  const at = { photoId: null, at: now - 3600e3 };
  return {
    schema: 1, scoreScale: 100, onboarded: true, account: { mode: 'guest', userId: null, email: null },
    pet: pet('p1', 'dog_golden', 'honey', 'Pudding', 'playful', { NECK: 'neck_bandana' }, 90),
    residents: [pet('p2', 'cat_fluffy', 'cloud', 'Milo', 'cuddly', { HEAD: 'head_beret_artist' }, 60), pet('p3', 'bunny', 'snow', 'Clover', 'mischievous', { NECK: 'neck_bowtie_blue' }, 30)],
    activeIds: ids,
    progress: { xp: LEVEL_XP[36] + 10, level: 36, coins: 3400, diamonds: 260, snaps: 120, bestScore: 92, missions: {} },
    inventory: ['neck_bandana', 'head_beret_artist', 'neck_bowtie_blue', 'prop_ball', 'prop_yarn'],
    settings: { sound: true, haptics: true, music: false, musicVolume: 0.8, sfxVolume: 1 },
    skills: { learned: ['sit', 'lay', 'wave', 'sleep', 'swim', 'jump', 'dance', 'spin', 'wink', 'highfive'], practice: {} },
    notify: { asked: true, prefs: {} }, hints: { protect: now },
    social: { friendCount: 2, at: now },
    world: {
      relations: {
        'p1|p2': { points: 72, type: 'best_friend', via: { play: 40, walk: 20, care: 12 }, history: [{ at: now - DAY, type: 'best_friend' }] },
        'p1|p3': { points: 44, type: 'playful_rival', via: { rival: 20, play: 24 }, history: [{ at: now - 3 * DAY, type: 'playful_rival' }] },
        'p2|p3': { points: 48, type: 'mentor', via: { train: 22, play: 26 }, history: [{ at: now - 2 * DAY, type: 'mentor' }] },
      },
      care: Object.fromEntries(ids.map(id => [id, { lastCare: now - 3600e3, warnedAt: 0, state: 'healthy', recovery: 0 }])),
    },
    v2: { tut: { done: now }, album: { slots: { [season]: { funny: { sneeze: at, yawn: at, happy: at, surprised: at, confused: at, sleepy: at, stumble: at, excited: at }, friends: { play: at, nap: at }, backyard: { sniff: at } } }, claimed: {} } },
  };
}
