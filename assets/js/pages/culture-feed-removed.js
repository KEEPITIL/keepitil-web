/* KEEPITIL culture/index.html: inline script "feed-removed" moved verbatim to an external file (CSP: no executable inline script). */
/* ── CULTURE DESKTOP BLOG FEED REMOVED 2026-08-26 (Founder) ─────────────────────────────
   It rendered 71 cards from a POSTS list whose articles do not exist: all 142 of its links
   pointed at /blog-<slug>.html, and not one of those pages has ever been in this repo —
   confirmed against git history, so this was never a regression, just a long-standing gap.
   An index of 71 articles, none of which can be opened, is worse than no index.
   REMOVED: POSTS, COVERS, cov/col/ordered/catsWith, feedCard, caroCard, renderFeed,
   renderDiscover, renderTypebar, the inline blog expander, setFeedMode, and the #feed
   blog-card click listener.
   KEPT: #feed and #feedNow. They are SHARED — culNav() and culSection() write section
   placeholders into them, so they were never the blog feed's to take. The mobile swipe feed
   (#community-feed) is untouched. */
/* Delegated actions (assets/js/kil-actions.js): the markup carries data-click instead of inline handlers; only the names listed here can run. */
function culBell(){ var b=document.querySelector('.kiln-bell'); if(b){ b.click(); } else { location.href='/apply'; } }
if(window.KilActions) KilActions.allow(["__culCloseWall", "culBell", "culSection", "setCulContentType", "setCulType", "toggleCulGear", "toggleFeedDD", "fbLike", "fbReshareL", "fbSaveL", "fbShare"]);
function toggleFeedDD(e){if(e){e.stopPropagation();}var m=document.getElementById('feedDDMenu');if(m)m.classList.toggle('open');}
/* ── Culture EXPLORE dropdown: radio / battles / games / apps / services ── */
function culNav(section){
  var m=document.getElementById('feedDDMenu'); if(m)m.classList.remove('open');
  if(section==='radio'){ location.href='/earn/'; return; }
  var s=SOON[section]; if(!s) return;
  var cf=document.getElementById('community-feed'); if(cf)cf.style.display='none';
  var f=document.getElementById('feed'); if(f)f.innerHTML='<div class="gate"><div class="i">'+s.i+'</div><h3>'+s.t+'</h3><p>'+s.d+'</p><a href="'+(s.cta||'/apply#plans')+'">'+(s.ctaT||'Join to get early access →')+'</a></div>';
  var now=document.getElementById('feedNow'); if(now)now.textContent=s.t;
}
/* ── Culture sections: Feed / Radio / VS / Givebacks (Founder 2026-07-31) ── */
function culSection(sec){
  var m=document.getElementById('feedDDMenu'); if(m)m.classList.remove('open');
  var feedEls=[document.getElementById('culTypeBar'),document.getElementById('community-feed'),document.getElementById('feed')];
  var panel=document.getElementById('cul-section-panel');
  var now=document.getElementById('feedNow');
  if(sec==='radio'){ location.href='/earn/'; return; }
  /* K5: VS is a destination now (K1), and /create is the real product with 36 published
     competitions. The panel below is static promo copy that predates it and never showed
     a single competition, so Culture routed people to a worse copy of a page that exists.
     Same treatment Radio already had. Nothing new is built here. */
  if(sec==='vs'){ location.href='/create/'; return; }
  if(sec==='feed'){
    feedEls.forEach(function(e){ if(e)e.style.display=''; });
    if(panel){ panel.style.display='none'; panel.innerHTML=''; }
    if(now)now.textContent='Feed';
    /* cul-fs (full-screen snap cards) belonged to the pager; without it the feed just scrolls. */
    if(typeof applyCulFilters==='function') applyCulFilters();
    return;
  }
  document.body.classList.remove('cul-fs');
  feedEls.forEach(function(e){ if(e)e.style.display='none'; });
  if(now)now.textContent=(sec==='vs'?'VS':'Givebacks');
  if(!panel) return; panel.style.display='block';
  if(sec==='vs'){
    panel.innerHTML='<div class="cul-sec-h">⚔️ VS — Artist Battles</div><div class="cul-sec-sub">DJ mixes, paint, photo &amp; video battles — submitted content only. Enter a challenge and let the scene vote.</div>'
      +'<div class="gb-grid">'
      +'<a class="gb-card" href="/submit-event?vs=dj"><div class="gb-k">DJ</div><h3>Mix Battle</h3><p>Submit a mix and go head-to-head.</p></a>'
      +'<a class="gb-card" href="/submit-event?vs=photography"><div class="gb-k">Photo</div><h3>Image Challenge</h3><p>Enter your best shot.</p></a>'
      +'<a class="gb-card" href="/submit-event?vs=videography"><div class="gb-k">Video</div><h3>Video Challenge</h3><p>Submit a clip or edit.</p></a>'
      +'<a class="gb-card" href="/submit-event?vs=song"><div class="gb-k">Open</div><h3>Song / Paint / etc.</h3><p>Any craft — enter your work.</p></a>'
      +'</div>';
  } else if(sec==='givebacks'){
    panel.innerHTML='<div class="cul-sec-h">💚 Givebacks</div><div class="cul-sec-sub">Every link supports the scene — shop, donate, or sign up. Amazon links are affiliate; KEEPITIL earns from qualifying purchases.</div>'
      +'<div class="gb-grid">'
      /* Shop card removed 2026-08-26: /shop.html does not exist and there is no shop route to point it at. */
      +'<a class="gb-card" href="https://www.amazon.com/?tag=tuitea09-20" target="_blank" rel="noopener sponsored nofollow"><div class="gb-k">Affiliate</div><h3>Rave Essentials</h3><p>Curated gear on Amazon. #ad</p></a>'
      +'<a class="gb-card" href="https://distrokid.com/vip/seven/2860536" target="_blank" rel="noopener sponsored"><div class="gb-k">Referral</div><h3>DistroKid</h3><p>7% off your first year of distribution.</p></a>'
      +'<a class="gb-card" href="https://freecash.com/r/Tuitea" target="_blank" rel="noopener sponsored"><div class="gb-k">Referral</div><h3>FreeCash</h3><p>Earn while you support the scene.</p></a>'
      +'</div>';
  }
}
/* ── logged-in gear: Type (all/following/followers/circle) + Filter (feed/articles/user) + content-type (Filter A) ── */
/* culContentType defaults to 'video' — the Founder's default feed (2026-08-26). It was
   'all'; with articles now in the merge that meant the page opened on a mixed list
   rather than the video feed people come here for. */
