/* KWARS2 ROLE + EQUIPMENT STATE MACHINE  (window.KW2Roles)
   ---------------------------------------------------------------------------
   Franchise contract §3, §4, §5, §37.

   ONE SOURCE OF TRUTH: a unit's role, formation, reach and spacing are DERIVED
   from what it currently carries. Nothing reads the spawn label. A HEAVY that
   loses its shield becomes ASSAULT through `refresh()` on the SAME actor --
   never by destroying and respawning an entity. */
(function(){
  'use strict';

  const CORE=Object.freeze({RANGE:'RANGE',ASSAULT:'ASSAULT',HEAVY:'HEAVY',MOBILE:'MOBILE'});
  const FORMATION=Object.freeze({
    PHALANX:'PHALANX',              // long weapon + shield
    DEFENSIVE_LINE:'DEFENSIVE_LINE',// side weapon + shield
    MELEE_LINE:'MELEE_LINE',        // weapon, no shield
    SKIRMISH:'SKIRMISH',            // ranged
    MOBILE_WING:'MOBILE_WING'       // mounted / mechanised
  });
  // Tighter formations sort closer to the front line.
  const TIER=Object.freeze({PHALANX:0,DEFENSIVE_LINE:1,MELEE_LINE:2,MOBILE_WING:3,SKIRMISH:4});

  /* Weapon families. Long weapons are the ones that create a spear hedge and so
     earn the PHALANX formation; side weapons do not. Data, not `if era==`. */
  const WEAPON=Object.freeze({
    // long
    dory:{kind:'long',reach:46,cadence:1.15,dmg:14},
    sarissa:{kind:'long',reach:72,cadence:1.5,dmg:15},
    spear:{kind:'long',reach:44,cadence:1.2,dmg:13},
    pike:{kind:'long',reach:78,cadence:1.6,dmg:16},
    lance:{kind:'long',reach:38,cadence:1.3,dmg:22},
    // side
    xiphos:{kind:'side',reach:26,cadence:0.78,dmg:12},
    sword:{kind:'side',reach:27,cadence:0.8,dmg:12},
    club:{kind:'side',reach:22,cadence:0.95,dmg:10},
    axe:{kind:'side',reach:25,cadence:0.9,dmg:14},
    // ranged
    bow:{kind:'ranged',reach:330,cadence:1.4,dmg:11},
    sling:{kind:'ranged',reach:250,cadence:1.9,dmg:8},
    musket:{kind:'ranged',reach:420,cadence:3.2,dmg:30},
    rifle:{kind:'ranged',reach:560,cadence:0.5,dmg:22}
  });
  const weapon=id=>WEAPON[id]||null;
  const isLong=id=>!!(WEAPON[id]&&WEAPON[id].kind==='long');
  const isRanged=id=>!!(WEAPON[id]&&WEAPON[id].kind==='ranged');

  /* ---- derivation: everything below reads CURRENT state only ---- */

  function roleOf(u){
    if(u.mount) return CORE.MOBILE;                       // platform wins
    if(isRanged(u.weapon)) return CORE.RANGE;
    // HEAVY is defined by a FUNCTIONING shield, not by what it spawned as.
    if(hasShield(u)) return CORE.HEAVY;
    return CORE.ASSAULT;
  }
  const hasShield=u=>!!u.shield && (u.shieldHP===undefined || u.shieldHP>0);

  function formationOf(u){
    if(u.mount) return FORMATION.MOBILE_WING;
    if(isRanged(u.weapon)) return FORMATION.SKIRMISH;
    if(hasShield(u)) return isLong(u.weapon)?FORMATION.PHALANX:FORMATION.DEFENSIVE_LINE;
    return FORMATION.MELEE_LINE;
  }

  function reachOf(u){
    const w=weapon(u.weapon);
    return w?w.reach:20;
  }
  function spacingOf(u){
    switch(formationOf(u)){
      case FORMATION.PHALANX:        return 19;
      case FORMATION.DEFENSIVE_LINE: return 21;
      case FORMATION.MELEE_LINE:     return 24;
      case FORMATION.SKIRMISH:       return 26;
      case FORMATION.MOBILE_WING:    return 34;
      default:                       return 24;
    }
  }
  function speedOf(u){
    const base=u.baseSpeed||60;
    if(u.mount) return base*1.9;
    if(isRanged(u.weapon)) return base*1.05;
    if(hasShield(u)) return base*(isLong(u.weapon)?0.86:0.94);
    return base*1.2;                                       // unshielded = lighter, faster
  }

  /* ---- the transition itself -------------------------------------------
     Called after ANY equipment change. Same actor throughout: we mutate, we
     never replace. When the derived formation changes we must actively RELEASE
     the old slot, or the unit keeps a reservation in a formation it no longer
     belongs to (the "ghost phalanx slot" defect). */
  function refresh(u){
    const role=roleOf(u), form=formationOf(u);
    const changed = u.role!==role || u.formation!==form;
    if(changed){
      u.prevRole=u.role; u.prevFormation=u.formation;
      // release the slot; the formation system will assign a new one
      u.slotX=null; u.slotY=null; u.slotKey=null; u.slotIndex=-1;
      // clear commitments made under the old role
      u.retargetAt=0; u.commitUntil=0; u.target=null;
    }
    u.role=role; u.formation=form; u.formationTier=TIER[form];
    u.reach=reachOf(u); u.spacing=spacingOf(u); u.speed=speedOf(u);
    u.animSet=animSetFor(u);
    return changed;
  }

  function animSetFor(u){
    if(u.mount) return 'mounted';
    if(isRanged(u.weapon)) return 'ranged';
    if(hasShield(u)) return isLong(u.weapon)?'spear_shield':'sword_shield';
    return 'sword';
  }

  /* ---- the three documented HEAVY events ---- */

  // STATE A -> B. The primary leaves the hand; the secondary is drawn.
  // Returns false when there is nothing to fall back to.
  function expendPrimary(u){
    if(!u.secondary) return false;
    u.weapon=u.secondary; u.secondary=null; u.primaryExpended=true;
    refresh(u);
    return true;
  }
  // STATE B -> C. The shield is gone: it stops existing on the actor entirely,
  // so nothing can render or collide with it afterwards.
  function breakShield(u){
    if(!u.shield) return false;
    u.shield=null; u.shieldHP=0; u.shieldBroken=true;
    refresh(u);
    return true;
  }
  function damageShield(u,amount){
    if(!hasShield(u)) return false;
    u.shieldHP=Math.max(0,(u.shieldHP||0)-amount);
    if(u.shieldHP<=0) return breakShield(u);
    return false;
  }

  /* ---- construction from civilization data ---- */
  function equip(u,roleDef,coreRole){
    u.coreSpawnRole=coreRole;            // recorded for stats ONLY, never read by logic
    u.weapon=roleDef.primary||null;
    u.secondary=roleDef.secondary||null;
    u.shield=roleDef.shield||null;
    u.shieldHP=roleDef.shield?(roleDef.shieldHP||60):0;
    u.mount=roleDef.platform&&roleDef.platform!=='foot'?roleDef.platform:null;
    u.baseSpeed=roleDef.speed||60;
    u.hp=u.hpMax=roleDef.hp||100;
    u.armor=roleDef.armor||0;
    refresh(u);
    return u;
  }

  window.KW2Roles=Object.freeze({CORE,FORMATION,TIER,WEAPON,
    weapon,isLong,isRanged,hasShield,
    roleOf,formationOf,reachOf,spacingOf,speedOf,animSetFor,
    refresh,equip,expendPrimary,breakShield,damageShield});
})();
