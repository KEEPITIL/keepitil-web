/* KWARS2 BATTLE ENGINE  (window.KW2Battle)
   Fixed-step simulation. Behaviour derives from CURRENT equipment via
   KW2Roles -- no spawn label is ever consulted. Endless uses the conservation
   invariant proven in KWARS1:  spawned + reserve == waveTotal, always. */
(function(){
  'use strict';
  const R=window.KW2Roles, D=window.KW2_DATA, DEPTH=window.KW2Depth;
  const STEP=1/60, FIELD_W=2400, GROUND=430;
  const ACTIVE_BUDGET=170;         // concurrently simulated enemies
  const REFILL_AT=0.80;

  let S=null, nextId=1;

  function newState(opts){
    const civ=D.byId(opts.civId)||D.byOrder(5);
    return {
      mode:opts.mode||'ENDLESS', civ, civId:civ.id,
      kingdomId:opts.kingdomId||null, targetWave:opts.targetWave||0,
      wave:opts.startWave||1, time:0, over:null, result:null,
      gold:opts.gold||500, armyCap:opts.armyCap||50, income:opts.income||1.0,
      units:[], projectiles:[], fx:[], corpses:[],
      reserve:[], waveTotal:0, spawnedTotal:0, defeatedTotal:0,
      cohortT:0, phase:'form', formT:0,
      playerFort:{x:120,hp:2600,max:2600}, enemyFort:{x:FIELD_W-120,hp:2600,max:2600},
      kills:0, goldEarned:0, stance:'defend', rally:FIELD_W*0.42,
      boss:null, bossSpawned:false
    };
  }

  /* ---- spawning: role definitions come from civilization DATA ---- */
  /* Enemy strength scales with wave depth. Without this, wave 1 fields
     full-strength mirrors of the player's own units for free while the player
     pays gold for every soldier -- which made the opening waves unwinnable. */
  function enemyScale(wave){ return Math.min(1.25, 0.52 + wave*0.045); }

  function makeUnit(team,coreRole,civ,x,lane,scale){
    const def=civ.roles[coreRole];
    if(!def)return null;                       // civilization legitimately lacks this role
    const ln=lane!==undefined?lane:(nextId%DEPTH.LANES);
    // stagger ranks along x by lane so a formation reads as multiple ranks
    // rather than every soldier converging onto one line.
    x+= (team===1?-1:1) * ln * 13;
    const u={id:nextId++,team,x,y:GROUND,lane:ln,
      vx:0,face:team===1?1:-1,anim:'idle',animT:0,atkCd:0,dead:false,deadT:0,
      civId:civ.id,displayName:def.displayName||coreRole};
    R.equip(u,def,coreRole);
    if(scale&&scale!==1){
      u.hp=u.hpMax=Math.round(u.hpMax*scale);
      u.armor=Math.round((u.armor||0)*scale);
      u.shieldHP=Math.round((u.shieldHP||0)*scale);
      u.dmgScale=scale;
      R.refresh(u);
    }
    return u;
  }
  function spawnPlayer(coreRole){
    const civ=S.civ, def=civ.roles[coreRole];
    if(!def)return {ok:false,reason:'ROLE_UNAVAILABLE'};
    const alive=S.units.filter(u=>u.team===1&&!u.dead).length;
    if(alive>=S.armyCap)return {ok:false,reason:'ARMY_FULL'};
    const cost=costOf(coreRole);
    if(S.gold<cost)return {ok:false,reason:'NO_GOLD'};
    S.gold-=cost;
    const u=makeUnit(1,coreRole,civ,S.playerFort.x+40,undefined);
    S.units.push(u);
    return {ok:true,unit:u};
  }
  const COST={RANGE:90,ASSAULT:65,HEAVY:80,MOBILE:150};
  const costOf=r=>COST[r]||80;

  /* ---- waves: totals are decoupled from active population ---- */
  function buildWave(){
    const w=S.wave;
    // Wave 1 must be winnable with a starting army. Totals stay decoupled from the
    // active budget, so late waves can be enormous without spawning at once.
    const total=S.mode==='CAMPAIGN'?Math.min(90,6+w*2):Math.min(400,6+Math.floor(w*3.2));
    const roles=['HEAVY','ASSAULT','RANGE','MOBILE'].filter(r=>S.civ.roles[r]);
    S.reserve=[];
    for(let i=0;i<total;i++) S.reserve.push(roles[i%roles.length]);
    S.waveTotal=total; S.spawnedTotal=0; S.defeatedTotal=0;
    S.bossSpawned=false; S.phase='form'; S.formT=0;
  }
  function releaseCohort(){
    const activeEnemies=S.units.filter(u=>u.team===-1&&!u.dead).length;
    if(activeEnemies>=Math.floor(ACTIVE_BUDGET*REFILL_AT))return;
    const room=ACTIVE_BUDGET-activeEnemies;
    let n=Math.min(room,6,S.reserve.length);
    while(n-->0){
      const role=S.reserve.pop();
      const u=makeUnit(-1,role,S.civ,S.enemyFort.x-40,undefined,enemyScale(S.wave));
      if(!u){S.reserve.push(role);break;}
      S.units.push(u); S.spawnedTotal++;
    }
  }
  const conserved=()=>S.spawnedTotal+S.reserve.length===S.waveTotal;

  /* ---- combat ---- */
  function nearestFoe(u){
    let best=null,bd=1e9;
    for(const o of S.units){
      if(o.team===u.team||o.dead)continue;
      const d=Math.abs(o.x-u.x);
      if(d<bd){bd=d;best=o;}
    }
    return best;
  }
  function update(dt){
    if(!S||S.over)return;
    S.time+=dt;
    S.gold+=dt*14*S.income;   // base economy; Campaign raises S.income permanently

    if(S.phase==='form'){
      S.formT+=dt;
      releaseCohort();
      if(S.formT>1.2)S.phase='fight';
    } else releaseCohort();

    for(const u of S.units){
      if(u.dead){u.deadT+=dt;continue;}
      u.animT+=dt;
      const foe=(u.retargetAt<=S.time||!u.target||u.target.dead)?(u.retargetAt=S.time+0.35,nearestFoe(u)):u.target;
      u.target=foe;
      const fort=u.team===1?S.enemyFort:S.playerFort;
      const tx=foe?foe.x:fort.x;
      const dist=Math.abs(tx-u.x);
      u.face=(tx>=u.x)?1:-1;

      if(dist<=u.reach){
        u.vx=0; u.anim='attack';
        if(u.atkCd<=0){
          u.atkCd=(R.weapon(u.weapon)||{cadence:1}).cadence;
          u.animT=0;
          if(R.isRanged(u.weapon)&&foe)fire(u,foe);
          else if(foe)strike(u,foe);
          else fort.hp-=(R.weapon(u.weapon)||{dmg:10}).dmg*0.55*(u.dmgScale||1);   // structures take weapon damage, not a flat rate
        }
      } else {
        // HEAVY holds the line when defending; ASSAULT/MOBILE press forward
        const advance=(S.stance==='attack')||u.team===-1||u.role!=='HEAVY';
        u.vx=advance?u.speed*u.face:0;
        u.anim=Math.abs(u.vx)>u.speed*0.8?'run':(u.vx?'march':'idle');
        u.x+=u.vx*dt;
      }
      u.atkCd=Math.max(0,u.atkCd-dt);
    }
    updateProjectiles(dt);
    separate();
    reap();
    if(S.reserve.length===0&&S.units.filter(u=>u.team===-1&&!u.dead).length===0)waveCleared();
    if(S.playerFort.hp<=0)finish('defeat');
    if(S.enemyFort.hp<=0)finish('victory');
  }

  /* Damage model. Armour is applied ONCE, before the shield multiplier.
     Stacking a flat armour subtraction on top of a shield multiplier made
     armour dominate: 12 dmg -> 5.4 after the shield -> 1 after armour 6, i.e.
     94 seconds to kill a single hoplite. Order matters. */
  function applyDamage(foe,raw){
    const afterArmor=Math.max(2,raw-(foe.armor||0)*0.5);
    if(R.hasShield(foe)){
      const broke=R.damageShield(foe,raw*0.6);
      if(broke)S.fx.push({type:'shieldBreak',x:foe.x,y:foe.y,lane:foe.lane,t:0});
      return {dmg:afterArmor*0.55,broke};
    }
    return {dmg:afterArmor,broke:false};
  }
  function strike(u,foe){
    const w=R.weapon(u.weapon)||{dmg:10};
    const {dmg}=applyDamage(foe,w.dmg*(u.dmgScale||1));
    foe.hp-=dmg;
    foe.anim='hit'; foe.animT=0;
    S.fx.push({type:'impact',x:foe.x,y:foe.y,lane:foe.lane,t:0});
    if(foe.hp<=0)kill(foe,u);
  }
  function fire(u,foe){
    const p=S.civ.roles.RANGE.profile||{speed:290,gravity:110,dmg:11};
    S.projectiles.push({x:u.x,y:u.y-34,lane:u.lane,team:u.team,
      vx:(foe.x>u.x?1:-1)*p.speed, vy:-p.gravity*0.55, g:p.gravity, dmg:p.dmg*(u.dmgScale||1), life:4});
  }
  function updateProjectiles(dt){
    for(const p of S.projectiles){
      p.x+=p.vx*dt; p.vy+=p.g*dt; p.y+=p.vy*dt; p.life-=dt;
      if(p.y>=GROUND){p.life=0;continue;}
      for(const o of S.units){
        if(o.team===p.team||o.dead)continue;
        if(Math.abs(o.x-p.x)<11&&Math.abs((o.y-28)-p.y)<26){
          o.hp-=applyDamage(o,p.dmg).dmg; p.life=0;
          S.fx.push({type:'impact',x:o.x,y:o.y,lane:o.lane,t:0});
          if(o.hp<=0)kill(o,null);
          break;
        }
      }
    }
    // projectiles must always clean up
    S.projectiles=S.projectiles.filter(p=>p.life>0&&p.x>-200&&p.x<FIELD_W+200);
  }
  function kill(u,by){
    if(u.dead)return;
    u.dead=true;u.deadT=0;u.anim='die';u.animT=0;u.vx=0;
    u.slotKey=null;u.slotX=null;                  // release the slot on death too
    if(u.team===-1){S.defeatedTotal++;S.kills++;S.gold+=12;S.goldEarned+=12;}
  }
  function reap(){
    const keep=[];
    for(const u of S.units){
      if(u.dead&&u.deadT>1.6){S.corpses.push({x:u.x,y:u.y,lane:u.lane,t:0});continue;}
      keep.push(u);
    }
    S.units=keep;
    if(S.corpses.length>90)S.corpses.splice(0,S.corpses.length-90);
    for(const f of S.fx)f.t+=STEP;
    S.fx=S.fx.filter(f=>f.t<0.5);
  }
  function separate(){
    // gentle push-apart so ranks read as ranks, not a single column
    const byLane={};
    for(const u of S.units){if(u.dead)continue;(byLane[u.lane]=byLane[u.lane]||[]).push(u);}
    for(const lane of Object.values(byLane)){
      lane.sort((a,b)=>a.x-b.x);
      for(let i=1;i<lane.length;i++){
        const a=lane[i-1],b=lane[i],min=(a.spacing+b.spacing)*0.5;
        const d=b.x-a.x;
        if(d<min){const push=(min-d)*0.5;a.x-=push;b.x+=push;}
      }
    }
  }
  function waveCleared(){
    if(S.mode==='CAMPAIGN'&&S.wave>=S.targetWave){finish('victory');return;}
    S.wave++; buildWave();
  }
  function finish(result){
    if(S.over)return;
    S.over=true;S.result=result;
  }

  function start(opts){ S=newState(opts); buildWave(); return S; }
  window.KW2Battle=Object.freeze({start,update,spawnPlayer,costOf,COST,
    get:()=>S, set:s=>{S=s;}, conserved, STEP, FIELD_W, GROUND, ACTIVE_BUDGET,
    makeUnit, nearestFoe, finish, enemyScale});
})();
