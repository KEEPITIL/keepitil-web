/* KWBattle -- the K WARS 1 production adapter for the canonical soldier foundation (THIS IS THE CANONICAL STANDARD, Candidate 4).
   Every real battle runs ONE KW_FOUNDATION.World. Production keeps the GAME RULES (economy, prices, population, unit stats, era
   weapon data, enemy multipliers, fortress/gate HP, waves, campaign, saves); the foundation owns SOLDIER BEHAVIOUR (locomotion,
   slots, moving-slot tracking, ordered entry, Attack/Defend/March/Retreat, role from equipment, spear->sword, shields, lanes, queues,
   weapon distance, casualty fill, ranged protection). Nothing in production writes a soldier's position, slot, target, facing or role.
     coordinates  native production pixels: the World is given production's battlefield (lanes = the canonical 4 rows / 18 px,
                  placed in the ground band; bounds = wall to wall). No translation layer exists.
     creation     makeSoldier() -- the ONE factory. Humans of every era enter through the canonical corridors (enlist).
     commands     setMode() -- the ONE command door for the player; enemyController() issues the enemy's commands.
     damage       production damage into soldiers goes through world.damage (hurt() forwards); production modifiers live in damageHook.
     events       pump() turns foundation events into production consequences (bounty, stats, fx, audio, tutorial flags).
     garrison     garrison() heals in the fort band and hands archers to the wall (world.detach) and back (world.enlistUnit).
     large units  giants / the Aetherwing mech are noSlot+noAuto bodies: the foundation moves them, largeBrain() aims and strikes. */
