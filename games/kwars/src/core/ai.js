(function(){
  const LANE_H=15;   // formation row pitch; a lane is one row
  /* Engagement bands in px: own lane, own+adjacent, then two lanes, then open.
     A melee unit takes the NARROWEST band that contains a foe. */
  const MELEE_BANDS=[LANE_H*0.8, LANE_H*1.8, LANE_H*3.0, 1e9];
  const _band=[];
  'use strict';
  const STATES=['SPAWNING','FORMING','HOLDING','MARCHING','RETREATING','SEEKING_TARGET','APPROACHING_TARGET','ATTACKING','BLOCKING','KITING','FLANKING','REGROUPING','FLEEING','FORT_ATTACKING','STAGGERED','KNOCKED_DOWN','DYING','DEAD'];
  const PRIORITY=Object.freeze(Object.fromEntries(STATES.map((s,i)=>[s,STATES.length-i])));
  const PROFILES=Object.freeze([
    {id:'TRIBAL',reactionDelay:.42,reevaluate:.60,readiness:.55,pursuit:280,retreat:.25,flank:.55,rangedProtection:.25,targetQuality:.35,coordination:.30,signature:'HUNTING_RUSH'},
    {id:'BRONZE',reactionDelay:.35,reevaluate:.50,readiness:.65,pursuit:240,retreat:.45,flank:.50,rangedProtection:.55,targetQuality:.55,coordination:.45,signature:'PALACE_LINE'},
    {id:'HELLENIC',reactionDelay:.26,reevaluate:.42,readiness:.80,pursuit:190,retreat:.78,flank:.45,rangedProtection:.82,targetQuality:.78,coordination:.80,signature:'PHALANX_PUSH'},
    {id:'ROMAN',reactionDelay:.22,reevaluate:.35,readiness:.78,pursuit:210,retreat:.92,flank:.82,rangedProtection:.92,targetQuality:.92,coordination:.94,signature:'LINE_ROTATION'},
    {id:'MEDIEVAL',reactionDelay:.24,reevaluate:.38,readiness:.82,pursuit:180,retreat:.90,flank:.68,rangedProtection:.92,targetQuality:.92,coordination:.82,signature:'SIEGE_PREPARATION'}
  ]);
  const rangedWeapon=w=>w==='bow'||w==='gun'||w==='laser';
  function profile(level){return PROFILES[Math.max(0,Math.min(4,(level||1)-1))];}
  function setState(u,next,force){
    if(!PRIORITY[next])return false;
    if(!force&&u.aiState&&PRIORITY[u.aiState]>PRIORITY[next]&&['DEAD','DYING','STAGGERED','KNOCKED_DOWN'].includes(u.aiState))return false;
    if(u.aiState!==next){u.aiState=next;u.aiStateT=0;}return true;
  }
  function syncState(u,ctx){
    u.aiStateT=(u.aiStateT||0)+(ctx.dt||0);
    if(u.hp<=0)return setState(u,'DEAD',true);
    if((u.staggerT||0)>0)return setState(u,'STAGGERED',true);
    if(u.blockT>0||u.shieldUp&&ctx.threatened)return setState(u,'BLOCKING',true);
    if(ctx.retreating)return setState(u,'RETREATING',true);
    if(u.anim>0)return setState(u,'ATTACKING',true);
    if(u.pose==='walk'){
      if(u.tgt)return setState(u,'APPROACHING_TARGET',true);
      return setState(u,ctx.forming?'FORMING':'MARCHING',true);
    }
    if(u.tgt)return setState(u,'SEEKING_TARGET',true);
    return setState(u,'HOLDING',true);
  }
  /* Live role, not spawn class: a spearman who threw its spear scores and is
     scored as the swordsman it now is. */
  function roleOf(u,types){return u.currentRole||(types[u.type]&&types[u.type].role)||'ASSAULT';}
  function effectiveHealth(o){return Math.max(0,o.hp||0)+Math.max(0,o.armor||0)+Math.max(0,o.shield||0);}
  /* Sorted-by-x rosters, rebuilt once per call. The old code built an array of
     EVERY living enemy, measured every distance and sorted the whole list for
     EACH unit that re-targeted, then threw all but 16 away — an O(n^2 log n)
     spike whenever several units re-evaluated on the same step. The field is a
     lane, so walking outward in x from the unit finds the same near neighbours
     without the allocation or the full sort. */
  const _sortedFriend=[],_sortedEnemy=[],_cand=[];
  let _sorted=false;
  /* Below this roster size the outward walk is not worth the per-frame x-sort. */
  const SORT_MIN=96;
  function _byX(a,b){return a.x-b.x;}
  function _lowerX(arr,v){let lo=0,hi=arr.length;while(lo<hi){const m=(lo+hi)>>1;if(arr[m].x<v)lo=m+1;else hi=m;}return lo;}
  /* Nearest ~want enemies of u, gathered by walking outward in x then ranked by
     true distance. Same shortlist the old sort produced, far less work. */
  function _nearestFoes(u,want){
    const arr=(u.team===1)?_sortedEnemy:_sortedFriend;
    _cand.length=0;
    const n=arr.length; if(!n)return _cand;
    if(!_sorted){
      /* Small roster: the x-sort costs more than the walk saves, so rank all. */
      for(let k=0;k<n;k++){const o=arr[k];if(o.hp>0)_cand.push(o);}
      for(let k=0;k<_cand.length;k++){const o=_cand[k];o._d=Math.hypot(o.x-u.x,(o.y-u.y)*1.6);}
      _cand.sort((a,b)=>a._d-b._d);
      if(_cand.length>want)_cand.length=want;
      return _cand;
    }
    let i=_lowerX(arr,u.x),lo=i-1,hi=i,grab=Math.min(n,Math.max(want,16)*2);
    while(_cand.length<grab&&(lo>=0||hi<n)){
      const dLo=lo>=0?(u.x-arr[lo].x):Infinity, dHi=hi<n?(arr[hi].x-u.x):Infinity;
      if(dLo===Infinity&&dHi===Infinity)break;
      const o=(dLo<=dHi)?arr[lo--]:arr[hi++];
      if(o.hp>0)_cand.push(o);
    }
    for(let k=0;k<_cand.length;k++){const o=_cand[k];o._d=Math.hypot(o.x-u.x,(o.y-u.y)*1.6);}
    _cand.sort((a,b)=>a._d-b._d);
    if(_cand.length>want)_cand.length=want;
    return _cand;
  }

  function selectTargets(units,types,projectiles,time,civForTeam){
    const claims=new Map(),incoming=new Map();
    _sortedFriend.length=0;_sortedEnemy.length=0;
    for(let i=0;i<units.length;i++){const q=units[i];if(q.hp<=0)continue;(q.team===1?_sortedFriend:_sortedEnemy).push(q);}
    _sorted=(_sortedFriend.length>SORT_MIN||_sortedEnemy.length>SORT_MIN);
    if(_sorted){_sortedFriend.sort(_byX);_sortedEnemy.sort(_byX);}
    for(const p of projectiles||[]){if(p.tg&&p.tg.hp>0)incoming.set(p.tg,(incoming.get(p.tg)||0)+(p.dmg||0));}
    for(const u of units){if(u.hp<=0)continue;if(u.tgt&&u.tgt.hp>0&&u.tgt.team!==u.team)claims.set(u.tgt,(claims.get(u.tgt)||0)+1);else u.tgt=null;}
    for(const u of units){
      if(u.hp<=0)continue;
      const own=types[u.type]||{},melee=(u.isMeleeNow!==undefined)?u.isMeleeNow:!rangedWeapon(own.weapon),prof=profile(civForTeam(u.team));
      if(u.tgt&&time<Math.max(u.aiRetargetAt||0,u.aiCommitUntil||0))continue;
      if(u.tgt)claims.set(u.tgt,Math.max(0,(claims.get(u.tgt)||1)-1));
      const rawCandidates=_nearestFoes(u,16);
      /* §1 MELEE ENGAGEMENT BAND -- a hard filter, not a score weight.
         Weighting the score was measured over 6 runs per condition and changed
         melee cross-lane engagement by less than the run-to-run noise, because a
         high-value target several lanes away could always out-score the penalty.
         A melee soldier may now only ENGAGE within a lane band, widened only
         when the narrower band is genuinely empty, so the cascade can never
         leave a soldier idle. Missile troops are unrestricted: shooting across
         the field is correct for them. */
      let candidates=rawCandidates;
      if(melee&&rawCandidates.length){
        candidates=_band;
        for(const width of MELEE_BANDS){
          candidates.length=0;
          for(let k=0;k<rawCandidates.length;k++){
            const o=rawCandidates[k];
            if(Math.abs(o.y-u.y)<=width) candidates.push(o);
          }
          if(candidates.length)break;          // narrowest non-empty band wins
        }
        if(!candidates.length)candidates=rawCandidates;   // true fallback: never idle
      }
      let best=u.tgt,bestScore=-1e9,currentScore=-1e9;
      for(const c of candidates){
        const o=c,targetRole=roleOf(o,types),count=claims.get(o)||0;
        if(melee&&count>=4&&o!==u.tgt)continue;
        let role=0;
        if(own.role==='ASSAULT')role=targetRole==='RANGED'?40:targetRole==='SPECIALIST'?35:targetRole==='ELITE'?10:0;
        else if(own.role==='DEFENDER')role=targetRole==='ASSAULT'?35:targetRole==='ELITE'?25:targetRole==='RANGED'?-20:15;
        else if(own.role==='SPECIALIST')role=targetRole==='ELITE'?45:targetRole==='DEFENDER'?32:targetRole==='SPECIALIST'?20:0;
        else if(own.role==='RANGED')role=targetRole==='ASSAULT'?22:targetRole==='ELITE'?18:0;
        const distance=Math.max(0,40-c._d/Math.max(5,u.attackRange||own.range||30)*12);
        const vulnerability=(1-o.hp/Math.max(1,o.max||o.hp))*18+(o.shield<=0?6:0)+(o.armor<=0?6:0)+(o.staggerT>0?8:0);
        const threat=(o.tgt===u?24:0)+(targetRole==='SPECIALIST'?8:0);
        const overcrowd=count*(melee?12:own.role==='SPECIALIST'?10:7);
        const overkill=(incoming.get(o)||0)>=effectiveHealth(o)?50:0;
        /* §10 COMBAT LANES. The formation rows are 15px apart, so |dy| in lane
           units is dy/15. A soldier engages the enemy in HIS lane, may reach one
           lane either side where weapon reach permits, and is strongly
           discouraged from crossing further. The old flat -0.18/px term was far
           too weak to stop several lanes converging on one coordinate, which is
           the "everyone piles onto the same attack point" the owner rejected. */
        const score=distance+role*prof.targetQuality+vulnerability+threat-overcrowd-overkill;
        if(o===u.tgt)currentScore=score;
        if(score>bestScore){bestScore=score;best=o;}
      }
      if(u.tgt&&currentScore>-1e8&&best!==u.tgt&&bestScore<currentScore+20)best=u.tgt;
      if(u.tgt!==best)u.tgt=best;
      if(best)claims.set(best,(claims.get(best)||0)+1);
      u.aiTargetScore=Math.round(bestScore);u.aiRetargetAt=time+prof.reevaluate;u.aiCommitUntil=time+.8+prof.reevaluate*.7;
    }
  }
  window.KW_AI=Object.freeze({STATES:Object.freeze(STATES),PRIORITY,PROFILES,profile,setState,syncState,selectTargets});
})();
