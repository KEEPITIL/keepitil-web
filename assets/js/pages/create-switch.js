/* KEEPITIL create/index.html: inline script "switch" moved verbatim to an external file (CSP: no executable inline script). */
/* VS subpage view switch (Founder 2026-08-05): rail drives vs-app.js via window.vsGo(view).
   FEED/My Votes/My Entry/Manage map to existing app views; Vote/Join/Winners are new (KODE). */
function vrNav(view, el){
  try{ var rail=document.getElementById('vsVRail');
       if(rail&&el){ [].forEach.call(rail.querySelectorAll('.cvr.sf'),function(b){ b.classList.toggle('on', b===el); }); } }catch(x){}
  if(typeof window.vsGo==='function'){ try{ window.vsGo(view); return; }catch(e){} }
  /* fallback until vs-app.js exposes vsGo: FEED still works via the legacy filter hook */
  if(view==='feed' && typeof window.vsFilter==='function'){ try{ window.vsFilter('all'); }catch(e){} }
}
/* subpage dropdown (uniform with Culture/Radio) — Founder 2026-08-04 */
function vrToggleSub(e){ if(e){try{e.stopPropagation();}catch(x){}} var dd=document.getElementById('vrSubDD'); if(dd)dd.classList.toggle('open'); }
function vrGoSub(sp){ var dd=document.getElementById('vrSubDD'); if(dd)dd.classList.remove('open'); location.href=(sp==='feed'?'/culture/':(sp==='radio'?'/culture/radio':'/culture/vs')); }

/* ── §D5 — VS on the pager, all six rail views ──────────────────────────────────────────────
   `.cul-vrail` is display:none with a min-width:861px override, so the rail — and every one of
   these six views — has been DESKTOP-ONLY. On a phone there was no way to enter a competition,
   vote, or see winners. That is why VS has 36 published competitions and 0 entries; it was never
   a demand problem, it was an unreachable control.

   JOIN IS NOT JUST THE FOURTH SWIPE. It is the money action and it is treated as one:
     - the filter carries `primary:true`, which the header renders in the brand colour
     - every empty state links STRAIGHT to it rather than describing where it is
   A user who has to swipe three times to find the entry form is barely better off than one who
   could not find it at all. */
(function(){
  var SB=null, CACHE={};

  function sb(tries){
    tries=tries||0;
    if(SB) return Promise.resolve(SB);
    if(window.supabase&&window.__vsSB){ SB=window.__vsSB; return Promise.resolve(SB); }
    if(tries>=40) return Promise.resolve(null);
    return new Promise(function(r){ setTimeout(function(){ r(sb(tries+1)); },350); });
  }

  /* One RPC per view. Failures resolve to [] and are recorded, so an empty column reads as
     "nothing here" and a broken one can still be told apart in the console. */
  function load(key, fn){
    if(CACHE[key]) return Promise.resolve(CACHE[key]);
    return sb().then(function(c){
      if(!c) return [];
      return fn(c).then(function(r){
        if(r&&r.error){ CACHE[key+'_err']=r.error.message; return []; }
        CACHE[key]=(r&&r.data)||[]; return CACHE[key];
      }).catch(function(e){ CACHE[key+'_err']=String(e&&e.message||e); return []; });
    });
  }

  var VIEWS=[
    { id:'feed',    label:'FEED',     rpc:function(c){ return c.rpc('vs_feed',{p_sort:'new',p_limit:30}); } },
    { id:'vote',    label:'VOTE',     rpc:function(c){ return c.rpc('vs_open_competitions',{}); },
      filter:function(x){ return !!x.voting_open; } },
    { id:'join',    label:'JOIN',     primary:true,
      rpc:function(c){ return c.rpc('vs_open_competitions',{}); },
      filter:function(x){ return !x.voting_open; } },
    { id:'winners', label:'WINNERS',  rpc:function(c){ return c.rpc('vs_feed',{p_sort:'top',p_limit:30}); },
      filter:function(x){ return !!x.is_winner; } },
    { id:'votes',   label:'MY VOTES', rpc:function(c){ return c.rpc('vs_my_votes',{}); } },
    { id:'mine',    label:'MY ENTRY', rpc:function(c){ return c.rpc('vs_my_entries',{}); } }
  ];

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function joinIndex(){ for(var i=0;i<VIEWS.length;i++) if(VIEWS[i].id==='join') return i; return 2; }

  /* Every empty state routes to JOIN instead of naming a control. The old copy read
     "Tap Join on the rail" — a rail that does not exist on either breakpoint now. */
  function emptyFor(f){
    if(f.id==='join'){
      return { title:'No competitions open right now',
               body:'<span>When one opens it appears here, and you can enter it from this screen.</span>' };
    }
    var line = f.id==='mine'    ? 'You have not entered a competition yet.'
             : f.id==='votes'   ? 'You have not voted yet.'
             : f.id==='winners' ? 'No winners announced yet.'
             : f.id==='vote'    ? 'Nothing is open for voting right now.'
             : 'No entries yet.';
    return { title:line,
             body:'<span>Entering takes a minute.</span>'
                 +'<button type="button" class="vsp-join" data-click="kilVsGoJoin">Enter a competition →</button>' };
  }
  /* Works on BOTH breakpoints. The old copy — "Tap Join on the rail" — was at least true on
     desktop, where the rail exists; replacing it with a mobile-only control would have fixed
     the phone and broken the desktop in the same edit. Pager first, rail second. */
  window.__vsGoJoin=function(){
    try{ if(window.__kilPager){ window.__kilPager.gotoFilter(joinIndex()); return; } }catch(e){}
    try{ if(typeof window.vsGo==='function'){ window.vsGo('join'); return; } }catch(e){}
    location.hash='#join';
  };

  function card(x, el){
    var title=esc(x.title||x.competition_title||'Untitled');
    var by=x.creator_handle?('@'+esc(x.creator_handle)):'';
    var cover=x.thumb_url||x.cover_url||'';
    el.innerHTML='<div class="vsp-card">'
      +(cover?'<div class="vsp-cov" style="background-image:url('+esc(cover)+')"></div>':'<div class="vsp-cov"></div>')
      +'<h3>'+title+'</h3>'
      +(by?'<div class="vsp-by">'+by+'</div>':'')
      +(x.competition_id||x.id
        ? '<button type="button" class="vsp-join" data-click="kilVsGo" data-a="[&quot;join&quot;]">Enter this competition →</button>'
        : '')
      +'</div>';
  }

  function mount(){
    if(!window.KIL_PAGER||!window.KIL_PAGER.isMobile()) return;
    var filters=VIEWS.map(function(v){
      return {
        id:v.id, label:v.label, primary:!!v.primary, kind:'vs',
        items:function(){ var rows=CACHE[v.id]||[]; return v.filter?rows.filter(v.filter):rows; },
        render:function(item,el){ card(item,el); }
      };
    });
    Promise.all(VIEWS.map(function(v){ return load(v.id, v.rpc); })).then(function(){
      window.KIL_PAGER.mount({ filters:filters, emptyFor:emptyFor });
      var rail=document.getElementById('vsVRail'); if(rail) rail.style.display='none';
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount); else setTimeout(mount,0);
})();
document.addEventListener('click',function(e){ var dd=document.getElementById('vrSubDD'),b=document.getElementById('vrSubBtn'); if(dd&&dd.classList.contains('open')&&!dd.contains(e.target)&&b&&!b.contains(e.target))dd.classList.remove('open'); });
