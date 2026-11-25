'use strict';
// Run: node --test tests/tuitea-only-brand.test.cjs
// Joe's every-app-branded rule (2026-11-23): pages a TUITEA invitee can land on (the SMS invite link, the emailed sign-in / confirm / reset pages, the install page) show TUITEA only:
// no other brand's name in the visible text, and the TUITEA gold-tree icon as page icon / favicon / apple-touch icon, never the green "T" placeholder (app/tuitea/icon-192.png and siblings).
// /join/ is covered by tests/join-icon.test.cjs. Not covered here (listed in the PR for Grok): the PWA manifest icons, whose files are the placeholder T.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const GOLD = '/app/tuitea/invite/tuitea_icon_256.png';
const PAGES = ['app/tuitea/invite/index.html', 'join/auth/index.html', 'app/tuitea/password/index.html', 'app/tuitea/index.html'];
const OTHER_BRANDS = /\b(KEEPITIL|Find My Weed|Kai Tarako|KMOB|Kingdom Wars|PokaSnap|KBeats)\b/i;
const PLACEHOLDER_T = /\/app\/tuitea\/(icon-192|icon-512|icon-maskable-512|apple-touch-icon)\.png|brand\/tuitea\/share\.png/;

const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
// what a person can see or read: body text without scripts, styles, comments and tags; plus the title and the link-preview text
const visible = (html) => (html.split(/<body[^>]*>/i)[1] || '').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const head = (html) => html.split(/<\/head>/i)[0].replace(/<!--[\s\S]*?-->/g, ' ');
const icons = (html) => ({ icon: (head(html).match(/<link rel="icon" href="([^"]+)"/) || [])[1], touch: (head(html).match(/<link rel="apple-touch-icon" href="([^"]+)"/) || [])[1] });

for (const p of PAGES) {
  test(`${p}: no other brand's name in the visible text, the title or the link-preview text`, () => {
    const html = read(p), h = head(html);
    assert.doesNotMatch(visible(html), OTHER_BRANDS);
    assert.doesNotMatch((h.match(/<title>([^<]*)<\/title>/) || [])[1] || '', OTHER_BRANDS);
    for (const m of h.matchAll(/<meta (?:property|name)="(?:og|twitter):(?:title|description|site_name)" content="([^"]*)"/g)) assert.doesNotMatch(m[1], OTHER_BRANDS);
  });
  test(`${p}: page icon and apple-touch icon are the TUITEA gold tree, no placeholder T anywhere in the head`, () => {
    const html = read(p), u = icons(html);
    assert.equal(u.icon, GOLD); assert.equal(u.touch, GOLD);
    assert.doesNotMatch(head(html).replace(/<link rel="manifest"[^>]*>/, ''), PLACEHOLDER_T);
  });
}

test('NEGATIVE CONTROLS: the old pages (the "TUITEA by KEEPITIL" line, no icon, the placeholder T) are caught by the same checks', () => {
  const inv = read('app/tuitea/invite/index.html');
  assert.match(visible(inv.replace('</main>', '<p class="note">TUITEA by KEEPITIL</p></main>')), OTHER_BRANDS);
  assert.equal(icons(read('join/auth/index.html').replace(/<link rel="(?:icon|apple-touch-icon)"[^>]*>\n/g, '')).icon, undefined);
  assert.match(head(read('app/tuitea/index.html')).replace(GOLD, '/app/tuitea/icon-192.png').replace(GOLD, '/app/tuitea/apple-touch-icon.png'), PLACEHOLDER_T);
});

test('the gold-tree icon file the pages point to exists and is the pinned one (tests/join-icon.test.cjs holds the hash)', () => {
  assert.ok(fs.existsSync(path.join(root, GOLD.slice(1))));
});
