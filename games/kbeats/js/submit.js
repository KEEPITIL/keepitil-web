/* Artist portal (production): sign in → artist profile → upload master to private storage → DSP
   analysis → Easy/Normal/Expert → validator → editor (every save = new server-side chart version)
   → rights attestation → submit for moderation. Every step is persisted on the backend; the
   dashboard resumes any track from its saved processing state. The browser runs the analysis
   (shared generator); the server re-validates every chart and never trusts the client's verdict. */
import { analyze, generateAll, generateChart, waveform } from './generator.js';
import { validate } from './chart.js';
import { REVENUE } from './config.js';
import * as API from './api.js';
import { ChartEditor } from './editor.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (c, cur = 'USD') => (Number(c) / 100).toLocaleString(undefined, { style: 'currency', currency: cur });
const ACCEPT = /\.(wav|flac|mp3|m4a|aac)$/i, MAX_BYTES = 200 * 1024 * 1024;
const RIGHTS = [
  ['master', 'I own or control the master recording.'],
  ['composition', 'I own or control the composition/publishing, or hold a licence that covers this use.'],
  ['sync', 'I can authorise interactive game synchronisation of this recording in KBeats.'],
  ['artwork', 'I own or have licensed the artwork I supply.'],
  ['samples', 'Every sample, stem, loop or beat used is cleared for this use.'],
  ['monetization', 'I can authorise monetisation of game play of this track under the KBeats Artist Agreement.'],
];
let ARTIST = null, ctx = null, editor = null;
let st = { trackId: null, slug: null, analysis: null, charts: null, wave: null, buffer: null, durationMs: 0 };

const view = v => { for (const id of ['auth', 'dash', 'flow']) $('#v-' + id).hidden = id !== v; scrollTo(0, 0); };
function show(step) { view('flow'); document.querySelectorAll('[data-step]').forEach(s => s.hidden = s.dataset.step !== step); document.querySelectorAll('.steps li').forEach(li => li.classList.toggle('on', li.dataset.s === step)); }
const status = (m, bad) => { const e = $('#status'); e.textContent = m; e.className = bad ? 'err' : ''; };
const log = m => $('#plog').insertAdjacentHTML('beforeend', `<li>${esc(m)}</li>`);
const audioCtx = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());

/* ── auth ─────────────────────────────────────────────────────────────── */
async function boot() {
  await API.finishPendingMigration().catch(() => {});
  const s = await API.session({ guest: false }).catch(() => null);
  if (!s || s.user.is_anonymous) { view('auth'); return; }
  $('#who').innerHTML = `${esc(s.user.email || 'Signed in')} · <a href="#" id="so" style="color:var(--dim)">Sign out</a>`;
  $('#so').onclick = async e => { e.preventDefault(); await API.signOut(); location.reload(); };
  const r = await API.call('artist_me');
  ARTIST = r.artist;
  if (!ARTIST) { fillArtist({ email: s.user.email }); show('artist'); return; }
  renderDash(r.tracks);
}
const am = m => $('#am').textContent = m;
$('#si').onclick = async () => { if (!$('#authf').reportValidity()) return; try { const r = await API.signInEmail($('#em').value, $('#pw').value); if (r.session) location.reload(); else am('Check your email for a sign-in link.'); } catch (e) { am(e.message); } };
$('#su').onclick = async () => { if (!$('#authf').reportValidity() || $('#pw').value.length < 6) return am('Choose a password of at least 6 characters.'); try { await API.signUpEmail($('#em').value, $('#pw').value); am('Check your email to confirm your account, then sign in.'); } catch (e) { am(e.message); } };
$('#gg').onclick = () => API.signInGoogle().catch(e => am(e.message));