var culType='all', culFilter='feed', culContentType='video';
var CUL_AGENTS={cho:1,atlas:1,pulse:1,xus:1,sentinel:1,oracle:1,fable:1,nova:1,luna:1,lyric:1,vibe:1,scout:1,merch:1,beacon:1};
function toggleCulGear(e){if(e){e.stopPropagation();}var m=document.getElementById('culGearMenu');if(m)m.classList.toggle('open');}
function _culMark(attr,val){[].forEach.call(document.querySelectorAll('#culGearMenu button['+attr+']'),function(b){b.classList.toggle('on',b.getAttribute(attr)===val);});}
function setCulType(t){ culType=t; _culMark('data-ct',t); applyCulFilters(); }
function setCulFilter(f){ culFilter=f; _culMark('data-cf',f); applyCulFilters(); }
function setCulContentType(t){
  culContentType=t;
  /* ONE setter drives BOTH surfaces. The bar and the metric row are two doors into the same
     state, not two filters — marking only the bar was how they would drift. */
  [].forEach.call(document.querySelectorAll('#culTypeBar button'),function(b){
    var on=b.getAttribute('data-tp')===t;
    b.classList.toggle('on',on);
    b.setAttribute('aria-selected',on?'true':'false');
  });
  /* .stat.photos keeps its CLASS (it is a colour hook) but now means CREATE. */
  var METRIC={article:'articles',create:'photos',video:'videos'};
  [].forEach.call(document.querySelectorAll('.stats .stat'),function(el){
    el.classList.toggle('on', el.classList.contains(METRIC[t]||''));
  });
  applyCulFilters();
}
/* ── FILTER BAR: DIRECTIONAL OVERLAY, MOBILE ONLY (Founder 2026-08-28) ────────────────────
   Forward through the feed (finger up, content moves up, scrollTop RISING) -> hide at once.
   Reversing back toward the top (finger down, scrollTop FALLING)           -> reveal briefly.
   No interaction within HIDE_MS -> it leaves on its own.

   Desktop is deliberately untouched: the CSS overlay rules live inside @media(max-width:860px)
   and this controller returns early above that width, so the desktop bar stays the sticky
   in-flow control it already was.

   The threshold is not decoration. iOS reports sub-pixel scroll deltas during momentum and at
   the rubber-band limits, and without it a single flick toggles the bar several times — which
   is the flicker the Founder asked to avoid. 6px is below the smallest deliberate drag and
   above the noise. */
