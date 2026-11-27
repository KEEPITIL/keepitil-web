// /profile header in ONE pass (parked KEEPITIL ticket): the header arrives in three steps (meta -> about/links/claim -> stats), so the page re-flowed several times (phone CLS 0.56-0.75 on tuitea).
// Grok 11:36: hold ONLY the late block (stats, about, links, account type, badges, the buttons row); name, avatar and bio paint at once, the header keeps its space (.pf-meta min-height),
// and the hold is released when all four pieces are in, on a not-found / no-database page, or after 1.5 s.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const __A = require("./helpers/event-assembled.cjs").assemble;
const html = __A(fs.readFileSync(path.join(__dirname, '..', 'profile.html'), 'utf8'));
const gateSrc = html.match(/\/\*PF-GATE-START\*\/([\s\S]*?)\/\*PF-GATE-END\*\//)[1];

function makeGate(src = gateSrc) {
  const cls = new Set(['pf-hold', 'pf-late', 'pf-foot']), timers = [];
  const ctx = { window: {}, document: { body: { classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) } } }, setTimeout: (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; }, clearTimeout: (t) => { if (t) t.cleared = true; }, Object, };
  vm.runInNewContext(src, ctx);
  return { gate: ctx.window.__pfGate, held: () => cls.has('pf-hold'), late: () => cls.has('pf-late'), feed: () => cls.has('pf-foot') || cls.has('pf-feed'), partner: () => cls.has('pf-feed'), timers };
}

