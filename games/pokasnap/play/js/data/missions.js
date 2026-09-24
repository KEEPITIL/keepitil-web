/* PHOTO MISSIONS — data only. One camera screen serves all of them.
   ---------------------------------------------------------------------------
   Fields: missionID, title, instruction, recommendedPose, difficulty,
   XPReward, coinReward, category, icon, isActive, tip.

   Scoring hints (read by game/score.js, never by UI code):
     size    'any' | 'big' | 'tiny' | 'normal'   pet scale the mission wants
     place   'any' | 'low' | 'edge' | 'center'   where in frame the pet belongs
     partial true -> reward the pet being partly off-frame (hide & seek)
     camera  'back' | 'front'                     the default camera for it
     outfit  true -> the mission is about wearing something
     anySkill true -> any TRAINED trick counts as the right pose
   Creative missions (big / tiny / partial / edge) are scored on their intent:
   overflowing the frame is not "bad framing" when that is the point.
   availableFrom/availableTo (MM-DD, inclusive, local date) make a mission
   seasonal. V1 trusts the player's creativity: nothing verifies a real chair. */

export const CATEGORIES = [
  { id: 'home', name: 'Home', icon: '🏠' }, { id: 'outside', name: 'Outside', icon: '🌳' },
  { id: 'funny', name: 'Funny', icon: '🤪' }, { id: 'creative', name: 'Creative', icon: '🎨' },
  { id: 'selfie', name: 'Selfie', icon: '🤳' }, { id: 'food', name: 'Food', icon: '🍽️' },
  { id: 'perspective', name: 'Perspective', icon: '🔭' }, { id: 'pose', name: 'Pose', icon: '💫' },
  { id: 'seasonal', name: 'Seasonal', icon: '🍂' },
];

const M = (missionID, title, instruction, recommendedPose, difficulty, XPReward, coinReward, category, icon, tip, hints = {}) =>
  ({ missionID, title, instruction, recommendedPose, difficulty, XPReward, coinReward, category, icon, tip, isActive: true, size: 'normal', place: 'any', ...hints });

