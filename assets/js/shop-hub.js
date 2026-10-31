/* Prices and store links for /shop/ and /services/ come from /assets/data/offers.json.
   Default UTM tags are already in each href, so the links work with JavaScript off.
   If this page was opened with any utm_* param, outbound store links use that incoming
   set alone. None of the keepitil/site/shop defaults are added. */
(function(){
  var STORE = 'https://www.illestratedlifestyle.com';
  var DEFAULTS = {utm_source:'keepitil', utm_medium:'site', utm_campaign:'shop'};

  function incomingUtms(){
    var out = {};
    try{
      var q = new URLSearchParams(location.search);
      q.forEach(function(value, key){
        if(key.indexOf('utm_') === 0 && value) out[key] = value;
      });
    }catch(e){}
    return out;
  }

  function stripUtm(u){
    var drop = [];
    u.searchParams.forEach(function(_v, key){ if(key.indexOf('utm_') === 0) drop.push(key); });
    drop.forEach(function(key){ u.searchParams.delete(key); });
  }

  function withUtm(href, content){
    var u = new URL(href, STORE);
    if(u.hostname === 'illestratedlifestyle.com') u.hostname = 'www.illestratedlifestyle.com';
    stripUtm(u);
    var inc = incomingUtms();
    var keys = Object.keys(inc);
    if(keys.length){
      keys.forEach(function(key){ u.searchParams.set(key, inc[key]); });
    }else{
      u.searchParams.set('utm_source', DEFAULTS.utm_source);
      u.searchParams.set('utm_medium', DEFAULTS.utm_medium);
      u.searchParams.set('utm_campaign', DEFAULTS.utm_campaign);
      if(content) u.searchParams.set('utm_content', content);
    }
    return u.toString();
  }

  /* Any incoming utm_* replaces the whole tag set. Untagged visits stay as written. */
  function passThrough(root){
    var inc = incomingUtms();
    var keys = Object.keys(inc);
    if(!keys.length) return;
    (root || document).querySelectorAll('a[href*="illestratedlifestyle.com"]').forEach(function(a){
      try{
        var u = new URL(a.href);
        stripUtm(u);
        keys.forEach(function(key){ u.searchParams.set(key, inc[key]); });
        a.href = u.toString();
      }catch(e){}
    });
  }

  function money(n){
    var v = Number(n);
    if(!isFinite(v)) return '';
    return '$' + (Math.round(v) === v ? String(Math.round(v)) : v.toFixed(2));
  }
  function setText(root, field, value){
    var el = root.querySelector('[data-field="'+field+'"]');
    if(!el) return;
    if(value) el.textContent = value;
  }

  passThrough(document);

  fetch('/assets/data/offers.json', {cache:'no-cache'})
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(data){
      if(!data) return;
      (data.collections || []).forEach(function(c){
        var href = withUtm(c.path || c.url, c.utmContent || c.id);
        document.querySelectorAll('[data-collection="'+c.id+'"]').forEach(function(a){
          a.href = href;
        });
      });
      (data.offers || []).forEach(function(o){
        if(o.status && o.status !== 'live') return;
        var card = document.querySelector('[data-offer="'+o.id+'"]');
        if(!card) return;
        setText(card, 'name', o.name);
        setText(card, 'price', money(o.price));
        setText(card, 'delivery', o.delivery);
        setText(card, 'needs', o.needs);
        setText(card, 'notes', o.notes);
        var list = card.querySelector('[data-field="bullets"]');
        if(list && o.bullets && o.bullets.length){
          list.textContent = '';
          o.bullets.forEach(function(b){
            var li = document.createElement('li');
            li.textContent = b;
            list.appendChild(li);
          });
        }
        var buy = card.querySelector('[data-field="buy"]');
        if(buy && o.url){
          buy.href = withUtm(o.url, o.utmContent || o.id);
          buy.setAttribute('aria-label', 'Buy ' + o.name + ', ' + money(o.price));
        }
      });
      passThrough(document);
    })
    .catch(function(){});
})();
