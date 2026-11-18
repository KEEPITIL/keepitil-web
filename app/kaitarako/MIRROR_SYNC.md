# Kai Tarako web mirror: how to sync a new build

`app/kaitarako/` on keepitil.com is a **copy** of the Kai Tarako app's web build, from the KEEPITIL/kai-tarako repo. Nothing here is edited by hand except the files marked **mirror-only** or **slot** below. This file is excluded from the published site (`.github/pages-exclude.txt`).

## 1. Build (on the Mac that builds Kai Tarako)
```bash
git -C kai-tarako checkout <sha named in the GO>
cd kai-tarako && npm ci && npm run build      # tsc -b && vite build && scripts/sw-precache.mjs; base is './'
```
- The build goes to `kai-tarako/dist/`.
- Record the sha and `dist/sw.js`'s `CACHE` value (the build fingerprint) in the PR.

## 2. Copy dist → app/kaitarako/

| From `dist/` | To `app/kaitarako/` | Rule |
|---|---|---|
| `assets/` (all hashed `index-*.js`, `index-*.css`, `*.svg`) | `assets/` | **Replace the whole folder.** Delete the old hashed files first, so no stale build is served. |
| `index.html`, `sw.js`, `manifest.webmanifest`, `frame-guard.js` | same | copy |
| `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `brand/`, `mascot/` | same | copy |
| `licenses.html` | `licenses.html` | copy. The current app links Grown-ups → Licenses to `./licenses.html` (`src/App.tsx`), and the old mirror has no copy. |
| `privacy.html` | **SLOT, do not copy** | see 3 |
| — | `support/index.html` | **mirror-only**, keep as is |

Notes:
- **No `youtube.html`:** the current kai-tarako build has none (`public/` holds no such file). Copy one only if a future build ships it. The link test below fails if the JS asks for a file that isn't here.
- **Never copy a `mascot/*.webp`:** kai-tarako's release test forbids photoreal mascot files in `dist`. The app falls back to the drawn badge. The link test allows exactly those to be absent.

## 3. privacy.html is a slot for Echo's final text
- **Never copy the DRAFT from the build.** The app's `public/privacy.html` carries a "DRAFT for Echo's review" banner and a placeholder effective date until Echo signs it off (kai-tarako #89).
- Leave the mirror's current `privacy.html` in place until Echo's final text exists. Then replace it with that exact file (banner removed, effective date set on release day). The same text goes into the app's `public/privacy.html`.
- **Check before merging:** `grep -c 'DRAFT for Echo' app/kaitarako/privacy.html` must print `0`.

## 4. Check
```bash
node --test assets/js/kaitarako-mirror-links.test.mjs
```
The test passes only when every relative file the page, its built JS, `sw.js`'s precache list and the manifest icons ask for is present here (`mascot/*.webp` excepted). It includes negative controls.

Then:
- `npm test` (the whole site suite, which includes the Pages closure check);
- open `/app/kaitarako/` once, check that Grown-ups → Licenses and Privacy load, and reload offline (the service worker precaches every file).