(function(){
'use strict';
const F = window.KW_FOUNDATION, T = F.T;
const LANES = T.LANES.map(y => y + 30);                     // 434 452 470 488: the canonical rows, inside GROUND 424..506
const SPAWN_OF = { sword: 'sword', esword: 'sword', spear: 'spear', espear: 'spear', spartan: 'spear', archer: 'archer', earcher: 'archer', gunner: 'archer', egunner: 'archer', eboss: 'sword' };
const isSoldier = u => !!(u && u.eq && !u.large);

/* ------------------------------------------------------------------ world ---------------------------------------------- */
/* FIELD CAPACITY (2026-10-09, owner flag 6): the canonical 4-row formation cannot stand more than ~100 soldiers per side on the 1850 px
   field (500 would need ~3750 px: places off the field, a jammed gate, a queue that never drains). The campaign's army CAP is unchanged
   (you own up to 500); at most FIELD_CAP stand on the field at once, the rest wait in the RESERVE and march in as places open. */
const FIELD_CAP = 100;
function fieldCount(team){ return S.W ? S.units.filter(u => u.team === team && u.alive && !u.large).length + S.W.queue[team].length : 0; }
function recruit(type, opts){
  if (fieldCount(1) >= FIELD_CAP){ S.reserveSeq = (S.reserveSeq || 0) + 1; (S.reserve1 = S.reserve1 || []).push({ type, owner: opts && opts.owner, id0: 'r' + S.reserveSeq }); return null; }
  return makeSoldier(1, type, opts);
}
function releaseReserve(){
  const R = S.reserve1; if (!R || !R.length || S.retreatMode) return;
  while (R.length && fieldCount(1) < FIELD_CAP){ const r = R.shift(), u = makeSoldier(1, r.type, { owner: r.owner }); if (u && u.k) u.k.origId = r.id0; }
}
function begin(){
  const gate = { id: 'gate', ext: true, team: 1, x: P_WALL, hx: 12, alive: true, takeDamage: (d) => dmgGate(d) };
  const castle = { id: 'castle', ext: true, team: -1, x: E_WALL, hx: 18, alive: false, takeDamage: (d) => dmgCastle(d) };
  S.gateExt = gate; S.castleExt = castle;
  S.startRally1 = S.rallyX;   // where the player's army forms at the start; a destroyed army re-forms here (regroup)
  S.W = new F.World({ seed: (S.randomSeed >>> 0) || 1, lanes: LANES, bounds: { MIN: P_WALL + 12, MAX: E_WALL - 18 },
    anchor1: S.rallyX, anchor2: S.enemyRallyX, home1: P_SPAWN + T.ENTRY_GAP + 14, home2: E_WALL - 70, entry1: P_SPAWN, entry2: E_SPAWN,
    externals: [gate, castle], damageHook });
  S.W.seededFrom = S.randomSeed; S.reserve1 = []; S.order1 = null;
  S.units = S.W.units;                                       // THE roster: the same array, never reassigned
  S.soldierDeaths = new Set();
}
function syncExternals(){
  if (!S.W) return;
  const sealed = !S.folkSiege && !S.finalSiege && !S.campaignMissionId;   // Endless: the enemy castle is impregnable outside a siege
  S.gateExt.alive = S.gateHP > 0;
  S.castleExt.alive = !sealed && S.castleHP > 0 && (!S.campaignMissionId || S.phase === 'siege');
}

/* --------------------------------------------------------------- the factory ------------------------------------------- */
function rangedFam(prodType, team){
  const w = (TYPES[prodType] || {}).weapon; if (w !== 'bow' && w !== 'gun') return null;
  const era = Math.max(1, Math.min(15, team === 1 ? (S.civ || 1) : (S.enemyCiv || 1)));
  return RANGED_FAMILIES[(w === 'bow' ? ERA_RANGED : ERA_GUN)[era]];
}
/* opts: { owner, boss fields, deploy:true (before battle) } -- returns the soldier, already queued at his gate */
function makeSoldier(team, prodType, opts){
  opts = opts || {};
  const TT = TYPES[prodType === 'spartan' ? 'spear' : prodType]; if (!TT) return null;
  const civ = team === 1 ? (S.civ || 1) : (S.enemyCiv || 1);
  const neutral = { damage: 1, hp: 1, shield: 1, armor: 1, speed: 1, acceleration: 1, attackSpeed: 1, range: 1, rangedResist: 0, meleeResist: 0, explosionResist: 0, items: [] };
  let hp, dmg, prot, eq = neutral;
  if (team === 1){
    eq = window.KWEquipment?.modifiersFor?.(TT.role, civ) || neutral;
    const m = prodType === 'spartan' ? civMult() : civMult() * progression().combatMultiplier;
    hp = Math.round(TT.hp * m * eq.hp);
    dmg = Math.round(TT.dmg * m * eq.damage * (prodType === 'spartan' ? 1 : (window.KWWarCouncil?.damageMultiplier?.() || 1)));
    prot = unitProtection(prodType === 'spartan' ? 'spear' : prodType, 1); prot.shield = Math.round(prot.shield * eq.shield); prot.armor = Math.round(prot.armor * eq.armor);
  } else {
    const bossScale = opts.bossScale || 1;
    hp = Math.round(TT.hp * globalEnemyHealthMult() * bossScale);
    dmg = Math.round(TT.dmg * globalEnemyDamageMult() * (prodType === 'eboss' ? 1 + (bossScale - 1) * .35 : 1));
    prot = unitProtection(prodType, -1);
  }
  const spawnType = SPAWN_OF[prodType], role = spawnType === 'archer' ? 'RANGED' : spawnType === 'spear' ? 'SPEARMAN' : 'SWORDSMAN', A = T.ATK[role];
  const fam = rangedFam(prodType, team);
  let cd = TT.cd / (eq.attackSpeed || 1), rangeR, projKind, rigCls, gunKind;
  if (fam){
    cd *= fam.cdMult; dmg = Math.round(dmg * fam.dmgMult);
    rangeR = TT.range * fam.rangeMult * (eq.range || 1); if (team === -1) rangeR = Math.min(rangeR, ENEMY_RANGE_CAP);
    projKind = fam.proj === 'bolt' ? 'quarrel' : fam.proj;   // production 'bolt' is the wizards' homing magic
    if (fam.anim !== 'bow'){ rigCls = 'gun'; gunKind = fam.anim === 'xbow' ? 'xbow' : undefined; }
  }
  const kit = { shield: prot.shield > 0, hp, maxHp: hp, shieldHP: prot.shield, shieldMax: prot.shield, armorHP: prot.armor, armorMax: prot.armor,
    atkDmg: dmg, atkCdMul: Math.max(0.05, (cd - A.end) / A.cd), throwDmg: Math.round(dmg * 1.35), speedMul: eq.speed || 1,
    k: { prodType, owner: opts.owner, fam: fam && fam.id, rigCls, gunKind, bounty: TT.gold || 0, civ, equipMods: eq } };
  if (rangeR !== undefined){ kit.rangeR = rangeR; kit.projKind = projKind; }
  const u = opts.deploy ? S.W.deploy(team, [[spawnType, kit]])[0] : S.W.enlist(team, spawnType, kit);
  /* production labels (never behaviour): cost/bounty/tint/stats/UI read these */
  u.type = prodType === 'spartan' ? 'spear' : prodType; u.max = hp; u.dmg = dmg; u.owner = opts.owner; u.equipMods = eq;
  for (const f of ['bossTier', 'boss', 'bossName', 'tags', 'folkloreName']) if (opts[f] !== undefined) u[f] = opts[f];
  return u;
}
/* giants / mech: the foundation moves them (one integrator), the brain aims and strikes. They have no formation place and never
   become alternate soldiers: ordinary soldiers fight them as enemies through the normal lanes. */
function makeLarge(team, prodType, opts){
  const TT = TYPES[prodType]; opts = opts || {};
  const hp = Math.round(TT.hp * (team === 1 ? civMult() : globalEnemyHealthMult() * (opts.bossScale || 1)));
  const dmg = Math.round(TT.dmg * (team === 1 ? civMult() : globalEnemyDamageMult()));
  const prot = unitProtection(prodType, team);
  const kit = { shield: false, hp, maxHp: hp, shieldHP: 0, shieldMax: 0, armorHP: prot.armor + prot.shield, armorMax: prot.armor + prot.shield,
    noSlot: true, noAuto: true, bodyHX: prodType === 'aetherwing' ? 16 : 14, bodyHY: 6, k: { prodType, bounty: TT.gold || 0 } };
  const u = S.W.spawn(team, 'sword', team === 1 ? P_SPAWN : E_SPAWN, LANES[1] + 9, kit);
  u.large = true; u.type = prodType; u.max = hp; u.dmg = dmg; u.range = TT.range; u.cdBase = TT.cd; u.cdT = 1; u.anim = 0; u.face = team;
  for (const f of ['bossTier', 'boss', 'bossName', 'tags', 'folkloreName', 'folkLord']) if (opts[f] !== undefined) u[f] = opts[f];
  return u;
}
/* SPECIAL BODIES (giants / folk lords / the Aetherwing mech). Why exceptional: not humanoid soldiers -- no formation place, a large
   body, special weapons. Movement owner: the foundation integrator (u.goal, body size via E4). Target owner: this brain (nearest
   enemy body, else the enemy wall). Damage: World.damage for bodies, the wall's own takeDamage for structures. Ordinary soldiers
   fight them through their normal lanes (they are enemy units); nothing here moves a soldier. */
function largeBrain(dt){
  for (const u of S.units){
    if (!u.large) continue;
    u.ph = (u.ph || 0) + dt;
    if (!u.alive){ u.t = u.deathT; continue; }                                   // the corpse clock the special art reads
    u.cdT -= dt; u.anim = Math.max(0, u.anim - dt * 2.5); u.jumpSlashT = Math.max(0, (u.jumpSlashT || 0) - dt);
    u.pose = u.gaitState === 'IDLE' || u.gaitState === 'STOP' ? 'idle' : 'walk'; u.walkPhase = u.gait * Math.PI * 2;   // pose explained by measured motion
    let best = null, bd = 1e9;
    for (const e of S.units) if (e.alive && e.team !== u.team && !e.entering){ const d = Math.hypot(e.x - u.x, (e.y - u.y) * 1.6); if (d < bd){ bd = d; best = e; } }
    const wallX = u.team === 1 ? E_WALL : P_WALL, wall = u.team === 1 ? S.castleExt : S.gateExt;
    if (best && bd <= u.range + 40){
      u.goal = { x: u.x, y: u.y }; u.face = best.x >= u.x ? 1 : -1;
      if (u.cdT <= 0){ u.cdT = u.cdBase; u.anim = 1;
        if (u.type === 'aetherwing'){   // the mech's weapon (ported from the legacy unitFire 'mech' branch)
          if (bd < 72){ S.W.damage(best, Math.round(u.dmg * 1.25), u.x, u, 'melee'); u.jumpSlashT = .45; }
          else {
            const ts = S.units.filter(o => o.alive && o.team !== u.team && !o.entering).sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y)).slice(0, (u.powerReserve || 0) > 0 ? 5 : 2);
            if ((u.powerReserve || 0) > 0 && ts.length >= 4){ u.powerReserve--; addFloat(u.x, u.y - 80, 'RESERVE BARRAGE!', '#79e8ff'); }
            for (const o of ts){ S.fx.push({ kind: 'beam', x1: u.x + u.face * 22, y1: u.y - 42, x2: o.x, y2: o.y - 18, t: 0, team: u.team }); S.W.damage(o, Math.round(u.dmg / (ts.length > 2 ? 1.65 : 1)), u.x, u, 'laser'); }
            snd.laser();
          }
        } else {                        // a giant's slam: everyone in the impact area
          for (const e of S.units) if (e.alive && e.team !== u.team && Math.abs(e.x - best.x) < 36 && Math.abs(e.y - best.y) < 26) S.W.damage(e, u.dmg, u.x, u, 'blast');
        }
      }
    } else if (wall.alive){
      const stand = wallX - u.team * Math.max(30, Math.min(u.range, 90));
      u.goal = { x: stand, y: u.y }; u.face = u.team;
      if (Math.abs(stand - u.x) < 12 && u.cdT <= 0){ u.cdT = u.cdBase; u.anim = 1; wall.takeDamage(u.dmg, u.x, u, 'blast'); if (u.type === 'aetherwing'){ S.fx.push({ kind: 'beam', x1: u.x + u.face * 22, y1: u.y - 42, x2: wallX, y2: u.y - 40, t: 0, team: u.team }); snd.laser(); } }
    } else if (best){ u.goal = { x: best.x - u.team * Math.max(20, Math.min(u.range, 60)), y: best.y }; u.face = best.x >= u.x ? 1 : -1; }
    else u.goal = { x: u.x, y: u.y };
    const B = S.W.bounds, hx = u.bodyHX || 14; u.goal.x = Math.max(B.MIN + hx, Math.min(B.MAX - hx, u.goal.x));   // a large body's goal stays on the field: a giant that stood behind its own wall could never be reached and screened the castle for ever
  }
}
/* --------------------------------------------------------------- commands ---------------------------------------------- */
const MODE_OF = { attack: 'ATTACK', defend: 'DEFEND', march: 'MARCH' };
function setMode(team, mode){ if (!S.W) return; if (team === 1) S.order1 = mode; if (S.W.teams[team].mode !== mode) S.W.command(team, mode); }
/* BESIEGED GATE (owner decision 2026-10-09): recruits wait while enemies physically hold the gate mouth -- and the player is TOLD so,
   once per siege of the gate (S.gateBesieged is the HUD's flag). */
