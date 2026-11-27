/* KEEPITIL earn/index.html: inline script "layout" moved verbatim to an external file (CSP: no executable inline script). */
/* MOBILE LAYOUT FLAG — body.rad-m on ≤860px (it also keeps the docked radio bar hidden on Earn
   phones, owner 2026-11-20). That is ALL this block does now.
   REMOVED (Sentinel W198-1, 2026-11-20): the rest of the old "MOBILE RADIO enhancer". With the
   radio and playlist sections gone it still ran because section#earn exists, injected two empty
   sticky bars (#radMTabs 38px, #radMSecs 36px) above <main>, and its leftover touchend handler
   read x0/y0/t0, which were never declared - "ReferenceError: x0 is not defined" on every touch.
   Guarded by assets/js/earn-cleanup.test.mjs. */
(function(){
  function isMob(){ try{ return window.matchMedia('(max-width:860px)').matches; }catch(e){ return false; } }
  function sync(){ document.body.classList.toggle('rad-m', isMob()); }
  sync(); window.addEventListener('resize', sync);
})();
