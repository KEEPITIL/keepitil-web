/* Prices and store links for /shop/ and /services/ come from /assets/data/offers.json.
   The HTML is the no-JS fallback. When this file loads, the JSON wins. */
(function(){
  function money(n){
    var v = Number(n);
    if(!isFinite(v)) return '';
    return '$' + (Math.round(v) === v ? String(Math.round(v)) : v.toFixed(2));
  }
  function withUtm(href, content, data){
    var base = (data && data.store) || 'https://www.illestratedlifestyle.com';
    var u = new URL(href, base);
    if(u.hostname === 'illestratedlifestyle.com') u.hostname = 'www.illestratedlifestyle.com';
    var utm = (data && data.utm) || {};
    u.searchParams.set('utm_source', utm.utm_source || 'keepitil.com');
    u.searchParams.set('utm_medium', utm.utm_medium || 'site');
    u.searchParams.set('utm_campaign', utm.utm_campaign || 'shop-hub');
    if(content) u.searchParams.set('utm_content', content);
    return u.toString();
  }
  function setText(root, field, value){
    var el = root.querySelector('[data-field="'+field+'"]');
    if(el && value) el.textContent = value;
  }
  fetch('/assets/data/offers.json', {cache:'no-cache'})
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(data){
      if(!data) return;
      document.querySelectorAll('[data-trust]').forEach(function(el){
        if(data.trust) el.textContent = data.trust;
      });
      (data.collections || []).forEach(function(c){
        var href = withUtm(c.path || c.url, c.utmContent || c.id, data);
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
          buy.href = withUtm(o.url, o.id, data);
          buy.setAttribute('aria-label', 'Buy ' + o.name + ', ' + money(o.price));
        }
      });
    })
    .catch(function(){});
})();
