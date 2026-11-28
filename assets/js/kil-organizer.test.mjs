// Organizer view (assets/js/kil-organizer.js): rendering + mounting under jsdom with a fake Supabase client. Run: node --test assets/js/kil-organizer.test.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const O = require('./kil-organizer.js');
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const mk = () => { const dom = new JSDOM('<!doctype html><div id="tab-events"><div id="org-view"></div><div id="listings">OLD</div></div>'); return { dom, doc: dom.window.document, host: dom.window.document.getElementById('org-view') }; };
const EV = (o) => Object.assign({ id: 7, slug: 'big-night', title: 'Big Night', starts_at: '2026-12-10T05:00:00Z', status: 'published', review_reason: null, city: 'Long Beach', venue: 'The Room', source: 'organizer', rsvp_count: 3, paid_tickets: 0 }, o || {});
const fake = (resp, session = true, admin = true) => ({ calls: [], auth: { getSession: () => Promise.resolve({ data: { session: session ? { user: {} } : null } }) }, rpc(n) { this.calls.push(n); if (n === 'is_admin') return typeof admin === 'function' ? admin() : Promise.resolve({ data: admin, error: null }); return Promise.resolve(typeof resp === 'function' ? resp() : resp); } });

test('render: an event shows title, date, venue/city, status, people going, and an edit link; a published title links to the public page', () => {
  const { doc } = mk(); const n = O.render(doc, { connect: 'connected', events: [EV()] }, { admin: true });
  const row = n.querySelector('.org-ev'); assert.equal(row.querySelector('.ev-title').textContent, 'Big Night'); assert.equal(row.querySelector('a.ev-title').getAttribute('href'), '/event?e=big-night');
  assert.match(row.querySelector('.ev-meta').textContent, /Wed, Dec 9, 2026 · The Room · Long Beach/); assert.equal(row.querySelector('.ev-badge').textContent, 'Live');
  assert.equal(row.querySelector('.org-rsvp').textContent, '3 people going'); assert.equal(row.querySelector('.org-paid'), null, 'no paid tickets: no tickets line');
  assert.equal(row.querySelector('.org-edit').getAttribute('href'), '/create-event?e=big-night');
});
test('render: singular/plural, paid tickets appear only when > 0, hostile numbers are clamped', () => {
  const { doc } = mk(); const n = O.render(doc, { connect: 'connected', events: [EV({ rsvp_count: 1, paid_tickets: 1 }), EV({ id: 8, rsvp_count: -5, paid_tickets: 'x' }), EV({ id: 9, rsvp_count: '12', paid_tickets: 40 })] });
  const rs = [...n.querySelectorAll('.org-ev')]; assert.equal(rs[0].querySelector('.org-rsvp').textContent, '1 person going'); assert.equal(rs[0].querySelector('.org-paid').textContent, '1 ticket sold');
  assert.equal(rs[1].querySelector('.org-rsvp').textContent, '0 people going'); assert.equal(rs[1].querySelector('.org-paid'), null);
  assert.equal(rs[2].querySelector('.org-rsvp').textContent, '12 people going'); assert.equal(rs[2].querySelector('.org-paid').textContent, '40 tickets sold');
});
test('render: a held event shows its review reason; a published or draft event never does (even if a reason is present)', () => {
  const { doc } = mk(); const n = O.render(doc, { connect: 'connected', events: [EV({ id: 1, status: 'review', review_reason: 'missing venue' }), EV({ id: 2, status: 'published', review_reason: 'stale reason' }), EV({ id: 3, status: 'draft', review_reason: 'x' })] });
  const rs = [...n.querySelectorAll('.org-ev')]; assert.equal(rs[0].querySelector('.ev-badge').textContent, 'In review'); assert.equal(rs[0].querySelector('.org-reason').textContent, 'Held for review: missing venue');
  assert.equal(rs[0].querySelector('a.ev-title'), null, 'an event in review has no public page to link to');
  assert.equal(rs[1].querySelector('.org-reason'), null); assert.equal(rs[2].querySelector('.org-reason'), null);
});
test('render: Connect status in the three states; a link to the EXISTING flow only when action is needed; connected has no link; an unknown value is treated as not connected', () => {
  const { doc } = mk(); const q = (c) => O.render(doc, { connect: c, events: [] }, { admin: true }).querySelector('.org-connect');
  assert.equal(q('connected').querySelector('.org-connect-state').textContent, 'Connected'); assert.equal(q('connected').querySelector('a'), null);
  assert.equal(q('needs_action').querySelector('.org-connect-state').textContent, 'Needs action'); assert.equal(q('needs_action').querySelector('a').getAttribute('href'), '/create-event');
  assert.equal(q('not_connected').querySelector('.org-connect-state').textContent, 'Not connected'); assert.equal(q('not_connected').querySelector('a').getAttribute('href'), '/create-event');
  assert.equal(q('banana').getAttribute('data-connect'), 'not_connected'); assert.equal(q(undefined).querySelector('.org-connect-state').textContent, 'Not connected');
  const all = ['connected', 'needs_action', 'not_connected'].map((c) => q(c).outerHTML).join(''); assert.doesNotMatch(all, /stripe\.com|checkout|payout\?|transfer|button|<form/i, 'only a link to our own flow, no money control');
});
test('render: edit links follow the source (community -> /submit-event?edit=<id>, else /create-event?e=<slug>), and an unusable slug gets no link', () => {
  assert.equal(O.editHref(EV({ source: 'community', id: 42 })), '/submit-event?edit=42'); assert.equal(O.editHref(EV({ source: 'organizer' })), '/create-event?e=big-night'); assert.equal(O.editHref(EV({ source: 'organizer' }), false), '/create-event?e=big-night');
  assert.equal(O.editHref(EV({ slug: '../../x"onload=1' }), true), null); assert.equal(O.editHref(EV({ slug: null }), true), null);
  const { doc } = mk(); assert.equal(O.render(doc, { connect: 'connected', events: [EV({ slug: 'bad slug!' })] }, { admin: true }).querySelector('.org-edit'), null);
});
test('render: every database string is text, never HTML (title, venue, city, review reason, slug)', () => {
  const { doc } = mk(); const evil = '<img src=x onerror=alert(1)>';
  const n = O.render(doc, { connect: 'connected', events: [EV({ title: evil, venue: evil, city: evil, status: 'review', review_reason: evil })] });
  assert.equal(n.querySelector('img'), null); assert.ok(n.querySelector('.ev-title').textContent.includes('<img')); assert.ok(n.querySelector('.org-reason').textContent.includes('<img'));
  const src = readFileSync(join(root, 'assets/js/kil-organizer.js'), 'utf8'); assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});
