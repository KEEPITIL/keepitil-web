import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { passwordConfirmCase, passwordLinkKind, passwordExitUrl, passwordBareUrl, settleRecoverySession } from '../app/tuitea/password/landing.mjs';
import { confirmAction, confirmOtpType, joinAuthUrl } from '../join/auth/confirm.mjs';

assert.equal(passwordLinkKind('?code=abc', ''), 'maybe-confirmed');
assert.equal(passwordLinkKind('?code=abc&type=signup', ''), 'maybe-confirmed');
assert.equal(passwordLinkKind('?code=abc&type=recovery', ''), 'existing');
assert.equal(passwordLinkKind('?code=abc', '#type=recovery'), 'existing');
assert.equal(passwordLinkKind('?token_hash=x&type=recovery', ''), 'existing');
assert.equal(passwordLinkKind('', '#access_token=a&refresh_token=b&type=recovery'), 'existing');
assert.equal(passwordLinkKind('?type=recovery', ''), 'existing');
assert.equal(passwordLinkKind('', ''), 'no-token');

assert.equal(passwordConfirmCase('?flow=confirm&token_hash=abc', ''), 'verify-otp');
assert.equal(passwordConfirmCase('?flow=confirm&token_hash=abc&type=signup', ''), 'verify-otp');
assert.equal(passwordConfirmCase('?code=the-code', ''), 'maybe-confirmed');
assert.notEqual(passwordConfirmCase('?code=the-code', ''), 'verify-otp');
assert.notEqual(passwordConfirmCase('?code=the-code', ''), 'exchange-code');
assert.equal(passwordConfirmCase('', '#access_token=tok&type=signup'), 'confirm-session');
assert.equal(passwordConfirmCase('', '#access_token=tok&refresh_token=ref&type=signup'), 'confirm-session');
assert.notEqual(passwordConfirmCase('', '#access_token=tok&refresh_token=ref&type=signup'), 'recovery');
assert.equal(passwordConfirmCase('?flow=confirm', ''), 'no-token');
assert.equal(passwordConfirmCase('', ''), 'no-token');
assert.equal(passwordConfirmCase('?code=abc&type=recovery', ''), 'recovery');
assert.equal(passwordConfirmCase('?token_hash=x&type=recovery', ''), 'recovery');

assert.equal(settleRecoverySession.toString().includes('signOut'), false);
assert.match(settleRecoverySession.toString(), /finally/);

