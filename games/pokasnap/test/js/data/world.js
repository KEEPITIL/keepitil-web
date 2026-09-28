/* POKA WORLD (1.4) — the data that connects PokaSnap's systems into one life.
   ---------------------------------------------------------------------------
   LIVE LIFE → CARE / WALK / PLAY / TRAIN / EXPLORE → PETS REACT → RELATIONSHIPS
   → NEW MOMENTS → SNAP → SCORE / STARS / DISCOVERY → JOURNAL → EARN → GROW → REPEAT

   Everything here is data. Logic lives in game/world.js (Homeland, relationships,
   Journal, projects, League, neglect), game/chapters.js (chapters, certifications,
   novelty XP). Every number is tunable and simulated in tools/sim/simulate.mjs. */

/* ================================================================ CHAPTERS */
export const CHAPTERS = [
  { n: 1,  from: 1,  to: 10,  id: 'my_poka',     name: 'My Poka',              feel: 'I got a cute pet.',                        milestone: { level: 10,  name: 'Poka Journal',                     unlocks: ['journal'] } },
  { n: 2,  from: 11, to: 20,  id: 'life',        name: 'Life Together',        feel: 'My pet participates in my life.',          milestone: { level: 20,  name: 'Prop Play & Multi-Pet Life',       unlocks: ['props', 'multi_pet_photo', 'second_pet'] } },
  { n: 3,  from: 21, to: 30,  id: 'adventures',  name: 'Poka Adventures',      feel: 'There are things to discover.',            milestone: { level: 30,  name: 'Poka Homeland & Community Hub',    unlocks: ['homeland_hub', 'community'] } },
  { n: 4,  from: 31, to: 40,  id: 'pack',        name: 'My Pack',              feel: 'I have a pack.',                           milestone: { level: 40,  name: 'Creative Camera & Advanced Composition', unlocks: ['filters', 'third_pet'] } },
  { n: 5,  from: 41, to: 50,  id: 'community',   name: 'Build a Community',    feel: 'They have a home.',                        milestone: { level: 50,  name: 'Community Photographer Certification', unlocks: ['revival_treat_1', 'roles'], cert: 'cert50' } },
  { n: 6,  from: 51, to: 60,  id: 'living',      name: 'Living World',         feel: 'Their world changes.',                     milestone: { level: 60,  name: 'Time Adventures',                  unlocks: ['time', 'living_world'], cert: 'cert60' } },
  { n: 7,  from: 61, to: 70,  id: 'specialists', name: 'Specialists',          feel: 'My pets have developed specialties.',      milestone: { level: 70,  name: 'Poka League',                      unlocks: ['league'], cert: 'cert70' } },
  { n: 8,  from: 71, to: 80,  id: 'advanced',    name: 'Advanced Adventure',   feel: "I'm solving advanced photographic adventures.", milestone: { level: 80, name: 'Advanced / Combination Certification', unlocks: ['combo'], cert: 'cert80' } },
  { n: 9,  from: 81, to: 90,  id: 'master_adv',  name: 'Master Adventures',    feel: 'My community has its own stories.',        milestone: { level: 90,  name: 'Legacy Journey',                   unlocks: ['legacy'], cert: 'cert90' } },
  { n: 10, from: 91, to: 100, id: 'legacy',      name: 'Legacy',               feel: "I've built a history with these pets.",    milestone: { level: 100, name: 'Master Photographer',              unlocks: ['master', 'mastery', 'revival_treat_2'], cert: 'cert100' } },
];
/* 1.5: every 10th level is a MAJOR milestone with one consistent presentation (Echo: 30/50/70/90 read as minor). */
export const MILESTONES = {
  10:  { icon: '📔', color: '#ff6b8b', headline: 'Poka Journal',               change: 'Every photo now becomes a discovery in your Journal.', can: ['Fill a Journal page for each species', 'Earn Journal milestone rewards', 'Start each pet’s Life Album'], world: 'Your pet’s story starts being written down.' },
  20:  { icon: '🎾', color: '#f2a93b', headline: 'Prop Play & Multi-Pet Life',  change: 'Props come alive in the camera, and your pets can pose together.', can: ['Toss, catch and hold props', 'Take group photos with your pack', 'Unlock Prop Play challenges'], world: 'Your companions now appear beside you at home.' },
  30:  { icon: '🏡', color: '#5fb84a', headline: 'Poka Homeland & Community Hub', change: 'Your pets have a home of their own, where they live without you.', can: ['Explore all 8 Homeland locations', 'Place objects and solve photo puzzles', 'Join Community Projects'], world: 'The Homeland opens: your pets play, nap and make friends on their own.' },
  40:  { icon: '🎞️', color: '#5ec8f2', headline: 'Creative Camera & Advanced Composition', change: 'Filters and effects join the camera, and missions start asking for them.', can: ['Use warm, vintage, dreamy, snow and sparkle looks', 'Take on filter and effect missions', 'Compose trickier shots for higher scores'], world: 'Your photos can now look like postcards, films or dreams.' },
  50:  { icon: '🏅', color: '#e0a800', headline: 'Community Photographer',     change: 'You are certified, and your pets take on roles in the community.', can: ['Wear the Community Photographer title', 'Give pets community roles', 'Hold your first Revival Treat'], world: 'Neighbours recognise your pack — roles appear on the pet cards.' },
  60:  { icon: '🌅', color: '#ff8a5c', headline: 'Living World & Time Adventures', change: 'Morning, sunset and night change what you can photograph.', can: ['Play time-of-day missions', 'Catch night-only moments', 'See the Homeland change through the day'], world: 'The world keeps time: light, moments and behaviour follow the clock.' },
  70:  { icon: '🏆', color: '#a98bf0', headline: 'Specialists & Poka League',  change: 'Your pets have specialties, and the Poka League opens.', can: ['Enter League events (fair, gear-free)', 'Grow each pet’s specialty', 'Earn League placements'], world: 'A League button joins your Home screen, next to your chapter.' },
  80:  { icon: '🧩', color: '#2fa8d8', headline: 'Advanced Certification',     change: 'Combination challenges: outfit + prop + pose + place, planned together.', can: ['Solve combination challenges', 'Earn the Advanced Photographer title', 'Plan multi-step shots'], world: 'Harder, richer photo adventures open up.' },
  90:  { icon: '📜', color: '#b5452b', headline: 'Legacy Journey',             change: 'Your pack’s history becomes part of the game.', can: ['Start the Legacy Journey', 'Revisit your pets’ life stories', 'Prepare for the Master certification'], world: 'Your Life Albums and Journal start to tell a longer story.' },
  100: { icon: '👑', color: '#d4a017', headline: 'Master Photographer',        change: 'You have mastered PokaSnap — and it keeps going.', can: ['Wear the Master Photographer title', 'Earn Mastery ranks forever', 'Hold a second Revival Treat'], world: 'A Master monument now stands in your Homeland.' },
};
export const chapterFor = L => CHAPTERS.find(c => L >= c.from && L <= c.to) || CHAPTERS[CHAPTERS.length - 1];

