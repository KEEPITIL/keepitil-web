// node --test assets/js/no-third-party-forms.test.mjs   (no dependencies)
//
// R-J1: no page in this repo hands visitor input to a third-party form relay.
//   1. No HTML (or first-party JS) mentions formsubmit.co or another hosted form relay
//      (formspree, getform, basin, web3forms, formcarry, staticforms, formkeep, pageclip).
//   2. No <form action> / formaction in any HTML points at a host other than keepitil.com.
//      Relative actions (results.html, /search) are first-party. The only allowance is the
//      reserved placeholder host example.com (RFC 2606) inside build-service/starter/, which
//      holds client templates whose action is filled in per client.
//   3. /needs (needs.html) is static text: no <form>, no network call, no pop-up, and it says
//      exactly the agreed sentence.
// Every checker has a NEGATIVE CONTROL that must fail on a known-bad input.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SKIP_DIRS = new Set(['.git', 'node_modules']);
const NEEDS_TEXT = "We're not taking requests through this page right now. Use the contact link on keepitil.com (About / footer).";

function walk(dir, out = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) { if (!SKIP_DIRS.has(ent.name)) walk(join(dir, ent.name), out); continue; }
    // test files hold the bad inputs for the negative controls, so they are not scanned
    if (/\.(html?|m?js)$/i.test(ent.name) && !/\.test\.[cm]?js$/i.test(ent.name)) out.push(relative(ROOT, join(dir, ent.name)).split(sep).join('/'));
  }
  return out;
}

// ---- checkers (pure, so the negative controls run the exact same code) ----

const RELAY = /\b(?:formsubmit\.co|formspree\.io|getform\.io|usebasin\.com|web3forms\.com|formcarry\.com|staticforms\.xyz|formkeep\.com|pageclip\.co)\b/gi;

/** Hosted form-relay hosts named anywhere in the text. */
export function relayMentions(text) {
  return [...text.matchAll(RELAY)].map((m) => m[0].toLowerCase());
}

