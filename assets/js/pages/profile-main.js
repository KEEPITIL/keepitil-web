/* KEEPITIL profile.html: inline script "main" moved verbatim to an external file (CSP: no executable inline script). */
function toggleMenu(){var m=document.getElementById('mobile-menu');if(m)m.classList.toggle('open');}
/* OWNER (subscriber, can edit/add) vs PUBLIC (customer-facing, read-only) */
var IS_OWNER = document.documentElement.getAttribute('data-view')!=='public' && location.search.indexOf('view=public')===-1;
/* ── Supabase: shared, cross-device persistence for owner-authored content ── */
var SUPA_URL='https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
var SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
/* The 2026-08-16 rename kept the database row and its uuid: echo→cho, nexus→xus.
 Legacy slugs live on in public.agent_aliases, but this runs before any script can
 load, so the table is inlined here — an exact-key lookup, never a prefix match:
 'cho' is a substring of 'echo' and 'echo-west' is a real DJ with a real profile.
 tests/agent-rename.test.mjs asserts this copy against the generated one. */
var AGENT_ALIASES = { echo: 'cho', nexus: 'xus' };
var PROFILE_SLUG=(function(){try{var q=new URLSearchParams(location.search).get('slug');if(q){var s=q.toLowerCase().replace(/[^a-z0-9-]/g,'');return Object.prototype.hasOwnProperty.call(AGENT_ALIASES,s)?AGENT_ALIASES[s]:s;}}catch(e){}return '';})();
var IS_DEMO=false;/* Founder 2026-08-04: unclaimed profiles (incl. groove-trooper) show identity from profile_meta but NO demo posts/events — a fresh unclaimed profile is empty until claimed. */
/* Canonical public URL (corrected 2026-09-02). The 2026-08-04 decision named
       /public/profile/<slug> as canonical, but that route was never built: it returns 404
       live. Every profile was therefore self-canonicalising to a dead URL, which tells search
       engines the real page is not the one to index. Canonical now points at the URL that
       actually serves 200. If the pretty route is wanted, it needs an edge rewrite first -
       GitHub Pages cannot serve it - and this line should follow, not lead. */
/* Clean form: Pages serves /profile natively from profile.html, so the .html was noise that
   also let two aliases compete as separate pages. The static tag is gone, so CREATE the link
   rather than assuming one is present. */
try{ if(PROFILE_SLUG){ var _pu='https://keepitil.com/profile?slug='+encodeURIComponent(PROFILE_SLUG);
  var _c=document.querySelector('link[rel="canonical"]');
  if(!_c){ _c=document.createElement('link'); _c.rel='canonical'; document.head.appendChild(_c); }
  _c.href=_pu;
  var _ou=document.querySelector('meta[property="og:url"]'); if(_ou)_ou.setAttribute('content',_pu); } }catch(e){}
/* the 14 KEEPITIL agents answer live via the ask-echo edge fn (agent-scoped brain + personality);
   their CHAT tab becomes a real "ask this agent" chat — normal profiles keep scene-room chats */
var AGENT_INFO={ /* mirrors public.agent_profiles (name, genre lane, department) — fallback identity when profile_meta has no row */
  cho:['Cho','Hip-Hop','Strategy'],atlas:['Atlas','Techno','Engineering'],pulse:['Pulse','House','Revenue & Growth'],
  xus:['Xus','Latin','Partnerships'],sentinel:['Sentinel','Hardcore / Hard Dance','Trust & Safety'],
  oracle:['Oracle','Trance','Analytics'],fable:['Fable','Indie / Alternative','Documentation'],
  nova:['Nova','Bass','UX QA'],luna:['Luna','Pop','Visual Design'],lyric:['Lyric','R&B / Soul','Editorial'],
  vibe:['Vibe','African Dance','Community'],scout:['Scout','Country / Americana','Talent & Discovery'],
  merch:['Merch','Rock / Metal','Merch & Shop'],beacon:['Beacon','Reggae / Dancehall','Promotion']};
var IS_AGENT=!!AGENT_INFO[PROFILE_SLUG];
var SB=null; try{ if(window.supabase) SB=window.supabase.createClient(SUPA_URL,SUPA_KEY); }catch(e){}
/* No-slug → own-profile redirect is handled once, authoritatively, at the end of boot
   (my_profile_slug RPC → OWNER view). Founder 2026-08-05. */
