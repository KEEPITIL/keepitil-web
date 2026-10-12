/* KWUnitDraw -- THE soldier renderer adapter (K WARS 1 integration plan section 13): foundation unit state -> KWRig pose -> drawn.
   The foundation lab and the real game both draw soldiers through this one function, so what a player sees is exactly what the
   approved lab showed. It reads only simulation state (state, act, actT, gait, gaitState, face, turnT/turnFrom, guard, hitT, blockT,
   eq, armorHP/armorMax, role, alive, deathT/deathKind) and writes nothing back except the u._drawn record the goldens check.
   Equipment drawn == equipment owned: a spearless spearman is drawn without a spear, a broken shield is gone. */
(function(){
'use strict';
const ARMOR = { sword: 'sword', spear: 'spear', archer: 'bow' }, RCLS = { SWORDSMAN: 'sword', SPEARMAN: 'spear', RANGED: 'bow' };
/* opts: { x, y (screen translate), k (scale), era (KWRig era index for this unit's kit), t (world time, s), armorCls?, rigCls?, gunKind? } */
function draw(ctx, u, opts){
  const R = window.KWRig, T = window.KW_FOUNDATION.T;
  const armorCls = opts.armorCls || ARMOR[u.spawnType], cls0 = opts.rigCls || RCLS[u.role];
  let cls = cls0, st = 'idle', p = 0; const t = opts.t + u.id * 0.37;
  const A = T.ATK[u.role];
  if (!u.alive){ st = u.deathKind === 'thrust' ? 'die_kneel' : 'die_back'; p = Math.min(1, u.deathT / 1.1); }
  else if (u.act === 'THROW'){ cls = 'spear'; st = 'throw'; p = Math.min(1, u.actT / T.THROW.time); }
  else if (u.act === 'ATTACK'){ st = 'attack'; p = Math.min(1, u.actT / A.end); }
  else if (u.state === 'RUN'){ st = 'run'; p = u.gait; }
  else if (['WALK', 'SHUFFLE', 'STOP', 'BACK', 'RETREAT'].includes(u.state) || (u.state === 'BLOCK' && u.gaitState !== 'IDLE') || (u.state === 'HIT' && u.gaitState !== 'IDLE')){ st = 'march'; p = u.gait; }
  const po = R.poseFor(cls, st, p, t, { holdShield: !!u.guard });
  if (u.alive && u.gaitState === 'SHUFFLE'){ po.legF.fwd *= 0.45; po.legB.fwd *= 0.45; po.py *= 0.4; }
  if (u.alive && u.act === 'DRAW'){ const k = Math.min(1, u.actT / T.DRAW_TIME); po.armF2 = { fwd: -0.9 + k * 1.0, bend: 1.6 - k * 0.3 }; }
  if (u.alive && u.state === 'HIT'){ const k = u.hitT / T.HIT_TIME; po.lean -= 0.22 * k; po.px -= 3 * k; po.headTilt -= 0.1 * k; }
  po.extra.blockRaise = u.eq.shield && u.guard ? 1 : 0;
  po.extra.blockRecoil = Math.max(0, u.blockT / T.BLOCK_RECOIL);
  if (armorCls === 'spear' && u.guard && u.eq.spear) po.extra.brace = 1;
  if (cls === 'spear' && !u.eq.spear) po.extra.spearGone = true;          // equipment drawn == equipment owned
  po.dropShield = !u.eq.shield;                                           // a broken shield is gone -- also from the corpse
  po.dropHelmet = u.alive && u.armorMax > 0 && u.armorHP <= 0;
  po.era = opts.era;
  if (opts.gunKind) po.extra.gunKind = opts.gunKind;                      // era firearm / crossbow (weapon data, same body)
  if (!u.alive) po.alpha = Math.max(0, 1 - Math.max(0, u.deathT - 3) / 3);
  const C = R.teamTint(R.PAL[armorCls], u.team);
  let sx = u.face;
  if (u.alive && u.state === 'TURN'){ const k = 1 - u.turnT / T.TURN_TIME; sx = (k < 0.5 ? u.turnFrom : u.face) * Math.max(0.25, Math.abs(Math.cos(k * Math.PI))); }
  ctx.save(); ctx.translate(opts.x, opts.y); ctx.scale(sx * opts.k, opts.k);
  R.drawSoldier(ctx, cls, po, C, u.team, armorCls);
  ctx.restore();
  const kit = R.eraKit(opts.era);
  u._drawn = { cls, armorCls, shield: !po.dropShield && (armorCls === 'sword' ? kit.sS !== 'none' : armorCls === 'spear' ? kit.pS !== 'none' : false), spear: cls === 'spear' && !po.extra.spearGone, st };
}
window.KWUnitDraw = Object.freeze({ draw, ARMOR, RCLS });
})();