const passwordHtml = readFileSync(new URL('../app/tuitea/password/index.html', import.meta.url), 'utf8');
assert.match(passwordHtml, /name="referrer" content="no-referrer"/);
assert.match(passwordHtml, /verifyOtp\(\{ token_hash: th, type: otpType \}\)/);
assert.equal(passwordHtml.includes('exchangeCodeForSession'), false);
assert.match(passwordHtml, /finally \{/);
assert.match(passwordHtml, /Your email may already be confirmed - try signing in/);
assert.equal(passwordHtml.includes('That confirmation link has expired'), false);
assert.match(passwordHtml, /id="maybe-reset"/);
assert.match(passwordHtml, /assets\/js\/vendor\/supabase-js-2\.45\.4\.mjs/);
assert.equal(passwordHtml.includes('esm.sh'), false);
assert.match(passwordHtml, /Open the link from your email/);
const staticBody = passwordHtml.split('<body>')[1].split('<script')[0];
assert.equal(staticBody.includes('Your email is confirmed'), false);
assert.match(staticBody, /Open the link from your email/);
assert.equal(existsSync(new URL('../app/tuitea/password/cases.html', import.meta.url)), false);

assert.equal(confirmOtpType('?flow=confirm&token_hash=abc', ''), 'signup');
assert.equal(confirmOtpType('?token_hash=abc&type=signup', ''), 'signup');
assert.equal(confirmOtpType('', '#token_hash=abc&type=signup'), 'signup');
assert.equal(confirmOtpType('?flow=confirm', ''), null);
assert.equal(confirmOtpType('?token_hash=abc&type=recovery', ''), null);
assert.equal(confirmOtpType('?flow=confirm&token_hash=abc&type=recovery', ''), null);
assert.equal(confirmAction('?flow=confirm&token_hash=abc', ''), 'verify-signup');
assert.equal(confirmAction('?token_hash=abc&type=signup', ''), 'verify-signup');
assert.equal(confirmAction('?flow=confirm', ''), 'resend');
assert.equal(confirmAction('?code=abc', ''), 'resend');
assert.equal(confirmAction('?type=signup', ''), 'resend');
assert.equal(confirmAction('?type=recovery', ''), 'recovery');
assert.equal(confirmAction('?type=recovery&error=access_denied', ''), 'recovery-error');
assert.equal(confirmAction('', ''), 'default');

const P = 'https://keepitil.com/app/tuitea/password/';
const J = 'https://keepitil.com/join/auth';
const hashRecovery = P + '?from=mail#access_token=aaa&refresh_token=bbb&type=recovery&expires_in=3600&expires_at=9';

async function settled(href, fail) {
  let landed = '';
  const error = await settleRecoverySession(
    href,
    async () => (fail ? Promise.reject(new Error('rejected')) : { error: null, session: { access_token: 'aaa' } }),
    (next) => { landed = next; },
  );
  assert.equal(Boolean(error), fail);
  return landed;
}

const exits = [
  ['password needs-link code+type', () => passwordExitUrl(P + '?code=abc&type=recovery'), '/app/tuitea/password/'],
  ['password access without refresh', () => passwordExitUrl(P + '#access_token=a'), '/app/tuitea/password/'],
  ['password error recovery', () => passwordExitUrl(P + '?error_description=expired&type=recovery&code=abc'), '/app/tuitea/password/'],
  ['password error confirm', () => passwordExitUrl(P + '?flow=confirm&error_description=expired&token_hash=x&type=signup'), '/app/tuitea/password/?flow=confirm'],
  ['password verify-otp confirm', () => passwordExitUrl(P + '?flow=confirm&token_hash=x&type=signup'), '/app/tuitea/password/?flow=confirm'],
  ['password verify-otp signup', () => passwordExitUrl(P + '?token_hash=x&type=signup'), '/app/tuitea/password/'],
  ['password confirm-session', () => passwordExitUrl(P + '#access_token=a&refresh_token=b&type=signup&expires_in=1'), '/app/tuitea/password/'],
  ['password bare code', () => passwordExitUrl(P + '?code=abc'), '/app/tuitea/password/'],
  ['password code with confirm', () => passwordExitUrl(P + '?flow=confirm&code=abc'), '/app/tuitea/password/?flow=confirm'],
  ['password no token', () => passwordExitUrl(P), '/app/tuitea/password/'],
  ['password flow only', () => passwordExitUrl(P + '?flow=confirm&foo=1'), '/app/tuitea/password/?flow=confirm'],
  ['password token_hash recovery', () => passwordExitUrl(P + '?token_hash=x&type=recovery'), '/app/tuitea/password/'],
  ['password hash recovery url', () => passwordBareUrl(hashRecovery), '/app/tuitea/password/'],
  ['password hash recovery success', () => settled(hashRecovery, false), '/app/tuitea/password/'],
  ['password hash recovery failure', () => settled(hashRecovery, true), '/app/tuitea/password/'],
  ['join verify keeps marker', () => joinAuthUrl(J + '?flow=confirm&token_hash=not-real&type=signup', 'verify-signup'), '/join/auth?flow=confirm'],
  ['join verify sets marker', () => joinAuthUrl(J + '?token_hash=abc&type=signup', 'verify-signup'), '/join/auth?flow=confirm'],
  ['join resend code', () => joinAuthUrl(J + '?code=abc&foo=1#access_token=tok&refresh_token=ref&type=signup', 'resend'), '/join/auth'],
  ['join resend confirm', () => joinAuthUrl(J + '?flow=confirm&code=abc#access_token=t&type=signup', 'resend'), '/join/auth?flow=confirm'],
  ['join recovery hash', () => joinAuthUrl(J + '#access_token=a&refresh_token=r&type=recovery', 'recovery'), '/join/auth'],
  ['join recovery with code', () => joinAuthUrl(J + '?code=abc#access_token=tok&refresh_token=ref&type=recovery', 'recovery'), '/join/auth'],
  ['join default refresh', () => joinAuthUrl(J + '?code=abc#access_token=tok&refresh_token=ref', 'default'), '/join/auth'],
  ['join recovery-error', () => joinAuthUrl(J + '?type=recovery&error=access_denied#access_token=a&refresh_token=r', 'recovery-error'), '/join/auth'],
  ['join empty', () => joinAuthUrl(J, 'default'), '/join/auth'],
];

for (const [name, run, expected] of exits) {
  const got = await run();
  const url = new URL(got, 'https://keepitil.com');
  assert.equal(url.hash, '', name + ' hash');
  assert.deepEqual([...url.searchParams.keys()].filter((key) => key !== 'flow'), [], name);
  if (url.searchParams.has('flow')) assert.equal(url.searchParams.get('flow'), 'confirm', name);
  assert.equal(got.includes('token'), false, name);
  assert.equal(got.includes('code='), false, name);
  assert.equal(got.includes('type='), false, name);
  assert.equal(got, expected, name);
}

const joinHtml = readFileSync(new URL('../join/auth/index.html', import.meta.url), 'utf8');
assert.match(joinHtml, /finally \{\s*history\.replaceState\(null, '', joinAuthUrl\(location\.href, 'verify-signup'\)\);/);
assert.match(joinHtml, /action === 'recovery-error' \|\| action === 'resend' \|\| action === 'recovery' \|\| action === 'default'/);
assert.match(joinHtml, /finally \{\s*history\.replaceState\(null, '', joinAuthUrl\(location\.href, action\)\);/);
const needsAt = passwordHtml.indexOf('This page needs the link');
const clearAt = passwordHtml.lastIndexOf('passwordExitUrl(location.href)', needsAt);
assert.ok(needsAt > 0 && clearAt > 0 && clearAt < needsAt);
const vendor = readFileSync(new URL('../assets/js/vendor/supabase-js-2.45.4.mjs', import.meta.url), 'utf8');
assert.match(vendor, /Copyright \(c\) 2020 Supabase/);
assert.match(vendor, /Permission is hereby granted, free of charge/);
assert.match(vendor, /THE SOFTWARE IS PROVIDED "AS IS"/);

console.log('tuitea signup confirm: ok');
