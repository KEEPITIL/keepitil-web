/* KEEPITIL culture/index.html: inline script "head-snap" moved verbatim to an external file (CSP: no executable inline script). */
/* Culture landing: no page snap, and NO MOVEMENT, until the one transition has run.
   Measured on the live site: the page glided 113px (desktop) / 179px (mobile) down at ~0.5s
   and back ~1.5s later, before anyone touched anything. Blanking inline scripts isolated it
   to the mobile enhancer's first layout pass; no script calls a scroll API, the browser
   follows a layout change. Whatever moves it, the landing is the one state the page is in, so
   any scroll the visitor did not make is put back in the same frame — scroll events run
   before paint, so the correction is never seen. The visitor's own wheel/swipe/key starts the
   transition instead (see cul-advance). */
(function(){ var h=document.documentElement; h.classList.add('cul-landing');
  addEventListener('scroll', function(){
    if(h.classList.contains('cul-landing') && !h.classList.contains('cul-moving') && scrollY!==0){
      try{ window.scrollTo({top:0, left:0, behavior:'instant'}); }catch(e){ window.scrollTo(0,0); }
    }
  }, {passive:true});
})();
