// node --test tests/host-link.test.mjs   (no dependencies)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
const B = req('../assets/js/kil-browse.js'), S = req('../assets/js/kil-show.js');
const ev = { id: 1, slug: 'x-20261112', title: 'X', venue: 'V', city: 'LA', starts_at: '2099-01-01T05:00:00Z', tz: 'America/Los_Angeles', owner_handle: 'xus', genres: 'house' };
const data = (extra) => Object.assign({ events: [ev], lineups: {}, tiers: {}, hosts: {}, hostProfiles: {} }, extra);

test('browse: host WITHOUT a profile_meta row renders as plain text, no /member link', () => {
  const h = B.render(data(), {});
  assert.match(h, /<span class="m3-chip m3-host">xus<\/span>/);
  assert.ok(!/href="\/member\?slug=xus"/.test(h));
});
test('browse: host WITH a profile renders as a link and uses its display name', () => {
  const h = B.render(data({ hosts: { xus: 'XUS Events' }, hostProfiles: { xus: true } }), {});
  assert.match(h, /<a class="m3-chip m3-host" href="\/member\?slug=xus">XUS Events<\/a>/);
});
test('browse: a profile with NO display name still links (existence, not name, decides)', () => {
  const h = B.render(data({ hostProfiles: { xus: true } }), {});
  assert.match(h, /<a class="m3-chip m3-host" href="\/member\?slug=xus">xus<\/a>/);
});
test('browse: a missing hostProfiles map (older data, failed lookup) fails safe to plain text', () => {
  const d = data(); delete d.hostProfiles;
  assert.ok(!/href="\/member\?slug=xus"/.test(B.render(d, {})));
});
test('browse load(): only slugs returned by profile_meta become linkable, even without a display_name', async () => {
  const tbl = { events: { data: [ev] }, profile_meta: { data: [{ slug: 'real', display_name: null }] }, event_lineup: { data: [] }, ticket_tiers: { data: [] } };
  const builder = (name) => { const b = { select() { return b; }, eq() { return b; }, gte() { return b; }, is() { return b; }, or() { return b; }, order() { return b; }, limit() { return b; }, in() { return b; }, then(f, r) { return Promise.resolve({ data: tbl[name].data, error: null }).then(f, r); } }; return b; };
  const r = await B.load({ from: builder }, { now: new Date('2026-11-09T00:00:00Z') });
  assert.deepEqual(r.hostProfiles, { real: true });
});
test('show: host without a profile is plain text; with a profile is a link', () => {
  const base = { event: Object.assign({}, ev, { owner_name: 'XUS' }), slug: 'x', lineup: [], tiers: [], now: new Date('2026-11-09T00:00:00Z') };
  const none = S.render(Object.assign({}, base, { hostProfile: false }));
  assert.match(none, /<span class="m2-host">Hosted by XUS<\/span>/); assert.ok(!/href="\/member\?slug=xus"/.test(none));
  const yes = S.render(Object.assign({}, base, { hostProfile: true }));
  assert.match(yes, /<a class="m2-host" href="\/member\?slug=xus">Hosted by XUS<\/a>/);
});
test('negative control: the pre-fix markup would fail the no-link assertion', () => {
  const old = '<a class="m3-chip m3-host" href="/member?slug=xus">xus</a>';
  assert.ok(/href="\/member\?slug=xus"/.test(old));
});
