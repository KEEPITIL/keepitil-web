import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, checkImages, imgTag, IMG_MAX_BYTES } from '../build.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'standard');
const site = JSON.parse(readFileSync(path.join(dir, 'site.json'), 'utf8'));
const pages = render(site);

test('Standard renders seven pages, all in the nav', () => {
  assert.deepEqual(Object.keys(pages).sort(), ['about.html', 'contact.html', 'events.html', 'faq.html', 'gallery.html', 'index.html', 'services.html']);
  for (const f of Object.keys(pages)) assert.match(pages['index.html'], new RegExp(`href="${f}"`), `nav links ${f}`);
});
test('Standard stays within the OFFER.md limits: up to 7 pages, up to 15 images', () => {
  assert.ok(Object.keys(pages).length <= 7);
  assert.deepEqual(checkImages(site, dir), []);
});
test('hero image is eager with fixed size; gallery images are lazy with fixed size and alt', () => {
  assert.match(pages['index.html'], /<img [^>]*fetchpriority="high"[^>]*width="1200" height="600"|<img [^>]*width="1200" height="600"[^>]*fetchpriority="high"/);
  const imgs = pages['gallery.html'].match(/<img [^>]*>/g);
  assert.equal(imgs.length, 6);
  for (const t of imgs) { assert.match(t, /loading="lazy"/); assert.match(t, /width="800" height="600"/); assert.match(t, /alt="[^"]+"/); }
});
test('contact form is wired through site.json to the client-contact function with the site id', () => {
  const h = pages['contact.html'];
  assert.match(h, /action="https:\/\/contact\.example\.com\/functions\/v1\/client-contact"/);
  assert.match(h, /name="site" value="cedar-salt"/);
  assert.match(h, /name="website"/); assert.match(h, /name="elapsed_ms"/);
});
test('events and FAQ pages render from site.json; the FAQ uses native details', () => {
  assert.match(pages['events.html'], /Sourdough basics workshop/);
  assert.equal((pages['faq.html'].match(/<details/g) || []).length, site.faq.items.length);
});
test('no third-party requests or scripts outside the contact form', () => {
  for (const [f, html] of Object.entries(pages)) {
    assert.doesNotMatch(html, /<script[^>]*\bsrc=/i, f);
    if (f !== 'contact.html') assert.doesNotMatch(html.replace(/<script type="application\/ld\+json">[^<]*<\/script>/g, ''), /<script/i, f);
    assert.doesNotMatch(html, /(src|href)="https?:\/\/(?!example\.com)/i, f);
  }
});
test('image checks catch a missing file, empty alt, bad path and an over-budget file', () => {
  const bad = (img) => checkImages({ home: {}, gallery: { images: [img] } }, dir);
  assert.match(bad({ src: 'images/nope.svg', alt: 'x', width: 10, height: 10 })[0], /file not found/);
  assert.match(bad({ src: 'images/hero.svg', alt: '', width: 10, height: 10 })[0], /alt text/);
  assert.match(bad({ src: 'https://evil.example/x.png', alt: 'x', width: 10, height: 10 })[0], /bad image entry/);
  assert.match(bad({ src: 'images/hero.svg', alt: 'x' })[0], /bad image entry/);
  assert.ok(Math.max(...['hero', 'sourdough'].map((n) => statSync(path.join(dir, 'images', n + '.svg')).size)) < IMG_MAX_BYTES);
  assert.equal(imgTag({ src: '../secret.png', alt: 'x', width: 1, height: 1 }), '');
});
test('Starter is unchanged: no optional pages without their blocks', () => {
  const starter = JSON.parse(readFileSync(path.join(dir, '..', 'site.json'), 'utf8'));
  assert.equal(Object.keys(render(starter)).length, 4);
});