function gateWatch(){
  const ex = S.W.entryX[1], q = S.W.queue[1].length;
  const held = q > 0 && S.units.some(e => e.alive && e.team === -1 && Math.abs(e.x - ex) < 60);
  if (held && !S.gateBesieged && typeof showMsg === 'function') showMsg('🛡 Gate besieged — ' + q + ' recruit' + (q > 1 ? 's' : '') + ' waiting to march out', 2600);
  S.gateBesieged = held;
}
/* FORM UP, THEN ATTACK (host command timing; the enemy's form phase is the same idea). The canonical Attack rules (C3: archers stay
   behind the whole melee; a waiting soldier keeps a place behind whoever is ahead in his row) assume a FORMED army. An army jumbled at
   its gate -- archers ahead of spearmen after a Retreat, a stream of recruits -- locked itself: each waited for the other (an army of 53
   stood at its gate for 15 minutes). While the player's Attack is ordered, no enemy is near and most soldiers are far from their places,
   the army holds Defend (everyone walks to his place); once formed -- or as soon as an enemy is near -- the Attack runs. */
function formUp(){
  if (S.order1 !== 'ATTACK') return;
  const FC = S.W.teams[1], al = S.units.filter(u => u.team === 1 && u.alive && !u.large && !u.entering && S.W.fcOf(u) === FC);
  const enemyNear = S.units.some(e => e.alive && e.team === -1 && (e.x - FC.anchor) < 360);
  const formed = !al.length || al.filter(u => FC.slotDist(u) < 40).length >= al.length * 0.6;
  const want = enemyNear || formed ? 'ATTACK' : (FC.mode === 'ATTACK' && al.filter(u => FC.slotDist(u) < 40).length >= al.length * 0.3 ? 'ATTACK' : 'DEFEND');
  if (FC.mode !== want) S.W.command(1, want);
}
function enemyCount(){ return S.W ? S.units.filter(u => u.team === -1 && u.alive).length + S.W.queue[-1].length : 0; }
function armyCount(){ return S.W ? (S.reserve1 || []).length + S.units.filter(u => u.team === 1 && u.alive && !u.large).length + S.W.queue[1].length + (S.wallArchers || []).length + S.units.filter(u => u.team === 1 && u.alive && u.large).length : 0; }
/* The enemy's strategy (form -> march -> assault, doctrines, sallies) decides WHAT to command; the foundation executes it. */
function enemyController(dt){
  if (!S.W) return;
  const F2 = S.W.teams[-1], mine = S.units.filter(u => u.team === -1 && u.alive && !u.large);
  if (!mine.length && !S.W.queue[-1].length){ if (S.enemyPhase !== 'form'){ S.enemyPhase = 'form'; S.enemyFormT = 2.2; S.enemyFormWaitT = 0; S.enemyHoldT = 0; } F2.anchor = S.enemyRallyX = E_SPAWN - 35; setMode(-1, 'DEFEND'); return; }
  if (S.enemyPhase === 'form'){
    setMode(-1, 'DEFEND');
    /* the rally line is PLACED where the whole formed wave fits in front of its gate (it only moves forward if the wave grows) -- the
       doctrine's forming time then decides when the march begins; walking it forward during the form would erase every doctrine's pace */
    F2.anchor = S.enemyRallyX = Math.min(F2.anchor, S.W.entryX[-1] - T.ENTRY_GAP - 14 - F2.depth());
    const target = Math.min(Math.floor(enemyMax() * REFILL_AT), S.waveTotal || enemyCount());
    const ready = enemyCount() >= target; if (!(S.enemyFormSettledT > 0)){ S.enemySettled = mine.filter(u => !u.entering && F2.slotDist(u) < 7).length; S.enemyFormSettledT = 0.25; } S.enemyFormSettledT -= dt; const settled = S.enemySettled;   // PERF: the settled count is sampled 4x a second (slotDist per soldier is O(formation))
    const ranksReady = (ready || !S.waveQueue.length) && !S.W.queue[-1].length && settled >= Math.ceil(mine.length * .8);
    S.enemyFormWaitT = (S.enemyFormWaitT || 0) + dt;
    if (ranksReady || S.enemyFormWaitT > FORM_MAX_WAIT * currentDoctrine().formMul) S.enemyFormT -= dt;   // the doctrine's pace: an aggressive commander advances before his ranks are complete, a defensive one waits longer
    if (S.enemyFormT <= 0){ S.enemyPhase = 'march'; showMsg('⚔ Enemy formation advances'); snd.horn(); }
  } else if (S.enemyPhase === 'march'){
    const d = currentDoctrine();
    const atHold = d.hold && F2.anchor <= d.hold + 1;
    setMode(-1, atHold ? 'DEFEND' : 'MARCH');
    if (atHold) S.enemyHoldT = (S.enemyHoldT || 0) + dt;
    const contact = F2.contactHold || S.units.some(a => a.team === 1 && a.alive && F2.anchor - a.x < (d.hold ? 260 : 105));   // the canonical March halts 140 px from the enemy: halted at him IS contact (a 105 px test alone left a holding player un-attacked for ever)
    const committed = d.hold ? (contact || S.stance === 'attack' || S.enemyHoldT > 25) : (contact || F2.anchor <= 900);
    if (committed){ S.enemyPhase = 'assault'; showMsg('⚔ Enemy full assault!'); snd.horn(); }
  } else setMode(-1, 'ATTACK');
  S.enemyRallyX = F2.anchor;
}

