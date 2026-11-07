import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const insights = require('./kil-insights.js');
globalThis.KilInsights = insights;
const share = require('./kil-share.js');
globalThis.KilShare = share;
const m = require('./kil-member.js');

const NOW = new Date('2026-11-07T12:00:00Z');

function chain(result) {
  const q = {
    calls: [],
    select(cols) { this.calls.push(['select', cols]); return this; },
    eq() { return this; },
    in(col, vals) { this.calls.push(['in', col, vals]); return this; },
    not(col, op, val) { this.calls.push(['not', col, op, val]); return this; },
    order() { return this; },
    limit() { return this; },
    maybeSingle() { return this; },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); }
  };
  return q;
}

function client(script) {
  const rpcCalls = [];
  const fromCalls = [];
  return {
    rpcCalls, fromCalls,
    from(table) {
      fromCalls.push(table);
      const spec = (script.from && script.from[table]) || { data: [] };
      return chain(spec);
    },
    rpc(name, args) {
      rpcCalls.push(name);
      const spec = (script.rpc && script.rpc[name]) || { data: null, error: { message: 'missing ' + name } };
      return Promise.resolve(typeof spec === 'function' ? spec(args) : spec);
    },
    auth: { getSession() { return Promise.resolve(script.session || { data: { session: null } }); } }
  };
}

const OPEN = {
  account_type: 'artist', profile_public: true, age_verified: true, is_minor: false, under_18: false,
  status: 'published', admin_approved: true,
  public_fields: ['display_name', 'handle', 'avatar_url', 'bio', 'tagline', 'location', 'links', 'socials', 'events']
};
const meta = Object.assign({
  slug: 'ada', display_name: 'Ada', handle: 'ada', avatar_url: 'https://cdn.example/a.png',
  bio: 'Plays after midnight.', tagline: 'House', location: 'Los Angeles',
  links: [{ label: 'Site', url: 'https://ada.example' }, { label: 'Bad', url: 'javascript:alert(1)' }],
  socials: { instagram: 'https://instagram.com/ada', soundcloud: 'https://soundcloud.com/ada', website: '' },
  book_email: 'ada@example.com'
}, OPEN);
const bare = {
  slug: 'ada', display_name: 'Ada', handle: 'ada', bio: 'Plays after midnight.',
  avatar_url: 'https://cdn.example/a.png', book_email: 'ada@example.com'
};

function events() {
  return [
    { slug: 'soon', title: 'Soon <b>', status: 'published', starts_at: '2026-12-01T04:00:00Z', venue: 'Room', city: 'LA', cover_url: 'https://cdn.example/c.jpg', is_protected: false },
    { slug: 'past-show', title: 'Last month', status: 'published', starts_at: '2026-10-01T04:00:00Z', venue: 'Yard', city: 'LA', is_protected: false },
    { slug: 'draft-soon', title: 'Still writing', status: 'draft', starts_at: '2026-12-20T04:00:00Z', city: 'LA', is_protected: false },
    { slug: 'draft-old', title: 'Old draft', status: 'draft', starts_at: '2026-01-02T04:00:00Z', is_protected: false },
    { slug: 'locked', title: 'Secret', status: 'published', starts_at: '2026-12-05T04:00:00Z', is_protected: true, event_password_hash: 'hash-value', city: 'LA' }
  ];
}

test('public view is name, handle, avatar, bio, links, and a count of upcoming events', () => {
  const html = m.renderPublic({ slug: 'ada', meta, events: events(), now: NOW, categories: null });
  assert.match(html, /<h1 class="m1-name">Ada<\/h1>/);
  assert.match(html, /@ada/);
  assert.match(html, /src="https:\/\/cdn\.example\/a\.png"/);
  assert.match(html, /Plays after midnight\./);
  assert.match(html, /href="https:\/\/ada\.example"/);
  assert.match(html, /Instagram/);
  assert.match(html, /data-kil="public-rollup"/);
  assert.match(html, /&lt;5 upcoming · LA/);
  assert.doesNotMatch(html, /Soon|m1-ev|href="\/event\?e=soon"|1 upcoming/);
  assert.doesNotMatch(html, /Last month|Still writing|Old draft|Secret/);
  assert.doesNotMatch(html, /data-kil="owner"|data-kil="event-chart"/);
  assert.doesNotMatch(html, /javascript:|ada@example.com|hash-value|book_email|Sold|Checked in|Revenue|Only you can see this/);
});

