// Guard: no SQL / migration file may end up in the GitHub Pages artifact (_site).
// keepitil.com is served with .nojekyll, so every tracked file that is not excluded in
// .github/pages-exclude.txt is public. SQL migrations, rollbacks, seeds and edge-function sources
// (supabase/) must never be served.
//
//  1. Real repo: every .sql file, and every top-level directory holding SQL or a "migrations" dir,
//     is excluded by the real exclude file; building the artifact leaves no .sql in _site.
//  2. Forward-looking fixture: a synthetic tree with supabase/migrations/x.sql is excluded by the
//     real exclude file ...
//  3. NEGATIVE CONTROL: ... and the SAME check FAILS when run with a copy of the exclude file that
//     lacks the `supabase/` line (proves the test would have caught the leak).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseExcludes, isExcluded, buildSite, walk } from '../../scripts/pages-build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXCLUDE_FILE = path.join(ROOT, '.github/pages-exclude.txt');
const EXCLUDE_TEXT = fs.readFileSync(EXCLUDE_FILE, 'utf8');

const isSql = (rel) => /\.sql$/i.test(rel);
const isMigration = (rel) => /(^|\/)migrations?\//i.test(rel);
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

// Files that would be public: kept by the rules and either SQL or inside a migrations dir.
function leaks(files, rules) {
  return files.filter((f) => !isExcluded(f, rules) && (isSql(f) || isMigration(f)));
}

function stage(files, excludeText) {
  const src = tmp('pages-sql-src-');
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(src, rel)), { recursive: true });
    fs.writeFileSync(path.join(src, rel), body);
  }
  const out = path.join(src, '_site');
  const { kept, dropped } = buildSite({ src, out, rules: parseExcludes(excludeText) });
  const onDisk = walk(out);
  return { kept, dropped, onDisk };
}

const SITE = { 'CNAME': 'keepitil.com\n', '.nojekyll': '', '404.html': 'x', 'index.html': '<p>hi</p>' };
const SUPABASE_TREE = {
  ...SITE,
  'supabase/migrations/20261107014000_x.sql': 'create table t();',
  'supabase/rollbacks/x_down.sql': 'drop table t;',
  'supabase/seed/qa.sql': 'insert into t values (1);',
  'supabase/functions/agent/index.ts': 'export {}',
};

test('real repo: every .sql file and migrations dir is excluded from the artifact', () => {
  const rules = parseExcludes(EXCLUDE_TEXT);
  const all = walk(ROOT, ['node_modules', '_site']);
  const sqlish = all.filter((f) => isSql(f) || isMigration(f));
  assert.deepEqual(leaks(all, rules), [], 'SQL/migration files would be publicly served: ' + leaks(all, rules).join(', '));
  // Top-level directories holding SQL are each covered by a rule (so a new file there stays excluded too).
  const tops = [...new Set(sqlish.map((f) => f.split('/')[0]).filter((t) => sqlish.some((f) => f.startsWith(t + '/'))))];
  for (const t of tops) assert.ok(isExcluded(t + '/__probe__.txt', rules), `top-level dir ${t}/ holds SQL but is not excluded`);
});

test('real repo: staged _site contains no .sql file', () => {
  const out = tmp('pages-sql-real-');
  const { kept } = buildSite({ src: ROOT, out: path.join(out, '_site'), rules: parseExcludes(EXCLUDE_TEXT) });
  assert.deepEqual(kept.filter(isSql), []);
  assert.deepEqual(walk(path.join(out, '_site')).filter(isSql), []);
});

test('exclude file lists supabase/ (the Supabase CLI project dir)', () => {
  const rules = parseExcludes(EXCLUDE_TEXT);
  for (const p of ['supabase/migrations/a.sql', 'supabase/functions/x/index.ts', 'supabase/config.toml']) {
    assert.ok(isExcluded(p, rules), p + ' must be excluded');
  }
  assert.ok(!isExcluded('supabase.html', rules), 'a page named supabase.html is not the dir');
});

test('forward-looking fixture: supabase/migrations/x.sql is excluded by the real exclude file', () => {
  const r = stage(SUPABASE_TREE, EXCLUDE_TEXT);
  assert.deepEqual(r.onDisk.filter(isSql), []);
  assert.deepEqual(r.onDisk.filter((f) => f.startsWith('supabase/')), []);
  assert.equal(r.dropped.filter(isSql).length, 3);
  assert.ok(r.onDisk.includes('index.html') && r.onDisk.includes('CNAME'));
});

test('NEGATIVE CONTROL: without the supabase/ line the same fixture leaks SQL and the check fails', () => {
  const without = EXCLUDE_TEXT.split('\n').filter((l) => l.trim() !== 'supabase/').join('\n');
  assert.notEqual(without, EXCLUDE_TEXT, 'control must actually remove the line');
  const r = stage(SUPABASE_TREE, without);
  assert.deepEqual(r.onDisk.filter(isSql).sort(), [
    'supabase/migrations/20261107014000_x.sql', 'supabase/rollbacks/x_down.sql', 'supabase/seed/qa.sql',
  ]);
  // the leak detector used by the real-repo test flags the very same tree
  assert.equal(leaks(Object.keys(SUPABASE_TREE), parseExcludes(without)).length, 3);
  assert.equal(leaks(Object.keys(SUPABASE_TREE), parseExcludes(EXCLUDE_TEXT)).length, 0);
});

test('NEGATIVE CONTROL: a brand-new top-level SQL dir that nobody excluded is caught', () => {
  const tree = { ...SITE, 'newdb/migrations/1.sql': 'select 1;' };
  const rules = parseExcludes(EXCLUDE_TEXT);
  assert.deepEqual(leaks(Object.keys(tree), rules), ['newdb/migrations/1.sql']);
  assert.deepEqual(stage(tree, EXCLUDE_TEXT).onDisk.filter(isSql), ['newdb/migrations/1.sql']);
});
