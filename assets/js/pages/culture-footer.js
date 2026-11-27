/* KEEPITIL culture/index.html: inline script "footer" moved verbatim to an external file (CSP: no executable inline script). */
/* Footer reveal, desktop only. Ordinary feed scrolling can never trigger it: the wheel has to
   be over the bottom strip AND moving downward. Moving back up puts it away again. */
(function(){
  function desktop(){ try{ return window.matchMedia('(min-width:861px)').matches; }catch(e){ return false; } }
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded',fn); }
  ready(function(){
    if(!document.getElementById('culFootZone')){
      var z=document.createElement('div'); z.id='culFootZone'; z.setAttribute('aria-hidden','true');
      document.body.appendChild(z);
    }
    var ZONE=64;
    function inZone(y){ return (window.innerHeight - y) <= ZONE; }
    function show(){ document.body.classList.add('cul-footer'); }
    function hide(){ document.body.classList.remove('cul-footer'); }

    var lastY=0;
    document.addEventListener('pointermove', function(e){ lastY=e.clientY; }, {passive:true});

    document.addEventListener('wheel', function(e){
      if(!desktop() || !document.body.classList.contains('cul-feed')) return;
      var open=document.body.classList.contains('cul-footer');
      if(e.deltaY > 0){
        /* Downward: only from the Radio strip, and only when it is not already up. */
        if(!open && inZone(e.clientY != null ? e.clientY : lastY)) show();
      } else if(e.deltaY < 0){
        /* Upward anywhere puts the layout back the way it was. */
        if(open) hide();
      }
    }, {passive:true});

    /* Leaving the strip with the footer closed changes nothing; this only guards against the
       footer staying up after the pointer has gone back to the feed and scrolled up there. */
    window.addEventListener('keydown', function(e){ if(e.key==='Escape') hide(); });
  });
})();
