// node --test assets/js/free-event-flow.test.mjs   (jsdom only, no network)
//
// FREE event flow for members (KEEPITIL 1.0, Joe 2026-11-22: "event creation and management").
// Community calendar listings still use /submit-event. Hosted events use /create-event for every signed-in account
// (the header button is not rewritten). Community rows still edit at /submit-event?edit=<id>.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const SUBMIT = read('submit-event.html');
const DASH = read('dashboard.html');
const noComments = (h) => h.replace(/<!--[\s\S]*?-->/g, '');

/* ── submit-event ─────────────────────────────────────────────────────────────────────────── */
export function submitProblems(html) {
  const p = [];
  const m = noComments(html);
  // Every /create-event link must sit inside the admin-only #hostLink span.
  const outside = m.replace(/<span id="hostLink" hidden>[\s\S]*?<\/span>/, '');
  if (/href="\/create-event/.test(outside.replace(/<script[\s\S]*?<\/script>/g, ''))) p.push('member-visible link to team-only /create-event (loops back)');
  if (!/<div class="sub" id="whyNote" hidden/.test(m)) p.push('no explanation for ?why=keepitil-events-are-company-only');
  if (!/qs\.get\('why'\)==='keepitil-events-are-company-only'\) \$\('whyNote'\)\.hidden=false/.test(m)) p.push('whyNote is never shown');
  if ((m.match(/\}\)\.catch\(offline\);/g) || []).length !== 2) p.push('submit/update do not both handle a network failure');
  if (!/if\(!EDIT_ID && \$\('date'\)\.value < laToday\(\)\)/.test(m)) p.push('no past-date guard on new listings');
  if (/startsISO=new Date\(\$\('date'\)\.value\+'T'/.test(m)) p.push('edit path reads the browser time zone');
  if (!/var want=qs\.get\('edit'\);/.test(m)) p.push('no ?edit=<id> deep link');
  return p;
}

function laFns(html) {
  const src = /function laWallToISO[\s\S]*?\n}\nfunction laToday\(\)\{[^\n]*\n/.exec(html)[0];
  return new Function(src + ';return {laWallToISO,laToday};')();
}

test('submit-event: no loop to /create-event, explains the bounce, handles failures, guards dates, supports ?edit=', () => {
  assert.deepEqual(submitProblems(SUBMIT), []);
});

test('submit-event: edits are placed in Pacific time whatever the browser zone (standard, daylight, DST day)', () => {
  const { laWallToISO, laToday } = laFns(SUBMIT);
  assert.equal(laWallToISO('2026-11-28', '21:00'), '2026-11-29T05:00:00.000Z');
  assert.equal(laWallToISO('2026-07-04', '09:30'), '2026-07-04T16:30:00.000Z');
  assert.equal(laWallToISO('2026-03-08', '03:00'), '2026-03-08T10:00:00.000Z');
  assert.equal(laWallToISO('not-a-date', '21:00'), null);
  assert.match(laToday(), /^\d{4}-\d{2}-\d{2}$/);
});

/* ── dashboard ────────────────────────────────────────────────────────────────────────────── */
const BLOCK = /<script>\n\/\* ── YOUR CALENDAR LISTINGS[\s\S]*?<\/script>/.exec(DASH)?.[0] || '';

async function runListings({ rows = [], admin = false, error = null } = {}) {
  const vc = new VirtualConsole();
  const html = '<!doctype html><body><div class="head"><a class="btn prim" href="/create-event">+ Create Event</a></div>'
    + '<div class="panel on" id="tab-events"><div id="list"></div></div>'
    + '<script>var supa={auth:{getSession:function(){return Promise.resolve({data:{session:{user:{id:"u"}}}});}},'
    + 'rpc:function(fn){ if(fn==="is_admin") return Promise.resolve({data:' + admin + '});'
    + ' if(fn==="get_my_community_events") return Promise.resolve({data:' + JSON.stringify(rows) + ',error:' + JSON.stringify(error) + '});'
    + ' return Promise.resolve({data:null}); }};</script>'
    + BLOCK.replace(/<script>\nvar SUPA_URL=$/, '') + '</body>';
  const dom = new JSDOM(html, { url: 'https://keepitil.com/dashboard', runScripts: 'dangerously', virtualConsole: vc });
  await new Promise((r) => setTimeout(r, 30));
  return dom.window.document;
}

