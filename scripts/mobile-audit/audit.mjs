#!/usr/bin/env node
/* mobile-audit/audit.mjs - ONE page at a time, headless Chrome over CDP, mobile emulation, local static server on 127.0.0.1 (no network, no prod).
   Usage: node scripts/mobile-audit/audit.mjs [--pages /,/connect/,/earn/,/create/,/culture/,/shop/,/apps/] [--widths 360,390,430] [--out DIR]
   For each page x width it reports (JSON + a table):
     tap     visible links/buttons/inputs on the FIRST screen shorter or narrower than 44px
     text    visible text elements on the first screen with computed font-size < 11px (tiny text)
     hscroll document wider than the viewport (horizontal overflow)
     lock    html/body overflow lock left behind (overflow hidden on the scrolling element) and touch-action:none on any visible element
     drag    real touch-drag gestures (Input.synthesizeScrollGesture, 300 px) started on up to 12 different elements (cards, chips, carousels, images, banners, embeds): scrollY must move >= 200 px
     overlay the Black Friday modal (#kil-bf) and the PWA banner (#kil-pwa-banner) are never visible at the same time
   Load discipline: it refuses to start when the 1-min load is >= 6 (override with --max-load N, never above 8), runs ONE Chrome at a time, and always kills it. Exit 1 on any failure. */
import { spawn, execSync } from "node:child_process";
import http from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { tmpdir, loadavg } from "node:os";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = resolve(arg("--root", process.cwd()));
const PAGES = arg("--pages", "/,/connect/,/earn/,/create/,/culture/,/shop/,/apps/").split(",");
const WIDTHS = arg("--widths", "360,390,430").split(",").map(Number);
const OUT = arg("--out", join(tmpdir(), "kil-mobile-audit")); mkdirSync(OUT, { recursive: true });
const MAXLOAD = Math.min(8, Number(arg("--max-load", 6)));
const CHROME = process.env.KIL_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (loadavg()[0] >= MAXLOAD) { console.error(`ABORT: 1-min load ${loadavg()[0].toFixed(1)} >= ${MAXLOAD}`); process.exit(9); }

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp", ".woff2": "font/woff2", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
  let f = join(ROOT, p); if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (!existsSync(f) && existsSync(f + ".html")) f += ".html";
  if (!existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200, { "content-type": MIME[extname(f)] || "application/octet-stream" }); res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const port = 9400 + Math.floor(Math.random() * 400), profile = join(tmpdir(), "kil-audit-profile-" + port);
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "--disable-extensions", "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1", "about:blank"], { stdio: "ignore" });
const cleanup = () => { try { chrome.kill("SIGKILL"); } catch {} try { server.close(); } catch {} try { execSync(`rm -rf "${profile}"`); } catch {} };
process.on("exit", cleanup); process.on("SIGINT", () => process.exit(130));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
async function connect() {
  for (let i = 0; i < 200; i++) { try { const t = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const pg = t.find((x) => x.type === "page"); if (pg) { ws = new WebSocket(pg.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } }; return; } } catch {} await sleep(200); }
  throw new Error("chrome did not start");
}
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result?.result?.value; };

