// csp-report collector (supabase/functions/csp-report): sample reports from Chrome / Firefox / Safari shapes, URL stripping, size cap, rate limit, one compact log line.
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const ROOT = path.join(__dirname, "..");
let R; test.before(async () => { R = await import(path.join(ROOT, "supabase/functions/csp-report/report.mjs")); });

const reportUri = (o) => JSON.stringify({ "csp-report": o });
const CHROME = { "document-uri": "https://keepitil.com/profile?slug=groove-trooper&email=a%40b.c#frag", "referrer": "", "violated-directive": "script-src-elem", "effective-directive": "script-src-elem",
  "original-policy": "default-src 'self'; script-src 'self'; report-uri https://x/csp-report", "disposition": "report", "blocked-uri": "https://www.googletagmanager.com/gtag/js?id=G-ZR36NRE4MT", "line-number": 12, "column-number": 3,
  "source-file": "https://keepitil.com/profile?slug=x", "status-code": 200, "script-sample": "secret user text in an inline script" };
function mk(env = {}) {
  const lines = []; let t = 0; const limiter = R.createLimiter(env.max || 30, 60000);
  const deps = { limiter: (k) => limiter(k, env.now ? env.now() : t), hash: (ip) => R.hashIp("salt", ip), log: (l) => lines.push(l) };
  const post = (body, headers = {}, method = "POST") => R.handleReport(new Request("https://x/csp-report", { method, headers: Object.assign({ "content-type": "application/csp-report", "cf-connecting-ip": "203.0.113.7" }, headers), body: method === "POST" ? body : undefined }), deps);
  return { lines, post };
}

test("report-uri (Chrome): 204 and exactly one compact JSON line with query, fragment, script sample and policy removed", async () => {
  const { lines, post } = mk(); const res = await post(reportUri(CHROME));
  assert.equal(res.status, 204); assert.equal(await res.text(), "");
  assert.equal(lines.length, 1);
  const o = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(o).sort(), ["b", "c", "d", "ip", "l", "m", "s", "t", "u"]);
  assert.equal(o.t, "csp"); assert.equal(o.d, "script-src-elem"); assert.equal(o.b, "https://www.googletagmanager.com/gtag/js");
  assert.equal(o.u, "https://keepitil.com/profile"); assert.equal(o.s, "https://keepitil.com/profile"); assert.equal(o.l, 12); assert.equal(o.c, 3); assert.equal(o.m, "report");
  assert.match(o.ip, /^[0-9a-f]{8}$/);
  for (const bad of ["?", "#", "slug", "email", "groove", "secret", "default-src", "203.0.113.7", "G-ZR36"]) assert.equal(lines[0].includes(bad), false, "log line must not contain " + bad);
  assert.ok(lines[0].length < 400);
});

test("report-uri with keyword blocked-uri (inline / eval) and a data: / blob: / extension blocked-uri keeps only the scheme or keyword", async () => {
  const { lines, post } = mk();
  for (const b of ["inline", "eval", "data:image/png;base64,AAAAsecret", "blob:https://keepitil.com/uuid-1234", "chrome-extension://abcdef/content.js", "javascript:alert(document.cookie)"])
    await post(reportUri(Object.assign({}, CHROME, { "blocked-uri": b })));
  assert.deepEqual(lines.map((l) => JSON.parse(l).b), ["inline", "eval", "data", "blob", "chrome-extension", "javascript"]);
  assert.equal(lines.join("").includes("secret"), false);
});

test("Reporting API (application/reports+json): array of csp-violation entries; other report types ignored; camelCase fields", async () => {
  const { lines, post } = mk(); const body = JSON.stringify([
    { type: "csp-violation", age: 5, url: "https://keepitil.com/event?e=my-private-slug", user_agent: "UA", body: { documentURL: "https://keepitil.com/event?e=my-private-slug#x", blockedURL: "inline", effectiveDirective: "script-src-elem", sourceFile: "https://keepitil.com/event?e=a", lineNumber: 40, columnNumber: 7, disposition: "report", sample: "abc" } },
    { type: "deprecation", url: "https://keepitil.com/", body: { id: "x" } },
    { type: "csp-violation", url: "https://keepitil.com/", body: { effectiveDirective: "img-src", blockedURL: "https://tracker.example/p.gif?uid=42" } }]);
  const res = await post(body, { "content-type": "application/reports+json" });
  assert.equal(res.status, 204); assert.equal(lines.length, 2);
  const [a, b] = lines.map((l) => JSON.parse(l));
  assert.equal(a.d, "script-src-elem"); assert.equal(a.u, "https://keepitil.com/event"); assert.equal(a.b, "inline"); assert.equal(a.l, 40);
  assert.equal(b.d, "img-src"); assert.equal(b.b, "https://tracker.example/p.gif"); assert.equal(b.u, "https://keepitil.com/");
  assert.equal(lines.join("").includes("private-slug"), false); assert.equal(lines.join("").includes("uid"), false);
});

test("content types: charset parameter accepted; anything else 415; non-POST 405 with Allow", async () => {
  const { lines, post } = mk();
  assert.equal((await post(reportUri(CHROME), { "content-type": "application/csp-report; charset=utf-8" })).status, 204);
  for (const ct of ["application/json", "text/plain", "", "application/csp-report+json"]) assert.equal((await post(reportUri(CHROME), { "content-type": ct })).status, 415, ct || "(none)");
  const g = await post(undefined, {}, "GET"); assert.equal(g.status, 405); assert.equal(g.headers.get("allow"), "POST");
  assert.equal((await post(undefined, {}, "PUT")).status, 405);
  assert.equal(lines.length, 1);
});