(function(){
  var HIDE_MS = 1800;   /* Founder: "roughly 1.5-2 seconds ... intentional rather than flickering" */
  /* ⚠ THE TWO THRESHOLDS ARE DELIBERATELY ASYMMETRIC.
     Hiding is cheap and should be instant, so any real downward movement triggers it.
     REVEALING must survive a snap settle. This feed is scroll-snap-type:y mandatory with
     full-viewport cards, so every forward swipe ENDS in the browser animating the card into
     place — and that settle can overshoot and correct UPWARD by a few pixels. Under one
     symmetric threshold that upward correction reads as "the user reversed" and the bar would
     flash at the end of every single swipe forward, which is precisely the flicker this is
     meant to avoid. So a reveal needs sustained upward travel, accumulated across events,
     not one upward frame. A deliberate reverse swipe moves hundreds of pixels; a settle
     correction moves tens at most. */
  var DOWN_HIDE  = 6;    /* any real forward movement hides at once */
  var UP_REVEAL  = 28;   /* cumulative upward travel required to reveal */
  function mob(){ try{ return window.matchMedia('(max-width:860px)').matches; }catch(e){ return false; } }

  var bar = null, timer = null, upAcc = 0;
  var lastY = window.pageYOffset || document.documentElement.scrollTop || 0;

  function el(){ return bar && document.contains(bar) ? bar : (bar = document.getElementById('culTypeBar')); }
  function hide(){
    if(timer){ clearTimeout(timer); timer = null; }
    upAcc = 0;                   /* a new reveal must earn its travel again */
    document.body.classList.remove('cul-fbar');
  }
  function arm(){ if(timer) clearTimeout(timer); timer = setTimeout(hide, HIDE_MS); }
  function show(){
    if(!el()) return;
    document.body.classList.add('cul-fbar');
    arm();                       /* every reveal restarts the clock */
  }

  window.addEventListener('scroll', function(){
    if(!mob()) return;
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    var d = y - lastY;
    lastY = y;
    if(d > DOWN_HIDE){                    /* moving forward through the feed */
      hide();                             /* (hide() also clears upAcc) */
    } else if(d < 0){                     /* heading back up */
      upAcc += -d;
      if(upAcc >= UP_REVEAL){ upAcc = 0; show(); }
    }
  }, {passive:true});

  /* Touching the bar means the visitor is using it — do not pull it away mid-decision.
     Choosing a filter dismisses it, because the choice is made and the feed underneath is
     what they want to see. */
  document.addEventListener('pointerdown', function(e){
    var b = el(); if(!b || !document.body.classList.contains('cul-fbar')) return;
    if(b.contains(e.target)) arm();
  }, {passive:true, capture:true});
  document.addEventListener('click', function(e){
    var b = el(); if(!b || !b.contains(e.target)) return;
    if(e.target.closest('button')) setTimeout(hide, 260);   /* let the .on state paint first */
    else arm();
  }, true);

  /* A filter chosen from the METRIC row (the other door) happens while the overlay is hidden;
     nothing to reveal, and nothing to keep open. */
  window.addEventListener('resize', function(){ if(!mob()) hide(); });
})();