test('markup: three holds (stats row / late block / partner block + footer); name, avatar, bio, tabs and panels are never hidden; only with scripting on; the header keeps its space', () => {
  assert.match(html, /<body class="pf-hold pf-late pf-foot">/);
  const m = html.match(/@media \(scripting:enabled\)\{\s*\.pf-meta\{min-height:14rem\}\s*(body\.pf-hold [^{]*)\{visibility:hidden\}\s*(?:\/\*[\s\S]*?\*\/\s*)?(body\.pf-feed [^{]*)\{visibility:hidden\}[^\n]*\n\}\n@media \(scripting:enabled\) and \(max-width:768px\)\{\.pf-meta\{min-height:19rem\}\}/);
  assert.ok(m, 'hold blocks + reserve found');
  const hidden = m[1].split(',').map((x) => x.trim());
  assert.deepEqual(hidden.sort(), ['body.pf-hold #pfAcctType', 'body.pf-hold #pfBadges', 'body.pf-hold #pfStatsRow', 'body.pf-late #pfAbout', 'body.pf-late #pfAboutTop', 'body.pf-late #pfLinks', 'body.pf-late #pfLinksDrop', 'body.pf-late .pf-cta'].sort());
  assert.deepEqual(m[2].split(',').map((x) => x.trim()).sort(), ['body.pf-feed .mono', 'body.pf-foot #v3-footer']);
  for (const shown of ['#pfName', '#pfAvatar', '#pfBio', '.pf-head', '.pf-filterbar', '.pf-panel']) assert.ok(!m[1].includes(shown) && !m[2].includes(shown), shown + ' paints at once');
  assert.ok(!/(^|\n)body\.pf-(hold|late|feed)/.test(html), 'never applied outside the scripting query');
  assert.ok(!/pf-feed \.pf-panel[^{]*\{[^}]*min-height/.test(html), 'no reserved panel height: a short feed would collapse it and pull the footer up (groove-trooper 390: 0.8 CLS)');
});
test('the hold is released only when all four pieces are in (meta, about, claim, stats), in any order', () => {
  for (const order of [['meta', 'about', 'claim', 'stats'], ['stats', 'claim', 'about', 'meta'], ['about', 'stats', 'meta', 'claim']]) {
    const g = makeGate(); order.slice(0, 3).forEach((k) => { g.gate.mark(k); assert.equal(g.held(), true, order.join(',') + ': still held after ' + k); });
    g.gate.mark(order[3]); assert.equal(g.held(), false); assert.equal(g.gate.released(), true);
  }
});
test('it fails OPEN: after 1.5 s the page shows even if a piece never arrives, and not-found / no-database pages release at once; marks are idempotent and unknown keys ignored', () => {
  const g = makeGate(); assert.equal(g.timers.length, 3); assert.deepEqual(g.timers.map((x) => x.ms).sort((a, b) => a - b), [450, 1500, 6000]);
  g.gate.mark('stats'); g.gate.mark('stats'); g.gate.mark('bogus'); assert.equal(g.held(), true);
  g.timers.find((x) => x.ms === 1500).fn(); assert.equal(g.held(), false, 'timeout released the stats hold'); assert.equal(g.late(), true, 'the late block waits for the profile row (or the 6 s cap)');
  g.timers.find((x) => x.ms === 6000).fn(); assert.equal(g.late(), false); assert.equal(g.feed(), false, 'the 6 s cap releases everything');
  const nf = makeGate(); nf.gate.reveal(); assert.equal(nf.held(), false); assert.equal(nf.late(), false); assert.equal(nf.feed(), false); assert.equal(nf.timers[0].cleared, true, 'timer cleared on an early release');
});
test('the page wires the four marks and the early releases where the data actually lands', () => {
  assert.match(html, /applyProfile\(\); loadCategories\(\);\n[\s\S]*?\}catch\(e\)\{\}\n    window\.__pfGate&&window\.__pfGate\.mark\('meta'\);\n  \}\)\.catch\(function\(\)\{ applyProfile\(\); window\.__pfGate&&window\.__pfGate\.mark\('meta'\); \}\);/, 'meta is marked after about/links are drawn from the same row');
  assert.match(html, /window\.KIL_NOT_FOUND\)\{\n      window\.__pfGate&&window\.__pfGate\.reveal\(\);/);
  assert.match(html, /function loadProfileMeta\(\)\{\n  if\(!SB\)\{ window\.__pfGate&&window\.__pfGate\.reveal\(\); return Promise\.resolve\(\); \}/);
  assert.match(html, /window\.__pfGate&&window\.__pfGate\.mark\('stats'\);\n      \},function\(\)\{ window\.__pfGate&&window\.__pfGate\.mark\('stats'\); \}\);/);
  assert.match(html, /window\.__pfGate&&window\.__pfGate\.mark\('about'\);\n      \},function\(\)\{ window\.__pfGate&&window\.__pfGate\.mark\('about'\); \}\);/);
  assert.match(html, /\}\)\.then\(function\(\)\{ window\.__pfGate&&window\.__pfGate\.mark\('claim'\); \},function\(\)\{ window\.__pfGate&&window\.__pfGate\.mark\('claim'\); \}\);/);
  assert.ok(html.indexOf('/*PF-GATE-START*/') < html.indexOf('function loadProfileMeta'), 'the gate exists before any caller');
});
test('NEGATIVE CONTROL: a gate that releases on the FIRST piece (the old behaviour: show each step as it lands) is caught by the same checks', () => {
  const early = gateSrc.replace("for(var x in need){ if(Object.prototype.hasOwnProperty.call(need,x)) return; } releaseHold();", 'reveal();');
  assert.notEqual(early, gateSrc); const g = makeGate(early); g.gate.mark('meta');
  assert.equal(g.held(), false, 'control: the early gate shows the page after one piece, so the all-four test above would fail on it');
  const noTimeout = gateSrc.replace('t3=setTimeout(holdFeed,450); t1=setTimeout(releaseHold,1500); t2=setTimeout(function(){ releaseLate(); releaseFeed(); },6000);', ''); assert.notEqual(noTimeout, gateSrc); const g2 = makeGate(noTimeout); assert.equal(g2.timers.length, 0, 'control: without the timers there is no fail-open');
  assert.notEqual(html.replace('<body class="pf-hold pf-late pf-foot">', '<body>'), html);
});

