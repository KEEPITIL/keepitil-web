'use strict';
// Thirteen Anchors prototype: phone (375x667) invariants. Run: node --test games/13/proto/mobile.test.cjs
// Static CSS/HTML audits plus a jsdom run with innerWidth=375 (set T13_JSDOM to the jsdom path if needed).
// jsdom does no layout and has no canvas, so sizes come from declared CSS; see the report for what still
// needs a real browser. MOBILE_HTML points the suite at a (deliberately broken) copy.
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
const OPEN = [];                                   // every window we open is closed when the file finishes, even after a failed assertion
require('node:test').after(() => OPEN.forEach(w => { try { w.close(); } catch (e) { /* already closed */ } }));
function mobileDom(JSDOM, html, pre) {
  const vc = new JSDOM_MOD.VirtualConsole(); vc.on('jsdomError', e => { if (!/getContext|not implemented/i.test(e.message)) (vc.errs = vc.errs || []).push(e.message); });
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/proto/', virtualConsole: vc,
    beforeParse(w) {
      Object.defineProperty(w, 'innerWidth', { value: VIEW.w, configurable: true });
      Object.defineProperty(w, 'innerHeight', { value: VIEW.h, configurable: true });
      w.matchMedia = q => ({ matches: mediaMatches([q], VIEW), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.__errors = vc.errs = vc.errs || []; w.addEventListener('error', e => w.__errors.push(e.message));
      if (pre) pre(w);
    }
  });
  OPEN.push(dom.window);
  return dom;
}

