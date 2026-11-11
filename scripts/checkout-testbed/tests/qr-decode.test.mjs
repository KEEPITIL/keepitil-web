/* qr-decode.test.mjs - node --test: d2 decoder is present, checksum-pinned, really decodes, and FAILS on missing/altered decoder, corrupted QR, wrong token. No DB. NC = negative control. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadJsQR, JSQR_PATH, JSQR_SHA256, bitmap, decodeBitmap, assertDecodes } from "../lib/qr-decode.mjs";
const require = createRequire(import.meta.url);
const REPO = join(import.meta.dirname, "..", "..", "..");
const qrcode = require(join(REPO, "assets/js/vendor/qrcode.js")), KQ = require(join(REPO, "assets/js/kil-ticket-qr.js"));
const mk = (p) => { const c = qrcode(0, "M"); c.addData(p); c.make(); return c; };
const tok = "0123456789abcdef0123456789abcdef", other = "fedcba9876543210fedcba9876543210";

test("vendored jsQR is present with the pinned sha256 and a licence", () => { const jsQR = loadJsQR(); assert.equal(typeof jsQR, "function"); assert.match(readFileSync(join(JSQR_PATH, "..", "LICENSE"), "utf8"), /Apache License/); });
test("decodes /tickets form KIL-<token> and /profile form raw token, exactly", () => {
  const jsQR = loadJsQR();
  assert.equal(assertDecodes(jsQR, mk(KQ.payload(tok, { prefix: true })), "KIL-" + tok), "KIL-" + tok);
  assert.equal(assertDecodes(jsQR, mk(KQ.payload(tok)), tok), tok);
});
test("NC: decoder missing -> throws (d2 cannot silently skip)", () => { assert.throws(() => loadJsQR(join(tmpdir(), "no-such-dir", "jsQR.js")), /missing/); });
test("NC: altered decoder bytes -> sha256 mismatch throws", () => { const d = mkdtempSync(join(tmpdir(), "jsqr-")), p = join(d, "jsQR.js"); writeFileSync(p, readFileSync(JSQR_PATH, "utf8") + "\n//x"); assert.throws(() => loadJsQR(p, JSQR_SHA256), /sha256 mismatch/); });
test("NC: decoder pointed at a different token -> assertion fails", () => { const jsQR = loadJsQR(); assert.throws(() => assertDecodes(jsQR, mk(KQ.payload(other, { prefix: true })), "KIL-" + tok), /decode mismatch/); assert.throws(() => assertDecodes(jsQR, mk(KQ.payload(other)), tok), /decode mismatch/); });
test("NC: corrupted QR input -> decodes to nothing / not the payload", () => {
  const jsQR = loadJsQR(), b = bitmap(mk(KQ.payload(tok, { prefix: true }))); assert.equal(decodeBitmap(jsQR, b), "KIL-" + tok);
  const blank = { px: new Uint8ClampedArray(b.px).fill(255), W: b.W }; assert.equal(decodeBitmap(jsQR, blank), undefined);
  const half = { px: new Uint8ClampedArray(b.px), W: b.W }; for (let i = 0; i < half.px.length / 2; i += 4) half.px[i] = half.px[i + 1] = half.px[i + 2] = 255;
  assert.notEqual(decodeBitmap(jsQR, half), "KIL-" + tok);
});
