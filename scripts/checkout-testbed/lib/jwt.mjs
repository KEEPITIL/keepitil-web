/* jwt.mjs - tiny HS256 JWT for the LOCAL auth shim (fake secret generated at runtime; never committed). */
import { createHmac, timingSafeEqual } from "node:crypto";
const b64 = (b) => Buffer.from(b).toString("base64url");
export function signJwt(claims, secret) {
  const h = b64(JSON.stringify({ alg: "HS256", typ: "JWT" })), p = b64(JSON.stringify(claims));
  return `${h}.${p}.${createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url")}`;
}
export function verifyJwt(token, secret) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const want = createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest();
  let got; try { got = Buffer.from(parts[2], "base64url"); } catch { return null; }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  let c; try { c = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")); } catch { return null; }
  if (c.exp && Date.now() / 1000 > c.exp) return null;
  return c;
}
