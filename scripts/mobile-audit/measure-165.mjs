#!/usr/bin/env node
/* mobile-audit/measure-165.mjs - keepitil-web #165 must-fixes 2-5 (Atlas, 2026-11-11 20:23), MEASURED in a real
   layout engine: headless Chrome over CDP, phone emulation, local static server on 127.0.0.1, no network.
   Runs in GitHub-hosted CI (.github/workflows/mobile-measure.yml), never on the owner's laptop.
     2  /earn/   every #radSeg tab fully visible (inside the viewport and its row, text not clipped), >= 44px tall
     3  /create/ the Create stat labels (#vs-app .ce-stat span) >= 11px
     4  /        the Home event card text (genre, SPONSORED, date, day count, Buy Tickets, venue) >= 11px
     5  /create/ and /: a vertical swipe that STARTS on a Create card rail / a Home event row scrolls the page >= 200px,
                 with a NEGATIVE CONTROL: the same probe forced back to touch-action:pan-x must NOT scroll the page,
                 or the gesture is not measuring anything.
   Probes: card text and rails are injected into #evx / #vs-app with the page's real class names, because event data
   comes from the network (blocked here). The page's own CSS and media queries style them; that is what is measured.
   An element that cannot be found is a FAILURE, never a pass. Exit 1 on any failure. */
import { spawn, execSync } from "node:child_process";
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { tmpdir } from "node:os";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = resolve(arg("--root", process.cwd()));
const WIDTHS = arg("--widths", "360,390").split(",").map(Number);
const CHROME = process.env.KIL_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

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
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "--disable-extensions", ...(process.env.CI ? ["--no-sandbox"] : []), "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1", "about:blank"], { stdio: "ignore" });
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


const fails = [], passes = [];
const check = (ok, what) => { (ok ? passes : fails).push(what); console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); };
const waitFor = async (expr, ms = 15000) => { for (let t = 0; t < ms; t += 250) { if (await ev(expr)) return true; await sleep(250); } return false; };

async function open(path, w) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: Math.round(w * 2.16), deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" });
  await send("Page.navigate", { url: base + path });
  await waitFor("document.readyState === 'complete'");
  await sleep(1500);
  // The BF popup and the install banner would sit over the probes; they are not what is measured here.
  await ev("['kil-bf','kil-pwa-banner'].forEach(i=>{const e=document.getElementById(i); if(e) e.remove();}); true");
}

// A rail probe: wide horizontal content inside [host] with the page's own class, a tall spacer so the page
// can scroll, then a real touch swipe (upwards) that starts on the probe.
async function swipeOn(hostSel, railClass, itemClass, forcePanX) {
  const ready = await ev(`(() => { const host = document.querySelector(${JSON.stringify(hostSel)}); if (!host) return false;
    document.getElementById('m165-rail')?.remove(); document.getElementById('m165-pad')?.remove();
    const r = document.createElement('div'); r.id = 'm165-rail'; r.className = ${JSON.stringify(railClass)};
    r.style.cssText = 'height:300px' + (${forcePanX} ? ';touch-action:pan-x' : '');
    for (let i = 0; i < 8; i++) { const c = document.createElement('div'); c.className = ${JSON.stringify(itemClass)}; c.style.cssText = 'flex:0 0 220px;height:280px;background:#333'; r.appendChild(c); }
    host.prepend(r);
    const pad = document.createElement('div'); pad.id = 'm165-pad'; pad.style.height = '4000px'; document.body.appendChild(pad);
    r.scrollIntoView({ block: 'center' }); return true; })()`);
  if (!ready) return { error: `${hostSel} not found` };
  await sleep(300);
  const p = await ev(`(() => { const b = document.getElementById('m165-rail').getBoundingClientRect(); return { x: Math.round(Math.min(innerWidth - 20, b.left + 120)), y: Math.round(b.top + b.height / 2), ta: getComputedStyle(document.getElementById('m165-rail')).touchAction }; })()`);
  const top = await ev(`(() => { const e = document.elementFromPoint(${p.x}, ${p.y}); return !!e && !!e.closest('#m165-rail'); })()`);
  if (!top) return { error: `the swipe point is not on the probe rail (covered)` };
  const before = await ev("scrollY");
  await send("Input.synthesizeScrollGesture", { x: p.x, y: p.y, yDistance: -300, gestureSourceType: "touch", speed: 1200 });
  await sleep(600);
  return { moved: Math.round((await ev("scrollY")) - before), touchAction: p.ta };
}

