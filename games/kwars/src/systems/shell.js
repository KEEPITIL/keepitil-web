/* KWARS1 GAME SHELL -- title screen, home/command centre, mode select,
   achievements, records and the post-battle results screen.

   This module presents existing systems; it owns no gameplay state and adds
   no persisted fields, so save schema 3 is untouched. Every battle entry it
   offers funnels through KWExperience.startBattle() (the canonical start path)
   -- the shell never calls reset()/started=true itself. */
(function(){
  'use strict';
  const X=window.KWExperience; if(!X)return;
  const D=X.data, $=id=>document.getElementById(id);
  const hub=$('shell'), title=$('title'), panel=$('shellpanel');
  if(!hub||!title||!panel){console.error('KWShell: missing shell container',{hub:!!hub,title:!!title,panel:!!panel});return;}
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  /* ---------- real-state readers (nothing here is fabricated) ---------- */
  const camp   =()=>window.KWCampaign;
  const civName=o=>window.KW_DATA?.byOrder?.(o)?.displayName || (window.CIV_NAMES?.[o-1]) || ('Era '+o);
  const gems   =()=>window.KWCommerce?window.KWCommerce.balance():(D.profile.gems||0);
  function conquered(){const c=camp();if(!c)return 0;return Object.keys(c.state.completed||{}).length;}
  function eraOrder(){const a=D.active;if(a?.civ)return a.civ;return camp()?camp().state.unlockedCivilization||1:1;}
  function nextKingdom(){
    const c=camp();if(!c||!window.KW_DATA)return null;
    for(const civ of window.KW_DATA.civilizations)
      for(const id of civ.campaignKingdomIds){
        const n=c.nodeById(id);
        if(n&&!c.state.completed[id]&&c.unlocked(n))return {node:n,civ};
      }
    return null;
  }
  function siegeLine(){
    const st=window.KWFinalSiege?.status?.(eraOrder());
    if(!st)return null;
    return st.finalFortressDestroyed?'Completed':(st.unlocked?'Ready':'Locked — conquer all five kingdoms');
  }
  const isNewPlayer=()=>!D.active && conquered()===0 && (D.records.highestWave||0)===0;


  /* Small corner account affordance. Guests see SIGN IN; signed-in players see
     their initials. Neither ever blocks play. */
  function paintAccountCorner(signedIn){
    const si=$('titlesignin'), pr=$('titleprofile');
    if(!si||!pr)return;
    const avail = !!(window.KWCloud && KWCloud.state().available);
    if(!avail){ si.hidden=true; pr.hidden=true; return; }
    if(signedIn){
      const em=(KWCloud.state().email||'?');
      si.hidden=true; pr.hidden=false;
      pr.textContent=em.slice(0,2).toUpperCase();
      pr.title='Signed in as '+em;
    } else { si.hidden=false; pr.hidden=true; }
  }
  /* ---------- title screen ---------- */
  function showTitle(){
    const b=window.KWBuild||{};
    $('titleversion').textContent=(b.appVersion?'v'+b.appVersion:'')+(b.buildNumber?' · build '+b.buildNumber:'');
    /* §2 GUEST-FIRST FRONT DOOR.
       A signed-out visitor gets PLAY and a small SIGN IN -- nothing else. The
       title previously led with CONTINUE, which made the front page look like a
       save-management screen to someone who had never played. CONTINUE still
       exists, but on Home, where it belongs. A signed-in player keeps a
       shortcut here because for them it is genuinely the fastest path back. */
    const signedIn = !!(window.KWCloud && KWCloud.state().signedIn);
    paintAccountCorner(signedIn);
    showLanding();                       // §2: CRUSADE / WAR / MORE is the door
    const a=D.active, c=nextKingdom(), t=$('titlecontinue');
    if(!signedIn){ t.hidden=true; }
    else if(a){ t.hidden=false; t.innerHTML='CONTINUE WAR<br><small>Wave '+a.wave+' · '+esc(civName(a.civ||1))+'</small>'; t.dataset.mode='CONTINUE'; }
    else if(conquered()>0&&c){ t.hidden=false; t.innerHTML='CONTINUE CRUSADE<br><small>'+esc(c.civ.displayName)+' · Kingdom '+c.node.kingdomNumber+'</small>'; t.dataset.mode='CRUSADE'; }
    else t.hidden=true;
    hub.classList.add('hidden'); panel.classList.add('hidden');
    $('overlay').classList.add('hidden');
    title.classList.remove('hidden');
  }
  function enterGame(){ title.classList.add('hidden'); X.mainMenu(); }

  /* ---------- §2 LANDING: CRUSADE / WAR / MORE ---------------------------
     The landing is the front door and the Home/command centre is not. Home
     unlocks once the player has actually started a war on this device, or once
     they are signed in -- until then it is a dashboard for progress nobody has.

     CONTINUE while signed out has to survive a full page load, because email
     confirmation takes the player out of the browser and back. The chosen mode
     is therefore parked in localStorage and consumed on return, so they land in
     the war they picked rather than back here. */
  const HOME_UNLOCK_KEY='kw-home-unlocked';
  const PENDING_ENTRY_KEY='kw-pending-entry';
  const PENDING_TTL_MS=1000*60*30;
  function homeUnlocked(){
    if(D.active || conquered()>0 || (D.records.highestWave||0)>0) return true;
    try{ return localStorage.getItem(HOME_UNLOCK_KEY)==='1'; }catch(e){ return false; }
  }
  function unlockHome(){ try{ localStorage.setItem(HOME_UNLOCK_KEY,'1'); }catch(e){} }
  function parkEntry(mode){
    try{ localStorage.setItem(PENDING_ENTRY_KEY,JSON.stringify({mode,at:Date.now()})); }catch(e){}
  }
  function takeEntry(){
    try{
      const raw=localStorage.getItem(PENDING_ENTRY_KEY);
      if(!raw)return null;
      localStorage.removeItem(PENDING_ENTRY_KEY);
      const v=JSON.parse(raw);
      if(!v||!v.mode||Date.now()-(v.at||0)>PENDING_TTL_MS)return null;
      return v.mode;
    }catch(e){ return null; }
  }
  const MODES={
    CRUSADE:{title:'CRUSADE', sub:'Take kingdoms one at a time and keep what you win.'},
    WAR:    {title:'WAR',     sub:'One battlefield. Waves that never stop.'}
  };
  function showLanding(){
    $('landingmode').hidden=true;
    $('landingmain').hidden=false;
    const sub=$('moresub');
    if(sub){
      const st=window.KWCloud&&KWCloud.state();
      sub.textContent = st&&st.signedIn ? ('Signed in · '+st.email)
                      : (homeUnlocked()?'Account, command centre & settings':'Account & settings');
    }
  }
  function hasCrusadeSave(){ return conquered()>0; }
  function hasWarSave(){ return !!(D.active) || (D.records.highestWave||0)>0; }
  function showModeEntry(mode){
    const m=MODES[mode]; if(!m)return;
    $('landingmain').hidden=true;
    $('landingmode').hidden=false;
    $('landingmodetitle').textContent=m.title;
    $('landingmodesub').textContent=m.sub;
    const cont=$('modecontinue'), csub=$('modecontinuesub');
    const have = mode==='CRUSADE' ? hasCrusadeSave() : hasWarSave();
    const signedIn=!!(window.KWCloud&&KWCloud.state().signedIn);
    // CONTINUE is always offered: a signed-out player with no local save may
    // still have a save on their account, and that is precisely the case the
    // owner asked to route through login and come back.
    cont.hidden=false;
    if(have){
      csub.textContent = mode==='CRUSADE'
        ? (nextKingdom()?('Next: '+nextKingdom().civ.displayName+' · Kingdom '+nextKingdom().node.kingdomNumber):'Resume the crusade')
        : (D.active?('Wave '+D.active.wave+' · '+civName(D.active.civ||1)):('Best wave '+(D.records.highestWave||0)));
    } else {
      csub.textContent = signedIn ? 'No saved war yet' : 'Sign in to load a saved war';
    }
    cont.dataset.mode=mode;
    $('modenew').dataset.mode=mode;
  }
  function startMode(mode,fresh){
    unlockHome();
    window.KWAudio?.resume?.();
    title.classList.add('hidden');
    X.mainMenu();
    if(mode==='CRUSADE'){ crusadeScreen('home'); }
    else if(fresh || !D.active){ endlessScreen('home'); }
    else { X.startBattle({mode:'CONTINUE'}); }
  }
  function continueMode(mode){
    const signedIn=!!(window.KWCloud&&KWCloud.state().signedIn);
    const have = mode==='CRUSADE' ? hasCrusadeSave() : hasWarSave();
    if(have || signedIn) return startMode(mode,false);
    // Signed out with nothing local: park the choice, send them to sign in, and
    // come straight back to this mode once auth succeeds.
    parkEntry(mode);
    unlockHome();
    title.classList.add('hidden'); X.mainMenu();
    if(window.KWAccount) KWAccount.authForm('in'); else X.showSettings();
  }
  if($('entercrusade'))$('entercrusade').onclick=()=>{ window.KWAudio?.resume?.(); showModeEntry('CRUSADE'); };
  if($('enterwar'))    $('enterwar').onclick    =()=>{ window.KWAudio?.resume?.(); showModeEntry('WAR'); };
  if($('entermore'))   $('entermore').onclick   =()=>{
    window.KWAudio?.resume?.();
    title.classList.add('hidden'); X.mainMenu();
    if(!homeUnlocked() && window.KWAccount) KWAccount.showAccount();
  };
  if($('modeback'))    $('modeback').onclick    =showLanding;
  if($('modenew'))     $('modenew').onclick     =function(){ startMode(this.dataset.mode,true); };
  if($('modecontinue'))$('modecontinue').onclick=function(){ continueMode(this.dataset.mode); };

  $('enterbtn').onclick=()=>{ window.KWAudio?.resume?.(); enterGame(); };
  $('titlecontinue').onclick=function(){
    window.KWAudio?.resume?.();
    const mode=this.dataset.mode;
    title.classList.add('hidden'); X.mainMenu();
    if(mode==='CONTINUE')X.startBattle({mode:'CONTINUE'});
    else crusadeContinue();
  };
  $('titlesettings').onclick=()=>{ title.classList.add('hidden'); X.mainMenu(); X.showSettings(); };
  if($('titlesignin'))$('titlesignin').onclick=()=>{
    title.classList.add('hidden'); X.mainMenu();
    if(window.KWAccount)KWAccount.authForm('in'); else X.showSettings();
  };
  if($('titleprofile'))$('titleprofile').onclick=()=>{
    title.classList.add('hidden'); X.mainMenu();
    if(window.KWAccount)KWAccount.showAccount();
  };
  $('titleaudio').onclick=function(){
    const on=!(window.KWAudio?window.KWAudio.settings.master<=0:!D.settings.sound);
    if(window.KWAudio)window.KWAudio.set('master',on?0:.85);
    D.settings.sound=!on; X.persist();
    this.textContent=(!on)?'🔊':'🔇';
  };

  /* ---------- home / command centre ---------- */
  function paintHome(){
    const a=D.active, p=D.profile, era=eraOrder();
    $('hudname').textContent=p.name;
    $('hudera').textContent=civName(era)+' · '+p.title+' · Legacy '+p.legacyLevel;
    $('hudcrusade').textContent='🏰 '+conquered()+'/75';
    $('hudwave').textContent='♛ '+(D.records.highestWave||0);
    $('hudgems').textContent='💎 '+gems();
    const nk=nextKingdom();
    const first=isNewPlayer();
    /* §2 FIRST-TIME HOME.
       A first-time commander arrives knowing nothing about the two modes, so
       Home says what each one IS -- not just its score -- and marks the one we
       recommend. Returning players see their real progress instead, because
       for them the numbers are the useful thing. Nothing here asks for an
       account: saving online stays optional and lives on its own line. */
    $('tilecrusade').textContent=first
      ? 'Story campaign · conquer 75 kingdoms'
      : (nk?('Next: '+nk.civ.displayName+' · Kingdom '+nk.node.kingdomNumber)
           :(conquered()?'All available kingdoms conquered':'Campaign'));
    $('tileendless').textContent=first
      ? 'Survival · hold out as long as you can'
      : (D.records.highestWave?'Best wave '+D.records.highestWave:'Survival mode');
    const badge=$('crusadebadge'); if(badge)badge.hidden=!first;
    const intro=$('homeintro');
    if(intro){
      intro.hidden=!first;
      if(first)intro.textContent='Two ways to fight: the World Crusade is the story — take kingdoms one at a time and keep what you win. Endless War is survival — one battlefield, waves that never stop. Start with the Crusade.';
    }
    const psub=$('playsub');
    if(psub){
      const where=a?('Wave '+a.wave+' · '+civName(a.civ||1))
                   :(nk?('World Crusade · '+nk.civ.displayName+' · Kingdom '+nk.node.kingdomNumber):null);
      psub.hidden=!where; if(where)psub.textContent=where;
    }
    $('playbtn').firstChild.nodeValue=a?'▶ PLAY':(first?'▶ PLAY — START YOUR FIRST WAR':'▶ PLAY');
    // §39: a new build is ready. Offer it at Home only -- never mid-battle --
    // and reload on the player's word. Reloading never touches saved progress.
    const note=$('updatenote');
    if(note){
      note.hidden=!window.KWUpdateReady;
      note.onclick=()=>{ try{ X.saveRun(); }catch(e){} location.reload(); };
    }
  }
  // Home is re-shown by many paths (mainMenu, war council, campaign results),
  // so repaint whenever #hub becomes visible rather than at each call site.
  function syncChrome(){
    const shellUp = !title.classList.contains('hidden') || !hub.classList.contains('hidden')
                 || !$('overlay').classList.contains('hidden');
    document.body.classList.toggle('kw-shell', shellUp);
  }
  new MutationObserver(()=>{ if(!hub.classList.contains('hidden'))paintHome(); syncChrome(); })
    .observe(hub,{attributes:true,attributeFilter:['class']});
  new MutationObserver(syncChrome).observe(title,{attributes:true,attributeFilter:['class']});
  new MutationObserver(syncChrome).observe($('overlay'),{attributes:true,attributeFilter:['class']});

  /* The panel already owns a single BACK control (#panelback). Shell screens
     retarget it rather than appending a second one, so no panel ever shows two
     back buttons and every route returns cleanly to Home (§24). */
  let backTo='home';
  const back=()=>'';
  function panelNav(target){
    backTo=target||'home';
    const b=$('panelback');
    b.textContent=backTo==='home'?'↩ HOME':'↩ BACK';
    b.onclick=()=>{
      if(backTo==='modes')modeSelect();
      else if(backTo==='crusade')crusadeScreen('home');
      else if(backTo==='endless')endlessScreen('home');
      else panel.classList.add('hidden');
    };
  }
  // Any panel opened by a system other than the shell returns straight Home.
  ['kingdombtn','loadoutbtn','storebtn','missionsbtn','settingsbtn']
    .forEach(id=>$(id).addEventListener('click',()=>setTimeout(()=>panelNav('home'),0)));

  /* ---------- §5 mode select ---------- */
  function modeSelect(){
    const nk=nextKingdom(), a=D.active, first=isNewPlayer();
    const crusade='<button class="modecard'+(first?' recommended':'')+'" id="modeCrusade">'+
      (first?'<span class="modetag">START HERE</span>':'')+
      '<h3>🌍 WORLD CRUSADE</h3><ul>'+
      '<li><span>Current era</span><b>'+esc(civName(eraOrder()))+'</b></li>'+
      '<li><span>Kingdoms conquered</span><b>'+conquered()+' / 75</b></li>'+
      (nk?'<li><span>Next kingdom</span><b>'+esc(nk.civ.displayName)+' · '+nk.node.kingdomNumber+'</b></li>':'')+
      '</ul></button>';
    const endless='<button class="modecard" id="modeEndless"><h3>♛ ENDLESS WAR</h3><ul>'+
      '<li><span>Best wave</span><b>'+(D.records.highestWave||0)+'</b></li>'+
      (a?'<li><span>Run in progress</span><b>Wave '+a.wave+' · '+esc(civName(a.civ||1))+'</b></li>'
        :'<li><span>Mode</span><b>Survival · endless waves</b></li>')+
      '</ul></button>';
    X.showPanel('CHOOSE YOUR WAR',
      (first?firstRunCard():'')+crusade+endless+back());
    $('modeCrusade').onclick=()=>crusadeScreen('modes');
    $('modeEndless').onclick=()=>endlessScreen('modes');
    panelNav('home');
  }

  /* ---------- §7 first-run guidance (short, non-blocking) ---------- */
  function firstRunCard(){
    return '<div class="firstrun"><b style="color:#ffe27a">NEW COMMANDER</b><ul>'+
      '<li>⚔ Spend gold to recruit soldiers, then command them with <b>Defend / March / Attack</b>.</li>'+
      '<li>🛡 Each class fights differently — defenders hold the line, ranged units support, assault units break it.</li>'+
      '<li>🌍 <b>World Crusade</b> conquers kingdoms and permanently improves your kingdom.</li>'+
      '<li>🏰 Clearing all five kingdoms of an era opens its <b>Final Siege</b>.</li>'+
      '<li>♛ <b>Endless War</b> is survival — see how many waves you can hold.</li>'+
      '</ul></div>';
  }

  /* ---------- §5 WORLD CRUSADE screen ---------- */
  function crusadeScreen(from){
    const nk=nextKingdom(), c=camp(), sg=siegeLine();
    if(!c){X.showPanel('WORLD CRUSADE','<p class="note">Campaign data is unavailable.</p>');return panelNav('home');}
    const p=c.progression?.();
    X.showPanel('WORLD CRUSADE',
      '<div class="modecard"><h3>'+esc(civName(eraOrder()))+'</h3><ul>'+
      '<li><span>Kingdoms conquered</span><b>'+conquered()+' / 75</b></li>'+
      (nk?'<li><span>Next kingdom</span><b>'+esc(nk.node.leaderDisplayName)+'</b></li>':'')+
      (sg?'<li><span>Final Siege</span><b>'+esc(sg)+'</b></li>':'')+
      (p?'<li><span>Army capacity</span><b>'+p.armyCap+' / 500</b></li>':'')+
      '</ul></div>'+
      (nk?'<button class="menubtn primary" id="crusadeGo">'+(conquered()?'CONTINUE CRUSADE':'BEGIN THE CRUSADE')+'<span class="menusub">'+esc(nk.civ.displayName)+' · Kingdom '+nk.node.kingdomNumber+' · '+esc(nk.node.leaderDisplayName)+'</span></button>':'')+
      '<button class="menubtn" id="crusadeMap">FULL CAMPAIGN ROADMAP</button>'+
      back());
    if($('crusadeGo'))$('crusadeGo').onclick=crusadeContinue;
    $('crusadeMap').onclick=()=>{X.showCampaign();panelNav('crusade');};
    panelNav(from||'home');
  }
  // Goes through the canonical start path, which opens the real pre-battle screen.
  function crusadeContinue(){
    const nk=nextKingdom();
    if(!nk)return X.showCampaign();
    X.startBattle({mode:'CAMPAIGN',missionId:nk.node.id,civOrder:nk.civ.order});
  }

  /* ---------- §5 ENDLESS screen ---------- */
  function endlessScreen(from){
    const a=D.active;
    X.showPanel('ENDLESS WAR',
      '<div class="modecard"><h3>♛ SURVIVAL</h3><ul>'+
      '<li><span>Best wave</span><b>'+(D.records.highestWave||0)+'</b></li>'+
      '<li><span>Longest war</span><b>'+X.mins(D.records.longestRun)+'</b></li>'+
      '<li><span>Enemies defeated</span><b>'+(D.records.enemiesDefeated||0)+'</b></li>'+
      (a?'<li><span>Run in progress</span><b>Wave '+a.wave+' · '+esc(civName(a.civ||1))+' · '+Math.max(0,Math.min(100,Math.round(100*(a.gateHP||0)/(a.gateMax||1))))+'% fort</b></li>':'')+
      '</ul></div>'+
      (a?'<button class="menubtn primary" id="endlessCont">CONTINUE WAR<span class="menusub">Last played '+esc(X.played(D.lastPlayed))+'</span></button>':'')+
      '<button class="menubtn'+(a?'':' primary')+'" id="endlessNew">'+(a?'START A NEW WAR':'START ENDLESS WAR')+'</button>'+
      back());
    if($('endlessCont'))$('endlessCont').onclick=()=>X.startBattle({mode:'CONTINUE'});
    $('endlessNew').onclick=()=>{
      if(D.active&&!confirm('Starting a new war will end the current run. Continue?'))return;
      X.startBattle({mode:'ENDLESS'});
    };
    panelNav(from||'home');
  }

  /* ---------- §10 achievements: derived milestones only ------------------
     No claim state is stored, so save schema 3 is unchanged. Every condition
     below reads state the game already persists. */
  const MILESTONES=[
    {i:'⚔',n:'First Victory',       d:'Win your first battle',            t:()=>conquered()>0||(D.records.highestWave||0)>=1},
    {i:'🏰',n:'First Kingdom',      d:'Conquer a kingdom in World Crusade',t:()=>conquered()>=1},
    {i:'🏰',n:'Five Kingdoms',      d:'Conquer 5 kingdoms',               t:()=>conquered()>=5},
    {i:'🏰',n:'Ten Kingdoms',       d:'Conquer 10 kingdoms',              t:()=>conquered()>=10},
    {i:'👑',n:'Twenty-Five Kingdoms',d:'Conquer 25 kingdoms',             t:()=>conquered()>=25},
    {i:'👑',n:'Fifty Kingdoms',     d:'Conquer 50 kingdoms',              t:()=>conquered()>=50},
    {i:'👑',n:'Seventy-Five Kingdoms',d:'Conquer every kingdom',          t:()=>conquered()>=75},
    {i:'🛡',n:'Era Conqueror',      d:'Clear all five kingdoms of an era', t:()=>eraCleared()>=1},
    {i:'🔥',n:'First Final Siege',  d:'Complete a Final Siege',           t:()=>siegesDone()>=1},
    {i:'♛',n:'Endless Wave 25',    d:'Reach wave 25 in Endless War',     t:()=>(D.records.highestWave||0)>=25},
    {i:'♛',n:'Endless Wave 50',    d:'Reach wave 50 in Endless War',     t:()=>(D.records.highestWave||0)>=50},
    {i:'♛',n:'Endless Wave 100',   d:'Reach wave 100 in Endless War',    t:()=>(D.records.highestWave||0)>=100},
    {i:'💀',n:'Slayer',            d:'Defeat 1,000 enemies',             t:()=>(D.records.enemiesDefeated||0)>=1000},
    {i:'⚜',n:'Champion',           d:'Defeat 25 leaders or rulers',      t:()=>(D.records.bossesDefeated||0)>=25}
  ];
  function eraCleared(){
    const c=camp(); if(!c||!window.KW_DATA)return 0;
    return window.KW_DATA.civilizations.filter(v=>v.campaignKingdomIds.every(id=>c.state.completed[id])).length;
  }
  function siegesDone(){
    if(!window.KWFinalSiege||!window.KW_DATA)return 0;
    return window.KW_DATA.civilizations.filter(v=>window.KWFinalSiege.status?.(v.order)?.finalFortressDestroyed).length;
  }
  function earnedList(){ return MILESTONES.filter(m=>{try{return !!m.t()}catch(e){return false}}); }
  function showAchievements(){
    const earned=new Set(earnedList().map(m=>m.n));
    const rows=MILESTONES.map(m=>'<div class="achrow'+(earned.has(m.n)?' earned':'')+'">'+
      '<span class="achicon">'+m.i+'</span><span><b>'+esc(m.n)+'</b><small>'+esc(m.d)+'</small></span>'+
      '<span class="achmark">'+(earned.has(m.n)?'✓ EARNED':'—')+'</span></div>').join('');
    X.showPanel('ACHIEVEMENTS','<p class="note">'+earned.size+' of '+MILESTONES.length+' milestones reached. '+
      'Milestones are derived from your saved progress — there is nothing to claim.</p>'+
      '<div class="achgrid">'+rows+'</div>');
    panelNav('home');
  }

  /* ---------- §9 RECORDS (renamed from the false "Leaderboards") ---------- */
  function showRecords(){
    const r=D.records;
    X.showPanel('RECORDS',
      '<div class="modecard"><h3>THIS DEVICE</h3><ul>'+
      '<li><span>Highest Endless wave</span><b>'+r.highestWave+'</b></li>'+
      '<li><span>Longest war</span><b>'+X.mins(r.longestRun)+'</b></li>'+
      '<li><span>Enemies defeated</span><b>'+r.enemiesDefeated+'</b></li>'+
      '<li><span>Leaders &amp; rulers defeated</span><b>'+r.bossesDefeated+'</b></li>'+
      '<li><span>Kingdoms conquered</span><b>'+conquered()+' / 75</b></li>'+
      '</ul></div>'+
      '<p class="note">Global rankings require online accounts and are not available yet. '+
      'Only your own device-local records are shown.</p>');
    panelNav('home');
  }


  /* ---------- §3 SAVE PROGRESS ------------------------------------------
     Offered only when there is something worth saving and only at meaningful
     checkpoints. A dismissal is remembered for a cooldown so the prompt never
     nags, and NOT NOW always continues play untouched. */
  // Return to the command centre: hub visible, panel closed. X.mainMenu() is
  // the canonical route and also stops any running battle cleanly.
  function goHome(){ X.mainMenu(); panel.classList.add('hidden'); }
  const SAVE_DISMISS_KEY='kw-save-offer-dismissed';
  const SAVE_COOLDOWN_MS=1000*60*60*20;
  function noteSaveDismissed(){ try{localStorage.setItem(SAVE_DISMISS_KEY,String(Date.now()));}catch(e){} }
  function saveRecentlyDismissed(){
    try{ const t=+localStorage.getItem(SAVE_DISMISS_KEY)||0; return Date.now()-t < SAVE_COOLDOWN_MS; }catch(e){ return false; }
  }
  function hasRealProgress(){
    const d=P_get();
    return conquered()>0 || (d.records.highestWave||0)>0 || (d.profile.legacyXP||0)>0;
  }
  const P_get=()=>X.data;
  function shouldOfferSave(){
    if(!window.KWCloud||!KWCloud.state().available)return false;
    if(KWCloud.state().signedIn)return false;          // already saving online
    if(!hasRealProgress())return false;                 // nothing to save yet
    if(saveRecentlyDismissed())return false;            // no nagging
    return true;
  }
  function savePromptHTML(){
    return '<div class="saveoffer">'+
      '<b>SAVE PROGRESS</b>'+
      '<small>You are playing as a guest — progress lives on this device only. '+
      'Create a free account to keep it if you clear your browser or switch device.</small>'+
      '<div class="saveacts">'+
        '<button class="primary" id="saveProgressBtn">SAVE PROGRESS</button>'+
        '<button id="saveNotNow">NOT NOW</button>'+
      '</div></div>';
  }
  // Full-panel version, used from Home / profile
  function savePrompt(){
    if(!window.KWAccount)return;
    const d=P_get();
    X.showPanel('SAVE YOUR PROGRESS',
      '<p class="note">Your campaign, records and gems are saved on this device. '+
      'An account keeps them if you clear your browser or play somewhere else. '+
      'You can keep playing as a guest for as long as you like.</p>'+
      (window.KWCloud?window.KWAccount.summary(KWCloud.digest(KWCloud.bundle())):'')+
      '<button class="menubtn primary" id="spCreate">CREATE ACCOUNT</button>'+
      '<button class="menubtn" id="spSignIn">SIGN IN</button>'+
      '<button class="menubtn" id="spLater">NOT NOW</button>');
    panelNav('home');
    $('spCreate').onclick=()=>window.KWAccount.authForm('up');
    $('spSignIn').onclick=()=>window.KWAccount.authForm('in');
    $('spLater').onclick=()=>{ noteSaveDismissed(); goHome(); };
  }
  /* ---------- §15 results screen ---------------------------------------
     Snapshot progression at battle start so the results screen can report a
     real delta instead of inventing numbers. */
  let snap=null;
  function takeSnapshot(){
    snap={kills:D.records.enemiesDefeated||0, xp:D.profile.legacyXP||0,
          gems:gems(), conquered:conquered(), badges:new Set(earnedList().map(m=>m.n)),
          t:Date.now()};
  }
  function stat(label,value){return '<div><small>'+label+'</small><b>'+value+'</b></div>';}
  function results(o){
    const win=o.result==='victory';
    const gained=snap?Math.max(0,(D.records.enemiesDefeated||0)-snap.kills):null;
    const xp=snap?Math.max(0,(D.profile.legacyXP||0)-snap.xp):null;
    const gemGain=snap?Math.max(0,gems()-snap.gems):null;
    const newBadges=snap?earnedList().filter(m=>!snap.badges.has(m.n)):[];
    const cells=[
      stat(o.scopeLabel||'WAVE REACHED', o.scopeValue),
      gained!==null?stat('ENEMIES DEFEATED',gained):'',
      o.gold!=null?stat('GOLD HELD','🪙 '+Math.floor(o.gold)):'',
      xp?stat('LEGACY XP','+'+xp):'',
      gemGain?stat('GEMS EARNED','💎 +'+gemGain):'',
      o.crowns!=null?stat('CROWNS','★'.repeat(o.crowns)+'☆'.repeat(3-o.crowns)):''
    ].filter(Boolean).join('');
    const notes=[];
    if(o.unlocked)notes.push('🔓 '+esc(o.unlocked));
    const saveOffer = shouldOfferSave();
    newBadges.forEach(m=>notes.push('🏅 Milestone reached — '+esc(m.n)));
    const retry=o.retry?'<button data-act="retry">'+(win&&o.next?'REPLAY':'RETRY')+'</button>':'';
    const acts=
      (o.next?'<button class="primary" data-act="next">NEXT BATTLE</button>':
       (o.retry?'<button class="primary" data-act="retry">'+(win?'FIGHT AGAIN':'TRY AGAIN')+'</button>':''))+
      (o.next?retry:'')+
      '<button data-act="'+(o.mode==='ENDLESS'?'endless':'crusade')+'">'+(o.mode==='ENDLESS'?'ENDLESS WAR':'CAMPAIGN MAP')+'</button>'+
      '<button data-act="army">ARMY</button>'+
      '<button data-act="home" style="grid-column:1/3">HOME</button>';
    const ov=$('overlay');
    /* The hub sits above the overlay (z 25 vs 10). Anything that re-opened it
       during the battle -- the visibilitychange pause menu, most commonly --
       would otherwise bury the results screen entirely. Results owns the
       screen, so close the hub before painting. */
    hub.classList.add('hidden'); panel.classList.add('hidden');
    ov.innerHTML='<div class="resultwrap">'+
      '<div class="resultbanner '+(win?'victory':'defeat')+'">'+(win?'VICTORY':'DEFEAT')+'</div>'+
      '<div class="resultsub">'+esc(o.subtitle||'')+'</div>'+
      '<div class="resultstats">'+cells+'</div>'+
      (notes.length?'<div class="resultnotes">'+notes.join('<br>')+'</div>':'')+
      (saveOffer?savePromptHTML():'')+
      '<div class="resultacts">'+acts+'</div></div>';
    ov.classList.remove('hidden');
    const sp=ov.querySelector('#saveProgressBtn');
    if(sp)sp.onclick=()=>{ ov.classList.add('hidden'); goHome(); savePrompt(); };
    const sn=ov.querySelector('#saveNotNow');
    if(sn)sn.onclick=()=>{ noteSaveDismissed(); const w=ov.querySelector('.saveoffer'); if(w)w.remove(); };
    ov.querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>{
      const act=b.dataset.act;
      ov.classList.add('hidden');
      if(act==='retry'){X.startBattle(o.retry);return;}
      if(act==='next'){X.startBattle(o.next);return;}
      X.mainMenu();
      if(act==='crusade')crusadeScreen('home');
      else if(act==='endless')endlessScreen('home');
      else if(act==='army')X.showKingdom();
    });
  }

  /* ---------- bindings ---------- */
  $('playbtn').onclick=modeSelect;
  $('campaignbtn').onclick=()=>crusadeScreen('home');
  $('newrunbtn').onclick=()=>endlessScreen('home');
  $('recordsbtn').onclick=showRecords;
  // §19 one compact account line; the real surface lives in Settings.
  const acct=$('acctbtn');
  if(acct){
    acct.onclick=()=>{
      // guests with real progress get the Save Progress pitch; everyone else
      // goes straight to the account panel.
      if(shouldOfferSave()) savePrompt();
      else if(window.KWAccount) window.KWAccount.showAccount();
      panelNav('home');
    };
  }
  /* Cloud availability resolves asynchronously, after the title has already
     painted. Subscribe once and repaint every account-aware surface, otherwise
     a cold load leaves the guest with no SIGN IN affordance at all. */
  window.KWCloud&&window.KWCloud.on(st=>{
    if(acct){
      acct.innerHTML = st.signedIn
        ? 'Saving to <b>'+esc(st.email)+'</b>'
        : (st.available ? 'Progress saves on this device · <b>SAVE ONLINE</b>'
                        : 'Progress saves on this device');
    }
    paintAccountCorner(st.signedIn);
    if(st.signedIn){
      // §2 return-to-mode: the player chose CRUSADE or WAR, was sent to sign
      // in, and must land in that war -- not back at the landing page.
      const mode=takeEntry();
      if(mode){ startMode(mode,false); return; }
    }
    if(!title.classList.contains('hidden'))showTitle();
  });
  $('achievebtn').onclick=showAchievements;
  // ARMORY / SHOP / ARMY / DAILY ORDERS / SETTINGS keep their real handlers.

  window.KWShell=Object.freeze({showTitle,enterGame,results,takeSnapshot,modeSelect,
    showLanding,showModeEntry,startMode,continueMode,homeUnlocked,takeEntry,
    savePrompt,shouldOfferSave,paintAccountCorner,
    crusadeScreen,endlessScreen,showAchievements,showRecords,paintHome,
    milestones:MILESTONES,earnedList,nextKingdom,conquered});

  showTitle(); syncChrome();
})();
