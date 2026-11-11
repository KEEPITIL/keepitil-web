# jsQR (vendored, unmodified)

Used by `/door.html` (via `assets/js/kil-door-scanner.js`) ONLY when the browser has no `BarcodeDetector` that reads `qr_code` (iPhone Safari today). It is loaded lazily, same-origin, when the owner taps Start camera on that path. Nothing is fetched from a CDN.

| | |
|---|---|
| package | `jsqr` (npm), by Cosmo Wolfe |
| version | **1.4.0** (exact; no range) |
| licence | **Apache-2.0** (full text in `LICENSE`, copied unmodified from the package) |
| source | https://github.com/cozmo/jsQR |
| npm tarball | https://registry.npmjs.org/jsqr/-/jsqr-1.4.0.tgz |
| published | 2021-04-24 (npm `time["1.4.0"]` = 2021-04-24T03:17:20.646Z; well over 14 days old) |
| tarball integrity (npm `dist.integrity`) | `sha512-dxLob7q65Xg2DvstYkRpkYtmKm2sPJ9oFhrhmudT1dZvNFFTlroai3AWSpLey/w5vMcLBXRgOJsbXpdN9HzU/A==` |
| tarball shasum (npm `dist.shasum`) | `8efb8d0a7cc6863cb6d95116b9069123ce9eb2d1` |
| file copied | `package/dist/jsQR.js` (the package's single-file UMD build), byte for byte, 256885 bytes |

SHA-256 of jsQR.js: bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859
SHA-256 of LICENSE: c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08

How it was obtained: `npm pack jsqr@1.4.0` in a scratch directory outside the repository (no install, no scripts); the tarball's SHA-1 and SHA-512 were compared with the registry's `dist.shasum` / `dist.integrity` above (both matched); the two files were extracted and copied here with `cp`, then compared with `cmp`.

Do not edit `jsQR.js`. `assets/js/door-scanner-qr.test.mjs` recomputes its SHA-256 and fails on any change (it also keeps a second copy of the hash, so editing this README alone does not pass). To upgrade: repeat the steps for the new exact version, replace both files and this table, and update the pin in the test.

The decoder runs on the page's main thread, reads only pixels from a canvas the scanner creates, and has no network, storage or DOM access (a test greps the file for that). It defines `window.jsQR` (classic script, not an ES module, so there is no `.mjs` MIME concern for it).
