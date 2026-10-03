/* KBeats admin console. Access is enforced server-side (kbeats.admins); this page only renders what
   the API returns. Every action goes through admin_action / admin_revenue / admin_ledger /
   admin_settings, each of which writes an audit_log row on the server. */
import * as API from './api.js';
import { decodeNotes } from './chart.js';
import { LANES } from './config.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = c => (Number(c) / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
const when = d => d ? new Date(d).toLocaleString() : '—';
let O = null, tab = 'queue';

async function boot() {
  const s = await API.session({ guest: false }).catch(() => null);
  if (!s || s.user.is_anonymous) { $('#gate').innerHTML = 'Sign in with your KEEPITIL admin account on the <a href="/games/kbeats/submit/">artist portal</a> first, then reload.'; return; }
  $('#who').textContent = s.user.email || s.user.id;
  try { O = await API.call('admin_overview'); } catch (e) { $('#gate').innerHTML = `<span class="err">${esc(e.status === 403 ? 'This account is not a KBeats admin.' : e.message)}</span>`; return; }
  $('#gate').hidden = true; $('#app').hidden = false; render();
}
const reload = async () => { O = await API.call('admin_overview'); render(); };
document.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; document.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', x === b)); render(); });

function trackTable(rows) {
  return `<table><tr><th>Track</th><th>Artist</th><th>Status</th><th>Featured</th><th>Weight</th><th>Updated</th></tr>${rows.map(t => `<tr class="click" data-open="${t.id}"><td>${esc(t.title)}</td><td>${esc(t.stage_name)}${t.is_dev ? ' <span class="pill dev">DEV</span>' : ''}</td>
    <td><span class="st ${t.status}">${t.status}</span></td><td>${t.featured ? '★' : ''}</td><td>${t.rotation_weight}</td><td class="x">${when(t.updated_at)}</td></tr>`).join('')}</table>`;
}
function render() {
  const m = $('#main');
  if (tab === 'queue') { const q = O.tracks.filter(t => t.status === 'review'); m.innerHTML = `<div class="card"><h3>Awaiting review (${q.length})</h3>${q.length ? trackTable(q) : '<p class="x">Nothing waiting.</p>'}</div>`; }
  if (tab === 'tracks') m.innerHTML = `<div class="card"><h3>All tracks</h3>${trackTable(O.tracks)}</div>`;
  if (tab === 'artists') m.innerHTML = `<div class="card"><h3>Artists</h3><table><tr><th>Artist</th><th>Contact</th><th>SoundCloud</th><th>Tracks</th><th>Joined</th></tr>${O.artists.map(a => `<tr><td>${esc(a.stage_name)}${a.is_dev ? ' <span class="pill dev">DEV</span>' : ''}</td><td>${esc(a.contact_email || '')}</td><td>${a.soundcloud_url ? `<a href="${esc(a.soundcloud_url)}" target="_blank" rel="noopener">link</a>` : '—'}</td><td>${a.tracks}</td><td class="x">${when(a.created_at)}</td></tr>`).join('')}</table></div>`;
  if (tab === 'cases') m.innerHTML = `<div class="card"><h3>Rights disputes &amp; takedowns</h3>${O.cases.length ? `<table><tr><th>Track</th><th>Kind</th><th>Status</th><th>Claimant</th><th>Note</th><th>Opened</th></tr>${O.cases.map(c => `<tr class="click" data-open="${c.track_id}"><td>${esc(c.title)}</td><td>${c.kind}</td><td>${c.status}</td><td>${esc(c.claimant || '')}</td><td>${esc(c.note || '')}</td><td class="x">${when(c.created_at)}</td></tr>`).join('')}</table>` : '<p class="x">No cases.</p>'}</div>`;
  if (tab === 'audit') m.innerHTML = `<div class="card"><h3>Audit log (latest 100)</h3><table><tr><th>When</th><th>Action</th><th>Entity</th><th>Detail</th></tr>${O.audit.map(a => `<tr><td class="x">${when(a.at)}</td><td>${esc(a.action)}</td><td class="mono">${esc(a.entity)} ${esc(String(a.entity_id).slice(0, 36))}</td><td class="mono">${esc(JSON.stringify(a.detail)).slice(0, 160)}</td></tr>`).join('')}</table></div>`;
  if (tab === 'settings') renderSettings();
  if (tab === 'revenue') renderRevenue();
  m.querySelectorAll('[data-open]').forEach(r => r.onclick = () => openTrack(r.dataset.open));
}

