import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { passwordConfirmCase, passwordLinkKind } from '../app/tuitea/password/landing.mjs';
import { confirmAction, confirmOtpType } from '../join/auth/confirm.mjs';

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

console.log('tuitea signup confirm: ok');
