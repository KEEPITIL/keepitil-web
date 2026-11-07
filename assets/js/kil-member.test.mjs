import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
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
    { slug: 'soon', title: 'Soon <b>', status: 'published', starts_at: '2026-12-01T04:00:00Z', venue: 'Room', city: 'LA', cover_url: 'https://cdn.example/c.jpg' },
    { slug: 'past-show', title: 'Last month', status: 'published', starts_at: '2026-10-01T04:00:00Z', venue: 'Yard', city: 'LA' },
    { slug: 'draft-soon', title: 'Still writing', status: 'draft', starts_at: '2026-12-20T04:00:00Z', city: 'LA' },
    { slug: 'draft-old', title: 'Old draft', status: 'draft', starts_at: '2026-01-02T04:00:00Z' },
    { slug: 'locked', title: 'Secret', status: 'published', starts_at: '2026-12-05T04:00:00Z', event_password_hash: 'hash-value', city: 'LA' }
  ];
}

test('public view is name, handle, avatar, bio, links, and upcoming published events', () => {
  const html = m.renderPublic({ slug: 'ada', meta, events: events(), now: NOW, categories: null });
  assert.match(html, /<h1 class="m1-name">Ada<\/h1>/);
  assert.match(html, /@ada/);
  assert.match(html, /src="https:\/\/cdn\.example\/a\.png"/);
  assert.match(html, /Plays after midnight\./);
  assert.match(html, /href="https:\/\/ada\.example"/);
  assert.match(html, /Instagram/);
  assert.match(html, /Soon &lt;b&gt;/);
  assert.match(html, /href="\/event\?e=soon"/);
  assert.doesNotMatch(html, /Last month|Still writing|Old draft|Secret/);
  assert.doesNotMatch(html, /javascript:|ada@example.com|hash-value|book_email|Sold|Checked in|Revenue|Only you can see this/);
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
  assert.doesNotMatch(html, /buyer@example.com|hash-value|RSVP|views/i);
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

test('a logged-out visitor does not list profile_meta or profiles', async () => {
  const c = client({
    session: { data: { session: null } },
    from: { events: { data: [{ slug: 'locked' }, { slug: 'quiet' }] } },
    rpc: {
      get_public_profile: { data: [meta] },
      get_profile_events() {
        return { data: events().concat([{ slug: 'quiet', title: 'Quiet', status: 'published', starts_at: '2026-12-08T04:00:00Z' }]) };
      }
    }
  });
  const d = await m.load(c, 'ada', { now: NOW });
  assert.equal(d.owner, false);
  assert.equal(c.fromCalls.includes('profile_meta'), false);
  assert.equal(c.fromCalls.includes('profiles'), false);
  assert.equal(c.rpcCalls.includes('get_public_profile'), true);
  assert.equal(c.rpcCalls.includes('organizer_dashboard'), false);
  assert.deepEqual(d.events.map((e) => e.slug), ['soon', 'past-show', 'draft-soon', 'draft-old']);
  const html = m.render(d);
  assert.doesNotMatch(html, /ada@example.com|hash-value|Secret/);
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
      get_my_tickets: { data: [] },
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
});