/* Level-100 rewards (earn-only; prestige items are in the catalog). */
export const LEVEL100_REWARDS = { title: 'Master Photographer', item: 'pose_master', frame: 'frame_master', monument: 'monument_master', revivalTreat: 1 };

/* ================================================================ CERTIFICATIONS
   XP is necessary but not sufficient from level 50. Reaching the XP for level L
   while its certification is incomplete holds the player at L-1 (XP still banks).
   Each certification lists PATHS; any `need` of them qualify, so no single playstyle
   is forced. Counters are computed from real save state (game/chapters.js). */
export const CERTS = {
  cert50:  { level: 50,  name: 'Community Photographer', need: 3, paths: [
    { id: 'stars100', text: 'Collect 100 stars', test: { stars: 100 } },
    { id: 'journal20', text: 'Record 20 Journal discoveries', test: { journal: 20 } },
    { id: 'project1', text: 'Complete a Community Project', test: { projects: 1 } },
    { id: 'rank3x3', text: 'Reach Academy rank 3 in three disciplines', test: { ranksAtLeast: [3, 3] } },
    { id: 'friends1', text: 'Two pets become Friends', test: { relation: 'friend' } },
    { id: 'journeys10', text: 'Take 10 Journey Snaps', test: { journeys: 10 } },
  ] },
  cert60:  { level: 60,  name: 'Living World', need: 3, paths: [
    { id: 'homeland5', text: 'Photograph in 5 Homeland locations', test: { locations: 5 } },
    { id: 'rare10', text: 'Capture 10 Rare Moments', test: { rares: 10 } },
    { id: 'five5', text: 'Earn 5 five-star photos', test: { fiveStars: 5 } },
    { id: 'puzzle2', text: 'Solve 2 photographic puzzles', test: { puzzles: 2 } },
    { id: 'life30', text: 'Complete 30 Poka Life adventures', test: { lifeAdv: 30 } },
  ] },
  cert70:  { level: 70,  name: 'Specialist', need: 3, paths: [
    { id: 'rank6x2', text: 'Reach Academy rank 6 in two disciplines', test: { ranksAtLeast: [6, 2] } },
    { id: 'bestfriend', text: 'Two pets become Best Friends', test: { relation: 'best_friend' } },
    { id: 'journal45', text: 'Record 45 Journal discoveries', test: { journal: 45 } },
    { id: 'collections3', text: 'Complete 3 photo collections', test: { collections: 3 } },
    { id: 'projects2', text: 'Complete 2 Community Projects', test: { projects: 2 } },
  ] },
  cert80:  { level: 80,  name: 'Advanced Photographer', need: 4, paths: [
    { id: 'five15', text: 'Earn 15 five-star photos', test: { fiveStars: 15 } },
    { id: 'rank8', text: 'Reach Academy rank 8 in any discipline', test: { ranksAtLeast: [8, 1] } },
    { id: 'relation3', text: 'Form 3 relationships', test: { relations: 3 } },
    { id: 'projects3', text: 'Complete 3 Community Projects', test: { projects: 3 } },
    { id: 'legendary1', text: 'Capture a Legendary moment', test: { legendary: 1 } },
    { id: 'journeys40', text: 'Take 40 Journey Snaps', test: { journeys: 40 } },
    { id: 'league3', text: 'Place top 3 in a Poka League event', test: { leagueTop3: 1 } },
  ] },
  cert90:  { level: 90,  name: 'Legacy Journey', need: 4, paths: [
    { id: 'journal80', text: 'Record 80 Journal discoveries', test: { journal: 80 } },
    { id: 'album25', text: 'Reach 25 Life Album milestones across your pets', test: { albumMilestones: 25 } },
    { id: 'puzzle6', text: 'Solve 6 photographic puzzles', test: { puzzles: 6 } },
    { id: 'honors10', text: 'Earn 10 Photo Honor tiers', test: { honorTiers: 10 } },
    { id: 'stars400', text: 'Collect 400 stars', test: { stars: 400 } },
    { id: 'combo5', text: 'Clear 5 Combination challenges', test: { combos: 5 } },
  ] },
  cert100: { level: 100, name: 'Master Photographer', need: 5, paths: [
    { id: 'master3', text: 'Clear 3 Master challenges', test: { masters: 3 } },
    { id: 'rank10', text: 'Reach Master rank (10) in any Academy discipline', test: { ranksAtLeast: [10, 1] } },
    { id: 'stars500', text: 'Collect 500 stars', test: { stars: 500 } },
    { id: 'journal120', text: 'Record 120 Journal discoveries', test: { journal: 120 } },
    { id: 'legendary3', text: 'Capture 3 Legendary moments', test: { legendary: 3 } },
    { id: 'projects5', text: 'Complete 5 Community Projects', test: { projects: 5 } },
    { id: 'league1', text: 'Win a Poka League event', test: { leagueWins: 1 } },
  ] },
};

