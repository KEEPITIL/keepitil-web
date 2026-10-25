/* KMOB CRUSADES — 3 campaigns · 6 Crusades · 30 missions on the shared combat engine (owner directive 2026-10-24).
   One data catalog drives everything: each mission scripts its waves (formations, enemy pool, level), boss, objective, mastery stars,
   contextual tips and rewards; the simulation runs it through opts.mission (js/sim.js missionWave/missionTick), so there is no second
   engine. Rules that keep the rest of KMOB safe:
   - Crusades uses a STANDARD LOADOUT (no bought perks, gear, skin stats or items): progress comes from campaign unlocks only.
   - Campaign unlocks (Melee after M2, …) restrict Crusades only; Endless War, Daily Defense and purchases are never touched.
   - Rewards are earned-only and idempotent: each reward id is granted once (save.crusades.got), whatever is replayed or reloaded.
   - Battles pay no Diamonds or War Tokens (they can be replayed); boss gold stays inside the battle. */
(function (G) {
  const KM = G.KM = G.KM || {};
  KM.CRUSADE_V = 1;
  KM.CAMPAIGNS = [
    { id: 'c1', n: 1, name: 'FALLEN KINGDOM', desc: 'Retake the border and break the citadel.', color: '#3a66f0' },
    { id: 'c2', n: 2, name: 'NIGHTFALL INVASION', desc: 'The dead walk and the legion haunts the dark.', color: '#6a3fb5' },
    { id: 'c3', n: 3, name: 'CHAOS WARS', desc: 'A carnival of killers, then the iron king.', color: '#c8323a' }];
  KM.CRUSADES = [
    { id: 'border', c: 1, name: 'BORDER RECLAMATION', desc: 'Army fundamentals' },
    { id: 'citadel', c: 1, name: 'CITADEL SIEGE', desc: 'Tank strategy and combined arms' },
    { id: 'zombie', c: 2, name: 'ZOMBIE OUTBREAK', desc: 'Swarm survival and resource control' },
    { id: 'haunted', c: 2, name: 'HAUNTED LEGION', desc: 'Defensive positioning and endurance' },
    { id: 'carnival', c: 3, name: 'KILLER CARNIVAL', desc: 'Unpredictable enemies and tactical adaptation' },
    { id: 'iron', c: 3, name: 'IRON UPRISING', desc: 'Advanced strategy and final conquest' }];
  // Crusades roster: the starting army is Looter + Archer + the basic tank; each unlock is the reward of a mission VICTORY
  KM.CRUSADE_UNLOCKS = [[2, 'melee'], [4, 'mizard'], [7, 'elite'], [9, 'giant']];
  KM.CRUSADE_POWERS = [[6, 'fortress'], [15, 'linebreaker'], [25, 'arrowstorm']];   // tank power-ups, unlocked by victories (the first after Mission 6)
  // earned-only cosmetics: colour themes (no stats), banners and titles. Never sold for money, Diamonds, War Tokens or passes.
  KM.CRUSADE_SKINS = [
    { id: 'cr_border', name: 'Border Warden', color: '#2f9e5a', for: 'all' }, { id: 'cr_fallen', name: 'Fallen Crown', color: '#d4a62a', for: 'all' },
    { id: 'cr_outbreak', name: 'Plague Ward', color: '#7fbf3f', for: 'all' }, { id: 'cr_nightfall', name: 'Nightfall', color: '#6a3fb5', for: 'all' },
    { id: 'cr_ringmaster', name: 'Ringbreaker', color: '#e0507a', for: 'all' }, { id: 'cr_ironking', name: 'Iron King', color: '#9aa7bd', for: 'tank' }];
  KM.CRUSADE_TITLES = ['FIRST COMMAND', 'BORDER WARDEN', 'CITADEL BREAKER', 'OUTBREAK SURVIVOR', 'NIGHT WATCH', 'RINGBREAKER', 'IRON CONQUEROR', 'GRAND CRUSADER'];
  // ---------- the 30 missions ----------
  // w(lv, formations[[type, share, delay, nearTheLine]], extra): one scripted wave. lv = threat level on the Endless scale (budget + quality).
  const w = (lv, f, x) => Object.assign({ lv, f }, x || {});
  const B = (boss, lv, extra) => w(lv, [['boss', 0, 2.5], ['line', 0.35, 3]], Object.assign({ boss }, extra));
  const star = (k, v) => ({ k, v });
  KM.starText = s => s.k === 'hp' ? 'Tank above ' + s.v + '% health' : s.k === 'time' ? 'Win within ' + Math.floor(s.v / 60) + ':' + String(s.v % 60).padStart(2, '0') : s.k === 'lost' ? 'Lose ' + s.v + ' soldiers or fewer'
    : s.k === 'col' ? (s.v ? 'Lose ' + s.v + ' Looter' + (s.v > 1 ? 's' : '') + ' or fewer' : 'No Looter lost') : s.k === 'gold' ? 'End with ' + s.v.toLocaleString('en-US') + ' Gold or more' : s.k === 'kills' ? 'Defeat ' + s.v + ' enemies' : '';
  KM.MISSIONS = [
    // ===== CAMPAIGN I · FALLEN KINGDOM · Crusade 1: BORDER RECLAMATION (fundamentals) =====
    { n: 1, cr: 'border', name: 'FIRST COMMAND', brief: 'Hold the border road. Deploy Looters for Gold and Archers to shoot, and clear 3 waves.', bank: 900,
      pool: ['grunt'], waves: [w(1, [['line', 0.5]]), w(1, [['line', 0.45], ['blob', 0.35, 5]]), w(2, [['wedge', 0.5], ['line', 0.4, 6]])],
      s2: star('col', 0), s3: star('hp', 90),
      tips: [{ on: 'start', text: 'Tap a soldier card to choose it. Looters gather Gold, Archers shoot.' }, { on: 't:6', text: 'Drag the tank left and right to aim its cannon.' },
        { on: 'wave:2', text: 'ATTACK sends your army forward. DEFEND holds them by the tank.' }, { on: 'kills:12', text: 'Kills drop Gold. Tap a selected card again to upgrade it.' },
        { on: 'wave:3', text: 'Last wave. Clear it to win the mission.' }], reward: { title: 'FIRST COMMAND', banner: 'b_first' } },
    { n: 2, cr: 'border', name: 'FRONTLINE GAP', brief: 'Shield-bearers march at your Archers. Keep enough Archers alive behind the tank and clear 4 waves.', bank: 1100,
      pool: ['grunt', 'shield'], waves: [w(2, [['line', 0.55]]), w(3, [['shieldwall', 0.6]]), w(3, [['line', 0.4], ['wedge', 0.4, 5]]), w(4, [['shieldwall', 0.55], ['column', 0.35, 6]])],
      s2: star('lost', 12), s3: star('time', 150),
      tips: [{ on: 'start', text: 'Shields block arrows from the front. The tank cannon breaks them.' }, { on: 'wave:3', text: 'Use DEFEND so the line holds while the Archers fire.' }], reward: { unlock: 'melee' } },
    { n: 3, cr: 'border', name: 'GOLD RUSH', brief: 'Raiders bring rich bounties. Grow your Looter economy and finish with a war chest.', bank: 700, goldMul: 1.4,
      pool: ['grunt', 'imp', 'runner'], waves: [w(3, [['swarm', 0.5]]), w(3, [['push', 0.5]]), w(4, [['swarm', 0.4], ['line', 0.4, 4]]), w(5, [['push', 0.5], ['flank', 0.3, 5]])],
      s2: star('gold', 1500), s3: star('col', 0),
      tips: [{ on: 'start', text: 'Every Looter carries Gold back to the tank. More Looters, faster income.' }, { on: 'wave:2', text: 'Runners slip past the line and hunt Looters. Keep Melee in front.' }], reward: { banner: 'b_gold' } },
    { n: 4, cr: 'border', name: 'WOUNDED LINE', brief: 'A long march with no healers. Rotate fresh troops into the line and clear 5 waves.', bank: 1400,
      pool: ['grunt', 'shield', 'spearman'], waves: [w(4, [['line', 0.55]]), w(4, [['column', 0.5], ['line', 0.3, 5]]), w(5, [['shieldwall', 0.55]]), w(5, [['blob', 0.5], ['wedge', 0.35, 5]]), w(6, [['line', 0.45], ['mini', 0, 4]])],
      s2: star('hp', 60), s3: star('lost', 25),
      tips: [{ on: 'start', text: 'Nobody heals today. Upgrades make every soldier last longer.' }, { on: 'wave:5', text: 'A Giant! Focus it with the tank cannon.' }], reward: { unlock: 'mizard' } },
    { n: 5, cr: 'border', name: 'BORDER CAPTAIN', brief: 'The Warlord holds the border fort. Break his guard and defeat him.', bank: 1800, bossMul: { hp: 0.3, dmg: 0.6 },
      pool: ['grunt', 'shield', 'spearman', 'archer'], waves: [w(5, [['line', 0.5], ['backline', 0.3, 5]]), w(6, [['shieldwall', 0.55]]), w(6, [['mixed', 0.6]]), B('warlord', 7)],
      phases: [{ at: 0.5, summon: 'blob', bud: 0.5, text: 'The Warlord calls his guard!' }],
      s2: star('hp', 50), s3: star('time', 210),
      tips: [{ on: 'start', text: 'Mizards heal nearby soldiers. Keep them behind the Melee.' }, { on: 'boss', text: 'The Warlord summons guards. Clear them, then focus the boss.' }], reward: { skin: 'cr_border', title: 'BORDER WARDEN' } },
    // ===== Crusade 2: CITADEL SIEGE (tank strategy, combined arms) =====
    { n: 6, cr: 'citadel', name: 'CANNON LESSON', brief: 'Siege cannons shell your line from range. Aim the tank at them and clear 4 waves.', bank: 2000,
      pool: ['grunt', 'shield'], waves: [w(6, [['line', 0.5], ['siege', 0.3, 4]]), w(7, [['siege', 0.5]]), w(7, [['shieldwall', 0.4], ['siege', 0.35, 5]]), w(8, [['siege', 0.6]])],
      s2: star('hp', 55), s3: star('time', 170),
      tips: [{ on: 'start', text: 'Cannons outrange Archers. Steer the tank cannon onto them.' }], reward: { power: 'fortress' } },
    { n: 7, cr: 'citadel', name: 'HEAVY SHIELD', brief: 'Knights in plate push hard. Hold with Melee, burn with Archers, repair with FORTRESS SURGE.', bank: 2400,
      pool: ['shield', 'knight', 'spearman'], emod: { knight: { arm: 2 } }, waves: [w(7, [['shieldwall', 0.5]]), w(8, [['elite', 0.55]]), w(8, [['line', 0.4], ['elite', 0.4, 5]]), w(9, [['elite', 0.6], ['mini', 0, 6]])],
      s2: star('lost', 35), s3: star('hp', 70),
      tips: [{ on: 'start', text: 'FORTRESS SURGE repairs the tank and hardens the line. Use it when the tank is hurt.' }], reward: { unlock: 'elite' } },
    { n: 8, cr: 'citadel', name: 'SIEGE SUPPLIES', brief: 'Supplies are thin and waves pay less. Balance Elites, Looters and upgrades.', bank: 1500, goldMul: 0.7,
      pool: ['grunt', 'shield', 'archer', 'knight'], waves: [w(8, [['mixed', 0.55]]), w(8, [['backline', 0.55]], { supply: true }), w(9, [['mixed', 0.4], ['elite', 0.35, 5]]), w(9, [['shieldwall', 0.5], ['siege', 0.3, 4]]), w(10, [['mixed', 0.6]])],
      s2: star('gold', 2500), s3: star('col', 2),
      tips: [{ on: 'start', text: 'Elites cost more but hold far longer. Spend wisely: waves pay less here.' }], reward: { banner: 'b_supply' } },
    { n: 9, cr: 'citadel', name: 'THE BREACH', brief: 'Brutes and a Giant guard the breach. Bring them down and clear 5 waves.', bank: 2800,
      pool: ['grunt', 'knight', 'brute', 'spearman'], waves: [w(9, [['line', 0.5], ['mini', 0, 5]]), w(10, [['elite', 0.55]]), w(10, [['wedge', 0.5], ['mini', 0, 4]]), w(11, [['elite', 0.45], ['column', 0.35, 5]]), w(11, [['mini', 0, 0], ['mini', 0, 6], ['line', 0.4, 3]])],
      s2: star('hp', 50), s3: star('lost', 45),
      tips: [{ on: 'start', text: 'Giants and Brutes smash lines. Elites hold them; the tank finishes them.' }], reward: { unlock: 'giant' } },
    { n: 10, cr: 'citadel', name: 'CITADEL GENERAL', brief: 'The Titan general charges through the gate. Survive his charges and destroy him.', bank: 3500, bossMul: { hp: 0.5, dmg: 0.75 },
      pool: ['shield', 'knight', 'archer', 'cannon'], waves: [w(10, [['siege', 0.45], ['backline', 0.35, 4]]), w(11, [['elite', 0.55]]), w(12, [['mixed', 0.6]]), B('titan', 12)],
      phases: [{ at: 0.6, summon: 'siege', bud: 0.5, text: 'Siege engines roll in!' }, { at: 0.3, enrage: 1.3, text: 'The general is enraged!' }],
      s2: star('hp', 45), s3: star('time', 240),
      tips: [{ on: 'boss', text: 'Giants can stop a charge. Use DEFEND when he charges.' }], reward: { skin: 'cr_fallen', title: 'CITADEL BREAKER', campaign: 2 } },
    // ===== CAMPAIGN II · NIGHTFALL INVASION · Crusade 3: ZOMBIE OUTBREAK (the dead rise once) =====
    { n: 11, cr: 'zombie', name: 'FIRST INFECTION', brief: 'Fast swarms at night, and the dead get back up. Clear 4 waves.', bank: 3000, undead: 0.35, sector: 'swarm',
      pool: ['imp', 'grunt', 'runner'], emod: { grunt: { spd: 0.8, hp: 1.3 } }, waves: [w(10, [['swarm', 0.6]]), w(11, [['swarm', 0.4], ['blob', 0.4, 4]]), w(11, [['push', 0.6]]), w(12, [['swarm', 0.5], ['swarm', 0.4, 5]])],
      s2: star('lost', 40), s3: star('time', 170),
      tips: [{ on: 'start', text: 'Fallen enemies can rise again at half health. Keep the line until they stay down.' }], reward: {} },
    { n: 12, cr: 'zombie', name: 'BROKEN SUPPLY', brief: 'You start almost broke. Rebuild with Looters before the horde peaks.', bank: 900, undead: 0.3,
      pool: ['imp', 'grunt', 'runner'], waves: [w(9, [['swarm', 0.45]]), w(10, [['blob', 0.5]]), w(11, [['swarm', 0.5], ['push', 0.3, 5]]), w(12, [['push', 0.55]]), w(12, [['swarm', 0.5], ['blob', 0.4, 5]])],
      s2: star('gold', 2000), s3: star('col', 3),
      tips: [{ on: 'start', text: 'Only 900 Gold. Looters first, then soldiers.' }], reward: { banner: 'b_plague' } },
    { n: 13, cr: 'zombie', name: 'ARCHER SCREEN', brief: 'Only Looters, Archers and Mizards answer the call. Screen the horde with arrows.', bank: 3200, undead: 0.3, only: ['collector', 'range', 'mizard'],
      pool: ['grunt', 'imp', 'shield'], waves: [w(11, [['line', 0.5]]), w(11, [['swarm', 0.5]]), w(12, [['shieldwall', 0.5]]), w(12, [['blob', 0.55]])],
      s2: star('hp', 60), s3: star('lost', 30),
      tips: [{ on: 'start', text: 'No front line today. Mizards keep Archers alive; DEFEND keeps them behind the tank.' }], reward: {} },
    { n: 14, cr: 'zombie', name: 'LAST REINFORCEMENT', brief: 'Hold the gate for 3 minutes while the dead keep coming.', bank: 3500, undead: 0.4, goal: 'hold', hold: 180,
      pool: ['grunt', 'imp', 'runner', 'shield'], waves: [w(12, [['blob', 0.5]]), w(12, [['swarm', 0.5], ['line', 0.3, 5]]), w(13, [['push', 0.55]]), w(13, [['blob', 0.45], ['swarm', 0.4, 6]])],
      s2: star('hp', 50), s3: star('lost', 60),
      tips: [{ on: 'start', text: 'Survive until the timer runs out. Replace losses before the line breaks.' }], reward: {} },
    { n: 15, cr: 'zombie', name: 'OUTBREAK SOURCE', brief: 'The Hunter feeds the outbreak. Kill it before the swarm overwhelms you.', bank: 4000, undead: 0.3, bossMul: { hp: 0.55, dmg: 0.8 },
      pool: ['imp', 'grunt', 'runner', 'bomber'], waves: [w(12, [['swarm', 0.5], ['push', 0.3, 4]]), w(13, [['mixed', 0.55]]), w(14, [['swarm', 0.6]]), B('hunter', 14)],
      phases: [{ at: 0.66, summon: 'swarm', bud: 0.6, near: true, text: 'The swarm bursts from the ground!' }, { at: 0.33, summon: 'swarm', bud: 0.6, near: true, text: 'Another swarm!' }],
      s2: star('hp', 45), s3: star('time', 240),
      tips: [{ on: 'boss', text: 'The Hunter chases your rear. Keep Mizards and Archers close to the tank.' }], reward: { skin: 'cr_outbreak', title: 'OUTBREAK SURVIVOR', power: 'linebreaker' } },
    // ===== Crusade 4: HAUNTED LEGION (ambushes near the line, endurance) =====
    { n: 16, cr: 'haunted', name: 'HAUNTED GATE', brief: 'The legion appears out of the mist close to your line. Layer your defence.', bank: 4000,
      pool: ['grunt', 'shield', 'spearman', 'knight'], emod: { '*': { hp: 1.1 } }, waves: [w(13, [['line', 0.5, 0, true]]), w(13, [['shieldwall', 0.5], ['flank', 0.3, 4, true]]), w(14, [['column', 0.5, 0, true]]), w(14, [['wedge', 0.5], ['line', 0.4, 5, true]])],
      s2: star('lost', 50), s3: star('hp', 60),
      tips: [{ on: 'start', text: 'Ghost troops appear close to your line. Keep a ready front line at all times.' }], reward: {} },
    { n: 17, cr: 'haunted', name: 'SILENCED HEALERS', brief: 'Runners and archers hunt your Mizards. Protect your healers and clear 4 waves.', bank: 4200,
      pool: ['runner', 'archer', 'grunt'], emod: { runner: { spd: 1.15 } }, waves: [w(13, [['flank', 0.5]]), w(14, [['backline', 0.5], ['flank', 0.3, 4]]), w(14, [['push', 0.5]]), w(15, [['flank', 0.45], ['backline', 0.4, 5]])],
      s2: star('hp', 55), s3: star('lost', 45),
      tips: [{ on: 'start', text: 'Flankers dive the back rows. DEFEND pulls the army in around your healers.' }], reward: {} },
    { n: 18, cr: 'haunted', name: 'NIGHT WATCH', brief: 'Threats come from every side through the night. React with the tank and formation calls.', bank: 4500,
      pool: ['grunt', 'runner', 'archer', 'bomber', 'shield'], waves: [w(14, [['flank', 0.4], ['line', 0.3, 3, true]]), w(15, [['mixed', 0.55]]), w(15, [['siege', 0.4], ['flank', 0.35, 4, true]]), w(16, [['push', 0.5], ['mini', 0, 5]]), w(16, [['mixed', 0.6, 0, true]])],
      s2: star('lost', 60), s3: star('time', 230),
      tips: [{ on: 'start', text: 'Bombers explode on contact. Shoot them before they reach the line.' }], reward: { banner: 'b_watch' } },
    { n: 19, cr: 'haunted', name: 'LONG RETREAT', brief: 'Fall back and survive 3½ minutes. Strike only when the legion breaks.', bank: 4800, goal: 'hold', hold: 210,
      pool: ['grunt', 'shield', 'knight', 'spearman', 'archer'], waves: [w(15, [['line', 0.5]]), w(15, [['shieldwall', 0.5, 0, true]]), w(16, [['elite', 0.55]]), w(16, [['mixed', 0.55, 0, true]]), w(17, [['wedge', 0.5], ['elite', 0.4, 5]])],
      s2: star('hp', 50), s3: star('kills', 450),
      tips: [{ on: 'start', text: 'DEFEND keeps the army alive; ATTACK when a wave thins out.' }], reward: {} },
    { n: 20, cr: 'haunted', name: 'PHANTOM COMMANDER', brief: 'The Colossus commands the legion from behind a line of ghost shields. Endure and counterattack.', bank: 5500, bossMul: { hp: 0.6, dmg: 0.8 },
      pool: ['shield', 'knight', 'archer', 'shaman'], emod: { '*': { hp: 1.1 } }, waves: [w(16, [['backline', 0.5, 0, true]]), w(17, [['elite', 0.55]]), w(17, [['shieldwall', 0.5, 0, true]]), B('colossus', 18)],
      phases: [{ at: 0.7, summon: 'shieldwall', bud: 0.5, near: true, text: 'A ghost wall rises!' }, { at: 0.4, summon: 'backline', bud: 0.5, near: true, text: 'Phantom archers!' }, { at: 0.15, enrage: 1.25, text: 'The Commander rages!' }],
      s2: star('hp', 40), s3: star('time', 270),
      tips: [{ on: 'boss', text: 'The Colossus shrugs off light hits. Elites and the tank cannon do the work.' }], reward: { skin: 'cr_nightfall', title: 'NIGHT WATCH', campaign: 3 } },
    // ===== CAMPAIGN III · CHAOS WARS · Crusade 5: KILLER CARNIVAL (a random archetype every wave) =====
    { n: 21, cr: 'carnival', name: 'CHAOS PARADE', brief: 'Every wave is a different act. Read each one and adapt.', bank: 5000,
      waves: [w(16, [['mixed', 0.6]], { chaos: [['imp', 'runner'], ['shield', 'knight'], ['archer', 'grunt']] }), w(17, [['blob', 0.6]], { chaos: [['runner', 'bomber'], ['knight', 'spearman'], ['archer', 'shaman']] }),
        w(17, [['push', 0.6]], { chaos: [['imp', 'bomber'], ['shield', 'brute'], ['archer', 'runner']] }), w(18, [['mixed', 0.6]], { chaos: [['grunt', 'knight', 'archer'], ['imp', 'runner', 'bomber']] })],
      s2: star('lost', 60), s3: star('time', 200),
      tips: [{ on: 'start', text: 'Fast acts need a wall; armoured acts need the cannon; archer acts need ATTACK.' }], reward: {} },
    { n: 22, cr: 'carnival', name: 'FALSE OPENING', brief: 'Weak bait waves hide strong follow-ups. Attack only when it is safe.', bank: 5200,
      pool: ['grunt', 'imp', 'knight', 'brute', 'bomber'], waves: [w(15, [['line', 0.3], ['elite', 0.5, 8]]), w(16, [['swarm', 0.3], ['wedge', 0.5, 8, true]]), w(17, [['line', 0.25], ['elite', 0.55, 9]]), w(18, [['push', 0.3], ['mini', 0, 7], ['elite', 0.4, 9]])],
      s2: star('hp', 55), s3: star('lost', 55),
      tips: [{ on: 'start', text: 'The first group is bait. Hold with DEFEND until the real attack shows.' }], reward: {} },
    { n: 23, cr: 'carnival', name: 'CROSSFIRE', brief: 'Cannons on one side, archers on the other. Retarget the tank between threats.', bank: 5500,
      pool: ['archer', 'cannon', 'shield', 'grunt'], waves: [w(17, [['siege', 0.45], ['backline', 0.35, 3]]), w(17, [['backline', 0.55]]), w(18, [['siege', 0.5], ['flank', 0.3, 4]]), w(19, [['backline', 0.45], ['siege', 0.4, 5]])],
      s2: star('hp', 50), s3: star('time', 220),
      tips: [{ on: 'start', text: 'Drag the tank toward each cannon in turn. Archers handle the enemy archers.' }], reward: { banner: 'b_crossfire' } },
    { n: 24, cr: 'carnival', name: 'THE GRAND ACT', brief: 'A huge show with a tight budget. Spend on what wins.', bank: 3500, goldMul: 0.75,
      waves: [w(18, [['blob', 0.6]], { chaos: [['grunt', 'shield'], ['imp', 'runner']] }), w(18, [['mixed', 0.6]], { chaos: [['knight', 'spearman'], ['archer', 'bomber']], supply: true }),
        w(19, [['wedge', 0.5], ['mini', 0, 5]], { chaos: [['grunt', 'knight'], ['runner', 'imp']] }), w(19, [['elite', 0.6]], { chaos: [['knight', 'brute'], ['shield', 'shaman']] }), w(20, [['mixed', 0.65]], { pool: ['grunt', 'knight', 'archer', 'bomber', 'runner'] })],
      s2: star('gold', 3000), s3: star('lost', 70),
      tips: [{ on: 'start', text: 'Waves pay less here. Upgrades often beat more soldiers.' }], reward: {} },
    { n: 25, cr: 'carnival', name: 'RINGMASTER', brief: 'The Ringmaster Warlord changes the act as he weakens. Win every act.', bank: 6000, bossMul: { hp: 0.7, dmg: 0.85 },
      pool: ['grunt', 'imp', 'runner', 'knight', 'bomber'], waves: [w(18, [['mixed', 0.55]]), w(19, [['push', 0.55]]), w(19, [['elite', 0.5], ['swarm', 0.3, 4]]), B('warlord', 20)],
      phases: [{ at: 0.75, summon: 'swarm', bud: 0.5, text: 'Act two: the swarm!' }, { at: 0.5, summon: 'elite', bud: 0.5, text: 'Act three: the strongmen!' }, { at: 0.25, summon: 'flank', bud: 0.5, near: true, enrage: 1.2, text: 'Final act!' }],
      s2: star('hp', 40), s3: star('time', 270),
      tips: [{ on: 'boss', text: 'Each act needs a different answer. Watch the warning and switch.' }], reward: { skin: 'cr_ringmaster', title: 'RINGBREAKER', power: 'arrowstorm' } },
    // ===== Crusade 6: IRON UPRISING (armour, giants, final conquest) =====
    { n: 26, cr: 'iron', name: 'IRON WALL', brief: 'Armoured columns test a layered Melee and Elite defence.', bank: 6000,
      pool: ['shield', 'knight', 'spearman'], emod: { '*': { arm: 3 } }, waves: [w(19, [['shieldwall', 0.55]]), w(20, [['elite', 0.55]]), w(20, [['column', 0.5], ['shieldwall', 0.35, 5]]), w(21, [['elite', 0.6]])],
      s2: star('lost', 70), s3: star('hp', 60),
      tips: [{ on: 'start', text: 'Armour shrugs off light hits. Upgrade damage and bring Giants.' }], reward: {} },
    { n: 27, cr: 'iron', name: 'HAMMERFALL', brief: 'Giants march with runners that dive your support. Time your Giants; guard the rear.', bank: 6500,
      pool: ['runner', 'grunt', 'knight'], waves: [w(20, [['mini', 0, 0], ['flank', 0.4, 3]]), w(20, [['wedge', 0.5], ['mini', 0, 5]]), w(21, [['flank', 0.5], ['mini', 0, 4]]), w(22, [['mini', 0, 0], ['mini', 0, 5], ['push', 0.45, 2]])],
      s2: star('hp', 50), s3: star('col', 3),
      tips: [{ on: 'start', text: 'Giants stomp clusters. Spread out with ATTACK, regroup with DEFEND.' }], reward: {} },
    { n: 28, cr: 'iron', name: 'LAST GOLD', brief: 'The treasury is nearly empty. Every coin counts in a long fight.', bank: 2500, goldMul: 0.6,
      pool: ['grunt', 'shield', 'knight', 'archer'], waves: [w(19, [['line', 0.5]]), w(20, [['mixed', 0.5]], { supply: true }), w(20, [['shieldwall', 0.5]]), w(21, [['elite', 0.5]]), w(21, [['mixed', 0.55]])],
      s2: star('gold', 2000), s3: star('lost', 60),
      tips: [{ on: 'start', text: 'Looters early pay back many times. Do not overbuild.' }], reward: { banner: 'b_lastgold' } },
    { n: 29, cr: 'iron', name: 'FINAL FORMATION', brief: 'Every enemy type at once. Use every class you have earned.', bank: 7000,
      pool: ['grunt', 'imp', 'shield', 'runner', 'archer', 'knight', 'bomber', 'shaman', 'spearman', 'brute'], waves: [w(21, [['mixed', 0.6]]), w(22, [['backline', 0.4], ['flank', 0.35, 4]]), w(22, [['elite', 0.45], ['siege', 0.35, 5]]), w(23, [['push', 0.45], ['mini', 0, 4], ['swarm', 0.3, 6]]), w(23, [['mixed', 0.65, 0, true]])],
      s2: star('lost', 80), s3: star('time', 260),
      tips: [{ on: 'start', text: 'No single answer works. Mix classes and switch posture often.' }], reward: {} },
    { n: 30, cr: 'iron', name: 'IRON KING', brief: 'The Iron King marches with his whole army. Win the final battle of the Crusades.', bank: 8000, bossMul: { hp: 0.8, dmg: 0.9 },
      pool: ['shield', 'knight', 'archer', 'cannon', 'brute'], emod: { '*': { arm: 2 } }, waves: [w(22, [['siege', 0.45], ['elite', 0.35, 4]]), w(23, [['mixed', 0.6]]), w(24, [['elite', 0.5], ['mini', 0, 5]]), B('colossus', 25)],
      phases: [{ at: 0.75, summon: 'siege', bud: 0.5, text: 'The Iron King calls his cannons!' }, { at: 0.5, summon: 'mini', text: 'A Giant champion joins!' }, { at: 0.3, summon: 'elite', bud: 0.6, near: true, text: 'The royal guard!' }, { at: 0.12, enrage: 1.3, text: 'The Iron King rages!' }],
      s2: star('hp', 35), s3: star('time', 300),
      tips: [{ on: 'boss', text: 'Four phases. Save FORTRESS SURGE for the last one.' }], reward: { skin: 'cr_ironking', title: 'IRON CONQUEROR', grand: 'GRAND CRUSADER' } }];
  const BOSS_NAMES = { 5: 'BORDER CAPTAIN', 10: 'CITADEL GENERAL', 15: 'OUTBREAK HUNTER', 20: 'PHANTOM COMMANDER', 25: 'RINGMASTER', 30: 'IRON KING' };   // the boss bar shows the story name, not the model's
  KM.MISSIONS.forEach(M => { if (BOSS_NAMES[M.n]) M.bossName = BOSS_NAMES[M.n];
    M.id = 'm' + M.n; M.camp = KM.CRUSADES.find(c => c.id === M.cr).c; M.goal = M.goal || 'waves'; });
  // BALANCE (tests/crusades-tune.js, reference bot on two seeds): wave strength `mul` and boss damage `bdmg` per mission
  KM.MISSION_TUNE = {   // tuned 2026-10-24 (tests/crusades-tune.js); M17 eased 2.4 → 2.0 after a seed loss
    1: {mul: 1, s2: {k: 'col', v: 6}, s3: {k: 'gold', v: 500}},   // 3★ owner request 2026-10-25: hands-off AUTO ends with 240–315 Gold; choosing Looters reaches 500+
    2: {mul: 1, s2: {k: 'lost', v: 72}, s3: {k: 'time', v: 110}},
    3: {mul: 1, s2: {k: 'gold', v: 550}, s3: {k: 'col', v: 16}},
    4: {mul: 1.1, s2: {k: 'lost', v: 108}, s3: {k: 'lost', v: 82}},
    5: {mul: 1.2, s2: {k: 'lost', v: 18}, s3: {k: 'time', v: 220}},
    6: {mul: 1.3, s2: {k: 'lost', v: 8}, s3: {k: 'time', v: 260}},
    7: {mul: 1.4, s2: {k: 'lost', v: 240}, s3: {k: 'lost', v: 183}},
    8: {mul: 1.5, s2: {k: 'gold', v: 250}, s3: {k: 'col', v: 6}},
    9: {mul: 1.6, s2: {k: 'lost', v: 335}, s3: {k: 'lost', v: 255}},
    10: {mul: 1.7, s2: {k: 'lost', v: 9}, s3: {k: 'time', v: 300}},
    11: {mul: 1.8, s2: {k: 'lost', v: 23}, s3: {k: 'time', v: 240}},
    12: {mul: 1.9, s2: {k: 'gold', v: 2150}, s3: {k: 'col', v: 3}},
    13: {mul: 2, s2: {k: 'lost', v: 12}, s3: {k: 'lost', v: 8}},
    14: {mul: 2.1, s2: {k: 'lost', v: 20}, s3: {k: 'lost', v: 14}},
    15: {mul: 2.2, s2: {k: 'lost', v: 102}, s3: {k: 'time', v: 160}},
    16: {mul: 2.3, s2: {k: 'lost', v: 9}, s3: {k: 'lost', v: 6}},
    17: {mul: 2.0, s2: {k: 'lost', v: 17}, s3: {k: 'lost', v: 12}},
    18: {mul: 2.5, s2: {k: 'lost', v: 81}, s3: {k: 'time', v: 300}},
    19: {mul: 2.6, s2: {k: 'lost', v: 20}, s3: {k: 'kills', v: 305}},
    20: {mul: 2.7, s2: {k: 'lost', v: 215}, s3: {k: 'time', v: 250}},
    21: {mul: 2.78, s2: {k: 'lost', v: 300}, s3: {k: 'time', v: 240}},
    22: {mul: 2.9, s2: {k: 'lost', v: 173}, s3: {k: 'lost', v: 131}},
    23: {mul: 2.78, s2: {k: 'lost', v: 39}, s3: {k: 'time', v: 280}},
    24: {mul: 3.1, s2: {k: 'gold', v: 2850}, s3: {k: 'lost', v: 174}},
    25: {mul: 3.2, s2: {k: 'lost', v: 219}, s3: {k: 'time', v: 200}},
    26: {mul: 3.3, s2: {k: 'lost', v: 21}, s3: {k: 'lost', v: 15}},
    27: {mul: 3.4, s2: {k: 'lost', v: 591}, s3: {k: 'col', v: 48}},
    28: {mul: 3.5, s2: {k: 'gold', v: 1150}, s3: {k: 'lost', v: 9}},
    29: {mul: 3.6, s2: {k: 'lost', v: 86}, s3: {k: 'time', v: 280}},
    30: {mul: 0.6, bdmg: 0.24, s2: {k: 'lost', v: 209}, s3: {k: 'time', v: 250}},
  };
  KM.MISSION_BY = Object.fromEntries(KM.MISSIONS.map(M => [M.id, M]));

  // ---------- progress (save.crusades) ----------
  KM.crusadeBlank = () => ({ v: KM.CRUSADE_V, stars: {}, best: {}, got: {}, equip: {}, plays: 0 });
  KM.crusadeValid = c => { const o = KM.crusadeBlank(); if (!c || typeof c !== 'object') return o;
    for (const M of KM.MISSIONS) { const s = c.stars && c.stars[M.id]; if (Number.isInteger(s) && s >= 1 && s <= 3) o.stars[M.id] = s; const b = c.best && c.best[M.id]; if (b && typeof b === 'object') o.best[M.id] = { t: +b.t || 0, hp: +b.hp || 0 }; }
    for (const k in (c.got || {})) if (/^[a-z0-9_:]+( [A-Z0-9]+)*$/i.test(k) && k.length <= 40 && c.got[k]) o.got[k] = 1;   // reward ids; titles contain spaces ("title:FIRST COMMAND")
    for (const k in (c.equip || {})) if (KM.CRUSADE_SKINS.some(x => x.id === c.equip[k]) && o.got['skin:' + c.equip[k]]) o.equip[k] = c.equip[k];   // only earned looks can be worn
    o.plays = Number.isInteger(c.plays) && c.plays >= 0 ? c.plays : 0; return o; };
  const won = (P, n) => (P.stars['m' + n] || 0) >= 1;
  KM.missionOpen = (P, n) => n === 1 || won(P, n - 1);                      // one star on the previous mission opens the next (campaign gates follow: M11 needs M10, M21 needs M20)
  KM.campaignOpen = (P, c) => c === 1 || won(P, (c - 1) * 10);
  KM.crusadeOpen = (P, id) => { const i = KM.CRUSADES.findIndex(x => x.id === id); return i === 0 || won(P, i * 5); };
  KM.crusadeRoster = P => ['collector', 'range'].concat(KM.CRUSADE_UNLOCKS.filter(([n]) => won(P, n)).map(([, k]) => k));
  KM.crusadePowers = P => KM.CRUSADE_POWERS.filter(([n]) => won(P, n)).map(([, k]) => k);
  KM.crusadeStarsTotal = P => KM.MISSIONS.reduce((a, M) => a + (P.stars[M.id] || 0), 0);
  // the battle's rules: catalog mission + the player's earned roster (a mission can narrow it with `only`, never widen it)
  KM.missionRules = (id, P) => { const M = KM.MISSION_BY[id]; if (!M) throw new Error('bad mission'); P = P || KM.crusadeBlank();
    const roster = KM.crusadeRoster(P), allow = M.only ? roster.filter(k => M.only.includes(k)) : roster;
    const T = KM.MISSION_TUNE[M.n] || {}, bossMul = M.bossMul || T.bdmg ? Object.assign({}, M.bossMul, { dmg: ((M.bossMul || {}).dmg ?? 1) * (T.bdmg ?? 1) }) : undefined;
    const s2 = T.s2 || M.s2, s3 = T.s3 || M.s3;   // tuned mastery thresholds replace the design placeholders
    return Object.assign({ seed: 0x6b6d0b + M.n * 7919, bossGold: 2000 + 300 * M.n }, M, { allow, powers: KM.crusadePowers(P), mul: T.mul ?? 1, bossMul,
      s2: Object.assign({}, s2, { text: KM.starText(s2) }), s3: Object.assign({}, s3, { text: KM.starText(s3) }) }); };
  KM.missionOpts = (rules, station) => ({ seed: rules.seed, mission: rules, chant: KM.DAILY && KM.DAILY.STATIONS.includes(station) ? station : null,
    equip: rules.powers, powerLv: {}, skins: {}, buffs: { cls: {}, tank: {} }, cons: {}, loadout: {}, mercTier: 1, plan: KM.emptyPlan() });
  // result + stars from the finished battle (1 star = victory; 2 and 3 = the mission's mastery objectives, each judged on its own)
  KM.missionResult = (sim, rules) => { const hp = Math.round(100 * Math.max(0, sim.L.hp) / sim.stats.maxHp), win = !!sim.won && sim.alive;
    const R = { win, t: Math.round(sim.t), hp, lost: sim.lost, col: sim.lostCol, gold: Math.floor(sim.coins), kills: sim.kills, waves: sim.cleared };
    const met = s => !!s && (s.k === 'hp' ? hp >= s.v : s.k === 'time' ? R.t <= s.v : s.k === 'lost' ? R.lost <= s.v : s.k === 'col' ? R.col <= s.v : s.k === 'gold' ? R.gold >= s.v : s.k === 'kills' ? R.kills >= s.v : false);
    R.m2 = win && met(rules.s2); R.m3 = win && met(rules.s3); R.stars = win ? 1 + (R.m2 ? 1 : 0) + (R.m3 ? 1 : 0) : 0; return R; };
  // apply a result: stars only go up; every reward id is granted exactly once (idempotent across replays, reloads and merges)
  KM.missionReward = M => { const r = M.reward || {}, out = [];
    if (r.unlock) out.push('unlock:' + r.unlock); if (r.power) out.push('power:' + r.power); if (r.skin) out.push('skin:' + r.skin);
    if (r.title) out.push('title:' + r.title); if (r.banner) out.push('banner:' + r.banner); if (r.campaign) out.push('campaign:' + r.campaign); if (r.grand) out.push('title:' + r.grand);
    return out; };
  KM.crusadeApply = (P, id, R) => { const M = KM.MISSION_BY[id], fresh = []; if (!M || !R || !R.win) return fresh;
    P.stars[id] = Math.max(P.stars[id] || 0, Math.min(3, R.stars | 0)); const b = P.best[id]; if (!b || R.t < b.t || (R.t === b.t && R.hp > b.hp)) P.best[id] = { t: R.t, hp: R.hp };
    for (const g of KM.missionReward(M)) if (!P.got[g]) { P.got[g] = 1; fresh.push(g); }
    // mastery: three stars on every mission of a Crusade earns that Crusade's banner (replay goal, never required for the story)
    const C = KM.CRUSADES.find(c => c.id === M.cr), all = KM.MISSIONS.filter(x => x.cr === M.cr).every(x => P.stars[x.id] === 3);
    if (all && !P.got['banner:master_' + C.id]) { P.got['banner:master_' + C.id] = 1; fresh.push('banner:master_' + C.id); }
    return fresh; };
  // a merge of two progress copies (another device, account restore) keeps the best of both and never duplicates a reward
  KM.crusadeMerge = (a, b) => { const A = KM.crusadeValid(a), Bv = KM.crusadeValid(b); for (const id in Bv.stars) A.stars[id] = Math.max(A.stars[id] || 0, Bv.stars[id]);
    for (const id in Bv.best) if (!A.best[id] || Bv.best[id].t < A.best[id].t) A.best[id] = Bv.best[id]; for (const g in Bv.got) A.got[g] = 1; A.plays = Math.max(A.plays, Bv.plays); return A; };
  KM.crusadeTitles = P => KM.CRUSADE_TITLES.filter(t => P.got['title:' + t]);
})(typeof window !== 'undefined' ? window : globalThis);
