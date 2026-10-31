/* Traffic Pop 1.1 menus (Luna's spec §9.4). Runs after app.js; only rearranges and decorates what
   the game already rendered (nodes keep their own click handlers), so gameplay and saves are untouched.
   - home: navy top bar (stars), static board preview drawn with the game's own car kit, LEVELS/SETTINGS
   - level map: each area's ten nodes laid out as a snake, 4 per row, joined by a path */
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  function stars() {
    try { var s = JSON.parse(localStorage.getItem('trafficpop.save.v1') || '{}').stars || {};
      return Object.keys(s).reduce(function (n, k) { return n + (s[k] || 0); }, 0); } catch (e) { return 0; }
  }
  function home() {
    var title = document.querySelector('#map .title'); if (!title || title.dataset.tp) return; title.dataset.tp = '1';
    var top = document.createElement('div'); top.className = 'tp-top';
    top.innerHTML = '<span><svg viewBox="-1.1 -1.1 2.2 2.2" aria-hidden="true"><path d="M0-1L.24-.33H.95L.38.1.59.8 0 .38-.59.8-.38.1-.95-.33H-.24Z"/></svg> <b id="tpStars">0</b></span><span>LEVEL <b id="tpLevel">1</b></span>';
    title.parentNode.insertBefore(top, title);
    var pv = document.createElement('div'); pv.className = 'tp-preview'; pv.setAttribute('aria-hidden', 'true');
    var cars = [['car', 'red', 'up', 0, 1], ['van', 'blue', 'right', 1, 0], ['car', 'yellow', 'down', 3, 1], ['bus', 'green', 'up', 4, 0], ['car', 'purple', 'left', 2, 2]];
    var K = window.TPKit, len = { car: 1, van: 2, bus: 3 }, deg = { up: 0, right: 90, down: 180, left: 270 };
    if (K) cars.forEach(function (c) {
      var L = len[c[0]], v = document.createElement('div'), cell = 50, vert = c[2] === 'up' || c[2] === 'down';
      var cx = (c[3] + (vert ? .5 : L / 2)) * cell, cy = (c[4] + (vert ? L / 2 : .5)) * cell;
      v.className = 'veh'; v.style.cssText = 'left:' + (cx - cell / 2) + 'px;top:' + (cy - L * cell / 2) + 'px;height:' + (L * cell) + 'px;transform:rotate(' + deg[c[2]] + 'deg)';
      v.innerHTML = K.Bo(c[0], c[1], c[2], false); pv.appendChild(v);
    });
    title.insertBefore(pv, title.querySelector('.logo').nextSibling);
    var sec = document.createElement('div'); sec.className = 'tp-sec';
    sec.innerHTML = '<button class="tp-btn blue" id="tpLevels">LEVELS</button><button class="tp-btn orange" id="tpSettings">SETTINGS</button>';
    title.appendChild(sec);
    sec.querySelector('#tpLevels').onclick = openMap;
    // §9.4 level map is its own screen: navy top bar with the current area, a back button, and the
    // game's own level buttons (moved, not copied, so their click handlers and the game's redraws keep working).
    var bar = document.createElement('div'); bar.className = 'tp-mapbar'; bar.id = 'tpMapBar';
    bar.innerHTML = '<button class="tp-back" id="tpBack" aria-label="Back to home"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg></button><span id="tpMapTitle">LEVELS</span>';
    var lvls = document.getElementById('levels'); lvls.parentNode.insertBefore(bar, lvls);
    bar.querySelector('#tpBack').onclick = closeMap;
    sec.querySelector('#tpSettings').onclick = function () { window.TP && TP.settings && TP.settings(); };
  }
  function openMap() {
    document.documentElement.classList.add('tp-map-open');
    snake();
    var c = document.querySelector('.lv.current'); if (c) c.scrollIntoView({ block: 'center' });
  }
  function closeMap() { document.documentElement.classList.remove('tp-map-open'); window.scrollTo(0, 0); }
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMap(); });

  function snake() {
    var box = document.getElementById('levels'); if (!box) return;
    var el = document.getElementById('tpStars'); if (el) el.textContent = stars();
    var cur = box.querySelector('.lv.current b'), lv = document.getElementById('tpLevel'); if (cur && lv) lv.textContent = cur.textContent;
    var area = box.querySelector('.lv.current') ? box.querySelector('.lv.current').closest('.row') : null, head = area && (area.nextElementSibling && area.nextElementSibling.tagName === 'H3' ? area.nextElementSibling : area.previousElementSibling), mt = document.getElementById('tpMapTitle');
    if (mt && head) { var nm = head.querySelector('span') ? head.querySelector('span').textContent : head.textContent, rg = head.querySelector('small'); mt.innerHTML = nm.toUpperCase() + (rg ? ' <b>' + rg.textContent + '</b>' : ''); }
    var save = {}; try { save = JSON.parse(localStorage.getItem('trafficpop.save.v1') || '{}'); } catch (e) {}
    // The map climbs: areas stack bottom-up (CSS column-reverse), so each area's heading is moved
    // after its row in the DOM, which puts it visually on top of its own area.
    box.querySelectorAll('.row').forEach(function (row) {
      var h = row.previousElementSibling;
      if (h && h.tagName === 'H3' && !h.dataset.tpMoved) { h.dataset.tpMoved = '1'; row.parentNode.insertBefore(h, row.nextSibling); }
    });
    box.querySelectorAll('.row').forEach(function (row) {
      var nodes = Array.prototype.slice.call(row.querySelectorAll('.lv')); if (!nodes.length) return;
      var W = row.clientWidth || 360, cols = 4, step = Math.min(150, W / cols * 1.1), colW = W / cols;
      var pts = nodes.map(function (n, i) {
        var r = Math.floor(i / cols), c = i % cols; if (r % 2) c = cols - 1 - c;
        return [colW * (c + .5), r];
      });
      var rows = Math.ceil(nodes.length / cols);
      pts = pts.map(function (p) { return [p[0], 50 + (rows - 1 - p[1]) * step * .75]; }); // bottom-up
      var bottom = 50 + (rows - 1) * step * .75;
      row.style.height = (bottom + 70) + 'px';
      nodes.forEach(function (n, i) {
        var sz = n.classList.contains('current') ? 76 : 60;
        n.style.left = (pts[i][0] - sz / 2) + 'px'; n.style.top = (pts[i][1] - sz / 2) + 'px';
        // Unlocked and not the current level means it has been cleared (a clear always earns a star).
        if (!n.classList.contains('locked') && !n.classList.contains('current')) n.classList.add('done');
      });
      var d = 'M' + pts.map(function (p) { return p[0] + ' ' + p[1]; }).join('L');
      var svg = row.querySelector('.tp-path') || row.insertBefore(document.createElementNS(NS, 'svg'), row.firstChild);
      svg.setAttribute('class', 'tp-path'); svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML = '<path d="' + d + '" fill="none" stroke="#FFFFFF" stroke-opacity=".55" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>'
        + '<path d="' + d + '" fill="none" stroke="#0B1B3A" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round"/>';
    });
  }
  function run() { home(); snake(); }
  new MutationObserver(function () { requestAnimationFrame(snake); }).observe(document.getElementById('levels') || document.body, { childList: true });
  window.addEventListener('resize', snake);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
