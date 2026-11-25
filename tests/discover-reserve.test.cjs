// /discover/ CLS (0.54-0.57): the city list (23 px "Loading" -> ~1,400 px) and the event list (-> 4,100-10,400 px) arrive after a fetch and pushed Pack for the night, Elsewhere and the footer
// thousands of px down while they were on screen. One screen is reserved while loading (so those blocks start below the fold) and given back by kil-discover.js once the list is drawn.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const css = R('assets/css/discover.css'), js = R('assets/js/kil-discover.js');
const PAGES = [['discover/index.html', 'disc-cities'], ['discover/los-angeles/index.html', 'disc-lists'], ['discover/los-angeles/techno/index.html', 'disc-lists'], ['discover/los-angeles/this-weekend/index.html', 'disc-lists']];
const has = (html, id) => new RegExp('<div id="' + id + '" class="disc-reserve" aria-live="polite">').test(html);

test('the reserve is one screen, only with scripting on (the no-JS note must not sit in a blank screen), and never applied to the page without the class', () => {
  assert.match(css, /@media \(scripting:enabled\)\{\.disc-reserve\{min-height:100vh\}\}/);
  assert.ok(!/(^|\n)\.disc-reserve\{/.test(css), 'not applied outside the scripting query');
});
test('the list container that arrives after a fetch carries the class on every /discover page that has one (cities on the index, events on the LA pages)', () => {
  for (const [p, id] of PAGES) assert.ok(has(R(p), id), p + ' #' + id);
  assert.ok(!/id="disc-lists" class="disc-reserve"/.test(R('discover/index.html')), 'the index city view stays unreserved (empty until a city is picked)');
});
test('kil-discover.js gives the reserve back wherever a list is finished: draw(), the cities success path and both failure paths', () => {
  assert.match(js, /function settle\(el\) \{ if \(el && el\.style\) el\.style\.minHeight = '0'; \}/);
  assert.match(js, /rootEl\.innerHTML = renderLists\(state\);\n    settle\(rootEl\);/);
  assert.equal((js.match(/settle\(citiesEl\)/g) || []).length, 3, 'two failure paths + the success path');
});
test('NEGATIVE CONTROL: without the class (or without the scripting rule) a page has no reserve, and a script without settle() would keep the blank screen', () => {
  for (const [p, id] of PAGES) assert.equal(has(R(p).replace(' class="disc-reserve"', ''), id), false, p);
  assert.equal(/@media \(scripting:enabled\)\{\.disc-reserve\{min-height:100vh\}\}/.test(css.replace('@media (scripting:enabled){.disc-reserve{min-height:100vh}}', '')), false);
  assert.equal((js.replace(/settle\(citiesEl\);/g, '').match(/settle\(citiesEl\)/g) || []).length, 0);
});
