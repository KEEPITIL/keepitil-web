import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const root = new URL("..", import.meta.url);
const indexHtml = readFileSync(new URL("app/tuitea/index.html", root), "utf8");
const notFoundHtml = readFileSync(new URL("404.html", root), "utf8");
const manifest = JSON.parse(readFileSync(new URL("app/tuitea/manifest.webmanifest", root), "utf8"));
const appHtml = readFileSync(new URL("app/tuitea/app/index.html", root), "utf8");

let failed = 0;
function check(name, cond) {
  if (!cond) {
    failed++;
    console.error("FAIL", name);
  } else {
    console.log("ok", name);
  }
}

function grab(src, label) {
  const start = src.indexOf("function tuiteaRedirectTarget(search, hash) {");
  const end = src.indexOf("/* end tuiteaRedirectTarget */");
  if (start < 0 || end < start) throw new Error("missing redirect function in " + label);
  return src.slice(start, end);
}

function normalize(fn) {
  return fn.split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
}
const fromPage = normalize(grab(indexHtml, "page"));
const from404 = normalize(grab(notFoundHtml, "404"));
check("page and 404 use the same redirect function", fromPage === from404);

const tuiteaRedirectTarget = new Function(fromPage + "\nreturn tuiteaRedirectTarget;")();

const TOKEN = "0123456789abcdef0123456789abcdef";
const TOKEN_UPPER = "0123456789ABCDEF0123456789ABCDEF";

check("valid invite", tuiteaRedirectTarget("?invite=" + TOKEN, "") === "/app/tuitea/app/?invite=" + TOKEN);
check(
  "uppercase invite is forwarded lowercase",
  tuiteaRedirectTarget("?invite=" + TOKEN_UPPER, "") === "/app/tuitea/app/?invite=" + TOKEN
);
check(
  "token_hash and type pass through unchanged",
  tuiteaRedirectTarget("?token_hash=ab%2Bcd&type=signup", "") ===
    "/app/tuitea/app/?token_hash=ab%2Bcd&type=signup"
);
check(
  "hash access_token and refresh_token pass through unchanged",
  tuiteaRedirectTarget("", "#access_token=aaa.bbb&refresh_token=ccc-ddd&type=recovery") ===
    "/app/tuitea/app/#access_token=aaa.bbb&refresh_token=ccc-ddd&type=recovery"
);
check(
  "invite plus auth query plus hash",
  tuiteaRedirectTarget("?invite=" + TOKEN + "&token_hash=abc&type=recovery", "#access_token=aaa&refresh_token=bbb") ===
    "/app/tuitea/app/?invite=" + TOKEN + "&token_hash=abc&type=recovery#access_token=aaa&refresh_token=bbb"
);

const invalidInvites = [
  "short",
  "0123456789abcdef0123456789abcde",
  "0123456789abcdef0123456789abcdef0",
  "0123456789abcdef0123456789abcdeg",
  "",
  "//evil.com",
  "%2F%2Fevil.com",
  "..%2F..%2Fevil",
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\\evil",
  "%5C%5Cevil.com",
  "0123456789abcdef0123456789abcdef ",
];
for (const bad of invalidInvites) {
  const dest = tuiteaRedirectTarget("?invite=" + bad + "&token_hash=abc&type=email", "#access_token=aaa&refresh_token=bbb");
  const url = new URL(dest, "https://keepitil.com");
  const ok =
    url.origin === "https://keepitil.com" &&
    url.pathname === "/app/tuitea/app/" &&
    !url.searchParams.has("invite") &&
    url.searchParams.get("token_hash") === "abc" &&
    url.searchParams.get("type") === "email" &&
    url.hash === "#access_token=aaa&refresh_token=bbb";
  check("invalid invite " + JSON.stringify(bad), ok);
}