/* ================================================================ PETS / PACK */
export const PACK = { maxActive: 3, maxResidents: 5, secondPetLevel: 15, thirdActiveLevel: 35, multiPhotoLevel: 20 };

/* ================================================================ RELATIONSHIPS
   Points 0-100 per pair. A type is reached at a threshold AND a flavour decided
   by how the points were earned (play → friend, training → partner, rivalry from
   competitive play, mentor when rank gap ≥ 3). Types change BEHAVIOUR (see
   game/world.js pickBehavior) and unlock duo photos, poses and Journal entries. */
export const RELATION_TYPES = {
  acquainted:       { name: 'Getting to know', icon: '👋', at: 0 },
  friend:           { name: 'Friends',          icon: '🤝', at: 25, behaviors: ['play_together', 'share_toy'] },
  best_friend:      { name: 'Best Friends',     icon: '💞', at: 60, behaviors: ['cuddle', 'comfort', 'share_toy', 'play_together'] },
  adventure_buddy:  { name: 'Adventure Buddies', icon: '🥾', at: 40, behaviors: ['explore_together', 'sniff_together'] },
  training_partner: { name: 'Training Partners', icon: '🎓', at: 40, behaviors: ['practice_together'] },
  playful_rival:    { name: 'Playful Rivals',   icon: '⚡', at: 35, behaviors: ['race', 'tug', 'chase'] },
  mentor:           { name: 'Mentor & Student', icon: '📚', at: 45, behaviors: ['teach'] },
};
export const RELATION_GAIN = { play: 3, walk: 4, train: 3, meal: 2, photo: 1, rival: 3, care: 1 };

/* ================================================================ HOMELAND */
export const LOCATIONS = [
  { id: 'living_room',   name: 'Living Room',     icon: '🛋️', level: 1,  scene: 'homeland_living',   objects: ['couch', 'pillow', 'blanket', 'yarn', 'cardboard_box'] },
  { id: 'backyard',      name: 'Backyard',        icon: '🌳', level: 21, scene: 'homeland_backyard', objects: ['ball', 'frisbee', 'tent', 'planter', 'squeaky'] },
  { id: 'playground',    name: 'Playground',      icon: '🛝', level: 22, scene: 'homeland_playground', objects: ['bubble_machine', 'beach_ball', 'ball', 'kite'] },
  { id: 'garden',        name: 'Garden',          icon: '🌷', level: 24, scene: 'homeland_garden',   objects: ['planter', 'picnic_mat', 'birthday_cake', 'glow_ball'] },
  { id: 'kitchen',       name: 'Kitchen',         icon: '🍳', level: 25, scene: 'homeland_kitchen',        objects: ['food_bowl', 'puzzle_feeder', 'birthday_cake'] },
  { id: 'training_yard', name: 'Training Yard',   icon: '🎯', level: 27, scene: 'homeland_training', objects: ['ball', 'squeaky', 'camera_tripod'] },
  { id: 'photo_studio',  name: 'Photo Studio',    icon: '📷', level: 28, scene: 'homeland_studio',   objects: ['camera_tripod', 'pillow', 'scratching_post'] },
  { id: 'adventure_gate', name: 'Adventure Gate', icon: '⛩️', level: 30, scene: 'homeland_gate',     objects: ['tent', 'kite', 'frisbee'] },
];
export const TIMES_OF_DAY = [ // local clock only, no GPS
  { id: 'morning', from: 6, to: 11, tint: 'rgba(255,220,160,.14)' }, { id: 'day', from: 11, to: 17, tint: null },
  { id: 'sunset', from: 17, to: 20, tint: 'rgba(255,120,60,.22)' }, { id: 'evening', from: 20, to: 22, tint: 'rgba(70,60,140,.30)' },
  { id: 'night', from: 22, to: 6, tint: 'rgba(20,24,70,.46)' },
];

/* ================================================================ INTERACTIVE OBJECTS
   Each defines where it lives, who uses it, the behaviour it triggers (a real
   distinct pose), its photo opportunity, and its Rare/relationship potential.
   `prop` links to a catalog prop whose art is reused. */
