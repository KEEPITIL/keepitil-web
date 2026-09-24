/* BADGES — optional collection goals. Data only; checked by game/companion.js.
   Never required to play. Rewards are coins, and one earns an accessory. */

export const ACHIEVEMENTS = [
  { id: 'first_snap',  name: 'First Snap',     icon: '📸', desc: 'Take your first photo.',                 coins: 10,  test: s => s.progress.snaps >= 1 },
  { id: 'snaps_10',    name: '10 Snaps',       icon: '🎞️', desc: 'Take 10 photos.',                        coins: 30,  item: 'neck_medal', test: s => s.progress.snaps >= 10 },
  { id: 'snaps_50',    name: '50 Snaps',       icon: '🏆', desc: 'Take 50 photos.',                        coins: 100, test: s => s.progress.snaps >= 50 },
  { id: 'pool_day',    name: 'Pool Day',       icon: '🏊', desc: 'Complete Pool Day.',                     coins: 15,  test: s => 'pool_day' in s.progress.missions },
  { id: 'tree_friend', name: 'Tree Friend',    icon: '🌳', desc: 'Complete Tree Hugger.',                  coins: 15,  test: s => 'tree_hugger' in s.progress.missions },
  { id: 'selfie_pro',  name: 'Selfie Pro',     icon: '🤳', desc: 'Score 4,000+ on Best Friends.',          coins: 25,  test: s => (s.progress.missions.best_friends || 0) >= 4000 },
  { id: 'big_pet',     name: 'Big Pet',        icon: '🦖', desc: 'Complete Biggest Pet Ever.',             coins: 15,  test: s => 'big_pet' in s.progress.missions },
  { id: 'tiny_pet',    name: 'Tiny Pet',       icon: '🐜', desc: 'Complete Tiny Friend.',                  coins: 15,  test: s => 'tiny_friend' in s.progress.missions },
  { id: 'fashion',     name: 'Fashion Star',   icon: '👑', desc: 'Snap a photo wearing two accessories.',  coins: 25,  test: (s, c) => (c?.equippedCount || 0) >= 2 },
  { id: 'skills_5',    name: 'Star Student',   icon: '🎓', desc: 'Know 5 more tricks than on day one.',    coins: 50,  test: s => (s.skills?.learned || []).length >= 10 },
  { id: 'streak_3',    name: '3 Day Friends',  icon: '🔥', desc: 'Play 3 days in a row.',                  coins: 20,  test: s => (s.streak?.best || 0) >= 3 },
  { id: 'streak_7',    name: '7 Day Friends',  icon: '💖', desc: 'Play 7 days in a row.',                  coins: 50,  test: s => (s.streak?.best || 0) >= 7 },
];