/* ----------------------------------------------------------------- damage ----------------------------------------------- */
const RANGED_KINDS = new Set(['arrow', 'bullet', 'quarrel', 'ball', 'spear', 'spearp']), BLAST_KINDS = new Set(['blast', 'bomb', 'boulder', 'rock']);
const INFERRED = { arrow: 'PIERCING', quarrel: 'PIERCING', ball: 'PIERCING', spear: 'PIERCING', spearp: 'PIERCING', bullet: 'PIERCING', thrust: 'PIERCING', cut: 'SLASHING', boulder: 'SIEGE', rock: 'SIEGE', bomb: 'SIEGE', blast: 'SIEGE', magic: 'SPECIAL' };
/* production numbers on top of the canonical layered damage: garrison immunity, equipment resists, damage-type health profile */
function damageHook(v, dmg, srcX, src, kind){
  if (v.k && v.k.inFort && S.retreatMode && !GARRISON_SIEGE_KINDS.has(kind)) return null;
  let d = dmg; const eq = v.equipMods;
  if (eq){ if (RANGED_KINDS.has(kind)) d *= 1 - (eq.rangedResist || 0); else if (BLAST_KINDS.has(kind)) d *= 1 - (eq.explosionResist || 0); else d *= 1 - (eq.meleeResist || 0); }
  const prof = window.KW_BALANCE && KW_BALANCE.damageTypes[INFERRED[kind] || 'SLASHING'];
  if (prof && prof.health) d *= prof.health;
  return d;
}
function hurt(u, dmg, hit){ if (!u.alive) return; hit = hit || {}; S.W.damage(u, dmg, hit.sourceX == null ? u.x - u.face : hit.sourceX, null, hit.kind || 'blast'); }