test("size cap: over 8 KB is 413 by Content-Length and by streamed bytes with no Content-Length; exactly at the cap is read", async () => {
  const { lines, post } = mk();
  assert.equal(R.MAX_BODY_BYTES, 8192);
  const big = reportUri(Object.assign({}, CHROME, { "script-sample": "x".repeat(9000) }));
  assert.equal((await post(big)).status, 413);
  assert.equal((await post(big, { "content-length": "9000" })).status, 413);
  const stream = new ReadableStream({ start(c) { const enc = new TextEncoder(); for (let i = 0; i < 20; i++) c.enqueue(enc.encode("x".repeat(1000))); c.close(); } });
  const res = await R.handleReport(new Request("https://x/csp-report", { method: "POST", headers: { "content-type": "application/csp-report" }, body: stream, duplex: "half" }),
    { limiter: () => true, hash: async () => "h", log: (l) => lines.push(l) });
  assert.equal(res.status, 413); assert.equal(lines.length, 0, "nothing logged for an oversize body");
  const pad = 8192 - reportUri({ "document-uri": "https://keepitil.com/", "violated-directive": "img-src", "x": "" }).length;
  const exact = reportUri({ "document-uri": "https://keepitil.com/", "violated-directive": "img-src", "x": "y".repeat(pad) });
  assert.equal(new TextEncoder().encode(exact).length, 8192);
  assert.equal((await post(exact)).status, 204);
});

test("malformed / empty / non-violation bodies: 400 for bad JSON, 204 and no log for a report with nothing usable", async () => {
  const { lines, post } = mk();
  assert.equal((await post("{not json")).status, 400); assert.equal((await post("")).status, 400);
  assert.equal((await post(JSON.stringify({ "csp-report": "nope" }))).status, 204);
  assert.equal((await post(JSON.stringify({ other: 1 }))).status, 204);
  assert.equal((await post("[]")).status, 204);
  assert.equal(lines.length, 0);
});

test("a reports+json request logs at most 10 violations", async () => {
  const { lines, post } = mk(); const arr = []; for (let i = 0; i < 30; i++) arr.push({ type: "csp-violation", url: "https://keepitil.com/", body: { effectiveDirective: "img-src", blockedURL: "https://a.example/" + i } });
  assert.equal((await post(JSON.stringify(arr), { "content-type": "application/reports+json" })).status, 204);
  assert.equal(lines.length, 10);
});

test("rate limit: 30 requests per minute per hashed address, then 429; another address and the next window are unaffected", async () => {
  let now = 1000; const { lines, post } = mk({ now: () => now });
  for (let i = 0; i < 30; i++) assert.equal((await post(reportUri(CHROME))).status, 204, "request " + i);
  assert.equal((await post(reportUri(CHROME))).status, 429); assert.equal(lines.length, 30);
  assert.equal((await post(reportUri(CHROME), { "cf-connecting-ip": "198.51.100.9" })).status, 204);
  now += 61000; assert.equal((await post(reportUri(CHROME))).status, 204);
});

test("client address: only a salted hash ever reaches the log; x-forwarded-for is the fallback; the hash depends on the salt", async () => {
  const { lines, post } = mk();
  await post(reportUri(CHROME), { "cf-connecting-ip": "", "x-forwarded-for": "198.51.100.77, 10.0.0.1" });
  assert.equal(lines[0].includes("198.51.100.77"), false);
  const a = await R.hashIp("s1", "198.51.100.77"), b = await R.hashIp("s2", "198.51.100.77"), c = await R.hashIp("s1", "198.51.100.77");
  assert.equal(a, c); assert.notEqual(a, b); assert.match(a, /^[0-9a-f]{16}$/);
  assert.equal(R.clientIp((n) => ({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" })[n] || null), "1.2.3.4"); assert.equal(R.clientIp(() => null), "unknown");
});

test("cleanUrl: userinfo, port query and fragment tricks, junk and over-long values", () => {
  assert.equal(R.cleanUrl("https://user:pass@keepitil.com:8443/a/b?x=1#y"), "https://keepitil.com:8443/a/b");
  assert.equal(R.cleanUrl("https://keepitil.com/a b\u0007c"), "https://keepitil.com/a%20b%07c");
  assert.equal(R.cleanUrl("not a url"), ""); assert.equal(R.cleanUrl(42), ""); assert.equal(R.cleanUrl(""), ""); assert.equal(R.cleanUrl(null), "");
  assert.ok(R.cleanUrl("https://keepitil.com/" + "a".repeat(5000)).length <= 200);
  assert.equal(R.cleanUrl("self"), "self"); assert.equal(R.cleanUrl("INLINE"), "inline");
});

test("directive names are validated; a report with only junk fields is dropped", () => {
  assert.equal(R.normalize({ "violated-directive": "script-src 'self'; evil" }), null);
  assert.equal(R.normalize({ "effective-directive": "img-src" }).d, "img-src");
  assert.equal(R.normalize("x"), null); assert.equal(R.normalize([]), null); assert.equal(R.normalize(null), null);
});

test("index.ts is a thin Deno.serve over report.mjs: no secrets, no database, no network calls, no verify-jwt dependency", () => {
  const src = fs.readFileSync(path.join(ROOT, "supabase/functions/csp-report/index.ts"), "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.match(src, /Deno\.serve\(/); assert.match(src, /from '\.\/report\.mjs'/);
  assert.doesNotMatch(src, /createClient|SERVICE_ROLE|Deno\.env|fetch\(|\.from\(|\.rpc\(|localStorage|cookie/i);
  const rep = fs.readFileSync(path.join(ROOT, "supabase/functions/csp-report/report.mjs"), "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(rep, /createClient|SERVICE_ROLE|Deno\.|fetch\(|\.rpc\(|document\.cookie|eval\(|new Function/);
});
