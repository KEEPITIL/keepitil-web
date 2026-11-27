// node --test assets/js/create-earn-structure.test.mjs   (jsdom only)
//
// Joe 2026-11-22 ~12:30 PT: "KEEPITIL 1.0: event creation and management. Updated features and
// create and earn page fully restructured to make sense of what the brand is."
//
// CREATE = where you make something (an event listing, a competition entry, a post).
// EARN   = how you earn (partner programmes, creator rewards; the early-access section was removed 2026-11-25, owner order).
// Every door on either page must point at a file this repo actually serves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createRequire as __cr } from 'node:module';
const __assemble = __cr(import.meta.url)('../../tests/helpers/event-assembled.cjs').assemble;

const ROOT = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const CREATE = __assemble(read('create/index.html'));
const EARN = __assemble(read('earn/index.html'));
const markup = (h) => h.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '');

/* Map a site path to the file GitHub Pages serves for it (clean URLs: /x -> x.html, /x/ -> x/index.html). */
export function servedFile(href) {
  const path = href.split(/[?#]/)[0];
  if (!path.startsWith('/')) return null;
  const rel = path.slice(1);
  const cands = rel === '' ? ['index.html']
    : rel.endsWith('/') ? [rel + 'index.html']
    : /\.\w+$/.test(rel) ? [rel] : [rel + '.html', rel + '/index.html'];
  return cands.find((c) => existsSync(new URL(c, ROOT))) || null;
}

export function sectionOf(html, id) {
  const m = new RegExp('<section id="' + id + '"[\\s\\S]*?</section>').exec(markup(html));
  return m ? m[0] : '';
}

export function hubProblems(html) {
  const p = [];
  const hub = sectionOf(html, 'createHub');
  if (!hub) return ['no #createHub section'];
  if (markup(html).indexOf('id="createHub"') > markup(html).indexOf('id="vs-app"')) p.push('hub is not above the competitions');
  const hrefs = [...hub.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]);
  for (const need of ['/submit-event', '/dashboard', '#vs-app', '/profile?create=feed']) {
    if (!hrefs.includes(need)) p.push('missing door ' + need);
  }
  for (const h of hrefs) if (!h.startsWith('#') && !servedFile(h)) p.push('dead link ' + h);
  /* /create-event is team-only today (rpc is_admin bounces members to /submit-event); a public
     door to it would be a loop. */
  if (hrefs.some((h) => h.startsWith('/create-event'))) p.push('public door to team-only /create-event');
  return p;
}

export function earnProblems(html) {
  const p = [];
  const m = markup(html);
  if (/<h2>\s*CREATE\s*<\/h2>/.test(m)) p.push('Earn still has a section titled CREATE');
  if (/data-k="create"/.test(m)) p.push('Earn still has a Create chip');
  const order = ['earn', 'create', 'games'].map((id) => m.indexOf('<section id="' + id + '"'));
  if (order.some((i) => i < 0)) p.push('missing section: ' + order.join(','));
  else if (order.some((v, i) => i && v < order[i - 1])) p.push('sections out of order (partners, rewards, games)');
  if (/<section id="early"/.test(m)) p.push('the removed early-access section is back');
  for (const id of ['create']) {
    for (const [, h] of sectionOf(html, id).matchAll(/<a [^>]*href="([^"]+)"/g)) {
      if (!h.startsWith('#') && !/^https?:/.test(h) && !servedFile(h)) p.push('dead link ' + h);
    }
  }
  if (/href="\/early-access/.test(m)) p.push('a link to the removed /early-access.html is back');
  return p;
}

test('CREATE: one hub above the competitions with working doors (add, manage, compete, post)', () => {
  assert.deepEqual(hubProblems(CREATE), []);
});

test('EARN: partners, rewards, games; no early-access section, no Create section or chip; no dead links', () => {
  assert.deepEqual(earnProblems(EARN), []);
  // NEGATIVE CONTROLS: the checker catches the removed section and its link coming back
  assert.ok(earnProblems(EARN.replace('<section id="create">', '<section id="early"><a href="/early-access.html">x</a></section>\n<section id="create">')).some((x) => /early-access section is back/.test(x)));
  assert.ok(earnProblems(EARN.replace('</main>', '<a href="/early-access.html">x</a></main>')).some((x) => /link to the removed/.test(x)));
});

test('EARN: the early-access section is gone from the page source (removed 2026-11-25, owner order)', () => {
  assert.doesNotMatch(markup(EARN), /<section id="early"|id="earlyGrid"|id="earnEarlyAccess"/);
});

function hubDom(search) {
  const vc = new VirtualConsole();
  const body = /<main class="wrap">[\s\S]*?<\/main>/.exec(CREATE)[0];
  const dom = new JSDOM('<!doctype html><body>' + body + '</body>', {
    url: 'https://keepitil.com/create/' + search, runScripts: 'dangerously', virtualConsole: vc,
  });
  return dom;
}

test('CREATE hub hides on a competition view and comes back on the list (pushState aware)', () => {
  const dom = hubDom('');
  const hub = dom.window.document.getElementById('createHub');
  assert.equal(hub.hidden, false, 'visible on /create/');
  dom.window.history.pushState({}, '', '/create/?c=82');
  assert.equal(hub.hidden, true, 'hidden after vs-app pushes ?c=');
  dom.window.history.replaceState({}, '', '/create/');
  assert.equal(hub.hidden, false, 'visible again on the list');
  assert.equal(hubDom('?view=enter&c=5').window.document.getElementById('createHub').hidden, true, 'hidden on a direct entry link');
});

/* ── NEGATIVE CONTROLS: the checks above must fail on the old pages ── */
test('negative controls: old Create (no hub) and old Earn (CREATE section + chip) fail', () => {
  const oldCreate = CREATE.replace(/<section id="createHub"[\s\S]*?<\/section>/, '');
  assert.deepEqual(hubProblems(oldCreate), ['no #createHub section']);
  const loop = CREATE.replace('href="/submit-event"', 'href="/create-event"');
  assert.ok(hubProblems(loop).includes('public door to team-only /create-event'));
  const dead = CREATE.replace('href="/artists"', 'href="/no-such-page"');
  assert.ok(hubProblems(dead).includes('dead link /no-such-page'));
  const oldEarn = EARN.replace('<h2>CREATOR REWARDS</h2>', '<h2>CREATE</h2>')
    .replace('<button data-k="rewards">Rewards</button>', '<button data-k="create">Create</button>');
  const e = earnProblems(oldEarn);
  assert.ok(e.includes('Earn still has a section titled CREATE') && e.includes('Earn still has a Create chip'), e.join('; '));
  assert.equal(servedFile('/submit-event'), 'submit-event.html');
  assert.equal(servedFile('/venues/'), 'venues/index.html');
  assert.equal(servedFile('/nope'), null);
});