/* ----------------------------------------------------------------- events ----------------------------------------------- */
/* the blow's own sound (Build 87 emitted these from the legacy strike / projectile code): a sword or spear strike is heard in the
   ATTACKER's civilization, an arrow / bolt / ball impact in the struck soldier's; the shield / health layer sounds follow separately */
const STRIKE_SOUND = { cut: 'unit.attack.sword', thrust: 'unit.attack.spear' }, IMPACT_KINDS = new Set(['arrow', 'quarrel', 'ball']);
function soundOf(e, u){
  if (!window.KWAudio) return;
  if (STRIKE_SOUND[e.how]){ const a = e.by != null ? S.units.find(x => x.id === e.by) : null, team = a ? a.team : -u.team; KWAudio.emit(STRIKE_SOUND[e.how], { civ: team === 1 ? S.civ : S.enemyCiv, team }); }
  else if (IMPACT_KINDS.has(e.how)) KWAudio.emit('projectile.hit.' + e.how, { civ: S.civ, team: u.team });
}
function pump(){
  for (const e of S.W.drainEvents()){
    const u = e.id != null ? S.units.find(x => x.id === e.id) || null : null;
    if (u && (e.kind === 'hit' || e.kind === 'block')) soundOf(e, u);
    if (e.kind === 'death' && u && !S.soldierDeaths.has(u.id)){
      S.soldierDeaths.add(u.id); u.hp = 0;
      if (u.team === 1) battleStats().lost++;
      else {
        S.defeatedTotal = (S.defeatedTotal || 0) + 1; if (u.boss) S.bossDefeated = true;
        const b = (u.k && u.k.bounty) || 0; S.gold += b; battleStats().earned += b; if (b) addFloat(u.x, u.y - 40, '+' + b); snd.coin();
        window.KWAudio?.emit('reward.gold', { civ: S.civ }); window.KWExperience?.recordKill?.();
      }
      if ((!window.KWArt || KWArt.allowBlood()) && S.splats.length < 60) S.splats.push({ x: u.x, y: u.y, seed: simRandom() * 99 });
      window.KWRuntime?.events.emit('unit_died', { team: u.team, type: u.type, wave: S.wave });
      if ((u.type === 'gunner' || u.type === 'egunner') && !u._grenaded){ u._grenaded = true; addFloat(u.x, u.y - 54, 'GRENADE!', '#ffcf5a'); S.fx.push({ kind: 'boom', x: u.x, y: u.y - 14, r: 60, t: 0 }); explode(u.x, u.y - 14, 64, Math.round((TYPES[u.type].dmg || 14) * 1.4), u.team); }   // a falling gunner's grenade (production rule, ported from the legacy hurt())
    } else if (e.kind === 'hit' && u){ u.hp = Math.max(0, u.hp); if (e.how === 'cut' || e.how === 'thrust') S.fx.push({ kind: 'spark', x: u.x + u.face * 6, y: u.y - 22, t: 0, dir: -u.face }); snd.hit(); window.KWAudio?.emit('unit.hit.health', { civ: u.team === 1 ? S.civ : S.enemyCiv, team: u.team }); }
    else if (e.kind === 'block' && u){ S.fx.push({ kind: 'shieldhit', x: u.x + u.face * 8, y: u.y - 20, t: 0 }); window.KWAudio?.emit('unit.block.shield', { civ: u.team === 1 ? S.civ : S.enemyCiv, team: u.team }); }
    else if (e.kind === 'shieldBroken' && u){ S.fx.push({ kind: 'shieldbreak', x: u.x + u.face * 8, y: u.y - 20, t: 0 }); window.KWAudio?.emit('unit.break.shield', { civ: u.team === 1 ? S.civ : S.enemyCiv, team: u.team }); }
    else if (e.kind === 'throw' && u){ if (u.team === 1) S.spearsThrown = (S.spearsThrown || 0) + 1; u.spearLost = 'thrown'; u.spearThrown = true; }
    else if (e.kind === 'role' && u && e.to === 'SWORDSMAN' && e.from === 'SPEARMAN'){ u.spearLost = u.spearLost || e.why; u.spearThrown = true; }
    else if (e.kind === 'spearBroken' && u){ window.KWAudio?.emit('unit.break.spear', { civ: u.team === 1 ? S.civ : S.enemyCiv, team: u.team }); }
    else if (e.kind === 'projEnd' && u){   /* E9: a soldier's shot ends VISIBLY (Task H) -- stuck in the body it hit, or glancing off the raised shield and falling */
      const p = { kind: e.pk === 'spear' ? 'spearp' : e.pk, x: e.x, y: e.y, vx: e.vx, vy: e.vy, team: e.team, dmg: 0, life: 1.6, g: GRAV, sourceX: e.x, groundY: u.y + 4 };
      if (e.blocked){ deflectProjectile(p, u); S.projs.push(p); }   // spent: the production loop never lets a deflected shot hit anyone
      else if (p.kind === 'arrow' || p.kind === 'quarrel') stickArrow(u, p);
    }
    else if (e.kind === 'shot' && u){ const fam = RANGED_FAMILIES[u.k && u.k.fam] || {}; window.KWAudio?.emit(fam.sound || 'ranged.bow', { civ: u.team === 1 ? S.civ : S.enemyCiv, team: u.team });
      if (fam.smoke) pushFx({ kind: 'smoke', x: u.x + u.face * 24, y: u.y - 24, t: 0, a: fam.smoke }); }   // a firearm's muzzle smoke at the release (Build 87 rule; bows and crossbows make none)
  }
}

