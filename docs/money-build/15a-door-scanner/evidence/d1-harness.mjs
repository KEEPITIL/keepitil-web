// 15B headless-Chrome harness: REAL Chrome, REAL door.html + scanner + vendored jsQR lazily loaded over HTTP, fake camera = canvas.captureStream.
// Mocked: supabase client/session and the RPC fetch. BarcodeDetector forced undefined.
import http from 'node:http'; import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'; import { spawn } from 'node:child_process';
import { createRequire } from 'node:module'; import { join, extname } from 'node:path'; import { tmpdir } from 'node:os';
const REPO = process.argv[2], OUT = process.argv[3];
const require = createRequire(join(REPO, 'x.js'));
const qrcode = require(join(REPO, 'assets/js/vendor/qrcode.js'));
const TOKEN = '0123456789abcdef0123456789abcdef';
const mk = (t) => { const q = qrcode(0, 'M'); q.addData(t, 'Byte'); q.make(); const n = q.getModuleCount(), m = []; for (let r = 0; r < n; r++) { const row = []; for (let c = 0; c < n; c++) row.push(q.isDark(r, c) ? 1 : 0); m.push(row); } return m; };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const reqLog = [];
const srv = http.createServer((req, res) => { const u = new URL(req.url, 'http://x'); reqLog.push(u.pathname); let p = join(REPO, u.pathname); if (!p.startsWith(REPO) || !existsSync(p)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p)); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const PORT = srv.address().port;
const prof = mkdtempSync(join(tmpdir(), 'chrome15b-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9347', '--user-data-dir=' + prof, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pages; for (let i = 0; i < 50; i++) { try { pages = await (await fetch('http://127.0.0.1:9347/json/list')).json(); if (pages.length) break; } catch {} await sleep(200); }
const ws = new WebSocket(pages.find((p) => p.type === 'page').webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const wait = new Map(); const events = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } else events.push(d); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result.result ? r.result.result.value : r.result; };
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, name), Buffer.from(r.result.data, 'base64')); };
const report = {};
const PRE = `
(function(){
  var RPC=[]; window.__rpc=RPC; window.__showQR=false;
  var fakeClient={auth:{getSession:function(){return Promise.resolve({data:{session:{access_token:'harness.fake.token',user:{}}}})},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}}}};
  var sb={createClient:function(){return fakeClient}};
  Object.defineProperty(window,'supabase',{configurable:true,get:function(){return sb},set:function(){}});
  window.BarcodeDetector=undefined;
  var of=window.fetch; window.fetch=function(u,i){ if(String(u).indexOf('/rest/v1/rpc/event_checkin_scan')>=0){ RPC.push({url:String(u),auth:i.headers.Authorization,body:i.body}); return Promise.resolve(new Response(JSON.stringify({ok:true,result:'admitted',event_title:'Doors Open: Friday Night',tier:'VIP',qty:2,checked_in_at:new Date().toISOString()}),{status:200})); } return of.apply(this,arguments); };
  window.__gum=0;
  navigator.mediaDevices.getUserMedia=function(c){ window.__gum++; window.__constraints=JSON.stringify(c);
    var cv=document.createElement('canvas'); cv.width=1280; cv.height=720; var x=cv.getContext('2d'); window.__cv=cv;
    function draw(){ x.fillStyle='#777'; x.fillRect(0,0,1280,720); if(window.__showQR&&window.__matrix){ var m=window.__matrix,n=m.length,s=11,q=4,side=(n+q*2)*s,ox=(1280-side)/2,oy=(720-side)/2; x.fillStyle='#fff'; x.fillRect(ox,oy,side,side); x.fillStyle='#000'; for(var r=0;r<n;r++)for(var c2=0;c2<n;c2++) if(m[r][c2]) x.fillRect(ox+(c2+q)*s,oy+(r+q)*s,s,s); } else { x.fillStyle='#fff'; x.font='40px sans-serif'; x.fillText('no ticket in view',480,360); } }
    draw(); setInterval(draw,50); return Promise.resolve(cv.captureStream(20)); };
})();`;
await send('Page.enable'); await send('Runtime.enable'); await send('Page.addScriptToEvaluateOnNewDocument', { source: PRE });
async function run(label, W, H, text, expectCode) {
  reqLog.length = 0;
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: W < 700 });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/door.html` }); await sleep(1500);
  await ev(`window.__matrix=${JSON.stringify(mk(text))}; 1`);
  const pre = await ev(`JSON.stringify({jsQR:typeof window.jsQR, scripts:[...document.scripts].map(s=>s.getAttribute('src')).filter(Boolean)})`);
  await ev(`document.getElementById('cam-start').click(); 1`); await sleep(2500);
  const mid = await ev(`JSON.stringify({running:!document.getElementById('cam-stop').hidden, jsQR:typeof window.jsQR, video:{w:document.getElementById('cam').videoWidth,h:document.getElementById('cam').videoHeight,paused:document.getElementById('cam').paused}, gum:window.__gum, constraints:window.__constraints, rpc:window.__rpc.length, code:document.getElementById('result').dataset.code})`);
  await shot(`d1-${label}-1-camera-ready.png`);
  await ev(`window.__showQR=true; 1`); await sleep(2500);
  const post = await ev(`JSON.stringify({code:document.getElementById('result').dataset.code, text:document.getElementById('result').innerText.replace(/\\n+/g,' / '), rpc:window.__rpc, scrollW:document.documentElement.scrollWidth, innerW:innerWidth, camMsg:document.getElementById('cam-msg').textContent})`);
  await shot(`d1-${label}-2-${expectCode}.png`);
  report[label] = { before_start: JSON.parse(pre), after_start_blank: JSON.parse(mid), after_qr: JSON.parse(post), jsqr_requests: reqLog.filter((p) => /jsqr/i.test(p)) };
}
await run('375', 375, 812, TOKEN, 'admitted');
await run('375-kilprefix', 375, 812, 'KIL-' + TOKEN, 'admitted');
await run('375-url-refused', 375, 812, 'https://keepitil.com/t/' + TOKEN, 'refused');
writeFileSync(join(OUT, 'd1-harness-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
ws.close(); chrome.kill(); srv.close(); await sleep(500); rmSync(prof, { recursive: true, force: true });
