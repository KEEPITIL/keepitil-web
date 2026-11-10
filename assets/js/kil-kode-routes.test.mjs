// node --test assets/js/kil-kode-routes.test.mjs   (no dependencies)
//
// 10A (Atlas I11 "close public.profiles / KODE bypass"): kode/app.html and kode/embed.html run on the KODE Supabase project
// (xdoxfoectugsbbujjezq), NOT on KEEPITIL's. The profile-release stack (#91) pointed both at get_approved_profile, an RPC that APPLY-1 creates on the
// KEEPITIL project only, so on the KODE project it does not exist and every sign-in lands on "pick a handle". This test pins the fix: the two pages read
// the KODE project's own `profiles` table again and never call a KEEPITIL-only profile RPC.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const KODE_REF = 'xdoxfoectugsbbujjezq';
const KEEPITIL_REF = 'ovmqtzjfpzrbzrlkxwgw';
const KEEPITIL_ONLY_RPCS = /\.rpc\(\s*['"](get_approved_profile|get_public_profile|public_profile_list|i_own_profile|request_profile_claim|my_profile_slug|claim_profile)['"]/;

/** Returns the list of problems with a KODE page's source; [] means fine. */
export function problems(name, html) {
  const out = [];
  if (/get_approved_profile/.test(html)) out.push(name + ': calls get_approved_profile (does not exist on the KODE project)');
  if (KEEPITIL_ONLY_RPCS.test(html)) out.push(name + ': calls an RPC that exists only on the KEEPITIL project');
  if (!html.includes(KODE_REF)) out.push(name + ': does not point at the KODE project');
  if (html.includes(KEEPITIL_REF)) out.push(name + ': points at the KEEPITIL project');
  if (!/\.from\(\s*['"]profiles['"]\s*\)/.test(html)) out.push(name + ': does not read the KODE project\'s own profiles table');
  return out;
}

test('kode/app.html and kode/embed.html read the KODE project\'s own profiles table and call no KEEPITIL-only RPC', () => {
  assert.deepEqual(problems('kode/app.html', read('kode/app.html')), []);
  assert.deepEqual(problems('kode/embed.html', read('kode/embed.html')), []);
});

test('app.html looks the signed-in user up by id and embed.html looks the public handle up, as before the profile-release stack', () => {
  assert.match(read('kode/app.html'), /\.from\('profiles'\)\.select\('\*'\)\.eq\('id', me\.id\)\.maybeSingle\(\)/);
  assert.match(read('kode/embed.html'), /\.from\('profiles'\)\.select\('id,handle,display_name'\)\.eq\('handle', handle\)\.maybeSingle\(\)/);
});

test('no file under kode/ mentions get_approved_profile', () => {
  const hits = readdirSync(join(root, 'kode')).filter((f) => /\.(html|js|json)$/.test(f)).filter((f) => /get_approved_profile/.test(read('kode/' + f)));
  assert.deepEqual(hits, []);
});

// ---- negative controls: the checker must reject the version the profile-release stack (#91) shipped, and a wrong-project page
test('NEGATIVE CONTROL: the #91 edit of app.html (rpc get_approved_profile) is rejected', () => {
  const bad = read('kode/app.html').replace(
    "const { data: prof } = await db.from('profiles').select('*').eq('id', me.id).maybeSingle();",
    "const { data: rows } = await db.rpc('get_approved_profile', { p_id: me.id, p_slug: null });\n  const prof = Array.isArray(rows) && rows.length ? rows[0] : null;");
  assert.notEqual(bad, read('kode/app.html'), 'control not built');
  const p = problems('kode/app.html', bad);
  assert.ok(p.some((x) => /get_approved_profile/.test(x)), p.join('; '));
});

test('NEGATIVE CONTROL: the #91 edit of embed.html is rejected', () => {
  const bad = read('kode/embed.html').replace(
    "const { data: prof } = await db.from('profiles').select('id,handle,display_name').eq('handle', handle).maybeSingle();",
    "const { data: rows } = await db.rpc('get_approved_profile', { p_id: null, p_slug: handle });\n  const prof = Array.isArray(rows) && rows.length ? rows[0] : null;");
  assert.notEqual(bad, read('kode/embed.html'), 'control not built');
  assert.ok(problems('kode/embed.html', bad).some((x) => /get_approved_profile/.test(x)));
});

test('NEGATIVE CONTROL: a KODE page pointed at the KEEPITIL project is rejected', () => {
  const bad = read('kode/app.html').split(KODE_REF).join(KEEPITIL_REF);
  assert.notEqual(bad, read('kode/app.html'), 'control not built');
  const p = problems('kode/app.html', bad);
  assert.ok(p.some((x) => /KEEPITIL project/.test(x)) && p.some((x) => /does not point at the KODE project/.test(x)), p.join('; '));
});
