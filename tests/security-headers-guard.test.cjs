// Guards the proposed Permissions-Policy (docs/cloudflare/security-headers.md): it turns off geolocation, camera/microphone,
// payment, usb, serial and bluetooth for every page outside app/ and apps/. This test fails if shipped site code starts using them.
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), cp = require("node:child_process");
const ROOT = path.join(__dirname, "..");
const files = cp.execSync('git ls-files "*.html" "*.js" "*.mjs"', { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean)
  .filter((f) => !/^(app|apps)\//.test(f) && !/(^|\/)(tests?|node_modules)\//.test(f) && !/\.test\.(c|m)?js$/.test(f) && !/\.min\.js$/.test(f) && !/^games\/[^/]+\/play\//.test(f) && !/^assets\/js\/vendor\//.test(f));
const BANNED = [/navigator\.geolocation/, /getUserMedia\s*\(/, /new\s+PaymentRequest\s*\(/, /navigator\.usb\b/, /navigator\.serial\b/, /navigator\.bluetooth\b/];
test("shipped site code does not use features the proposed Permissions-Policy denies", () => {
  const hits = [];
  for (const f of files) { const t = fs.readFileSync(path.join(ROOT, f), "utf8"); for (const re of BANNED) if (re.test(t)) hits.push(f + " :: " + re); }
  assert.deepEqual(hits, []);
});
test("the scan sees the site (not an empty list)", () => assert.ok(files.length > 100 && files.includes("index.html")));
test("control: the scanner flags each banned pattern", () => {
  for (const s of ["navigator.geolocation.getCurrentPosition(f)", "navigator.mediaDevices.getUserMedia({video:true})", "new PaymentRequest(a,b)", "navigator.usb.requestDevice()", "navigator.serial.requestPort()", "navigator.bluetooth.requestDevice()"])
    assert.ok(BANNED.some((re) => re.test(s)), s);
});
test("proposal doc says NOT APPLIED and excludes the app builds", () => {
  const d = fs.readFileSync(path.join(ROOT, "docs/cloudflare/security-headers.md"), "utf8");
  assert.match(d, /NOT APPLIED/); assert.match(d, /not starts_with\(http\.request\.uri\.path, "\/app\/"\)/); assert.match(d, /nosniff/);
});