async function renderSettings() {
  const r = await API.call('admin_settings', {});
  $('#main').innerHTML = `<div class="card"><h3>Release mode</h3><p class="x">DEV: test songs + debug tools (localhost only on the client). BETA: real accounts and backend; DEV tracks visible only if enabled below, always labelled. PRODUCTION: published artist tracks only, no development tracks, no QA tools.</p>
    <div class="acts"><select id="rm">${['dev', 'beta', 'production'].map(x => `<option ${x === r.releaseMode ? 'selected' : ''}>${x}</option>`).join('')}</select>
    <label><input type="checkbox" id="sd" ${r.betaShowDevTracks ? 'checked' : ''}> show DEV tracks in BETA</label><button class="btn sm primary" id="saveMode">Save</button></div></div>`;
  $('#saveMode').onclick = async () => { await API.call('admin_settings', { releaseMode: $('#rm').value, betaShowDevTracks: $('#sd').checked }); alert('Saved'); };
}

async function renderRevenue() {
  const r = await API.call('admin_ledger', {});
  const published = O.tracks.filter(t => !t.is_dev);
  $('#main').innerHTML = `<div class="card"><h3>Record attributable revenue</h3><p class="x">Integer cents. KBeats keeps 10%, the artist gets 90% of distributable (gross − store fees − adjustments). Entries are append-only; corrections are adjustment entries.</p>
    <div class="grid"><label>Track<br><select id="rt">${published.map(t => `<option value="${t.id}">${esc(t.title)} · ${esc(t.stage_name)}</option>`).join('')}</select></label>
      <label>Source<br><select id="rs"><option>ads</option><option>subscription</option><option>promotion</option><option>purchase</option><option>sponsorship</option></select></label>
      <label>Kind<br><select id="rk"><option value="revenue">revenue</option><option value="adjustment">adjustment</option></select></label>
      <label>Ref (for adjustments)<br><input id="rref" placeholder="event id"></label>
      <label>Gross (cents)<br><input id="rg" type="number" step="1"></label><label>Store fees (cents)<br><input id="rf" type="number" step="1" value="0"></label>
      <label>Period<br><input id="rp" placeholder="YYYY-MM" value="${new Date().toISOString().slice(0, 7)}"></label><label>Event id (idempotency)<br><input id="re" placeholder="auto"></label></div>
    <div class="acts"><button class="btn sm primary" id="addRev">Append entry</button><span id="rmsg" class="x"></span></div></div>
    <div class="card"><h3>Ledger (latest 200)</h3><table><tr><th></th><th>Event</th><th>Kind</th><th>Track</th><th>Gross</th><th>Distributable</th><th>Artist 90%</th><th>KBeats 10%</th><th>Period</th><th>Status</th></tr>
    ${r.ledger.map(e => `<tr><td><input type="checkbox" data-ev="${esc(e.event_id)}"></td><td class="mono">${esc(e.event_id)}</td><td>${e.kind}</td><td class="mono">${esc((O.tracks.find(t => t.id === e.track_id) || {}).title || '')}</td><td>${money(e.gross)}</td><td>${money(e.distributable)}</td><td>${money(e.artist_share)}</td><td>${money(e.platform_share)}</td><td>${e.period}</td><td><b>${e.status.toUpperCase()}</b></td></tr>`).join('')}</table>
    <div class="acts"><button class="btn sm ghost" id="fin">Finalize selected</button><button class="btn sm ghost" id="paid">Mark selected PAID (one artist-period)</button><input id="pref" placeholder="payout reference"></div></div>`;
  $('#addRev').onclick = async () => {
    try { const e = await API.call('admin_revenue', { trackId: $('#rt').value, source: $('#rs').value, kind: $('#rk').value, ref: $('#rref').value || null, gross: Number($('#rg').value), storeFees: Number($('#rf').value), period: $('#rp').value, eventId: $('#re').value || undefined });
      $('#rmsg').textContent = `Appended ${e.event_id}: artist ${money(e.artist_share)}, KBeats ${money(e.platform_share)} (${e.status})`; setTimeout(renderRevenue, 900); }
    catch (x) { $('#rmsg').textContent = x.message; }
  };
  const sel = () => [...document.querySelectorAll('[data-ev]:checked')].map(x => x.dataset.ev);
  $('#fin').onclick = async () => { try { await API.call('admin_ledger', { finalize: true, eventIds: sel() }); renderRevenue(); } catch (x) { alert(x.message); } };
  $('#paid').onclick = async () => { try { await API.call('admin_ledger', { markPaid: true, eventIds: sel(), providerRef: $('#pref').value || null }); renderRevenue(); } catch (x) { alert(x.message); } };
}

function miniChart(cv, chart) {
  const notes = decodeNotes(chart.notes), dur = chart.durationMs / 1000, g = cv.getContext('2d');
  cv.width = cv.clientWidth * 2; cv.height = 140; g.scale(2, 2); const W = cv.clientWidth;
  for (const n of notes) { g.fillStyle = LANES[n.lane].color; const x = n.t / dur * W, y = 6 + n.lane * 15; g.fillRect(x, y, n.type === 'hold' ? Math.max(2, n.dur / dur * W) : 2, n.type === 'swipe' ? 12 : 9); }
}

