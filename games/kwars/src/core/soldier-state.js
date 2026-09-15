/* Soldier combat-state model.
   A soldier's fighting identity comes from what it is HOLDING RIGHT NOW, never
   from the class it spawned as. `type` stays the spawn class (art, cost, stats);
   currentWeapon/currentRole/formationType/attackRange/preferredSpacing are the
   live truth every other system must read.

   The bug this exists to kill: a spearman who threw its spear kept role
   DEFENDER and a phalanx slot forever, so it held a front rank it could no
   longer hold, with an invisible 48px reach it no longer had. */
(function(){
  'use strict';

  /* formation: which body a soldier belongs in. PHALANX is the shielded spear
     wall; MELEE_LINE is sword work; SKIRMISH keeps missile troops behind. */
  const PROFILES=Object.freeze({
    spear:  {role:'DEFENDER',   formation:'PHALANX',    spacing:19, melee:true,  accel:5.0},
    spartan:{role:'ELITE',      formation:'PHALANX',    spacing:19, melee:true,  accel:5.4},
    sword:  {role:'ASSAULT',    formation:'MELEE_LINE', spacing:24, melee:true,  accel:7.4},
    hammer: {role:'BOSS',       formation:'MELEE_LINE', spacing:28, melee:true,  accel:3.4},
    mech:   {role:'ELITE',      formation:'MELEE_LINE', spacing:28, melee:true,  accel:3.2},
    bow:    {role:'RANGED',     formation:'SKIRMISH',   spacing:26, melee:false, accel:6.0},
    gun:    {role:'SPECIALIST', formation:'SKIRMISH',   spacing:27, melee:false, accel:5.6},
    laser:  {role:'SPECIALIST', formation:'SKIRMISH',   spacing:27, melee:false, accel:5.6}
  });
  const FALLBACK={role:'ASSAULT',formation:'MELEE_LINE',spacing:24,melee:true,accel:6.2};
  function profileFor(w){return PROFILES[w]||FALLBACK;}
  function isSpearWeapon(w){return w==='spear'||w==='spartan';}

  /* The weapon actually in hand. A thrown/lost spear means the sword is out. */
  function liveWeapon(u,types){
    const base=(types[u.type]&&types[u.type].weapon)||'sword';
    if(isSpearWeapon(base)&&u.spearThrown)return 'sword';
    return base;
  }

  /* Reach for the weapon in hand. Spear reach dies with the spear. */
  function liveRange(u,types,weapon){
    const T=types[u.type]||{};
    const base=isSpearWeapon(T.weapon)&&weapon==='sword'?22:(T.range||22);
    return base*((u.equipMods&&u.equipMods.range)||1);
  }

  /* Which body this soldier belongs in RIGHT NOW.
       PHALANX        spear + shield -- holds the wall
       DEFENSIVE_LINE shielded melee -- front-line support rank
       MELEE_LINE     unshielded melee -- rear melee rank
       SKIRMISH       missile troops -- stand off behind everyone
     Shield loss and spear loss are both one-way, so a soldier can only ever
     move outward through these; it can never fall back into the spear wall. */
  function liveFormation(u,weapon){
    const p=profileFor(weapon);
    if(p.formation==='SKIRMISH')return 'SKIRMISH';
    /* §16 OWNER RULE (supersedes the earlier interpretation): once a soldier has
       thrown his spear he is no longer a phalanx spearman, even if his shield
       survived. He joins the sword/assault line and frees his spear slot for the
       next equipped defender behind him. His shield still protects him from
       projectiles; it just no longer earns him a place in the shield wall. */
    if(u.spearThrown)return 'MELEE_LINE';
    if((u.shield||0)<=0)return 'MELEE_LINE';
    return isSpearWeapon(weapon)?'PHALANX':'DEFENSIVE_LINE';
  }

  function apply(u,types,weapon,time){
    const p=profileFor(weapon);
    u.currentWeapon=weapon;
    u.currentRole=p.role;
    u.formationType=liveFormation(u,weapon);
    u.preferredSpacing=p.spacing;
    u.attackRange=liveRange(u,types,weapon);
    u.isMeleeNow=p.melee;
    /* One movement system; the role only weights how hard a soldier drives
       into it. Phalanx advances deliberately, swords close harder, heavies
       carry more inertia, missile troops reposition under control. */
    u.moveAccel=p.accel||6.2;
  }

  function init(u,types,time){
    u.spawnClass=u.spawnClass||u.type;
    apply(u,types,liveWeapon(u,types),time||0);
    u.roleChangedAt=time||0;
    u.needsReslot=false;
    return u;
  }

  /* Called every step. Cheap when nothing changed. Returns a transition record
     the formation layer can act on, or null. */
  function refresh(u,types,time){
    if(u.currentWeapon===undefined){init(u,types,time);return null;}
    const w=liveWeapon(u,types);
    /* A broken shield moves a soldier out of the wall even with the same
       weapon in hand, so formation is compared too, not just weapon. */
    if(w===u.currentWeapon&&liveFormation(u,w)===u.formationType){
      /* equipment modifiers can still move reach without a weapon swap */
      u.attackRange=liveRange(u,types,w);
      return null;
    }
    const from={weapon:u.currentWeapon,role:u.currentRole,formation:u.formationType};
    apply(u,types,w,time);
    u.roleChangedAt=time||0;
    /* Leaving the phalanx: drop the old slot so the next formation rebuild
       assigns a compatible one by proximity. The soldier walks there; it is
       never moved directly. */
    if(from.formation!==u.formationType){
      /* Release the slot AND its identity key. Keeping the key would let the
         formation's incumbent-stickiness bonus pin this soldier to the rank it
         just stopped qualifying for -- a reserved spear slot by another name. */
      u.slotX=undefined;u.slotY=undefined;u.slotKey=undefined;
      u.needsReslot=true;
    }
    /* A weapon with different reach invalidates a target chosen for the old
       reach — let the AI re-evaluate on the next step instead of committing. */
    u.aiRetargetAt=0;u.aiCommitUntil=0;
    return {unit:u,from,to:{weapon:u.currentWeapon,role:u.currentRole,formation:u.formationType}};
  }

  function refreshAll(units,types,time){
    const changes=[];
    for(let i=0;i<units.length;i++){
      const u=units[i];if(u.hp<=0)continue;
      const c=refresh(u,types,time);if(c)changes.push(c);
    }
    return changes;
  }

  window.KW_SOLDIER=Object.freeze({PROFILES,profileFor,liveWeapon,liveFormation,init,refresh,refreshAll});
})();
