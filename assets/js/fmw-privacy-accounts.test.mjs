// Find My Weed drop-in (find-my-weed #91): the Privacy page no longer says "No accounts" / "no visitor accounts" now that
// sign-up is live, and it has an "If you create an account" section. NEGATIVE CONTROL: main's wording is caught.
// Run: node --test assets/js/fmw-privacy-accounts.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const APP = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'), 'app', 'findmyweed');
const read = (f) => fs.readFileSync(path.join(APP, f), 'utf8').replace(/\r\n/g, '\n');
const load = (src) => { const m = { exports: {} }; vm.runInNewContext(src, { module: m, exports: m.exports, require: () => ({}), window: {} }); return m.exports; };

export function problems(C, html) {
  const p = [], all = [C.meta.privacy.description, ...C.info.privacy.sections.flatMap((s) => [s.h, ...s.p])].join(' ');
  if (/\bno (visitor )?accounts\b/i.test(all + ' ' + html)) p.push('says there are no accounts');
  const sec = C.info.privacy.sections.find((s) => s.h === 'If you create an account');
  if (!sec) p.push('no account section');
  else for (const re of [/link we email to you/, /email address/, /license number/, /legal business name/, /date of birth is not stored/]) if (!re.test(sec.p.join(' '))) p.push('missing ' + re);
  return p;
}

test('drop-in Privacy describes live accounts', () => {
  assert.deepEqual(problems(load(read('js/copy.js')), read('privacy.html')), []);
});

test('NEGATIVE CONTROL: the old wording (main) is caught', () => {
  const src = read('js/copy.js').replace("h: 'Accounts are optional; no ad tracking'", "h: 'No accounts, no ad tracking'").replace(/          \{ h: 'If you create an account'[\s\S]*?\] \},\n/, '');
  const p = problems(load(src), '');
  assert.ok(p.includes('says there are no accounts') && p.includes('no account section'), p.join('; '));
});
