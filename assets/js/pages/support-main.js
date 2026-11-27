/* KEEPITIL support/index.html: inline script "main" moved verbatim to an external file (CSP: no executable inline script). */
/* Products shown here are the public, customer-facing ones. Add one entry to list a new
   product; the assistant's knowledge lives in keepitil-ai.js (KIL_SUPPORT_KB). */
(function(){
  var PRODUCTS = [
    { id:'wifi-remote', name:'WiFi Remote', note:'TV remote for iPhone · App Store' },
    { id:'tuitea',      name:'TUITEA',      note:'Private family app · App Store' },
    { id:'kmob',        name:'KMOB',        note:'Endless War game · App Store' },
    { id:'kaitarako',   name:'Kai Tarako',  note:'Kids learning · web' },
    { id:'fmw',         name:'Find My Weed', note:'Local weed finder · web' },
    { id:'pokasnap',    name:'PokaSnap',    note:'Photo game · beta' },
    { id:'kbeats',      name:'KBeats',      note:'Music game · beta' },
    { id:'kwars',       name:'K WARS',      note:'Strategy game · beta' },
    { id:'games',       name:'Other games', note:'KEEPITIL games' },
    { id:'general',     name:'KEEPITIL',    note:'Website & account' }
  ];
  /* Each product keeps its OWN legal documents; this page only links to them. */
  var LINKS = {
    'tuitea': [['Get TUITEA on the App Store','https://apps.apple.com/app/id6806472413'],['TUITEA Privacy Policy','/apps/tuitea/legal/privacy/'],['TUITEA Terms','/apps/tuitea/legal/terms/'],['Health information & Apple Health','/apps/tuitea/legal/health-privacy/'],['TUITEA help: sign-in, account deletion','/apps/tuitea/support/']],
    'wifi-remote': [['Get WiFi Remote on the App Store','https://apps.apple.com/app/id6790006312'],['WiFi Remote Privacy','/wifi-remote-privacy.html'],['Terms','/terms'],['Refund Policy','/refund']],
    'kmob': [['Get KMOB on the App Store','https://apps.apple.com/app/id6822852714'],['Privacy Policy','/privacy'],['Terms','/terms']],
    'kaitarako': [['Open Kai Tarako','/app/kaitarako/'],['Privacy Policy','/privacy'],['Terms','/terms']],
    'fmw': [['Open Find My Weed','/app/findmyweed/'],['Find My Weed Privacy','/app/findmyweed/privacy.html'],['Terms','/terms']],
    'pokasnap': [['PokaSnap Privacy','/games/pokasnap/privacy.html'],['PokaSnap help','/games/pokasnap/support.html']],
    'kbeats': [['KBeats Privacy','/games/kbeats/privacy/'],['KBeats Terms','/games/kbeats/terms/']],
    'kwars': [['Privacy Policy','/privacy'],['Terms','/terms']],
    'games': [['Privacy Policy','/privacy'],['Terms','/terms']],
    'general': [['Privacy Policy','/privacy'],['Terms','/terms'],['Refund Policy','/refund']]
  };
  /* ?product= accepts the short names other pages link with. */
  var ALIAS = { 'keepitil':'general', 'wifiremote':'wifi-remote', 'k-wars':'kwars', 'kwars1':'kwars', 'kai':'kaitarako', 'kai-tarako':'kaitarako', 'findmyweed':'fmw', 'find-my-weed':'fmw' };
  var TOPICS = [
    ['Getting Started','How do I get started?'],
    ['Connection & Device Help','I cannot find or connect my device'],
    ['Accounts & Family','I need help with my account'],
    ['Purchases & Billing','I have a question about a purchase'],
    ['Privacy & Safety','I have a privacy question'],
    ['Report a Problem','I want to report a problem'],
    ['Feedback & Feature Requests','I have feedback or a feature request']
  ];
  window.KIL_SUPPORT_MODE = true;
  /* Support is a utility page: no radio player (keepitil-ai.js loads it unless this is set). */
  window.__kilRadioInit = true;
  var q = new URLSearchParams(location.search).get('product');
  if (q && ALIAS[q]) q = ALIAS[q];
  var valid = PRODUCTS.some(function(p){ return p.id === q; });
  window.KIL_SUPPORT_PRODUCT = valid ? q : null;

  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  var prods = document.getElementById('prods');
  function renderProducts(){
    prods.innerHTML = PRODUCTS.map(function(p){
      return '<button type="button" class="prod" data-id="'+p.id+'" aria-pressed="'+(window.KIL_SUPPORT_PRODUCT===p.id)+'"><b>'+esc(p.name)+'</b><span>'+esc(p.note)+'</span></button>';
    }).join('');
  }
  renderProducts();
  var plinks = document.getElementById('plinks');
  var fProduct = document.getElementById('f-product');
  fProduct.innerHTML = '<option value="">Choose one</option>' + PRODUCTS.map(function(p){
    return '<option value="'+(p.id==='general'?'keepitil':p.id)+'">'+esc(p.name)+'</option>'; }).join('');
  function renderLinks(){
    var id = window.KIL_SUPPORT_PRODUCT, l = id && LINKS[id];
    if (!l) { plinks.hidden = true; return; }
    var p = PRODUCTS.filter(function(x){return x.id===id;})[0];
    plinks.innerHTML = '<b>'+esc(p.name)+'</b> &mdash; ' + l.map(function(x){ return '<a href="'+x[1]+'">'+esc(x[0])+'</a>'; }).join(' · ');
    plinks.hidden = false;
    fProduct.value = id === 'general' ? 'keepitil' : id;
  }
  renderLinks();
  /* ── Support request ──────────────────────────────────────────────────────────────────── */
  var form = document.getElementById('req'), result = document.getElementById('f-result'), send = document.getElementById('f-send');
  var shownAt = Date.now();
  var ENDPOINT = 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co/functions/v1/support-request';
  function say(kind, html){ result.className = 'msg ' + kind; result.innerHTML = html; }
  function fallback(why){
    say('err', esc(why) + ' You can also email <a href="mailto:info@keepitil.com">info@keepitil.com</a> and we will reply there.');
  }
  form.addEventListener('submit', function(e){
    e.preventDefault();
    var d = { product: fProduct.value, category: form.category.value, subject: form.subject.value.trim(),
              message: form.message.value.trim(), email: form.email.value.trim(), website: form.website.value,
              elapsed_ms: Date.now() - shownAt };
    if (!d.product) { fallback('Choose a product.'); fProduct.focus(); return; }
    if (!d.category) { fallback('Choose what you need help with.'); form.category.focus(); return; }
    if (d.subject.length < 3) { fallback('Add a short subject.'); form.subject.focus(); return; }
    if (d.message.length < 10) { fallback('Tell us a little more about what happened.'); form.message.focus(); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) { fallback('Enter an email address we can reply to.'); form.email.focus(); return; }
    send.disabled = true; send.textContent = 'Sending…'; result.className = ''; result.textContent = '';
    fetch(ENDPOINT, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(d) })
      .then(function(r){ return r.json().then(function(j){ return { status: r.status, j: j }; }); })
      .then(function(x){
        if (x.j && x.j.ok && x.j.reference) {
          say('ok', '<b>Thank you &mdash; your request was received.</b><br>Your reference number is <span class="ref">'+esc(x.j.reference)+'</span>. Please keep it; quote it if you email us. We will reply to '+esc(d.email)+'.');
          form.reset(); renderLinks();
        } else { fallback((x.j && x.j.error) || 'We could not send your request just now.'); }
      })
      .catch(function(){ fallback('We could not send your request just now.'); })
      .then(function(){ send.disabled = false; send.textContent = 'Send request'; result.focus && result.setAttribute('tabindex','-1'); });
  });
  function open(question){
    if (typeof window.KIL_CHAT_OPEN === 'function') { window.KIL_CHAT_OPEN(question); return; }
    location.href = 'mailto:info@keepitil.com';   // assistant failed to load: a person instead
  }
  prods.addEventListener('click', function(e){
    var b = e.target.closest('.prod'); if(!b) return;
    window.KIL_SUPPORT_PRODUCT = b.getAttribute('data-id');
    var u = new URL(location.href); u.searchParams.set('product', window.KIL_SUPPORT_PRODUCT);
    history.replaceState(null,'',u);
    renderProducts(); renderLinks();
    var p = PRODUCTS.filter(function(x){return x.id===window.KIL_SUPPORT_PRODUCT;})[0];
    open(p.id === 'general' ? 'keepitil.com account' : p.name);
  });
  document.getElementById('topics').innerHTML = TOPICS.map(function(t){
    return '<button type="button" class="chip" data-q="'+esc(t[1])+'">'+esc(t[0])+'</button>';
  }).join('');
  document.getElementById('topics').addEventListener('click', function(e){
    var b = e.target.closest('.chip'); if(b) open(b.getAttribute('data-q'));
  });
  document.getElementById('ask').addEventListener('click', function(){ open(); });
})();