async function openTrack(id) {
  const r = await API.call('admin_track', { trackId: id });
  const t = r.track, latestSub = r.submissions[0];
  const subIds = latestSub ? Object.values(latestSub.charts) : [];
  $('#main').innerHTML = `<div class="card"><p><a href="#" id="back" class="x">← back</a></p>
    <h2>${esc(t.title)} <span class="st ${r.status}">${r.status}</span></h2><p class="x">${esc(t.artist)} · ${esc(t.genre || '')} · ${t.bpm} BPM · ${Math.round(t.durationSec || 0)} s · slug <span class="mono">${esc(t.slug)}</span></p>
    ${r.urls.master ? `<h4>Master (signed, 30 min)</h4><audio controls preload="none" src="${esc(r.urls.master)}" style="width:100%"></audio>` : '<p class="x">No uploaded master (development track: synthesized in the client).</p>'}
    <div class="acts"><a class="btn sm primary" href="/games/kbeats/play/?review=1#/track/${encodeURIComponent(t.slug)}" target="_blank">▶ Playtest (all difficulties)</a>
      ${t.soundcloud ? `<a class="btn sm ghost" href="${esc(t.soundcloud)}" target="_blank" rel="noopener">SoundCloud link</a>` : ''}</div></div>
    <div class="card"><h3>Moderation</h3><textarea id="note" rows="2" style="width:100%" placeholder="Note to artist / reason (stored in audit log)"></textarea>
      <div class="acts">${['approve', 'request_changes', 'reject', 'disable', 'restore'].map(a => `<button class="btn sm ${a === 'approve' ? 'primary' : 'ghost'}" data-a="${a}">${a.replace('_', ' ')}</button>`).join('')}
        <button class="btn sm ghost" data-a="feature" data-on="${!t.featured}">${t.featured ? 'Unfeature' : 'Feature'}</button>
        <label>Rotation weight <input id="w" type="number" min="0" max="10" step="0.1" value="1" style="width:70px"></label><button class="btn sm ghost" data-a="rotation">Set</button></div>
      <div class="acts"><input id="claimant" placeholder="Claimant (for dispute/takedown)"><button class="btn sm ghost" data-a="dispute">Open rights dispute (disables)</button><button class="btn sm ghost" data-a="takedown">Takedown</button></div><p id="amsg" class="x"></p></div>
    <div class="card"><h3>Rights attestation</h3>${r.rights.length ? r.rights.map(x => `<div class="grid"><div><b>Agreement</b><br>${esc(x.agreement_version)}<br><span class="x">${when(x.attested_at)}</span></div><div><b>Legal name</b><br>${esc(x.legal_name)}<br>${esc(x.contact_email)}</div>
      <div><b>Writers</b><br>${esc(x.writers)}</div><div><b>Master owner</b><br>${esc(x.master_owner)}</div><div><b>Publishing</b><br>${esc(x.publishing_owner)}</div><div><b>ISRC / territories</b><br>${esc(x.isrc || '—')} · ${esc(x.territories || 'worldwide')}</div>
      <div><b>Confirmed</b><br>${Object.entries(x.items).map(([k, v]) => `${v ? '✓' : '✗'} ${k}`).join('<br>')}</div></div>`).join('<hr>') : '<p class="x">No attestation on file.</p>'}</div>
    <div class="card"><h3>Chart versions</h3>${r.versions.map(v => `<div style="margin:10px 0"><b>${v.difficulty}</b> v${v.chart_version} · ${v.note_count} notes · ${v.source} · validator <b style="color:${v.validator?.ok ? '#4ade80' : '#fb7185'}">${v.validator?.ok ? 'PASS' : 'FAIL'}</b> · <span class="mono">${v.hash}</span> ${subIds.includes(v.id) ? '<span class="st review">submitted</span>' : ''}
      <canvas class="mini" data-v="${v.id}"></canvas></div>`).join('')}</div>
    <div class="card"><h3>History</h3><table>${r.audit.map(a => `<tr><td class="x">${when(a.at)}</td><td>${esc(a.action)}</td><td class="mono">${esc(JSON.stringify(a.detail)).slice(0, 140)}</td></tr>`).join('')}</table></div>`;
  for (const v of r.versions) miniChart(document.querySelector(`[data-v="${v.id}"]`), v.chart);
  $('#back').onclick = e => { e.preventDefault(); reload(); };
  document.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
    try { const x = await API.call('admin_action', { trackId: id, action: b.dataset.a, note: $('#note').value || null, on: b.dataset.on === 'true', weight: Number($('#w').value), claimant: $('#claimant').value || null });
      $('#amsg').textContent = `${b.dataset.a}: now ${x.status}`; O = await API.call('admin_overview'); setTimeout(() => openTrack(id), 600); }
    catch (e) { $('#amsg').textContent = e.message; }
  });
}
boot();
