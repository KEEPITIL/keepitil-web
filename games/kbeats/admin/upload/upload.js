/* KBeats owner master upload — STAGING ONLY. Self-contained on purpose: it does not use or change the
   game's api.js, and it talks only to kbeats-api-staging (hard-coded; there is no switch). The staging
   function issues one single-use signed upload URL per file for a path it chooses in the private
   kbeats-masters bucket, so no service credential ever reaches this page. Admin rights are enforced by
   the API on every call; the gate below only decides what to show. */
import { uploadQueue, importFolder, inventoryToRows, RIGHTS_ITEMS } from '/games/kbeats/js/intake.js';

const SUPA_URL = 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
const STAGING_FN = SUPA_URL + '/functions/v1/kbeats-api-staging';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $ = s => document.querySelector(s);

let sb;
async function client() {
  if (sb) return sb;
  if (!window.supabase?.createClient) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/games/kbeats/vendor/supabase-js.min.js'; s.onload = res; s.onerror = () => { s.remove(); rej(new Error('could not load supabase-js (check your connection)')); }; document.head.appendChild(s); });
  if (!window.supabase?.createClient) throw new Error('supabase-js did not initialise');
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
    $('#si').onsubmit = async e => {
      e.preventDefault(); const b = e.submitter || $('#si button'); b.disabled = true;
      try { const r = await (await client()).auth.signInWithOtp({ email: $('#em').value, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: false } });
        $('#sim').innerHTML = r.error ? `<span class="err">${esc(r.error.message)}</span>` : 'Check your email for the sign-in link.'; }
      catch (err) { $('#sim').innerHTML = `<span class="err">${esc(err?.message || err)}. Try again.</span>`; }
      finally { b.disabled = false; }
    };
    return;
  }
  $('#who').textContent = s.user.email || '';
  try { await call('admin_overview'); }            // read-only probe: 403 for anyone who is not a KBeats admin
  catch (e) { if (e.status === 403) { $('#gate').innerHTML = '<p class="err">This account is not a KBeats admin.</p>'; return; } throw e; }   // anything else: start() offers a retry
  $('#gate').hidden = true; $('#app').hidden = false;
}

function showRows(rows) {
  $('#list').innerHTML = `<table><tr><th>File</th><th>Status</th></tr>${rows.map(r => `<tr><td>${esc(r.name)}${r.renamed ? ` <span class="x">(from ${esc(r.file.name)})</span>` : ''}</td>
    <td class="${/^uploaded|already/.test(r.state) ? 'ok' : /^(refused|failed)/.test(r.state) ? 'err' : ''}">${esc(r.state)}</td></tr>`).join('')}</table>`;
}

$('#go').onclick = async () => {
  const btn = $('#go'), msg = $('#msg');
  const folder = importFolder($('#fold').value.trim().toLowerCase());
  if (!folder) { msg.innerHTML = '<span class="err">Folder: lowercase letters, digits, - or _</span>'; return; }
  const files = [...$('#files').files]; if (!files.length) { msg.textContent = 'Choose files first.'; return; }
  btn.disabled = true; msg.textContent = 'Uploading…';
  try {
    const sbc = await client();
    const r = await uploadQueue(files, {
      sign: list => call('admin_import_upload_urls', { folder, files: list }),
      put: async (path, token, file, mime) => { const u = await sbc.storage.from('kbeats-masters').uploadToSignedUrl(path, token, file, { contentType: mime, upsert: false }); if (u.error) throw u.error; },
      onChange: showRows });
    msg.textContent = `${r.uploaded} uploaded · ${r.already} already there · ${r.refused} refused · ${r.failed} failed${r.failed ? ' (press Upload again to resume)' : ''}`;
  } catch (e) {
    // anything unexpected (client failed to load, session expired, network): say so and let the owner retry
    msg.innerHTML = `<span class="err">Upload stopped: ${esc(e?.message || e)}. Nothing is lost: press Upload again to resume${e?.status === 401 ? ' after signing in again (reload the page)' : ''}.</span>`;
  } finally { btn.disabled = false; }
};

$('#inv').onclick = async () => {
  const folder = importFolder($('#fold').value.trim().toLowerCase());
  if (!folder) { $('#imsg').innerHTML = '<span class="err">Folder: lowercase letters, digits, - or _</span>'; return; }
  const btn = $('#inv'); btn.disabled = true;
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
  } catch (e) { $('#imsg').innerHTML = `<span class="err">Could not build the inventory: ${esc(e?.message || e)}. Try again.</span>`; }
  finally { btn.disabled = false; }
};

/* Make drafts: inventory → plan (private drafts) → owner attestation → process (shortest song first, the
   rest only if it worked). The attestation is the owner's own statement: every box must be ticked here. */
const RIGHTS_TEXT = {
  master: 'I own or control the master recordings of these songs.',
  composition: 'I own or control the composition / publishing rights for this use.',
  samples: 'There are no uncleared samples, loops, leased beats or third-party material in them.',
  storage_gameplay: 'KBeats may store and use the masters for interactive gameplay.',
  analysis_charts: 'KBeats may analyze the masters and create rhythm charts.',
  previews: 'KBeats may use reasonable gameplay previews/clips.',
  agreement: 'The current KBeats Artist Agreement applies.',
};
$('#rights').innerHTML = RIGHTS_ITEMS.map(k => `<label style="display:block"><input type="checkbox" data-r="${k}"> ${esc(RIGHTS_TEXT[k])}</label>`).join('');

