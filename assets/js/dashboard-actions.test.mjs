/*
 * CSP migration, dashboard.html: the 67 inline on*= handlers (64 actions + 3 image fallbacks) became delegated actions (assets/js/kil-actions.js) and delegated
 * image fallbacks (assets/js/kil-img-fallback.js). The dispatcher is tested in profile-actions.test.mjs; here: every moved handler, the helper functions, the
 * dynamic arguments (hostile values), the fallbacks and a guard.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(dir, '../..', rel), 'utf8');
const PAGE = read('dashboard.html');

const EXPECTED = {"change:clearAgentLog": 1, "change:dashBookingStatus": 1, "change:dashSocPlatform": 1, "click:addAdminUI": 1, "click:addKnowledge": 1, "click:approveFeed": 1, "click:approveSocial": 1, "click:approveSuggestion": 1, "click:askAgentDash": 1, "click:campApprove": 1, "click:campCalMove": 2, "click:campCalToday": 2, "click:campDeny": 1, "click:campDryRun": 1, "click:campEdit": 7, "click:campPublish": 1, "click:campSchedule": 1, "click:campScheduleAll": 1, "click:campShift": 2, "click:closeCP": 1, "click:closeCampEdit": 1, "click:closeSocEdit": 1, "click:cpMedia": 1, "click:cpSave": 2, "click:cpToggle": 1, "click:dashShowTabFromEl": 1, "click:denyFeed": 1, "click:denySocial": 1, "click:dismissSuggestion": 1, "click:dup": 1, "click:editSocial": 1, "click:genSuggestions": 1, "click:loadRecommendations": 1, "click:markPostedSocial": 1, "click:postGroup": 1, "click:pullPost": 1, "click:removeAdminUI": 1, "click:restorePost": 1, "click:saveAgent": 1, "click:setCalMode": 1, "click:setCampPlat": 2, "click:setCampTheme": 1, "click:setCampView": 3, "click:setSocStatus": 1, "click:showTab": 1, "click:toggleAgentEdit": 1, "click:toggleKnow": 1, "input:cpPreview": 1, "keydown:dashEnterAddAdmin": 1, "keydown:dashEnterAsk": 1, "keydown:dashEnterPostGroup": 1};
const used = {};
for (const m of PAGE.matchAll(/\sdata-(click|change|input|keydown|over|out)="(\w+)"/g)) used[m[1] + ':' + m[2]] = (used[m[1] + ':' + m[2]] || 0) + 1;

test('all 64 delegated handlers are in the page, exactly as many per event:action as the inline handlers they replaced', () => {
  assert.deepEqual(used, EXPECTED);
  assert.equal(Object.values(used).reduce((a, b) => a + b, 0), 64);
});

test('every action used in markup is allowed and defined as a function; the allow list has no dead entries', () => {
  const allow = JSON.parse(PAGE.match(/KilActions\.allow\((\[[^\]]*\])\)/)[1]);
  const names = [...new Set(Object.keys(used).map((k) => k.split(':')[1]))].sort();
  assert.deepEqual([...allow].sort(), names);
  for (const n of names) assert.match(PAGE, new RegExp('function ' + n + '\\(|(?:var|let|const) ' + n + '\\s*='), n + ' is defined');
});

test('kil-actions.js and kil-img-fallback.js load before the page scripts', () => {
  const a = PAGE.indexOf('/assets/js/kil-actions.js'), f = PAGE.indexOf('/assets/js/kil-img-fallback.js'), first = PAGE.indexOf('<script>\n');
  assert.ok(a > 0 && f > 0 && a < first && f < first);
});

/* ---------- helpers that replaced inline statements ---------- */
const helperSrc = PAGE.slice(PAGE.indexOf('function campCalToday('), PAGE.indexOf('if(window.KilActions) KilActions.allow('));
function helpers() {
  const log = []; const ctx = vm.createContext({ campCalRef: 'old', renderCamp: () => log.push('render'), setBooking: (i, v) => log.push(['booking', i, v]), setSocPlatform: (v) => log.push(['plat', v]), showTab: (t) => log.push(['tab', t]),
    addAdminUI: () => log.push('addAdmin'), askAgentDash: () => log.push('ask'), postGroup: () => log.push('post'), Date });
  vm.runInContext(helperSrc, ctx); return { ctx, log };
}
test('campCalToday resets the calendar to now and redraws', () => {
  const { ctx, log } = helpers(); ctx.campCalToday(); assert.ok(vm.runInContext('campCalRef instanceof Date', ctx)); assert.deepEqual(log, ['render']);
});
test('dashBookingStatus / dashSocPlatform / dashShowTabFromEl pass the element value or data-tab on', () => {
  const { ctx, log } = helpers(); ctx.dashBookingStatus(7, { value: 'booked' }); ctx.dashSocPlatform({ value: 'x' }); ctx.dashShowTabFromEl({ dataset: { tab: 'posts' } });
  assert.deepEqual(log, [['booking', 7, 'booked'], ['plat', 'x'], ['tab', 'posts']]);
});
test('the three Enter helpers act only on Enter', () => {
  const { ctx, log } = helpers();
  for (const f of ['dashEnterAddAdmin', 'dashEnterAsk', 'dashEnterPostGroup']) { ctx[f]({ key: 'a' }); ctx[f]({ key: 'Enter' }); }
  assert.deepEqual(log, ['addAdmin', 'ask', 'post']);
});

