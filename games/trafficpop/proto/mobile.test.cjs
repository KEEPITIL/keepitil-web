'use strict';
// Traffic Pop prototype: phone (375x667) invariants. Run: node --test games/trafficpop/proto/mobile.test.cjs
// Static CSS/HTML audits plus a jsdom run with innerWidth=375. jsdom does no layout, so sizes come from
// declared CSS and from the game's own layout() with a stubbed wrapper rectangle; see the report for what
// still needs a real browser. Set MOBILE_HTML to point the suite at a (deliberately broken) copy.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const FILE = process.env.MOBILE_HTML || path.join(__dirname, 'index.html');
const html = fs.readFileSync(FILE, 'utf8');
// ---- mobile audit helpers (static CSS/HTML + jsdom). Pure functions over the page source so they can
// ---- be pointed at a deliberately broken copy (see the "negative control" tests at the bottom).
const VIEW = { w: 375, h: 667 };

function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ''); }
function splitTop(s, sep) {
  const out = []; let d = 0, cur = '', q = '';
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = ''; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[') d++;
    if (ch === ')' || ch === ']') d--;
    if (ch === sep && d === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}
function parseDecls(body) {
  const o = {};
  for (const d of splitTop(body, ';')) {
    const k = d.indexOf(':'); if (k < 0) continue;
    o[d.slice(0, k).trim().toLowerCase()] = d.slice(k + 1).replace(/!important/i, '').trim();
  }
  return o;
}
function parseBlocks(src, media, out, st) {
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i); if (open < 0) break;
    const head = src.slice(i, open).trim();
    let dep = 1, j = open + 1;
    while (j < src.length && dep) { if (src[j] === '{') dep++; else if (src[j] === '}') dep--; j++; }
    const body = src.slice(open + 1, j - 1);
    if (/^@media/i.test(head)) parseBlocks(body, media.concat(head.slice(6).trim()), out, st);
    else if (head[0] === '@') { st.atRules.push(head); } // keyframes, font-face: not layout rules
    else out.push({ sel: head, decls: parseDecls(body), media, order: st.n++ });
    i = j;
  }
}
function extractCSS(html) { return (html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || []).map(m => m.replace(/<\/?style[^>]*>/gi, '')).join('\n'); }
function parseCSS(html) {
  const st = { n: 0, atRules: [] }, rules = [];
  parseBlocks(stripComments(extractCSS(html)), [], rules, st);
  return { rules, atRules: st.atRules };
}

// Media evaluation for a phone: 375x667 portrait, touch only (no hover, coarse pointer), no reduced-motion preference.
const unknownMedia = new Set();
function px(v) {
  if (v == null) return NaN; v = String(v).trim();
  let m = v.match(/^(-?[\d.]+)px$/); if (m) return +m[1];
  m = v.match(/^(-?[\d.]+)(r?em)$/); if (m) return +m[1] * 16;
  if (/^0+$/.test(v)) return 0;
  return NaN;
}
function evalMediaOne(cond, env) {
  const feats = cond.match(/\(([^)]*)\)/g) || [];
  const rest = cond.replace(/\([^)]*\)/g, ' ').replace(/\band\b/gi, ' ').trim().toLowerCase();
  if (rest && !/^(screen|all)$/.test(rest)) { if (/^(print|speech)$/.test(rest)) return false; unknownMedia.add(cond); return false; }
  return feats.every(f => {
    const [k, v] = f.slice(1, -1).split(':').map(x => x.trim().toLowerCase());
    switch (k) {
      case 'min-width': return env.w >= px(v);
      case 'max-width': return env.w <= px(v);
      case 'min-height': return env.h >= px(v);
      case 'max-height': return env.h <= px(v);
      case 'orientation': return v === 'portrait';
      case 'hover': case 'any-hover': return v === 'none';
      case 'pointer': case 'any-pointer': return v === 'coarse';
      case 'prefers-reduced-motion': return v === 'no-preference';
      case 'prefers-color-scheme': return v === 'light';
      default: unknownMedia.add(f); return false;
    }
  });
}
const mediaMatches = (media, env) => media.every(m => splitTop(m, ',').some(c => evalMediaOne(c.trim(), env)));
const effectiveRules = (css, env) => css.rules.filter(r => mediaMatches(r.media, env || VIEW));