test('render: no events -> a plain empty state with one way to add one, Connect status still shown', () => {
  const { doc } = mk(); const n = O.render(doc, { connect: 'not_connected', events: [] }, { admin: true });
  assert.match(n.querySelector('.org-empty').textContent, /No events yet/); assert.equal(n.querySelector('.org-empty a').getAttribute('href'), '/create-event'); assert.ok(n.querySelector('.org-connect'));
});

test('mount: signed in + RPC answers -> the view renders and the old listings box is hidden by class; the RPC is the only call', async () => {
  const { host } = mk(); const s = fake({ data: { connect: 'connected', events: [EV()] }, error: null });
  assert.equal(await O.mount(host, s), true); assert.deepEqual([...s.calls].sort(), ['get_my_organizer_events', 'is_admin']); assert.ok(host.querySelector('.org-ev')); assert.ok(host.parentNode.classList.contains('org-on'));
});
test('mount NEGATIVE CONTROLS: signed out, RPC missing/erroring, not_authenticated, or a malformed answer render NOTHING and leave the old listings alone', async () => {
  const cases = [['signed out', fake({ data: { connect: 'connected', events: [] } }, false)], ['rpc error (not applied yet)', fake({ data: null, error: { message: 'function does not exist' } })],
    ['not_authenticated', fake({ data: { error: 'not_authenticated' }, error: null })], ['no events array', fake({ data: { connect: 'connected' }, error: null })], ['null data', fake({ data: null, error: null })],
    ['rpc throws', fake(() => { throw new Error('boom'); })]];
  for (const [name, s] of cases) { const { host } = mk(); assert.equal(await O.mount(host, s), false, name); assert.equal(host.children.length, 0, name + ': nothing rendered'); assert.ok(!host.parentNode.classList.contains('org-on'), name + ': old box stays'); }
  assert.equal(await O.mount(null, fake({})), false); assert.equal(await O.mount(mk().host, null), false);
});
test('dashboard.html wires it: the mount point inside the Events tab, the script, the mount call and the CSS that hides the superseded listings box', () => {
  const h = readFileSync(join(root, 'dashboard.html'), 'utf8');
  assert.match(h, /<div class="panel on" id="tab-events">[\s\S]*?<div id="org-view"><\/div>/); assert.match(h, /<script src="\/assets\/js\/kil-organizer\.js\?v=h[0-9a-f]{8}"><\/script>/);
  assert.match(h, /KilOrganizer\.mount\(document\.getElementById\('org-view'\), supa\)/); assert.match(h, /\.org-ev a\.ev-title\{color:inherit/, 'the public-page title link is not the browser default blue on the dark page (contrast 2.06)'); assert.match(h, /#tab-events\.org-on #listings\s*\{\s*display:\s*none/);
});

test('Create & Earn line: feature state (not submitted links to /connect), event state from the RPC, and a fixed pool placeholder; no fee/upsell words', () => {
  const { doc } = mk(); const q = (ce, events) => O.render(doc, { connect: 'connected', create_earn: ce, events: events === undefined ? [EV()] : events }).querySelector('.org-ce');
  const a = q({ feature: 'not_submitted', event_live: true }); assert.equal(a.querySelector('.org-ce-feature').textContent, 'Feature: not submitted Submit your feature'); assert.equal(a.querySelector('a').getAttribute('href'), '/connect');
  assert.equal(a.querySelector('.org-ce-event').textContent, 'Event: live'); assert.equal(a.querySelector('.org-ce-pool').textContent, 'Community pool: details soon');
  const b = q({ feature: 'in_review', event_live: false }); assert.equal(b.querySelector('.org-ce-feature').textContent, 'Feature: submitted, in review'); assert.equal(b.querySelector('a'), null, 'no link once submitted'); assert.equal(b.querySelector('.org-ce-event').textContent, 'Event: not live yet');
  const c = q({ feature: 'live', event_live: false }, []); assert.equal(c.querySelector('.org-ce-feature').textContent, 'Feature: live'); assert.equal(c.querySelector('.org-ce-event').textContent, 'Event: no events yet');
  for (const ce of [{ feature: 'not_submitted', event_live: true }, { feature: 'in_review', event_live: false }, { feature: 'live', event_live: true }]) assert.doesNotMatch(q(ce).textContent, /fee|price|pay|buy|upgrade|premium|\$|rank|paid|boost|promot/i, 'discovery wording only');
});
test('Create & Earn NEGATIVE CONTROLS: an older RPC without create_earn, an unknown feature value, or null renders no Create & Earn block (nothing guessed), the rest of the view is unchanged', () => {
  const { doc } = mk();
  for (const ce of [undefined, null, {}, { feature: 'banana', event_live: true }, { event_live: true }, 'live']) { const n = O.render(doc, { connect: 'connected', create_earn: ce, events: [EV()] }, { admin: true }); assert.equal(n.querySelector('.org-ce'), null, JSON.stringify(ce)); assert.ok(n.querySelector('.org-ev') && n.querySelector('.org-connect')); }
  assert.equal(O.render(doc, { connect: 'connected', create_earn: { feature: 'live', event_live: 'yes' }, events: [EV()] }, { admin: true }).querySelector('.org-ce-event').textContent, 'Event: not live yet', 'only a real true counts as live');
  const src = readFileSync(join(root, 'assets/js/kil-organizer.js'), 'utf8'); assert.match(src, /TODO\(Muse\)/);
});

const ALL = { connect: 'needs_action', create_earn: { feature: 'not_submitted', event_live: true }, events: [EV({ id: 1, source: 'community', slug: 'comm' }), EV({ id: 2, source: 'organizer', slug: 'org-ev' }), EV({ id: 3, source: 'seatgeek', slug: 'sg' })] };
test('NON-ADMIN can edit their own events at /create-event; community listings stay on /submit-event; payout stays hidden', () => {
  const { doc } = mk(); for (const connect of ['connected', 'needs_action', 'not_connected']) {
    const n = O.render(doc, { ...ALL, connect }); const html = n.outerHTML;
    assert.doesNotMatch(html, /Connect Stripe|Set up payouts|Finish payout|Payouts \(Stripe\)|payout|sell tickets/i, connect); assert.equal(n.querySelector('.org-connect'), null, connect);
    const edits = [...n.querySelectorAll('.org-edit')].map((a) => a.getAttribute('href'));
    assert.deepEqual(edits, ['/submit-event?edit=1', '/create-event?e=org-ev', '/create-event?e=sg'], connect);
  }
  const n2 = O.render(doc, ALL, { admin: false }); assert.equal(n2.querySelectorAll('.org-ev').length, 3, 'all events are still listed'); assert.ok(n2.querySelector('.org-ce'), 'the Create & Earn line stays');
  assert.equal(n2.querySelector('.org-connect'), null);
});
test('ADMIN keeps the existing payout path and /create-event edit links (negative control for the non-admin rule)', () => {
  const { doc } = mk(); const n = O.render(doc, ALL, { admin: true });
  assert.equal(n.querySelector('.org-connect a').getAttribute('href'), '/create-event'); assert.deepEqual([...n.querySelectorAll('.org-edit')].map((a) => a.getAttribute('href')), ['/submit-event?edit=1', '/create-event?e=org-ev', '/create-event?e=sg']);
  assert.equal(O.render(doc, ALL, { admin: 'true' }).querySelector('.org-connect'), null, 'only a real true is an admin');
});
test('mount: is_admin false, erroring, throwing or non-true all hide payout; edit links to /create-event stay', async () => {
  const run = async (admin) => { const { host } = mk(); const s = fake({ data: ALL, error: null }, true, admin); assert.equal(await O.mount(host, s), true); return host.innerHTML; };
  assert.match(await run(true), /create-event/); assert.match(await run(true), /payout/i);
  for (const [name, a] of [['false', false], ['null', null], ['string true', 'true'], ['error', () => Promise.resolve({ data: null, error: { message: 'denied' } })], ['throws', () => { throw new Error('x'); }], ['rejects', () => Promise.reject(new Error('x'))]]) {
    const html = await run(a);
    assert.match(html, /create-event/, name);
    assert.doesNotMatch(html, /payout/i, name);
  }
});