export const MISSIONS = [
  M('first_snap',    'My First PokaSnap', 'Take your very first photo together!',               'happy',     1, 60,  20, 'home',        '📸', 'Any photo counts — just keep your pet in the frame!', { size: 'any' }),
  M('take_a_seat',   'Take a Seat',       'Make your pet look like it is sitting on a chair.',   'sit',       1, 70,  20, 'home',        '🪑', 'Line the paws up with the seat so it looks real.', { place: 'center' }),
  M('couch_potato',  'Couch Potato',      'Put your pet on the couch for some serious lounging.', 'lay',      1, 70,  20, 'home',        '🛋️', 'Lay Down + low in the frame = maximum lounging.', { place: 'low' }),
  M('bedtime',       'Bedtime',           'Make your pet look asleep on a bed.',                 'sleep',     1, 70,  20, 'home',        '🛏️', 'Tuck them near a pillow.', { place: 'low' }),
  M('dinner_time',   'Dinner Time',       'Place your pet next to some food. No stealing!',      'look',      1, 70,  25, 'food',        '🍽️', 'Put the food right beside the paws.', { place: 'low' }),
  M('chef_helper',   'Chef\'s Helper',    'Pose your pet in the kitchen, ready to help cook.',   'happy',     1, 70,  25, 'food',        '👩‍🍳', 'A spoon or a pan in the shot sells it.', { place: 'low' }),
  M('tree_hugger',   'Tree Hugger',       'Place your pet beside a tree.',                       'happy',     2, 80,  25, 'outside',     '🌳', 'Put the tree on one side and your pet on the other third.', { place: 'edge' }),
  M('sidewalk_star', 'Sidewalk Star',     'Strut your pet down a sidewalk like a celebrity.',    'wave',      2, 80,  25, 'outside',     '🌟', 'Low angle, like a red carpet.', { place: 'low' }),
  M('flower_friend', 'Flower Friend',     'Pose your pet beside some flowers.',                  'happy',     2, 80,  25, 'outside',     '🌸', 'Get close to the petals.'),
  M('outside_adv',   'Outside Adventure', 'Take your pet somewhere outside it has never been.',  'look',      2, 80,  25, 'outside',     '🗺️', 'Show off the view behind your pet.', { size: 'any' }),
  M('road_trip',     'Road Trip',         'Take a photo with your pet in or near a car.',        'look',      2, 80,  25, 'outside',     '🚗', 'A window seat is the classic road-trip shot.'),
  M('pool_day',      'Pool Day',          'Make your pet look like it is swimming.',              'swim',      2, 90,  30, 'outside',     '🏊', 'Water line at the bottom of the frame looks best.', { place: 'low' }),
  M('window_watch',  'Window Watcher',    'Pose your pet looking out of a window.',              'look',      2, 80,  25, 'home',        '🪟', 'Sunlight behind your pet makes a lovely glow.'),
  M('nap_spot',      'Sunny Nap Spot',    'Find a sunny spot for a cozy nap.',                   'sleep',     2, 80,  25, 'home',        '☀️', 'Cozy = low and snug in the frame.', { place: 'low' }),
  M('movie_night',   'Movie Night',       'Put your pet beside the TV for movie night.',         'sit',       1, 70,  25, 'home',        '🍿', 'Sit your pet on the couch facing the screen.', { place: 'low' }),
  M('desk_buddy',    'Desk Buddy',        'Put your pet at a desk, ready to work.',              'look',      1, 70,  25, 'home',        '💻', 'Next to a keyboard or a notebook is perfect.', { place: 'center' }),
  M('good_morning',  'Good Morning',      'Create a cheerful morning photo.',                    'wave',      1, 70,  25, 'home',        '🌅', 'Breakfast, sunshine or a sleepy yawn!'),
  M('say_hi',        'Say Hi!',           'Get your pet waving at someone you love.',            'wave',      1, 70,  20, 'selfie',      '👋', 'Put your pet on one side of the person.'),
  M('best_friends',  'Best Friends',      'Take a selfie with your pet right beside you.',       'happy',     2, 90,  30, 'selfie',      '🤳', 'Your face on one side, your pet on the other.', { place: 'edge', camera: 'front' }),
  M('mirror_mirror', 'Mirror Mirror',     'Take a creative mirror shot with your pet.',          'surprised', 2, 90,  30, 'creative',    '🪞', 'Tap ↔️ to flip your pet for a perfect reflection.', { camera: 'front' }),
  M('pet_fashion',   'Pet Fashion',       'Snap your pet wearing an accessory.',                 'happy',     1, 80,  30, 'creative',    '👒', 'Dress up in the Closet first — two items earn extra points.', { outfit: true }),
  M('hide_seek',     'Hide and Seek',     'Hide part of your pet behind something — or off the edge!', 'surprised', 3, 100, 35, 'funny', '🙈', 'About half hidden is the sweet spot.', { place: 'edge', partial: true }),
  M('big_pet',       'Biggest Pet Ever',  'Use perspective to make your pet look ENORMOUS.',     'surprised', 3, 100, 35, 'perspective', '🦖', 'Pinch out until your pet towers over everything. Spilling off the edge is fine!', { size: 'big' }),
  M('tiny_friend',   'Tiny Friend',       'Make your pet look teeny tiny next to something big.', 'wave',     3, 100, 35, 'perspective', '🐜', 'Pinch in and place your pet next to something huge.', { size: 'tiny' }),
  M('strike_pose',   'Strike a Pose',     'Capture your pet mid-JUMP!',                          'jump',      3, 110, 40, 'pose',        '💫', 'Teach Jump in Train to unlock this pose.', { place: 'center' }),
  M('dance_party',   'Dance Party',       'Snap your pet dancing!',                              'dance',     3, 110, 40, 'pose',        '🪩', 'Teach Dance in Train, then turn the music up.', { place: 'center' }),
  M('skill_shot',    'Skill Shot',        'Show off a trick your pet learned in Train.',         'jump',      3, 110, 40, 'pose',        '🎓', 'Any trained trick counts: Jump, Dance, Spin, Wink or High Five.', { anySkill: true }),
  M('fall_leaves',   'Falling Leaves',    'Pose your pet in autumn leaves.',                     'happy',     2, 90,  35, 'seasonal',    '🍂', 'Leaves at the bottom of the frame look cozy.', { place: 'low', availableFrom: '09-15', availableTo: '11-30' }),
];

export function mission(id) { return MISSIONS.find(m => m.missionID === id) || MISSIONS[0]; }

function inWindow(m, d) {
  if (!m.availableFrom) return true;
  const md = String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return m.availableFrom <= m.availableTo ? md >= m.availableFrom && md <= m.availableTo : md >= m.availableFrom || md <= m.availableTo;
}
export function activeMissions(now = new Date()) { return MISSIONS.filter(m => m.isActive && inWindow(m, now)); }
export function category(id) { return CATEGORIES.find(c => c.id === id) || CATEGORIES[0]; }
