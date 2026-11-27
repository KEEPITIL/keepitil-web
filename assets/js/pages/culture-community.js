/* KEEPITIL culture/index.html: inline script "community" moved verbatim to an external file (CSP: no executable inline script). */
/* COMMUNITY FEED (Founder doc step 4 + daily auto-post): profile_content posts — agents AND
   users — render at the top of Culture with the same FB card chrome. Zero-token, DB-driven. */
(function(){
  function h(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  /* ── UNIVERSAL CARD RENDERER ───────────────────────────────────────────────────────────
     Clones <template id="kv-video-card"> and fills its data-kv hooks from the normalised object
     card() produces. This is the ONLY place a Culture card is built. Returns an HTML string
     because the feed paints with list.map(card).join(''). */
  var KV_ICONS = {
    youtube:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 12s0-3.9-.5-5.8a3 3 0 0 0-2.1-2.1C18.5 3.6 12 3.6 12 3.6s-6.5 0-8.4.5A3 3 0 0 0 1.5 6.2C1 8.1 1 12 1 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 8.4.5 8.4.5s6.5 0 8.4-.5a3 3 0 0 0 2.1-2.1C23 15.9 23 12 23 12zM9.8 15.6V8.4l6.2 3.6-6.2 3.6z"/></svg>',
    tiktok:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 5.8a5 5 0 0 1-1.2-3.3h-3.2v13a2.6 2.6 0 1 1-1.9-2.5V9.7a5.8 5.8 0 1 0 5.1 5.8V9.3a8.2 8.2 0 0 0 4.6 1.4V7.5a5 5 0 0 1-3.4-1.7z"/></svg>',
    instagram:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/></svg>'
  };

  function kvRenderCard(n){
    var tpl = document.getElementById('kv-video-card');
    /* BROKEN != EMPTY: say so loudly rather than rendering an empty feed. */
    if(!tpl || !tpl.content || !tpl.content.firstElementChild){
      console.error('[culture] <template id="kv-video-card"> is missing or empty — no card can render');
      return '';
    }
    var frag = tpl.content.cloneNode(true);
    var card = frag.querySelector('.fcard');
    if(!card){ console.error('[culture] template has no .fcard root'); return ''; }

    function safeHref(u){ return (window.KilSafeHtml && KilSafeHtml.safeNavUrl(u)) || ''; }
    function safeSrc(u){ return (window.KilSafeHtml && KilSafeHtml.safeMediaUrl(u)) || ''; }
    var pid = String(n.pid == null ? '' : n.pid);
    card.setAttribute('data-pid', pid);
    /* .kil-vid is what the one-player-at-a-time IntersectionObserver watches. Only a row with a
       real embed may carry it, or the observer would try to mount a player into an event card. */
    var embed = n.embed ? safeHref(n.embed) : '';
    if(embed){ card.classList.add('kil-vid'); card.setAttribute('data-embed', embed); }
    else       { card.classList.remove('kil-vid'); }
    if(n.isShort) card.classList.add('kv-short');
    /* YouTube ships its own like/share controls inside the player, so a second KEEPITIL set
       stacked underneath is duplicate furniture (Founder 2026-08-25). Hidden by CSS on .kv-yt
       rather than skipped at build time, so the buttons stay wired for every other provider
       and one class is the whole switch.
       The source link is NOT part of this: it is attribution, not a reaction, and credit stays
       on the card. */
    if(String(n.provider||'').toLowerCase()==='youtube') card.classList.add('kv-yt');
    /* A card with no embed and no inline video is representing a profile/venue/entry, not
       a clip — it takes the 2:3 house frame. */
    if(n.profileCard) card.classList.add('kv-profile');

    var q = function(k){ return frag.querySelector('[data-kv="'+k+'"]'); };
    var el, tgt = n.external ? ' target="_blank" rel="noopener noreferrer"' : '';

    if((el = q('well'))){
      el.style.aspectRatio = n.aspect || '16/9';
      if(n.maxH){ el.style.maxHeight = n.maxH; el.style.margin = '0 auto'; }
      /* Published for the mobile full-bleed frame (Founder 2026-08-24). On mobile the well
         stops being an aspect-ratio box — it takes the whole usable viewport — so the clip's
         real ratio has to survive somewhere or a portrait Short gets stretched to landscape.
         --kv-ar sizes the player inside the frame; --kv-poster fills whatever the player does
         not cover with a blurred still of itself, which is the "intentional background
         treatment" instead of exposing page gaps. */
      el.style.setProperty('--kv-ar', (n.aspect || '16/9').replace('/',' / '));
      var posterUrl = safeSrc(n.thumb);
      if(posterUrl) el.style.setProperty('--kv-poster', 'url("'+posterUrl.replace(/"/g,'%22')+'")');
      /* An uploaded video plays inline; everything else shows a still. */
      if(n.video){
        var vidUrl = safeSrc(n.video);
        var img = el.querySelector('[data-kv="thumb"]');
        if(vidUrl){
        if(img) img.remove();
        var v = document.createElement('video');
        v.src = vidUrl; var poster = safeSrc(n.poster); if(poster) v.poster = poster;
        /* Muted ONLY while the browser still requires it; unmuted once a gesture has happened. */
        v.muted = !window.__kilSoundOK; v.volume = 0.5;
        v.loop = true; v.playsInline = true; v.controls = true;
        v.setAttribute('style','width:100%;height:100%;object-fit:'+(n.fit||'cover')+';display:block');
        el.insertBefore(v, el.firstChild);
        }
      }
    }
    if((el = q('thumb'))){
      el.setAttribute('src', safeSrc(n.thumb) || '/assets/images/blog-default.jpg');
      el.setAttribute('alt', n.title || '');
      el.setAttribute('data-fb', 'src'); el.setAttribute('data-fb-src', '/assets/images/blog-default.jpg');
      if(n.fit) el.style.objectFit = n.fit;
    }
    if((el = q('platform'))){
      if(n.badge){
        el.textContent = n.badge;
        if(n.badgeBg) el.style.background = n.badgeBg;
        if(n.badgeFg) el.style.color = n.badgeFg;
      } else el.remove();
    }
    if((el = q('title'))){
      if(n.title){ el.textContent = n.title; el.setAttribute('href', safeHref(n.href) || '#');
                   if(n.external){ el.setAttribute('target','_blank'); el.setAttribute('rel','noopener noreferrer'); }
                   else el.removeAttribute('target'); }
      else el.remove();
    }
    if((el = q('caption'))){
      var cap = (n.caption && window.KilSafeHtml) ? KilSafeHtml.sanitize(n.caption) : '';
      if(cap){ el.innerHTML = cap; el.hidden = false; } else el.remove();
    }
    /* ── CREATE BAR (§6/§7) ─────────────────────────────────────────────────────────────── */
    if((el = q('createbar'))){
      if(n.vsEntryId){
        el.hidden = false;
        var ab = el.querySelector('[data-kv="cabout"]');
        if(ab) ab.textContent = n.about || '';
        var mo = el.querySelector('[data-kv="cmore"]');
        /* MORE goes to the CANONICAL entry. Culture shows an extract; it does not hold a
           second copy of the submission (§6). */
        if(mo) mo.setAttribute('href', '/create/?view=entry&e=' + n.vsEntryId);
        var ra = el.querySelector('[data-kv="crated"]');
        if(ra) ra.setAttribute('href', '/create/?view=entry&e=' + n.vsEntryId + '#leaderboard');
        var vb = el.querySelector('[data-kv="cvote"]');
        if(vb) vb.setAttribute('data-entry', n.vsEntryId);
      } else {
        el.remove();
      }
    }
    if((el = q('cta'))){
      if(n.cta){
        el.hidden = false;
        var ctaHref = safeHref(n.cta.href);
        if(!ctaHref){ el.remove(); }
        else {
        el.textContent = n.cta.label;
        el.setAttribute('href', ctaHref);
        if(n.cta.external){ el.setAttribute('target','_blank'); el.setAttribute('rel', n.cta.rel || 'noopener noreferrer'); }
        el.style.background = n.cta.bg; el.style.color = n.cta.fg;
        if(n.cta.note){
          var note = document.createElement('div');
          note.className = 'kv-cta-note'; note.textContent = n.cta.note;
          el.insertAdjacentElement('afterend', note);
        }
        }
      } else el.remove();
    }
    if((el = q('creator'))){
      el.setAttribute('href', safeHref(n.creatorHref) || '#');
      if(n.external && n.provider){ el.setAttribute('target','_blank'); el.setAttribute('rel','noopener noreferrer'); }
      else el.removeAttribute('target');
    }
    if((el = q('avatar'))){
      var av = safeSrc(n.avatar);
      if(av) el.style.backgroundImage = 'url("' + av.replace(/"/g,'%22') + '")';
      else el.textContent = (n.name || '?').trim().charAt(0).toUpperCase();
    }
    if((el = q('name'))) el.textContent = n.name || '';
    if((el = q('meta'))){ if(n.meta) el.textContent = n.meta; else el.remove(); }
    if((el = q('source'))){
      /* Platform icon belongs to third-party media only — a KEEPITIL event has no "source". */
      if(n.provider){
        el.setAttribute('href', safeHref(n.href) || '#');
        el.setAttribute('title', 'Watch at the source');
        var slot = el.querySelector('[data-kv-icon]');
        if(slot) slot.innerHTML = KV_ICONS[n.provider] ||
          ('<b style="font:800 .72rem Inter,sans-serif">'+h(n.provider.charAt(0).toUpperCase())+'</b>');
      } else el.remove();
    }

    /* Wired by class, so reordering buttons in the template cannot unwire them. */
    /* Delegated actions (assets/js/kil-actions.js): name + JSON args as attributes, never code spliced into an onclick string. */
    var on = function(sel, name, args){ var b = frag.querySelector(sel); if(b){ b.setAttribute('data-click', name); b.setAttribute('data-a', JSON.stringify(args)); } };
    on('.fba-like',  'fbLike', [String(pid), '$el']);
    on('.fba-resh',  'fbReshareL', [String(pid), '$el']);
    on('.fba-share', 'fbShare', [String(safeHref(n.href)||'')]);
    on('.fb-save',   'fbSaveL', [String(pid), '$el']);

    var box = document.createElement('div');
    box.appendChild(frag);
    return box.innerHTML;
  }
  /* EXPOSED for other blocks in this file to reuse. (The desktop blog feed that used to
     consume this was removed 2026-08-26; the export stays for the mobile feed.) */
  window.kvRenderCard = kvRenderCard;

  function card(r){
    var d=r.data||{}; var media=(d.media&&d.media[0])||{src:d.img||'',mtype:d.mtype||'image'};
    var url='/profile?slug='+encodeURIComponent(r.profile_slug);
    /* ── ONE CARD FOR EVERY KIND (Founder 2026-08-21: "make this the universal template for
       all content on the culture page ... only this template if allowed").
       Nothing here builds HTML. Each kind is normalised to the same handful of fields and
       handed to kvRenderCard(), which fills <template id="kv-video-card">. Editing that
       template changes events, competition entries, videos and posts together — which is the
       whole point of making it universal. */
    var n;

    if(r.kind==='event'){
      var ext=!!d.is_external;
      var when=''; try{var dt=new Date(d.date); if(!isNaN(dt)) when=dt.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'});}catch(x){}
      var evTarget = d.ticket_url||('/event?e='+encodeURIComponent(d.slug||''));
      n = { pid:'cul:'+(d.slug||r.id), href:evTarget, external:ext,
            thumb:d.cover||'/assets/images/blog-default.jpg', aspect:'16/9',
            badge: ext?'EXTERNAL':'KEEPITIL EVENT',
            badgeBg: ext?'rgba(0,0,0,.7)':'rgba(0,224,164,.95)', badgeFg: ext?'#fff':'#06120a',
            title:d.title||'Event',
            name:r.author_name, avatar:r.author_avatar, creatorHref:url,
            meta:[when, d.venue, d.city].filter(Boolean).join(' \u00b7 '),
            cta:{label:(ext?'\ud83c\udf9f Get Tickets \u2197':'\ud83c\udf9f Get Tickets'), href:evTarget,
                 bg:'var(--brand,#00b4ff)', fg:'#04121b', external:ext} };

    } else if(r.kind==='create_entry'){
      var cd=r.data||{};
      var closes=''; try{ var ct=new Date(cd.voting_closes_at); if(!isNaN(ct)) closes=ct.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'}); }catch(x){}
      var votingOpen = cd.voting_open === true;
      /* Voting links OUT to the CREATE entry on purpose: votes live in vs_vote_actions and
         there must be exactly one vote path. A Culture-side vote control would be a second
         source of truth. */
      n = { pid:r.id, href:cd.entry_url||'/create/',
            thumb:cd.cover||cd.img||'/assets/images/blog-default.jpg', aspect:'2/3', maxH:'520px',
            badge:'CREATE', badgeBg:'rgba(255,92,138,.95)', badgeFg:'#1a0410',
            title:cd.title||'Untitled entry',
            name:r.author_name||r.profile_slug, avatar:r.author_avatar,
            creatorHref:'/profile?slug='+encodeURIComponent(r.profile_slug||''),
            meta:[cd.competition||'CREATE', cd.division, closes?((votingOpen?'Voting closes ':'Closes ')+closes):''].filter(Boolean).join(' \u00b7 '),
            cta:{label:(votingOpen?'\ud83d\uddf3 Vote on this entry':'View entry'), href:cd.vote_url||'/create/',
                 bg:(votingOpen?'#ff5c8a':'rgba(255,255,255,.08)'), fg:(votingOpen?'#1a0410':'#9aa')} };

    } else if(r.kind==='create'){
      /* CREATE STREAM CARD (Founder 2026-08-28 §5/§6). Same approved Culture geometry — this
         branch only chooses what fills it. The media is the submitted work; ABOUT is an
         extract; the full submission stays on the canonical entry page. */
      var cd=r.data||{}, cmeta=r.vs_meta||{};
      var cwhen=''; try{var ct=new Date(r.created_at); if(!isNaN(ct)) cwhen=ct.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'});}catch(x){}
      /* ~2-3 sentences. Split on sentence ends rather than a character count so the extract
         never stops mid-word or mid-clause; the CSS line-clamp is the visual backstop. */
      var full = String(r.vs_description || cd.description || '').trim();
      var sent = full.match(/[^.!?]+[.!?]+(\s|$)/g);
      var about = sent ? sent.slice(0,3).join('').trim() : full.slice(0,240);
      n = { pid:r.id, href:'/create/?view=entry&e='+r.vs_entry_id, external:false,
            thumb:cd.img||cd.cover||'/assets/images/blog-default.jpg',
            aspect:'2/3', maxH:'',
            badge:'CREATE',
            title:r.title||'Untitled',
            name:r.author_name||'Unknown creator', avatar:cd.avatar||r.author_avatar,
            creatorHref:'/create/?view=entry&e='+r.vs_entry_id,
            meta:(cmeta.competition_slug ? String(cmeta.competition_slug).replace(/-/g,' ').toUpperCase() : 'KEEPITIL CREATE')+(cwhen?' \u00b7 '+cwhen:''),
            provider:'', embed:'', isShort:false,
            vsEntryId:r.vs_entry_id, about:about };

    } else if(r.kind==='video' || r.kind==='pixle'){
      var vd=r.data||{};
      var vwhen=''; try{var vt=new Date(r.created_at); if(!isNaN(vt)) vwhen=vt.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'});}catch(x){}
      var isShort = vd.is_short === true;
      n = { pid:r.id, href:vd.source_url||'#', external:true,
            thumb:window.kilVideoThumb(vd.img||vd.cover)||'/assets/images/blog-default.jpg',
            aspect:isShort?'9/16':'16/9', maxH:isShort?'calc(100dvh - 210px)':'',
            badge:(r.source_platform||'VIDEO').toUpperCase(),
            title:r.title||'Untitled',
            name:r.author_name||'Unknown creator', avatar:vd.avatar||r.author_avatar,
            creatorHref:vd.creator_profile_url||vd.source_url||'#',
            meta:(r.source_platform||'')+(vwhen?' \u00b7 '+vwhen:''),
            provider:(vd.provider||'').toLowerCase(), embed:vd.embed_url||'', isShort:isShort };

    } else if(r.kind==='article'){
      /* ── ARTICLE CARD (Founder 2026-09-03) ────────────────────────────────────────────
         Articles had no branch at all, so they fell through to the written-post case and
         inherited a 1/1.02 `contain` frame plus the shared play affordance — which is why
         they rendered as video with a play button rather than as an article cover.
         The FEED cover is 2:3 portrait; the article's own hero stays 16:9 and is not
         touched here. Artist articles are unaffected: they are not kind 'article'. */
      var ad=r.data||{};
      var awhen=''; try{var at=new Date(r.created_at); if(!isNaN(at)) awhen=at.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'});}catch(x){}
      var rawBody=ad.body||ad.html||ad.caption||'';
      var safeBody=(window.KilSafeHtml && KilSafeHtml.sanitize(String(rawBody))) || '';
      /* ── AN ARTICLE OPENS THE ARTICLE (Founder 2026-09-05) ────────────────────────────
         culArticleToRow() puts the canonical route in data.source_url — /article/<slug>/ or
         /article/artist/<slug>/. This branch was reading data.url, which those rows do not
         carry, so every article fell through to the profile fallback and opened an artist's
         (often unclaimed) profile instead of the editorial piece written about them. An
         article about an artist is not that artist's profile.
         There is no profile fallback any more: if a row has no article route it is not
         linkable as an article, and a dead-end card is better than the wrong destination. */
      var araw = ad.source_url || ad.url || (ad.slug?('/article/'+ad.slug+'/'):'')
                 || (ad.event_slug?('/event?e='+encodeURIComponent(ad.event_slug)):'');
      /* Pages serves /article/x as a 301 to /article/x/; ask for the destination directly. */
      var ahref = araw && /^\/article\//.test(araw) && !/\/$/.test(araw) ? araw + '/' : araw;
      n = { pid:r.id, href:ahref||'#', external:false,
            thumb:ad.cover||ad.img||'/assets/images/blog-default.jpg',
            aspect:'2/3', fit:'cover', profileCard:true,
            badge:'ARTICLE', badgeBg:'rgba(160,107,255,.95)', badgeFg:'#150a24',
            title:ad.t||r.title||'Untitled',
            name:r.author_name||r.profile_slug, avatar:r.author_avatar, creatorHref:ahref||url,
            meta:awhen, caption:'', articleBody:safeBody };
      /* Stashed rather than rendered inline: the collapsed card is image + title, and the body
         only appears inside the MORE overlay. Stored HTML is sanitized before it is kept. */
      try{ (window.__culArticleBodies=window.__culArticleBodies||{})[r.id]=safeBody; }catch(e){}

    } else {
      /* Written post / PIX. */
      var media=(r.media&&r.media[0])||{};
      n = { pid:r.id||('cul:'+r.profile_slug), href:url,
            thumb:media.src||d.img||d.cover||r.author_avatar||'/assets/images/blog-default.jpg',
            aspect:'1/1.02', fit:'contain',
            video:(media.mtype==='video'&&media.src)?media.src:'', poster:d.cover||'',
            title:d.t||'',
            name:r.author_name||r.profile_slug, avatar:r.author_avatar, creatorHref:url,
            meta:'', caption:(window.KilSafeHtml?KilSafeHtml.renderStored({desc:d.desc,text:d.text,body_text:d.body_text,img:media.src||d.img,mtype:media.mtype||d.mtype,tags:d.tags,collab:d.collab,location:d.location,html:d.html}):''),
            cta: d.buy_url ? {label:'\ud83d\uded2 '+(d.buy_label||'Buy on Amazon'), href:d.buy_url,
                              bg:'#ff9900', fg:'#111', external:true, rel:'noopener sponsored nofollow',
                              note:d.disclosure||'#ad \u00b7 affiliate'} : null };
    }
    return kvRenderCard(n);
  }
  function boot(n){
    var sb=window.__culSB;
    if(!sb){ if(n<30){ setTimeout(function(){boot(n+1);},400); } return; }
    function run(viewer){
      /* ranked feed: server-side score = engagement velocity + recency/quality + personalization (follows + affinity) */
      sb.rpc('get_culture_feed', viewer?{p_limit:20,p_viewer:viewer}:{p_limit:20}).then(function(r){
        var rows=(r&&r.data)||[];
        var box=document.getElementById('community-feed'); if(!box) return;
        rows=rows.filter(function(x){ return !(x.kind==='event' && /^venue-/.test(x.profile_slug||'')); }); /* event shows once (owner copy); venue copy lives on the venue page */
        window.__culAllRows=rows;
        /* render function used by both initial paint and the gear Type/Filter (Founder 2026-07-29) */
        /* §D.2: the pager renders ONE row per slide, so it needs the same card builder the feed
           uses. Exposed rather than duplicated — a second card renderer would drift. */
        window.__culCard=card;
        window.__culRenderRows=function(list){ var b=document.getElementById('community-feed'); if(!b)return;
          if(!list||!list.length){ b.innerHTML=''; return; }
          /* ONE BAD CARD MUST NOT EMPTY THE FEED. list.map(card) is a single expression: if card()
             throws on row 7 of 120, the whole map throws and the page renders nothing — which is
             exactly what happened on 2026-08-21 when a renderer referenced a variable that had not
             been assigned yet, and every YouTube video disappeared. Each card is now built in
             isolation; a failure drops that one row and says so in the console. */
          b.innerHTML=list.map(function(row){
            try{ return card(row); }
            catch(e){ console.error('[culture] card failed to render', (row&&row.id), e); return ''; }
          }).join('');
          try{ if(window.__culHydrate) window.__culHydrate(); }catch(e){} };
        /* MEDIA WAS NEVER RENDERED (Founder 2026-08-19: "i do not see the youtube videos only
           the events"). __culMediaRows was fetched only to count inventory for the tab gate and
           was merged in culLiveRows(), which nothing on the render path called — so approved
           videos existed, were queried, and were then dropped on the floor. Load media, merge it
           with the ranked feed and sort by date so a video sits in the timeline rather than in a
           separate tab nobody opens. */
        function paint(){
          var merged = (window.__culAllRows||[])
            .concat(window.__culMediaRows||[])
            .concat(window.__culArticleRows||[])
            .filter(function(x){ return !x.archived; })
            .sort(function(a,b){ return Date.parse(b.created_at||0) - Date.parse(a.created_at||0); });
          window.__culMerged = merged;
          /* ⚠ THE FILTER APPLIES TO EVERYONE, SIGNED IN OR NOT (Founder 2026-08-28).
             This was gated on __culSignedIn: a signed-out visitor went straight to
             __culRenderRows(merged) and the content-type filter was never applied at all.
             Measured on production right after the exclusive-feed fix shipped: culContentType
             was 'video' and the feed still rendered 20 cards, every one of them a non-video —
             because nothing on the signed-out path ever consulted the filter. Fixing
             _culTypeMatch alone could not have shown up here; the function was not being called.
             loadCulRelations() stays signed-in-only (it needs a viewer); the RENDER does not. */
          if(window.__culSignedIn){
            try{ if(typeof loadCulRelations==='function') loadCulRelations(); }catch(e){}
          }
          if(typeof applyCulFilters==='function'){
            try{ applyCulFilters(); }
            catch(e){ console.error('[culture] applyCulFilters threw', e); window.__culRenderRows(merged); }
          } else { window.__culRenderRows(merged); }
          /* SELF-HEAL — Founder 2026-08-20: "the culture page has no content. its empty."
             The signed-in path routes through applyCulFilters(), and if any filter in that chain
             yields nothing (or something later re-renders over it) the page goes blank while the
             data sits in memory — 120 rows loaded, 0 shown. An empty feed with rows available is
             ALWAYS a bug, never a legitimate state, so render them directly rather than leave a
             visitor staring at nothing. */
          /* ⚠ THE GUARD MUST RESPECT THE FILTER (Founder 2026-08-28).
             Its premise — "an empty feed with rows available is ALWAYS a bug" — was true when
             no content-type filter actually worked. It is false now: Photos legitimately
             matches 0 of 133 rows, and the first paint runs before the videos have loaded, so
             the video feed is briefly empty too. In both cases this fired and re-rendered the
             WHOLE merged list unfiltered, which put articles and posts straight back into the
             video feed and reset the video player to the first card. Observed on production
             three times in one session: "[culture] feed rendered empty with 20 rows — forcing
             direct render".
             The real invariant is narrower: never blank the feed when rows PASS THE CURRENT
             FILTER. If nothing passes, an empty feed is the correct answer, not a fault. */
          try{
            var box=document.getElementById('community-feed');
            var passing = merged.filter(function(x){
              try{ return !x.archived && _culTypeMatch(x); }catch(e){ return false; }
            });
            if(passing.length && box && box.children.length===0){
              console.warn('[culture] feed rendered empty with '+passing.length+
                           ' rows passing the '+culContentType+' filter — forcing direct render');
              window.__culRenderRows(passing);   /* the FILTERED list, never the raw merge */
            }
          }catch(e){ console.error('[culture] repaint guard failed', e); }
        }
        /* Paint the feed immediately, then repaint once media arrives — a slow videos query must
           never delay the text feed, and must never blank it if it fails. */
        paint();
        /* culLoadMedia() is declared in a LATER <script> block (line ~871) than this one, so at
           boot time it is frequently not defined yet. The first version of this call was wrapped
           in a bare try/catch, which swallowed the ReferenceError in silence: the feed painted,
           the videos never loaded, and nothing anywhere said why. Same failure class as the
           `.catch()` that took /create down — a defensive catch hiding a real fault.
           Now: wait for the function to exist, and if it never does, SAY SO. Broken must never
           look like empty. */
        (function waitForMedia(n){
          if(typeof culLoadMedia !== 'function'){
            if(n < 40) return setTimeout(function(){ waitForMedia(n+1); }, 250);
            console.error('[culture] culLoadMedia never became available — video feed cannot load');
            return;
          }
          culLoadMedia().then(paint).catch(function(e){
            console.error('[culture] media load failed', e);
          });
        })(0);
        /* Articles load on the same pattern and for the same reason: declared in a later script
           block, so wait for the function rather than swallowing a ReferenceError. A failure
           here must be LOUD — a silently empty article feed is exactly how the eleven live
           article pages stayed invisible for weeks. */
        (function waitForArticles(n){
          if(typeof culLoadArticles !== 'function'){
            if(n < 40) return setTimeout(function(){ waitForArticles(n+1); }, 250);
            console.error('[culture] culLoadArticles never became available — article feed cannot load');
            return;
          }
          culLoadArticles().then(paint).catch(function(e){
            console.error('[culture] article load failed', e);
          });
        })(0);
      }).catch(function(e){ console.error('[culture] feed boot failed', e); });
    }
    try{ sb.rpc('my_profile_slug').then(function(rr){ run(rr&&!rr.error&&rr.data?rr.data:null); }).catch(function(){ run(null); }); }catch(e){ run(null); }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){boot(0);});
  else boot(0);
})();
