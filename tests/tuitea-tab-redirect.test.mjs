import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tuiteaTabTarget } from '../app/tuitea/tab-target.mjs';

const invite = 'a'.repeat(32);
const inviteUpper = 'A'.repeat(32);

assert.equal(
  tuiteaTabTarget('tupu', '?invite=' + invite + '&foo=1', '#done'),
  '/app/tuitea/app/?invite=' + invite + '&tab=tupu#done'
);
assert.equal(tuiteaTabTarget('home', '', ''), '/app/tuitea/app/?tab=home');
assert.equal(
  tuiteaTabTarget('family', '?tab=home&invite=' + invite, ''),
  '/app/tuitea/app/?invite=' + invite + '&tab=family'
);
assert.equal(
  tuiteaTabTarget('family', '?tab=home&invite=' + inviteUpper, ''),
  '/app/tuitea/app/?invite=' + invite + '&tab=family'
);
assert.equal(tuiteaTabTarget('family', '?tab=home&invite=ab', ''), '/app/tuitea/app/?tab=family');
assert.equal(
  tuiteaTabTarget('family', '?invite=ab&invite=' + invite, ''),
  '/app/tuitea/app/?invite=' + invite + '&tab=family'
);
assert.equal(tuiteaTabTarget('memory', '?', '#x'), '/app/tuitea/app/?tab=memory#x');
assert.equal(tuiteaTabTarget('more', 'not-a-query', 'nohash'), '/app/tuitea/app/?tab=more');

const dropped = tuiteaTabTarget(
  'more',
  '?next=//evil.com&redirect=https://evil.example&code=pkce123&token_hash=ab%2Bcd&type=signup',
  '#access_token=aaa&refresh_token=bbb'
);
assert.equal(
  dropped,
  '/app/tuitea/app/?code=pkce123&token_hash=ab%2Bcd&type=signup&tab=more#access_token=aaa&refresh_token=bbb'
);
assert.equal(dropped.includes('next='), false);
assert.equal(dropped.includes('redirect='), false);
assert.equal(dropped.includes('//evil'), false);

assert.equal(
  tuiteaTabTarget('tupu', '?utm_source=newsletter&utm_medium=%2F%2Fevil.com&utm_campaign=spring-sale&utm_content=a\\b&utm_term=family+app', ''),
  '/app/tuitea/app/?utm_source=newsletter&utm_campaign=spring-sale&utm_term=family+app&tab=tupu'
);
assert.equal(
  tuiteaTabTarget('home', '?error=access_denied&error_code=otp_expired&error_description=bad+link', ''),
  '/app/tuitea/app/?error=access_denied&error_code=otp_expired&error_description=bad+link&tab=home'
);
assert.equal(
  tuiteaTabTarget('tupu', '?token_hash=ab%2Bcd&token_hash=second&type=signup&type=recovery&code=pkce123&code=https://evil.example', ''),
  '/app/tuitea/app/?token_hash=ab%2Bcd&type=signup&code=pkce123&tab=tupu'
);
assert.equal(
  tuiteaTabTarget('home', '?code=https://evil.example&type=javascript:alert(1)&token_hash=ab/cd', ''),
  '/app/tuitea/app/?tab=home'
);
assert.equal(
  tuiteaTabTarget('memory', '?type=email_change&type=signup', ''),
  '/app/tuitea/app/?type=email_change&tab=memory'
);
assert.equal(tuiteaTabTarget('more', '?utm_source=one&utm_source=two', ''), '/app/tuitea/app/?utm_source=one&tab=more');

const tabs = ['tupu', 'home', 'family', 'memory', 'more'];
for (const tab of tabs) {
  const html = readFileSync(new URL('../app/tuitea/' + tab + '/index.html', import.meta.url), 'utf8');
  assert.match(html, new RegExp('tuiteaTabTarget\\(\'' + tab + '\''));
  assert.match(html, new RegExp('https://keepitil.com/app/tuitea/' + tab + '/'));
  assert.match(html, /name="referrer" content="no-referrer"/);
  assert.match(html, /location\.search/);
  assert.match(html, /location\.hash/);
  assert.doesNotMatch(html, /location\.replace\('\/app\/tuitea\/app\/\?tab=/);
}

console.log('tuitea tab redirect: ok');
