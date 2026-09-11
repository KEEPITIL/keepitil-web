(function(){
  'use strict';
  const KEY='kingdom-wars-experience-v1';
  const base={profile:{name:'Wandering Commander',legacyLevel:1,legacyXP:0,gems:0,title:'Founder'},records:{highestWave:0,longestRun:0,enemiesDefeated:0,bossesDefeated:0},missions:{day:'',waves:0,recruits:0,powers:0,claimed:{}},settings:{sound:true,vibration:true,shake:true,damageNumbers:true,healthBars:true,tips:true},active:null,lastPlayed:0};
  function merge(saved){return {...base,...saved,profile:{...base.profile,...(saved.profile||{})},records:{...base.records,...(saved.records||{})},missions:{...base.missions,...(saved.missions||{}),claimed:{...base.missions.claimed,...(saved.missions?.claimed||{})}},settings:{...base.settings,...(saved.settings||{})}};}
  function load(){
    try{
      if(window.KWSave){
        const profile=KWSave.read('profile'),run=KWSave.read('run');
        if(profile.ok||run.ok){
          const restored=merge({...profile.payload,active:run.ok?run.payload?.active:null});
          restored.recoveryNotice=[profile,run].some(r=>r.ok&&r.source!=='current');
          return restored;
        }
        const bridge=KWSave.read('experience');if(bridge.ok)return merge(bridge.payload);
      }
      return merge(JSON.parse(localStorage.getItem(KEY)||'{}'));
    }catch(e){return JSON.parse(JSON.stringify(base));}
  }
  let data=load();
  const missionDay=()=>new Date().toISOString().slice(0,10);
  if(data.missions.day!==missionDay())data.missions={day:missionDay(),waves:0,recruits:0,powers:0,claimed:{}};
  const hub=document.getElementById('shell'),panel=document.getElementById('shellpanel');
  const safeUnit=u=>{const c={...u};delete c.tgt;return c;};
  function persist(){
    try{
      if(window.KWSave){
        const profile=KWSave.write('profile',{profile:data.profile,records:data.records,missions:data.missions,settings:data.settings,lastPlayed:data.lastPlayed},false);
        const run=KWSave.write('run',{active:data.active},!!data.active&&data.active.phase==='inter');
        return profile.ok&&run.ok;
      }
      localStorage.setItem(KEY,JSON.stringify(data));return true;
    }catch(e){return false;}
  }
  /* Mid-wave saves used to rewind a whole wave: they stored wave-1 in phase
     'inter' and threw the reserve queue away, so resuming re-ran the entire
     wave from scratch. Because every kill pays gold (index.html: `S.gold += b`
     on death), that let a player farm the same enemies indefinitely by
     backgrounding the app -- and it re-spawned bosses that were already dead.

     Instead the wave is now saved AS IT STANDS. Living enemies are not
     serialised; they are returned to the reserve queue by type and removed
     from spawnedTotal, which is exact deterministic reconstruction:
       spawned' + queue' == (spawned - alive) + (queue + alive) == waveTotal
     Already-defeated enemies stay in defeatedTotal and never come back. */
  function saveRun(){
    if(!started||!S||S.over||S.campaignMissionId)return false;
    const activeBattle=S.phase==='wave';
    const queue=[...S.waveQueue];
    let spawned=S.spawnedTotal||0, bossSpawned=!!S.bossSpawned;
    if(activeBattle){
      for(const u of S.units){
        if(u.team===-1&&u.hp>0){
          queue.push(u.type);
          spawned--;
          if(u.boss)bossSpawned=false;   // alive, so not defeated: it re-enters, it is not duplicated
        }
      }
    }
    data.active={...S,
      units:S.units.filter(u=>u.hp>0&&(!activeBattle||u.team===1)).map(safeUnit),
      projs:[],fx:[],floats:[],splats:[],corpses:[],
      waveQueue:queue,
      spawnedTotal:Math.max(0,spawned),
      bossSpawned,
      cohortPending:0,spawnT:0,
      // The returned enemies walk back on as a fresh line.
      enemyPhase:activeBattle?'form':S.enemyPhase,
      enemyFormWaitT:0,
      checkpointNotice:false};
    data.lastPlayed=Date.now();data.records.highestWave=Math.max(data.records.highestWave,S.wave);data.records.longestRun=Math.max(data.records.longestRun,S.time||0);
    return persist();
  }
  function closeHub(){hub.classList.add('hidden');panel.classList.add('hidden');}
  function startNew(){data.active=null;persist();audio();reset();bakeCastles();btnEls.gunner.style.display='none';btnEls.laser.style.display='none';document.getElementById('overlay').classList.add('hidden');closeHub();started=true;paused=false;follow=true;syncFollowBtn();window.KWAnalytics?.track('run_started',{mode:'ENDLESS',newRun:true},'critical');showMsg('TRIBAL STONE ERA · Survive and defend your kingdom!');}
  function beginNew(){return window.KWEquipment?KWEquipment.renderPreBattle(showPanel,startNew,{civilization:1,mode:'ENDLESS'}):startNew();}
  function continueRun(){
    if(!data.active)return beginNew();
    reset();S=data.active;S.units=(S.units||[]).map(u=>({...u,tgt:null}));S.projs=[];S.fx=[];S.floats=[];S.splats=[];S.corpses=[];
    bakeCastles();rebakePlayer();btnEls.gunner.style.display=S.civ>=11?'flex':'none';btnEls.laser.style.display='none';closeHub();document.getElementById('overlay').classList.add('hidden');started=true;paused=false;follow=true;syncFollowBtn();
    window.KWAnalytics?.track('run_started',{mode:'ENDLESS',newRun:false},'critical');showMsg(data.recoveryNotice?'Save recovered safely from backup':(S.checkpointNotice?'Run restored at a safe wave checkpoint':'War continued'));delete S.checkpointNotice;delete data.recoveryNotice;
  }
  /* ---- §1 CANONICAL BATTLE START ----------------------------------------
     Every battle entry -- new run, continue, campaign kingdom, final siege,
     and every RETRY / PLAY AGAIN from the results screen -- goes through
     startBattle(). The results overlay used to call reset()+started=true
     directly, which skipped data.active=null, persist(), the loadout screen
     and the civ-dependent unit-button setup. There is now no second path:
     #startbtn is bound to startBattle() below and the raw starters are not
     exported. `lastBattle` records the intent so RETRY can replay it. */
  let lastBattle=null;
  function startBattle(intent){
    const i=intent||lastBattle||{mode:'ENDLESS'};
    window.KWShell?.takeSnapshot?.();
    const pre=i.prebattle!==false;
    if(i.mode==='CONTINUE'){
      if(!data.active)return startBattle({mode:'ENDLESS'});
      lastBattle={mode:'ENDLESS'};           // a retry after continuing is a fresh endless run
      continueRun();return true;
    }
    if(i.mode==='CAMPAIGN'){
      const node=window.KWCampaign?.nodeById?.(i.missionId);
      if(!node)return false;
      lastBattle={mode:'CAMPAIGN',missionId:i.missionId,civOrder:i.civOrder};
      const go=()=>{data.active=null;persist();audio();window.KWCampaign.start(i.missionId,i.difficulty);};
      return pre&&window.KWEquipment
        ? (KWEquipment.renderPreBattle(showPanel,go,{civilization:i.civOrder||1,mode:'CAMPAIGN'}),true)
        : (go(),true);
    }
    if(i.mode==='SIEGE'){
      if(!window.KWFinalSiege)return false;
      lastBattle={mode:'SIEGE',civOrder:i.civOrder};
      const go=()=>{data.active=null;persist();audio();window.KWFinalSiege.start(i.civOrder);};
      return pre&&window.KWEquipment
        ? (KWEquipment.renderPreBattle(showPanel,go,{civilization:i.civOrder||1,mode:'SIEGE'}),true)
        : (go(),true);
    }
    lastBattle={mode:'ENDLESS'};
    return pre?(beginNew(),true):(startNew(),true);
  }
  function lastBattleIntent(){return lastBattle?{...lastBattle}:null;}
  // Some saves carry an inflated gateHP (or a zero gateMax); the fort
  // percentage is clamped so the menu can never print e.g. 100000000000%.
  const mins=s=>Math.floor((s||0)/60)+'m '+Math.floor((s||0)%60)+'s';
  const played=t=>t?new Date(t).toLocaleString():'Never';
  function mainMenu(){
    if(started)saveRun();started=false;paused=true;document.getElementById('overlay').classList.add('hidden');hub.classList.remove('hidden');panel.classList.add('hidden');
    const a=data.active,cont=document.getElementById('continuebtn');cont.hidden=!a;
    document.getElementById('continuesub').textContent=a?('Wave '+a.wave+' · '+CIV_NAMES[(a.civ||1)-1]+' · '+Math.max(0,Math.min(100,Math.round(100*(a.gateHP||0)/(a.gateMax||1))))+'% fort · '+mins(a.time)+' · '+played(data.lastPlayed)):'';
  }
  function showPanel(title,html){document.getElementById('paneltitle').textContent=title;document.getElementById('panelbody').innerHTML=html;panel.classList.remove('hidden');}
  function showKingdom(){const p=data.profile,r=data.records,g=window.KWCommerce?KWCommerce.balance():p.gems;showPanel('ARMY · KINGDOM','<div class="profilecrest">⚜</div><h3>'+p.name+'</h3><p>'+p.title+' · Legacy Level '+p.legacyLevel+'</p><p>Legacy XP: '+p.legacyXP+' · Gems: 💎 '+g+'</p><hr><p>Highest wave: '+r.highestWave+'<br>Longest war: '+mins(r.longestRun)+'<br>Total enemies defeated: '+r.enemiesDefeated+'<br>Bosses defeated: '+r.bossesDefeated+'</p>');}
  const missionDefs={waves:{goal:5,label:'Complete 5 waves'},recruits:{goal:20,label:'Recruit 20 soldiers'},powers:{goal:10,label:'Use 10 battlefield powers'}};
  function missionProgress(key,amount=1){
    const def=missionDefs[key];if(!def)return;
    data.missions[key]=Math.min(def.goal,(data.missions[key]||0)+amount);
    if(data.missions[key]>=def.goal&&!data.missions.claimed[key]){
      data.missions.claimed[key]=true;
      const rewardId=data.missions.day+':'+key;
      window.KWCommerce?.rewardMission?.(rewardId,5);
      if(typeof showMsg==='function')showMsg('✅ Daily order complete: '+def.label+' · +5 gems');
    }
    persist();
  }
  function showMissions(){const rows=Object.entries(missionDefs).map(([key,d])=>{const n=Math.min(d.goal,data.missions[key]||0),done=!!data.missions.claimed[key];return '<div class="mission"><span>'+d.label+'</span><b>'+n+' / '+d.goal+' · '+(done?'✅ +5 💎':'💎5')+'</b></div>';}).join('');showPanel('DAILY ORDERS','<p><b>Daily Orders · '+data.missions.day+'</b></p>'+rows+'<p class="note">Progress saves automatically. Completed rewards are deposited immediately and reset with the next UTC day.</p>');}
  function showStore(){if(window.KWCommerce)KWCommerce.renderStore(showPanel);else showPanel('SHOP','<p class="note">Shop data is unavailable. Endless War remains playable.</p>');}
  function showLoadouts(){if(window.KWEquipment)KWEquipment.render(showPanel,S?.civ||1);else showPanel('ARMORY','<p class="note">Equipment data is unavailable.</p>');}
  function showCampaign(){if(window.KWCampaign)KWCampaign.render(showPanel);else showPanel('WORLD CRUSADE','<p class="note">Campaign data is unavailable.</p>');}
  function showWarCouncil(){if(S?.campaignMissionId)return showPanel('WAR COUNCIL','<p class="note">The War Council is available only in Endless War. Campaign conquest uses permanent kingdom rewards.</p>');if(window.KWWarCouncil)KWWarCouncil.render(showPanel);else showPanel('WAR COUNCIL','<p class="note">War Council is unavailable.</p>');}
  function showRecords(){const r=data.records;showPanel('RECORDS','<p>Highest wave: <b>'+r.highestWave+'</b></p><p>Longest run: <b>'+mins(r.longestRun)+'</b></p><p>Enemies defeated: <b>'+r.enemiesDefeated+'</b></p><p>Bosses defeated: <b>'+r.bossesDefeated+'</b></p><p class="note">Global rankings require online accounts and are not available yet. Only your own device-local records are shown.</p>');}
  function showSettings(){
    const s=data.settings,a=window.KWArt?KWArt.settings:{violence:'standard',reducedEffects:false,graphics:'auto'},au=window.KWAudio?KWAudio.settings:{master:1,music:.65,effects:.85,voice:.9,ambience:.45,ui:.75,haptics:true,reducedDensity:false,commandText:true,dynamicRange:'standard',debug:false};
    const slider=(key,label)=>'<label>'+label+' <span id="'+key+'Value">'+Math.round(au[key]*100)+'%</span><input data-audio="'+key+'" type="range" min="0" max="1" step="0.05" value="'+au[key]+'"></label>';
    showPanel('SETTINGS',slider('master','Master volume')+slider('music','Music volume')+slider('effects','Effects volume')+slider('voice','Voice volume')+slider('ambience','Ambience volume')+'<label>Dynamic range <select id="dynamicRange"><option value="standard">Standard</option><option value="night">Night Mode</option><option value="wide">Wide Range</option></select></label><label><input id="audioHaptics" type="checkbox" '+(au.haptics?'checked':'')+'> Haptics</label><label><input id="reducedAudio" type="checkbox" '+(au.reducedDensity?'checked':'')+'> Reduced audio density</label><label><input id="commandText" type="checkbox" '+(au.commandText?'checked':'')+'> Command text</label><label><input id="audioDebugToggle" type="checkbox" '+(au.debug?'checked':'')+'> Audio debug panel</label><hr><label><input data-setting="shake" type="checkbox" '+(s.shake?'checked':'')+'> Screen shake</label><label><input data-setting="damageNumbers" type="checkbox" '+(s.damageNumbers?'checked':'')+'> Damage numbers</label><label><input data-setting="healthBars" type="checkbox" '+(s.healthBars?'checked':'')+'> Health bars</label><label><input data-setting="tips" type="checkbox" '+(s.tips?'checked':'')+'> Tutorial tips</label><label>Violence <select id="violenceMode"><option value="standard">Standard</option><option value="reduced">Reduced Blood</option><option value="minimal">Minimal Violence</option></select></label><label>Soldier detail <select id="graphicsMode"><option value="auto">Auto (full detail; simplifies only in huge sieges)</option><option value="high">Always full detail</option><option value="lite">Lite (fastest, thin soldiers)</option></select></label><label><input id="reducedEffects" type="checkbox" '+(a.reducedEffects?'checked':'')+'> Reduced effects</label><button class="menubtn" id="transactionHistory">GEM TRANSACTION HISTORY</button><button class="menubtn" id="restorePurchases">RESTORE PURCHASES</button><p class="note">Audio is generated locally. Recorded music and sound packages can replace these events later without changing combat code.</p>');
    const body=document.getElementById('panelbody');if(window.KWAccount){const ab=document.createElement('button');ab.className='menubtn primary';const st=window.KWCloud?window.KWCloud.state():{};ab.textContent=st.signedIn?('ACCOUNT · '+st.email):'ACCOUNT & CLOUD SAVES';ab.onclick=()=>window.KWAccount.showAccount();body.appendChild(ab);}const adv=document.createElement('p');adv.className='note';adv.textContent='Advanced';body.appendChild(adv);const diagButton=document.createElement('button');diagButton.className='menubtn';diagButton.textContent='TECHNICAL DIAGNOSTICS';diagButton.onclick=showDiagnostics;body.appendChild(diagButton);
    panel.querySelectorAll('[data-setting]').forEach(el=>el.onchange=()=>{data.settings[el.dataset.setting]=el.checked;persist();});
    panel.querySelectorAll('[data-audio]').forEach(el=>el.oninput=()=>{KWAudio.set(el.dataset.audio,el.value);document.getElementById(el.dataset.audio+'Value').textContent=Math.round(el.value*100)+'%';muted=KWAudio.settings.master<=0;document.getElementById('sndbtn').textContent=muted?'🔇':'🔊';});
    const bind=(id,key)=>document.getElementById(id).onchange=e=>KWAudio.set(key,e.target.checked);bind('audioHaptics','haptics');bind('reducedAudio','reducedDensity');bind('commandText','commandText');bind('audioDebugToggle','debug');
    const dr=document.getElementById('dynamicRange');dr.value=au.dynamicRange;dr.onchange=()=>KWAudio.set('dynamicRange',dr.value);
    const vm=document.getElementById('violenceMode');vm.value=a.violence;vm.onchange=()=>KWArt.setSetting('violence',vm.value);
    const gm=document.getElementById('graphicsMode');if(gm){gm.value=a.graphics||'auto';gm.onchange=()=>KWArt.setSetting('graphics',gm.value);}
    document.getElementById('reducedEffects').onchange=e=>KWArt.setSetting('reducedEffects',e.target.checked);document.getElementById('transactionHistory').onclick=()=>window.KWCommerce&&KWCommerce.renderHistory(showPanel);document.getElementById('restorePurchases').onclick=()=>window.KWPlatform?KWPlatform.restorePurchases().then(r=>alert(r.ok?'Purchases restored.':'No platform purchases are available to restore.')):alert('Platform restore is unavailable.');
  }
  function showDiagnostics(){const b=window.KWBuild||{},p=window.KWPlatform,s=window.KWSave,aq=window.KWAnalytics?.status?.()||{};showPanel('TECHNICAL DIAGNOSTICS','<p><b>Kingdom Wars '+(b.appVersion||'unknown')+'</b></p><p>Build: '+(b.buildNumber||'—')+' · Content: '+(b.contentVersion||'—')+'<br>Environment: '+(b.environment||'—')+' · Platform: '+(p?.getPlatform?.()||'web')+'<br>Save schema: '+(s?.schemaVersion||'—')+' · Analytics queued: '+(aq.queued||0)+'</p><p>Simulation: fixed 60 Hz · Max catch-up: 250 ms<br>Player population: 50 · Enemy population: 100</p><p class="note">Commerce, cloud saves, and global leaderboards remain disabled until authenticated server services are connected.</p><button class="menubtn" id="copyDiagnostics">COPY DIAGNOSTICS</button>');document.getElementById('copyDiagnostics').onclick=()=>navigator.clipboard?.writeText(JSON.stringify({build:b,platform:p?.getPlatform?.(),analytics:aq,saveSchema:s?.schemaVersion},null,2));}
  function pauseMenu(){if(!started||!paused)return;showPanel('WAR PAUSED','<button class="menubtn" id="resumeWar">RESUME</button><button class="menubtn" id="saveExit">SAVE AND EXIT</button><button class="menubtn" id="pauseSettings">SETTINGS</button><p class="note">Combat, gold, cooldowns and AI timers are stopped.</p>');hub.classList.remove('hidden');document.getElementById('resumeWar').onclick=()=>{closeHub();togglePause();};document.getElementById('saveExit').onclick=()=>{saveRun();mainMenu();};document.getElementById('pauseSettings').onclick=showSettings;}
  function finishRun(){if(!S)return;window.KWAnalytics?.track('run_ended',{wave:S.wave,civ:S.civ,time:Math.round(S.time||0)},'critical');data.records.highestWave=Math.max(data.records.highestWave,S.wave);data.records.longestRun=Math.max(data.records.longestRun,S.time||0);data.profile.legacyXP+=S.wave*5;data.active=null;persist();}
  function recordKill(){data.records.enemiesDefeated++;}
  function recordBoss(){data.records.bossesDefeated++;persist();}
  window.KWRuntime?.events.on('wave_completed',()=>missionProgress('waves'));
  window.KWRuntime?.events.on('unit_spawned',e=>{if(e?.team===1)missionProgress('recruits');});
  window.KWRuntime?.events.on('power_used',()=>missionProgress('powers'));
  window.KWRuntime?.events.on('campaign_result',e=>{started=false;paused=true;data.active=null;persist();const civ=e.civ,node=e.node;if(window.KWShell){const nk=window.KWShell.nextKingdom();window.KWShell.results({result:e.result,mode:'CAMPAIGN',gold:S?S.gold:null,crowns:e.result==='victory'?e.crowns:null,scopeLabel:'KINGDOM',scopeValue:civ.displayName+' · '+node.kingdomNumber,subtitle:e.result==='victory'?(node.leaderDisplayName+' defeated'):(node.leaderDisplayName+' holds the field'),unlocked:e.firstClear&&node.kingdomNumber===5?(civ.displayName+' era cleared — next civilization unlocked'):null,retry:{mode:'CAMPAIGN',missionId:node.id,civOrder:civ.order},next:(e.result==='victory'&&nk)?{mode:'CAMPAIGN',missionId:nk.node.id,civOrder:nk.civ.order}:null});}else{hub.classList.remove('hidden');}});
  document.getElementById('continuebtn').onclick=()=>startBattle({mode:'CONTINUE'});
  document.getElementById('newrunbtn').onclick=()=>{if(data.active&&!confirm('Starting a new war will end the current run. Continue?'))return;startBattle({mode:'ENDLESS'});};
  document.getElementById('campaignbtn').onclick=showCampaign;document.getElementById('kingdombtn').onclick=showKingdom;document.getElementById('missionsbtn').onclick=showMissions;document.getElementById('storebtn').onclick=showStore;document.getElementById('loadoutbtn').onclick=showLoadouts;document.getElementById('recordsbtn').onclick=showRecords;document.getElementById('settingsbtn').onclick=showSettings;document.getElementById('panelback').onclick=()=>panel.classList.add('hidden');
  document.getElementById('warcouncilbtn').addEventListener('click',()=>{if(started&&!paused){paused=true;document.getElementById('pausebtn').textContent='▶';}hub.classList.remove('hidden');showWarCouncil();});
  document.getElementById('pausebtn').addEventListener('click',()=>setTimeout(pauseMenu,0));
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&started){paused=true;document.getElementById('pausebtn').textContent='▶';saveRun();if(AC&&AC.state==='running')AC.suspend();if(window.KWAudio)KWAudio.suspend();}else if(!document.hidden&&started){hub.classList.remove('hidden');pauseMenu();}});
  window.addEventListener('pagehide',()=>saveRun());window.addEventListener('beforeunload',()=>saveRun());
  window.KWExperience=Object.freeze({saveRun,mainMenu,finishRun,recordKill,recordBoss,showCampaign,showWarCouncil,data,
    startBattle,lastBattleIntent,showPanel,closeHub,persist,missionDefs,
    showKingdom,showMissions,showStore,showLoadouts,showRecords,showSettings,mins,played});
  muted=!data.settings.sound;mainMenu();
})();
