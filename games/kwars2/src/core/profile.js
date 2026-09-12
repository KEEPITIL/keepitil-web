/* KWARS2 PLAYER STATE  (window.KW2Profile) — campaign, endless, records,
   settings, economy, unlocks. One place that owns what persists. */
(function(){
  'use strict';
  const S=window.KW2Save;
  const base=()=>({
    profile:{name:'Strategos',title:'Founder',legacyLevel:1,legacyXP:0},
    records:{highestWave:0,longestRun:0,enemiesDefeated:0,bossesDefeated:0,kingdomsConquered:0},
    campaign:{unlockedCivilization:1,completed:{},crowns:{},totalVictories:0},
    economy:{gold:0,gems:0},
    unlocks:{armyCap:50,passiveIncome:1.0,classes:['RANGE','ASSAULT','HEAVY','MOBILE']},
    settings:{sound:true,music:true,shake:true,view:'FIXED',damageNumbers:true},
    active:null, castle:null, lastPlayed:0
  });
  function merge(a,b){const o={...a};for(const k of Object.keys(b||{}))
    o[k]=(b[k]&&typeof b[k]==='object'&&!Array.isArray(b[k]))?merge(a[k]||{},b[k]):b[k];return o;}

  let data=base();
  function load(){
    const mig=S.migrateLegacy();
    const p=S.read('profile'), r=S.read('run'), c=S.read('castle');
    if(p.ok)data=merge(base(),p.payload);
    if(r.ok)data.active=r.payload&&r.payload.active||null;
    if(c.ok)data.castle=c.payload&&c.payload.castle||null;
    if(mig.ran&&mig.viewLocked!==undefined)data.settings.view=mig.viewLocked?'FIXED':'FREE';
    data.migration=mig;
    return data;
  }
  function persist(){
    const a=S.write('profile',{profile:data.profile,records:data.records,campaign:data.campaign,
      economy:data.economy,unlocks:data.unlocks,settings:data.settings,lastPlayed:data.lastPlayed},false);
    const b=S.write('run',{active:data.active},!!data.active);
    return a.ok&&b.ok;
  }
  const saveCastle=c=>{data.castle=c;return S.write('castle',{castle:c},true).ok;};

  /* Campaign is the ONLY source of permanent progression (contract §7). */
  function completeKingdom(kingdomId,crowns){
    const D=window.KW2_DATA, k=D.kingdom(kingdomId); if(!k)return null;
    const first=!data.campaign.completed[kingdomId];
    data.campaign.completed[kingdomId]=true;
    data.campaign.crowns[kingdomId]=Math.max(data.campaign.crowns[kingdomId]||0,crowns||1);
    data.campaign.totalVictories++;
    data.records.kingdomsConquered=Object.keys(data.campaign.completed).length;
    const reward={gems:0,armyCap:0,income:0,unlockedCivilization:false};
    if(first){
      reward.gems=8+Math.floor(k.kingdomNumber*1.5);
      reward.armyCap=4;  data.unlocks.armyCap+=4;
      reward.income=0.05; data.unlocks.passiveIncome=+(data.unlocks.passiveIncome+0.05).toFixed(2);
      data.economy.gems+=reward.gems;
      data.profile.legacyXP+=40;
      const civ=D.byId(k.civilizationId);
      if(k.kingdomNumber===5&&civ){
        data.campaign.unlockedCivilization=Math.max(data.campaign.unlockedCivilization,civ.order+1);
        reward.unlockedCivilization=true;
      }
    }
    persist();
    return reward;
  }
  function kingdomUnlocked(k){
    const D=window.KW2_DATA, civ=D.byId(k.civilizationId); if(!civ)return false;
    if(civ.order>data.campaign.unlockedCivilization)return false;
    if(k.kingdomNumber===1)return true;
    return !!data.campaign.completed[civ.campaignKingdomIds[k.kingdomNumber-2]];
  }
  function nextKingdom(){
    const D=window.KW2_DATA;
    for(const civ of D.CIVILIZATIONS)for(const id of civ.campaignKingdomIds){
      const k=D.kingdom(id);
      if(k&&!data.campaign.completed[id]&&kingdomUnlocked(k))return {kingdom:k,civ};
    }
    return null;
  }
  window.KW2Profile=Object.freeze({load,persist,saveCastle,completeKingdom,
    kingdomUnlocked,nextKingdom,get:()=>data,base});
})();
