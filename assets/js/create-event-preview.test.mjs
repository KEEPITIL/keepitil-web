// node --test assets/js/create-event-preview.test.mjs   (jsdom only)
//
// /create-event, signed out: the "Log in" gate also shows a READ-ONLY PREVIEW of what the form asks (steps and field labels, greyed, plain text) with a log-in link to
// /apply?next=%2Fcreate-event. No auth, session or database change; the signed-in form is untouched. A signed-out visitor can never submit: the preview holds no form control at all,
// and the real form stays hidden. Each rule has a NEGATIVE CONTROL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const HTML = readFileSync(new URL('../../create-event.html', import.meta.url), 'utf8');
const LOGIN = '/apply?next=%2Fcreate-event';

// problems in a preview section's markup: any control, any form, any link that is not the log-in link
function previewProblems(sectionHtml) {
  const d = new JSDOM('<!doctype html><body>' + sectionHtml).window.document, p = [];
  if (d.querySelector('input,select,textarea,button,form,[contenteditable],[type=submit],[onclick],[tabindex]')) p.push('a form control or interactive element');
  for (const a of d.querySelectorAll('a')) if (a.getAttribute('href') !== LOGIN) p.push('a link that is not the log-in link: ' + a.getAttribute('href'));
  if (d.querySelectorAll('a').length < 1) p.push('no log-in link');
  return p;
}
const section = (html) => (/<section class="preview" id="preview"[\s\S]*?<\/section>/.exec(html) || [''])[0];

// run the page's own inline script with a stubbed auth client; resolves to the DOM after init() settles
async function load(session, isAdmin) {
  const dom = new JSDOM(HTML, { url: 'https://keepitil.com/create-event', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, calls = { rpc: [], from: [], fetch: 0 };
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { handle: 'host', payouts_enabled: true } }) };
  w.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session } }), onAuthStateChange() {} }, rpc: async (n) => { calls.rpc.push(n); return { data: isAdmin }; }, from: (t) => { calls.from.push(t); return q; } }) };
  w.fetch = () => { calls.fetch++; return Promise.reject(new Error('no network in the test')); };
  const scripts = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 1);
  w.eval(scripts[0]);
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
  return { w, d: w.document, calls };
}
const shown = (el) => el.style.display !== 'none';

test('the preview holds plain text only: no control, no form, and its only link is the log-in link; it asks what the form asks', () => {
  const s = section(HTML); assert.ok(s, 'the preview section exists');
  assert.deepEqual(previewProblems(s), []);
  for (const label of ['Hosting as', 'Event name', 'Starts', 'Ends', 'Description', 'Location', 'Venue name', 'Genres', 'Ticket name', 'Price', 'quantity limit', 'discount code', 'YouTube video', 'image gallery', 'flyer', 'Show on Explore', 'Password protect', 'accent colour'])
    assert.match(s, new RegExp(label, 'i'), label);
  assert.match(s, /Nothing publishes until the KEEPITIL team approves it/);
});
test('NEGATIVE CONTROLS: a preview with an input, a button, a form, an interactive attribute or another link is caught', () => {
  const s = section(HTML);
  for (const bad of ['<input id="x">', '<button>Create Event</button>', '<form></form>', '<span contenteditable="true">x</span>', '<span tabindex="0">x</span>', '<span onclick="x()">x</span>', '<a href="/somewhere">x</a>', '<select></select>', '<textarea></textarea>'])
    assert.notDeepEqual(previewProblems(s.replace('</section>', bad + '</section>')), [], bad);
  assert.deepEqual(previewProblems(s.replace(/<a [^>]*>[\s\S]*?<\/a>/g, 'x')), ['no log-in link']);
});

test('signed out (no session): the gate AND the preview show, the real form stays hidden, the log-in link goes to /apply?next=%2Fcreate-event, and nothing is sent', async () => {
  const { d, calls } = await load(null, false);
  assert.equal(shown(d.getElementById('gate')), true); assert.equal(shown(d.getElementById('preview')), true); assert.equal(shown(d.getElementById('form')), false);
  assert.deepEqual([...d.querySelectorAll('#gate a, #preview a')].map((a) => a.getAttribute('href')), [LOGIN, LOGIN]);
  assert.equal(d.querySelector('#gate a').textContent, 'Log in to create your event');
  assert.deepEqual(calls.rpc, [], 'no is_admin call without a session'); assert.deepEqual(calls.from, [], 'no table read'); assert.equal(calls.fetch, 0);
  assert.equal(d.querySelectorAll('#preview input, #preview select, #preview textarea, #preview button, #preview form').length, 0, 'nothing in the visible preview can be submitted');
});
test('signed out with no auth client at all: the same gate and preview', async () => {
  const dom = new JSDOM(HTML, { url: 'https://keepitil.com/create-event', runScripts: 'outside-only' });
  dom.window.eval(/<script>([\s\S]*?)<\/script>/.exec(HTML)[1]);
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
  const d = dom.window.document; assert.equal(shown(d.getElementById('gate')), true); assert.equal(shown(d.getElementById('preview')), true); assert.equal(shown(d.getElementById('form')), false);
});
test('signed in as an admin: the form shows and the preview does not (signed-in behaviour unchanged)', async () => {
  const { d, calls } = await load({ user: { id: 'u1' } }, true);
  assert.equal(shown(d.getElementById('form')), true); assert.equal(shown(d.getElementById('gate')), false); assert.equal(shown(d.getElementById('preview')), false);
  assert.deepEqual(calls.rpc, ['is_admin']);
});
test('NEGATIVE CONTROL: a page where the preview were shown signed in would be caught by the same check', async () => {
  const { d } = await load({ user: { id: 'u1' } }, true);
  d.getElementById('preview').style.display = 'block';
  assert.equal(shown(d.getElementById('preview')) && shown(d.getElementById('form')), true, 'the control: this is the state the real tests reject');
});
test('the real form is untouched: still one submit button inside #form, outside the preview', () => {
  const d = new JSDOM(HTML).window.document;
  const form = d.getElementById('form'); assert.equal(form.querySelectorAll('button[type=submit]').length, 1);
  assert.equal(d.getElementById('preview').closest('form'), null); assert.equal(form.contains(d.getElementById('preview')), false);
});
