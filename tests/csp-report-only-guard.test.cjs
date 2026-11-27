// Guards the PROPOSED Content-Security-Policy-Report-Only (docs/cloudflare/csp-report-only.md). Nothing is applied by this repo;
// the test keeps the proposal honest: it must stay report-only, must not weaken script-src, and must cover every third-party
// script host the shipped pages actually load, so enabling it cannot start by reporting a host we already knew about.
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), cp = require("node:child_process");
const ROOT = path.join(__dirname, "..");
const doc = fs.readFileSync(path.join(ROOT, "docs/cloudflare/csp-report-only.md"), "utf8");

function proposed(text) {
  const m = text.match(/```csp\nContent-Security-Policy-Report-Only: ([^\n]+)\n```/);
  return m ? m[1] : null;
}
function parse(policy) { const d = {}; for (const part of policy.split(";")) { const t = part.trim().split(/\s+/); if (t[0]) d[t[0]] = t.slice(1); } return d; }
// the rules the proposal must satisfy; returns a list of problems
function problems(policy) {
  const bad = [], d = parse(policy), s = d["script-src"] || [];
  if (!s.length) bad.push("no script-src");
  if (s.includes("'unsafe-inline'")) bad.push("script-src allows 'unsafe-inline' (the point of the report is to count inline scripts)");
  if (s.includes("'unsafe-eval'")) bad.push("script-src allows 'unsafe-eval'");
  if (s.some((x) => x === "*" || x === "https:" || x === "http:" || x === "data:" || /^https?:\/\/\*/.test(x))) bad.push("script-src has a wildcard / scheme-only source");
  if (!(d["object-src"] || []).includes("'none'")) bad.push("object-src is not 'none'");
  if (!(d["base-uri"] || []).includes("'self'")) bad.push("base-uri is not 'self'");
  if (!(d["default-src"] || []).includes("'self'")) bad.push("default-src is not 'self'");
  return bad;
}

test("the doc carries exactly one proposed header and it is the REPORT-ONLY name, marked not applied", () => {
  const p = proposed(doc);
  assert.ok(p, "csp code block with Content-Security-Policy-Report-Only present");
  assert.match(doc, /NOT APPLIED/);
  assert.equal((doc.match(/^Content-Security-Policy-Report-Only:/gm) || []).length, 1);
  assert.equal(/^Content-Security-Policy: /m.test(doc), false, "no enforcing header is proposed");
});

test("the proposed policy satisfies the safety rules", () => assert.deepEqual(problems(proposed(doc)), []));

test("control: the checker flags weakened policies", () => {
  const good = proposed(doc);
  assert.ok(problems(good.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")).length >= 1);
  assert.ok(problems(good.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'")).length >= 1);
  assert.ok(problems(good.replace("script-src 'self'", "script-src 'self' https:")).length >= 1);
  assert.ok(problems(good.replace("script-src 'self'", "script-src 'self' *")).length >= 1);
  assert.ok(problems(good.replace("script-src 'self'", "script-src 'self' https://*.example.com")).length >= 1);
  assert.ok(problems(good.replace("object-src 'none'", "object-src 'self'")).length >= 1);
  assert.ok(problems(good.replace("base-uri 'self'", "")).length >= 1);
});

test("every third-party script host the site loads is allowed by the proposed script-src", () => {
  const allowed = new Set((parse(proposed(doc))["script-src"] || []).filter((x) => /^https:\/\//.test(x)).map((x) => new URL(x).host));
  const files = cp.execSync('git ls-files "*.html"', { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean).filter((f) => !/^(app|apps|tests?)\//.test(f) && !/node_modules/.test(f));
  assert.ok(files.length > 500, "scan sees the site");
  const seen = new Map();
  for (const f of files) for (const m of fs.readFileSync(path.join(ROOT, f), "utf8").matchAll(/<script[^>]*\ssrc=["'](https:\/\/[^"'\/]+)/gi)) { const h = new URL(m[1]).host; if (/\./.test(h) && !/^your-domain/.test(h)) seen.set(h, f); }
  const missing = [...seen].filter(([h]) => !allowed.has(h)).map(([h, f]) => h + " (" + f + ")");
  assert.deepEqual(missing, []);
  // loaders that build the script URL in JS (analytics): the hosts must be in the policy too
  const js = cp.execSync('git ls-files "*.js" "*.html"', { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => /^(assets\/js|keepitil-[a-z-]+\.js|index\.html)/.test(f) && !/\.min\./.test(f));
  const blob = js.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  for (const h of ["www.googletagmanager.com", "www.clarity.ms", "w.soundcloud.com"]) if (blob.includes(h)) assert.ok(allowed.has(h), h + " is loaded by site code and must be in script-src");
});

test("the repo does not itself ship an enforcing CSP beyond frame-ancestors", () => {
  const h = fs.readFileSync(path.join(ROOT, "_headers"), "utf8");
  for (const line of h.split("\n")) if (/^\s*content-security-policy\s*:/i.test(line)) assert.match(line, /^\s*Content-Security-Policy:\s*frame-ancestors 'self'\s*$/i);
  for (const f of cp.execSync('git ls-files "*.html"', { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => f && !/^(app|apps|tests?)\//.test(f) && !/node_modules/.test(f)).slice(0, 400)) {
    assert.equal(/http-equiv=["']Content-Security-Policy["']/i.test(fs.readFileSync(path.join(ROOT, f), "utf8")), false, f + " has an enforcing meta CSP");
  }
});
