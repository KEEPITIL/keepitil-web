# jsQR 1.4.0 (vendored, unmodified) - checkout testbed copy

Used ONLY by testbed step d2 (and tests/qr-decode.test.mjs) to decode the self-rendered ticket QRs. Same bytes as PR 142 (15B) `assets/js/vendor/jsqr/`; vendored here so the testbed is self-contained and d2 never has to skip.

| | |
|---|---|
| package | `jsqr` (npm) by Cosmo Wolfe, version 1.4.0 (exact), licence Apache-2.0 (`LICENSE`, unmodified) |
| source | https://github.com/cozmo/jsQR (npm tarball integrity sha512-dxLob7q65Xg2DvstYkRpkYtmKm2sPJ9oFhrhmudT1dZvNFFTlroai3AWSpLey/w5vMcLBXRgOJsbXpdN9HzU/A==) |
| file | `package/dist/jsQR.js`, byte for byte, 256885 bytes |

SHA-256 of jsQR.js: bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859
SHA-256 of LICENSE: c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08

`lib/qr-decode.mjs` refuses to run (d2 FAILS) if the file is missing or its SHA-256 differs from the value above.
