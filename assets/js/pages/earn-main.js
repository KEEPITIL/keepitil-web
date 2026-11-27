/* KEEPITIL earn/index.html: inline script "main" moved verbatim to an external file (CSP: no executable inline script). */
/* One anon key for this page's two public reads (playlists + competitions). Same publishable
   key every other page already ships in its HTML. */
window.KIL_EARN_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
/* genre → emoji + hue for the card image band */
var GENRES=[
 ['Hip-Hop','🎤',280],['House','🏠',200],['Techno','🤖',190],['Bass','🔊',260],['R&B & Soul','💜',300],['Pop','⭐',330],
 ['Rock','🎸',12],['Metal','🤘',0],['Country & Americana','🤠',35],['Latin','💃',20],['Afrobeats & African','🥁',45],
 ['Reggae & Dancehall','🌴',140],['Jazz','🎷',270],['Classical','🎻',220],['Indie & Alternative','🎶',170],['Mixed Discovery','🔀',160]
];
function band(hue,glyph){return '<div class="card-img" style="background:linear-gradient(135deg,hsl('+hue+',70%,42%),hsl('+((hue+40)%360)+',65%,20%))">'+glyph+'</div>';}
/* ── RADIO CAROUSEL (Founder 2026-08-25) ───────────────────────────────────────────────
   Was: one <a> per playlist linking OUT to soundcloud.com. Now each tile selects the station
   on KEEPITIL's own player, because leaving the site to hear a station is not "changes
   playlist and starts its first song".
   Read from platform_config.radio_playlists — the SAME row the radio bar reads — so the page
   and the player can never disagree about which stations exist. */
function kilStationCard(p, i){
  /* Back to the page's standard 2:3 card (Founder 2026-08-25). Structure matches the station
     card this rail used before the carousel — .card + .card-img poster — so it is the same
     size as every other card on the page, from the same CSS rules. Only the behaviour is new:
     a button that selects the station on KEEPITIL's own player, not an <a> out to soundcloud. */
  var cover = p.art
    ? "background-image:url('" + String(p.art).replace(/'/g, "%27") + "')"
    : '';
  return '<button class="station card kr-tile" type="button" data-i="' + i + '" '
    +      'aria-label="Play ' + esc(p.name || 'Playlist') + '">'
    +   '<div class="card-img" style="' + cover + '">' + (p.art ? '' : '\u266a')
    +     '<span class="kr-state"><b>' + esc(p.name || 'Playlist') + '</b>'
    +     '<em data-st>Tap to play</em></span>'
    +   '</div>'
    + '</button>';
}

/* Tap — and ONLY tap — changes station. Delegated, so it survives a repaint of the rail. */
document.addEventListener('click', function(e){
  var t = e.target.closest && e.target.closest('.kr-tile');
  if(!t) return;
  var i = parseInt(t.getAttribute('data-i'), 10);
  if(isNaN(i)) return;
  if(typeof window.__kilRadioSelect === 'function') window.__kilRadioSelect(i);
  else { /* radio script not up yet — reflect the choice locally so the tap is not swallowed */
         kilMarkActive(i); }
});

/* Selection is tap-only; the rail is never re-scrolled by script. See the CSS note above. */
function kilMarkActive(i){
  var grid = document.getElementById('stationGrid'); if(!grid) return;
  var tiles = grid.querySelectorAll('.kr-tile');
  [].forEach.call(tiles, function(t){
    var on = parseInt(t.getAttribute('data-i'),10) === i;
    t.classList.toggle('on', on);
    var st = t.querySelector('[data-st]');
    if(st) st.textContent = on ? 'Now playing' : 'Tap to play';
  });
}

/* HEADER SEARCH BAR (Founder 2026-09-01). The search<->radio swap was removed: the desktop
   controls row is a SEARCH/FILTER bar and must stay one. The page's only Radio bar is the
   global player docked at the foot of the shell. Search/filter is not Radio. */

/* Row 3's transport. The shell bar is hidden on mobile, so these drive the player directly
   through __kilRadioSong() rather than proxying a click at an element that is not on screen. */
document.addEventListener('click', function(e){
  var b = e.target.closest && e.target.closest('#krPrev,#krNext');
  if(!b) return;
  /* #krCur is a hidden data holder now, not a control — the centre is a display. */
  if(typeof window.__kilRadioSong !== 'function') return;
  window.__kilRadioSong(b.id === 'krPrev' ? -1 : 1);
});

/* Row 3 mirrors the shell player. The bar is the only place these values are computed, so this
   listens rather than reading the SoundCloud widget a second time. */
