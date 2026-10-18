/* KBeats admin — artist intake operations view + owner catalog import. Everything is server-enforced
   (admin_* ops check kbeats.admins and write audit rows); Nexus drives the workflow, this page shows
   it and lets KEEPITIL make the decisions that stay human (split acceptance, reviews, attestations). */
import * as API from './api.js';
import { RIGHTS_ITEMS, parseCatalog } from './intake.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const when = d => d ? new Date(d).toLocaleString() : '—';
const pct = b => b == null ? '—' : (b / 100).toFixed(2).replace(/\.00$/, '') + '%';
const FILTERS = [['attention', 'Needs attention'], ['artist', 'Waiting on artist'], ['admin', 'Waiting on admin'], ['processing', 'Processing'], ['review', 'Ready for review'], ['live', 'Live'], ['failed', 'Failed'], ['rights', 'Rights issue'], ['identity', 'Identity conflict'], ['all', 'All']];
const RIGHTS_TEXT = {
  master: 'KEEPITIL controls (or is authorized to license) the master recordings.',
  composition: 'KEEPITIL controls or holds sufficient authorization for the composition/publishing rights for this use.',
  samples: 'Samples, loops, beats and third-party material are cleared for this use.',
  storage_gameplay: 'KBeats may store and use the masters for interactive gameplay.',
  analysis_charts: 'KBeats may analyze the masters and create rhythm charts.',
  previews: 'KBeats may use reasonable gameplay previews/clips.',
  agreement: 'The current KBeats Artist Agreement applies.',
};
let filter = 'attention';

export async function renderIntake(m) {
  m.innerHTML = '<div class="card">Loading intake…</div>';
  const r = await API.call('admin_intakes', { filter });
  const ok = v => v ? '✓' : '—';
  m.innerHTML = `<div class="card"><h3>Artist intake <span class="x">SoundCloud split → Nexus → KBeats</span></h3>
    <div class="tabs">${FILTERS.map(([k, l]) => `<button data-f="${k}" class="${k === filter ? 'on' : ''}">${l}</button>`).join('')}<button id="ob" class="btn sm ghost" style="margin-left:auto">Nexus relay</button></div>
    ${r.intakes.length ? `<div style="overflow-x:auto"><table><tr><th>Artist</th><th>Track</th><th>SoundCloud</th><th>Split</th><th>Authorization</th><th>Master</th><th>Charts</th><th>Review</th><th>State</th><th>Waiting on</th><th>Last activity</th></tr>
    ${r.intakes.map(i => `<tr class="click" data-i="${i.id}"><td>${esc(i.artist || '—')}</td><td>${esc(i.track || '—')}</td>
      <td>${i.scTrack ? `<a href="${esc(i.scTrack)}" target="_blank" rel="noopener">track</a>` : '—'}</td>
      <td>${esc(i.split || '—')} ${pct(i.offeredBps)}</td><td>${ok(i.authorized)}</td><td>${i.masterSha256 ? '✓' : '—'}</td><td>${i.charts}/3</td>
      <td>${esc(i.trackStatus || '—')}</td><td><span class="st">${esc(i.status)}</span>${i.lastError ? `<br><span class="err x">${esc(i.lastError)}</span>` : ''}</td><td>${esc(i.waitingOn)}</td><td class="x">${when(i.lastActivity)}</td></tr>`).join('')}</table></div>` : '<p class="x">Nothing here.</p>'}</div>`;
  m.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; renderIntake(m); });
  m.querySelectorAll('[data-i]').forEach(row => row.onclick = () => openIntake(m, row.dataset.i));
  m.querySelector('#ob').onclick = () => openOutbox(m);
}

