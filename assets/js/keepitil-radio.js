/*!
 * KEEPITIL Radio Bar — keepitil-radio.js  v1.0
 * Self-injecting · 24/7 synchronized SoundCloud stream · X-mark logo
 */
(function(){
  if(window.__kilRadioInit)return;
  window.__kilRadioInit=true;

  /* ── CULTURE OWNS ITS OWN AUDIO (Founder 2026-08-28 §12/§13/§14) ────────────────────────
     "The only primary surface that should not use the Radio bar or Radio autoplay is CULTURE.
      Culture VIDEO already owns the active media/audio experience. Do not allow Radio and
      Culture video to play simultaneously."

     This returns BEFORE the CSS, the bar and the player exist, so on Culture there is no bar,
     no #kil-sc iframe and no SoundCloud request at all — not a hidden bar or a muted player.
     Two things that are NOT sufficient on their own and are deliberately not what this does:
       · hiding the bar with CSS   — the player would still be mounted and audible
       · pausing after mount       — the audio can be heard before the pause lands, which is
                                     exactly the collision the Founder is describing

     Matching is on PATH, not on a body class: the class is applied by script that runs later
     than this file, so a class test would race and lose on a cold load. Covers /culture,
     /culture/ and /culture/index.html, and the app bundle's own copy of the same page. */
  var KIL_NO_RADIO = /(^|\/)culture(\/|\/index\.html)?$/i.test(location.pathname.replace(/\/+$/, '/') );
  if(!KIL_NO_RADIO){
    /* Belt and braces for the bundled app, where the path can be a file URL. */
    KIL_NO_RADIO = /\/culture(\/|$)/i.test(location.pathname);
  }
  if(KIL_NO_RADIO){
    window.__kilRadioSuppressed = true;
    /* Anything already playing from the previous page stops as Culture opens. In the bundled
       app and on a PJAX navigation the shell survives the page change, so a player mounted on
       EARN would otherwise keep going underneath a Culture video. */
    try{
      var prior = document.getElementById('kil-sc');
      if(prior) prior.remove();
      var priorBar = document.getElementById('kil-radio');
      if(priorBar) priorBar.remove();
      document.querySelectorAll('body').forEach(function(b){ b.style.paddingBottom=''; });
    }catch(e){}
    return;
  }

  // ── Inject CSS ────────────────────────────────────────────────────────────
  var css=document.createElement('style');
  css.setAttribute('data-kil','player');
  css.textContent=
    '#kil-radio{position:fixed;bottom:0;left:0;right:0;height:40px;z-index:9998;background:rgba(6,6,6,.97);border-top:1px solid rgba(0,255,136,.2);box-shadow:0 -2px 24px rgba(0,0,0,.7);backdrop-filter:blur(18px);font-family:\'Space Grotesk\',\'Inter\',sans-serif;display:flex;align-items:center;padding:0 5px;gap:5px;overflow:hidden;transition:bottom .3s,left .3s,right .3s,width .3s,height .3s,border-radius .3s,border .3s,padding .3s,box-shadow .3s;}'+
    '#kil-radio.kil-mini{bottom:20px!important;left:auto!important;right:24px!important;width:58px!important;height:58px!important;border-radius:50%!important;border:2px solid rgba(0,255,136,.3)!important;border-top:2px solid rgba(0,255,136,.3)!important;box-shadow:0 4px 24px rgba(0,0,0,.7),0 0 20px rgba(0,255,136,.08)!important;cursor:pointer!important;padding:0!important;justify-content:center!important;gap:0!important;}'+
    '#kil-mini-dot{display:none;width:100%;height:100%;align-items:center;justify-content:center;font-size:1.5rem;color:#00ff88;animation:kil-blink 2s ease-in-out infinite;}'+
    '#kil-radio.kil-mini #kil-mini-dot{display:flex!important;}'+
    '#kil-radio.kil-mini .krb{display:none!important;}'+
    '.kil-live{width:7px;height:7px;border-radius:50%;background:#00ff88;flex-shrink:0;box-shadow:0 0 6px #00ff88;animation:kil-blink 2s ease-in-out infinite;}'+
    '.kil-live.off{background:#444;box-shadow:none;animation:none;}'+
    '@keyframes kil-blink{0%,100%{opacity:1;}50%{opacity:.35;}}'+
    '.kil-brand-logo{height:28px;width:auto;filter:drop-shadow(0 0 4px rgba(255,80,120,.7));}'+
    '.kil-brand-radio{font-size:.55rem;font-weight:900;letter-spacing:.18em;color:#00ff88;text-transform:uppercase;}'+
    /* ── SHUTTLE (Founder 2026-08-22) ────────────────────────────────────────────────
       << playlist · < song · NOW PLAYING · song > · playlist >>
       The neighbouring titles are a convenience, not the control: they truncate hard and
       disappear below 900px so the arrows and the current track always fit. */
    /* FIXED GEOMETRY (Founder 2026-08-23: "no changing position regardless of song text title
       length"). The centre column was `auto`, so it grew and shrank with the track title and
       dragged both side columns — and therefore every arrow — sideways on each song change.
       A fixed centre width means the three columns never re-measure: the arrows sit at the same
       pixel all night and the title truncates inside its slot instead of pushing the layout. */
    /* ── 7-BUTTON BAR (Founder 2026-08-27) ─────────────────────────────────────────
       The bar is SEVEN buttons on one flex line, each independently weighted:
         1 brand .9 | 2 prev-playlist 1.8 | 3 prev-song 2 | 4 now 4.1 | 5 next-song 2
         | 6 next-playlist 1.8 | 7 mute 1
       Weights, not pixels: the bar always spans the viewport, so the ratio is what holds
       the proportions at every width. Button 4 is the longest by design.
       The old .kr-shuttle grid + .kr-grp wrappers are GONE — they nested the controls two
       levels deep and made per-button width impossible. Every element ID survived the
       move, so every handler below still binds. */
    /* The volume slider sits in the bar like any other control. It is [hidden] until MUTE
       is pressed, so the bar keeps its usual shape until a level is actually being chosen. */
    '.kr-vol{flex:0 0 92px;width:92px;height:4px;padding:0;margin:0 8px;cursor:pointer;'+
      'appearance:none;-webkit-appearance:none;background:rgba(255,255,255,.28);border:0;'+
      'border-radius:999px;accent-color:#00e0a4;}'+
    '.kr-vol::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;'+
      'border-radius:50%;background:#00e0a4;border:0;cursor:pointer;}'+
    '.kr-vol::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:#00e0a4;'+
      'border:0;cursor:pointer;}'+
    '.kr-vol[hidden]{display:none!important;}'+
    '@media(max-width:860px){.kr-vol{flex-basis:70px;width:70px;}}'+
    /* ══ .krb NO LONGER DRAWS A BOX (KODE 2026-09-10) ═══════════════════════════════════
       Measured on the live desktop bar: SEVEN separate boxed regions, each with its own
       1px border, translucent fill and 5px radius - LIVE RADIO, prev, now-playing, next,
       mute, volume, favourite. That is the "chopped-up box treatment": a strip of little
       widgets rather than one media strip. Hierarchy now comes from spacing, weight and
       colour; a container is drawn only where it earns one (the LIVE RADIO gateway).
       Mobile keeps its own .krb sizing in the max-width blocks below - untouched. */
    '.krb{display:flex;align-items:center;justify-content:center;gap:6px;min-width:0;'+
      'height:35px;padding:0 6px;background:transparent;border:0;'+
      'color:rgba(255,255,255,.72);'+
      'font-family:inherit;font-size:.7rem;letter-spacing:.05em;white-space:nowrap;'+
      'overflow:hidden;transition:color .18s,opacity .18s;}'+
    'button.krb{cursor:pointer;}'+
    'button.krb:hover{background:rgba(0,255,136,.14);border-color:rgba(0,255,136,.3);}'+
    '.krb-brand{flex:0.9 1 0;}'+
    '#kr-prevpl{flex:1.8 1 0;}'+
    '#kr-prev{flex:2 1 0;}'+
    /* De-boxed 2026-09-10: the tinted fill made the centre read as a separate widget. */
    '.krb-now{flex:4.1 1 0;position:relative;background:none;'+
      'border-color:rgba(0,255,136,.28);}'+
    '#kr-next{flex:2 1 0;}'+
    '#kr-nextpl{flex:1.8 1 0;}'+
    '#kr-mute{flex:1 1 0;}'+
    '.krb-g{flex:0 0 auto;color:#00ff88;font-weight:800;font-size:1rem;line-height:1;}'+
    '.kr-side{font-size:.7rem;color:rgba(255,255,255,.55);white-space:nowrap;overflow:hidden;'+
      'text-overflow:ellipsis;min-width:0;}'+
    '.kr-plname{font-weight:800;font-size:.68rem;letter-spacing:.06em;color:rgba(0,255,136,.8);'+
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}'+
    /* Button 4 shows the SONG and the PLAYLIST alternately, 5s each with a half-second
       cross-fade. Both spans are stacked in the same box so neither reflows the bar when
       the other is showing; the whole cycle is CSS, so there is no timer to leak. */
    /* ══ ONE NOW PLAYING SYSTEM (KODE 2026-09-10) ═════════════════════════════════════
       Deleted here: `.krb-now .kr-now{position:absolute;left:8px;right:8px}` plus
       `animation:kil-swap`, the `#kr-nowpl{animation-delay:5s}` offset and the
       `@keyframes kil-swap` crossfade.

       That rule matched BOTH #kil-track and #kr-nowpl - each carries class .kr-now - and
       stacked them absolutely in the same box, alternating their opacity on a 10s cycle.
       When the column layout (.kr-nowwrap: label / title / station) was added it did not
       remove this, so two systems addressed the same two spans at once: the overlapping
       Now Playing text. The column layout below is now the only one. */
    '@media(max-width:1100px){.kr-plname{display:none;}}'+
    '@media(max-width:900px){.kr-side{display:none;}}'+
    '.kr-btn{background:none;border:none;cursor:pointer;color:#00ff88;font-size:.85rem;line-height:1;padding:2px 4px;transition:opacity .2s;flex-shrink:0;}'+
    '.kr-btn:hover{opacity:.6;}'+
    '#kr-vol{width:60px;accent-color:#00ff88;cursor:pointer;opacity:.75;vertical-align:middle;}'+
    '#kil-sc{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;}'+
    /* The #kilo-btn overrides that lived here are GONE — the shell owns the chat
       button's position now. The PANEL still needs to clear the radio bar. */
    '#kilo-panel{bottom:118px!important;}'+
    '.radio-mini #kilo-panel{bottom:156px!important;right:24px!important;}'+
    // Body padding so content clears the fixed bar
    'body{padding-bottom:40px;}'+
    // Scroll-to-top button: lift above radio bar, move to left to avoid Echo on right
    '#scroll-top{bottom:54px!important;left:24px!important;right:auto!important;}'+
    '.radio-mini #scroll-top{bottom:92px!important;}'+
    // Nav logo: bigger across all pages (overrides inline height:30px)
    'a.nav-logo img,#main-nav img,nav img[src*="keepitil-x-"]{height:44px!important;width:auto!important;}'+
    '@media(max-width:600px){'+
      /* ⚠ MOBILE IS UNCHANGED BY THE 7-BUTTON REBUILD (Founder 2026-08-27: "do not change
         the mobile bar"). The desktop layout stacks the song and playlist absolutely inside
         button 4 and gives every button a flex weight; both are undone here so the small bar
         keeps the shape it already had — logo + RADIO, one centred track line, controls. */
      '.kil-live,.kil-divider{display:none!important;}'+
      '.krb{flex:0 0 auto!important;height:28px;padding:0 6px;gap:4px;}'+
      '.krb-now{flex:1 1 auto!important;position:static;background:none;border-color:transparent;}'+
      /* position/animation resets dropped with the absolute+crossfade system they undid.
         The mobile type scale stays, and so does hiding the station sub-line below. */
      '.krb-now .kr-now{font-size:.62rem;font-weight:400;color:rgba(255,255,255,.7);}'+
      '#kr-nowpl{display:none!important;}'+
      '.kr-side,.kr-plname{display:none!important;}'+
      '.kil-brand-logo{height:22px;}'+
      '#kr-mute{margin-left:auto;}'+
      '#kr-vol{width:74px;height:20px;}'+
      '#kil-radio{gap:6px;padding:0 8px;}'+
    '}'+
    '@media(max-width:480px){.radio-mini #kilo-panel{bottom:156px!important;right:12px!important;}}'
    /* ══ UNIFIED LIVE RADIO (KODE 2026-09-09) ══════════════════════════════════════════
       Dark base, cyan as the system accent, green reserved for LIVE/playing, purple as
       ambience. Emphasis is spent deliberately: Play/Pause and the LIVE RADIO state glow,
       and nothing else does, so the two controls that matter are the two that stand out.
       No borders around every function - spacing and weight carry the hierarchy. */
    /* Desktop bar sits in the 72-84px band asked for: tall enough to read Now Playing and
       artwork, short enough to stay persistent. MOBILE IS UNTOUCHED - the mobile height
       rules live in the existing max-width blocks and are deliberately not changed here. */
    /* ══ DESKTOP ZONES (KODE 2026-09-10) ══════════════════════════════════════════════
       Three zones, held apart by SPACE rather than by borders: identity on the left,
       Now Playing taking the centre, audio pinned right. The bar previously divided its
       width evenly across seven flex children, which is what made it read as a row of
       separate widgets instead of one media strip. */
    /* ══ DESKTOP STRIP: 54px, everything vertically centred (KODE 2026-09-10) ══════════
       Was min-height:76px, which left large dead bands above and below 35px controls. The
       bar is content-height now with a 54px floor, so nothing is taller than it needs to be.
       Every child is flex:0 0 auto EXCEPT Now Playing, which is the only region allowed to
       take the slack - that is what makes it the visual centre and what makes long titles
       truncate instead of pushing mute and volume off the end. */
    +'@media(min-width:641px){'
    +  '#kil-radio{height:54px;min-height:54px;padding:0 20px;gap:18px;align-items:center;}'
    +  '#kil-radio>*{align-self:center;}'
    +  '.krb{height:auto!important;}'
    +  '#kr-live{flex:0 0 auto;padding:3px 9px;}'
    +  '.kr-stwrap{flex:0 0 auto;}'
    +  '.krb-now{flex:1 1 auto;min-width:0;justify-content:flex-start;gap:10px;}'
    +  '.kr-nowwrap{min-width:0;flex:1 1 auto;}'
    /* the four controls that must never be pushed off by a long title */
    +  '#kr-mute{margin-left:auto;flex:0 0 auto;}'
    +  '#kr-vol{flex:0 0 108px;}'
    +  '.kr-art{width:34px;height:34px;border-radius:8px;}'
    +  '.kr-nowlab{font-size:.42rem;line-height:1;}'
    +  '#kil-track{font-size:.78rem;font-weight:700;line-height:1.2;}'
    +  '.kr-nowsub{font-size:.5rem;line-height:1.2;}'
    +'}'
    +'#kr-live{display:flex;align-items:center;gap:6px;background:transparent;border:1px solid rgba(0,255,136,.28);border-radius:10px;padding:4px 8px;cursor:pointer;transition:background .18s,border-color .18s,box-shadow .18s;}'
    +'#kr-live:hover{background:rgba(0,255,136,.10);border-color:rgba(0,255,136,.55);}'
    +'#kr-live:focus-visible{outline:2px solid #36e2ff;outline-offset:2px;}'
    +'html[data-radio-ui="drawer"] #kr-live,html[data-radio-ui="expanded"] #kr-live{background:rgba(0,255,136,.16);border-color:#00ff88;box-shadow:0 0 14px rgba(0,255,136,.35);}'
    +'#kr-live .kil-brand-radio{line-height:.95;text-align:left;font-size:.5rem;}'
    +'.kr-gw-ic{color:#36e2ff;font-size:.6rem;line-height:1;}'
    /* station stepper: fixed width, so new stations never widen the bar */
    +'.kr-stwrap{display:flex;align-items:center;gap:2px;flex:0 0 auto;}'
    +'.krb-step{background:transparent;border:0;color:#36e2ff;cursor:pointer;padding:2px 4px;font-size:.95rem;line-height:1;}'
    +'.krb-step:hover{color:#fff;} .krb-step:focus-visible{outline:2px solid #36e2ff;outline-offset:1px;}'
    +'.kr-stname{min-width:62px;max-width:88px;text-align:center;font-size:.54rem;font-weight:900;letter-spacing:.1em;color:#cfe9ff;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
    /* now playing */
    +'.krb-now{display:flex;align-items:center;gap:7px;min-width:0;}'
    +'.kr-art{width:30px;height:30px;border-radius:6px;object-fit:cover;flex:0 0 auto;background:#15151f;}'
    +'.kr-nowwrap{display:flex;flex-direction:column;min-width:0;line-height:1.15;}'
    /* A long track title truncates. min-width:0 is the part that actually matters: without
       it a flex item refuses to shrink below its content and pushes mute/volume off-screen
       instead of ellipsing. */
    +'#kil-track,.kr-nowsub{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;max-width:100%;display:block;}'
    +'.kr-nowlab{font-size:.42rem;font-weight:900;letter-spacing:.18em;color:#7a8699;text-transform:uppercase;}'
    +'.kr-nowsub{color:#8d99ab;font-size:.52rem;}'
    +'.kr-wave{display:none;align-items:flex-end;gap:2px;height:12px;flex:0 0 auto;}'
    +'.kr-wave.on{display:flex;}'
    +'.kr-wave i{width:2px;background:#00ff88;border-radius:1px;animation:kr-eq .9s ease-in-out infinite;}'
    +'.kr-wave i:nth-child(1){height:5px;animation-delay:0s}.kr-wave i:nth-child(2){height:11px;animation-delay:.15s}.kr-wave i:nth-child(3){height:7px;animation-delay:.3s}'
    +'@keyframes kr-eq{0%,100%{transform:scaleY(.4)}50%{transform:scaleY(1)}}'
    /* play/pause is the dominant control */
    /* ── PANELS: exactly one visible, both driven by data-radio-ui ── */
    +'.kr-panel{position:fixed;left:0;right:0;z-index:9997;display:none;flex-direction:column;background:rgba(9,9,14,.97);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-top:1px solid rgba(54,226,255,.28);font-family:\'Space Grotesk\',\'Inter\',sans-serif;}'
    +'.kr-panel.on{display:flex;}'
    +'#kr-drawer{bottom:var(--kil-radio-h,54px);max-height:360px;border-radius:14px 14px 0 0;box-shadow:0 -18px 50px rgba(0,0,0,.7);}'
    +'.kr-hdr{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;background:linear-gradient(90deg,rgba(0,255,136,.12),rgba(124,77,255,.10));border:0;border-bottom:1px solid rgba(255,255,255,.08);padding:11px 14px;cursor:pointer;}'
    +'.kr-hdr:hover{background:linear-gradient(90deg,rgba(0,255,136,.2),rgba(124,77,255,.16));}'
    +'.kr-hdr:focus-visible{outline:2px solid #36e2ff;outline-offset:-2px;}'
    +'.kr-hdr-l,.kr-hdr-r{display:flex;align-items:center;gap:8px;}'
    +'.kr-hdr-t{font-size:.7rem;font-weight:900;letter-spacing:.2em;color:#00ff88;text-transform:uppercase;}'
    +'.kr-hdr-hint{font-size:.47rem;font-weight:800;letter-spacing:.16em;color:#7a8699;text-transform:uppercase;}'
    +'.kr-hdr-ic{color:#36e2ff;font-size:.7rem;}'
    +'html[data-radio-ui="expanded"] .kr-hdr-ic{transform:rotate(180deg);}'
    +'.kr-panel-body{overflow:auto;padding:12px 14px 16px;}'
    +'.kr-dnow-row{display:flex;gap:14px;align-items:center;}'
    +'.kr-dnow-art{width:88px;height:88px;border-radius:12px;object-fit:cover;background:#15151f;flex:0 0 auto;}'
    +'.kr-dnow-meta{display:flex;flex-direction:column;gap:5px;min-width:0;}'
    +'.kr-dnow-t{font-size:.95rem;font-weight:800;color:#fff;}'
    +'.kr-dnow-s{font-size:.62rem;font-weight:800;letter-spacing:.12em;color:#36e2ff;text-transform:uppercase;}'
    +'.kr-dnow-live{display:inline-flex;align-items:center;gap:6px;font-size:.5rem;font-weight:900;letter-spacing:.18em;color:#00ff88;text-transform:uppercase;}'
    +'.kr-dnow{margin-bottom:18px;}'
    +'.kr-sec h4{margin:0 0 8px;font-size:.5rem;font-weight:900;letter-spacing:.2em;color:#7a8699;text-transform:uppercase;}'
    +'.kr-stations{display:flex;flex-wrap:wrap;gap:8px;}'
    +'.kr-st{display:flex;align-items:center;gap:7px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.10);border-radius:10px;padding:6px 10px 6px 6px;color:#cfe9ff;font-size:.58rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;}'
    +'.kr-st img,.kr-st-noart{width:26px;height:26px;border-radius:6px;object-fit:cover;background:#15151f;display:block;}'
    +'.kr-st:hover{border-color:rgba(54,226,255,.5);}'
    +'.kr-st.on{border-color:#00ff88;color:#fff;box-shadow:0 0 12px rgba(0,255,136,.28);}'
    +'.kr-st:focus-visible{outline:2px solid #36e2ff;outline-offset:1px;}'
    +'.kr-empty{color:#7a8699;font-size:.6rem;margin:0;}'
    /* mobile: prioritise artwork, station, play, mute, gateway - not a squeezed desktop bar */
    +'@media(max-width:640px){'
    +  '#kr-live .kil-brand-radio{font-size:.44rem;}'
    +  '.kr-stname{min-width:48px;max-width:62px;font-size:.46rem;}'
    +  '.kr-nowsub{display:none;}'
    +  '#kr-drawer{max-height:58vh;}'
    +'}';
  document.head.appendChild(css);

  // ── Inject HTML (skip if already in DOM — e.g. inline on index.html) ─────
  if(!document.getElementById('kil-radio')){
    var bar=document.createElement('div');
    bar.id='kil-radio';
    /* ── BAR LAYOUT (Founder 2026-08-22) ────────────────────────────────────────────────
       << Prev Playlist · < Prev song · CURRENT · Next song > · Next Playlist >> · (mute)
       Every referral and affiliate link is gone: the rotating DistroKid / Posh / FreeCash /
       Illestrated ad that used to sit in the middle of the bar, and the "Play your song?"
       link beside it. The bar is now controls only. */
    bar.innerHTML=
      '<div id="kil-mini-dot">\u266c</div>'+
      /* SEVEN buttons, one flex line. IDs are unchanged from the shuttle layout so every
         handler below still binds; only the nesting and the widths changed. */
      /* ══ LIVE RADIO IS THE SINGLE GATEWAY (KODE 2026-09-09) ═══════════════════════════
         This was a static <div> badge reading "RADIO". It is now the one branded control
         for the whole radio experience: compact -> drawer -> expanded -> compact. There is
         deliberately no separate Options, Queue, Expand or Collapse button anywhere in the
         bar - the current UI state decides what this control does, which is why its
         aria-label is rewritten on every transition rather than left as one static string. */
      '<button type="button" class="krb krb-brand" id="kr-live" aria-expanded="false" aria-label="Open KEEPITIL Radio">'+
        '<div class="kil-live off" id="kil-led"></div>'+
        '<img src="/keepitil-x-logo.png" class="kil-brand-logo" alt="KEEPITIL"/>'+
        '<span class="kil-brand-radio">LIVE<br>RADIO</span>'+
        '<span class="kr-gw-ic" id="kr-gw-ic" aria-hidden="true">\u25b4</span>'+
      '</button>'+
      /* ── COMPACT STATION SELECTOR: ‹ NAME › ──────────────────────────────────────────
         Was two wide buttons carrying the names of the neighbouring playlists, which grew
         the bar with every station added. It is now a fixed-width stepper showing the
         CURRENT station, so adding stations never widens the bar. The full list lives in
         the drawer. */
      '<span class="kr-stwrap">'+
        '<button class="krb krb-step" id="kr-prevpl" title="Previous station" aria-label="Previous station"><span class="krb-g">\u2039</span></button>'+
        '<span class="kr-stname" id="kr-stname"></span>'+
        '<button class="krb krb-step" id="kr-nextpl" title="Next station" aria-label="Next station"><span class="krb-g">\u203a</span></button>'+
      '</span>'+
      /* NO PREV/NEXT SONG (KODE 2026-09-10). The permanent bar carries exactly five things:
         LIVE RADIO, station selector, now playing, mute, volume. Track transport belongs to
         a player, not to a 24/7 broadcast strip - and these two were the main source of the
         "chopped up" look: .krb gives every child flex:1, so each arrow button was claiming
         222px of a 1440px bar, as wide as the Now Playing region itself. Station stepping
         (kr-prevpl / kr-nextpl) stays; that is the station selector, not track transport. */
      '<div class="krb krb-now">'+
        '<img class="kr-art" id="kr-art" alt="" aria-hidden="true"/>'+
        '<span class="kr-nowwrap">'+
          '<span class="kr-nowlab">NOW PLAYING</span>'+
          '<span class="kr-now" id="kil-track">Loading\u2026</span>'+
          '<span class="kr-now kr-nowsub" id="kr-nowpl"></span>'+
        '</span>'+
        /* Three bars that animate only while audio is actually playing. Not a real FFT - it
           is an activity indicator, and it is driven by the play state so it never suggests
           sound that is not happening. */
        '<span class="kr-wave" id="kr-wave" aria-hidden="true"><i></i><i></i><i></i></span>'+
      '</div>'+
      /* NO PLAY/PAUSE (KODE 2026-09-09). KEEPITIL Radio is a 24/7 broadcast, not a
         track-by-track player, so the bar does not carry transport UI. Initialisation is
         covered below: the stream mounts on the visitor's first gesture anywhere on the
         page, which is also the earliest moment a browser permits sound. */


      '<button class="krb" id="kr-mute" title="Mute / Unmute" aria-label="Mute">\ud83d\udd0a</button>'+
      /* The volume slider the script has referenced since it was written. It was never in
         the markup, so volEl was always null: getVol() could only ever return DEFAULT_VOL
         and the visitor had no way to set a level. Hidden until MUTE is pressed, per the
         brief - muting is the moment someone wants to choose a level rather than lose one. */
      /* Always visible (KODE 2026-09-09). It used to be hidden until MUTE was pressed, which
         made volume feel absent; it is a primary control of a live radio. */
      '<input class="krb kr-vol" id="kr-vol" type="range" min="0" max="100" step="1" '+
        'aria-label="Radio volume" title="Volume"/>'+
      /* No favourite control (KODE 2026-09-10, owner). The desktop bar is LIVE RADIO,
         station, now playing, mute, volume - nothing else. Its storage key
         kil_radio_fav_stations is intentionally left unread rather than migrated: it holds
         only station names a visitor picked, and deleting it would be a silent data change. */
      '';   /* no minimise / expand / collapse buttons — LIVE RADIO owns those states */
    document.body.appendChild(bar);
    /* The rotating referral ad that lived here was removed 2026-08-22 (Founder).
       No affiliate or referral link ships in the radio bar. */

    /* ── IFRAME DEFERRED TO FIRST GESTURE (Founder 2026-08-19) ──────────────────────────────
       This used to be appended on every page load. A SoundCloud player with auto_play=true
       and continuous_play=true is a permanently streaming third-party frame: the document
       never reaches idle, and the tab holds an open connection plus an audio decode for as
       long as it is open. Measured symptom — every /create page failed to finish loading,
       and on a device with less headroom it presented as the page hanging or crashing.
       Nothing about the radio's behaviour changes; it is created the moment the visitor
       makes any gesture, which is also the earliest point a browser would allow it to make
       sound. Before that, a page that nobody has touched costs nothing. */
    window.__kilMountRadio = function(){
      if(document.getElementById('kil-sc')) return;
      var sc=document.createElement('iframe');
      sc.id='kil-sc';
      sc.setAttribute('allow','autoplay');
      sc.setAttribute('scrolling','no');
      sc.setAttribute('frameborder','no');
      sc.src=window.__kilPlayerSrc();
      document.body.appendChild(sc);
      if(window.__kilRadioAttach) window.__kilRadioAttach(sc);
    };
  }

  /* ── PLAYLISTS (Founder 2026-08-22: "all feeds from soundcloud only. keepitil soundcloud
     account music playlist") ───────────────────────────────────────────────────────────────
     Read from platform_config.radio_playlists so adding or reordering a station is a row edit,
     not a code push. The seed below is only a fallback for the first paint and for the case
     where config cannot be reached — the bar must never come up silent. */
  var KIL_PL = [{name:'KEEPITIL', url:'https://soundcloud.com/illestrated-lifestyle'}];
  var KIL_PL_I = 0;
  try{ var _sv=sessionStorage.getItem('kil_pl_i'); if(_sv!=null) KIL_PL_I=Math.max(0,parseInt(_sv,10)||0); }catch(e){}

  window.__kilPlayerSrc = function(){
    var p = KIL_PL[KIL_PL_I] || KIL_PL[0];
    /* Prefer the api.soundcloud.com playlist-id form — it is what SoundCloud's own embed emits
       (see twitter:player on any set page) and it always resolves. A /sets/ permalink is only
       sometimes accepted by the widget, and when it is not the frame loads and simply never
       plays: no error, no sound. That was the silent radio. */
    return 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(p.api || p.url)
      + '&color=%2300ff88&auto_play=true&buying=false&liking=false&download=false&sharing=false'
      + '&show_artwork=false&show_comments=false&show_playcount=false&show_user=false'
      + '&hide_related=true&continuous_play=true&single_active=false';
  };

  /* ── MOBILE: PLAYBACK EVERYWHERE ELIGIBLE, VISIBLE BAR ONLY ON EARN (Founder §5) ─────────
     DISCOVER / CONNECT / CREATE may play but must not show a persistent bar; EARN shows one;
     CULTURE has neither (handled by the KIL_NO_RADIO gate at the top of this file).

     The docked bar is therefore hidden on EVERY mobile page. That is not a shortcut — EARN's
     visible control on mobile is its own in-section bar (#krBar), and earn/index.html already
     hides the docked bar there for exactly that reason. So "hide the docked bar on mobile"
     produces precisely the required matrix without a per-page allowlist that would have to be
     maintained every time a page is added.

     HIDING THE BAR MUST NOT STOP THE AUDIO. The player is #kil-sc, a separate element; the bar
     is only its display. Hiding one does not touch the other — which is the whole reason
     playback can continue on a page with no bar.
     body padding-bottom is released too, or every mobile page would reserve 40px for a bar that
     is not there. */
  (function(){
    function isMobileRadio(){
      try{ return window.matchMedia('(max-width:860px)').matches; }catch(e){ return false; }
    }
    function applyBarVisibility(){
      var bar = document.getElementById('kil-radio');
      if(!bar) return;
      var mob = isMobileRadio();
      bar.style.display = mob ? 'none' : '';
      document.body.style.paddingBottom = mob ? '' : '';
      /* The 40px reservation comes from the injected `body{padding-bottom:40px}` rule. On
         mobile that rule is neutralised by an inline override rather than by editing the
         stylesheet, so desktop is untouched. */
      if(mob) document.body.style.setProperty('padding-bottom','0px','important');
      else    document.body.style.removeProperty('padding-bottom');
    }
    window.__kilApplyRadioBarVisibility = applyBarVisibility;
    if(document.readyState !== 'loading') setTimeout(applyBarVisibility, 0);
    else document.addEventListener('DOMContentLoaded', applyBarVisibility);
    window.addEventListener('resize', applyBarVisibility);
  })();

  // ── Radio init ────────────────────────────────────────────────────────────
  var radio=document.getElementById('kil-radio');
  var frame=document.getElementById('kil-sc');
  var led=document.getElementById('kil-led');
  var trackEl=document.getElementById('kil-track');
  var muteBtn=document.getElementById('kr-mute');
  var volEl=document.getElementById('kr-vol');
  /* toggleBtn removed with the collapse feature 2026-08-22. */
  var widget=null,playing=false,muted=false,savedVol=5,interacted=false,widgetReady=false,miniState=false,wakeLock=null;
  var _pendingMute=null;   /* a mute choice made before the widget was ready; see the mute handler */
  var isMobile=('ontouchstart'in window)||(navigator.maxTouchPoints>0);
  /* ── ONE SOURCE OF TRUTH FOR RADIO STATE (Founder 2026-09-07) ──────────────────────
     DEFAULT_VOL was 3. Not 30 - three percent - and because #kr-vol never existed in the
     markup, getVol() fell back to it on every call, so the radio played at 3% forever and
     no page could change it. That is the "volume fluctuates / barely audible" report.
     50 is the canonical default, and it is a DEFAULT, not an override: once the visitor
     moves the slider their level is what persists.
     State lives in sessionStorage under one key so a full page load - which is what
     navigating this site is - can rebuild the same session instead of starting a new one. */
  var DEFAULT_VOL=50;
  var KRS='kil_radio_state';
  function krsRead(){ try{ return JSON.parse(sessionStorage.getItem(KRS)||'null')||{}; }catch(e){ return {}; } }
  function krsWrite(patch){
    try{
      var st=krsRead(); for(var k in patch) if(patch.hasOwnProperty(k)) st[k]=patch[k];
      st.ts=Date.now(); sessionStorage.setItem(KRS, JSON.stringify(st));
    }catch(e){}
  }
  /* Seed from the session's own stored level, falling back to the default. This is what
     makes 50 a default rather than an override: a visitor who chose 35 keeps 35 on the next
     page instead of being reset every navigation. */
  (function(){
    var st=krsRead();
    var v=(typeof st.volume==='number') ? Math.round(st.volume*100) : DEFAULT_VOL;
    savedVol=Math.max(0,Math.min(100, v||DEFAULT_VOL));
    if(st.muted){ muted=true; }
    if(volEl){volEl.value=muted?0:savedVol;}
    /* The icon has to agree with the restored state, or the bar arrives on the next page
       saying "unmuted" over a session that is muted. */
    if(muted && muteBtn) muteBtn.textContent='\ud83d\udd07';
  })();
  var SYNC_EPOCH=1735689600000; // 2026-01-01 00:00 UTC — fallback only
  var currentTrackIdx=0,currentPosition=0; // kept fresh for beforeunload handoff

  // ── Supabase radio sync ───────────────────────────────────────────────────
  var SUPA_URL='https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
  var SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
  var commercialAudio=null,inCommercial=false;

  // ── Save playback state before navigating away ────────────────────────────
  window.addEventListener('beforeunload',function(){
    if(!widgetReady)return;
    try{
      /* vol is the STORED level, never 0. Writing 0 while muted is what lost the visitor's
         volume across a navigation: the next page restored 0, treated it as falsy, and fell
         back to the default - so unmuting after a page change gave the wrong level. */
      sessionStorage.setItem('kil_hand',JSON.stringify({idx:currentTrackIdx,pos:currentPosition,ts:Date.now(),vol:savedVol,muted:muted}));
      krsWrite({trackIdx:currentTrackIdx,currentTime:currentPosition,volume:savedVol/100,muted:muted,playing:playing});
    }catch(e){}
  });

  function getVol(){return muted?0:Math.max(0,Math.min(100,parseInt(volEl?volEl.value:DEFAULT_VOL)||DEFAULT_VOL));}

  // ── Mini / expand toggle ──────────────────────────────────────────────────
  /* COLLAPSE REMOVED (Founder 2026-08-22: "do not allow the radio bar to collapse. remove that
     feature button"). setMini is kept as a no-op because other code — the pager, the shell, the
     mini dot — still calls it; deleting the function would throw instead of doing nothing.
     The stored preference is actively cleared, or anyone who collapsed the bar before today
     would load into a collapsed bar forever with no control left to expand it. */
  function setMini(){
    miniState=false;
    if(radio) radio.classList.remove('kil-mini');
    document.body.classList.remove('radio-mini');
  }
  try{ localStorage.removeItem('kil_radio_mini'); }catch(e){}
  setMini();
  if(radio){
    radio.style.cursor='pointer';
    radio.addEventListener('click',function(e){
      /* clicking the bar opens the Radio page — except the mute button, volume, minimize, or the advertisement */
      if(e.target&&e.target.closest&&e.target.closest('.krb')){return;}
      if(location.pathname.indexOf('/earn/')===0)return; /* already on the radio surface */
      location.href='/earn/';
    });
  }

  /* ── SHUTTLE CONTROLS ──────────────────────────────────────────────────────────────────
     Song arrows drive the SoundCloud widget. Playlist arrows swap the iframe src, because a
     widget is bound to one playlist for its lifetime — there is no API to repoint it. */
  function kilPlName(offset){
    if(!KIL_PL.length) return '';
    var p = KIL_PL[(KIL_PL_I + offset + KIL_PL.length) % KIL_PL.length];
    return (p && p.name) ? p.name : '';
  }
  /* The two outer labels name the playlists the << and >> arrows lead to. They do not depend on
     the player, so they are painted as soon as config lands — not only once audio starts. */
  function kilPaintPlaylistNames(){
    var solo = KIL_PL.length < 2;   /* one station: nothing to move between, so no labels */
    var a=document.getElementById('kr-prevpl-t'), b=document.getElementById('kr-nextpl-t');
    if(a) a.textContent = solo ? '' : kilPlName(-1);
    if(b) b.textContent = solo ? '' : kilPlName(1);
  }
  /* The compact bar's station label, artwork and favourite state all follow the same
     config load that renames the stepper, so they can never disagree with KIL_PL_I. */
  var _origPaintNames = kilPaintPlaylistNames;
  kilPaintPlaylistNames = function(){ try{ _origPaintNames(); }catch(e){}
    try{ paintStationCompact(); }catch(e){}
    try{ if(RADIO_UI!=='compact') paintStations(); }catch(e){} };
  window.__kilPaintPlaylistNames = kilPaintPlaylistNames;

  /* ── STATE BROADCAST (EARN radio row + playlist carousel, Founder 2026-08-25) ───────────
     The EARN page needs the SAME state this bar already computes — playlist name, current
     song, next song — and must not start a second player to get it. A widget is bound to one
     playlist for its lifetime and there is only ever one #kil-sc frame, so anything that wants
     to display radio state listens instead of polling or re-fetching.
     Fired on every title repaint and on every playlist change, so a listener that mounts late
     can also just ask for a repaint. */
  function kilBroadcast(cur, nxt){
    try{
      document.dispatchEvent(new CustomEvent('kil-radio-state', {detail:{
        index: KIL_PL_I,
        count: KIL_PL.length,
        playlist: kilPlName(0),
        current: cur || '',
        next: nxt || ''
      }}));
    }catch(e){}
  }
  window.__kilRadioState = kilBroadcast;

  /* Absolute playlist selection. The arrows are relative (dir -1/+1) because that is all a
     two-arrow bar needs; tapping a specific tile in the EARN carousel is not expressible that
     way without the caller doing modulo arithmetic against internal state it cannot see. */
  window.__kilRadioSelect = function(i){
    if(!KIL_PL.length) return;
    i = (((i|0) % KIL_PL.length) + KIL_PL.length) % KIL_PL.length;
    if(i === KIL_PL_I){
      /* Already on this station: restart it at track 1 rather than doing nothing, which is
         what a tap on the artwork means. */
      if(widget && widgetReady){ widget.skip(0); widget.play(); }
      kilBroadcast();
      return;
    }
    kilLoadPlaylist(i - KIL_PL_I);
  };
  window.__kilRadioPlaylists = function(){
    return { list: KIL_PL.slice(), index: KIL_PL_I };
  };

  /* Song transport, exposed for surfaces that draw their own controls (the EARN radio row).
     Those pages hide the shell bar, so proxying a .click() at its buttons would depend on a
     hidden element still existing — this is the same two lines the bar's own arrows run. */
  window.__kilRadioSong = function(dir){
    if(!widget || !widgetReady) return false;
    try{
      if(dir < 0) widget.prev(); else widget.next();
      widget.play();
      /* The widget reports the new track asynchronously; repaint once it has. */
      setTimeout(function(){ try{ kilPaintTitles(); }catch(e){} }, 400);
      return true;
    }catch(e){ return false; }
  };

  function kilPaintTitles(){
    if(!widget || !widgetReady) return;
    widget.getSounds(function(list){
      if(!list || !list.length) return;
      widget.getCurrentSoundIndex(function(i){
        /* kr-prevt / kr-nextt were the neighbouring-track labels inside the removed
           prev/next buttons. Only the current track is painted now. */
        var nowEl =document.getElementById('kil-track');
        var here = kilPlName(0);
        /* The neighbouring-track lookups went with the prev/next buttons they fed. */
        /* Current reads "PLAYLIST: SONG" — e.g. "EDM: VHS TAPES". */
        var cur = list[i];
        var t = (cur && cur.title) ? cur.title : '';
        /* Button 4 alternates, so the two values must stay apart — a combined
           "PLAYLIST: SONG" string would show the playlist in both halves of the cycle. */
        var plEl = document.getElementById('kr-nowpl');
        if(nowEl) nowEl.textContent = t || here;
        if(plEl)  plEl.textContent  = here || t;
        /* Same values the bar just painted — no second source of truth. */
        kilBroadcast(t, (n && n.title) ? n.title : '');
      });
    });
    kilPaintPlaylistNames();
  }
  window.__kilPaintTitles = kilPaintTitles;

  function kilLoadPlaylist(dir){
    /* dir 0 = reload the CURRENT entry in place (used when a default playlist is applied). */
    if(dir === 0){ KIL_PL_I = KIL_PL_I; }
    else if(KIL_PL.length < 2){
      if(widget && widgetReady){ widget.skip(0); widget.play(); }
      return;
    }
    KIL_PL_I = (KIL_PL_I + dir + KIL_PL.length) % KIL_PL.length;
    try{ sessionStorage.setItem('kil_pl_i', String(KIL_PL_I)); }catch(e){}
    var old = document.getElementById('kil-sc');
    if(old) old.remove();
    widget=null; widgetReady=false;
    var sc=document.createElement('iframe');
    sc.id='kil-sc'; sc.setAttribute('allow','autoplay');
    sc.setAttribute('scrolling','no'); sc.setAttribute('frameborder','no');
    sc.src=window.__kilPlayerSrc();
    document.body.appendChild(sc);
    if(trackEl) trackEl.textContent = (KIL_PL[KIL_PL_I].name || 'Loading') + '\u2026';
    kilPaintPlaylistNames();
    kilBroadcast();
    if(window.__kilRadioAttach) window.__kilRadioAttach(sc);
  }

  (function(){
    function on(id, fn){ var b=document.getElementById(id); if(b) b.addEventListener('click',function(e){ e.stopPropagation(); fn(); }); }
    /* kr-prev / kr-next handlers removed with their buttons 2026-09-10. on() would have
       no-opped on the missing ids, but a listener for a control that cannot exist is the
       kind of dead code that makes the next reader think the feature is still there. */
    on('kr-prevpl',function(){ kilLoadPlaylist(-1); });
    on('kr-nextpl',function(){ kilLoadPlaylist(1); });
  })();

  /* Config load. Failure is silent by design — the seed playlist keeps playing. */
  fetch(SUPA_URL+'/rest/v1/platform_config?select=value&key=eq.radio_playlists',
        {headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY}})
    .then(function(r){ return r.ok?r.json():null; })
    .then(function(rows){
      var v = rows && rows[0] && rows[0].value;
      /* platform_config.value is a TEXT column holding JSON, so it arrives as a string, not an
         object. Parsing only when it is a string keeps this working if the column is ever
         migrated to jsonb. */
      if(typeof v === 'string'){ try{ v = JSON.parse(v); }catch(e){ v = null; } }
      var list = v && v.playlists;
      if(list && list.length){
        KIL_PL = list.filter(function(p){ return p && p.url; });
        if(KIL_PL_I >= KIL_PL.length) KIL_PL_I = 0;
      }
      /* More than one station? Show the playlist arrows. One station and they are dead weight. */
      if(KIL_PL.length < 2){
        ['kr-prevpl','kr-nextpl'].forEach(function(id){ var b=document.getElementById(id); if(b) b.style.display='none'; });
      }
      kilPaintPlaylistNames();
      /* Config lands AFTER first paint, so anything listening for radio state (the EARN rows
         and carousel) has until now been looking at the one-entry seed playlist and showing
         its placeholder name. Re-broadcast so those surfaces correct themselves the moment the
         real station list exists, instead of waiting for the SoundCloud widget to report a
         track — which never happens at all if the visitor has not yet interacted. */
      kilBroadcast();
      kilLoadMine();
    })
    .catch(function(){});

  /* ── A SIGNED-IN LISTENER'S OWN PLAYLISTS (Founder 2026-08-22) ──────────────────────────
     Appended AFTER the station playlists, never mixed into them: the KEEPITIL rotation is the
     same for everyone, and these are audible only to the person who saved them. RLS does the
     enforcing — the request carries the user's own token, so it can only ever return their rows.
     Signed out, this is a no-op and the bar behaves exactly as before. */
  function kilLoadMine(){
    var tok = null;
    try{
      /* supabase-js stores its session under a project-scoped key. Reading it here avoids
         pulling the whole SDK into the radio bar for one authenticated GET. */
      for(var i=0;i<localStorage.length;i++){
        var k = localStorage.key(i);
        if(k && k.indexOf('-auth-token') > -1){
          var j = JSON.parse(localStorage.getItem(k) || 'null');
          if(j && j.access_token){ tok = j.access_token; break; }
        }
      }
    }catch(e){}
    if(!tok) return;                       /* signed out — stations only */

    fetch(SUPA_URL + '/rest/v1/user_playlists?select=name,url,api_url,art,is_default&order=created_at.asc',
          { headers:{ apikey:SUPA_KEY, Authorization:'Bearer ' + tok } })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(rows){
        if(!rows || !rows.length) return;
        var mine = rows.map(function(p){
          return { name:p.name, url:p.url, api:p.api_url, art:p.art, mine:true, def:p.is_default };
        });
        KIL_PL = KIL_PL.concat(mine);
        /* A playlist marked default starts the session on it. */
        var d = KIL_PL.findIndex ? KIL_PL.findIndex(function(p){ return p.def; }) : -1;
        if(d > -1 && d !== KIL_PL_I){
          KIL_PL_I = d;
          try{ sessionStorage.setItem('kil_pl_i', String(d)); }catch(e){}
          if(document.getElementById('kil-sc')) kilLoadPlaylist(0);
        }
        ['kr-prevpl','kr-nextpl'].forEach(function(id){ var b=document.getElementById(id); if(b) b.style.display=''; });
        kilPaintPlaylistNames();
      })
      .catch(function(){});
  }

  // ── LED state ─────────────────────────────────────────────────────────────
  function goLive(){if(led)led.classList.remove('off');playing=true;}
  function goOff(){if(led)led.classList.add('off');playing=false;}

  function unmute(){interacted=true;if(!widget||!widgetReady)return;if(muted)return;widget.setVolume(getVol());if(!playing)widget.play();}
  function reListenGesture(){['mousemove','scroll','touchstart','keydown'].forEach(function(ev){document.addEventListener(ev,unmute,{passive:true,once:true});});}
  reListenGesture();

  // ── Wake lock (keeps radio alive on mobile) ───────────────────────────────
  function requestWakeLock(){if(!('wakeLock'in navigator))return;navigator.wakeLock.request('screen').then(function(l){wakeLock=l;l.addEventListener('release',function(){wakeLock=null;});}).catch(function(){});}
  requestWakeLock();

  /* ── RADIO STOPS WHEN KEEPITIL LEAVES THE FOREGROUND (Founder 2026-09-04) ──────────────
     This block used to be a "24/7 keepalive": a 30s interval that called play() whenever the
     widget reported paused, plus an auto-resume on every return to visible. Between them the
     radio was un-pausable from outside — backgrounding the app paused it and the interval
     started it again seconds later, which is why audio kept going after the visitor left.

     The policy is now: hidden means stop, and coming back does NOT resume. The station and
     track are left exactly as they were, so resuming is one deliberate tap and lands where the
     visitor was — but it takes that tap.

     ⚠ pagehide, not unload: iOS Safari does not reliably fire unload, and on a bfcache restore
     unload never runs at all. The keepalive is also gated on !document.hidden so a backgrounded
     tab can never be restarted by the watchdog. */
  function kilRadioSuspend(){
    try{ if(widget && widgetReady) widget.pause(); }catch(e){}
    goOff();
    try{ if(wakeLock && wakeLock.release){ wakeLock.release(); wakeLock=null; } }catch(e){}
  }
  document.addEventListener('visibilitychange',function(){
    if(document.hidden){ kilRadioSuspend(); return; }
    /* Visible again: take the wake lock back for the screen, but do NOT call play(). Whether
       music resumes is the visitor's decision, not the page's. */
    requestWakeLock();
  });
  window.addEventListener('pagehide', kilRadioSuspend);
  /* Watchdog for a widget that drops out WHILE the visitor is watching. Never in the
     background — that is what made the radio unstoppable. */
  setInterval(function(){
    if(document.hidden) return;
    if(!widget||!widgetReady||!interacted||muted)return;
    if(!playing) return;   /* only nurse a session the visitor actually started */
    widget.isPaused(function(p){if(p){widget.setVolume(getVol());widget.play();}});
  },30000);
  // ── 10-second Supabase radio state poll ──────────────────────────────────
  setInterval(function(){if(widgetReady)fetchRadioState(applyRadioState);},10000);

  // ── Supabase radio sync functions ────────────────────────────────────────
  function fetchRadioState(cb){
    fetch(SUPA_URL+'/rest/v1/radio_state?id=eq.1&select=*',{
      headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY}
    }).then(function(r){return r.json();})
    .then(function(d){if(d&&d[0])cb(d[0]);else epochSync();})
    .catch(function(){epochSync();});
  }

  function applyRadioState(state){
    if(!state||!widgetReady)return;
    var now=Date.now();
    // Commercial check
    if(state.commercial_url&&state.commercial_ends_at){
      var ends=new Date(state.commercial_ends_at).getTime();
      if(now<ends){startCommercial(state.commercial_url,ends-now);return;}
    }
    if(inCommercial)stopCommercial();
    // Only sync tracks for RECENT DJ overrides (< 2 min) — epoch handles normal looping
    var age=now-new Date(state.track_started_at).getTime();
    if(age>120000)return;
    var position=age;if(position<0)position=0;
    widget.getCurrentSoundIndex(function(i){
      if(i!==state.track_index){
        widget.skip(state.track_index);
        setTimeout(function(){widget.seekTo(position);setTimeout(function(){if(interacted){widget.setVolume(muted?0:getVol());widget.play();}},150);},400);
      } else {
        widget.getPosition(function(pos){
          if(Math.abs(pos-position)>5000){widget.seekTo(position);}
          if(interacted&&!muted){widget.setVolume(getVol());widget.isPaused(function(p){if(p)widget.play();});}
        });
      }
    });
    currentTrackIdx=state.track_index;
  }

  function startCommercial(url,durationMs){
    if(inCommercial&&commercialAudio&&commercialAudio.src===url)return;
    inCommercial=true;
    widget.setVolume(0);
    if(commercialAudio){commercialAudio.pause();commercialAudio=null;}
    commercialAudio=new Audio(url);
    commercialAudio.volume=muted?0:Math.min(1,savedVol/100);
    if(trackEl)trackEl.textContent='🎙️ KEEPITIL RADIO — LIVE BREAK';
    if(led)led.classList.remove('off');
    commercialAudio.play().catch(function(){});
    setTimeout(function(){stopCommercial();fetchRadioState(applyRadioState);},durationMs+500);
  }

  function stopCommercial(){
    inCommercial=false;
    if(commercialAudio){commercialAudio.pause();commercialAudio=null;}
    if(!muted&&widgetReady&&widget)widget.setVolume(getVol());
  }

  function epochSync(){
    widget.getSounds(function(sounds){
      if(!sounds||!sounds.length){widget.play();return;}
      var durations=[],totalMs=0;
      for(var i=0;i<sounds.length;i++){var d=sounds[i].duration||240000;durations.push(d);totalMs+=d;}
      var offset=(Date.now()-SYNC_EPOCH)%totalMs;
      var cumulative=0,trackIndex=0,trackOffset=0;
      for(var j=0;j<durations.length;j++){
        if(offset<cumulative+durations[j]){trackIndex=j;trackOffset=offset-cumulative;break;}
        cumulative+=durations[j];
      }
      widget.skip(trackIndex);widget.setVolume(0);
      setTimeout(function(){widget.seekTo(trackOffset);setTimeout(function(){widget.play();if(interacted)widget.setVolume(getVol());},200);},400);
    });
  }

  function syncAndPlay(){
    // 1. sessionStorage handoff (PJAX fallback for full-reload navigation)
    try{
      var h=JSON.parse(sessionStorage.getItem('kil_hand')||'null');
      /* ⚠ THE WINDOW WAS 8 SECONDS. Pages on this site routinely take 12-15s to reach this
         point, so the handoff was usually judged stale and thrown away - and the code then
         fell through to epochSync(), which picks a track from the clock. That is the
         "different song after changing pages" report: not a player bug, an expiry that was
         shorter than the navigation it existed to cover. 60s covers a slow load without
         resuming a session the visitor has plainly left. */
      if(h&&(Date.now()-h.ts)<60000){
        sessionStorage.removeItem('kil_hand');
        var elapsed=Date.now()-h.ts;
        var resumePos=Math.round(h.pos+elapsed);
        /* Volume is restored in BOTH branches. Previously the muted branch skipped it, so a
           visitor who muted, navigated, then unmuted got the default instead of their level. */
        savedVol=(h.vol>0?h.vol:DEFAULT_VOL);
        if(volEl)volEl.value=savedVol;
        if(h.muted){muted=true;if(muteBtn)muteBtn.textContent='🔇';if(volEl)volEl.hidden=false;}
        interacted=true;
        widget.skip(h.idx);widget.setVolume(0);
        setTimeout(function(){widget.seekTo(resumePos);setTimeout(function(){widget.play();if(!muted)widget.setVolume(getVol());},150);},200);
        return;
      }
    }catch(e){}
    /* 1b. THE SESSION OUTLIVES THE HANDOFF. CULTURE suppresses the radio entirely - that is
       the existing audio-ownership rule and it stays - so a visitor who spends a while there
       returns with the short-lived handoff long gone. Rather than fall through to epochSync
       and land on an unrelated track, rebuild from the persistent session state: same track,
       same level, position advanced by the time actually spent away. */
    try{
      var st=krsRead();
      if(st && typeof st.trackIdx==='number' && st.ts && (Date.now()-st.ts)<45*60*1000){
        savedVol=Math.max(0,Math.min(100, Math.round((st.volume!=null?st.volume:DEFAULT_VOL/100)*100)))||DEFAULT_VOL;
        muted=!!st.muted;
        if(volEl){volEl.value=muted?0:savedVol;}
        if(muted && muteBtn) muteBtn.textContent='🔇';
        var away=Date.now()-st.ts;
        var pos=Math.round((st.currentTime||0)+away);
        interacted=true;
        widget.skip(st.trackIdx); widget.setVolume(0);
        setTimeout(function(){
          widget.seekTo(pos);
          setTimeout(function(){ widget.play(); if(!muted) widget.setVolume(getVol()); },150);
        },200);
        return;
      }
    }catch(e){}
    // 2. Check Supabase for active commercial or recent DJ override — else epoch sync
    fetchRadioState(function(state){
      if(!state){epochSync();return;}
      var now=Date.now();
      // Active commercial?
      if(state.commercial_url&&state.commercial_ends_at&&new Date(state.commercial_ends_at).getTime()>now){
        startCommercial(state.commercial_url,new Date(state.commercial_ends_at).getTime()-now);
        return;
      }
      // Recent DJ override (within 2 minutes)? → follow it
      if((now-new Date(state.track_started_at).getTime())<120000){
        applyRadioState(state);
        return;
      }
      // Default: epoch sync keeps everyone on same track position 24/7
      epochSync();
    });
  }

  function initWidget(){
    if(!window.SC)return;
    widget=SC.Widget(frame);
    widget.bind(SC.Widget.Events.READY,function(){
      widgetReady=true;widget.setVolume(0);
      /* Honour a mute pressed before the widget existed. Volume only - syncAndPlay() decides
         playback, so a muted visitor is not forced into audio they did not ask for. */
      if(_pendingMute!==null){ muted=_pendingMute; _pendingMute=null; }
      syncAndPlay();
      try{ if(muted){ widget.setVolume(0); if(muteBtn){muteBtn.textContent='🔇';muteBtn.setAttribute('aria-pressed','true');} } }catch(e){}
    });
    widget.bind(SC.Widget.Events.PLAY,function(){playing=true;try{paintPlay();}catch(e){}goLive();reListenGesture();widget.getCurrentSoundIndex(function(i){currentTrackIdx=i;});kilPaintTitles();});
    widget.bind(SC.Widget.Events.PLAY_PROGRESS,function(e){
      if(e&&e.currentPosition)currentPosition=e.currentPosition;
      if(interacted&&widget)widget.setVolume(getVol());
      /* beforeunload does not fire reliably (Safari, bfcache, a killed tab), so the position
         is written as it advances - throttled, because this event is very chatty. */
      var now=Date.now();
      if(!krsWrite._t || now-krsWrite._t>2000){
        krsWrite._t=now;
        krsWrite({trackIdx:currentTrackIdx,currentTime:currentPosition,volume:savedVol/100,muted:muted,playing:true});
      }
    });
    widget.bind(SC.Widget.Events.PAUSE,function(){playing=false;try{paintPlay();}catch(e){}goOff();});
    /* ── PLAY A PLAYLIST THROUGH, THEN ROLL TO THE NEXT ONE (Founder 2026-08-22) ──────────
       Was `skip((i+1) % length)` — the modulo wrapped back to track 0 of the SAME playlist and
       looped it forever, so the other stations never got reached. On the LAST track it now
       advances to the next playlist instead of wrapping, and after the last playlist it comes
       back round to the first. One continuous programme across every station. */
    widget.bind(SC.Widget.Events.FINISH,function(){
      widget.getSounds(function(s){
        if(!s||!s.length) return;
        widget.getCurrentSoundIndex(function(i){
          if(i >= s.length-1){ kilLoadPlaylist(1); }   /* end of this playlist -> next station */
          else { widget.skip(i+1); widget.play(); }
        });
      });
    });
    widget.bind(SC.Widget.Events.ERROR,function(){setTimeout(function(){widget.next();widget.play();},1000);});
  }
  /* The SoundCloud API script is deferred alongside the iframe — loading it eagerly would
     re-introduce a third-party request on every page load for a player that may never exist.
     __kilRadioAttach is called by __kilMountRadio once the iframe is in the DOM; it rebinds
     `frame` (captured as null at init, because the iframe no longer exists at that point)
     and only then fetches the API. */
  window.__kilRadioAttach = function(el){
    frame = el || document.getElementById('kil-sc');
    if(!frame) return;
    if(window.SC){ initWidget(); return; }
    if(document.getElementById('kil-sc-api')) return;
    var scApi=document.createElement('script');
    scApi.id='kil-sc-api';
    scApi.src='https://w.soundcloud.com/player/api.js';
    scApi.onload=initWidget;
    document.head.appendChild(scApi);
  };
  /* Any gesture mounts it. `once` so the listeners remove themselves; capture+passive so a
     stopPropagation() anywhere in the page cannot swallow the trigger. */
  (function(){
    /* Two shapes to cover: pages where this script injects the bar (__kilMountRadio exists),
       and the handful that inline the bar AND the iframe in their own HTML — there the
       injection block is skipped, so __kilMountRadio is undefined and we attach directly to
       the iframe that is already sitting in the DOM. Without this branch the API script would
       never load on those pages and the radio would be silent. */
    function boot(){
      if(window.__kilMountRadio) window.__kilMountRadio();
      else if(window.__kilRadioAttach) window.__kilRadioAttach(null);
    }
    /* ⚠ AUTOPLAY (Founder 2026-08-27: "RADIO IS NOT AUTO PLAYING").
       This used to mount ONLY on a gesture, so a visitor who never clicked got silence and
       an empty bar for the whole visit — measured: window.SC undefined, no #kil-sc iframe,
       button 4 stuck on "Loading…" until the first click, then everything worked at once.
       The gesture rule was never about autoplay policy; it was to stop a third-party iframe
       competing with page load, which is what hung /create. That intent is kept exactly by
       mounting AFTER the page has finished loading and the main thread is idle — nothing is
       pulled forward into the load, and the radio no longer waits to be asked.
       Muted autoplay is what browsers permit, and that is what the READY handler already
       does: setVolume(0) then play. reListenGesture()/unmute() then bring the sound in on the
       visitor's first gesture, unchanged.
       The gesture listeners STAY as a fallback: if requestIdleCallback never fires (a tab
       opened in the background stays throttled), the first gesture still boots it. `boot`
       is idempotent — __kilMountRadio returns early when #kil-sc already exists. */
    function bootWhenIdle(){
      if(window.requestIdleCallback) window.requestIdleCallback(boot, { timeout: 3000 });
      else setTimeout(boot, 1200);
    }
    if(document.readyState === 'complete') bootWhenIdle();
    else window.addEventListener('load', bootWhenIdle, { once:true });
    ['pointerdown','touchstart','keydown'].forEach(function(ev){
      document.addEventListener(ev, boot, { once:true, capture:true, passive:true });
    });
  })();

  /* ── INITIALISATION, WITHOUT A PLAY BUTTON (KODE 2026-09-09) ──────────────────────────
     A browser will not emit sound until the visitor has interacted with the document. The
     stream therefore mounts on the FIRST gesture anywhere on the page - a click, a key, a
     scroll - via the existing arming listeners, not via a transport control. That keeps the
     bar a broadcast panel rather than a music player, and it does not fight autoplay policy:
     nothing is attempted before the browser would allow it.
     Until that gesture the LED reads 'off' and the bar says LIVE READY, which is honest -
     the station is live, this tab simply has not been permitted to play it yet. */
  function paintPlay(){
    var w=document.getElementById('kr-wave'); if(w) w.classList.toggle('on', !!playing);
    var t=document.getElementById('kil-track');
    if(t && !playing && !widgetReady && /^(Loading|)/.test(t.textContent||'')) t.textContent='LIVE READY';
  }
  window.__kilPaintPlay=paintPlay;

  /* ── STATION NAME + ARTWORK IN THE COMPACT BAR ───────────────────────────────────────── */
  function paintStationCompact(){
    var pl=KIL_PL[KIL_PL_I]||KIL_PL[0]||{};
    var lab=document.getElementById('kr-stname'); if(lab) lab.textContent=String(pl.name||'');
    var art=document.getElementById('kr-art');
    if(art){
      if(pl.art){ art.src=pl.art; art.hidden=false; } else { art.removeAttribute('src'); art.hidden=true; }
    }
  }
  window.__kilPaintStationCompact=paintStationCompact;

  /* ── FAVOURITE = SAVE THIS STATION ───────────────────────────────────────────────────
     The only favourite this radio can honestly offer. There is no per-track favourites
     store, so the heart does not claim to save a track, and it never reports success for
     something it did not persist. */
  /* ══ RADIO UI STATE MACHINE ════════════════════════════════════════════════════════════
     EXACTLY ONE presentation state at any moment: 'compact' | 'drawer'.
     The audio engine is untouched by all of this - there is one SoundCloud widget, created
     once by __kilMountRadio(), and none of these transitions reload it, re-create it, reset
     volume or restart the track. That is the whole point: the interface changes, the radio
     session does not.

     LIVE RADIO is the only control that moves between states:
         compact  --click LIVE RADIO-->  drawer
         drawer   --click LIVE RADIO or the drawer header-->  compact
     The full-screen state was removed on 2026-09-09: it filled a desktop screen with empty
     space and offered nothing the drawer does not.
     Dismissing the drawer (outside click / Escape / swipe down) returns to compact and never
     touches playback. */
  var RADIO_UI='compact';
  var drawerEl=null;

  function _gwLabel(st){
    return st==='compact' ? 'Open KEEPITIL Radio' : 'Close KEEPITIL Radio';
  }
  /* The drawer and the full view share ONE header component so the gateway cannot drift
     between them. Built lazily: a visitor who never opens the radio pays nothing. */
  function _hdr(idSuffix){
    return '<button type="button" class="kr-hdr" id="kr-hdr-'+idSuffix+'">'
         +   '<span class="kr-hdr-l">'
         +     '<span class="kil-live" aria-hidden="true"></span>'
         +     '<img src="/keepitil-x-logo.png" class="kil-brand-logo" alt="KEEPITIL"/>'
         +     '<span class="kr-hdr-t">LIVE RADIO</span>'
         +   '</span>'
         +   '<span class="kr-hdr-r"><span class="kr-hdr-hint" id="kr-hint-'+idSuffix+'"></span>'
         +   '<span class="kr-hdr-ic" aria-hidden="true">▴</span></span>'
         + '</button>';
  }
  function _buildDrawer(){
    if(drawerEl) return drawerEl;
    drawerEl=document.createElement('div');
    drawerEl.id='kr-drawer'; drawerEl.className='kr-panel'; drawerEl.setAttribute('role','dialog');
    drawerEl.setAttribute('aria-label','KEEPITIL Radio');
    /* Real content only. Now Playing and the three real stations - no schedule, no listener
       count, no queue, because none of those have a source. The drawer is as tall as the
       truth makes it. */
    drawerEl.innerHTML=_hdr('d')+'<div class="kr-panel-body">'
      +'<div class="kr-sec kr-dnow"><h4>NOW PLAYING</h4>'
      +  '<div class="kr-dnow-row"><img class="kr-dnow-art" id="kr-dnow-art" alt=""/>'
      +  '<div class="kr-dnow-meta"><span class="kr-dnow-t" id="kr-dnow-t"></span>'
      +  '<span class="kr-dnow-s" id="kr-dnow-s"></span>'
      +  '<span class="kr-dnow-live"><i class="kil-live"></i>LIVE</span></div></div></div>'
      +'<div class="kr-sec"><h4>STATIONS</h4>'
      +'<div class="kr-stations" id="kr-stations-d"></div></div></div>';
    document.body.appendChild(drawerEl);
    document.getElementById('kr-hdr-d').addEventListener('click',function(e){ e.stopPropagation(); setRadioUI('compact'); });
    document.getElementById('kr-hint-d').textContent='CLOSE';
    return drawerEl;
  }
  /* _buildFull() and the whole expanded view were deleted 2026-09-09 - see setRadioUI.
     No stale constants, no orphan handlers, no CSS for a screen that no longer exists. */
  /* Station list is rendered from the SAME array the engine plays from, so a station can
     never be offered here that the player cannot actually switch to. */
  function paintStations(){
    ['kr-stations-d','kr-stations-f'].forEach(function(id){
      var host=document.getElementById(id); if(!host) return;
      var pls=KIL_PL||[];
      if(!pls.length){ host.innerHTML='<p class="kr-empty">Stations are loading\u2026</p>'; return; }
      host.innerHTML=pls.map(function(pl,i){
        return '<button type="button" class="kr-st'+(i===KIL_PL_I?' on':'')+'" data-i="'+i+'"'
          +(i===KIL_PL_I?' aria-current="true"':'')+'>'
          +(pl.art?'<img src="'+pl.art+'" alt=""/>':'<span class="kr-st-noart"></span>')
          +'<span>'+String(pl.name||'Station')+'</span></button>';
      }).join('');
      host.querySelectorAll('.kr-st').forEach(function(b){
        b.addEventListener('click',function(){
          var i=+b.dataset.i;
          /* kilLoadPlaylist takes a DELTA and wraps, so an absolute pick becomes a relative
             move. It removes the existing iframe before creating the replacement, which is
             what keeps exactly one widget alive across a station change. */
          if(i!==KIL_PL_I) kilLoadPlaylist(i-KIL_PL_I);
          paintStations();
        });
      });
    });
  }
  function setRadioUI(st){
    if(st===RADIO_UI) return;
    if(st==='drawer') _buildDrawer();
    RADIO_UI=st;
    /* Only ever ONE panel on screen: both are removed from view before one is shown. */
    if(drawerEl) drawerEl.classList.toggle('on', st==='drawer');
    document.documentElement.setAttribute('data-radio-ui', st);
    var gw=document.getElementById('kr-live');
    if(gw){ gw.setAttribute('aria-label',_gwLabel(st)); gw.setAttribute('aria-expanded', st==='compact'?'false':'true'); }
    var ic=document.getElementById('kr-gw-ic'); if(ic) ic.textContent = st==='compact' ? '▴' : '▾';
    if(st!=='compact'){ paintStations(); paintDrawerNow(); }
    try{ window.KIL_RADIO_UI=st; }catch(e){}
  }
  /* Mirrors the compact bar - one source of truth for what is on air. */
  function paintDrawerNow(){
    var t=document.getElementById('kr-dnow-t'), sub=document.getElementById('kr-dnow-s'),
        a=document.getElementById('kr-dnow-art'), src=document.getElementById('kr-art'),
        tr=document.getElementById('kil-track');
    if(t&&tr) t.textContent=tr.textContent||'';
    if(sub){ var pl=KIL_PL[KIL_PL_I]||{}; sub.textContent=String(pl.name||''); }
    if(a&&src&&src.getAttribute('src')) a.src=src.getAttribute('src');
  }
  window.__kilPaintDrawerNow=paintDrawerNow;
  /* ══ THE DRAWER SITS ON THE MEASURED BAR, NOT A GUESSED ONE (KODE 2026-09-10) ═════════
     --kil-radio-h was referenced by #kr-drawer but never actually SET by anything, so the
     drawer's bottom offset was whatever the fallback happened to say - it was 76px while the
     desktop bar was 76px, and would have been wrong the moment either number changed. The
     bar is 54px on desktop and 40px on mobile, so one hardcoded fallback cannot serve both.
     It is measured and published here, and re-measured on resize, so the drawer can never
     drift away from the bar it sits on. */
  function publishRadioHeight(){
    var bar=document.getElementById('kil-radio'); if(!bar) return;
    var h=Math.round(bar.getBoundingClientRect().height);
    if(h>0) document.documentElement.style.setProperty('--kil-radio-h', h+'px');
  }
  window.__kilPublishRadioHeight=publishRadioHeight;
  publishRadioHeight();
  addEventListener('resize', publishRadioHeight, {passive:true});
  /* The bar is built before its fonts/art settle, so measure again once painted. */
  [60,400,1500].forEach(function(ms){ setTimeout(publishRadioHeight, ms); });

  window.KIL_SET_RADIO_UI=setRadioUI;

  var gwBtn=document.getElementById('kr-live');
  if(gwBtn){
    gwBtn.addEventListener('click',function(e){
      e.stopPropagation();
      interacted=true;
      /* One control, three meanings, decided by the state we are currently in. */
      /* TWO STATES ONLY (KODE 2026-09-09). The full-screen state was removed: it filled a
         desktop screen with empty space and offered nothing the drawer does not. LIVE RADIO
         now opens and closes the drawer, and the drawer header closes it too. */
      setRadioUI(RADIO_UI==='compact' ? 'drawer' : 'compact');
    });
  }
  /* Dismiss gestures return to compact. None of them stop audio. */
  document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&RADIO_UI!=='compact') setRadioUI('compact'); });
  document.addEventListener('click',function(e){
    if(RADIO_UI==='compact') return;
    var panel=drawerEl;
    if(panel&&!panel.contains(e.target)&&!e.target.closest('#kil-radio')) setRadioUI('compact');
  });

  // ── Mute/vol controls ─────────────────────────────────────────────────────
  /* ══ MUTE MUST NEVER DEPEND ON WIDGET READINESS (KODE 2026-09-09) ═══════════════════════
     This handler used to open with:

         if(!widget||!widgetReady){interacted=true;return;}

     and that return was the bug. Reproduced on the live site before changing anything: on
     EARN at 375px the button renders, and two consecutive clicks left the icon on the
     speaker glyph with no state change at all - a control that is purely decorative until
     the SoundCloud widget happens to report READY. On desktop the widget reaches READY
     quickly so mute worked, which is why this looked intermittent rather than broken.
     On a phone the widget does not become ready until playback actually starts, so the
     visitor gets a mute button that does nothing for as long as they have not pressed play.

     Mute is a statement of INTENT and is now always honoured: the flag flips, the icon and
     slider update, and the choice is persisted, whether or not a widget exists yet. When
     the widget is not ready the intent is remembered in _pendingMute and applied by the
     READY handler. Nothing here starts playback - muting an idle player must not force
     audio to begin, which would defeat the browser's autoplay rules. */
  if(muteBtn){muteBtn.addEventListener('click',function(e){
    e.stopPropagation();
    interacted=true;
    if(!widget||!widgetReady){
      muted=!muted;
      muteBtn.textContent = muted?'🔇':'🔊';
      muteBtn.setAttribute('aria-label', muted?'Unmute':'Mute');
      muteBtn.setAttribute('aria-pressed', muted?'true':'false');
      if(volEl){volEl.value=muted?0:savedVol;}
      _pendingMute = muted;                 /* applied the moment READY fires */
      krsWrite({volume:savedVol/100,muted:muted});
      return;
    }
    if(muted){
      /* Unmute returns audio at the STORED level - which may be one the visitor chose while
         muted - and never jumps to full volume. */
      muted=false;muteBtn.textContent='🔊';
      muteBtn.setAttribute('aria-label','Mute');muteBtn.setAttribute('aria-pressed','false');
      widget.setVolume(savedVol);
      if(volEl){volEl.value=muted?0:savedVol;}
      if(isMobile)widget.play();
      if(commercialAudio)commercialAudio.volume=Math.min(1,savedVol/100);
    } else {
      /* Muting silences the audio and nothing else: the track, its position and the stored
         level are all untouched, and the slider appears so a level can be chosen. */
      savedVol=Math.max(1,parseInt(volEl&&volEl.value!==''?volEl.value:savedVol)||DEFAULT_VOL);
      muted=true;muteBtn.textContent='🔇';
      muteBtn.setAttribute('aria-label','Unmute');muteBtn.setAttribute('aria-pressed','true');
      widget.setVolume(0);
      if(volEl){volEl.value=muted?0:savedVol;}
      if(isMobile)widget.pause();
      if(commercialAudio)commercialAudio.volume=0;
    }
    krsWrite({volume:savedVol/100,muted:muted});
  });}
  /* ══ VOLUME MUST NEVER BE DEAD (KODE 2026-09-09) ═══════════════════════════════════════
     This opened with `if(!widget||!widgetReady) return;` - the same defect that made mute
     decorative. Dragging the slider before the widget reported READY did nothing at all:
     no audible change, no savedVol update, no persistence, so the chosen level was lost
     too. The level is a user decision and is now always recorded; it reaches the engine
     the moment there is an engine to reach.
     Volume 0 IS muted and volume above 0 is unmuted, so the slider and the mute button can
     never disagree - they are two views of one state. */
  if(volEl){volEl.addEventListener('input',function(){
    interacted=true;
    var v=Math.max(0,Math.min(100,parseInt(this.value)||0));
    savedVol=v;
    var wantMuted=(v===0);
    if(wantMuted!==muted){
      muted=wantMuted;
      if(muteBtn){
        muteBtn.textContent = muted?'🔇':'🔊';
        muteBtn.setAttribute('aria-pressed', muted?'true':'false');
        muteBtn.setAttribute('aria-label', muted?'Unmute radio':'Mute radio');
      }
    }
    if(widget&&widgetReady){
      widget.setVolume(muted?0:v);
      if(commercialAudio)commercialAudio.volume=muted?0:Math.min(1,v/100);
    } else { _pendingMute = muted; }   /* applied by the READY handler */
    krsWrite({volume:savedVol/100,muted:muted});
  });}

  // ── Nav logo swap: transparent extracted X marks, no mix-blend-mode ─────
  function swapNavLogos(){
    document.querySelectorAll('a.nav-logo img,#main-nav img,nav img').forEach(function(img){
      var src=img.getAttribute('src')||'';
      var m=src.match(/logo-(\w+)-nav\.png/i);
      if(!m)return;
      img.src='/keepitil-x-'+m[1]+'.png';
      var st=img.getAttribute('style')||'';
      img.setAttribute('style',st.replace(/mix-blend-mode\s*:\s*\w+\s*;?/gi,''));
      img.style.mixBlendMode='';
    });
  }
  swapNavLogos();

  // ── PJAX: keep radio alive during navigation (no iframe reload = no gap) ──
  (function(){
    var SKIP=/\.(pdf|zip|png|jpg|jpeg|gif|svg|mp3|mp4|webm|wav|ogg)$/i;
    // Elements preserved across a swap (never removed) → radio never stops, shell never drops.
    var KEEP=['kil-radio','kil-sc','kilo-btn','kilo-panel','kil-cfab','v3shell-nav','v3-footer'];
    // Only these community content pages use pjax; every other link does a normal full load.
    var ALLOW=/^\/v3\/(culture(\.html)?|create-comp\.html|compete\.html|earn\.html|giveback\.html)$/;
    function pjOK(u){try{return ALLOW.test(new URL(u,location.href).pathname);}catch(e){return false;}}

    function pjaxNav(url){
      fetch(url,{credentials:'same-origin'})
        .then(function(r){if(!r.ok)throw 0;return r.text();})
        .then(function(html){
          var doc=new DOMParser().parseFromString(html,'text/html');
          document.title=doc.title;

          // Swap page inline styles only — PRESERVE all widget styles (kil*, kilo-*, shell, data-kil)
          // so the radio/chat/notify/social/feedback widgets keep their CSS across the swap.
          document.head.querySelectorAll('style:not([data-kil]):not([id^="kil"]):not(#v3shell-style)').forEach(function(s){s.remove();});
          doc.head.querySelectorAll('style').forEach(function(s){
            if(s.id&&document.getElementById(s.id))return;  // don't duplicate an already-present (widget) style
            var n=document.createElement('style');if(s.id)n.id=s.id;n.textContent=s.textContent;document.head.appendChild(n);
          });
          // Pull in any stylesheet <link> the new page needs that we don't already have (e.g. fonts)
          doc.head.querySelectorAll('link[rel="stylesheet"]').forEach(function(l){
            var h=l.getAttribute('href');
            if(h&&!document.head.querySelector('link[href="'+h+'"]')){var nl=document.createElement('link');nl.rel='stylesheet';nl.href=h;document.head.appendChild(nl);}
          });

          // Remove old body content except radio + echo elements
          Array.from(document.body.children).forEach(function(c){
            if(KEEP.indexOf(c.id)===-1)c.remove();
          });
          document.body.className=doc.body.className||'';

          // Insert new content right AFTER the universal shell nav (kept alive), before the footer.
          var frag=document.createDocumentFragment();
          Array.from(doc.body.children).forEach(function(c){
            if(KEEP.indexOf(c.id)===-1)frag.appendChild(document.importNode(c,true));
          });
          var _shell=document.getElementById('v3shell-nav');
          if(_shell&&_shell.nextSibling){document.body.insertBefore(frag,_shell.nextSibling);}
          else{document.body.insertBefore(frag,document.body.firstChild);}
          try{document.body.style.paddingTop='66px';}catch(e){}  // keep offset for the fixed shell nav

          // Re-run page-specific inline scripts (skip external + radio/sc scripts)
          doc.body.querySelectorAll('script').forEach(function(s){
            if(s.getAttribute('src'))return; // already loaded externals
            var code=s.textContent||'';
            if(!code.trim())return;
            if(code.includes('__kilRadioInit')||code.includes('SC.Widget')||code.includes('keepitil-ai'))return;
            try{(new Function(code))();}catch(ex){console.warn('[kil-pjax]',ex);}
          });

          swapNavLogos();
          history.pushState({pjax:1,url:url},document.title,url);
          window.scrollTo(0,0);
          // Resume playback if PJAX accidentally caused a pause
          if(widget&&widgetReady&&interacted&&!muted){
            setTimeout(function(){widget.isPaused(function(p){if(p){widget.setVolume(getVol());widget.play();}});},400);
          }
        })
        .catch(function(){
          // Full reload fallback — save position so next page can hand off
          try{sessionStorage.setItem('kil_hand',JSON.stringify({idx:currentTrackIdx,pos:currentPosition,ts:Date.now(),vol:muted?0:savedVol,muted:muted}));}catch(e){}
          window.location.href=url;
        });
    }

    // Shell-aware PJAX (revived 2026-07-12): intercept clicks ONLY between allow-listed community
    // content pages (culture + 4 pillars). The universal shell nav/footer + radio + FABs are
    // preserved across the swap (see KEEP), so the radio never stops and the nav never drops.
    // Script-heavy pages (agent/crew/event/ticketing/checkout/etc.) are NOT allow-listed — links to
    // them do normal full navigations (radio hands off via sessionStorage), so the old agent.html
    // P0 cannot recur.
    document.addEventListener('click',function(e){
      if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
      var a=e.target.closest&&e.target.closest('a[href]'); if(!a)return;
      if(a.target==='_blank'||a.hasAttribute('download'))return;
      var href=a.getAttribute('href')||'';
      if(!href||href.charAt(0)==='#'||/^(mailto:|tel:|javascript:)/i.test(href))return;
      var u; try{u=new URL(href,location.href);}catch(_){return;}
      if(u.origin!==location.origin||SKIP.test(u.pathname))return;
      if(u.pathname===location.pathname)return;       // same page — let hash/anchor behave
      if(!pjOK(u.href)||!pjOK(location.href))return;   // only pjax between allow-listed content pages
      e.preventDefault(); pjaxNav(u.href);
    },true);

    // Handle browser back/forward
    window.addEventListener('popstate',function(e){
      if(e.state&&e.state.pjax)pjaxNav(e.state.url||location.href);
    });
  })();
})();
