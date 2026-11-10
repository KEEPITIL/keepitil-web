/* kil-door-scanner.js - logic for /door.html (owner door scanner). DRAFT, not linked from any page.
   Classic script (also require()-able from node tests). The 12A adapter (token-free, no-contact response mapping) is INJECTED:
   door.html imports /assets/js/kil-door-scan-adapter.mjs (a byte-identical copy of db/proposed/12a-door-hardening/adapter/door-scan-adapter.mjs,
   parity is tested) and passes it to boot(). Nothing here uses localStorage/sessionStorage/innerHTML; server text is only ever put in textContent. */
(function (root) {
  'use strict';
  var RPC_PATH = '/rest/v1/rpc/event_checkin_scan';
  var DEBOUNCE_MS = 4000;      /* client-side convenience only: the SERVER is the real guard (second scan => already_used) */
  var SCAN_EVERY_MS = 250;
  var RPC_TIMEOUT_MS = 12000;

  /* ---- payload parsing (local pre-check; the database does the authoritative trim/prefix strip) ---- */
  function localParse(raw, adapter) {
    var p = adapter.normalizePayload(raw);
    if (p === '') return { kind: 'empty' };
    /* tickets encode the raw 32-hex token or 'KIL-<token>' (kil-ticket-qr.js); URL-form payloads are NOT part of the contract,
       so anything with whitespace/control chars inside or a URL scheme is refused here and never sent to the server */
    if (p.length > 128 || /[\s\u0000-\u001f\u007f]/.test(p) || /:\/\//.test(p)) return { kind: 'invalid' };
    var req = adapter.buildScanRequest(raw);
    if (!req) return { kind: 'invalid' };
    return { kind: 'ok', token: p, request: req };
  }

  function signInUrl(pathname) {
    var p = typeof pathname === 'string' && /^\/(?!\/)[A-Za-z0-9_\-./]*$/.test(pathname) ? pathname : '/door.html';
    return '/apply?next=' + encodeURIComponent(p);   /* path only: never the query string, so no scanned code can ride along */
  }

  /* ---- the network call: explicit user access token as bearer (NOT the anon key, that was bug #139), body = { p_qr_token } only ---- */
  function makeRpc(o) {
    var fetchFn = o.fetch, getSession = o.getSession, url = String(o.url || '').replace(/\/+$/, ''), anonKey = o.anonKey;
    return function rpc(args) {
      return Promise.resolve().then(getSession).then(function (session) {
        if (!session || !session.access_token) return { data: null, error: { status: 401, code: 'PGRST301' } };
        var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = ctl ? setTimeout(function () { ctl.abort(); }, o.timeoutMs || RPC_TIMEOUT_MS) : null;
        return fetchFn(url + RPC_PATH, {
          method: 'POST', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
          headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': 'Bearer ' + session.access_token },
          body: JSON.stringify({ p_qr_token: args.p_qr_token }),
          signal: ctl ? ctl.signal : undefined
        }).then(function (res) {
          return Promise.resolve(res.json()).catch(function () { return null; }).then(function (body) {
            if (res.status >= 200 && res.status < 300) return { data: body, error: null };
            /* status + code only: server message text is never forwarded (it could echo the payload) */
            return { data: null, error: { status: res.status, code: body && typeof body.code === 'string' ? body.code : undefined } };
          });
        }).then(function (r) { if (timer) clearTimeout(timer); return r; },
                function () { if (timer) clearTimeout(timer); return { data: null, error: { message: 'network' } }; });
      });
    };
  }

  /* ---- scan state machine: idle -> checking -> result(code) -> (reset) idle. One admission per submit. ---- */
  function createScanner(o) {
    var adapter = o.adapter, rpc = o.rpc, now = o.now || Date.now, debounceMs = o.debounceMs == null ? DEBOUNCE_MS : o.debounceMs;
    var onChange = o.onChange || function () {};
    var state = { phase: 'idle', result: null, canRetry: false };
    var busy = false, last = null /* { token, at } in memory only */, retryToken = null;
    function set(s) { state = s; onChange(state); }
    function localResult(code) { return adapter.adaptScanResponse({ ok: false, result: code }); }

    function check(token, request) {
      busy = true; retryToken = null;
      set({ phase: 'checking', result: null, canRetry: false });
      var p;
      try { p = Promise.resolve(rpc(request.args)); } catch (e) { p = Promise.resolve({ data: null, error: { message: 'network' } }); }
      return p.catch(function () { return { data: null, error: { message: 'network' } }; }).then(function (resp) {
        var r = adapter.adaptScanResponse(resp);   /* never throws; maps transport failure to 'error', 401/42501 to 'unauth' */
        busy = false;
        if (r.code === 'error' || r.code === 'unauth') { last = null; retryToken = r.code === 'error' ? token : null; }  /* a failed check may be retried at once */
        set({ phase: 'result', result: r, canRetry: r.code === 'error' });
        return { submitted: true, result: r };
      });
    }
    return {
      get state() { return state; },
      submit: function (raw) {
        if (busy) return Promise.resolve({ skipped: 'busy' });
        var parsed = localParse(raw, adapter);
        if (parsed.kind !== 'ok') { var r = localResult(parsed.kind); set({ phase: 'result', result: r, canRetry: false }); return Promise.resolve({ submitted: false, result: r }); }
        var t = now();
        if (last && last.token === parsed.token && t - last.at < debounceMs) return Promise.resolve({ skipped: 'duplicate' });
        last = { token: parsed.token, at: t };
        return check(parsed.token, parsed.request);
      },
      retry: function () {
        if (busy || !retryToken) return Promise.resolve({ skipped: 'nothing-to-retry' });
        var parsed = localParse(retryToken, adapter);
        return parsed.kind === 'ok' ? check(parsed.token, parsed.request) : Promise.resolve({ skipped: 'nothing-to-retry' });
      },
      reset: function () { if (!busy) { retryToken = null; set({ phase: 'idle', result: null, canRetry: false }); } },  /* debounce memory is kept on purpose */
      dispose: function () { last = null; retryToken = null; }
    };
  }

  /* ---- camera (BarcodeDetector only; no decoder library in this slice) ---- */
  function createCamera(o) {
    var nav = o.navigator, BD = o.BarcodeDetector, onCode = o.onCode, wait = o.setTimeout || setTimeout, stopWait = o.clearTimeout || clearTimeout;
    var stream = null, timer = null, video = null, paused = false, running = false, detector = null;
    function supported() { return !!(BD && nav && nav.mediaDevices && typeof nav.mediaDevices.getUserMedia === 'function'); }
    function loop() {
      if (!running) return;
      timer = wait(function () {
        if (!running) return;
        if (paused || !video) return loop();
        Promise.resolve().then(function () { return detector.detect(video); }).then(function (codes) {
          if (!running || paused) return;
          var c = codes && codes[0] && typeof codes[0].rawValue === 'string' ? codes[0].rawValue : '';
          if (c) onCode(c);
        }).catch(function () {}).then(loop);
      }, SCAN_EVERY_MS);
    }
    function stop() {
      running = false; paused = false;
      if (timer) { stopWait(timer); timer = null; }
      if (stream) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} stream = null; }
      if (video) { try { video.srcObject = null; } catch (e) {} }
      video = null; detector = null;
    }
    function start(videoEl) {
      if (running) return Promise.resolve({ ok: true });
      if (!supported()) return Promise.resolve({ ok: false, reason: 'unsupported' });
      return Promise.resolve().then(function () {
        return typeof BD.getSupportedFormats === 'function' ? BD.getSupportedFormats() : ['qr_code'];
      }).then(function (formats) {
        if (formats && formats.indexOf && formats.indexOf('qr_code') < 0) return { ok: false, reason: 'unsupported' };
        return nav.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } }).then(function (s) {
          stream = s; video = videoEl; videoEl.srcObject = s; detector = new BD({ formats: ['qr_code'] });
          try { videoEl.muted = true; var pl = videoEl.play && videoEl.play(); if (pl && pl.catch) pl.catch(function () {}); } catch (e) {}
          running = true; paused = false; loop();
          return { ok: true };
        }, function (err) {
          var n = err && err.name;
          return { ok: false, reason: n === 'NotAllowedError' || n === 'SecurityError' ? 'denied' : (n === 'NotFoundError' || n === 'OverconstrainedError') ? 'nocamera' : 'failed' };
        });
      }).catch(function () { stop(); return { ok: false, reason: 'failed' }; });
    }
    return { supported: supported, start: start, stop: stop, pause: function () { paused = true; }, resume: function () { paused = false; },
      get running() { return running; } };
  }

  /* ---- rendering: result -> DOM, textContent only, whitelisted fields (eventTitle, tier, qty, checkedInAt) ---- */
  var GLYPH = { success: '✓', warning: '!', error: '✕', neutral: '•' };
  function fmtTime(iso) {
    var t = Date.parse(iso); if (isNaN(t)) return '';
    try { return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
  }
  function renderResult(doc, panel, result) {
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    var ui = result.ui;
    panel.setAttribute('data-tone', ui.tone); panel.setAttribute('data-code', result.code);
    function el(tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; panel.appendChild(n); return n; }
    var g = el('div', 'glyph', GLYPH[ui.tone] || GLYPH.neutral); g.setAttribute('aria-hidden', 'true');
    el('div', 'r-title', ui.title);
    el('div', 'r-detail', ui.detail);
    var a = result.admission;
    if (a) {
      if (a.tier) el('div', 'r-line', 'Tier: ' + a.tier);
      if (a.qty != null) el('div', 'r-line', a.qty === 1 ? 'Admits 1 person' : 'Admits ' + a.qty + ' people');
      if (result.code === 'already_used' && a.checkedInAt) { var tm = fmtTime(a.checkedInAt); if (tm) el('div', 'r-line', 'First scanned at ' + tm); }
      if (a.eventTitle) el('div', 'r-line', 'Event: ' + a.eventTitle);
    } else if (result.eventTitle) el('div', 'r-line', 'Event: ' + result.eventTitle);
  }

  /* ---- page wiring ---- */
  var CAM_MSG = {
    unsupported: "Camera scanning isn't available in this browser. Type the ticket code below.",
    denied: 'Camera permission was blocked. Allow camera access in your browser settings, or type the ticket code below.',
    nocamera: 'No usable camera was found. Type the ticket code below.',
    failed: "The camera couldn't start. Type the ticket code below."
  };
  function boot(deps) {
    var win = deps.win, doc = win.document, adapter = deps.adapter, cfg = win.KIL_DOOR_CONFIG || {};
    var navigate = deps.navigate || function (u) { win.location.replace(u); };
    var render = deps.render || renderResult;
    function $(id) { return doc.getElementById(id); }
    /* a code must never sit in the address bar or history */
    try { if (win.location.search || win.location.hash) win.history.replaceState(null, '', win.location.pathname); } catch (e) {}
    var client = deps.client || win.supabase.createClient(cfg.url, cfg.key, { auth: { detectSessionInUrl: false } });
    function getSession() { return Promise.resolve().then(function () { return client.auth.getSession(); }).then(function (r) { return r && r.data ? r.data.session : null; }, function () { return null; }); }
    var els = { panel: $('result'), next: $('next'), retry: $('retry'), signin: $('signin'), form: $('manual'), input: $('code'), forEl: $('scan-for'),
      video: $('cam'), camStart: $('cam-start'), camStop: $('cam-stop'), camMsg: $('cam-msg'), net: $('net'), status: $('boot-status') };
    var to = signInUrl(win.location.pathname);

    return getSession().then(function (session) {
      if (!session || !session.access_token) {            /* no session: redirect BEFORE any RPC is possible */
        if (els.status) els.status.textContent = 'Redirecting to sign in…';
        navigate(to); return { redirected: true, to: to };
      }
      if (els.status) els.status.hidden = true;
      var scanner, camera;
      function show(state) {
        els.next.hidden = state.phase !== 'result'; els.retry.hidden = !(state.phase === 'result' && state.canRetry);
        els.signin.hidden = !(state.result && state.result.code === 'unauth'); els.signin.setAttribute('href', to);
        if (state.phase === 'checking') { els.panel.setAttribute('data-tone', 'neutral'); els.panel.setAttribute('data-code', 'checking'); els.panel.setAttribute('aria-busy', 'true'); els.panel.textContent = 'Checking…'; return; }
        els.panel.removeAttribute('aria-busy');
        if (state.phase === 'result') {
          render(doc, els.panel, state.result);
          var a = state.result.admission, t = a && a.eventTitle || state.result.eventTitle;
          if (t) { els.forEl.textContent = 'Scanning for: ' + t; els.forEl.hidden = false; }
          if (camera) camera.pause();
          if (state.result.code === 'unauth' && camera) camera.stop();
          setCamUi();
          try { els.panel.focus(); } catch (e) {}
        } else {
          els.panel.setAttribute('data-tone', 'neutral'); els.panel.setAttribute('data-code', 'idle'); els.panel.textContent = 'Ready. Scan a ticket QR code or type the code.';
          if (camera) camera.resume();
          try { els.panel.focus(); } catch (e) {}
        }
      }
      var rpc = deps.rpc || makeRpc({ url: cfg.url, anonKey: cfg.key, getSession: getSession, fetch: deps.fetch || win.fetch.bind(win) });
      scanner = createScanner({ adapter: adapter, rpc: rpc, now: deps.now, debounceMs: deps.debounceMs, onChange: show });
      camera = createCamera({ navigator: win.navigator, BarcodeDetector: win.BarcodeDetector, onCode: function (c) { scanner.submit(c); },
        setTimeout: deps.setTimeout ? deps.setTimeout : win.setTimeout.bind(win), clearTimeout: deps.clearTimeout ? deps.clearTimeout : win.clearTimeout.bind(win) });
      function setCamUi() { els.camStart.hidden = camera.running; els.camStop.hidden = !camera.running; els.video.hidden = !camera.running; }
      function stopCamera() { camera.stop(); setCamUi(); }

      if (!camera.supported()) { els.camMsg.textContent = CAM_MSG.unsupported; els.camStart.disabled = true; }
      els.camStart.addEventListener('click', function () {
        els.camMsg.textContent = '';
        camera.start(els.video).then(function (r) { if (!r.ok) els.camMsg.textContent = CAM_MSG[r.reason] || CAM_MSG.failed; setCamUi(); });
      });
      els.camStop.addEventListener('click', stopCamera);
      els.form.addEventListener('submit', function (ev) { ev.preventDefault(); var v = els.input.value; els.input.value = ''; scanner.submit(v); });
      els.next.addEventListener('click', function () { scanner.reset(); });
      els.retry.addEventListener('click', function () { scanner.retry(); });
      /* the camera must never keep running when the page is left, hidden or backgrounded */
      win.addEventListener('pagehide', stopCamera);
      doc.addEventListener('visibilitychange', function () { if (doc.visibilityState === 'hidden') stopCamera(); });
      function net() { els.net.hidden = win.navigator.onLine !== false; }
      win.addEventListener('online', net); win.addEventListener('offline', net); net();
      try {
        client.auth.onAuthStateChange(function (evt) { if (evt === 'SIGNED_OUT') { stopCamera(); scanner.dispose(); navigate(to); } });
      } catch (e) {}
      show(scanner.state);
      return { scanner: scanner, camera: camera, stopCamera: stopCamera };
    });
  }

  var api = { localParse: localParse, signInUrl: signInUrl, makeRpc: makeRpc, createScanner: createScanner, createCamera: createCamera,
    renderResult: renderResult, boot: boot, RPC_PATH: RPC_PATH, DEBOUNCE_MS: DEBOUNCE_MS };
  root.KilDoorScanner = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
