// The map page (map/): a MapLibre GL map (vendored under js/vendor/, loaded on this page only) beside the card list. Pins only for rows with a real point; a pin opens a small popup with the SAME card.
// The basemap is OpenFreeMap's muted light style (the one tile host the map page's policy allows). Every text goes in with textContent only (the popup is the page's own card node).
(function () {
  var W = window, doc = document, ML = function () { return W.maplibregl; };
  var STYLE = 'https://tiles.openfreemap.org/styles/positron';   // light, muted grey street map; OpenStreetMap data, attribution shown by the map itself
  var CA = { center: [-119.6, 37.3], zoom: 5.3 };
  var map = null, ready = false, pending = null, popup = null, state = { rows: [], opts: null };
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  /** Pins only for rows with a real point inside California's box; delivery rows (county only) have none. Pure: also used by the tests. */
  function points(rows) {
    var out = [];
    (rows || []).forEach(function (r, i) {
      var l = r && r.listing, lat = l ? num(l.lat) : null, lng = l ? num(l.lng) : null;
      if (lat === null || lng === null || lat < 32 || lat > 42.1 || lng < -124.6 || lng > -114) return;
      out.push({ i: i, id: String(l.id), lng: lng, lat: lat });
    });
    return out;
  }
  function collection(pts) { return { type: 'FeatureCollection', features: pts.map(function (p) { return { type: 'Feature', id: p.i, properties: { id: p.id, i: p.i }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } }; }) }; }
  /** The auto-focus: the box of the pins on screen (a county / city / state choice re-draws the results, so the map follows). null = no pins. */
  function bounds(pts) {
    if (!pts.length) return null;
    var b = [pts[0].lng, pts[0].lat, pts[0].lng, pts[0].lat];
    pts.forEach(function (p) { b[0] = Math.min(b[0], p.lng); b[1] = Math.min(b[1], p.lat); b[2] = Math.max(b[2], p.lng); b[3] = Math.max(b[3], p.lat); });
    return b;
  }
  function token(name, fallback) { try { var v = W.getComputedStyle(doc.documentElement).getPropertyValue(name).trim(); return v || fallback; } catch (e) { return fallback; } }
  function fail(box) { box.hidden = false; box.textContent = ''; var p = doc.createElement('p'); p.className = 'muted map-note'; p.textContent = state.opts.C.mapPage.loadFailed; box.appendChild(p); }
  function closePopup() { if (popup) { popup.remove(); popup = null; } }
  function open(box, idx) {
    var r = state.rows[idx]; if (!r || !state.opts) return;
    var li = state.opts.card(r, idx + 1), l = r.listing;
    closePopup();
    var holder = doc.createElement('div'); holder.className = 'map-popup'; holder.appendChild(li);
    popup = new (ML().Popup)({ closeButton: true, closeOnClick: true, maxWidth: '340px', offset: 12 }).setLngLat([l.lng, l.lat]).setDOMContent(holder).addTo(map);
    var x = box.querySelector('.maplibregl-popup-close-button'); if (x) x.setAttribute('aria-label', state.opts.C.mapPage.popupClose);
    if (state.opts.onSelect) state.opts.onSelect(String(l.id));
  }
  function apply(box) {
    var pts = points(state.rows), src = map.getSource('rows');
    if (src) src.setData(collection(pts));
    closePopup();
    // results with no map point at all (the delivery services: the state lists the county only): say so, never an empty map without a word
    var note = box.querySelector('.map-empty');
    if (!pts.length && state.rows.length) { if (!note) { note = doc.createElement('p'); note.className = 'map-empty muted'; box.appendChild(note); } note.textContent = state.opts.C.mapPage.noPoints; }
    else if (note) note.parentNode.removeChild(note);
    var b = bounds(pts);
    if (b) {
      if (pts.length === 1 || (b[0] === b[2] && b[1] === b[3])) map.easeTo({ center: [b[0], b[1]], zoom: 14, duration: 400 });
      else map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 48, maxZoom: 14, duration: 500 });
    } else map.easeTo({ center: CA.center, zoom: CA.zoom, duration: 400 });
  }
  // the worker sits next to the library file on this same site (worker-src 'self'): its absolute URL is read from the library's own <script>
  function workerUrl() {
    var tags = doc.getElementsByTagName('script');
    for (var i = 0; i < tags.length; i++) { var src = tags[i].getAttribute('src') || ''; if (/maplibre-gl-csp\.js/.test(src)) return new URL(src.replace(/maplibre-gl-csp\.js.*$/, 'maplibre-gl-csp-worker.js'), doc.baseURI).href; }
    return new URL('js/vendor/maplibre-gl-csp-worker.js', doc.baseURI).href;
  }
  function build(box) {
    var lib = ML();
    lib.setWorkerUrl(workerUrl());
    var host = doc.createElement('div'); host.className = 'map-canvas'; box.textContent = ''; box.appendChild(host);
    map = new lib.Map({ container: host, style: STYLE, center: CA.center, zoom: CA.zoom, attributionControl: { compact: true }, cooperativeGestures: false, dragRotate: false, pitchWithRotate: false });
    map.touchZoomRotate.disableRotation();
    if (W.ResizeObserver) new W.ResizeObserver(function () { if (map) map.resize(); }).observe(box);
    map.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right');
    map.on('error', function (e) { if (!ready && e && e.error && !map.isStyleLoaded()) { /* the tile host is unreachable: the list still works */ } });
    map.on('load', function () {
      ready = true; map.resize();
      var c = token('--btn-bg', '#16a34a'), edge = token('--btn-edge', '#0f6b34');
      map.addSource('rows', { type: 'geojson', data: collection([]) });
      map.addLayer({ id: 'pins', type: 'circle', source: 'rows', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 4, 12, 8, 16, 11], 'circle-color': c, 'circle-stroke-color': edge, 'circle-stroke-width': 2 } });
      map.on('click', 'pins', function (e) { var f = e.features && e.features[0]; if (f) open(box, f.properties.i); });
      map.on('mouseenter', 'pins', function () { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'pins', function () { map.getCanvas().style.cursor = ''; });
      if (pending) { var p = pending; pending = null; apply(box); }
    });
  }
  /** rows = the result rows ({ listing }); opts = { C, card(row, rank), onSelect(id) }. Builds the map once, then only swaps the pins and re-focuses. */
  function draw(box, rows, opts) {
    state.rows = rows || []; state.opts = opts; box.hidden = false;
    if (!ML()) { fail(box); return; }
    try {
      if (!map) { build(box); pending = true; return; }
      if (ready) apply(box); else pending = true;
    } catch (e) { fail(box); }
  }
  // the phone's List / Map buttons show and hide the map's box: it must re-measure itself
  doc.addEventListener('click', function (e) { var b = e.target && e.target.closest ? e.target.closest('[data-view]') : null; if (b && map) W.setTimeout(function () { map.resize(); }, 60); });
  W.FMW_MAPVIEW = { draw: draw, points: points, bounds: bounds, collection: collection, STYLE: STYLE };
})();
