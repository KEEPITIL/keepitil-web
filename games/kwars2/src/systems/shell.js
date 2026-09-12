/* KWARS2 GAME SHELL  (window.KW2Shell)
   Title -> Home -> Play -> Mode -> Preparation -> Battle -> Results -> Home.
   Same information architecture as KWARS1 (the proven UX bar), KWARS2 visual
   design. Real systems only -- no button exists without something behind it. */
(function(){
  'use strict';
  const P=window.KW2Profile, D=window.KW2_DATA, B=window.KW2Battle, F=window.KW2Field;
  const $=id=>document.getElementById(id);
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  let data=null, onStartBattle=null, backTo='home';

  const ROLE_LABEL={RANGE:'Range',ASSAULT:'Assault',HEAVY:'Heavy',MOBILE:'Mobile'};
  const ROLE_ICON={RANGE:'🏹',ASSAULT:'⚔',HEAVY:'🛡',MOBILE:'🐎'};

  function show(el){['title','home','panelWrap','battle','results'].forEach(id=>{
    const n=$(id); if(n)n.classList.toggle('hidden',id!==el);});
    document.body.classList.toggle('in-battle',el==='battle');
  }
  function panel(title,html,back){
    $('panelTitle').textContent=title; $('panelBody').innerHTML=html;
    backTo=back||'home'; show('panelWrap');
  }

  /* ---- title ---- */
  function showTitle(){
    data=P.get();
    const b=window.KW2Build||{};
    $('titleVersion').textContent=(b.appVersion?'v'+b.appVersion:'')+(b.buildNumber?' · build '+b.buildNumber:'');
    const cont=$('titleContinue'), a=data.active, nk=P.nextKingdom();
    if(a){cont.hidden=false;cont.innerHTML='CONTINUE<br><small>'+esc(a.label||('Wave '+a.wave))+'</small>';cont.dataset.mode='RESUME';}
    else if(nk){cont.hidden=false;cont.innerHTML='CONTINUE CAMPAIGN<br><small>'+esc(nk.civ.displayName)+' · Kingdom '+nk.kingdom.kingdomNumber+'</small>';cont.dataset.mode='CAMPAIGN';}
    else cont.hidden=true;
    show('title');
  }
  /* ---- home ---- */
  function paintHome(){
    data=P.get();
    const nk=P.nextKingdom(), civ=nk?nk.civ:D.byOrder(Math.min(15,data.campaign.unlockedCivilization));
    $('hudEra').textContent=civ?civ.displayName:'—';
    $('hudKingdoms').textContent='🏰 '+Object.keys(data.campaign.completed).length+'/'+D.kingdomCount;
    $('hudWave').textContent='♛ '+data.records.highestWave;
    $('hudGems').textContent='💎 '+data.economy.gems;
    $('hudName').textContent=data.profile.name+' · '+data.profile.title;
    $('tileCampaignSub').textContent=nk?('Next: '+nk.civ.displayName+' · Kingdom '+nk.kingdom.kingdomNumber):'All available kingdoms conquered';
    $('tileEndlessSub').textContent=data.records.highestWave?('Best wave '+data.records.highestWave):'Survival';
    $('homeContinue').hidden=!data.active;
    if(data.active)$('homeContinue').innerHTML='CONTINUE<span class="sub">'+esc(data.active.label||('Wave '+data.active.wave))+'</span>';
  }
  function showHome(){ paintHome(); show('home'); }

  /* ---- mode select ---- */
  function modeSelect(){
    const nk=P.nextKingdom(), d=P.get();
    const fresh=!Object.keys(d.campaign.completed).length&&!d.records.highestWave;
    panel('CHOOSE YOUR WAR',
      (fresh?'<div class="firstrun"><b>NEW STRATEGOS</b><ul>'+
        '<li>⚔ Spend gold to field soldiers. Four roles: <b>Range, Assault, Heavy, Mobile</b>.</li>'+
        '<li>🛡 A Heavy holds the line — until his spear or shield is gone, and he becomes something else.</li>'+
        '<li>🌍 <b>Campaign</b> conquers kingdoms and permanently grows your army and income.</li>'+
        '<li>♛ <b>Endless</b> is survival.</li></ul></div>':'')+
      '<button class="modecard'+(fresh?' recommended':'')+'" id="modeCampaign">'+
        (fresh?'<span class="modetag">START HERE</span>':'')+
        '<h3>🌍 CAMPAIGN</h3><ul>'+
        '<li><span>Kingdoms conquered</span><b>'+Object.keys(d.campaign.completed).length+' / '+D.kingdomCount+'</b></li>'+
        (nk?'<li><span>Next</span><b>'+esc(nk.civ.displayName)+' · '+nk.kingdom.kingdomNumber+'</b></li>':'')+
        '<li><span>Army capacity</span><b>'+d.unlocks.armyCap+'</b></li></ul></button>'+
      '<button class="modecard" id="modeEndless"><h3>♛ ENDLESS</h3><ul>'+
        '<li><span>Best wave</span><b>'+d.records.highestWave+'</b></li>'+
        '<li><span>Enemies defeated</span><b>'+d.records.enemiesDefeated+'</b></li></ul></button>','home');
    $('modeCampaign').onclick=campaignScreen;
    $('modeEndless').onclick=()=>prepare({mode:'ENDLESS'});
  }
  function campaignScreen(){
    const nk=P.nextKingdom(), d=P.get();
    if(!nk)return panel('CAMPAIGN','<p class="note">Every available kingdom is conquered.</p>','modes');
    const civ=nk.civ, k=nk.kingdom;
    panel('CAMPAIGN',
      '<div class="modecard"><h3>'+esc(civ.displayName)+'</h3><ul>'+
      '<li><span>Kingdom</span><b>'+k.kingdomNumber+' of 5</b></li>'+
      '<li><span>Leader</span><b>'+esc(k.leaderDisplayName)+'</b></li>'+
      '<li><span>Ruler</span><b>'+esc(civ.ruler.name)+'</b></li>'+
      '<li><span>Enemy specialty</span><b>'+esc(k.primaryRole)+'</b></li>'+
      '<li><span>Fortress</span><b>'+esc(civ.fortress.displayName||civ.fortress.id)+'</b></li>'+
      '</ul></div>'+
      '<button class="menubtn primary" id="campGo">BEGIN — KINGDOM '+k.kingdomNumber+'</button>','modes');
    $('campGo').onclick=()=>prepare({mode:'CAMPAIGN',civId:civ.id,kingdomId:k.id,
      targetWave:1+k.kingdomNumber, kingdomNumber:k.kingdomNumber});
  }

  /* ---- preparation: fast, informative, not a loadout simulator ---- */
  function prepare(intent){
    const d=P.get();
    const civ=D.byId(intent.civId)|| (P.nextKingdom()||{}).civ || D.byOrder(Math.min(15,d.campaign.unlockedCivilization)) || D.byOrder(5);
    intent.civId=civ.id;
    const roles=['HEAVY','ASSAULT','RANGE','MOBILE'].filter(r=>civ.roles[r]);
    const missing=['HEAVY','ASSAULT','RANGE','MOBILE'].filter(r=>!civ.roles[r]);
    panel('PREPARE FOR BATTLE',
      '<div class="modecard"><h3>'+esc(civ.displayName)+'</h3><ul>'+
      '<li><span>Mode</span><b>'+(intent.mode==='CAMPAIGN'?'Campaign · Kingdom '+intent.kingdomNumber:'Endless')+'</b></li>'+
      '<li><span>Objective</span><b>'+(intent.mode==='CAMPAIGN'?'Survive to wave '+intent.targetWave:'Survive as long as you can')+'</b></li>'+
      '<li><span>Army capacity</span><b>'+d.unlocks.armyCap+'</b></li>'+
      '<li><span>Income</span><b>×'+d.unlocks.passiveIncome.toFixed(2)+'</b></li>'+
      '<li><span>Enemy ruler</span><b>'+esc(civ.ruler.name)+'</b></li></ul></div>'+
      '<div class="rolegrid">'+roles.map(r=>{
        const u=civ.roles[r];
        return '<div class="rolecard"><span class="ri">'+ROLE_ICON[r]+'</span><b>'+ROLE_LABEL[r]+'</b>'+
          '<small>'+esc(u.displayName||u.unit)+'</small>'+
          '<small class="cost">'+B.costOf(r)+' gold</small></div>';}).join('')+'</div>'+
      (missing.length?'<p class="note">'+esc(civ.displayName)+' fields no '+missing.map(m=>ROLE_LABEL[m]).join('/')+
        ' — historically this army had no such role.</p>':'')+
      '<button class="menubtn primary" id="prepGo">MARCH TO BATTLE</button>','modes');
    $('prepGo').onclick=()=>{ if(onStartBattle)onStartBattle(intent); };
  }

  /* ---- results ---- */
  function results(o){
    const d=P.get();
    const win=o.result==='victory';
    const cells=[
      ['<small>'+(o.mode==='CAMPAIGN'?'KINGDOM':'WAVE REACHED')+'</small><b>'+esc(o.scope)+'</b>'],
      ['<small>ENEMIES DEFEATED</small><b>'+o.kills+'</b>'],
      ['<small>GOLD EARNED</small><b>🪙 '+Math.floor(o.goldEarned)+'</b>'],
      o.reward&&o.reward.gems?['<small>GEMS</small><b>💎 +'+o.reward.gems+'</b>']:null,
      o.reward&&o.reward.armyCap?['<small>ARMY CAPACITY</small><b>+'+o.reward.armyCap+'</b>']:null,
      o.reward&&o.reward.income?['<small>PASSIVE INCOME</small><b>+'+Math.round(o.reward.income*100)+'%</b>']:null
    ].filter(Boolean).map(c=>'<div>'+c[0]+'</div>').join('');
    const notes=[];
    if(o.reward&&o.reward.unlockedCivilization)notes.push('🔓 New civilization unlocked');
    if(o.transitions)notes.push('🛡 '+o.transitions+' heavy infantry reclassified mid-battle');
    $('resultsBody').innerHTML=
      '<div class="rbanner '+(win?'win':'lose')+'">'+(win?'VICTORY':'DEFEAT')+'</div>'+
      '<div class="rsub">'+esc(o.subtitle||'')+'</div>'+
      '<div class="rstats">'+cells+'</div>'+
      (notes.length?'<div class="rnotes">'+notes.join('<br>')+'</div>':'')+
      '<div class="racts">'+
        (o.next?'<button class="primary" data-act="next">NEXT BATTLE</button>':'')+
        '<button'+(o.next?'':' class="primary"')+' data-act="retry">'+(win?'FIGHT AGAIN':'RETRY')+'</button>'+
        '<button data-act="modes">'+(o.mode==='CAMPAIGN'?'CAMPAIGN':'ENDLESS')+'</button>'+
        '<button data-act="home" style="grid-column:1/3">HOME</button></div>';
    show('results');
    $('resultsBody').querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>{
      const a=b.dataset.act;
      if(a==='next'&&onStartBattle)return onStartBattle(o.next);
      if(a==='retry'&&onStartBattle)return onStartBattle(o.retry);
      if(a==='modes')return (showHome(),modeSelect());
      showHome();
    });
  }

  function bind(startFn){
    onStartBattle=startFn;
    $('enterBtn').onclick=()=>{ showHome(); };
    $('titleContinue').onclick=function(){
      showHome();
      if(this.dataset.mode==='RESUME'&&P.get().active)onStartBattle({resume:true});
      else modeSelect();
    };
    $('titleSettings').onclick=()=>{ showHome(); settings(); };
    $('playBtn').onclick=modeSelect;
    $('homeContinue').onclick=()=>onStartBattle({resume:true});
    $('tileCampaign').onclick=campaignScreen;
    $('tileEndless').onclick=()=>prepare({mode:'ENDLESS'});
    $('tileArmy').onclick=army;
    $('tileRecords').onclick=records;
    $('tileSettings').onclick=settings;
    $('panelBack').onclick=()=>{
      if(backTo==='modes')modeSelect(); else showHome();
    };
  }
  function army(){
    const d=P.get(), nk=P.nextKingdom();
    const civ=nk?nk.civ:D.byOrder(Math.min(15,d.campaign.unlockedCivilization))||D.byOrder(1);
    panel('ARMY',
      '<div class="modecard"><h3>'+esc(civ.displayName)+'</h3><ul>'+
      '<li><span>Army capacity</span><b>'+d.unlocks.armyCap+'</b></li>'+
      '<li><span>Passive income</span><b>×'+d.unlocks.passiveIncome.toFixed(2)+'</b></li>'+
      '<li><span>Legacy XP</span><b>'+d.profile.legacyXP+'</b></li>'+
      '</ul><p class="note">Capacity and income grow permanently through Campaign victories.</p></div>'+
      '<div class="rolegrid">'+['HEAVY','ASSAULT','RANGE','MOBILE'].map(r=>{
        const u=civ.roles[r];
        return '<div class="rolecard'+(u?'':' off')+'"><span class="ri">'+ROLE_ICON[r]+'</span><b>'+ROLE_LABEL[r]+'</b>'+
          '<small>'+(u?esc(u.displayName||u.unit):'not fielded in this era')+'</small></div>';}).join('')+'</div>','home');
  }
  function records(){
    const r=P.get().records;
    panel('RECORDS',
      '<div class="modecard"><h3>THIS DEVICE</h3><ul>'+
      '<li><span>Highest Endless wave</span><b>'+r.highestWave+'</b></li>'+
      '<li><span>Enemies defeated</span><b>'+r.enemiesDefeated+'</b></li>'+
      '<li><span>Kingdoms conquered</span><b>'+r.kingdomsConquered+' / '+D.kingdomCount+'</b></li>'+
      '<li><span>Rulers defeated</span><b>'+r.bossesDefeated+'</b></li></ul></div>'+
      '<p class="note">Global rankings require online accounts and are not available yet. '+
      'Only your own device-local records are shown.</p>','home');
  }
  function settings(){
    const s=P.get().settings;
    panel('SETTINGS',
      '<label class="srow"><span>Camera</span><select id="setView">'+
        '<option value="FIXED"'+(s.view==='FIXED'?' selected':'')+'>Fixed side (recommended)</option>'+
        '<option value="FREE"'+(s.view==='FREE'?' selected':'')+'>Free</option></select></label>'+
      '<label class="srow"><span>Sound</span><input type="checkbox" id="setSound"'+(s.sound?' checked':'')+'></label>'+
      '<label class="srow"><span>Screen shake</span><input type="checkbox" id="setShake"'+(s.shake?' checked':'')+'></label>'+
      '<label class="srow"><span>Damage numbers</span><input type="checkbox" id="setDmg"'+(s.damageNumbers?' checked':'')+'></label>'+
      '<p class="note">Advanced</p>'+
      '<button class="menubtn" id="setSlice">GREEK VERTICAL SLICE (REVIEW)</button>'+
      '<button class="menubtn" id="setDiag">TECHNICAL DIAGNOSTICS</button>'+
      '<p class="note">The review battle starts a Classical Greece skirmish directly so the '+
      'four roles and the Heavy transition can be inspected without playing forward through '+
      'the campaign. It grants no progression.</p>','home');
    $('setView').onchange=e=>{s.view=e.target.value;F.setMode(s.view);P.persist();};
    $('setSound').onchange=e=>{s.sound=e.target.checked;P.persist();};
    $('setShake').onchange=e=>{s.shake=e.target.checked;P.persist();};
    $('setDmg').onchange=e=>{s.damageNumbers=e.target.checked;P.persist();};
    $('setDiag').onclick=diagnostics;
    $('setSlice').onclick=()=>{ if(onStartBattle)onStartBattle(
      {mode:'ENDLESS',civId:'classical_greece',review:true}); };
  }
  function diagnostics(){
    const b=window.KW2Build||{}, d=P.get();
    panel('TECHNICAL DIAGNOSTICS',
      '<p><b>Kingdom Wars II '+(b.appVersion||'dev')+'</b><br>Build '+(b.buildNumber||'—')+
      ' · save schema '+window.KW2Save.schemaVersion+'<br>Civilizations '+D.civCount+' · kingdoms '+D.kingdomCount+
      '<br>Legacy import: '+(d.migration?JSON.stringify(d.migration.imported||[]):'n/a')+
      '<br>Simulation fixed 60 Hz · active enemy budget '+B.ACTIVE_BUDGET+'</p>'+
      '<p class="note">Accounts, cloud saves and global leaderboards are not connected in this build.</p>','home');
  }

  window.KW2Shell=Object.freeze({showTitle,showHome,paintHome,modeSelect,prepare,results,
    bind,show,panel,settings,records,army,diagnostics});
})();