export const OBJECTS = {
  ball:           { name: 'Ball',            prop: 'prop_ball',     pets: 'all',  behavior: 'chase',   pose: 'catch',     photo: 'Mid-chase action', rare: 0.05, duo: 'race' },
  frisbee:        { name: 'Frisbee',         prop: 'prop_frisbee',  pets: ['dog_golden', 'dog_small'], behavior: 'catch', pose: 'leap', photo: 'Airborne catch', rare: 0.06, duo: 'race' },
  yarn:           { name: 'Yarn',            prop: 'prop_yarn',     pets: ['cat_fluffy', 'cat_short'], behavior: 'bat', pose: 'roll', photo: 'Tangled paws', rare: 0.08, duo: 'tug' },
  squeaky:        { name: 'Squeaky Toy',     prop: 'prop_squeaky',  pets: 'all',  behavior: 'squeak',  pose: 'surprised', photo: 'Squeak surprise', rare: 0.04 },
  bubble_machine: { name: 'Bubble Machine',  prop: 'prop_bubbles',  pets: 'all',  behavior: 'chase',   pose: 'jump',      photo: 'Bubble pop', rare: 0.07, duo: 'chase' },
  blanket:        { name: 'Blanket',         prop: 'prop_plush', art: { draw: 'obj_blanket', color: '#8fc3ff', trim: '#fff3c4' },    pets: 'all',  behavior: 'nap',     pose: 'sleep',     photo: 'Cozy nap', rare: 0.05, duo: 'cuddle' },
  pillow:         { name: 'Pillow',          prop: 'prop_plush', art: { draw: 'obj_pillow', color: '#ffc8d8', trim: '#ff8fb1' },    pets: 'all',  behavior: 'nap',     pose: 'sleepyroll', photo: 'Pillow flop', rare: 0.04 },
  picnic_mat:     { name: 'Picnic Mat',      prop: 'prop_donut',    pets: 'all',  behavior: 'gather',  pose: 'sitpretty', photo: 'Picnic gathering', rare: 0.06, duo: 'share_toy' },
  food_bowl:      { name: 'Food Bowl',       prop: 'prop_treat',    pets: 'all',  behavior: 'eat',     pose: 'happy',     photo: 'Meal time', rare: 0.03 },
  puzzle_feeder:  { name: 'Puzzle Feeder',   prop: 'prop_box',      pets: 'all',  behavior: 'solve',   pose: 'sniff',     photo: 'Clever snack', rare: 0.05 },
  cardboard_box:  { name: 'Cardboard Box',   prop: 'prop_box',      pets: 'all',  behavior: 'hide',    pose: 'peek',      photo: 'Box peek', rare: 0.07 },
  scratching_post:{ name: 'Scratching Post', prop: 'prop_stick',    pets: ['cat_fluffy', 'cat_short'], behavior: 'stretch', pose: 'stretch', photo: 'Big stretch', rare: 0.04 },
  couch:          { name: 'Couch',           prop: 'prop_plush', art: { draw: 'obj_couch', color: '#c98a5e', trim: '#f4e4c1' },    pets: 'all',  behavior: 'lounge',  pose: 'lay',       photo: 'Couch potato', rare: 0.03, duo: 'cuddle' },
  tent:           { name: 'Tent',            prop: 'prop_lantern',  pets: 'all',  behavior: 'explore', pose: 'look',      photo: 'Campout', rare: 0.05, duo: 'explore_together' },
  planter:        { name: 'Planter',         prop: 'prop_wateringcan', pets: 'all', behavior: 'dig',   pose: 'sniff',     photo: 'Garden helper', rare: 0.05 },
  beach_ball:     { name: 'Beach Ball',      prop: 'prop_beachball', pets: 'all', behavior: 'bounce',  pose: 'jump',      photo: 'Beach bounce', rare: 0.05, duo: 'race' },
  birthday_cake:  { name: 'Birthday Cake',   prop: 'prop_cupcake',  pets: 'all',  behavior: 'celebrate', pose: 'dance',   photo: 'Party time', rare: 0.06, duo: 'share_toy' },
  camera_tripod:  { name: 'Camera Tripod',   prop: 'prop_toycamera', pets: 'all', behavior: 'pose',    pose: 'superhero', photo: 'Self-portrait', rare: 0.04 },
  kite:           { name: 'Kite',            prop: 'prop_kite',     pets: 'all',  behavior: 'chase',   pose: 'leap',      photo: 'Kite chase', rare: 0.06 },
  glow_ball:      { name: 'Glowing Ball',    prop: 'prop_glowstick', pets: 'all', behavior: 'chase',   pose: 'catch',     photo: 'Night glow chase', rare: 0.10, night: true },
  music_box:      { name: 'Music Box',       prop: 'prop_guitar',   pets: 'all',  behavior: 'perform', pose: 'dance',     photo: 'Performance', rare: 0.06, duo: 'dance_together' },
};

/* ================================================================ AUTONOMOUS BEHAVIOURS
   Lightweight state machine: each tick a pet picks weighted behaviour from its
   personality, needs, location objects and relationships. No AI inference. */
export const BEHAVIORS = {
  wander: { pose: 'idle', weight: 3 }, sit: { pose: 'sit', weight: 2 }, nap: { pose: 'sleep', weight: 1 },
  investigate: { pose: 'sniff', weight: 2 }, look_around: { pose: 'look', weight: 2 }, stretch: { pose: 'stretch', weight: 1 },
  practice: { pose: 'jump', weight: 1 }, groom: { pose: 'wink', weight: 1 },
  // with objects / pets
  use_object: { pose: null, weight: 3 }, visit_pet: { pose: 'wave', weight: 2 },
  play_together: { pose: 'jump', duo: true }, share_toy: { pose: 'sitpretty', duo: true }, cuddle: { pose: 'sleep', duo: true },
  comfort: { pose: 'heart', duo: true }, race: { pose: 'leap', duo: true }, tug: { pose: 'catch', duo: true }, chase: { pose: 'leap', duo: true },
  explore_together: { pose: 'look', duo: true }, sniff_together: { pose: 'sniff', duo: true }, practice_together: { pose: 'salute', duo: true },
  teach: { pose: 'wave', duo: true }, dance_together: { pose: 'dance', duo: true },
};

