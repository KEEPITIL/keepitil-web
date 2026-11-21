// A205 (Sentinel's post-launch list) for app/findmyweed/for-business/:
//   - links are readable: the old axe contrast failures were plain <a> links in the browser's default blue on the dark page;
//     a base a{color:var(--green)} rule fixes them (buttons keep their own colours);
//   - the age line says "21+ (18+ medical where legal)", never a bare 21+ or "21+ only".
// Run: node --test assets/js/fmw-for-business-a205.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'app/findmyweed/for-business/index.html'), 'utf8');

const lum = (hex) => { const c = [0, 2, 4].map((i) => parseInt(hex.replace('#', '').slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
export const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const vars = Object.fromEntries([...HTML.match(/:root\{([^}]*)\}/)[1].matchAll(/--([a-z-]+):(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));

test('A205: plain links get the green link colour, readable (>= 4.5:1) on the page and card backgrounds', () => {
  assert.match(HTML, /\n  a\{color:var\(--green\)\}\n/, 'base link colour rule');
  const plain = [...HTML.matchAll(/<a (?![^>]*class="btn)[^>]*>/g)].length;
  assert.ok(plain >= 5, 'plain links exist (' + plain + ')');
  for (const bg of ['bg', 'card']) assert.ok(ratio(vars.green, vars[bg]) >= 4.5, 'green on ' + bg + ': ' + ratio(vars.green, vars[bg]).toFixed(2));
  // buttons keep their own colours: .btn sets color after the base rule (class beats element)
  assert.match(HTML, /\.btn\{[^}]*color:#06130a/);
  // NEGATIVE CONTROLS: the browser default link blue and visited purple fail on this page (what axe reported)
  assert.ok(ratio('#0000ee', vars.bg) < 4.5); assert.ok(ratio('#551a8b', vars.bg) < 4.5);
});

test('A205: the age line is "21+ (18+ medical where legal)", never a bare 21+ or "21+ only"', () => {
  const text = HTML.replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const bare = (t) => /21\+(?! \(18\+ medical where legal\))/.test(t) || /21\+\s*only/i.test(t);
  assert.equal(bare(text), false);
  assert.match(text, /Cannabis marketing services · 21\+ \(18\+ medical where legal\)/);
  assert.match(text, /Consumers 21\+ \(18\+ medical where legal\) join free\./);
  // NEGATIVE CONTROLS: the launched wording is caught
  assert.equal(bare('Cannabis marketing services · 21+ only'), true);
  assert.equal(bare('Consumers 21+ join free.'), true);
});