// ================= Thirteen Anchors specifics =================
const JSDOM = loadJSDOM();
const SKIPJ = !JSDOM && 'jsdom not available';
const CARD_W = Math.min(440, VIEW.w - 40) - 44;           // .card inner width at 375
const SHARE = {
  '.card button': CARD_W,
  '#pad button': 64,                                      // grid-template-columns: repeat(3, 64px)
  '#keys button': Math.floor((Math.min(260, VIEW.w - 20) - 44 - 2 * 6) / 3),
  '.sib': Math.floor((VIEW.w - 20 - 2 * 6) / 3)           // three flex:1 buttons across the HUD
};
const SURFACES = ['#c'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = x => JSON.parse(JSON.stringify(x));
function boot(src) {
  let T = 0;
  const dom = mobileDom(JSDOM, src, win => { win.__t13Clock = () => T; win.__t13NoAudio = true; });
  return { dom, w: dom.window, d: dom.window.document, setT: v => { T = v; } };
}
const state = w => w.__t13.state();

// Audits every screen: briefing, playing, keypad, paused, end card.
function stateAudit(src) {
  const css = parseCSS(src), { w, d, setT } = boot(src), out = { targets: [], touch: [] };
  const run = tag => {
    out.targets.push(...auditTargets(d, css, SHARE).map(m => tag + ': ' + m));
    out.touch.push(...auditTouchAction(d, css, SURFACES).map(m => tag + ': ' + m));
  };
  run('briefing');
  w.__t13.start(false); run('play');
  state(w).w.keypad = true; w.__t13.frame(0.016); run('keypad');
  d.getElementById('kpx').click(); state(w).w.keypad = false;
  d.getElementById('bPause').click(); run('pause'); d.getElementById('bPause').click();
  state(w).w.over = { kind: 'taken', why: 'test' }; w.__t13.frame(0.016); run('end');
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
test('no hover-only interactions (:hover only inside @media (hover:hover); no mouse-only handlers; no title tooltips)', () => {
  assert.deepEqual(auditHover(html, parseCSS(html)), []);
});
test('safe-area insets are honoured on all four sides', () => {
  assert.deepEqual(auditSafeArea(html, parseCSS(html)), []);
});
test('control rows fit in 375px: the three sibling buttons share the row, the pad and pause button do not collide', () => {
  const rules = effectiveRules(parseCSS(html)), by = sel => rules.filter(r => r.sel === sel).reduce((a, r) => Object.assign(a, r.decls), {});
  const sib = by('.sib'); assert.match(sib.flex, /^1 1 0/); assert.equal(px(sib['min-width']), 0);
  const cols = (by('#pad')['grid-template-columns'] || '').match(/repeat\((\d+),\s*(\d+)px\)/), gap = px(by('#pad').gap);
  assert.ok(cols, 'pad is a fixed 3-column grid'); const padW = +cols[1] * +cols[2] + (+cols[1] - 1) * gap;
  const pause = by('#bPause'), padLeft = VIEW.w - px(by('#pad').right.replace(/max\((\d+px).*/, '$1')) - padW;
  const pauseRight = px(pause.left.replace(/max\((\d+px).*/, '$1')) + px(pause.width);
  assert.ok(padW + 10 <= VIEW.w, 'pad width ' + padW);
  assert.ok(pauseRight < padLeft, 'pause button right edge ' + pauseRight + ' clear of pad left edge ' + padLeft);
});
test('keyboard-only help text is hidden on touch', () => {
  const eff = effectiveRules(parseCSS(html));
  assert.equal(eff.filter(r => r.sel === '.kbonly').pop().decls.display, 'none');
  assert.ok(html.includes('class="kbonly"'));
});
test('touch-action: canvas allows no scroll or zoom; every control kills double-tap zoom (all screens)', { skip: SKIPJ }, () => {
  assert.deepEqual(stateAudit(html).touch, []);
});
test('touch targets >= 44px (declared size or row share) on every screen', { skip: SKIPJ }, () => {
  assert.deepEqual(stateAudit(html).targets, []);
});
test('every keyboard action has a touch control and each works from a tap / pointer', { skip: SKIPJ }, async () => {
  const kd = html.slice(html.indexOf("addEventListener('keydown'"), html.indexOf("addEventListener('keyup'"));
  const keys = new Set([...kd.matchAll(/k === '(.*?)'/g)].map(m => m[1]));
  const MAP = { enter: '#begin', escape: '#bPause', e: '#bAct', ' ': '#bPow', tab: '#bSwap', 1: '.sib', 2: '.sib', 3: '.sib', f: '#bLight', backspace: '#keys ⌫' };
  for (const k of keys) assert.ok(MAP[k], 'keyboard key "' + k + '" has no touch control mapped in this test');
  const { w, d, setT } = boot(html), $ = id => d.getElementById(id), S = () => state(w).w, mode = () => state(w).mode;
  const ptr = (el, type, id, x, y) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); Object.assign(e, { pointerId: id, clientX: x, clientY: y }); el.dispatchEvent(e); };
  assert.ok($('bPause').classList.contains('hidden'), 'pause button hidden before the game');
  assert.ok($('begin').disabled, 'Begin is gated by the briefing');
  setT(10); await sleep(400);
  assert.ok(!$('begin').disabled, 'Begin enabled after the mandatory seconds');
  $('begin').click(); assert.equal(mode(), 'play');                       // Enter
  assert.ok(!$('bPause').classList.contains('hidden') && !$('pad').classList.contains('hidden'));
  // WASD / arrows: left-half drag stick
  const x0 = S().sibs[S().active].x;
  ptr($('c'), 'pointerdown', 1, 60, 300); ptr($('c'), 'pointermove', 1, 100, 300);
  assert.equal(J(w.__t13.controls().stick).mx, 1);
  for (let i = 0; i < 6; i++) w.__t13.frame(0.1);
  assert.ok(S().sibs[S().active].x > x0, 'dragging right moves the active sibling right');
  ptr($('c'), 'pointerup', 1, 100, 300); assert.equal(w.__t13.controls().stick.id, null);
  ptr($('c'), 'pointerdown', 2, 300, 300); assert.equal(w.__t13.controls().stick.id, null, 'right 40% is not the stick');
  // Shift run (hold), C crouch (toggle), F light
  ptr($('bRun'), 'pointerdown', 3, 0, 0); assert.equal(w.__t13.controls().run, true);
  ptr($('bRun'), 'pointerup', 3, 0, 0); assert.equal(w.__t13.controls().run, false);
  ptr($('bRun'), 'pointerdown', 4, 0, 0); ptr($('bRun'), 'pointercancel', 4, 0, 0); assert.equal(w.__t13.controls().run, false, 'an interrupted touch cannot leave run stuck on');
  $('bCrouch').click(); assert.equal(w.__t13.controls().crouch, true); $('bCrouch').click(); assert.equal(w.__t13.controls().crouch, false);
  const lit = S().light; $('bLight').click(); assert.notEqual(S().light, lit);
  // Tab / 1-2-3 switch
  const a0 = S().active; $('bSwap').click(); assert.equal(S().active, (a0 + 1) % 3);
  const sibs = d.querySelectorAll('#team .sib'); assert.equal(sibs.length, 3);
  sibs[0].click(); assert.equal(S().active, 0); d.querySelectorAll('#team .sib')[2].click(); assert.equal(S().active, 2);
  // E interact / Space power: a tap reaches the rules (both rebuild the HUD, so the sibling buttons are replaced)
  for (const id of ['bAct', 'bPow']) { const mark = d.querySelector('#team .sib'); mark.__marked = true; $(id).click(); assert.ok(!d.querySelector('#team .sib').__marked, id + ' is wired'); }
  // Esc pause / resume
  $('bPause').click(); assert.equal(mode(), 'pause'); assert.equal($('bPause').textContent, 'RESUME');
  $('bPause').click(); assert.equal(mode(), 'play'); assert.equal($('bPause').textContent, 'PAUSE');
  // keypad: digits, backspace, Enter (OK), Esc (Close)
  S().keypad = true; w.__t13.frame(0.016); assert.ok(!$('kp').classList.contains('hidden'));
  const keyBtns = [...d.querySelectorAll('#keys button')]; assert.equal(keyBtns.length, 12);
  const kb = t => keyBtns.find(b => b.textContent === t);
  kb('4').click(); kb('⌫').click(); assert.equal($('kpd').textContent, '···'); 
  $('kpx').click(); assert.ok($('kp').classList.contains('hidden'));
  S().keypad = true; w.__t13.frame(0.016);
  for (const k of ['4', '1', '3']) [...d.querySelectorAll('#keys button')].find(b => b.textContent === k).click();
  assert.equal(S().over.kind, 'escaped'); assert.equal(mode(), 'end');
  assert.ok($('bPause').classList.contains('hidden'), 'pause button hidden on the end card');
  const again = [...$('endBody').querySelectorAll('button')].find(b => /Play again/.test(b.textContent));
  again.click(); assert.equal(mode(), 'play');
  assert.deepEqual(w.__errors, []);
  w.close();
});

// ---- negative controls: each property deliberately broken must be flagged ----
const mut = (a, b, all) => { assert.ok(html.includes(a), 'mutation anchor present: ' + a); return all ? html.split(a).join(b) : html.replace(a, b); };
const addCss = rule => mut('</style>', rule + '\n</style>');
test('negative: zoom lock / missing viewport-fit / missing device-width are flagged', () => {
  assert.ok(auditViewport(mut('viewport-fit=cover', 'viewport-fit=cover, user-scalable=no')).length);
  assert.ok(auditViewport(mut(', viewport-fit=cover', '')).length);
  assert.ok(auditViewport(mut('width=device-width', 'width=420')).length);
});
test('negative: wide cards, 100vw, big min-width and a missing overflow clamp are flagged', () => {
  for (const r of ['.card{width:420px}', '#hud{width:100vw}', '#team{min-width:380px}', '@media (max-width:480px){.card{width:500px}}']) assert.ok(auditWidths(addCss(r), parseCSS(addCss(r))).length, r);
  const noClamp = mut('overflow:hidden;overscroll-behavior:none;', 'overscroll-behavior:none;');
  assert.ok(auditWidths(noClamp, parseCSS(noClamp)).length);
  const desk = addCss('@media (min-width:900px){.card{width:500px}}');
  assert.deepEqual(auditWidths(desk, parseCSS(desk)), []);
});
test('negative: bare :hover, mouse handlers and tooltips are flagged', () => {
  const h = addCss('button:hover{opacity:.5}'); assert.ok(auditHover(h, parseCSS(h)).length);
  const ok = addCss('@media (hover:hover){button:hover{opacity:.5}}'); assert.deepEqual(auditHover(ok, parseCSS(ok)), []);
  const js = mut("$('begin').onclick = () => start(false);", "$('begin').onmouseover = () => start(false);"); assert.ok(auditHover(js, parseCSS(js)).length);
});
test('negative: dropping any safe-area inset is flagged', () => {
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const m = html.split('safe-area-inset-' + side).join('safe-area-gone');
    assert.ok(auditSafeArea(m, parseCSS(m)).length, side);
  }
});
test('negative: a non-shrinking sibling row is flagged (it would push the 3rd sibling off a 375px screen)', () => {
  const run = src => { try { const rules = effectiveRules(parseCSS(src)); const sib = rules.filter(r => r.sel === '.sib').reduce((a, r) => Object.assign(a, r.decls), {}); return /^1 1 0/.test(sib.flex || '') && px(sib['min-width']) === 0; } catch (e) { return false; } };
  assert.ok(run(html));
  assert.ok(!run(mut('.sib{flex:1 1 0;min-width:0;', '.sib{flex:0 0 auto;')));
});
test('negative: small targets, zoomable controls and a scrollable canvas are flagged', { skip: SKIPJ }, () => {
  assert.ok(stateAudit(mut('padding:3px 6px;font-size:.75rem;line-height:1.15;white-space:normal;overflow:hidden;pointer-events:auto;min-height:44px', 'padding:3px 6px;font-size:.75rem;line-height:1.15;white-space:normal;overflow:hidden;pointer-events:auto;min-height:36px')).targets.some(m => /sib/.test(m)));
  assert.ok(stateAudit(mut('cursor:pointer;min-height:44px}', 'cursor:pointer;min-height:30px}')).targets.length);
  assert.ok(stateAudit(mut('z-index:3;width:56px;height:56px;padding:0;background:#14130fcc;font-size:.72rem}\n.kbonly', 'z-index:3;width:30px;height:30px;min-height:30px;padding:0;background:#14130fcc;font-size:.72rem}\n.kbonly')).targets.some(m => /bPause/.test(m)));
  assert.ok(stateAudit(mut('overscroll-behavior:none;touch-action:manipulation;', 'overscroll-behavior:none;')).touch.some(m => /double-tap/.test(m)));
  assert.ok(stateAudit(mut('display:block;touch-action:none', 'display:block;touch-action:auto')).touch.some(m => /#c/.test(m)));
});
test('negative: an unwired pause button or a run button stuck on after pointercancel is caught by the behaviour', { skip: SKIPJ }, async () => {
  const ranBehaviour = async src => {
    const { w, d, setT } = boot(src); setT(10); await sleep(300);
    d.getElementById('begin').click(); d.getElementById('bPause').click();
    const paused = state(w).mode === 'pause';
    const e = new w.Event('pointerdown', { bubbles: true }); d.getElementById('bRun').dispatchEvent(e);
    d.getElementById('bRun').dispatchEvent(new w.Event('pointercancel', { bubbles: true }));
    const stuck = w.__t13.controls().run; w.close(); return { paused, stuck };
  };
  assert.deepEqual(await ranBehaviour(html), { paused: true, stuck: false });
  assert.equal((await ranBehaviour(mut("$('bPause').onclick = () => setPause(mode === 'play');", ''))).paused, false);
  assert.equal((await ranBehaviour(mut(" = $('bRun').onpointercancel", ''))).stuck, true);
});
