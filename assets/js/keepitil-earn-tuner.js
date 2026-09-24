/* EARN PLAYLIST TUNER (Founder 2026-09-24: "i want to resize the section myself with the 3 sub
   section instructions, submission info, and the submitted image widget.")

   Opens on the Earn page itself with ?tune=1 — not a new page, the owner's rule. It tunes the
   REAL section as the signed-in owner sees it, which no one else can render.

   Every value here equals the fallback in keepitil-playlist-submit.js, so an untouched panel
   changes nothing. Values persist in this browser only; nothing reaches the live site until
   the Copy CSS block is shipped. .github/internal/tests/earn-tuner-coverage.mjs fails if the
   section reads a --kp-* size this panel does not offer, or the reverse. */
(function(){
  if(!/[?&]tune=1\b/.test(location.search)) return;
  if(window.__kilEarnTuner) return; window.__kilEarnTuner = 1;

  var SPEC = [
    ['Layout — the three columns', [
      ['--kp-col-info',  'Instructions width',     1.15, 0.2, 4,   0.05, 'fr'],
      ['--kp-col-form',  'Submission info width',  1.00, 0.2, 4,   0.05, 'fr'],
      ['--kp-col-card',  'Image widget width',     150,  80,  420, 1,    'px'],
      ['--kp-gap',       'Gap between columns',    26,   0,   80,  1,    'px']
    ]],
    ['Instructions', [
      ['--kp-h3',        'Title size',             1.04, 0.6, 2.4, 0.01, 'rem'],
      ['--kp-sub',       'Subtitle size',          0.74, 0.4, 1.6, 0.01, 'rem'],
      ['--kp-sub-mb',    'Space under subtitle',   14,   0,   48,  1,    'px'],
      ['--kp-steps-gap', 'Space between steps',    10,   0,   48,  1,    'px'],
      ['--kp-num',       'Step number circle',     26,   14,  64,  1,    'px'],
      ['--kp-num-fs',    'Step number text',       0.70, 0.4, 1.8, 0.01, 'rem'],
      ['--kp-step-title','Step title size',        0.72, 0.4, 1.8, 0.01, 'rem'],
      ['--kp-step-fs',   'Step text size',         0.68, 0.4, 1.6, 0.01, 'rem']
    ]],
    ['Submission info', [
      ['--kp-form-gap',  'Space between fields',   12,   0,   48,  1,    'px'],
      ['--kp-label-fs',  'Field label size',       0.58, 0.4, 1.4, 0.01, 'rem'],
      ['--kp-input-fs',  'Field text size',        0.83, 0.5, 1.6, 0.01, 'rem'],   /* 13.33px: what actually renders */
      ['--kp-input-pady','Field height padding',   11,   2,   32,  1,    'px'],
      ['--kp-input-padx','Field side padding',     12,   2,   40,  1,    'px'],
      ['--kp-input-radius','Field corner',         9,    0,   30,  1,    'px'],
      ['--kp-btn-fs',    'Submit text size',       0.83, 0.4, 1.6, 0.01, 'rem'],   /* 13.33px: what actually renders */
      ['--kp-btn-pady',  'Submit height padding',  12,   2,   36,  1,    'px'],
      ['--kp-btn-radius','Submit corner',          10,   0,   36,  1,    'px']
    ]],
    ['Image widget', [
      ['--kp-card-ratio','Shape (width ÷ height)', 0.6667, 0.4, 1.6, 0.0001, ''],
      ['--kp-card-radius','Corner',                12,   0,   48,  1,    'px'],
      ['--kp-card-icon', 'Icon size',              1.35, 0.6, 4,   0.01, 'rem'],
      ['--kp-card-text', 'Main text size',         0.68, 0.4, 1.6, 0.01, 'rem'],
      ['--kp-card-small','Small text size',        0.56, 0.3, 1.4, 0.01, 'rem']
    ]]
  ];
  /* Alignment is a choice, not a number: "start" leaves empty space under the shorter
     columns, "stretch" makes all three the same height. That empty space is the complaint. */
  var ALIGN = ['start','stretch','center','end'];
  var KEY = 'kil_earn_tuner_v1';
  var state = {};
  try{ state = JSON.parse(localStorage.getItem(KEY)||'{}') || {}; }catch(e){ state = {}; }

  var DEF = {}; SPEC.forEach(function(g){ g[1].forEach(function(f){ DEF[f[0]] = f; }); });
  var sheet = document.createElement('style'); sheet.id = 'kil-earn-tune';
  function fmt(name, v){ var f = DEF[name]; return (name==='--kp-card-ratio') ? String(+(+v).toFixed(4)) : (v + f[6]); }
  function changed(){
    var out = [];
    Object.keys(state).forEach(function(k){
      if(k==='--kp-align'){ if(state[k] && state[k] !== 'start') out.push(k+': '+state[k]+';'); return; }
      var f = DEF[k]; if(!f) return;
      if(Math.abs(+state[k] - f[2]) > 1e-9) out.push(k+': '+fmt(k, state[k])+';');
    });
    return out;
  }
  function apply(){
    var decl = changed();
    /* On .kps itself, appended last: the section defines its own variables on .kps, so an
       inherited :root value would lose to any that are ever added there. Same lesson as the
       radio's .kr-rail trap. */
    sheet.textContent = decl.length ? '.kps{' + decl.join('') + '}' : '';
    if(!sheet.parentNode) document.head.appendChild(sheet);
    var o = document.getElementById('ket-out');
    if(o) o.textContent = decl.length ? '.kps{\n  ' + decl.join('\n  ') + '\n}' : '/* nothing changed from the shipped values yet */';
    try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){}
  }

  var css = ''
    /* DOCKED ALONG THE BOTTOM, not the side. A side panel covered the Instructions column —
       the thing being tuned — and pushing the page aside instead would narrow it, so every
       fr column would be tuned at a width no visitor sees. Full width is kept; the section
       sits above the strip. It clears the radio bar by reading the bar's measured height. */
    + '#ket{position:fixed;left:12px;right:12px;bottom:calc(var(--kil-radio-h,45px) + 10px);height:44vh;'
    +   'z-index:10050;overflow:auto;'
    +   'background:rgba(10,12,11,.97);border:1px solid rgba(0,255,136,.3);border-radius:14px;'
    +   'padding:14px;color:#e8ecf1;font:14px/1.45 Inter,system-ui,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.6);}'
    + '#ket h1{margin:0 0 4px;font:900 11.5px/1.2 Inter,sans-serif;letter-spacing:.16em;color:#00ff88;text-transform:uppercase;}'
    + '#ket .sub{margin:0 0 12px;color:#8c93a3;font-size:10.5px;}'
    + '#ket-groups{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px;align-items:start;}'
    + '#ket .grp{border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:10px;margin:0;}'
    + '#ket .foot{display:grid;grid-template-columns:minmax(260px,340px) 1fr;gap:12px;align-items:start;margin-top:10px;}'
    + '#playlists{scroll-margin-top:140px;}'
    + '#ket .grp>h2{margin:0 0 8px;font:800 8.7px/1 Inter,sans-serif;letter-spacing:.14em;color:#8c93a3;text-transform:uppercase;}'
    + '#ket .row{display:grid;grid-template-columns:1fr 72px;gap:4px 8px;align-items:center;margin:0 0 9px;}'
    + '#ket label{font-size:10px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
    + '#ket label small{display:block;color:#8c93a3;font:8.5px ui-monospace,monospace;}'
    + '#ket input[type=number],#ket select{background:#0b0b12;color:#e8ecf1;border:1px solid rgba(255,255,255,.14);'
    +   'border-radius:6px;padding:4px 6px;font:600 10px ui-monospace,monospace;width:100%;}'
    + '#ket input[type=range]{grid-column:1/-1;width:100%;accent-color:#00ff88;margin:0;}'
    + '#ket .btns{display:flex;gap:8px;margin:10px 0 8px;}'
    + '#ket button{flex:1;padding:9px;border-radius:9px;cursor:pointer;font:800 9.5px Inter,sans-serif;'
    +   'letter-spacing:.08em;text-transform:uppercase;border:1px solid rgba(255,255,255,.2);background:transparent;color:#e8ecf1;}'
    + '#ket button.pri{background:#00ff88;border-color:#00ff88;color:#07130d;}'
    + '#ket pre{margin:0;white-space:pre-wrap;background:#07080a;border:1px solid rgba(255,255,255,.1);'
    +   'border-radius:8px;padding:8px;font:10px/1.5 ui-monospace,monospace;color:#b9f5d8;}'
    + '#ket .note{color:#8c93a3;font-size:9.5px;margin:8px 0 0;}'
    + '@media(max-width:900px){#ket{left:8px;right:8px;height:50vh;}#ket .foot{grid-template-columns:1fr;}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var p = document.createElement('aside'); p.id = 'ket';
  p.innerHTML = '<h1>Playlist section tuner</h1>'
    + '<p class="sub">Drag a slider; the real section resizes. Nothing reaches the live site until you send the CSS.</p>'
    + '<div id="ket-groups"></div>'
    + '<div class="foot"><div><div class="btns"><button class="pri" id="ket-copy" type="button">Copy CSS</button>'
    + '<button id="ket-reset" type="button">Reset</button><button id="ket-go" type="button">Show section</button></div>'
    + '<p class="note">Sign in first — the three parts only appear for a signed-in account.</p></div>'
    + '<pre id="ket-out"></pre></div>';
  function mount(){
    document.body.appendChild(p);
    var host = document.getElementById('ket-groups');
    var a = document.createElement('div'); a.className = 'grp';
    a.innerHTML = '<h2>Row alignment</h2><div class="row"><label>Column heights<small>--kp-align</small></label>'
      + '<select data-var="--kp-align">' + ALIGN.map(function(v){ return '<option value="'+v+'">'+v+'</option>'; }).join('') + '</select></div>';
    host.appendChild(a);
    var sel = a.querySelector('select'); sel.value = state['--kp-align'] || 'start';
    sel.onchange = function(){ state['--kp-align'] = sel.value; apply(); };
    SPEC.forEach(function(g){
      var box = document.createElement('div'); box.className = 'grp';
      box.innerHTML = '<h2>' + g[0] + '</h2>';
      g[1].forEach(function(f){
        var name=f[0], val = state[name]===undefined ? f[2] : state[name];
        var row = document.createElement('div'); row.className = 'row';
        row.innerHTML = '<label>' + f[1] + '<small>' + name + '</small></label>'
          + '<input type="number" data-var="' + name + '" step="' + f[5] + '" value="' + val + '">'
          + '<input type="range" data-var="' + name + '" min="' + f[3] + '" max="' + f[4] + '" step="' + f[5] + '" value="' + val + '">';
        var num = row.querySelector('input[type=number]'), rng = row.querySelector('input[type=range]');
        function set(v){ v = parseFloat(v); if(isNaN(v)) return; state[name] = v; num.value = v; rng.value = v; apply(); }
        num.addEventListener('input', function(){ set(num.value); });
        rng.addEventListener('input', function(){ set(rng.value); });
        box.appendChild(row);
      });
      host.appendChild(box);
    });
    document.getElementById('ket-copy').onclick = function(){
      var t = document.getElementById('ket-out').textContent, b = this;
      var done = function(){ b.textContent = 'Copied'; setTimeout(function(){ b.textContent = 'Copy CSS'; }, 1200); };
      try{ navigator.clipboard.writeText(t).then(done, function(){ window.prompt('Copy this:', t); }); }
      catch(e){ window.prompt('Copy this:', t); }
    };
    document.getElementById('ket-reset').onclick = function(){
      try{ localStorage.removeItem(KEY); }catch(e){}
      location.reload();
    };
    document.getElementById('ket-go').onclick = function(){
      var s = document.getElementById('playlists'); if(s) s.scrollIntoView({behavior:'smooth', block:'start'});
    };
    apply();
    var s = document.getElementById('playlists'); if(s) setTimeout(function(){ s.scrollIntoView({block:'start'}); }, 600);
  }
  if(document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
