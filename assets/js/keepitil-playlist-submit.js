/* ═══════════════════════════════════════════════════════════════════════════════════════
   KEEPITIL — CREATE PLAYLIST / EARN FLOW  (KODE 2026-09-17)

   ONE component, TWO hosts. The radio's "+ CREATE" tile mounts it in place inside the
   expanded radio, and the EARN playlist section mounts the same thing inline. That is the
   point: the brief asks for a single shared implementation so a change to the fields, the
   validation or the endpoint cannot land in one place and miss the other.

     window.KIL_PLAYLIST_SUBMIT.mount(hostElement, { context:'radio' | 'earn' })

   WHAT IT WRITES
   The same row the EARN page has always written: POST user_playlists with
   on_conflict=user_id and Prefer: resolution=merge-duplicates. One playlist per person, so a
   second submission EDITS the existing entry instead of failing against the unique index or
   creating a duplicate the submitter cannot see.

   WHAT CHANGED ABOUT THE COVER
   The cover used to be a URL typed into a text box, which meant the artwork lived on
   whatever host the submitter happened to use and could change or disappear without notice
   while the radio was still showing it. It is now a real upload into the playlist-covers
   bucket, cropped to 2:3 before it leaves the browser.

   WHY THE CROP HAPPENS HERE
   The radio card is 2:3 portrait. Stretching a square photo into that shape distorts a
   face; letterboxing it wastes the card. So the image is drawn to a 2:3 canvas with a
   centre cover-crop - the same geometry CSS object-fit:cover would use - and the submitter
   sees exactly that result before they submit. Nothing is uploaded until they have seen it.
   ═══════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.KIL_PLAYLIST_SUBMIT) return;

  var SUPA = 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
  /* Publishable anon key. The same key the shell already ships to every visitor; RLS is what
     protects the row, not the secrecy of this string. */
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
  var PL_API = SUPA + '/rest/v1/user_playlists';
  var BUCKET = 'playlist-covers';

  /* Bucket limit is 8MB and the mime list is fixed there too. Checking here as well means the
     submitter is told before a 30-second upload fails, rather than after. */
  var MAX_BYTES = 8 * 1024 * 1024;
  var OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
  var OUT_W = 1000, OUT_H = 1500;          /* 2:3 portrait, the recommended size */

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── auth ──────────────────────────────────────────────────────────────────────────── */
  function token() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('-auth-token') > -1) {
          var j = JSON.parse(localStorage.getItem(k) || 'null');
          if (j && j.access_token) return j.access_token;
        }
      }
    } catch (e) {}
    return null;
  }
  function uid() {
    var t = token(); if (!t) return null;
    try { return JSON.parse(atob(t.split('.')[1])).sub || null; } catch (e) { return null; }
  }

  /* ── SoundCloud URL validation (brief 43) ──────────────────────────────────────────────
     This checks the SHAPE of the URL and says so. It deliberately does not claim the
     playlist is public or even that it exists: confirming that needs a server-side fetch of
     soundcloud.com, which the browser cannot do (no CORS) and which this page has no
     backend route for. A frontend that announced "valid playlist" from a regex would be
     asserting something it never checked.
     A bare profile URL is rejected because the radio plays a SET, not an account. */
  function scShape(u) {
    u = String(u || '').trim();
    if (!u) return { ok: false, why: 'Paste the public SoundCloud link to your playlist.' };
    var m = /^https?:\/\/(m\.|www\.)?soundcloud\.com\/([^\/\s?#]+)(\/.*)?$/i.exec(u);
    if (!m) return { ok: false, why: 'That is not a soundcloud.com link.' };
    var rest = m[3] || '';
    if (!/\/sets\/[^\/\s?#]+/i.test(rest)) {
      return { ok: false, why: 'That links to a profile, not a playlist. Open the playlist on SoundCloud and copy that link — it contains /sets/.' };
    }
    return { ok: true, url: u };
  }

  /* ── 2:3 cover crop ───────────────────────────────────────────────────────────────────
     Centre cover-crop onto a 2:3 canvas. Returns a Blob plus a preview URL. */
  function to23(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement('canvas');
          c.width = OUT_W; c.height = OUT_H;
          var g = c.getContext('2d');
          /* cover: scale so the SHORT side fills, then centre the overflow. */
          var scale = Math.max(OUT_W / img.width, OUT_H / img.height);
          var dw = img.width * scale, dh = img.height * scale;
          g.fillStyle = '#15131f'; g.fillRect(0, 0, OUT_W, OUT_H);
          g.drawImage(img, (OUT_W - dw) / 2, (OUT_H - dh) / 2, dw, dh);
          URL.revokeObjectURL(url);
          c.toBlob(function (blob) {
            if (!blob) { reject(new Error('The image could not be processed.')); return; }
            resolve({ blob: blob, preview: c.toDataURL('image/jpeg', 0.86) });
          }, 'image/jpeg', 0.88);
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('That file could not be read as an image.'));
      };
      img.src = url;
    });
  }

  /* ── markup ───────────────────────────────────────────────────────────────────────────
     The 1-2-3 is the approved shape. Step 3 describes what KEEPITIL actually does with an
     approved playlist and stops there: nothing here promises approval, placement or
     earnings, because none of those are guaranteed by the product. */
  function html(ctx) {
    return ''
      + '<div class="kps" data-ctx="' + esc(ctx) + '">'
      +   '<div class="kps-row">'

      /* COLUMN 1 - supporting information only. Short by instruction: this is not the form,
         and paragraphs here push the actual fields off the row. */
      +     '<div class="kps-info">'
      +       '<h3>Get your sound on KEEPITIL and earn</h3>'
      +       '<p class="kps-sub">It\u2019s simple.</p>'
      +       '<ol class="kps-steps">'
      +         '<li><b>1</b><span><strong>Create your playlist</strong>'
      +           'Add your favourite tracks on SoundCloud.</span></li>'
      +         '<li><b>2</b><span><strong>Submit your work</strong>'
      +           'Send the playlist link and a cover image.</span></li>'
      /* Step 3 says what KEEPITIL does and stops there. "Reaches a global audience" would
         promise a result no submission is guaranteed, and every one is reviewed. */
      +         '<li><b>3</b><span><strong>Get discovered</strong>'
      +           'Approved playlists enter radio rotation and playlist discovery.</span></li>'
      +       '</ol>'
      +     '</div>'

      /* COLUMN 2 - EXACTLY three stacked rows: name, URL, submit. The upload deliberately
         does NOT live in this stack; it is its own column. */
      +     '<form class="kps-form" novalidate>'
      +       '<label class="kps-f"><span>Playlist name</span>'
      +         '<input type="text" name="name" maxlength="80" autocomplete="off" '
      +           'placeholder="Enter playlist name..." required/></label>'
      +       '<label class="kps-f"><span>Public SoundCloud URL</span>'
      +         '<input type="url" name="url" inputmode="url" autocomplete="off" '
      +           'placeholder="https://soundcloud.com/your-playlist" required/></label>'
      +       '<button type="submit" class="kps-submit" disabled>Submit playlist</button>'
      +     '</form>'

      /* COLUMN 3 - ONE card. It is the upload target before a file is chosen and becomes the
         preview afterwards. There is no second preview box: two boxes made the submitter
         wonder which one was the cover. */
      +     '<div class="kps-upload">'
      +       '<button type="button" class="kps-drop" aria-label="Upload cover image, 2 by 3 portrait">'
      +         '<span class="kps-dropin">'
      +           '<i aria-hidden="true">\u2191</i>'
      +           '<em>Click to upload<br/>cover image</em>'
      +           '<small>2:3 portrait</small>'
      +           '<small class="kps-dim">1000 \u00d7 1500<br/>recommended</small>'
      +         '</span>'
      +         '<span class="kps-replace" aria-hidden="true">Click to replace</span>'
      +       '</button>'
      /* accept="image/*" keeps the iOS picker offering the photo library; the real type
         check is OK_TYPES in takeFile, which runs on whatever the picker returns. */
      +       '<input type="file" class="kps-file" accept="image/*" hidden/>'
      +     '</div>'

      +   '</div>'
      +   '<p class="kps-msg" role="status" aria-live="polite"></p>'
      + '</div>';
  }

  /* NEON GREEN ON DARK GLASS. The previous theme was purple; the radio and this flow now
     share one accent so the component does not change colour between its two hosts.
     Everything is scoped under .kps so no unrelated KEEPITIL surface is recoloured. */
  var CSS = ''
    + '.kps{--kp:#00ff88;--kpl:rgba(0,255,136,.34);--kpg:rgba(0,255,136,.18);'
    +   '--kptx:#cfeadd;--kpmut:#8aa69a;color:var(--kptx);'
    +   'font-family:\'Space Grotesk\',\'Inter\',sans-serif;}'

    /* THE ONE ROW. Columns are info | form | upload. The upload column is sized from the
       card's own width so the 2:3 card is never squeezed into a different shape by the
       track. minmax(0,...) on the flexible columns stops a long URL widening the grid. */
    + '.kps-row{display:grid;grid-template-columns:minmax(0,var(--kp-col-info,1.15fr)) minmax(0,var(--kp-col-form,1fr)) var(--kp-col-card,150px);'
    +   'gap:var(--kp-gap,26px);align-items:var(--kp-align,start);}'
    /* 1024 is a SUPPORTED DESKTOP WIDTH and must still be one row: info | form | card.
       The first breakpoint was 1180px, which folded the information column onto its own
       line at exactly the width the brief asks to see the single row at. Below 900 there is
       no honest way to keep three columns without squeezing the fields, so the information
       column steps aside first - it is the part that is supporting, not operative. */
    + '@media(max-width:900px){.kps-row{grid-template-columns:minmax(0,1fr) 140px;}'
    +   '.kps-info{grid-column:1/-1;}}'
    + '@media(max-width:720px){.kps-row{grid-template-columns:1fr;gap:18px;}'
    +   '.kps-info{grid-column:auto;}.kps-upload{max-width:150px;}}'

    + '.kps-info h3{margin:0 0 3px;font-size:var(--kp-h3,1.04rem);font-weight:900;letter-spacing:.02em;'
    +   'color:#fff;text-transform:uppercase;line-height:1.15;}'
    + '.kps-sub{margin:0 0 var(--kp-sub-mb,14px);font-size:var(--kp-sub,.74rem);color:var(--kpmut);}'
    + '.kps-steps{list-style:none;display:flex;flex-direction:column;gap:var(--kp-steps-gap,10px);margin:0;padding:0;}'
    + '.kps-steps li{display:flex;gap:10px;align-items:flex-start;min-width:0;}'
    + '.kps-steps b{flex:0 0 var(--kp-num,26px);width:var(--kp-num,26px);height:var(--kp-num,26px);border-radius:50%;display:flex;'
    +   'align-items:center;justify-content:center;background:var(--kpg);'
    +   'border:1px solid var(--kpl);color:var(--kp);font-size:var(--kp-num-fs,.7rem);font-weight:900;}'
    + '.kps-steps span{min-width:0;font-size:var(--kp-step-fs,.68rem);line-height:1.5;color:var(--kpmut);}'
    + '.kps-steps strong{display:block;color:#fff;font-size:var(--kp-step-title,.72rem);margin-bottom:1px;}'

    + '.kps-form{display:flex;flex-direction:column;gap:var(--kp-form-gap,12px);min-width:0;}'
    + '.kps-f{display:flex;flex-direction:column;gap:5px;min-width:0;}'
    + '.kps-f>span{font-size:var(--kp-label-fs,.58rem);font-weight:900;letter-spacing:.14em;color:var(--kpmut);'
    +   'text-transform:uppercase;}'
    + '.kps-f input[type=text],.kps-f input[type=url]{background:rgba(255,255,255,.05);'
    +   'border:1px solid rgba(255,255,255,.14);border-radius:var(--kp-input-radius,9px);'
    +   'padding:var(--kp-input-pady,11px) var(--kp-input-padx,12px);'
    +   'color:#fff;font:400 .78rem/1.3 inherit;min-width:0;width:100%;'
    /* ⚠ That font shorthand is INVALID (inherit cannot be a family inside it), so every
       browser drops it and the field has always shown the UA's size — 13.33px in Chrome, not
       the .78rem written here. Putting var() inside it changed HOW it failed and the field
       jumped to 16px. The tunable size is its own declaration, and `revert` hands an unset
       variable back to the browser default, so untouched looks exactly as it always has. */
    +   'font-size:var(--kp-input-fs,revert);}'
    + '.kps-f input::placeholder{color:#6f8478;}'
    + '.kps-f input:focus{outline:2px solid var(--kp);outline-offset:1px;border-color:var(--kp);}'
    + '.kps-f input[aria-invalid="true"]{border-color:#ff6b8a;}'

    /* ── THE SINGLE 2:3 UPLOAD CARD ───────────────────────────────────────────────────
       aspect-ratio lives on the control itself, so the thing the submitter clicks is the
       shape the cover will be. A wide dashed rectangle next to a small portrait preview
       taught the wrong shape and needed two boxes to say one thing. */
    + '.kps-upload{min-width:0;}'
    + '.kps-drop{position:relative;display:block;width:100%;aspect-ratio:var(--kp-card-ratio,2/3);'
    +   'background:rgba(255,255,255,.04) center/cover no-repeat;'
    +   'border:1px dashed var(--kpl);border-radius:var(--kp-card-radius,12px);color:var(--kptx);'
    +   'cursor:pointer;font:inherit;padding:10px;overflow:hidden;}'
    + '.kps-drop:hover,.kps-drop.over{background-color:var(--kpg);border-color:var(--kp);}'
    + '.kps-drop:focus-visible{outline:2px solid var(--kp);outline-offset:2px;}'
    + '.kps-dropin{display:flex;flex-direction:column;align-items:center;justify-content:center;'
    +   'gap:5px;height:100%;text-align:center;}'
    + '.kps-drop i{font-size:var(--kp-card-icon,1.35rem);font-style:normal;color:var(--kp);line-height:1;}'
    + '.kps-drop em{font-style:normal;font-size:var(--kp-card-text,.68rem);font-weight:700;color:#fff;line-height:1.3;}'
    + '.kps-drop small{font-size:var(--kp-card-small,.56rem);color:var(--kpmut);line-height:1.35;}'
    + '.kps-drop .kps-dim{color:#6f8478;}'
    /* Once an image is in, the card IS the preview: the helper text goes and a replace
       affordance takes its place, so the card never looks like a dead thumbnail. */
    + '.kps-drop.has{border-style:solid;border-color:var(--kpl);padding:0;}'
    + '.kps-drop.has .kps-dropin{display:none;}'
    + '.kps-replace{position:absolute;left:0;right:0;bottom:0;display:none;'
    +   'padding:7px 6px;font-size:.58rem;font-weight:800;letter-spacing:.06em;'
    +   'text-transform:uppercase;color:#06170f;background:var(--kp);}'
    + '.kps-drop.has .kps-replace{display:block;}'
    + '.kps-drop.busy{cursor:progress;}'

    /* ── SUBMIT ───────────────────────────────────────────────────────────────────────
       Muted glass until the form is genuinely complete, then solid neon. The transition
       is the signal that nothing is missing, so it must not be green early. */
    + '.kps-submit{align-self:stretch;background:rgba(255,255,255,.06);'
    +   'border:1px solid rgba(255,255,255,.14);border-radius:var(--kp-btn-radius,10px);'
    +   'padding:var(--kp-btn-pady,12px) 22px;'
    +   'color:#7e938a;cursor:not-allowed;font:900 .72rem/1 inherit;font-size:var(--kp-btn-fs,revert);letter-spacing:.1em;'
    +   'text-transform:uppercase;transition:background .18s,color .18s,border-color .18s;}'
    + '.kps-submit.ready{background:var(--kp);border-color:var(--kp);color:#06170f;'
    +   'cursor:pointer;box-shadow:0 0 18px rgba(0,255,136,.35);}'
    + '.kps-submit.ready:hover{filter:brightness(1.08);}'
    + '.kps-submit:focus-visible{outline:2px solid var(--kp);outline-offset:3px;}'
    + '.kps-submit[disabled]{pointer-events:none;}'

    + '.kps-msg{margin:12px 0 0;min-height:1em;font-size:.68rem;line-height:1.45;'
    +   'color:var(--kpmut);}'
    + '.kps-msg.err{color:#ff8da3;}'
    + '.kps-msg.ok{color:var(--kp);}'
    + '.kps-gate{font-size:.72rem;line-height:1.6;color:var(--kpmut);}'
    + '.kps-gate a{color:var(--kp);font-weight:700;}';

  function styles() {
    if (document.getElementById('kps-styles')) return;
    var st = document.createElement('style');
    st.id = 'kps-styles';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ── mount ─────────────────────────────────────────────────────────────────────────── */
  function mount(host, opts) {
    if (!host) return;
    opts = opts || {};
    styles();

    /* Signed out is not an error state - there is simply nobody to attach the playlist to.
       Say what is needed and offer the way there, and come back to this exact spot. */
    if (!token()) {
      host.innerHTML = '<div class="kps"><div class="kps-head">'
        + '<h3>Get your sound on KEEPITIL and earn.</h3></div>'
        + '<p class="kps-gate">Submitting a playlist needs a KEEPITIL account, so we know '
        + 'whose playlist it is. <a href="/apply?next='
        + encodeURIComponent(location.pathname + location.search) + '">Sign in or create one</a>,'
        + ' then come back here.</p></div>';
      return;
    }

    host.innerHTML = html(opts.context || 'earn');
    var root = host.querySelector('.kps');
    var form = root.querySelector('.kps-form');
    var nameEl = form.querySelector('[name=name]');
    var urlEl = form.querySelector('[name=url]');
    var fileEl = root.querySelector('.kps-file');
    var drop = root.querySelector('.kps-drop');
    var msg = root.querySelector('.kps-msg');
    var submit = root.querySelector('.kps-submit');
    var cover = null;                      /* {blob, preview} once a NEW image is accepted */
    var haveArt = false;                   /* a usable cover exists: new upload OR one already live */
    var working = false;                   /* an image is being cropped, or a submit is in flight */
    var existingArt = null;                /* cover already live on this person's row, if any */

    /* SUBMIT IS GATED ON ALL THREE REQUIREMENTS, and stays shut while an image is still
       being processed - enabling during the crop would let a submit race a cover that does
       not exist yet, which is the "it said it worked" failure this project keeps hitting. */
    function ready() {
      return !working
        && !!(nameEl.value || '').trim()
        && scShape(urlEl.value).ok
        && haveArt;
    }
    function refresh() {
      var go = ready();
      submit.disabled = !go;
      submit.classList.toggle('ready', go);
    }

    function say(text, kind) {
      msg.textContent = text || '';
      msg.className = 'kps-msg' + (kind ? ' ' + kind : '');
    }
    function invalid(el, why) {
      el.setAttribute('aria-invalid', 'true');
      say(why, 'err');
      try { el.focus(); } catch (e) {}
    }
    function clearInvalid(el) { el.removeAttribute('aria-invalid'); }
    nameEl.addEventListener('input', function () { clearInvalid(nameEl); refresh(); });
    urlEl.addEventListener('input', function () { clearInvalid(urlEl); refresh(); });

    /* A SUBMITTER WHO ALREADY HAS A PLAYLIST IS EDITING, NOT STARTING OVER.
       The endpoint upserts on user_id, and omitting `art` deliberately preserves the cover
       that is already live. Requiring a fresh upload before the button unlocks would mean a
       returning submitter could not fix a typo in their name without re-picking artwork they
       had already chosen. So an existing cover counts as the image requirement being met,
       and the card shows it. If the read fails the form simply behaves as a first-time one -
       it is a convenience, so it must never block submitting. */
    (function prefill() {
      var who = uid(); if (!who) return;
      fetch(PL_API + '?user_id=eq.' + encodeURIComponent(who) + '&select=name,url,art&limit=1', {
        headers: { apikey: ANON, Authorization: 'Bearer ' + token() }
      }).then(function (r) { return r.ok ? r.json() : null; }).then(function (rows) {
        var row = rows && rows[0]; if (!row) return;
        if (!nameEl.value && row.name) nameEl.value = row.name;
        if (!urlEl.value && row.url) urlEl.value = row.url;
        if (row.art) {
          existingArt = String(row.art);
          haveArt = true;
          drop.classList.add('has');
          drop.style.backgroundImage = 'url("' + existingArt.replace(/"/g, '%22') + '")';
        }
        refresh();
      }).catch(function () {});
    }());

    /* ── file selection ─────────────────────────────────────────────────────────────── */
    function takeFile(file) {
      if (!file) return;
      if (OK_TYPES.indexOf(file.type) === -1) {
        say('That file type is not supported. Use JPEG, PNG, WebP or AVIF.', 'err');
        return;
      }
      if (file.size > MAX_BYTES) {
        say('That image is ' + (file.size / 1048576).toFixed(1) + 'MB. The limit is 8MB.', 'err');
        return;
      }
      working = true; drop.classList.add('busy'); refresh();
      say('Preparing your cover…');
      to23(file).then(function (out) {
        cover = out;
        haveArt = true;
        drop.classList.add('has');
        drop.style.backgroundImage = 'url(' + out.preview + ')';
        say('Cover ready — this is exactly how it will appear, cropped to 2:3.', 'ok');
      }).catch(function (e) {
        cover = null;
        /* A failed crop must not leave the previous cover standing in as proof of an image
           the submitter thinks they just replaced. Fall back to the live one only if there
           genuinely is one. */
        haveArt = !!existingArt;
        if (existingArt) { drop.style.backgroundImage = 'url("' + existingArt.replace(/"/g, '%22') + '")'; }
        else { drop.classList.remove('has'); drop.style.backgroundImage = ''; }
        say(e && e.message ? e.message : 'That image could not be processed.', 'err');
      }).then(function () {
        working = false; drop.classList.remove('busy'); refresh();
      });
    }
    /* Set the gate from the real field state before any interaction. The markup ships the
       button disabled, but the class that makes it look disabled must agree with it from the
       first paint or the styling and the behaviour disagree. */
    refresh();

    drop.addEventListener('click', function () { fileEl.click(); });
    fileEl.addEventListener('change', function () { takeFile(fileEl.files && fileEl.files[0]); });
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
    });
    drop.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      takeFile(f);
    });

    /* ── submit ─────────────────────────────────────────────────────────────────────── */
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      e.stopPropagation();

      var name = (nameEl.value || '').trim();
      if (!name) return invalid(nameEl, 'Give your playlist a name.');
      var shape = scShape(urlEl.value);
      if (!shape.ok) return invalid(urlEl, shape.why);

      if (!haveArt) { say('Add a cover image before submitting.', 'err'); return; }

      var who = uid();
      if (!who) { say('Your session expired. Sign in again and resubmit.', 'err'); return; }

      working = true; refresh();
      say('Submitting…');

      /* Upload first: if the cover fails there is no point writing a row that points at
         nothing. With no new cover chosen, the existing row keeps whatever it had. */
      var step = cover
        ? fetch(SUPA + '/storage/v1/object/' + BUCKET + '/' + who + '/cover-' + Date.now() + '.jpg', {
            method: 'POST',
            headers: { apikey: ANON, Authorization: 'Bearer ' + token(), 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
            body: cover.blob
          }).then(function (r) {
            if (!r.ok) throw new Error('The cover image could not be uploaded (HTTP ' + r.status + ').');
            return r.json();
          }).then(function (j) {
            return SUPA + '/storage/v1/object/public/' + BUCKET + '/' + (j && j.Key ? String(j.Key).replace(/^playlist-covers\//, '') : '');
          })
        : Promise.resolve(null);

      step.then(function (artUrl) {
        var body = { user_id: who, name: name, url: shape.url };
        /* Only send art when there is a new one, so resubmitting without re-picking a file
           does not blank the cover that is already live. */
        if (artUrl) body.art = artUrl;
        return fetch(PL_API + '?on_conflict=user_id', {
          method: 'POST',
          headers: {
            apikey: ANON, Authorization: 'Bearer ' + token(),
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=representation'
          },
          body: JSON.stringify(body)
        });
      }).then(function (r) {
        if (!r.ok) throw new Error('Your playlist could not be saved (HTTP ' + r.status + ').');
        return r.json();
      }).then(function () {
        working = false; refresh();
        say('Submitted. Your playlist is with us for review — you can edit it any time by '
          + 'submitting again.', 'ok');
        try { document.dispatchEvent(new CustomEvent('kil-playlist-submitted')); } catch (e2) {}
      }).catch(function (err) {
        /* Never left on "Submitting…": every path ends in a real message and a usable
           button, so the submitter can correct something and try again. */
        working = false; refresh();
        say((err && err.message ? err.message : 'Something went wrong submitting that.')
          + ' Nothing was lost — try again.', 'err');
      });
    });
  }

  window.KIL_PLAYLIST_SUBMIT = { mount: mount, scShape: scShape, to23: to23, BUCKET: BUCKET };
})();
