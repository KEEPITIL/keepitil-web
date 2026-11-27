/* KEEPITIL connect/index.html: inline script "roster" moved verbatim to an external file (CSP: no executable inline script). */
// roster reset 2026-07-21 — rebuild from Google Sheet + web research. Seeded with the 2 gold standards.
/* ARTISTS COME FROM ARTICLES (Founder 2026-08-26: "public view profiles will not be on the
   connected page. just article artist template").
   The seed used to hardcode Groove Trooper with a SoundCloud avatar and a link to
   /profile.html. Both are gone: the roster is now whatever has an artist article, the
   picture is his current profile picture, and the card opens the article. Empty here so
   there is exactly one source of truth — see the blog_articles fetch below. */
const ART=[],BRND=[],ORG=[],VEN=[
  /* BLEU — corrected 2026-08-20. Was hardcoded here with an image from bleuxo.net named
     BleuDailyMeals.jpg: a MEAL-PREP graphic, not the event space, and the wrong city
     (Santa Ana; BLEU is in Westminster). This seed overrode the venues table, which has held
     the correct logo at /venues/bleu-logo.png since 2026-08-18 — the reason the card kept
     showing food no matter how many times the database was fixed.
     Kept as a seed so the card renders before the Supabase fetch returns, but every field now
     matches the venues row. */
  {name:'BLEU',city:'Westminster',county:'Orange County',genre:'Event Space / Live Music',ig:'xoeventspace',img:'/venues/bleu-2x3.jpg?v=20260823',color:'var(--brand)',blog:'/venue?v=bleu',keepitil:true,type:'Event Space'}
];
// Each item carries kinds=[...]; multi-category profiles (once claimed) can list several.
let DATA=[].concat(
  ART.map(x=>Object.assign({},x,{kinds:['artist']})),
  BRND.map(x=>Object.assign({},x,{kinds:['brand']})),
  ORG.map(x=>Object.assign({},x,{kinds:['organizer']})),
  VEN.map(x=>Object.assign({},x,{kinds:['venue']}))
);
const KL={artist:'Artist',brand:'Brand',organizer:'Organizer',venue:'Venue'};
/* BRANDS ABSORBS ORGANIZERS at the filter level (Founder 2026-08-31). One place decides what
   a tab matches, so the count in the header and the list in the grid can never disagree. */
const KIND_MATCH={artist:['artist'],brand:['brand','organizer'],venue:['venue'],community:['community']};
const matchesKind=(x,k)=>(KIND_MATCH[k]||[k]).some(kk=>(x.kinds||[]).includes(kk));
const cnt=k=>DATA.filter(x=>matchesKind(x,k)).length;
cA.textContent=cnt('artist');cB.textContent=cnt('brand');cO.textContent=cnt('community');cV.textContent=cnt('venue');
// ---- genre buckets (tightened) ----
const BUCKETS=[['House',['house','tech house','deep house','bass house','latin house','jackin house','soulful house','organic house','disco tech','afro house','afro','disco']],
['Techno',['techno','hard techno','minimal techno','deep techno','dark techno','acid techno','ambient techno','melodic techno','peak-time','hypnotic','industrial','minimal','deep tech','psychedelic industrial techno','acid']],
['Bass',['bass','bass music','dubstep','riddim','tearout','hybrid trap','heavy bass']],
['Drum & Bass',['dnb','drum and bass','jungle','breaks']],
['Trance',['trance','tech trance','progressive']],
['Hard',['hardcore','hardstyle','hard']],
['UKG / Garage',['ukg','uk garage','garage','speed garage','uk bass','bassline','club','bounce','ghetto-tech']],
['Experimental',['experimental','leftfield','electronica','electro','future bass','ambient']]];
function splitv(s){return (s||'').split('/').map(t=>t.trim()).filter(Boolean);}
function bucketOf(g){g=g.toLowerCase();for(const[b,l]of BUCKETS){if(l.includes(g))return b;}return 'Other';}
function artistBuckets(){const items=DATA.filter(x=>x.kinds.includes('artist'));const present=new Set();items.forEach(x=>splitv(x.genre).forEach(g=>present.add(bucketOf(g))));return BUCKETS.map(b=>b[0]).concat(['Other']).filter(b=>present.has(b));}
function typeValues(kind){const items=DATA.filter(x=>matchesKind(x,kind));return [...new Set(items.flatMap(x=>splitv(x.category||x.type)))].sort();}
/* DEFAULT IS COMMUNITY, ALWAYS (Founder 2026-08-31, confirmed after review).
   2026-09-03: the landing category is ARTISTS (Founder). This reverses the 2026-08 decision
   that made COMMUNITY the default. It is still a product decision rather than a function of
   how much data exists — the decision simply changed. Order stays Artists · Brands ·
   Community · Venues. */
