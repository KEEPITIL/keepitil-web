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
    /* ══ ONE ACCENT: NEON GREEN ON DARK GLASS (KODE 2026-09-18) ═══════════════════════
       The radio was a green LIVE RADIO anchor against a neon-PURPLE everything-else. The
       approved direction is a single neon green accent on transparent silver/dark glass,
       so the split is gone: green is the outline, the glow, the icon and the active state,
       and the surface itself stays dark glass rather than becoming green.

       The token family was named --krp for "purple". Redefining those names to hold green
       would have left every one of 58 references claiming a colour the radio no longer
       uses, so they are renamed --kra ("accent") in the same change. One definition site,
       so a future edit cannot reintroduce a second accent by hand. */
    /* Every radio button opts out of the native widget. Not fixing a known defect: the
       transport circles were verified painting correctly (interior pixel rgb(6,32,20), the
       accent at 10% over the bar) before and after this line. It is here because these are
       fully custom controls, and appearance:auto leaves their fill at the mercy of a
       platform's native button theme. */
    '#kil-radio button,.kr-panel button{appearance:none;-webkit-appearance:none;}'+
    ':root,#kil-radio{--kra:#00ff88;--kra-txt:#8fe9bd;--kra-line:rgba(0,255,136,.34);'
    + '--kra-glow:rgba(0,255,136,.30);--kra-fill:rgba(0,255,136,.10);'
    + '--kra-fill-2:rgba(0,255,136,.22);--krg:#00ff88;}'+
    '#kil-radio{position:fixed;bottom:0;left:0;right:0;height:40px;z-index:9998;background:rgba(6,6,6,.97);border-top:1px solid var(--kra-line);box-shadow:0 -2px 24px rgba(0,0,0,.7);backdrop-filter:blur(18px);font-family:\'Space Grotesk\',\'Inter\',sans-serif;display:flex;align-items:center;padding:0 5px;gap:5px;overflow:hidden;transition:bottom .3s,left .3s,right .3s,width .3s,height .3s,border-radius .3s,border .3s,padding .3s,box-shadow .3s;}'+
    '#kil-radio.kil-mini{bottom:20px!important;left:auto!important;right:24px!important;width:58px!important;height:58px!important;border-radius:50%!important;border:2px solid rgba(0,255,136,.3)!important;border-top:2px solid rgba(0,255,136,.3)!important;box-shadow:0 4px 24px rgba(0,0,0,.7),0 0 20px rgba(0,255,136,.08)!important;cursor:pointer!important;padding:0!important;justify-content:center!important;gap:0!important;}'+
    '#kil-mini-dot{display:none;width:100%;height:100%;align-items:center;justify-content:center;font-size:1.5rem;color:#00ff88;animation:kil-blink 2s ease-in-out infinite;}'+
    '#kil-radio.kil-mini #kil-mini-dot{display:flex!important;}'+
    '#kil-radio.kil-mini .krb{display:none!important;}'+
    '.kil-live{width:7px;height:7px;border-radius:50%;background:#00ff88;flex-shrink:0;box-shadow:0 0 6px #00ff88;animation:kil-blink 2s ease-in-out infinite;}'+
    '.kil-live.off{background:#444;box-shadow:none;animation:none;}'+
    '@keyframes kil-blink{0%,100%{opacity:1;}50%{opacity:.35;}}'+
    '.kil-brand-logo{height:28px;width:auto;}'+
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
      'border-radius:999px;accent-color:var(--kra);}'+
    '.kr-vol::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;'+
      'border-radius:50%;background:var(--kra);border:0;cursor:pointer;}'+
    '.kr-vol::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:var(--kra);'+
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
    'button.krb:hover{background:rgba(0,255,136,.14);border-color:var(--kra-line);}'+
    '.krb-brand{flex:0.9 1 0;}'+
    '#kr-prev{flex:2 1 0;}'+
    /* De-boxed 2026-09-10: the tinted fill made the centre read as a separate widget. */
    '.krb-now{flex:4.1 1 0;position:relative;background:none;'+
      'border-color:rgba(0,255,136,.28);}'+
    '#kr-next{flex:2 1 0;}'+
    '#kr-mute{flex:1 1 0;}'+
    '.kr-side{font-size:.7rem;color:rgba(255,255,255,.55);white-space:nowrap;overflow:hidden;'+
      'text-overflow:ellipsis;min-width:0;}'+
    '.kr-plname{font-weight:800;font-size:.68rem;letter-spacing:.06em;color:var(--kra-txt);'+
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
    '.kr-btn{background:none;border:none;cursor:pointer;color:var(--kra);font-size:.85rem;line-height:1;padding:2px 4px;transition:opacity .2s;flex-shrink:0;}'+
    '.kr-btn:hover{opacity:.6;}'+
    '#kr-vol{width:60px;accent-color:var(--kra);cursor:pointer;opacity:.75;vertical-align:middle;}'+
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
    /* ══ DESKTOP: THREE TRACK PREVIEWS, CURRENT DEAD-CENTRE (KODE 2026-09-17) ═════════
       The 54px height is a HARD LOCK - this is a broadcast strip, not a media player, and
       the owner has approved this footprint. Everything below reorganises content INSIDE
       that height; nothing here may grow it.

       WHY THE TRACK GROUP IS ABSOLUTELY POSITIONED
       "Current track is the true visual centre" cannot be satisfied by flexbox here. The
       left zone (LIVE RADIO, ~106px) and the right zone (four controls, ~190px) are
       different widths, so any in-flow centring puts the current track off-centre by half
       their difference - which is exactly the class of error a box-based measurement hides.
       The group is therefore centred on the BAR, and the group is itself symmetric:
       prev-preview and next-preview share one width, the two arrows share another, so the
       centre of the group IS the centre of the current card. Verified by measuring rendered
       centres, not boxes.

       WHY THE SIDE PREVIEWS COLLAPSE BEFORE THE CENTRE DOES
       An absolutely-centred group can overlap the zones it is centred between. Rather than
       let that happen, the previews drop out at the widths where they would collide, in the
       priority the brief sets: current track, then arrows, then volume/chat, then the
       adjacent art and text. The bar never gets taller and nothing ever overlaps. */
    +'@media(min-width:641px){'
    +  '#kil-radio{height:var(--kr-bar-h,45px);min-height:var(--kr-bar-h,45px);'
    +  'padding:0 20px;gap:18px;align-items:center;}'
    +  '#kil-radio>*{align-self:center;}'
    +  '.krb{height:auto!important;}'
    +  '#kr-live{flex:0 0 auto;padding:3px 9px;}'
    /* The centred group. pointer-events pass through the padding so a click on bar
       whitespace still reaches the bar (which opens the drawer). */
    +  '.krb-tracks{position:absolute;left:50%;top:0;bottom:0;transform:translateX(-50%);'
    +    'display:flex;align-items:center;gap:12px;pointer-events:none;}'
    +  '.krb-tracks>*{pointer-events:auto;}'
    +  '.kr-tk{display:flex;align-items:center;gap:8px;min-width:0;}'
    /* HIDDEN UNTIL THERE IS A TRACK TO SHOW. Before the queue arrives these cards have an
       <img> with no src and a placeholder background, which drew two empty bordered boxes
       either side of the current track on every first paint. A preview with nothing in it
       should not be visible at all, so the default is hidden and kilPaintTrack reveals it
       the moment it has a real title - which is also exactly what it does at a playlist
       boundary where no neighbour exists. */
    +  '.kr-tk-side{flex:0 0 var(--kr-tkw,178px);width:var(--kr-tkw,178px);opacity:.62;'
    +    'visibility:hidden;}'
    +  '.kr-tk-side:hover{opacity:.9;}'
    +  '.kr-tk-cur{flex:0 0 var(--kr-curw,226px);width:var(--kr-curw,226px);}'
    /* 1:1 SQUARE (§5). A SoundCloud TRACK's artwork is square at source - the portrait
       card belongs to a STATION, and using it here meant every song was centre-cropped into
       a shape its artwork was never drawn for. object-fit:cover still guards against a
       non-square source rather than stretching it. 38px is the largest square that fits
       inside 54px with breathing room. */
    +  '.kr-tkart{flex:0 0 auto;width:38px;height:38px;border-radius:5px;object-fit:cover;'
    +    'background:#0e1a14;display:block;}'
    +  '.kr-tk-cur .kr-tkart{width:40px;height:40px;border-radius:6px;'
    +    'box-shadow:0 0 0 1px var(--kra-line),0 0 12px var(--kra-glow);}'
    /* EXACTLY TWO TEXT ROWS. No third label, no repeated title, no wrap - min-width:0 is
       what actually lets a flex child shrink below its content so the ellipsis can apply. */
    +  '.kr-tkmeta{display:flex;flex-direction:column;justify-content:center;min-width:0;'
    +    'flex:1 1 auto;gap:1px;}'
    /* CENTRED (Founder 2026-09-23): both rows are centred in their card. text-align rather
       than a flex change - .kr-tkmeta is a COLUMN, so its justify-content centres vertically
       and would do nothing horizontally here. The ellipsis still applies. */
    +  '.kr-tkt,.kr-tkp{display:block;min-width:0;max-width:100%;white-space:nowrap;'
    +    'overflow:hidden;text-overflow:ellipsis;text-align:center;}'
    /* §7: sized UP against the same 54px. Two rows at 1.2 line-height plus the gap is
       ~34px, which sits inside the bar without touching its edges. Still exactly two rows
       and still ellipsised - bigger text makes truncation more likely, not less. */
    +  '.kr-tkt{font-size:.8rem;font-weight:700;line-height:1.2;color:#eafff4;}'
    +  '.kr-tkp{font-size:.62rem;font-weight:700;line-height:1.2;letter-spacing:.06em;'
    +    'text-transform:uppercase;color:var(--kra-txt);}'
    +  '.kr-tk-cur .kr-tkt{font-size:.95rem;font-weight:800;color:#fff;}'
    +  '.kr-tk-cur .kr-tkp{font-size:.68rem;color:var(--kra);}'
    /* The two - and only two - primary transport controls. */
    /* §8: 40px inside a 54px bar - close to the usable height, with 7px clear top and
       bottom. These were 30px circles carrying a 12.8px glyph, which read as decoration. */
    +  '.kr-nav{flex:0 0 40px;width:40px;height:40px;border-radius:50%;display:flex;'
    +    'align-items:center;justify-content:center;background:var(--kra-fill);'
    +    'border:1px solid var(--kra-line);color:var(--kra);font-size:1.3rem;line-height:1;'
    +    'cursor:pointer;transition:background .18s,border-color .18s,box-shadow .18s;}'
    +  '.kr-nav:hover{background:var(--kra-fill-2);border-color:var(--kra);'
    +    'box-shadow:0 0 14px var(--kra-glow);}'
    +  '.kr-nav:focus-visible{outline:2px solid var(--kra);outline-offset:2px;}'
    /* Right-hand utilities, in the one approved order: shuffle, repeat, volume, chat. */
    +  '.kr-ctrls{margin-left:auto;flex:0 0 auto;display:flex;align-items:center;gap:10px;}'
    /* §8: 40px hit targets carrying a 22px glyph, matching the transport circles. Scoped to
       #kil-radio on purpose - .kr-util is also the drawer's chat expand/close pair, and
       those are secondary controls in a header, not primary controls in the bar. */
    +  '#kil-radio .kr-util{width:var(--kr-util,45px);height:var(--kr-util,45px);padding:0;'
    +    'border-radius:var(--kr-util-radius,10px);font-size:var(--kr-util-glyph,1rem);}'
    +  '#kil-radio .kr-util svg{width:var(--kr-util-ic,45px);height:var(--kr-util-ic,45px);}'
    /* The square art is 14px wider than the portrait card it replaces and the text is
       larger, so each zone gains that back. Measured, not guessed: see the reported centre
       offset at 1440/1280/1024. */
    /* Same rule as the drawer card: these once hard-set --kr-tkw / --kr-curw here, which made
       the bar's track slots untunable, because a literal on #kil-radio beats any inherited
       value. Tune the -base pair; the narrower widths keep their measured proportions of it
       (210 -> 158 was .752; 270 -> 238 / 230 was .881 / .852). */
    +  '@media(min-width:1200px){#kil-radio{--kr-tkw:var(--kr-tkw-base,200px);'
    +    '--kr-curw:var(--kr-curw-base,250px);}}'
    +  '@media(min-width:1024px) and (max-width:1199px){'
    +    '#kil-radio{--kr-tkw:calc(var(--kr-tkw-base,200px)*.752);'
    +    '--kr-curw:calc(var(--kr-curw-base,250px)*.881);}}'
    +  '@media(max-width:1023px){.kr-tk-side{display:none;}'
    +    '#kil-radio{--kr-curw:calc(var(--kr-curw-base,250px)*.852);}}'
    +'}'
    +'#kr-live{display:flex;align-items:center;gap:6px;background:transparent;border:1px solid rgba(0,255,136,.28);border-radius:10px;padding:4px 8px;cursor:pointer;transition:background .18s,border-color .18s,box-shadow .18s;}'
    +'#kr-live:hover{background:rgba(0,255,136,.10);border-color:rgba(0,255,136,.55);}'
    +'#kr-live:focus-visible{outline:2px solid var(--krg);outline-offset:2px;}'
    +'html[data-radio-ui="drawer"] #kr-live,html[data-radio-ui="expanded"] #kr-live{background:rgba(0,255,136,.16);border-color:#00ff88;box-shadow:0 0 14px rgba(0,255,136,.35);}'
    /* ONE ROW, NO WRAP (§4). white-space:nowrap is the part that matters: the old markup
       forced two rows with a <br>, and simply deleting the <br> would let a narrow bar wrap
       it back to two by itself. */
    +'#kr-live .kil-brand-radio{line-height:1;text-align:left;font-size:var(--kr-live-size,1rem);'
    +  'white-space:nowrap;letter-spacing:.1em;}'
    /* station stepper: fixed width, so new stations never widen the bar */
    /* now playing */
    /* A long track title truncates. min-width:0 is the part that actually matters: without
       it a flex item refuses to shrink below its content and pushes mute/volume off-screen
       instead of ellipsing. */
    +'#kil-track,.kr-nowsub{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;max-width:100%;display:block;}'
    +'.kr-nowsub{color:#8d99ab;font-size:.52rem;}'
    /* ══ WAVEFORM: BEHIND THE CENTRE, NEVER IN FRONT OF IT (brief 14) ════════════════
       Absolutely positioned across the centre card and pushed to z-index 0 with the card's
       own content at 1, so it can be wide and still cost nothing in readability - a wave
       that sits IN the flex row would steal width from the title it is meant to decorate.
       aria-hidden and pointer-events:none: it is decoration, not a control.
       It animates only while audio is genuinely playing (paintPlay toggles .on), so it can
       never imply sound that is not happening, and it is NOT audio-spectrum data. */
    /* WIDER THAN THE CARD AND FADED AT BOTH ENDS. Five bars in the middle read as a stray
       widget sitting next to the title; spanning the card and masking the edges makes it
       ambience behind the text, which is what "non-obstructive" has to mean here. */
    +'.kr-wave{display:none;position:absolute;left:50%;top:50%;'
    +  'transform:translate(-50%,-50%);width:calc(var(--kr-curw,226px) + 34px);height:30px;'
    +  'z-index:0;align-items:center;justify-content:space-between;gap:2px;pointer-events:none;'
    +  'opacity:.22;-webkit-mask-image:linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent);'
    +  'mask-image:linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent);}'
    +'.kr-wave.on{display:flex;}'
    +'.kr-tk-cur{position:relative;}'
    +'.kr-tk-cur>*{position:relative;z-index:1;}'
    +'.kr-wave i{flex:1 1 0;min-width:2px;max-width:3px;background:var(--kra);border-radius:2px;'
    +  'box-shadow:0 0 6px var(--kra-glow);animation:kr-eq .9s ease-in-out infinite;}'
    /* One rule, one place: no motion means no animation anywhere in the radio. */
    +'@media(prefers-reduced-motion:reduce){'
    +  '.kr-wave i{animation:none!important;transform:none!important;}'
    +  '.kil-live{animation:none!important;}'
    +'}'
    /* ══ UTILITY CONTROLS ════════════════════════════════════════════════════════════ */
    +'.kr-util{display:inline-flex;align-items:center;justify-content:center;'
    +  'background:transparent;border:1px solid transparent;border-radius:9px;'
    +  'color:var(--kra-txt);font-size:var(--kr-chatbtn-glyph,1rem);line-height:1;'
    +  'padding:var(--kr-chatbtn-pady,0px) var(--kr-chatbtn-padx,10px);cursor:pointer;'
    +  'transition:color .18s,background .18s,border-color .18s;}'
    +'.kr-util:hover{color:#fff;background:rgba(0,255,136,.16);border-color:var(--kra-line);}'
    +'.kr-util:focus-visible{outline:2px solid var(--kra);outline-offset:2px;}'
    /* An engaged toggle has to be legible without colour alone, so it also gains a border. */
    +'.kr-util[aria-pressed="true"]{color:#fff;background:rgba(0,255,136,.26);'
    +  'border-color:var(--kra);box-shadow:0 0 12px var(--kra-glow);}'
    /* ══ VOLUME: A SLIDER THAT RISES FROM THE BAR (brief 19) ═════════════════════════ */
    +'.kr-volwrap{position:relative;display:flex;align-items:center;}'
    +'.kr-volpop{position:absolute;left:50%;transform:translateX(-50%);'
    +  'bottom:calc(100% + 10px);display:flex;flex-direction:column;align-items:center;gap:6px;'
    +  'padding:12px 8px 10px;background:rgba(10,8,18,.97);border:1px solid var(--kra-line);'
    +  'border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.6),0 0 18px var(--kra-glow);'
    +  'z-index:10000;}'
    +'.kr-volpop[hidden]{display:none;}'
    +'.kr-volpop .kr-vol{-webkit-appearance:slider-vertical;appearance:slider-vertical;'
    +  'writing-mode:vertical-lr;direction:rtl;width:26px;height:96px;margin:0;padding:0;'
    +  'flex:0 0 auto;accent-color:var(--kra);cursor:pointer;background:transparent;}'
    +'.kr-volnum{font-size:.52rem;font-weight:800;letter-spacing:.08em;color:var(--kra-txt);'
    +  'font-variant-numeric:tabular-nums;}'
    +'.kr-wave i:nth-child(6n+1){height:8px;animation-delay:0s}'
    +'.kr-wave i:nth-child(6n+2){height:18px;animation-delay:.12s}'
    +'.kr-wave i:nth-child(6n+3){height:11px;animation-delay:.24s}'
    +'.kr-wave i:nth-child(6n+4){height:24px;animation-delay:.36s}'
    +'.kr-wave i:nth-child(6n+5){height:14px;animation-delay:.48s}'
    +'.kr-wave i:nth-child(6n){height:20px;animation-delay:.6s}'
    +'@keyframes kr-eq{0%,100%{transform:scaleY(.4)}50%{transform:scaleY(1)}}'
    /* play/pause is the dominant control */
    /* ── PANELS: exactly one visible, both driven by data-radio-ui ── */
    +'.kr-panel{position:fixed;left:0;right:0;z-index:9997;display:none;flex-direction:column;background:rgba(9,9,14,.97);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-top:1px solid var(--kra-line);max-height:calc(100vh - var(--kil-radio-h,54px));overflow-y:auto;font-family:\'Space Grotesk\',\'Inter\',sans-serif;}'
    +'.kr-panel.on{display:flex;}'
    /* ══ THE CAP MUST FIT BOTH ROWS (KODE 2026-09-17) ═══════════════════════════════
       This was max-height:360px, from when the drawer held a now-playing block and a row of
       small station pills. The expanded radio now carries a 162px-tall 2:3 track carousel
       ABOVE the station row, and 360px cut the stations and the + CREATE tile clean off the
       bottom - the id selector here also outranks the class rule, so raising it on
       .kr-panel had no effect at all and the clipping survived the first fix.
       Sized to the content it actually has, capped so it can never cover the viewport, and
       it grows again when + CREATE reveals the submission form. */
    +'#kr-drawer{bottom:var(--kil-radio-h,54px);max-height:calc(100vh - var(--kil-radio-h,54px) - 8px);border-radius:14px 14px 0 0;box-shadow:0 -18px 50px rgba(0,0,0,.7);}'
    +'.kr-hdr{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;background:linear-gradient(90deg,rgba(0,255,136,.12),rgba(124,77,255,.10));border:0;border-bottom:1px solid rgba(255,255,255,.08);'
    +  'padding:var(--kr-hdr-pady,10px) var(--kr-hdr-padx,10px);cursor:pointer;}'
    +'.kr-hdr:hover{background:linear-gradient(90deg,rgba(0,255,136,.2),rgba(124,77,255,.16));}'
    +'.kr-hdr:focus-visible{outline:2px solid var(--kra);outline-offset:-2px;}'
    +'.kr-hdr-l,.kr-hdr-r{display:flex;align-items:center;gap:8px;}'
    +'.kr-hdr-t{font-size:var(--kr-hdr-t,1rem);font-weight:900;letter-spacing:.2em;color:#00ff88;text-transform:uppercase;}'
    +'.kr-hdr-hint{font-size:var(--kr-hdr-hint,1rem);font-weight:800;letter-spacing:.16em;color:#7a8699;text-transform:uppercase;}'
    +'.kr-hdr-ic{color:var(--kra);font-size:var(--kr-hdr-ic,1rem);}'
    +'html[data-radio-ui="expanded"] .kr-hdr-ic{transform:rotate(180deg);}'
    +'.kr-panel-body{overflow:auto;padding:12px 14px 16px;}'
    /* ══ EXPANDED RADIO: TWO COLUMNS (brief 21-25) ═══════════════════════════════════
       RADIO on the left taking most of the width, CHAT on the right. The chat column is
       compact by default so it is usable without dominating, and can be taken to about
       half the panel. Nothing overlaps at any width: this is a flex row, so widening one
       column genuinely narrows the other rather than covering it. */
    /* ══ EXPANDED RADIO GRID — TUNABLE DIMENSIONS (Founder 2026-09-23) ═══════════════════
       Every size in the expanded drawer is a named custom property with the SHIPPED value as
       its fallback. The founder retuned these on 2026-09-23 and the chosen values ARE the
       fallbacks below, so the shipped look and the "unset" look remain the same thing.
       Override them on :root, .kr-rail or #kr-drawer to retune:

         --kr-bar-h     54px     collapsed bar height   --kr-chatw     400px  chat column width
         --kr-main-gap  10px     section spacing        --kr-main-padt 10px   main padding top
         --kr-main-padx 10px     main padding sides     --kr-main-padb 10px   main padding bottom
         --kr-head-size .66rem   section-head font      --kr-head-gap  10px   section-head gap
         --kr-head-mb   10px     section-head margin    --kr-strip-gap 10px   gap between cards
         --kr-tcw-base  200px    track card width       --kr-art-radius 10px  artwork corner
         --kr-tct-size  1rem     track title size       --kr-tct-mt    10px   title offset
         --kr-tcp-size  1rem     playlist label size    --kr-nav       50px   ‹ › button size
         --kr-nav-glyph 2rem     ‹ › glyph size         --kr-stw       150px  station card width

       Card width is --kr-tcw-base, NOT --kr-tcw: the narrower-desktop breakpoints derive
       --kr-tcw from it, and a literal there would beat any override.

       The tuner at /radio-tuner/ writes these live and copies out a ready-to-paste block.
       ⚠ Keep the fallbacks equal to the shipped values. They are the contract that an
       untouched site looks untouched. */
    +'.kr-two{display:flex;align-items:stretch;gap:0;min-height:0;flex:1 1 auto;}'
    /* NO overflow:auto HERE. With it, the left column stopped contributing its height to
       the panel, so the panel sized itself to 360px and clipped the STATIONS row and the
       + CREATE tile clean off the bottom - both rows are required to be visible. The rows
       scroll HORIZONTALLY on their own; the column itself has no reason to scroll, and the
       panel below carries the vertical cap for the rare case where content exceeds it. */
    +'.kr-main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;'
    +  'gap:var(--kr-main-gap,10px);'
    +  'padding:var(--kr-main-padt,10px) var(--kr-main-padx,10px) var(--kr-main-padb,10px);'
    +  'min-height:0;}'
    +'.kr-chatcol{flex:0 0 var(--kr-chatw,400px);width:var(--kr-chatw,400px);min-width:0;'
    +  'display:flex;flex-direction:column;border-left:1px solid var(--kra-line);'
    +  'background:rgba(12,10,20,.72);transition:flex-basis .22s ease,width .22s ease;}'
    +'#kr-drawer.kr-chat-wide{--kr-chatw:50%;}'
    +'#kr-drawer.kr-chat-off{--kr-chatw:0px;}'
    +'#kr-drawer.kr-chat-off .kr-chatcol{border-left:0;overflow:hidden;}'
    +'.kr-chathdr{display:flex;align-items:center;gap:var(--kr-chathdr-gap,10px);'
    +  'padding:var(--kr-chathdr-pady,10px) var(--kr-chathdr-padx,10px);'
    +  'border-bottom:1px solid var(--kra-line);flex:0 0 auto;}'
    +'.kr-chathdr b{font-size:var(--kr-chathdr-size,1rem);font-weight:900;letter-spacing:.16em;color:var(--kra);'
    +  'text-transform:uppercase;}'
    +'.kr-chathdr .kr-sp{margin-left:auto;display:flex;gap:var(--kr-chatbtn-gap,10px);}'
    +'.kr-chatbody{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:hidden;}'
    +'.kr-chatnote{padding:var(--kr-chatnote-pad,10px);font-size:var(--kr-chatnote-size,1rem);line-height:1.5;color:#9c94b8;}'
    /* ── ROWS ────────────────────────────────────────────────────────────────────────── */
    +'.kr-rowhead{display:flex;align-items:center;gap:var(--kr-head-gap,10px);'
    +  'margin:0 0 var(--kr-head-mb,10px);}'
    /* #8e86a8 was a purple-grey - a leftover of the old palette that read as lilac against
       the green row it labels. Neutral with a green cast, and a step larger so the two row
       labels are legible rather than decorative. */
    +'.kr-rowhead h4{margin:0;font-size:var(--kr-head-size,1rem);font-weight:900;letter-spacing:.2em;'
    +  'color:#8fa89b;text-transform:uppercase;}'
    +'.kr-rail{position:relative;display:flex;align-items:center;gap:8px;min-width:0;}'
    /* The two Now Playing controls are positioned from the ROW CENTRE, which is where the
       current card always is, so they stay against it at every width without measuring. */
    +'.kr-npnav{position:absolute;top:calc(var(--kr-tcw,200px)/2 - var(--kr-nav,50px)/2);'
    +  'width:var(--kr-nav,50px);height:var(--kr-nav,50px);font-size:var(--kr-nav-glyph,1.5rem);'
    +  'border-radius:50%;display:flex;align-items:center;justify-content:center;z-index:3;'
    +  'background:rgba(6,20,14,.86);border:1px solid var(--kra-line);color:var(--kra);'
    /* NO font-size here: this rule already sets it from --kr-nav-glyph above, and a second
       declaration in the same rule silently won, so the glyph knob did nothing. */
    +  'line-height:1;cursor:pointer;backdrop-filter:blur(6px);'
    +  'transition:background .18s,border-color .18s,box-shadow .18s;}'
    +'.kr-npnav:hover{background:var(--kra-fill-2);border-color:var(--kra);'
    +  'box-shadow:0 0 16px var(--kra-glow);}'
    +'.kr-npnav:focus-visible{outline:2px solid var(--kra);outline-offset:2px;}'
    +'.kr-npnav-l{right:calc(50% + var(--kr-tcw,200px)/2 - 6px);}'
    +'.kr-npnav-r{left:calc(50% + var(--kr-tcw,200px)/2 - 6px);}'
    /* WITHOUT THIS THE FIRST AND LAST TRACK CANNOT REACH THE CENTRE. centreCurrentTrack
       clamps scrollLeft at 0, so with no inline padding the first card simply sat at the
       left edge and "current is centred" quietly stopped being true at the queue's ends. */
    +'#kr-tracks-strip{padding-inline:calc(50% - var(--kr-tcw,200px)/2);}'
    /* §12: FIVE VISIBLE, from measurement rather than taste. The track viewport is 1090 /
       930 / 674px at 1440 / 1280 / 1024, so the card that makes exactly five fit with a 12px
       gap is 208 / 176 / 125px. These are set a little under that, which leaves a sliver of
       the sixth card showing - five are fully visible AND the row still looks like something
       that scrolls, instead of ending suspiciously flush with the edge. */
    /* These once hard-set --kr-tcw, which made the card the ONE dimension the tuner could not
       ship: a literal on .kr-rail beats any :root fallback, so a new default was ignored at
       every width. The width to tune is --kr-tcw-base; the narrower desktops keep their
       measured proportions of it (196 -> 168 / 124 / 120 was .857 / .633 / .612). */
    +'@media(min-width:1360px){.kr-rail{--kr-tcw:var(--kr-tcw-base,200px);}}'
    +'@media(min-width:1200px) and (max-width:1359px){'
    +  '.kr-rail{--kr-tcw:calc(var(--kr-tcw-base,200px)*.857);}}'
    +'@media(min-width:1024px) and (max-width:1199px){'
    +  '.kr-rail{--kr-tcw:calc(var(--kr-tcw-base,200px)*.633);}}'
    +'@media(max-width:1023px){'
    +  '.kr-rail{--kr-tcw:calc(var(--kr-tcw-base,200px)*.612);}}'
    +'.kr-railbtn{flex:0 0 var(--kr-railbtn,25px);width:var(--kr-railbtn,25px);height:var(--kr-railbtn,25px);border-radius:50%;background:rgba(0,255,136,.10);'
    +  'border:1px solid var(--kra-line);color:var(--kra);cursor:pointer;line-height:1;}'
    +'.kr-railbtn:hover:not([disabled]){background:rgba(0,255,136,.24);border-color:var(--kra);}'
    /* A rail arrow with nothing to scroll is a control that does nothing. With three real
       stations the row does not overflow, so rather than leave two live-looking buttons
       that silently no-op, they are genuinely disabled and dimmed until there IS overflow.
       They stay in the layout because they are also the signal that the row CAN hold more. */
    +'.kr-railbtn[disabled]{opacity:.32;cursor:default;}'
    +'.kr-railbtn:focus-visible{outline:2px solid var(--kra);outline-offset:2px;}'
    /* NO scroll-behavior:smooth HERE. With it, assigning scrollLeft starts an animation, so
       reading the property straight back returns a mid-flight value - centring measured a
       delta against a position it had already asked to leave and compounded the error, which
       is how the current card ended up 2423px off. Centring is therefore instant, and the
       rail buttons ask for smooth explicitly when a human presses them. */
    +'.kr-scroll{flex:1 1 auto;min-width:0;overflow-x:auto;overflow-y:hidden;'
    +  'scrollbar-width:none;}'
    +'.kr-scroll::-webkit-scrollbar{display:none;}'
    +'.kr-strip{display:flex;align-items:flex-end;gap:var(--kr-strip-gap,10px);padding:2px 0 4px;}'
    /* ══ THE FIRST AND LAST TRACK MUST BE ABLE TO REACH THE CENTRE ═══════════════════
       Without this the carousel can only centre cards that have half a viewport of
       neighbours on both sides: centring track 1 asks for a negative scrollLeft, the browser
       clamps it to 0, and the "always centred" card sits 95px off. Half a viewport of
       padding at each end - percentage padding resolves against the scroller's width - gives
       every card, including the first and the last, somewhere to be centred from. */
    +'#kr-tracks-strip{padding-left:calc(50% - 54px);padding-right:calc(50% - 54px);}'
    /* ── TRACK CARDS: FULL 2:3 PORTRAIT, NEVER CROPPED TO SQUARE (brief 27) ─────────── */
    +'.kr-tc{flex:0 0 var(--kr-tcw,200px);width:var(--kr-tcw,200px);background:none;border:0;padding:0;cursor:default;'
    +  'text-align:left;opacity:.66;transition:opacity .18s,transform .18s;}'
    +'.kr-tc.on{opacity:1;}'
    /* §13: SQUARE. This was 108x162 - a station's portrait shape applied to a song, so
       every track's square SoundCloud artwork lost a third of itself to the crop. The shape
       is declared with aspect-ratio rather than by repeating the width variable as a height:
       a percentage height would resolve against the PARENT's height and silently stop being
       square, which is the trap that makes "it looked fine at one width" a bad proof. */
    +'.kr-tcart{width:100%;aspect-ratio:1/1;height:auto;border-radius:var(--kr-art-radius,5px);object-fit:cover;display:block;'
    +  'background:#15131f;border:1px solid rgba(255,255,255,.07);}'
    +'.kr-tc.on .kr-tcart{border-color:var(--kra);box-shadow:0 0 0 1px var(--kra),'
    +  '0 0 22px var(--kra-glow);}'
    +'.kr-tct,.kr-tcp{display:block;max-width:100%;white-space:nowrap;overflow:hidden;'
    +  'text-overflow:ellipsis;}'
    +'.kr-tct{margin-top:var(--kr-tct-mt,5px);font-size:var(--kr-tct-size,1rem);font-weight:700;color:#efeaff;}'
    +'.kr-tcp{font-size:var(--kr-tcp-size,1rem);font-weight:700;letter-spacing:.08em;text-transform:uppercase;'
    +  'color:var(--kra-txt);}'
    +'.kr-tc.on .kr-tct{font-weight:800;color:#fff;}'
    +'.kr-tcnow{display:inline-flex;align-items:center;gap:5px;margin-top:4px;font-size:var(--kr-tcnow-size,0.5rem);'
    +  'font-weight:900;letter-spacing:.16em;color:var(--krg);text-transform:uppercase;}'
    /* ── STATION ROW + THE LOCKED CREATE TILE (brief 30-33) ─────────────────────────── */
    +'.kr-strow{display:flex;align-items:stretch;gap:var(--kr-st-gap,10px);min-width:0;}'
    /* The station scroller HUGS ITS CONTENT instead of filling the row. There are three real
       stations, and a full-width scroller left a ~500px void between the last one and the
       CREATE tile. flex:0 1 auto still lets it shrink and scroll once there are enough
       stations to overflow - it just stops reserving space for stations that do not exist.
       Scoped to the station row: the track row must stay full-width, because that is what
       the current card is centred within. */
    +'.kr-strow .kr-scroll{flex:0 1 auto;}'
    /* The tile is a SIBLING of the scroller, not a child, which is what actually keeps it
       fixed while the stations move: a sticky child still lives in the scrolled box and
       drifts under a rubber-band scroll. */
    +'.kr-createtile{flex:0 0 116px;width:116px;display:flex;flex-direction:column;'
    +  'align-items:center;justify-content:center;gap:6px;background:rgba(0,255,136,.07);'
    +  'border:1px dashed var(--kra);border-radius:12px;color:var(--kra);cursor:pointer;'
    +  'font:900 .56rem/1.1 \'Space Grotesk\',Inter,sans-serif;letter-spacing:.14em;'
    +  'text-transform:uppercase;transition:background .18s,box-shadow .18s;}'
    +'.kr-createtile:hover{background:rgba(0,255,136,.18);box-shadow:0 0 18px var(--kra-glow);}'
    +'.kr-createtile:focus-visible{outline:2px solid var(--kra);outline-offset:2px;}'
    +'.kr-createtile i{font-size:1.2rem;font-style:normal;line-height:1;}'
    +'.kr-createtile[aria-expanded="true"]{background:rgba(0,255,136,.22);border-style:solid;}'
    /* ── THE CREATE FLOW HOST: THE RADIO GROWS UPWARD IN PLACE (brief 34/41) ────────── */
    +'.kr-createhost{display:none;border-top:1px solid var(--kra-line);padding-top:14px;}'
    +'.kr-createhost.on{display:block;}' 
    +'.kr-sec h4{margin:0 0 8px;font-size:.5rem;font-weight:900;letter-spacing:.2em;color:#7a8699;text-transform:uppercase;}'
    /* nowrap: this strip lives inside a horizontal scroller, and wrapping made it a grid
       that grew DOWNWARD instead of scrolling sideways - which is also what made the rail
       arrows look inert, because there was never any horizontal overflow to move. */
    +'.kr-stations{display:flex;flex-wrap:nowrap;gap:var(--kr-st-gap,10px);}'
    /* Station cards are one consistent size across the row and lead with real artwork
       (brief 31/32) - the old text-only pill ignored the station art that config carries. */
    +'.kr-st{flex:0 0 var(--kr-stw,150px);width:var(--kr-stw,150px);display:flex;flex-direction:column;align-items:stretch;'
    +  'gap:0;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.10);'
    +  'border-radius:12px;padding:0;overflow:hidden;color:#cfe9ff;cursor:pointer;'
    +  'transition:border-color .18s,box-shadow .18s;}'
    /* §18: THE WHOLE 2:3 IS VISIBLE. The box was 116x78 - landscape - so cover-cropping a
       portrait cover threw away its top and bottom, which is exactly the artwork the
       submitter framed. A 2:3 box means cover and contain agree for a 2:3 source: nothing
       is cut and nothing is stretched. */
    +'.kr-st img{width:100%;aspect-ratio:2/3;height:auto;object-fit:cover;display:block;'
    +  'background:#0e1a14;}'
    +'.kr-st>span{padding:var(--kr-stname-pady,3px) var(--kr-stname-padx,0px);'
    +  'font:900 var(--kr-stname-size,0.8rem)/1.15 \'Space Grotesk\',Inter,sans-serif;'
    +  'letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;overflow:hidden;'
    +  'text-overflow:ellipsis;}'
    +'.kr-st-noart{width:100%;height:78px;display:block;background:linear-gradient(135deg,'
    +  'rgba(0,255,136,.28),rgba(20,16,32,.9));}'
    /* The 26x26 icon rule that used to sit here belonged to the old text pill and, being
       later in the sheet, silently overrode the full-width station artwork above it - the
       cards rendered with a thumbnail in the corner instead of a cover image. */
    +'.kr-st:hover{border-color:rgba(54,226,255,.5);}'
    +'.kr-st.on{border-color:var(--kra);color:#fff;box-shadow:0 0 12px var(--kra-glow);}'
    +'.kr-st:focus-visible{outline:2px solid var(--kra);outline-offset:1px;}'
    +'.kr-empty{color:#7a8699;font-size:.6rem;margin:0;}'
    /* mobile: prioritise artwork, station, play, mute, gateway - not a squeezed desktop bar */
    +'@media(max-width:640px){'
    +  '#kr-live .kil-brand-radio{font-size:.44rem;}'
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
      '<div id="kil-mini-dot">♬</div>'+
      /* ══ LIVE RADIO: THE GREEN ANCHOR AND THE GATEWAY (KODE 2026-09-09/17) ═══════════
         The one branded control for the whole experience. Clicking it opens the expanded
         radio - it does not play, pause or change station.
         The ▴ indicator that used to sit inside it is GONE (brief 15): the entire bar
         is clickable, so a dedicated expand affordance was a control that duplicated the
         surface it sat on. */
      '<button type="button" class="krb krb-brand" id="kr-live" aria-expanded="false" aria-label="Open KEEPITIL Radio">'+
        /* §4: the status dot and the logo are BOTH gone, and the label is one row.
           The dot asserted "live" from a play-state flag beside a permanently-live
           broadcast, so it carried no information the words did not. The logo repeated an
           identification the site header already makes. What is left is the label, at a size
           that uses the 54px bar. The #kil-led element is gone with it; every reference to
           it is an `if(led)` guard, so they simply stop firing. */
        '<span class="kil-brand-radio">LIVE RADIO</span>'+
      '</button>'+
      /* ══ THREE REAL TRACKS, CURRENT DEAD-CENTRE (brief 7-12) ═════════════════════════
         PREVIOUS | ‹ | CURRENT | › | NEXT. Every one of the three is a real track read
         from the live SoundCloud queue - there is no example content here, and the side
         previews are empty rather than invented when the queue genuinely has no neighbour.

         The current card deliberately keeps the ids #kr-art, #kil-track and #kr-nowpl. They
         are what the drawer, the EARN radio row and kilPaintTitles() already paint into, so
         reusing them means this rebuild has ONE now-playing source of truth instead of a
         second one that could disagree with the first.

         The station stepper (‹ NAME ›) that used to sit left of here is REMOVED: the brief
         allows exactly two primary transport controls in the centre and no playlist
         steppers. Station switching lives in the expanded radio's station carousel. */
      '<div class="krb-tracks" id="kr-tracks">'+
        '<div class="kr-tk kr-tk-side kr-tk-prev" id="kr-tk-prev" aria-hidden="true">'+
          '<img class="kr-tkart" id="kr-art-prev" alt=""/>'+
          '<span class="kr-tkmeta">'+
            '<span class="kr-tkt" id="kr-t-prev"></span>'+
            '<span class="kr-tkp" id="kr-p-prev"></span>'+
          '</span>'+
        '</div>'+
        '<button type="button" class="kr-nav" id="kr-prev" aria-label="Previous track" title="Previous track">‹</button>'+
        '<div class="kr-tk kr-tk-cur" id="kr-tk-cur">'+
          '<img class="kr-tkart" id="kr-art" alt="" aria-hidden="true"/>'+
          '<span class="kr-tkmeta">'+
            '<span class="kr-tkt" id="kil-track">Loading…</span>'+
            '<span class="kr-tkp" id="kr-nowpl"></span>'+
          '</span>'+
        '</div>'+
        '<button type="button" class="kr-nav" id="kr-next" aria-label="Next track" title="Next track">›</button>'+
        '<div class="kr-tk kr-tk-side kr-tk-next" id="kr-tk-next" aria-hidden="true">'+
          '<img class="kr-tkart" id="kr-art-next" alt=""/>'+
          '<span class="kr-tkmeta">'+
            '<span class="kr-tkt" id="kr-t-next"></span>'+
            '<span class="kr-tkp" id="kr-p-next"></span>'+
          '</span>'+
        '</div>'+
        /* An ACTIVITY indicator, not a spectrum. It is driven by the play state, so it can
           never imply sound that is not happening, and it is not described as FFT data
           because it is not. Stopped entirely under prefers-reduced-motion. */
        '<span class="kr-wave" id="kr-wave" aria-hidden="true">'+
          new Array(22).join('<i></i>')+'<i></i></span>'+
      '</div>'+
      /* NO PLAY/PAUSE (brief 6). KEEPITIL Radio is a 24/7 broadcast. The stream mounts on
         the visitor's first gesture, which is the earliest a browser permits sound. */
      /* ══ UTILITIES, IN THE ONE APPROVED ORDER (brief 15) ═════════════════════════════
         SHUFFLE → REPEAT → VOLUME → CHAT. Chat is the right-most control. */
      '<div class="kr-ctrls">'+
        '<button type="button" class="kr-util" id="kr-shuffle" aria-pressed="false" aria-label="Shuffle" title="Shuffle">⇄</button>'+
        '<button type="button" class="kr-util" id="kr-repeat" aria-pressed="false" aria-label="Repeat" title="Repeat">↺</button>'+
        '<span class="kr-volwrap">'+
          '<button type="button" class="kr-util" id="kr-mute" aria-label="Mute" title="Mute / volume"></button>'+
          /* The slider RISES from the bar rather than sitting in it (brief 19). In the bar it
             consumed 108px of the width the three track previews now need, and a horizontal
             slider in a 54px strip cannot show its level at a glance. */
          '<span class="kr-volpop" id="kr-volpop" hidden>'+
            '<input class="kr-vol" id="kr-vol" type="range" min="0" max="100" step="1" '+
              'orient="vertical" aria-label="Radio volume" title="Volume"/>'+
            '<span class="kr-volnum" id="kr-volnum" aria-hidden="true"></span>'+
          '</span>'+
        '</span>'+
        '<button type="button" class="kr-util" id="kr-chat" aria-label="Open chat" title="Open chat"></button>'+
      '</div>'+
      '';
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
  /* ══ ICONS ARE INLINE SVG, NOT EMOJI (KODE 2026-09-17) ═════════════════════════════
     Volume and chat shipped as 🔊 and 💬, and the platform renders those as
     full-colour emoji: a grey 3D loudspeaker and a white speech bubble sitting beside two
     clean purple glyphs. Emoji cannot take a colour, so no CSS could bring them into the
     palette - the icon had to stop being text. These use currentColor, so they inherit the
     same accent token as every other utility and the mute state is a real icon change
     rather than a different picture. The width/height attributes here are a floor; the
     desktop bar overrides them in CSS so one number controls the on-screen size. */
  var SVG_VOL  = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" '
    + 'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M4 9.5h3L11 6v12l-4-3.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/>'
    + '<path d="M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
  var SVG_MUTE = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" '
    + 'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M4 9.5h3L11 6v12l-4-3.5H4z"/><path d="M16 9.5l5 5"/><path d="M21 9.5l-5 5"/></svg>';
  var SVG_CHAT = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" '
    + 'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M20 12a7 7 0 0 1-7 7H8l-4 3v-4.5A7 7 0 0 1 8 5h5a7 7 0 0 1 7 7z"/>'
    + '<circle cx="9.5" cy="12" r="1"/><circle cx="13" cy="12" r="1"/>'
    + '<circle cx="16.5" cy="12" r="1"/></svg>';
  /* ONE place decides what the speaker looks like, so the icon and the state cannot drift. */
  function paintMuteIcon(){
    if(!muteBtn) return;
    muteBtn.innerHTML = muted ? SVG_MUTE : SVG_VOL;
  }

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
  /* 25% is the FIRST-VISIT level only (brief 18). Once the listener sets a level it is
     theirs and is restored from krs/sessionStorage; this constant is never re-applied over
     a choice they made. */
  var DEFAULT_VOL=25;
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
    if(muted && muteBtn) paintMuteIcon();
  })();
  var SYNC_EPOCH=1735689600000; // 2026-01-01 00:00 UTC — fallback only
  var currentTrackIdx=0,currentPosition=0; // kept fresh for beforeunload handoff

  /* ══ ONE CANONICAL CURRENT-TRACK STATE (Founder 2026-09-23) ════════════════════════════
     The collapsed bar and the expanded carousel are two VIEWS of one player, and they used
     to decide "what is playing" independently: kilPaintTitles() did its own
     getSounds()+getCurrentSoundIndex(), and paintTrackCarousel() did a second pair of async
     reads of its own. Two independent reads at two different moments is exactly how the two
     views came to disagree — observed 2026-09-22 as compact "Certified" against expanded
     "Main Character Mood" on the same player.
     KIL_NOW is now the single snapshot. It is refreshed in exactly ONE place
     (kilRefreshNow) and BOTH views render from it, so a mismatch is not merely unlikely:
     there is no second source left that could disagree.
     It also decouples the drawer from SoundCloud's PLAY event — opening the drawer renders
     the carousel straight from the snapshot the bar is already showing, which is what makes
     this correct when autoplay is blocked, when audio is paused, and under headless testing,
     none of which emit another PLAY. */
  var KIL_NOW = null;   /* {list, idx, playlist} — written ONLY by kilRefreshNow */
  function kilRefreshNow(cb){
    if(!widget || !widgetReady){ if(cb) cb(null); return; }
    widget.getSounds(function(list){
      if(!list || !list.length){ KIL_NOW=null; if(cb) cb(null); return; }
      widget.getCurrentSoundIndex(function(i){
        KIL_NOW = { list:list, idx:i, playlist:kilPlName(0) };
        if(cb) cb(KIL_NOW);
      });
    });
  }
  window.__kilNow = function(){ return KIL_NOW; };   /* read-only, for tests */

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
    /* ── THE BAR NO LONGER NAVIGATES (Founder 2026-09-23) ──────────────────────────────
       This listener existed only to send the visitor to /earn/ when they clicked the bar,
       which took them off whatever page they were reading just because they touched the
       player. It is gone rather than repointed.
       ⚠ DO NOT ADD A DRAWER TOGGLE HERE. One already exists further down (search
       INTERACTIVE / "bar.addEventListener") and it is the one that should own this: it
       excludes every interactive control by selector and guards e.target instanceof Element
       for synthetic events. Adding a second toggle here makes the bar open the drawer and
       then immediately close it in the same click — measured as the transition sequence
       ["drawer","compact"] from one click — and the bar looks dead. */
  }

  /* ── SHUTTLE CONTROLS ──────────────────────────────────────────────────────────────────
     Song arrows drive the SoundCloud widget. Playlist arrows swap the iframe src, because a
     widget is bound to one playlist for its lifetime — there is no API to repoint it. */
  function kilPlName(offset){
    if(!KIL_PL.length) return '';
    var p = KIL_PL[(KIL_PL_I + offset + KIL_PL.length) % KIL_PL.length];
    return (p && p.name) ? p.name : '';
  }
  /* The neighbouring-PLAYLIST labels this used to paint went with the station stepper that
     was removed from the compact bar on 2026-09-17. The function itself stays because the
     wrapper just below it repaints the station carousel and now-playing, and both the config
     load and the station change call it. */
  function kilPaintPlaylistNames(){ /* nothing of its own left to paint */ }
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
      /* ALREADY ON THIS STATION: DO NOTHING (brief 46). This used to skip(0) and play, so
         tapping the station you are already listening to restarted the track you were in
         the middle of - a destructive answer to a click that means "yes, this one". The
         selected state is already correct, so there is nothing to change. */
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

  /* ── ARTWORK ────────────────────────────────────────────────────────────────────────
     SoundCloud serves a small square thumbnail by default (t67x67). The radio cards are
     2:3 portrait, so the LARGEST available crop is requested and the card does the framing
     with object-fit:cover. Upscaling a 67px thumbnail into a 39px-tall portrait card is
     what made the old square art look soft. */
  function kilArt(sound){
    var u = sound && sound.artwork_url;
    if(!u) return '';
    return String(u).replace(/-(t67x67|large|t120x120|badge|small|tiny|mini)\./, '-t500x500.');
  }

  /* ── THE THREE PREVIEWS ARE REAL, OR THEY ARE EMPTY ─────────────────────────────────
     Painted from the live queue the player is actually holding: list[i-1], list[i],
     list[i+1]. Nothing here is example content, and a missing neighbour renders blank
     rather than borrowing another track's details.

     CROSSING A PLAYLIST BOUNDARY (brief 11/29)
     When the current track is the last in the station, the next thing that will actually
     play is the FIRST track of the next station - the FINISH handler advances the station.
     We cannot know that track's title: the widget only exposes the queue it currently
     holds, and reading another playlist's contents needs the SoundCloud HTTP API and a
     client_id this page does not have. So the preview shows the next STATION, by its real
     name and real artwork, labelled as a station rather than dressed up as a song. The
     preview is never empty at a boundary, and it never invents a track title. */
  function kilPaintTrack(which, sound, playlistName, isStation){
    var a=document.getElementById('kr-art-'+which),
        t=document.getElementById('kr-t-'+which),
        pl=document.getElementById('kr-p-'+which),
        card=document.getElementById('kr-tk-'+which);
    if(!t||!pl) return;
    if(!sound){
      t.textContent=''; pl.textContent='';
      if(a){ a.removeAttribute('src'); a.style.visibility='hidden'; }
      if(card) card.style.visibility='hidden';
      return;
    }
    /* EXPLICIT 'visible', not ''. The stylesheet default for a side preview is
       visibility:hidden so an unpainted card never shows as an empty bordered box - which
       means clearing the inline value here restored the DEFAULT (hidden) rather than
       revealing the card. The titles painted and the cards stayed invisible. */
    if(card) card.style.visibility='visible';
    t.textContent  = sound.title || '';
    pl.textContent = isStation ? 'NEXT STATION' : (playlistName || '');
    var art = isStation ? (sound.art || '') : kilArt(sound);
    if(a){
      if(art){ a.src=art; a.style.visibility=''; }
      else { a.removeAttribute('src'); a.style.visibility='hidden'; }
    }
  }

  function kilPaintTitles(){
    if(!widget || !widgetReady) return;
    /* Refresh the ONE snapshot, then paint every view from it in the same pass. */
    kilRefreshNow(function(now){
      if(!now) return;
      (function(list, i){
        var here = now.playlist;
        var cur  = list[i];
        var t    = (cur && cur.title) ? cur.title : '';

        /* CURRENT - keeps the long-standing ids so the drawer, the EARN row and anything
           else reading now-playing have exactly one source. */
        var nowEl=document.getElementById('kil-track');
        var plEl =document.getElementById('kr-nowpl');
        var artEl=document.getElementById('kr-art');
        if(nowEl) nowEl.textContent = t || here;
        if(plEl)  plEl.textContent  = here || t;
        if(artEl){
          var ca=kilArt(cur);
          if(ca){ artEl.src=ca; artEl.style.visibility=''; }
          else { artEl.removeAttribute('src'); artEl.style.visibility='hidden'; }
        }

        /* PREVIOUS - the track actually behind us in this queue. At index 0 there is no
           previous track in the queue and we cannot read the previous station's last
           track, so it renders empty rather than guessing. */
        kilPaintTrack('prev', (i>0 ? list[i-1] : null), here, false);

        /* NEXT - the next track, or the next station at the boundary. */
        if(i < list.length-1){
          kilPaintTrack('next', list[i+1], here, false);
        } else {
          var nx = (KIL_PL.length>1) ? KIL_PL[(KIL_PL_I+1)%KIL_PL.length] : null;
          kilPaintTrack('next', nx ? {title:String(nx.name||'Next station'), art:nx.art} : null, '', true);
        }

        /* One broadcast, the same values the bar just painted. The second argument used to
           read `n.title`, and `n` was never declared - it went with the neighbouring-track
           labels that were deleted on 2026-09-10 but the reference stayed. That threw a
           ReferenceError inside this callback on every repaint, so kilBroadcast never ran
           and every surface listening for kil-radio-state (the EARN radio row and its
           carousel) was left on whatever it had first rendered. */
        var nextTitle = (i < list.length-1 && list[i+1] && list[i+1].title) ? list[i+1].title : '';
        kilBroadcast(t, nextTitle);

        /* ── THE TWO VIEWS MIRROR EACH OTHER (Founder 2026-09-23) ────────────────────────
           paintTrackCarousel() was called from exactly ONE place - setRadioUI(), i.e. only
           when the drawer OPENS. Changing track while the drawer was already open repainted
           the compact bar and left the expanded carousel showing whatever it had, so the two
           drifted apart until the drawer was closed and reopened.
           kilPaintTitles() is the single repaint every track change already runs through, so
           driving the carousel from here keeps ONE source of truth instead of adding a second.
           Guarded on the drawer being open: repainting a hidden carousel is wasted work on
           every track change. */
        /* The expanded view repaints from the SAME snapshot, in the same pass. */
        try{ if(RADIO_UI==='drawer') paintTrackCarousel(); }catch(e){}
      })(now.list, now.idx);
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
        if(h.muted){muted=true;paintMuteIcon();if(volEl)volEl.hidden=false;}
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
        if(muted && muteBtn) paintMuteIcon();
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
      /* PAINT AT READY, NOT ONLY AT PLAY (KODE 2026-09-17).
         kilPaintTitles() used to run only from the PLAY handler, so the queue was known -
         READY has already delivered it - while the bar still read "Loading…" and both side
         previews sat empty. Any visitor who had not yet started audio, which on a first
         visit is every visitor, saw a bar that looked broken. READY is the moment the track
         list exists, so it is the moment the three previews can be truthful. */
      try{ kilPaintTitles(); }catch(e){}
      syncAndPlay();
      try{ if(muted){ widget.setVolume(0); if(muteBtn){paintMuteIcon();muteBtn.setAttribute('aria-pressed','true');} } }catch(e){}
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
          /* REPEAT means repeat THIS track: replay the one that just finished. Checked
             first, because it is the only mode that does not advance. */
          if(REPEAT){ widget.skip(i); widget.play(); return; }
          /* SHUFFLE picks a real different index from the queue rather than stepping. */
          if(SHUFFLE){ shuffleNext(); return; }
          if(i >= s.length-1){ kilLoadPlaylist(1); }   /* end of this playlist -> next station */
          else { widget.skip(i+1); widget.play(); }
          setTimeout(function(){ try{ kilPaintTitles(); }catch(e){} }, 500);
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
         /* Same as the bar (§4): no status dot, no repeated logo. The dot here was not even
            wired to play state - it was a bare .kil-live with no .off class, so it blinked
            green permanently and would have said "live" through a stopped stream. */
         +   '<span class="kr-hdr-l">'
         +     '<span class="kr-hdr-t">LIVE RADIO</span>'
         +   '</span>'
         +   '<span class="kr-hdr-r"><span class="kr-hdr-hint" id="kr-hint-'+idSuffix+'"></span>'
         +   '<span class="kr-hdr-ic" aria-hidden="true">▴</span></span>'
         + '</button>';
  }
  /* One loader, one promise: pressing + CREATE twice quickly must not fetch the script
     twice or mount two forms. */
  var _createFlowP=null;
  function krLoadCreateFlow(){
    if(window.KIL_PLAYLIST_SUBMIT) return Promise.resolve();
    if(_createFlowP) return _createFlowP;
    _createFlowP=new Promise(function(res,rej){
      var sc=document.createElement('script');
      sc.src='/assets/js/keepitil-playlist-submit.js?v=20260918a';
      sc.onload=function(){ window.KIL_PLAYLIST_SUBMIT ? res() : rej(new Error('loaded but absent')); };
      sc.onerror=function(){ _createFlowP=null; rej(new Error('script failed')); };
      document.head.appendChild(sc);
    });
    return _createFlowP;
  }

  function _buildDrawer(){
    if(drawerEl) return drawerEl;
    drawerEl=document.createElement('div');
    drawerEl.id='kr-drawer'; drawerEl.className='kr-panel'; drawerEl.setAttribute('role','dialog');
    drawerEl.setAttribute('aria-label','KEEPITIL Radio');
    /* ══ TWO COLUMNS: RADIO | CHAT (brief 21-25) ══════════════════════════════════════
       Left column = two horizontal rows and nothing else: the track carousel, then the
       station carousel. Right column = chat, compact by default.
       Everything rendered here is real: the tracks come from the queue the player holds and
       the stations come from the same KIL_PL array the engine switches between, so a
       station can never be offered that the player cannot actually play. There is no
       schedule, no listener count and no "up next" beyond what the data supports. */
    drawerEl.innerHTML=_hdr('d')
      +'<div class="kr-two">'
      +  '<div class="kr-main">'
      /* ROW 1 - tracks, current always centred */
      +    '<div>'
      +      '<div class="kr-rowhead"><h4>NOW PLAYING</h4></div>'
      /* §15: EXACTLY TWO track controls, and they sit against the current card rather than
         at the ends of the row. There used to be a pair here AND a pair at the outer edges,
         which is four controls for two actions - and the outer pair scrolled the strip while
         the inner pair changed track, so two identical-looking arrows did different things.
         These change track; the strip re-centres itself on the new current card. */
      +      '<div class="kr-rail">'
      +        '<div class="kr-scroll" id="kr-tracks-scroll" tabindex="0" role="group" aria-label="Track queue">'
      +          '<div class="kr-strip" id="kr-tracks-strip"></div>'
      +        '</div>'
      +        '<button type="button" class="kr-npnav kr-npnav-l" id="kr-np-prev" '
      +          'aria-label="Previous track" title="Previous track">‹</button>'
      +        '<button type="button" class="kr-npnav kr-npnav-r" id="kr-np-next" '
      +          'aria-label="Next track" title="Next track">›</button>'
      +      '</div>'
      +    '</div>'
      /* ROW 2 - stations, with the CREATE tile locked outside the scroller */
      +    '<div>'
      +      '<div class="kr-rowhead"><h4>STATIONS</h4></div>'
      +      '<div class="kr-strow">'
      +        '<button type="button" class="kr-railbtn" id="kr-st-l" aria-label="Scroll stations left">‹</button>'
      +        '<div class="kr-scroll" id="kr-stations-scroll" tabindex="0" role="group" aria-label="Stations">'
      +          '<div class="kr-strip kr-stations" id="kr-stations-d"></div>'
      +        '</div>'
      +        '<button type="button" class="kr-railbtn" id="kr-st-r" aria-label="Scroll stations right">›</button>'
      +        '<button type="button" class="kr-createtile" id="kr-create" aria-expanded="false" '
      +          'aria-label="Create a playlist and earn"><i>+</i><span>Create</span></button>'
      +      '</div>'
      +    '</div>'
      /* The Create flow mounts HERE - in place, on this page (brief 34/41) */
      +    '<div class="kr-createhost" id="kr-createhost"></div>'
      +  '</div>'
      +  '<div class="kr-chatcol" id="kr-chatcol">'
      +    '<div class="kr-chathdr"><b>KEEPITIL AI</b><span class="kr-sp">'
      +      '<button type="button" class="kr-util" id="kr-chat-wide" aria-label="Expand chat" title="Expand chat">⤡</button>'
      +      '<button type="button" class="kr-util" id="kr-chat-hide" aria-label="Collapse chat" title="Collapse chat">×</button>'
      +    '</span></div>'
      +    '<div class="kr-chatbody" id="kr-chatbody"></div>'
      +  '</div>'
      +'</div>';
    document.body.appendChild(drawerEl);
    document.getElementById('kr-hdr-d').addEventListener('click',function(e){ e.stopPropagation(); setRadioUI('compact'); });
    document.getElementById('kr-hint-d').textContent='CLOSE';
    /* Same transport function as the bar's pair - see krNavTrack. */
    (function(){
      var a=document.getElementById('kr-np-prev'), b=document.getElementById('kr-np-next');
      if(a) a.addEventListener('click', krNavTrack(-1));
      if(b) b.addEventListener('click', krNavTrack(1));
    }());

    /* Rail buttons scroll by roughly one card, which is what makes them feel like paging
       rather than nudging. */
    function rail(btnId, scrollId, by){
      var b=document.getElementById(btnId), sc=document.getElementById(scrollId);
      if(b&&sc) b.addEventListener('click',function(e){
        e.stopPropagation();
        /* Smooth is requested per-gesture rather than set on the element, so it applies to a
           human pressing the rail and never to the centring maths. */
        try{ sc.scrollTo({left:sc.scrollLeft+by, behavior:'smooth'}); }
        catch(_e){ sc.scrollLeft += by; }
      });
    }
    /* The track strip no longer has rail buttons: its two controls change TRACK, and the
       strip re-centres itself. rail() stays for the station row, which does scroll. */
    rail('kr-st-l','kr-stations-scroll',-260); rail('kr-st-r','kr-stations-scroll',260);

    /* CHAT COLUMN WIDTH (brief 24) - compact, ~half, or collapsed, and back again. */
    var wide=document.getElementById('kr-chat-wide'), hide=document.getElementById('kr-chat-hide');
    if(wide) wide.addEventListener('click',function(e){
      e.stopPropagation();
      drawerEl.classList.remove('kr-chat-off');
      var on=drawerEl.classList.toggle('kr-chat-wide');
      wide.setAttribute('aria-label', on?'Shrink chat':'Expand chat');
    });
    if(hide) hide.addEventListener('click',function(e){
      e.stopPropagation();
      drawerEl.classList.remove('kr-chat-wide');
      var off=drawerEl.classList.toggle('kr-chat-off');
      hide.setAttribute('aria-label', off?'Show chat':'Collapse chat');
    });

    /* + CREATE opens IN PLACE (brief 34). No navigation, no /earn/playlist redirect, and
       the audio is not touched - the panel simply gets taller and the form appears. */
    var ct=document.getElementById('kr-create');
    if(ct) ct.addEventListener('click',function(e){
      e.stopPropagation();
      var host=document.getElementById('kr-createhost');
      var open=!host.classList.contains('on');
      host.classList.toggle('on', open);
      ct.setAttribute('aria-expanded', open?'true':'false');
      if(open){
        /* LAZY-LOADED ON DEMAND. The shared component is a separate file so EARN and the
           radio provably run the same code; loading it on every page that carries the radio
           would ship a form almost nobody opens. It is fetched the first time + CREATE is
           pressed and cached by the browser thereafter. */
        krLoadCreateFlow().then(function(){
          window.KIL_PLAYLIST_SUBMIT.mount(host, {context:'radio'});
          try{ host.scrollIntoView({block:'nearest'}); }catch(_e){}
        }).catch(function(){
          /* Never an indefinite blank or a silent nothing: say what failed and offer the
             other way in. */
          host.innerHTML='<p class="kr-chatnote">The playlist form could not be loaded. '
            +'Check your connection, or <a href="/earn/#playlists" style="color:var(--kra)">'
            +'open it on EARN</a>.</p>';
        });
        host.innerHTML='<p class="kr-chatnote">Loading the playlist form\u2026</p>';
      }
    });
    return drawerEl;
  }

  /* ── THE CHAT COLUMN BORROWS THE ONE CHAT, IT DOES NOT BUILD A SECOND ────────────────
     The same rule as the audio engine: one conversation. #kilo-msgs and the composer are
     MOVED into the column while the drawer is open and moved back when it closes, so the
     history, the auth gating and every listener are the originals. Rendering a second chat
     here would have given the visitor two threads that disagree. */
  var _chatHome=null;
  function chatBorrow(){
    var col=document.getElementById('kr-chatbody'); if(!col) return;
    var msgs=document.getElementById('kilo-msgs'), row=document.getElementById('kilo-input-row');
    if(!msgs){
      col.innerHTML='<p class="kr-chatnote">Chat is not available on this page.</p>';
      return;
    }
    if(!_chatHome) _chatHome={parent:msgs.parentNode, next:msgs.nextSibling, rowNext:row?row.nextSibling:null};
    /* Any note from a previous open is dropped before the real chat is moved back in. */
    var old=col.querySelector('.kr-chatnote'); if(old) old.remove();
    col.appendChild(msgs);
    if(row) col.appendChild(row);
    if(typeof window.__kiloApplyAuthRows==='function'){ try{ window.__kiloApplyAuthRows(); }catch(e){} }
    /* CHAT IS ACCOUNT-ONLY, and signed out there is no thread and no composer - so the
       column rendered as an empty box with a heading, which reads as broken rather than as
       gated. Say which it is, and offer the way in. */
    var signedIn=(function(){
      try{
        for(var i=0;i<localStorage.length;i++){
          var k=localStorage.key(i);
          if(k && k.indexOf('-auth-token')>-1){
            var j=JSON.parse(localStorage.getItem(k)||'null');
            if(j && j.access_token) return true;
          }
        }
      }catch(e){}
      return false;
    })();
    if(!signedIn && !msgs.hasChildNodes()){
      var note=document.createElement('p');
      note.className='kr-chatnote';
      /* ⚠ THIS COPY MUST MATCH WHAT SIGNED-OUT CHAT ACTUALLY DOES (Founder 2026-09-23).
         It read "KEEPITIL AI is part of your account. Sign in to talk to it", which became
         untrue the moment the signed-out subject boundary shipped: an anonymous visitor can
         now ask about KEEPITIL and get an answer, so the drawer was sending them to sign in
         for something already available. Caught on a production screenshot, not in review.
         If the boundary changes again, change this with it. */
      note.innerHTML='Ask CHO about KEEPITIL \u2014 events, artists, Culture and Radio. '
        +'<a href="/apply?next='+encodeURIComponent(location.pathname+location.search)
        +'" style="color:var(--kra);font-weight:700">Sign in</a> for your own account, '
        +'submissions and earnings.';
      col.insertBefore(note, msgs);
    }
  }
  function chatReturn(){
    if(!_chatHome) return;
    var msgs=document.getElementById('kilo-msgs'), row=document.getElementById('kilo-input-row');
    try{
      if(msgs) _chatHome.parent.insertBefore(msgs, _chatHome.next);
      if(row)  _chatHome.parent.insertBefore(row, _chatHome.rowNext);
    }catch(e){}
  }

  /* ── ROW 1: THE TRACK CAROUSEL ──────────────────────────────────────────────────────
     A continuous sequence around the current track: played tracks to the left, upcoming to
     the right, current centred. Centring is done by scrolling the strip so the current
     card's centre meets the viewport's centre - measured from the rendered cards, not
     assumed from a card width, so it stays correct when a title wraps the layout. */
  function centreCurrentTrack(){
    var sc=document.getElementById('kr-tracks-scroll'); if(!sc) return;
    var on=sc.querySelector('.kr-tc.on'); if(!on) return;
    /* MEASURED FROM RENDERED POSITIONS, NOT offsetLeft. The first version used
       on.offsetLeft, which is relative to the nearest POSITIONED ancestor - and the strip
       is not positioned, so the value was measured against a box further up the tree. It
       put the current card 1951px off-centre. A rect delta cannot make that mistake: it
       asks where the card is versus where the centre is, right now, and moves by exactly
       the difference. */
    var a=sc.getBoundingClientRect(), b=on.getBoundingClientRect();
    var delta=(b.left + b.width/2) - (a.left + a.width/2);
    sc.scrollLeft = Math.max(0, sc.scrollLeft + delta);
  }
  /* Artwork arrives after the markup, and a loaded image changes the widths the centring was
     measured from - so it is re-run once the strip's images have settled, and on resize. */
  function centreCurrentTrackSoon(){
    centreCurrentTrack();
    var sc=document.getElementById('kr-tracks-scroll'); if(!sc) return;
    var imgs=sc.querySelectorAll('img');
    var left=imgs.length;
    if(!left){ return; }
    imgs.forEach(function(im){
      if(im.complete){ if(--left===0) centreCurrentTrack(); return; }
      im.addEventListener('load', function(){ if(--left===0) centreCurrentTrack(); }, {once:true});
      im.addEventListener('error', function(){ if(--left===0) centreCurrentTrack(); }, {once:true});
    });
  }
  window.addEventListener('resize', function(){
    if(RADIO_UI!=='compact') centreCurrentTrack();
  });
  /* Renders the carousel FROM A SNAPSHOT. Split out of paintTrackCarousel so identical
     markup is produced whether the drawer is opening (snapshot already in hand, painted
     synchronously) or a snapshot is being fetched for the first time. */
  function _renderCarousel(strip, now){
    (function(list, i){
        var here=now.playlist;
        var html=list.map(function(sn,k){
          var art=kilArt(sn);
          return '<div class="kr-tc'+(k===i?' on':'')+'"'+(k===i?' aria-current="true"':'')+'>'
            + (art ? '<img class="kr-tcart" src="'+art+'" alt=""/>' : '<span class="kr-tcart"></span>')
            + '<span class="kr-tct">'+String(sn && sn.title || '')+'</span>'
            + '<span class="kr-tcp">'+String(here||'')+'</span>'
            + (k===i ? '<span class="kr-tcnow"><i class="kil-live"></i>Live now</span>' : '')
            + '</div>';
        }).join('');
        /* CONTINUITY ACROSS THE BOUNDARY (brief 29): the queue genuinely ends here, and the
           next thing that plays is the next station's first track. Its title is not
           knowable from the widget, so the tail card names the STATION rather than
           inventing a song. The carousel never dead-ends. */
        if(KIL_PL.length>1){
          var nx=KIL_PL[(KIL_PL_I+1)%KIL_PL.length];
          html += '<div class="kr-tc">'
            + (nx.art ? '<img class="kr-tcart" src="'+nx.art+'" alt=""/>' : '<span class="kr-tcart"></span>')
            + '<span class="kr-tct">'+String(nx.name||'Next station')+'</span>'
            + '<span class="kr-tcp">Next station</span></div>';
        }
        strip.innerHTML=html;
        centreCurrentTrackSoon();
    })(now.list, now.idx);
  }
  function paintTrackCarousel(){
    var strip=document.getElementById('kr-tracks-strip'); if(!strip) return;
    /* ⚠ SNAPSHOT FIRST, SYNCHRONOUSLY. When the drawer opens, KIL_NOW already holds what the
       compact bar is showing, so the carousel paints from it immediately and the two views
       cannot differ at open. Going back to the widget here would reintroduce the second
       independent read that caused the mismatch, and would make the drawer depend on a PLAY
       event that never arrives when autoplay is blocked. */
    if(KIL_NOW){ _renderCarousel(strip, KIL_NOW); return; }
    if(!widget || !widgetReady){
      strip.innerHTML='<p class="kr-chatnote">The station is still connecting…</p>';
      return;
    }
    /* No snapshot yet (drawer opened before the first paint) — take one, which also populates
       KIL_NOW for the compact bar, so both still come from a single source. */
    kilRefreshNow(function(now){
      if(!now){ strip.innerHTML='<p class="kr-chatnote">This station reported no tracks.</p>'; return; }
      _renderCarousel(strip, now);
    });
  }
  window.__kilPaintTrackCarousel=paintTrackCarousel;

  /* _buildFull() and the whole expanded view were deleted 2026-09-09 - see setRadioUI.
     No stale constants, no orphan handlers, no CSS for a screen that no longer exists. */
  /* Station list is rendered from the SAME array the engine plays from, so a station can
     never be offered here that the player cannot actually switch to. */
  /* Recomputed from the rendered row, never assumed from the station count: a long station
     name can make three cards overflow where four short ones would not. */
  function syncStationArrows(){
    var sc=document.getElementById('kr-stations-scroll');
    var l=document.getElementById('kr-st-l'), r=document.getElementById('kr-st-r');
    if(!sc||!l||!r) return;
    var over = sc.scrollWidth > sc.clientWidth + 1;
    l.disabled = !over; r.disabled = !over;
  }
  window.addEventListener('resize', syncStationArrows);

  function paintStations(){
    ['kr-stations-d'].forEach(function(id){
      var host=document.getElementById(id); if(!host) return;
      var pls=KIL_PL||[];
      if(!pls.length){ host.innerHTML='<p class="kr-empty">Stations are loading\u2026</p>'; return; }
      host.innerHTML=pls.map(function(pl,i){
        return '<button type="button" class="kr-st'+(i===KIL_PL_I?' on':'')+'" data-i="'+i+'"'
          +(i===KIL_PL_I?' aria-current="true"':'')+'>'
          +(pl.art?'<img src="'+pl.art+'" alt=""/>':'<span class="kr-st-noart"></span>')
          +'<span>'+String(pl.name||'Station')+'</span></button>';
      }).join('');
      /* after the cards exist, and again once their artwork has changed the widths */
      syncStationArrows();
      host.querySelectorAll('img').forEach(function(im){
        if(!im.complete) im.addEventListener('load', syncStationArrows, {once:true});
      });
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
    if(st!=='compact'){
      paintStations();
      /* Paint the carousel from the snapshot FIRST — synchronous, so the drawer is never
         briefly showing a different track from the bar it just came out of. Then refresh,
         which repaints BOTH views together from one fresh read, so they are not merely
         consistent with each other but current with the widget. */
      paintTrackCarousel();
      try{ kilPaintTitles(); }catch(e){}
      chatBorrow();
    } else {
      chatReturn();
    }
    try{ window.KIL_RADIO_UI=st; }catch(e){}
  }
  /* The drawer's separate NOW PLAYING block was replaced by the track carousel, whose
     centred card IS the now-playing state - two representations of one thing is how they
     drift apart. Kept as a no-op because callers outside this file reference it. */
  function paintDrawerNow(){ /* the centred carousel card is the now-playing view */ }
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
  /* Resize is not the only way the bar's height changes - tuning --kr-bar-h changes it with no
     resize event at all, and the drawer would sit at the old offset. Observe the bar itself
     rather than trying to enumerate every cause. */
  if(typeof ResizeObserver==='function'){
    try{ var _bar=document.getElementById('kil-radio');
         if(_bar) new ResizeObserver(publishRadioHeight).observe(_bar); }catch(e){}
  }
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
      paintMuteIcon();
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
      muted=false;paintMuteIcon();
      muteBtn.setAttribute('aria-label','Mute');muteBtn.setAttribute('aria-pressed','false');
      widget.setVolume(savedVol);
      if(volEl){volEl.value=muted?0:savedVol;}
      if(isMobile)widget.play();
      if(commercialAudio)commercialAudio.volume=Math.min(1,savedVol/100);
    } else {
      /* Muting silences the audio and nothing else: the track, its position and the stored
         level are all untouched, and the slider appears so a level can be chosen. */
      savedVol=Math.max(1,parseInt(volEl&&volEl.value!==''?volEl.value:savedVol)||DEFAULT_VOL);
      muted=true;paintMuteIcon();
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
        paintMuteIcon();
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

  /* ══════════════════════════════════════════════════════════════════════════════════════
     COLLAPSED-BAR INTERACTION (KODE 2026-09-17)
     Transport, shuffle, repeat, the volume popover, chat, and the rule that makes the whole
     bar a click target without swallowing its own controls.
     ══════════════════════════════════════════════════════════════════════════════════════ */

  /* ── VOLUME POPOVER ────────────────────────────────────────────────────────────────────
     The speaker both toggles mute AND raises the slider (brief 19). Those are not in
     conflict: muting is the moment someone wants to CHOOSE a level rather than lose one, so
     the control that mutes is also the control that offers the level. The mute/unmute state
     itself is handled by the existing handler above - this only manages visibility and the
     numeric readout, so there is still exactly one place that owns muted/savedVol. */
  /* Both SVG icons are installed once the bar exists. */
  paintMuteIcon();
  (function(){ var cb=document.getElementById('kr-chat'); if(cb) cb.innerHTML=SVG_CHAT; })();
  var volPop=document.getElementById('kr-volpop'), volNum=document.getElementById('kr-volnum');
  function paintVolNum(){ if(volNum) volNum.textContent = (muted?0:savedVol)+'%'; }
  function volPopOpen(){ if(!volPop) return; volPop.hidden=false; paintVolNum(); }
  function volPopClose(){ if(volPop) volPop.hidden=true; }
  paintVolNum();
  if(muteBtn){
    /* Runs IN ADDITION to the mute handler bound earlier on the same element; listeners do
       not replace one another, so mute still does exactly what it did. */
    muteBtn.addEventListener('click',function(e){ e.stopPropagation(); volPopOpen(); });
  }
  if(volEl){
    volEl.addEventListener('input', paintVolNum);
    volEl.addEventListener('click', function(e){ e.stopPropagation(); });
    volEl.addEventListener('keydown', function(e){ if(e.key==='Escape'){ volPopClose(); muteBtn&&muteBtn.focus(); } });
  }
  /* Dismiss on a click anywhere outside, and on Escape. */
  document.addEventListener('click', function(e){
    if(!volPop || volPop.hidden) return;
    if(volPop.contains(e.target) || (muteBtn && muteBtn.contains(e.target))) return;
    volPopClose();
  });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') volPopClose(); });

  /* ── TRACK TRANSPORT: THE ONLY TWO PRIMARY CONTROLS ───────────────────────────────────
     Real previous / real next against the live SoundCloud queue. No second audio engine and
     no synthetic queue - __kilRadioSong is the same two lines the EARN row already calls. */
  /* ONE implementation, bound in two places. The Now Playing row's two controls (§15) do
     the same thing as the bar's, so they call the same function rather than a second copy
     that could diverge on shuffle handling. Hoisted to module scope because the drawer is
     built lazily, long after this runs. */
  function krNavTrack(dir){
    return function(e){
      e.stopPropagation();            /* a transport click must not also open the drawer */
      if(dir>0 && SHUFFLE) return shuffleNext();
      if(typeof window.__kilRadioSong==='function') window.__kilRadioSong(dir);
    };
  }
  (function(){
    var pb=document.getElementById('kr-prev'), nb=document.getElementById('kr-next');
    if(pb) pb.addEventListener('click', krNavTrack(-1));
    if(nb) nb.addEventListener('click', krNavTrack(1));
  })();

  /* ── SHUFFLE AND REPEAT ARE REAL, OR THEY ARE NOT OFFERED ─────────────────────────────
     The SoundCloud Widget API has no shuffle and no repeat of its own - it exposes play,
     pause, next, prev, seekTo and skip(index). Both features are therefore implemented on
     top of skip() against the queue the widget is actually holding, which is real
     behaviour rather than a lit-up icon: shuffle picks a genuinely different index and
     plays it, repeat genuinely replays the finished track.

     Both states persist for the session, because a listener who asked for shuffle has not
     changed their mind because they navigated to another page. */
  var SHUFFLE=false, REPEAT=false;
  try{
    SHUFFLE = sessionStorage.getItem('kil_shuffle')==='1';
    REPEAT  = sessionStorage.getItem('kil_repeat')==='1';
  }catch(e){}

  function shuffleNext(){
    if(!widget || !widgetReady) return;
    widget.getSounds(function(list){
      if(!list || !list.length) return;
      if(list.length===1){ widget.skip(0); widget.play(); return; }
      widget.getCurrentSoundIndex(function(i){
        /* A "random" pick that can return the track already playing reads as a dead button,
           so the current index is excluded rather than retried in a loop. */
        var j=Math.floor(Math.random()*(list.length-1));
        if(j>=i) j++;
        widget.skip(j); widget.play();
        setTimeout(function(){ try{ kilPaintTitles(); }catch(e){} }, 400);
      });
    });
  }
  window.__kilRadioShuffleNext = shuffleNext;
  window.__kilRadioModes = function(){ return {shuffle:SHUFFLE, repeat:REPEAT}; };

  (function(){
    function toggle(btn, get, set, key){
      if(!btn) return;
      btn.setAttribute('aria-pressed', get()?'true':'false');
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        set(!get());
        btn.setAttribute('aria-pressed', get()?'true':'false');
        try{ sessionStorage.setItem(key, get()?'1':'0'); }catch(_e){}
      });
    }
    toggle(document.getElementById('kr-shuffle'),
           function(){return SHUFFLE;}, function(v){SHUFFLE=v;}, 'kil_shuffle');
    toggle(document.getElementById('kr-repeat'),
           function(){return REPEAT;},  function(v){REPEAT=v;},  'kil_repeat');
  })();

  /* ── CHAT IS NOT A SECOND WAY TO OPEN THE RADIO (brief 20/25) ─────────────────────────
     It opens the chat experience directly. It deliberately does NOT toggle the drawer, and
     it does not need the radio open first.
     It drives the EXISTING chat panel rather than rendering a second one: two chat surfaces
     would mean two conversation histories, which is the same mistake as two audio engines. */
  (function(){
    var cb=document.getElementById('kr-chat');
    if(!cb) return;
    cb.addEventListener('click', function(e){
      e.stopPropagation();
      var host=document.getElementById('kilo-btn');
      if(host){ host.click(); return; }
      /* No chat on this page: say so rather than appearing to do nothing. */
      cb.setAttribute('aria-label','Chat unavailable on this page');
      cb.disabled=true;
    });
  })();

  /* ── THE BAR ITSELF OPENS THE RADIO (brief 4) ─────────────────────────────────────────
     Anywhere on the strip opens the expanded radio, EXCEPT the interactive controls, each
     of which stops its own click above. The closest() test is the backstop: it keeps the
     rule true for anything added inside a control later (an icon, a label) without every
     new child needing its own stopPropagation. */
  (function(){
    var bar=document.getElementById('kil-radio');
    if(!bar) return;
    var INTERACTIVE='#kr-prev,#kr-next,#kr-shuffle,#kr-repeat,#kr-mute,#kr-vol,#kr-volpop,#kr-chat,#kr-live';
    bar.addEventListener('click', function(e){
      /* e.target is not always an Element - a synthetic Event dispatched at `document`
         (which is what a scripted gesture produces) has the document as its target, and
         document has no closest(). Guarding on the instance rather than on the presence of
         the method is the check that cannot be fooled by either case. */
      var t=e.target;
      if(!(t instanceof Element)) return;
      if(t.closest(INTERACTIVE)) return;
      if(typeof setRadioUI==='function') setRadioUI(RADIO_UI==='compact' ? 'drawer' : 'compact');
    });
  })();

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