/* ---------------------------------------------------------------- garrison ---------------------------------------------- */
/* While RETREAT holds: soldiers inside the fort band mend (HP, damaged shield/armour -- never a broken shield or a lost spear) and
   are immune to ordinary blows; ranged soldiers take the parapet posts -- the SAME soldier object leaves the field (detach) and
   returns through the entry corridors when any other order is given (enlistUnit). Nothing is created or destroyed. */
function garrison(dt){
  if (!S.W || !S.retreatMode) return;
  S.wallArchers = S.wallArchers || [];
  const safeX = P_WALL + GARRISON_BAND;
  for (const u of S.units.slice()){
    if (u.team !== 1 || !u.alive || u.large){ continue; }
    if (u.x > safeX || u.entering){ u.k.inFort = false; continue; }
    u.k.inFort = true;
    if (u.max > 0){ u.hp = Math.min(u.maxHp, u.hp + u.maxHp * RETREAT_HEAL_PER_SEC * dt); }
    if (u.eq.shield && u.shieldMax > 0 && u.shieldHP > 0) u.shieldHP = Math.min(u.shieldMax, u.shieldHP + u.shieldMax * RETREAT_HEAL_PER_SEC * dt);
    if (u.armorMax > 0 && u.armorHP > 0) u.armorHP = Math.min(u.armorMax, u.armorHP + u.armorMax * RETREAT_HEAL_PER_SEC * dt);
    if (u.role === 'RANGED' && S.wallArchers.length < RETREAT_WALL_MAX){
      const post = RETREAT_WALL_POSTS[S.wallArchers.length];
      const def = { x: post.x, y: post.y, s: post.s, cdT: simRandom(), anim: 0, fromRetreat: true };
      S.defs.push(def); S.W.detach(u); u.onWall = true; S.wallArchers.push({ unit: u, def });
    }
  }
  for (const w of S.wallArchers){ const u = w.unit; if (!u.alive) continue; u.k.inFort = true;   // a wall post is inside the fort too: it heals like everyone else
    if (u.maxHp > 0) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * RETREAT_HEAL_PER_SEC * dt);
    if (u.armorMax > 0 && u.armorHP > 0) u.armorHP = Math.min(u.armorMax, u.armorHP + u.armorMax * RETREAT_HEAL_PER_SEC * dt); }
}
/* what the Retreat badge shows: soldiers inside the band, wall posts, and FULL once the retreat has ARRIVED (the army stands at its
   home line) but soldiers still stand outside the band -- the canonical formation is deeper than the fort */
function fortStatus(){
  const F1 = S.W && S.W.teams[1]; if (!F1) return { inFort: 0, wall: 0, outside: 0, full: false };
  let inFort = 0, outside = 0; for (const u of S.units) if (u.team === 1 && u.alive && !u.large && !u.entering){ if (u.k && u.k.inFort) inFort++; else outside++; }
  const arrived = S.retreatMode && Math.abs(F1.anchor - (S.W.homeX[1] + F1.depth())) < 2;
  /* capacity from the real geometry: the army's formation places that lie inside the band once it stands at its home line, plus the
     wall posts (ranged soldiers go up there first) */
  const homeAnchor = S.W.homeX[1] + F1.depth(), safeX = P_WALL + GARRISON_BAND; let fit = 0;
  for (const r of ['SWORDSMAN', 'SPEARMAN', 'RANGED']) for (const sl of F1.slots[r]) if (sl.occ && homeAnchor - (F1.bandStart(r) + sl.col * T.COL[r]) <= safeX) fit++;
  return { inFort, wall: (S.wallArchers || []).length, outside, full: arrived && outside > 0, cap: fit + RETREAT_WALL_MAX };
}
function endGarrison(){
  for (const w of S.wallArchers || []){ const i = S.defs.indexOf(w.def); if (i >= 0) S.defs.splice(i, 1); w.unit.onWall = false; w.unit.k.inFort = false; S.W.enlistUnit(w.unit); }
  S.wallArchers = [];
  for (const u of S.units) if (u.k) u.k.inFort = false;
}