/* Keyboard parity for the metric row: it is role="button", so it must answer Enter and Space. */
document.addEventListener('keydown',function(e){
  if(e.key!=='Enter' && e.key!==' ') return;
  var st=e.target && e.target.closest && e.target.closest('.stats .stat'); if(!st) return;
  e.preventDefault(); if(st.onclick) st.onclick();
});
/* K5 — PIX matched nothing.
   It tested kind==='photo'||'image', and profile_content has no such kind: the values are
   post, event and article. So the Pix tab was live in the nav and returned an empty feed,
   while 201 rows DO carry an image — at data.img, not as a kind. That is why the directive
   lists PIX at 201 while the tab showed zero.
   Takes the whole row now, because "has a picture" is a property of the row, not of its kind. */
function _culTypeMatch(row){
  /* ⚠ THE THREE FEEDS ARE MUTUALLY EXCLUSIVE (Founder 2026-08-28: "articles needs to only be
     in the article filter feed / photos only stay on the photo filter feed / videos should be
     the default feed").
     THE BUG THIS REPLACES: there was no 'video' branch at all. The function ended in
     `return true`, so ANY filter other than all/article/image matched every row — and since
     culContentType defaults to 'video', the default feed was silently "everything". Measured
     on production at 375px: culContentType==='video' with 133 cards rendered, of which 33 were
     not videos. Articles and posts were sitting in the video feed for exactly this reason.
     The tail is now `return false`: an unrecognised filter shows NOTHING rather than
     everything, so the next filter added here fails loudly instead of leaking every row. */
  var k  = String((row && row.kind) || '').toLowerCase();
  var mk = String((row && row.media_kind) || '').toLowerCase();
  var d  = (row && row.data) || {};

  if(culContentType === 'all') return true;

  if(culContentType === 'article') return k === 'article';

  if(culContentType === 'video'){
    /* culMediaToRow() maps media_kind 'photo' -> kind 'pixle' and everything else -> 'video',
       so kind alone separates the media feeds. embed_url is required as well: a video row with
       no embed cannot play, and a card that cannot play does not belong in a video feed.
       CREATE work is excluded even when it is a video — it has its own stream now. */
    if(k !== 'video') return false;
    var em = d.embed_url;
    return typeof em === 'string' && em.trim() !== '';
  }

  if(culContentType === 'create'){
    /* ⚠ CREATE REPLACED PHOTO (Founder 2026-08-28 §2/§5): "Culture now has exactly three
       content filters: ARTICLE · CREATE · VIDEO. Remove PHOTO."
       A CREATE item is submitted creative work tied to a valid CREATE entry — identified by
       the entry relationship, never by "it happens to be an image". That distinction is the
       whole point: ordinary profile photos and stray Culture images must not appear here.
       Legacy photo rows are NOT deleted (§2) — they simply no longer have a surface. */
    return k === 'create' && !!row.vs_entry_id;
  }

  return false;
}
function applyCulFilters(){
  var box=document.getElementById('community-feed'); if(!box||!window.__culRenderRows) return;
  var cf=document.getElementById('community-feed'); if(cf)cf.style.display='';
  /* Source the MERGED list (feed + approved media). Reading __culAllRows here is what kept
     videos out of every signed-in render. */
  var rows=(window.__culMerged || window.__culAllRows || []).slice();
  /* Filter A — content type */
  /* Archived rows are removed content and must never render. The feed never filtered
     them: 280 of 628 rows — 45% of what Culture showed — were archived. Live totals are
     article 294, event 43, post 11. */
  rows=rows.filter(function(x){ return !x.archived; });
  rows=rows.filter(function(x){ return _culTypeMatch(x); });
  /* Filter (gear) */
  if(culFilter==='articles'){ rows=rows.filter(function(x){ return x.kind==='article' && CUL_AGENTS[String(x.profile_slug||'').toLowerCase()]; }); }
  else if(culFilter==='user'){ rows=rows.filter(function(x){ return !CUL_AGENTS[String(x.profile_slug||'').toLowerCase()]; }); }
  /* Type (gear) — all / following (Followers and Circle are hidden until follower_handles() exists in production) */
  var fg=window.__culFollowing||{};
  if(culType==='following'){ rows=rows.filter(function(x){ return fg[String(x.profile_slug||'').toLowerCase()]; }); }
  /* Year / month filtering and chronological grouping live in one place so every category
     (ARTICLE, CREATE, VIDEO) gets the same treatment. See the mobile month block below. */
  if(window.__culApplyMonth) rows = window.__culApplyMonth(rows);
  window.__culRenderRows(rows);
  if(culType!=='all' && !rows.length){
    box.innerHTML='<div class="gate"><div class="i">👥</div><h3>Nothing here yet</h3><p>No posts in your '+culType+' yet — follow more of the scene.</p><a href="/connect/">Browse the directory →</a></div>';
  }
}
function loadCulRelations(){
  var sb=window.__culSB; if(!sb||window.__culRelLoaded) return; window.__culRelLoaded=true;
  sb.rpc('my_profile_slug').then(function(rr){ var me=rr&&!rr.error?rr.data:null;
    sb.auth.getUser().then(function(ur){ var uid=ur&&ur.data&&ur.data.user?ur.data.user.id:null;
      if(uid){ sb.from('follows').select('profile_slug').eq('follower_id',uid).then(function(r){ var m={}; ((r&&r.data)||[]).forEach(function(x){m[String(x.profile_slug).toLowerCase()]=1;}); window.__culFollowing=m; }); }
      /* KEEPITIL 1.0 (Grok 2026-11-24): the Followers and Circle views are hidden. They need public.follower_handles(), which does not exist in production
         yet (a reviewed draft waits for Grok's GO), so this page makes NO follower_handles call and shows no empty Followers/Circle list. Following still works. */
    });
  }).catch(function(){});
}
/* Full-screen one-item-per-screen scroll ON by default on mobile (Founder 2026-07-31) */
/* cul-fs disabled with the pager 2026-08-20 — see mountCulturePager. */
/* ── MOBILE swipe (Founder 2026-08-02): horizontal swipe cycles the subfilter (type) pages of the
   current section; if the current section has no subfilter bar, it cycles the EXPLORE pages. ── */
