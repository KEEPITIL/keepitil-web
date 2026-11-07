import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, '../..');

const PAYLOADS = [
  '<img src=x onerror=alert(1)>',
  '<script>alert(1)</script>',
  '<a href="javascript:alert(1)">click</a>',
  '<svg onload=alert(1)></svg>'
];

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

function boot() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://keepitil.com/profile',
    runScripts: 'dangerously'
  });
  const window = dom.window;
  let fired = 0;
  window.alert = function () { fired += 1; };
  function load(name) {
    const el = window.document.createElement('script');
    el.textContent = readFileSync(join(dir, name), 'utf8');
    window.document.body.appendChild(el);
  }
  load('vendor/purify.min.js');
  load('kil-safe-html.js');
  return {
    window,
    fired: function () { return fired; },
    api: window.KilSafeHtml
  };
}

function mount(window, html) {
  const host = window.document.createElement('div');
  host.innerHTML = html;
  window.document.body.appendChild(host);
  return host;
}

function assertInert(host, label) {
  assert.equal(host.querySelectorAll('script, iframe, style, svg, object, embed, link, math, form').length, 0, label + ' active tag');
  host.querySelectorAll('*').forEach(function (el) {
    Array.from(el.attributes).forEach(function (attr) {
      assert.equal(/^on/i.test(attr.name), false, label + ' ' + attr.name);
      if (/^(href|src|poster|action)$/i.test(attr.name)) {
        assert.equal(/^\s*javascript:/i.test(attr.value), false, label + ' ' + attr.name + '=' + attr.value);
      }
    });
  });
}

test('script, onerror, onload and javascript: payloads render inert', () => {
  const { window, fired, api } = boot();
  assert.equal(typeof window.DOMPurify.sanitize, 'function');
  assert.equal(typeof api.renderStored, 'function');

  const combined = PAYLOADS.join('');
  for (const payload of PAYLOADS.concat([combined])) {
    const legacy = api.renderStored({ html: payload });
    const host = mount(window, legacy);
    assertInert(host, 'legacy ' + payload.slice(0, 24));
    assert.equal(/javascript\s*:/i.test(host.innerHTML), false, payload.slice(0, 24));
    assert.equal(host.querySelector('script'), null);
    host.querySelectorAll('img').forEach(function (img) { img.dispatchEvent(new window.Event('error')); });
    host.querySelectorAll('*').forEach(function (el) { el.dispatchEvent(new window.Event('load')); });
  }

  const rebuilt = api.renderStored({
    desc: PAYLOADS.join('\n'),
    text: null,
    img: 'javascript:alert(1)',
    mtype: 'image',
    tags: ['<svg onload=alert(1)>'],
    collab: ['<img src=x onerror=alert(1)>'],
    location: '<a href="javascript:alert(1)">x</a>',
    html: combined
  });
  const body = mount(window, rebuilt);
  assertInert(body, 'rebuilt');
  assert.equal(body.querySelector('img'), null);
  assert.match(body.textContent, /<script>/);
  assert.match(body.textContent, /onerror/);
  assert.match(body.textContent, /onload/);
  assert.match(body.textContent, /javascript:alert/);
  assert.equal(fired(), 0);

  const mixed = api.renderStored({
    desc: 'Night one',
    html: combined
  });
  const mixedHost = mount(window, mixed);
  assertInert(mixedHost, 'structured wins');
  assert.equal(mixedHost.querySelector('script'), null);
  assert.match(mixedHost.textContent, /Night one/);
  assert.equal(/<script/i.test(mixed), false);
});

test('a safe post still renders its text, https media, and links', () => {
  const { window, api } = boot();
  const html = api.renderStored({
    desc: 'Night one',
    img: 'https://cdn.example.com/a.jpg',
    mtype: 'image',
    tags: ['house'],
    collab: ['groove'],
    location: 'Los Angeles'
  });
  const host = mount(window, html);
  assert.equal(host.querySelector('img').getAttribute('src'), 'https://cdn.example.com/a.jpg');
  assert.match(host.textContent, /Night one/);
  assert.match(host.textContent, /@house/);
  assert.match(host.textContent, /@groove/);
  assert.match(host.textContent, /Los Angeles/);

  const legacy = api.sanitize('<p class="intro-text">Hello</p><img src="https://cdn.example.com/a.jpg" alt="cover"><a href="https://keepitil.com/event">tickets</a><iframe src="https://evil.example"></iframe><p style="color:red">Hi</p>');
  const box = mount(window, legacy);
  assert.match(box.textContent, /Hello/);
  assert.match(box.textContent, /Hi/);
  assert.equal(box.querySelector('img').getAttribute('src'), 'https://cdn.example.com/a.jpg');
  assert.equal(box.querySelector('a').getAttribute('href'), 'https://keepitil.com/event');
  assert.equal(box.querySelector('iframe'), null);
  assert.equal(box.querySelector('p[style]'), null);
  assertInert(box, 'legacy safe');
});