async function openIntake(m, id) {
  const d = await API.call('admin_intake', { intakeId: id });
  const i = d.intake, ev = d.evidence;
  const btn = (k, l, cls = 'ghost') => `<button class="btn sm ${cls}" data-act="${k}">${l}</button>`;
  m.innerHTML = `<div class="card"><p><a href="#" id="back" class="x">← intake queue</a></p>
    <h3>${esc(i.track_title || 'Untitled')} <span class="x">by ${esc(i.artist_name || '—')}</span></h3>
    <div class="grid">
      <div><b>State</b><br><span class="st">${esc(i.status)}</span> <span class="x">${esc(i.last_error || '')}</span></div>
      <div><b>Source</b><br>${esc(i.source)} · <span class="mono">${esc(i.mail_message_id || '')}</span></div>
      <div><b>SoundCloud</b><br>${i.sc_profile_url ? `<a href="${esc(i.sc_profile_url)}" target="_blank" rel="noopener">profile</a>` : '—'} · ${i.sc_track_url ? `<a href="${esc(i.sc_track_url)}" target="_blank" rel="noopener">track</a>` : '—'}</div>
      <div><b>Offered split</b><br>${pct(i.offered_split_bps)} · ${esc(ev.split?.decision || '—')}</div>
      <div><b>Nexus work item</b><br><span class="mono">${esc(i.nexus_work_item_id || '— (not linked yet)')}</span></div>
      <div><b>Email authenticity</b><br>${i.authenticity?.verified ? '✓ verified' : `<span class="err">not verified</span><br><span class="x">${esc((i.authenticity?.kbeats?.reasons || []).join('; '))}</span>`}</div>
    </div>
    <p style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
      ${['AWAITING_SPLIT_DECISION', 'NEEDS_INFORMATION'].includes(i.status) ? btn('accept', 'ACCEPT split', 'primary') + btn('reject', 'REJECT') + btn('info', 'REQUEST INFO') : ''}
      ${['NEEDS_REVIEW', 'IDENTITY_CONFLICT', 'PROCESSING_FAILED'].includes(i.status) ? btn('clear', 'Mark reviewed → split decision', 'primary') + btn('dup', 'Mark duplicate') + btn('rej', 'Reject intake') : ''}
      ${i.track_id && ['MASTER_RECEIVED', 'CHARTED', 'SPLIT_ACCEPTED', 'AWAITING_MASTER'].includes(i.status) && ev.authorizations.length ? btn('process', 'Process now (verify master → charts → submit)') : ''}
      ${i.track_id ? `<a class="btn sm ghost" href="#" data-open-track="${i.track_id}">Open track review</a>` : ''}
    </p>
    <p class="x" id="msg"></p></div>
    <div class="card"><h3>Evidence</h3><div class="grid">
      <div><b>Authorization</b><br>${ev.authorizations.map(a => `${esc(a.kind)} · ${esc(a.agreement_version)} · <span class="mono">${esc(a.id.slice(0, 8))}</span>`).join('<br>') || '—'}</div>
      <div><b>Master</b><br>${ev.master ? `<span class="mono">${esc(ev.master.path)}</span><br>sha256 <span class="mono">${esc((ev.master.sha256 || 'not verified').slice(0, 16))}</span>` : '—'}</div>
      <div><b>Charts</b><br>${ev.charts.map(c => `${c.difficulty} v${c.chart_version} <span class="mono">${esc(c.hash)}</span> ${c.ok ? '✓' : '✗'}`).join('<br>') || '—'}</div>
      <div><b>Review</b><br>${ev.submission ? `${esc(ev.submission.status)} · ${when(ev.submission.submitted_at)}` : '—'} · track ${esc(ev.track?.status || '—')}</div>
    </div></div>
    <div class="card"><h3>Artist sees</h3><p>${d.artistTimeline.steps.map(s => `${s.done ? '●' : '○'} ${esc(s.label)}`).join(' &nbsp; ')}</p>${d.artistTimeline.action ? `<p><b>${esc(d.artistTimeline.action.label)}</b> — ${esc(d.artistTimeline.action.detail)}</p>` : ''}</div>
    <div class="card"><h3>Nexus</h3><p class="x">Capability calls received (idempotent) and events relayed to Nexus.</p>
      <table><tr><th>When</th><th>Capability</th><th>Key</th><th>Result</th></tr>${d.nexusActions.map(a => `<tr><td class="x">${when(a.created_at)}</td><td class="mono">${esc(a.action)}</td><td class="mono">${esc(a.idempotency_key)}</td><td>${a.status}</td></tr>`).join('') || '<tr><td colspan="4" class="x">none yet</td></tr>'}</table>
      <table style="margin-top:8px"><tr><th>Relayed event</th><th>Status</th><th>Attempts</th><th>Next retry</th><th>Last error</th></tr>${d.nexusOutbox.map(o => `<tr><td class="mono">${esc(o.capability)}</td><td>${esc(o.status)}</td><td>${o.attempts}</td><td class="x">${when(o.next_attempt_at)}</td><td class="err x">${esc(o.last_error || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="x">none</td></tr>'}</table></div>
    <div class="card"><h3>Audit timeline</h3><table><tr><th>When</th><th>Actor</th><th>Action</th><th>Detail</th></tr>${d.audit.map(a => `<tr><td class="x">${when(a.at)}</td><td>${esc(a.actor_kind || '—')}</td><td>${esc(a.action)}</td><td class="mono">${esc(JSON.stringify(a.detail)).slice(0, 200)}</td></tr>`).join('')}</table>
      <p class="x">Links: ${d.links.map(l => `${l.purpose} ${l.used_at ? 'used' : l.revoked_at ? 'replaced' : new Date(l.expires_at) < new Date() ? 'expired' : 'open'}`).join(' · ') || 'none'}</p></div>`;
  m.querySelector('#back').onclick = e => { e.preventDefault(); renderIntake(m); };
  const run = async (fn) => { const msg = m.querySelector('#msg'); msg.textContent = 'Working…'; try { await fn(); openIntake(m, id); } catch (e) { msg.innerHTML = `<span class="err">${esc(e.message)}</span>`; } };
  const note = () => prompt('Note (optional, stored in the audit log):') || null;
  m.querySelectorAll('[data-act]').forEach(b => b.onclick = () => ({
    accept: () => run(() => API.call('admin_split_decide', { intakeId: id, decision: 'accepted', note: note() })),
    reject: () => run(() => API.call('admin_split_decide', { intakeId: id, decision: 'rejected', note: note() })),
    info: () => run(() => API.call('admin_split_decide', { intakeId: id, decision: 'info_requested', note: note() })),
    clear: () => run(() => API.call('admin_intake_review', { intakeId: id, outcome: 'clear', note: note() })),
    dup: () => run(() => API.call('admin_intake_review', { intakeId: id, outcome: 'duplicate', note: note() })),
    rej: () => run(() => API.call('admin_intake_review', { intakeId: id, outcome: 'reject', note: note() })),
    process: () => run(() => API.call('admin_intake_process', { intakeId: id }, { timeoutMs: 120000 })),
  })[b.dataset.act]());
  m.querySelector('[data-open-track]')?.addEventListener('click', e => { e.preventDefault(); window.dispatchEvent(new CustomEvent('kb-open-track', { detail: i.track_id })); });
}

async function openOutbox(m) {
  const r = await API.call('admin_nexus_outbox');
  m.innerHTML = `<div class="card"><p><a href="#" id="back" class="x">← intake queue</a></p><h3>KBeats → Nexus relay</h3>
    <p class="x">Events KBeats relays to Nexus (POST /api/v1/app, server-side). Flushed now: sent ${r.flushed.sent} of ${r.flushed.considered}.</p>
    <table><tr><th>Created</th><th>Capability</th><th>Status</th><th>Attempts</th><th>Next retry</th><th>Last error</th></tr>${r.outbox.map(o => `<tr><td class="x">${when(o.created_at)}</td><td class="mono">${esc(o.capability)}</td><td>${esc(o.status)}</td><td>${o.attempts}</td><td class="x">${when(o.next_attempt_at)}</td><td class="err x">${esc(o.last_error || '')}</td></tr>`).join('') || '<tr><td colspan="6" class="x">empty</td></tr>'}</table></div>`;
  m.querySelector('#back').onclick = e => { e.preventDefault(); renderIntake(m); };
}

/* ── owner catalog bulk import ─────────────────────────────────────────── */
export function renderImport(m) {
  m.innerHTML = `<div class="card"><h3>Owner catalog import</h3>
    <p class="x">1) Upload masters with the <a href="/games/kbeats-preview/admin/upload/">owner upload page</a> (staging) into <span class="mono">kbeats-masters/owner-import/&lt;folder&gt;/</span>; its preview inventory gives you the catalog JSON to paste here — or paste your own catalog (CSV with a header row, or JSON) — columns: title, artist, album, isrc, duration, soundcloud_url, soundcloud_id, file. 3) Plan: KBeats matches rows to masters conservatively (ID/ISRC/checksum/file, or title + duration). Title-only matches are never processed automatically. Nothing is published from here; every track still goes through review.</p>
    <div class="grid">
      <label>Owner artist slug<br><input id="own" placeholder="your KBeats artist slug"></label>
      <label>Masters folder<br><input id="pre" placeholder="owner-import/catalog-2026"></label>
      <label>Batch label<br><input id="lab" placeholder="e.g. SoundCloud catalog Oct 2026"></label>
    </div>
    <p><textarea id="cat" rows="8" style="width:100%" placeholder="title,artist,duration,isrc,soundcloud_url,file&#10;Song A,Me,3:21,USAB12400001,https://soundcloud.com/me/song-a,song-a.wav"></textarea></p>
    <p><button class="btn primary" id="plan">Plan import</button> <span class="x" id="pmsg"></span></p></div><div id="batch"></div>`;
  m.querySelector('#cat').oninput = () => { try { m.querySelector('#pmsg').textContent = `${parseCatalog(m.querySelector('#cat').value).length} rows parsed`; } catch (e) { m.querySelector('#pmsg').textContent = e.message; } };
  m.querySelector('#plan').onclick = async () => {
    const msg = m.querySelector('#pmsg'); msg.textContent = 'Planning…';
    try {
      const catalog = m.querySelector('#cat').value;
      const key = 'ui-' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(catalog + m.querySelector('#pre').value)))).slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
      const r = await API.call('admin_import_plan', { ownerArtistSlug: m.querySelector('#own').value.trim(), mastersPrefix: m.querySelector('#pre').value.trim(), label: m.querySelector('#lab').value.trim(), catalog, idempotencyKey: key }, { timeoutMs: 120000 });
      msg.textContent = r.existing ? 'This exact catalog + folder was already planned — showing that batch.' : '';
      openBatch(m.querySelector('#batch'), r.batchId);
    } catch (e) { msg.innerHTML = `<span class="err">${esc(e.message)}</span>`; }
  };
}

async function openBatch(el, batchId) {
  const r = await API.call('admin_import_batch', { batchId }), r0 = r;
  const s = r.batch.summary || {};
  const auto = r.items.filter(i => i.track_id);
  el.innerHTML = `<div class="card"><h3>Batch ${esc(r.batch.label || '')} <span class="x mono">${esc(batchId.slice(0, 8))}</span></h3>
    <p>${s.matched || 0} matched (${s.autoEligible || 0} with strong evidence) · ${s.titleOnly || 0} title-only · ${s.ambiguous || 0} ambiguous · ${s.unmatched || 0} unmatched · ${s.mastersFound || 0} masters found${(s.unusedMasters || []).length ? ` · ${(s.unusedMasters || []).length} masters not in the catalog` : ''}</p>
    <table><tr><th>#</th><th>Title</th><th>Match</th><th>Evidence</th><th>Master</th><th>Draft</th><th></th></tr>${r.items.map(i => `<tr><td>${i.row_no + 1}</td><td>${esc(i.meta.title)}</td>
      <td>${esc(i.match_status)}${i.auto_eligible ? '' : i.match_status === 'matched' ? ' <span class="err x">needs confirmation</span>' : ''}</td><td class="mono">${esc(JSON.stringify(i.evidence)).slice(0, 80)}</td>
      <td class="mono">${esc((i.master_path || '').split('/').pop())}</td><td>${i.track_id ? `${esc(i.track_status)}${i.intake_status ? ' · ' + esc(i.intake_status) : ''}` : '—'}</td>
      <td>${!i.track_id && i.master_path ? `<button class="btn sm ghost" data-confirm="${i.id}" data-path="${esc(i.master_path)}">Confirm match</button>` : ''}</td></tr>`).join('')}</table>
    ${(s.unusedMasters || []).length ? `<p class="x">Masters with no catalog row: ${s.unusedMasters.map(p => esc(p.split('/').pop())).join(', ')}</p>` : ''}
    <h3 style="margin-top:14px">Owner attestation for ${auto.length} track${auto.length === 1 ? '' : 's'}</h3>
    <p class="x">Recorded once per track with the explicit track IDs below — the same audit model as artist authorizations.</p>
    ${RIGHTS_ITEMS.map(k => `<label style="display:block"><input type="checkbox" data-r="${k}"> ${esc(RIGHTS_TEXT[k])}</label>`).join('')}
    <p><button class="btn primary" id="att" ${auto.length ? '' : 'disabled'}>Attest ${auto.length} tracks</button> <button class="btn ghost" id="proc" ${auto.length ? '' : 'disabled'}>Process attested tracks</button> <span class="x" id="bmsg"></span></p></div>`;
  el.querySelectorAll('[data-confirm]').forEach(b => b.onclick = async () => {
    if (!confirm(`Confirm "${b.dataset.path.split('/').pop()}" is the master for this row?`)) return;
    try { await API.call('admin_import_confirm', { itemId: b.dataset.confirm, masterPath: b.dataset.path }); openBatch(el, batchId); } catch (e) { alert(e.message); }
  });
  el.querySelector('#att').onclick = async () => {
    const items = Object.fromEntries([...el.querySelectorAll('[data-r]')].map(x => [x.dataset.r, x.checked]));
    const msg = el.querySelector('#bmsg');
    try { const r = await API.call('admin_import_attest', { batchId, trackIds: auto.map(i => i.track_id), items, agreementVersion: r0.agreementVersion, scope: 'batch' }); msg.textContent = `Attested ${r.attested.length}.`; openBatch(el, batchId); }
    catch (e) { msg.innerHTML = `<span class="err">${esc(e.message)}</span>`; }
  };
  el.querySelector('#proc').onclick = async () => {
    const msg = el.querySelector('#bmsg'); let ok = 0, bad = [];
    for (const it of auto) {
      msg.textContent = `Processing ${ok + bad.length + 1}/${auto.length}: ${it.meta.title}…`;
      try { await API.call('admin_intake_process', { intakeId: it.intake_id }, { timeoutMs: 150000 }); ok++; } catch (e) { bad.push(`${it.meta.title}: ${e.message}`); }
    }
    msg.innerHTML = `${ok} submitted for review.${bad.length ? `<br><span class="err">${bad.map(esc).join('<br>')}</span>` : ''}`;
  };
}