test('a missing is_protected flag is not shown and a false flag is kept', () => {
  const kept = m.hideLocked([
    { slug: 'open', is_protected: false },
    { slug: 'secret', is_protected: true, title: 'Secret' },
    { slug: 'unknown', title: 'Nope' }
  ]);
  assert.deepEqual(kept.map((e) => e.slug), ['open']);
});

test('a profile with no display name still shows the handle', () => {
  const html = m.renderPublic({
    slug: 'ada',
    meta: Object.assign({ handle: 'ada', public_fields: ['handle', 'events'] }, OPEN, { public_fields: ['handle', 'events'] }),
    events: [], now: NOW
  });
  assert.match(html, /<h1 class="m1-name">ada<\/h1>/);
  assert.match(html, /No upcoming events\./);
});

test('a null public_fields value does not throw', async () => {
  const c = client({
    rpc: {
      get_public_profile: { data: [{
        slug: 'ada', account_type: 'artist', status: 'published', admin_approved: true,
        profile_public: true, public_fields: null, display_name: 'Ada', bio: 'Secret'
      }] }
    },
    session: { data: { session: { user: { id: 'u' } } } }
  });
  const d = await m.load(c, 'ada');
  const html = m.render(d);
  assert.match(html, /data-m1="private-stub"/);
  assert.doesNotMatch(html, /Secret/);
});

test('a profile with no flags renders the private stub', () => {
  const html = m.render({ slug: 'ada', meta: bare, events: events(), owner: false, now: NOW });
  assert.match(html, /data-m1="private-stub"/);
  assert.match(html, /THIS PROFILE IS PRIVATE/);
  assert.match(html, /href="\/">Discover events/);
  assert.doesNotMatch(html, /Plays after midnight|ada@example.com|cdn\.example\/a\.png|Share|Upcoming events/);
});

test('a profile in review renders the private stub', () => {
  const review = Object.assign({}, meta, { status: 'review' });
  assert.equal(share.profileIsShareable(review), false);
  const html = m.render({ slug: 'ada', meta: review, events: events(), owner: false, now: NOW });
  assert.match(html, /THIS PROFILE IS PRIVATE/);
  assert.doesNotMatch(html, /Plays after midnight/);
});

test('an under-18 owner sees the notice and no public switches', () => {
  const minor = Object.assign({}, bare, { is_minor: true, age_verified: false });
  const html = m.render({
    slug: 'ada', meta: minor, owner: true, now: NOW, hosted: [], metrics: [], tickets: [], saved: []
  });
  assert.match(html, /THIS PROFILE IS PRIVATE/);
  assert.match(html, /Public profile: not available under 18/);
  assert.doesNotMatch(html, /type="checkbox"|>PUBLIC<|>PRIVATE</);
});