/* ── first-party Insights: log a profile view + owner-only Insights popup (free, no 3rd-party analytics) ── */
function _kilSid(){ try{ var k=localStorage.getItem('kil_sid'); if(!k){ k=Math.random().toString(36).slice(2)+Date.now().toString(36); localStorage.setItem('kil_sid',k); } return k; }catch(e){ return 'anon'; } }
try{ if(SB && PROFILE_SLUG){ SB.rpc('log_view',{p_kind:'profile',p_target:PROFILE_SLUG,p_owner:PROFILE_SLUG,p_sess:_kilSid()}); } }catch(e){}
function openInsights(){
  if(!SB){ return; }
  var ov=document.createElement('div'); ov.id='insOv';
  ov.style.cssText='position:fixed;inset:0;z-index:9998;background:rgba(4,4,10,.72);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px';
  ov.onclick=function(e){ if(e.target===ov) ov.remove(); };
  ov.innerHTML='<div style="width:100%;max-width:660px;max-height:90vh;overflow:auto;background:linear-gradient(180deg,#16161f,#101017);border:1px solid var(--line,#242433);border-radius:20px;padding:22px;box-shadow:0 30px 90px rgba(0,0,0,.6)"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b style="font-size:1.35rem;color:#fff;letter-spacing:.01em">Insights</b><button data-click="pfCloseInsights" style="background:none;border:0;color:#9aa0b0;font-size:1.6rem;line-height:1;cursor:pointer">&times;</button></div><div style="color:#6b7280;font-size:.8rem;margin-bottom:16px">Last 14 days · first-party analytics</div><div id="insBody" style="color:#9aa0b0">Loading…</div></div>';
  document.body.appendChild(ov);
  SB.rpc('get_profile_insights',{p_slug:PROFILE_SLUG}).then(function(r){
    var m=(r&&r.data)||{}; var b=document.getElementById('insBody'); if(!b) return;
    if(m.error){ b.innerHTML='Sign in as this profile\'s owner to see your insights.'; return; }
    function n(v){ v=v==null?0:v; return v>=1000?(v/1000).toFixed(1).replace(/\.0$/,'')+'k':esc(''+v); }
    function tile(l,v,sub){ return '<div style="background:rgba(255,255,255,.05);border:1px solid var(--line,#242433);border-radius:14px;padding:14px 15px"><div style="font:800 1.7rem/1 Inter,system-ui,sans-serif;color:#fff">'+n(v)+'</div>'+(sub?'<div style="font-size:.68rem;color:#22c55e;font-weight:700;margin-top:3px">'+sub+'</div>':'')+'<div style="font-size:.68rem;letter-spacing:.06em;color:#9aa0b0;text-transform:uppercase;margin-top:4px">'+l+'</div></div>'; }
    /* CSS bar chart — no external library ($0) */
    function chart(series,color){ series=series||[]; var max=1; series.forEach(function(p){ if((p.v||0)>max)max=p.v; });
      var bars=series.map(function(p){ var h=Math.round((p.v||0)/max*100); return '<div title="'+esc(p.d)+': '+(esc(p.v||0))+'" style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px"><div style="width:100%;max-width:16px;height:'+Math.max(h,3)+'%;min-height:3px;border-radius:5px 5px 0 0;background:'+color+'"></div></div>'; }).join('');
      var labels=series.map(function(p,i){ return '<div style="flex:1;text-align:center;font-size:.55rem;color:#6b7280">'+((i%3===0||i===series.length-1)?esc(p.d):'')+'</div>'; }).join('');
      return '<div style="height:120px;display:flex;align-items:flex-end;gap:3px;padding:6px 2px 0">'+bars+'</div><div style="display:flex;gap:3px;margin-top:4px">'+labels+'</div>'; }
    var grid='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">'
      +tile('Profile views',m.profile_views_total, (m.profile_views_7d?('+'+n(m.profile_views_7d)+' · 7d'):''))
      +tile('Reach',m.reach)+tile('Impressions',m.impressions_total)
      +tile('Followers',m.followers, (m.followers_7d?('+'+n(m.followers_7d)+' · 7d'):''))
      +tile('Likes',m.likes)+'</div>';
    var chartsBox='<div style="background:rgba(255,255,255,.03);border:1px solid var(--line,#242433);border-radius:16px;padding:16px 16px 12px;margin-bottom:16px"><div style="color:#fff;font-weight:700;font-size:.92rem;margin-bottom:2px">Profile views</div>'+chart(m.views_series,'linear-gradient(180deg,#8b5cff,#00e0a4)')+'</div>'
      +'<div style="background:rgba(255,255,255,.03);border:1px solid var(--line,#242433);border-radius:16px;padding:16px 16px 12px;margin-bottom:16px"><div style="color:#fff;font-weight:700;font-size:.92rem;margin-bottom:2px">New followers</div>'+chart(m.follows_series,'linear-gradient(180deg,#22d3ee,#22c55e)')+'</div>';
    var top=(m.top_posts||[]).map(function(t){ return '<div style="display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--line,#242433)"><span style="color:#e8e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(t.title||'Post')+'</span><span style="color:#9aa0b0;flex:0 0 auto">&hearts; '+(t.likes||0)+' &middot; &#128172; '+(t.comments||0)+'</span></div>'; }).join('');
    b.innerHTML=grid+chartsBox+(top?'<div style="margin:6px 0 2px;color:#fff;font-weight:800">Top posts</div>'+top:'')+'<div style="margin-top:14px;font-size:.7rem;color:#6b7280">Updates as people view and engage with your profile.</div>';
  }).catch(function(){ var b=document.getElementById('insBody'); if(b) b.textContent='Could not load insights.'; });
}
var SESSION=null, DB_OK=false, OWNS=false;
/* Edit controls show only in the owner variant AND when the signed-in user actually owns this profile. */
function CAN_EDIT(){ return IS_OWNER && OWNS; }
/* S2 — "is this profile claimed by ANYONE", which is a different question from "can I edit it".
   profile_owners is world-readable, so this resolves for signed-out visitors too. Until it
   resolves KIL_IS_CLAIMED stays false, because the safe default is the one that cannot
   overclaim: an editorial profile briefly labelled correctly is fine, a real member's profile
   briefly labelled "Profile" is not a truthfulness failure. */
window.KIL_CLAIMED_READY = Promise.resolve(false);
function checkClaimed(){
  if(!SB) return Promise.resolve(false);
  window.KIL_CLAIMED_READY = SB.from('profile_owners').select('profile_slug')
    .eq('profile_slug',PROFILE_SLUG).maybeSingle()
    .then(function(r){ window.KIL_IS_CLAIMED = !!(r&&r.data); return window.KIL_IS_CLAIMED; })
    .catch(function(){ window.KIL_IS_CLAIMED = false; return false; });
  return window.KIL_CLAIMED_READY;
}
function checkOwnership(){
  OWNS=false;
  if(!SB||!SESSION) return Promise.resolve(false);
  return SB.from('profile_owners').select('owner_id').eq('profile_slug',PROFILE_SLUG).maybeSingle().then(function(r){
    OWNS = !!(r&&r.data&&r.data.owner_id===SESSION.user.id); return OWNS;
  }).catch(function(){ OWNS=false; return false; });
}
/* ── FILTER BAR ROUTING (Founder 2026-08-26) ──────────────────────────────────────────────
   Categories route to the panels that already exist; subfilters narrow what is shown inside
   them. Nothing here renders a second copy of any list.

   EVENT is three views of two panels: #pfEntries and the tickets grid both live inside
   tab-tagged, and the shows a profile is putting on live in tab-shows. Splitting them by
   subfilter is what lets one category cover Entry / Events / Tickets without a third panel.

   ⚠ WHAT ACTUALLY FILTERS, AND WHAT IS HONEST ABOUT NOT:
   FEED and EVENT filter real content — feed cards already carry data-kind, and the EVENT
   sections are separate DOM. CHAT and SAVED filter by rules derived from data the page
   already loads (see pfChatBucket / the collection chips). Where a rule cannot be evaluated
   the chip shows everything rather than silently showing nothing. */
var PF_OWNER = false;
/* Four categories for the owner, two for a visitor — deliberately different surfaces.
   FEED is the one row that differs in CONTENT too: a visitor gets an "all" chip, the owner does
   not, because their feed already IS everything they have posted. */
function pfSubsFor(cat){
  if(cat === 'feed'){
    var base = [['article','Article'],['photo','Photo'],['video','Videos'],['rated','Rated']];
    return PF_OWNER ? base : [['all','Feed']].concat(base);
  }
  if(cat === 'event') return [['entry','Entry'],['events','Events'],['tickets','Tickets']];
  if(cat === 'chat')  return [['primary','Primary'],['general','General'],['request','Request']];
  if(cat === 'saved') return [['collection','Collection'],['overall','Overall']];
  return [];
}
var PF_CAT = 'feed', PF_SUB = { feed:'all', event:'entry', chat:'primary', saved:'collection' };

function pfRenderSubs(){
  var box=document.getElementById('pfSubs'); if(!box) return;
  var list=pfSubsFor(PF_CAT);
  /* The owner has no 'all' chip, so a stored 'all' would leave nothing selected. */
  if(PF_CAT==='feed' && PF_OWNER && PF_SUB.feed==='all') PF_SUB.feed='article';
  if(PF_CAT==='feed' && !PF_OWNER && !list.some(function(x){return x[0]===PF_SUB.feed;})) PF_SUB.feed='all';
  box.innerHTML = list.map(function(x){
    return '<button type="button" data-sub="'+x[0]+'"'+(PF_SUB[PF_CAT]===x[0]?' class="on"':'')+'>'+x[1]+'</button>';
  }).join('');
  box.classList.toggle('show', list.length>0);
}

function pfCat(cat){
  PF_CAT=cat;
  document.querySelectorAll('#pfSeg button').forEach(function(b){
    b.classList.toggle('on', b.getAttribute('data-cat')===cat);
  });
  pfRenderSubs();
  pfApply();
}

function pfSub(v){
  PF_SUB[PF_CAT]=v;
  document.querySelectorAll('#pfSubs button').forEach(function(b){
    b.classList.toggle('on', b.getAttribute('data-sub')===v);
  });
  pfApply();
}

function pfShowPanel(id){
  document.querySelectorAll('.pf-panel').forEach(function(p){ p.classList.toggle('active', p.id===id); });
}

function pfApply(){
  var sub=PF_SUB[PF_CAT];
  if(PF_CAT==='feed'){
    pfShowPanel('tab-article');
    /* Feed cards already carry data-kind; 'rated' is content that has received votes, marked
       with data-rated by whatever renders it. Absent that mark, Rated shows nothing rather
       than quietly showing everything — an empty Rated is truthful, a full one is not. */
    document.querySelectorAll('#feed-grid > *').forEach(function(card){
      var show=true;
      if(sub==='rated')      show = card.hasAttribute('data-rated');
      else if(sub!=='all'){
        var cls=(card.className||'')+' '+(card.getAttribute('data-kind')||'');
        var pat = sub==='photo' ? '(photo|image|img)' : sub==='video' ? '(video|reel|clip)' : sub;
        show = new RegExp('\\b'+pat+'\\b','i').test(cls);
      }
      card.style.display = show ? '' : 'none';
    });
    pfEmpty('feed-grid', sub==='all' ? '' : 'Nothing here yet.');
  }
  else if(PF_CAT==='event'){
    if(sub==='events'){ pfShowPanel('tab-shows'); return; }
    pfShowPanel('tab-tagged');
    var ent=document.getElementById('pfEntries');
    var th =document.getElementById('pfTicketsHead');
    var tg =document.getElementById('tagged-grid');
    var te =document.getElementById('tagged-empty');
    var wantEntry = sub==='entry';
    if(ent) ent.style.display = wantEntry ? '' : 'none';
    [th,tg,te].forEach(function(el){ if(el) el.style.display = wantEntry ? 'none' : ''; });
  }
  else if(PF_CAT==='chat'){
    pfShowPanel('tab-chat');
    if(typeof closeChatGroup==='function') try{ closeChatGroup(); }catch(e){}
    pfFilterChat(sub);
  }
  else if(PF_CAT==='saved'){
    pfShowPanel('tab-saved');
    var coll=document.getElementById('saved-coll');
    /* COLLECTION exposes the collection chips this page already builds; OVERALL is everything
       saved, so the chips are irrelevant there and are put away rather than left as decoration. */
    if(coll) coll.style.display = (sub==='collection') ? 'flex' : 'none';
    document.querySelectorAll('#saved-grid > *').forEach(function(c){
      c.style.display = (sub==='collection' && !c.hasAttribute('data-collection')) ? 'none' : '';
    });
  }
}

/* Instagram's rule, applied to the data this page already has:
     REQUEST — a thread you have never replied to. Someone messaged you; you have not accepted.
     PRIMARY — a thread with someone you follow.
     GENERAL — accepted, but not someone you follow.
   The thread rows carry these as data attributes when the chat list renders them; a row that
   has not been classified is left visible rather than hidden, so a missing attribute can never
   make a real conversation disappear. */
function pfFilterChat(bucket){
  /* The chat list already filters itself by category through setChatFilter/renderChats. Driving
     that rather than hiding rows afterwards keeps ONE filter in charge — two would eventually
     disagree, and the visible list would depend on which ran last. */
  if(typeof setChatFilter==='function'){ try{ setChatFilter(bucket); return; }catch(e){} }
  document.querySelectorAll('#tab-chat [data-thread]').forEach(function(row){
    var b=row.getAttribute('data-bucket');
    row.style.display = (!b || b===bucket) ? '' : 'none';
  });
}

function pfEmpty(gridId, msg){
  var g=document.getElementById(gridId); if(!g) return;
  var any=[].slice.call(g.children).some(function(c){ return c.style.display!=='none'; });
  var id=gridId+'-pfempty', ex=document.getElementById(id);
  if(any || !msg){ if(ex) ex.remove(); return; }
  if(ex) return;
  var d=document.createElement('div'); d.id=id;
  d.style.cssText='color:var(--muted,#9aa0b0);text-align:center;padding:44px 20px';
  d.textContent=msg; g.parentNode.insertBefore(d, g.nextSibling);
}

(function pfBindBar(){
  var seg=document.getElementById('pfSeg'), subs=document.getElementById('pfSubs');
  if(!seg) return;
  seg.addEventListener('click', function(e){
    var b=e.target.closest('button[data-cat]'); if(!b) return; pfCat(b.getAttribute('data-cat'));
  });
  if(subs) subs.addEventListener('click', function(e){
    var b=e.target.closest('button[data-sub]'); if(!b) return; pfSub(b.getAttribute('data-sub'));
  });
  pfRenderSubs();
})();

/* CHAT and SAVED belong to the profile's owner. Removed from the DOM for a visitor rather than
   hidden, so there is no control to find in the markup and no panel to reach by guessing. */
function pfApplyOwnerBar(isOwner){
  /* ⚠ HIDE, DO NOT REMOVE. This used to call b.remove(), and renderAll() calls
     applyProfileTabs() BEFORE checkOwnership() has resolved — so on the owner's own profile the
     gate ran first with isOwner=false, destroyed CHAT and SAVED, and when ownership resolved a
     moment later there was nothing left to restore. The owner was left with two categories on
     a page that is supposed to show four. Hiding is idempotent and survives being called in
     either order, however many times.
     The buttons are not a security boundary and never were: the chat and saved panels load
     their own data under RLS, so a hidden control grants nothing. */
  document.querySelectorAll('#pfSeg button[data-owner]').forEach(function(b){
    b.style.display = isOwner ? '' : 'none';
  });
  /* The FEED subfilters differ by view (Founder 2026-08-26): the owner's feed IS their profile,
     so an "all" chip is redundant there; a visitor gets one. Rebuild the row when the answer
     changes, not just on first paint. */
  PF_OWNER = !!isOwner;
  if(!isOwner && (PF_CAT==='chat' || PF_CAT==='saved')) { pfCat('feed'); return; }
  pfRenderSubs();
}

/* showTab survives because deep links (?tab=shows from the event page, ?tab=tagged from CREATE)
   and several call sites still use it. It now drives the BAR rather than a separate row of
   tabs, so a deep link leaves the control showing the category it actually landed on instead
   of disagreeing with the panel. */
function showTab(name){
  var map={ article:['feed','all'], gallery:['feed','photo'], shows:['event','events'],
            tagged:['event','tickets'], entry:['event','entry'],
            chat:['chat','primary'], saved:['saved','overall'] };
  var m=map[name];
  if(m){ PF_SUB[m[0]]=m[1]; pfCat(m[0]); }
  else { document.querySelectorAll('.pf-panel').forEach(function(p){p.classList.toggle('active',p.id==='tab-'+name);}); }
  var bar=document.querySelector('.pf-filterbar');
  if(bar){ window.scrollTo({top:bar.offsetTop-70,behavior:'smooth'}); }
}
/* deep-link: /u.html?slug=x&tab=shows opens the Events tab directly (used by the event-page back button) */
/* ?tab= allowlist extended to the tabs that actually exist (Founder 2026-08-19). It accepted only
   article/gallery/chat, so a deep link to the EVENTS tab — which is where CREATE now sends people
   after payment and from the entry back button — silently landed on FEED instead. */
window.addEventListener('load',function(){ try{ var _t=(new URLSearchParams(location.search).get('tab')||'').toLowerCase(); if(['article','gallery','chat','tagged','saved','shows'].indexOf(_t)>-1){ setTimeout(function(){ showTab(_t); },300); } }catch(e){} });
function renderHighlights(){
  var r=document.getElementById('hl-row');if(!r)return;
  r.innerHTML=(PROFILE.highlights||[]).map(function(h){ var src=safeMedia(h&&h.img); if(!src) return ''; return '<div class="hl" data-click="showTab" data-a="[&quot;gallery&quot;]"><div class="hl-c"><img src="'+esc(src)+'" alt="'+esc(h.label)+'" loading="lazy" data-fb="dim" data-fb-op=".12"></div><span>'+esc(h.label)+'</span></div>';}).join('');
}
function galSrc(v){var u=(v.indexOf('http')===0||v.indexOf('data:')===0)?v:'https://images.ra.co/'+v+'.jpg'; return (typeof window!=='undefined'&&window.KilImgHost&&window.KilImgHost.clean)?window.KilImgHost.clean(u):u;}   /* a host that refuses hotlinking (images.ra.co) is never requested: '' = no picture, the card shows its placeholder */
var GAL_IMGS=[['07f9c05ddcb8a49e9f957760d870ec493b30a4d9','Latin House Night','12.4K'],['095b3c97c806dfa2326c4bc5a8239907b4a24815','Avalon Hollywood','48K'],['0c08978993ce4ba443b61b007d1de45445ddced3','Warehouse Set','9.1K'],['0eb69717593e6bb32225fec905e93762454a7894','Groove Cruise','22K'],['1641a2b8fddcee60bb204595abe0a3f20d8a0e51','Day Trip','7.7K'],['1bfc214a7b4917efac1afad318fd4dafa631a480','Rooftop Session','5.2K'],['233912b5340b79213e16e58647ecd297165d0a52','Kingdom @ Catch One','15K'],['234c570dd0c0ce4c93d62945d502ef1952b2cf31','R&V Radio','3.8K'],['288b5245302955ed0864e6f9dad31af0a092984c','Nocturnal Fest','31K']];
function renderGallery(){
  var g=document.getElementById('gal-grid');if(!g)return;
  var chips=[['all','All'],['blog','Blogs'],['article','Articles'],['image','Images'],['video','Videos']];
  var bar=document.getElementById('gal-filter');
  if(bar)bar.innerHTML=chips.map(function(c){return '<button class="pf-chip'+(GAL_FILTER===c[0]?' on':'')+'" data-click="setGalFilter" data-a="'+esc(JSON.stringify([c[0]]))+'">'+c[1]+'</button>';}).join('');
  var add='';   /* in-feed create tile removed (Founder pass 2) */
  var items=allPosts().filter(function(p){return GAL_FILTER==='all'||p.type===GAL_FILTER;});
  g.innerHTML=add+(items.length?items.map(postCard).join(''):'<div class="pf-empty">Nothing here yet.</div>');
}
var GT_SHOWS=[['JUL','12','FRI','Kozmoz: Euphaura','Warehouse TBA · Los Angeles, CA · 21+','Latin House · Techno','https://posh.vip/e/kozmoz-euphaura'],['JUL','19','SAT','Pre-4th Boiler Room','Downtown Loft · Long Beach, CA · 21+','House · Tech House','https://posh.vip/e/pre-4th-boiler-room'],['AUG','02','SAT','Soundcheck: Sun-Kissed','Rooftop · Santa Ana, CA · 18+','Latin House','https://posh.vip/e/soundcheck-sun-kissed'],['AUG','16','SAT','KEEPITIL Summer','Secret OC Venue · Orange County, CA · 21+','Open Format','https://posh.vip/e/keeitil-summer'],['AUG','30','SAT','Kingdom','Catch One · Los Angeles, CA · 21+','Afro House · Tech House','https://posh.vip/explore?when=Upcoming&sort=Soonest&city=los-angeles']];
function evFromArr(s){return {month:s[0],day:s[1],dow:s[2],title:s[3],venue:s[4],tags:s[5],tix:s[6],cover:s[7]||'',desc:s[8]||'',price:s[9]||'',kind:s[10]||'ext'};}
function evFlyer(o){
  var cover=kilSafeUrl(o.cover);
  var cov=cover?'<img class="cov" src="'+esc(cover)+'" alt="" data-fb="hide">':'';
  var kind=(o.kind==='kil')?'<span class="ev-kind kil">KEEPITIL</span>':'<span class="ev-kind ext">External</span>';
  var tixHref=(o.tix&&o.tix!=='#')?safeNav(o.tix):'';
  var tix=tixHref?'<a class="ev-tix" href="'+esc(tixHref)+'" target="_blank" rel="noopener noreferrer" data-click="pfNoop" data-stop>'+((o.kind==='kil')?'TICKETS / RSVP':'TICKETS')+'</a>':'';
  return '<div class="ev-flyer">'+cov
    +'<div class="ev-datechip"><b>'+esc(o.month)+'</b><span>'+esc(o.day)+'</span></div>'+kind
    +'<div class="c"><div class="et">'+esc(o.title)+'</div>'
    +'<div class="ev-v">'+esc(o.venue)+(o.price?(' · '+esc(o.price)):'')+'</div>'
    +(o.tags?'<div class="ev-g">'+esc(o.tags)+'</div>':'')
    +tix+'</div></div>';
}
function readEvStore(key){ try{var a=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(a)?a:[];}catch(e){return [];} }
var MY_EVENTS=[];
var _MON3=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
var _DOW=['SUN','MON','TUE','WED','THU','FRI','SAT'];
/* convert a DB event / ticket into the unified flyer shape so everything lives in ONE events feed */
function dbToEv(e,src){
  var d=e.starts_at?new Date(e.starts_at):null; var st=(e.status||'').toLowerCase();
  return { month:d?_MON3[d.getMonth()]:'', day:d?String(d.getDate()):'', dow:d?_DOW[d.getDay()]:'',
    title:e.title||'Event', venue:e.city||'',
    tags: src==='tickets'?('🎟 Ticket'+(e.qty>1?' ×'+e.qty:'')):(e.genres||(st&&st!=='published'?st:'')),
    tix: src==='tickets'?('/tickets?e='+encodeURIComponent(e.slug||'')):('/event?e='+encodeURIComponent(e.slug||'')),
    cover:KH(e.cover_url||''), kind:'kil', _src:src, _ts:d?d.getTime():0 };
}
/* SINGLE events feed: all event types + my events + my tickets, filterable, newest -> oldest */
function renderShows(){
  var el=document.getElementById('shows-list');if(!el)return;
  var owner=(typeof CAN_EDIT==='function')&&CAN_EDIT();
  var chips=[['mine','Events']];
  if(owner){ chips.push(['tickets','Tickets']); }
  var bar=document.getElementById('ev-filter');
  if(bar)bar.innerHTML=chips.map(function(c){return '<button class="pf-chip'+(EV_FILTER===c[0]?' on':'')+'" data-click="setEvFilter" data-a="'+esc(JSON.stringify([c[0]]))+'">'+c[1]+'</button>';}).join('');
  var _es=document.getElementById('evsub'); if(_es)_es.style.display='none';  /* old subfilter replaced by the unified filter chips */
  function ts(o){ if(o._ts)return o._ts; var mi=_MON3.indexOf((o.month||'').toUpperCase()); return (mi>=0)?new Date(new Date().getFullYear(),mi,+o.day||1).getTime():0; }
  var all=[];
  if(owner){
    GT_SHOWS.map(evFromArr).forEach(function(o){o._src=(o.kind==='kil')?'inapp':'external';all.push(o);});
    readEvStore('kil-saved-events').forEach(function(o){o._src='saved';all.push(o);});
    readEvStore('kil-joined-events').forEach(function(o){o._src='joined';all.push(o);});
    (MY_EVENTS||[]).forEach(function(e){all.push(dbToEv(e,'mine'));});
    (typeof MY_TIX!=='undefined'?MY_TIX:[]||[]).forEach(function(e){all.push(dbToEv(e,'tickets'));});
  } else {
    /* subscribed viewer: ONLY this profile's public (published) created events → click to buy tickets */
    if(typeof IS_DEMO!=='undefined' && IS_DEMO){ GT_SHOWS.map(evFromArr).forEach(function(o){o._src='mine';all.push(o);}); }
    (MY_EVENTS||[]).filter(function(e){return String(e.status||'published').toLowerCase()==='published';}).forEach(function(e){all.push(dbToEv(e,'mine'));});
    if(bar)bar.innerHTML=''; /* no filter chips for the viewer — just their events */
  }
  var items=all.filter(function(o){return !owner||EV_FILTER==='all'||o._src===EV_FILTER;});
  items.sort(function(a,b){return ts(b)-ts(a);}); // newest upload / purchase first
  el.innerHTML=items.length?items.map(evFlyer).join(''):'<div class="pf-empty">No events yet.</div>';
}
/* ── MY TICKETS carousel (owner-only): every event the user bought a ticket to, newest→oldest ── */
var MY_TIX=[];
/* venue-TZ, never viewer-local (events-integrity standard) */
function fmtTixDate(iso,tz){ try{ if(!iso)return ''; return new Date(iso).toLocaleDateString('en-US',{timeZone:tz||'America/Los_Angeles',month:'short',day:'numeric',year:'numeric'}); }catch(e){ return ''; } }
/* Events-tab subfilter (P0b): one row — My Events · My Tickets · Create Event */
var EVSUB='mine';
function evSub(k){ EVSUB=k; applyEvSub(); }
function applyEvSub(){
  var me=document.getElementById('myev-wrap'), mt=document.getElementById('mytix-wrap');
  var rM=me&&me.dataset.ready==='1', rT=mt&&mt.dataset.ready==='1';
  if(EVSUB==='mine'&&!rM&&rT)EVSUB='tix';
  if(EVSUB==='tix'&&!rT&&rM)EVSUB='mine';
  document.querySelectorAll('#evsub .evsub-b[data-k]').forEach(function(b){ b.classList.toggle('on',b.dataset.k===EVSUB); });
  if(me) me.style.display=(rM&&EVSUB==='mine')?'':'none';
  if(mt) mt.style.display=(rT&&EVSUB==='tix')?'':'none';
}
function evSubReady(k){ var b=document.querySelector('#evsub .evsub-b[data-k="'+k+'"]'); if(b)b.style.display=''; applyEvSub(); }
function loadMyTickets(){
  var wrap=document.getElementById('mytix-wrap'); if(wrap)wrap.style.display='none';  /* tickets now live in the unified events feed */
  if(!SB||!SESSION||!CAN_EDIT()){ return; }
  SB.rpc('get_my_tickets').then(function(r){
    MY_TIX=(r&&!r.error&&r.data)?r.data:[];
    renderShows();
  }).catch(function(){});
}
function goMyTix(i){ var t=MY_TIX[i]; if(!t)return; location.href='/tickets?e='+encodeURIComponent(t.slug||''); }
/* ── MY EVENTS carousel: events this profile created/hosts. Owner sees all statuses; public sees published. ── */
function loadMyEvents(){
  var wrap=document.getElementById('myev-wrap'); if(wrap)wrap.style.display='none';  /* my events now live in the unified events feed */
  if(!SB){ return; }
  SB.rpc('get_profile_events',{p_handle:PROFILE_SLUG}).then(function(r){
    MY_EVENTS=(r&&!r.error&&r.data)?r.data:[];
    renderShows();
  }).catch(function(){});
}
function myevScroll(dir){ var row=document.getElementById('myev-row'); if(!row)return; var c=row.querySelector('.mytix-card'); var w=c?(c.offsetWidth+15)*Math.max(1,Math.floor(row.clientWidth/(c.offsetWidth+15))):320; row.scrollBy({left:dir*w,behavior:'smooth'}); }
function myevMark(){ var car=document.getElementById('myev-car'), row=document.getElementById('myev-row'); if(!car||!row)return; var prev=car.querySelector('.mytix-arrow.prev'), next=car.querySelector('.mytix-arrow.next'); function upd(){ var sc=row.scrollWidth-row.clientWidth>4; car.classList.toggle('scrollable',sc); if(prev)prev.disabled=row.scrollLeft<=2; if(next)next.disabled=row.scrollLeft>=row.scrollWidth-row.clientWidth-2; } upd(); row.onscroll=upd; }
function mytixScroll(dir){ var row=document.getElementById('mytix-row'); if(!row)return; var c=row.querySelector('.mytix-card'); var w=c?(c.offsetWidth+15)*Math.max(1,Math.floor(row.clientWidth/(c.offsetWidth+15))):320; row.scrollBy({left:dir*w,behavior:'smooth'}); }
function mytixMark(){ var car=document.getElementById('mytix-car'), row=document.getElementById('mytix-row'); if(!car||!row)return; var prev=car.querySelector('.mytix-arrow.prev'), next=car.querySelector('.mytix-arrow.next'); function upd(){ var sc=row.scrollWidth-row.clientWidth>4; car.classList.toggle('scrollable',sc); if(prev)prev.disabled=row.scrollLeft<=2; if(next)next.disabled=row.scrollLeft>=row.scrollWidth-row.clientWidth-2; } upd(); row.onscroll=upd; }
function openTicket(i){
  var t=MY_TIX[i]; if(!t) return; closeModal();
  var door=KilTicketQr.payload(t.qr_token);
  var qr='';
  if(door){ var qrDraw=qrcode(0,'M'); qrDraw.addData(door); qrDraw.make(); qr=qrDraw.createDataURL(4,0); }
  var flyer=KH(t.cover_url)?'<img src="'+esc(KH(t.cover_url))+'" alt="" style="width:100%;border-radius:12px;margin-bottom:12px;display:block" data-fb="hide">':'';
  var ov=document.createElement('div');ov.className='kil-modal-ov';ov.id='kilModal';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-label','Dialog');
  ov.innerHTML='<div class="kil-modal"><div class="kil-mh">Your Ticket<button class="kil-mx" data-click="closeModal">&times;</button></div><div class="kil-mb">'
    +flyer
    +'<h3 style="margin:0 0 4px">'+esc(t.title||'Event')+'</h3>'
    +'<p class="note" style="margin:0 0 12px">'+esc(fmtTixDate(t.starts_at))+(t.venue?' · '+esc(t.venue):'')+(t.city?' · '+esc(t.city):'')+'</p>'
    +'<div style="display:flex;gap:14px;align-items:center;margin:0 0 14px"><img src="'+qr+'" alt="Ticket QR" style="width:110px;height:110px;border-radius:10px;background:#fff;padding:6px"><div><div style="font-weight:800;font-size:.9rem">General Admission</div><div class="note">Qty: '+(t.qty||1)+'</div><div class="note" style="word-break:break-all;font-size:.66rem">Ref: '+esc(String(t.qr_token||'').slice(0,12))+'</div><div style="color:var(--accent);font-weight:800;font-size:.8rem;margin-top:4px">✓ PAID</div></div></div>'
    +'<a class="kil-msave" style="display:block;text-align:center;text-decoration:none;margin-bottom:8px" href="/tickets?t='+encodeURIComponent(t.qr_token||'')+'">View / share full ticket →</a>'
    +'<a class="kil-mcancel" style="display:block;text-align:center;text-decoration:none" href="/event?e='+encodeURIComponent(t.slug||'')+'">Open event page &amp; chat →</a>'
    +'</div></div>';
  document.body.appendChild(ov);
  ov.addEventListener('click',function(e){if(e.target===ov)closeModal();});
}
var _alerts=false;
function toggleAlert(){_alerts=!_alerts;var b=document.getElementById('alertBtn');if(_alerts){b.textContent='✓ ALERTS ON';b.classList.add('on');alert('You will get an alert when Groove Trooper announces a show near you. (Demo — wire to Follow / notifications.)');}else{b.textContent='GET ALERTS';b.classList.remove('on');}}
/* COMBINED SUPPORT KEEPITIL SHELF: referral + affiliate links in one widget */
(function(){
  var sh=document.getElementById('shelf');if(!sh)return;
  // [kicker, title, sub, href, bgImage(optional), gradient(optional), amazon(bool)]
  var items=[
    ['Partner','POSH','OC events','https://posh.vip/explore?when=Upcoming&sort=Soonest&city=orange-county','https://images.ra.co/2c2d88660d652f135f06de3887251e7f8565203a.jpg','',false],
    ['Partner','DISTROKID','Put your music everywhere','https://distrokid.com/vip/seven/11538316','https://images.ra.co/288b5245302955ed0864e6f9dad31af0a092984c.jpg','linear-gradient(160deg,#0e2a24,#08130f)',false],
    ['Partner','FREECASH','Earn cash for the next fest','https://freecash.com/r/Tuitea','https://images.ra.co/1641a2b8fddcee60bb204595abe0a3f20d8a0e51.jpg','linear-gradient(160deg,#2a220e,#141007)',false],
    ['$19.99','LED Gloves','Light show in your hands','https://www.amazon.com/s?k=led+gloves+rave&tag=tuitea09-20','https://images.ra.co/1bfc214a7b4917efac1afad318fd4dafa631a480.jpg','linear-gradient(160deg,#1a1a12,#0f0f0f)',true],
    ['$34.99','Hydration Pack','Stay hydrated all night','https://www.amazon.com/s?k=rave+hydration+pack&tag=tuitea09-20','https://images.ra.co/0eb69717593e6bb32225fec905e93762454a7894.jpg','linear-gradient(160deg,#12161a,#0b0e10)',true],
    ['$24.99','Hi-Fi Ear Plugs','Protect your ears','https://www.amazon.com/s?k=hi+fi+ear+plugs+concert&tag=tuitea09-20','https://images.ra.co/234c570dd0c0ce4c93d62945d502ef1952b2cf31.jpg','linear-gradient(160deg,#1a1220,#0d0a12)',true],
    ['$15.99','Kandi Kit','Trade PLUR on the floor','https://www.amazon.com/s?k=kandi+rave+kit&tag=tuitea09-20','https://images.ra.co/233912b5340b79213e16e58647ecd297165d0a52.jpg','linear-gradient(160deg,#201018,#12080d)',true]
  ];
  sh.innerHTML=items.map(function(it){
    var bg=KH(it[4])?'<img class="bgimg" src="'+it[4]+'" alt="" data-fb="hide"><div class="ov"></div>':'';
    var style=it[5]?' style="background:'+it[5]+'"':'';
    var badge=it[6]?'<span class="badge">Amazon</span>':'';
    var cta=it[6]?'Shop on Amazon →':'Open →';
    return '<a class="scard"'+style+' href="'+it[3]+'" target="_blank" rel="noopener'+(it[6]?' sponsored':'')+'">'+bg+badge+'<div class="k">'+it[0]+'</div><div class="t">'+it[1]+'</div><div class="s">'+it[2]+'</div><div class="s" style="color:var(--accent);font-weight:700;margin-top:4px">'+cta+'</div></a>';
  }).join('');
})();
/* ── ADD CONTENT — real modal engine + local persistence ── */
var PROFILE_KEY='kil-profile-'+PROFILE_SLUG;
var ADDED={photos:[],shows:[],articles:[],chats:[]};
function loadStored(){
  try{var s=JSON.parse(localStorage.getItem(PROFILE_KEY)||'null');if(s){ADDED={photos:s.photos||[],shows:s.shows||[],articles:s.articles||[],chats:s.chats||[]};}}catch(e){}
  ADDED.photos.forEach(function(p){GAL_IMGS.unshift(p);});
  ADDED.shows.forEach(function(s){GT_SHOWS.push(s);});
  ADDED.articles.forEach(function(a){GT_ARTICLES.unshift(a);});
  ADDED.chats.forEach(function(c){GT_CHATS.unshift(c);});
}
function saveStored(){try{localStorage.setItem(PROFILE_KEY,JSON.stringify(ADDED));}catch(e){}}
function KH(u){ return (window.KilImgHost&&window.KilImgHost.clean)?window.KilImgHost.clean(u):u; }   /* known-unloadable cover hosts (assets/js/kil-img-host.js) never get a request */
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function storedBody(rec){ return (window.KilSafeHtml && KilSafeHtml.renderStored(rec)) || ''; }
function safeNav(url){ return (window.KilSafeHtml && KilSafeHtml.safeNavUrl(url)) || ''; }
function safeMedia(url){ return (window.KilSafeHtml && KilSafeHtml.safeMediaUrl(url)) || ''; }
function kilSafeUrl(url){ return (window.KilSafeHtml && KilSafeHtml.kilSafeUrl(url)) || ''; }
/* ── Supabase-backed persistence (shared across devices + shown to visitors) ── */
var SEED=null;
var EVENTS_FEED=[];
function renderAll(){renderGallery();renderShows();renderArticles();renderChats();try{setTimeout(hydratePosts,0);}catch(e){}try{applyProfileTabs();}catch(e){}}
/* Subscribed viewer (not the owner) sees only FEED + EVENTS. Owner sees FEED/SAVED/TAGGED/CHAT. */
/* Rewritten 2026-08-26. This drove a row of .pf-tab elements that no longer exists; the
   filter bar replaced them. CHAT and SAVED are the owner-only categories, and pfApplyOwnerBar
   REMOVES them for a visitor rather than hiding them. */
function applyProfileTabs(){
  var owner=(typeof CAN_EDIT==='function')&&CAN_EDIT();
  if(typeof IS_AGENT!=='undefined' && IS_AGENT) return; /* agent pages keep their own layout */
  try{ pfApplyOwnerBar(owner); }catch(e){}
}
function rebuild(rows){
  GT_ARTICLES=SEED.articles.slice();GAL_IMGS=SEED.photos.slice();GT_SHOWS=SEED.shows.slice();GT_CHATS=SEED.chats.slice();EVENTS_FEED=[];
  (rows||[]).forEach(function(r){var d=r.data||{};
    /* F6: kind 'post' rows (written posts, 211 on prod) were not handled here, so they never reached
       GT_ARTICLES and the feed dropped them for EVERY viewer. They share the article data shape; a post
       whose picture lives in data.media[0].src or data.cover rather than data.img still gets a frame. */
    if(r.kind==='article'||r.kind==='post')GT_ARTICLES.unshift({t:d.t,d:d.d,desc:d.desc,text:d.text,body_text:d.body_text,img:d.img||(r.kind==='post'?((d.media&&d.media[0]&&d.media[0].src)||d.cover||undefined):undefined),html:d.html,mtype:d.mtype,tags:d.tags,collab:d.collab,location:d.location,alt:d.alt,hideFeed:d.hideFeed,url:d.url,_pid:r.id});
    else if(r.kind==='photo')GAL_IMGS.unshift([d.src,d.label,d.views,d.mtype,d.hideFeed?1:0,r.id,d.media||null,d.cover||null]);
    else if(r.kind==='show')GT_SHOWS.push([d.month,d.day,d.dow,d.title,d.venue,d.tags,d.tix,d.cover||'',d.desc||'',d.price||'',d.kind||'ext']);
    else if(r.kind==='chat')GT_CHATS.unshift([d.slug,d.name,d.preview,'now','',d.avatar,d.category||'general']);
    else if(r.kind==='event')EVENTS_FEED.unshift(Object.assign({_pid:r.id,_ts:r.created_at},d));
  });
  renderAll();
}
function loadFromDB(){
  if(!SB){ fallbackLocal(); window.__pfGate&&window.__pfGate.mark('feed'); return; }
  SB.from('profile_content').select('*').eq('profile_slug',PROFILE_SLUG).order('created_at',{ascending:true}).then(function(r){
    if(r&&!r.error){ DB_OK=true; rebuild(r.data); window.__pfGate&&window.__pfGate.mark('feed'); }
    else { fallbackLocal(); }   // a failed read draws the small local seed: the real feed may still land, so the hold stays (6 s cap)
  }).catch(function(){ fallbackLocal(); });
}
function fallbackLocal(){ GT_ARTICLES=SEED.articles.slice();GAL_IMGS=SEED.photos.slice();GT_SHOWS=SEED.shows.slice();GT_CHATS=SEED.chats.slice();
  try{var s=JSON.parse(localStorage.getItem(PROFILE_KEY)||'null');if(s){ADDED={photos:s.photos||[],shows:s.shows||[],articles:s.articles||[],chats:s.chats||[]};}}catch(e){}
  ADDED.photos.forEach(function(p){GAL_IMGS.unshift(p);});ADDED.shows.forEach(function(x){GT_SHOWS.push(x);});ADDED.articles.forEach(function(a){GT_ARTICLES.unshift(a);});ADDED.chats.forEach(function(c){GT_CHATS.unshift(c);});
  renderAll();
}
function applyLocal(kind,data){
  if(kind==='article'){GT_ARTICLES.unshift(data);ADDED.articles.unshift(data);}
  else if(kind==='photo'){var r1=[data.src,data.label,data.views,data.mtype,data.hideFeed?1:0,null,data.media||null,data.cover||null];GAL_IMGS.unshift(r1);ADDED.photos.unshift(r1);}
  else if(kind==='show'){var r2=[data.month,data.day,data.dow,data.title,data.venue,data.tags,data.tix,data.cover||'',data.desc||'',data.price||'',data.kind||'ext'];GT_SHOWS.push(r2);ADDED.shows.push(r2);}
  else if(kind==='chat'){var r3=[data.slug,data.name,data.preview,'now','',data.avatar,data.category||'general'];GT_CHATS.unshift(r3);ADDED.chats.unshift(r3);}
  saveStored();renderAll();
}
function publish(kind,data){
  if(SB&&SESSION){
    SB.from('profile_content').insert({profile_slug:PROFILE_SLUG,kind:kind,data:data,created_by:SESSION.user.id}).then(function(r){
      if(r&&r.error){ toast('Could not publish ('+(r.error.message||'error')+') — saved as local preview.'); applyLocal(kind,data); }
      else { toast('Published live.'); loadFromDB(); }
    }).catch(function(){ applyLocal(kind,data); });
  } else {
    applyLocal(kind,data);
    if(SB){ toast('Saved as a local preview. Sign in to publish it for everyone.'); }
  }
}
/* ── NUDITY / EXPLICIT-CONTENT MODERATION (client-side, NSFWJS + TF.js) ──
   Every image upload is screened before it is stored. Blocks porn/hentai/explicit.
   Fails OPEN (allows) only if the model can't load, so uploads never hard-break;
   server-side moderation is the recommended hardening layer on top of this. */
var _nsfwModel=null, _nsfwLoading=null;
var _nsfwLibs=null;
function loadNsfwLibs(){
  if(_nsfwLibs) return _nsfwLibs;
  function add(src){ return new Promise(function(res,rej){ var sc=document.createElement('script'); sc.src=src; sc.onload=res; sc.onerror=rej; document.head.appendChild(sc); }); }
  _nsfwLibs = add('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.11.0/dist/tf.min.js').then(function(){ return add('https://cdn.jsdelivr.net/npm/nsfwjs@3.0.0/dist/nsfwjs.min.js'); }).catch(function(){ return null; });
  return _nsfwLibs;
}
function getNsfwModel(){
  if(_nsfwModel) return Promise.resolve(_nsfwModel);
  if(_nsfwLoading) return _nsfwLoading;
  _nsfwLoading = loadNsfwLibs().then(function(){
    if(typeof nsfwjs==='undefined') return null;
    return nsfwjs.load().then(function(m){ _nsfwModel=m; return m; });
  }).catch(function(){ return null; });
  return _nsfwLoading;
}
function isImageSafe(file){
  return getNsfwModel().then(function(model){
    if(!model) return true; // model unavailable → fail open
    return new Promise(function(resolve){
      var img=new Image(); var url=URL.createObjectURL(file);
      img.onload=function(){
        model.classify(img).then(function(preds){
          URL.revokeObjectURL(url);
          var p={}; preds.forEach(function(x){ p[x.className]=x.probability; });
          var blocked=(p.Porn||0)>0.45 || (p.Hentai||0)>0.45 || (p.Sexy||0)>0.75;
          resolve(!blocked);
        }).catch(function(){ URL.revokeObjectURL(url); resolve(true); });
      };
      img.onerror=function(){ URL.revokeObjectURL(url); resolve(true); };
      img.src=url;
    });
  });
}
/* Resize before upload (owner uploads were stored as-is: two ~2 MB 1672x941 PNGs shown as a 124px avatar made the page 1.8 MB).
   Longest edge capped at 1600px, re-encoded as WebP (q .85); a JPEG source falls back to JPEG when the browser cannot encode WebP.
   The ORIGINAL file is kept when: it is not a png/jpeg/webp (gif, video...), it is already small (<=1600px and <=400 KB), the browser cannot
   encode (a PNG with no WebP encoder would lose its transparency in a JPEG), anything fails or takes over 6 s, or the result is not smaller. */
function resizeForUpload(file){
  return new Promise(function(resolve){
    var settled=false; function done(f){ if(!settled){ settled=true; resolve(f||file); } }
    try{
      if(!file||!/^image\/(png|jpeg|webp)$/i.test(file.type||'')) return done(file);
      setTimeout(function(){ done(file); },6000);
      var url=URL.createObjectURL(file), img=new Image();
      img.onerror=function(){ try{URL.revokeObjectURL(url);}catch(e){} done(file); };
      img.onload=function(){
        try{ URL.revokeObjectURL(url); }catch(e){}
        var w=img.naturalWidth, h=img.naturalHeight, longEdge=Math.max(w,h);
        if(!w||!h||(longEdge<=1600&&file.size<=400*1024)) return done(file);
        var k=Math.min(1,1600/longEdge), cw=Math.max(1,Math.round(w*k)), ch=Math.max(1,Math.round(h*k));
        var c=document.createElement('canvas'); c.width=cw; c.height=ch;
        var ctx=c.getContext&&c.getContext('2d'); if(!ctx) return done(file);
        ctx.drawImage(img,0,0,cw,ch);
        var base=String(file.name||'image').replace(/\.[^.]+$/,'');
        function finish(blob,type,ext){
          if(!blob||blob.size>=file.size) return done(file);
          var out; try{ out=new File([blob],base+'.'+ext,{type:type}); }catch(e){ return done(file); }   // no File constructor: keep the original (it has a name)
          done(out);
        }
        c.toBlob(function(b){
          if(b&&b.type==='image/webp') return finish(b,'image/webp','webp');
          if(/^image\/jpeg$/i.test(file.type)) return c.toBlob(function(j){ finish(j,'image/jpeg','jpg'); },'image/jpeg',0.85);
          done(file);
        },'image/webp',0.85);
      };
      img.src=url;
    }catch(e){ done(file); }
  });
}
function uploadImage(file0,cb){
  if(!file0||!SB||!SESSION){ cb(null); return; }
  resizeForUpload(file0).then(function(file){
  /* moderation must never hang the upload — on mobile the NSFW/TF.js model can stall.
     Race it against a 4s timeout that fails OPEN (consistent with the model-unavailable path). The check runs on the RESIZED image that is actually uploaded. */
  var moderated=Promise.race([ isImageSafe(file), new Promise(function(res){ setTimeout(function(){ res(true); },4000); }) ]);
  moderated.then(function(safe){
    if(!safe){ toast('⛔ Image blocked — nudity or explicit content is not allowed on KEEPITIL.'); cb(null); return; }
    /* chat-images accepts uploads only into the signed-in user's own folder (first path segment = their user id): <uid>/profiles/<slug>/... Existing files keep their old paths and URLs. */
    var path=SESSION.user.id+'/profiles/'+PROFILE_SLUG+'/'+Date.now()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_');
    SB.storage.from('chat-images').upload(path,file).then(function(r){
      if(r&&r.error){ cb(null); return; }
      var pub=SB.storage.from('chat-images').getPublicUrl(path);
      cb((pub&&pub.data)?pub.data.publicUrl:null);
    }).catch(function(){ cb(null); });
  });
  });
}
function resolveImg(vals,fileKey,urlKey,dflt,cb){ uploadImage(vals[fileKey+'_file'],function(pub){ cb(pub||vals[fileKey]||vals[urlKey]||dflt||''); }); }
function toast(msg){ var t=document.createElement('div'); t.setAttribute('role','status'); t.textContent=msg; t.style.cssText='position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--surface);color:var(--text);border:1px solid var(--line);padding:11px 18px;border-radius:10px;box-shadow:0 12px 34px rgba(0,0,0,.45);z-index:10000;font-size:.85rem;max-width:90%;text-align:center;'; document.body.appendChild(t); setTimeout(function(){t.style.opacity='0';t.style.transition='opacity .4s';},2600); setTimeout(function(){t.remove();},3200); }

/* ── PROFILE META (header/bio/links/highlights) — editable by the owner ── */
/* Groove Trooper's data lives ONLY here, gated by IS_DEMO — never in markup, never for other slugs. */
var PROFILE = IS_DEMO ? {
  name:'Groove Trooper', handle:'Groove_Trooper', location:'Garden Grove, CA',
  bio:"Garden Grove's Latin House veteran — from Antigua Guatemala raves to Avalon Hollywood. High energy, all smiles, Latin grooves.",
  tagline:'The stage is the mission.', pronouns:'',
  avatar:'https://img1.wsimg.com/isteam/ip/403cc31a-6001-42de-a0a3-68f197acd538/680248119_960171736974630_4503929345921155632_.jpg',
  cover:'https://images.ra.co/06c4bb3109109df1dad229582219f4ded15b11d4.jpg',
  book_email:'',
  socials:{instagram:'https://instagram.com/Groove_Trooper',soundcloud:'https://on.soundcloud.com/mSGGX5UHsrqxNEsRIj',website:'',tiktok:''},
  highlights:[{label:'Groove Cruise',img:'https://images.ra.co/0c08978993ce4ba443b61b007d1de45445ddced3.jpg'},{label:'Avalon',img:'https://images.ra.co/095b3c97c806dfa2326c4bc5a8239907b4a24815.jpg'},{label:'R&V Radio',img:'https://images.ra.co/234c570dd0c0ce4c93d62945d502ef1952b2cf31.jpg'},{label:'Kingdom',img:'https://images.ra.co/233912b5340b79213e16e58647ecd297165d0a52.jpg'},{label:'Studio',img:'https://images.ra.co/1bfc214a7b4917efac1afad318fd4dafa631a480.jpg'},{label:'Festivals',img:'https://images.ra.co/0eb69717593e6bb32225fec905e93762454a7894.jpg'}]
} : {
  name:'', handle:PROFILE_SLUG||'', location:'', bio:'', tagline:'', pronouns:'',
  avatar:'', cover:'', book_email:'', socials:{}, highlights:[]
};
function applyProfile(){
  var g=function(id){return document.getElementById(id);};
  try{document.title=(PROFILE.name?PROFILE.name+' — ':'')+'Artist Profile | KEEPITIL';}catch(e){}
  /* ProfilePage JSON-LD (KODE 2026-09-14). Public profiles carried no structured data at all.
     Only fields that actually hold a value are emitted -- an empty name or a blank image is
     worse than an absent one, because it publishes a claim the page cannot support.

     mainEntity is deliberately ABSENT. Saying Person or Organization would be a guess: the
     profile model does store an entity type (profile_meta.account_type / entity_category) but
     its values are 'editorial_artist' / 'artist' / 'subscriber_profile', and one of the two
     live public profiles has entity_category NULL. "Artist" does not resolve the question
     either -- an artist may be one person or a group. Guessing from the display name is
     exactly what must not happen here, so the type stays unstated until the data states it.

     Nothing is emitted for a profile that did not resolve: a not-found profile must not
     publish structured data describing a profile that does not exist. */
  try{
    if(PROFILE_SLUG && PROFILE.name){
      var _ld={"@context":"https://schema.org","@type":"ProfilePage",
               "url":'https://keepitil.com/profile?slug='+encodeURIComponent(PROFILE_SLUG),
               "name":PROFILE.name};
      var _d=PROFILE.bio||PROFILE.tagline||''; if(_d) _ld.description=_d;
      if(PROFILE.avatar) _ld.image=PROFILE.avatar;
      var _e=document.getElementById('ld-profile');
      if(!_e){ _e=document.createElement('script'); _e.type='application/ld+json';
               _e.id='ld-profile'; document.head.appendChild(_e); }
      _e.textContent=JSON.stringify(_ld);
    }
  }catch(e){}
  /* the profile "cover" is now the LOCKED BACKGROUND image (editable in Edit Profile) */
  try{ var _isM=window.matchMedia('(max-width:768px)').matches; var _bg=KH((_isM&&PROFILE.cover_mobile)?PROFILE.cover_mobile:PROFILE.cover);   /* a cover on a no-hotlink host (images.ra.co) falls back to the default backdrop instead of a dead request */ document.documentElement.style.setProperty('--pf-bg', _bg?("url('"+String(_bg).replace(/'/g,"%27")+"')"):"url('/assets/images/logo-bg.jpg')"); }catch(e){}
  var _av=g('pfAvatar'); if(_av){ _av.classList.remove('pf-skel'); if(PROFILE.avatar){ _av.style.display=''; _av.src=PROFILE.avatar; } }
  if(g('pfName')){ var _pn=g('pfName'); if(PROFILE.name) _pn.textContent=PROFILE.name; else _pn.innerHTML='<span class="pf-vh">Loading profile</span>\u00a0'; }   /* a heading is never empty: it carries a visually hidden "Loading profile" label until a name arrives, then the name */
  if(g('pfHandle'))g('pfHandle').textContent=PROFILE.handle?('@'+PROFILE.handle+(PROFILE.location?' · '+PROFILE.location:'')+(PROFILE.pronouns?' · '+PROFILE.pronouns:'')):' ';
  if(g('pfBio'))g('pfBio').innerHTML=PROFILE.bio?(esc(PROFILE.bio)+(PROFILE.tagline?' <span class="h">'+esc(PROFILE.tagline)+'</span>':'')):' ';
  if(g('pfBook')){ g('pfBook').href='#'; g('pfBook').onclick=function(ev){ev.preventDefault();openDM();}; g('pfBook').style.display=(typeof CAN_EDIT==='function'&&CAN_EDIT())?'none':''; }
  if(g('pfAlertTxt')&&PROFILE.name){ g('pfAlertTxt').innerHTML='<b>🔔 Never miss a set.</b> Get alerts when '+esc(PROFILE.name)+' plays near you.'; }
  var s=PROFILE.socials||{};
  var ig=safeNav(s.instagram), sc=safeNav(s.soundcloud);
  if(g('pfIG')){ g('pfIG').style.display=ig?'':'none'; if(ig) g('pfIG').href=ig; }
  if(g('pfSC')){ g('pfSC').style.display=sc?'':'none'; if(sc) g('pfSC').href=sc; }
  /* agent chat header follows the async-loaded meta (avatar lands after first render) */
  if(IS_AGENT){ var _ag=document.querySelector('#agchat .ag-head'); if(_ag){ var _ai=_ag.querySelector('img'); if(_ai&&PROFILE.avatar)_ai.src=PROFILE.avatar; var _ab=_ag.querySelector('b'); if(_ab&&PROFILE.name)_ab.textContent='Ask '+PROFILE.name; } }
  renderHighlights();
  renderLinksMenu();
}
/* About → "Links" dropdown = the profile's social media icons + custom links (Founder 2026-07-27: socials moved here from the footer) */
/* Real social-media brand icons (Founder 2026-08-05: real logos only, no emoji). */
var PF_BRAND={
  instagram:'M12 2.2c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23C2.21 15.58 2.2 15.2 2.2 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.21 8.8 2.2 12 2.2zm0 3.2A6.6 6.6 0 1012 18.6 6.6 6.6 0 0012 5.4zm0 10.9a4.3 4.3 0 110-8.6 4.3 4.3 0 010 8.6zm6.85-11.2a1.54 1.54 0 11-3.08 0 1.54 1.54 0 013.08 0z',
  soundcloud:'M1.5 13.6c-.1 0-.2.1-.2.2l-.2 1.7.2 1.6c0 .1.1.2.2.2s.2-.1.2-.2l.2-1.6-.2-1.7c0-.1-.1-.2-.2-.2zm2 .6c-.1 0-.2.1-.2.2l-.2 1.1.2 1.1c0 .1.1.2.2.2s.2-.1.2-.2l.3-1.1-.3-1.1c0-.1-.1-.2-.2-.2zm12.9-4.9c-.5 0-.9.1-1.3.3-.3-2.9-2.7-5.1-5.7-5.1-.7 0-1.4.1-2 .4-.2.1-.3.2-.3.4v9.1c0 .2.2.4.4.4h8.9c1.7 0 3.1-1.4 3.1-3.1 0-1.5-1.2-2.8-3.1-2.8z',
  tiktok:'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.08-.14 1.62.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
  youtube:'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
  spotify:'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.56.3z',
  x:'M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.22-6.82-5.97 6.82H1.66l7.73-8.84L1.24 2.25h6.83l4.71 6.23 5.46-6.23zm-1.16 17.52h1.83L7.01 4.13H5.05l12.03 15.64z',
  facebook:'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
  website:'M12 2a10 10 0 100 20 10 10 0 000-20zm6.93 6h-2.95a15.6 15.6 0 00-1.38-3.56A8.03 8.03 0 0118.93 8zM12 4c.83 1.2 1.48 2.53 1.91 4h-3.82c.43-1.47 1.08-2.8 1.91-4zM4.26 14a7.96 7.96 0 010-4h3.38c-.08.66-.14 1.32-.14 2s.06 1.34.14 2H4.26zm.81 2h2.95c.32 1.28.79 2.49 1.38 3.56A8.03 8.03 0 015.07 16zm2.95-8H5.07a8.03 8.03 0 014.33-3.56A15.6 15.6 0 008.02 8zM12 20c-.83-1.2-1.48-2.53-1.91-4h3.82c-.43 1.47-1.08 2.8-1.91 4zm2.34-6H9.66c-.09-.66-.16-1.32-.16-2s.07-1.35.16-2h4.68c.09.65.16 1.32.16 2s-.07 1.34-.16 2zm.25 5.56c.59-1.07 1.06-2.28 1.38-3.56h2.95a8.03 8.03 0 01-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2s-.06-1.34-.14-2h3.38a7.96 7.96 0 010 4h-3.38z'
};
function pfSvg(key){ var k=(key==='twitter')?'x':key; var p=PF_BRAND[k]||PF_BRAND.website; return '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="'+p+'"/></svg>'; }
function renderLinksMenu(){
  var menu=document.getElementById('pfLinksMenu'), drop=document.getElementById('pfLinksDrop'); if(!menu) return;
  var soc=PROFILE.socials||{};
  var SI=[['instagram','Instagram'],['soundcloud','SoundCloud'],['tiktok','TikTok'],['youtube','YouTube'],['spotify','Spotify'],['x','X'],['twitter','X'],['facebook','Facebook'],['website','Website']];
  var out=[], seen={};
  SI.forEach(function(k){ var v=soc[k[0]]; if(v&&!seen[k[1]]){ seen[k[1]]=1; var u=String(v).replace(/^@/,''); if(!/^https?:\/\//.test(u))u='https://'+u; out.push({key:k[0],label:k[1],url:u,web:(k[0]==='website')}); } });
  (PROFILE.links||[]).forEach(function(u){ if(u){ var uu=String(u); if(!/^https?:\/\//.test(uu))uu='https://'+uu; out.push({key:'website',label:uu.replace(/^https?:\/\//,'').replace(/\/.*$/,'').slice(0,28),url:uu,web:true}); } });
  var row=document.getElementById('pfLinks');
  if(!out.length){ if(drop)drop.style.display='none'; if(row){row.style.display='none';row.innerHTML='';} return; }
  /* Single icon row (Founder 2026-08-04): website first, then up to 5 real social brand icons — desktop AND mobile. */
  var web=out.filter(function(it){return it.web;});
  var rest=out.filter(function(it){return !it.web;}).slice(0,5);
  var capped=web.concat(rest);
  if(drop)drop.style.display='none';
  if(menu)menu.innerHTML='';
  if(row){ row.style.display='flex'; row.innerHTML=capped.map(function(it){ var href=safeNav(it.url); if(!href) return ''; return '<a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer" title="'+esc(it.label)+'" aria-label="'+esc(it.label)+'" style="flex:0 0 auto;width:42px;height:42px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(255,255,255,.07);border:1px solid var(--line,rgba(255,255,255,.12));text-decoration:none;color:#fff">'+pfSvg(it.key)+'</a>'; }).join(''); }
}
function loadProfileMeta(){
  if(!SB){ window.__pfGate&&window.__pfGate.reveal(); return Promise.resolve(); }
  return SB.from('profile_meta').select('*').eq('slug',PROFILE_SLUG).maybeSingle().then(function(r){
    /* SOFT-404: an explicit ?slug= that matches no profile. Guarded on PROFILE_SLUG being
       present so the owner's own view — which arrives here without a slug and is redirected
       elsewhere — is never mistaken for a missing profile. */
    if(PROFILE_SLUG && !(r&&r.data) && window.KIL_NOT_FOUND){
      window.__pfGate&&window.__pfGate.reveal();
      try{ var _pf=document.getElementById('pfName'); if(_pf) _pf.innerHTML='<span class="pf-vh">Profile not found</span>\u00a0'; }catch(e){}
      window.KIL_NOT_FOUND({ what:'profile', heading:'That profile isn’t here',
        body:'It may have been removed, renamed, or the link may be wrong.',
        links:[['/connect/','Browse the Scene'],['/','Explore'],['/apply','Claim your profile']] });
      return;
    }
    if(r&&r.data){var d=r.data;
      PROFILE.name=d.display_name||PROFILE.name; PROFILE.handle=d.handle||PROFILE.handle; PROFILE.location=d.location||PROFILE.location;
      PROFILE.bio=(d.bio!=null?d.bio:PROFILE.bio); PROFILE.tagline=(d.tagline!=null?d.tagline:PROFILE.tagline); PROFILE.pronouns=d.pronouns||PROFILE.pronouns;
      PROFILE.avatar=d.avatar_url||PROFILE.avatar; PROFILE.cover=d.cover_url||PROFILE.cover; PROFILE.cover_mobile=d.cover_mobile_url||PROFILE.cover_mobile; PROFILE.book_email=d.book_email||PROFILE.book_email;
      if(d.socials&&typeof d.socials==='object')PROFILE.socials=Object.assign({},PROFILE.socials,d.socials);
      if(Array.isArray(d.links))PROFILE.links=d.links;
      if(Array.isArray(d.highlights)&&d.highlights.length)PROFILE.highlights=d.highlights;
    }
    applyProfile(); loadCategories();
    /* ONE PASS: the row already carries about and links (select *), so draw them in the SAME task as the name and bio instead of waiting for the second read (profile_meta again), which landed 0.5-2 s later and moved the buttons and everything below. The second read re-draws the same text (no change). */
    try{
      if(d && d.about){ var _at1=document.getElementById('pfAboutTop'); if(_at1)_at1.style.display='none'; var _ab1=document.getElementById('pfAbout'); if(_ab1){ _ab1.textContent=d.about; _ab1.style.display='block'; } }
      if(d && Array.isArray(d.links)){ PROFILE.links=d.links; if(typeof renderLinksMenu==='function') renderLinksMenu(); }
    }catch(e){}
    window.__pfGate&&window.__pfGate.mark('meta');
  }).catch(function(){ applyProfile(); window.__pfGate&&window.__pfGate.mark('meta'); });
}
function loadCategories(){
  if(!SB) return;
  SB.from('profile_content').select('data').eq('profile_slug',PROFILE_SLUG).eq('kind','profile_categories').limit(1).then(function(r){
    if(r&&r.data&&r.data[0]&&r.data[0].data){ var cd=r.data[0].data; PROFILE.categories=cd.categories||[]; PROFILE.cat_details=cd.details||{}; renderCategories(); }
  }).catch(function(){});
}
function renderCategories(){ var box=document.getElementById('pfCats'); if(!box)return;
  var L={artist:'Artist',brand:'Brand',organizer:'Organizer',venue:'Venue'};
  box.innerHTML=(PROFILE.categories||[]).filter(function(k){return Object.prototype.hasOwnProperty.call(L,k);}).map(function(k){return '<span class="pf-catbadge '+esc(k)+'">'+esc(L[k])+'</span>';}).join('');
}
function updateOwnerUI(){
  ['pfDashWrap','pfEditPage'].forEach(function(id){ var e=document.getElementById(id); if(e)e.style.display=CAN_EDIT()?'':'none'; });
  var _pc=document.getElementById('pfCreate'); if(_pc)_pc.style.display='none';
  /* __feedCatPaint call removed with #feed-cat, 2026-08-27. */
  try{ syncNavCta(); }catch(e){}  /* own profile = hamburger menu; someone else's = PROFILE button back to mine */
  try{ if(CAN_EDIT() && !window.__epOpened && new URLSearchParams(location.search).get('edit')==='1'){ window.__epOpened=1; setTimeout(openEditProfile,250); } }catch(e){}
  try{ if(CAN_EDIT() && !window.__cfOpened && new URLSearchParams(location.search).get('create')==='feed'){ window.__cfOpened=1; setTimeout(function(){openCreatePost('feed');},250); } }catch(e){}
  var f=document.getElementById('pfFollow'); if(f)f.style.display=CAN_EDIT()?'none':'';
  var mb=document.getElementById('pfBook'); if(mb)mb.style.display=CAN_EDIT()?'none':'';
}
/* DASH dropdown — houses Dashboard / Edit profile / Settings (Founder 2026-07-20) */
/* toggleDashMenu removed 2026-08-26 — DASH opens the dashboard directly, there is no menu. */
/* ── DIRECT MESSAGE (viewer → this profile) via send_dm RPC ── */
function openDM(){
  if(!SB||!SESSION){ toast('Sign in to message.'); setTimeout(function(){location.href='/apply?next='+encodeURIComponent(location.pathname+location.search);},700); return; }
  if(document.getElementById('kilDM'))return;
  var nm=(typeof PROFILE!=='undefined'&&PROFILE.name)?PROFILE.name:'this profile';
  var ov=document.createElement('div'); ov.id='kilDM'; ov.setAttribute('role','dialog'); ov.setAttribute('aria-modal','true'); ov.setAttribute('aria-label','Message '+nm);
  ov.style.cssText='position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:16px';
  ov.innerHTML='<div style="background:#15151f;border:1px solid rgba(255,255,255,.14);border-radius:16px;max-width:420px;width:100%;padding:18px;box-shadow:0 20px 60px rgba(0,0,0,.6)">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><b style="font-size:1.05rem;color:#fff">Message '+esc(nm)+'</b><button id="dmX" aria-label="Close" style="background:none;border:0;color:#888;font-size:1.5rem;line-height:1;cursor:pointer">&times;</button></div>'
    +'<textarea id="dmBody" rows="4" placeholder="Write a message…" maxlength="4000" style="width:100%;box-sizing:border-box;background:#0e0e16;border:1px solid rgba(255,255,255,.16);border-radius:10px;color:#e8e8f0;padding:11px;font-size:.95rem;resize:vertical"></textarea>'
    +'<button id="dmSend" class="pf-btn book" style="width:100%;margin-top:12px;justify-content:center">Send</button></div>';
  document.body.appendChild(ov);
  function close(){ ov.remove(); }
  ov.addEventListener('click',function(e){ if(e.target===ov) close(); });
  document.getElementById('dmX').onclick=close;
  document.getElementById('dmBody').focus();
  document.getElementById('dmSend').onclick=function(){
    var t=(document.getElementById('dmBody').value||'').trim(); if(!t)return;
    var btn=this; btn.disabled=true; btn.textContent='Sending…';
    SB.rpc('send_dm',{p_to_slug:PROFILE_SLUG,p_body:t}).then(function(r){
      var d=(r&&r.data)||{};
      if((r&&r.error)||d.error){ toast(d.error==='cannot_message_self'?'That is your own profile.':'Could not send.'); btn.disabled=false; btn.textContent='Send'; return; }
      toast('Message sent to '+nm+'.'); close();
    }).catch(function(){ toast('Could not send.'); btn.disabled=false; btn.textContent='Send'; });
  };
}
/* ── FOLLOW (fans follow a profile) ── */
var FOLLOWING=false, FOLLOWERS=0;
function renderFollowBtn(){
  var b=document.getElementById('pfFollow'); if(!b)return;
  b.textContent=(FOLLOWING?'✓ FOLLOWING':'+ FOLLOW')+(FOLLOWERS>0?' · '+FOLLOWERS:'');
  b.classList.toggle('following',FOLLOWING);
}
/* Follower count and "am I following" come from get_profile_stats (SECURITY DEFINER): the page never lists who follows anyone,
   so the follows table can be private (only your own rows readable; gh.io follows-privacy DRAFT). */
function loadFollow(){
  if(!SB)return;
  SB.rpc('get_profile_stats',{p_slug:PROFILE_SLUG}).then(function(r){
    var d=r&&!r.error&&r.data;
    if(d&&typeof d==='object'){ FOLLOWERS=Number(d.followers)||0; FOLLOWING=!!(SESSION&&d.is_following); renderFollowBtn(); }
  }).catch(function(){});
}
/* ── SHARE: social platforms, email or SMS only ── */
/* ── Delegated actions (assets/js/kil-actions.js): the markup carries data-click / data-change / data-input / data-keydown / data-over / data-out instead of inline on*= handlers.
   Only the names listed in KilActions.allow() can run. The small functions below are the old inline statements, unchanged in behaviour. ── */
function pfStop(ev){ if(!ev) return; if(typeof ev.stopImmediatePropagation==='function') ev.stopImmediatePropagation(); else if(typeof ev.stopPropagation==='function') ev.stopPropagation(); }
function pfNoop(){}
function pfBack(){ history.back(); }
function pfGoDashboard(){ location.href='/dashboard'; }
function pfLinksToggle(){ var m=document.getElementById('pfLinksMenu'); m.style.display=m.style.display==='none'?'block':'none'; }
function pfChatBackdrop(e,el){ if(e.target===el) closeChatGroup(); }
function pfCloseInsights(){ var o=document.getElementById('insOv'); if(o) o.remove(); }
function pfRemoveParent(el){ el.parentNode.remove(); }
function pfClickId(id){ document.getElementById(id).click(); }
function pfAgEnter(e){ if(e.key==='Enter'){ e.preventDefault(); agSend(); } }
function pfVidPlay(el){ try{ el.play(); }catch(e){} }
function pfVidPause(el){ el.pause(); }
if(window.KilActions) KilActions.allow(["addContent", "agAsk", "agSend", "closeChatGroup", "closeLoginWall", "closeModal", "cpChipKey", "cpCount", "cpMoveItem", "cpRemoveChip", "cpRemoveItem", "cpSubmit", "cpUseUrl", "evSub", "fbCapToggle", "myevScroll", "mytixScroll", "openEditProfile", "pfAgEnter", "pfBack", "pfChatBackdrop", "pfClickId", "pfCloseInsights", "pfGoDashboard", "pfLinksToggle", "pfNoop", "pfRemoveParent", "pfVidPause", "pfVidPlay", "setEvFilter", "setGalFilter", "shareTo", "showTab", "toggleAlert", "toggleCat", "toggleCreateMenu", "toggleFollow", "toggleHideFeed", "toggleMenu", "toggleShare"]);
function toggleShare(e){ pfStop(e); var w=document.getElementById('pfShare'); if(w) w.classList.toggle('open'); }
document.addEventListener('click',function(e){ var w=document.getElementById('pfShare'); if(w&&w.classList.contains('open')&&!w.contains(e.target)) w.classList.remove('open'); });
/* Share links must open for whoever receives them. In the app the page origin is capacitor://localhost, which
   is not a link anyone can open, so anything but keepitil.com itself shares the canonical https://keepitil.com. */
var KIL_SHARE_ORIGIN=(/^https:\/\/(www\.)?keepitil\.com$/i.test(location.origin)?location.origin:'https://keepitil.com');
function shareTo(net){
  var url=(typeof PROFILE_SLUG!=='undefined'&&PROFILE_SLUG)?KIL_SHARE_ORIGIN+'/profile?slug='+encodeURIComponent(PROFILE_SLUG):KIL_SHARE_ORIGIN+location.pathname;
  var title=(typeof PROFILE!=='undefined'&&PROFILE.name)?PROFILE.name+' on KEEPITIL':document.title;
  var u=encodeURIComponent(url), t=encodeURIComponent(title), body=encodeURIComponent(title+' — '+url);
  var link='';
  if(net==='x')      link='https://twitter.com/intent/tweet?text='+t+'&url='+u;
  else if(net==='fb')link='https://www.facebook.com/sharer/sharer.php?u='+u;
  else if(net==='wa')link='https://api.whatsapp.com/send?text='+body;
  else if(net==='tg')link='https://t.me/share/url?url='+u+'&text='+t;
  else if(net==='email')link='mailto:?subject='+t+'&body='+body;
  else if(net==='sms')link='sms:?&body='+body;
  else if(net==='copy'){
    if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(url).then(function(){toast('Link copied.');}); }
    else { try{var ta=document.createElement('textarea');ta.value=url;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('Link copied.');}catch(e){toast('Copy failed.');} }
    var w0=document.getElementById('pfShare'); if(w0)w0.classList.remove('open'); return;
  }
  if(link) window.open(link,'_blank','noopener,noreferrer');
  var w=document.getElementById('pfShare'); if(w)w.classList.remove('open');
}

function toggleFollow(){
  if(!SB||!SESSION){ toast('Sign in to follow this profile.'); return; }
  var b=document.getElementById('pfFollow'); if(b)b.disabled=true;
  if(FOLLOWING){
    SB.from('follows').delete().eq('profile_slug',PROFILE_SLUG).eq('follower_id',SESSION.user.id).then(function(r){
      if(!(r&&r.error)){ FOLLOWING=false; FOLLOWERS=Math.max(0,FOLLOWERS-1); renderFollowBtn(); }
      if(b)b.disabled=false;
    }).catch(function(){ if(b)b.disabled=false; });
  } else {
    SB.from('follows').insert({profile_slug:PROFILE_SLUG,follower_id:SESSION.user.id}).then(function(r){
      if(!(r&&r.error)){ FOLLOWING=true; FOLLOWERS=FOLLOWERS+1; renderFollowBtn(); toast('You are following '+PROFILE.name+'.'); }
      if(b)b.disabled=false;
    }).catch(function(){ if(b)b.disabled=false; });
  }
}

/* Keep the shell's top-right button correct for the CURRENT viewer:
   - your OWN profile  -> hamburger menu (Edit profile / Settings), set by the shell
   - someone ELSE's profile (viewer) -> PROFILE button back to your own profile
   Runs a short poller because the shell nav is injected async and ownership resolves async. */
function syncNavCta(){ if(window.__ncStarted)return; window.__ncStarted=1; var tries=0;
  var iv=setInterval(function(){ tries++;
    var cta=document.querySelector('.v3s-cta'); if(!cta){ if(tries>40)clearInterval(iv); return; }
    if(SESSION && SESSION.user){
      if(!CAN_EDIT() && cta.textContent.trim().toUpperCase()!=='PROFILE'){
        cta.innerHTML=''; cta.textContent='PROFILE'; cta.setAttribute('href','/profile');
        cta.setAttribute('title','My profile'); cta.setAttribute('aria-label','My profile');
        cta.classList.remove('v3s-hamb'); cta.onclick=null; cta.style.cssText='';
      }
    }
    if(tries>40) clearInterval(iv);
  },350);
}
/* ── EDIT PROFILE (owner-only) ── */
function editHighlightsHTML(){
  return (PROFILE.highlights||[]).map(function(h,i){
    return '<div class="kil-hl" data-i="'+i+'"><img src="'+(h.img||'')+'" data-fb="dim" data-fb-op=".12"><input class="hl-label" type="text" value="'+esc(h.label||'')+'" placeholder="Label"><input class="hl-file" type="file" accept="image/*"><button type="button" class="hl-del" data-click="pfRemoveParent" data-a="[&quot;$el&quot;]">✕</button></div>';
  }).join('');
}
var PRESET_BADGES=['Member','Founder','Verified','Artist','DJ','Producer','Promoter','Host','Resident','VIP','Vendor','Photographer','Crew','Team'];
function openEditProfile(){
  if(!CAN_EDIT()){ toast('Only the profile owner can edit.'); return; }
  closeModal();
  var s=PROFILE.socials||{};
  var html=''+
  '<div class="kil-modal kil-wide"><div class="kil-mh">Edit Profile<button class="kil-mx" data-click="closeModal">&times;</button></div>'+
  '<div class="kil-mb">'+
    '<div class="kil-sec">Photos</div>'+
    '<div class="kil-photos kil-ph3">'+
      '<label class="kil-mf"><span>Profile · 1:1</span><img class="kil-prev on kil-ar11" id="epAvatarPrev" alt="" src="'+esc(PROFILE.avatar||'')+'"><input type="file" accept="image/*" id="epAvatarFile"><input type="text" id="epAvatarUrl" placeholder="…or URL"></label>'+
      '<label class="kil-mf"><span>Mobile BG · 9:16</span><img class="kil-prev on kil-ar916" id="epCoverMPrev" alt="" src="'+esc(PROFILE.cover_mobile||'')+'"><input type="file" accept="image/*" id="epCoverMFile"><input type="text" id="epCoverMUrl" placeholder="…or URL"></label>'+
      '<label class="kil-mf"><span>Desktop BG · 16:9</span><img class="kil-prev on kil-ar169" id="epCoverPrev" alt="" src="'+esc(PROFILE.cover||'')+'"><input type="file" accept="image/*" id="epCoverFile"><input type="text" id="epCoverUrl" placeholder="…or URL"></label>'+
    '</div>'+
    '<div class="kil-sec">Profile</div>'+
    '<label class="kil-mf"><span>Display name</span><input type="text" id="epName" value="'+esc(PROFILE.name)+'"></label>'+
    '<div class="kil-row2"><label class="kil-mf"><span>@ Handle</span><input type="text" id="epHandle" value="'+esc(PROFILE.handle)+'"></label>'+
    '<label class="kil-mf"><span>Location</span><input type="text" id="epLoc" value="'+esc(PROFILE.location||'')+'"></label></div>'+
    '<label class="kil-mf"><span>About me</span><textarea id="epBio" rows="3">'+esc(PROFILE.bio||'')+'</textarea></label>'+
    '<label class="kil-mf"><span>About section (shown in the header)</span><textarea id="epAbout" rows="2">'+esc(PROFILE.about||'')+'</textarea></label>'+
    '<label class="kil-mf"><span>Account type</span><select id="epAcct"><option value="">—</option><option value="user">User</option><option value="artist">Artist</option><option value="brand">Brand</option><option value="organizer">Organizer</option></select></label>'+
    '<div class="kil-sec">Profile links (up to 5)</div>'+
    '<label class="kil-mf"><span>Links dropdown title (what the button says)</span><input type="text" id="epLinksLabel" value="'+esc(PROFILE.links_label||'')+'" placeholder="Links" maxlength="24"></label>'+
    [1,2,3,4,5].map(function(i){return '<label class="kil-mf"><span>Link '+i+'</span><input type="text" id="epL'+i+'" value="'+esc((PROFILE.links||[])[i-1]||'')+'" placeholder="https://…"></label>';}).join('')+
    '<div class="kil-sec">Links</div>'+
    '<div class="kil-row2"><label class="kil-mf"><span>Instagram</span><input type="text" id="epIG" value="'+esc(s.instagram||'')+'"></label>'+
    '<label class="kil-mf"><span>SoundCloud</span><input type="text" id="epSC" value="'+esc(s.soundcloud||'')+'"></label></div>'+
    '<div class="kil-row2"><label class="kil-mf"><span>TikTok</span><input type="text" id="epTT" value="'+esc(s.tiktok||'')+'"></label>'+
    '<label class="kil-mf"><span>Website</span><input type="text" id="epWeb" value="'+esc(s.website||'')+'"></label></div>'+
    '<div class="kil-sec">Categories — pick what you are</div>'+
    '<div class="kil-cats" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px">'+
      '<label style="display:inline-flex;align-items:center;gap:6px"><input type="checkbox" class="epCat" value="artist" data-change="toggleCat"> Artist</label>'+
      '<label style="display:inline-flex;align-items:center;gap:6px"><input type="checkbox" class="epCat" value="brand" data-change="toggleCat"> Brand</label>'+
      '<label style="display:inline-flex;align-items:center;gap:6px"><input type="checkbox" class="epCat" value="organizer" data-change="toggleCat"> Organizer</label>'+
      '<label style="display:inline-flex;align-items:center;gap:6px"><input type="checkbox" class="epCat" value="venue" data-change="toggleCat"> Venue</label>'+
    '</div>'+
    '<div class="kil-catbox" data-cat="artist" style="display:none">'+
      '<div class="kil-row2"><label class="kil-mf"><span>Genres</span><input type="text" id="epArtGenre" placeholder="House · Techno · Bass"></label>'+
      '<label class="kil-mf"><span>Artist type</span><input type="text" id="epArtType" placeholder="DJ / Producer / Live"></label></div>'+
      '<div class="kil-row2"><label class="kil-mf"><span>Spotify</span><input type="text" id="epArtSpot" placeholder="https://open.spotify.com/…"></label>'+
      '<label class="kil-mf"><span>Latest release</span><input type="text" id="epArtRel" placeholder="link"></label></div>'+
    '</div>'+
    '<div class="kil-catbox" data-cat="brand" style="display:none">'+
      '<div class="kil-row2"><label class="kil-mf"><span>Brand type</span><input type="text" id="epBrType" placeholder="Apparel / Gear / Media / Label"></label>'+
      '<label class="kil-mf"><span>Shop / website</span><input type="text" id="epBrShop" placeholder="https://…"></label></div>'+
      '<div class="kil-row2"><label class="kil-mf"><span>What you make</span><input type="text" id="epBrDesc" placeholder="1–2 lines"></label>'+
      '<label class="kil-mf"><span>Discount code (optional)</span><input type="text" id="epBrCode" placeholder="KEEPITIL10"></label></div>'+
    '</div>'+
    '<div class="kil-catbox" data-cat="organizer" style="display:none">'+
      '<div class="kil-row2"><label class="kil-mf"><span>Organizer type</span><input type="text" id="epOrgType" placeholder="Promoter / Production / Collective"></label>'+
      '<label class="kil-mf"><span>Ticketing link</span><input type="text" id="epOrgTix" placeholder="Posh / other"></label></div>'+
      '<label class="kil-mf"><span>Event types</span><input type="text" id="epOrgEvents" placeholder="Warehouse · desert · club nights…"></label>'+
    '</div>'+
    '<div class="kil-catbox" data-cat="venue" style="display:none">'+
      '<div class="kil-row2"><label class="kil-mf"><span>Venue type</span><input type="text" id="epVenType" placeholder="Nightclub / Warehouse / Theater"></label>'+
      '<label class="kil-mf"><span>Capacity</span><input type="text" id="epVenCap" placeholder="e.g. 500"></label></div>'+
      '<div class="kil-row2"><label class="kil-mf"><span>Address</span><input type="text" id="epVenAddr" placeholder="street · city"></label>'+
      '<label class="kil-mf"><span>Age policy</span><input type="text" id="epVenAge" placeholder="18+ / 21+ / All ages"></label></div>'+
      '<label class="kil-mf"><span>Events / calendar link</span><input type="text" id="epVenCal" placeholder="https://…"></label>'+
    '</div>'+
    '<div class="kil-sec">Account &amp; login</div>'+
    '<label class="kil-mf"><span>Login email</span><input type="text" id="epEmail" value="'+esc((SESSION&&SESSION.user&&SESSION.user.email)||'')+'"></label>'+
    '<div class="kil-row2"><label class="kil-mf"><span>New password</span><input type="password" id="epPass" placeholder="leave blank to keep"></label>'+
    '<label class="kil-mf"><span>Confirm password</span><input type="password" id="epPass2" placeholder="repeat new password"></label></div>'+
    '<div class="kil-note">Account name = your @handle above. Email/password changes are applied to your login when you Save.</div>'+
  '</div>'+
  '<div class="kil-mfoot"><button class="kil-mcancel" data-click="closeModal">Cancel</button><button class="kil-msave" id="epSave">Save changes</button></div></div>';
  var ov=document.createElement('div');ov.className='kil-modal-ov';ov.id='kilModal';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-label','Dialog');ov.innerHTML=html;document.body.appendChild(ov);
  ov.addEventListener('click',function(e){if(e.target===ov)closeModal();});
  function bindPrev(fileId,prevId){var f=document.getElementById(fileId);if(!f)return;f.addEventListener('change',function(){var file=f.files&&f.files[0];if(!file)return;var rd=new FileReader();rd.onload=function(){var p=document.getElementById(prevId);if(p)p.src=rd.result;};rd.readAsDataURL(file);});}
  bindPrev('epAvatarFile','epAvatarPrev'); bindPrev('epCoverFile','epCoverPrev'); bindPrev('epCoverMFile','epCoverMPrev');
  document.getElementById('epSave').onclick=saveEditProfile;
  // prefill categories + per-category details
  var cats=(PROFILE.categories||[]), det=(PROFILE.cat_details||{});
  document.querySelectorAll('.epCat').forEach(function(c){ c.checked=cats.indexOf(c.value)>-1; });
  var _pb=Array.isArray(PROFILE.badges)?PROFILE.badges:null; document.querySelectorAll('.epBadge').forEach(function(c){ c.checked=_pb?(_pb.indexOf(c.value)>-1):(c.value==='Member'); });
  function sv(id,val){var e=document.getElementById(id); if(e&&val) e.value=val;}
  var a=det.artist||{},b=det.brand||{},o=det.organizer||{},v=det.venue||{};
  sv('epArtGenre',a.genre);sv('epArtType',a.type);sv('epArtSpot',a.spotify);sv('epArtRel',a.release);
  sv('epBrType',b.type);sv('epBrShop',b.shop);sv('epBrDesc',b.desc);sv('epBrCode',b.code);
  sv('epOrgType',o.type);sv('epOrgTix',o.tix);sv('epOrgEvents',o.events);
  sv('epVenType',v.type);sv('epVenCap',v.capacity);sv('epVenAddr',v.address);sv('epVenAge',v.age);sv('epVenCal',v.calendar);
  toggleCat();
}
function toggleCat(){ document.querySelectorAll('.kil-catbox').forEach(function(box){ var on=document.querySelector('.epCat[value="'+box.getAttribute('data-cat')+'"]'); box.style.display=(on&&on.checked)?'block':'none'; }); }
function gatherCategories(){
  var g=function(id){var e=document.getElementById(id);return e?e.value.trim():'';};
  var cats=[].slice.call(document.querySelectorAll('.epCat:checked')).map(function(c){return c.value;});
  var det={ artist:{genre:g('epArtGenre'),type:g('epArtType'),spotify:g('epArtSpot'),release:g('epArtRel')},
    brand:{type:g('epBrType'),shop:g('epBrShop'),desc:g('epBrDesc'),code:g('epBrCode')},
    organizer:{type:g('epOrgType'),tix:g('epOrgTix'),events:g('epOrgEvents')},
    venue:{type:g('epVenType'),capacity:g('epVenCap'),address:g('epVenAddr'),age:g('epVenAge'),calendar:g('epVenCal')} };
  return {categories:cats,details:det};
}
function saveCategories(){
  if(!SB||!SESSION) return;
  var cd=gatherCategories();
  PROFILE.categories=cd.categories; PROFILE.cat_details=cd.details;
  // proven pattern: profile_content row (delete old of this kind, then insert)
  SB.from('profile_content').delete().eq('profile_slug',PROFILE_SLUG).eq('kind','profile_categories').then(function(){
    SB.from('profile_content').insert({profile_slug:PROFILE_SLUG,kind:'profile_categories',data:cd,created_by:SESSION.user.id});
  }).catch(function(){});
}
function saveEditProfile(){
  var g=function(id){var e=document.getElementById(id);return e?e.value.trim():'';};
  var btn=document.getElementById('epSave'); if(btn){btn.disabled=true;btn.textContent='Saving…';}
  // gather highlights
  var hlNodes=[].slice.call(document.querySelectorAll('#epHls .kil-hl'));
  var avatarFile=(document.getElementById('epAvatarFile')||{}).files; avatarFile=avatarFile&&avatarFile[0];
  var coverFile=(document.getElementById('epCoverFile')||{}).files; coverFile=coverFile&&coverFile[0];
  var coverMFile=(document.getElementById('epCoverMFile')||{}).files; coverMFile=coverMFile&&coverMFile[0];
  uploadImage(avatarFile,function(avUrl){
   uploadImage(coverMFile,function(cvmUrl){
    uploadImage(coverFile,function(cvUrl){
      var hlDone=[], pending=hlNodes.length;
      function finalize(){
        var _links=[1,2,3,4,5].map(function(i){return g('epL'+i);}).filter(function(u){return u&&/^https?:\/\//.test(u);}).slice(0,5);
        var _badges=[].slice.call(document.querySelectorAll('.epBadge:checked')).map(function(c){return c.value;});
        /* pronouns/tagline/booking-email fields were removed from Edit Profile (dup) — preserve existing values (Founder 2026-07-29) */
        var meta={ slug:PROFILE_SLUG, display_name:g('epName'), handle:g('epHandle').replace(/^@/,''), location:g('epLoc'), bio:g('epBio'),
          tagline:(document.getElementById('epTag')?g('epTag'):(PROFILE.tagline||null)), pronouns:(document.getElementById('epPro')?g('epPro'):(PROFILE.pronouns||null)), book_email:(document.getElementById('epBook')?g('epBook'):(PROFILE.book_email||null)),
          about:g('epAbout')||null, links:_links.length?_links:null, links_label:g('epLinksLabel')||null, badges:_badges.length?_badges:null, account_type:(document.getElementById('epAcct')||{}).value||null,
          avatar_url: avUrl || g('epAvatarUrl') || PROFILE.avatar,
          cover_url: cvUrl || g('epCoverUrl') || PROFILE.cover,
          cover_mobile_url: cvmUrl || g('epCoverMUrl') || PROFILE.cover_mobile || null,
          socials:{ instagram:g('epIG'), soundcloud:g('epSC'), tiktok:g('epTT'), website:g('epWeb') },
          highlights: hlDone, updated_at:new Date().toISOString() };
        if(!SB||!SESSION){ Object.assign(PROFILE,{name:meta.display_name,handle:meta.handle,location:meta.location,bio:meta.bio,tagline:meta.tagline,pronouns:meta.pronouns,book_email:meta.book_email,avatar:meta.avatar_url,cover:meta.cover_url,cover_mobile:meta.cover_mobile_url,socials:meta.socials,highlights:meta.highlights}); applyProfile(); closeModal(); toast('Saved locally — sign in as owner to publish.'); return; }
        SB.from('profile_meta').upsert(meta).then(function(r){
          if(r&&r.error){ toast('Could not save profile: '+(r.error.message||'')); if(btn){btn.disabled=false;btn.textContent='Save changes';} return; }
          Object.assign(PROFILE,{name:meta.display_name,handle:meta.handle,location:meta.location,bio:meta.bio,tagline:meta.tagline,pronouns:meta.pronouns,book_email:meta.book_email,avatar:meta.avatar_url,cover:meta.cover_url,cover_mobile:meta.cover_mobile_url,socials:meta.socials,highlights:meta.highlights});
          applyProfile();
          saveCategories();
          // account email/password
          var email=g('epEmail'), pass=g('epPass'), pass2=g('epPass2'), upd={};
          if(email && SESSION.user && email!==SESSION.user.email) upd.email=email;
          if(pass){ if(pass!==pass2){ toast('Profile saved. Passwords did not match — password unchanged.'); closeModal(); return; } upd.password=pass; }
          if(Object.keys(upd).length){ SB.auth.updateUser(upd).then(function(a){ closeModal(); toast(a&&a.error?('Profile saved. Account: '+a.error.message):'Profile + account updated.'+(upd.email?' Check your email to confirm the new address.':'')); }).catch(function(){ closeModal(); toast('Profile saved. Account update failed.'); }); }
          else { closeModal(); toast('Profile updated.'); }
        }).catch(function(){ if(btn){btn.disabled=false;btn.textContent='Save changes';} toast('Could not save profile.'); });
      }
      if(!pending){ finalize(); return; }
      hlNodes.forEach(function(node){
        var label=(node.querySelector('.hl-label')||{}).value||''; var existing=(node.querySelector('img')||{}).src||''; var fileEl=node.querySelector('.hl-file'); var file=fileEl&&fileEl.files&&fileEl.files[0];
        uploadImage(file,function(u){ var img=u|| (existing.indexOf('data:')===0?existing:existing) ; if(label||img)hlDone.push({label:label,img:img}); pending--; if(pending===0)finalize(); });
      });
    });
   });
  });
}
function slugify(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)||('group-'+Date.now());}

/* generic modal: fields=[{name,label,type,ph,req,val}], returns values via cb */
function openModal(title,fields,cb){
  closeModal();
  var ov=document.createElement('div');ov.className='kil-modal-ov';ov.id='kilModal';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-label','Dialog');
  var rows=fields.map(function(f){
    var id='mf_'+f.name;
    if(f.type==='textarea') return '<label class="kil-mf"><span>'+esc(f.label)+'</span><textarea id="'+id+'" rows="4" placeholder="'+esc(f.ph||'')+'">'+esc(f.val||'')+'</textarea></label>';
    if(f.type==='file') return '<label class="kil-mf"><span>'+esc(f.label)+'</span><input type="file" accept="image/*" id="'+id+'" data-target="'+esc(f.target||'')+'"><img class="kil-prev" id="'+id+'_prev" alt=""></label>';
    return '<label class="kil-mf"><span>'+esc(f.label)+'</span><input type="text" id="'+id+'" placeholder="'+esc(f.ph||'')+'" value="'+esc(f.val||'')+'"></label>';
  }).join('');
  ov.innerHTML='<div class="kil-modal"><div class="kil-mh">'+esc(title)+'<button class="kil-mx" data-click="closeModal">&times;</button></div><div class="kil-mb">'+rows+'</div><div class="kil-mfoot"><button class="kil-mcancel" data-click="closeModal">Cancel</button><button class="kil-msave" id="kilSave">Publish</button></div></div>';
  document.body.appendChild(ov);
  ov.addEventListener('click',function(e){if(e.target===ov)closeModal();});
  fields.forEach(function(f){ if(f.type==='file'){ var inp=document.getElementById('mf_'+f.name); inp.addEventListener('change',function(){ var file=inp.files&&inp.files[0]; if(!file)return; var rd=new FileReader(); rd.onload=function(){ inp.dataset.dataurl=rd.result; var pv=document.getElementById('mf_'+f.name+'_prev'); if(pv){pv.src=rd.result;pv.style.display='block';} }; rd.readAsDataURL(file); }); } });
  document.getElementById('kilSave').onclick=function(){
    var vals={};
    fields.forEach(function(f){ var el=document.getElementById('mf_'+f.name); if(f.type==='file'){ vals[f.name]=el.dataset.dataurl||''; vals[f.name+'_file']=(el.files&&el.files[0])||null; } else { vals[f.name]=el.value.trim(); } });
    var missing=fields.filter(function(f){return f.req && !vals[f.name];});
    if(missing.length){ alert('Please fill: '+missing.map(function(f){return f.label;}).join(', ')); return; }
    closeModal(); cb(vals);
  };
  setTimeout(function(){var first=ov.querySelector('input,textarea');if(first)first.focus();},30);
}
function closeModal(){var m=document.getElementById('kilModal');if(m)m.remove();}

/* CREATE EVENT — ONE gold standard (Founder 2026-07-17): every entry point routes to the
   canonical Posh-parity form. The old external/internal chooser modal is PURGED. */
function createEvent(){ location.href='/submit-event'; }

/* ── INSTAGRAM / TIKTOK-STYLE CREATE POST — media first, then details ── */
var CP={target:'feed',media:'',mtype:'',file:null,items:[],cover:null,coverUrl:'',tags:[],collab:[]};
function openCreatePost(target){
  if(!CAN_EDIT()){ if(IS_OWNER&&SB&&!SESSION){toast('Sign in as the profile owner to post.');} else if(IS_OWNER&&SESSION&&!OWNS){toast('Only this profile’s owner can post.');} else {toast('Only KEEPITIL users can post — on their own profile.');} return; }
  CP={target:target||'feed',media:'',mtype:'',file:null,tags:[],collab:[]};
  closeModal();
  var ov=document.createElement('div');ov.className='kil-modal-ov';ov.id='kilModal';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-label','Dialog');
  ov.innerHTML='<div class="kil-modal"><div class="kil-mh">New post<button class="kil-mx" data-click="closeModal">&times;</button></div>'
    +'<div class="kil-mb">'
    +'<div class="cp-drop" id="cpDrop" data-click="pfClickId" data-a="[&quot;cpFile&quot;]"><div class="cp-plus">＋</div><div class="cp-hint">Tap to add photos or video<br><small>Required — media comes first · pick several for a carousel</small></div></div>'
    +'<input type="file" id="cpFile" accept="image/*,video/*" multiple style="display:none">'
    +'<input type="file" id="cpCam" accept="image/*" capture="environment" style="display:none">'
    +'<input type="file" id="cpRec" accept="video/*" capture="environment" style="display:none">'
    +'<div style="display:flex;gap:8px;margin:8px 0"><button type="button" class="kil-mcancel" style="flex:1" data-click="pfClickId" data-a="[&quot;cpFile&quot;]">🖼 Library</button><button type="button" class="kil-mcancel" style="flex:1" data-click="pfClickId" data-a="[&quot;cpCam&quot;]">📷 Camera</button><button type="button" class="kil-mcancel" style="flex:1" data-click="pfClickId" data-a="[&quot;cpRec&quot;]">🎥 Record</button></div>'
    +'<div id="cpThumbs" style="display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 8px"></div>'
    +'<div id="cpCoverWrap" style="display:none;margin:4px 0 8px"><label class="kil-mf"><span>Video cover photo (optional — shows instead of a black first frame)</span><input type="file" id="cpCoverFile" accept="image/*"></label><img id="cpCoverPrev" style="display:none;width:90px;height:90px;object-fit:cover;border-radius:9px;border:1px solid var(--line)"></div>'
    +'<div class="cp-orurl"><input type="text" id="cpUrl" placeholder="…or paste an image / video URL (adds one)"><button type="button" class="kil-mcancel" data-click="cpUseUrl">Add</button></div>' 
    +'<label class="kil-mf"><span>Description</span><textarea id="cpDesc" rows="3" placeholder="Write a caption… length can vary" data-input="cpCount"></textarea></label>'
    +'<div class="cp-count" id="cpCount">0 characters</div>'
    +'<label class="kil-mf"><span>Title</span><input type="text" id="cpTitle" placeholder="Give this post a title"></label>'
    +'<label class="kil-mf"><span>Tag people</span><input type="text" id="cpTagIn" placeholder="@handle, then Enter" data-keydown="cpChipKey" data-a="[&quot;$e&quot;,&quot;tag&quot;]"></label>'
    +'<div class="cp-chips" id="cpTagChips"></div><div class="cp-cap" id="cpTagCap">0/10 tagged</div>'
    +'<label class="kil-mf"><span>Collab — shared to their profile too</span><input type="text" id="cpColIn" placeholder="@handle, then Enter" data-keydown="cpChipKey" data-a="[&quot;$e&quot;,&quot;col&quot;]"></label>'
    +'<div class="cp-chips" id="cpColChips"></div><div class="cp-cap" id="cpColCap">0/5 collaborators</div>'
    +'<label class="kil-mf"><span>Location</span><input type="text" id="cpLoc" placeholder="Add location"></label>'
    +'<label class="kil-mf"><span>Alt text (accessibility)</span><input type="text" id="cpAlt" placeholder="Describe the photo or video"></label>'
    +'<div class="cp-toggles"><label class="cp-tog"><span>Hide from feed <small style="color:var(--muted)">— show only in Gallery</small></span><input type="checkbox" id="cpHideFeed"></label>'
    +'<label class="cp-tog"><span>Hide like counts on this post</span><input type="checkbox" id="cpHideLikes"></label>'
    +'</div>'
    +'</div><div class="kil-mfoot"><button class="kil-mcancel" data-click="closeModal">Cancel</button><button class="kil-msave" data-click="cpSubmit">Share</button></div></div>';
  document.body.appendChild(ov);
  ov.addEventListener('click',function(e){if(e.target===ov)closeModal();});
  ['cpFile','cpCam','cpRec'].forEach(function(id){
    document.getElementById(id).addEventListener('change',function(){
      var fs=[].slice.call(this.files||[]); this.value='';
      fs.forEach(function(f){
        if(CP.items.length>=10){ toast('Up to 10 media per post.'); return; }
        var it={file:f,media:'',mtype:(f.type.indexOf('video')===0)?'video':'image'};
        CP.items.push(it);
        var rd=new FileReader(); rd.onload=function(){ it.media=rd.result; cpPreview(); }; rd.readAsDataURL(f);
      });
      cpPreview();
    });
  });
  document.getElementById('cpCoverFile').addEventListener('change',function(){
    var f=this.files&&this.files[0]; if(!f)return;
    CP.cover=f;
    var rd=new FileReader(); rd.onload=function(){ CP.coverUrl=rd.result; var pv=document.getElementById('cpCoverPrev'); if(pv){pv.src=rd.result;pv.style.display='block';} }; rd.readAsDataURL(f);
  });
}
function cpUseUrl(){
  var u=(document.getElementById('cpUrl').value||'').trim(); if(!u)return;
  if(CP.items.length>=10){ toast('Up to 10 media per post.'); return; }
  CP.items.push({file:null,media:u,mtype:/\.(mp4|webm|mov|m4v)(\?|$)/i.test(u)?'video':'image'});
  document.getElementById('cpUrl').value=''; cpPreview();
}
function cpRemoveItem(i){ CP.items.splice(i,1); cpPreview(); }
function cpMoveItem(i,dir){ var j=i+dir; if(j<0||j>=CP.items.length)return; var x=CP.items[i]; CP.items[i]=CP.items[j]; CP.items[j]=x; cpPreview(); }
function cpPreview(){
  var first=CP.items[0]||null;
  CP.media=first?first.media:''; CP.mtype=first?first.mtype:''; CP.file=first?first.file:null;
  var d=document.getElementById('cpDrop'); if(!d)return;
  if(!first){ d.classList.remove('has'); d.innerHTML='<div class="cp-plus">＋</div><div class="cp-hint">Tap to add photos or video<br><small>Required — media comes first</small></div>'; }
  else{
    d.classList.add('has');
    d.innerHTML=(first.mtype==='video')
      ? '<video class="cp-media" src="'+esc(first.media)+'" muted loop playsinline autoplay></video>'
      : '<img class="cp-media" src="'+esc(first.media)+'" alt="">';
  }
  var th=document.getElementById('cpThumbs');
  if(th) th.innerHTML=CP.items.map(function(it,i){
    var tb=(it.mtype==='video')?'<video src="'+esc(it.media)+'" muted style="width:64px;height:64px;object-fit:cover;border-radius:8px;display:block"></video>'
                               :'<img src="'+esc(it.media)+'" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:8px;display:block">';
    return '<span style="position:relative;display:inline-block">'+tb
      +'<button type="button" data-click="cpRemoveItem" data-a="'+esc(JSON.stringify([i]))+'" style="position:absolute;top:-6px;right:-6px;background:#ff6b6b;color:#fff;border:0;border-radius:50%;width:18px;height:18px;font-size:.7rem;cursor:pointer;line-height:1">✕</button>'
      +(i>0?'<button type="button" data-click="cpMoveItem" data-a="'+esc(JSON.stringify([i,-1]))+'" style="position:absolute;bottom:-6px;left:-6px;background:#15151f;color:#fff;border:1px solid var(--line);border-radius:50%;width:18px;height:18px;font-size:.7rem;cursor:pointer;line-height:1">◀</button>':'')
      +(i<CP.items.length-1?'<button type="button" data-click="cpMoveItem" data-a="'+esc(JSON.stringify([i,1]))+'" style="position:absolute;bottom:-6px;right:-6px;background:#15151f;color:#fff;border:1px solid var(--line);border-radius:50%;width:18px;height:18px;font-size:.7rem;cursor:pointer;line-height:1">▶</button>':'')
      +'</span>';
  }).join('');
  var cw=document.getElementById('cpCoverWrap');
  if(cw) cw.style.display=CP.items.some(function(it){return it.mtype==='video';})?'block':'none';
}
function cpCount(){var t=document.getElementById('cpDesc'),c=document.getElementById('cpCount');if(t&&c)c.textContent=t.value.length+' characters';}
function cpChipKey(e,which){
  if(e.key!=='Enter'&&e.keyCode!==13)return; e.preventDefault();
  var inp=e.target, val=(inp.value||'').replace(/^@+/,'').trim(); if(!val)return;
  var arr=(which==='tag')?CP.tags:CP.collab, cap=(which==='tag')?10:5;
  if(arr.length>=cap){ toast((which==='tag'?'Up to 10 tags':'Up to 5 collaborators')+' allowed.'); return; }
  if(arr.indexOf(val)===-1)arr.push(val);
  inp.value=''; cpRenderChips(which);
}
function cpRemoveChip(which,i){ (which==='tag'?CP.tags:CP.collab).splice(i,1); cpRenderChips(which); }
function cpRenderChips(which){
  var arr=(which==='tag')?CP.tags:CP.collab;
  var wrap=document.getElementById(which==='tag'?'cpTagChips':'cpColChips');
  var cap=document.getElementById(which==='tag'?'cpTagCap':'cpColCap');
  if(wrap)wrap.innerHTML=arr.map(function(h,i){return '<span class="cp-chip"><b>@'+esc(h)+'</b><span class="x" data-click="cpRemoveChip" data-a="'+esc(JSON.stringify([which,i]))+'">×</span></span>';}).join('');
  if(cap)cap.textContent=arr.length+'/'+(which==='tag'?10:5)+(which==='tag'?' tagged':' collaborators');
}
function cpBuildHtml(title,desc,media,mtype,tags,collab,loc){
  if(!window.KilSafeHtml) return '';
  return KilSafeHtml.buildBody({t:title,desc:desc,img:media,mtype:mtype,tags:tags,collab:collab,location:loc});
}
function cpResolveMedia(cb){
  var items=CP.items.slice(); var out=[];
  function next(i){
    if(i>=items.length){
      if(CP.cover){ uploadImage(CP.cover,function(cv){ cb(out, cv||CP.coverUrl||''); }); }
      else cb(out, CP.coverUrl||'');
      return;
    }
    var it=items[i];
    if(it.file){ uploadImage(it.file,function(pub){ out.push({src:pub||it.media||'',mtype:it.mtype}); next(i+1); }); }
    else { out.push({src:it.media||'',mtype:it.mtype}); next(i+1); }
  }
  next(0);
}
function cpSubmit(){
  if(!CP.media){ alert('Add a photo or video first — media comes first.'); return; }
  var title=(document.getElementById('cpTitle').value||'').trim()||'New post';
  var desc=(document.getElementById('cpDesc').value||'').trim();
  var loc=(document.getElementById('cpLoc').value||'').trim();
  var alt=(document.getElementById('cpAlt').value||'').trim();
  var hideLikes=document.getElementById('cpHideLikes').checked;
  var hideFeed=document.getElementById('cpHideFeed').checked;
  var tags=CP.tags.slice(), collab=CP.collab.slice(), mtype=CP.mtype||'image', target=CP.target;
  closeModal();
  cpResolveMedia(function(mediaArr,coverUrl){
    if(!mediaArr.length||!mediaArr[0].src){ toast('Could not attach media.'); return; }
    var media=mediaArr[0].src; mtype=mediaArr[0].mtype;
    if(target==='gallery'){
      publish('photo',{src:media,label:title,views:'New',mtype:mtype,media:mediaArr,cover:coverUrl||null,tags:tags,collab:collab,alt:alt,hideFeed:hideFeed});
      showTab(hideFeed?'gallery':'gallery');
    } else {
      var d=(mtype==='video'?'Video':'Post')+' · '+new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'});
      publish('article',{t:title,d:d,desc:desc,img:media,html:cpBuildHtml(title,desc,media,mtype,tags,collab,loc),mtype:mtype,media:mediaArr,cover:coverUrl||null,tags:tags,collab:collab,location:loc,alt:alt,hideLikes:hideLikes,hideFeed:hideFeed});
      showTab(hideFeed?'gallery':'article');
    }
    if(collab.length){
      // Collab invites — recipient must ACCEPT before it shows on their profile. Payload lets it render without a join.
      // Feature-detected: needs post_collaborators table (see _sql/ACTIVATE-collab-posts.sql). Silent if absent.
      if(SB&&SESSION){ try{
        var payload={t:title,d:'Collab · @'+PROFILE_SLUG,desc:desc,img:media,html:cpBuildHtml(title,desc,media,mtype,tags,collab,loc),mtype:mtype,tags:tags,collab:collab,location:loc};
        SB.from('post_collaborators').insert(collab.map(function(hh){return {source_slug:PROFILE_SLUG,collaborator_slug:hh,title:title,payload:payload,status:'pending',created_by:SESSION.user.id};})).then(function(){}).catch(function(){});
      }catch(e){} }
      toast('Posted. Collab request sent to '+collab.map(function(h){return '@'+h;}).join(', ')+' — they must accept it.');
    }
  });
}

function addContent(kind){
  if(!CAN_EDIT()){ if(IS_OWNER&&SB&&!SESSION){toast('Sign in as the profile owner to add content.');} else if(IS_OWNER&&SESSION&&!OWNS){toast('Only this profile’s owner can add content.');} return; }
  if(!kind||kind==='menu'){ addContent('post'); return; }
  if(kind==='post'){
    openModal('New Post',[
      {name:'title',label:'Title',type:'text',ph:'e.g. New Warehouse EP',req:true},
      {name:'meta',label:'Label / date',type:'text',ph:'Post · Jul',val:'Post · Jul'},
      {name:'body',label:'Body',type:'textarea',ph:'Write your update...',req:true},
      {name:'imgurl',label:'Cover image URL (optional)',type:'text',ph:'https://...'},
      {name:'imgfile',label:'…or upload a cover',type:'file'}
    ],function(v){
      resolveImg(v,'imgfile','imgurl','https://images.ra.co/06c4bb3109109df1dad229582219f4ded15b11d4.jpg',function(img){
        publish('article',{t:v.title,d:v.meta||'Post',desc:v.body,img:img,html:cpBuildHtml(v.title,v.body,img,'image',[],[],''),mtype:'image'});
        showTab('article');
      });
    });
    return;
  }
  if(kind==='photo'){
    openModal('Add Photo',[
      {name:'label',label:'Caption',type:'text',ph:'e.g. Avalon Hollywood',req:true},
      {name:'views',label:'Views/likes label',type:'text',ph:'0',val:'New'},
      {name:'imgurl',label:'Image URL',type:'text',ph:'https://...'},
      {name:'imgfile',label:'…or upload from device',type:'file'}
    ],function(v){
      resolveImg(v,'imgfile','imgurl','',function(src){
        if(!src){alert('Add an image URL or upload a file.');return;}
        publish('photo',{src:src,label:v.label,views:v.views||'New'});showTab('gallery');
      });
    });
    return;
  }
  if(kind==='event'){
    openModal('Create Event',[
      {name:'month',label:'Month',type:'text',ph:'AUG',req:true},
      {name:'day',label:'Day',type:'text',ph:'16',req:true},
      {name:'dow',label:'Weekday',type:'text',ph:'SAT'},
      {name:'title',label:'Event title',type:'text',ph:'KEEPITIL Summer',req:true},
      {name:'venue',label:'Venue · city · age',type:'text',ph:'Venue · Orange County, CA · 21+',req:true},
      {name:'tags',label:'Genre tags',type:'text',ph:'Latin House · Techno'},
      {name:'tix',label:'Ticket link',type:'text',ph:'https://posh.vip/e/...'}
    ],function(v){
      publish('show',{month:v.month.toUpperCase(),day:v.day,dow:(v.dow||'').toUpperCase(),title:v.title,venue:v.venue,tags:v.tags||'',tix:v.tix||'#'});
      showTab('shows');
    });
    return;
  }
  if(kind==='chat group'){ openNewChat(); return; }
}

/* ── INSTAGRAM-STYLE NEW CHAT (search subscribers → group details + moderation) ── */
var NC_SEL={}, NC_NAMES={}, NC_STATE={post:'everyone',subsOnly:false,approval:false};
function ncCSS(){ if(document.getElementById('nc-css'))return; var s=document.createElement('style'); s.id='nc-css'; s.textContent=
 '.nc-ov{position:fixed;inset:0;z-index:5000;background:rgba(4,4,10,.72);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px}'+
 '.nc{background:#16161f;border:1px solid rgba(255,255,255,.12);border-radius:16px;width:100%;max-width:440px;max-height:88vh;display:flex;flex-direction:column;overflow:hidden}'+
 '.nc-hd{display:flex;align-items:center;justify-content:center;position:relative;padding:14px;border-bottom:1px solid rgba(255,255,255,.1);font-weight:800;color:#fff}'+
 '.nc-hd .x,.nc-hd .bk{position:absolute;background:none;border:0;color:#fff;font-size:1.5rem;cursor:pointer;line-height:1}'+
 '.nc-hd .x{right:14px}.nc-hd .bk{left:14px}'+
 '.nc-to{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.08)}'+
 '.nc-to .lbl{font-weight:800;font-size:.9rem;color:#fff}'+
 '.nc-chip{display:inline-flex;align-items:center;gap:6px;background:rgba(0,180,255,.16);color:#67d3ff;border:1px solid rgba(0,180,255,.4);border-radius:20px;padding:3px 6px 3px 11px;font-size:.8rem;font-weight:700}'+
 '.nc-chip b{cursor:pointer;font-size:1.05rem;line-height:1}'+
 '.nc-to input{flex:1;min-width:120px;background:transparent;border:0;color:#fff;font:inherit;outline:none;padding:6px 2px}'+
 '.nc-list{flex:1;overflow-y:auto;min-height:160px;max-height:46vh}'+
 '.nc-row{display:flex;align-items:center;gap:12px;padding:9px 14px;cursor:pointer}'+
 '.nc-row:hover{background:rgba(255,255,255,.04)}'+
 '.nc-av{width:44px;height:44px;border-radius:50%;flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;background:linear-gradient(150deg,rgba(0,180,255,.4),#16161f);border:1px solid rgba(255,255,255,.12)}'+
 '.nc-nm{font-weight:700;font-size:.92rem;color:#fff}.nc-hn{font-size:.8rem;color:#9aa7b4}'+
 '.nc-sel{width:22px;height:22px;border-radius:50%;border:2px solid #555;flex:0 0 auto;margin-left:auto;display:flex;align-items:center;justify-content:center}'+
 '.nc-row.on .nc-sel{border-color:#00b4ff;background:#00b4ff}.nc-row.on .nc-sel::after{content:"✓";color:#04121b;font-size:.78rem;font-weight:900}'+
 '.nc-ft{padding:14px;border-top:1px solid rgba(255,255,255,.1)}'+
 '.nc-go{width:100%;background:linear-gradient(90deg,#00b4ff,#22e39b);color:#04121b;border:0;border-radius:10px;padding:13px;font-weight:800;cursor:pointer;font:inherit;font-weight:800}'+
 '.nc-go:disabled{opacity:.4;cursor:default}'+
 '.nc-body{padding:6px 16px 8px;overflow-y:auto}'+
 '.nc-body label{display:block;font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#9aa7b4;margin:16px 0 6px}'+
 '.nc-body input[type=text]{width:100%;background:#0d0d13;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:12px;color:#fff;font:inherit;outline:none}'+
 '.nc-body input[type=text]:focus{border-color:#00b4ff}'+
 '.nc-opt{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 0;border-top:1px solid rgba(255,255,255,.07)}'+
 '.nc-opt .t{font-weight:700;font-size:.9rem;color:#fff}.nc-opt .d{font-size:.78rem;color:#9aa7b4;margin-top:2px}'+
 '.nc-seg{display:flex;gap:6px;flex:0 0 auto}.nc-seg button{background:#0d0d13;border:1px solid rgba(255,255,255,.14);color:#cfd8e0;border-radius:8px;padding:7px 12px;font-weight:700;font-size:.8rem;cursor:pointer}'+
 '.nc-seg button.on{background:rgba(0,180,255,.16);border-color:#00b4ff;color:#67d3ff}'+
 '.nc-sw{width:44px;height:26px;border-radius:20px;background:#33333f;position:relative;cursor:pointer;flex:0 0 auto;transition:background .15s}'+
 '.nc-sw.on{background:#00b4ff}.nc-sw::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:left .15s}.nc-sw.on::after{left:21px}'+
 '.nc-empty{padding:26px 14px;text-align:center;color:#9aa7b4;font-size:.88rem}';
 document.head.appendChild(s); }
function ncInitial(h){ var m=String(h||'').replace(/[^a-z0-9]/gi,''); return (m.charAt(0)||'?').toUpperCase(); }
function ncClose(){ var o=document.getElementById('nc-ov'); if(o) o.remove(); }
function ncRenderChips(){ var box=document.getElementById('nc-chips'); if(!box)return;
  /* F1: handle goes in data-h (escaped), read back by one delegated listener, never interpolated into JS. */
  box.innerHTML=Object.keys(NC_SEL).map(function(h){ return '<span class="nc-chip">'+esc(NC_NAMES[h]||('@'+h))+'<b data-h="'+esc(h)+'">×</b></span>'; }).join('');
  box.onclick=function(e){ var b=e.target&&e.target.closest&&e.target.closest('b[data-h]'); if(b) ncToggle(b.getAttribute('data-h')); };
  var n=Object.keys(NC_SEL).length, nx=document.getElementById('nc-next'); if(nx){ nx.disabled=(n<1); nx.textContent=(n>1?('Next · group of '+n):'Next'); } }
function ncToggle(h){ if(NC_SEL[h]) delete NC_SEL[h]; else NC_SEL[h]=1; ncRenderChips();
  document.querySelectorAll('#nc-list .nc-row').forEach(function(r){ if(r.getAttribute('data-h')===h) r.classList.toggle('on', !!NC_SEL[h]); }); }
function ncSearch(q){ var list=document.getElementById('nc-list'); if(!list)return;
  if(!SB){ list.innerHTML='<div class="nc-empty">Search unavailable.</div>'; return; }
  list.innerHTML='<div class="nc-empty">Searching…</div>';
  SB.rpc('search_members',{q:q}).then(function(r){ var rows=(r&&r.data)||[];
    if(!rows.length){ list.innerHTML='<div class="nc-empty">No members found'+(q?(' for “'+esc(q)+'”'):' yet')+'.</div>'; return; }
    list.innerHTML=rows.map(function(u){ NC_NAMES[u.handle]=u.display_name||u.handle; var on=NC_SEL[u.handle]?' on':'';
      return '<div class="nc-row'+on+'" data-h="'+esc(u.handle)+'"><div class="nc-av">'+ncInitial(u.handle)+'</div><div><div class="nc-nm">'+esc(u.display_name||u.handle)+'</div><div class="nc-hn">@'+esc(u.handle)+'</div></div><div class="nc-sel"></div></div>';
    }).join('');
    list.onclick=function(e){ var row=e.target&&e.target.closest&&e.target.closest('.nc-row'); if(row) ncToggle(row.getAttribute('data-h')); };
  },function(){ list.innerHTML='<div class="nc-empty">Could not search.</div>'; }); }
function ncStep2(){ if(Object.keys(NC_SEL).length<1)return; document.getElementById('nc-s1').style.display='none'; document.getElementById('nc-s2').style.display='block'; document.getElementById('nc-back').style.display='block'; document.getElementById('nc-ttl').textContent=(Object.keys(NC_SEL).length>1?'New group':'Chat details'); var nm=document.getElementById('nc-name'); if(nm) nm.focus(); }
function ncStep1(){ document.getElementById('nc-s2').style.display='none'; document.getElementById('nc-s1').style.display='block'; document.getElementById('nc-back').style.display='none'; document.getElementById('nc-ttl').textContent='New message'; }
function ncCreate(){ var members=Object.keys(NC_SEL); if(!members.length)return;
  var name=(document.getElementById('nc-name').value||'').trim() || (members.length>1?('Group · '+members.length+' people'):('@'+members[0]));
  var topic=(document.getElementById('nc-topic').value||'').trim()||'New chat';
  var slug=slugify(name)+'-'+Date.now().toString(36).slice(-4);
  var settings={post:NC_STATE.post,subsOnly:NC_STATE.subsOnly,approval:NC_STATE.approval};
  publish('chat',{slug:slug,name:name,preview:topic,avatar:'',category:'primary',members:members,settings:settings});
  ncClose(); if(typeof showTab==='function') showTab('chat');
}
function openNewChat(){ ncCSS(); NC_SEL={}; NC_NAMES={}; NC_STATE={post:'everyone',subsOnly:false,approval:false};
  var ov=document.createElement('div'); ov.className='nc-ov'; ov.id='nc-ov';
  ov.innerHTML='<div class="nc" id="nc-box">'
   +'<div class="nc-hd"><button class="bk" id="nc-back" style="display:none">&lsaquo;</button><span id="nc-ttl">New message</span><button class="x" id="nc-x">&times;</button></div>'
   +'<div id="nc-s1"><div class="nc-to"><span class="lbl">To:</span><span id="nc-chips"></span><input id="nc-q" placeholder="Search subscribers…" autocomplete="off"/></div>'
   +'<div class="nc-list" id="nc-list"></div>'
   +'<div class="nc-ft"><button class="nc-go" id="nc-next" disabled>Next</button></div></div>'
   +'<div id="nc-s2" style="display:none"><div class="nc-body">'
   +'<label>Chat name</label><input type="text" id="nc-name" placeholder="OC Techno Heads"/>'
   +'<label>First message / topic <span style="text-transform:none;font-weight:600;color:#8a97a4">(optional)</span></label><input type="text" id="nc-topic" placeholder="Warehouse location?"/>'
   +'<label>Moderation</label>'
   +'<div class="nc-opt"><div class="t">Who can send messages</div><div class="nc-seg" id="nc-post"><button data-v="everyone" class="on">Everyone</button><button data-v="admins">Admins</button></div></div>'
   +'<div class="nc-opt"><div><div class="t">Subscribers only</div><div class="d">Only your subscribers can join</div></div><div class="nc-sw" id="nc-subs"></div></div>'
   +'<div class="nc-opt"><div><div class="t">Approve new members</div><div class="d">You approve each request to join</div></div><div class="nc-sw" id="nc-appr"></div></div>'
   +'</div><div class="nc-ft"><button class="nc-go" id="nc-create">Create chat</button></div></div></div>';
  ov.addEventListener('click',function(e){ if(e.target===ov) ncClose(); });
  document.body.appendChild(ov);
  document.getElementById('nc-x').addEventListener('click',ncClose);
  document.getElementById('nc-next').addEventListener('click',ncStep2);
  document.getElementById('nc-back').addEventListener('click',ncStep1);
  document.getElementById('nc-create').addEventListener('click',ncCreate);
  var q=document.getElementById('nc-q'); q.focus(); var tm=null;
  q.addEventListener('input',function(){ clearTimeout(tm); tm=setTimeout(function(){ ncSearch(q.value.trim()); },220); });
  document.querySelectorAll('#nc-post button').forEach(function(b){ b.addEventListener('click',function(){ document.querySelectorAll('#nc-post button').forEach(function(x){x.classList.remove('on');}); b.classList.add('on'); NC_STATE.post=b.getAttribute('data-v'); }); });
  document.getElementById('nc-subs').addEventListener('click',function(){ this.classList.toggle('on'); NC_STATE.subsOnly=this.classList.contains('on'); });
  document.getElementById('nc-appr').addEventListener('click',function(){ this.classList.toggle('on'); NC_STATE.approval=this.classList.contains('on'); });
  ncSearch('');
}
/* ── ARTICLE CAROUSEL + VIEWER ── */
/* ── ARTICLES COME FROM THE DATABASE (Founder 2026-08-26) ─────────────────────────────────────
   "there will be no blogs. just articles fed into the connect page and culture page for
   articles only."

   This array used to hold a full Groove Trooper feature inline — headline, SoundCloud embed,
   pull quotes, the lot — duplicated in page markup. That content now lives at
   /article/artist/groove-trooper as a real page, so keeping a second copy here would guarantee
   the two drift apart the first time either is edited.

   Articles are loaded from blog_articles filtered by artist_slug, which is the same row the
   Culture feed reads. One record, two surfaces. An artist's profile therefore shows their
   feature automatically the moment the row exists — nothing to wire per artist. */
var GT_ARTICLES=[];

function loadProfileArticles(){
  if(!window.SB || !PROFILE_SLUG) return;
  SB.from('blog_articles')
    .select('slug,title,excerpt,image_url,hero_image,url,published_at')
    .eq('artist_slug', PROFILE_SLUG).eq('status','published').eq('published', true)
    .order('published_at',{ascending:false})
    .then(function(r){
      if(r.error || !r.data || !r.data.length) return;
      /* Newest first, and prepended so a freshly published feature leads the profile. */
      r.data.slice().reverse().forEach(function(a){
        var when=''; try{ var d=new Date(a.published_at); if(!isNaN(d))
          when=d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); }catch(e){}
        GT_ARTICLES.unshift({
          t: a.title,
          d: 'Feature' + (when ? ' \u00b7 ' + when : ''),
          img: a.image_url || a.hero_image || '/assets/images/logo-bg.jpg',
          /* `url` makes openPost() navigate to the real article instead of rendering an inline
             copy — see the branch in openPost. html stays empty on purpose. */
          url: a.url,
          html: ''
        });
      });
      try{ if(typeof renderFeed==='function') renderFeed(); }catch(e){}
      try{ if(typeof renderArticles==='function') renderArticles(); }catch(e){}
    })
    .catch(function(){});
}
try{ loadProfileArticles(); }catch(e){}
/* ── Unified post model (blog / article / image / video) shared by FEED + GALLERY ── */
function postType(a){ if((a.mtype||'')==='video')return 'video'; if(/blog|shared/i.test(a.d||''))return 'blog'; return 'article'; }
/* owner can hide a post from the FEED (still shows in the GALLERY). Stored as an override map keyed by post signature so it works for seed/local/DB posts alike. */
function hideKey(){return 'kil-feedhide-'+(typeof PROFILE_SLUG!=='undefined'?PROFILE_SLUG:'x');}
function loadHides(){try{return JSON.parse(localStorage.getItem(hideKey())||'{}')||{};}catch(e){return{};}}
function postSig(p){return ((p.title||'')+'|'+(p.media||'')).slice(0,140);}
function isHiddenFromFeed(p){ return !!p.hideFeed || !!(loadHides()[postSig(p)]); }
function toggleHideFeed(src,idx){
  var p;
  if(src==='article'){var a=GT_ARTICLES[idx];if(!a)return;p={title:a.t,media:a.img};}
  else {var t=GAL_IMGS[idx];if(!t)return;p={title:t[1],media:galSrc(t[0])};}
  var m=loadHides(), sig=postSig(p), nowHidden;
  if(m[sig]){delete m[sig];nowHidden=false;} else {m[sig]=1;nowHidden=true;}
  try{localStorage.setItem(hideKey(),JSON.stringify(m));}catch(e){}
  closeModal(); renderAll();
  toast(nowHidden?'Hidden from feed — still in your Gallery.':'Shown in feed again.');
}
var COLLAB_POSTS=[], COLLAB_PENDING=[];
/* stable post key: DB posts use profile_content.id; seed/local posts use a signature hash so likes/comments stay attached across renders */
function sigPid(a,b){ var s=(a||'')+'|'+(b||''), h=0,i; for(i=0;i<s.length;i++){h=((h<<5)-h+s.charCodeAt(i))|0;} return 'sig:'+(typeof PROFILE_SLUG!=='undefined'?PROFILE_SLUG:'x')+':'+(h>>>0).toString(36); }
function allPosts(){
  var out=[];
  GT_ARTICLES.forEach(function(a,i){ out.push({type:postType(a),title:a.t,sub:a.d,media:a.img,mtype:a.mtype||'image',collab:a.collab,hideFeed:a.hideFeed,src:'article',idx:i,pid:a._pid||sigPid(a.t,a.img),body:storedBody(a)}); });
  GAL_IMGS.forEach(function(t,i){ var mt=t[3]||'image'; out.push({type:(mt==='video')?'video':'image',title:t[1],sub:(t[2]?('▶ '+t[2]):''),media:galSrc(t[0]),mtype:mt,collab:null,hideFeed:t[4],src:'photo',idx:i,pid:t[5]||sigPid(t[1],t[0]),body:''}); });
  COLLAB_POSTS.forEach(function(c,i){ var d=c.payload||{}; out.push({type:(d.mtype==='video')?'video':(d.mtype==='image'?'image':'article'),title:d.t||c.title||'Collab',sub:'✦ Collab · @'+c.source_slug,media:d.img||'',mtype:d.mtype||'image',collab:[c.source_slug],hideFeed:false,src:'collab',idx:i,pid:'collab:'+c.id,body:storedBody(d)}); });
  EVENTS_FEED.forEach(function(e,i){ out.push({type:'event',title:e.title,sub:'',media:KH(e.cover)||'',mtype:'image',collab:null,hideFeed:false,src:'event',idx:i,pid:e._pid||('event:'+e.slug),body:'',event:e}); });
  return out;
}
/* Collab READ side — a shared post shows on this profile only after the owner ACCEPTS it. */
function loadCollab(){
  if(!SB||typeof PROFILE_SLUG==='undefined'){ return; }
  try{
    SB.from('post_collaborators').select('*').eq('collaborator_slug',PROFILE_SLUG).then(function(r){
      if(!r||r.error||!r.data){ return; }
      COLLAB_POSTS=r.data.filter(function(x){return x.status==='accepted';});
      COLLAB_PENDING=CAN_EDIT()?r.data.filter(function(x){return x.status==='pending';}):[];
      renderArticles();
    }).catch(function(){});
  }catch(e){}
}
function collabRespond(id,status){
  if(!SB){return;}
  try{ SB.from('post_collaborators').update({status:status}).eq('id',id).then(function(){ toast(status==='accepted'?'Collab accepted — added to your feed.':'Collab declined.'); loadCollab(); }).catch(function(){}); }catch(e){}
}
/* FB-parity post card (Founder 2026-07-18): uniform card — author header → 1:1 media → caption "…more" → action row */
/* ===== V3.1 interactive posts — like / comment / reshare / save, persisted in Supabase, open to ANY signed-in user ===== */
var PST={};   // pid -> {likes, liked, resh, reshared, comments}
function cssq(s){ s=String(s); return (window.CSS&&CSS.escape)?CSS.escape(s):s.replace(/["\\]/g,'\\$&'); }
function isUuid(s){ return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s||''); }
function meName(){ var u=SESSION&&SESSION.user; if(!u)return 'You'; var m=u.user_metadata||{}; return m.handle||m.name||m.full_name||(u.email?u.email.split('@')[0]:'User'); }
function meAvatar(){ var u=SESSION&&SESSION.user; var m=(u&&u.user_metadata)||{}; return m.avatar||m.avatar_url||''; }
/* look-but-can't-touch: every interaction needs an account. Returns TRUE (blocked) + shows a login wall when signed out. */
function needAuth(){ if(SESSION&&SESSION.user) return false; showLoginWall(); return true; }
function closeLoginWall(){ var m=document.getElementById('kil-loginwall'); if(m)m.remove(); }
function showLoginWall(){
  if(document.getElementById('kil-loginwall'))return;
  var next=encodeURIComponent(location.pathname+location.search);
  var ov=document.createElement('div'); ov.className='kil-modal-ov'; ov.id='kil-loginwall';
  ov.innerHTML='<div class="kil-modal" style="max-width:390px">'
    +'<div class="kil-mh">Join KEEPITIL<button class="kil-mx" data-click="closeLoginWall">&times;</button></div>'
    +'<div class="kil-mb" style="padding:26px 22px;text-align:center">'
      +'<div style="font-size:2.5rem;line-height:1;margin-bottom:12px">🔒</div>'
      +'<p style="font-size:1rem;line-height:1.55;color:var(--text-soft,#d4d7e2);margin:0 0 20px">Create a free account to like, comment, reshare and save. Anyone can look around — you just need to be signed in to join in.</p>'
      +'<a href="/apply?next='+next+'" class="kil-join-btn" style="display:inline-block;text-decoration:none;padding:12px 28px">Log in / Join →</a>'
    +'</div></div>';
  document.body.appendChild(ov); ov.addEventListener('click',function(e){if(e.target===ov)closeLoginWall();});
}
function pstOf(pid){ return PST[pid]||(PST[pid]={likes:0,liked:false,resh:0,reshared:false}); }
function paintAct(pid){ var st=PST[pid]; if(!st)return;
  document.querySelectorAll('.fbcard[data-pid="'+cssq(pid)+'"]').forEach(function(card){
    var lk=card.querySelector('.fba-like'), rs=card.querySelector('.fba-resh');
    if(lk){ lk.classList.toggle('on',!!st.liked); var b=lk.querySelector('b'); if(b)b.textContent=st.likes||''; }
    if(rs){ rs.classList.toggle('on',!!st.reshared); var b2=rs.querySelector('b'); if(b2)b2.textContent=st.resh||''; }
    if(cm){ var b3=cm.querySelector('b'); if(b3)b3.textContent=st.comments||''; }
  }); }
function fbToggleLike(pid){ if(needAuth())return; if(!SB||!pid)return; var st=pstOf(pid), uid=SESSION.user.id;
  if(st.liked){ st.liked=false; st.likes=Math.max(0,st.likes-1); paintAct(pid);
    SB.from('post_likes').delete().eq('post_key',pid).eq('user_id',uid).then(function(){}).catch(function(){}); }
  else { st.liked=true; st.likes++; paintAct(pid);
    SB.from('post_likes').insert({post_key:pid,profile_slug:PROFILE_SLUG,user_id:uid}).then(function(r){ if(r&&r.error){ st.liked=false; st.likes=Math.max(0,st.likes-1); paintAct(pid);} }).catch(function(){}); } }
function fbReshare(pid){ if(needAuth())return; if(!SB||!pid)return; var st=pstOf(pid), uid=SESSION.user.id;
  if(st.reshared){ st.reshared=false; st.resh=Math.max(0,st.resh-1); paintAct(pid); toast('Reshare removed');
    SB.from('post_reshares').delete().eq('post_key',pid).eq('user_id',uid).then(function(){}).catch(function(){}); }
  else { st.reshared=true; st.resh++; paintAct(pid); toast('Reshared ✓');
    SB.from('post_reshares').insert({post_key:pid,profile_slug:PROFILE_SLUG,user_id:uid}).then(function(r){ if(r&&r.error){ st.reshared=false; st.resh=Math.max(0,st.resh-1); paintAct(pid);} }).catch(function(){}); } }
function fbShare(url){ if(needAuth())return; try{ if(navigator.share){ navigator.share({url:url}); return; } }catch(e){}
  try{ navigator.clipboard.writeText(url); toast('Link copied ✓'); }catch(e){ prompt('Copy link:',url); } }
function ensureSavedColl(cb){
  SB.from('collections').select('id,name').eq('user_id',SESSION.user.id).then(function(r){
    var colls=(r&&r.data)?r.data:[]; var def=null; colls.forEach(function(c){ if(String(c.name).toLowerCase()==='saved') def=c; });
    if(def){ colls=colls.filter(function(c){return c!==def;}); colls.unshift(def); cb(colls,def); return; }
    SB.from('collections').insert({user_id:SESSION.user.id,name:'Saved'}).select('id,name').then(function(rr){
      var d=(rr&&rr.data&&rr.data[0])?rr.data[0]:{id:null,name:'Saved'}; colls.unshift(d); cb(colls,d);
    }).catch(function(){ cb(colls,{id:null,name:'Saved'}); });
  }).catch(function(){ cb([],{id:null,name:'Saved'}); });
}
function openSaveCollections(pid,el){
  if(document.getElementById('kilSaveDD'))return;
  ensureSavedColl(function(colls,def){
    var ov=document.createElement('div'); ov.id='kilSaveDD';
    ov.style.cssText='position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center';
    var items=colls.map(function(c){return '<button class="kilcoll" data-cid="'+(c.id==null?'':c.id)+'" style="display:block;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid rgba(255,255,255,.08);color:#e8e8f0;font-size:1rem;padding:14px 6px;cursor:pointer">'+String(c.name).slice(0,40)+'</button>';}).join('');
    ov.innerHTML='<div style="background:#15151f;border-radius:18px 18px 0 0;width:100%;max-width:520px;max-height:70vh;overflow:auto;padding:16px 18px 26px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px"><b style="font-size:1.05rem;color:#fff">Save to</b><button id="ksX" style="background:none;border:0;color:#888;font-size:1.5rem;line-height:1;cursor:pointer">&times;</button></div>'
      +items+'<button id="ksNew" style="width:100%;text-align:left;background:none;border:0;color:var(--accent,#8b5cff);font-weight:700;font-size:1rem;padding:14px 6px;cursor:pointer">+ New collection</button></div>';
    document.body.appendChild(ov);
    function close(){ ov.remove(); }
    ov.addEventListener('click',function(e){ if(e.target===ov) close(); });
    document.getElementById('ksX').onclick=close;
    function doSave(cid){ var row={user_id:SESSION.user.id,content_id:pid}; if(cid)row.collection_id=cid; SB.from('post_saves').insert(row).then(function(){}).catch(function(){}); el.classList.add('on'); toast('Saved'); close(); }
    ov.querySelectorAll('.kilcoll').forEach(function(b){ b.onclick=function(){ var c=b.getAttribute('data-cid'); doSave(c?parseInt(c,10):(def&&def.id?def.id:null)); }; });
    document.getElementById('ksNew').onclick=function(){ var nm=prompt('New collection name:'); if(!nm)return; nm=nm.trim(); if(!nm)return; SB.from('collections').insert({user_id:SESSION.user.id,name:nm}).select('id').then(function(r){ var id=(r&&r.data&&r.data[0])?r.data[0].id:null; doSave(id); }).catch(function(){ doSave(null); }); };
  });
}
function fbSave(pid,el){ if(needAuth())return; if(!SB||!pid)return;
  if(el.classList.contains('on')){ el.classList.remove('on'); if(isUuid(pid)){ SB.from('post_saves').delete().eq('user_id',SESSION.user.id).eq('content_id',pid).then(function(){}).catch(function(){}); } else { try{var mm=JSON.parse(localStorage.getItem('kil-saves')||'{}');mm[pid]=0;localStorage.setItem('kil-saves',JSON.stringify(mm));}catch(e){} } toast('Removed from saved'); return; }
  if(!isUuid(pid)){ el.classList.add('on'); try{var m2=JSON.parse(localStorage.getItem('kil-saves')||'{}');m2[pid]=1;localStorage.setItem('kil-saves',JSON.stringify(m2));}catch(e){} toast('Saved'); return; }
  openSaveCollections(pid,el);
}
function fbSaveOld(pid,el){ var uid=SESSION.user.id, on=el.classList.toggle('on');
  if(isUuid(pid)){ if(on){ SB.from('post_saves').insert({user_id:uid,content_id:pid}).then(function(){}).catch(function(){}); toast('Saved ✓'); }
    else { SB.from('post_saves').delete().eq('user_id',uid).eq('content_id',pid).then(function(){}).catch(function(){}); toast('Removed from saved'); } }
  else { try{var m=JSON.parse(localStorage.getItem('kil-saves')||'{}');m[pid]=on?1:0;localStorage.setItem('kil-saves',JSON.stringify(m));}catch(e){} toast(on?'Saved ✓':'Removed from saved'); } }
/* pull like/reshare/comment/save state for every visible card in a few batched queries */
function hydratePosts(){ if(!SB)return;
  var cards=[].slice.call(document.querySelectorAll('.fbcard[data-pid]'));
  var pids=cards.map(function(c){return c.getAttribute('data-pid');}).filter(function(v,i,a){return v&&a.indexOf(v)===i;});
  if(!pids.length)return; var uid=SESSION&&SESSION.user?SESSION.user.id:null;
  pids.forEach(function(p){ var s=pstOf(p); s.likes=0;s.liked=false;s.resh=0;s.reshared=false; });
  SB.from('post_likes').select('post_key,user_id').in('post_key',pids).then(function(r){ if(r&&r.data){ r.data.forEach(function(x){var s=PST[x.post_key]; if(s){s.likes++; if(uid&&x.user_id===uid)s.liked=true;}}); pids.forEach(paintAct);} }).catch(function(){});
  SB.from('post_reshares').select('post_key,user_id').in('post_key',pids).then(function(r){ if(r&&r.data){ r.data.forEach(function(x){var s=PST[x.post_key]; if(s){s.resh++; if(uid&&x.user_id===uid)s.reshared=true;}}); pids.forEach(paintAct);} }).catch(function(){});
  if(uid){ var us=pids.filter(isUuid); if(us.length) SB.from('post_saves').select('content_id').eq('user_id',uid).in('content_id',us).then(function(r){ if(r&&r.data){ var set={}; r.data.forEach(function(x){set[x.content_id]=1;}); document.querySelectorAll('.fbcard[data-pid]').forEach(function(c){ var sv=c.querySelector('.fb-save'); if(sv)sv.classList.toggle('on',!!set[c.getAttribute('data-pid')]); }); } }).catch(function(){}); }
}
/* ---- per-post ⋯ menu ---- */
function closeMenu(){var m=document.getElementById('postMenu');if(m)m.remove();}
function postMenu(pid,src,idx,ev){ if(ev){ev.stopPropagation();} closeMenu();
  var owner=(typeof CAN_EDIT==='function')&&CAN_EDIT(), items=[];
  /* F1: pid/src/idx stay in this closure; the buttons carry only a fixed data-m verb (no value is ever interpolated into JS). */
  if(owner){ items.push('<button data-m="edit">✏️ Edit caption</button>');
    items.push('<button data-m="del">🗑 Delete post</button>');
    items.push('<button data-m="hide">👁 Hide / show in feed</button>'); }
  else { items.push('<button data-m="copy">🔗 Copy link</button>');
    items.push('<button data-m="report">🚩 Report</button>'); }
  var m=document.createElement('div'); m.className='post-menu'; m.id='postMenu'; m.innerHTML=items.join('');
  m.addEventListener('click',function(e2){ var bt=e2.target&&e2.target.closest&&e2.target.closest('button[data-m]'); if(!bt)return; var k=bt.getAttribute('data-m');
    if(k==='edit')editPost(src,idx); else if(k==='del')delPost(pid);
    else if(k==='hide'){ toggleHideFeed(src,idx); closeMenu(); }
    else if(k==='copy'){ fbShare(KIL_SHARE_ORIGIN+'/profile?slug='+encodeURIComponent(PROFILE_SLUG)); closeMenu(); }
    else if(k==='report')reportPost(); });
  document.body.appendChild(m);
  var b=ev&&(ev.currentTarget||ev.target); if(b&&b.getBoundingClientRect){ var rc=b.getBoundingClientRect();
    m.style.top=(rc.bottom+window.scrollY+6)+'px'; m.style.left=Math.max(8,(rc.right+window.scrollX-186))+'px'; }
  setTimeout(function(){ document.addEventListener('click',closeMenu,{once:true}); },0);
}
function delPost(pid){ closeMenu();
  if(!isUuid(pid)){ toast('This sample post can’t be deleted.'); return; }
  if(!confirm('Delete this post? This cannot be undone.'))return;
  SB.from('profile_content').delete().eq('id',pid).then(function(r){ if(r&&r.error){toast('Delete failed');return;} toast('Post deleted'); loadFromDB(); }).catch(function(){toast('Delete failed');}); }
function editPost(src,idx){ closeMenu(); var cur='',pid;
  if(src==='article'){ var a=GT_ARTICLES[idx]; if(!a)return; cur=a.t||''; pid=a._pid; }
  else { var t=GAL_IMGS[idx]; if(!t)return; cur=t[1]||''; pid=t[5]; }
  var nv=prompt('Edit caption:',cur); if(nv===null)return; nv=nv.trim();
  if(src==='article'&&GT_ARTICLES[idx])GT_ARTICLES[idx].t=nv; else if(GAL_IMGS[idx])GAL_IMGS[idx][1]=nv;
  renderAll();
  if(isUuid(pid)&&SB){ SB.from('profile_content').select('data').eq('id',pid).maybeSingle().then(function(r){ var d=(r&&r.data&&r.data.data)||{}; if(src==='article')d.t=nv; else d.label=nv; SB.from('profile_content').update({data:d}).eq('id',pid).then(function(){toast('Caption updated');}); }).catch(function(){}); }
  else { toast('Caption updated (sample post — not saved to server).'); } }
function reportPost(){ closeMenu(); toast('Thanks — this post was reported for review.'); }
function fbCapToggle(el,ev){ if(ev){ if(ev.target&&ev.target.closest&&ev.target.closest('a')) return; pfStop(ev); } el.classList.toggle('open'); }
document.addEventListener('scroll',function(e){
  var c=e.target; if(!c.classList||!c.classList.contains('fb-caro'))return;
  var i=Math.round(c.scrollLeft/c.clientWidth);
  var dots=c.parentElement.querySelectorAll('.fb-dots span');
  dots.forEach(function(d,j){d.classList.toggle('on',j===i);});
},true);
function eventCardHtml(e,pid){
  var ext=!!e.is_external; var url=e.ticket_url||('/event?e='+encodeURIComponent(e.slug||''));
  var img=KH(e.cover)||'/assets/images/blog-default-744.webp';   // 31 KB copy of blog-default.jpg for this 372px card (the jpg is 232 KB); onerror below falls back to the jpg
  var when=''; try{var dt=new Date(e.date); if(!isNaN(dt)) when=dt.toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'});}catch(x){}
  var tgt=ext?' target="_blank" rel="noopener noreferrer"':'';
  return '<div class="pf-card fbcard evpost" data-pid="'+esc(pid)+'" style="overflow:hidden">'
    +'<a href="'+esc(url)+'"'+tgt+' style="text-decoration:none;display:block">'
      +'<div style="position:relative;aspect-ratio:16/9;background:#0a0a0f"><img src="'+esc(img)+'" alt="'+esc(e.title||'Event')+'" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block" data-fb="src" data-fb-src="/assets/images/blog-default.jpg">'
        +'<span style="position:absolute;top:10px;left:10px;background:'+(ext?'rgba(0,0,0,.7)':'rgba(0,224,164,.95)')+';color:'+(ext?'#fff':'#06120a')+';font:800 .58rem Inter,sans-serif;letter-spacing:.09em;padding:3px 9px;border-radius:6px">'+(ext?'EXTERNAL':'KEEPITIL EVENT')+'</span></div>'
      +'<div style="padding:12px 15px 6px"><div style="font-family:var(--font-head,Inter);font-weight:800;font-size:1.15rem;letter-spacing:.02em;color:#fff;line-height:1.15">'+esc(e.title||'Event')+'</div>'
        +'<div style="color:var(--muted,#9aa0b0);font-size:.82rem;margin-top:5px">'+(when?esc(when):'')+(e.venue?(when?' · ':'')+esc(e.venue):'')+(e.city?' · '+esc(e.city):'')+'</div></div></a>'
    +'<div style="padding:8px 15px 4px"><a href="'+esc(url)+'"'+tgt+' style="display:block;text-align:center;background:var(--brand,#00b4ff);color:#04121b;font-weight:800;letter-spacing:.05em;padding:11px;border-radius:10px;text-decoration:none">🎟 '+(ext?'Get Tickets ↗':'Get Tickets')+'</a></div>'
    +'<div class="fb-actions" style="display:flex;align-items:center;gap:4px;padding:4px 10px 10px">'
      +'<button class="fba fba-like" data-kil-act="like" data-pid="'+esc(pid)+'" title="Like"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.9-9.3-9C1.2 8 3 4.5 6.4 4.5c2.2 0 3.6 1.2 4.4 2.6.2.4.9.4 1.1 0 .8-1.4 2.2-2.6 4.4-2.6 3.4 0 5.2 3.5 3.7 7-1.8 4.1-8 9-8 9z"/></svg><b></b></button>'
      +'<button class="fba fba-resh" data-kil-act="reshare" data-pid="'+esc(pid)+'" title="Reshare"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg><b></b></button>'
      +'<button class="fba fb-save" style="margin-left:auto" data-kil-act="save" data-pid="'+esc(pid)+'" title="Save"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M17 3H7a2 2 0 00-2 2v16l7-4 7 4V5a2 2 0 00-2-2z"/></svg></button>'
    +'</div></div>';
}
function postCard(p){
  if(p.event) return eventCardHtml(p.event, p.pid||('event:'+(p.event.slug||'')));
  var pid=p.pid||(p.src+':'+p.idx);
  var authorSlug=(p.collab&&p.collab.length)?p.collab[0]:PROFILE_SLUG;
  var authorName=(p.collab&&p.collab.length)?('@'+p.collab[0]):(PROFILE.name||PROFILE_SLUG);
  var authorAv=(p.collab&&p.collab.length)?'/icon-192.png':(PROFILE.avatar||'/icon-192.png');
  var safeSrc=safeMedia(p.media||'');
  var media=(p.mtype==='video'&&safeSrc)
    ? '<video src="'+esc(safeSrc)+'#t=0.1" muted loop playsinline preload="metadata" data-over="pfVidPlay" data-a="[&quot;$el&quot;]" data-out="pfVidPause" data-a="[&quot;$el&quot;]"></video>'
    : '<img src="'+esc(safeSrc||authorAv||'/icon-192.png')+'" alt="'+esc(p.title)+'" loading="lazy" data-fb="src" data-fb-src="/icon-192.png">';  /* every post shows an image — fall back to the author avatar */
  var col=(p.collab&&p.collab.length)?' <span style="color:var(--accent)">✦ @'+p.collab.map(esc).join(', @')+'</span>':'';
  var hid=(CAN_EDIT()&&isHiddenFromFeed(p))?'<span class="pc-hidden">Gallery only</span>':'';
  var plink='/profile?slug='+encodeURIComponent(authorSlug);
  return '<div class="pf-card fbcard" data-kind="'+p.type+'" data-pid="'+esc(pid)+'">'
    +'<div class="fb-head">'
      +'<a class="fb-avlink" href="'+plink+'" tabindex="-1" aria-hidden="true"><img class="fb-av" src="'+esc(authorAv)+'" alt="" data-fb="src" data-fb-src="/icon-192.png"></a>'
      +'<a class="fb-who" href="'+plink+'"><b>'+esc(authorName)+'</b><span>'+esc(p.type)+col+'</span></a>'
      +'<button class="fb-more" data-kil-act="menu" data-pid="'+esc(pid)+'" data-src="'+esc(p.src)+'" data-idx="'+esc(p.idx)+'" title="Options">⋯</button>'
      +hid
    +'</div>'
    +'<div class="fb-media">'+media+'</div>'
    +(p.title||p.sub||p.body?'<div class="fb-cap" data-click="fbCapToggle" data-a="[&quot;$el&quot;,&quot;$e&quot;]"><div class="fb-cap-lead"><b>'+esc(p.title||'')+'</b>'+(p.sub?' '+esc(p.sub):'')+'</div>'+(p.body?'<div class="fb-cap-full">'+p.body+'</div><span class="fb-more-txt">… more</span>':'')+'</div>':'')
    +(p.buy_url?('<div style="padding:2px 15px 8px"><a href="'+esc(p.buy_url)+'" target="_blank" rel="noopener sponsored nofollow" data-kt="affiliate_click" style="display:block;text-align:center;background:#ff9900;color:#111;font-weight:800;letter-spacing:.03em;padding:11px;border-radius:10px;text-decoration:none">🛒 '+esc(p.buy_label||'Buy on Amazon')+'</a><div style="font-size:.68rem;color:var(--muted,#9aa0b0);text-align:center;margin-top:5px">'+esc(p.disclosure||'#ad · affiliate')+'</div></div>'):'')
    +'<div class="fb-actions">'
      +'<button class="fba fba-like" data-kil-act="like" data-pid="'+esc(pid)+'" title="Like"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.9-9.3-9C1.2 8 3 4.5 6.4 4.5c2.2 0 3.6 1.2 4.4 2.6.2.4.9.4 1.1 0 .8-1.4 2.2-2.6 4.4-2.6 3.4 0 5.2 3.5 3.7 7-1.8 4.1-8 9-8 9z"/></svg><b></b></button>'
      +'<button class="fba fba-resh" data-kil-act="reshare" data-pid="'+esc(pid)+'" title="Reshare"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg><b></b></button>'
      +'<button class="fba fba-share" data-kil-act="share" data-slug="'+esc(authorSlug)+'" title="Share"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg></button>'
      +'<button class="fba fb-save" style="margin-left:auto" data-kil-act="save" data-pid="'+esc(pid)+'" title="Save"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M17 3H7a2 2 0 00-2 2v16l7-4 7 4V5a2 2 0 00-2-2z"/></svg></button>'
    +'</div>'
  +'</div>';
}
/* F1 — card buttons carry data-kil-act + data-* values and ONE capture-phase listener dispatches them.
   They used to be inline click-handler strings calling fbX('<pid>'): esc() HTML-escapes the value, but the browser
   decodes &#39; back to ' BEFORE the JS in the attribute runs, so a pid/slug containing a quote broke out
   of the string. A data-* attribute is only ever read back as a string, never parsed as code.
   Capture phase + stopPropagation reproduces the old per-button event.stopPropagation(). */
document.addEventListener('click',function(e){
  var t=e.target, b=t&&t.closest&&t.closest('[data-kil-act]'); if(!b)return;
  if(!b.closest('.fbcard'))return;
  var act=b.getAttribute('data-kil-act'), pid=b.getAttribute('data-pid')||'';
  e.stopPropagation();
  if(act==='like') fbToggleLike(pid);
  else if(act==='reshare') fbReshare(pid);
  else if(act==='save') fbSave(pid,b);
  else if(act==='share') fbShare(KIL_SHARE_ORIGIN+'/profile?slug='+encodeURIComponent(b.getAttribute('data-slug')||''));
  else if(act==='menu') postMenu(pid,b.getAttribute('data-src')||'',parseInt(b.getAttribute('data-idx'),10)||0,{stopPropagation:function(){},currentTarget:b,target:b});
},true);
function openPost(src,idx){
  var html='';
  if(src==='collab'){ var c=COLLAB_POSTS[idx]; if(!c)return;
    var payload=c.payload||{};
    var body=storedBody(payload);
    html='<div class="kil-tag">✦ COLLAB · @'+esc(c.source_slug)+'</div>'+(body||('<p class="intro-text">'+esc(c.title||'')+'</p>')); }
  else if(src==='article'){ var a=GT_ARTICLES[idx]; if(!a)return;
    /* An article with a url IS a page — open it rather than rendering a second copy of it
       inside a modal. Only https or same-origin targets are followed. Legacy inline entries
       are rebuilt from fields, or sanitized when only stored html remains. */
    if(a.url){ var nav=safeNav(a.url); if(nav) location.href=nav; return; }
    html=storedBody(a); }
  else { var t=GAL_IMGS[idx]; if(!t)return; var mt=t[3]||'image'; var srcUrl=safeMedia(galSrc(t[0]||'')); var m=(mt==='video')
      ?(srcUrl?'<video src="'+esc(srcUrl)+'" controls playsinline autoplay style="width:100%;border-radius:12px;background:#000"></video>':'')
      :'<img src="'+esc(srcUrl||'/icon-192.png')+'" alt="'+esc(t[1])+'" style="width:100%;border-radius:12px">';
    html='<div class="kil-tag">'+((mt==='video')?'★ VIDEO':'★ IMAGE')+'</div>'+m+'<p class="intro-text">'+esc(t[1])+'</p>'; }
  var foot='';
  if(CAN_EDIT()&&src!=='collab'){
    var pp=(src==='article')?{title:(GT_ARTICLES[idx]||{}).t,media:(GT_ARTICLES[idx]||{}).img}:{title:(GAL_IMGS[idx]||[])[1],media:galSrc((GAL_IMGS[idx]||[])[0]||'')};
    var hidden=isHiddenFromFeed(pp);
    foot='<div class="kil-mfoot"><button class="kil-mcancel" data-click="toggleHideFeed" data-a="'+esc(JSON.stringify([src,idx]))+'">'+(hidden?'👁 Show in feed':'🚫 Hide from feed')+'</button></div>';
  }
  closeModal();
  var ov=document.createElement('div');ov.className='kil-modal-ov';ov.id='kilModal';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-label','Dialog');
  ov.innerHTML='<div class="kil-modal"><div class="kil-mh">Post<button class="kil-mx" data-click="closeModal">&times;</button></div><div class="kil-mb kil-post"></div>'+foot+'</div>';
  var slot=ov.querySelector('.kil-post'); if(slot) slot.innerHTML=html;
  document.body.appendChild(ov); ov.addEventListener('click',function(e){if(e.target===ov)closeModal();});
}
/* feed-types info popover */
function toggleLegend(e){ if(e){e.stopPropagation();} var l=document.getElementById('feed-legend'); if(l) l.classList.toggle('open'); }
document.addEventListener('click',function(e){ var l=document.getElementById('feed-legend'); if(l&&l.classList.contains('open')){ var b=document.getElementById('feed-info-btn'); if(!l.contains(e.target)&&e.target!==b) l.classList.remove('open'); } });
/* filter state for the unified tabs */
var GAL_FILTER='all', EV_FILTER='mine', CHAT_FILTER='primary';
function setGalFilter(f){GAL_FILTER=f;renderGallery();}
function setEvFilter(f){EV_FILTER=f;renderShows();}
function setChatFilter(f){CHAT_FILTER=f;renderChats();}
var MONI=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function evKey(o){var mi=MONI.indexOf((o.month||'').toUpperCase());var d=parseInt(o.day||'0',10)||0;return (mi<0?-1:mi)*100+d;}
/* FEED — all posts, 3-col grid */
function renderArticles(){
  var host=document.getElementById('feed-grid');if(!host)return;
  // owner-only pending collab invites — must accept before the post shows
  var pend=document.getElementById('collab-pending');
  if(pend){
    pend.innerHTML=(CAN_EDIT()&&COLLAB_PENDING.length)?COLLAB_PENDING.map(function(c){
      return '<div class="collab-invite"><div class="ci-txt"><b>@'+esc(c.source_slug)+'</b> wants to share a post to your profile: <span>"'+esc(c.title||'Untitled')+'"</span></div><div class="ci-btns"><button class="ci-yes" data-collab-id="'+esc(c.id)+'" data-collab-st="accepted">Accept</button><button class="ci-no" data-collab-id="'+esc(c.id)+'" data-collab-st="declined">Decline</button></div></div>';
    }).join(''):'';
    /* F1b — Accept/Decline carry the id in data-* (never inline JS); one delegated listener, re-assigned (not stacked) on each render. */
    pend.onclick=function(e){ var b=e.target&&e.target.closest&&e.target.closest('button[data-collab-id]'); if(!b)return; collabRespond(b.getAttribute('data-collab-id'),b.getAttribute('data-collab-st')); };
  }
  var add='';   /* in-feed create tile removed (Founder pass 2) — ＋Create lives on the sub-filter row */
  var posts=allPosts().filter(function(p){return !isHiddenFromFeed(p);}); // Feed = everything (own + accepted collab) not hidden by the owner
  host.innerHTML=add+(posts.length?posts.map(postCard).join(''):(add?'':'<div class="pf-empty">No posts yet.</div>'));
}
function openArticle(i){
  var v=document.getElementById('art-viewer');if(!v||!GT_ARTICLES[i])return;
  v.innerHTML=storedBody(GT_ARTICLES[i]);
  document.querySelectorAll('.art-card').forEach(function(c){c.classList.remove('on');});
  var card=document.getElementById('artc'+i);if(card)card.classList.add('on');
}
function scrollCar(id,dir){var el=document.getElementById(id);if(el)el.scrollBy({left:dir*320,behavior:'smooth'});}
/* ── AGENT Q&A CHAT (14 agents · ask-echo edge fn, agent-scoped brain + personality) ── */
var AG_BUSY=false;
function renderAgentChat(){
  var list=document.getElementById('chat-list'); if(!list) return;
  var bar=document.getElementById('chat-filter'); if(bar) bar.innerHTML='';
  var nb=document.getElementById('dm-new'); if(nb) nb.style.display='none';
  if(document.getElementById('agchat')) return; /* keep the conversation across tab hops */
  var info=AGENT_INFO[PROFILE_SLUG]||[], nm=PROFILE.name||info[0]||PROFILE_SLUG;
  list.classList.add('agmode');
  list.innerHTML='<div class="agchat" id="agchat">'
    +'<div class="ag-head"><img src="'+esc(PROFILE.avatar||'/icon-192.png')+'" alt="" data-fb="dim" data-fb-op=".2">'
    +'<div><b>Ask '+esc(nm)+'</b><span>'+esc([info[1],info[2]].filter(Boolean).join(' · '))+' — live answers from '+esc(nm)+'’s own knowledge.</span></div></div>'
    +'<div class="ag-msgs" id="agMsgs"></div>'
    +'<div class="ag-chips" id="agChips">'
      +'<button data-click="agAsk" data-a="[&quot;What do you do at KEEPITIL?&quot;]">What do you do here?</button>'
      +'<button data-click="agAsk" data-a="[&quot;What should I listen to in your genre right now?&quot;]">What should I listen to?</button>'
      +'<button data-click="agAsk" data-a="[&quot;How can you help me grow as a creator?&quot;]">How can you help me?</button>'
    +'</div>'
    +'<div class="ag-in"><input id="agIn" placeholder="Ask '+esc(nm)+' anything…" maxlength="500" data-keydown="pfAgEnter" data-a="[&quot;$e&quot;]"><button id="agGo" data-click="agSend">Send</button></div>'
  +'</div>';
  agBubble('bot','','Hey — I’m '+nm+' ⚡ Ask me anything about what I do, my genre, or the scene.');
}
function agBubble(kind,who,text,sources){
  var m=document.getElementById('agMsgs'); if(!m) return null;
  var d=document.createElement('div'); d.className='ag-m'+(kind==='me'?' me':'');
  var src='';
  if(sources&&sources.length){ src='<span class="ag-src">'+sources.slice(0,3).map(function(s){ var u=s&&(s.url||s.source_url), l=s&&(s.label||s.title)||'Read more'; return u?'<a href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">'+esc(l)+' ↗</a>':''; }).join('')+'</span>'; }
  d.innerHTML=(who?'<span class="ag-who">'+esc(who)+'</span>':'')+esc(text)+src;
  m.appendChild(d); m.scrollTop=m.scrollHeight; return d;
}
function agAsk(q){ var i=document.getElementById('agIn'); if(i) i.value=q; agSend(); }
function agSend(){
  if(AG_BUSY) return;
  var i=document.getElementById('agIn'), q=i?i.value.trim():'';
  if(!q) return;
  i.value=''; agBubble('me','',q);
  var chips=document.getElementById('agChips'); if(chips) chips.style.display='none';
  AG_BUSY=true; var go=document.getElementById('agGo'); if(go) go.disabled=true;
  var m=document.getElementById('agMsgs');
  var t=document.createElement('div'); t.className='ag-m'; t.id='agTyping';
  t.innerHTML='<span class="ag-typing"><i></i><i></i><i></i></span>';
  m.appendChild(t); m.scrollTop=m.scrollHeight;
  var body={question:q,agent:PROFILE_SLUG};
  try{ var r0=localStorage.getItem('kil_role'); if(r0) body.userRole=r0;
       var g0=localStorage.getItem('kil_genres'); if(g0) body.userGenre=g0.split(',')[0]||g0; }catch(e){}
  var AK='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
  function done(){ var x=document.getElementById('agTyping'); if(x) x.remove(); AG_BUSY=false; if(go) go.disabled=false; }
  fetch('https://ovmqtzjfpzrbzrlkxwgw.supabase.co/functions/v1/ask-echo',{
    method:'POST',
    headers:{'apikey':AK,'Authorization':'Bearer '+AK,'Content-Type':'application/json'},
    body:JSON.stringify(body)
  }).then(function(r){ return r.ok?r.json():null; }).then(function(d){
    done();
    if(d&&d.ok&&d.answer) agBubble('bot',d.display_name||PROFILE.name||'',d.answer,d.sources);
    else agBubble('bot','', (PROFILE.name||'I')+' is mid-set right now — give it a second and ask again.');
  }).catch(function(){ done(); agBubble('bot','','Connection hiccup — try that once more.'); });
}
/* ── CHAT GROUP LIST (IG-style) ── */
var GT_CHATS=[
  ['groove-trooper','Groove Trooper','Who is going to Kingdom?','2m','3','https://images.ra.co/06c4bb3109109df1dad229582219f4ded15b11d4.jpg','primary'],
  ['groove-cruise','Groove Cruise Fam','Miami 2027 — who is in?','3h','12','https://images.ra.co/0c08978993ce4ba443b61b007d1de45445ddced3.jpg','general'],
  ['oc-techno','OC Techno Heads','Warehouse location drop soon','1d','','https://images.ra.co/1641a2b8fddcee60bb204595abe0a3f20d8a0e51.jpg','general']
];
/* Instagram's rule, as far as this page's data can express it:
     request — carries an explicit 'request' category, i.e. not yet accepted
     general — an explicit 'general' category, or a name that reads as a group
     primary — everything else
   An explicit category always wins; the name test is only the fallback for seeded rows that
   predate categories. 'events' is kept as a passthrough so older rows are not silently
   reclassified into a bucket the visitor is not looking at. */
function chatCat(c){ if(c[6])return c[6]; return /general/i.test(c[1])?'general':(/@|event/i.test(c[1])?'events':'primary'); }
function chatRow(av,title,desc,time,dot,slug,name){
  var menu='';
  if(slug && (typeof CAN_EDIT==='function') && CAN_EDIT()){
    menu='<button type="button" class="cc-menu" title="Options" data-chat-menu="1">&#8942;</button>';
  }
  var src=esc(kilSafeUrl(av)||'/icon-192.png');
  return '<div class="chat-card" data-chat-slug="'+esc(slug||'')+'" data-chat-name="'+esc(name||'')+'">'
    +'<img class="cc-av" src="'+src+'" alt="" loading="lazy" data-fb="src" data-fb-src="/icon-192.png">'
    +'<div class="cc-body"><div class="cc-nm">'+title+'</div><div class="cc-pv">'+desc+'</div></div>'
    +(time?'<div class="cc-rt">'+time+dot+'</div>':'')
    +menu
    +'</div>';
}
function bindChatCards(list){
  list.querySelectorAll('.chat-card[data-chat-slug]').forEach(function(card){
    card.addEventListener('click', function(){
      openChatGroup(card.getAttribute('data-chat-slug')||'', card.getAttribute('data-chat-name')||'');
    });
    var menu=card.querySelector('[data-chat-menu]');
    if(menu) menu.addEventListener('click', function(ev){
      ev.stopPropagation();
      chatRowMenu(ev, card.getAttribute('data-chat-slug')||'', card.getAttribute('data-chat-name')||'');
    });
  });
}
function renderChats(){
  if(IS_AGENT){ renderAgentChat(); return; }
  var list=document.getElementById('chat-list');if(!list)return;
  list.classList.remove('agmode');
  var nb=document.getElementById('dm-new'); if(nb) nb.style.display=CAN_EDIT()?'flex':'none';
  /* The chat panel used to draw its own Primary/General/Events chips. Row 2 of the filter bar
     owns those now (Primary/General/Request), so this row is emptied rather than left to
     render a second, competing set of the same control. */
  var bar=document.getElementById('chat-filter');
  if(bar){ bar.innerHTML=''; bar.style.display='none'; }
  if(CHAT_FILTER==='events'){ renderEventChats(list); return; }
  var items=GT_CHATS.filter(function(c){return chatCat(c)===CHAT_FILTER;});
  if(!items.length){ list.innerHTML='<div class="pf-empty">'+(CAN_EDIT()?'No chats here yet. Start a group to talk with your community. <button class="pf-chip" style="margin-top:8px" data-click="addContent" data-a="[&quot;chat group&quot;]">Start a chat</button>':'No chats here yet.')+'</div>'; return; }
  list.innerHTML=items.map(function(c){
    var dot=c[4]?'<span class="cc-dot"></span>':'';
    return chatRow(c[5]||'/icon-192.png', esc(c[1]), esc(c[2]||''), esc(c[3]||''), dot, c[0], c[1]);
  }).join('');
  bindChatCards(list);
}
/* Events filter = only event chats the viewer bought a ticket to (event_orders via my_ticketed_event_chats). */
function renderEventChats(list){
  list.innerHTML='<div class="pf-empty">Loading your event chats…</div>';
  if(!SB||!SESSION){ list.innerHTML='<div class="pf-empty">Log in to see the event chats you have tickets for.</div>'; return; }
  SB.rpc('my_ticketed_event_chats').then(function(r){
    var rows=(r&&r.data)||[];
    if(!rows.length){ list.innerHTML='<div class="pf-empty">No event chats yet. Buy a ticket to any event to unlock its chat room.</div>'; return; }
    list.innerHTML=rows.map(function(e){
      var when=''; try{ if(e.starts_at){ var dt=new Date(e.starts_at); if(!isNaN(dt)) when=dt.toLocaleDateString([], {month:'short',day:'numeric'}); } }catch(x){}
      var title=e.title||e.slug||'';
      return '<div class="chat-card" data-event-slug="'+esc(e.slug||'')+'" data-event-title="'+esc(title)+'">'
        +'<img class="cc-av" src="'+esc(kilSafeUrl(e.cover_url)||'/icon-192.png')+'" alt="" loading="lazy" data-fb="src" data-fb-src="/icon-192.png">'
        +'<div class="cc-body"><div class="cc-nm">'+esc(title)+'</div><div class="cc-pv">'+esc(when?('Event chat · '+when):'Event chat')+'</div></div>'
        +'</div>';
    }).join('');
    list.querySelectorAll('.chat-card[data-event-slug]').forEach(function(card){
      card.addEventListener('click', function(){ openEventRoom(card.getAttribute('data-event-slug')||'', card.getAttribute('data-event-title')||''); });
    });
  }).catch(function(){ list.innerHTML='<div class="pf-empty">Could not load event chats.</div>'; });
}
/* owner-only 3-dot menu on a chat row → Delete this chat */
function chatRowMenu(ev,slug,name){
  try{ev.stopPropagation();}catch(e){}
  document.querySelectorAll('.cc-pop').forEach(function(p){p.remove();});
  var pop=document.createElement('div'); pop.className='cc-pop';
  pop.innerHTML='<button class="cc-pop-del">Delete chat</button>';
  document.body.appendChild(pop);
  var r=ev.target.getBoundingClientRect();
  pop.style.top=(r.bottom+window.scrollY+4)+'px';
  pop.style.left=(Math.min(r.left+window.scrollX, window.innerWidth-160))+'px';
  pop.querySelector('.cc-pop-del').addEventListener('click', function(e){ e.stopPropagation(); pop.remove(); deleteChat(slug,name); });
  setTimeout(function(){ document.addEventListener('click',function _c(){ pop.remove(); document.removeEventListener('click',_c); }); },0);
}
function deleteChat(slug,name){
  if(!confirm('Delete the chat "'+name+'"? This removes it for everyone and cannot be undone.')) return;
  if(!SB||!SESSION){ toast('Sign in to manage chats.'); return; }
  SB.from('profile_content').delete().eq('profile_slug',PROFILE_SLUG).eq('kind','chat').filter('data->>slug','eq',slug).then(function(r){
    if(r&&r.error){ toast('Could not delete chat.'); return; }
    try{ GT_CHATS=GT_CHATS.filter(function(c){return c[0]!==slug;}); }catch(e){}
    try{ ADDED.chats=(ADDED.chats||[]).filter(function(c){return c[0]!==slug;}); }catch(e){}
    renderChats(); toast('Chat deleted.');
  }).catch(function(){ toast('Could not delete chat.'); });
}
function _openChatPopup(src,title){
  var f=document.getElementById('chat-frame');if(f)f.src=src;
  var tt=document.getElementById('chat-title');if(tt)tt.textContent=title||'';
  var o=document.getElementById('chat-open');if(o)o.style.display='flex';
  try{document.body.style.overflow='hidden';}catch(e){}
}
/* opened inside the profile popup → embed=1 so the iframe header hides + the session passes from the parent (no login gate). The room title shows on the popup bar (with ← Chats + ×). noh=1 hides the iframe's own title. v = cache-bust; bump on every event-chat.html change. */
var CHAT_V='20260725d';
function openEventRoom(slug,name){ _openChatPopup('/event-chat.html?embed=1&noh=1&v='+CHAT_V+'&e='+encodeURIComponent(slug)+'&t='+encodeURIComponent(name), name); }
function openChatGroup(slug,name){ _openChatPopup('/event-chat.html?embed=1&mode=chat&noh=1&v='+CHAT_V+'&e='+encodeURIComponent(slug)+'&t='+encodeURIComponent(name), name); }
function closeChatGroup(){
  var o=document.getElementById('chat-open');if(o)o.style.display='none';
  var l=document.getElementById('chat-list');if(l)l.style.display='';
  var f=document.getElementById('chat-frame');if(f)f.src='';
  try{document.body.style.overflow='';}catch(e){}
}
document.addEventListener('keydown',function(e){ if(e.key==='Escape'){ var o=document.getElementById('chat-open'); if(o&&o.style.display==='flex') closeChatGroup(); } });
/* Non-demo profiles start EMPTY; real data loads from Supabase (prevents Groove Trooper demo data bleeding into a fresh/unclaimed profile). */
if(!IS_DEMO){ PROFILE={name:'',handle:PROFILE_SLUG,location:'',bio:'',tagline:'',pronouns:'',avatar:'',cover:'',book_email:'',socials:{},highlights:[]}; GAL_IMGS=[]; GT_SHOWS=[]; if(typeof GT_ARTICLES!=='undefined')GT_ARTICLES=[]; if(typeof GT_CHATS!=='undefined')GT_CHATS=[]; }
/* Claim CTA removed (Founder 2026-08-04): unclaimed profiles are simply the live public profile; claiming happens elsewhere, not via an on-profile button. */
/* ── INIT: snapshot seeds, then load owner content from Supabase (fallback: local) ── */
(function(){
  SEED={articles:GT_ARTICLES.slice(),photos:GAL_IMGS.slice(),shows:GT_SHOWS.slice(),chats:GT_CHATS.slice()};
  /* ONBOARDING GATE REMOVED 2026-08-26 (Founder §31). It redirected any member without a
     completed_at row to /onboarding.html?required=1 — a page that does not exist — throwing
     them out of their own profile into a 404. With the redirect gone the rest was a no-op
     that still cost a user_onboarding query on every profile load and wrote a session flag
     whose only purpose was rate-limiting that redirect, so the whole check goes.
     index.html still READS user_onboarding as a personalisation signal; that is fine — it
     uses the data when present and renders nothing when absent. It does not need the page. */
  /* Renders in place instead of navigating, so the page can never bounce to a page that
     bounces back. Kept deliberately plain: this is an error state, not a screen to design. */
  function pfStuck(title, body, actions){
    var w=document.createElement('div');
    w.setAttribute('role','status');
    w.setAttribute('style','max-width:560px;margin:14vh auto;padding:26px 24px;border:1px solid rgba(0,255,136,.28);'
      +'border-radius:14px;background:rgba(10,12,11,.92);color:#e8ecf1;font:400 15px/1.55 Inter,system-ui,sans-serif;text-align:center');
    var h=document.createElement('h2');
    h.setAttribute('style','margin:0 0 10px;font:900 .8rem/1.2 Inter,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#00ff88');
    h.textContent=title;
    var p2=document.createElement('p'); p2.setAttribute('style','margin:0 0 18px;color:#b9c2cc'); p2.textContent=body;
    var row=document.createElement('div');
    row.setAttribute('style','display:flex;gap:10px;justify-content:center;flex-wrap:wrap');
    (actions||[]).forEach(function(a){
      var b=document.createElement('button'); b.type='button'; b.textContent=a.label;
      b.setAttribute('style','padding:10px 16px;border-radius:9px;cursor:pointer;font:800 .72rem Inter,sans-serif;'
        +'letter-spacing:.08em;text-transform:uppercase;border:1px solid '+(a.primary?'#00ff88':'rgba(255,255,255,.22)')
        +';background:'+(a.primary?'#00ff88':'transparent')+';color:'+(a.primary?'#07130d':'#e8ecf1'));
      b.onclick=a.go; row.appendChild(b);
    });
    w.appendChild(h); w.appendChild(p2); w.appendChild(row);
    /* Rendered INTO <main> at first, which had two faults: it deleted the page's own content,
       and the profile loaders repaint <main> milliseconds later, so the message vanished on
       any run where they finished second. A fixed layer on <body> is repaint-proof, and it
       starts below the nav so every link out of here stays clickable. */
    var prev=document.getElementById('pf-stuck'); if(prev) prev.remove();
    var lay=document.createElement('div'); lay.id='pf-stuck';
    lay.setAttribute('style','position:fixed;left:0;right:0;top:64px;bottom:0;z-index:9990;'
      +'display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px;'
      +'background:rgba(6,7,9,.94);backdrop-filter:blur(3px);overflow:auto');
    w.style.margin='0';
    lay.appendChild(w); document.body.appendChild(lay);
  }

  function pfGo(slug){ location.replace('/profile?slug='+encodeURIComponent(slug)); }

  function pfSignOut(){
    var done=function(){
      try{ Object.keys(localStorage).forEach(function(k){
        if(/^sb-.*-auth-token/.test(k)||/supabase\.auth\.token/.test(k)) localStorage.removeItem(k); }); }catch(e){}
      try{ Object.keys(sessionStorage).forEach(function(k){
        if(/^sb-.*-auth-token/.test(k)) sessionStorage.removeItem(k); }); }catch(e){}
    };
    try{
      return SB.auth.signOut({scope:'local'}).then(done).catch(done);
    }catch(e){ done(); return Promise.resolve(); }
  }
  window.__kilSignOut = pfSignOut;   /* so a stuck session can always be cleared from anywhere */

  function resolveMyProfile(){
    /* getUser() validates against the server; getSession() alone cannot tell a live session
       from a stale one, and that difference is the whole bug. */
    SB.auth.getUser().then(function(u){
      var user=(u&&u.data)?u.data.user:null;
      if(!user || (u&&u.error)){
        /* A token the server rejects is not a state to display and leave sitting there — the
           first version of this panel did exactly that, and left no way to clear it. Try a
           refresh, and if that fails the session is genuinely over, so END it. */
        SB.auth.refreshSession().then(function(rs){
          var u2=(rs&&rs.data)?rs.data.user:null;
          if(u2 && !(rs&&rs.error)){ resolveFor(u2); return; }   /* self-healed, carry on */
          return pfSignOut().then(function(){ location.replace('/apply?expired=1'); });
        }).catch(function(){
          pfSignOut().then(function(){ location.replace('/apply?expired=1'); });
        });
        return;
      }
      resolveFor(user);
    }).catch(function(){
      pfStuck('Could not check your sign-in',
        'The sign-in check did not complete, so nothing has been assumed about your account.',
        [{label:'Try again', primary:true, go:function(){ location.reload(); }},
         {label:'Sign in', go:function(){ location.href='/apply?next='+encodeURIComponent(location.pathname+location.search); }}]);
    });
  }

  function resolveFor(user){
      /* Two ways to find the slug. The RPC is the normal one; profile_owners is world-readable,
         so a direct read is a real second path rather than a retry of the same call. */
      SB.rpc('my_profile_slug').then(function(rr){
        if(rr && !rr.error && rr.data){ pfGo(rr.data); return; }   /* OWNER view (Founder 2026-08-05) */
        return SB.from('profile_owners').select('profile_slug').eq('owner_id', user.id).limit(1)
          .then(function(q){
            var row=(q && !q.error && q.data && q.data[0]) ? q.data[0].profile_slug : null;
            if(row){ pfGo(row); return; }
            pfStuck('No profile on this account',
              'Signed in as '+(user.email||'this account')+'. There is no profile linked to it yet.',
              [{label:'Create my profile', primary:true, go:function(){ pfClaim(user); }},
               {label:'Dashboard', go:function(){ location.href='/dashboard'; }},
               {label:'Sign out', go:function(){ pfSignOut().then(function(){ location.href='/'; }); }}]);
          });
      }).catch(function(){
        pfStuck('Could not load your profile',
          'The lookup failed rather than coming back empty, so this is not a missing profile. Trying again usually works.',
          [{label:'Try again', primary:true, go:function(){ location.reload(); }},
           {label:'Dashboard', go:function(){ location.href='/dashboard'; }},
           {label:'Sign out', go:function(){ pfSignOut().then(function(){ location.href='/'; }); }}]);
      });
  }

  /* claim_profile() has existed in the database the whole time and was called from nowhere,
     which is why no account could ever get a profile through the site. */
  function pfClaim(user){
    var suggested=(user.email||'').split('@')[0].replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase();
    var handle=prompt('Choose your profile handle (letters, numbers and dashes):', suggested||'');
    if(!handle) return;
    SB.rpc('claim_profile',{p_handle:handle, p_display:''}).then(function(r){
      if(r && !r.error && r.data){ pfGo(r.data); return; }
      pfStuck('That handle did not work',
        (r && r.error && r.error.message) ? r.error.message : 'The handle may already be taken.',
        [{label:'Try another', primary:true, go:function(){ pfClaim(user); }},
         {label:'Dashboard', go:function(){ location.href='/dashboard'; }}]);
    }).catch(function(){
      pfStuck('Could not create the profile','The request did not complete. Nothing was changed.',
        [{label:'Try again', primary:true, go:function(){ pfClaim(user); }},
         {label:'Dashboard', go:function(){ location.href='/dashboard'; }}]);
    });
  }

  applyProfile(); renderAll();
  if(!PROFILE_SLUG){
    /* No slug: send a logged-in user to THEIR profile, else to login.
       ⚠ The no-profile destination was /create-profile.html, which does not exist. It is the
       DASHBOARD now, not /profile?edit=1: this whole branch is guarded by !PROFILE_SLUG,
       so sending them back to a slugless profile.html would run this same code again and
       loop. */
    /* ── WHY THIS IS NO LONGER A REDIRECT (Founder 2026-09-23) ───────────────────────────
       This branch used to end in location.replace('/dashboard') for every outcome that was
       not a slug. The dashboard's own "Edit profile" link falls back to /profile?edit=1 when
       it cannot resolve a slug, and /profile?edit=1 has no slug, so it came straight back
       here and bounced again: dashboard -> profile -> dashboard, with nothing said. An owner
       WITH a profile was sent away from it and given no reason.

       The cause it could not see: getSession() reads local storage, so an expired or
       refresh-failed token still looks signed in. The RPC then runs unauthenticated, returns
       null, and the page reads that as "no profile" rather than "not really signed in".
       getUser() asks the server, so a stale session is named instead of misread.

       Three outcomes now, and none of them is a silent redirect:
         valid session + slug  -> the profile (unchanged)
         valid session, no slug-> a panel offering to create one
         stale/missing session -> a panel saying so, with a way back in            */
    if(SB){ resolveMyProfile(); }
    else { location.replace('/apply'); }
  } else if(SB){
    SB.auth.getSession().then(function(r){ SESSION=(r&&r.data)?r.data.session:null; if(SESSION) getNsfwModel(); return checkOwnership(); }).then(function(){ updateOwnerUI(); try{applyProfileTabs();}catch(e){} loadProfileMeta(); loadFromDB(); loadFollow(); loadCollab(); loadMyTickets(); loadMyEvents(); }).catch(function(){ loadProfileMeta(); loadFromDB(); loadFollow(); loadMyEvents(); });
    SB.auth.onAuthStateChange(function(_e,s){ SESSION=s; if(s) getNsfwModel(); checkOwnership().then(function(){ updateOwnerUI(); try{applyProfileTabs();}catch(e){} loadFromDB(); loadFollow(); loadCollab(); loadMyTickets(); loadMyEvents(); }); });
  } else { loadProfileMeta(); loadFromDB(); }
})();
