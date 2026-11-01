import assert from 'node:assert/strict';
import { passwordLinkKind } from '../app/tuitea/password/landing.mjs';
import { confirmAction, confirmOtpType } from '../join/auth/confirm.mjs';

assert.equal(passwordLinkKind('?code=abc', ''), 'signup-code');
assert.equal(passwordLinkKind('?code=abc&type=signup', ''), 'signup-code');
assert.equal(passwordLinkKind('?code=abc&type=recovery', ''), 'existing');
assert.equal(passwordLinkKind('?code=abc', '#type=recovery'), 'existing');
assert.equal(passwordLinkKind('?token_hash=x&type=recovery', ''), 'existing');
assert.equal(passwordLinkKind('', '#access_token=a&refresh_token=b&type=recovery'), 'existing');
assert.equal(passwordLinkKind('?type=recovery', ''), 'existing');
assert.equal(passwordLinkKind('', ''), 'existing');

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