/* ------------------------------------------------------------------ saves ----------------------------------------------- */
/* An Endless save stores a ROSTER (who you have and what they carry), never simulation state: on Continue the same soldiers
   re-form at the fort. Equipment is authoritative -- a spearman who threw his spear is saved and restored as a swordsman. */
function roster(){
  if (!S.W) return [];
  const out = [], rec = u => ({ prod: (u.k && u.k.prodType) || u.type, eq: { ...u.eq }, hp: u.hp, maxHp: u.maxHp, shieldHP: u.shieldHP, shieldMax: u.shieldMax, armorHP: u.armorHP, armorMax: u.armorMax, owner: u.owner, large: !!u.large, id0: (u.k && u.k.origId) || u.id, v: 2 });   // id0: the soldier's identity across saves (diagnostics + roster-identity tests)
  for (const u of S.units) if (u.team === 1 && u.alive) out.push(rec(u));
  for (const u of S.W.queue[1]) out.push(rec(u));
  for (const w of S.wallArchers || []) out.push(rec(w.unit));
  for (const r of S.reserve1 || []) out.push({ prod: r.type, owner: r.owner, reserve: true, id0: r.id0, v: 2 });   // the reserve is part of the army
  return out;
}
/* legacy (builds 61-87) unit objects -> the same record: the spawn class only says what he was ISSUED; what he still carries decides */
function legacyRecord(u){
  const w = (TYPES[u.type] || {}).weapon, spear = (w === 'spear' || w === 'spartan') && !u.spearThrown && !u.spearLost;
  const shieldMax = u.shieldMax || 0, shield = shieldMax > 0 && (u.shield || 0) > 0;
  return { prod: u.owner != null && u.type === 'spear' ? 'spartan' : u.type, eq: { sword: w !== 'bow' && w !== 'gun', spear, bow: w === 'bow' || w === 'gun', shield },
    hp: u.hp, maxHp: u.max || u.hp, shieldHP: shield ? u.shield : 0, shieldMax, armorHP: u.armor || 0, armorMax: u.armorMax || 0, owner: u.owner, large: u.type === 'aetherwing' };
}
function restore(records){
  for (const r0 of records || []){
    if (!r0) continue;
    const r = r0.v === 2 ? r0 : legacyRecord(r0);
    if (r.reserve || (!r.large && fieldCount(1) >= FIELD_CAP)){ if (TYPES[r.prod === 'spartan' ? 'spear' : r.prod]) (S.reserve1 = S.reserve1 || []).push({ type: r.prod, owner: r.owner, id0: r.id0 }); continue; }
    if (!TYPES[r.prod === 'spartan' ? 'spear' : r.prod]) continue;   // retired types (the five-age lasers) are dropped, as before
    const u = r.large ? makeLarge(1, r.prod) : makeSoldier(1, r.prod, { owner: r.owner, deploy: true });
    if (!r.large){ const keep = { spear: !!r.eq.spear, shield: !!r.eq.shield, bow: !!r.eq.bow, sword: r.eq.sword !== false }; if (keep.spear !== u.eq.spear || keep.shield !== u.eq.shield) S.W.setEquipment(u, keep, 'restored'); }
    if (u.k) u.k.origId = r.id0 || null;
    u.hp = Math.min(r.maxHp || u.maxHp, r.hp); u.maxHp = u.max = r.maxHp || u.maxHp; if (u.eq.shield){ u.shieldMax = r.shieldMax; u.shieldHP = Math.min(r.shieldMax, r.shieldHP); } u.armorMax = r.armorMax; u.armorHP = Math.min(r.armorMax, r.armorHP);
  }
  S.W.drainEvents();   // restoring is not combat
}
/* the part of S that is saved: everything except the live simulation */
function saveable(st){ return { ...st, W: undefined, gateExt: undefined, castleExt: undefined, soldierDeaths: undefined, wallArchers: [], reserve1: [], retreatMode: false, defs: (st.defs || []).filter(d => !d.fromRetreat), units: roster() }; }

/* ------------------------------------------------------------------ frame ----------------------------------------------- */
/* REGROUP (host anchor, mirrors the enemy's own rule): an army with no soldier left holding the field re-forms at its start line. Without
   it a destroyed army's anchor stayed where the last fight was, and every new recruit walked ~1000 px alone into the enemy line and died
   on arrival -- each arrival halting the enemy's Attack again, so a reckless player could neither win nor lose (8-minute stalemates). */
function regroup(){
  const F1 = S.W.teams[1]; if (F1.mode === 'RETREAT' || S.startRally1 == null) return;
  if (!S.units.some(u => u.team === 1 && u.alive && !u.large && !u.entering) && F1.anchor > S.startRally1) F1.anchor = S.startRally1;
}
/* MEET AT THE GATE (host rule): an entering soldier ignores enemies until he reaches his place (canonical entry). When an enemy body
   stands between him and that place -- the enemy holds the gate mouth -- he would never arrive and never fight: both sides froze side by
   side for ten minutes while the gate was ground down. A recruit who is ALREADY out and meets an enemy within reach of his lane ends his
   entry and fights where he stands. Recruits still in the gate queue keep waiting (the besieged-gate rule stands). */
