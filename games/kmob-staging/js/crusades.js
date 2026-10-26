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
  KM.FORMATION_WARN = { shieldwall: 'SHIELD LINE AHEAD', backline: 'ARCHER LINE AHEAD', flank: 'FLANKERS ON THE SIDES', siege: 'SIEGE ENGINES', swarm: 'SWARM INCOMING', column: 'COLUMN ON THE ROAD', elite: 'ELITE SQUAD', wedge: 'WEDGE ATTACK', support: 'HEALERS IN THE RANKS', convoy: 'RAIDER CONVOY' };   // mission arrival warnings
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
  KM.CRUSADE_UNLOCKS = [[5, 'melee'], [10, 'mizard'], [15, 'elite'], [25, 'giant']];   // Checkpoint F: each class is EARNED by beating an army of it
  KM.CRUSADE_POWERS = [[3, 'fortress'], [8, 'arrowstorm'], [13, 'elemental'], [20, 'linebreaker']];   // tank abilities, staged so each is learned before the finale (Linebreaker = the major tactical ability)
  KM.crusadeCap = n => 50 * Math.ceil(n / 5);   // army CAPACITY (points) by mission: 50 · 100 · … · 300; +50 for beating each Crusade
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
  KM.starText = s => s.k === 'loot' ? 'Your Looters deliver ' + s.v.toLocaleString('en-US') + ' Gold' : s.k === 'hp' ? 'Tank above ' + s.v + '% health' : s.k === 'time' ? 'Win within ' + Math.floor(s.v / 60) + ':' + String(s.v % 60).padStart(2, '0') : s.k === 'lost' ? 'Lose ' + s.v + ' soldiers or fewer'
    : s.k === 'col' ? (s.v ? 'Lose ' + s.v + ' Looter' + (s.v > 1 ? 's' : '') + ' or fewer' : 'No Looter lost') : s.k === 'gold' ? 'End with ' + s.v.toLocaleString('en-US') + ' Gold or more' : s.k === 'kills' ? 'Defeat ' + s.v + ' enemies' : '';
  KM.MISSIONS = [
    // ===== CAMPAIGN I · FALLEN KINGDOM · Crusade 1: BORDER RECLAMATION (army fundamentals · capacity 50 · Looter + Archer + tank) =====
    { n: 1, cr: 'border', name: 'LOOTER RAID', brief: 'Enemy looters raid the border road, led by their Chief. Grow your own Looter economy, shoot the raiders down and defeat the Looter Chief.', bank: 500,
      pool: ['raider'], sector: 'swarm', bossMul: { hp: 0.5 }, waves: [w(1, [['column', 0.45], ['column', 0.35, 6]]), w(2, [['flank', 0.5], ['line', 0.3, 5]]), B('raiderChief', 2)],
      s2: star('loot', 1000), s3: star('loot', 2000),
      tips: [{ on: 'start', text: 'Tap a soldier card to choose it. Looters gather Gold, Archers shoot.' }, { on: 't:6', text: 'Drag the tank left and right to aim its cannon.' },
        { on: 'wave:2', text: 'Raiders hunt your Looters. ATTACK sends your army forward, DEFEND keeps it by the tank.' }, { on: 'kills:12', text: 'Your Looters carry Gold home. Tap a selected card again to upgrade it.' },
        { on: 'boss', text: 'The Looter Chief! Focus him with Archers and the tank cannon.' }], reward: { title: 'FIRST COMMAND', banner: 'b_first' } },
    { n: 2, cr: 'border', name: 'HOLD THE LINE', brief: 'Swordsmen rush your Archers from the front and the flanks. Hold them at the tank and win the shooting war.', bank: 650,
      pool: ['grunt', 'runner'], waves: [w(2, [['wedge', 0.55]]), w(2, [['flank', 0.5], ['push', 0.3, 5]]), w(3, [['push', 0.5], ['flank', 0.35, 4]]), w(3, [['wedge', 0.45], ['flank', 0.4, 3]])],
      s2: star('lost', 20), s3: star('time', 150),
      tips: [{ on: 'start', text: 'No swordsmen yet. Keep Archers behind the tank and use DEFEND when the enemy charges.' }, { on: 'wave:2', text: 'Flankers come down the sides. Drag the tank to cover them.' }], reward: { banner: 'b_line' } },
    { n: 3, cr: 'border', name: 'ARCHER BATTALION', brief: 'An organised archer battalion shoots from behind a shield line. Break the shields, win the archery duel and defeat the Longbow Captain.', bank: 800,
      pool: ['archer', 'shield'], waves: [w(3, [['backline', 0.6]]), w(4, [['shieldwall', 0.5], ['backline', 0.35, 4]]), w(4, [['backline', 0.55], ['flank', 0.25, 5]]), B('longbow', 4, { f: [['boss', 0, 2.5], ['backline', 0.4, 3]] })],
      bossMech: 'hunt', phases: [{ at: 0.5, summon: 'backline', bud: 0.5, text: 'The Captain calls more archers!' }],
      s2: star('hp', 60), s3: star('lost', 25),
      tips: [{ on: 'start', text: 'Enemy archers outshoot a scattered army. ATTACK to close in, DEFEND to fall back behind the tank.' }, { on: 'boss', text: 'The Longbow Captain hits hard from range. The tank cannon reaches him.' }], reward: { power: 'fortress' } },
    { n: 4, cr: 'border', name: 'SUPPLY LINE', brief: 'Supplies are short and raiders hunt your Looters while swordsmen press the front. Protect your income to win.', bank: 450, goldMul: 0.6,
      pool: ['raider', 'grunt', 'runner'], bossMech: 'charge', bossMul: { hp: 1.7 }, waves: [w(4, [['flank', 0.45], ['column', 0.3, 4]]), w(4, [['push', 0.5]], { supply: true }), w(5, [['flank', 0.45], ['wedge', 0.4, 5]]), B('raiderChief', 5, { f: [['boss', 0, 2.5], ['flank', 0.4, 3]] })],
      s2: star('col', 6), s3: star('loot', 2500),
      tips: [{ on: 'start', text: 'Waves pay little here. Looters are your income: keep them alive.' }, { on: 'wave:2', text: 'FORTRESS SURGE repairs the tank and hardens the line. Use it when the tank is hurt.' }], reward: { banner: 'b_supply' } },
    { n: 5, cr: 'border', name: 'SWORD COMMANDER', brief: 'A sword army marches on the border under its Commander. Beat his swordsmen and break his charge to earn your own SWORD soldiers.', bank: 1000,
      pool: ['grunt', 'shield', 'spearman'], waves: [w(5, [['line', 0.5], ['wedge', 0.3, 5]]), w(6, [['shieldwall', 0.5], ['column', 0.35, 4]]), w(6, [['wedge', 0.45], ['flank', 0.35, 4]]), B('swordCmd', 6, { f: [['boss', 0, 2.5], ['shieldwall', 0.35, 3]] })],
      phases: [{ at: 0.6, summon: 'wedge', bud: 0.5, text: 'The Commander calls his guard!' }, { at: 0.3, enrage: 1.25, text: 'The Commander charges!' }],
      s2: star('hp', 50), s3: star('time', 240),
      tips: [{ on: 'start', text: 'Swordsmen beat a thin line. Mass your Archers and hold with DEFEND.' }, { on: 'boss', text: 'He charges in a straight line. Drag the tank aside and repair with FORTRESS SURGE.' }], reward: { unlock: 'melee', skin: 'cr_border', title: 'BORDER WARDEN' } },
    // ===== Crusade 2: CITADEL SIEGE (combined arms · capacity 100 · + Sword, Fortress Surge) =====
    { n: 6, cr: 'citadel', name: 'SIEGE LINES', brief: 'Cannons pound your army from behind a shield screen. Aim the tank at the guns and push through the shields.', bank: 900,
      pool: ['shield', 'grunt'], waves: [w(6, [['siege', 0.45], ['line', 0.35, 4]]), w(7, [['shieldwall', 0.45], ['siege', 0.4, 4]]), w(7, [['siege', 0.5], ['flank', 0.3, 5]]), B('longbow', 8, { f: [['boss', 0, 2.5], ['siege', 0.4, 3]] })], bossMech: 'hunt',
      s2: star('hp', 60), s3: star('time', 240),
      tips: [{ on: 'start', text: 'Cannons outrange your Archers. Drag the tank onto each gun.' }, { on: 'wave:2', text: 'Swordsmen break shield lines. Send them with ATTACK.' }], reward: { banner: 'b_cannon' } },
    { n: 7, cr: 'citadel', name: 'SHIELD AND SPEAR', brief: 'Shield lines advance with spear columns behind them. Time your attacks and do not let the spears reach your Archers.', bank: 1000,
      pool: ['shield', 'spearman', 'grunt'], waves: [w(7, [['shieldwall', 0.5], ['column', 0.35, 4]]), w(8, [['column', 0.45], ['wedge', 0.4, 5]]), w(8, [['shieldwall', 0.45], ['flank', 0.35, 4]]), B('swordCmd', 9, { f: [['boss', 0, 2.5], ['shieldwall', 0.4, 3], ['column', 0.3, 7]] })], bossMech: 'charge', bossMul: { hp: 0.8 },
      s2: star('lost', 40), s3: star('hp', 70),
      tips: [{ on: 'start', text: 'ATTACK when the shield line is close; DEFEND while the spears march.' }], reward: {} },
    { n: 8, cr: 'citadel', name: 'BROKEN GATE', brief: 'The gate falls and the enemy pours through from every side. Hold, recover your losses and counterattack.', bank: 1100,
      pool: ['grunt', 'runner', 'shield', 'spearman'], waves: [w(8, [['wedge', 0.5], ['flank', 0.3, 4, true]]), w(8, [['push', 0.45], ['flank', 0.35, 3]], { supply: true }), w(9, [['flank', 0.45, 0, true], ['wedge', 0.4, 5]]), B('raiderChief', 9, { f: [['boss', 0, 2.5], ['flank', 0.4, 3, true]] })], bossMech: 'charge', bossMul: { hp: 1.5 },
      s2: star('lost', 60), s3: star('col', 6),
      tips: [{ on: 'start', text: 'Enemies appear close to your line. Keep a ready front and replace losses fast.' }, { on: 'wave:3', text: 'FORTRESS SURGE repairs the tank. Save it for the worst moment.' }], reward: { banner: 'b_siege', power: 'arrowstorm' } },
    { n: 9, cr: 'citadel', name: 'HEALERS AT THE WALL', brief: 'Enemy healers keep their soldiers alive. Break through and kill the healers first, or the battle never ends.', bank: 1200,
      pool: ['grunt', 'shield', 'acolyte'], waves: [w(8, [['support', 0.55]]), w(9, [['support', 0.5], ['flank', 0.3, 5]]), w(9, [['shieldwall', 0.4], ['support', 0.45, 4]]), B('longbow', 10, { f: [['boss', 0, 2.5], ['support', 0.45, 3]] })], bossMech: 'hunt',
      s2: star('time', 230), s3: star('lost', 45),
      tips: [{ on: 'start', text: 'Healers in robes heal everyone near them. ARROW STORM and the tank cannon can reach them.' }], reward: {} },
    { n: 10, cr: 'citadel', name: 'MIZARD WARBAND', brief: 'The Mizard Lord leads a warband of healers and spellcasters. Kill the healers, then bring down the Lord to earn your own Mizards.', bank: 1400,
      pool: ['acolyte', 'grunt', 'shield'], waves: [w(9, [['support', 0.55]]), w(10, [['support', 0.5], ['backline', 0.3, 4]]), w(10, [['support', 0.45], ['flank', 0.35, 5]]), B('mizardLord', 10, { f: [['boss', 0, 2.5], ['support', 0.4, 3]] })], bossMul: { hp: 0.8 },
      phases: [{ at: 0.6, summon: 'support', bud: 0.5, text: 'The Lord calls his acolytes!' }, { at: 0.3, summon: 'support', bud: 0.5, near: true, text: 'Healers rise around him!' }],
      s2: star('hp', 50), s3: star('time', 280),
      tips: [{ on: 'start', text: 'Every robed caster heals. Kill them before the soldiers.' }, { on: 'boss', text: 'The Mizard Lord heals his warband. Kill his acolytes and the healing stops.' }], reward: { unlock: 'mizard', skin: 'cr_fallen', title: 'CITADEL BREAKER', campaign: 2 } },
    // ===== CAMPAIGN II · NIGHTFALL INVASION · Crusade 3: ZOMBIE OUTBREAK (capacity 150 · + Mizard) — the dead rise once =====
    { n: 11, cr: 'zombie', name: 'FIRST INFECTION', brief: 'The dead walk out of the night and rise again when they fall. Hold until they stay down.', bank: 1400, undead: 0.35, sector: 'swarm',
      pool: ['zombie', 'imp'], waves: [w(10, [['swarm', 0.5], ['line', 0.3, 4]]), w(11, [['blob', 0.5], ['swarm', 0.35, 4]]), w(11, [['push', 0.5], ['flank', 0.3, 5]]), B('wraith', 12, { boss: 'raiderChief', f: [['boss', 0, 2.5], ['swarm', 0.4, 3]] })],
      bossMech: 'hunt', bossMul: { hp: 3 }, s2: star('lost', 60), s3: star('time', 240),
      tips: [{ on: 'start', text: 'Fallen undead rise again at half health. Mizards keep your line standing.' }], reward: {} },
    { n: 12, cr: 'zombie', name: 'BROKEN SUPPLY', brief: 'You start nearly broke while the horde gathers. Rebuild with Looters before it peaks.', bank: 500, undead: 0.3, goldMul: 0.8,
      pool: ['zombie', 'imp', 'raider'], waves: [w(10, [['convoy', 0.4], ['swarm', 0.3, 4]]), w(11, [['blob', 0.5]]), w(11, [['swarm', 0.45], ['convoy', 0.3, 5]]), B('raiderChief', 12, { f: [['boss', 0, 2.5], ['push', 0.4, 3]] })],
      bossMech: 'charge', bossMul: { hp: 2 }, s2: star('loot', 3000), s3: star('col', 10),
      tips: [{ on: 'start', text: 'Only 500 Gold. Looters first, then soldiers.' }], reward: { banner: 'b_plague' } },
    { n: 13, cr: 'zombie', name: 'CORRUPTED HEALERS', brief: 'Necromancers keep the dead on their feet. Break the front and kill the corrupted healers.', bank: 1500, undead: 0.3,
      pool: ['zombie', 'necro', 'grunt'], waves: [w(11, [['support', 0.55]]), w(12, [['support', 0.45], ['swarm', 0.35, 4]]), w(12, [['support', 0.5], ['flank', 0.3, 5]]), B('mizardLord', 13, { f: [['boss', 0, 2.5], ['support', 0.4, 3]] })],
      bossMech: 'hunt', s2: star('time', 260), s3: star('lost', 60),
      tips: [{ on: 'start', text: 'Purple robes heal the dead. Target them first.' }], reward: { power: 'elemental' } },
    { n: 14, cr: 'zombie', name: 'LAST REINFORCEMENT', brief: 'Hold the gate for 3 minutes while the dead keep coming.', bank: 1600, undead: 0.4, goal: 'hold', hold: 180,
      pool: ['zombie', 'imp', 'wraith'], waves: [w(12, [['blob', 0.5]]), w(12, [['swarm', 0.45], ['flank', 0.3, 5]]), w(13, [['push', 0.5], ['flank', 0.3, 4, true]]), B('swordCmd', 13, { f: [['boss', 0, 2.5], ['blob', 0.4, 3]] })],
      bossMech: 'charge', s2: star('hp', 50), s3: star('lost', 80),
      tips: [{ on: 'start', text: 'Survive until the timer runs out. Replace losses before the line breaks.' }], reward: {} },
    { n: 15, cr: 'zombie', name: 'ELITE LEGION', brief: 'Armoured legionaries march in disciplined ranks behind their Elite Captain. Break the legion to earn your own Elites.', bank: 2000,
      pool: ['knight', 'shield', 'spearman'], waves: [w(12, [['shieldwall', 0.5], ['column', 0.3, 4]]), w(13, [['elite', 0.5], ['shieldwall', 0.3, 5]]), w(13, [['column', 0.45], ['elite', 0.4, 4]]), B('eliteCaptain', 14, { f: [['boss', 0, 2.5], ['shieldwall', 0.4, 3]] })],
      bossMul: { hp: 0.6 }, phases: [{ at: 0.5, summon: 'elite', bud: 0.5, text: 'The Captain calls his guard!' }],
      s2: star('hp', 45), s3: star('time', 300),
      tips: [{ on: 'start', text: 'Armour shrugs off weak hits. Upgrade damage and use the tank on the officers.' }, { on: 'boss', text: 'The Elite Captain charges. Move the tank and brace with DEFEND.' }], reward: { unlock: 'elite', skin: 'cr_outbreak', title: 'OUTBREAK SURVIVOR' } },
    // ===== Crusade 4: HAUNTED LEGION (capacity 200 · + Elite, Elemental Wave) — spectres strike close to the line =====
    { n: 16, cr: 'haunted', name: 'HAUNTED GATE', brief: 'Wraiths appear out of the mist right next to your line. Keep a ready front at all times.', bank: 2000,
      pool: ['wraith', 'zombie', 'shield'], waves: [w(13, [['flank', 0.45, 0, true]]), w(13, [['shieldwall', 0.4], ['flank', 0.35, 4, true]]), w(14, [['column', 0.45, 0, true], ['swarm', 0.3, 5]]), B('swordCmd', 14, { f: [['boss', 0, 2.5], ['flank', 0.4, 3, true]] })],
      bossMech: 'hunt', s2: star('lost', 70), s3: star('hp', 55),
      tips: [{ on: 'start', text: 'Ghosts appear close to your army. Elites hold the line while Archers fire.' }], reward: {} },
    { n: 17, cr: 'haunted', name: 'SILENCED HEALERS', brief: 'Wraiths dive at your Mizards. Protect your healers and win the long fight.', bank: 2100,
      pool: ['wraith', 'necro', 'zombie'], waves: [w(14, [['flank', 0.5]]), w(14, [['support', 0.45], ['flank', 0.35, 4]]), w(15, [['flank', 0.45, 0, true], ['support', 0.4, 5]]), B('longbow', 15, { f: [['boss', 0, 2.5], ['flank', 0.4, 3]] })],
      bossMech: 'hunt', s2: star('hp', 50), s3: star('lost', 70),
      tips: [{ on: 'start', text: 'Flankers dive the back rows. DEFEND pulls the army in around your Mizards.' }], reward: {} },
    { n: 18, cr: 'haunted', name: 'NIGHT WATCH', brief: 'Threats come from every side through the night. React with the tank, formations and abilities.', bank: 2200,
      pool: ['wraith', 'zombie', 'necro', 'bomber', 'shield'], waves: [w(14, [['flank', 0.4], ['line', 0.3, 3, true]]), w(15, [['support', 0.45], ['swarm', 0.3, 4]]), w(15, [['siege', 0.35], ['flank', 0.35, 4, true]]), B('eliteCaptain', 16, { f: [['boss', 0, 2.5], ['mixed', 0.4, 3, true]] })],
      bossMul: { hp: 0.5 }, s2: star('lost', 90), s3: star('time', 280),
      tips: [{ on: 'start', text: 'Bombers explode on contact. Shoot them before they reach the line.' }], reward: { banner: 'b_watch' } },
    { n: 19, cr: 'haunted', name: 'LONG RETREAT', brief: 'Fall back and survive 3½ minutes. Strike only when the legion breaks.', bank: 2300, goal: 'hold', hold: 210,
      pool: ['zombie', 'shield', 'knight', 'wraith'], waves: [w(15, [['line', 0.5]]), w(15, [['shieldwall', 0.45, 0, true]]), w(16, [['elite', 0.5], ['flank', 0.3, 4, true]]), B('eliteCaptain', 16, { f: [['boss', 0, 2.5], ['shieldwall', 0.4, 3]] })],
      bossMul: { hp: 0.35 }, s2: star('hp', 45), s3: star('kills', 400),
      tips: [{ on: 'start', text: 'DEFEND keeps the army alive; ATTACK when a wave thins out.' }], reward: {} },
    { n: 20, cr: 'haunted', name: 'PHANTOM COMMANDER', brief: 'The Phantom Commander leads the legion from behind ghostly shield lines. Endure every phase and counterattack.', bank: 2800,
      pool: ['shield', 'knight', 'necro', 'wraith'], emod: { '*': { hp: 1.1 } }, waves: [w(16, [['backline', 0.45, 0, true]]), w(17, [['elite', 0.5], ['support', 0.3, 4]]), w(17, [['shieldwall', 0.45, 0, true], ['flank', 0.3, 4, true]]), B('colossus', 18)],
      bossMul: { hp: 0.6, dmg: 0.8 }, phases: [{ at: 0.7, summon: 'shieldwall', bud: 0.5, near: true, text: 'A ghost shield line rises!' }, { at: 0.45, summon: 'support', bud: 0.5, near: true, text: 'Phantom healers!' }, { at: 0.15, enrage: 1.25, text: 'The Commander rages!' }],
      s2: star('hp', 40), s3: star('time', 300),
      tips: [{ on: 'boss', text: 'The Colossus stomps clusters. Spread out, then strike with ELEMENTAL WAVE.' }], reward: { power: 'linebreaker', skin: 'cr_nightfall', title: 'NIGHT WATCH', campaign: 3 } },
    // ===== CAMPAIGN III · CHAOS WARS · Crusade 5: KILLER CARNIVAL (capacity 250 · + Linebreaker) — a new act every wave =====
    { n: 21, cr: 'carnival', name: 'CHAOS PARADE', brief: 'Every wave is a different act. Read each one and adapt.', bank: 2600,
      waves: [w(16, [['mixed', 0.6]], { chaos: [['jester', 'imp'], ['strongman', 'shield'], ['archer', 'jester']] }), w(17, [['blob', 0.6]], { chaos: [['jester', 'bomber'], ['strongman', 'spearman'], ['archer', 'necro']] }),
        w(17, [['push', 0.6]], { chaos: [['jester', 'wraith'], ['strongman', 'knight'], ['archer', 'jester']] }), B('strongman', 18, { boss: 'swordCmd', f: [['boss', 0, 2.5], ['mixed', 0.4, 3]], pool: ['jester', 'strongman'] })],
      bossMech: 'charge', bossMul: { hp: 2 }, s2: star('lost', 90), s3: star('time', 260),
      tips: [{ on: 'start', text: 'Fast acts need a wall; armoured acts need the cannon; archer acts need ATTACK.' }], reward: {} },
    { n: 22, cr: 'carnival', name: 'FALSE OPENING', brief: 'Weak bait acts hide strong follow-ups. Attack only when it is safe.', bank: 2700,
      pool: ['jester', 'strongman', 'imp', 'bomber'], waves: [w(15, [['line', 0.3], ['elite', 0.5, 8]]), w(16, [['swarm', 0.3], ['wedge', 0.5, 8, true]]), w(17, [['line', 0.25], ['elite', 0.55, 9]]), B('strongman', 18, { boss: 'raiderChief', f: [['boss', 0, 2.5], ['push', 0.3, 7]] })],
      bossMech: 'charge', bossMul: { hp: 5 }, s2: star('hp', 50), s3: star('lost', 80),
      tips: [{ on: 'start', text: 'The first group is bait. Hold with DEFEND until the real attack shows.' }], reward: {} },
    { n: 23, cr: 'carnival', name: 'CROSSFIRE', brief: 'Cannons on one side, archers on the other, jesters in between. Retarget the tank between threats.', bank: 2800,
      pool: ['archer', 'cannon', 'jester', 'shield'], waves: [w(17, [['siege', 0.45], ['backline', 0.35, 3]]), w(17, [['backline', 0.5], ['flank', 0.3, 4]]), w(18, [['siege', 0.45], ['flank', 0.3, 4]]), B('longbow', 19, { f: [['boss', 0, 2.5], ['backline', 0.4, 3]] })],
      bossMech: 'hunt', bossMul: { hp: 2 }, s2: star('hp', 45), s3: star('time', 260),
      tips: [{ on: 'start', text: 'Drag the tank toward each cannon in turn. Archers handle the enemy archers.' }], reward: { banner: 'b_crossfire' } },
    { n: 24, cr: 'carnival', name: 'THE GRAND ACT', brief: 'A huge show with a tight budget. Spend on what wins.', bank: 2000, goldMul: 0.75,
      waves: [w(18, [['blob', 0.6]], { chaos: [['jester', 'shield'], ['imp', 'wraith']] }), w(18, [['mixed', 0.6]], { chaos: [['strongman', 'spearman'], ['archer', 'bomber']], supply: true }),
        w(19, [['wedge', 0.5], ['mini', 0, 5]], { chaos: [['jester', 'knight'], ['wraith', 'imp']] }), B('strongman', 19, { boss: 'swordCmd', f: [['boss', 0, 2.5], ['elite', 0.4, 3]], pool: ['strongman', 'knight'] })],
      bossMech: 'charge', bossMul: { hp: 1.6 }, s2: star('gold', 3000), s3: star('lost', 90),
      tips: [{ on: 'start', text: 'Waves pay less here. Upgrades often beat more soldiers.' }], reward: {} },
    { n: 25, cr: 'carnival', name: 'GIANT UPRISING', brief: 'Carnival giants march in towering formations under the Giant Lord. Topple them to earn your own Giants.', bank: 3200,
      pool: ['strongman', 'shield', 'spearman'], waves: [w(18, [['mini', 0, 0], ['line', 0.4, 3]]), w(19, [['wedge', 0.45], ['mini', 0, 4]]), w(19, [['mini', 0, 0], ['mini', 0, 5], ['column', 0.35, 2]]), B('giantLord', 20, { f: [['boss', 0, 2.5], ['mini', 0, 4], ['line', 0.3, 3]] })],
      bossMul: { hp: 0.36, dmg: 0.8 }, limit: 330, phases: [{ at: 0.66, summon: 'mini', text: 'A giant answers the Lord!' }, { at: 0.33, summon: 'wedge', bud: 0.5, text: 'The Lord calls his strongmen!' }],
      s2: star('hp', 40), s3: star('time', 300),
      tips: [{ on: 'start', text: 'Giants stomp clusters. Spread with ATTACK, regroup with DEFEND.' }, { on: 'boss', text: 'The Giant Lord stomps hard. Hit him with LINEBREAKER when he lines up.' }], reward: { unlock: 'giant', skin: 'cr_ringmaster', title: 'RINGBREAKER' } },
    // ===== Crusade 6: IRON UPRISING (capacity 300 · full army) — the Iron King's machine army =====
    { n: 26, cr: 'iron', name: 'IRON WALL', brief: 'Machine soldiers march in armoured ranks. Break them with upgraded damage and your Giants.', bank: 3000,
      pool: ['automaton', 'shield', 'knight'], waves: [w(19, [['shieldwall', 0.5]]), w(20, [['elite', 0.5], ['column', 0.3, 4]]), w(20, [['column', 0.45], ['shieldwall', 0.35, 5]]), B('swordCmd', 21, { f: [['boss', 0, 2.5], ['elite', 0.4, 3]] })],
      bossMech: 'charge', s2: star('lost', 100), s3: star('hp', 55),
      tips: [{ on: 'start', text: 'Armour shrugs off light hits. Upgrade damage and bring Giants.' }], reward: {} },
    { n: 27, cr: 'iron', name: 'HAMMERFALL', brief: 'Giants and strongmen march while jesters dive your support. Time your Giants; guard the rear.', bank: 3200,
      pool: ['jester', 'strongman', 'automaton'], waves: [w(20, [['mini', 0, 0], ['flank', 0.4, 3]]), w(20, [['wedge', 0.5], ['mini', 0, 5]]), w(21, [['flank', 0.5], ['mini', 0, 4]]), B('giantLord', 21, { f: [['boss', 0, 2.5], ['flank', 0.4, 3]] })],
      bossMul: { hp: 0.4 }, s2: star('hp', 50), s3: star('col', 10),
      tips: [{ on: 'start', text: 'Giants stomp clusters. Spread out with ATTACK, regroup with DEFEND.' }], reward: {} },
    { n: 28, cr: 'iron', name: 'LAST GOLD', brief: 'The treasury is nearly empty. Every coin counts against the machine army.', bank: 1500, goldMul: 0.6,
      pool: ['automaton', 'grunt', 'archer'], emod: { '*': { arm: 6 } }, waves: [w(19, [['line', 0.5], ['convoy', 0.3, 4]]), w(20, [['mixed', 0.5]], { supply: true }), w(20, [['shieldwall', 0.5]]), B('longbow', 21, { f: [['boss', 0, 2.5], ['backline', 0.4, 3]] })],
      bossMech: 'hunt', bossMul: { hp: 1.5 }, s2: star('gold', 2000), s3: star('lost', 90),
      tips: [{ on: 'start', text: 'Looters early pay back many times. Do not overbuild.' }], reward: { banner: 'b_lastgold' } },
    { n: 29, cr: 'iron', name: 'FINAL FORMATION', brief: 'Every enemy type at once. Use every class and ability you have earned.', bank: 3500,
      pool: ['automaton', 'jester', 'strongman', 'wraith', 'necro', 'archer', 'knight', 'zombie'], waves: [w(21, [['mixed', 0.6]]), w(22, [['support', 0.4], ['flank', 0.35, 4]]), w(22, [['elite', 0.45], ['siege', 0.35, 5]]), B('eliteCaptain', 23, { f: [['boss', 0, 2.5], ['mixed', 0.4, 3, true]] })],
      bossMul: { hp: 0.6 }, s2: star('lost', 120), s3: star('time', 300),
      tips: [{ on: 'start', text: 'No single answer works. Mix classes and switch posture often.' }], reward: {} },
    { n: 30, cr: 'iron', name: 'IRON KING', brief: 'The Iron King marches with his whole machine army. Win the final battle of the Crusades.', bank: 4000,
      pool: ['automaton', 'knight', 'cannon', 'strongman'], emod: { '*': { arm: 2 } }, waves: [w(22, [['siege', 0.45], ['elite', 0.35, 4]]), w(23, [['mixed', 0.6]]), w(24, [['elite', 0.5], ['mini', 0, 5]]), B('ironKing', 25)],
      bossMul: { hp: 0.3, dmg: 0.8 }, phases: [{ at: 0.75, summon: 'siege', bud: 0.5, text: 'The Iron King calls his cannons!' }, { at: 0.5, summon: 'mini', text: 'A giant champion joins!' }, { at: 0.3, summon: 'elite', bud: 0.6, near: true, text: 'The royal machine guard!' }, { at: 0.12, enrage: 1.3, text: 'The Iron King rages!' }],
      s2: star('hp', 35), s3: star('time', 300),
      tips: [{ on: 'boss', text: 'Four phases. Save FORTRESS SURGE for the last one.' }], reward: { skin: 'cr_ironking', title: 'IRON CONQUEROR', grand: 'GRAND CRUSADER' } }];
  const BOSS_NAMES = { 1: 'LOOTER CHIEF', 3: 'LONGBOW CAPTAIN', 4: 'RAIDER CHIEF', 5: 'SWORD COMMANDER', 6: 'SIEGE CAPTAIN', 7: 'SPEAR CAPTAIN', 8: 'GATE BREAKER', 9: 'WALL WARDEN', 10: 'MIZARD LORD', 11: 'PLAGUE RUNNER', 12: 'SCAVENGER KING', 13: 'NECROMANCER', 14: 'GRAVE KNIGHT', 15: 'ELITE CAPTAIN', 16: 'MIST REAVER', 17: 'SHADOW ARCHER', 18: 'NIGHT CAPTAIN', 19: 'LEGION CAPTAIN', 20: 'PHANTOM COMMANDER', 21: 'RINGMASTER', 22: 'THE BAIT MASTER', 23: 'CROSSBOW KING', 24: 'GRAND STRONGMAN', 25: 'GIANT LORD', 26: 'IRON FOREMAN', 27: 'HAMMER LORD', 28: 'TOLL KEEPER', 29: 'MARSHAL OF IRON', 30: 'IRON KING' };   // the boss bar shows the story name, not the model's
  KM.MISSIONS.forEach(M => { if (BOSS_NAMES[M.n]) M.bossName = BOSS_NAMES[M.n]; if (!M.limit) M.limit = 480; M.cap = KM.crusadeCap(M.n); if (M.n % 5 === 0 && M.n < 30) M.reward = Object.assign({}, M.reward, { cap: KM.crusadeCap(M.n + 1) });   // limit: no endless stalemates (after 8 battle minutes the enemy holds the field; normal battles end in 1–5 min)
    M.id = 'm' + M.n; M.camp = KM.CRUSADES.find(c => c.id === M.cr).c; M.goal = M.goal || 'waves'; });
  // BALANCE (tests/crusades-tune.js, reference bot on two seeds): wave strength `mul` and boss damage `bdmg` per mission
  KM.MISSION_TUNE = {   // tuned 2026-10-24 (tests/crusades-tune.js); M17 eased 2.4 → 2.0 after a seed loss
    1: {mul: 0.45}, 2: {mul: 0.8}, 3: {mul: 1}, 4: {mul: 1}, 5: {mul: 2}, 14: {mul: 0.8},   // Checkpoint F (tests/crusades-tune-f.js + crusades-probe.js): bot wins every seed; from M3 passive/single lose
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
    return Object.assign({ seed: 0x6b6d0b + M.n * 7919, bossGold: 2000 + 300 * M.n }, M, { allow, powers: KM.crusadePowers(P), mul: T.mul ?? 1, bossMul, goldMul: T.goldMul ?? M.goldMul, bank: T.bank ?? M.bank,
      s2: Object.assign({}, s2, { text: KM.starText(s2) }), s3: Object.assign({}, s3, { text: KM.starText(s3) }) }); };
  KM.missionOpts = (rules, station) => ({ seed: rules.seed, mission: rules, chant: KM.DAILY && KM.DAILY.STATIONS.includes(station) ? station : null,
    equip: rules.powers, powerLv: {}, skins: {}, buffs: { cls: {}, tank: {} }, cons: {}, loadout: {}, mercTier: 1, plan: KM.emptyPlan() });
  // result + stars from the finished battle (1 star = victory; 2 and 3 = the mission's mastery objectives, each judged on its own)
  KM.missionResult = (sim, rules) => { const hp = Math.round(100 * Math.max(0, sim.L.hp) / sim.stats.maxHp), win = !!sim.won && sim.alive;
    const R = { win, t: Math.round(sim.t), hp, lost: sim.lost, col: sim.lostCol, gold: Math.floor(sim.coins), loot: Math.floor(sim.colCoins || 0), kills: sim.kills, waves: sim.cleared, capPeak: sim.mCapPeak || 0 };
    const met = s => !!s && (s.k === 'hp' ? hp >= s.v : s.k === 'time' ? R.t <= s.v : s.k === 'lost' ? R.lost <= s.v : s.k === 'col' ? R.col <= s.v : s.k === 'gold' ? R.gold >= s.v : s.k === 'kills' ? R.kills >= s.v : s.k === 'loot' ? R.loot >= s.v : false);
    R.m2 = win && met(rules.s2); R.m3 = win && met(rules.s3); R.stars = win ? 1 + (R.m2 ? 1 : 0) + (R.m3 ? 1 : 0) : 0; return R; };
  // apply a result: stars only go up; every reward id is granted exactly once (idempotent across replays, reloads and merges)
  KM.missionReward = M => { const r = M.reward || {}, out = [];
    if (r.unlock) out.push('unlock:' + r.unlock); if (r.power) out.push('power:' + r.power); if (r.skin) out.push('skin:' + r.skin);
    if (r.cap) out.push('cap:' + r.cap); if (r.title) out.push('title:' + r.title); if (r.banner) out.push('banner:' + r.banner); if (r.campaign) out.push('campaign:' + r.campaign); if (r.grand) out.push('title:' + r.grand);
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