function attrValue(tag, name) {
  const m = tag.match(new RegExp('\\s' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'));
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}

function firstParty(host) { return host === 'keepitil.com' || host.endsWith('.keepitil.com'); }
function placeholder(host) { return /^(?:.+\.)?example\.(?:com|org|net)$/.test(host); }

/** Form actions in the HTML that leave keepitil.com. `rel` is the file's repo path. */
export function thirdPartyActions(html, rel = '') {
  const bad = [];
  const tags = html.match(/<(?:form|button|input)\b[^>]*>/gi) || [];
  for (const tag of tags) {
    for (const name of ['action', 'formaction']) {
      const v = attrValue(tag, name);
      if (v == null) continue;
      const url = v.trim();
      const abs = url.match(/^(?:https?:)?\/\/([^/?#:]+)/i);
      if (!abs) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^https?:/i.test(url)) bad.push(url); // mailto:, javascript:, data:
        continue;
      }
      const host = abs[1].toLowerCase();
      if (firstParty(host)) continue;
      if (placeholder(host) && rel.startsWith('build-service/starter/')) continue;
      bad.push(url);
    }
  }
  return bad;
}

function pageText(html) {
  return html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&(?:#39|#x27|apos|rsquo);/gi, "'").replace(/&amp;/gi, '&').replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

/** Problems with the /needs page, [] when it is plain static text. */
export function needsProblems(html) {
  const p = [];
  if (/<form\b/i.test(html)) p.push('has a <form>');
  if (/<(?:input|textarea|select)\b/i.test(html)) p.push('has form fields');
  if (/<dialog\b/i.test(html)) p.push('has a <dialog>');
  if (/\b(?:fetch|XMLHttpRequest|sendBeacon|alert|confirm|prompt|showModal)\s*\(|window\.open\s*\(|new\s+XMLHttpRequest/.test(html)) p.push('has a network call or pop-up');
  if (relayMentions(html).length) p.push('names a form relay');
  if (!pageText(html).includes(NEEDS_TEXT)) p.push('missing the agreed notice text');
  return p;
}

// ---- the real tree ----

const FILES = walk(ROOT);

test('the walk sees the site (sanity)', () => {
  assert.ok(FILES.includes('index.html'), 'index.html not found: walk broken');
  assert.ok(FILES.includes('needs.html'), 'needs.html not found');
  assert.ok(FILES.filter((f) => /\.html?$/i.test(f)).length > 50, 'too few HTML files: walk broken');
});

test('no HTML or JS names formsubmit.co or another hosted form relay', () => {
  const hits = [];
  for (const rel of FILES) {
    const found = relayMentions(readFileSync(join(ROOT, rel), 'utf8'));
    if (found.length) hits.push(rel + ': ' + [...new Set(found)].join(', '));
  }
  assert.deepEqual(hits, []);
});

test('no HTML form posts to a third-party action', () => {
  const hits = [];
  for (const rel of FILES.filter((f) => /\.html?$/i.test(f))) {
    const found = thirdPartyActions(readFileSync(join(ROOT, rel), 'utf8'), rel);
    if (found.length) hits.push(rel + ': ' + found.join(', '));
  }
  assert.deepEqual(hits, []);
});

test('findmyweed-join.html is gone (the /findmyweed-join 301 is a Cloudflare zone rule)', () => {
  assert.equal(FILES.includes('findmyweed-join.html'), false);
});

test('/needs has no <form> and shows only the static notice', () => {
  assert.deepEqual(needsProblems(readFileSync(join(ROOT, 'needs.html'), 'utf8')), []);
});

// ---- negative controls: each checker must FAIL on a known-bad input ----

test('NEGATIVE CONTROL: relay scan catches formsubmit and friends', () => {
  for (const b of ["fetch('https://formsubmit.co/ajax/info@keepitil.com',{method:'POST'})",
    '<form action="https://formsubmit.co/info@keepitil.com" method="POST">',
    '<form action="https://FORMSPREE.io/f/abc">', 'https://getform.io/f/x', 'https://usebasin.com/f/x',
    'https://api.web3forms.com/submit', 'https://formcarry.com/s/x']) {
    assert.ok(relayMentions(b).length > 0, 'missed: ' + b);
  }
  for (const g of ['https://keepitil.com/about', 'formsubmitted', 'const basin = 1', 'subform.cool']) {
    assert.deepEqual(relayMentions(g), [], 'false positive: ' + g);
  }
});

test('NEGATIVE CONTROL: action scan catches third-party actions in every quoting style', () => {
  const bad = ['<form action="https://formsubmit.co/x" method="post">', "<form method='post' action='https://evil.test/x'>",
    '<form action=https://evil.test/x method=post>', '<form action="//evil.test/collect">',
    '<button type="submit" formaction="https://evil.test/x">', '<input type="submit" formaction="//evil.test/x">',
    '<form action="mailto:info@keepitil.com">', '<form class="form" method="post" action="https://contact.example.com/x">'];
  for (const b of bad) assert.equal(thirdPartyActions(b, 'about.html').length, 1, 'missed: ' + b);
  const good = ['<form action="results.html" method="get">', '<form action="/search">', '<form id="f">',
    '<form action="https://keepitil.com/x">', '<form action="https://www.keepitil.com/x">', '<form action="?q=1">',
    '<a href="https://evil.test/x">'];
  for (const g of good) assert.deepEqual(thirdPartyActions(g, 'about.html'), [], 'false positive: ' + g);
  // the example.com placeholder is allowed only inside the client starter templates
  const tmpl = '<form class="form" method="post" action="https://contact.example.com/functions/v1/client-contact">';
  assert.deepEqual(thirdPartyActions(tmpl, 'build-service/starter/preview/contact.html'), []);
  assert.equal(thirdPartyActions(tmpl, 'contact.html').length, 1);
  assert.equal(thirdPartyActions('<form action="https://keepitil.com.evil.test/x">', 'build-service/starter/x.html').length, 1);
});

test('NEGATIVE CONTROL: /needs checker rejects the old form page and near misses', () => {
  const good = readFileSync(join(ROOT, 'needs.html'), 'utf8');
  const notice = good.match(/<p class="notice"[^>]*>[\s\S]*?<\/p>/)[0];
  // the pre-R-J1 page: a form whose script posted to formsubmit.co
  const oldPage = good.replace(notice, '<form id="needsForm"><input type="email" id="email" required><button class="btn" type="submit">Send</button></form>'
    + "<script>fetch('https://formsubmit.co/ajax/info@keepitil.com',{method:'POST'})</script>");
  assert.notDeepEqual(needsProblems(oldPage), []);
  assert.notDeepEqual(needsProblems(good.replace('</footer>', '</footer><form></form>')), []);
  assert.notDeepEqual(needsProblems(good.replace('</body>', '<script>setTimeout(function(){alert("hi")},1000)</script></body>')), []);
  assert.notDeepEqual(needsProblems(good.replace('</body>', '<dialog open>Tell us</dialog></body>')), []);
  assert.notDeepEqual(needsProblems(good.replace(notice, notice.replace('right now.', 'today.'))), []);
  // the meta description alone does not count as the notice
  assert.ok(/<meta name="description"[^>]*right now/.test(good), 'fixture: description changed');
  assert.notDeepEqual(needsProblems(good.replace(notice, '').replace('KEEPITIL is not', "We're not")), []);
  assert.notDeepEqual(needsProblems(good.replace(notice, '')), []);
  // the apostrophe may be written as an entity and still pass
  assert.deepEqual(needsProblems(good.replace("We're", 'We&#39;re')), []);
});
