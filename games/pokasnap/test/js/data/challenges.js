/* PHOTO CHALLENGE LIBRARY (1.3) — every challenge the camera can score.
   ---------------------------------------------------------------------------
   The 28 original missions stay (ids unchanged) as the Fundamentals core.
   The rest are generated from small template tables so each one is distinct
   data, not a hand-copied screen. Fields on top of a mission:
     level     gate: the player level that unlocks it
     req       REQUIREMENTS the photo must meet (game/score.js requirementsMet)
               pose | poseAny | prop | propAction | filter | backdrop | time |
               outfit/outfitSet | equippedMin | journey | rare
     sequence  n photos in one session that each meet req (Master)
     noGear    limited assistance: gear/perks add nothing, no pose hint
     weights   redistributes the six score parts for this challenge
   A challenge's ≤5 stars are permanent; only NEW stars count (no farming). */

import { MISSIONS, registerLibrary } from './missions.js';
import { item as itemOf } from './items.js';
const nm = id => itemOf(id)?.name || id;

const C = (missionID, title, instruction, o) => ({
  missionID, title, instruction, recommendedPose: o.pose || o.req?.pose || 'happy', difficulty: o.d || 2,
  XPReward: o.xp || 80 + (o.level || 1), coinReward: 0, category: o.cat, icon: o.icon, tip: o.tip, isActive: true,
  size: o.size || 'normal', place: o.place || 'any', partial: o.partial, camera: o.camera, level: o.level || 1,
  req: o.req || null, sequence: o.sequence || 0, noGear: !!o.noGear, weights: o.weights || null, master: !!o.master, generated: true,
});
const TIME = { morning: [6, 11, 'morning'], afternoon: [12, 17, 'the afternoon'], sunset: [17, 20, 'sunset'], evening: [18, 22, 'the evening'], night: [20, 5, 'night'] };
const T = k => ({ time: [TIME[k][0], TIME[k][1]], timeName: TIME[k][2] });

/* ---- Level 1-19: fundamentals (pose / scale / composition / expression) */
const POSE_CH = [
  ['sit', 'Perfect Sit', 'Snap a picture-perfect sit.', 'pose', '🪑'], ['wave', 'Hello There', 'Catch a friendly wave.', 'pose', '👋'],
  ['lay', 'Lazy Afternoon', 'A relaxed lay-down shot.', 'pose', '🛋️'], ['sleep', 'Shh, Sleeping', 'Photograph a peaceful nap.', 'expression', '😴'],
  ['surprised', 'Oh My!', 'Capture a surprised face.', 'expression', '😮'], ['look', 'Curious Look', 'Snap your pet looking at something interesting.', 'expression', '👀'],
  ['happy', 'Big Smile', 'The happiest face you can get.', 'expression', '😊'], ['swim', 'Paddle Pals', 'A swimming shot — bathtub, pool or puddle scene.', 'pose', '🏊'],
];
const FUNDAMENTALS = [
  ...POSE_CH.map(([pose, t, i, cat, icon], k) => C(`fun_pose_${pose}`, t, i, { cat, icon, level: 2 + k, req: { pose, poseName: t }, tip: 'Open 🎭 POSE and pick it before the shutter.' })),
  C('fun_thirds_left', 'Rule of Thirds', 'Place your pet on the left third of the photo.', { cat: 'composition', icon: '📐', level: 5, place: 'edge', weights: { composition: 25, scale: 20, pose: 10 }, tip: 'Imagine the photo split in three columns.' }),
  C('fun_center_stage', 'Centre Stage', 'Put your pet right in the middle, feet on the ground.', { cat: 'composition', icon: '🎯', level: 6, place: 'center', tip: 'Tap 🎯 to recentre, then adjust.' }),
  C('fun_low_angle', 'Ground Level', 'Keep your pet low in the frame like it is standing on the floor.', { cat: 'composition', icon: '⬇️', level: 8, place: 'low' }),
  C('fun_tiny_hero', 'Tiny Hero', 'Make your pet tiny next to something tall.', { cat: 'scale', icon: '🐜', level: 9, size: 'tiny' }),
  C('fun_giant_friend', 'Giant Friend', 'Make your pet fill most of the photo.', { cat: 'scale', icon: '🦖', level: 11, size: 'big' }),
  C('fun_peek_edge', 'Peek From the Edge', 'Only part of your pet peeks in from the side.', { cat: 'composition', icon: '🙈', level: 12, partial: true, place: 'edge' }),
  C('fun_dressed_up', 'Dressed Up', 'Snap your pet wearing two accessories.', { cat: 'gear', icon: '👒', level: 13, req: { equippedMin: 2 } }),
  C('fun_poke_timing', 'Boop Timing', 'Poke your pet and snap during its reaction.', { cat: 'action', icon: '👆', level: 14, weights: { timing: 20, creative: 5, composition: 15 }, tip: 'Tap the pet, then press the shutter within 3 seconds.' }),
  C('fun_tilted', 'Dutch Angle', 'Tilt your pet for a playful angle.', { cat: 'creative', icon: '↗️', level: 16, weights: { creative: 20, composition: 15, scale: 10 } }),
  C('fun_studio', 'Studio Portrait', 'Use the Photo Studio backdrop for a clean portrait.', { cat: 'background', icon: '📷', level: 10, req: { backdrop: 'bg_studio', backdropName: 'Photo Studio' } }),
  C('fun_park', 'Picnic in the Park', 'Pose your pet on the Sunny Park backdrop.', { cat: 'background', icon: '🌳', level: 12, req: { backdrop: 'bg_park', backdropName: 'Sunny Park' }, pose: 'happy' }),
];

