/* KEEPITIL culture/index.html: inline script "tpl" moved verbatim to an external file (CSP: no executable inline script). */
/* V3.1 template: mobile logged-in ONLY -> "+" (create a feed) top-left + bell top-right */
(function(){
  function show(){ var g=document.getElementById('cul-gear'), h=document.getElementById('cul-heart');
    /* logged-in: the top-left "+" becomes a settings gear (Type/Filter); create-post lives in the bottom bar (Founder 2026-07-29) */
    if(g)g.style.display='inline-flex'; if(h)h.style.display='inline-flex'; window.__culSignedIn=true; }
  function boot(n){ try{
    if(!window.supabase){ if(n<25) setTimeout(function(){boot(n+1);},400); return; }
    if(!window.__culSB) window.__culSB=window.supabase.createClient('https://ovmqtzjfpzrbzrlkxwgw.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ');
    window.__culSB.auth.getSession().then(function(r){ if(r&&r.data&&r.data.session) show(); });
  }catch(e){} }
  boot(0);
})();
