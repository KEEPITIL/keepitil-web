const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const ai = fs.readFileSync(path.join(__dirname, '..', 'assets/js/keepitil-ai.js'), 'utf8');
const firstLines = ai.split('\n').slice(0, 12).join('\n');
const m = /\(function\(\)\{if\(!window\.__kilRadioInit[^\n]*\}\}\)\(\);/.exec(firstLines);
function run(html) {
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  dom.window.eval(m[0]);
  return [...dom.window.document.querySelectorAll('script')].filter((s) => /keepitil-radio/.test(s.src || s.getAttribute('src') || '')).length;
}
test('keepitil-ai.js radio autoload: found', () => assert.ok(m));
test('a page that already has the radio <script> tag gets exactly one (no second injected copy)', () => {
  assert.strictEqual(run('<head></head><body><script src="/assets/js/keepitil-radio.js?v=1" defer></script></body>'), 1);
});
test('NEGATIVE CONTROL: a page with no radio tag still gets the radio injected once', () => {
  assert.strictEqual(run('<head></head><body></body>'), 1);
});
test('real event page carries one static radio tag', () => {
  const ev = fs.readFileSync(path.join(__dirname, '..', 'event/lcd-soundsystem/index.html'), 'utf8');
  assert.strictEqual((ev.match(/keepitil-radio\.js/g) || []).length, 1);
});