$('#mk').onclick = async () => {
  const btn = $('#mk'), msg = $('#mmsg'), out = $('#mkout');
  const folder = importFolder($('#fold').value.trim().toLowerCase()), slug = $('#slug').value.trim().toLowerCase();
  const items = Object.fromEntries([...document.querySelectorAll('[data-r]')].map(x => [x.dataset.r, x.checked]));
  if (!folder) { msg.innerHTML = '<span class="err">Folder: lowercase letters, digits, - or _</span>'; return; }
  if (!RIGHTS_ITEMS.every(k => items[k])) { msg.innerHTML = '<span class="err">Tick every statement first (only if each one is true).</span>'; return; }
  btn.disabled = true; out.innerHTML = '';
  try {
    msg.textContent = 'Reading the folder…';
    const inv = await call('admin_import_inventory', { folder, ownerName: $('#own').value.trim() }, 120000);
    const rows = inventoryToRows(inv).filter(r => /\.wav$/i.test(r.file || ''));
    if (!rows.length) throw new Error('no WAV files in this folder');
    msg.textContent = `Creating ${rows.length} private drafts…`;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(slug + '|' + folder + '|' + rows.map(r => r.file).sort().join('|')));
    const key = 'mk-' + [...new Uint8Array(digest)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
    const plan = await call('admin_import_plan', { ownerArtistSlug: slug, mastersPrefix: folder, label: folder, rows, idempotencyKey: key }, 180000);
    const batch = await call('admin_import_batch', { batchId: plan.batchId });
    const ready = batch.items.filter(i => i.track_id && i.intake_id);
    const skipped = batch.items.filter(i => !(i.track_id && i.intake_id));
    if (!ready.length) throw new Error('no file could be matched to a draft (' + skipped.map(i => i.meta.title + ': ' + i.match_status).join(', ') + ')');
    msg.textContent = 'Recording your rights confirmation…';
    await call('admin_import_attest', { batchId: plan.batchId, trackIds: ready.map(i => i.track_id), items, agreementVersion: batch.agreementVersion, scope: 'batch' });
    const state = new Map(ready.map(i => [i.intake_id, 'waiting']));
    const show = () => { out.innerHTML = `<table><tr><th>Song</th><th>Status</th></tr>${ready.map(i => { const s = state.get(i.intake_id); return `<tr><td>${esc(i.meta.title)}</td><td class="${/^submitted|already/.test(s) ? 'ok' : /^failed|stopped/.test(s) ? 'err' : ''}">${esc(s)}</td></tr>`; }).join('')}${skipped.map(i => `<tr><td>${esc(i.meta.title)}</td><td class="err">not matched (${esc(i.match_status)})</td></tr>`).join('')}</table>`; };
    const order = [...ready].sort((a, b) => (a.meta.duration_ms ?? a.meta.durationMs ?? 1e12) - (b.meta.duration_ms ?? b.meta.durationMs ?? 1e12));
    const done = new Set(['AWAITING_REVIEW', 'PUBLISHED', 'COMPLETE']);
    let ok = 0, bad = 0;
    for (const [n, it] of order.entries()) {
      if (done.has(it.intake_status)) { state.set(it.intake_id, 'already submitted'); ok++; show(); continue; }
      state.set(it.intake_id, 'making charts…'); show(); msg.textContent = `Processing ${n + 1}/${order.length}: ${it.meta.title}`;
      try {
        const r = await call('admin_intake_process', { intakeId: it.intake_id }, 240000);
        if (r.charts?.allValid) { state.set(it.intake_id, 'submitted for review'); ok++; }
        else { state.set(it.intake_id, 'failed: charts did not validate'); bad++; }
      } catch (e) { state.set(it.intake_id, 'failed: ' + (e?.message || e)); bad++; }
      show();
      if (n === 0 && bad) { for (const x of order.slice(1)) state.set(x.intake_id, 'stopped: first song failed'); show(); break; }
    }
    msg.innerHTML = `${ok} submitted for review (private) · ${bad} failed${bad ? ' — press Make drafts again to retry; finished songs are skipped' : ''}. Nothing is published until you approve it in moderation.`;
  } catch (e) { msg.innerHTML = `<span class="err">Stopped: ${esc(e?.message || e)}. Press Make drafts again; finished steps are skipped.</span>`; }
  finally { btn.disabled = false; }
};

// a failed start (supabase-js did not load, network down) shows the reason and a retry, never a dead page
function start() {
  $('#gate').innerHTML = 'Checking access…';
  gate().catch(e => {
    $('#gate').innerHTML = `<p class="err">Could not start the uploader: ${esc(e?.message || e)}</p><p><button class="btn ghost" id="retry">Try again</button></p>`;
    $('#retry').onclick = () => { sb = null; start(); };
  });
}
start();