test('late block: released on the profile row (meta) alone; the feed hold only on a feed mark, on "0 posts" from the stats call, a reveal or the 6 s cap', () => {
  const g = makeGate(); g.gate.mark('meta'); assert.equal(g.late(), false, 'meta releases the late block'); assert.equal(g.held(), true); assert.equal(g.feed(), true, 'meta does not release the feed hold');
  g.gate.mark('feed'); assert.equal(g.feed(), false); assert.equal(g.held(), true, 'a feed mark does not touch the stats hold');
  const z = makeGate(); z.gate.mark('stats'); assert.equal(z.feed(), true, 'stats alone does not release the feed hold');
  assert.match(html, /set\('stPosts',d\.posts\);[^\n]*\n\s+if\(d\.posts===0&&window\.__pfGate\) window\.__pfGate\.mark\('feed'\);/, 'the stats call releases the feed hold only when the record has exactly 0 posts (a failed call leaves d empty: undefined !== 0, so it holds)');
  assert.match(html, /rebuild\(r\.data\); window\.__pfGate&&window\.__pfGate\.mark\('feed'\); \}\n\s+else \{ fallbackLocal\(\); \}/, 'only a SUCCESSFUL feed read releases the hold: a failed read draws the small local seed and the real feed may still land (6 s cap)');
  assert.match(html, /function loadFromDB\(\)\{\n  if\(!SB\)\{ fallbackLocal\(\); window\.__pfGate&&window\.__pfGate\.mark\('feed'\); return; \}/);
  // NEGATIVE CONTROL: a gate whose meta mark did not release the late block would leave about/links hidden until the cap
  const bad = gateSrc.replace("if(k==='meta') releaseLate();", ''); assert.notEqual(bad, gateSrc); const b = makeGate(bad); b.gate.mark('meta'); assert.equal(b.late(), true, 'control: caught');
  const noFeed = gateSrc.replace("if(k==='feed'){ releaseFeed(); return; }", ''); assert.notEqual(noFeed, gateSrc); const nf = makeGate(noFeed); nf.gate.mark('feed'); assert.equal(nf.feed(), true, 'control: a gate that ignores the feed mark is caught');
});
test('about / links are drawn from the FIRST profile_meta fetch, in the same task as the profile row (no later reflow)', () => {
  assert.match(html, /function loadProfileMeta\(\)\{[\s\S]*?select\('\*'\)\.eq\('slug',PROFILE_SLUG\)/);
});

test('partner block: paints at once (early LCP), is hidden at 450 ms if the feed is not drawn, shown again on the feed draw; the footer waits for the feed from the start', () => {
  const g = makeGate(); assert.equal(g.partner(), false, 'visible at first paint'); assert.equal(g.feed(), true);
  g.timers.find((x) => x.ms === 450).fn(); assert.equal(g.partner(), true, 'hidden at 450 ms (hidden elements never count toward CLS)');
  g.gate.mark('feed'); assert.equal(g.partner(), false); assert.equal(g.feed(), false, 'feed draw shows both');
  // the feed already drawn before 450 ms: the late timer must not hide it again
  const f = makeGate(); f.gate.mark('feed'); f.timers.forEach((x) => { if (x.ms === 450) x.fn(); }); assert.equal(f.partner(), false, 'NEGATIVE CONTROL: a timer that fired after the draw does not re-hide the block');
  const bad = gateSrc.replace('function holdFeed(){ if(feedOff) return;', 'function holdFeed(){'); assert.notEqual(bad, gateSrc); const b = makeGate(bad); b.gate.mark('feed'); b.timers.forEach((x) => { if (x.ms === 450) x.fn(); }); assert.equal(b.partner(), true, 'control: without the feedOff guard the block would be re-hidden (and stay hidden to the cap)');
});