document.addEventListener('kil-radio-state', function(e){
  var d = e.detail || {};
  function put(id, v, fallback){
    var el = document.getElementById(id); if(!el) return;
    el.textContent = (v && String(v).trim()) ? v : fallback;
  }
  /* Founder's rule, same as the bar's: when a neighbour does not exist, name the playlist
     rather than leaving a slot blank. */
  var pl = d.playlist || '';
  put('krPl',  pl,        '\u2014');
  put('krCur', d.current, pl || '\u2014');
  put('krNxt', d.next,    pl || '\u2014');
  if(typeof d.index === 'number') kilMarkActive(d.index);
});

/* ── RADIO DISPLAY CYCLE (Founder 2026-08-31, §10) ──────────────────────────────────────
   The centre alternates between the station/playlist name and the current track rather than
   showing "Playlist — Track" as one cramped string. Fade out, swap, fade in, hold ~2.6s.

   ⚠ PRESENTATION ONLY. This reads #krPl and #krCur, which the kil-radio-state listener above
   already writes. It never touches the SoundCloud widget, never constructs a player and never
   calls a transport, so a text change cannot restart or reseek playback.

   Marquee is conditional: a label that fits is centred and still. Only text wider than the
   display scrolls, and the distance it travels is measured per label rather than guessed. */
(function(){
  /* 4s per side (Founder 2026-09-06). The fade is inside that window, not added to it, so
     a full name is legible for the whole hold rather than for whatever is left after it. */
  var HOLD = 4000, FADE = 450;
  var txt = document.getElementById('krTxt'), sub = document.getElementById('krSub');
  if(!txt) return;
  var state = 0, timer = null;
  function read(id){
    var el = document.getElementById(id);
    var v = el ? (el.textContent || '').trim() : '';
    return (v && v !== '\u2014') ? v : '';
  }
  function paint(label, caption){
    txt.classList.remove('marquee');
    txt.style.removeProperty('--kr-shift');
    txt.textContent = label || '\u2014';
    if(sub) sub.textContent = caption || '';
    /* Measure AFTER the text is in the DOM; scrollWidth is the only honest answer. */
    var over = txt.scrollWidth - txt.clientWidth;
    if(over > 4){
      txt.style.setProperty('--kr-shift', (-over - 8) + 'px');
      txt.classList.add('marquee');
    }
  }
  function tick(){
    var pl = read('krPl'), cur = read('krCur');
    /* With only one of the two known there is nothing to alternate between. */
    if(!pl && !cur){ paint('KEEPITIL RADIO', ''); schedule(); return; }
    if(!cur){ paint(pl, ''); schedule(); return; }
    if(!pl){ paint(cur, ''); schedule(); return; }
    txt.classList.add('fading');
    setTimeout(function(){
      state = state ? 0 : 1;
      if(state) paint(cur, ''); else paint(pl, '');
      txt.classList.remove('fading');
      /* Schedule from the moment the NEW text is on screen, not from the start of the fade.
         Scheduling before the swap made the period HOLD + FADE - measured 5s between
         changes when the brief asked for 4 - so each side was shown for less than its turn. */
      schedule();
    }, FADE);
  }
  function schedule(){ clearTimeout(timer); timer = setTimeout(tick, HOLD); }
  /* Repaint immediately when the broadcast changes, so a station switch is not held back by
     the cycle timer. */
  document.addEventListener('kil-radio-state', function(){
    setTimeout(function(){
      var pl = read('krPl'), cur = read('krCur');
      if(state && cur) paint(cur, ''); else if(pl) paint(pl, '');
    }, 0);
  });
  paint(read('krPl') || 'KEEPITIL RADIO', '');
  schedule();
})();

/* esc() already exists further down this file — not redefined here. */

