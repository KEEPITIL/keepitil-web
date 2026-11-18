// Music video page (PR #152) render check. Headless Chrome + CDP, ONE instance, fresh temp profile, local static server on 127.0.0.1,
// every non-local request failed (BlockedByClient). Style reused from the #151 evidence harness (18a-kapp/harness.mjs).
//   node harness-mv.mjs <repo root> <out dir> [--port 19500]
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
const MIME = { html:'text/html; charset=utf-8', js:'text/javascript', css:'text/css', json:'application/json', png:'image/png', jpg:'image/jpeg', svg:'image/svg+xml', webp:'image/webp', woff2:'font/woff2', txt:'text/plain' };
const args = process.argv.slice(2); const www = path.resolve(args[0]), out = path.resolve(args[1]);
const dport = Number(args[args.indexOf('--port') + 1] || 19500), sport = dport + 1;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const UA_M = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const STUB = 'window.WebSocket=function(){throw new Error("WebSocket blocked")};window.EventSource=function(){throw new Error("EventSource blocked")};navigator.sendBeacon=function(){return false};';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let priceLive = false; // LOCAL override of the served config only; nothing in the repo changes
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/assets/js/music-video-config.js') { res.writeHead(200, { 'Content-Type': MIME.js }); return res.end(readFileSync(path.join(www, p), 'utf8').replace(/KIL_MV_PRICES_LIVE = (true|false)/, 'KIL_MV_PRICES_LIVE = ' + priceLive)); }
  let f = path.join(www, p);
  if (!f.startsWith(www)) { res.writeHead(403); return res.end(); }
  for (const c of [f, f + '.html', path.join(f, 'index.html')]) if (existsSync(c) && statSync(c).isFile()) { f = c; break; }
  if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f).slice(1)] || 'application/octet-stream' }); res.end(readFileSync(f));
});
await new Promise((r) => srv.listen(sport, '127.0.0.1', r));
const profile = mkdtempSync(path.join(os.tmpdir(), 'mv-vis-'));
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${dport}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--no-first-run', '--disable-gpu', '--disable-extensions', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { proc.kill('SIGKILL'); } catch (_) {} srv.close(); try { rmSync(profile, { recursive: true, force: true }); } catch (_) {} };
process.on('SIGINT', () => { cleanup(); process.exit(1); });
try {
  let list; for (let i = 0; i < 60 && !list; i++) { try { list = await (await fetch(`http://127.0.0.1:${dport}/json/list`)).json(); } catch (_) { await sleep(500); } }
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const waits = new Map(); let blocked = {}, errs = [];
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; waits.set(i, (d) => d.error ? rej(new Error(method + ': ' + d.error.message)) : res(d.result)); ws.send(JSON.stringify({ id: i, method, params })); });
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && waits.has(d.id)) { waits.get(d.id)(d); waits.delete(d.id); }
    if (d.method === 'Fetch.requestPaused') {
      const u = d.params.request.url; const local = u.startsWith(`http://127.0.0.1:${sport}/`) || u.startsWith('data:');
      if (!local) { let h; try { h = new URL(u).host; } catch (_) { h = 'x'; } blocked[h] = (blocked[h] || 0) + 1; }
      send(local ? 'Fetch.continueRequest' : 'Fetch.failRequest', local ? { requestId: d.params.requestId } : { requestId: d.params.requestId, errorReason: 'BlockedByClient' }).catch(() => {});
    }
    if (d.method === 'Runtime.exceptionThrown') errs.push({ kind: 'exception', text: (d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description || d.params.exceptionDetails.text || '').slice(0, 240) });
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errs.push({ kind: 'console.error', text: d.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 240) });
    if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') errs.push({ kind: 'log', text: (d.params.entry.text + ' ' + (d.params.entry.url || '')).slice(0, 240) });
  });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; };
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
  mkdirSync(out, { recursive: true });
  const chromeVer = (await (await fetch(`http://127.0.0.1:${dport}/json/version`)).json()).Browser;
  const PROBE = `(function(){
    var q=function(s,r){return [].slice.call((r||document).querySelectorAll(s))};
    var R=function(e){var r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:Math.round(r.x),w:Math.round(r.width),h:Math.round(r.height),vis:r.width>1&&r.height>1&&s.display!=='none'&&s.visibility!=='hidden'&&r.x>-5000}};
    var T=function(e){return (e.getAttribute('aria-label')||e.textContent||'').replace(/\\s+/g,' ').trim().slice(0,50)};
    var sc=document.scrollingElement;
    var targets=q('a,button,select,textarea,summary,input:not([type=checkbox]):not([type=hidden])').map(function(e){return {tag:e.tagName,text:T(e)||e.name||e.id,r:R(e),inline:e.tagName==='A'&&getComputedStyle(e).display==='inline'}}).filter(function(t){return t.r.vis});
    var chks=q('input[type=checkbox]').map(function(c){var row=c.closest('.chk');var lab=document.querySelector('label[for="'+c.id+'"]');return {id:c.id,required:c.required,box:R(c),row:row?R(row):null,label:lab?lab.textContent.trim().slice(0,60):null}});
    var vid=document.querySelector('video[data-sample-src]');var ph=document.querySelector('[data-sample-placeholder]');
    return {title:document.title,innerWidth:innerWidth,scrollWidth:sc.scrollWidth,noHScroll:sc.scrollWidth<=innerWidth,docHeight:sc.scrollHeight,
      tiers:q('article.offer').map(function(a){return a.getAttribute('data-tier')}),
      priceTexts:q('[data-tier-price]').map(function(e){return e.textContent}),
      selectOptions:q('#mv-tier option').map(function(o){return o.textContent}),
      dollarInBody:/\\$\\s?\\d/.test(document.body.innerText),
      checkboxes:chks,honeypotPresent:!!document.getElementById('mv-co'),honeypotVisible:R(document.getElementById('mv-co')).vis,
      sample:{videoPresent:!!vid,videoHidden:vid?vid.hidden:null,videoVisible:vid?R(vid).vis:null,poster:vid?vid.getAttribute('poster'):null,placeholderVisible:ph?R(ph).vis:null,placeholderText:ph?ph.textContent:null},
      turnaround:(document.body.innerText.match(/Turnaround[^\\n]*/)||[null])[0],
      legal:(document.body.innerText.match(/License and usage terms[^\\n]*/)||[null])[0],
      robots:(document.querySelector('meta[name=robots]')||{}).content,
      iframes:q('iframe,embed,object').length,
      targetsTotal:targets.length,
      smallTargets:targets.filter(function(t){return t.r.h<44||t.r.w<44}).map(function(t){return t.tag+' "'+t.text+'" '+t.r.w+'x'+t.r.h+(t.inline?' (inline text link)':'')}),
      overflowers:q('body *').filter(function(e){var r=e.getBoundingClientRect();return r.right>innerWidth+1&&r.width>0&&getComputedStyle(e).position!=='fixed'&&getComputedStyle(e).position!=='absolute'}).slice(0,8).map(function(e){return e.tagName+'#'+e.id+'.'+String(e.className).slice(0,40)})};
  })()`;
  const FORMCHK = `(function(){var f=document.getElementById('mv-form');f.requestSubmit?f.requestSubmit():f.dispatchEvent(new Event('submit',{cancelable:true}));
    var errs={};document.querySelectorAll('[data-err]').forEach(function(e){if(e.textContent)errs[e.getAttribute('data-err')]=e.textContent});
    var st=document.getElementById('mv-status').textContent;
    document.querySelector('[data-tier-pick="lyric_cut"]').click();
    return {emptySubmitErrors:errs,status:st,attestInvalid:document.getElementById('mv-attest').getAttribute('aria-invalid'),consentInvalid:document.getElementById('mv-consent').getAttribute('aria-invalid'),tierAfterPick:document.getElementById('mv-tier').value,locationUnchanged:location.protocol==='http:'}})()`;
  const report = { chrome: chromeVer, date: new Date().toISOString(), network: 'every request not to 127.0.0.1 is failed with BlockedByClient (CDP Fetch); WebSocket/EventSource/sendBeacon stubbed', runs: [] };
  const RUNS = [
    { name: 'prices-hidden', live: false, vps: [{ n: 'mobile-375x812', w: 375, h: 812, m: true }, { n: 'desktop-1280x800', w: 1280, h: 800, m: false }] },
    { name: 'prices-flag-true-LOCAL-ONLY', live: true, vps: [{ n: 'mobile-375x812', w: 375, h: 812, m: true }] }
  ];
  for (const run of RUNS) {
    priceLive = run.live;
    for (const vp of run.vps) {
      if (os.loadavg()[0] > 8) throw new Error('load too high');
      blocked = {}; errs = [];
      await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.m });
      await send('Emulation.setTouchEmulationEnabled', { enabled: vp.m });
      await send('Network.setUserAgentOverride', { userAgent: vp.m ? UA_M : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' });
      await send('Network.setCacheDisabled', { cacheDisabled: true });
      await send('Page.navigate', { url: `http://127.0.0.1:${sport}/services/music-video/` });
      await sleep(1500); for (let i = 0; i < 30; i++) { if (await ev('document.readyState==="complete"')) break; await sleep(500); } await sleep(2500);
      const probe = await ev(PROBE);
      const base = `${run.name}-${vp.n}`;
      const cap = async (name, full) => { let p = { format: 'png' }; if (full) { const m = await send('Page.getLayoutMetrics'); p.captureBeyondViewport = true; p.clip = { x: 0, y: 0, width: vp.w, height: Math.min(Math.ceil(m.cssContentSize.height), 12000), scale: 1 }; } const r = await send('Page.captureScreenshot', p); writeFileSync(path.join(out, name), Buffer.from(r.data, 'base64')); };
      await cap(`${base}-fold.png`, false); await cap(`${base}-full.png`, true);
      let form = null;
      if (run.live === false) { form = await ev(FORMCHK); await ev("document.getElementById('request').scrollIntoView()"); await sleep(600); await cap(`${base}-form-errors.png`, false); }
      report.runs.push({ run: run.name, viewport: vp.n, probe, form, console: errs.slice(), blockedHosts: { ...blocked } });
      console.log(base, 'ok load1=' + os.loadavg()[0].toFixed(2));
    }
  }
  writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
} finally { cleanup(); }
console.log('done; chrome killed, profile removed');

