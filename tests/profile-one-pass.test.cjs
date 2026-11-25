// /profile header in ONE pass (parked KEEPITIL ticket): the header arrives in three steps (meta -> about/links/claim -> stats), so the page re-flowed several times (phone CLS 0.56-0.75 on tuitea).
// While body.pf-hold the header and everything under it is invisible (space reserved); the hold is released when all four pieces are in, on a not-found / no-database page, or after 3.5 s.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'profile.html'), 'utf8');
const gateSrc = html.match(/\/\*PF-GATE-START\*\/([\s\S]*?)\/\*PF-GATE-END\*\//)[1];

function makeGate(src = gateSrc) {
  const cls = new Set(['pf-hold']), timers = [];
  const ctx = { window: {}, document: { body: { classList: { remove: (c) => cls.delete(c), contains: (c) => cls.has(c) } } }, setTimeout: (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; }, clearTimeout: (t) => { if (t) t.cleared = true; }, Object, };
  vm.runInNewContext(src, ctx);
  return { gate: ctx.window.__pfGate, held: () => cls.has('pf-hold'), timers };
}

test('markup: the page starts held, and the hold only exists with scripting on and covers the header, the tabs, the panels and the partner block', () => {
  assert.match(html, /<body class="pf-hold">/);
  assert.match(html, /@media \(scripting:enabled\)\{\s*body\.pf-hold \.pf-head,body\.pf-hold \.pf-meta,body\.pf-hold \.pf-filterbar,body\.pf-hold \.pf-panel,body\.pf-hold \.mono\{visibility:hidden\}\s*\}/);
  assert.ok(!/(^|\n)body\.pf-hold/.test(html), 'never applied outside the scripting query');
});
test('the hold is released only when all four pieces are in (meta, about, claim, stats), in any order', () => {
  for (const order of [['meta', 'about', 'claim', 'stats'], ['stats', 'claim', 'about', 'meta'], ['about', 'stats', 'meta', 'claim']]) {
    const g = makeGate(); order.slice(0, 3).forEach((k) => { g.gate.mark(k); assert.equal(g.held(), true, order.join(',') + ': still held after ' + k); });
    g.gate.mark(order[3]); assert.equal(g.held(), false); assert.equal(g.gate.released(), true);
  }
});
test('it fails OPEN: after 3.5 s the page shows even if a piece never arrives, and not-found / no-database pages release at once; marks are idempotent and unknown keys ignored', () => {
  const g = makeGate(); assert.equal(g.timers.length, 1); assert.equal(g.timers[0].ms, 3500);
  g.gate.mark('meta'); g.gate.mark('meta'); g.gate.mark('bogus'); assert.equal(g.held(), true);
  g.timers[0].fn(); assert.equal(g.held(), false, 'timeout released');
  const nf = makeGate(); nf.gate.reveal(); assert.equal(nf.held(), false); assert.equal(nf.timers[0].cleared, true, 'timer cleared on an early release');
});
test('the page wires the four marks and the early releases where the data actually lands', () => {
  assert.match(html, /applyProfile\(\); loadCategories\(\); window\.__pfGate&&window\.__pfGate\.mark\('meta'\);\n  \}\)\.catch\(function\(\)\{ applyProfile\(\); window\.__pfGate&&window\.__pfGate\.mark\('meta'\); \}\);/);
  assert.match(html, /window\.KIL_NOT_FOUND\)\{\n      window\.__pfGate&&window\.__pfGate\.reveal\(\);/);
  assert.match(html, /function loadProfileMeta\(\)\{\n  if\(!SB\)\{ window\.__pfGate&&window\.__pfGate\.reveal\(\); return Promise\.resolve\(\); \}/);
  assert.match(html, /window\.__pfGate&&window\.__pfGate\.mark\('stats'\);\n      \},function\(\)\{ window\.__pfGate&&window\.__pfGate\.mark\('stats'\); \}\);/);
  assert.match(html, /window\.__pfGate&&window\.__pfGate\.mark\('about'\);\n      \},function\(\)\{ window\.__pfGate&&window\.__pfGate\.mark\('about'\); \}\);/);
  assert.match(html, /\}\)\.then\(function\(\)\{ window\.__pfGate&&window\.__pfGate\.mark\('claim'\); \},function\(\)\{ window\.__pfGate&&window\.__pfGate\.mark\('claim'\); \}\);/);
  assert.ok(html.indexOf('/*PF-GATE-START*/') < html.indexOf('function loadProfileMeta'), 'the gate exists before any caller');
});
test('NEGATIVE CONTROL: a gate that releases on the FIRST piece (the old behaviour: show each step as it lands) is caught by the same checks', () => {
  const early = gateSrc.replace("for(var x in need){ if(Object.prototype.hasOwnProperty.call(need,x)) return; } reveal();", 'reveal();');
  assert.notEqual(early, gateSrc); const g = makeGate(early); g.gate.mark('meta');
  assert.equal(g.held(), false, 'control: the early gate shows the page after one piece, so the all-four test above would fail on it');
  const noTimeout = gateSrc.replace('timer=setTimeout(reveal,3500);', ''); const g2 = makeGate(noTimeout); assert.equal(g2.timers.length, 0, 'control: without the timer there is no fail-open');
  assert.notEqual(html.replace('<body class="pf-hold">', '<body>'), html);
});