/* ================================================================ PHOTOGRAPHIC PUZZLES (3-hint rule) */
export const PUZZLES = [
  { id: 'yarn_tangle', name: 'The Great Tangle', location: 'living_room', needs: { object: 'yarn', petState: 'sleepy', species: ['cat_fluffy', 'cat_short'] },
    reward: { journal: 'yarn_tangle', rarity: 'rare' },
    hints: ['Something soft and colourful might wake a sleepy kitty…', 'A sleepy cat seems curious about the yarn.', 'Place the Yarn in the Living Room while your cat is napping, then snap.'] },
  { id: 'rival_race', name: 'Photo Finish', location: 'backyard', needs: { object: 'ball', relation: 'playful_rival' },
    reward: { journal: 'rival_race', rarity: 'rare' },
    hints: ['Two competitive friends and one ball… who gets there first?', 'Playful Rivals love a race.', 'With two Playful Rivals in the Backyard, place the Ball and snap the race.'] },
  { id: 'picnic_gather', name: 'Picnic Party', location: 'garden', needs: { object: 'picnic_mat', pets: 2 },
    reward: { journal: 'picnic_gather', rarity: 'uncommon' },
    hints: ['A place to sit and share might bring everyone together.', 'Pets gather around a picnic in the Garden.', 'Bring two pets to the Garden and place the Picnic Mat.'] },
  { id: 'performer', name: 'Encore!', location: 'photo_studio', needs: { object: 'music_box', specialty: 'performer' },
    reward: { journal: 'performer', rarity: 'rare' },
    hints: ['Some pets were born for the spotlight…', 'A Performer reacts to music.', 'Place the Music Box in the Photo Studio with a pet whose specialty is Performer.'] },
  { id: 'lesson', name: 'First Lesson', location: 'training_yard', needs: { relation: 'mentor' },
    reward: { journal: 'lesson', rarity: 'rare' },
    hints: ['Experience likes to share what it knows.', 'A Mentor may teach a Student in the right place.', 'Bring a Mentor & Student pair to the Training Yard.'] },
  { id: 'bubble_chase', name: 'Bubble Storm', location: 'playground', needs: { object: 'bubble_machine' },
    reward: { journal: 'bubble_chase', rarity: 'uncommon' },
    hints: ['The Playground has a machine that makes something floaty…', 'Pets love chasing bubbles.', 'Place the Bubble Machine in the Playground and snap the chase.'] },
  { id: 'night_glow', name: 'Garden Glow', location: 'garden', needs: { object: 'glow_ball', time: ['evening', 'night'] },
    reward: { journal: 'night_glow', rarity: 'legendary' },
    hints: ['Something unusual happens around the garden at night…', 'Your pet seems interested in the glowing toy.', 'Place the Glowing Ball in the Garden after sunset.'] },
  { id: 'comfort', name: 'A Gentle Paw', location: 'living_room', needs: { relation: 'best_friend', petState: 'lonely' },
    reward: { journal: 'comfort', rarity: 'legendary' },
    hints: ['True friends notice when someone needs a hug.', 'A Best Friend comforts a pet who is feeling down.', 'When one pet feels lonely, bring its Best Friend to the Living Room.'] },
];
export const HINT_AFTER = [0, 3, 6];   // failed attempts before hint 2 / hint 3

/* ================================================================ POKA LIFE */
export const LIFE_ADVENTURES = [
  { id: 'walk',    name: 'Walk With Poka',    icon: '🥾', text: 'A walk together (Health steps optional, or a timed walk).' },
  { id: 'eat',     name: 'Eat With Poka',     icon: '🍽️', text: 'Snap your meal with your pet, then share a virtual treat. No food analysis.' },
  { id: 'focus',   name: 'Focus With Poka',   icon: '⏳', text: 'A 15 / 25 / 45 minute focus timer; your pet studies alongside you.', minutes: [15, 25, 45] },
  { id: 'play',    name: 'Play With Poka',    icon: '🎾', text: 'Play with a toy in the Homeland.' },
  { id: 'train',   name: 'Train With Poka',   icon: '🎓', text: 'Clear any Academy node.' },
  { id: 'evening', name: 'Evening With Poka', icon: '🌙', text: 'Say goodnight in the evening (after 6 pm).' },
  { id: 'journey', name: 'Journey Snap',      icon: '📸', text: 'Take a Journey Snap.' },
];
export const LIFE_GOAL = { any: 3, bonusXP: 120, bond: 6 };   // "complete ANY 3 today"

/* ================================================================ COMMUNITY PROJECTS (no currency) */
export const PROJECTS = [
  { id: 'community_garden', name: 'Community Garden',  level: 30, goal: 100, unlocks: { location: 'garden', facility: 'garden_beds' },
    weights: { walk: 6, train: 4, meal: 3, journey: 4, five_star: 5, care: 1 } },
  { id: 'playground_build', name: 'Build the Playground', level: 32, goal: 120, unlocks: { facility: 'slide', object: 'bubble_machine' },
    weights: { play: 5, walk: 4, photo: 1, five_star: 4 } },
  { id: 'community_kitchen', name: 'Community Kitchen', level: 38, goal: 120, unlocks: { facility: 'kitchen_table', object: 'birthday_cake' },
    weights: { meal: 6, care: 2, five_star: 3 } },
  { id: 'workshop',        name: 'The Workshop',      level: 44, goal: 150, unlocks: { facility: 'workshop', object: 'camera_tripod' },
    weights: { train: 5, five_star: 4, journey: 3 } },
  { id: 'studio_upgrade',  name: 'Photo Studio Lights', level: 48, goal: 150, unlocks: { facility: 'studio_lights', object: 'music_box' },
    weights: { photo: 1, five_star: 6, rare: 8 } },
  { id: 'adventure_trail', name: 'The Adventure Trail', level: 55, goal: 180, unlocks: { facility: 'trail', object: 'glow_ball' },
    weights: { walk: 6, journey: 6, rare: 5 } },
  { id: 'pet_homes',       name: 'Pet Homes',         level: 62, goal: 200, unlocks: { facility: 'pet_homes', object: 'tent' },
    weights: { care: 2, meal: 3, play: 3, walk: 3 } },
  { id: 'hall_of_fame',    name: 'Hall of Fame',      level: 85, goal: 250, unlocks: { facility: 'hall_of_fame', object: 'music_box' },
    weights: { five_star: 5, rare: 6, journey: 3, train: 3 } },
];

