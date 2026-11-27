/* KEEPITIL culture/index.html: inline script "mobile" moved verbatim to an external file (CSP: no executable inline script). */
/* MOBILE CULTURE enhancer — additive, ≤860px only. Above 860px every branch below no-ops. */
(function(){

/* ── §D.2 / §D4 — which Culture filters exist today ───────────────────────────────────────
   FEED and ARTICLE always mount: FEED is the surface itself, ARTICLE is in-house content with
   294 live rows. VIDEO and PIXLE are gated on live inventory, so an empty filter is never
   mounted at all rather than mounted-and-hidden.

   §E.2 changed the maths. The source is KEEPITIL's OWN @keepitil accounts — self-syndication,
   one known account per platform — so a 5-creator gate is unreachable by construction and is
   dropped for these two. Item count and category count stand, read from platform_config so the
   owner moves the bar without a deploy.

   BROKEN != EMPTY: if the config cannot be read, the gated filters do not mount and the reason
   is recorded. "No VIDEO tab because there are no videos" and "no VIDEO tab because the config
   read failed" are different facts. */
window.CULTURE_TAB_GATE_NOTE = 'not-evaluated';

function culTabThresholds(){
  var sb = window.__culSB;
  if(!sb) return Promise.resolve(null);
  return sb.from('platform_config').select('key,value')
    .in('key',['culture_tab_min_items','culture_tab_min_creators','culture_tab_min_categories'])
    .then(function(r){
      if(r.error || !r.data) return null;
      var c={}; r.data.forEach(function(row){ c[row.key]=parseInt(row.value,10); });
      if(!isFinite(c.culture_tab_min_items)) return null;
      return { items:c.culture_tab_min_items, categories:c.culture_tab_min_categories };
    }).catch(function(){ return null; });
}

/* §J — VIDEO and PIXLE do not live in profile_content.
   The feed RPC returns kinds post / event / article, so the old `x.kind==='video'` test could
   never match anything: the tab was gated on an inventory that was structurally always zero.
   Media records live in their own `videos` table, so they are loaded separately and mapped into
   the same row shape the rest of this page already understands.

   media_kind is what separates the two tabs — VIDEO reads 'video', PIXLE reads 'photo' — and it
   is OUR column, not the provider's, because TikTok's oEmbed could not be verified to
   distinguish a Photo Mode post from a video one. */
window.__culMediaRows = window.__culMediaRows || [];

function culMediaToRow(v){
  return {
    id: 'media-' + v.id,
    /* A row carrying a CREATE entry is create-work regardless of its media_kind — the
       submission may be an image or a video and it belongs in CREATE either way. */
    kind: v.related_vs_entry_id ? 'create' : (v.media_kind === 'photo' ? 'pixle' : 'video'),
    media_kind: v.media_kind,
    vs_entry_id: v.related_vs_entry_id || null,
    /* Kept so the card can show the ABOUT extract. The FULL submission is NOT copied here —
       MORE opens the canonical entry page, which stays the single source of truth (§6). */
    vs_description: v.description || '',
    vs_meta: v.metadata || {},
    title: v.title,
    created_at: v.published_at,
    archived: false,
    profile_slug: null,
    author_name: v.creator_name,
    /* §L (§19) — third-party media carries creator, platform, source URL and an
       open-on-platform action. own_content is false unless the source says otherwise, so a row
       that forgot the flag over-attributes rather than stripping someone's credit. */
    own_content: v.own_content === true,
    creator_profile_url: v.creator_profile_url || '',
    source_platform: ({youtube:'YouTube',tiktok:'TikTok',instagram:'Instagram'})[v.provider] || v.provider,
    data: {
      /* Thumbnail-first: the card shows an image and only the ACTIVE pager slide mounts a
         player, so a column of fifteen shorts does not start fifteen iframes. */
      img: v.thumbnail_url || '',
      cover: v.thumbnail_url || '',
      embed_url: v.embed_url || '',
      source_url: v.source_url || '',
      is_short: v.is_short === true,
      provider: v.provider,
      category: v.provider
    }
  };
}

/* The supabase client is created by a boot loop that polls for window.supabase for up to ~14s,
   so it very often does NOT exist when the pager first resolves its filters. Returning early in
   that window loaded no media, counted zero items and held VIDEO shut — which is the exact bug
   this wiring was written to fix, and it shipped anyway because the test asserted the call
   ORDER (culLoadMedia before the gate) and not that the data actually arrives. Wait for the
   client on the same budget the page gives itself. */
function culAwaitSB(tries){
  tries = tries || 0;
  if(window.__culSB) return Promise.resolve(window.__culSB);
  if(tries >= 40) return Promise.resolve(null);
  return new Promise(function(res){
    setTimeout(function(){ res(culAwaitSB(tries + 1)); }, 350);
  });
}

function culLoadMedia(){
  if(window.__culMediaLoaded) return Promise.resolve(window.__culMediaRows);
  return culAwaitSB().then(function(sb){
    /* Deliberately does NOT set __culMediaLoaded when the client never arrived — that would
       latch the empty result in and a later, healthier call could never fix it. */
    if(!sb) return window.__culMediaRows;
    return culFetchMedia(sb);
  });
}

/* ── EXPOSED ON window (Founder 2026-08-20: "still no youtube feed") ──────────────────────────
   THE ACTUAL BUG, and the reason three rounds of fixes changed nothing: culLoadMedia,
   culFetchMedia, culAwaitSB and culMediaToRow are declared inside this IIFE — the "MOBILE
   CULTURE enhancer" block — so they are function-scoped. boot(), which paints the feed, lives in
   an EARLIER, separate <script> block and could never see them. Calling culLoadMedia() from
   there threw a ReferenceError every time.
   The data was right, RLS was right, the merge was right, the card renderer was right. The
   function simply did not exist at the call site.
   Exposing them makes the media loader reachable from the feed at any breakpoint. */
window.culAwaitSB    = culAwaitSB;
window.culLoadMedia  = culLoadMedia;
window.culMediaToRow = culMediaToRow;

/* ── ARTICLES IN THE FEED (Founder 2026-08-26) ────────────────────────────────────────────────
   "article/<title> auto populate to culture article feed. article/artist/<artistname> auto
   populate to culture article feed AND connect artist feed."

   Culture already had an 'article' filter and an 'article' kind in its type list — but NOTHING
   ever produced a row of that kind, so the filter matched zero and the eleven live article
   pages were unreachable from the site. blog_articles was empty for the same reason: the pages
   were written as files and never registered as data.

   Rows are normalised into exactly the shape culMediaToRow emits, so the universal card
   renderer draws an article with no changes at all.

   TWO TEMPLATES, ONE TABLE — artist_slug is what tells them apart:
     null      -> editorial,      /article/<slug>
     not null  -> artist feature, /article/artist/<artist_slug>
   `url` is stored per row rather than derived here, so moving a page is a row edit and the two
   URL shapes cannot drift out of sync with the files. */
window.__culArticleRows = window.__culArticleRows || [];

function culArticleToRow(a){
  return {
    id: 'article-' + a.slug,
    kind: 'article',
    title: a.title,
    created_at: a.published_at || a.created_at,
    archived: false,
    profile_slug: a.artist_slug || null,
    author_name: a.author || 'KEEPITIL',
    own_content: true,
    source_platform: 'KEEPITIL',
    artist_slug: a.artist_slug || null,
    data: {
      img:   a.image_url || a.hero_image || '/assets/images/logo-bg.jpg',
      cover: a.image_url || a.hero_image || '/assets/images/logo-bg.jpg',
      source_url: a.url,
      caption: a.excerpt || '',
      /* The BODY, so the piece can be read inside Culture instead of on another page
         (Founder 2026-09-05). The canonical /article/<slug>/ route stays live for direct
         links and search engines; this is the in-feed reading copy. */
      body: a.body_html || a.content || a.excerpt || '',
      category: a.category || ''
    }
  };
}

function culFetchArticles(sb){
  window.__culArticlesLoaded = true;
  return sb.from('blog_articles')
    .select('slug,title,excerpt,image_url,hero_image,category,author,artist_slug,url,published_at,created_at,body_html,content')
    .eq('status','published').eq('published', true)
    .order('published_at',{ascending:false}).limit(60)
    .then(function(r){
      if(r.error || !r.data) return window.__culArticleRows;
      window.__culArticleRows = r.data.filter(function(a){ return a.url; }).map(culArticleToRow);
      return window.__culArticleRows;
    })
    .catch(function(){ return window.__culArticleRows; });
}

function culLoadArticles(){
  if(window.__culArticlesLoaded) return Promise.resolve(window.__culArticleRows);
  return culAwaitSB().then(function(sb){
    /* Same rule as the media loader: do NOT latch the loaded flag when the client never
       arrived, or an empty result becomes permanent. */
    if(!sb) return window.__culArticleRows;
    return culFetchArticles(sb);
  });
}
window.culLoadArticles  = culLoadArticles;
window.culArticleToRow  = culArticleToRow;

function culFetchMedia(sb){
  window.__culMediaLoaded = true;
  /* RLS already restricts anon reads to approved + active, so this is defence in depth rather
     than the only gate — but an unapproved or dead embed must never reach a surface even if a
     policy is later loosened. */
  return sb.from('videos')
    /* related_vs_entry_id is what makes a row CREATE work (Founder 2026-08-28 §5). It is the
       existing relationship — no second CREATE->Culture model, no duplicated submission. */
    .select('id,provider,media_kind,title,creator_name,creator_profile_url,source_url,embed_url,thumbnail_url,published_at,own_content,is_short,related_vs_entry_id,description,metadata')
    .eq('review_status','approved').eq('embed_status','active')
    /* SHORTS ONLY (Founder 2026-09-20: "only play youtube shorts only").
       FILTERED IN THE QUERY, NOT AFTER THE FETCH. .limit(100) below applies to whatever the
       server returns, so filtering client-side would pull 100 mixed rows and leave only the
       ~30 Shorts among them — a feed that looks broken rather than curated.
       is_short is maintained by the tag-shorts job (cron 25); it was verified against
       youtube.com/shorts/<id> on 204 of 204 rows the day this filter went in, 0 mismatches.
       The long-form rows are NOT deleted and keep being ingested and health-checked. This is
       a display filter and nothing else: deleting this one line restores the mixed feed. */
    .eq('is_short', true)
    .order('published_at',{ascending:false}).limit(100)
    .then(function(r){
      if(r.error || !r.data) return window.__culMediaRows;
      window.__culMediaRows = r.data.map(culMediaToRow);
      return window.__culMediaRows;
    }).catch(function(){ return window.__culMediaRows; });
}

window.culFetchMedia = culFetchMedia;

/* ── AUTOPLAY THE VIDEO IN VIEW (Founder 2026-08-20: "need videos to auto play on both desktop
   and mobile") ─────────────────────────────────────────────────────────────────────────────
   ONE player at a time, and only for the card actually on screen. Mounting an iframe per card
   would start 120 YouTube players on a single scroll — the reason these were thumbnail-only in
   the first place. An IntersectionObserver swaps the still for a real player when a card is
   mostly visible and swaps it back when it leaves, so memory and network stay flat no matter
   how far you scroll.
   MUTED is not a style choice: every current browser blocks autoplay with sound, and an
   unmuted attempt fails silently, leaving a dead black box. Muted autoplays everywhere. */
(function(){
  if(!('IntersectionObserver' in window)) return;
  var current = null;

  function stop(card){
    if(!card) return;
    var well = card.querySelector('.kil-vid-well'); if(!well) return;
    var f = well.querySelector('iframe');
    if(f){
      /* PAUSE FIRST, THEN REMOVE (Founder 2026-08-28: "Pause the prior card when the next
         becomes active"). Removing the node alone does stop the sound, but on iOS tearing down
         a playing cross-origin player and mounting the next one in the same frame leaves the
         new player fighting for the audio session, which is one way it comes up paused on its
         poster. Telling the outgoing widget to stop first is the orderly handover. */
      ytCmd(f,'pauseVideo',[]);
      if(f.__kilReadyTimer){ clearTimeout(f.__kilReadyTimer); f.__kilReadyTimer=null; }
      f.__kilDead = 1;
      /* Player replacement. If sound worked on this clip and dies on the next, the boundary
         shows up here: the armed flag is global, but __kvUnmuted belongs to the frame. */
      KVA.log('dead', f, {wasUnmuted: !!f.__kvUnmuted, armed: !!window.__kilSoundOK});
      f.remove();
    }
    var img = well.querySelector('img'); if(img) img.style.display='block';
    var ov = well.querySelector('.kil-vid-play'); if(ov) ov.style.display='';
  }
  /* YouTube privacy-enhanced mode: the same player from youtube-nocookie.com (no YouTube cookies until the video plays). The postMessage origin check below already accepts it. */
  function kilNoCookie(u){ return String(u).replace(/^https:\/\/(www\.)?youtube\.com\/embed\//i, 'https://www.youtube-nocookie.com/embed/'); }
  function kilOptedOut(){   /* same check as keepitil-shell.js __kilOptedOut(); a test keeps them identical */
    try{ if(navigator.globalPrivacyControl === true) return true; }catch(e){}
    try{ if(navigator.doNotTrack === '1' || navigator.doNotTrack === 'yes' || window.doNotTrack === '1' || navigator.msDoNotTrack === '1') return true; }catch(e){}
    return false;
  }
  /* click-to-load: show the card's play button (the thumbnail stays) and mount the player on the first tap */
  function armTap(card){
    var well = card.querySelector('.kil-vid-well'); if(!well) return;
    var ov = well.querySelector('.kil-vid-play'); if(ov) ov.style.display='';
    if(card.__kilArmed) return; card.__kilArmed = 1;
    well.addEventListener('click', function(ev){ ev.preventDefault(); card.__kilTapped = 1; if(current === card) current = null; play(card); }, { once:true });
  }
  function play(card){
    if(!card) return;
    if(current && !document.contains(current)) current = null;   /* survived a repaint */
    if(card === current) return;
    /* GPC / DNT visitors (Grok 2026-11-24): no player, so no contact with YouTube or Google ads, until they tap the card. Everyone else keeps the muted autoplay below. */
    if(kilOptedOut() && !card.__kilTapped){ armTap(card); return; }
    stop(current); current = card;
    var url = card.getAttribute('data-embed'); if(!url) return;
    if(window.KilSafeHtml){ url = KilSafeHtml.safeNavUrl(url); if(!url) return; }
    url = kilNoCookie(url);
    var well = card.querySelector('.kil-vid-well'); if(!well || well.querySelector('iframe')) return;
    var f = document.createElement('iframe');
    f.title = 'KEEPITIL culture video player';   /* a11y: every iframe needs an accessible name */
    /* VOLUME 50% (Founder 2026-08-21). The iframe MUST still start muted — every browser blocks
       autoplay with sound, and an unmuted attempt does not fall back, it just never plays.
       enablejsapi=1 lets us postMessage unMute + setVolume(50) the moment sound is actually
       allowed, which is the first real user gesture on the page. If the visitor never taps, the
       video keeps playing silently rather than not playing at all. */
    /* ⚠ ALWAYS mute=1 IN THE URL. DO NOT make this conditional again.
       (Founder 2026-08-24: "the video content from youtube needs to auto play on the mobile
       device at 50%.")
       It was `window.__kilSoundOK ? '0' : '1'`, on the reasoning that once a gesture has
       happened an unmuted player is allowed. That holds for a same-document <video>. It does
       NOT hold for a cross-origin iframe on iOS: Safari's autoplay permission is not inherited
       by a nested browsing context, so `mute=0&autoplay=1` is refused outright — and a refused
       autoplay does not fall back to muted, it simply never starts. So on any phone where the
       visitor had already tapped once, every video silently failed to play.
       Muted autoplay is always permitted. Start muted, then unMute + setVolume(50) over the
       postMessage API once the frame is up — see onReady(). That is the only sequence that
       yields both autoplay AND sound on iOS. */
    var muteFlag = '1';
    f.src = url + (url.indexOf('?')>-1?'&':'?')
          + 'autoplay=1&mute=' + muteFlag + '&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin='
          + encodeURIComponent(location.origin);
    f.setAttribute('allow','autoplay; encrypted-media; picture-in-picture');
    f.setAttribute('allowfullscreen','');
    /* NOT loading="lazy". This iframe is only ever created for the card that is already the
       active one, so deferring its load is pure delay — and a deferred iframe can miss the
       autoplay it was mounted to perform. The laziness that matters here is already handled by
       mounting one player at a time instead of 120. */
    f.style.cssText='position:absolute;inset:0;width:100%;height:100%;border:0;display:block';
    var img = well.querySelector('img'); if(img) img.style.display='none';
    var ov = well.querySelector('.kil-vid-play'); if(ov) ov.style.display='none';
    well.appendChild(f);
    /* Warm the NEXT card: preconnect + prefetch its thumbnail so swiping to it does not start
       from a cold network. Only ONE player is ever mounted — this is a hint, not a second
       iframe, so the "one player at a time" rule is untouched. */
    try{
      var nxt = card.nextElementSibling;
      while(nxt && !nxt.classList.contains('kil-vid')) nxt = nxt.nextElementSibling;
      if(nxt && !nxt.__warm){
        nxt.__warm = 1;
        var t = nxt.querySelector('img');
        if(t && t.src){ var pre = new Image(); pre.src = t.src; }
      }
    }catch(e){}
    /* ⚠ WAIT FOR PLAYER-READY, NOT FOR iframe 'load' (Founder 2026-08-28: "only after
       player-ready"). 'load' fires when the document inside the frame has loaded, which is
       strictly EARLIER than the widget finishing its own handshake — every command sent in
       that gap is dropped without error. The old code fired playVideo on 'load' and then
       hoped one of eight retries would land after the widget woke up.
       The widget announces itself: post {event:'listening'} and it replies with onReady, then
       infoDelivery messages. beginWhenReady() below drives commands from THAT signal. */
    KVA.log('mount', f, {armedAtMount: !!window.__kilSoundOK});
    f.addEventListener('load', function(){ beginWhenReady(f); });
  }

  /* ── ONE CULTURE AUDIO STATE (Founder 2026-09-08) ──────────────────────────────────
     The audio facts were scattered: an armed flag on window, a bare VOLUME constant, and
     nothing naming the active clip - so "what should this next player sound like?" had no
     single answer to read. They live here now.

     UNITS HAVE ONE BOUNDARY. cultureVolume is canonical 0-1; providers are fed through
     toProviderVolume() and nowhere else, so a 0-1 value can never be handed to an API that
     wants 0-100. VOLUME stays as the provider-unit export the existing calls already use,
     derived rather than typed twice.

     This is deliberately a STATE record, not a rewrite: the ready-handshake and the unmute
     ladder below are unchanged and keep working exactly as they did. */
  window.KIL_CULTURE_AUDIO = window.KIL_CULTURE_AUDIO || {
    cultureAudioArmed: false,
    cultureMuted: false,
    cultureVolume: 0.5,          /* canonical 0-1 */
    activeVideoId: null
  };
  function toProviderVolume(v){   /* the only 0-1 -> 0-100 conversion in Culture */
    return Math.max(0, Math.min(100, Math.round((v==null?0.5:v)*100)));
  }
  var VOLUME = toProviderVolume(window.KIL_CULTURE_AUDIO.cultureVolume);   /* = 50 */
  /* Sound permission is per-session, not per-page (Founder 2026-08-22: "dont have any of the
     videos muted"). Once the visitor has interacted anywhere on the site, every player after
     that mounts UNMUTED from the start rather than mounting muted and being un-muted a beat
     later — which is both faster and more reliable than a postMessage race. */
  /* ⚠ DO NOT PRE-ARM SOUND FROM sessionStorage (Founder 2026-08-28: "never call unmute before
     a user gesture" / "the website mobile version use to auto play the videos but now it
     doesnt ... but it auto plays on my desktop").
     THIS LINE WAS THE REGRESSION. It read kil_sound_ok back at load and set __kilSoundOK=true
     before the visitor had touched THIS document. applyVolume() then fired unMute ~1s into
     every player. WebKit grants autoplay to a muted player only; un-muting one that has no
     gesture in its own document revokes that grant and PAUSES it — and a revoked play does not
     fall back to muted, it just stops. So the first visit of a session worked, and every visit
     after it (kil_sound_ok now '1') died on a poster frame. Desktop never showed it because
     Chrome grants autoplay-with-sound on media-engagement rather than per-gesture.
     A remembered gesture from an earlier page load is NOT a gesture in this one. __kilSoundOK
     is now set only by armSound(), from a real event in this document. The key is still
     WRITTEN so other surfaces can read it; it is deliberately never read back to gate unMute. */
  /* ── AUDIO DIAGNOSTICS (Founder 2026-09-05) ───────────────────────────────────────────
     Read-only. This records the sound lifecycle; it does not retry, reorder or "help"
     anything, because a third blind retry layer on top of the ladder below would only make
     the real failure harder to see. The phone reports video playing and no sound, and the
     open question is WHICH link breaks: is the player ready, was a gesture seen in THIS
     document, did unMute go out, did the widget ever acknowledge muted:false, and does the
     armed state survive the next clip.
     Off by default and costs nothing: entries are kept in a bounded array on window. Open any
     Culture URL with ?kvaudio=1 to also print them and show the on-screen panel. */
  var KVA = (function(){
    var on = false;
    try{ on = /[?&]kvaudio=1/.test(location.search); }catch(e){}
    var LOG = [], MAX = 400, t0 = Date.now(), panel = null;
    function fid(frame){
      if(!frame) return '-';
      if(!frame.__kvId) frame.__kvId = 'f'+(++fid._n||(fid._n=1));
      return frame.__kvId;
    }
    function draw(){
      if(!on) return;
      if(!panel){
        panel = document.createElement('div');
        panel.setAttribute('data-kv-audio','');
        panel.style.cssText='position:fixed;left:6px;bottom:6px;z-index:99999;max-height:42vh;'
          +'width:min(94vw,430px);overflow:auto;background:rgba(0,0,0,.86);color:#7CFFB2;'
          +'font:600 10px/1.35 ui-monospace,Menlo,monospace;padding:8px 10px;border-radius:8px;'
          +'border:1px solid rgba(124,255,178,.35);white-space:pre-wrap;pointer-events:none';
        (document.body||document.documentElement).appendChild(panel);
      }
      panel.textContent = LOG.slice(-26).map(function(e){
        return (e.t/1000).toFixed(2)+'s '+e.frame+' '+e.ev+(e.d?' '+e.d:'');
      }).join('\n');
    }
    function log(ev, frame, detail){
      var e = { t: Date.now()-t0, ev: ev, frame: fid(frame),
                d: detail==null ? '' : (typeof detail==='object' ? JSON.stringify(detail) : String(detail)),
                armed: !!window.__kilSoundOK };
      LOG.push(e);
      if(LOG.length > MAX) LOG.splice(0, LOG.length - MAX);
      if(on){ try{ console.log('[kv-audio]', e.t+'ms', e.frame, ev, e.d, 'armed='+e.armed); }catch(_){}
              try{ draw(); }catch(_){} }
      return e;
    }
    /* A compact answer to "where did it break", rather than a wall of lines. */
    function summary(){
      var byFrame = {};
      LOG.forEach(function(e){
        var f = byFrame[e.frame] || (byFrame[e.frame] = { frame:e.frame, mounted:0, ready:0,
          unmuteSent:0, ackUnmuted:0, ackMuted:0, armedAtMount:null, replaced:0 });
        if(e.ev==='mount'){ f.mounted++; f.armedAtMount = e.armed; }
        if(e.ev==='ready') f.ready++;
        if(e.ev==='cmd:unMute') f.unmuteSent++;
        if(e.ev==='ack:muted=false') f.ackUnmuted++;
        if(e.ev==='ack:muted=true') f.ackMuted++;
        if(e.ev==='dead') f.replaced++;
      });
      return { armed: !!window.__kilSoundOK, frames: Object.keys(byFrame).map(function(k){ return byFrame[k]; }) };
    }
    return { log: log, summary: summary, dump: function(){ return LOG.slice(); }, enabled: function(){ return on; } };
  })();
  window.__kvAudio = KVA;

  function ytCmd(frame, func, args){
    try{
      frame.contentWindow.postMessage(JSON.stringify({event:'command', func:func, args:args||[]}), '*');
      if(func!=='listening') KVA.log('cmd:'+func, frame, args&&args.length?args:null);
    }catch(e){ KVA.log('cmd:'+func+':THREW', frame, e&&e.message); }
  }
  /* ── PLAYER-READY HANDSHAKE ────────────────────────────────────────────────────────────
     The YouTube widget answers {event:'listening'} with an onReady message on its own origin.
     We keep poking 'listening' until it replies, because the very first poke often lands
     before the widget has attached its message handler. Once ready, commands are honoured
     the first time and the shotgun retry loop is no longer needed. */
  var READY = [];   /* frames that have answered */
  window.addEventListener('message', function(ev){
    if(!/^https?:\/\/(www\.)?youtube(-nocookie)?\.com$/.test(ev.origin)) return;
    var d = ev.data;
    if(typeof d === 'string'){ try{ d = JSON.parse(d); }catch(e){ return; } }
    /* ── A CLIP THAT CANNOT EMBED IS NOT A CLIP (Founder 2026-09-06) ─────────────────
       YouTube reports embedding-disabled as onError 101/150 (and 100 for gone). Such a
       player never reaches onReady, so it also never runs the unmute ladder - it just sits
       there as a dead frame, which is exactly what the first card in the feed was doing.
       The two currently in the library are flagged embed_status='blocked' in the database
       and no longer load at all; this is the runtime net, so a clip blocked TOMORROW skips
       itself instead of stalling the feed again. The card is removed and the next playable
       item takes its place. */
    if(d && d.event === 'onError'){
      try{
        var code = d.info && (d.info.errorCode != null ? d.info.errorCode : d.info);
        var dead = (code==101 || code==150 || code==100 || code=='101' || code=='150' || code=='100');
        for(var q=0;q<READY.length;q++){
          var rr=READY[q];
          if(rr.frame && rr.frame.contentWindow === ev.source){
            KVA.log('error:'+code, rr.frame, dead?'not embeddable - skipping':'player error');
            if(dead){
              var card = rr.frame.closest ? rr.frame.closest('.fcard') : null;
              rr.frame.__kilDead = 1;
              if(card && card.parentNode) card.parentNode.removeChild(card);
            }
            break;
          }
        }
      }catch(e){}
      return;
    }
    if(!d || (d.event !== 'onReady' && d.event !== 'infoDelivery' && d.event !== 'initialDelivery')) return;
    /* The widget reports its own mute state here. This is the only honest confirmation that an
       unMute actually took, so the retry ladder stops on it rather than on a guess. */
    try{
      if(d.info && typeof d.info.muted === 'boolean'){
        for(var k=0;k<READY.length;k++){
          if(READY[k].frame && READY[k].frame.contentWindow === ev.source){
            var was = READY[k].frame.__kvUnmuted;
            READY[k].frame.__kvUnmuted = (d.info.muted === false);
            if(was !== READY[k].frame.__kvUnmuted)
              KVA.log('ack:muted='+(d.info.muted?'true':'false'), READY[k].frame,
                      {volume: d.info.volume});
          }
        }
      }
    }catch(e){}
    for(var i=0;i<READY.length;i++){
      var r = READY[i];
      if(r.frame.contentWindow === ev.source && !r.done){
        r.done = 1;
        if(r.frame.__kilReadyTimer){ clearTimeout(r.frame.__kilReadyTimer); r.frame.__kilReadyTimer=null; }
        if(!r.frame.__kilDead) onReady(r.frame);
      }
    }
  }, false);

  function beginWhenReady(frame){
    if(!frame || frame.__kilDead) return;
    var rec = { frame: frame, done: 0 };
    READY.push(rec);
    if(READY.length > 8) READY.splice(0, READY.length - 8);   /* one player at a time; bound it */
    var n = 0;
    (function poke(){
      if(rec.done || frame.__kilDead || !document.contains(frame)) return;
      ytCmd(frame, 'listening', []);
      /* ~6s of polling. A cold mobile connection can take several seconds to build the widget,
         and giving up early is what leaves a live card sitting on its poster. */
      if(++n < 24) frame.__kilReadyTimer = setTimeout(poke, 250);
    })();
  }

  /* The player is genuinely up. Start it MUTED — that is the only state WebKit will autoplay
     in a cross-origin iframe — and set the volume so the level is already right if and when a
     gesture later makes sound legal. NO unMute here, ever: at this moment there has been no
     gesture in this document, and un-muting would revoke the autoplay grant we just used. */
  /* ── UNMUTE IS ASSERTED UNTIL THE WIDGET CONFIRMS IT (Founder 2026-09-04) ──────────────
     The previous version sent ONE unMute 600ms after ready and never checked whether it
     landed. That is the same fire-and-forget the 'listening' handshake above already had to
     abandon — the widget frequently ignores a command sent while it is still settling, and a
     dropped unMute is invisible: the clip keeps playing, silently, forever.
     This re-asserts on a short ladder and stops as soon as the player reports muted:false via
     infoDelivery. Nothing about the autoplay contract changes: the player is still mounted
     with mute=1 in the URL and still starts muted, because that is the only state WebKit will
     autoplay in a cross-origin iframe. Only the un-muting afterwards is made reliable. */
  var UNMUTE_AT = [250, 700, 1500, 3000, 5000];
  function kvAssertSound(frame){
    if(!frame || frame.__kilDead || !window.__kilSoundOK) return;
    if(frame.__kvUnmuteRunning) return;
    frame.__kvUnmuteRunning = 1;
    UNMUTE_AT.forEach(function(ms){
      setTimeout(function(){
        if(frame.__kilDead || frame.__kvUnmuted || !document.contains(frame)) return;
        ytCmd(frame,'playVideo',[]);
        ytCmd(frame,'setVolume',[VOLUME]);
        ytCmd(frame,'unMute',[]);
      }, ms);
    });
  }
  function onReady(frame){
    KVA.log('ready', frame, {armed: !!window.__kilSoundOK});
    try{
      var _src=frame.getAttribute('src')||'';
      var _m=_src.match(/embed\/([A-Za-z0-9_-]{11})/);
      /* Exactly one clip is the audio owner at a time; naming it makes that checkable. */
      if(_m) window.KIL_CULTURE_AUDIO.activeVideoId=_m[1];
    }catch(e){}
    ytCmd(frame,'mute',[]);
    ytCmd(frame,'playVideo',[]);
    ytCmd(frame,'setVolume',[VOLUME]);
    /* Armed already? Then this card — and every card after it — comes up audible on its own,
       which is the behaviour that was missing: sound survived only for the clip that happened
       to be playing when the visitor first touched the page. */
    kvAssertSound(frame);
  }

  /* Sound becomes legal on the first real gesture. Record it, unmute whatever is playing, and
     stop listening — this must not re-run on every tap for the life of the page. */
  /* ⚠ PRIVATE GUARD (Founder 2026-09-24). This returned early on window.__kilSoundOK — a flag
     the SHELL also writes, on pointerdown (before activation exists) and even at page load
     from sessionStorage. So once a visitor had tapped anything anywhere on the site, this
     function saw "already armed" and never sent the unMute: every clip stayed muted, on
     phones and desktops alike. Whether THIS page has unmuted is this page's own fact. */
  var cultureUnmuted = false;
  function armSound(){
    if(cultureUnmuted) return;
    cultureUnmuted = true;
    window.__kilSoundOK = true;
    try{
      window.KIL_CULTURE_AUDIO.cultureAudioArmed = true;
      window.KIL_CULTURE_AUDIO.cultureMuted = false;
    }catch(e){}
    KVA.log('gesture-armed', null, 'sound is now legal in THIS document');
    /* Still written for other surfaces; deliberately never read back to gate unMute — see the
       DO-NOT-PRE-ARM note above. */
    try{ sessionStorage.setItem('kil_sound_ok','1'); }catch(e){}
    var f = current && current.querySelector('iframe');
    if(f && !f.__kilDead){
      /* A gesture has JUST happened, which is exactly the moment WebKit permits un-muting a
         player that is already running. Order matters: setVolume before unMute, so the first
         audible instant is already at 50% rather than at the widget's default.
         playVideo is re-asserted because a player that was paused by an earlier failed attempt
         will not resume on unMute alone. */
      ytCmd(f,'playVideo',[]);
      ytCmd(f,'setVolume',[VOLUME]);
      ytCmd(f,'unMute',[]);
      kvAssertSound(f);
    }
    /* Uploaded clips are plain <video>, not the YouTube widget, so they need unmuting directly. */
    document.querySelectorAll('.fcard video').forEach(function(v){
      v.muted = false; v.volume = VOLUME/100;
      var p = v.play(); if(p && p.catch) p.catch(function(){});
    });
  }
  /* ── ARMING MUST INCLUDE A TAP ON THE PLAYER ITSELF (Founder 2026-09-08) ────────────
     These three events are parent-document events, and a tap INSIDE the YouTube iframe is
     consumed by that cross-origin document - it never reaches us. Tapping the video is the
     most natural first interaction a visitor makes, so the most common way of asking for
     sound was the one way that could not arm it, and the clip stayed muted for the session.
     Clicking into a cross-origin frame blurs the parent window and leaves that iframe as
     document.activeElement; that pair is the standard, policy-respecting signal that the
     visitor interacted with the embed. Nothing here bypasses autoplay policy - the browser
     has granted activation to the frame, which is precisely when un-muting is permitted. */
  /* ⚠ ARM ONLY WHEN THE BROWSER HAS ACTUALLY GRANTED ACTIVATION (Founder 2026-09-24: "every
     video starts on mute"). This listened on pointerdown and touchstart with once:true. On a
     phone those are the FIRST events of a tap, and activation is not granted until the END of
     it — measured: pointerdown:false, touchstart:false, pointerup:true, touchend:true. So the
     unMute was sent while it was still forbidden, refused, and the page then marked itself
     armed and never tried again. Desktop mice grant activation at pointerdown, which is why
     desktop fared better. Listen on every candidate, act only once userActivation says so. */
  function armIfActive(){
    var ua = navigator.userActivation;
    if(ua && !ua.isActive) return;            /* too early in the gesture — wait for the end of it */
    ['pointerdown','pointerup','mousedown','click','keydown','touchstart','touchend'].forEach(function(ev){
      document.removeEventListener(ev, armIfActive, true);
    });
    armSound();
  }
  ['pointerdown','pointerup','mousedown','click','keydown','touchstart','touchend'].forEach(function(ev){
    document.addEventListener(ev, armIfActive, {passive:true, capture:true});
  });
  window.addEventListener('blur', function(){
    /* Read after the blur settles, or activeElement is still <body>. */
    setTimeout(function(){
      try{
        var a=document.activeElement;
        if(a && a.tagName==='IFRAME' && a.closest && a.closest('.kil-vid-well')) armSound();
      }catch(e){}
    }, 0);
  });

  /* The feed is its own scroller on mobile, so the observer must watch THAT box — with the
     default (viewport) root a card can be fully on screen inside the scroller and still be
     reported late. Combined with a 0.6 threshold, the player only mounted well after the card
     had settled, which is the lag. */
  var scrollRoot = document.getElementById('community-feed');
  if(scrollRoot && getComputedStyle(scrollRoot).overflowY !== 'auto') scrollRoot = null;

  var io = new IntersectionObserver(function(entries){
    /* Pick the MOST visible card rather than the first to cross the line — on a fast scroll
       several fire in one callback and the first is rarely the one being looked at. */
    var best=null, bestRatio=0;
    entries.forEach(function(en){
      if(en.isIntersecting && en.intersectionRatio > bestRatio){ bestRatio=en.intersectionRatio; best=en.target; }
      else if(!en.isIntersecting && en.target === current){ stop(current); current=null; }
    });
    /* 0.35 rather than 0.6: on a full-height card the player now mounts as the card arrives
       instead of after it has stopped moving. */
    if(best && bestRatio >= 0.35) play(best);
  }, { root: scrollRoot || null, rootMargin: '120% 0px 120% 0px', threshold:[0, 0.35, 0.7] });

  function scan(){
    [].forEach.call(document.querySelectorAll('.kil-vid:not([data-vidobs])'), function(c){
      c.setAttribute('data-vidobs','1'); io.observe(c);
    });
    /* START THE TOP VIDEO IMMEDIATELY (Founder 2026-08-23: "needs to auto load, auto play, and
       play fast"). An IntersectionObserver does not fire until something MOVES — so the first
       card just sat on its thumbnail until the visitor scrolled. Mount it as soon as it exists
       instead of waiting for a scroll that may never come. */
    /* `current` must be treated as stale after a repaint. The feed paints TWICE — text first,
       then again when the videos arrive — and __culRenderRows replaces innerHTML wholesale. That
       leaves `current` pointing at a DETACHED node, so `if(!current)` was false and the autostart
       never ran for the newly painted cards. The videos that "would not load", especially the
       first few, were the ones that arrived in that second paint. */
    if(current && !document.contains(current)) current = null;
    if(!current){
      var first = document.querySelector('#community-feed .kil-vid[data-embed], .kil-vid[data-embed]');
      if(first) play(first);
    }
  }
  /* The feed repaints (media arrives after the text feed), so observe new cards as they appear. */
  if(document.readyState!=='loading') scan(); else document.addEventListener('DOMContentLoaded', scan);
  new MutationObserver(scan).observe(document.documentElement, {childList:true, subtree:true});
  /* Anything that leaves the tab should not keep a player running. */
  document.addEventListener('visibilitychange', function(){ if(document.hidden){ stop(current); current=null; } });

  /* ── R6.3 — THE RESTED CARD ALWAYS GETS A PLAYER ────────────────────────────────────────
     intersectionRatio >= 0.35 is a SCROLLING heuristic. On a snap feed the correct trigger is
     "this card is the snapped one": a card can come to rest at its snap position while a
     neighbour still scores higher, and the debug readout confirmed the consequence — most
     cards report `iframe (not mounted)` and sit on a poster with a play glyph, which is
     visually identical to autoplay being broken.
     The observer keeps doing what it is good at (teardown, and the one-player-at-a-time rule);
     this only guarantees that whatever is at rest in the frame is a player and not a still.
     scrollend where it exists, a debounced scroll everywhere else. */
  function kvSnappedCard(){
    var cards = document.querySelectorAll('.kil-vid[data-embed]');
    if(!cards.length) return null;
    var bnav = parseFloat(getComputedStyle(document.documentElement)
                 .getPropertyValue('--kil-bnav-h')) || 0;
    var mid = (window.innerHeight - bnav) / 2;
    var best=null, bestD=Infinity;
    [].forEach.call(cards, function(c){
      var r=c.getBoundingClientRect();
      if(r.bottom<=0 || r.top>=window.innerHeight) return;
      var d=Math.abs((r.top+r.bottom)/2 - mid);
      if(d<bestD){ bestD=d; best=c; }
    });
    return best;
  }
  function kvMountSnapped(){
    try{
      if(current && !document.contains(current)) current=null;
      var c=kvSnappedCard();
      if(c && c!==current) play(c);
    }catch(e){}
  }
  var kvT;
  window.addEventListener('scroll', function(){
    clearTimeout(kvT); kvT=setTimeout(kvMountSnapped,140);
  }, {passive:true});
  if('onscrollend' in window){
    window.addEventListener('scrollend', kvMountSnapped, {passive:true});
  }
})();

function culLiveRows(){
  var feed = (window.__culAllRows||[]).filter(function(x){ return !x.archived; });
  return feed.concat(window.__culMediaRows||[]);
}

function culInventory(test){
  var rows = culLiveRows().filter(test);
  var cats = {};
  rows.forEach(function(x){
    var d=x.data||{}; var c=d.category||d.genre||x.kind;
    if(c) cats[String(c).toLowerCase()]=1;
  });
  return { items:rows.length, categories:Object.keys(cats).length };
}

/* Owner's labels and spelling: FEED · ARTICLE · VIDEO · PIXLE. */
var CUL_FILTERS = [
  { id:'feed',    label:'Feed',    gated:false, test:function(){ return true; } },
  { id:'article', label:'Article', gated:false, test:function(x){ return x.kind==='article'; } },
  /* These two read media_kind, not kind — the distinction the ingester carries so that PIXLE and
     VIDEO can never show each other's content. Testing kind alone would let a photo record whose
     kind happens to read 'video' cross the boundary. */
  { id:'video',   label:'Video',   gated:true,  test:function(x){ return x.media_kind==='video'; } },
  { id:'pixle',   label:'Pixle',   gated:true,  test:function(x){ return x.media_kind==='photo'; } }
];

/* Resolves to the filters that should exist right now. */
function culResolveFilters(){
  /* Media MUST be loaded before the gate is evaluated. Resolving filters against an empty
     __culMediaRows counts zero items for VIDEO and PIXLE and holds both tabs — which is exactly
     the bug this wiring fixes, reintroduced one tick earlier. */
  return culLoadMedia().then(culTabThresholds).then(function(t){
    var open=[], held=[];
    CUL_FILTERS.forEach(function(f){
      if(!f.gated){ open.push(f); return; }
      if(!t){ held.push(f.id+': threshold-unavailable'); return; }
      var inv=culInventory(f.test);
      if(inv.items>=t.items && inv.categories>=t.categories){ open.push(f); }
      else held.push(f.id+': '+inv.items+'/'+t.items+' items, '+inv.categories+'/'+t.categories+' categories');
    });
    window.CULTURE_TAB_GATE_NOTE =
      'mounted: ' + open.map(function(f){return f.id;}).join(' · ') +
      (held.length ? '. held: ' + held.join(' | ') : '. none held');
    return open;
  });
}

  function isMob(){ try{ return window.matchMedia('(max-width:860px)').matches; }catch(e){ return false; } }
  function sync(){ document.body.classList.toggle('cul-m', isMob()); }
  sync(); window.addEventListener('resize', sync);
  if(!isMob()) return;

  /* 1 — §D.2: Culture becomes a full-screen pager. The mobile tab row and the type bar are
     both replaced by the pager's locked single-filter header, so neither is built here any
     more. Radio is not a Culture filter — it is a global destination since K1. */
  /* ── MOBILE PAGER RETIRED (Atlas 2026-08-20, after KODE Part C #3) ──────────────────────
     Culture's ENTIRE mobile experience was this pager — its own comment says the tab row and
     type bar "are not built here any more" because the pager's header replaced them. When the
     pager was disabled site-wide (Founder: swipe must not change the page), mobile Culture was
     left with no feed, no tabs and no scroll. KODE reproduced exactly that on an iPhone 17 Pro.
     Mobile now uses the same normal scrolling feed as desktop: boot() renders #community-feed
     and the page simply scrolls. */
  (function mountCulturePager(attempt){
    return;
    attempt = attempt || 0;
    if(!window.KIL_PAGER){ if(attempt<40) setTimeout(function(){ mountCulturePager(attempt+1); }, 250); return; }
    /* Rows arrive from Supabase, so the first pass is usually empty. */
    if(!Array.isArray(window.__culAllRows) || !window.__culAllRows.length || !window.__culCard){
      if(attempt<40){ setTimeout(function(){ mountCulturePager(attempt+1); }, 300); return; }
      window.CULTURE_TAB_GATE_NOTE = 'not-evaluated: feed rows never loaded';
      try{ console.warn('[culture] '+window.CULTURE_TAB_GATE_NOTE); }catch(e){}
      return;
    }

    culResolveFilters().then(function(open){
      /* SNAPSHOT per filter: the pager asks for items() on every settle, and a live query over
         a mutating list would give it a different answer each time. Radio hit exactly this. */
      var snap = {};
      var filters = open.map(function(f){
        return {
          id: f.id,
          label: f.label,
          items: function(){
            if(!snap[f.id]) snap[f.id] = culLiveRows().filter(f.test);
            return snap[f.id];
          },
          render: function(row, el){
            if(!row) return;
            el.innerHTML = window.__culCard(row);
            try{ if(window.__culHydrate) window.__culHydrate(); }catch(e){}
          }
        };
      });

      window.KIL_PAGER.mount({
        filters: filters,
        emptyFor: function(f){
          return { title:'Nothing in ' + f.label + ' yet',
                   body:'New posts appear here as they publish.' };
        }
      });

      /* The surfaces the pager replaces. */
      ['culMTabs','culTypeBar','culSwToast'].forEach(function(id){
        var el=document.getElementById(id); if(el) el.remove();
      });
      var fd=document.getElementById('feed'); if(fd) fd.style.display='none';
      var cf=document.getElementById('community-feed'); if(cf) cf.style.display='none';
    });
  })(0);

  /* 2 — caption "…more": expand upward, collapse again. Never hijacks a link tap. */
  document.addEventListener('click',function(e){
    if(!isMob()) return;
    var a=e.target.closest && e.target.closest('.fb-cap a'); if(a) return;   /* let the one link work */
    var cap=e.target.closest && e.target.closest('.fb-cap'); if(!cap) return;
    var card=cap.closest('.fcard'); if(!card) return;
    if(cap.scrollHeight>cap.clientHeight || card.classList.contains('capopen')){
      e.preventDefault(); e.stopPropagation();
      card.classList.toggle('capopen');
    }
  },true);

  /* 3 — REMOVED (Founder 2026-08-20: "the events pages has 2 buttons").
     This appended a second BUY on top of the card's own "Get Tickets", so every mobile event
     card carried two controls doing the same thing. The card button stays; this one goes. */
  function addBuy(){
    return;
    if(!isMob()) return;
    [].forEach.call(document.querySelectorAll('.fcard.evpost'),function(c){
      if(c.querySelector('.cul-buy')) return;
      var slug=(c.dataset.pid||'').replace(/^cul:/,''); if(!slug) return;
      var a=document.createElement('a'); a.className='cul-buy';
      a.href='/event?e='+encodeURIComponent(slug); a.textContent='BUY';
      a.addEventListener('click',function(ev){ ev.stopPropagation(); });
      c.appendChild(a);
    });
  }
  /* 4 — 6th rail action: More (…) → the existing culPostMenu (view profile / copy / report) */
  function addMore(){
    if(!isMob()) return;
    [].forEach.call(document.querySelectorAll('.fcard .fb-actions'),function(act){
      if(act.querySelector('.fba-more')) return;
      var card=act.closest('.fcard'); if(!card) return;
      var slug=(card.dataset.slug||(card.dataset.pid||'').replace(/^cul:/,''));
      var b=document.createElement('button');
      b.className='fba fba-more'; b.title='More';
      b.innerHTML='<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
      b.addEventListener('click',function(ev){
        ev.preventDefault(); ev.stopPropagation();
        /* SHARE URL CORRECTED (KODE 2026-09-09). This passed location.origin+'/blog-'+slug
           +'.html' - a retired flat blog URL. Every blog-*.html file is deleted and ~130 of
           them are queued for search-index removal, so "View profile" navigated to a 404 and
           "Copy link" handed the visitor a dead link. It was doubly wrong: culPostMenu does
           location.origin+url for the copy action, so an absolute URL came out with the
           origin twice. It now passes a PATH to a page that returns 200.
           ⚑ OPEN PRODUCT ARCHITECTURE: PER-POST CULTURE DEEP LINK.
           This fallback is deliberate and temporary. It guarantees a live destination, but
           "Copy link" hands out the section URL, so a shared link cannot open the specific
           item. That is a product gap, not a bug to patch here, and it must NOT be closed
           by reviving a flat /blog-<slug>.html page - that generation is retired and its
           URLs are queued for search-index removal.
           Proposed current-architecture fix, for owner approval (KODE 2026-09-09):
             /culture/?post=<slug>  — a query parameter on the canonical Culture URL.
           It needs no new route, no new file and no hosting change, which matters because
           GitHub Pages cannot serve a rewrite; Culture reads the parameter on load, scrolls
           to and opens that item, and falls back to the normal feed when the slug is
           unknown or the post is gone. Canonical stays https://keepitil.com/culture/ so the
           parameter never fragments the index, and og: tags can still be page-level.
           Rejected alternatives, with the reason: a real /culture/<slug>/ directory per post
           would need a generated file per post committed on every publish, which is the
           build-time architecture the site deliberately does not have; a #<slug> hash is
           invisible to crawlers and to any server-side unfurler. */
        if(typeof window.culPostMenu==='function') window.culPostMenu(ev, slug, '/culture/');
      });
      act.appendChild(b);
    });
  }
  function enhance(){ addBuy(); addMore(); }
  enhance();
  new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});
})();
