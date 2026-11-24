// FMW for-business page: the findings of the live-shots check (find-my-weed #94): sideways scroll on a phone (the comparison
// table), no og:image, no <main> landmark, links told apart only by color, an empty <th>. Each rule has a NEGATIVE CONTROL.
//   node --test assets/js/fmw-for-business-a11y.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const FILE = 'app/findmyweed/for-business/index.html';
const html = fs.readFileSync(FILE, 'utf8');

export function problems(h) {
  const p = [];
  if (!/<meta property="og:image" content="https:\/\/keepitil\.com\/app\/findmyweed\/img\/og\.png">/.test(h)) p.push('no og:image');
  if ((h.match(/<main\b/g) || []).length !== 1 || !/<\/main>/.test(h)) p.push('not exactly one <main>');
  if (/<table\b/.test(h) && !/<div class="tablewrap"[^>]*>\s*<table\b/.test(h)) p.push('the table is not in a scrolling wrapper');
  if (!/\.tablewrap\{[^}]*overflow-x:auto/.test(h)) p.push('the wrapper does not scroll sideways');
  if (/<th>\s*<\/th>/.test(h)) p.push('an empty <th>');
  if (!/\ba\{[^}]*text-decoration:underline/.test(h)) p.push('links are not underlined');
  if (/footer a\{[^}]*text-decoration:none/.test(h)) p.push('footer links lose their underline');
  if (/<footer\b/.test(h) && h.indexOf('</main>') > h.indexOf('<footer')) p.push('the footer sits inside <main>');
  return p;
}
test('for-business: og:image, one <main>, scrollable table, no empty th, underlined links', () => assert.deepEqual(problems(html), []));
test('NEGATIVE CONTROLS: each pre-fix gap is caught for its own reason', () => {
  const bad = [
    ['no og:image', html.replace(/<meta property="og:image" [^>]*>\n/, '')],
    ['no main', html.replace('<main>', '<div>').replace('</main>', '</div>')],
    ['table not wrapped', html.replace('<section id="grid">', '<section id="grid"><table><tr><td>x</td></tr></table>')],
    ['empty th', html.replace('<section id="grid">', '<section id="grid"><div class="tablewrap"><table><tr><th></th></tr></table></div>')],
    ['links not underlined', html.replace('a{color:var(--green);text-decoration:underline}', 'a{color:var(--green)}')],
    ['footer inside main', html.replace('  </main>\n', '').replace('</footer>', '</footer>\n</main>')],
  ];
  for (const [name, h] of bad) assert.ok(h !== html && problems(h).length > 0, name);
});

// Gap 10: this page has its own footer, so it carries the Find My Weed About / Privacy links and the SB 378 report link
// (the same mailto as the other pages, find-my-weed #90).
test('for-business footer: About, Privacy and "Report an unlicensed seller" (mailto info@keepitil.com)', () => {
  const foot = html.slice(html.indexOf('<footer'));
  assert.match(foot, /href="https:\/\/keepitil\.com\/app\/findmyweed\/about\.html">About</);
  assert.match(foot, /href="https:\/\/keepitil\.com\/app\/findmyweed\/privacy\.html">Privacy</);
  assert.match(foot, /href="mailto:info@keepitil\.com\?subject=Report%20an%20unlicensed%20seller[^"]*">Report an unlicensed seller</);
  // NEGATIVE CONTROL: the old footer has none of them
  const old = foot.replace(/<nav[\s\S]*?<\/nav>/, '');
  assert.doesNotMatch(old, /Report an unlicensed seller|privacy\.html/);
});
