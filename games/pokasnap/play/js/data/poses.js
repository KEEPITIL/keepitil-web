/* POSE LIBRARY — shared by every pet.
   ---------------------------------------------------------------------------
   A pose is data, never code. The renderer reads:
     posture   'stand' | 'sit' | 'lay' | 'jump' | 'swim'  (body plan)
     eyes      'open' | 'happy' | 'closed' | 'wide' | 'wink'
     mouth     'smile' | 'open' | 'o' | 'cat' | 'tongue' | 'sleepy'
     headTilt  radians, positive = toward the viewer's right
     paw       'down' | 'wave' | 'up' | 'tuck'
     ears      'up' | 'perk' | 'back'
     tailWag   0..1 amplitude for the idle loop
     fx        optional overlay: 'hearts' | 'zzz' | 'sparkle' | 'splash' | 'bang'
   Anchors (head_top, face, neck, body) are computed from the posture, so a
   cosmetic attaches correctly in every pose without per-pose tuning.

   skill   when set, the pose is a TRAINED trick: it appears in the camera only
           after the pet learns that skill in TRAIN (data/skills.js). Poses
           without a skill are always available. This is the loop
           PLAY -> TRAIN -> UNLOCK POSE -> USE IN PHOTO.
   reaction true = used only as a canned poke/idle reaction, not in the camera
           pose picker (yawn, confused).
   unlockLevel is kept for compatibility; skills now own progression gating. */

export const POSES = {
  idle:      { id: 'idle',      name: 'Hello',       icon: '🙂', posture: 'stand', eyes: 'open',   mouth: 'smile',  headTilt: 0,     paw: 'down', ears: 'up',   tailWag: .6, fx: null,      unlockLevel: 1 },
  look:      { id: 'look',      name: 'Look Here',   icon: '👀', posture: 'stand', eyes: 'wide',   mouth: 'cat',    headTilt: -.14,  paw: 'down', ears: 'perk', tailWag: .3, fx: null,      unlockLevel: 1 },
  sit:       { id: 'sit',       name: 'Sit',         icon: '🪑', posture: 'sit',   eyes: 'open',   mouth: 'smile',  headTilt: .08,   paw: 'down', ears: 'up',   tailWag: .4, fx: null,      unlockLevel: 1 },
  happy:     { id: 'happy',     name: 'Happy',       icon: '😊', posture: 'sit',   eyes: 'happy',  mouth: 'open',   headTilt: -.1,   paw: 'down', ears: 'perk', tailWag: 1,  fx: 'hearts',  unlockLevel: 1 },
  sleep:     { id: 'sleep',     name: 'Sleep',       icon: '😴', posture: 'lay',   eyes: 'closed', mouth: 'sleepy', headTilt: .2,    paw: 'tuck', ears: 'back', tailWag: .05,fx: 'zzz',     unlockLevel: 1 },
  wave:      { id: 'wave',      name: 'Wave',        icon: '👋', posture: 'sit',   eyes: 'happy',  mouth: 'open',   headTilt: .12,   paw: 'wave', ears: 'perk', tailWag: .8, fx: null,      unlockLevel: 1 },
  lay:       { id: 'lay',       name: 'Lay Down',    icon: '🛋️', posture: 'lay',   eyes: 'open',   mouth: 'smile',  headTilt: -.06,  paw: 'tuck', ears: 'up',   tailWag: .3, fx: null,      unlockLevel: 1 },
  jump:      { id: 'jump',      name: 'Jump',        icon: '⭐', posture: 'jump',  eyes: 'happy',  mouth: 'open',   headTilt: 0,     paw: 'up',   ears: 'perk', tailWag: 1,  fx: 'sparkle', unlockLevel: 1, skill: 'jump' },
  surprised: { id: 'surprised', name: 'Surprised',   icon: '😮', posture: 'stand', eyes: 'wide',   mouth: 'o',      headTilt: 0,     paw: 'up',   ears: 'perk', tailWag: 0,  fx: 'bang',    unlockLevel: 1 },
  swim:      { id: 'swim',      name: 'Swim',        icon: '🏊', posture: 'swim',  eyes: 'happy',  mouth: 'open',   headTilt: -.08,  paw: 'up',   ears: 'back', tailWag: .2, fx: 'splash',  unlockLevel: 1 },
  wink:      { id: 'wink',      name: 'Wink',        icon: '😉', posture: 'sit',   eyes: 'wink',   mouth: 'tongue', headTilt: .16,   paw: 'down', ears: 'up',   tailWag: .7, fx: 'sparkle', unlockLevel: 1, skill: 'wink' },
  dance:     { id: 'dance',     name: 'Dance',       icon: '💃', posture: 'stand', eyes: 'happy',  mouth: 'open',   headTilt: .2,    paw: 'up',   ears: 'perk', tailWag: 1,  fx: 'notes',   unlockLevel: 1, skill: 'dance' },
  spin:      { id: 'spin',      name: 'Spin',        icon: '🌀', posture: 'jump',  eyes: 'happy',  mouth: 'smile',  headTilt: -.3,   paw: 'up',   ears: 'back', tailWag: 1,  fx: 'sparkle', unlockLevel: 1, skill: 'spin' },
  highfive:  { id: 'highfive',  name: 'High Five',   icon: '🙌', posture: 'sit',   eyes: 'happy',  mouth: 'open',   headTilt: -.12,  paw: 'wave', ears: 'perk', tailWag: 1,  fx: 'bang',    unlockLevel: 1, skill: 'highfive' },
  yawn:      { id: 'yawn',      name: 'Yawn',        icon: '🥱', posture: 'sit',   eyes: 'closed', mouth: 'o',      headTilt: .22,   paw: 'down', ears: 'back', tailWag: .1, fx: null,      unlockLevel: 1, reaction: true },
  confused:  { id: 'confused',  name: 'Huh?',        icon: '❓', posture: 'stand', eyes: 'open',   mouth: 'cat',    headTilt: .34,   paw: 'down', ears: 'perk', tailWag: .2, fx: 'question',unlockLevel: 1, reaction: true },
};

/* Tap-to-poke cycles through these, so a single tap always produces a visible,
   happy reaction. The personality weights the order (see personality.js). */
export const POKE_CYCLE = ['happy', 'surprised', 'wave', 'look', 'jump', 'wink', 'dance'];

export const POSE_ORDER = ['idle', 'look', 'sit', 'happy', 'wave', 'lay', 'sleep', 'surprised', 'swim', 'jump', 'dance', 'spin', 'wink', 'highfive'];

export function pose(id) { return POSES[id] || POSES.idle; }