/* ================================================================ SPECIALTIES (pet roles) */
export const SPECIALTIES = {
  explorer: { name: 'Explorer', icon: '🧭', from: 'walks & journeys' }, photographer: { name: 'Photographer', icon: '📸', from: 'five-star photos' },
  trainer: { name: 'Trainer', icon: '🎓', from: 'Academy ranks' }, performer: { name: 'Performer', icon: '🎭', from: 'dance & trick photos' },
  companion: { name: 'Companion', icon: '💞', from: 'care & relationships' }, collector: { name: 'Collector', icon: '🗃️', from: 'Journal discoveries' },
};

/* ================================================================ POKA LEAGUE (friendly, AI + async) */
export const LEAGUE_DIVISIONS = ['photo', 'agility', 'tricks', 'fetch', 'style', 'duo', 'adventure', 'team'];
export const DIVISION_NAMES = { photo: 'Photo', agility: 'Agility', tricks: 'Tricks', fetch: 'Fetch', style: 'Style', duo: 'Duo', adventure: 'Adventure', team: 'Team' };
export const LEAGUE_ROTATION = [   // weekly criteria rotate; matching (not raw score) decides most of the result
  { id: 'best_jump', name: 'Best Jump', division: 'photo', match: { poseAny: ['jump', 'leap', 'catch'] } },
  { id: 'best_meal', name: 'Best Meal Memory', division: 'photo', match: { tag: 'meal' } },
  { id: 'adventure_duo', name: 'Best Adventure Duo', division: 'duo', match: { subjects: 2, journey: true } },
  { id: 'night_photo', name: 'Best Night Photo', division: 'photo', match: { time: ['evening', 'night'] } },
  { id: 'group_comp', name: 'Best Group Composition', division: 'team', match: { subjects: 3 } },
  { id: 'yarn_moment', name: 'Best Yarn Moment', division: 'photo', match: { object: 'yarn' } },
  { id: 'friendship', name: 'Best Friendship Photo', division: 'duo', match: { relation: true } },
  { id: 'rare_moment', name: 'Best Rare Moment', division: 'photo', match: { rarityAtLeast: 'rare' } },
  { id: 'seasonal', name: 'Best Seasonal Photo', division: 'style', match: { seasonal: true } },
  { id: 'agility_run', name: 'Agility Cup', division: 'agility', match: { academy: 'agility' } },
  { id: 'trick_show', name: 'Trick Showcase', division: 'tricks', match: { academy: 'trick' } },
  { id: 'fetch_cup', name: 'Fetch Cup', division: 'fetch', match: { academy: 'fetch' } },
];
export const LEAGUE = { entrants: 8, weights: { match: 0.45, quality: 0.3, rarity: 0.15, creativity: 0.1 }, gearCounts: false };

/* ================================================================ COLLECTIONS */
export const COLLECTIONS = [
  { id: 'backyard_life', name: 'Backyard Life', reward: 'frame_leaves', goals: [
    { id: 'run', text: 'A pet running', test: { location: 'backyard', poseAny: ['leap', 'jump', 'catch'] } },
    { id: 'dig', text: 'A pet digging', test: { object: 'planter' } }, { id: 'ball', text: 'Ball play', test: { object: 'ball' } },
    { id: 'two', text: 'Two pets playing', test: { location: 'backyard', subjects: 2 } }, { id: 'sunset', text: 'Sunset in the Backyard', test: { location: 'backyard', time: ['sunset'] } },
    { id: 'sleep', text: 'Sleeping outside', test: { location: 'backyard', poseAny: ['sleep', 'sleepyroll'] } }, { id: 'journey', text: 'A Journey Snap', test: { journey: true } } ] },
  { id: 'breakfast', name: 'Breakfast Together', reward: 'prop_cupcake', goals: [
    { id: 'meal1', text: 'A meal with one pet', test: { tag: 'meal' } }, { id: 'meal2', text: 'A meal with two pets', test: { tag: 'meal', subjects: 2 } },
    { id: 'react', text: 'A food reaction', test: { object: 'food_bowl' } }, { id: 'feed', text: 'Share a virtual treat', test: { tag: 'fed' } }, { id: 'hq', text: 'A four-star meal photo', test: { tag: 'meal', starsAtLeast: 4 } } ] },
  { id: 'pack_portraits', name: 'Pack Portraits', reward: 'frame_gold', goals: [
    { id: 'duo', text: 'A duo portrait', test: { subjects: 2 } }, { id: 'trio', text: 'A trio portrait', test: { subjects: 3 } },
    { id: 'friends', text: 'A friendship moment', test: { relation: true } }, { id: 'studio', text: 'A pack photo in the Studio', test: { location: 'photo_studio', subjects: 2 } } ] },
  { id: 'night_life', name: 'After Dark', reward: 'filter_fireflies', goals: [
    { id: 'evening', text: 'An evening photo', test: { time: ['evening'] } }, { id: 'night', text: 'A night photo', test: { time: ['night'] } },
    { id: 'glow', text: 'The glowing ball', test: { object: 'glow_ball' } }, { id: 'nap', text: 'Night nap', test: { time: ['night'], poseAny: ['sleep'] } } ] },
  { id: 'academy_stars', name: 'Academy Stars', reward: 'frame_comic', goals: [
    { id: 'trick', text: 'A trained trick photo', test: { poseAny: ['roll', 'spin', 'dance', 'highfive', 'bow'] } }, { id: 'agility', text: 'An agility pose', test: { poseAny: ['leap', 'weave'] } },
    { id: 'focus', text: 'A focus pose', test: { poseAny: ['statue', 'salute'] } }, { id: 'yard', text: 'A Training Yard photo', test: { location: 'training_yard' } } ] },
  { id: 'rare_hunter', name: 'Rare Hunter', reward: 'filter_stardust', goals: [
    { id: 'u', text: 'An Uncommon moment', test: { rarityAtLeast: 'uncommon' } }, { id: 'r', text: 'A Rare moment', test: { rarityAtLeast: 'rare' } },
    { id: 'l', text: 'A Legendary moment', test: { rarityAtLeast: 'legendary' } } ] },
];

