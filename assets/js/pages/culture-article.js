/* KEEPITIL culture/index.html: inline script "article" moved verbatim to an external file (CSP: no executable inline script). */
/* ── ARTICLE: MORE OPENS IN PLACE (Founder 2026-09-05) ──────────────────────────────────
   Enhancer, not a renderer: it decorates article cards after the universal template has run,
   so classification, voting, comments, the media pipeline and the card geometry are all
   untouched. Works at every width — the interaction model is the same on mobile and desktop,
   only the frame around it differs. */
(function(){
  function bodyFor(card){
    var pid=card.getAttribute('data-pid')||'';
    var map=window.__culArticleBodies||{};
    var raw=map[pid]||'';
    return (window.KilSafeHtml && KilSafeHtml.sanitize(raw)) || '';
  }
  function isArticle(card){
    var b=card.querySelector('.kv-badge');
    return !!b && /article/i.test(b.textContent||'');
  }
  /* ── THE ARTICLE TEXT LIVES IN THE PAGE, NOT THE ROW ────────────────────────────────
     blog_articles.body_html and .content are empty for every article — measured, all 13 — so
     the row carries an excerpt and nothing more. The prose only exists in the static page at
     the canonical route. Rather than duplicate it into the database, the sheet fetches that
     same page on first open and lifts <article class="art"> out of it: same origin, no CORS,
     no new data path, and /article/<slug>/ stays the single source of truth. Fetched once per
     card and cached, and only when the visitor actually asks to read. */
  function fetchBody(href){
    return fetch(href, {credentials:'same-origin'})
      .then(function(r){ return r.ok ? r.text() : ''; })
      .then(function(html){
        if(!html) return '';
        var doc=new DOMParser().parseFromString(html,'text/html');
        var art=doc.querySelector('article.art')||doc.querySelector('article');
        if(!art) return '';
        /* Strip anything that would fight the sheet or re-enter the page. */
        art.querySelectorAll('script,style,iframe,nav,header,footer').forEach(function(n){n.remove();});
        return (window.KilSafeHtml && KilSafeHtml.sanitize(art.innerHTML)) || '';
      })
      .catch(function(){ return ''; });
  }
  function decorate(card){
    if(card.__kvReadWired) return;
    if(!isArticle(card)) return;
    var well=card.querySelector('.kil-vid-well'); if(!well) return;
    var html=bodyFor(card);
    var titleEl=card.querySelector('.kv-title');
    var href=titleEl?titleEl.getAttribute('href'):'';
    if(!html && !/^\/article\//.test(href||'')) return;
    card.__kvReadWired=1;

    var layer=document.createElement('div');
    layer.className='kv-readlayer';
    var title=(card.querySelector('.kv-title')||{}).textContent||'';
    layer.innerHTML='<div class="kv-read-h"></div>';
    layer.querySelector('.kv-read-h').textContent=title;
    if(html){ var intro=document.createElement('div'); intro.innerHTML=html; layer.appendChild(intro); }
    well.appendChild(layer);

    var btn=document.createElement('button');
    btn.type='button'; btn.className='kv-more'; btn.textContent='More';
    btn.setAttribute('aria-expanded','false');
    well.appendChild(btn);

    /* The excerpt is a PLACEHOLDER, not the article, so its presence must not count as
       loaded — that is why the first version never fetched anything. */
    var loaded=false;
    btn.addEventListener('click', function(e){
      e.preventDefault(); e.stopPropagation();
      var open=card.classList.toggle('kv-open');
      btn.textContent=open?'Close':'More';
      btn.setAttribute('aria-expanded', open?'true':'false');
      /* Reading starts at the top of the piece, and the feed does not move underneath. */
      if(open){
        layer.scrollTop=0;
        if(!loaded && href){
          loaded=true;
          fetchBody(href).then(function(body){
            if(!body) return;
            var h=layer.querySelector('.kv-read-h');
            layer.innerHTML=''; if(h) layer.appendChild(h);
            var wrap=document.createElement('div'); wrap.innerHTML=body;
            layer.appendChild(wrap); layer.scrollTop=0;
          });
        }
      }
    });

    /* The sheet owns its own scrolling; the feed must not advance while reading. */
    layer.addEventListener('wheel', function(e){ e.stopPropagation(); }, {passive:true});
    layer.addEventListener('touchmove', function(e){ e.stopPropagation(); }, {passive:true});
  }
  function sweep(){
    var cards=document.querySelectorAll('#community-feed .fcard');
    for(var i=0;i<cards.length;i++) decorate(cards[i]);
  }
  function start(){
    sweep();
    /* Scoped to the feed, not the document: a document-wide observer is what made the
       desktop tab unhappy last time. */
    var box=document.getElementById('community-feed');
    if(box) new MutationObserver(sweep).observe(box,{childList:true});
  }
  if(document.readyState!=='loading') start(); else document.addEventListener('DOMContentLoaded',start);
})();
