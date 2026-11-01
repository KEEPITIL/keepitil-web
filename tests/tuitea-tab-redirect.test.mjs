import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tuiteaTabTarget } from '../app/tuitea/tab-target.mjs';

const invite = 'a'.repeat(32);
const dest = tuiteaTabTarget('tupu', '?invite=' + invite + '&foo=1', '#done');
assert.equal(dest, '/app/tuitea/app/?invite=' + invite + '&foo=1&tab=tupu#done');
assert.equal(tuiteaTabTarget('home', '', ''), '/app/tuitea/app/?tab=home');
assert.equal(tuiteaTabTarget('family', '?tab=home&invite=ab', ''), '/app/tuitea/app/?tab=family&invite=ab');
assert.equal(tuiteaTabTarget('memory', '?', '#x'), '/app/tuitea/app/?tab=memory#x');
assert.ok(tuiteaTabTarget('more', '?next=https://evil.example', '').startsWith('/app/tuitea/app/?'));
assert.equal(tuiteaTabTarget('more', '?next=https://evil.example', '').includes('//evil'), false);

const tabs = ['tupu', 'home', 'family', 'memory', 'more'];
for (const tab of tabs) {
  const html = readFileSync(new URL('../app/tuitea/' + tab + '/index.html', import.meta.url), 'utf8');
  assert.match(html, new RegExp('tuiteaTabTarget\\(\'' + tab + '\''));
  assert.match(html, new RegExp('https://keepitil.com/app/tuitea/' + tab + '/'));
  assert.match(html, /location\.search/);
  assert.match(html, /location\.hash/);
  assert.doesNotMatch(html, /location\.replace\('\/app\/tuitea\/app\/\?tab=/);
}

console.log('tuitea tab redirect: ok');