test('owner dashboard splits upcoming and past, keeps drafts, and shows stored counts only', () => {
  const metrics = [
    { slug: 'soon', sold: 4, checked_in: 1, revenue_cents: 2500, status: 'published', buyer_email: 'buyer@example.com', event_password_hash: 'nope' },
    { slug: 'past-show', sold: 0, checked_in: 0, revenue_cents: 0 },
    { slug: 'draft-soon', sold: 0, checked_in: 0, revenue_cents: 0, status: 'draft' }
  ];
  const board = m.hostBoard(events(), metrics, NOW);
  assert.deepEqual(board.upcoming.map((e) => e.slug), ['soon', 'locked', 'draft-soon']);
  assert.deepEqual(board.past.map((e) => e.slug), ['past-show', 'draft-old']);
  assert.equal(board.upcoming[0].sold, 4);
  assert.equal(board.upcoming[0].checked_in, 1);
  assert.equal(board.upcoming[0].revenue_cents, 2500);
  assert.equal(JSON.stringify(board).includes('buyer@example.com'), false);
  assert.equal(JSON.stringify(board).includes('hash-value'), false);
  assert.equal(JSON.stringify(board).includes('nope'), false);
  assert.equal(board.past[1].sold, null);

  const html = m.render({
    slug: 'ada', meta, events: events().filter((e) => e.slug !== 'locked'), owner: true, now: NOW,
    hosted: events(), metrics, tickets: [], saved: []
  });
  assert.match(html, /data-m1="dashboard"/);
  assert.match(html, /Only you can see this/);
  assert.match(html, />Upcoming</);
  assert.match(html, />Past</);
  assert.match(html, />Draft</);
  assert.match(html, />4<\/b><span>Sold<\/span>/);
  assert.match(html, />1<\/b><span>Checked in<\/span>/);
  assert.match(html, />\$25\.00<\/b><span>Revenue<\/span>/);
  assert.match(html, /href="\/create-event\?e=draft-soon"/);
  assert.match(html, /href="\/event\?e=soon"/);
  assert.match(html, /Secret/);
  assert.match(html, /data-kil="event-chart"/);
  assert.match(html, /data-kil="compare"/);
  assert.doesNotMatch(html, /kil-in-table/);
  assert.doesNotMatch(html, /buyer@example.com|hash-value|nope|RSVP|views/i);
});

test('a failed numbers read is not shown as zero tickets', () => {
  const html = m.renderPrivate({
    slug: 'ada', now: NOW, tickets: [], saved: [],
    hosted: [{ slug: 'soon', title: 'Soon', status: 'published', starts_at: '2026-12-01T04:00:00Z' }],
    metrics: null
  });
  assert.match(html, /Event numbers couldn’t load/);
  assert.doesNotMatch(html, />0<\/b><span>Sold/);
});

