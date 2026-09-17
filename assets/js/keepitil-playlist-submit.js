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
      +   '<div class="kps-head">'
      +     '<h3>Get your sound on KEEPITIL and earn.</h3>'
      +     '<p>It’s simple: 1, 2, 3.</p>'
      +   '</div>'
      +   '<ol class="kps-steps">'
      +     '<li><b>1</b><span><strong>Create your playlist</strong>'
      +       'Put your best tracks in one public SoundCloud playlist.</span></li>'
      +     '<li><b>2</b><span><strong>Submit your work</strong>'
      +       'Send us the playlist link and a cover image.</span></li>'
      +     '<li><b>3</b><span><strong>KEEPITIL+</strong>'
      +       'Submissions we approve go into the ecosystem — radio rotation, playlist '
      +       'discovery, and Culture and Earn opportunities. Every submission is reviewed.</span></li>'
      +   '</ol>'
      +   '<form class="kps-form" novalidate>'
      +     '<label class="kps-f"><span>Playlist name</span>'
      +       '<input type="text" name="name" maxlength="80" autocomplete="off" '
      +         'placeholder="Name your playlist" required/></label>'
      +     '<label class="kps-f"><span>Public SoundCloud URL</span>'
      +       '<input type="url" name="url" inputmode="url" autocomplete="off" '
      +         'placeholder="https://soundcloud.com/you/sets/your-playlist" required/></label>'
      +     '<div class="kps-f kps-cover"><span>Cover image</span>'
      +       '<div class="kps-up">'
      +         '<button type="button" class="kps-drop" aria-label="Choose a cover image">'
      +           '<i aria-hidden="true">↑</i>'
      +           '<em>Click to upload</em><small>or drag and drop</small>'
      +         '</button>'
      +         '<input type="file" class="kps-file" accept="image/jpeg,image/png,image/webp,image/avif" hidden/>'
      +         '<div class="kps-prevwrap">'
      +           '<div class="kps-prev" aria-hidden="true"><span>2:3</span></div>'
      +           '<p class="kps-hint">2:3 portrait recommended (e.g. 1000×1500). '
      +             'Anything else is centre-cropped to 2:3, never stretched. '
      +             'This becomes your playlist cover on KEEPITIL.</p>'
      +         '</div>'
      +       '</div>'
      +     '</div>'
      +     '<p class="kps-msg" role="status" aria-live="polite"></p>'
      +     '<button type="submit" class="kps-submit">Submit playlist</button>'
      +   '</form>'
      + '</div>';
  }

  var CSS = ''
    + '.kps{--kp:#a855f7;--kpl:rgba(168,85,247,.34);color:#e9e4f7;'
    +   'font-family:\'Space Grotesk\',\'Inter\',sans-serif;}'
    + '.kps-head h3{margin:0 0 4px;font-size:1rem;font-weight:900;letter-spacing:.02em;color:#fff;'
    +   'text-transform:uppercase;}'
    + '.kps-head p{margin:0 0 14px;font-size:.72rem;color:#a79ec4;}'
    + '.kps-steps{list-style:none;display:flex;gap:12px;margin:0 0 16px;padding:0;flex-wrap:wrap;}'
    + '.kps-steps li{flex:1 1 180px;min-width:0;display:flex;gap:9px;align-items:flex-start;}'
    + '.kps-steps b{flex:0 0 24px;width:24px;height:24px;border-radius:50%;display:flex;'
    +   'align-items:center;justify-content:center;background:rgba(168,85,247,.16);'
    +   'border:1px solid var(--kpl);color:var(--kp);font-size:.66rem;font-weight:900;}'
    + '.kps-steps span{min-width:0;font-size:.66rem;line-height:1.5;color:#a79ec4;}'
    + '.kps-steps strong{display:block;color:#fff;font-size:.68rem;margin-bottom:2px;}'
    + '.kps-form{display:flex;flex-direction:column;gap:12px;max-width:560px;}'
    + '.kps-f{display:flex;flex-direction:column;gap:5px;min-width:0;}'
    + '.kps-f>span{font-size:.56rem;font-weight:900;letter-spacing:.14em;color:#8e86a8;'
    +   'text-transform:uppercase;}'
    + '.kps-f input[type=text],.kps-f input[type=url]{background:rgba(255,255,255,.05);'
    +   'border:1px solid rgba(255,255,255,.12);border-radius:9px;padding:9px 11px;'
    +   'color:#fff;font:400 .74rem/1.3 inherit;min-width:0;}'
    + '.kps-f input:focus{outline:2px solid var(--kp);outline-offset:1px;border-color:var(--kp);}'
    + '.kps-f input[aria-invalid="true"]{border-color:#ff6b8a;}'
    + '.kps-up{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;}'
    + '.kps-drop{flex:0 0 auto;width:168px;min-height:104px;display:flex;flex-direction:column;'
    +   'align-items:center;justify-content:center;gap:2px;background:rgba(255,255,255,.04);'
    +   'border:1px dashed var(--kpl);border-radius:11px;color:#b9b0d4;cursor:pointer;'
    +   'font:inherit;padding:10px;}'
    + '.kps-drop:hover,.kps-drop.over{background:rgba(168,85,247,.14);border-color:var(--kp);}'
    + '.kps-drop:focus-visible{outline:2px solid var(--kp);outline-offset:2px;}'
    + '.kps-drop i{font-size:1.1rem;font-style:normal;color:var(--kp);}'
    + '.kps-drop em{font-style:normal;font-size:.66rem;font-weight:700;color:#e9e4f7;}'
    + '.kps-drop small{font-size:.56rem;color:#8e86a8;}'
    + '.kps-prevwrap{display:flex;gap:10px;align-items:flex-start;min-width:0;flex:1 1 200px;}'
    /* The preview box IS 2:3, so the submitter is looking at the real card shape. */
    + '.kps-prev{flex:0 0 68px;width:68px;height:102px;border-radius:8px;'
    +   'background:#15131f center/cover no-repeat;border:1px solid var(--kpl);'
    +   'display:flex;align-items:center;justify-content:center;}'
    + '.kps-prev span{font-size:.56rem;font-weight:900;color:#6f6790;letter-spacing:.1em;}'
    + '.kps-prev.has span{display:none;}'
    + '.kps-hint{margin:0;font-size:.58rem;line-height:1.5;color:#8e86a8;min-width:0;}'
    + '.kps-msg{margin:0;min-height:1em;font-size:.66rem;line-height:1.45;color:#a79ec4;}'
    + '.kps-msg.err{color:#ff8da3;}'
    + '.kps-msg.ok{color:#6ff2b0;}'
    + '.kps-submit{align-self:flex-start;background:linear-gradient(90deg,var(--kp),#c98bff);'
    +   'border:0;border-radius:999px;padding:10px 22px;color:#12061f;cursor:pointer;'
    +   'font:900 .68rem/1 inherit;letter-spacing:.1em;text-transform:uppercase;}'
    + '.kps-submit:hover{filter:brightness(1.08);}'
    + '.kps-submit:focus-visible{outline:2px solid var(--kp);outline-offset:3px;}'
    + '.kps-submit[disabled]{opacity:.55;cursor:progress;}'
    + '.kps-gate{font-size:.7rem;line-height:1.6;color:#a79ec4;}'
    + '.kps-gate a{color:var(--kp);font-weight:700;}'
    + '@media(max-width:640px){.kps-steps li{flex:1 1 100%;}.kps-drop{width:100%;}}';

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
    var prev = root.querySelector('.kps-prev');
    var msg = root.querySelector('.kps-msg');
    var submit = root.querySelector('.kps-submit');
    var cover = null;                      /* {blob, preview} once an image is accepted */

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
    nameEl.addEventListener('input', function () { clearInvalid(nameEl); });
    urlEl.addEventListener('input', function () { clearInvalid(urlEl); });

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
      say('Preparing your cover…');
      to23(file).then(function (out) {
        cover = out;
        prev.classList.add('has');
        prev.style.backgroundImage = 'url(' + out.preview + ')';
        say('Cover ready — this is exactly how it will appear, cropped to 2:3.', 'ok');
      }).catch(function (e) {
        cover = null;
        prev.classList.remove('has');
        prev.style.backgroundImage = '';
        say(e && e.message ? e.message : 'That image could not be processed.', 'err');
      });
    }
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

      var who = uid();
      if (!who) { say('Your session expired. Sign in again and resubmit.', 'err'); return; }

      submit.disabled = true;
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
        submit.disabled = false;
        say('Submitted. Your playlist is with us for review — you can edit it any time by '
          + 'submitting again.', 'ok');
        try { document.dispatchEvent(new CustomEvent('kil-playlist-submitted')); } catch (e2) {}
      }).catch(function (err) {
        /* Never left on "Submitting…": every path ends in a real message and a usable
           button, so the submitter can correct something and try again. */
        submit.disabled = false;
        say((err && err.message ? err.message : 'Something went wrong submitting that.')
          + ' Nothing was lost — try again.', 'err');
      });
    });
  }

  window.KIL_PLAYLIST_SUBMIT = { mount: mount, scShape: scShape, to23: to23, BUCKET: BUCKET };
})();
