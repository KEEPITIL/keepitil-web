# Build service: starter website template (v0, draft)

The first template for KEEPITIL's website build service. It's a mobile-first static site with four pages: home, about, services and contact. All the content and both theme colours come from **one file, `site.json`**.

```bash
node build.mjs                          # site.json → preview/
node build.mjs clients/acme.json out/   # any config, any output folder
node --test test/*.test.mjs             # 6 tests
```

## What it guarantees

- **One config file.** Every word, link and colour is in `site.json`. To make a client site, copy it and edit it; no HTML changes are needed.
- **No trackers and no external requests.** No scripts at all, no web fonts (system font stack), and no third-party URLs. Tests enforce this.
- **Lighthouse-friendly by construction.** Four tiny static pages (about 2 KB each plus 3 KB of CSS). Each page has a title, a meta description, a canonical URL, `lang`, a skip link, and a visible focus ring. Tap targets are at least 44 px, and `prefers-reduced-motion` is respected.
- **KEEPITIL design tokens.** Spacing, radius, type scale and dark surfaces match `assets/css/tokens.css`. `--brand` and `--accent` are set per client. A light mode is available with `"theme": {"mode": "light"}`.
- **Safe content.** All text is HTML-escaped, `javascript:` links are dropped, and colours must be hex values or they fall back to the defaults. Tests cover this.

## Notes

- `preview/` is the sample client (fictional "Northshore Studio"). Its `site.json` sets `"noindex": true` so the preview isn't indexed. Remove that line for a real client.
- Contact is a `mailto:` link, not a form, so v0 needs no backend. A form can use the Connect submit-function pattern later.
- Lighthouse itself hasn't been run yet; the checks above are by construction and by test. Run it before the first client launch.
- Images, a gallery page and multiple languages are not in v0.