/* ---- Training unlocks feed photography */
const SKILL_CH = [
  ['jump', 'Air Time', 'Photograph a trained Jump at its peak.', 'action'], ['dance', 'Dance Floor', 'Snap a Dance move.', 'action'], ['spin', 'Spin Cycle', 'Catch a mid-air Spin.', 'action'],
  ['wink', 'Secret Wink', 'Get a wink on camera.', 'expression'], ['highfive', 'Up Top!', 'Photograph a High Five.', 'action'], ['roll', 'Roll Over', 'Snap a Roll Over from Trick Studio.', 'action'],
  ['leap', 'Agility Leap', 'Photograph an Agility Leap.', 'action'], ['weave', 'Weaving', 'Capture the Weave pose.', 'action'], ['sniff', 'Detective', 'Snap your pet on the scent.', 'expression'],
  ['statue', 'Statue Stay', 'A perfectly still Statue pose.', 'pose'], ['peek', 'Peekaboo', 'Capture a Peekaboo.', 'expression'], ['catch', 'Nice Catch', 'Photograph the Mid-Air Catch pose.', 'action'],
];
const SKILLS = SKILL_CH.map(([pose, t, i, cat], k) => C(`skill_${pose}`, t, i, { cat, icon: '🎓', level: 3 + k * 3, d: 3, req: { pose, poseName: t }, tip: 'Learn this pose in the Training Academy first.' }));

