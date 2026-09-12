/* KWARS2 GAME LOOP + battle HUD. Single canonical battle start path. */
(function(){
  'use strict';
  const P=window.KW2Profile,B=window.KW2Battle,F=window.KW2Field,SH=window.KW2Shell,
        D=window.KW2_DATA,R=window.KW2Roles;
  const $=id=>document.getElementById(id);
  const cv=$('game'), ctx=cv.getContext('2d');
  let running=false, speed=1, last=0, acc=0, intent=null, transitions=0;

  P.load();
  F.setMode(P.get().settings.view||'FIXED');

  const ROLE_ICON={RANGE:'🏹',ASSAULT:'⚔',HEAVY:'🛡',MOBILE:'🐎'};
  const ROLE_NAME={RANGE:'Range',ASSAULT:'Assault',HEAVY:'Heavy',MOBILE:'Mobile'};

  function msg(t,ms){const m=$('msg');m.textContent=t;m.classList.add('show');
    clearTimeout(m._t);m._t=setTimeout(()=>m.classList.remove('show'),ms||2200);}

  function buildUnitBar(S){
    const bar=$('unitbar'); bar.innerHTML='';
    for(const role of ['HEAVY','ASSAULT','RANGE','MOBILE']){
      if(!S.civ.roles[role])continue;                    // never offer a role the era lacks
      const b=document.createElement('button');
      b.className='ubtn'; b.dataset.role=role;
      b.innerHTML='<span class="big">'+ROLE_ICON[role]+'</span><span class="nm">'+ROLE_NAME[role]+
                  '</span><span class="cost">'+B.costOf(role)+'</span>';
      let lastTap=0;
      b.onclick=()=>{ const now=Date.now(); if(now-lastTap<180)return; lastTap=now;  // no accidental double-recruit
        const r=B.spawnPlayer(role);
        if(!r.ok)msg(r.reason==='NO_GOLD'?'Not enough gold':r.reason==='ARMY_FULL'?'Army at capacity':'Unavailable',1200);};
      bar.appendChild(b);
    }
    const st=document.createElement('button');
    st.className='ubtn'; st.innerHTML='<span class="big">⚑</span><span class="nm">Stance</span><span class="cost">Defend</span>';
    st.onclick=()=>{const S2=B.get();S2.stance=S2.stance==='defend'?'attack':'defend';
      st.querySelector('.cost').textContent=S2.stance==='defend'?'Defend':'Attack';
      st.classList.toggle('on',S2.stance==='attack');
      msg(S2.stance==='attack'?'⚔ Advance!':'🛡 Hold the line',1200);};
    bar.appendChild(st);
  }

  /* ---- the single canonical battle start ---- */
  function startBattle(i){
    const d=P.get();
    if(i&&i.resume&&d.active){ i={...d.active.intent}; }
    intent=i||{mode:'ENDLESS'};
    const civ=D.byId(intent.civId)||(P.nextKingdom()||{}).civ||D.byOrder(5);
    intent.civId=civ.id;
    transitions=0;
    const S=B.start({mode:intent.mode,civId:civ.id,kingdomId:intent.kingdomId,
      targetWave:intent.targetWave||0,armyCap:d.unlocks.armyCap,income:d.unlocks.passiveIncome});
    if(!intent.review){
      d.active={intent,wave:S.wave,label:(intent.mode==='CAMPAIGN'?civ.displayName+' · Kingdom '+intent.kingdomNumber:'Endless · wave '+S.wave)};
      P.persist();
    }
    buildUnitBar(S);
    F.snap();                                  // frame the army immediately
    SH.show('battle'); running=true; last=0; acc=0;
    msg(intent.mode==='CAMPAIGN'?('⚔ '+civ.displayName+' · Kingdom '+intent.kingdomNumber):'♛ Endless War',2600);
    requestAnimationFrame(frame);
  }

  function endBattle(result){
    running=false;
    const S=B.get(), d=P.get();
    if(intent&&intent.review){                       // review battles grant nothing
      SH.results({result,mode:S.mode,scope:String(S.wave),kills:S.kills,goldEarned:S.goldEarned,
        reward:null,transitions,subtitle:'Greek vertical slice — review battle (no progression)',
        retry:{...intent},next:null});
      return;
    }
    d.records.enemiesDefeated+=S.kills;
    if(S.mode==='ENDLESS')d.records.highestWave=Math.max(d.records.highestWave,S.wave);
    d.records.longestRun=Math.max(d.records.longestRun,S.time);
    let reward=null,next=null;
    if(result==='victory'&&S.mode==='CAMPAIGN'&&S.kingdomId){
      const ratio=S.playerFort.hp/S.playerFort.max;
      reward=P.completeKingdom(S.kingdomId,1+(ratio>=.5?1:0)+(ratio>=.75?1:0));
      const nk=P.nextKingdom();
      if(nk)next={mode:'CAMPAIGN',civId:nk.civ.id,kingdomId:nk.kingdom.id,
                  targetWave:1+nk.kingdom.kingdomNumber,kingdomNumber:nk.kingdom.kingdomNumber};
    }
    d.active=null; d.lastPlayed=Date.now(); P.persist();
    SH.results({result,mode:S.mode,
      scope:S.mode==='CAMPAIGN'?(S.civ.displayName+' · '+(intent.kingdomNumber||'')):String(S.wave),
      kills:S.kills, goldEarned:S.goldEarned, reward, transitions,
      subtitle:result==='victory'?('The field is yours — '+S.civ.displayName):('Your fortress has fallen — '+S.civ.displayName),
      retry:{...intent}, next});
  }

  function hud(S){
    $('hGold').textContent=Math.floor(S.gold);
    $('hWave').textContent=S.mode==='CAMPAIGN'?('Wave '+S.wave+'/'+S.targetWave):('Wave '+S.wave);
    const alive=S.units.filter(u=>u.team===1&&!u.dead).length;
    $('hArmy').textContent=alive+'/'+S.armyCap;
    $('hpPlayer').style.width=Math.max(0,100*S.playerFort.hp/S.playerFort.max)+'%';
    $('hpEnemy').style.width=Math.max(0,100*S.enemyFort.hp/S.enemyFort.max)+'%';
    for(const b of document.querySelectorAll('#unitbar [data-role]'))
      b.disabled=S.gold<B.costOf(b.dataset.role);
  }

  function frame(ts){
    if(!running)return;
    if(!last)last=ts;
    let dt=Math.min(0.25,(ts-last)/1000); last=ts;
    const S=B.get();
    acc+=dt*speed;
    // count HEAVY -> ASSAULT reclassifications for the results screen
    const before=S.units.filter(u=>u.coreSpawnRole==='HEAVY'&&u.role==='ASSAULT').length;
    while(acc>=B.STEP){ B.update(B.STEP); acc-=B.STEP; }
    const after=S.units.filter(u=>u.coreSpawnRole==='HEAVY'&&u.role==='ASSAULT').length;
    if(after>before)transitions+=after-before;
    try{ F.render(ctx,cv,S,dt); }catch(e){ /* renderer must never kill the game */ }
    hud(S);
    if(S.over){ endBattle(S.result); return; }
    requestAnimationFrame(frame);
  }

  $('btnSpeed').onclick=function(){speed=speed%3+1;this.textContent=speed+'×';};
  $('btnView').onclick=function(){
    const d=P.get();
    d.settings.view=d.settings.view==='FIXED'?'FREE':'FIXED';
    F.setMode(d.settings.view); this.textContent=d.settings.view; P.persist();
    msg(d.settings.view==='FIXED'?'Fixed side camera':'Free camera',1400);
  };
  $('btnMenu').onclick=()=>{ running=false; P.persist(); SH.showHome(); };
  addEventListener('resize',()=>{ const S=B.get(); if(S&&running)F.render(ctx,cv,S,0); });

  SH.bind(startBattle);
  // undocumented developer flag: ?slice=greece jumps straight to the review battle
  if(/[?&]slice=greece\b/.test(location.search)){
    SH.showHome(); startBattle({mode:'ENDLESS',civId:'classical_greece',review:true});
  } else SH.showTitle();
  if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
})();