/* ================================================================ PHOTO HONORS (tiered, original names) */
export const HONOR_TIERS = [{ n: 1, name: 'Bronze Lens', need: 1 }, { n: 2, name: 'Silver Lens', need: 5 }, { n: 3, name: 'Gold Lens', need: 15 }, { n: 4, name: 'Prism Lens', need: 40 }];
export const HONORS = [
  { id: 'portrait', name: 'Portrait Artist', counts: 'portrait', reward: { coins: [20, 50, 120, 0], item: [null, null, null, 'frame_gold'] } },
  { id: 'action', name: 'Master of Motion', counts: 'action', reward: { coins: [20, 50, 120, 0] } },
  { id: 'family', name: 'Family Photographer', counts: 'multi', reward: { coins: [30, 60, 140, 0] } },
  { id: 'night', name: 'Night Photographer', counts: 'night', reward: { coins: [20, 50, 120, 0] } },
  { id: 'adventure', name: 'Adventure Photographer', counts: 'journey', reward: { coins: [20, 50, 120, 0] } },
  { id: 'historian', name: 'Poka Historian', counts: 'album', reward: { coins: [20, 50, 120, 0] } },
  { id: 'rare', name: 'Rare Moment Hunter', counts: 'rare', reward: { coins: [25, 60, 150, 0] } },
  { id: 'bestfriend', name: 'Best Friend Photographer', counts: 'relation', reward: { coins: [25, 60, 150, 0] } },
  { id: 'foodie', name: 'Foodie Poka', counts: 'meal', reward: { coins: [20, 50, 120, 0] } },
  { id: 'community', name: 'Community Photographer', counts: 'homeland', reward: { coins: [20, 50, 120, 0] } },
  { id: 'training', name: 'Training Photographer', counts: 'trained', reward: { coins: [20, 50, 120, 0] } },
  { id: 'seasonal', name: 'Seasonal Photographer', counts: 'seasonal', reward: { coins: [20, 50, 120, 0] } },
];

/* ================================================================ JOURNAL
   Species Journal: per species, per category, a list of discoveries. Generated
   from the categories below so species differ (cats yarn, dogs frisbee…). */
export const JOURNAL_CATEGORIES = [
  { id: 'portraits', name: 'Portraits', icon: '🖼️' }, { id: 'actions', name: 'Actions', icon: '💨' }, { id: 'props', name: 'Prop Life', icon: '🎾' },
  { id: 'relationships', name: 'Relationships', icon: '💞' }, { id: 'adventures', name: 'Adventures', icon: '🥾' }, { id: 'rare', name: 'Rare Moments', icon: '✨' },
  { id: 'training', name: 'Training', icon: '🎓' }, { id: 'seasonal', name: 'Seasonal', icon: '🍂' },
];
export const JOURNAL_ENTRIES = {   // [id, name, category, test]
  common: [
    ['portrait_normal', 'Calm Portrait', 'portraits', { poseAny: ['idle', 'sit'] }], ['portrait_happy', 'Happy Portrait', 'portraits', { poseAny: ['happy'] }],
    ['portrait_sleepy', 'Sleepy Portrait', 'portraits', { poseAny: ['sleep', 'sleepyroll'] }], ['portrait_surprised', 'Surprised!', 'portraits', { poseAny: ['surprised'] }],
    ['portrait_curious', 'Curious Look', 'portraits', { poseAny: ['look', 'peek'] }], ['portrait_wink', 'A Wink', 'portraits', { poseAny: ['wink'] }],
    ['action_jump', 'Big Jump', 'actions', { poseAny: ['jump'] }], ['action_leap', 'Agility Leap', 'actions', { poseAny: ['leap'] }], ['action_catch', 'The Catch', 'actions', { poseAny: ['catch'], propAction: 'catch' }],
    ['action_roll', 'Roll Over', 'actions', { poseAny: ['roll'] }], ['action_spin', 'Spin', 'actions', { poseAny: ['spin'] }], ['action_dance', 'Dance Moves', 'actions', { poseAny: ['dance', 'disco', 'twirl', 'moonwalk'] }],
    ['prop_ball', 'Ball Time', 'props', { object: 'ball' }], ['prop_food', 'Snack Time', 'props', { anyObject: ['food_bowl', 'puzzle_feeder'] }], ['prop_box', 'If I Fits', 'props', { object: 'cardboard_box' }],
    ['prop_bubbles', 'Bubble Chaser', 'props', { object: 'bubble_machine' }], ['prop_blanket', 'Blanket Burrito', 'props', { anyObject: ['blanket', 'pillow'] }],
    ['rel_friend', 'Friends Forever', 'relationships', { relationAtLeast: 'friend' }], ['rel_group', 'Group Play', 'relationships', { subjects: 3 }], ['rel_rival', 'Friendly Rivalry', 'relationships', { relationType: 'playful_rival' }],
    ['rel_mentor', 'The Lesson', 'relationships', { relationType: 'mentor' }], ['rel_buddy', 'Adventure Buddies', 'relationships', { relationType: 'adventure_buddy' }],
    ['adv_walk', 'Out for a Walk', 'adventures', { journey: true }], ['adv_outdoor', 'Great Outdoors', 'adventures', { anyLocation: ['backyard', 'garden', 'playground', 'adventure_gate'] }],
    ['adv_sunset', 'Sunset Stroll', 'adventures', { time: ['sunset'] }], ['adv_night', 'Night Explorer', 'adventures', { time: ['night'] }],
    ['rare_any', 'Rare Moment', 'rare', { rarityAtLeast: 'rare' }], ['rare_legendary', 'Legendary Moment', 'rare', { rarityAtLeast: 'legendary' }],
    ['train_trick', 'Trained Trick', 'training', { poseAny: ['roll', 'bow', 'highfive', 'salute', 'statue'] }], ['train_master', 'Master Form', 'training', { poseAny: ['master', 'champion'] }],
    ['season_autumn', 'Autumn Leaves', 'seasonal', { season: 'autumn' }], ['season_winter', 'Winter Glow', 'seasonal', { season: 'winter' }],
    ['season_spring', 'Spring Blossom', 'seasonal', { season: 'spring' }], ['season_summer', 'Summer Splash', 'seasonal', { season: 'summer' }],
  ],
  cat: [['prop_yarn', 'Yarn Tangle', 'props', { object: 'yarn' }], ['action_stretch', 'Big Cat Stretch', 'actions', { anyObject: ['scratching_post'], poseAny: ['stretch'] }], ['rare_box', 'Box Ninja', 'rare', { object: 'cardboard_box', rarityAtLeast: 'uncommon' }]],
  dog: [['prop_frisbee', 'Frisbee Pro', 'props', { object: 'frisbee' }], ['action_fetch', 'Fetch!', 'actions', { anyObject: ['ball', 'frisbee'], propAction: 'catch' }], ['rare_zoomies', 'Zoomies', 'rare', { poseAny: ['leap'], rarityAtLeast: 'uncommon' }]],
  bunny: [['action_binky', 'Binky Hop', 'actions', { poseAny: ['jump', 'leap'] }], ['prop_carrot', 'Carrot Crunch', 'props', { anyObject: ['food_bowl', 'planter'] }], ['rare_flop', 'Happy Flop', 'rare', { poseAny: ['sleepyroll', 'roll'], rarityAtLeast: 'uncommon' }]],
  puzzle: PUZZLES.map(p => [p.reward.journal, p.name, p.reward.rarity === 'legendary' ? 'rare' : 'relationships', { puzzle: p.id }]),
};
export const JOURNAL_MILESTONES = [   // per species page; balance-configurable
  { at: 3, reward: { coins: 60 } }, { at: 6, reward: { coins: 120, item: 'neck_collar_red' } }, { at: 12, reward: { item: 'pose_sitpretty' } },
  { at: 20, reward: { item: 'frame_polaroid' } }, { at: 'category', reward: { coins: 150 } }, { at: 30, reward: { item: 'frame_starlight' } },
  { at: 'master', reward: { title: 'Master Page', treatment: 'gold_page' } },
];
export const LIFE_MILESTONES = [
  ['adopted', 'Adoption day'], ['first_photo', 'First photo'], ['first_meal', 'First meal together'], ['first_walk', 'First walk'], ['first_journey', 'First Journey Snap'],
  ['first_five', 'First 5-star photo'], ['first_trick', 'First trick'], ['first_friend', 'First friend'], ['first_rare', 'First Rare Moment'], ['first_legendary', 'First Legendary moment'],
  ['photos_100', '100th photo'], ['first_league', 'First competition'], ['master_training', 'Master Training'], ['community_role', 'Community role'],
  ['best_friend', 'A best friend'], ['home_built', 'Helped build the Homeland'], ['level_50', 'Community Photographer'], ['level_100', 'Master Photographer'],
];