test('a signed-out caller gets the summary shape and no event rows', async () => {
  const c = client({
    session: { data: { session: null } },
    from: { events: { data: [{ slug: 'locked' }] } },
    rpc: {
      get_public_profile: { data: [meta] },
      get_profile_event_summary() {
        return { data: [{ upcoming_count: null, cities: ['LA', 'Long Beach'], title: 'Secret', slug: 'soon' }] };
      },
      get_profile_events() { return { data: events() }; },
      get_my_tickets() { return { data: [{ slug: 't', qr_token: 'door-token' }] }; }
    }
  });
  const d = await m.load(c, 'ada', { now: NOW });
  assert.equal(d.owner, false);
  assert.equal(c.fromCalls.includes('profile_meta'), false);
  assert.equal(c.fromCalls.includes('profiles'), false);
  assert.equal(c.fromCalls.includes('events'), false);
  assert.deepEqual(c.rpcCalls, ['get_public_profile', 'get_profile_event_summary']);
  assert.equal(d.tickets, undefined);
  assert.equal(d.metrics, undefined);
  assert.deepEqual(d.events, []);
  assert.deepEqual(Object.keys(d.summary).sort(), ['cities', 'upcoming_count']);
  assert.equal(d.summary.upcoming_count, null);
  assert.deepEqual(d.summary.cities, ['LA', 'Long Beach']);
  const html = m.render(d);
  assert.match(html, /data-kil="public-rollup"/);
  assert.match(html, /&lt;5 upcoming · LA · Long Beach/);
  assert.doesNotMatch(html, /Secret|m1-ev|href="\/event|ada@example.com|hash-value|door-token/);
});

test('another signed-in member is not the owner and gets the same summary', async () => {
  const c = client({
    session: { data: { session: { user: { id: 'someone-else' } } } },
    rpc: {
      get_public_profile: { data: [meta] },
      my_profile_slug: { data: 'someone-else' },
      get_profile_event_summary: { data: [{ upcoming_count: 8, cities: ['LA'], sold: 1 }] },
      get_profile_events: { data: events() },
      get_my_tickets: { data: [{ slug: 't', qr_token: 'door-token' }] },
      get_my_ticket_summary: { data: [{ slug: 't', qr_token: 'door-token' }] },
      organizer_dashboard: { data: [{ slug: 'soon', sold: 4, revenue_cents: 900 }] }
    }
  });
  const d = await m.load(c, 'ada', { now: NOW });
  assert.equal(d.owner, false);
  assert.equal(c.rpcCalls.includes('my_profile_slug'), true);
  assert.equal(c.rpcCalls.includes('get_profile_event_summary'), true);
  assert.equal(c.rpcCalls.includes('get_profile_events'), false);
  assert.equal(c.rpcCalls.includes('get_my_tickets'), false);
  assert.equal(c.rpcCalls.includes('get_my_ticket_summary'), false);
  assert.equal(c.rpcCalls.includes('organizer_dashboard'), false);
  assert.deepEqual(d.events, []);
  assert.deepEqual(d.summary, { upcoming_count: 8, cities: ['LA'] });
  const html = m.render(d);
  assert.match(html, /8 upcoming · LA/);
  assert.doesNotMatch(html, /Only you can see this|Sold|Secret|door-token|m1-ev/);
});

test('a logged-out load with an empty lookup does not touch the tables', async () => {
  const c = client({
    rpc: { get_public_profile: { data: [] } }
  });
  const d = await m.load(c, 'ada', { now: NOW });
  assert.deepEqual(c.fromCalls, []);
  assert.deepEqual(c.rpcCalls, ['get_public_profile']);
  const html = m.render(d);
  assert.match(html, /THIS PROFILE IS PRIVATE/);
  assert.match(html, /Discover events/);
});

test('the owner load asks for dashboard counts and never selects the password hash', async () => {
  const seen = [];
  const c = client({
    session: { data: { session: { user: { id: 'ada' } } } },
    rpc: {
      get_public_profile: { data: [] },
      get_profile_events: { data: events() },
      my_profile_slug: { data: 'ada' },
      get_my_ticket_summary: { data: [{ slug: 'soon', title: 'Soon', qty: 1, tier_name: 'GA', qr_token: 'door-token', buyer_email: 'buyer@example.com' }] },
      organizer_dashboard: { data: [{ slug: 'soon', sold: 2, checked_in: 1, revenue_cents: 500 }] }
    }
  });
  const orig = c.from;
  c.from = (table) => {
    const q = orig(table);
    const prev = q.select;
    q.select = (cols) => { seen.push(table + ':' + cols); return prev.call(q, cols); };
    return q;
  };
  const d = await m.load(c, 'Ada', { now: NOW });
  assert.equal(d.owner, true);
  assert.equal(d.metrics[0].sold, 2);
  assert.deepEqual(d.hosted.map((e) => e.slug), events().map((e) => e.slug));
  assert.deepEqual(Object.keys(d.tickets[0]).sort(), ['qty', 'slug', 'tier_name', 'title']);
  assert.equal(c.rpcCalls.includes('get_my_tickets'), false);
  assert.equal(c.rpcCalls.includes('get_my_ticket_summary'), true);
  assert.equal(c.rpcCalls.includes('get_profile_event_summary'), false);
  assert.equal(seen.some((s) => s.startsWith('profile_meta') || s.startsWith('profiles:')), false);
  assert.equal(seen.some((s) => /book_email|event_password_hash|buyer_email/.test(s)), false);
  assert.equal(c.rpcCalls.includes('organizer_dashboard'), true);
  const html = m.render(d);
  assert.match(html, /data-m1="totals"/);
  assert.match(html, />2<\/b><span>Sold<\/span>/);
  assert.match(html, />\$5\.00<\/b><span>Revenue<\/span>/);
  assert.doesNotMatch(html, />Views</);
});

test('safe links reject javascript, data, and protocol-relative URLs', () => {
  assert.equal(m.safeUrl('javascript:alert(1)'), '');
  assert.equal(m.safeUrl('data:text/html,hi'), '');
  assert.equal(m.safeUrl('//evil.example'), '');
  assert.equal(m.safeUrl('/\\evil.example'), '');
  assert.equal(m.safeUrl('http://example.com'), '');
  assert.equal(m.safeUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(m.safeUrl('/event?e=soon'), '/event?e=soon');
});

test('the page does not select profile_meta or book_email', () => {
  const html = readFileSync(new URL('../../member.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('./kil-member.js', import.meta.url), 'utf8');
  assert.match(html, /kil-member\.js/);
  assert.match(html, /property="og:image" content="https:\/\/keepitil.com\/keepitil-og.png"/);
  assert.match(html, /name="twitter:image" content="https:\/\/keepitil.com\/keepitil-og.png"/);
  assert.equal(js.includes("from('profile_meta')"), false);
  assert.equal(js.includes("from('profiles')"), false);
  assert.equal(/book_email|buyer_email|qr_token/.test(js), false);
  assert.equal(js.includes('get_my_tickets'), false);
  assert.equal(js.includes('event_password_hash'), false);
  assert.match(js, /get_profile_event_summary/);
  assert.match(js, /get_my_ticket_summary/);
  assert.match(js, /is_protected/);
});

test('the draft summary migration gates on profile_is_public and does not return a door token', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261107020000_profile_event_summary.sql', import.meta.url), 'utf8');
  const down = readFileSync(new URL('../../supabase/rollbacks/20261107020000_profile_event_summary_down.sql', import.meta.url), 'utf8');
  assert.match(sql, /NEEDS SENTINEL REVIEW BEFORE PROD/);
  assert.match(sql, /#91 owns this helper/);
  assert.match(sql, /FUNCTION private\.profile_is_public\(p_slug text\)/);
  assert.match(sql, /'member', 'artist', 'creator', 'dj', 'subscriber_profile'/);
  assert.match(sql, /'brand', 'venue', 'organizer'/);
  assert.match(sql, /m\.profile_public IS TRUE/);
  assert.match(sql, /m\.status = 'published'/);
  assert.match(sql, /m\.admin_approved IS TRUE/);
  assert.match(sql, /m\.is_minor IS FALSE/);
  assert.match(sql, /m\.under_18 IS FALSE/);
  assert.match(sql, /m\.age_verified IS TRUE/);
  assert.match(sql, /acct\.age_verified IS TRUE/);
  assert.match(sql, /biz\.owner_id IS NOT NULL/);
  const summary = sql.slice(sql.indexOf('FUNCTION public.get_profile_event_summary'), sql.indexOf('FUNCTION public.get_my_ticket_summary'));
  assert.match(summary, /private\.profile_is_public\(m\.slug\)/);
  assert.match(summary, /upcoming_count integer/);
  assert.match(summary, /cities text\[\]/);
  assert.match(summary, /WHEN \(SELECT n FROM counted\) < 5 THEN NULL/);
  assert.match(summary, /'events' = ANY \(m\.public_fields\)/);
  assert.equal(/age_verified/.test(summary), false);
  assert.equal(/is_minor/.test(summary), false);
  const eventsRpc = sql.slice(sql.indexOf('FUNCTION public.get_profile_events'), sql.indexOf('FUNCTION public.get_profile_event_summary'));
  assert.match(eventsRpc, /is_protected boolean/);
  assert.match(eventsRpc, /po\.owner_id = \(SELECT auth\.uid\(\)\)/);
  const returns = eventsRpc.slice(eventsRpc.indexOf('RETURNS TABLE'), eventsRpc.indexOf('LANGUAGE sql'));
  assert.match(returns, /is_protected boolean/);
  assert.equal(returns.includes('event_password_hash'), false);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_profile_events\(text\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_profile_events\(text\) TO authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_profile_event_summary\(text\) TO anon, authenticated/);
  assert.equal(sql.includes('qr_token'), false);
  assert.match(sql, /FUNCTION public\.get_my_ticket_summary\(\)/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_my_ticket_summary\(\) TO authenticated/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_my_ticket_summary\(\) FROM PUBLIC, anon/);
  assert.match(down, /DROP FUNCTION IF EXISTS public\.get_profile_event_summary\(text\)/);
  assert.match(down, /does not drop it/);
});