const MEASURE = `(() => {
  const vh = innerHeight, vw = innerWidth;
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0" && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw; };
  const nm = (e) => (e.id ? "#" + e.id : "") + (e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\\s+/).slice(0, 2).join(".") : "") + " <" + e.tagName.toLowerCase() + ">" + (e.textContent || "").trim().slice(0, 18);
  const tap = [...document.querySelectorAll("a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab]")].filter(vis).map((e) => { const r = e.getBoundingClientRect(); return { el: nm(e), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((t) => t.h < 44 || t.w < 44);
  const text = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const n = w.currentNode; if (!n.textContent.trim()) continue; const e = n.parentElement; if (!e || !vis(e) || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(e.tagName)) continue; const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 11) text.push({ el: nm(e), px: +fs.toFixed(2) }); }
  const de = document.documentElement, bs = getComputedStyle(document.body), ds = getComputedStyle(de);
  const lock = []; if (/hidden|clip/.test(ds.overflowY) && de.scrollHeight > vh + 5) lock.push("html overflow-y " + ds.overflowY); if (/hidden|clip/.test(bs.overflowY) && document.body.scrollHeight > vh + 5) lock.push("body overflow-y " + bs.overflowY);
  const tnone = [...document.querySelectorAll("*")].filter((e) => getComputedStyle(e).touchAction === "none" && vis(e)).map(nm).slice(0, 8);
  const bf = document.getElementById("kil-bf"), pwa = document.getElementById("kil-pwa-banner");
  const shown = (e) => !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().height > 0;
  const over = [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > vw + 1 && getComputedStyle(e).position !== 'fixed'; }).slice(0, 8).map(nm);
  const kilo = document.getElementById('kilo-btn'); const kr = kilo && getComputedStyle(kilo).display !== 'none' ? kilo.getBoundingClientRect() : null;
  const kiloOver = kr ? [...document.querySelectorAll('body *')].filter((e) => { if (e === kilo || kilo.contains(e) || e.contains(kilo) || !e.children.length === false) return false; if (!(e.textContent || '').trim()) return false; const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && s.visibility !== 'hidden' && r.left < kr.right && r.right > kr.left && r.top < kr.bottom && r.bottom > kr.top; }).slice(0, 6).map(nm) : [];
  const bn = document.getElementById('kil-bnav'); const navItems = bn ? [...bn.querySelectorAll('a')].map((a) => (a.textContent || '').trim().replace(/\\s+/g, ' ')) : [];
  const rr = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  const geo = { kilo: rr(kilo), kiloDisplay: kilo ? getComputedStyle(kilo).display : null, venue: rr(document.querySelector('.stat.venue')), bnav: rr(document.getElementById('kil-bnav')) };
  return { vw, vh, over, kiloOver, geo, navItems, hasBnav: !!bn && getComputedStyle(bn).display !== 'none', docW: de.scrollWidth, docH: de.scrollHeight, hscroll: de.scrollWidth > vw + 1 || document.body.scrollWidth > vw + 1, tap, text, lock, touchActionNone: tnone, bfShown: shown(bf), pwaShown: shown(pwa) };
})()`;
const POINTS = `(() => { const vh = innerHeight, vw = innerWidth; const sels = ["img", "a[href]", "button", ".card", "[class*=card]", "[class*=chip]", "iframe", "[class*=banner]", "[class*=rail]", "[class*=scroll]", "[class*=carousel]", "section", "h1,h2,h3"]; const out = [], seen = new Set();
  for (const s of sels) for (const e of document.querySelectorAll(s)) { const r = e.getBoundingClientRect(); if (r.width < 30 || r.height < 20 || r.bottom < 60 || r.top > vh - 60) continue; const x = Math.round(Math.min(vw - 8, Math.max(8, r.left + r.width / 2))), y = Math.round(Math.min(vh - 70, Math.max(70, r.top + r.height / 2))); const key = x + "," + y; if (seen.has(key)) continue; const top = document.elementFromPoint(x, y); if (!top) continue; seen.add(key); out.push({ x, y, el: (top.id ? "#" + top.id : "") + "." + String(top.className || "").toString().trim().split(/\\s+/).slice(0, 2).join(".") + " <" + top.tagName.toLowerCase() + ">" }); if (out.length >= 12) return out; }
  return out; })()`;

const results = [];
try {
  await connect(); await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  for (const page of PAGES) for (const w of WIDTHS) {
    const h = Math.round(w * 2.16);
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" });
    await send("Page.navigate", { url: base + page }); await sleep(7000);   // lets the BF popup (5 s) and the iOS install banner (2.6 s) appear
    const m = await ev(MEASURE);
    const pts = await ev(POINTS); const drags = [];
    for (const p of pts) {
      await ev("scrollTo(0,0)"); await sleep(150);
      const before = await ev("scrollY"); await send("Input.synthesizeScrollGesture", { x: p.x, y: p.y, yDistance: -300, gestureSourceType: "touch", speed: 1200 }); await sleep(450);
      const after = await ev("scrollY"); drags.push({ at: p.el, moved: Math.round(after - before) });
    }
    const scrollable = m.docH - m.vh >= 400;
    const badDrags = scrollable ? drags.filter((d) => d.moved < 200) : [];
    const fails = []; if (m.hscroll) fails.push("horizontal overflow (docW " + m.docW + " > " + m.vw + "): " + m.over.join(" | ")); if (m.lock.length) fails.push("overflow lock: " + m.lock.join("; ")); if (m.touchActionNone.length) fails.push("touch-action:none on " + m.touchActionNone.join(", "));
    if (m.kiloOver.length) fails.push("Kilo button covers: " + m.kiloOver.join(" | ")); if (m.bfShown && m.pwaShown) fails.push("BF modal and PWA banner both visible"); if (badDrags.length) fails.push(`${badDrags.length}/${drags.length} drags moved < 200 px: ` + badDrags.map((d) => d.at + "=" + d.moved).join("; "));
    results.push({ page, width: w, geo: m.geo, navItems: m.navItems, hasBnav: m.hasBnav, pass: !fails.length, fails, tapSmall: m.tap.length, textSmall: m.text.length, tap: m.tap.slice(0, 25), text: m.text.slice(0, 25), drags, docH: m.docH, bfShown: m.bfShown, pwaShown: m.pwaShown });
    console.log(`${fails.length ? "FAIL" : "PASS"}  ${page.padEnd(10)} ${w}px  tap<44: ${m.tap.length}  text<11px: ${m.text.length}  bottomNav ${m.hasBnav ? m.navItems.length + ' items: ' + m.navItems.join('/') : 'none'}  drags ok ${drags.length - badDrags.length}/${drags.length}${scrollable ? "" : " (page not scrollable)"}${fails.length ? "\n        " + fails.join("\n        ") : ""}`);
  }
} finally { cleanup(); }
writeFileSync(join(OUT, "audit.json"), JSON.stringify(results, null, 1));
const bad = results.filter((r) => !r.pass || r.tapSmall || r.textSmall); console.log(`\n${results.length - bad.length}/${results.length} page-widths fully clean (details: ${join(OUT, "audit.json")})`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