function renderStations(){
  var grid=document.getElementById('stationGrid');
  if(!grid) return;
  var SUPA='https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
  var KEY=window.KIL_EARN_KEY||'';

  function paint(list){
    if(!list || !list.length){
      /* BROKEN != EMPTY — an empty rail must explain itself. */
      grid.innerHTML='<div class="disc" style="flex:0 0 auto;max-width:80vw;padding:14px 2px">'
        +'No playlists configured yet.</div>';
      var s0=document.getElementById('eS'); if(s0) s0.textContent='0';
      var k0=document.getElementById('krCount'); if(k0) k0.textContent='(0)';
      return;
    }
    grid.innerHTML=list.map(kilStationCard).join('');
    var el=document.getElementById('eS'); if(el) el.textContent=String(list.length);
    /* Row 2 names the source and the size of it. Taken from the SAME list the rail renders,
       so the number can never disagree with the number of cards beside it. */
    var kc=document.getElementById('krCount');
    if(kc) kc.textContent='('+list.length+')';
    /* keepitil-radio.js is deferred and fetches its own config, so it may not exist yet — and
       when it does, its first `kil-radio-state` only fires once the SoundCloud widget reports
       a track. Until then the rail would show no active station at all. Poll briefly for the
       player, mark the active tile, and seed row 3 with the playlist name so the bar is never
       three em-dashes on a working radio. */
    (function sync(n){
      if(typeof window.__kilRadioPlaylists === 'function'){
        var st = window.__kilRadioPlaylists();
        kilMarkActive(st.index);
        var nm = (st.list[st.index] || {}).name || '';
        ['krPl','krCur','krNxt'].forEach(function(id){
          var e = document.getElementById(id);
          if(e && (!e.textContent || e.textContent === '\u2014')) e.textContent = nm || '\u2014';
        });
        /* Do NOT return on the seed. keepitil-radio.js starts with a one-entry placeholder
           playlist and replaces it when platform_config arrives; stopping here pinned the row
           to that placeholder name. Keep polling until the real list (more than the seed) is
           in, and the config broadcast will overwrite this anyway. */
        if(st.list.length > 1) return;
      }
      if(n < 24) setTimeout(function(){ sync(n+1); }, 250);
    })(0);
  }

  fetch(SUPA+'/rest/v1/platform_config?select=value&key=eq.radio_playlists',
        {headers:{apikey:KEY,Authorization:'Bearer '+KEY}})
    .then(function(r){ return r.ok?r.json():null; })
    .then(function(rows){
      var v=rows&&rows[0]&&rows[0].value;
      /* value is a TEXT column holding JSON, so it arrives as a string. */
      if(typeof v==='string'){ try{ v=JSON.parse(v); }catch(e){ v=null; } }
      paint(v&&v.playlists);
    })
    .catch(function(e){ console.error('[earn] playlists failed to load',e); paint(null); });
}

/* ---- User playlists from public SoundCloud URLs (localStorage v1) ---- */
function scValid(u){ return /^https?:\/\/(m\.|www\.)?soundcloud\.com\//i.test(u||''); }
/* Playlist plumbing removed 2026-08-21 with the Playlists section (Founder). loadPls,
   savePls, addPlaylist, rmPlaylist and renderPls all read or wrote #plList, #plName and
   #plUrl — none of which exist any more, so every one of them was dead. */
function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
function iconCard(glyph,hue,chip,title,desc,extra){
  return '<div class="card">'+band(hue,glyph)+'<span class="chip'+(/soon|scheduled/i.test(chip)?' soon':'')+'">'+chip+'</span>'
    +'<h3 style="margin-top:8px">'+title+'</h3><p>'+desc+'</p>'+(extra||'')+'</div>';
}

/* ---- Schedule blocks ---- */
var BLOCKS=[['Morning Discovery','🌅',35,'Fresh finds to start the day'],['Local Artist Spotlight','📍',200,'Your city, on rotation'],
 ['Genre Hour','🎚️',260,'A deep dive, one genre at a time'],['Creator Education','🎓',150,'Learn the craft & the business'],
 ['Venue Talk','🏛️',20,'Rooms, sound & the people behind them'],['Festival Preview','🎪',300,'What to catch this season'],
 ['Community Picks','🫶',330,'Chosen by listeners'],['New Release Hour','🆕',180,'Just dropped'],
 ['AI Crew Show','🤖',190,'KEEPITIL agents curate'],['Weekend Mix','🎧',270,'Long-play DJ sets']];
var _g_scheduleGrid=document.getElementById('scheduleGrid'); if(_g_scheduleGrid) _g_scheduleGrid.innerHTML=BLOCKS.map(function(b){return iconCard(b[1],b[2],'Scheduled',b[0],b[3]);}).join('');

/* ── EARN: referral & affiliate partners ONLY (Founder 2026-08-22) ─────────────────────
   Moved here from the radio bar, where they rotated as an ad on every page. rel="sponsored
   nofollow" on every one — that is the required disclosure and it stops the outbound links
   passing ranking signal. data-kt keeps the existing click tracking. */
(function(){
  var grid=document.getElementById('affGrid'); if(!grid) return;
  /* Static slides (Kit affiliate, Shop) held by reference so the innerHTML repaint below cannot
     drop them; they are re-appended after the partner cards on every paint (Joe 2026-11-20). */
  var KEEP_SLIDES=['kitAffiliate','earnShopCard'].map(function(id){ return document.getElementById(id); })
    .filter(Boolean);
  /* ── ONE CANONICAL CREATIVE PER CAMPAIGN (Founder 2026-09-07) ──────────────────────
     EARN used to build its own partner tiles from a private list: a second copy of the
     links, and gradient art that existed nowhere else. Both are gone. The rail now asks
     the shell for the same cards DISCOVER renders, so a referral URL or a creative is
     changed in one place and changes on every surface. Order is the approved one:
     Freecash, DistroKid, Posh, Amazon, KEEPITIL Store. */
  var ORDER=['freecash','distrokid','posh','amazon','keepitil-store'];
  /* ⚠ THE SHELL IS DEFERRED, THIS SCRIPT IS NOT. On the first run KIL_SPONSORS does not
     exist yet, so painting once here rendered an empty rail. Wait for the module rather
     than assuming an order the markup does not guarantee. */
  function paintPartners(){
    if(!window.KIL_SPONSORS) return false;
    grid.innerHTML = ORDER.map(function(id){
      var sp = window.KIL_SPONSORS.byId(id);
      if(!sp || !sp.active || !sp.href) return '';    /* a pending partner simply does not render */
      return window.KIL_SPONSORS.card(0, 'aff-card', {
        sponsor: sp,
        placement: 'earn_partner_rail',
        sizes: '(max-width:860px) 45vw, 240px'
      });
    }).join('');
    KEEP_SLIDES.forEach(function(n){ grid.appendChild(n); });
    var pc=document.getElementById('eP'); if(pc) pc.textContent=String(grid.children.length);
    if(window.KIL_SPONSORS.refreshImpressions) window.KIL_SPONSORS.refreshImpressions();
    return true;
  }
  /* The shell repaints this rail if the canonical catalog changed anything. */
  document.addEventListener('kil:sponsors-updated', paintPartners);
  if(!paintPartners()){
    var tries=0;
    var t=setInterval(function(){ if(paintPartners() || ++tries>40) clearInterval(t); }, 150);
    window.addEventListener('load', paintPartners);
  }
})();

/* ── PLAYLISTS: a signed-in listener's own SoundCloud sets (Founder 2026-08-22) ────────
   Server-side now, not localStorage: a playlist saved on a phone must be there on a laptop.
   Rows are private by RLS, so these are audible only to the person who saved them — the
   KEEPITIL rotation everyone hears is unchanged. */
function scValid2(u){ return /^https?:\/\/(m\.|www\.)?soundcloud\.com\/.+/i.test(u||''); }

function kilTok(){
  try{
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i);
      if(k && k.indexOf('-auth-token')>-1){
        var j=JSON.parse(localStorage.getItem(k)||'null');
        if(j && j.access_token) return j.access_token;
      }
    }
  }catch(e){}
  return null;
}
function kilAuthHeaders(){
  var t=kilTok();
  return t ? {apikey:window.KIL_EARN_KEY, Authorization:'Bearer '+t, 'Content-Type':'application/json',
              Prefer:'return=representation'} : null;
}
var PL_API='https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/user_playlists';