/* ---- Level 20: Prop Play */
const PROP_CH = [
  ['prop_ball', 'catch', 'Fetch!', 'Toss the ball and snap the catch.', 20], ['prop_frisbee', 'catch', 'Frisbee Flyer', 'Snap your pet catching the frisbee.', 21],
  ['prop_yarn', 'place', 'Yarn Trouble', 'Place the yarn ball and catch your pet reacting.', 20], ['prop_treat', 'hold', 'Good Pet!', 'Give a treat and snap your pet holding it.', 20],
  ['prop_flower', 'hold', 'Flower Delivery', 'Your pet holds a flower for you.', 23], ['prop_toycamera', 'hold', 'Photographer Pet', 'Your pet holds the toy camera — photo inside a photo!', 22],
  ['prop_umbrella', 'hold', 'Rainy Day Ready', 'Hold the umbrella for a rainy-day portrait.', 25], ['prop_bubbles', 'place', 'Bubble Time', 'Place the bubble wand and snap the bubbles.', 26],
  ['prop_stick', 'catch', 'Stick Fetch', 'Toss the stick and snap the catch.', 27], ['prop_plush', 'hold', 'Best Buddy', 'Your pet hugs its plush bear.', 28],
  ['prop_box', 'place', 'If I Fits…', 'Place the box and snap your pet beside it.', 29], ['prop_squeaky', 'catch', 'Squeak Squeak', 'Catch the squeaky duck.', 30],
  ['prop_kite', 'hold', 'Kite Day', 'A windy kite-day photo.', 32], ['prop_book', 'hold', 'Story Time', 'Your pet holds a storybook.', 33],
  ['prop_soccer', 'catch', 'Goal Keeper', 'Toss the soccer ball and snap the save.', 34], ['prop_guitar', 'hold', 'Rock Star', 'Your pet plays a tiny guitar.', 35],
  ['any', 'catch', 'Catch of the Day', 'Snap any mid-air catch.', 24], ['any', 'hold', 'Show and Tell', 'Your pet proudly holds any prop.', 22],
];
const PROPS = PROP_CH.map(([prop, action, t, i, level], k) => C(`prop_${k}_${action}`, t, i, { cat: 'prop', icon: '🎾', level, d: action === 'catch' ? 3 : 2, pose: action === 'catch' ? 'jump' : action === 'hold' ? 'sit' : 'look',
  req: { prop, propName: prop === 'any' ? 'a prop' : nm(prop), propAction: action }, weights: action === 'catch' ? { timing: 18, creative: 7, pose: 15 } : null,
  tip: action === 'catch' ? 'Tap TOSS and press the shutter the moment your pet catches it.' : action === 'hold' ? 'Choose the prop, then GIVE it to your pet.' : 'Choose the prop, then PLACE it and drag it near your pet.' }));

/* ---- Level 40: Creative Camera (filters & effects) */
const FILTER_CH = [
  ['filter_vintage', 'Old Photograph', 'Make a photo that looks 50 years old.', 40, 'lay'], ['filter_bw', 'Film Noir', 'A dramatic black-and-white portrait.', 40, 'look'],
  ['filter_dreamy', 'Sweet Dreams', 'A dreamy sleeping shot.', 42, 'sleep'], ['filter_warm', 'Golden Glow', 'A cozy warm-toned portrait.', 40, 'happy'],
  ['filter_cool', 'Chill Vibes', 'A cool-toned, calm photo.', 41, 'sit'], ['filter_sparkle', 'Sparkle Star', 'Add sparkle to a star pose.', 44, 'jump'],
  ['filter_vignette', 'Spotlight', 'Use a vignette to draw eyes to your pet.', 43, 'sit'], ['filter_snow', 'Snow Day', 'A snowy photo, even indoors.', 46, 'happy'],
  ['filter_rain', 'Singing in the Rain', 'A rain shower photo with an umbrella.', 47, 'happy'], ['filter_hearts', 'Love Letter', 'A floating-hearts photo.', 45, 'happy'],
  ['filter_bubbles', 'Under the Sea', 'Bubbles effect plus a swim pose.', 48, 'swim'], ['filter_leaves', 'Autumn Breeze', 'Falling leaves on a seasonal portrait.', 49, 'look'],
  ['any', 'Creative Director', 'Use any filter for a stylish portrait.', 40, 'happy'], ['filter_pastel', 'Pastel Dream', 'A soft pastel portrait.', 52, 'wave'],
];
const FILTERS = FILTER_CH.map(([filter, t, i, level, pose], k) => C(`filter_${k}`, t, i, { cat: 'filter', icon: '🎞️', level, d: 3, pose,
  req: { filter, filterName: filter === 'any' ? 'any filter' : `the ${nm(filter)} filter`, ...(filter === 'filter_rain' ? { prop: 'prop_umbrella', propName: 'Umbrella' } : {}), ...(pose !== 'happy' && k % 2 === 0 ? { pose, poseName: pose } : {}) },
  weights: { creative: 15, composition: 20, timing: 5 }, tip: 'Open 🎞️ FILTER in the camera.' }));

