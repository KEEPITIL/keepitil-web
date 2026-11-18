/* qr-decode.mjs - d2 helper: render a payload with the repo qrcode.js and DECODE it with the vendored jsQR. Never skips: a missing or altered decoder is an error. */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
export const JSQR_PATH = join(HERE, "..", "vendor", "jsqr", "jsQR.js");
export const JSQR_SHA256 = "bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859";
const require = createRequire(import.meta.url);
export function loadJsQR(path = JSQR_PATH, sha = JSQR_SHA256) {
  if (!existsSync(path)) throw new Error("jsQR decoder missing at " + path + " (d2 must not skip)");
  const got = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (got !== sha) throw new Error("jsQR sha256 mismatch: expected " + sha + " got " + got);
  return require(path);
}
/* c: object returned by qrcode(0,"M") after addData+make. Returns an RGBA bitmap (black modules on white, 4-module quiet zone). */
export function bitmap(c, cell = 6, qz = 4) {
  const n = c.getModuleCount(), W = (n + 2 * qz) * cell, px = new Uint8ClampedArray(W * W * 4).fill(255);
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (c.isDark(r, k)) for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) { const i = (((r + qz) * cell + y) * W + (k + qz) * cell + x) * 4; px[i] = px[i + 1] = px[i + 2] = 0; }
  return { px, W };
}
export function decodeBitmap(jsQR, { px, W }) { return jsQR(px, W, W)?.data; }
export function decodeQr(jsQR, c) { return decodeBitmap(jsQR, bitmap(c)); }
/* hard assertion: decoded text must equal the expected payload exactly */
export function assertDecodes(jsQR, c, expected) { const got = decodeQr(jsQR, c); if (got !== expected) throw new Error(`QR decode mismatch: expected ${JSON.stringify(expected)} got ${JSON.stringify(got)}`); return got; }
