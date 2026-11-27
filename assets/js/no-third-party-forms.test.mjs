// node --test assets/js/no-third-party-forms.test.mjs   (no dependencies)
//
// R-J1: no page in this repo hands visitor input to a third-party form relay.
//   1. No HTML (or first-party JS) mentions formsubmit.co or another hosted form relay
//      (formspree, getform, basin, web3forms, formcarry, staticforms, formkeep, pageclip).
//   2. No <form action> / formaction in any HTML points at a host other than keepitil.com.
//      Relative actions (results.html, /search) are first-party. There is no allowance: the
//      build-service client templates that used an example.com placeholder action were removed
//      as dead pages (Joe, 2026-11-22).
//   3. /needs (needs.html) is gone: it was reduced to a static "not taking requests" notice in R-J1
//      and then removed as a dead page (owner directive "remove all keepitil dead pages", 2026-11-22).
//   4. No page links to /needs (or needs.html): the "Tell Us What You Need" / "Start Here" / "Work with us"
//      buttons were removed (Grok, R-J1) so a visitor never lands on the static notice as a dead end.
// Every checker has a NEGATIVE CONTROL that must fail on a known-bad input.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SKIP_DIRS = new Set(['.git', 'node_modules']);

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
      bad.push(url);
    }
  }
  return bad;
}

const NEEDS_TARGET = /^(?:(?:https?:)?\/\/(?:www\.)?keepitil\.com)?(?:\.{0,2}\/)*needs(?:\.html)?\/?(?:[?#].*)?$/i;
const LINK_ATTR = /\b(?:href|action|formaction)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const ABS_NEEDS = /(?:https?:)?\/\/(?:www\.)?keepitil\.com\/needs(?:\.html)?(?![\w.-])/gi;
const JS_NEEDS = /(["'`])\/needs(?:\.html)?\/?(?:[?#][^"'`]*)?\1/g;

/** Links to /needs in a page or script: link attributes, absolute keepitil.com/needs URLs, and '/needs' string literals. */
export function needsLinks(text) {
  const hits = [];
  for (const m of text.matchAll(LINK_ATTR)) {
    const v = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (NEEDS_TARGET.test(v)) hits.push(v);
  }
  for (const m of text.matchAll(ABS_NEEDS)) if (!hits.some((h) => h.includes(m[0]))) hits.push(m[0]);
  for (const m of text.matchAll(JS_NEEDS)) hits.push(m[0]);
  return hits;
}

// ---- the real tree ----

const FILES = walk(ROOT);

test('the walk sees the site (sanity)', () => {
  assert.ok(FILES.includes('index.html'), 'index.html not found: walk broken');
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

test('needs.html is gone (removed as a dead page, 2026-11-22)', () => {
  assert.equal(FILES.includes('needs.html'), false);
});

test('no page links to /needs (the CTA buttons were removed, so no dead ends)', () => {
  const hits = [];
  for (const rel of FILES) {
    const found = needsLinks(readFileSync(join(ROOT, rel), 'utf8'));
    if (found.length) hits.push(rel + ': ' + found.join(', '));
  }
  assert.deepEqual(hits, []);
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
  // an example.com placeholder action is third-party too (no template allowance is left)
  const tmpl = '<form class="form" method="post" action="https://contact.example.com/functions/v1/client-contact">';
  assert.equal(thirdPartyActions(tmpl, 'contact.html').length, 1);
  assert.equal(thirdPartyActions('<form action="https://keepitil.com.evil.test/x">', 'contact.html').length, 1);
});

test('NEGATIVE CONTROL: /needs link scan catches the removed buttons and their variants', () => {
  const bad = ['<a class="btn" href="https://keepitil.com/needs">Tell Us What You Need</a>',
    '<a class="btn" href="https://keepitil.com/needs">Start Here</a>',
    '· <a href="https://keepitil.com/needs">Work with us</a></footer>',
    '<a class="ind" href="https://keepitil.com/needs"><b>More</b></a>',
    '<a href="/needs">x</a>', '<a href="/needs/">x</a>', '<a href="needs.html">x</a>', '<a href="../needs.html#top">x</a>',
    "<a href='https://www.keepitil.com/needs?src=about'>x</a>", '<a href=//keepitil.com/needs>x</a>',
    '<form action="/needs">', "location.href = '/needs';", 'window.open("https://keepitil.com/needs")',
    'const u = `/needs.html`;'];
  for (const b of bad) assert.ok(needsLinks(b).length > 0, 'missed: ' + b);
  const good = ['<a href="https://keepitil.com/about">About</a>', '<a href="/needsomething">x</a>',
    '<a href="/app/needs-list/">x</a>', '<span data-field="needs">x</span>', '<p>Tell us what you need</p>',
    "setText(card, 'needs', o.needs);", '<a href="https://keepitil.com/needs-assessment">x</a>',
    '<a href="https://evil.test/needs">x</a>'];
  for (const g of good) assert.deepEqual(needsLinks(g), [], 'false positive: ' + g);
});
