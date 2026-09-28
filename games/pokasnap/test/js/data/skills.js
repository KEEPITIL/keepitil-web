/* SKILLS — tricks a pet learns in TRAIN. Data only.
   ---------------------------------------------------------------------------
   PLAY -> TRAIN -> UNLOCK POSE -> USE IN PHOTO.
   A skill maps 1:1 to a camera pose (poses.js `skill`). Five everyday skills
   are known from adoption so a new player's camera is never empty. The five
   tricks are taught by practice: `reps` short training games each. `level`
   is when a trick can START being trained; nothing is ever un-learned. */

export const REPS = 3;

export const SKILLS = [
  { id: 'sit',      name: 'Sit',       icon: '🪑', pose: 'sit',      starter: true },
  { id: 'lay',      name: 'Lay Down',  icon: '🛋️', pose: 'lay',      starter: true },
  { id: 'wave',     name: 'Wave',      icon: '👋', pose: 'wave',     starter: true },
  { id: 'sleep',    name: 'Sleep',     icon: '😴', pose: 'sleep',    starter: true },
  { id: 'swim',     name: 'Swim',      icon: '🏊', pose: 'swim',     starter: true },
  { id: 'jump',     name: 'Jump',      icon: '⭐', pose: 'jump',     level: 1, blurb: 'A big happy hop!' },
  { id: 'dance',    name: 'Dance',     icon: '💃', pose: 'dance',    level: 2, blurb: 'Busts a move to the music.' },
  { id: 'spin',     name: 'Spin',      icon: '🌀', pose: 'spin',     level: 3, blurb: 'A dizzy twirl in the air.' },
  { id: 'wink',     name: 'Wink',      icon: '😉', pose: 'wink',     level: 4, blurb: 'The cheekiest look.' },
  { id: 'highfive', name: 'High Five', icon: '🙌', pose: 'highfive', level: 5, blurb: 'Paw up, partner!' },
];

export function skill(id) { return SKILLS.find(s => s.id === id) || null; }
export const STARTER_SKILLS = SKILLS.filter(s => s.starter).map(s => s.id);
export const TRICKS = SKILLS.filter(s => !s.starter);
