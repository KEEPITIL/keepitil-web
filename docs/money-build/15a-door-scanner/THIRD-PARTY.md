# Third-party code in the door scanner

| component | version | licence | where | how used |
|---|---|---|---|---|
| jsQR (npm `jsqr`, https://github.com/cozmo/jsQR) | 1.4.0, published 2021-04-24 | Apache-2.0 | `assets/js/vendor/jsqr/jsQR.js` (+ `LICENSE`, `README.md`) | QR decoding fallback for browsers without `BarcodeDetector` (iPhone Safari). Lazy, same-origin, unmodified. |
| QR Code Generator for JavaScript (Kazuhiko Arase) | already in the repo before 15B | MIT | `assets/js/vendor/qrcode.js` | Used by the ticket pages to draw ticket QR codes; 15B tests also use it, read-only, to GENERATE QR images for the decode tests. Not added or changed by 15B. |
| supabase-js | already in the repo before 15B | MIT | `assets/js/vendor/supabase-js.min.js` | session + auth (unchanged). |

jsQR provenance: `npm pack jsqr@1.4.0` in a scratch directory outside the repository; tarball SHA-1 `8efb8d0a7cc6863cb6d95116b9069123ce9eb2d1` and SHA-512 integrity `sha512-dxLob7q65Xg2DvstYkRpkYtmKm2sPJ9oFhrhmudT1dZvNFFTlroai3AWSpLey/w5vMcLBXRgOJsbXpdN9HzU/A==` matched the registry; `package/dist/jsQR.js` (256885 bytes, SHA-256 `bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859`) and `package/LICENSE` (SHA-256 `c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08`) copied byte for byte. The package ships no NOTICE file. No `package.json` dependency was added (the repo vendors browser libraries under `assets/js/vendor/`; jsdom stays the only devDependency). No CDN, no runtime download.

Apache-2.0 obligations met: licence text shipped next to the file, no modifications, attribution here and in the vendor README.
