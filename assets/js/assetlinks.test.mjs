// FS2 prep (HOLD): /.well-known/assetlinks.json at the keepitil.com origin root (Digital Asset Links for the Find My Weed Android app).
// DRAFT UNTIL JOE GIVES THE VALUES: the file carries TODO_ placeholders for the Play package name and the Play app-signing SHA-256 fingerprint.
//   1. shape + format validator, with negative controls (passes now, and keeps passing with real values);
//   2. the file is published (not excluded from the Pages artifact);
//   3. HOLD GUARD: fails while any TODO_ placeholder is present, so a placeholder file cannot be merged and served by accident.
//      Replace the two values (package name, SHA-256 as 32 colon-separated hex pairs), and this goes green.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseExcludes, isExcluded } from '../../scripts/pages-build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = '.well-known/assetlinks.json';
const raw = () => fs.readFileSync(path.join(ROOT, FILE), 'utf8');
const PKG = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, FP = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

function shapeProblems(doc) {
  const p = [];
  if (!Array.isArray(doc) || doc.length !== 1) return ['one statement expected'];
  const [s] = doc;
  if (JSON.stringify(s.relation) !== '["delegate_permission/common.handle_all_urls"]') p.push('relation');
  if (!s.target || s.target.namespace !== 'android_app') p.push('namespace');
  if (typeof s.target?.package_name !== 'string' || !s.target.package_name) p.push('package_name');
  const fps = s.target?.sha256_cert_fingerprints;
  if (!Array.isArray(fps) || fps.length < 1 || fps.some((f) => typeof f !== 'string' || !f)) p.push('fingerprints');
  return p;
}
const placeholders = (doc) => JSON.stringify(doc).match(/TODO_[A-Z0-9_]+/g) || [];
const valueProblems = (doc) => {
  const t = doc[0].target, p = [];
  if (!PKG.test(t.package_name)) p.push('package_name format');
  for (const f of t.sha256_cert_fingerprints) if (!FP.test(f)) p.push('fingerprint format ' + f);
  return p;
};

test('assetlinks.json has the Digital Asset Links shape (android_app, handle_all_urls, one package, at least one fingerprint)', () => {
  assert.deepEqual(shapeProblems(JSON.parse(raw())), []);
});
test('negative controls: wrong namespace, wrong relation, missing fingerprint and a second statement are refused; bad values are refused once placeholders are gone', () => {
  const good = JSON.parse(raw());
  const clone = () => JSON.parse(JSON.stringify(good));
  const a = clone(); a[0].target.namespace = 'web'; assert.ok(shapeProblems(a).length);
  const b = clone(); b[0].relation = ['delegate_permission/common.get_login_creds']; assert.ok(shapeProblems(b).length);
  const c = clone(); c[0].target.sha256_cert_fingerprints = []; assert.ok(shapeProblems(c).length);
  const d = [...clone(), ...clone()]; assert.ok(shapeProblems(d).length);
  const real = clone(); real[0].target.package_name = 'com.keepitil.findmyweed'; real[0].target.sha256_cert_fingerprints = [Array.from({ length: 32 }, (_, i) => (i * 7 % 256).toString(16).toUpperCase().padStart(2, '0')).join(':')];
  assert.deepEqual(shapeProblems(real), []); assert.deepEqual(valueProblems(real), []); assert.deepEqual(placeholders(real), []);
  const e = JSON.parse(JSON.stringify(real)); e[0].target.sha256_cert_fingerprints = ['abc']; assert.ok(valueProblems(e).length);
  const f = JSON.parse(JSON.stringify(real)); f[0].target.package_name = 'Not A Package'; assert.ok(valueProblems(f).length);
});
test('the file is published: .well-known/ is not excluded from the Pages artifact', () => {
  const rules = parseExcludes(fs.readFileSync(path.join(ROOT, '.github/pages-exclude.txt'), 'utf8'));
  assert.equal(isExcluded(FILE, rules), false);
});
test('HOLD GUARD: no TODO_ placeholder may ship in assetlinks.json (fails until Joe supplies the Play package name and fingerprint)', () => {
  const doc = JSON.parse(raw());
  assert.deepEqual(placeholders(doc), [], 'HOLD: replace ' + placeholders(doc).join(', ') + ' with the real Play values before merging');
  assert.deepEqual(valueProblems(doc), []);
});