function specificity(sel) {
  const ids = (sel.match(/#[\w-]+/g) || []).length;
  const cls = (sel.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+(\([^)]*\))?/g) || []).length;
  const tags = (sel.replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|::?[\w-]+(\([^)]*\))?/g, ' ').match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length;
  return ids * 10000 + cls * 100 + tags;
}
const DYNAMIC = /:(hover|active|focus|focus-visible|focus-within|visited)/;
function declared(el, prop, rules) {
  let best = null;
  for (const r of rules) {
    if (!(prop in r.decls)) continue;
    for (const s of splitTop(r.sel, ',')) {
      const sel = s.trim();
      if (sel.includes('::') || DYNAMIC.test(sel)) continue;
      let ok = false; try { ok = el.matches(sel); } catch (e) { ok = false; }
      if (!ok) continue;
      const sp = specificity(sel);
      if (!best || sp > best.sp || (sp === best.sp && r.order >= best.order)) best = { sp, order: r.order, v: r.decls[prop] };
    }
  }
  const inl = el.style && el.style.getPropertyValue ? el.style.getPropertyValue(prop) : '';
  return inl ? inl : best ? best.v : undefined;
}

// touch-action semantics: the gestures the browser may handle are the intersection of every ancestor's value.
function touchAllowed(el, rules) {
  let allow = new Set(['pan-x', 'pan-y', 'pinch', 'dbltap']);
  for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
    const v = declared(e, 'touch-action', rules); if (!v || v === 'auto') continue;
    let keep;
    if (v === 'none') keep = new Set();
    else if (v === 'manipulation') keep = new Set(['pan-x', 'pan-y', 'pinch']);
    else keep = new Set(v.split(/\s+/).map(t => t === 'pinch-zoom' ? 'pinch' : t));
    allow = new Set([...allow].filter(x => keep.has(x)));
  }
  return allow;
}

