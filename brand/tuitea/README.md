# TUITEA brand kit

One source asset drives the app icon, the invite page, the share preview, the install page and
the web manifest icons.

- `source.png` — 1024×1024, square, no transparency. **Currently the placeholder "T" icon**,
  upscaled from the shipped web icon. Replace it with the owner-approved artwork.
- `brand.json` — name and background colour used behind the share card.
- `pwa-art.json` (written by the installer, absent until the gold-tree art is installed) pins the sha256 and size of the four installed PWA icons.
- **`build-brand.sh` no longer exists** (it is retired; the thrive-app docs say so). The PWA icons are the owner-pinned leaf-and-sparkles files from thrive-app `assets/brand/site_shell/` (decision 2026-11-24; the gold-tree PWA art was cancelled; the gold tree stays the invite/SMS icon). To (re)install art run `node tools/install-tuitea-pwa-art.cjs --icon-512 <png> --maskable-512 <png> --apple-touch-180 <png> [--icon-192 <png>]`; it checks the files, writes `app/tuitea/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` and `pwa-art.json`. `tests/tuitea-pwa-art.test.cjs` fails while any of those is still the green T placeholder.
- `share.png` (the old green-T 1200x630 share image) is no longer referenced by any page: `/join/` now uses `app/tuitea/invite/invite_card_1200x630.png`.

The placeholder-T files above stay in `source.png`/`share.png` for history only. Nothing here invents or approves a mark on the owner's behalf.