/* ---- Level 60: Time Adventures (local time, no GPS) */
const TIME_CH = [
  ['morning', 'Good Morning Sunshine', 'A bright morning photo.', 60, 'wave'], ['morning', 'Breakfast Buddy', 'Morning photo next to breakfast.', 62, 'look'],
  ['afternoon', 'Afternoon Adventure', 'An afternoon photo outside.', 61, 'happy'], ['afternoon', 'Siesta', 'An afternoon nap.', 64, 'sleep'],
  ['sunset', 'Golden Hour', 'A sunset-light portrait.', 63, 'sit'], ['sunset', 'Sunset Silhouette', 'Sunset with the warm filter.', 66, 'look'],
  ['evening', 'Evening Lights', 'A photo under evening lights.', 65, 'happy'], ['evening', 'Lantern Walk', 'Evening photo with the paper lantern.', 68, 'look'],
  ['night', 'Night Owl', 'A night-time portrait (indoors is perfect).', 67, 'surprised'], ['night', 'Glow Party', 'Night photo with a glow stick.', 70, 'dance'],
  ['night', 'Starry Night', 'Night photo with the Fireflies effect.', 72, 'look'], ['morning', 'Early Bird', 'An early-morning stretch.', 74, 'stretch'],
];
const TIMES = TIME_CH.map(([time, t, i, level, pose], k) => {
  const extra = /warm filter/.test(i) ? { filter: 'filter_warm', filterName: 'the Warm filter' } : /lantern/.test(i) ? { prop: 'prop_lantern', propName: 'Paper Lantern' } : /glow stick/.test(i) ? { prop: 'prop_glowstick', propName: 'Glow Stick' } : /Fireflies/.test(i) ? { filter: 'filter_fireflies', filterName: 'Fireflies' } : {};
  return C(`time_${time}_${k}`, t, i, { cat: 'time', icon: { morning: '🌅', afternoon: '☀️', sunset: '🌇', evening: '🌆', night: '🌙' }[time], level, d: 3, pose, req: { ...T(time), ...extra },
    tip: `Available ${TIME[time][2]} (${TIME[time][0]}:00–${TIME[time][1]}:00). Missed it? It's still here tomorrow.` });
});