/* ── DEEP LINK BY KIND (Founder 2026-09-08) ────────────────────────────────────────
   CONNECT held `kind` as internal state only, so there was no URL that meant "the brands
   view" - which is why an "All Brands" link had nowhere legitimate to point and ended up
   at /brand/, a directory with no index. ?kind= gives each segment an addressable URL.
   ARTISTS REMAINS THE DEFAULT: an absent or unrecognised value falls through to 'artist',
   so the approved landing state is unchanged for every visitor who arrives without one. */
let kind='artist',q='',sub=null; // sub={facet:'genre'|'type',val}
try{
  var _k=new URLSearchParams(location.search).get('kind');
  if(_k && ['artist','brand','community','venue'].indexOf(_k)!==-1) kind=_k;
}catch(e){}
function initials(n){return (n||'?').split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();}
function desc(x){return x.genre||x.category||x.type||'';}
function escHtml(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function kilSafeUrl(url){return (window.KilSafeHtml&&KilSafeHtml.kilSafeUrl(url))||'';}
function card(x){
  const d=desc(x);const ig=x.ig?('@'+x.ig):'';
  /* No dead links (Atlas 2026-07-16): internal profile if it exists, else the org's Instagram (new tab), else a non-clickable card. Never href="#". */
  const igurl=x.ig?('https://instagram.com/'+String(x.ig).replace(/^@/,'').trim()):'';
  /* blog already starts with "/"; only add a leading slash if it's missing. A double slash ("//path") is a protocol-relative URL and sends every card to a dead domain. */
  const hrefRaw=x.blog?(String(x.blog).charAt(0)==='/'?x.blog:'/'+x.blog):(igurl||'');
  const href=(window.KilSafeHtml&&KilSafeHtml.safeNavUrl(hrefRaw))||'';
  const ext=!x.blog && !!igurl && !!href;
  const imgUrl=kilSafeUrl(x.img);
  const img=imgUrl?('<img loading="lazy" referrerpolicy="no-referrer" src="'+escHtml(imgUrl)+'" alt="" data-fb="hide"/>'):'';
  const fb='<div class="fallback" style="background:linear-gradient(135deg,'+escHtml(x.color||'#6d28d9')+',#111)">'+escHtml(initials(x.name))+'</div>';
  const chips=(x.kinds||[]).map(k=>'<span class="kind '+escHtml(k)+'">'+(KL[k]||escHtml(k))+'</span>').join('');
  const inner='<div class="imgw"><div class="kinds">'+chips+'</div>'+img+fb+'</div>'
    +'<div class="body"><div class="nm">'+escHtml(x.name||'')+'</div><div class="desc">'+escHtml(d)+'</div>'
    +(x.city?'<div class="loc">◍ '+escHtml(x.city)+(x.county?' · '+escHtml(String(x.county).replace(' County',' Co.')):'')+'</div>':'')
    +(ig?'<div class="ig">'+escHtml(ig)+(ext?' ↗':'')+'</div>':'')+'</div>';
  if(href) return '<a class="card" href="'+escHtml(href)+'"'+(ext?' target="_blank" rel="noopener noreferrer"':'')+'>'+inner+'</a>';
  return '<div class="card nolink" style="cursor:default">'+inner+'</div>';
}
function renderSubs(){
  const box=document.getElementById('subs');
  if(!kind){box.classList.remove('show');box.innerHTML='';return;}
  /* ARTISTS HAS NO GENRE ROW (Founder 2026-09-05). Removed at the source as well as in CSS so
     the row is never built, never measured, and can never wrap into a third control row. */
  if(kind==='artist'){ box.classList.remove('show'); box.innerHTML=''; return; }
  const parts=[];
  if(kind==='artist'){
    const gb=artistBuckets();
    if(gb.length>1){parts.push('<span class="sf-label">Genre</span>');gb.forEach(v=>parts.push('<button class="chip'+(sub&&sub.facet==='genre'&&sub.val===v?' on':'')+'" data-f="genre" data-v="'+v+'">'+v+'</button>'));}
  } else {
    const tv=typeValues(kind);
    if(tv.length>1){parts.push('<span class="sf-label">Type</span>');tv.forEach(v=>parts.push('<button class="chip'+(sub&&sub.facet==='type'&&sub.val===v?' on':'')+'" data-f="type" data-v="'+v.replace(/"/g,'')+'">'+v+'</button>'));}
  }
  box.innerHTML=parts.join('');box.classList.toggle('show',parts.length>0);
}
function matchSub(x){
  if(!sub)return true;
  if(sub.facet==='genre'){return splitv(x.genre).some(g=>bucketOf(g)===sub.val);}
  return ((x.type||'')+' '+(x.category||'')).toLowerCase().includes(sub.val.toLowerCase());
}
function pinnedCard(){
  /* LOCKED FIRST CARD (Founder 2026-11-23): the first slot of the default Artists grid is
     always the Get Featured card — a 2:3 image linking to the standalone form page. */
  return '<a class="card" href="/connect/get-featured" aria-label="Get Featured — free artist article">'
    +'<div class="imgw"><div class="kinds"><span class="kind artist">Artist</span></div>'
    +'<img loading="lazy" referrerpolicy="no-referrer" src="/assets/images/get-featured-card.jpg" alt="Get Featured — your free artist article" data-fb="hide"/>'
    +'<div class="fallback" style="background:linear-gradient(135deg,#6d28d9,#111)">GF</div></div>'
    +'<div class="body"><div class="nm">Get Featured</div><div class="desc">Free artist article</div>'
    +'<div class="loc">\u25CD KEEPITIL Connect</div></div></a>';
}
function render(){
  /* COMMUNITY takes over the main area; the directory grid is not a fit for it and the two
     must not both be on screen. body.comm-on is the single switch. */
  document.body.classList.toggle('comm-on', kind==='community');
  /* Published so CSS can scope per-filter rules without a second switch. */
  try{ document.body.dataset.kind = kind; }catch(e){}
  if(kind==='community'){
    document.getElementById('count').textContent='';
    if(window.__commActivate) window.__commActivate();
    return;
  }
  const ql=q.trim().toLowerCase();
  const list=DATA.filter(x=>{
    if(!matchesKind(x,kind))return false;
    if(!matchSub(x))return false;
    if(ql){const h=((x.name||'')+' '+(x.city||'')+' '+desc(x)).toLowerCase();if(!h.includes(ql))return false;}
    return true;
  });
  /* ARTISTS LEAD (Founder 2026-08-26: "by default all artist profile at the top of the connect
     page"). Applies to the default All view; once a specific category is selected the list is
     already single-kind and this is a no-op. Stable sort — within artists, and within everything
     else, the existing order (articles newest-first, then venues) is preserved. */
  /* The artists-lead sort applied to the ALL view, which no longer exists: every view is now
     single-category, so there is nothing left to lead with. */
  const g=document.getElementById('grid');
  /* BROKEN != EMPTY. Community has no rows until its own phase ships; saying "No matches"
     there would read as a search failure rather than a section that has not opened yet. */
  var emptyHtml = (kind==='community' && cnt('community')===0)
    ? '<div class="empty"><div class="big">Community is opening soon</div>'
      + '<div>Learn, ask and share with other creators — communities for DJing, production, '
      + 'writing, art, events and more.</div></div>'
    : '<div class="empty"><div class="big">No matches</div><div>Try another search or filter.</div></div>';
  var pinned=(kind==='artist'&&!ql&&!sub)?pinnedCard():'';
  g.innerHTML=list.length?(pinned+list.map(card).join('')):(pinned||emptyHtml);
  document.getElementById('count').textContent=list.length+' of '+DATA.length;
}
/* Mark the deep-linked segment active on load, or the URL and the UI disagree. */
try{
  var _seg=document.getElementById('seg');
  if(_seg) [..._seg.children].forEach(c=>c.classList.toggle('on', c.dataset.k===kind));
  document.body.dataset.kind=kind;
}catch(e){}
document.getElementById('seg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;kind=b.dataset.k;sub=null;[...e.currentTarget.children].forEach(c=>c.classList.toggle('on',c===b));renderSubs();render();});
/* Paint the initial selection from defaultKind() rather than hard-coding class="on" in the
   markup, so the two cannot drift apart. */
[...document.getElementById('seg').children].forEach(c=>c.classList.toggle('on',c.dataset.k===kind));
document.getElementById('subs').addEventListener('click',e=>{const c=e.target.closest('.chip');if(!c)return;const f=c.dataset.f,v=c.dataset.v;sub=(sub&&sub.facet===f&&sub.val===v)?null:{facet:f,val:v};renderSubs();render();});
document.getElementById('q').addEventListener('input',e=>{
  q=e.target.value;
  /* One box, two lists: Community filters its own rows, everything else filters the grid. */
  if(kind==='community' && window.__commSetQuery){ window.__commSetQuery(q); return; }
  render();
});
renderSubs();render();
/* ---- LIVE DIRECTORY: pull from Google Sheet master (1UU2). OPT-IN, OFF BY DEFAULT.
   Why off: the sheet is not publicly shared (anonymous HTTP 401), so every page view made a failing
   cross-origin request (CORS block + ERR_FAILED in the console) and silently kept the built-in roster anyway.
   The sheet data also still needs cleaning (duplicate/mistyped rows, dead profile links), so it must not go live by accident.
   Decision (Joe/KODE): do not re-share the sheet; stop fetching by default, keep the code.
   To turn it on deliberately: open /connect/?sheet=1 (the sheet must be shared and its data cleaned first).
   Default = zero requests to docs.google.com. Falls back to built-in roster if sheet unreachable. ---- */
(function(){
  var SHEET='1UU2rPPwsIRCFnZBgk6Uzb9IRcckcBmvYVORNVMFtIoo';
  var TQ='https://docs.google.com/spreadsheets/d/'+SHEET+'/gviz/tq?sheet=Untitled&headers=1&tqx=out:json';
  function cell(c,i){return (c&&c[i]&&c[i].v!=null)?String(c[i].v):'';}
  if(/[?&]sheet=1(?:&|$)/.test(location.search)) fetch(TQ).then(function(r){return r.text();}).then(function(t){
    var m=t.match(/setResponse\(([\s\S]*?)\);?\s*$/); if(!m) throw 0;
    var j=JSON.parse(m[1]); var rows=(j.table&&j.table.rows)||[]; var live=[];
    rows.forEach(function(row){
      var c=row.c||[]; var kind=cell(c,1).toLowerCase().trim(); var name=cell(c,2).trim();
      var lv=cell(c,9).toLowerCase().trim();
      if(!name||!kind) return;
      if(lv && lv!=='yes' && lv!=='true' && lv!=='1') return;              // live=no hides it
      live.push({_order:parseFloat(cell(c,0))||9999, name:name, city:cell(c,3), county:cell(c,4),
        genre:cell(c,5), ig:cell(c,6), img:cell(c,7), blog:cell(c,8),
        type:(kind==='artist'?'DJ':''), kinds:[kind]});
    });
    if(!live.length) throw 0;
    live.sort(function(a,b){return a._order-b._order;});
    DATA=live;
    cA.textContent=cnt('artist');cB.textContent=cnt('brand');cO.textContent=cnt('community');cV.textContent=cnt('venue');
    renderSubs();render();
  }).catch(function(){/* sheet not shared/unreachable -> keep built-in roster */});
})();
/* ---- LIVE DB PROFILES: auto-created venues + claimed profiles from Supabase profile_meta, merged into the Scene grid + counts. This is what makes a venue created via an event show up on the Scene. ---- */
(function(){
  var U='https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
  var K='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
  /* One anon key for the page. The Community module reads it from here rather than
     carrying a second copy that could drift from this one. */
  window.__KIL_ANON = K;
  function _dedupe(){ var h={}; DATA.forEach(function(x){ h[String(x.blog||'').toLowerCase()]=1; h[String(x.name||'').toLowerCase()]=1; }); return h; }
  function _refresh(){ cA.textContent=cnt('artist');cB.textContent=cnt('brand');cO.textContent=cnt('community');cV.textContent=cnt('venue'); renderSubs();render(); }
  // claimed artist/brand/organizer profiles from profile_meta
  fetch(U+'/rest/v1/profile_meta?select=slug,display_name,account_type,location,cover_url,avatar_url&account_type=in.(brand,organizer)&status=eq.published',{headers:{apikey:K,Authorization:'Bearer '+K}})
    .then(function(r){return r.json();}).then(function(rows){
      if(!Array.isArray(rows)||!rows.length) return;
      var have=_dedupe();
      rows.forEach(function(p){
        var blog='/profile?slug='+p.slug;
        if(have[blog.toLowerCase()]||have[String(p.display_name||'').toLowerCase()]) return;
        DATA.push({name:p.display_name||p.slug, city:p.location||'', county:'', genre:'', ig:'', img:p.cover_url||p.avatar_url||'', blog:blog, type:(p.account_type==='artist'?'DJ':''), kinds:[p.account_type], keepitil:true});
      });
      _refresh();
    }).catch(function(){});
  /* ARTIST CARDS = ARTIST ARTICLES. One fetch, no join: a featured artist may have no
     profile_meta row at all (RAB3L does not), and joining would have silently dropped them.
     The card opens /article/artist/<slug>, never a public profile. */
  fetch(U+'/rest/v1/blog_articles?select=artist_slug,artist_name,artist_avatar,artist_city,artist_genre,image_url,url,title&artist_slug=not.is.null&status=eq.published&published=is.true&order=published_at.desc',{headers:{apikey:K,Authorization:'Bearer '+K}})
    .then(function(r){return r.json();}).then(function(rows){
      if(!Array.isArray(rows)||!rows.length) return;
      var have=_dedupe();
      rows.forEach(function(a){
        var href = a.url || ('/article/artist/'+a.artist_slug);
        if(have[href.toLowerCase()]) return;
        DATA.push({
          name: a.artist_name || a.title,
          city: a.artist_city || '', county:'',
          genre: a.artist_genre || '',
          ig:'',
          img: a.artist_avatar || a.image_url || '',
          blog: href,
          type:'DJ', kinds:['artist'], keepitil:true
        });
      });
      _refresh();
    }).catch(function(){});

  // venues (incl. auto-created from events) from the venues table -> venue.html
  fetch(U+'/rest/v1/venues?select=slug,name,city,cover_url,logo_url&status=eq.published',{headers:{apikey:K,Authorization:'Bearer '+K}})
    .then(function(r){return r.json();}).then(function(rows){
      if(!Array.isArray(rows)||!rows.length) return;
      var have=_dedupe();
      rows.forEach(function(p){
        var blog='/venue?v='+p.slug;
        if(have[blog.toLowerCase()]||have[String(p.name||'').toLowerCase()]) return;
        DATA.push({name:p.name||p.slug, city:p.city||'', county:'', genre:'', ig:'', img:p.cover_url||p.logo_url||'', blog:blog, type:'Venue', kinds:['venue'], keepitil:true});
      });
      _refresh();
    }).catch(function(){});
})();