/* The form and its signed-out prompt are both inside the shared component now, so there is
   nothing here to show or hide. This is still the gate for the SAVED-PLAYLIST LIST below,
   which is a private read and genuinely does need a session. */
function plGate(){ return !!kilTok(); }

/* addPlaylist() REMOVED 2026-09-17. The write now lives in the shared component
   (/assets/js/keepitil-playlist-submit.js), which both this page and the radio's + CREATE
   tile mount - same fields, same validation, same upsert on user_id. Two functions writing
   one row is exactly how the cover-image rules drifted apart between the two surfaces, so
   the duplicate is deleted rather than left unreferenced. */

function renderPls(){
  var el=document.getElementById('plList'); if(!el) return;
  if(!plGate()){ el.innerHTML=''; return; }
  var h=kilAuthHeaders(); if(!h){ el.innerHTML=''; return; }
  fetch(PL_API+'?select=id,name,url,art,is_default&order=created_at.asc', {headers:h})
    .then(function(r){ return r.ok?r.json():[]; })
    .then(function(rows){
      /* The prefill that used to happen here wrote into #plName/#plUrl/#plArt, which this
         section no longer contains - the shared component owns the form. Resubmitting
         through it upserts the same row, so editing still works; it simply is not done by
         pushing values back into inputs that are not there. */
      if(!rows.length){ el.innerHTML=''; return; }
      el.innerHTML=rows.map(function(p,i){
        var hue=[280,200,35,140,320,90][i%6];
        var artUrl=window.KilSafeHtml?KilSafeHtml.safeMediaUrl(p.art):'';
        var href=window.KilSafeHtml?KilSafeHtml.safeNavUrl(p.url):'';
        var cover=artUrl ? 'background:#15131f url(\''+esc(artUrl)+'\') center/cover no-repeat'
                        : 'background:linear-gradient(135deg,hsl('+hue+',72%,44%),hsl('+((hue+40)%360)+',66%,20%))';
        var open=href?'<a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer" style="display:block;color:inherit;text-decoration:none">':'<div style="display:block;color:inherit">';
        var close=href?'</a>':'</div>';
        return '<div class="station card" style="position:relative">'
          + open
          +   '<div class="card-img" style="'+cover+'">'+(artUrl?'':'\u266a')+'</div>'
          +   '<div class="g">'+esc(p.name)+'</div><div class="s">Your playlist</div>'
          + close
          + (p.is_default?'<span class="chip" style="margin-top:8px;display:inline-block">DEFAULT</span>':'')   /* "SET DEFAULT" and the remove button are gone: their handlers (setDefaultPlaylist / rmPlaylist) were removed 2026-08-21, so the buttons did nothing */
          + '</div>';
      }).join('');
    })
    .catch(function(e){ console.error('[earn] playlists failed', e); });
}

