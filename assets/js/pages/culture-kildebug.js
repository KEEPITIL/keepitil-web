/* KEEPITIL culture/index.html: inline script "kildebug" moved verbatim to an external file (CSP: no executable inline script). */
(function(){
  try{ if(!/[?&]kildebug=1(?:&|$)/.test(location.search)) return; }catch(e){ return; }
  var el=document.createElement('div');
  el.id='kil-debug';
  el.style.cssText='position:fixed;left:6px;top:calc(var(--kil-safe-top,0px) + 6px);z-index:99999;'
    +'background:rgba(0,0,0,.86);color:#0f0;font:600 10px/1.35 ui-monospace,Menlo,monospace;'
    +'padding:6px 8px;border:1px solid #0f0;border-radius:4px;white-space:pre;pointer-events:none';
  document.body.appendChild(el);
  function v(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '(unset)'; }
  function tick(){
    var card=document.querySelector('#community-feed>.fcard');
    var nav=document.getElementById('kil-bnav');
    el.textContent=
      'safe-top  '+v('--kil-safe-top')+'\n'+
      'bnav-h    '+v('--kil-bnav-h')+'\n'+
      'kil-vh    '+v('--kil-vh')+'\n'+
      'innerH    '+window.innerHeight+'\n'+
      'card.offH '+(card?card.offsetHeight:'(none)')+'\n'+
      'navTop    '+(nav?Math.round(nav.getBoundingClientRect().top):'(none)')+'\n'+
      'cardBot   '+(card?Math.round(card.getBoundingClientRect().bottom):'(none)')+'\n'+
      'scrollY   '+Math.round(window.scrollY)+'\n'+
      (function(){
        var w=document.querySelector('#community-feed>.fcard .kil-vid-well');
        var f=w&&w.querySelector('iframe');
        if(!w) return 'well      (none)';
        var wr=w.getBoundingClientRect();
        var out='well      '+Math.round(wr.width)+'x'+Math.round(wr.height);
        if(f){ var fr=f.getBoundingClientRect(), cs=getComputedStyle(f);
          out+='\niframe    '+Math.round(fr.width)+'x'+Math.round(fr.height)
             +'\n f.w/h    '+cs.width+' / '+cs.height
             +'\n f.ar     '+cs.aspectRatio
             +'\n kv-ar    '+(getComputedStyle(w).getPropertyValue('--kv-ar').trim()||'(unset)')
             +'\n short?   '+(w.closest('.fcard').classList.contains('kv-short')?'yes':'no');
        } else out+='\niframe    (not mounted)';
        return out;
      })();
  }
  tick();
  setInterval(tick,500);
  window.addEventListener('resize',tick);
})();
