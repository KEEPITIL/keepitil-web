/* KEEPITIL profile.html: inline script "gate" moved verbatim to an external file (CSP: no executable inline script). */
/*PF-GATE-START*/
window.__pfGate=(function(){
  // two holds on <body>: pf-hold (stats, account type, badges: small text) is released when all four pieces are in or after 1.5 s;
  // pf-late (about, links, the buttons row: the blocks that MOVE things) is released as soon as the profile row is drawn (meta), or at a hard cap of 6 s, so it never appears after the page has been shown.
  var need={meta:1,about:1,claim:1,stats:1}, holdOff=false, lateOff=false, t1=null, t2=null, t3=null;
  function cl(c){ try{ document.body.classList.remove(c); }catch(e){} }
  function releaseHold(){ if(holdOff) return; holdOff=true; if(t1) clearTimeout(t1); cl('pf-hold'); }
  function releaseLate(){ if(lateOff) return; lateOff=true; if(t2) clearTimeout(t2); cl('pf-late'); }
  var feedOff=false;
  function releaseFeed(){ feedOff=true; if(t3) clearTimeout(t3); cl('pf-feed'); cl('pf-foot'); }
  function holdFeed(){ if(feedOff) return; try{ document.body.classList.add('pf-feed'); }catch(e){} }
  function reveal(){ releaseHold(); releaseLate(); releaseFeed(); }
  function mark(k){ if(k==='feed'){ releaseFeed(); return; } if(!need[k]) return; delete need[k]; if(k==='meta') releaseLate(); for(var x in need){ if(Object.prototype.hasOwnProperty.call(need,x)) return; } releaseHold(); }
  t3=setTimeout(holdFeed,450); t1=setTimeout(releaseHold,1500); t2=setTimeout(function(){ releaseLate(); releaseFeed(); },6000);
  return { mark:mark, holdFeed:holdFeed, reveal:reveal, pending:function(){ return Object.keys(need); }, released:function(){ return holdOff&&lateOff; }, hold:function(){ return !holdOff; }, late:function(){ return !lateOff; } };
})();
/*PF-GATE-END*/