/* ── AIRPLAY SUBMISSION ────────────────────────────────────────────────────────────────
   Records a REQUEST. It does not put anything on air and it does not create an agreement —
   status starts 'requested' and a human moves it from there. */
function submitAirplay(){
  var h=kilAuthHeaders(), msg=document.getElementById('airMsg');
  if(!h){ location.href='/apply'; return; }
  var artist=(document.getElementById('airArtist')||{}).value||'';
  var email =(document.getElementById('airEmail') ||{}).value||'';
  var url   =(document.getElementById('airUrl')   ||{}).value||'';
  var genre =(document.getElementById('airGenre') ||{}).value||'';
  var ok    =(document.getElementById('airTerms') ||{}).checked;
  if(!artist.trim()||!email.trim()||!scValid2(url.trim())){ msg.textContent='Artist, email and a SoundCloud URL are required.'; return; }
  if(!ok){ msg.textContent='Please confirm you are authorised to license this recording.'; return; }
  msg.textContent='Sending…';
  fetch('https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/radio_airplay_requests', {
    method:'POST', headers:h,
    body:JSON.stringify({
      user_id:(function(){ try{ return JSON.parse(atob(kilTok().split('.')[1])).sub; }catch(e){ return null; } })(),
      artist_name:artist.trim(), contact_email:email.trim(), track_url:url.trim(),
      genre:genre.trim()||null, terms_agreed:true, terms_version:'airplay-v1'
    })
  })
  .then(function(r){ if(!r.ok) throw new Error('submit failed '+r.status); return r.json(); })
  .then(function(){ msg.textContent='Received. We review every submission before anything goes on air.';
                    ['airArtist','airEmail','airUrl','airGenre'].forEach(function(id){ var e=document.getElementById(id); if(e) e.value=''; });
                    document.getElementById('airTerms').checked=false; })
  .catch(function(e){ console.error('[earn] airplay submit failed', e); msg.textContent='Could not send that — try again.'; });
}

/* ── CREATE competition cards (Founder 2026-08-21) ─────────────────────────────────────
   The eight entries here used to be a hard-coded array of competitions that do not exist —
   "Song of the Month", "Beat Battle" and so on, every one of them labelled "Open soon". This
   now reads vs_competitions, so the rail shows the SAME seven Q4 competitions /create shows and
   cannot invent one or miss one. Same 2:3 card shape as the homepage and CREATE. */