(function(){

  function isMob(){ try{ return window.matchMedia('(max-width:860px)').matches; }catch(e){ return false; } }
  var SECS=['feed','radio','vs','givebacks'], NOWMAP={'Feed':'feed','VS':'vs','Givebacks':'givebacks'};
  function culToast(t){ var el=document.getElementById('culSwToast'); if(!el){ el=document.createElement('div'); el.id='culSwToast'; el.className='cul-sw-toast'; document.body.appendChild(el); } el.textContent=t; el.classList.add('on'); clearTimeout(el._t); el._t=setTimeout(function(){ el.classList.remove('on'); },850); }
  var x0=null,y0=null,t0=0;
  document.addEventListener('touchstart',function(e){
    if(!isMob()){ x0=null; return; }
    var t=e.target;
    if(t&&t.closest&&t.closest('.cul-typebar,.feeddd-menu,.cul-gear-menu,#kil-bnav,#kil-radio,input,textarea,select,.fb-pmenu')){ x0=null; return; }
    var tt=e.touches[0]; x0=tt.clientX; y0=tt.clientY; t0=Date.now();
  },{passive:true});
  document.addEventListener('touchend',function(e){
    if(x0==null) return;
    var tt=e.changedTouches[0]; var dx=tt.clientX-x0, dy=tt.clientY-y0, dt=Date.now()-t0; x0=null;
    if(dt>700) return; if(Math.abs(dx)<55 || Math.abs(dx)<Math.abs(dy)*1.7) return;
    var bar=document.getElementById('culTypeBar');
    /* ⚠ offsetParent IS ALWAYS null FOR A position:fixed ELEMENT, so this test alone reported
       the mobile overlay as hidden even while it was on screen, and a horizontal swipe fell
       through to page navigation instead of changing filter. The overlay's own state is the
       body class; the desktop bar is still in flow and keeps the offsetParent test. */
    var vis=bar && getComputedStyle(bar).display!=='none' &&
            (document.body.classList.contains('cul-fbar') || bar.offsetParent!==null);
    if(vis){
      var btns=[].slice.call(bar.querySelectorAll('button')); if(!btns.length) return;
      var ci=0; for(var k=0;k<btns.length;k++){ if(btns[k].classList.contains('on')){ ci=k; break; } }
      var ni=dx<0?(ci+1)%btns.length:(ci-1+btns.length)%btns.length;
      btns[ni].click(); culToast(btns[ni].textContent);
    } else if(typeof culSection==='function'){
      var now=((document.getElementById('feedNow')||{}).textContent||'Feed').trim();
      var cur=NOWMAP[now]||'feed'; var ci2=SECS.indexOf(cur); if(ci2<0)ci2=0;
      var ni2=dx<0?(ci2+1)%SECS.length:(ci2-1+SECS.length)%SECS.length;
      culSection(SECS[ni2]); culToast(SECS[ni2].toUpperCase());
    }
  },{passive:true});
})();
document.addEventListener('click',function(e){var d=document.getElementById('feedDD');var m=document.getElementById('feedDDMenu');if(m&&m.classList.contains('open')&&d&&!d.contains(e.target))m.classList.remove('open');
  var gm=document.getElementById('culGearMenu');var gb=document.getElementById('cul-gear');if(gm&&gm.classList.contains('open')&&!gm.contains(e.target)&&e.target!==gb)gm.classList.remove('open');});
