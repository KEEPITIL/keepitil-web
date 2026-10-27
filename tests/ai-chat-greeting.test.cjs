/**
 * Greeting and suggested prompts for the KEEPITIL chat widget.
 * Run: node --test tests/ai-chat-greeting.test.cjs
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function memStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key(i) { return Array.from(m.keys())[i] || null; },
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(String(k), String(v)); },
    removeItem(k) { m.delete(k); },
    clear() { m.clear(); }
  };
}

function makeClassList() {
  const set = new Set();
  return {
    add() { for (const c of arguments) set.add(c); },
    remove() { for (const c of arguments) set.delete(c); },
    toggle(c, force) {
      if (force === undefined) { if (set.has(c)) set.delete(c); else set.add(c); }
      else if (force) set.add(c); else set.delete(c);
      return set.has(c);
    },
    contains(c) { return set.has(c); }
  };
}

function loadChat(opts) {
  opts = opts || {};
  const storage = opts.storage || memStorage();
  const fetches = [];
  let fetchImpl = opts.fetch || function () {
    fetches.push(arguments[0]);
    return new Promise(function () {});
  };

  function walk(node, id) {
    if (!node) return null;
    if (node.id === id) return node;
    const kids = node.children || [];
    for (let i = 0; i < kids.length; i++) {
      const hit = walk(kids[i], id);
      if (hit) return hit;
    }
    return null;
  }

  function parseFragment(html, doc) {
    const clean = String(html).replace(/<svg[\s\S]*?<\/svg>/gi, '');
    const re = /<\/([a-zA-Z0-9]+)>|<([a-zA-Z0-9]+)([^>]*)>/g;
    const root = [];
    const stack = [{ children: root }];
    let m;
    while ((m = re.exec(clean))) {
      if (m[1]) {
        const tag = m[1].toLowerCase();
        while (stack.length > 1 && stack[stack.length - 1].tag !== tag) stack.pop();
        if (stack.length > 1) stack.pop();
        continue;
      }
      const tag = m[2].toLowerCase();
      const attrs = m[3] || '';
      const node = makeEl(tag, doc);
      const idm = attrs.match(/\bid="([^"]+)"/);
      if (idm) node.id = idm[1];
      const pm = attrs.match(/\bplaceholder="([^"]*)"/);
      if (pm) node.attrs.placeholder = pm[1];
      const cm = attrs.match(/\bclass="([^"]+)"/);
      if (cm) node.className = cm[1];
      const tm = attrs.match(/\btype="([^"]+)"/);
      if (tm) node.type = tm[1];
      stack[stack.length - 1].children.push(node);
      const voidish = /\/\s*$/.test(attrs) || tag === 'input' || tag === 'br' || tag === 'img';
      if (!voidish) stack.push(node);
    }
    return root;
  }

  function makeEl(tag, doc) {
    const node = {
      tag: tag, id: '', className: '', children: [], attrs: {}, style: {},
      textContent: '', value: '', parentNode: null, ownerDocument: doc, _ev: {}
    };
    node.classList = makeClassList();
    Object.defineProperty(node, 'innerHTML', {
      get: function () { return node._html || ''; },
      set: function (html) {
        node._html = String(html);
        node.children = parseFragment(html, doc);
        node.children.forEach(function (c) { c.parentNode = node; });
      }
    });
    node.addEventListener = function (type, fn) {
      (node._ev[type] || (node._ev[type] = [])).push(fn);
    };
    node.dispatch = function (type, ev) {
      (node._ev[type] || []).forEach(function (fn) { fn(ev || { stopPropagation: function () {}, target: node }); });
    };
    node.focus = function () { doc.activeElement = node; };
    node.appendChild = function (c) { node.children.push(c); c.parentNode = node; return c; };
    node.removeChild = function (c) { node.children = node.children.filter(function (x) { return x !== c; }); };
    node.insertBefore = function (c) { return node.appendChild(c); };
    node.setAttribute = function (k, v) { node.attrs[k] = v; if (k === 'id') node.id = v; };
    node.getAttribute = function (k) { return node.attrs[k]; };
    node.hasChildNodes = function () { return node.children.length > 0; };
    node.contains = function (t) {
      if (t === node) return true;
      return node.children.some(function (c) { return c.contains && c.contains(t); });
    };
    node.querySelector = function () { return null; };
    node.querySelectorAll = function () { return []; };
    return node;
  }

  const document = {
    readyState: 'complete',
    activeElement: null,
    addEventListener: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  };
  document.createElement = function (tag) { return makeEl(tag, document); };
  document.head = makeEl('head', document);
  document.body = makeEl('body', document);
  document.documentElement = makeEl('html', document);
  document.documentElement.style = { setProperty: function () {}, removeProperty: function () {} };
  document.documentElement.scrollTop = 0;
  document.getElementById = function (id) {
    return walk(document.body, id) || walk(document.head, id);
  };

  const realSetTimeout = setTimeout;
  const realClearTimeout = clearTimeout;
  const sandbox = {
    console: console,
    Promise: Promise,
    Date: Date,
    Math: Math,
    JSON: JSON,
    Object: Object,
    Array: Array,
    RegExp: RegExp,
    String: String,
    Number: Number,
    Error: Error,
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,
    parseInt: parseInt,
    isNaN: isNaN,
    URL: URL,
    AbortController: AbortController,
    setTimeout: function (fn, ms) {
      if (ms >= 1000) return 0;
      return realSetTimeout(fn, ms);
    },
    clearTimeout: realClearTimeout,
    fetch: function (url, options) { return fetchImpl(url, options); },
    document: document,
    navigator: {},
    location: { href: 'https://keepitil.com/', pathname: '/', search: '', hostname: 'keepitil.com' },
    localStorage: storage,
    pageYOffset: 0,
    scrollTo: function () {},
    matchMedia: function () { return { matches: false, addEventListener: function () {} }; },
    addEventListener: function () {},
    __kilRadioInit: true
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets/js/keepitil-ai.js'), 'utf8'), sandbox, { filename: 'keepitil-ai.js' });
  return { sandbox: sandbox, document: document, storage: storage, fetches: fetches, setFetch: function (fn) { fetchImpl = fn; } };
}

function botText(document) {
  const msgs = document.getElementById('kilo-msgs');
  assert.ok(msgs, 'chat transcript exists');
  return msgs.children.filter(function (n) { return /bot/.test(n.className); }).map(function (n) {
    return n.children.map(function (c) { return c.textContent; }).join('\n');
  }).join('\n');
}

function chipLabels(document) {
  const msgs = document.getElementById('kilo-msgs');
  const labels = [];
  (function walk(n) {
    if (!n) return;
    if (n.tag === 'button' && /kilo-chip/.test(n.className || '')) labels.push(n.textContent);
    (n.children || []).forEach(walk);
  })(msgs);
  return labels;
}

function openChat(env) {
  const btn = env.document.getElementById('kilo-btn');
  btn.dispatch('click', { stopPropagation: function () {}, target: btn });
}

test('signed-out greeting names CHO and offers suggested prompts', function () {
  const env = loadChat();
  const input = env.document.getElementById('kilo-input');
  assert.match(input.attrs.placeholder || '', /Ask CHO about KEEPITIL/);
  openChat(env);
  const text = botText(env.document);
  assert.match(text, /Hi, I'm CHO/);
  assert.match(text, /events, artists, Culture, Radio, and Earn/);
  assert.deepEqual(chipLabels(env.document), [
    'What is KEEPITIL?',
    'Where can I find events?',
    'How does KEEPITIL Radio work?',
    'How do I create an account?'
  ]);
  assert.equal(env.sandbox.__kiloWelcomeCard().chips.length, 4);
});

test('signed-in greeting offers member prompts', function () {
  const env = loadChat();
  env.storage.setItem('sb-member-auth-token', '1');
  openChat(env);
  assert.match(botText(env.document), /Hi, I'm CHO/);
  assert.match(botText(env.document), /submit work/);
  assert.deepEqual(chipLabels(env.document), [
    'What can I enter on CREATE?',
    'Find upcoming events',
    'How does Earn work?',
    'Play KEEPITIL Radio'
  ]);
});