test('dashboard: lists the member\'s calendar submissions with status and an Edit link (escaped)', async () => {
  assert.ok(BLOCK, 'listings block present');
  assert.match(BLOCK, /supa\.rpc\('get_my_community_events'\)/);
  const doc = await runListings({ rows: [
    { id: 41, title: 'Warehouse <b>night</b>', venue: 'The Room', city: 'Los Angeles', starts_at: '2026-12-05T05:00:00Z', status: 'review' },
    { id: 42, title: 'Day party', venue: 'Roof', city: 'Santa Ana', starts_at: '2026-12-12T20:00:00Z', status: 'published' },
  ] });
  const cards = doc.querySelectorAll('#listings .ev');
  assert.equal(cards.length, 2);
  assert.equal(cards[0].querySelector('.ev-badge').textContent, 'In review');
  assert.equal(cards[1].querySelector('.ev-badge').textContent, 'Live');
  assert.equal(cards[0].querySelector('.ev-acts a').getAttribute('href'), '/submit-event?edit=41');
  assert.equal(cards[0].querySelector('.ev-title').textContent, 'Warehouse <b>night</b>', 'title rendered as text, not HTML');
  assert.equal(doc.querySelector('.head a.btn.prim').getAttribute('href'), '/create-event', 'signed-in accounts keep + Create Event');
  assert.equal(doc.querySelector('.head a.btn.prim').textContent, '+ Create Event');
});

test('dashboard: an empty community list renders nothing; an error says so; the header stays on /create-event', async () => {
  const adm = await runListings({ rows: [], admin: true });
  assert.equal(adm.querySelector('.head a.btn.prim').getAttribute('href'), '/create-event');
  const member = await runListings({ rows: [], admin: false });
  assert.equal(member.querySelector('.head a.btn.prim').getAttribute('href'), '/create-event');
  assert.equal(adm.getElementById('listings').innerHTML, '');
  const err = await runListings({ rows: [], error: { message: 'x' } });
  assert.match(err.getElementById('listings').textContent, /Could not load your listings/);
});

test('create-event does not bounce a signed-in account, and dashboard keeps admin panels behind is_admin', () => {
  const create = read('create-event.html');
  assert.doesNotMatch(create, /keepitil-events-are-company-only/);
  assert.doesNotMatch(create, /rpc\('is_admin'\)/);
  assert.match(DASH, /if\(ADMIN_PANELS\[name\] && !IS_ADMIN\) return;/);
  assert.match(DASH, /staging:1,qa:1,recommendations:1/);
  assert.doesNotMatch(DASH, /hb\.href='\/submit-event'/);
  assert.match(read('keepitil-shell.js'), /item\('Event','\/create-event'\)/);
});

test('dashboard: the empty state sends every signed-in account to /create-event, with no review-queue copy', () => {
  assert.match(DASH, /<h2>No hosted events yet<\/h2>[^\n]*href="\/create-event">\+ Create Event<\/a>/);
  assert.match(DASH, /It goes live as soon as you submit it/);
  assert.doesNotMatch(DASH, /reviewed before it goes live/);
  assert.doesNotMatch(DASH, /Listings are reviewed before they go live/);
  assert.doesNotMatch(DASH, /Create your first event and start selling tickets/);
});

/* ── NEGATIVE CONTROLS ────────────────────────────────────────────────────────────────────── */
test('negative controls: the pre-fix submit page fails every check', () => {
  const old = SUBMIT
    .replace(/<span id="hostLink" hidden>([\s\S]*?)<\/span>/, '$1')
    .replace(/<div class="sub" id="whyNote" hidden/, '<div class="sub"')
    .replace(/\}\)\.catch\(offline\);/g, '});')
    .replace("if(!EDIT_ID && $('date').value < laToday())", 'if(false)')
    .replace("startsISO=laWallToISO($('date').value, $('time').value||'21:00');", "startsISO=new Date($('date').value+'T'+($('time').value||'21:00')).toISOString();")
    .replace("var want=qs.get('edit');", 'var want=null;');
  const p = submitProblems(old);
  for (const k of ['loops back', 'no explanation', 'network failure', 'past-date', 'browser time zone', '?edit=']) {
    assert.ok(p.some((x) => x.includes(k)), k + ' not caught: ' + p.join('; '));
  }
});