window.culPostMenu=function(e,slug,url){ try{e.preventDefault();e.stopPropagation();}catch(x){}
  var ex=document.getElementById('culPMenu'); var was=ex&&ex._for===slug; if(ex)ex.remove(); if(was)return;
  var m=document.createElement('div'); m.id='culPMenu'; m.className='fb-pmenu'; m._for=slug;
  m.innerHTML='<button data-a="prof">View profile</button><button data-a="copy">Copy link</button><button data-a="report">Report post</button>';
  document.body.appendChild(m);
  var b=(e&&(e.currentTarget||e.target))||null; if(b&&b.getBoundingClientRect){var r=b.getBoundingClientRect(); m.style.top=(r.bottom+window.scrollY+6)+'px'; m.style.left=Math.max(8,(r.right+window.scrollX-m.offsetWidth))+'px';}
  m.querySelector('[data-a=prof]').onclick=function(){ location.href=url; };
  m.querySelector('[data-a=copy]').onclick=function(){ try{navigator.clipboard.writeText(location.origin+url);}catch(x){} m.remove(); };
  m.querySelector('[data-a=report]').onclick=function(){ m.remove(); alert('Thanks — this post has been flagged for review.'); };
  setTimeout(function(){ document.addEventListener('click',function hh(ev){ var mm=document.getElementById('culPMenu'); if(mm&&!mm.contains(ev.target)){mm.remove();} document.removeEventListener('click',hh); }); },0);
};
