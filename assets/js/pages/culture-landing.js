/* KEEPITIL culture/index.html: inline script "landing" moved verbatim to an external file (CSP: no executable inline script). */
/* ── CULTURE: LANDING, THEN THE FEED KEEPS IT (Founder 2026-09-06) ─────────────────────
   Arriving at CULTURE shows the page's own landing - title, metrics, header art - like every
   other main page. Scrolling forward hands the screen to the feed, and once that has
   happened scrolling back does NOT return the landing: the feed is the page from then on.
   Coming back is done by choosing CULTURE in the shell nav again, which is a fresh load.

   The lock is done by REMOVING the hero from flow once passed, not by fighting the scroll.
   Trying to trap or re-position a scroll leaves the page arguing with the visitor's finger on
   a touch screen; taking the element out of the document means there is simply nothing above
   the feed to scroll back to, and the browser's own scrolling stays untouched.
   The scroll position is corrected by exactly the height removed, so the feed does not jump. */
(function(){
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded',fn); }
  ready(function(){
    var hero  = document.querySelector('header.hero');
    var merge = document.querySelector('.merge');
    if(!hero || !merge) return;

    var locked = false;
    function lock(){
      if(locked) return;
      var h = hero.getBoundingClientRect().height;
      if(!h) return;
      locked = true;
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;
      hero.style.display = 'none';
      document.body.classList.add('cul-feed');
      /* Removing h pixels above the viewport would otherwise pull the feed up by h. */
      var next = Math.max(0, y - h);
      window.scrollTo(0, next);
    }

    function check(){
      if(locked) return;
      /* The feed has taken the screen once the merge reaches the top of the viewport. */
      if(merge.getBoundingClientRect().top <= 1) lock();
    }
    window.addEventListener('scroll', check, {passive:true});
    window.addEventListener('resize', check, {passive:true});
    check();
  });
})();
