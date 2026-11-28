// Homepage layout v2: the home's sections that are drawn from real data, in the owner's order: 2 Prime ads, 3 Browse category, 4 Brands, 5 Delivery, 6 Storefronts, 7 non-retail ads
// (the licensed-category rows 9-14 and the regions grid are drawn by js/pages.js). Everything is a plain element with textContent; nothing is fetched except data/ads.json (empty by default),
// img/fmw/images.json (our own house graphics) and the listings the page already loaded. A slot with no real content shows OUR house ad / an honest call to action, never a made-up ad,
// brand, price or product. pages.js calls FMW_HOME.draw({ data, county, card, el, clear, HERE, claims }) each time the area changes.
(function () {
  'use strict';
  var C = window.FMW_COPY, F = window.FMW, doc = document, state = { ads: null, images: null, timers: {} };
  if (!C || !F) return;
  var LICENSE = /^[A-Z0-9]{1,5}-\d{5,9}(-[A-Z]{2,4})?$|^C\d{1,2}-\d{7}-LIC$/i;
  var CREATIVE = /^img\/[a-z0-9\/._-]+\.(svg|png|jpe?g|webp)$/i, DAY = /^\d{4}-\d{2}-\d{2}$/;
  var base = function () { return (window.FMW_CONFIG && window.FMW_CONFIG.basePath) || ''; };

  function once(url, ok) { return F.loadPart(F.fetchOf(window), url, ok).then(null, function () { return null; }); }
  function loadAds() { return state.ads ? Promise.resolve(state.ads) : once('data/ads.json', function (d) { return d && Array.isArray(d.ads); }).then(function (d) { state.house = (d && d.house) || []; return (state.ads = (d && d.ads) || []); }); }
  /** Our own house banners from data/ads.json 'house': a same-site image under img/ for both sizes and an alt text; anything else is ignored. */
  function houseAds(list) {
    return (Array.isArray(list) ? list : []).filter(function (x) { return x && typeof x.alt === 'string' && x.alt && typeof x.src === 'string' && CREATIVE.test(x.src) && typeof x.srcHalf === 'string' && CREATIVE.test(x.srcHalf); });
  }
  function loadImages() { return state.images ? Promise.resolve(state.images) : once('img/fmw/images.json', function (d) { return d && d.slots; }).then(function (d) { return (state.images = (d && d.slots) || {}); }); }

  /** The ads that are really running for this county today: a Prime or non-retail entry in data/ads.json with a same-site creative, alt text, a license number and a live date range. Anything else is ignored. */
  function activeAds(ads, slot, county, today) {
    var key = F.countyKey(county);
    return (ads || []).filter(function (a) {
      return a && a.slot === slot && typeof a.creative === 'string' && CREATIVE.test(a.creative) && typeof a.alt === 'string' && a.alt && typeof a.license === 'string' && LICENSE.test(a.license) &&
        (a.county === '*' || F.countyKey(a.county) === key) && DAY.test(String(a.start)) && DAY.test(String(a.end)) && a.start <= today && today <= a.end;
    });
  }

  /** The Weedmaps-style carousel: a row of large rounded 16:9 slides that scroll-snap, each about 3/4 of the width so the NEXT slide peeks in on the right. "Ad" top-right on a real ad (our own house
   *  graphics say "Find My Weed" and never "Ad"), the license number bottom-left. Swipe / scroll, previous / next buttons, a 6 s auto-advance that pauses on hover and focus and never runs under reduced motion. */
  function carousel(ctx, box, id, label, slides) {
    var el = ctx.el;
    if (state.timers[id]) { clearInterval(state.timers[id]); state.timers[id] = null; }
    ctx.clear(box);
    var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var car = el('div', 'ad-car'); car.setAttribute('role', 'group'); car.setAttribute('aria-roledescription', 'carousel'); car.setAttribute('aria-label', label);
    var track = el('div', 'ad-track'), nodes = [], cur = 0;
    track.setAttribute('tabindex', '0'); track.setAttribute('aria-label', label);
    // only the first Prime banner is on the first screen: it is eager and high priority; every other carousel image is lazy (it waits until it is near)
    slides.forEach(function (s, i) {
      var a = el(s.href ? 'a' : 'div', 'ad-slide'); if (s.href) a.href = s.href; a.setAttribute('aria-label', (i + 1) + ' / ' + slides.length + ': ' + s.alt);
      var im = el('img'); im.src = s.src; if (s.srcset) { im.setAttribute('srcset', s.srcset); im.setAttribute('sizes', '(min-width: 768px) 76vw, 86vw'); } im.alt = s.alt; im.width = 1220; im.height = 340; if (i || id !== 'home-ad-prime') im.loading = 'lazy'; else im.setAttribute('fetchpriority', 'high'); a.appendChild(im);
      a.appendChild(el('span', 'ad-tag' + (s.sponsored ? ' sponsored' : ''), s.tag));
      if (s.license) a.appendChild(el('span', 'ad-lic', C.license + ' ' + s.license));
      track.appendChild(a); nodes.push(a);
    });
    function show(i) {
      cur = (i + slides.length) % slides.length;
      var n = nodes[cur]; if (track.scrollTo) track.scrollTo({ left: n.offsetLeft - track.offsetLeft, behavior: reduced ? 'auto' : 'smooth' }); else track.scrollLeft = n.offsetLeft - track.offsetLeft;
    }
    car.appendChild(track);
    if (slides.length > 1) {
      // no previous / next buttons (owner order 2026-11-26): swipe / scroll, the focusable track with its focus ring, and the auto-advance (which pauses) move the slides
      var paused = false;
      if (!reduced) state.timers[id] = setInterval(function () { if (!paused) show(cur + 1); }, 6000);
      ['mouseenter', 'focusin', 'touchstart'].forEach(function (e) { car.addEventListener(e, function () { paused = true; }); });
      ['mouseleave', 'focusout'].forEach(function (e) { car.addEventListener(e, function () { paused = false; }); });
    }
    box.appendChild(car);
  }

  function bizHref(ctx) { return ctx.claims ? ctx.HERE('signup.html?as=business') : base() + '/for-business/'; }

  /** Sections 2 and 7: real running ads for the county, else OUR house ads (labelled as ours, with a call to advertise). */
  function houseSlides(ctx, house) { return house.map(function (x) { return { src: x.srcHalf, srcset: x.srcHalf + ' 1220w, ' + x.src + ' 2440w', alt: x.alt, href: bizHref(ctx), tag: C.adHouse, sponsored: false }; }); }
  /** LCP: the Prime banner is the page's largest paint, and it only needs data/ads.json, not the listings. So it is drawn as soon as the page script runs, without waiting for the listings index and the county
   *  file (which took the carousel from about 1 s to about 2.5 s on a slow phone). Only when it cannot differ from what draw() would draw: no Prime entry exists in data/ads.json at all (a real ad depends on
   *  the county, so then draw() decides) and there is at least one house banner. draw() then leaves the Prime carousel alone. */
  function drawPrimeEarly(ctx) {
    var sec = doc.getElementById('home-ad-prime'); if (!sec || state.primeEarly) return Promise.resolve(false);
    return loadAds().then(function (ads) {
      var house = houseAds(state.house), anyPrime = (ads || []).some(function (a) { return a && a.slot === 'prime'; });
      if (anyPrime || !house.length || state.primeEarly) return false;
      var box = sec.querySelector('.ad-box'); if (!box) return false;
      carousel(ctx, box, 'home-ad-prime', C.adPrimeLabel(C.locDefault), houseSlides(ctx, house));
      sec.hidden = false; state.primeEarly = true; return true;
    }).then(null, function () { return false; });
  }

  function drawAds(ctx, secId, slot, imagesKey, county, name) {
    var sec = doc.getElementById(secId); if (!sec) return Promise.resolve();
    if (slot === 'prime' && state.primeEarly) return Promise.resolve();   // already drawn by drawPrimeEarly(), and it is exactly what this call would draw
    var box = sec.querySelector('.ad-box'), cta = sec.querySelector('.ad-cta');
    return Promise.all([loadAds(), loadImages()]).then(function (r) {
      var now = new Date(), today = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2) + '-' + ('0' + now.getDate()).slice(-2);
      var real = activeAds(r[0], slot, county, today), slides, house = slot === 'prime' ? houseAds(state.house) : [];
      if (real.length) slides = real.map(function (a) { return { src: a.creative, alt: a.alt, href: /^https:\/\//.test(a.href || '') ? a.href : '', tag: C.adTag, sponsored: true, license: a.license }; });
      else if (house.length) slides = houseSlides(ctx, house);
      else slides = (r[1][imagesKey] || []).filter(function (x) { return CREATIVE.test(x.file); }).map(function (x) { return { src: x.file, alt: x.alt, href: bizHref(ctx), tag: C.adHouse, sponsored: false }; });
      if (!slides.length) { sec.hidden = true; return; }
      carousel(ctx, box, secId, slot === 'prime' ? C.adPrimeLabel(name) : C.adNonretailLabel, slides);
      if (cta) ctx.clear(cta);   // no "Prime spot for <County>" / "Advertise" buttons under the carousel (owner 2026-11-26)
      sec.hidden = false;
    }).then(function () {}, function () {});
  }

  /** Section 4: the brands carousel. SQUARE (1:1) slides, five visible, rotating. No real brand exists yet, so every slot is the honest house tile "Your brand here / Claim a brand page" (a link to the business sign-up);
   *  never a made-up brand name. When claimed brands exist they will fill these slots. Auto-rotates every 5 s (pauses on hover / focus / touch, never under reduced motion); previous / next sit below. */
  function brandCarousel(ctx, box, brands) {
    var el = ctx.el, N = 6, reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (state.timers.brands) { clearInterval(state.timers.brands); state.timers.brands = null; }
    var car = el('div', 'brand-car'), track = el('ul', 'brand-track'), cur = 0, items = [];
    track.setAttribute('tabindex', '0'); track.setAttribute('aria-label', C.brandsTitle);
    // real approved brands first (up to five; behind site.json brandsPublic), then the house tile "Your brand here / Claim a brand page" for the rest, so there is always one
    var real = (brands || []).slice(0, N - 1);
    for (var i = 0; i < N; i++) {
      var li = el('li', 'brand-slide'), a;
      if (i < real.length && window.FMW_BRANDS) { a = window.FMW_BRANDS.tile(doc, window, real[i], 'brand-tile brand-real', function (s) { return ctx.HERE ? ctx.HERE(window.FMW_BRANDS.href(s)) : window.FMW_BRANDS.href(s); }); }
      else {
        a = el('a', 'brand-tile'); a.href = bizHref(ctx);
        var plus = el('span', 'brand-plus', '+'); plus.setAttribute('aria-hidden', 'true');
        a.appendChild(plus); a.appendChild(el('span', 'brand-here', C.brandHere)); a.appendChild(el('span', 'brand-claim', C.brandsCtaLink));
      }
      li.appendChild(a); track.appendChild(li); items.push(li);
    }
    function show(i) { cur = (i + N) % N; var n = items[cur]; if (track.scrollTo) track.scrollTo({ left: n.offsetLeft - track.offsetLeft, behavior: reduced ? 'auto' : 'smooth' }); else track.scrollLeft = n.offsetLeft - track.offsetLeft; }
    car.appendChild(track);
    var paused = false;
    if (!reduced) state.timers.brands = setInterval(function () { if (!paused) show(cur + 1 > N - 5 ? 0 : cur + 1); }, 5000);
    ['mouseenter', 'focusin', 'touchstart'].forEach(function (e) { car.addEventListener(e, function () { paused = true; }); });
    ['mouseleave', 'focusout'].forEach(function (e) { car.addEventListener(e, function () { paused = false; }); });
    box.appendChild(car);
  }

  /** Section 3 (product categories, our own tiles) and 4 (brands: one honest call to action, nothing made up). */
  function drawTiles(ctx) {
    var cats = doc.getElementById('home-products'), brands = doc.getElementById('home-brands');
    var brandsP = window.FMW_BRANDS ? window.FMW_BRANDS.list(window, 5).then(function (b) { return b; }, function () { return []; }) : Promise.resolve([]);
    return Promise.all([loadImages(), brandsP]).then(function (both) {
      var img = both[0], realBrands = both[1];
      if (cats) {
        var ul = cats.querySelector('ul'); ctx.clear(ul); ul.setAttribute('tabindex', '0'); ul.setAttribute('aria-label', C.productsTitle);   // a sideways-scrolling row is a keyboard stop, named
        (img.section3 || []).forEach(function (x) {   // Weedmaps-style: the NAME on the left (real text), our own icon on the right (the tile image, cropped to its icon)
          var li = ctx.el('li', 'prod-card'), box = ctx.el('div', 'prod-in'), ic = ctx.el('span', 'prod-img'), im = ctx.el('img');
          box.appendChild(ctx.el('span', 'prod-name', C.productName[x.id] || '')); im.src = x.file; im.alt = ''; im.width = x.width; im.height = x.height; im.loading = 'lazy'; ic.setAttribute('aria-hidden', 'true'); ic.appendChild(im); box.appendChild(ic); li.appendChild(box); ul.appendChild(li); });
        cats.hidden = !ul.children.length;
      }
      if (brands) {
        var box = brands.querySelector('.brand-cta'); ctx.clear(box); brandCarousel(ctx, box, realBrands);
        brands.hidden = false;
      }
    }).then(function () {}, function () {});
  }

  /** Sections 5 and 6: a carousel of the county's licensed delivery services / storefronts (the shared card, so the report link is on each) + View all to the real county page. */
  function drawRow(ctx, secId, kind, county, name, rows) {
    var sec = doc.getElementById(secId); if (!sec) return;
    var ul = sec.querySelector('ul'), head = sec.querySelector('h2'), va = sec.querySelector('a.seeall'), none = sec.querySelector('.row-none'), key = F.countyFileKey(county), folder = kind === 'delivery' ? 'delivery' : 'dispensaries';
    ctx.clear(ul); head.textContent = kind === 'delivery' ? C.homeDeliveryTitle(name) : C.homeStorefrontTitle(name);
    var shown = rows.slice(0, 12);
    shown.forEach(function (r, i) { ul.appendChild(ctx.card(r, i + 1)); });
    ul.setAttribute('tabindex', '0'); ul.setAttribute('aria-label', head.textContent);
    none.hidden = !!rows.length; none.textContent = rows.length ? '' : (kind === 'delivery' ? C.homeDeliveryNone(name) : C.homeStorefrontNone(name));
    ul.hidden = !rows.length;
    va.hidden = !rows.length; va.href = folder + '/' + key + '/'; va.textContent = C.industryViewAll; va.setAttribute('aria-label', C.homeViewAllLabel(kind === 'delivery' ? C.homeDeliveryTitle(name) : C.homeStorefrontTitle(name)));
    sec.hidden = false;
  }

  function draw(ctx) {
    if (!ctx || !ctx.data || !ctx.county) return Promise.resolve([]);
    var name = C.countyName(String(ctx.county).replace(/\s+county$/i, '')), now = new Date();
    var waits = [drawAds(ctx, 'home-ad-prime', 'prime', 'section2', ctx.county, name), drawTiles(ctx)];
    var all = F.search(ctx.data, { county: ctx.county }, now).results || [];
    drawRow(ctx, 'home-delivery', 'delivery', ctx.county, name, all.filter(function (r) { return r.listing.delivery === true && !r.listing.storefront; }));
    drawRow(ctx, 'home-storefronts', 'storefront', ctx.county, name, all.filter(function (r) { return r.listing.storefront === true; }));
    waits.push(drawAds(ctx, 'home-ad-nonretail', 'nonretail', 'section7', ctx.county, name));
    return Promise.all(waits);   // resolves when every section has decided (drawn or hidden); js/pages.js reveals the home then
  }
  window.FMW_HOME = { draw: draw, drawPrimeEarly: drawPrimeEarly, activeAds: activeAds, houseAds: houseAds };
})();
