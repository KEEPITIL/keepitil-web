(function(){
  'use strict';
  const packs=Object.freeze([
    {id:'gems_120',gems:120,label:'Scout Pack',price:'$1.99 USD'},
    {id:'gems_650',gems:650,label:'War Chest',price:'$7.99 USD'},
    {id:'gems_1500',gems:1500,label:'Royal Treasury',price:'$14.99 USD'},
    {id:'gems_3500',gems:3500,label:'Imperial Vault',price:'$29.99 USD'},
    {id:'gems_7500',gems:7500,label:'Conquest Vault',price:'$49.99 USD'}
  ]);
  // HOTFIX B89 (security): checkout is disabled in this build. Gems could not be
  // credited after payment (there is no server-verified fulfillment yet), so no
  // checkout is opened and no pending pack is stored, in test or live mode.
  async function purchase(id){
    const msg=window.KWPurchaseUnavailableMessage||'Gem purchases are not available yet, so no gems were added. If you were charged, contact info@keepitil.com.';
    if(window.KWPurchaseNotice)window.KWPurchaseNotice(msg);else if(window.showMsg)showMsg(msg,6000);else alert(msg);
    return {ok:false,error:'PURCHASES_DISABLED'};
  }
  window.KWStripe=Object.freeze({packs,purchase});
})();
