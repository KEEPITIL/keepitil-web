#!/bin/zsh
# One asset drives everything. Drop the owner-approved 1024×1024 PNG at brand/tuitea/source.png,
# then run this script. It writes the web icons and the share card immediately; the iOS AppIcon
# set is written when you pass --ios (that change needs a native build to reach phones).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SITE="$(cd "$HERE/../.." && pwd)"
SRC="$HERE/source.png"
BG="$(python3 -c "import json;print(json.load(open('$HERE/brand.json'))['background'])")"
[ -f "$SRC" ] || { echo "missing $SRC (1024x1024 PNG)"; exit 1; }
w=$(sips -g pixelWidth "$SRC" | awk '/pixelWidth/{print $2}'); h=$(sips -g pixelHeight "$SRC" | awk '/pixelHeight/{print $2}')
[ "$w" = "1024" ] && [ "$h" = "1024" ] || { echo "source must be 1024x1024, got ${w}x${h}"; exit 1; }
# Web icons
sips -z 192 192 "$SRC" --out "$SITE/app/tuitea/icon-192.png" >/dev/null
sips -z 512 512 "$SRC" --out "$SITE/app/tuitea/icon-512.png" >/dev/null
sips -z 180 180 "$SRC" --out "$SITE/app/tuitea/apple-touch-icon.png" >/dev/null
# Share card 1200×630: icon centred on the brand background
sips -z 420 420 "$SRC" --out "$HERE/.share-icon.png" >/dev/null
sips --padToHeightWidth 630 1200 --padColor "$BG" "$HERE/.share-icon.png" --out "$HERE/share.png" >/dev/null
rm -f "$HERE/.share-icon.png"
echo "web icons + share card written"
if [ "${1:-}" = "--ios" ]; then
  ICONS="$SITE/thrive/ios/Runner/Assets.xcassets/AppIcon.appiconset"
  python3 - "$ICONS" "$SRC" <<'PY'
import json, subprocess, sys, os
d, src = sys.argv[1], sys.argv[2]
c = json.load(open(os.path.join(d, 'Contents.json')))
for img in c['images']:
    fn = img.get('filename');
    if not fn: continue
    size = float(img['size'].split('x')[0]); scale = int(img['scale'].rstrip('x')); px = int(round(size*scale))
    subprocess.run(['sips','-z',str(px),str(px),src,'--out',os.path.join(d,fn)], check=True, capture_output=True)
    print('wrote', fn, px)
PY
  echo "iOS AppIcon set written — cut a native build to ship it"
fi
