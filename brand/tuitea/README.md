# TUITEA brand kit

One source asset drives the app icon, the invite page, the share preview, the install page and
the web manifest icons.

- `source.png` — 1024×1024, square, no transparency. **Currently the placeholder "T" icon**,
  upscaled from the shipped web icon. Replace it with the owner-approved artwork.
- `brand.json` — name and background colour used behind the share card.
- `build-brand.sh` — writes `app/tuitea/icon-192.png`, `icon-512.png`, `apple-touch-icon.png`
  and `brand/tuitea/share.png` (1200×630, used as `og:image` on `/join/`). With `--ios` it also
  writes every size in `thrive/ios/Runner/Assets.xcassets/AppIcon.appiconset/` from
  `Contents.json`; that change reaches phones only through a native build.

The one remaining design decision is the owner's: approve final artwork, drop it in as
`source.png`, run `./build-brand.sh --ios`, and cut a native build. Nothing here invents or
approves a mark on the owner's behalf.