/* ================================================================ MOMENT RARITY (independent of score) */
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'legendary'];
export const RARITY_XP = { common: 0, uncommon: 10, rare: 30, legendary: 80 };

/* ================================================================ CARE, NEGLECT & REVIVAL
   Days measured from the last MEANINGFUL care (feed/play/walk/rest/photo together).
   One missed day is never neglect. Death requires the Critical warning to have
   been SHOWN in-app and a further `graceAfterWarning` days without care. */
export const NEGLECT = {
  states: [
    { id: 'healthy',   after: 0,  name: 'Happy & healthy' },
    { id: 'lonely',    after: 4,  name: 'A little lonely',  effect: { relationGain: 0.5 } },
    { id: 'stressed',  after: 8,  name: 'Stressed',         effect: { relationGain: 0.4, trainingPenalty: 0.1 } },
    { id: 'snappy',    after: 12, name: 'Snappy',           effect: { refuseChance: 0.3, trainingPenalty: 0.15 } },
    { id: 'withdrawn', after: 16, name: 'Withdrawn',        effect: { refuseChance: 0.5, hides: true } },
    { id: 'critical',  after: 21, name: 'Needs you now',    effect: { refuseChance: 0.7, hides: true } },
  ],
  graceAfterWarning: 7, recoveryCareActions: 6, vacationCap: 14,   // vacation: first 14 days away count at half speed
};
export const REVIVAL = { treatsEarnedAt: [50, 100], diamondCost: 4000, returnsAs: 'withdrawn', relationKeep: 0.5, trustRebuildActions: 10, promoteAfterLossHours: 72 };

/* ================================================================ XP DIVERSITY */
export const NOVELTY = { newExperience: 1.0, improvement: 0.6, repeat: 0.15, repeatFloor: 0.05, repeatHalfLifePerDay: 3 };
export const XP_SOURCES = { journal_entry: 60, new_five_star: 80, academy_rank: 120, relationship_milestone: 150, new_behavior: 40, journey_discovery: 50,
  project_contribution: 8, project_complete: 300, adventure_story: 90, collection_complete: 250, league_place: 150, rare_moment: 40, legendary_moment: 150, life_adventure: 20, life_goal: 120 };

/* ================================================================ LOOKBACK */
export const LOOKBACK = { daily: 'TODAY WITH {name}', weekly: 'THIS WEEK WITH YOUR POKAS', monthly: '{month} TOGETHER', yearly: 'OUR YEAR TOGETHER' };

/** The drawable for a Homeland object: its own art when it has one, else its catalog prop. */
export function objectArt(o, itemOf) { const base = itemOf(o.prop); return o.art ? { ...base, ...o.art, slot: base?.slot || 'PROP', rarity: base?.rarity || 'common' } : base; }
