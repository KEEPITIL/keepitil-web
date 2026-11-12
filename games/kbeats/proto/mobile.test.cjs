'use strict';
// KBeats prototype: phone (375x667) invariants. Run: node --test games/kbeats/proto/mobile.test.cjs
// Static CSS/HTML audits plus a jsdom run with innerWidth=375 (set KB_JSDOM to the jsdom path if needed).
// jsdom does no layout and has no canvas, so sizes come from declared CSS and the game's own geom();
// see the report for what still needs a real browser. MOBILE_HTML points the suite at a (broken) copy.
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

// ================= KBeats specifics =================
const JSDOM = loadJSDOM();
const SKIPJ = !JSDOM && 'jsdom not available';
const CARD_W = Math.min(380, VIEW.w - 40) - 44;           // .card inner width at 375 (overlay padding 20, card padding 22)
const SHARE = { '.card button': CARD_W, 'label': CARD_W };
const SURFACES = ['#c'];
const boot = (src, pre) => { const dom = mobileDom(JSDOM, src, pre); return { dom, w: dom.window, d: dom.window.document }; };

// Audits every screen: menu, playing, paused, result.
function stateAudit(src) {
  const css = parseCSS(src), { w, d } = boot(src, win => { win.__kbClock = () => -1; }), out = { targets: [], touch: [] };
  const run = tag => {
    out.targets.push(...auditTargets(d, css, SHARE).map(m => tag + ': ' + m));
    out.touch.push(...auditTouchAction(d, css, SURFACES).map(m => tag + ': ' + m));
  };
  run('menu');
  d.getElementById('start').click(); run('play');
  d.getElementById('pbtn').click(); run('pause');
  d.getElementById('resume').click(); w.__kb.finish(); run('result');
  w.close();
  return out;
}
function geomAt(src, insets) {
  const { w, d } = boot(src);
  if (insets) { d.getElementById('sa').style.padding = insets; w.__kb.resize(); }
  const g = w.__kb.geom(), sa = w.__kb.insets(); w.close();
  return { g, sa };
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
test('keyboard-only help text is hidden on touch and the touch hint is shown', () => {
  const eff = effectiveRules(parseCSS(html)).filter(r => r.media.length);
  assert.ok(eff.some(r => r.sel === '.kbonly' && r.decls.display === 'none'));
  assert.ok(eff.some(r => r.sel === '.touchonly' && r.decls.display === 'inline'));
});
test('touch-action: canvas allows no scroll or zoom; every control kills double-tap zoom (menu, play, pause, result)', { skip: SKIPJ }, () => {
  assert.deepEqual(stateAudit(html).touch, []);
});
test('touch targets >= 44px (declared size or row share) on the menu, pause button, pause card and result card', { skip: SKIPJ }, () => {
  assert.deepEqual(stateAudit(html).targets, []);
});
test('lanes: four lanes, each >= 44px wide, inside 375x667, hit line above the bottom', { skip: SKIPJ }, () => {
  const { g } = geomAt(html);
  assert.ok(g.w / 4 >= 44, 'lane width ' + g.w / 4);
  assert.ok(g.left >= 0 && g.left + g.w <= VIEW.w, 'lanes inside the viewport');
  assert.ok(g.hitY + 70 <= VIEW.h && g.top >= 60, 'lane column fits vertically');
});
test('safe-area insets move the lanes and HUD inside the notch / home-indicator area', { skip: SKIPJ }, () => {
  const { g, sa } = geomAt(html, '47px 30px 34px 30px');
  assert.deepEqual(JSON.parse(JSON.stringify(sa)), { t: 47, r: 30, b: 34, l: 30 });
  assert.ok(g.left >= 30 && g.left + g.w <= VIEW.w - 30, 'lanes clear of side insets');
  assert.ok(g.top >= 47 + 60, 'lane top clear of the notch and the pause button band');
  assert.ok(g.hitY + 70 <= VIEW.h - 34, 'hit line and labels clear of the home indicator');
  assert.ok(g.w / 4 >= 44);
});
test('every keyboard action has a touch control: Esc/Enter via buttons, D/F/J/K via the four lanes', { skip: SKIPJ }, async () => {
  const kd = html.slice(html.indexOf("addEventListener('keydown'"), html.indexOf("addEventListener('keyup'"));
  const keys = new Set([...kd.matchAll(/k === '([a-z]+)'/g)].map(m => m[1]));
  assert.ok(keys.size >= 2, 'found the keydown handler');
  for (const k of keys) assert.ok(['escape', 'enter'].includes(k), 'keyboard key "' + k + '" has no touch control mapped in this test');
  let T = -1;
  const { w, d } = boot(html, win => { win.__kbClock = () => T; });
  const $ = id => d.getElementById(id), mode = () => w.__kb.state().mode;
  const ptr = (type, id, x, y) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); Object.assign(e, { pointerId: id, clientX: x, clientY: y }); $('c').dispatchEvent(e); };
  assert.ok($('pbtn').classList.contains('hidden'), 'pause button hidden in the menu');
  $('start').click(); assert.equal(mode(), 'play');                       // Enter
  assert.ok(!$('pbtn').classList.contains('hidden'), 'pause button visible while playing');
  const { left, w: gw, hitY } = w.__kb.geom();
  for (let lane = 0; lane < 4; lane++) {                                  // D F J K
    const x = left + (lane + 0.5) * gw / 4;
    ptr('pointerdown', 10 + lane, x, hitY); ptr('pointerup', 10 + lane, x, hitY);
  }
  const log = w.__kb.state().judge.log.filter(e => e[2] === 'p');
  assert.deepEqual(JSON.parse(JSON.stringify(log.map(e => e[1]))), [0, 1, 2, 3]); assert.ok(log.every(e => e[3] === 'touch'));
  $('pbtn').click(); assert.equal(mode(), 'pause');                       // Esc pauses
  assert.ok(!$('pause').classList.contains('hidden'));
  const before = w.__kb.state().judge.log.length; ptr('pointerdown', 20, left + 10, hitY); assert.equal(w.__kb.state().judge.log.length, before, 'no input while paused');
  $('resume').click(); assert.equal(mode(), 'play');                      // Esc resumes
  assert.ok(!$('pbtn').classList.contains('hidden'));
  $('pbtn').click(); $('quit').click(); assert.equal(mode(), 'menu');
  assert.ok(!$('menu').classList.contains('hidden') && $('pbtn').classList.contains('hidden'));
  $('start').click(); w.__kb.finish(); assert.equal(mode(), 'result');
  const btns = [...$('resBody').querySelectorAll('button')];
  assert.equal(btns.map(b => b.textContent).join('|'), 'Play again|Menu');
  btns[0].click(); assert.equal(mode(), 'play');
  w.__kb.finish(); [...$('resBody').querySelectorAll('button')][1].click(); assert.equal(mode(), 'menu');
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
  for (const r of ['.card{width:420px}', '.row{width:100vw}', '.card{min-width:380px}', '@media (max-width:480px){.card{width:500px}}']) assert.ok(auditWidths(addCss(r), parseCSS(addCss(r))).length, r);
  const noClamp = mut('overflow:hidden;overscroll-behavior:none;', 'overscroll-behavior:none;');
  assert.ok(auditWidths(noClamp, parseCSS(noClamp)).length);
  const desk = addCss('@media (min-width:900px){.card{width:500px}}');
  assert.deepEqual(auditWidths(desk, parseCSS(desk)), []);
});
test('negative: bare :hover, mouse handlers and tooltips are flagged', () => {
  const h = addCss('button:hover{opacity:.5}'); assert.ok(auditHover(h, parseCSS(h)).length);
  const ok = addCss('@media (hover:hover){button:hover{opacity:.5}}'); assert.deepEqual(auditHover(ok, parseCSS(ok)), []);
  const js = mut("$('quit').onclick = toMenu;", "$('quit').onmouseover = toMenu;"); assert.ok(auditHover(js, parseCSS(js)).length);
});
test('negative: dropping any safe-area inset is flagged', () => {
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const m = html.split('safe-area-inset-' + side).join('safe-area-gone');
    assert.ok(auditSafeArea(m, parseCSS(m)).length, side);
  }
});
test('negative: small targets, zoomable controls and a scrollable canvas are flagged', { skip: SKIPJ }, () => {
  assert.ok(stateAudit(mut('min-height:44px;min-width:44px}', 'min-height:30px;min-width:30px}')).targets.length);
  assert.ok(stateAudit(mut('width:44px;height:44px;padding:0;flex:none', 'width:30px;height:30px;min-width:30px;min-height:30px;padding:0;flex:none')).targets.some(m => /pbtn/.test(m)));
  assert.ok(stateAudit(mut('touch-action:manipulation;', '')).touch.some(m => /double-tap/.test(m)));
  assert.ok(stateAudit(mut('width:100%;height:100%;touch-action:none', 'width:100%;height:100%;touch-action:auto')).touch.some(m => /#c/.test(m)));
  assert.ok(stateAudit(mut('width:100%;height:100%;touch-action:none', 'width:100%;height:100%;touch-action:pan-x')).touch.some(m => /#c/.test(m)));
});
test('negative: ignoring insets or squeezing the lanes is flagged', { skip: SKIPJ }, () => {
  const noSA = mut('const aw = W - SA.l - SA.r,', 'const aw = W,');
  assert.ok(noSA !== html);
  const r = geomAt(noSA, '47px 30px 34px 30px'); assert.ok(r.g.left < 30 || r.g.left + r.g.w > VIEW.w - 30);
  const narrow = mut('Math.min(aw, 560)', 'Math.min(aw, 120)'); assert.ok(geomAt(narrow).g.w / 4 < 44);
});
test('negative: without the pause button the touch flow cannot pause', { skip: SKIPJ }, () => {
  const m = mut("$('pbtn').onclick = pause;", '');
  const { w, d } = boot(m); d.getElementById('start').click(); d.getElementById('pbtn').click();
  assert.equal(w.__kb.state().mode, 'play'); w.close();
});
