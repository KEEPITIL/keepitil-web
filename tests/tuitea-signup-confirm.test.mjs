import assert from 'node:assert/strict';
import { passwordLinkKind } from '../app/tuitea/password/landing.mjs';
import { confirmOtpType, isConfirmFlow } from '../join/auth/confirm.mjs';

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
assert.equal(isConfirmFlow('?flow=confirm', ''), true);
assert.equal(isConfirmFlow('?type=signup', ''), true);
assert.equal(isConfirmFlow('?type=recovery', ''), false);

console.log('tuitea signup confirm: ok');
