/* PHOTO MISSIONS — data only. One camera screen serves all of them.
   ---------------------------------------------------------------------------
   Fields from the directive: missionID, title, instruction, recommendedPose,
   difficulty, XPReward, coinReward, category, icon, isActive.

   Scoring hints (read by game/score.js, never by UI code):
     size    'any' | 'big' | 'tiny' | 'normal'   pet scale the mission wants
     place   'any' | 'low' | 'edge' | 'center'   where in frame the pet belongs
     partial true -> reward the pet being partly off-frame (hide & seek)
     camera  'back' | 'front'                     the default camera for it
   V1 trusts the player's creativity: nothing verifies a real chair exists.
   Later versions can add scene recognition behind these same fields. */

export const MISSIONS = [
  { missionID: 'first_snap',   title: 'My First PokaSnap', instruction: 'Take your very first photo together!',            recommendedPose: 'happy',     difficulty: 1, XPReward: 60,  coinReward: 20, category: 'starter', icon: '📸', isActive: true, size: 'any',    place: 'any' },
  { missionID: 'take_a_seat',  title: 'Take a Seat',       instruction: 'Make your pet look like it is sitting on a chair.', recommendedPose: 'sit',       difficulty: 1, XPReward: 70,  coinReward: 20, category: 'home',    icon: '🪑', isActive: true, size: 'normal', place: 'center' },
  { missionID: 'couch_potato', title: 'Couch Potato',      instruction: 'Put your pet on the couch for some serious lounging.', recommendedPose: 'lay',    difficulty: 1, XPReward: 70,  coinReward: 20, category: 'home',    icon: '🛋️', isActive: true, size: 'normal', place: 'low' },
  { missionID: 'bedtime',      title: 'Bedtime',           instruction: 'Make your pet look asleep on a bed.',              recommendedPose: 'sleep',     difficulty: 1, XPReward: 70,  coinReward: 20, category: 'home',    icon: '🛏️', isActive: true, size: 'normal', place: 'low' },
  { missionID: 'dinner_time',  title: 'Dinner Time',       instruction: 'Place your pet next to some food. No stealing!',    recommendedPose: 'look',      difficulty: 1, XPReward: 70,  coinReward: 25, category: 'home',    icon: '🍽️', isActive: true, size: 'normal', place: 'low' },
  { missionID: 'tree_hugger',  title: 'Tree Hugger',       instruction: 'Place your pet beside a tree.',                    recommendedPose: 'happy',     difficulty: 2, XPReward: 80,  coinReward: 25, category: 'outside', icon: '🌳', isActive: true, size: 'normal', place: 'edge' },
  { missionID: 'sidewalk_star',title: 'Sidewalk Star',     instruction: 'Strut your pet down a sidewalk like a celebrity.',  recommendedPose: 'wave',      difficulty: 2, XPReward: 80,  coinReward: 25, category: 'outside', icon: '🌟', isActive: true, size: 'normal', place: 'low' },
  { missionID: 'flower_friend',title: 'Flower Friend',     instruction: 'Pose your pet beside some flowers.',               recommendedPose: 'happy',     difficulty: 2, XPReward: 80,  coinReward: 25, category: 'outside', icon: '🌸', isActive: true, size: 'normal', place: 'any' },
  { missionID: 'outside_adv',  title: 'Outside Adventure', instruction: 'Take your pet somewhere outside it has never been.', recommendedPose: 'look',      difficulty: 2, XPReward: 80,  coinReward: 25, category: 'outside', icon: '🗺️', isActive: true, size: 'any',    place: 'any' },
  { missionID: 'pool_day',     title: 'Pool Day',          instruction: 'Make your pet look like it is swimming.',           recommendedPose: 'swim',      difficulty: 2, XPReward: 90,  coinReward: 30, category: 'outside', icon: '🏊', isActive: true, size: 'normal', place: 'low' },
  { missionID: 'hide_seek',    title: 'Hide and Seek',     instruction: 'Hide part of your pet behind something — or off the edge!', recommendedPose: 'surprised', difficulty: 3, XPReward: 100, coinReward: 35, category: 'tricks', icon: '🙈', isActive: true, size: 'normal', place: 'edge', partial: true },
  { missionID: 'big_pet',      title: 'Big Pet',           instruction: 'Use perspective to make your pet look ENORMOUS.',   recommendedPose: 'surprised', difficulty: 3, XPReward: 100, coinReward: 35, category: 'tricks',  icon: '🦖', isActive: true, size: 'big',    place: 'any' },
  { missionID: 'tiny_friend',  title: 'Tiny Friend',       instruction: 'Make your pet look teeny tiny next to something big.', recommendedPose: 'wave',   difficulty: 3, XPReward: 100, coinReward: 35, category: 'tricks',  icon: '🐜', isActive: true, size: 'tiny',   place: 'any' },
  { missionID: 'best_friends', title: 'Best Friends',      instruction: 'Take a selfie with your pet right beside you.',     recommendedPose: 'happy',     difficulty: 2, XPReward: 90,  coinReward: 30, category: 'tricks',  icon: '🤳', isActive: true, size: 'normal', place: 'edge', camera: 'front' },
  { missionID: 'strike_pose',  title: 'Strike a Pose',     instruction: 'Capture your pet mid-JUMP!',                        recommendedPose: 'jump',      difficulty: 3, XPReward: 110, coinReward: 40, category: 'tricks',  icon: '💫', isActive: true, size: 'normal', place: 'center' },
  { missionID: 'window_watch', title: 'Window Watcher',    instruction: 'Pose your pet looking out of a window.',            recommendedPose: 'look',      difficulty: 2, XPReward: 80,  coinReward: 25, category: 'home',    icon: '🪟', isActive: true, size: 'normal', place: 'any' },
  { missionID: 'nap_spot',     title: 'Sunny Nap Spot',    instruction: 'Find a sunny spot for a cozy nap.',                 recommendedPose: 'sleep',     difficulty: 2, XPReward: 80,  coinReward: 25, category: 'home',    icon: '☀️', isActive: true, size: 'normal', place: 'low' },
  { missionID: 'say_hi',       title: 'Say Hi!',           instruction: 'Get your pet waving at someone you love.',          recommendedPose: 'wave',      difficulty: 1, XPReward: 70,  coinReward: 20, category: 'home',    icon: '👋', isActive: true, size: 'normal', place: 'any' },
];

export function mission(id) { return MISSIONS.find(m => m.missionID === id) || MISSIONS[0]; }
export function activeMissions() { return MISSIONS.filter(m => m.isActive); }
