/* KEEPITIL /connect "Get Featured" artist intake form.
 * Renders into <section id="get-featured"></section>. Joseph's spec 2026-11-22:
 * our own branded form (never Google Forms) collecting email, separate social links,
 * up to 5 original photo uploads, and the artist's story ("Before the craft" /
 * "The artist today"). Photos go to Supabase Storage bucket "connect-intake";
 * the submission row goes to public.connect_submissions (anonymous INSERT only;
 * the team reads submissions as admin). A summary mirror row also lands in
 * public.feedback with an "[ARTIST INTAKE]" prefix so it shows in the existing
 * admin read flow. Bots: hidden honeypot + minimum time on page answer like a
 * success and store nothing.
 */
(function (root) {
  'use strict';
  var SUPA_URL = 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
  /* Public anon key, the same one the site ships everywhere. */
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
  var BUCKET = 'connect-intake';
  var MAX_FILES = 5, MAX_BYTES = 10 * 1024 * 1024;
  var MIN_MS = 3000;
  var CATS = [['music-artist', 'Music artist'], ['visual-artist', 'Visual artist'], ['brand', 'Brand'], ['venue', 'Venue'], ['organizer', 'Organizer']];
  var THANKS = "You're in. Your feature is in the queue — watch your email for your article link.";

  function clip(s, n) { return String(s == null ? '' : s).replace(/\r/g, '').trim().slice(0, n); }
  function validEmail(s) { return typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim()); }
  function uuid() { return (root.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); }); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var CSS = '#get-featured{max-width:640px;margin:48px auto 0;padding:0 16px 120px;scroll-margin-top:212px;color:var(--ink,#f4f2fb)}' +
    '#get-featured .gf-card{box-sizing:border-box;background:#14121f;border:1px solid var(--panel-brd,rgba(255,255,255,.09));border-radius:16px;padding:22px 18px}' +
    '#get-featured h2{margin:0 0 6px;font-size:1.35rem}#get-featured p.gf-sub{margin:0 0 16px;color:var(--ink2,#9a94b4);font-size:.95rem;line-height:1.5}' +
    '#get-featured label{display:block;margin:0 0 4px;font-size:.82rem;color:var(--ink2,#9a94b4)}' +
    '#get-featured input[type=text],#get-featured input[type=email],#get-featured input[type=tel],#get-featured input[type=url],#get-featured select,#get-featured textarea{box-sizing:border-box;width:100%;margin:0 0 12px;padding:12px 13px;font:inherit;font-size:16px;color:#fff;background:#07060d;border:1px solid rgba(255,255,255,.2);border-radius:10px}' +
    '#get-featured textarea{min-height:96px;resize:vertical}' +
    '#get-featured input[type=file]{margin:0 0 6px;color:var(--ink2,#9a94b4)}' +
    '#get-featured .gf-check{display:flex;gap:8px;align-items:flex-start;margin:0 0 10px;font-size:.9rem;color:var(--ink,#f4f2fb)}' +
    '#get-featured .gf-check input{margin-top:3px}' +
    '#get-featured .gf-cats{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}' +
    '#get-featured .gf-cats label{display:flex;gap:6px;align-items:center;border:1px solid rgba(255,255,255,.2);border-radius:999px;padding:7px 12px;font-size:.88rem;color:var(--ink,#f4f2fb);cursor:pointer;margin:0}' +
    '#get-featured .gf-go{width:100%;padding:14px;font-size:1rem;font-weight:700;color:#0d0b16;background:#d0a0ff;border:0;border-radius:10px;cursor:pointer}' +
    '#get-featured .gf-go[disabled]{opacity:.6;cursor:default}' +
    '#get-featured .gf-msg{min-height:1.3em;margin:10px 0 0;font-size:.92rem}#get-featured .gf-msg.err{color:#ff7a7a}#get-featured .gf-msg.ok{color:#7fe0a0}' +
    '#get-featured .gf-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}' +
    '#get-featured .gf-note{font-size:.82rem;color:var(--ink2,#9a94b4);margin:-6px 0 12px;line-height:1.45}';

  function field(label, inner) { return '<label>' + esc(label) + '</label>' + inner; }
  function textIn(name, ph, req) { return '<input type="text" name="' + name + '" placeholder="' + esc(ph || '') + '"' + (req ? ' required' : '') + '>'; }

  function render(mount) {
    var style = document.createElement('style'); style.textContent = CSS; mount.appendChild(style);
    var cats = CATS.map(function (c, i) { return '<label><input type="radio" name="category" value="' + c[0] + '"' + (i === 0 ? ' checked' : '') + '> ' + esc(c[1]) + '</label>'; }).join('');
    mount.innerHTML += '<div class="gf-card"><h2>Get Featured on KEEPITIL Connect</h2>' +
      '<p class="gf-sub">A free artist feature on keepitil.com, shared across our pages. Artwork and artists of all kinds — tell us your story and upload your best photos. Your main photo becomes your article cover.</p>' +
      '<form id="gf-form" novalidate>' +
      '<label>I am a…</label><div class="gf-cats">' + cats + '</div>' +
      field('Artist / stage / brand name *', textIn('stage_name', 'Your public name', true)) +
      field('Real name * (never published without your consent)', textIn('real_name', 'Your real name', true)) +
      field('Email *', '<input type="email" name="email" placeholder="you@email.com" required>') +
      field('Phone (optional — never published without explicit approval)', '<input type="tel" name="phone" placeholder="Optional">') +
      field('City + state you represent *', textIn('city_state', 'City, State', true)) +
      field('Genres / style *', textIn('genres', 'e.g. Tech house, bass house', true)) +
      field('Instagram', textIn('instagram', '@handle or link')) +
      field('TikTok', textIn('tiktok', '@handle or link')) +
      field('YouTube', textIn('youtube', 'Channel link')) +
      field('X (Twitter)', textIn('x_handle', '@handle or link')) +
      field('SoundCloud', textIn('soundcloud', 'Profile link')) +
      field('Spotify', textIn('spotify', 'Artist link')) +
      field('Website', textIn('website', 'https://')) +
      field('Best track or set link *', textIn('best_track_link', 'The one link that represents you best', true)) +
      '<label>Your best photos * (up to 5)</label>' +
      '<input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple required>' +
      '<p class="gf-note">Upload your BEST quality photos — original files, not screenshots. Your main photo becomes your article cover.</p>' +
      field('Before the craft *', '<textarea name="story_before" required placeholder="Who were you before the music/art? Where are you from, what were you doing, and what pulled you in?"></textarea>') +
      field('The artist today *', '<textarea name="story_today" required placeholder="Who are you as an artist today — your sound, your latest releases or work, and what you are building toward."></textarea>') +
      field('What makes you different? (optional)', '<textarea name="differentiator" placeholder="Optional"></textarea>') +
      field('Upcoming dates / releases we should mention (optional)', textIn('upcoming', 'Optional')) +
      field('Booking contact, if different (optional)', textIn('booking_contact', 'Name + email')) +
      '<label class="gf-check"><input type="checkbox" name="photo_rights" required> <span>These are my photos, or I have the right to share them, and KEEPITIL may publish them with my article and posts. *</span></label>' +
      '<label class="gf-check"><input type="checkbox" name="consent_publish" required> <span>Publish my article on keepitil.com. *</span></label>' +
      '<label class="gf-check"><input type="checkbox" name="consent_social" required> <span>KEEPITIL may share my feature across its social accounts. *</span></label>' +
      '<label class="gf-check"><input type="checkbox" name="consent_links"> <span>Publish my public social links in the article.</span></label>' +
      '<label class="gf-check"><input type="checkbox" name="consent_phone"> <span>Publish my phone number as my booking contact.</span></label>' +
      '<span class="gf-hp"><label>Website<input type="text" name="website_hp" tabindex="-1" autocomplete="off"></label></span>' +
      '<button type="submit" class="gf-go">Submit my feature</button>' +
      '<p class="gf-msg" id="gf-msg" role="status"></p>' +
      '</form></div>';

    var form = mount.querySelector('#gf-form');
    var msg = mount.querySelector('#gf-msg');
    var started = Date.now();
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var btn = form.querySelector('.gf-go');
      function fail(t) { msg.textContent = t; msg.className = 'gf-msg err'; btn.disabled = false; }
      var fd = new FormData(form);
      var g = function (n) { return fd.get(n); };
      /* Bot trap: pretend success, store nothing. */
      if (g('website_hp') || (Date.now() - started) < MIN_MS) { msg.textContent = THANKS; msg.className = 'gf-msg ok'; form.reset(); return; }
      var files = form.querySelector('input[name=photos]').files;
      if (!clip(g('stage_name'), 120)) return fail('Add your artist / brand name.');
      if (!clip(g('real_name'), 120)) return fail('Add your real name.');
      if (!validEmail(g('email') || '')) return fail('Enter an email we can send your article link to.');
      if (!clip(g('city_state'), 120)) return fail('Add the city + state you represent.');
      if (!clip(g('genres'), 200)) return fail('Add your genres / style.');
      if (!clip(g('best_track_link'), 600)) return fail('Add your best track or set link.');
      if (!files || files.length < 1) return fail('Upload at least one of your best photos.');
      if (files.length > MAX_FILES) return fail('Up to 5 photos, please.');
      for (var i = 0; i < files.length; i++) { if (files[i].size > MAX_BYTES) return fail('Each photo must be under 10 MB — please send the original file, not an upscale.'); }
      if (clip(g('story_before'), 4000).length < 20) return fail('Tell us a little about who you were before the craft.');
      if (clip(g('story_today'), 4000).length < 20) return fail('Tell us a little about who you are as an artist today.');
      if (!form.querySelector('input[name=photo_rights]').checked) return fail('Please confirm the photo rights checkbox.');
      if (!form.querySelector('input[name=consent_publish]').checked) return fail('Please consent to publishing your article.');
      if (!form.querySelector('input[name=consent_social]').checked) return fail('Please consent to social sharing.');

      btn.disabled = true; msg.textContent = 'Uploading your photos…'; msg.className = 'gf-msg';
      var subId = uuid();
      var paths = [];
      var chain = Promise.resolve();
      Array.prototype.forEach.call(files, function (f, idx) {
        chain = chain.then(function () {
          var safe = f.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-60);
          var path = 'submissions/' + subId + '/' + idx + '-' + safe;
          return fetch(SUPA_URL + '/storage/v1/object/' + BUCKET + '/' + path, {
            method: 'POST',
            headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': f.type || 'application/octet-stream', 'x-upsert': 'false' },
            body: f
          }).then(function (r) { if (!r.ok) throw new Error('upload'); paths.push(path); });
        });
      });
      chain.then(function () {
        var row = {
          category: clip(g('category'), 40), stage_name: clip(g('stage_name'), 120), real_name: clip(g('real_name'), 120),
          email: clip(g('email'), 254).toLowerCase(), phone: clip(g('phone'), 40) || null,
          city_state: clip(g('city_state'), 120), genres: clip(g('genres'), 200),
          instagram: clip(g('instagram'), 300) || null, tiktok: clip(g('tiktok'), 300) || null,
          youtube: clip(g('youtube'), 300) || null, x_handle: clip(g('x_handle'), 300) || null,
          soundcloud: clip(g('soundcloud'), 300) || null, spotify: clip(g('spotify'), 300) || null,
          website: clip(g('website'), 300) || null, best_track_link: clip(g('best_track_link'), 600),
          image_paths: paths, photo_rights: true,
          story_before: clip(g('story_before'), 4000), story_today: clip(g('story_today'), 4000),
          differentiator: clip(g('differentiator'), 2000) || null, upcoming: clip(g('upcoming'), 600) || null,
          booking_contact: clip(g('booking_contact'), 300) || null,
          consent_publish: true, consent_social: true,
          consent_links: !!form.querySelector('input[name=consent_links]').checked,
          consent_phone: !!form.querySelector('input[name=consent_phone]').checked
        };
        return fetch(SUPA_URL + '/rest/v1/connect_submissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, Prefer: 'return=minimal' },
          body: JSON.stringify(row)
        }).then(function (r) { if (!r.ok) throw new Error('save'); return row; });
      }).then(function (row) {
        /* Mirror a summary into the existing feedback admin flow (best-effort). */
        var note = ('[ARTIST INTAKE]\nName: ' + row.stage_name + ' (' + row.real_name + ')\nCategory: ' + row.category +
          '\nCity: ' + row.city_state + '\nGenres: ' + row.genres + '\nPhotos: ' + row.image_paths.length +
          '\nTrack: ' + row.best_track_link + '\nSubmission: ' + subId).slice(0, 4000);
        fetch(SUPA_URL + '/rest/v1/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, Prefer: 'return=minimal' },
          body: JSON.stringify({ category: 'other', message: note, contact: row.email, page_url: '/connect/', user_handle: null })
        }).catch(function () {});
        msg.textContent = THANKS; msg.className = 'gf-msg ok'; form.reset();
      }).catch(function () { fail('Something went wrong saving your feature — please try again, or email your photos to info@keepitil.com.'); });
    });
  }

  function boot() {
    var mount = document.getElementById('get-featured');
    if (mount && !mount.dataset.gfDone) { mount.dataset.gfDone = '1'; render(mount); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : this);
