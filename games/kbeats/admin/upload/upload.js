/* KBeats owner master upload — STAGING ONLY. Self-contained on purpose: it does not use or change the
   game's api.js, and it talks only to kbeats-api-staging (hard-coded; there is no switch). The staging
   function issues one single-use signed upload URL per file for a path it chooses in the private
   kbeats-masters bucket, so no service credential ever reaches this page. Admin rights are enforced by
   the API on every call; the gate below only decides what to show. */
import { uploadQueue, importFolder } from '/games/kbeats/js/intake.js';

const SUPA_URL = 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
const STAGING_FN = SUPA_URL + '/functions/v1/kbeats-api-staging';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $ = s => document.querySelector(s);

let sb;
async function client() {
  if (sb) return sb;
  if (!window.supabase?.createClient) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/games/kbeats/vendor/supabase-js.min.js'; s.onload = res; s.onerror = () => rej(new Error('could not load supabase-js')); document.head.appendChild(s); });
  return (sb = window.supabase.createClient(SUPA_URL, SUPA_ANON));
}
async function call(op, body = {}, timeoutMs = 60000) {
  const { data } = await (await client()).auth.getSession();
  const token = data.session?.access_token; if (!token || data.session.user.is_anonymous) throw Object.assign(new Error('sign in first'), { status: 401 });
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(STAGING_FN, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', apikey: SUPA_ANON, Authorization: 'Bearer ' + token }, body: JSON.stringify({ op, ...body }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status });
    return j;
  } finally { clearTimeout(tm); }
}

async function gate() {
  const s = (await (await client()).auth.getSession()).data.session;
  if (!s || s.user.is_anonymous) {
    $('#gate').innerHTML = `<p>Admins only. Sign in with your KEEPITIL admin email:</p><form id="si"><input id="em" type="email" required placeholder="Email"> <button class="btn primary">Email me a sign-in link</button> <span class="x" id="sim"></span></form>`;
    $('#si').onsubmit = async e => { e.preventDefault(); const r = await (await client()).auth.signInWithOtp({ email: $('#em').value, options: { emailRedirectTo: location.href, shouldCreateUser: false } }); $('#sim').textContent = r.error ? r.error.message : 'Check your email.'; };
    return;
  }
  $('#who').textContent = s.user.email || '';
  try { await call('admin_overview'); }            // read-only probe: 403 for anyone who is not a KBeats admin
  catch (e) { $('#gate').innerHTML = e.status === 403 ? '<p class="err">This account is not a KBeats admin.</p>' : `<p class="err">${esc(e.message)}</p>`; return; }
  $('#gate').hidden = true; $('#app').hidden = false;
}

function showRows(rows) {
  $('#list').innerHTML = `<table><tr><th>File</th><th>Status</th></tr>${rows.map(r => `<tr><td>${esc(r.name)}${r.renamed ? ` <span class="x">(from ${esc(r.file.name)})</span>` : ''}</td>
    <td class="${/^uploaded|already/.test(r.state) ? 'ok' : /^(refused|failed)/.test(r.state) ? 'err' : ''}">${esc(r.state)}</td></tr>`).join('')}</table>`;
}

$('#go').onclick = async () => {
  const folder = importFolder($('#fold').value.trim().toLowerCase());
  if (!folder) { $('#msg').innerHTML = '<span class="err">Folder: lowercase letters, digits, - or _</span>'; return; }
  const files = [...$('#files').files]; if (!files.length) { $('#msg').textContent = 'Choose files first.'; return; }
  $('#go').disabled = true; $('#msg').textContent = 'Uploading…';
  const sbc = await client();
  try {
    const r = await uploadQueue(files, {
      sign: list => call('admin_import_upload_urls', { folder, files: list }),
      put: async (path, token, file, mime) => { const u = await sbc.storage.from('kbeats-masters').uploadToSignedUrl(path, token, file, { contentType: mime, upsert: false }); if (u.error) throw u.error; },
      onChange: showRows });
    $('#msg').textContent = `${r.uploaded} uploaded · ${r.already} already there · ${r.refused} refused · ${r.failed} failed${r.failed ? ' (press Upload again to resume)' : ''}`;
  } finally { $('#go').disabled = false; }
};

$('#inv').onclick = async () => {
  const folder = importFolder($('#fold').value.trim().toLowerCase());
  if (!folder) { $('#imsg').innerHTML = '<span class="err">Folder: lowercase letters, digits, - or _</span>'; return; }
  $('#imsg').textContent = 'Reading the folder…';
  try {
    const inv = await call('admin_import_inventory', { folder, export: $('#exp').value, ownerName: $('#own').value.trim() }, 120000);
    const s = inv.summary; $('#imsg').textContent = '';
    const len = ms => ms ? `${ms / 60000 | 0}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}` : '—';
    $('#invout').innerHTML = `<p>${s.files} files · ${s.ready} ready for gameplay QA · ${s.needsWav} need WAV for automatic charts · ${s.rightsReview} rights review required · ${s.duplicates} duplicates · ${s.missingAudio} songs in the export with no master</p>
      <table><tr><th>#</th><th>Title</th><th>Artist</th><th>Featured</th><th>Length</th><th>Format</th><th>Charts</th><th>SoundCloud</th><th>Status</th><th>Notes</th></tr>${inv.items.map(i => `<tr>
        <td>${i.trackNo ?? ''}</td><td>${esc(i.title || i.file)}</td><td>${esc(i.artist || '?')}</td><td>${esc((i.featured || []).join(', '))}</td><td>${len(i.durationMs)}</td>
        <td>${esc((i.format || '').toUpperCase())}</td><td>${esc(i.chartAnalysis)}</td><td>${i.scUrl ? `<a href="${esc(i.scUrl)}" target="_blank" rel="noopener">link</a>` : '—'}</td>
        <td>${esc(i.status)}</td><td class="x">${esc([...(i.flags || []).map(x => 'flag: ' + x), ...i.issues].join(' · '))}</td></tr>`).join('')}</table>
      ${inv.missing.length ? `<h3>Missing original audio (${inv.missing.length})</h3><p class="x">${inv.missing.map(x => esc(x.title)).join(' · ')}</p>` : ''}`;
  } catch (e) { $('#imsg').innerHTML = `<span class="err">${esc(e.message)}</span>`; }
};

gate().catch(e => { $('#gate').innerHTML = `<p class="err">${esc(e.message)}</p>`; });