test('mutation XSS in noscript, style, svg and math stays inert', () => {
  const { window, fired, api } = boot();
  const payloads = [
    '<svg><style><img src=x onerror=alert(1)></style></svg>',
    '<math><style><img src=x onerror=alert(1)></style></math>',
    '<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;/mglyph&gt;&lt;img src=1 onerror=alert(1)&gt;">',
    '<form><math><mtext></form><form><mglyph><svg><mtext><style><path id="</style><img onerror=alert(1) src>">',
    '<noscript><style></noscript><img src=x onerror=alert(1)>',
    '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
    '<textarea><script>alert(1)</script></textarea>',
    '<xmp><img src=x onerror=alert(1)></xmp>',
    '<svg><desc><![CDATA[</desc><img src=x onerror=alert(1)>]]></svg>'
  ];
  for (const payload of payloads) {
    const clean = api.sanitize(payload);
    const host = mount(window, clean);
    const again = mount(window, host.innerHTML);
    assertInert(host, payload.slice(0, 32));
    assertInert(again, 'mutated ' + payload.slice(0, 24));
    assert.equal(host.querySelector('svg, math, noscript, style, textarea, xmp, form'), null, payload.slice(0, 32));
    host.querySelectorAll('img').forEach(function (img) { img.dispatchEvent(new window.Event('error')); });
  }
  assert.equal(fired(), 0);
  assert.match(read('assets/js/vendor/purify.min.js'), /DOMPurify 3\.4\.17/);
  assert.equal(api.kilSafeUrl('javascript:alert(1)'), '');
  assert.equal(api.kilSafeUrl('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg');
});

test('navigation and media URLs are https or same-origin', () => {
  const { api } = boot();
  assert.equal(api.safeNavUrl('javascript:alert(1)'), '');
  assert.equal(api.safeNavUrl('data:text/html,<script>alert(1)</script>'), '');
  assert.equal(api.safeNavUrl('//evil.example/phish'), '');
  assert.equal(api.safeNavUrl('http://evil.example/phish'), '');
  assert.equal(api.safeNavUrl('https://example.com/ok'), 'https://example.com/ok');
  assert.equal(api.safeNavUrl('/article/artist/groove-trooper/'), '/article/artist/groove-trooper/');
  assert.equal(api.safeNavUrl('https://keepitil.com/article/x/'), 'https://keepitil.com/article/x/');
  assert.equal(api.safeMediaUrl('javascript:alert(1)'), '');
  assert.equal(api.safeMediaUrl('http://cdn.example.com/a.jpg'), '');
  assert.equal(api.safeMediaUrl('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg');
  assert.equal(api.safeMediaUrl('/assets/images/logo-bg.jpg'), '/assets/images/logo-bg.jpg');
});

test('pages do not assign stored html straight to innerHTML', () => {
  const profile = read('profile.html');
  const culture = read('culture/index.html');
  const dashboard = read('dashboard.html');
  assert.match(profile, /assets\/js\/vendor\/purify\.min\.js/);
  assert.match(profile, /assets\/js\/kil-safe-html\.js/);
  assert.equal(/v\.innerHTML\s*=\s*GT_ARTICLES\[i\]\.html/.test(profile), false);
  assert.equal(/location\.href\s*=\s*a\.url/.test(profile), false);
  assert.match(profile, /safeNav\(a\.url\)/);
  assert.match(profile, /storedBody\(/);
  assert.match(profile, /desc:desc/);
  assert.match(culture, /KilSafeHtml\.sanitize/);
  assert.match(culture, /KilSafeHtml\.renderStored/);
  assert.equal(/caption:d\.html/.test(culture), false);
  assert.match(dashboard, /esc\(p\.body\|\|''\)/);
  assert.equal(/fc-text">'\s*\+\s*\(p\.body/.test(dashboard), false);
  assert.match(profile, /kilSafeUrl\(o\.cover\)/);
  assert.match(profile, /src="'\+esc\(cover\)\+'"/);
  assert.match(profile, /data-event-slug/);
  assert.match(profile, /addEventListener\('click'/);
  assert.equal(/openEventRoom\(\\'/.test(profile), false);
  assert.match(profile, /esc\(String\(d\.title\|\|d\.text\|\|c\.kind\|\|''\)\.slice\(0,50\)\)/);
  const connect = read('connect/index.html');
  assert.match(connect, /kilSafeUrl\(x\.img\)/);
  assert.match(connect, /escHtml\(x\.name/);
  assert.match(connect, /escHtml\(x\.city\)/);
});