/* ---- Level 80: Combination challenges (plan the build) */
const COMBO = [
  C('combo_explorer', 'Expedition Photo', 'Explorer outfit + frisbee catch + Jump + a Journey Snap, 85+.', { cat: 'combination', icon: '🧩', level: 80, d: 4, pose: 'jump', req: { outfitSet: 'explorer', outfit: 'set', outfitName: 'an Explorer piece', prop: 'prop_frisbee', propName: 'Frisbee', propAction: 'catch', pose: 'jump', poseName: 'Jump', journey: true } }),
  C('combo_night_glow', 'Midnight Surprise', 'Night + Neon frame + surprised face + a prop interaction.', { cat: 'combination', icon: '🧩', level: 81, d: 4, pose: 'surprised', req: { ...T('night'), pose: 'surprised', poseName: 'Surprised', prop: 'any', propName: 'a prop' } }),
  C('combo_rainy', 'Puddle Jumper', 'Rainy outfit + umbrella + Rain filter + happy pose.', { cat: 'combination', icon: '🧩', level: 82, d: 4, req: { outfitSet: 'rain', outfit: 'set', outfitName: 'a Rainy Day piece', prop: 'prop_umbrella', propName: 'Umbrella', filter: 'filter_rain', filterName: 'Rain Shower', pose: 'happy', poseName: 'Happy' } }),
  C('combo_stage', 'Showtime', 'Spotlight Stage backdrop + Dance + Sparkle effect.', { cat: 'combination', icon: '🧩', level: 83, d: 4, req: { backdrop: 'bg_stage', backdropName: 'Spotlight Stage', pose: 'dance', poseName: 'Dance', filter: 'filter_sparkle', filterName: 'Sparkle' } }),
  C('combo_space', 'Space Cadet', 'Outer Space backdrop + Superhero or Leap + 2 accessories.', { cat: 'combination', icon: '🧩', level: 84, d: 4, req: { backdrop: 'bg_space', backdropName: 'Outer Space', poseAny: ['superhero', 'leap', 'jump'], poseAnyNames: 'Superhero, Leap or Jump', equippedMin: 2 } }),
  C('combo_picnic', 'Perfect Picnic', 'Garden backdrop + donut or cupcake held + Sit Pretty.', { cat: 'combination', icon: '🧩', level: 85, d: 4, req: { backdrop: 'bg_garden', backdropName: 'Flower Garden', prop: 'any', propAction: 'hold', pose: 'sitpretty', poseName: 'Sit Pretty' } }),
  C('combo_sunset_walk', 'Sunset Stroll', 'Sunset + Journey Snap + Warm filter.', { cat: 'combination', icon: '🧩', level: 86, d: 4, req: { ...T('sunset'), journey: true, filter: 'filter_warm', filterName: 'Warm' } }),
  C('combo_rare_vintage', 'Lucky Old Photo', 'A Rare Moment with the Vintage filter.', { cat: 'combination', icon: '🧩', level: 87, d: 5, req: { rare: true, filter: 'filter_vintage', filterName: 'Vintage' } }),
  C('combo_catch_tiny', 'Tiny Athlete', 'A tiny-scale mid-air catch.', { cat: 'combination', icon: '🧩', level: 88, d: 5, size: 'tiny', req: { prop: 'any', propAction: 'catch' }, weights: { timing: 20, scale: 20, creative: 5 } }),
  C('combo_edge_dance', 'Off-Beat', 'An edge-framed Dance with Confetti.', { cat: 'combination', icon: '🧩', level: 89, d: 5, place: 'edge', req: { pose: 'dance', poseName: 'Dance', filter: 'filter_confetti', filterName: 'Confetti' } }),
  C('combo_scholar', 'Library Scholar', 'Library backdrop + storybook + Round Glasses.', { cat: 'combination', icon: '🧩', level: 90, d: 4, req: { backdrop: 'bg_library', backdropName: 'Library', prop: 'prop_book', propName: 'Storybook', outfit: 'face_roundglasses_scholar', outfitName: 'Scholar Round Glasses' } }),
  C('combo_campfire', 'Campfire Stories', 'Evening + Campsite backdrop + lantern held.', { cat: 'combination', icon: '🧩', level: 92, d: 5, req: { ...T('evening'), backdrop: 'bg_campsite', backdropName: 'Campsite', prop: 'prop_lantern', propName: 'Paper Lantern', propAction: 'hold' } }),
];