try {
  await connect(); await send("Page.enable"); await send("Runtime.enable");
  for (const w of WIDTHS) {
    // 2. Earn tabs
    await open("/earn/", w);
    const tabs = await ev(`(() => { const seg = document.getElementById('radSeg'); if (!seg) return null; const s = seg.getBoundingClientRect();
      return [...seg.querySelectorAll('button')].map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim(), l: r.left, r: r.right, h: r.height, sl: s.left, sr: s.right, clip: b.scrollWidth > b.clientWidth + 1 }; }); })()`);
    if (!tabs || tabs.length !== 5) check(false, `#2 ${w}px /earn/: expected 5 #radSeg tabs, found ${tabs ? tabs.length : "none"}`);
    else for (const t of tabs) check(t.l >= -0.5 && t.r <= w + 0.5 && t.l >= t.sl - 0.5 && t.r <= t.sr + 0.5 && t.h >= 44 && !t.clip,
      `#2 ${w}px /earn/ tab "${t.t}": ${t.l.toFixed(1)}..${t.r.toFixed(1)} in row ${t.sl.toFixed(1)}..${t.sr.toFixed(1)}, ${t.h.toFixed(1)}px tall${t.clip ? ", TEXT CLIPPED" : ""}`);

    // 3. Create stat labels, and 5. the Create card rail
    await open("/create/", w);
    const styled = await waitFor("[...document.querySelectorAll('style')].some(s => s.textContent.includes('.ce-stat span'))");
    if (!styled) check(false, `#3 ${w}px /create/: vs-app.js never injected its .ce-stat styles`);
    else {
      const px = await ev(`(() => { const host = document.getElementById('vs-app'); if (!host) return null; const d = document.createElement('div'); d.className = 'ce-stat'; d.innerHTML = '<b>1</b><span>CREATORS</span>'; host.prepend(d); return parseFloat(getComputedStyle(d.querySelector('span')).fontSize); })()`);
      check(px !== null && px >= 11, `#3 ${w}px /create/ stat label: ${px}px (>= 11)`);
    }
    for (const [name, forced] of [["fixed rail", false], ["NEGATIVE CONTROL pan-x", true]]) {
      const r = await swipeOn("#vs-app", "ce-grid", "ce-fly", forced);
      if (r.error) check(false, `#5 ${w}px /create/ ${name}: ${r.error}`);
      else if (!forced) check(r.moved >= 200 && /pan-y/.test(r.touchAction), `#5 ${w}px /create/ swipe on a Create card rail moved the page ${r.moved}px (touch-action: ${r.touchAction})`);
      else check(r.moved < 50, `#5 ${w}px /create/ ${name}: the same swipe with touch-action:pan-x moved ${r.moved}px (must stay ~0, or the gesture measures nothing)`);
    }

    // 4. Home event text, and 5. the Home event rows
    await open("/", w);
    const sizes = await ev(`(() => { const host = document.getElementById('evx'); if (!host) return null;
      const d = document.createElement('div'); d.id = 'm165-cards';
      d.innerHTML = '<div class="evx-row"><div class="evx-flyer"><span class="evx-genre">TECHNO</span><div class="evx-body"><div class="evx-date">FRI NOV 13</div><div class="evx-venue">Venue</div><div class="evx-foot"><span class="evx-cta">Details</span></div></div><div class="evx-actions"><a class="evx-act evx-act-tix" href="#">Buy Tickets</a></div></div><div class="kil-spon"><span class="kil-spon-tag">SPONSORED</span></div><div class="evx-daycount">3 DAYS</div></div>';
      host.prepend(d);
      const out = {}; for (const [k, sel] of [['genre', '.evx-genre'], ['SPONSORED', '.kil-spon-tag'], ['date', '.evx-date'], ['day count', '.evx-daycount'], ['Buy Tickets', '.evx-act'], ['venue', '.evx-venue']]) { const e = d.querySelector(sel); out[k] = e ? parseFloat(getComputedStyle(e).fontSize) : null; }
      d.remove(); return out; })()`);
    if (!sizes) check(false, `#4 ${w}px /: #evx not found`);
    else for (const [k, px] of Object.entries(sizes)) check(px !== null && px >= 11, `#4 ${w}px / event ${k}: ${px}px (>= 11)`);
    for (const [name, forced] of [["event row", false], ["NEGATIVE CONTROL pan-x", true]]) {
      const r = await swipeOn("#evx", "evx-row", "evx-flyer", forced);
      if (r.error) check(false, `#5 ${w}px / ${name}: ${r.error}`);
      else if (!forced) check(r.moved >= 200 && /pan-y/.test(r.touchAction), `#5 ${w}px / swipe on a Home event row moved the page ${r.moved}px (touch-action: ${r.touchAction})`);
      else check(r.moved < 50, `#5 ${w}px / ${name}: the same swipe with touch-action:pan-x moved ${r.moved}px (must stay ~0)`);
    }
  }
} finally { cleanup(); }
console.log(`\n${passes.length} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
