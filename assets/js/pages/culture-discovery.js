/* KEEPITIL culture/index.html: inline script "discovery" moved verbatim to an external file (CSP: no executable inline script). */
/* ── CULTURE DESKTOP DISCOVERY RAIL (Founder 2026-09-05) ────────────────────────────────
   Desktop only, and it adds no data path: the list is built from the rows Culture has
   already loaded (__culAllRows / __culMediaRows), and the type filters are the SAME nodes
   moved into the rail, so ARTICLE / CREATE / VIDEO classification, voting, comments and
   playback are untouched. Below 861px this never runs and the mobile pager is unchanged. */
(function(){
  function desktop(){ try{ return window.matchMedia('(min-width:861px)').matches; }catch(e){ return false; } }

  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded',fn); }

  /* ⚠ THE DESKTOP TEST MUST NOT BE DECIDED ONCE, AT PARSE TIME (Founder 2026-09-06).
     It was, and a `return` at the top of the module made that verdict permanent. Any load
     where the viewport is not measurable yet - and a window opened narrow and then widened -
     left the rail unbuilt for the life of the page. The right column then fell back to the
     older #typebar / #discover pair, which is the layout the tabs were being clipped in:
     the clipping was never a CSS bug in the rail, it was the rail not existing.
     The check now runs at boot and again on resize, and boot is idempotent. */
  function boot(){
    if(!desktop()) return;
    var merge=document.querySelector('.merge'); if(!merge) return;
    if(document.getElementById('culRail')) return;

    var rail=document.createElement('aside');
    rail.id='culRail';
    /* Order is FILTERS -> SEARCH -> CONTENT (Founder 2026-09-05). "Browse" heads the
       filter group, so it leads; the typebar is adopted directly beneath it. */
    rail.innerHTML=
      '<div class="cr-h">Browse</div>'
      + '<div class="cr-search">'
      + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8c86a8" stroke-width="2">'
      + '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>'
      + '<input id="culSearch" type="search" placeholder="Search Culture…" autocomplete="off"/></div>'
      + '<div class="cr-h" id="cr-list-h">Up next</div>'
      + '<div class="cr-list" id="culRailList"></div>';
    merge.appendChild(rail);

    /* MOVE the existing typebar in. A copy would need its own handlers and would drift.
       It is rendered by Culture's own JS after DOMContentLoaded, so this keeps looking for it
       rather than assuming it is already there — the first attempt found nothing. */
    function adoptTypebar(){
      /* #culTypeBar is the real ARTICLE / CREATE / VIDEO control — three markup buttons
         already wired to setCulContentType(). Moving the node keeps that wiring and the
         culContentType vocabulary exactly as they are; nothing is rebuilt. */
      var bar=document.getElementById('culTypeBar');
      if(!bar || bar.parentElement===rail) return !!bar;
      rail.insertBefore(bar, rail.querySelector('.cr-search'));
      return true;
    }
    adoptTypebar();

    var listEl=document.getElementById('culRailList');
    var search=document.getElementById('culSearch');

    /* The rail drives ARTICLE / CREATE / VIDEO and nothing else. It used to include events,
       which are never rendered as feed cards, so half the list pointed at content the feed
       could not show - and those were exactly the rows that fell through hrefOf() to the
       dead /profile?slug= route. */
    /* THE LIST FOLLOWS THE ACTIVE TAB (Founder 2026-09-06). It listed every loaded row of
       the three kinds regardless of which tab was on, so selecting ARTICLES left a feed of
       13 articles beside a rail of 40 videos - two different answers to the same question. */
    var TPK={article:'Article', create:'Create', video:'Video'};
    function activeKind(){ return TPK[window.culContentType] || ''; }
    function rows(){
      /* __culMerged is the list the FEED itself renders from, and it is the only one that
         holds articles - __culAllRows carries events and __culMediaRows carries video, so
         reading those two could never produce an ARTICLE row. Falling back to the pair keeps
         the rail working if the merge has not happened yet. */
      var src = (window.__culMerged && window.__culMerged.length)
              ? window.__culMerged.slice()
              : (window.__culAllRows||[]).slice().concat((window.__culMediaRows||[]).slice());
      var want=activeKind();
      return src.filter(function(r){
        if(r.archived) return false;
        var k=kindOf(r);
        if(!(k==='Article'||k==='Create'||k==='Video')) return false;
        return want ? k===want : true;
      });
    }

    /* ── THE LIST DRIVES THE FEED; IT DOES NOT NAVIGATE (Founder 2026-09-06) ────────────
       Every item was an <a href> and clicking one left CULTURE - often to
       /profile?slug=..., which does not exist. An item now selects its content into
       the main feed, like an up-next list, and the page never unloads. */
    var VIEWED = Object.create(null);
    var CURRENT = '';
    function keyOf(r){ return kindOf(r)+'|'+titleOf(r); }
    /* current first, then anything unseen, then what has already been viewed */
    function ordered(list){
      var cur=[], fresh=[], seen=[];
      list.forEach(function(r){
        var k=keyOf(r);
        if(k===CURRENT) cur.push(r);
        else if(VIEWED[k]) seen.push(r);
        else fresh.push(r);
      });
      return cur.concat(fresh, seen);
    }
    var TP={Article:'article', Create:'create', Video:'video'};
    function selectType(kindLabel){
      var want=TP[kindLabel]; if(!want) return false;
      var bar=document.getElementById('culTypeBar'); if(!bar) return false;
      var btn=bar.querySelector('button[data-tp="'+want+'"]'); if(!btn) return false;
      if(btn.classList.contains('on')) return false;
      btn.click();
      return true;           /* the feed repaints asynchronously after this */
    }
    /* Move the chosen card to the head of the feed and start the feed there. The node is
       MOVED, not rebuilt, so its player, observers and interaction state survive. */
    function bringToFront(title){
      var feed=document.getElementById('community-feed'); if(!feed) return false;
      var cards=[].slice.call(feed.children);
      for(var i=0;i<cards.length;i++){
        var t=cards[i].querySelector('.kv-title');
        if(t && t.textContent.trim()===title){
          if(cards[i]!==feed.firstElementChild) feed.insertBefore(cards[i], feed.firstElementChild);
          var col=document.querySelector('.feedcol'); if(col) col.scrollTop=0;
          return true;
        }
      }
      return false;
    }
    function kindOf(r){
      if(r.kind==='article') return 'Article';
      if(r.kind==='create'||r.kind==='create_entry') return 'Create';
      if(r.kind==='video'||r.kind==='pixle'||r.media_kind==='video') return 'Video';
      if(r.kind==='event') return 'Event';
      return 'Post';
    }
    function titleOf(r){ var d=r.data||{}; return r.title||d.t||d.title||'Untitled'; }
    function thumbOf(r){ var d=r.data||{}; return window.kilVideoThumb(d.cover||d.img||r.thumbnail_url||d.thumbnail_url)||'/assets/images/blog-default.jpg'; }
    function whenOf(r){ try{ var t=new Date(r.published_at||r.created_at); if(!isNaN(t)) return t.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'}); }catch(e){} return ''; }
    function whoOf(r){ return r.author_name||r.creator_name||r.profile_slug||''; }
    function hrefOf(r){
      var d=r.data||{};
      if(r.kind==='article') return d.url||(d.slug?('/article/'+d.slug+'/'):'#');
      if(r.source_url||d.source_url) return r.source_url||d.source_url;
      if(r.vs_entry_id) return '/create/?view=entry&e='+r.vs_entry_id;
      return r.profile_slug?('/profile?slug='+encodeURIComponent(r.profile_slug)):'#';
    }
    function esc(v){ return String(v==null?'':v).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

    /* ⚠ REPAINT ONLY ON REAL CHANGE (Founder 2026-09-05).
       The rail used to rewrite its innerHTML on a 1.2s timer for 24s. Culture watches the
       WHOLE document — `new MutationObserver(scan).observe(document.documentElement,
       {childList:true, subtree:true})` — and scan() runs two full-document querySelectorAll
       passes. So every rail repaint fired a batch of childList mutations across ~4000 nodes
       and dragged the video scanner through the entire document with it, repeatedly. That is
       what froze the desktop tab; it was not iframe count (measured: one iframe, the
       one-player rule was already working).
       The rail now rewrites only when the data or the search term actually changed. */
    var lastSig='';
    function paint(force){
      var term=(search&&search.value||'').trim().toLowerCase();
      /* The active tab belongs in the signature. Without it, switching category changed
         neither row count nor search term, so paint() decided nothing had changed and kept
         the previous category's list on screen. */
      var sig=(window.__culMerged||[]).length+':'+(window.__culAllRows||[]).length+':'
              +(window.__culMediaRows||[]).length+':'+term+':'+(window.culContentType||'');
      if(!force && sig===lastSig) return;
      lastSig=sig;
      var all=rows().filter(function(r){
        if(!term) return true;
        return (titleOf(r)+' '+whoOf(r)+' '+kindOf(r)).toLowerCase().indexOf(term)!==-1;
      }).slice(0,40);
      if(!all.length){ listEl.innerHTML='<div class="cr-empty">'+(term?'Nothing matches that yet.':'Loading…')+'</div>'; return; }
      listEl.innerHTML=ordered(all).map(function(r){
        var k=keyOf(r);
        return '<button type="button" class="cr-item'+(k===CURRENT?' cr-cur':'')+(VIEWED[k]&&k!==CURRENT?' cr-seen':'')
          + '" data-key="'+esc(k)+'">'
          + '<img class="cr-thumb" loading="lazy" alt="" src="'+esc(thumbOf(r))+'" '
          + 'data-fb="src" data-fb-src="/assets/images/blog-default.jpg"/>'
          + '<div><div class="cr-kind">'+esc(kindOf(r))+'</div>'
          + '<div class="cr-title">'+esc(titleOf(r))+'</div>'
          + '<div class="cr-meta">'+esc([whoOf(r),whenOf(r)].filter(Boolean).join(' · '))+'</div></div></button>';
      }).join('');
    }

    listEl.addEventListener('click', function(ev){
      var it = ev.target && ev.target.closest ? ev.target.closest('.cr-item') : null;
      if(!it) return;
      ev.preventDefault();
      var key = it.getAttribute('data-key'); if(!key) return;
      var kind = key.slice(0, key.indexOf('|'));
      var title = key.slice(kind.length+1);
      CURRENT = key; VIEWED[key] = 1;
      var switched = selectType(kind);
      /* If the type changed, the feed rebuilds asynchronously, so the card may not exist for
         a beat. Retry briefly rather than guessing a delay; give up quietly if it never
         appears so a missing row can never wedge the list. */
      var tries = 0;
      (function place(){
        if(bringToFront(title)) return;
        if(++tries < 25) setTimeout(place, switched ? 120 : 60);
      })();
      paint(true);
    });

    if(search) search.addEventListener('input', function(){ paint(true); });
    /* The 1.2s settle poll stops once the data has arrived, so a tab pressed afterwards
       would never be picked up. Repaint on the click itself, after the feed has had a beat
       to rebuild. */
    var tbNow=document.getElementById('culTypeBar');
    if(tbNow) tbNow.addEventListener('click', function(ev){
      if(!ev.target || !ev.target.closest || !ev.target.closest('button[data-tp]')) return;
      setTimeout(function(){ paint(true); }, 60);
      setTimeout(function(){ paint(true); }, 600);
    });
    paint(true);
    /* The feed paints twice (text, then media); repaint the rail when rows arrive. */
    /* Poll only until the data has arrived and settled, then stop entirely. paint() is a
       no-op when nothing changed, so a quiet tick costs one string compare, not a repaint. */
    var tries=0, settled=0;
    var poll=setInterval(function(){
      adoptTypebar();
      var before=lastSig;
      paint();
      settled = (lastSig===before) ? settled+1 : 0;
      var haveData=(window.__culAllRows||[]).length || (window.__culMediaRows||[]).length;
      if((haveData && settled>=3) || ++tries>20) clearInterval(poll);
    }, 1200);
  }
  /* boot() is idempotent - it returns immediately once #culRail exists - so it is safe to
     attempt more than once. Resize alone is not enough: if the viewport is not measurable at
     parse time and the visitor never resizes the window, no event ever arrives and the rail
     would stay unbuilt. A short ladder covers the "metrics settle just after parse" case. */
  ready(boot);
  window.addEventListener('load', boot);
  window.addEventListener('resize', boot);
  window.addEventListener('orientationchange', boot);
  [250, 1000, 2500].forEach(function(ms){ setTimeout(boot, ms); });
})();