/* ---- Level 100: Master challenges (sequences, limited assistance, high bar) */
const MASTER = [
  C('master_triple_catch', 'Hat Trick', 'Three perfect catches in a row (80+ each).', { cat: 'mastery', icon: '🏅', level: 100, d: 5, sequence: 3, req: { prop: 'any', propAction: 'catch' }, weights: { timing: 25, creative: 5, pose: 15 }, master: true }),
  C('master_no_assist', 'Unassisted', 'A 90+ portrait with gear bonuses switched off.', { cat: 'mastery', icon: '🏅', level: 100, d: 5, noGear: true, master: true, place: 'center' }),
  C('master_story', 'Photo Story', 'Three photos in one session: morning-style wave, a prop catch, a sleep.', { cat: 'mastery', icon: '🏅', level: 100, d: 5, sequence: 3, req: { poseAny: ['wave', 'catch', 'sleep', 'jump'], poseAnyNames: 'Wave, Catch, Sleep' }, master: true }),
  C('master_rare_five', 'Rare Collector', 'Capture a Rare Moment scoring 90+.', { cat: 'mastery', icon: '🏅', level: 100, d: 5, req: { rare: true }, master: true, weights: { timing: 15, creative: 5 } }),
  C('master_night_master', 'Night Master', 'Night + Neon + Fireflies + Leap, no gear.', { cat: 'mastery', icon: '🏅', level: 101, d: 5, noGear: true, req: { ...T('night'), filter: 'filter_fireflies', filterName: 'Fireflies', pose: 'leap', poseName: 'Agility Leap' }, master: true }),
  C('master_giant_catch', 'Kaiju Catch', 'A giant-scale catch that spills out of the frame.', { cat: 'mastery', icon: '🏅', level: 102, d: 5, size: 'big', req: { prop: 'any', propAction: 'catch' }, master: true }),
  C('master_hide_rare', 'Hidden Treasure', 'A half-hidden Rare Moment.', { cat: 'mastery', icon: '🏅', level: 103, d: 5, partial: true, place: 'edge', req: { rare: true }, master: true }),
  C('master_five_looks', 'Fashion Week', 'Three photos in a row, each in a different outfit.', { cat: 'mastery', icon: '🏅', level: 104, d: 5, sequence: 3, req: { outfit: 'any', outfitName: 'an outfit' }, master: true }),
  C('master_journey_trio', 'Grand Tour', 'Three Journey Snaps in one walk, 85+ each.', { cat: 'mastery', icon: '🏅', level: 105, d: 5, sequence: 3, req: { journey: true }, master: true }),
  C('master_perfect', 'Perfection', 'Score 100 on any challenge-quality photo, no gear.', { cat: 'mastery', icon: '🏅', level: 106, d: 5, noGear: true, master: true }),
];

/* ---- Walking / Journey & Rare */
const JOURNEY = [
  C('journey_first', 'First Journey', 'Your first Journey Snap.', { cat: 'journey', icon: '🥾', level: 4, req: { journey: true } }),
  C('journey_trail', 'Trail Blazer', 'A Journey Snap in the Explorer Hoodie or Cap.', { cat: 'journey', icon: '🥾', level: 18, req: { journey: true, outfitSet: 'explorer', outfit: 'set', outfitName: 'an Explorer piece' } }),
  C('journey_prop', 'Walkies & Toys', 'A Journey Snap with a prop.', { cat: 'journey', icon: '🥾', level: 30, req: { journey: true, prop: 'any' } }),
  C('journey_filter', 'Postcard', 'A Journey Snap with a filter — like a postcard.', { cat: 'journey', icon: '🥾', level: 44, req: { journey: true, filter: 'any', filterName: 'any filter' } }),
  C('rare_first', 'Rare Find', 'Capture your first Rare Moment.', { cat: 'rare', icon: '✨', level: 3, req: { rare: true } }),
  C('rare_prop', 'Lucky Toss', 'A Rare Moment while using a prop.', { cat: 'rare', icon: '✨', level: 36, req: { rare: true, prop: 'any' } }),
];

export const CHALLENGES = [...MISSIONS.map(m => ({ ...m, level: m.level || (m.difficulty >= 3 ? 6 : 1) })), ...FUNDAMENTALS, ...SKILLS, ...PROPS, ...FILTERS, ...TIMES, ...COMBO, ...MASTER, ...JOURNEY];
export const CH_CATEGORIES = ['home', 'outside', 'food', 'selfie', 'creative', 'funny', 'perspective', 'pose', 'seasonal', 'expression', 'composition', 'scale', 'action', 'gear', 'background', 'prop', 'filter', 'time', 'combination', 'mastery', 'journey', 'rare'];
export const challenge = id => CHALLENGES.find(c => c.missionID === id) || null;
export const available = (level, now = new Date()) => CHALLENGES.filter(c => c.isActive && (c.level || 1) <= level && (!c.availableFrom || inWindow(c, now)));
function inWindow(m, d) { const md = String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); return m.availableFrom <= m.availableTo ? md >= m.availableFrom && md <= m.availableTo : md >= m.availableFrom || md <= m.availableTo; }

registerLibrary(CHALLENGES);