(function(){
  var grid = document.getElementById('earnGrid');
  if(!grid) return;
  function esc(x){ return String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function paint(rows){
    if(!rows || !rows.length){
      /* BROKEN != EMPTY — an empty rail with no explanation reads as a dead page. */
      grid.innerHTML = '<div class="disc" style="flex:0 0 auto;max-width:80vw;padding:14px 2px">'
        + 'No competitions are open right now. <a href="/create/" style="color:var(--brand)">See CREATE →</a></div>';
      var c1=document.getElementById('eC'); if(c1) c1.textContent='0';
      return;
    }
    grid.innerHTML = rows.map(function(c){
      var closes=''; try{ var dt=new Date(c.submissions_close_at); if(!isNaN(dt)) closes='Closes '+dt.toLocaleDateString([],{month:'short',day:'numeric'}); }catch(e){}
      var free = !c.entry_fee_cents;
      var cover=window.KilSafeHtml?KilSafeHtml.safeMediaUrl(c.cover_url):'';
      var art = cover
        ? '<div class="card-img" style="height:auto;aspect-ratio:2/3;margin:-16px -16px 12px;background:#15131f"><img src="'+esc(cover)+'" alt="" loading="lazy" decoding="async" style="display:block;width:100%;height:100%;object-fit:cover"></div>'
        : '<div class="card-img" style="background:linear-gradient(150deg,#ff2e88,#a06bff)">🏆</div>';
      return '<a class="card station" href="/create/?view=enter&c='+encodeURIComponent(c.id)+'">'
        + art
        + '<div class="g">'+esc(c.title)+'</div>'
        + '<div class="s">'+esc(c.season_label||'CREATE')+'</div>'
        + '<span class="chip'+(free?'':' soon')+'">'+(free?'FREE TO ENTER':'$'+(c.entry_fee_cents/100).toFixed(2))+'</span>'
        + (closes?'<div class="meta">'+esc(closes)+'</div>':'')
        + '</a>';
    }).join('');
    var el=document.getElementById('eC'); if(el) el.textContent=String(rows.length);
  }

  /* Read-only, anon-safe: published competitions are public on /create already. */
  /* ⚠ SELECT ONLY COLUMNS THAT EXIST. PostgREST answers 400 for an unknown column, and a 400
     here lands in the "no competitions" branch — so a typo looks exactly like an empty season.
     vs_competitions has NO `category` column (it has category_id, and the joined name just
     repeats the title anyway); asking for it is what kept this rail empty. season_label is the
     useful subtitle: "Q4 2026". */
  var URL_ = 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/vs_competitions'
    + '?select=id,title,season_label,cover_url,entry_fee_cents,submissions_close_at,status'
    + '&status=eq.published&order=submissions_close_at.asc';
  var KEY_ = window.KIL_EARN_KEY || '';

  /* A plain fetch rather than the Supabase SDK: this page needs exactly one public read, and
     pulling the whole client in for that would cost more than the request. The anon key is the
     same publishable key every other page already ships in its HTML. */
  fetch(URL_, { headers: { apikey: KEY_, Authorization: 'Bearer ' + KEY_ } })
    .then(function(r){
      /* Say WHY, in the console, rather than letting a 400 masquerade as an empty season. */
      if(!r.ok){ console.error('[earn] competitions request failed', r.status, URL_); return null; }
      return r.json();
    })
    .then(function(rows){ paint(rows); })
    .catch(function(e){ console.error('[earn] competitions failed to load', e); paint(null); });
})();

/* ---- Creator Services ---- */
var SERVICES=[['Add my song','🎵',160,'Get your track considered for a station','Free · reviewed'],
 ['Submit a mix','🎚️',260,'DJ mixes for shows & rotation','Free · reviewed'],
 ['Submit a playlist','📃',200,'Pitch a curated playlist','Free · reviewed'],
 ['Request an interview','🎤',300,'Be featured on a show','Free · reviewed'],
 ['Request a spotlight','🌟',45,'Editorial feature','Free · reviewed'],
 ['Promote an event','📣',20,'Get your event on-air','Beta'],
 ['Advertise on Radio','📈',190,'Reach listeners','Paid · rate card'],
 ['Sponsor a show','🤝',140,'Brand a station block','Paid · reviewed'],
 ['Referral partner','🔗',270,'Earn on referrals','Application'],
 ['Ticket-sales commission','🎟️',330,'Earn on tickets you drive','Application']];
var _g_servicesGrid=document.getElementById('servicesGrid'); if(_g_servicesGrid) _g_servicesGrid.innerHTML=SERVICES.map(function(s){
  var subj=encodeURIComponent('KEEPITIL Radio — '+s[0]);
  var body=encodeURIComponent('Request: '+s[0]+'\n\nName:\nProfile / link:\nDetails:\n\nI confirm I hold the rights to anything I submit.');
  return iconCard(s[1],s[2],s[4],s[0],s[3],'<div class="meta">Timeline: ~5 business days</div><a class="btn ghost" style="margin-top:12px" href="mailto:info@keepitil.com?subject='+subj+'&body='+body+'">Request</a>');
}).join('');

/* ---- Games (all live at /games/) ---- */
/* Games: only real, playable titles (Founder 2026-08-04) — the Games hub link lives in the section footer */
/* 2026-10-15 (Founder): KMOB first, KBeats second — the two playable titles on /games/.
   The old Age of Wars entry is gone; everything else on the hub is Coming soon. [name, icon, hue, blurb, url, chip] */
var GAMES=[['KMOB · Endless War','<img src="/games/kmob/icon-192.png" alt="" width="72" height="72" style="width:72px;height:72px;border-radius:16px;box-shadow:0 6px 16px rgba(0,0,0,.35)">',12,'Plan your army, command the tank and defend against endless waves of enemies.','/games/kmob/','Play free'],
 ['KBeats','🎵',275,'Four-lane rhythm game built on independent artists\u2019 music. In beta and currently being updated.','/games/kbeats/','Beta'],
 ];
var _g_gamesGrid=document.getElementById('gamesGrid'); if(_g_gamesGrid) _g_gamesGrid.innerHTML=GAMES.map(function(g){
  return '<a class="card" href="'+g[4]+'" style="display:block;color:inherit">'+band(g[2],g[1])
    +'<span class="chip">'+(g[5]||'Play free')+'</span><h3 style="margin-top:8px">'+g[0]+'</h3><p>'+g[3]+'</p></a>';
}).join('');

/* ---- Mobile App ---- */
/* Mobile: only what's actually usable today — the installable web app (Founder 2026-08-04) */
var MOBILE=[['Install the Web App','📲',190,'Add KEEPITIL to your home screen — works offline, no store needed.'],
 ['Radio in your pocket','🎧',260,'Keep the stream going anywhere on your phone.']];
var _g_mobileGrid=document.getElementById('mobileGrid'); if(_g_mobileGrid) _g_mobileGrid.innerHTML=MOBILE.map(function(m){return iconCard(m[1],m[2],'PWA',m[0],m[3]);}).join('');

renderStations();
renderPls();

/* Header counters (Founder 2026-08-21). Read from the page's own data rather than hard-coded
   numbers, so the header can never claim more stations or games than actually render. Playlists
   are per-device in v1 (localStorage), so that number is this visitor's, which is what the
   "Your Playlists" section below it also shows. */
function radStats(){
  var set=function(id,n){ var el=document.getElementById(id); if(el) el.textContent=String(n); };
  try{ set('eG', (typeof GAMES!=='undefined' && GAMES.length) || 0); }catch(e){}
}
radStats();
/* re-count after a playlist is added or removed */

/* ── filter bar behaviour, cloned from /connect (Founder 2026-08-21) ────────────────────
   Segments show/hide whole sections. The station search and the Radio / Playlists chips went
   with those sections (Joe 2026-11-20). */
(function(){
  /* Chip key -> section id (2026-11-22). Section ids stay 'earn' and 'create' so old #hash links still land. */
  var SEC={partners:'earn',rewards:'create'};
  var seg=document.getElementById('radSeg');
  if(!seg) return;
  var key='all';

  function apply(){
    Object.keys(SEC).forEach(function(k){
      var sec=document.getElementById(SEC[k]);
      if(sec) sec.style.display=(key==='all'||key===k)?'':'none';
    });
  }

  seg.addEventListener('click',function(e){
    var b=e.target.closest('button[data-k]'); if(!b) return;
    key=b.dataset.k;
    [].forEach.call(seg.querySelectorAll('button'),function(x){ x.classList.toggle('on',x===b); });
    apply();
  });
  apply();
})();
/* ── SECTION ABOUT: EYE ON "ALL", OPEN ON A CATEGORY (Founder 2026-08-31, §5-§8) ─────────
   The ALL page is the whole of EARN, so leading every section with a block of explanation
   pushed the actual content off the first screen. On ALL the explanation folds behind a small
   eye next to each section title. Choosing one category IS choosing to read about it, so
   there the same copy opens by itself above that section's content.

   The copy is MOVED, never rewritten: each panel is the existing <article class="hye"> node
   from HOW YOU EARN, reparented. There is one copy of each explanation in the document, so
   the two presentations cannot drift apart.

   ⚠ The overlay is position:fixed and never scrolls the document. Closing it therefore lands
   the visitor on the exact row they opened it from, which is what X has to do (§6). */
(function(){
  /* RADIO and PLAYLISTS rows removed with their sections (Joe 2026-11-20). Index-matched to the
     article.hye order in HOW YOU EARN, which lost the same two articles. */
  var MAP = [
    ['earn',      'PARTNERS'],
    ['create',    'REWARDS']
  ];
  var hye = document.getElementById('howyouearn');
  if(!hye) return;
  /* ALL WIDTHS (Founder 2026-09-01). This was mobile-only; the correction is that desktop must
     behave the same way. No permanently expanded ABOUT copy at any width — every section's
     explanation lives behind that section's INFO button and nowhere else. */

  /* Pull the four explanations out of HOW YOU EARN and key them by section id. */
  var arts = [].slice.call(hye.querySelectorAll('article.hye'));
  var about = {};
  MAP.forEach(function(pair, i){
    var art = arts[i];
    if(!art) return;
    var wrap = document.createElement('div');
    wrap.className = 'sec-about';
    wrap.id = 'about-' + pair[0];
    wrap.appendChild(art);            /* MOVES the node - copy is never duplicated */
    about[pair[0]] = { node: wrap, label: pair[1] };
  });

  /* HOW YOU EARN keeps its heading, lead and footer - five lines that frame the whole page and
     are not specific to any one category, so there is no eye they could sensibly hide behind.
     What made this block "a large expanded explanation before each section" was the four
     cards, and those have just been moved out. Removing the remaining copy would be deleting
     it, and the instruction was to change presentation, not content. */
  var grid = hye.querySelector('.hye-grid');
  if(grid) grid.style.display = 'none';

  /* One overlay, reused. */
  var ov = document.createElement('div');
  ov.id = 'hyeOv';
  ov.innerHTML = '<div class="hye-panel" role="dialog" aria-modal="true" aria-labelledby="hyeOvTitle">' +
    '<div class="hye-head"><h2 id="hyeOvTitle"></h2>' +
    '<button type="button" class="hye-x" aria-label="Close">&#10005;</button></div>' +
    '<div class="hye-body"></div></div>';
  document.body.appendChild(ov);
  var ovTitle = ov.querySelector('#hyeOvTitle'),
      ovBody  = ov.querySelector('.hye-body'),
      ovX     = ov.querySelector('.hye-x');
  var openFor = null, lastFocus = null;

  function closeOv(){
    if(!openFor) return;
    /* Put the panel back where it lives so the category view can still show it inline. */
    var slot = document.getElementById('aboutSlot-' + openFor);
    if(slot) slot.appendChild(about[openFor].node);
    else if(ovBody.firstChild) ovBody.removeChild(ovBody.firstChild);
    ov.classList.remove('on');
    openFor = null;
    /* No scrollTo of any kind. The document never moved. */
    /* ⚠ preventScroll IS THE WHOLE FIX. Returning focus to the INFO button made the browser
       scroll that button into view, which is what moved the page: measured 600 -> 1222 on
       PLAYLISTS, 600 -> 1699 on EARN, and no movement at all on RADIO only because its button
       happened to already be on screen. Focus belongs back on the control; the scroll does not
       come with it. */
    if(lastFocus && lastFocus.focus) { try{ lastFocus.focus({preventScroll:true}); }catch(e){ try{ lastFocus.focus(); }catch(e2){} } }
  }
  function openOv(k, from){
    if(!about[k]) return;
    lastFocus = from || null;
    openFor = k;
    ovTitle.textContent = about[k].label;
    ovBody.appendChild(about[k].node);
    ov.classList.add('on');
    /* ⚠ DO NOT SET body{overflow:hidden} HERE. Measured: it moved the document from scrollY
       700 to 1222, so X returned the visitor 522px away from the section they opened. This
       page's body is overflow-x:clip, and toggling overflow re-resolves that and reflows the
       scroller. The overlay is position:fixed and covers the viewport, and .hye-body carries
       overscroll-behavior:contain, which is what actually stops a drag reaching the page
       behind it. Leaving the document alone is what makes the scroll position exact. */
    try{ ovX.focus({preventScroll:true}); }catch(e){ ovX.focus(); }
  }
  ovX.addEventListener('click', closeOv);
  ov.addEventListener('click', function(e){ if(e.target === ov) closeOv(); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeOv(); });

  /* Eye button + an inline slot, per section. */
  MAP.forEach(function(pair){
    var id = pair[0];
    var sec = document.getElementById(id); if(!sec || !about[id]) return;
    var sh = sec.querySelector('.sh'); if(!sh) return;

    /* A REAL CONTROL, NOT AN EMOJI (Founder 2026-08-31). The eye glyph rendered differently on
       every platform and read as decoration rather than something to press. INFO sits on the
       same row as the section title, which is why ADD SOUNDCLOUD PLAYLIST became ADD PLAYLIST. */
    var eye = document.createElement('button');
    eye.type = 'button';
    eye.className = 'hye-info';
    eye.setAttribute('aria-label', 'About ' + about[id].label);
    eye.title = 'About ' + about[id].label;
    eye.textContent = 'INFO';
    eye.addEventListener('click', function(){ openOv(id, eye); });
    sh.appendChild(eye);

    var slot = document.createElement('div');
    slot.id = 'aboutSlot-' + id;
    slot.style.display = 'none';
    sh.parentNode.insertBefore(slot, sh.nextSibling);
    slot.appendChild(about[id].node);
  });

  /* INFO IS THE ONLY DOOR (Founder 2026-09-01). The slots stay closed at every width and on
     every filter; INFO stays available on every section. The previous rule opened a category's
     About inline when that category was filtered to, which is exactly the "permanently visible
     ABOUT copy" being removed — and it also duplicated copy that INFO already shows. */
  MAP.forEach(function(pair){
    var slot = document.getElementById('aboutSlot-' + pair[0]);
    var sec  = document.getElementById(pair[0]);
    if(slot) slot.style.display = 'none';
    var eye = sec && sec.querySelector('.sh .hye-info');
    if(eye) eye.style.display = '';
  });
})();

/* The per-section expand toggle is REMOVED (Founder 2026-08-22: "remove the drop down buttons in
   each sections. they do not work"). It toggled section.open, which was meant to turn a rail into
   a full grid — but the rails are now pinned to a single nowrap row at both breakpoints, so the
   class had nothing left to change and the button did nothing when pressed. The carousel class is
   still applied; only the dead control is gone. */
(function(){
  [].forEach.call(document.querySelectorAll('main > section'), function(sec){
    var grid=sec.querySelector('.grid'); if(grid) grid.classList.add('rad-carou');
  });
})();