function staysOnApp(search, hash, label) {
  const dest = tuiteaRedirectTarget(search, hash);
  const url = new URL(dest, "https://keepitil.com");
  const path = dest.split("?")[0].split("#")[0];
  check(
    label,
    path === "/app/tuitea/app/" &&
      !path.includes("\\") &&
      dest.charAt(0) === "/" &&
      dest.slice(0, 2) !== "//" &&
      url.origin === "https://keepitil.com" &&
      url.pathname === "/app/tuitea/app/" &&
      url.pathname.startsWith(manifest.scope) &&
      url.pathname !== "/app/tuitea/" &&
      url.pathname !== "/apps/tuitea/"
  );
}
staysOnApp("?invite=//evil.com", "", "open redirect invite //evil");
staysOnApp("?invite=%2F%2Fevil.com", "", "open redirect invite %2F");
staysOnApp("?invite=%5C%5Cevil.com", "", "open redirect invite backslash");
staysOnApp("?next=//evil.com", "#//evil.com", "query and hash //evil stay on the app path");
staysOnApp("?next=%2F%2Fevil.com", "", "query %2F stays on the app path");
staysOnApp("", "#access_token=aaa\\bbb", "hash backslash is not a new host");

check("manifest id", manifest.id === "/app/tuitea/");
check("manifest scope", manifest.scope === "/app/tuitea/");
check("manifest start_url", manifest.start_url === "/app/tuitea/app/");
check(
  "redirect target is the start_url and inside scope",
  tuiteaRedirectTarget("", "").replace(/[?#].*$/, "") === manifest.start_url &&
    manifest.start_url.startsWith(manifest.scope)
);
check("start_url document is the compiled app", appHtml.includes('base href="/app/tuitea/app/"') && appHtml.includes("main.dart.js"));
check("start_url document is not this redirect", !appHtml.includes("tuiteaRedirectTarget"));

check("referrer", indexHtml.includes('<meta name="referrer" content="no-referrer">'));
check("absolute canonical", indexHtml.includes('<link rel="canonical" href="https://keepitil.com/app/tuitea/app/">'));
check("meta refresh is the fixed app path", indexHtml.includes('content="0; url=/app/tuitea/app/"'));
check("noindex", indexHtml.includes('content="noindex"'));
check("fallback link", indexHtml.includes('href="/app/tuitea/app/"') && indexHtml.includes("Continue to TUITEA"));
check("owner exception comment", indexHtml.includes("owner: no redirects") && indexHtml.includes("Joe"));
check(
  "page loads no shell or analytics",
  !/keepitil-shell|googletagmanager|clarity\.ms|pwa\.js|gtag/.test(indexHtml)
);
check("one location.replace on the page", (indexHtml.match(/location\.replace/g) || []).length === 1);
check("404 sends no referrer", notFoundHtml.includes('<meta name="referrer" content="no-referrer"/>'));

check(
  "known auth keys pass through and unknown keys are dropped",
  tuiteaRedirectTarget(
    "?next=//evil.com&code=pkce123&error=access_denied&error_code=otp_expired&error_description=bad+link&redirect=https://evil.com&token_hash=ab%2Bcd&type=signup",
    "#access_token=aaa&refresh_token=bbb"
  ) ===
    "/app/tuitea/app/?code=pkce123&error=access_denied&error_code=otp_expired&error_description=bad+link&token_hash=ab%2Bcd&type=signup#access_token=aaa&refresh_token=bbb"
);
check(
  "safe utm is kept and unsafe utm is dropped",
  tuiteaRedirectTarget("?utm_source=newsletter&utm_medium=%2F%2Fevil.com&utm_campaign=spring-sale&utm_content=a\\b&utm_term=family+app", "") ===
    "/app/tuitea/app/?utm_source=newsletter&utm_campaign=spring-sale&utm_term=family+app"
);

const router = notFoundHtml.match(/<script>([\s\S]*?)<\/script>/)[1];
function route(protocol, pathname, search, hash) {
  let replaced = null;
  const location = { protocol, pathname, search, hash, replace(url) { replaced = url; } };
  const session = new Map();
  const sessionStorage = {
    getItem(k) { return session.has(k) ? session.get(k) : null; },
    setItem(k, v) { session.set(k, String(v)); },
    removeItem(k) { session.delete(k); },
  };
  const document = { documentElement: { setAttribute() {}, getAttribute() { return null; } } };
  new Function("location", "sessionStorage", "document", router)(location, sessionStorage, document);
  return replaced;
}

check(
  "404 forwards a valid invite",
  route("https:", "/app/tuitea/missing", "?invite=" + TOKEN, "#h") === "/app/tuitea/app/?invite=" + TOKEN + "#h"
);
check(
  "404 forwards token_hash and hash access_token",
  route("https:", "/app/tuitea/nope", "?token_hash=abc&type=signup", "#access_token=aaa&refresh_token=bbb") ===
    "/app/tuitea/app/?token_hash=abc&type=signup#access_token=aaa&refresh_token=bbb"
);
check(
  "404 drops an invalid invite and keeps auth params",
  route("https:", "/app/tuitea/%2F%2Fevil.com", "?invite=//evil.com&type=recovery", "#access_token=aaa&refresh_token=bbb") ===
    "/app/tuitea/app/?type=recovery#access_token=aaa&refresh_token=bbb"
);
check(
  "404 backslash path does not leave the app",
  route("https:", "/app/tuitea/%5C%5Cevil.com", "?invite=%5Cevil", "") === "/app/tuitea/app/"
);
check(
  "404 drops unknown keys and unsafe utm",
  route("https:", "/app/tuitea/missing", "?next=//evil.com&utm_source=//evil.com&code=abc&type=signup", "#access_token=aaa") ===
    "/app/tuitea/app/?code=abc&type=signup#access_token=aaa"
);

const same = [
  ["https:", "/culture", "", "", "/culture/"],
  ["https:", "/games/", "", "", "/games/"],
  ["https:", "/apply", "?x=1", "#a", "/apply.html?x=1#a"],
  ["https:", "/nope", "", "", null],
  ["https:", "/app/other", "", "", null],
  ["https:", "/apps/tuitea/nope", "?invite=" + TOKEN, "#h", null],
  ["https:", "/blog/old", "", "", null],
  ["https:", "/culture/feed", "?p=2", "", "/culture/?p=2"],
  ["https:", "/culture/radio", "", "", null],
  ["https:", "/tickets", "", "#x", "/tickets.html#x"],
  ["file:", "/tmp/index.html", "", "", null],
  ["capacitor:", "/app/tuitea/missing", "?invite=" + TOKEN, "", "index.html"],
];
for (const [protocol, pathname, search, hash, expect] of same) {
  check("unrelated " + pathname + " (" + protocol + ")", route(protocol, pathname, search, hash) === expect);
}

const main404 = execSync("git show main:404.html", { cwd: new URL(".", root), encoding: "utf8" });
const mainRouter = main404.match(/<script>([\s\S]*?)<\/script>/)[1];
function routeMain(protocol, pathname, search, hash) {
  let replaced = null;
  const location = { protocol, pathname, search, hash, replace(url) { replaced = url; } };
  const session = new Map();
  const sessionStorage = {
    getItem(k) { return session.has(k) ? session.get(k) : null; },
    setItem(k, v) { session.set(k, String(v)); },
    removeItem(k) { session.delete(k); },
  };
  const document = { documentElement: { setAttribute() {}, getAttribute() { return null; } } };
  new Function("location", "sessionStorage", "document", mainRouter)(location, sessionStorage, document);
  return replaced;
}
for (const [protocol, pathname, search, hash, expect] of same) {
  if (pathname.includes("/app/tuitea")) continue;
  const live = route(protocol, pathname, search, hash);
  const old = routeMain(protocol, pathname, search, hash);
  check("matches main " + pathname, live === old && live === expect);
}

const guarded = execSync(
  "git diff --stat HEAD -- app/tuitea/app app/tuitea/release.json app/tuitea/sw.js app/tuitea/pwa.js app/tuitea/manifest.webmanifest",
  { cwd: new URL(".", root), encoding: "utf8" }
);
check("path guard and manifest untouched", guarded.trim() === "");

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("all node checks passed");