const metaViewport = html => { const m = html.match(/<meta[^>]+name=["']viewport["'][^>]*>/i); return m ? (m[0].match(/content=["']([^"']*)["']/i) || [])[1] || '' : null; };
function auditViewport(html) {
  const out = [], c = metaViewport(html);
  if (c == null) return ['no viewport meta'];
  const kv = Object.fromEntries(c.split(',').map(p => p.split('=').map(x => x.trim().toLowerCase())));
  if (kv.width !== 'device-width') out.push('viewport width must be device-width, got ' + kv.width);
  if (kv['viewport-fit'] !== 'cover') out.push('viewport-fit=cover missing');
  if (kv['initial-scale'] !== '1' && kv['initial-scale'] !== '1.0') out.push('initial-scale must be 1');
  if (kv['user-scalable'] === 'no' || kv['user-scalable'] === '0') out.push('user-scalable lock present');
  if (kv['maximum-scale'] && +kv['maximum-scale'] < 2) out.push('maximum-scale lock present');
  return out;
}
// Anything that can make the page wider than the viewport.
function auditWidths(html, css) {
  const out = [], eff = effectiveRules(css);
  if (/\b\d+(\.\d+)?vw\b/.test(extractCSS(html)) && /\b(100|1[0-9]{2})vw\b/.test(extractCSS(html))) out.push('100vw (or wider) used in CSS: includes the scrollbar/inset and overflows');
  const scripts = (html.match(/<script(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/gi) || []).join('\n');
  if (/\b100vw\b|innerWidth\s*[*+]/.test(scripts)) out.push('100vw / innerWidth math in script');
  for (const r of eff) for (const p of ['width', 'min-width', 'left', 'right', 'margin-left', 'margin-right']) {
    const v = r.decls[p]; if (v == null) continue;
    const n = px(v);
    if (!isNaN(n) && Math.abs(n) > VIEW.w && (p === 'width' || p === 'min-width')) out.push(r.sel + ' { ' + p + ': ' + v + ' } is wider than ' + VIEW.w + 'px');
    if (!isNaN(n) && n < -VIEW.w) out.push(r.sel + ' { ' + p + ': ' + v + ' } pushes content off screen');
    if (p === 'min-width' && !isNaN(n) && n > VIEW.w - 24) out.push(r.sel + ' min-width ' + v + ' leaves no room for the page gutters');
    if (/\b\d{3,}px\b/.test(v) && p === 'width' && isNaN(n) && /calc/.test(v)) out.push(r.sel + ' width calc with large px needs a manual check: ' + v);
  }
  const clampsX = eff.some(r => /(^|,)\s*(html|body)\s*(,|$)/.test(r.sel.replace(/\s*,\s*/g, ',')) && (/hidden|clip/.test(r.decls['overflow-x'] || '') || /hidden|clip/.test(r.decls.overflow || '')));
  if (!clampsX) out.push('neither html nor body clamps overflow-x');
  return out;
}
function auditHover(html, css) {
  const out = [];
  for (const r of css.rules) if (/:hover/.test(r.sel) && !r.media.some(m => /hover\s*:\s*hover/.test(m))) out.push(r.sel + ' has a :hover rule outside @media (hover:hover)');
  const js = (html.match(/<script(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/gi) || []).join('\n');
  if (/mouse(over|enter|leave|out|move)|onmouse|pointerover|pointerenter|\btitle=/.test(js + html.replace(/<script[\s\S]*?<\/script>/gi, ''))) out.push('hover-only handler or title tooltip present');
  return out;
}
function auditSafeArea(html, css) {
  const out = [], all = css.rules.map(r => JSON.stringify(r.decls)).join('\n');
  for (const side of ['top', 'right', 'bottom', 'left']) if (!all.includes('safe-area-inset-' + side)) out.push('safe-area-inset-' + side + ' is not used');
  return out;
}
const INTERACTIVE = 'button, a[href], input, select, textarea, summary, [role=button], [onclick], [tabindex]:not([tabindex="-1"])';
// Declared-size audit of interactive elements currently in `doc`. `share` = {selector: floor of the width it gets from its row}.
function auditTargets(doc, css, share) {
  const out = [], rules = effectiveRules(css);
  for (const el of doc.querySelectorAll(INTERACTIVE)) {
    if (el.closest('.hidden,[hidden]') && !el.closest('[data-audit-visible]')) continue;
    const name = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');
    // a bare checkbox/radio is operated through its <label>: audit the label's box instead
    const box = el.matches('input[type=checkbox],input[type=radio]') && el.closest('label') ? el.closest('label') : el;
    const mh = px(declared(box, 'min-height', rules)), h = px(declared(box, 'height', rules));
    const mw = px(declared(box, 'min-width', rules)), w = px(declared(box, 'width', rules));
    const height = Math.max(isNaN(mh) ? 0 : mh, isNaN(h) ? 0 : h);
    let width = Math.max(isNaN(mw) ? 0 : mw, isNaN(w) ? 0 : w);
    for (const sel of Object.keys(share || {})) if (box.matches(sel)) width = Math.max(width, share[sel]);
    if (height < 44) out.push(name + ' declared height ' + height + 'px < 44');
    if (width < 44) out.push(name + ' declared/derived width ' + width + 'px < 44');
  }
  return out;
}
function auditTouchAction(doc, css, surfaces) {
  const out = [], rules = effectiveRules(css);
  for (const el of doc.querySelectorAll(INTERACTIVE)) {
    const a = touchAllowed(el, rules);
    if (a.has('dbltap')) out.push((el.id || el.className || el.tagName) + ' still allows double-tap zoom');
  }
  for (const sel of surfaces) {
    const el = doc.querySelector(sel); if (!el) { out.push('surface ' + sel + ' not found'); continue; }
    const a = touchAllowed(el, rules);
    if (a.has('dbltap') || a.has('pinch')) out.push(sel + ' allows page zoom gestures: ' + [...a]);
    if (a.has('pan-x')) out.push(sel + ' allows horizontal panning');
  }
  return out;
}
const JSDOM_PATHS = [process.env.TP_JSDOM, process.env.KB_JSDOM, process.env.T13_JSDOM, process.env.JSDOM_PATH, 'jsdom'].filter(Boolean);
let JSDOM_MOD = null;
function loadJSDOM() { for (const m of JSDOM_PATHS) { try { JSDOM_MOD = require(m); return JSDOM_MOD.JSDOM; } catch (e) { /* next */ } } return null; }
function mobileDom(JSDOM, html, pre) {
  const vc = new JSDOM_MOD.VirtualConsole(); vc.on('jsdomError', e => { if (!/getContext|not implemented/i.test(e.message)) (vc.errs = vc.errs || []).push(e.message); });
  return new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/proto/', virtualConsole: vc,
    beforeParse(w) {
      Object.defineProperty(w, 'innerWidth', { value: VIEW.w, configurable: true });
      Object.defineProperty(w, 'innerHeight', { value: VIEW.h, configurable: true });
      w.matchMedia = q => ({ matches: mediaMatches([q], VIEW), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.__errors = vc.errs = vc.errs || []; w.addEventListener('error', e => w.__errors.push(e.message));
      if (pre) pre(w);
    }
  });
}

// ================= Traffic Pop specifics =================
const JSDOM = loadJSDOM();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const GUTTER = 8, APP_W = VIEW.w - 2 * GUTTER;           // #app side padding on a phone with no inset
const SHARE = {                                          // widths the rows give their children at 375
  '.tools button': Math.floor((APP_W - 4 * 6) / 5),
  '.lv': Math.floor((APP_W - 4 - 5 * 8) / 6),
  '.card button': Math.min(340, VIEW.w - 40) - 44
};
const SURFACES = ['#board', '#boardWrap'];

function boot(src) {
  const dom = mobileDom(JSDOM, src);
  return { dom, w: dom.window, d: dom.window.document };
}
// Board cell sizes for all 60 levels when the wrapper is `wrapH` tall.
function cellSizes(src, wrapH) {
  const { dom, w, d } = boot(src);
  const wrap = d.getElementById('boardWrap');
  wrap.getBoundingClientRect = () => ({ width: APP_W, height: wrapH, top: 0, left: 0, right: APP_W, bottom: wrapH });
  const out = [];
  const n = d.querySelectorAll('#levels .lv').length;
  for (let i = 0; i < n; i++) {
    w.__tp.start(i);
    const b = d.getElementById('board'), cs = +b.dataset.cs;
    const vehs = [...b.children].map(e => [parseFloat(e.style.width), parseFloat(e.style.height)]);
    out.push({ level: i + 1, cs, boardW: parseFloat(b.style.width), minVeh: Math.min(...vehs.map(v => Math.min(v[0], v[1]))) });
  }
  dom.window.close();
  return out;
}
const SKIP = new Set(['.veh']);                          // sized from JS: covered by cellSizes()
function auditTargetsNoVeh(doc, css) {
  // drop board vehicles from the declared-size audit (their size is checked by cellSizes)
  return auditTargets(doc, css, SHARE).filter(m => !m.startsWith('button.veh'));
}
async function stateAudit(src) {
  const css = parseCSS(src), { dom, w, d } = boot(src), out = { targets: [], touch: [] };
  const run = tag => {
    out.targets.push(...auditTargetsNoVeh(d, css).map(m => tag + ': ' + m));
    out.touch.push(...auditTouchAction(d, css, tag === 'map' ? [] : SURFACES).map(m => tag + ': ' + m));
  };
  run('map');
  d.querySelectorAll('#levels .lv')[0].click();
  run('game');
  w.__tp.state(); // alive
  // force the end-of-level card so its buttons are audited too
  d.getElementById('space').click(); d.getElementById('space').click();
  d.getElementById('undo').click();
  d.getElementById('overlay').classList.remove('hidden');
  const b = d.getElementById('ovBody'); b.innerHTML = '<h2>x</h2><p>y</p><button>Next level</button><button class="alt">Replay</button>';
  run('card');
  w.close();
  return out;
}

test('viewport meta: device-width, viewport-fit=cover, no zoom lock', () => {
  assert.deepEqual(auditViewport(html), []);
});
test('no horizontal overflow sources at 375px (fixed widths, min-widths, 100vw, overflow clamp)', () => {
  assert.deepEqual(auditWidths(html, parseCSS(html)), []);
});
test('every @media query is understood by the audit (nothing silently skipped)', () => {
  unknownMedia.clear(); effectiveRules(parseCSS(html));
  assert.deepEqual([...unknownMedia], []);
});
test('the 375x667 phone media set is applied (compact HUD rules active, hover-only hint text hidden)', () => {
  const eff = effectiveRules(parseCSS(html)).map(r => r.sel);
  assert.ok(eff.includes('.tools small'), '@media (hover:none) rule applies on touch');
  assert.ok(eff.includes('.bay'), '@media (max-width:480px) rules apply');
});
test('no hover-only interactions (:hover only inside @media (hover:hover); no mouse-only handlers; no title tooltips)', () => {
  assert.deepEqual(auditHover(html, parseCSS(html)), []);
});
test('safe-area insets are honoured on all four sides', () => {
  assert.deepEqual(auditSafeArea(html, parseCSS(html)), []);
});
test('touch-action: controls kill double-tap zoom; the board allows neither zoom nor sideways panning', { skip: !JSDOM && 'jsdom not available' }, async () => {
  assert.deepEqual((await stateAudit(html)).touch, []);
});
test('touch targets >= 44px (declared size or row share) on the map, in play, and on the result card', { skip: !JSDOM && 'jsdom not available' }, async () => {
  assert.deepEqual((await stateAudit(html)).targets, []);
});
test('board cells and vehicles stay >= 44px and inside 359px for all 60 levels, even on a short viewport', { skip: !JSDOM && 'jsdom not available' }, () => {
  for (const wrapH of [250, 400, 453]) {
    const bad = cellSizes(html, wrapH).filter(c => c.cs < 44 || c.minVeh < 44 || c.boardW > APP_W);
    assert.deepEqual(bad, [], 'wrapper height ' + wrapH);
  }
});
test('every keyboard shortcut has an on-screen control, and each control works from a tap (click)', { skip: !JSDOM && 'jsdom not available' }, async () => {
  const keys = new Set([...html.matchAll(/k === '([a-z]+)'/g)].map(m => m[1]));
  const MAP = { u: 'undo', z: 'undo', r: 'restart', h: 'hint', s: 'space', l: 'lift', n: 'next card button', escape: 'home' };
  for (const k of keys) assert.ok(MAP[k], 'keyboard key "' + k + '" has no touch control mapped in this test');
  const { w, d } = boot(html);
  const $ = id => d.getElementById(id), L1 = () => w.__tp.state();
  d.querySelectorAll('#levels .lv')[0].click();                       // home -> a level
  assert.ok(!$('game').classList.contains('hidden'));
  $('hint').click(); assert.equal(d.querySelectorAll('.veh.hint').length, 1, 'hint pulses a vehicle');
  const free = [...d.querySelectorAll('#board .veh.free')][0];
  free.click(); await sleep(260);
  assert.equal($('moves').textContent, '1', 'tapping a vehicle moves it');
  $('undo').click(); assert.equal($('moves').textContent, '0', 'undo');
  free.isConnected || null;
  d.querySelector('#board .veh.free').click(); await sleep(260);
  $('restart').click(); assert.equal($('moves').textContent, '0', 'restart');
  $('space').click(); assert.equal($('spaceN').textContent, '0'); assert.equal(L1().st.parking.length, L1().L.parking + 1, 'space');
  $('lift').click(); assert.ok(d.body.classList.contains('lifting'), 'lift');
  $('home').click(); assert.ok(!$('map').classList.contains('hidden') && $('game').classList.contains('hidden'), 'home');
  // win level 1 by taps, then use the on-screen Next level button
  d.querySelectorAll('#levels .lv')[0].click();
  const TPmod = require('vm').runInNewContext(html.slice(html.indexOf('//LOGIC-BEGIN'), html.indexOf('//LOGIC-END')) + '\nTP;', {});
  const L0 = TPmod.expand(JSON.parse(html.match(/id="levelData" type="application\/json">([\s\S]*?)<\/script>/)[1])[0]);
  for (const i of TPmod.solve(L0, TPmod.initState(L0))) { d.querySelector('#board .veh[data-i="' + i + '"]').click(); await sleep(260); }
  const next = [...$('ovBody').querySelectorAll('button')].find(b => /Next level/.test(b.textContent));
  assert.ok(next, 'the cleared card offers Next level');
  next.click(); assert.equal($('lvl').textContent, '2', 'next level');
  assert.deepEqual(w.__errors, []);
  w.close();
});

// ---- negative controls: each property deliberately broken must be flagged ----
const css0 = parseCSS(html);
const mut = (a, b) => { assert.ok(html.includes(a), 'mutation anchor present: ' + a); return html.replace(a, b); };
test('negative: zoom lock / missing viewport-fit / missing device-width are flagged', () => {
  assert.ok(auditViewport(mut('viewport-fit=cover', 'viewport-fit=cover, user-scalable=no')).length);
  assert.ok(auditViewport(mut(', viewport-fit=cover', '')).length);
  assert.ok(auditViewport(mut('width=device-width', 'width=420')).length);
});
test('negative: wide board, 100vw, big min-width and a missing overflow clamp are flagged', () => {
  const add = rule => mut('</style>', rule + '\n</style>');
  assert.ok(auditWidths(add('#board{width:420px}'), parseCSS(add('#board{width:420px}'))).length);
  assert.ok(auditWidths(add('.tools{width:100vw}'), parseCSS(add('.tools{width:100vw}'))).length);
  assert.ok(auditWidths(add('.hud{min-width:380px}'), parseCSS(add('.hud{min-width:380px}'))).length);
  const noClamp = mut('overscroll-behavior:none;overflow:hidden;', 'overscroll-behavior:none;');
  assert.ok(auditWidths(noClamp, parseCSS(noClamp)).length);
  // a rule inside a media query that matches a phone counts; one that does not match a phone does not
  const inPhone = mut('</style>', '@media (max-width:480px){#board{width:500px}}\n</style>');
  assert.ok(auditWidths(inPhone, parseCSS(inPhone)).length);
  const inDesk = mut('</style>', '@media (min-width:900px){#board{width:500px}}\n</style>');
  assert.deepEqual(auditWidths(inDesk, parseCSS(inDesk)), []);
});
test('negative: bare :hover, mouse handlers and tooltips are flagged', () => {
  assert.ok(auditHover(mut('</style>', '.chip:hover{opacity:.5}\n</style>'), parseCSS(mut('</style>', '.chip:hover{opacity:.5}\n</style>'))).length);
  const ok = mut('</style>', '@media (hover:hover){.chip:hover{opacity:.5}}\n</style>');
  assert.deepEqual(auditHover(ok, parseCSS(ok)), []);
  const js = mut("$('home').onclick = home;", "$('home').onmouseover = home;");
  assert.ok(auditHover(js, parseCSS(js)).length);
});
test('negative: dropping a safe-area inset is flagged', () => {
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const m = html.split('safe-area-inset-' + side).join('safe-area-gone');
    assert.ok(auditSafeArea(m, parseCSS(m)).length, side);
  }
});
test('negative: small targets and zoomable controls are flagged', { skip: !JSDOM && 'jsdom not available' }, async () => {
  const small = mut('min-height:44px;min-width:44px}', 'min-height:40px;min-width:40px}');
  assert.ok((await stateAudit(small)).targets.some(m => /chip|home/.test(m)));
  const noMin = mut('.lv{aspect-ratio:1;min-width:44px;min-height:44px;', '.lv{aspect-ratio:1;');
  assert.ok((await stateAudit(noMin)).targets.some(m => /\.lv/.test(m)));
  const noTa = mut('overflow:hidden;touch-action:manipulation;', 'overflow:hidden;');
  assert.ok((await stateAudit(noTa)).touch.some(m => /double-tap/.test(m)));
  const boardAuto = mut('#board{position:relative;flex:none;margin:auto;touch-action:pan-y;', '#board{position:relative;flex:none;margin:auto;touch-action:auto;')
    .replace('overscroll-behavior:contain;touch-action:pan-y}', 'overscroll-behavior:contain}');
  assert.ok((await stateAudit(boardAuto)).touch.some(m => /board/.test(m)));
});
test('negative: shrinking the minimum cell or ignoring the width limit is flagged', { skip: !JSDOM && 'jsdom not available' }, () => {
  const lowMin = mut('const MIN_CELL = 44;', 'const MIN_CELL = 20;');
  assert.ok(cellSizes(lowMin, 250).some(c => c.cs < 44));
  const wide = mut('Math.min(csW, Math.max(csH, MIN_CELL))', 'Math.max(csH, MIN_CELL)');
  assert.ok(cellSizes(wide, 453).some(c => c.boardW > APP_W));
});
