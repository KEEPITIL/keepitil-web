// Build-service starter template: renders four static pages from site.json.
//   node build.mjs [site.json] [outDir]     defaults: ./site.json → ./preview
// No runtime JS, no external requests, no trackers. All content comes from the JSON file.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeHref = (h) => (/^(https?:|mailto:|tel:|[\w./#-]+$)/i.test(String(h || '')) && !/^javascript:/i.test(h) ? esc(h) : '#');
const color = (c, d) => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : d);

export function layout(site, page, title, body) {
  const nav = site.nav.map((n) => `<a href="${safeHref(n.href)}"${n.href === page ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`).join('');
  const light = site.theme?.mode === 'light';
  return `<!doctype html>
<html lang="${esc(site.lang || 'en')}"${light ? ' data-mode="light"' : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${site.noindex ? '<meta name="robots" content="noindex">\n' : ''}<meta name="description" content="${esc(site.description)}">
<link rel="canonical" href="${esc(String(site.url || '').replace(/\/$/, ''))}/${page === 'index.html' ? '' : esc(page)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(site.description)}">
<meta name="theme-color" content="${light ? '#ffffff' : '#0a0a0f'}">
<style>:root{--brand:${color(site.theme?.brand, '#00b4ff')};--accent:${color(site.theme?.accent, '#8b5cff')}}</style>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top"><div class="wrap bar">
<a class="logo" href="index.html">${esc(site.name)}</a>
<nav aria-label="Main">${nav}</nav>
</div></header>
<main id="main" class="wrap">
${body}
</main>
<footer class="foot"><div class="wrap">${esc(site.footer)}</div></footer>
</body>
</html>
`;
}

export function render(site) {
  const h = site.home, a = site.about, s = site.services, c = site.contact;
  const pages = {
    'index.html': [`${site.name} | ${site.tagline}`, `<section class="hero">
<p class="eyebrow">${esc(site.tagline)}</p>
<h1>${esc(h.headline)}</h1>
<p class="lead">${esc(h.intro)}</p>
${h.cta ? `<a class="btn" href="${safeHref(h.cta.href)}">${esc(h.cta.label)}</a>` : ''}
</section>
<section class="grid" aria-label="Highlights">${(h.highlights || []).map((x) => `<article class="card"><h2>${esc(x.title)}</h2><p>${esc(x.text)}</p></article>`).join('')}</section>`],
    'about.html': [`${a.headline} | ${site.name}`, `<section class="page"><h1>${esc(a.headline)}</h1>${(a.paragraphs || []).map((p) => `<p>${esc(p)}</p>`).join('')}</section>`],
    'services.html': [`${s.headline} | ${site.name}`, `<section class="page"><h1>${esc(s.headline)}</h1></section>
<section class="grid">${(s.items || []).map((x) => `<article class="card"><h2>${esc(x.title)}</h2><p>${esc(x.text)}</p>${x.price ? `<p class="price">${esc(x.price)}</p>` : ''}</article>`).join('')}</section>`],
    'contact.html': [`${c.headline} | ${site.name}`, `<section class="page"><h1>${esc(c.headline)}</h1><p class="lead">${esc(c.intro)}</p>
<ul class="contact">
${c.email ? `<li><span>Email</span><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>` : ''}
${c.phone ? `<li><span>Phone</span><a href="tel:${esc(String(c.phone).replace(/[^\d+]/g, ''))}">${esc(c.phone)}</a></li>` : ''}
${c.address ? `<li><span>Address</span>${esc(c.address)}</li>` : ''}
${c.hours ? `<li><span>Hours</span>${esc(c.hours)}</li>` : ''}
</ul>
${c.email ? `<a class="btn" href="mailto:${esc(c.email)}?subject=${encodeURIComponent('Enquiry')}">Email us</a>` : ''}
</section>`],
  };
  return Object.fromEntries(Object.entries(pages).map(([f, [t, b]]) => [f, layout(site, f, t, b)]));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const site = JSON.parse(readFileSync(path.resolve(process.argv[2] || path.join(here, 'site.json')), 'utf8'));
  const out = path.resolve(process.argv[3] || path.join(here, 'preview'));
  mkdirSync(out, { recursive: true });
  for (const [f, html] of Object.entries(render(site))) writeFileSync(path.join(out, f), html);
  copyFileSync(path.join(here, 'src', 'styles.css'), path.join(out, 'styles.css'));
  console.log(`built ${out}`);
}
