/* KEEPITIL Black Friday guest list: early-access signup popup (DRAFT).
 *
 * Early access Nov 23-26 2026, public sale Nov 27-30 2026 (Pacific Time).
 * Signups go to the EXISTING prod tables, no new DDL:
 *   - public.subscribers       (email unique, phone, source)  -> the list the team reads
 *   - public.marketing_contacts (email, source, landing_path, utm_*) -> attribution, best-effort
 * Both already allow anonymous INSERT (RLS "public subscribe" / "mc_insert"). Anonymous users cannot
 * read either table, so inserts use Prefer: return=minimal (no RETURNING, which would hit the SELECT policy).
 *
 * Include on a page with:  <script src="/assets/js/kil-bf-popup.js" defer></script>
 * Inline mode (landing page): <div id="kil-bf-inline"></div> is filled instead of opening a modal.
 * Skips: ?nopopup, signed-in checkout/auth paths, after the early window closes, and for visitors who
 * already signed up or dismissed it in the last 7 days.
 */
(function (root) {
  'use strict';

  var SUPA_URL = 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
  /* Public anon key, the same one the site already ships in index.html. */
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
  var SOURCE = 'bf2026-early-access';

  /* Pacific Standard Time (UTC-8) in late November. */
  var EARLY_START = Date.parse('2026-11-23T00:00:00-08:00');
  var EARLY_END   = Date.parse('2026-11-27T00:00:00-08:00');   // early access ends at the end of Nov 26
  var PUBLIC_END  = Date.parse('2026-12-01T00:00:00-08:00');   // public sale ends at the end of Nov 30

  var K_DONE = 'kil_bf26_done', K_SKIP = 'kil_bf26_skip';
  var SKIP_DAYS = 7;

  function phase(now) {
    now = now == null ? Date.now() : now;
    if (now < EARLY_START) return 'pre';
    if (now < EARLY_END) return 'early';
    if (now < PUBLIC_END) return 'public';
    return 'over';
  }
  function validEmail(s) { return typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim()); }
  function cleanPhone(s) {
    if (!s) return null;
    var d = String(s).replace(/[^\d+]/g, '');
    return /^\+?\d{10,15}$/.test(d) ? d : null;
  }
  function buildPayload(email, phone) {
    return { email: String(email).trim().toLowerCase(), phone: cleanPhone(phone), source: SOURCE };
  }
  function buildContact(email, loc, ref) {
    var q = {};
    try { new URLSearchParams(loc.search || '').forEach(function (v, k) { q[k] = v; }); } catch (e) {}
    return {
      email: String(email).trim().toLowerCase(), source: SOURCE,
      landing_path: String(loc.pathname || '/').slice(0, 200), referrer: ref ? String(ref).slice(0, 300) : null,
      utm_source: q.utm_source || null, utm_medium: q.utm_medium || null, utm_campaign: q.utm_campaign || null
    };
  }

  function post(fetchFn, table, body) {
    return fetchFn(SUPA_URL + '/rest/v1/' + table, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, Prefer: 'return=minimal' },
      body: JSON.stringify(body)
    });
  }
  /* Resolves {ok:true,dup:boolean} or {ok:false}. A 409 on subscribers = email already on the list. */
  function submit(fetchFn, email, phone, loc, ref) {
    return post(fetchFn, 'subscribers', buildPayload(email, phone)).then(function (r) {
      var dup = r.status === 409;
      if (!r.ok && !dup) return { ok: false };
      /* Attribution row: best effort, never blocks the signup. */
      try { post(fetchFn, 'marketing_contacts', buildContact(email, loc, ref)).catch(function () {}); } catch (e) {}
      return { ok: true, dup: dup };
    }, function () { return { ok: false }; });
  }

  /* ---------- UI ---------- */
  function store(op, k, v) { try { if (op === 'get') return root.localStorage.getItem(k); root.localStorage.setItem(k, v); } catch (e) {} return null; }

  var CSS = '#kil-bf{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(5,5,12,.78);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}' +
    '#kil-bf[hidden]{display:none}' +
    '.kilbf-card{box-sizing:border-box;position:relative;width:100%;max-width:420px;max-height:calc(100vh - 32px);overflow:auto;background:#0d0b16;color:#f2eefc;border:1px solid rgba(208,160,255,.45);border-radius:18px;padding:28px 22px 22px;box-shadow:0 0 40px rgba(208,160,255,.25);font-family:inherit;text-align:center}' +
    '.kilbf-tag{display:inline-block;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:#d0a0ff;border:1px solid rgba(208,160,255,.5);border-radius:99px;padding:4px 12px;margin-bottom:12px}' +
    '.kilbf-card h2{margin:0 0 8px;font-size:1.5rem;line-height:1.2}' +
    '.kilbf-card p{margin:0 0 14px;font-size:.95rem;line-height:1.5;color:#cfc8e6}' +
    '.kilbf-dates{font-size:.85rem;color:#f2eefc;background:rgba(208,160,255,.1);border-radius:10px;padding:8px 10px;margin-bottom:14px}' +
    '.kilbf-card input[type=email],.kilbf-card input[type=tel]{width:100%;box-sizing:border-box;margin:0 0 10px;padding:13px 14px;font-size:16px;color:#fff;background:#07060d;border:1px solid rgba(255,255,255,.2);border-radius:10px}' +
    '.kilbf-card input:focus-visible,.kilbf-card button:focus-visible,.kilbf-x:focus-visible{outline:2px solid #d0a0ff;outline-offset:2px}' +
    '.kilbf-go{width:100%;padding:14px;font-size:1rem;font-weight:700;color:#0d0b16;background:#d0a0ff;border:0;border-radius:10px;cursor:pointer}' +
    '.kilbf-go[disabled]{opacity:.6;cursor:default}' +
    '.kilbf-x{position:absolute;top:8px;right:10px;width:44px;height:44px;font-size:1.6rem;line-height:1;color:#cfc8e6;background:none;border:0;cursor:pointer}' +
    '.kilbf-fine{margin:10px 0 0;font-size:.72rem;line-height:1.4;color:#9a92b8}' +
    '.kilbf-fine a{color:#d0a0ff}' +
    '.kilbf-msg{min-height:1.2em;margin:8px 0 0;font-size:.9rem}' +
    '.kilbf-msg.err{color:#ff7a7a}.kilbf-msg.ok{color:#7fe0a0}' +
    '.kilbf-inline .kilbf-card{margin:0 auto;box-shadow:none}' +
    '@media (prefers-reduced-motion:no-preference){.kilbf-card{animation:kilbf-in .25s ease-out backwards}@keyframes kilbf-in{from{transform:translateY(10px)}to{transform:none}}}';

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function cardHTML(ph, inline) {
    var head = ph === 'early' ? 'Early access is open' : 'Get on the guest list';
    var sub = ph === 'early'
      ? 'Early access to our Black Friday drops is live until Nov 26. Join now and we will send your link.'
      : 'Black Friday early access opens Nov 23. Guest-list members get in first, before the public sale.';
    return '<div class="kilbf-card" role="' + (inline ? 'group' : 'dialog') + '"' + (inline ? '' : ' aria-modal="true"') + ' aria-labelledby="kilbf-h">' +
      (inline ? '' : '<button type="button" class="kilbf-x" aria-label="Close">&times;</button>') +
      '<div class="kilbf-tag">Black Friday guest list</div>' +
      '<h2 id="kilbf-h">' + esc(head) + '</h2><p>' + esc(sub) + '</p>' +
      '<div class="kilbf-dates"><strong>Early access:</strong> Nov 23&ndash;26 &nbsp;&middot;&nbsp; <strong>Public sale:</strong> Nov 27&ndash;30</div>' +
      '<form novalidate>' +
        '<label for="kilbf-email" class="kilbf-sr" style="position:absolute;left:-9999px">Email</label>' +
        '<input id="kilbf-email" type="email" name="email" inputmode="email" autocomplete="email" placeholder="Your email" required>' +
        '<label for="kilbf-phone" class="kilbf-sr" style="position:absolute;left:-9999px">Mobile number (optional)</label>' +
        '<input id="kilbf-phone" type="tel" name="phone" inputmode="tel" autocomplete="tel" placeholder="Mobile (optional)">' +
        '<button class="kilbf-go" type="submit">Join the guest list</button>' +
        '<div class="kilbf-msg" role="status" aria-live="polite"></div>' +
      '</form>' +
      '<p class="kilbf-fine">By joining you agree to our <a href="/terms.html" target="_blank" rel="noopener noreferrer">Terms</a> and <a href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a>. If you add a mobile number you agree to get a text when early access opens. Reply STOP to opt out. We do not sell your info.</p>' +
    '</div>';
  }

  function wire(box, close) {
    var form = box.querySelector('form'), msg = box.querySelector('.kilbf-msg'), btn = box.querySelector('.kilbf-go');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var em = form.email.value, ph = form.phone.value;
      msg.className = 'kilbf-msg';
      if (!validEmail(em)) { msg.textContent = 'Enter a valid email.'; msg.className = 'kilbf-msg err'; form.email.focus(); return; }
      if (ph && !cleanPhone(ph)) { msg.textContent = 'That mobile number does not look right. Fix it or leave it blank.'; msg.className = 'kilbf-msg err'; form.phone.focus(); return; }
      btn.disabled = true; msg.textContent = 'Joining...';
      submit(root.fetch.bind(root), em, ph, root.location, root.document.referrer).then(function (r) {
        btn.disabled = false;
        if (!r.ok) { msg.textContent = 'Something went wrong. Please try again.'; msg.className = 'kilbf-msg err'; return; }
        store('set', K_DONE, '1');
        msg.textContent = r.dup ? 'You are already on our list. We will include you.' : 'You are in. Watch your inbox for your early-access link.';
        msg.className = 'kilbf-msg ok';
        form.reset();
        if (close) setTimeout(close, 3500);
      });
    });
  }

  function openModal() {
    var doc = root.document, ph = phase();
    if (doc.getElementById('kil-bf')) return;
    var prev = doc.activeElement;
    var st = doc.createElement('style'); st.textContent = CSS; doc.head.appendChild(st);
    var box = doc.createElement('div'); box.id = 'kil-bf'; box.innerHTML = cardHTML(ph, false);
    doc.body.appendChild(box);
    function close(remember) {
      if (remember !== false) store('set', K_SKIP, String(Date.now()));
      box.remove(); st.remove(); doc.removeEventListener('keydown', onKey, true);
      if (prev && prev.focus) { try { prev.focus(); } catch (e) {} }
    }
    function onKey(e) {
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab') return;
      var f = box.querySelectorAll('input,button,a[href]'); if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    doc.addEventListener('keydown', onKey, true);
    box.addEventListener('click', function (e) { if (e.target === box) close(); });
    box.querySelector('.kilbf-x').addEventListener('click', function () { close(); });
    wire(box, function () { close(false); });
    box.querySelector('input').focus();
  }

  function mountInline(host) {
    var doc = root.document, ph = phase();
    if (ph === 'public' || ph === 'over') { host.innerHTML = '<p style="text-align:center">The Black Friday public sale is ' + (ph === 'public' ? 'live now' : 'over') + '. Thanks for being part of KEEPITIL.</p>'; return; }
    var st = doc.createElement('style'); st.textContent = CSS; doc.head.appendChild(st);
    host.className = (host.className + ' kilbf-inline').trim(); host.innerHTML = cardHTML(ph, true);
    wire(host, null);
  }

  function shouldAutoOpen(loc, nowMs) {
    if (phase(nowMs) === 'public' || phase(nowMs) === 'over') return false;
    if (/[?&]nopopup\b/.test(loc.search || '')) return false;
    if (/^\/(checkout|pay|auth|login|signup|scan|ticket|tickets|dashboard|early-access)(\/|\.html|$)/i.test(loc.pathname || '')) return false;
    if (store('get', K_DONE)) return false;
    var s = Number(store('get', K_SKIP));
    if (s && nowMs - s < SKIP_DAYS * 864e5) return false;
    return true;
  }

  function init() {
    var doc = root.document, host = doc.getElementById('kil-bf-inline');
    if (host) { mountInline(host); return; }
    if (!shouldAutoOpen(root.location, Date.now())) return;
    root.setTimeout(openModal, 5000);
  }

  var api = { phase: phase, validEmail: validEmail, cleanPhone: cleanPhone, buildPayload: buildPayload, buildContact: buildContact, submit: submit, shouldAutoOpen: shouldAutoOpen, SOURCE: SOURCE, EARLY_START: EARLY_START, EARLY_END: EARLY_END, PUBLIC_END: PUBLIC_END };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  else {
    root.KILBF = api;
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', init); else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
