// The competition flyers on /create/ and /earn/ were 350-460 KB each (1000x1500 JPEG at near-max
// quality) and render at most ~380px wide, so the earn page pulled ~2.4 MB of flyers.
// Budget: <= 220 KB and <= 600x900 each. Run: node --test tests/flyer-image-weight.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const DIR = path.join(process.env.FLYER_ROOT || path.resolve(__dirname, ".."), "create", "flyers");
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error("no SOF marker");
}
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".jpg"));
test("there are flyers to check", () => assert.ok(files.length >= 7));
for (const f of files) {
  test(f + " within weight and size budget", () => {
    const buf = fs.readFileSync(path.join(DIR, f));
    assert.ok(buf.length <= 220 * 1024, f + " is " + Math.round(buf.length / 1024) + " KB (budget 220)");
    const { w, h } = jpegSize(buf);
    assert.ok(w <= 600 && h <= 900, f + " is " + w + "x" + h + " (budget 600x900)");
    assert.ok(h / w > 1.4 && h / w < 1.6, f + " lost its 2:3 ratio");
  });
}