function meetAtGate(){
  let any = false; for (const u of S.units) if (u.entering || (u.k && u.k.metAtGate)){ any = true; break; } if (!any) return;   // PERF: nothing entering, nothing to check
  const foes = { 1: S.units.filter(e => e.alive && e.team === -1), [-1]: S.units.filter(e => e.alive && e.team === 1) };
  const near = (u, pad) => { const R = (T.REACH[u.role] || 30) + pad; for (const e of foes[u.team]){ const d = (e.x - u.x) * u.team; if (d > -10 && d < R && Math.abs(e.y - u.y) < 16) return true; } return false; };
  for (const u of S.units){
    if (!u.alive || u.large || !u.k) continue;
    if (u.entering){ if (near(u, 24)){ u.entering = false; u.k.metAtGate = true; } }
    else if (u.k.metAtGate && !near(u, 80)){ u.entering = true; u.k.metAtGate = false; }   // the threat is gone: he resumes his canonical entry to his place (a recruit left standing at the gate as if placed locked the C3 queue: archers behind the melee, melee behind the archers)
  }
}
/* COHESION (host anchors): an Attack or March never outruns its own army. The anchor is capped 60 px ahead of the front-most soldier who
   has taken his place (entering soldiers do not count: by the canonical entry rule they ignore enemies until they reach it). Without it a
   freshly recruited army's anchor ran across the whole field while its soldiers were still filing out of the gate; their places kept
   moving away, they never finished entering, and two armies walked through each other for minutes without a blow (Endless siege). */
function cohesion(){
  for (const k of [1, -1]){
    const FC = S.W.teams[k]; if (FC.mode !== 'ATTACK' && FC.mode !== 'MARCH') continue;
    let front = null; for (const u of S.units) if (u.team === k && u.alive && !u.large && !u.entering && S.W.fcOf(u) === FC){ const v = u.x * k; if (front === null || v > front) front = v; }
    let cap = front === null ? (k === 1 ? (S.startRally1 != null ? S.startRally1 : FC.anchor) : FC.anchor) * k : front + 60;
    if (!S.units.some(e => e.alive && e.team !== k && (e.x - FC.anchor) * k < 160)) cap = Math.max(cap, (S.W.entryX[k] + k * (T.ENTRY_GAP + 14 + FC.depth())) * k);   // never tighter than the room the formation needs in front of its gate (else rear places behind the field edge jam the lanes) -- but never pushed toward a nearby enemy
    if (FC.anchor * k > cap){ FC.anchor = cap * k; if (k === -1) S.enemyRallyX = FC.anchor; }
  }
}
/* ROOM TO STAND (host anchors): formation slots run back from the anchor, so an army whose anchor stands too close to its own gate puts
   its rear slots behind the entry -- those soldiers stall in the entry corridor, the corridor stays blocked and every later recruit waits
   in the gate queue for ever (60 recruits in Defend at the start line: 37 never entered). While an army HOLDS (Defend) and soldiers
   wait at its gate, its line steps forward at marching pace until the whole formation, reserved places included, stands in front of
   the entry. March/Attack advance anyway; Retreat measures home + depth itself. The engine's movement and slot rules are untouched. */
function roomToStand(){
  for (const k of [1, -1]){
    const FC = S.W.teams[k]; if (FC.mode !== 'DEFEND' || !S.W.queue[k].length || (k === -1 && S.enemyPhase === 'form')) continue;   // March/Attack make their own room; nobody waiting -> no shift; a forming enemy line is placed by its controller
    if (S.units.some(e => e.alive && e.team !== k && (e.x - FC.anchor) * k < 160)) continue;          // never step a line forward into a fight
    const need = S.W.entryX[k] + k * (T.ENTRY_GAP + 14 + FC.depth()), short = (need - FC.anchor) * k;
    if (short > 0){ FC.anchor += k * Math.min(short, T.WALK * 0.92 * T.DT); if (k === -1) S.enemyRallyX = FC.anchor; }   // the line steps forward at marching pace
  }
}
function frame(dt){
  if (!S.W) return;
  if (S.W.t === 0 && S.W.seededFrom !== S.randomSeed){ S.W.rand = F.rng((S.randomSeed >>> 0) || 1); S.W.seededFrom = S.randomSeed; }   // a battle (or test) may set its seed after the world exists: reseed before the first step
  syncExternals();
  enemyController(dt);
  releaseReserve();
  gateWatch();
  formUp();
  regroup();
  meetAtGate();
  cohesion();
  roomToStand();
  largeBrain(dt);
  S.W.step();
  pump();
  garrison(dt);
  S.W.prune(6.5);                                            // the fallen fade by 6 s (renderer), then leave the roster
}
window.KWBattle = Object.freeze({ FIELD_CAP, fieldCount, recruit, fortStatus, roster, restore, saveable, legacyRecord, LANES, begin, makeSoldier, makeLarge, setMode, MODE_OF, enemyController, frame, pump, hurt, garrison, endGarrison, isSoldier, armyCount, enemyCount, syncExternals });
})();