/* ---------- dynamic data-a ---------- */
test('every dynamic data-a is esc(JSON.stringify([...])); hostile values round-trip and cannot leave the attribute', () => {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const sites = [], marker = "data-a=\"'+esc(JSON.stringify(";
  for (let i = PAGE.indexOf(marker); i >= 0; i = PAGE.indexOf(marker, i + 1)) {   // balanced-parenthesis extraction of the stringified array
    let j = i + marker.length, depth = 1; const start = j;
    for (; j < PAGE.length && depth > 0; j++) { if (PAGE[j] === '(') depth++; else if (PAGE[j] === ')') depth--; }
    sites.push(PAGE.slice(start, j - 1));
  }
  assert.equal(sites.length, (PAGE.match(/data-a="'\+esc\(JSON\.stringify\(/g) || []).length);
  assert.ok(sites.length >= 37 && sites.every((e) => /^\[[\s\S]*\]$/.test(e)), 'found the dynamic sites');
  const evil = '"><img src=x onerror=alert(1)>\'`', STEP = 7;
  for (const expr of sites) {
    // every variable the expression reads gets the hostile value (objects: every member read becomes hostile)
    const hostile = new Proxy({}, { get: (_, k) => (k === Symbol.toPrimitive ? () => evil : k === 'toString' ? () => evil : evil) });
    const scope = { esc, JSON, step: STEP, CAMP_THEME: 'dark', ...Object.fromEntries([...new Set(expr.match(/\b[a-z]\w*(?=[.\[])/g) || [])].map((v) => [v, hostile])), p: hostile, m: evil, d: hostile, k: hostile, b: hostile, s: hostile, c: hostile, v: hostile, t: [evil], l: [evil], a: hostile };
    const ctx = vm.createContext(scope);
    const arr = vm.runInContext(expr, ctx);
    const html = '<b data-a="' + esc(JSON.stringify(arr)) + '">';
    assert.equal((html.match(/"/g) || []).length, 2, 'no stray quote in ' + expr);
    assert.equal(/<img/.test(html), false, expr);
    const raw = html.match(/data-a="([^"]*)"/)[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    assert.deepEqual(JSON.parse(raw), JSON.parse(JSON.stringify(arr)));
  }
});
test('campNavBtns: one step number drives both arrows (-step and +step) through campShift', () => {
  const src = PAGE.slice(PAGE.indexOf('function campNavBtns('), PAGE.indexOf('\n', PAGE.indexOf('function campNavBtns(')));
  const ctx = vm.createContext({ esc: (s) => String(s).replace(/"/g, '&quot;'), JSON }); vm.runInContext(src, ctx);
  const html = vm.runInContext('campNavBtns(7)', ctx);
  assert.deepEqual([...html.matchAll(/data-click="campShift" data-a="([^"]*)"/g)].map((m) => JSON.parse(m[1].replace(/&quot;/g, '"'))), [[-7], [7]]);
  assert.match(html, /data-click="campCalToday"/);
  assert.match(PAGE, /campNavBtns\(7\)/); assert.match(PAGE, /campNavBtns\(1\)/);
});
test('the removeAdminUI handle is passed as data, not decoded from a string spliced into code', () => {
  assert.match(PAGE, /data-click="removeAdminUI" data-a="'\+esc\(JSON\.stringify\(\[a\.handle\|\|"","\$el"\]\)\)\+'"/);
});

/* ---------- image fallbacks ---------- */
test('the three former onerror handlers are hide, hide-parent and src (/assets/images/logo-blue-nav.png)', () => {
  assert.deepEqual([...PAGE.matchAll(/\sdata-fb="([\w-]+)"/g)].map((m) => m[1]).sort(), ['hide', 'hide-parent', 'src']);
  assert.match(PAGE, /data-fb="src" data-fb-src="\/assets\/images\/logo-blue-nav\.png"/);
});

/* ---------- guard ---------- */
const INLINE = /\son(click|change|input|keydown|keyup|error|load|mouseover|mouseout|submit|focus|blur)\s*=/i;
test('control: the guard detects an inline handler', () => { assert.ok(INLINE.test('<button onclick="x()">')); assert.equal(INLINE.test('<button data-click="x">'), false); });
test('dashboard.html has no inline on*= handler attribute left', () => {
  const t = PAGE.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.deepEqual([...t.matchAll(new RegExp(INLINE.source, 'gi'))].map((m) => m[0]), []);
});
