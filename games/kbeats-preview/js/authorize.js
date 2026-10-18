/* One-click artist authorization + secure master upload. The link token arrives in the URL fragment
   (never sent to servers in logs or Referer), is removed from the address bar immediately, and is
   checked server-side: signed, expiring, single-use, bound to one intake. No account or password needed. */
import { call, uploadSigned } from './api.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const STATEMENTS = {
  master: 'I control, or am authorized to license, this master recording.',
  composition: 'I control, or have sufficient authorization for, the composition/publishing rights needed for this use.',
  samples: 'Samples, loops, beats and any third-party material in this track are cleared for this use.',
  storage_gameplay: 'I authorize KEEPITIL/KBeats to store and use the master I supply for interactive KBeats gameplay.',
  analysis_charts: 'I authorize KBeats to analyze the master and create rhythm charts.',
  previews: 'I authorize reasonable gameplay previews and clips needed to run and promote the track on KBeats.',
  agreement: 'I accept the current KBeats Artist Agreement.',
};

const h = new URLSearchParams(location.hash.slice(1));
const purpose = h.get('u') ? 'upload' : 'authorize';
const token = h.get('u') || h.get('a') || sessionStorage.getItem('kb.link.' + purpose) || '';
if (h.get('u') || h.get('a')) { try { sessionStorage.setItem('kb.link.' + purpose, token); } catch {} history.replaceState(null, '', location.pathname); }
const app = $('#app');
const fail = msg => { app.innerHTML = `<h1>This link can't be used</h1><p class="err">${esc(msg)}</p><p class="x">Links expire and work once. If you need a new one, reply to our email.</p>`; };

const head = d => `<div class="card kv"><b>Artist</b><span>${esc(d.artist || '—')}</span><b>Track</b><span>${esc(d.track || '—')}</span>
  <b>SoundCloud</b><span>${d.scProfile ? `<a href="${esc(d.scProfile)}" target="_blank" rel="noopener">profile</a>` : '—'}${d.scTrack ? ` · <a href="${esc(d.scTrack)}" target="_blank" rel="noopener">track</a>` : ''}</span>
  <b>Split</b><span class="ok">received and accepted ✓</span></div>`;

async function main() {
  if (!token) return fail('No link found. Open the button in the email we sent you.');
  let d; try { d = await call('artist_link_get', { token, purpose }, { auth: false }); } catch (e) { return fail(e.message); }
  if (purpose === 'authorize') authorizeView(d); else uploadView(d);
}

function authorizeView(d) {
  if (d.authorized) return doneView(d, d.masterReceived ? 'done' : 'master');
  app.innerHTML = `<h1>Finish adding “${esc(d.track)}” to KBeats</h1><p class="x">One quick authorization is needed before we can make the track playable.</p>${head(d)}
    <form class="card" id="f" onsubmit="return false">
      ${d.items.map(k => `<label class="c"><input type="checkbox" data-k="${k}" required> <span>${k === 'agreement' ? `I accept the current <a href="/games/kbeats-preview/artist-agreement/" target="_blank">KBeats Artist Agreement</a> (version ${esc(d.agreementVersion)}).` : esc(STATEMENTS[k] || k)}</span></label>`).join('')}
      <p style="margin-top:14px"><button class="btn pink big" id="go" style="width:100%">AUTHORIZE TRACK FOR KBEATS</button></p><p id="m" class="x"></p></form>`;
  $('#go').onclick = async () => {
    if (!$('#f').reportValidity()) return;
    const items = Object.fromEntries([...document.querySelectorAll('[data-k]')].map(x => [x.dataset.k, x.checked]));
    $('#go').disabled = true; $('#m').textContent = 'Saving…';
    try { const r = await call('artist_link_authorize', { token, items, agreementVersion: d.agreementVersion, ua: navigator.userAgent }, { auth: false }); try { sessionStorage.removeItem('kb.link.authorize'); } catch {} doneView(d, r.next, r.authorizationId); }
    catch (e) { $('#go').disabled = false; $('#m').innerHTML = `<span class="err">${esc(e.message)}</span>`; }
  };
}

function doneView(d, next, id) {
  app.innerHTML = `<h1>Authorized ✓</h1>${head(d)}<div class="card"><p class="ok">Thank you — “${esc(d.track)}” is authorized for KBeats${id ? ` <span class="x">(ref ${esc(String(id).slice(0, 8))})</span>` : ''}.</p>
    <p>${next === 'master' ? 'One more thing: we need your master file. We are sending you a secure upload link by email.' : 'We have everything we need. KBeats is building the gameplay now — we will email you when it is live.'}</p></div>`;
}

function uploadView(d) {
  if (d.masterReceived) { app.innerHTML = `<h1>We have your master ✓</h1>${head(d)}<div class="card"><p>KBeats is building the gameplay. We will email you when it is live.</p></div>`; return; }
  app.innerHTML = `<h1>We have everything except your master file.</h1>${head(d)}
    <div class="card"><p>Upload the master for “${esc(d.track)}”. WAV or FLAC is best; high-quality MP3 or M4A also work. 30 seconds to 12 minutes, up to 200 MB.</p>
      <p><input type="file" id="file" accept=".wav,.flac,.mp3,.m4a,audio/*"></p><p><button class="btn pink" id="go" disabled>Upload master</button></p><progress id="p" max="1" value="0" hidden></progress><p id="m" class="x"></p></div>`;
  const f = $('#file'); f.onchange = () => { $('#go').disabled = !f.files[0]; };
  $('#go').onclick = async () => {
    const file = f.files[0], ext = (file.name.split('.').pop() || '').toLowerCase();
    $('#go').disabled = true; $('#p').hidden = false; $('#m').textContent = 'Preparing a secure upload…';
    try {
      const s = await call('artist_link_upload_start', { token, ext, bytes: file.size, mime: file.type || null }, { auth: false });
      $('#m').textContent = 'Uploading… keep this page open.'; $('#p').removeAttribute('value');
      await uploadSigned('kbeats-masters', s.path, s.token, file);
      $('#m').textContent = 'Checking the file…';
      const r = await call('artist_link_upload_done', { token }, { auth: false, timeoutMs: 120000 });
      try { sessionStorage.removeItem('kb.link.upload'); } catch {}
      app.innerHTML = `<h1>Master received ✓</h1>${head(d)}<div class="card"><p class="ok">Your file arrived intact${r.durationMs ? ` (${Math.round(r.durationMs / 1000)} s)` : ''}.</p><p>KBeats is building the gameplay now. We will email you when it is reviewed and live.</p><p class="x">Checksum ${esc(r.sha256.slice(0, 16))}…</p></div>`;
    } catch (e) { $('#go').disabled = false; $('#p').hidden = true; $('#m').innerHTML = `<span class="err">${esc(e.message)}</span> You can try again with this same link.`; }
  };
}

main();
