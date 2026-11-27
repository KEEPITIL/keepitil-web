'use strict';
// Run: node --test tests/email-only-signin.test.cjs
// KEEPITIL 1.0 (Grok 2026-11-24): sign-in is by EMAIL only, and the Culture Followers / Circle views are hidden, because neither public.email_for_handle() nor public.follower_handles() exists in
// production. A handle -> email lookup for an anonymous caller would also leak personal data, so it must never come back. These tests fail if the handle field, either RPC call, or the
// Followers / Circle views come back before Grok says go.
const assert = require('node:assert/strict');
const __A = require("./helpers/event-assembled.cjs").assemble;
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const RPC = (name) => new RegExp("rpc\\(\\s*['\"`]" + name + "['\"`]");
const apply = __A(read('apply.html')), culture = read('culture/index.html');

// every shipped page and script (not tests, docs, tools or node_modules)
function shipped(dir = root, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'tests', 'docs', 'tools', 'scripts', 'supabase'].includes(e.name)) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) shipped(f, out); else if (/\.(html|js|mjs)$/.test(e.name)) out.push(f);
  }
  return out;
}

test('sign-in field asks for an email: type email, placeholder and label "Email", no username wording', () => {
  const tag = (apply.match(/<input[^>]*id="login-id"[^>]*>/) || [''])[0];
  assert.match(tag, /type="email"/); assert.match(tag, /placeholder="Email"/); assert.match(tag, /aria-label="Email"/);
  assert.doesNotMatch(tag, /[Uu]sername|handle/);
  assert.doesNotMatch(apply, /Username or email|username\/email|Couldn.t find that username|resolveEmail/);
});

test('no page or script calls email_for_handle or follower_handles', () => {
  const hits = shipped().filter((f) => { const s = fs.readFileSync(f, 'utf8'); return RPC('email_for_handle').test(s) || RPC('follower_handles').test(s); });
  assert.deepEqual(hits.map((f) => path.relative(root, f)), []);
});

test('typing something that is not an email gets a clear message and makes no request', () => {
  const fn = apply.slice(apply.indexOf('function signIn()'), apply.indexOf('signInWithPassword'));
  assert.match(fn, /id\.indexOf\('@'\)<1/); assert.match(fn, /Log in with your email address/);
});

test('Culture: no Followers or Circle view, no follower list state, Following still there', () => {
  assert.doesNotMatch(culture, /data-ct="followers"|data-ct="circle"|setCulType\('followers'\)|setCulType\('circle'\)/);
  assert.doesNotMatch(culture, /__culFollowers/);
  assert.match(culture, /data-ct="following"/); assert.match(culture, /data-ct="all"/);
});

test('NEGATIVE CONTROLS: each old behaviour is caught by the same checks', () => {
  const withHandle = apply.replace('placeholder="Email"', 'placeholder="Username or email"');
  assert.match(withHandle, /Username or email/);
  assert.match(apply.replace('function signIn(){', "function r(){ supa.rpc('email_for_handle',{h:1}); }\nfunction signIn(){"), RPC('email_for_handle'));
  assert.match(culture.replace('</script>', "sb.rpc('follower_handles',{p_profile_slug:me});</script>"), RPC('follower_handles'));
  assert.match(culture.replace('<button data-ct="following"', '<button data-ct="followers" onclick="setCulType(\'followers\')">F</button><button data-ct="following"'), /data-ct="followers"/);
});
