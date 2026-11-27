/* KEEPITIL culture/index.html: inline script "autoadvance" moved verbatim to an external file (CSP: no executable inline script). */
/* ══ AUTO-ADVANCE: LANDING 1.5s -> ONE SMOOTH SLIDE -> CONTENT, LOCKED ═════════════════
   Measured before building, desktop 1440x900: every wheel scroll from the landing snapped
   BACK to the top (105px -> 0, 269px -> 0) — the mandatory snap between the two states
   fought the visitor. The page now makes that move itself, once, and then removes the
   landing so it cannot be returned to.

   - The 1.5s counts from when the landing ART is on screen, not from window 'load', which
     this site can take 12-15s to fire. Capped, so a slow image never holds anyone there.
   - A visitor who scrolls, swipes, or taps a metric before then is taken there at once.
   - A link to an anchor in the content skips the landing entirely.
   - prefers-reduced-motion gets the same result without the animation.
   - The collapse happens in the same frame as the scroll reset, at the exact point the
     slide ends, so the content does not move by a pixel when the landing leaves. */
(function(){
  var root=document.documentElement, done=false, started=false;
  function hero(){ return document.querySelector('header.hero'); }
  function wrap(){ return document.querySelector('.wrap'); }
  function topNavH(){
    var n=document.getElementById('v3shell-nav'); if(!n) return 0;
    var r=n.getBoundingClientRect(), c=getComputedStyle(n);
    return (c.position==='fixed' && r.top<=1 && r.height>0 && c.display!=='none' && c.visibility!=='hidden') ? r.height : 0;
  }
  function target(){ var w=wrap(); if(!w) return 0; return Math.max(0, Math.round(w.getBoundingClientRect().top + scrollY - topNavH())); }
  /* ⚠ INSTANT, explicitly. html has scroll-behavior:smooth, so a bare scrollTo(0,0) here was
     itself animated — the content slid a second time and mobile took 4.8s to settle. */
  function jump(y){ try{ window.scrollTo({top:y, left:0, behavior:'instant'}); }catch(e){ window.scrollTo(0,y); } }
  function settle(){
    if(done) return; done=true;
    root.classList.add('cul-in');          /* landing out of the page; desktop frozen */
    root.classList.remove('cul-landing','cul-moving');  /* mobile's card snap resumes, on cards only */
    jump(0);                               /* same frame: content stays exactly where it was */
    try{ window.dispatchEvent(new Event('scroll')); }catch(e){}
    try{ window.dispatchEvent(new CustomEvent('kil-culture-in')); }catch(e){}
  }
  function advance(instant){
    if(started) return; started=true;
    var h=hero(), w=wrap(); if(!h||!w){ done=true; return; }
    var reduce=false; try{ reduce=matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
    var t=target();
    if(instant||reduce||t<=0){ settle(); return; }
    /* THE SLIDE IS A TRANSFORM, NOT A SCROLL. Scrolling the window can only travel as far as
       the document is tall, and while the feed is still loading it is not tall enough — the
       first version reached 579 of 834px and then finished with a 255px jerk. Moving the
       landing and the content up together needs no document height at all, and ends with the
       content at exactly the place it will occupy once the landing is removed. */
    jump(0);
    var d = Math.round(w.getBoundingClientRect().top - topNavH());
    root.style.setProperty('--cul-d', d + 'px');
    var fin=false, finish=function(){ if(fin) return; fin=true; settle(); };
    w.addEventListener('transitionend', function te(e){ if(e.target===w && e.propertyName==='transform'){ w.removeEventListener('transitionend', te); finish(); } });
    setTimeout(finish, 1100);              /* transitionend is not guaranteed; the result is */
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ root.classList.add('cul-moving'); }); });
  }
  /* A deep link already knows where it is going. */
  /* Culture reads no deep-link parameters (checked: only kvaudio/kildebug flags), so an
     anchor is the one way a link can point INTO the content. */
  var deep = !!location.hash && location.hash.length>1;
  if(deep){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', function(){ advance(true); }); else advance(true); return; }

  /* Anything the visitor does first takes them straight there. */
  var early=function(e){
    if(started) return;
    if(e && e.type==='keydown' && !/^(ArrowDown|PageDown|Space| |End)$/.test(e.key)) return;
    advance(false);
  };
  addEventListener('wheel', early, {passive:true});
  addEventListener('touchmove', early, {passive:true});
  addEventListener('keydown', early);
  document.addEventListener('click', function(e){
    if(e.target && e.target.closest && e.target.closest('header.hero .stat')) setTimeout(function(){ advance(false); }, 0);
  }, true);

  function arm(){
    var h=hero(); if(!h){ return; }
    var bg=getComputedStyle(h).backgroundImage||'', m=bg.match(/url\(["']?([^"')]+)["']?\)/);
    var go=function(){ if(!started) setTimeout(function(){ advance(false); }, 1500); };
    var once=false, fire=function(){ if(once) return; once=true; go(); };
    if(m){ var im=new Image(); im.onload=fire; im.onerror=fire; im.src=m[1];
      if(im.complete) fire(); }
    else fire();
    setTimeout(fire, 2500);                /* the art is late: count from now anyway */
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', arm); else arm();
})();