/* ── dashboard ────────────────────────────────────────────────────────── */
const STATE_LABEL = { uploading: 'Upload incomplete', uploaded: 'Uploaded, charts not built', charts_ready: 'Charts ready', submitted: 'Submitted' };
function renderDash(tracks) {
  view('dash');
  $('#mine').innerHTML = tracks.length ? tracks.map(t => {
    const sub = t.submissions?.[0];
    const resumable = ['processing', 'draft', 'changes_requested'].includes(t.status);
    return `<div class="mt"><div class="grow"><b>${esc(t.title)}</b><br><span>${t.bpm ? Math.round(t.bpm) + ' BPM · ' : ''}${esc(t.genre || '')} · ${esc(STATE_LABEL[t.processing?.state] || '')}</span>
      ${sub?.note ? `<br><span>Reviewer note: ${esc(sub.note)}</span>` : ''}</div>
      <span class="st ${t.status}">${esc(t.status.replace('_', ' '))}</span>
      ${resumable ? `<button class="btn sm primary" data-resume="${t.id}">${t.processing?.state === 'uploading' ? 'Re-upload' : 'Continue'}</button>` : ''}
      ${t.status === 'published' ? `<a class="btn sm ghost" href="/games/kbeats/play/#/track/${encodeURIComponent(t.slug)}">Play</a>` : ''}</div>`;
  }).join('') : '<p style="color:var(--dim)">No tracks yet. Upload your first one.</p>';
  document.querySelectorAll('[data-resume]').forEach(b => b.onclick = () => resume(b.dataset.resume, tracks.find(t => t.id === b.dataset.resume)));
}
document.querySelectorAll('[data-dt]').forEach(b => b.onclick = async () => {
  document.querySelectorAll('[data-dt]').forEach(x => x.classList.toggle('on', x === b));
  for (const k of ['tracks', 'analytics', 'earnings', 'profile']) $('#d-' + k).hidden = k !== b.dataset.dt;
  if (b.dataset.dt === 'analytics') loadAnalytics();
  if (b.dataset.dt === 'earnings') loadEarnings();
  if (b.dataset.dt === 'profile') { $('#d-profile').innerHTML = '<div class="card"><p>Edit your artist profile.</p><button class="btn primary" id="editProfile">Edit profile</button></div>'; $('#editProfile').onclick = () => { fillArtist(ARTIST); show('artist'); }; }
});
async function loadAnalytics() {
  const el = $('#d-analytics'); el.innerHTML = '<div class="card">Loading…</div>';
  try {
    const a = await API.call('artist_analytics', { days: 30 });
    const sum = k => a.tracks.reduce((s, t) => s + (t[k] || 0), 0);
    el.innerHTML = `<div class="card"><h3>Last ${a.days} days</h3><div class="kpi">
      <div><b>${sum('impressions')}</b><small>Impressions</small></div><div><b>${sum('starts')}</b><small>Starts</small></div><div><b>${sum('unique_players')}</b><small>Unique players</small></div>
      <div><b>${sum('completions')}</b><small>Completions</small></div><div><b>${sum('favorites')}</b><small>Favorites</small></div><div><b>${a.newFollows}</b><small>New follows (${a.followers} total)</small></div>
      <div><b>${sum('soundcloud_clicks')}</b><small>SoundCloud clicks</small></div><div><b>${sum('replays')}</b><small>Replays</small></div></div>
      <table><tr><th>Track</th><th>Starts</th><th>Completion</th><th>Avg acc.</th><th>Difficulty mix</th><th>Regions</th><th>Attributed (your share)</th></tr>
      ${a.tracks.map(t => `<tr><td>${esc(t.title)}</td><td>${t.starts}</td><td>${t.completion_rate == null ? '—' : t.completion_rate + '%'}</td><td>${t.avg_accuracy == null ? '—' : t.avg_accuracy + '%'}</td>
        <td>${esc(Object.entries(t.difficulty_mix || {}).map(([k, v]) => `${k} ${v}`).join(', ') || '—')}</td><td>${esc(Object.entries(t.regions || {}).map(([k, v]) => `${k} ${v}`).join(', ') || '—')}</td><td>${money(t.attributed_artist_share)}</td></tr>`).join('')}</table>
      <p style="color:var(--mute);font-size:12px;margin-top:10px">Aggregates only. KBeats never shares individual player identities with artists.</p></div>`;
  } catch (e) { el.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
}
async function loadEarnings() {
  const el = $('#d-earnings'); el.innerHTML = '<div class="card">Loading…</div>';
  try {
    const r = await API.call('artist_earnings');
    const by = {}; for (const x of r.rows) (by[x.period] ||= { estimated: 0, finalized: 0, paid: 0, cur: x.currency })[x.status] += x.artist;
    el.innerHTML = `<div class="card"><h3>Earnings</h3><p style="color:var(--dim);font-size:14px">Your share: <b>${r.split.artistBps / 100}%</b> of game-attributable distributable revenue (KBeats ${r.split.platformBps / 100}%). Agreement ${esc(r.split.agreement)}. This never touches your SoundCloud or other royalties.</p>
      ${Object.keys(by).length ? `<table class="earn"><tr><th>Period</th><th>Estimated</th><th>Finalized</th><th>Paid</th></tr>${Object.entries(by).map(([p, v]) => `<tr><td>${p}</td><td class="n">${money(v.estimated, v.cur)}</td><td class="n">${money(v.finalized, v.cur)}</td><td class="n">${money(v.paid, v.cur)}</td></tr>`).join('')}</table>
        <p style="color:var(--mute);font-size:12px;margin-top:8px">Estimated amounts are not yet final and are not paid. Only "Paid" has been sent to you.</p>`
      : '<p style="color:var(--dim)">No game revenue has been attributed to your tracks yet.</p>'}
      ${r.statements.length ? `<h4 style="margin-top:14px">Statements</h4>${r.statements.map(s => `<div class="mt"><span class="grow">${s.period} · ${s.entry_count} entries · issued ${new Date(s.created_at).toLocaleDateString()}</span><span>${money(s.totals.paid)} paid · ${money(s.totals.finalized)} finalized</span></div>`).join('')}` : ''}</div>`;
  } catch (e) { el.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
}
$('#newTrack').onclick = () => { st = { trackId: null }; $('#trackForm').reset(); status(''); show('track'); };
$('#toDash').onclick = $('#backDash').onclick = async e => { e.preventDefault(); editor?.stop?.(); const r = await API.call('artist_me'); renderDash(r.tracks); };

/* ── artist profile ───────────────────────────────────────────────────── */
function fillArtist(a = {}) { $('#stage').value = a.stageName || ''; $('#legal').value = a.legalName || ''; $('#email').value = a.email || ''; $('#scUrl').value = a.soundcloudUrl || ''; $('#bio').value = a.bio || ''; }
$('#saveArtist').onclick = async () => {
  if (!$('#artistForm').reportValidity()) return;
  try {
    const r = await API.call('artist_upsert', { stageName: $('#stage').value.trim(), legalName: $('#legal').value.trim(), email: $('#email').value.trim(), soundcloudUrl: $('#scUrl').value.trim() || null, bio: $('#bio').value.trim() });
    ARTIST = r.artist; const t = await API.call('artist_me'); renderDash(t.tracks);
  } catch (e) { alert(e.message); }
};

/* ── upload + analysis ────────────────────────────────────────────────── */
async function sha256(buf) { const h = await crypto.subtle.digest('SHA-256', buf); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function decodeChecked(buf) {
  let ab;
  try { ab = await audioCtx().decodeAudioData(buf.slice(0)); } catch { throw new Error('This file could not be decoded. It may be corrupt or an unsupported codec.'); }
  if (ab.duration < 30) throw new Error('Tracks must be at least 30 seconds long.');
  if (ab.duration > 12 * 60) throw new Error('Tracks longer than 12 minutes are not supported yet.');
  const mono = new Float32Array(ab.length);
  for (let c = 0; c < ab.numberOfChannels; c++) { const d = ab.getChannelData(c); for (let i = 0; i < d.length; i++) mono[i] += d[i] / ab.numberOfChannels; }
  let peak = 0, sq = 0; for (let i = 0; i < mono.length; i += 4) { const v = Math.abs(mono[i]); if (v > peak) peak = v; sq += v * v; }
  const rms = Math.sqrt(sq / (mono.length / 4));
  if (peak < 0.01) throw new Error('The file is silent.');
  // playback loudness target −16 dBFS RMS, peak-safe; stored as a gain, the master is never altered
  const gain = Math.max(0.25, Math.min(Math.pow(10, -16 / 20) / (rms || 1), 0.977 / peak, 4));
  return { ab, mono, gain, peak, rms };
}
const summary = an => { const bars = Object.keys(an.energy).map(Number).sort((a, b) => a - b); return { bpm: an.bpm, downbeatSec: +an.downbeatSec.toFixed(4), barSec: +(an.beatSec * 4).toFixed(5), energy: bars.map(b => +an.energy[b].toFixed(2)), drops: an.drops }; };

async function buildCharts(mono, sampleRate) {
  log('Analysing tempo, beats, onsets, energy and structure…');
  await new Promise(r => setTimeout(r, 20));
  const t0 = performance.now();
  st.analysis = analyze(mono, sampleRate);
  log(`BPM ${st.analysis.bpm} · first downbeat ${st.analysis.downbeatSec.toFixed(3)} s · ${st.analysis.drops.length} drops · ${(performance.now() - t0).toFixed(0)} ms`);
  const g = generateAll(st.analysis, { trackId: st.trackId, chartVersion: 1 });
  st.charts = { easy: g.easy.chart, normal: g.normal.chart, expert: g.expert.chart };
  for (const d of ['easy', 'normal', 'expert']) log(`${d}: ${g[d].chart.notes.length} notes · validator ${g[d].report.ok ? 'PASS' : 'FAIL ' + g[d].report.errors.join('; ')}`);
  log('Saving charts to your account (server re-validates)…');
  const r = await API.call('track_charts', { trackId: st.trackId, charts: st.charts, analysis: summary(st.analysis), durationMs: st.durationMs });
  for (const d of Object.keys(r.charts)) if (!r.charts[d].validator.ok) log(`server validator: ${d} FAILED: ${r.charts[d].validator.errors.join('; ')}`);
  st.wave = waveform(mono, 4000);
}

$('#process').onclick = async () => {
  const f = $('#file').files[0];
  if (!$('#trackForm').reportValidity()) return;
  if (!f || !ACCEPT.test(f.name)) return status('Upload WAV, FLAC, MP3 or M4A.', true);
  if (f.size > MAX_BYTES) return status('That file is over 200 MB.', true);
  show('processing'); $('#plog').innerHTML = '';
  try {
    log('Reading and checking the file…');
    const buf = await f.arrayBuffer();
    const { ab, mono, gain, peak, rms } = await decodeChecked(buf);
    log(`OK · ${ab.duration.toFixed(1)} s · ${ab.sampleRate} Hz · ${ab.numberOfChannels} ch · peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS · RMS ${(20 * Math.log10(rms)).toFixed(1)} dBFS`);
    const ext = f.name.split('.').pop().toLowerCase();
    if (!st.trackId) {
      const c = await API.call('track_create', { title: $('#title').value.trim(), genre: $('#genre').value, explicit: $('#explicit').checked, soundcloudUrl: $('#scTrack').value.trim() || null, ext, bytes: f.size, mime: f.type || 'audio/' + ext });
      Object.assign(st, { trackId: c.trackId, slug: c.slug, upload: c.upload });
    }
    log('Uploading master to private storage…');
    await API.uploadSigned('kbeats-masters', st.upload.master.path, st.upload.master.token, f);
    log('Uploading gameplay copy…');
    await API.uploadSigned('kbeats-gameplay', st.upload.gameplay.path, st.upload.gameplay.token, f);
    st.durationMs = Math.round(ab.duration * 1000);
    await API.call('track_uploaded', { trackId: st.trackId, sha256: await sha256(buf), sampleRate: ab.sampleRate, channels: ab.numberOfChannels, durationMs: st.durationMs, gain });
    log('Upload saved.');
    st.buffer = ab;
    await buildCharts(mono, ab.sampleRate);
    openEditor('normal');
  } catch (e) { log('✖ ' + e.message); $('#plog').insertAdjacentHTML('beforeend', '<li><button class="btn ghost sm" id="retry">Back</button></li>'); $('#retry').onclick = () => show('track'); }
};

/* Resume a saved track from wherever it stopped. */
async function resume(trackId, row) {
  show('processing'); $('#plog').innerHTML = '';
  try {
    const r = await API.call('track_get', { trackId });
    Object.assign(st, { trackId, slug: r.track.slug, durationMs: r.track.durationMs, analysis: null });
    if (r.track.processing?.state === 'uploading' || !r.masterUrl) { $('#title').value = r.track.title; $('#genre').value = r.track.genre || 'Other'; status('The upload did not finish. Choose the file again to continue.'); st.trackId = null; show('track'); return; }
    log('Downloading your master (signed link)…');
    const buf = await (await fetch(r.masterUrl)).arrayBuffer();
    const { ab, mono } = await decodeChecked(buf);
    st.buffer = ab; st.wave = waveform(mono, 4000);
    if (Object.keys(r.charts).length < 3) { await buildCharts(mono, ab.sampleRate); }
    else { st.charts = r.charts; st.analysis = analyze(mono, ab.sampleRate); log(`Loaded saved charts: easy v${r.charts.easy.chartVersion}, normal v${r.charts.normal.chartVersion}, expert v${r.charts.expert.chartVersion}`); }
    openEditor('normal');
  } catch (e) { log('✖ ' + e.message); }
}

/* ── editor ───────────────────────────────────────────────────────────── */
function openEditor(diff) {
  show('editor');
  $('#edTitle').textContent = `Charts · ${st.analysis.bpm} BPM`;
  $('#playPreview').href = `/games/kbeats/play/#/track/${encodeURIComponent(st.slug)}`;
  $('#playPreview').hidden = true;      // drafts are playable by their artist once the gameplay copy is uploaded (see admin preview)
  document.querySelectorAll('[data-ed]').forEach(b => b.classList.toggle('on', b.dataset.ed === diff));
  editor ||= new ChartEditor($('#ed'), { ctx: audioCtx() });
  editor.load({ chart: st.charts[diff], wave: st.wave, duration: st.analysis.duration, bpm: st.analysis.bpm, gridStart: st.analysis.gridStart, buffer: st.buffer,
    onSave: async c => { st.charts[diff] = c; try { await API.call('track_charts', { trackId: st.trackId, charts: { [diff]: c }, durationMs: st.durationMs, source: 'edited' }); } catch (e) { alert('Could not save revision: ' + e.message); } refreshReport(); } });
  refreshReport();
}
function refreshReport() {
  $('#report').innerHTML = `<table><tr><th>Difficulty</th><th>Notes</th><th>Version</th><th>Validator</th><th></th></tr>${['easy', 'normal', 'expert'].map(d => { const r = validate(st.charts[d]);
    return `<tr><td>${d}</td><td>${st.charts[d].notes.length}</td><td>v${st.charts[d].chartVersion}</td><td style="color:${r.ok ? '#4ade80' : '#fb7185'}">${r.ok ? 'PASS' : 'FAIL'}</td><td>${esc(r.errors.slice(0, 2).join('; ') || (r.warnings.length ? r.warnings.length + ' warnings' : ''))}</td></tr>`; }).join('')}</table>`;
}
document.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => { editor?.commit(); openEditor(b.dataset.ed); });
$('#regen').onclick = async () => {
  const d = document.querySelector('[data-ed].on').dataset.ed, v = st.charts[d].chartVersion + 1;
  const g = generateChart(st.analysis, { trackId: st.trackId, chartVersion: v, difficulty: d });
  st.charts[d] = g.chart;
  try { await API.call('track_charts', { trackId: st.trackId, charts: { [d]: g.chart }, durationMs: st.durationMs, source: 'regenerated' }); } catch (e) { alert(e.message); }
  openEditor(d);
};
$('#toRights').onclick = () => {
  editor?.commit();
  const bad = ['easy', 'normal', 'expert'].filter(d => !validate(st.charts[d]).ok);
  if (bad.length) return alert('Fix the validator errors first: ' + bad.join(', '));
  $('#rights').innerHTML = RIGHTS.map(([k, l]) => `<label class="chk"><input type="checkbox" required data-r="${k}"> <span>${esc(l)}</span></label>`).join('');
  $('#agv').textContent = REVENUE.agreement_version;
  show('rights');
};
$('#submitBtn').onclick = async () => {
  if (!$('#rightsForm').reportValidity()) return;
  const items = Object.fromEntries([...document.querySelectorAll('[data-r]')].map(x => [x.dataset.r, x.checked]));
  try {
    await API.call('track_submit', { trackId: st.trackId, rights: { items, agreementAccepted: $('#agree').checked, legalName: ARTIST.legalName, email: ARTIST.email,
      writers: $('#writers').value.trim(), masterOwner: $('#masterOwner').value.trim(), publishingOwner: $('#pubOwner').value.trim(), isrc: $('#isrc').value.trim() || null, territories: $('#territories').value.trim() || null } });
    show('done');
  } catch (e) { alert(e.message); }
};

boot().catch(e => { document.querySelector('.wrap').insertAdjacentHTML('beforeend', `<p class="err">Could not reach KBeats: ${esc(e.message)}</p>`); });
