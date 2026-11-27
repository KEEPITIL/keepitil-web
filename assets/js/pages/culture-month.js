/* KEEPITIL culture/index.html: inline script "month" moved verbatim to an external file (CSP: no executable inline script). */
/* ── CULTURE MOBILE: MONTH GROUPING + SECOND FILTER ROW (Founder 2026-09-06) ───────────
   THE MONTH HEADING IS NOT A SLIDE. The feed is scroll-snap-type:y mandatory with
   full-viewport cards, and "one swipe = one content item" is approved behaviour. A heading
   element between cards would either take a snap position (an extra swipe onto a blank
   screen) or be skipped unpredictably. So the heading is a single fixed label that reports
   the month of whichever item is currently on screen, and the FEED is what is grouped:
   rows are ordered so all of one month runs together before the next begins. Crossing a
   boundary changes the label, never the swipe count.

   ORDER IS NEWEST FIRST. Culture is published work, not a schedule, so the freshest item
   opens the feed and the label runs SEPTEMBER -> AUGUST as you go forward. Within a month
   the same rule applies. */
(function(){
  function mob(){ try{ return window.matchMedia('(max-width:860px)').matches; }catch(e){ return false; } }
  function mk(r){ var d=r&&(r.published_at||r.created_at||r.date); return d?String(d).slice(0,7):''; }
  function titleOf(r){ var d=(r&&r.data)||{}; return (r&&r.title)||d.t||d.title||''; }
  var MONTHS=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
              'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  function label(k){ return k ? MONTHS[parseInt(k.slice(5,7),10)-1]+' '+k.slice(0,4) : ''; }

  window.culYear='all'; window.culMonth='all';

  /* ── THE RAIL RUNS BACKWARD (Founder 2026-09-06) ──────────────────────────────────
     CULTURE ONLY. This mirrored DISCOVER and CREATE and ran twelve months FORWARD from the
     current one, which is right for a schedule and wrong for an archive: Culture is
     published work - editorial, media, Culture posts - so everything it holds is already
     behind us. Forward meant eleven empty chips and August 2026, which holds every article,
     sitting outside the default rail entirely. The rail now runs newest to oldest, matching
     the feed's own newest-first order.
     A chosen YEAR still shows that year's ordinary calendar, January to December, because
     someone who deliberately enters a historical year wants the whole of it.
     CREATE's forward rail is untouched: competitions genuinely are scheduled ahead. */
  function monthWindow(){
    var out=[], i, y, m;
    if(window.culYear!=='all'){
      for(i=1;i<=12;i++) out.push(window.culYear+'-'+String(i).padStart(2,'0'));
      return out;
    }
    var d=new Date();
    for(i=0;i<12;i++){
      y=d.getFullYear(); m=d.getMonth()-i;          /* minus: newest first, then back */
      y+=Math.floor(m/12); m=((m%12)+12)%12;        /* normalises across the year boundary */
      out.push(y+'-'+String(m+1).padStart(2,'0'));
    }
    return out;
  }
  function yearsIn(rows){
    var seen={}; (rows||[]).forEach(function(r){ var k=mk(r); if(k) seen[k.slice(0,4)]=1; });
    return Object.keys(seen).sort();
  }

  /* Called from applyCulFilters with the already type-filtered rows. */
  var lastRows=[];
  window.__culApplyMonth=function(rows){
    lastRows=(rows||[]).slice();
    var out=lastRows;
    if(window.culYear!=='all')  out=out.filter(function(r){ return mk(r).slice(0,4)===window.culYear; });
    if(window.culMonth!=='all') out=out.filter(function(r){ return mk(r)===window.culMonth; });
    out=out.slice().sort(function(a,b){
      var A=mk(a), B=mk(b);
      if(A!==B) return A<B?1:-1;                 /* newest month first */
      var da=String(a.published_at||a.created_at||''), db=String(b.published_at||b.created_at||'');
      return da<db?1:da>db?-1:0;                 /* newest first within the month */
    });
    window.__culOrder=out.map(function(r){ return {t:titleOf(r), k:mk(r)}; });
    /* label + date row removed 2026-09-22 — the sort above is kept. */
    return out;
  };

  /* ── the label ─────────────────────────────────────────────────────────────────────── */
  var tag=null, io=null;
  function tagEl(){
    if(tag && document.contains(tag)) return tag;
    tag=document.getElementById('culMonthTag');
    if(!tag){
      tag=document.createElement('div');
      tag.id='culMonthTag';
      tag.setAttribute('aria-live','polite');
      (document.body||document.documentElement).appendChild(tag);
    }
    return tag;
  }
  function setTag(k){
    var e=tagEl(), txt=label(k);
    if(!txt){ e.classList.remove('on'); return; }
    if(e.textContent!==txt) e.textContent=txt;
    e.classList.add('on');
  }
  function stampAndPaint(){
    var feed=document.getElementById('community-feed'); if(!feed) return;
    var order=window.__culOrder||[];
    var byTitle={}; order.forEach(function(o){ if(o.t) byTitle[o.t]=o.k; });
    var cards=[].slice.call(feed.children);
    cards.forEach(function(c,i){
      var t=c.querySelector('.kv-title');
      var k=(t && byTitle[t.textContent.trim()]) || (order[i]&&order[i].k) || '';
      if(k) c.setAttribute('data-mk',k);
    });
    observe(cards);
    /* Seed the label from the first card so it is correct before any scrolling. An empty
       feed - CREATE currently has no items - must not keep the previous category's month. */
    if(cards.length) setTag(cards[0].getAttribute('data-mk')||'');
    else { var e=tagEl(); e.classList.remove('on'); e.textContent=''; }
  }
  function observe(cards){
    if(io) io.disconnect();
    if(!('IntersectionObserver' in window)) return;
    io=new IntersectionObserver(function(entries){
      var best=null;
      entries.forEach(function(en){
        if(!en.isIntersecting) return;
        if(!best || en.intersectionRatio>best.intersectionRatio) best=en;
      });
      if(best) setTag(best.target.getAttribute('data-mk')||'');
    }, {threshold:[0.55,0.75]});
    cards.forEach(function(c){ io.observe(c); });
  }

  /* ── row 2: YEAR + rolling months ──────────────────────────────────────────────────── */
  function row2El(){
    var el=document.getElementById('culRow2');
    if(el) return el;
    var bar=document.getElementById('culTypeBar');
    if(!bar || !bar.parentElement) return null;
    el=document.createElement('div');
    el.id='culRow2';
    /* A SIBLING of #culTypeBar, not a wrapper around it: the desktop rail MOVES that node
       into itself, and wrapping it would break that adoption. Both rows carry the same
       show/hide rules keyed on body.cul-fbar, so they travel together. */
    bar.parentElement.insertBefore(el, bar.nextSibling);
    el.addEventListener('click', function(ev){
      var b=ev.target && ev.target.closest ? ev.target.closest('button[data-cm]') : null;
      if(!b) return;
      window.culMonth = (window.culMonth===b.getAttribute('data-cm')) ? 'all' : b.getAttribute('data-cm');
      if(window.applyCulFilters) window.applyCulFilters();
    });
    el.addEventListener('change', function(ev){
      var sel=ev.target; if(!sel || sel.id!=='culYearSel') return;
      window.culYear=sel.value;
      window.culMonth='all';           /* a month from the old window would filter to nothing */
      if(window.applyCulFilters) window.applyCulFilters();
    });
    return el;
  }
  function paintRow2(){
    if(!mob()) return;
    var el=row2El(); if(!el) return;
    var years=yearsIn(lastRows);
    var counts={};
    lastRows.forEach(function(r){ var k=mk(r); if(k) counts[k]=(counts[k]||0)+1; });
    var html='<span class="c2-dd"><select id="culYearSel" aria-label="Year">'
      + '<option value="all"'+(window.culYear==='all'?' selected':'')+'>ALL</option>'
      + years.map(function(y){ return '<option value="'+y+'"'+(window.culYear===y?' selected':'')+'>'+y+'</option>'; }).join('')
      + '</select></span>';
    html += monthWindow().map(function(k){
      var n=counts[k]||0;
      return '<button type="button" class="c2-mo'+(window.culMonth===k?' on':'')+(n?'':' c2-empty')+'" data-cm="'+k+'">'
        + MONTHS[parseInt(k.slice(5,7),10)-1] + (n?' <i>'+n+'</i>':'') + '</button>';
    }).join('');
    if(el.innerHTML!==html) el.innerHTML=html;
  }

  function boot(){
    if(!mob()) return;
    /* 1a + 1b (Founder 2026-09-22): the floating month label and the DATE filter row are
       gone. paintRow2()/stampAndPaint() are the only things that built them, so not calling
       them removes both without touching the month GROUPING + SORT above, which the feed
       order still depends on. window.culMonth stays 'all', so nothing is filtered out. */
  }
  if(document.readyState!=='loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
  /* no resize repaint: the date row no longer exists (2026-09-22). */
})();
