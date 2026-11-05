# Build service: starter website template (v0, draft)

The first template for KEEPITIL's website build service. It's a mobile-first static site with four pages: home, about, services and contact. All the content and both theme colours come from **one file, `site.json`**.

```bash
node build.mjs                          # site.json → preview/
node build.mjs clients/acme.json out/   # any config, any output folder
node --test test/*.test.mjs             # 8 tests
```

## New client site in 5 steps

1. **Copy the config:** `cp site.json clients/<client>.json`.
2. **Fill it in:** set the name, tagline, description, `url`, the home, about and services text, and the contact details. Set `theme.brand` and `theme.accent` to hex colours; `theme.mode` can be `"light"`. Delete `"noindex": true`.
3. **Pick the contact option:** to keep the email link only, leave `contact.form` out. To add a form, set `contact.form.endpoint` to `https://<project>.supabase.co/functions/v1/client-contact` and `contact.form.site` to the client's site id. Then add that id to `client_sites` with the client's inbox and site origin (see "Contact form" below).
4. **Build and check:** run `node build.mjs clients/<client>.json out/<client>/`, then `node --test test/*.test.mjs`. Open `out/<client>/index.html` at phone width.
5. **Publish:** upload the 4 pages in `out/<client>/` (CSS is inlined; add the client's icon file if `icon` is set) to any static host. Then run Lighthouse (mobile) on the live URL; all four scores should be 95 or higher.

## Contact form

The form is optional. With no https `contact.form.endpoint`, the page shows the email link. With one, the page shows a form that posts `multipart/form-data` with:

- `name`, `email` and `message`;
- `source`: from `contact.form.source`, default `site-contact`;
- `website`: a hidden honeypot that must stay empty;
- `elapsed_ms`: the time spent on the page.

The ready-made endpoint is the `client-contact` edge function (`supabase/functions/client-contact/`, migration `20261105120000_client_contact.sql`). It follows the KEEPITIL `connect-submit` pattern (#61). One row in `client_sites` per client maps the site id to the destination inbox and the allowed origins. The function:

- If the honeypot is filled or the time is under 3000 ms, answer with a fake success and store nothing.
- Store the IP only as an HMAC, and rate-limit per IP.
- Allow CORS only for the client's own origin.
- Answer with JSON `{ "ok": true }`, or `{ "ok": false, "error": "…" }` to show the error to the visitor.

The page has one small first-party inline script, which times the visit and shows the answer. With JavaScript off, the form still posts natively. No third-party scripts are used.

## What it guarantees

- **One config file.** Every word, link and colour is in `site.json`. To make a client site, copy it and edit it; no HTML changes are needed.
- **No trackers and no external requests.** No third-party scripts and no web fonts (system font stack). The only script is the contact form's small inline one. Tests enforce this.
- **Lighthouse-friendly by construction.** Four tiny static pages (about 6 KB each with the CSS inlined, so no render-blocking request). Each page has a title, a meta description, a canonical URL, `lang`, a skip link, and a visible focus ring. Tap targets are at least 44 px, and `prefers-reduced-motion` is respected.
- **KEEPITIL design tokens.** Spacing, radius, type scale and dark surfaces match `assets/css/tokens.css`. `--brand` and `--accent` are set per client. A light mode is available with `"theme": {"mode": "light"}`.
- **Safe content.** All text is HTML-escaped, `javascript:` links are dropped, and colours must be hex values or they fall back to the defaults. Tests cover this.

## Standard package (up to 7 pages, contact form, images)
`standard/site.json` is the Standard sample (fictional "Cedar & Salt Bakery"; `standard/preview/` is its build). It uses the same `build.mjs`; extra pages appear only when their block exists in `site.json`:

| Block in `site.json` | Page | What it holds |
|---|---|---|
| `home.hero_image` | home | one hero image, loaded first |
| `gallery` | `gallery.html` | `images[]`: `src`, `alt`, `width`, `height`, optional `caption` (lazy-loaded) |
| `events` | `events.html` | `items[]`: `date`, `title`, `text`, `price`, plus a `note`; also works as a price list |
| `faq` | `faq.html` | `items[]`: `q`, `a` (native `<details>`, no script) |
| `contact.form` | `contact.html` | `endpoint` and `site` (the client's `site_id` in `client_sites`, see #66) |

Add the pages to `nav` yourself. Standard limits from `OFFER.md`: 7 pages, 15 images.

```bash
node build.mjs standard/site.json out/<client>/   # copies standard/images/ to out/<client>/images/
node --test test/*.test.mjs                        # 16 tests
```
- **Images:** put files in `images/` next to the client's `site.json`. The build stops with a list of problems if a file is missing, over **200 KB**, has no alt text or no `width`/`height`, or if there are more than 15. It does **not** resize or compress: do that by hand first (for example, 1600 px wide max, WebP or JPEG at quality 80), then build.
- **Contact form:** add the client to `client_sites` (see #66) and set `contact.form.site` to its `site_id`. The sample's endpoint is fictional, so it can't send until then.

## Notes

- `preview/` is the sample client (fictional "Northshore Studio"). Its `site.json` sets `"noindex": true` so the preview isn't indexed. Remove that line for a real client.
- The sample's form endpoint (`contact.example.com`) is fictional, so the preview form can't actually send.
- Lighthouse itself hasn't been run yet; the checks above are by construction and by test. Run it before the first client launch.
- Images, a gallery page and multiple languages are not in v0.
