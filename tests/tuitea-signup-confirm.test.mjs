import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { passwordConfirmCase, passwordLinkKind, settleRecoverySession } from '../app/tuitea/password/landing.mjs';
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

const recoveryHref = 'https://keepitil.com/app/tuitea/password/?from=mail#access_token=aaa&refresh_token=bbb&type=recovery&expires_in=3600&expires_at=9';
for (const mode of ['success', 'failure']) {
  let landed = '';
  const error = await settleRecoverySession(
    recoveryHref,
    async () => {
      if (mode === 'failure') throw new Error('rejected');
      return { error: null, session: { access_token: 'aaa' } };
    },
    (next) => { landed = next; },
  );
  assert.equal(new URL('https://keepitil.com' + landed).hash, '', mode + ' hash');
  assert.equal(landed.includes('access_token'), false, mode);
  assert.equal(landed.includes('refresh_token'), false, mode);
  assert.equal(landed.includes('expires_'), false, mode);
  assert.equal(landed, '/app/tuitea/password/?from=mail');
  if (mode === 'success') assert.equal(error, null);
  else assert.ok(error);
}
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

const origin = 'https://keepitil.com';
assert.equal(
  joinAuthUrl(origin + '/join/auth?flow=confirm&token_hash=not-real&type=signup', 'verify-signup'),
  '/join/auth?flow=confirm'
);
assert.equal(
  joinAuthUrl(origin + '/join/auth?code=abc&foo=1#access_token=tok&refresh_token=ref&type=signup', 'resend'),
  '/join/auth?foo=1#type=signup'
);
assert.equal(
  joinAuthUrl(origin + '/join/auth?code=abc#access_token=tok&refresh_token=ref&type=recovery', 'recovery'),
  '/join/auth#refresh_token=ref&type=recovery'
);
assert.equal(
  joinAuthUrl(origin + '/join/auth?code=abc#access_token=tok&refresh_token=ref', 'default'),
  '/join/auth'
);

const joinHtml = readFileSync(new URL('../join/auth/index.html', import.meta.url), 'utf8');
assert.match(joinHtml, /finally \{\s*history\.replaceState\(null, '', joinAuthUrl\(location\.href, 'verify-signup'\)\);/);
assert.match(joinHtml, /action === 'resend' \|\| action === 'recovery' \|\| action === 'default'/);
assert.match(joinHtml, /finally \{\s*history\.replaceState\(null, '', joinAuthUrl\(location\.href, action\)\);/);
const vendor = readFileSync(new URL('../assets/js/vendor/supabase-js-2.45.4.mjs', import.meta.url), 'utf8');
assert.match(vendor, /Copyright \(c\) 2020 Supabase/);
assert.match(vendor, /Permission is hereby granted, free of charge/);
assert.match(vendor, /THE SOFTWARE IS PROVIDED "AS IS"/);

console.log('tuitea signup confirm: ok');
