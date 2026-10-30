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
    top.innerHTML = '<span>TRAFFIC POP</span><span><svg viewBox="-1.1 -1.1 2.2 2.2" aria-hidden="true"><path d="M0-1L.24-.33H.95L.38.1.59.8 0 .38-.59.8-.38.1-.95-.33H-.24Z"/></svg> <b id="tpStars">0</b></span>';
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
    sec.querySelector('#tpLevels').onclick = function () { var c = document.querySelector('.lv.current') || document.getElementById('levels'); c && c.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    sec.querySelector('#tpSettings').onclick = function () { window.TP && TP.settings && TP.settings(); };
  }
  function snake() {
    var box = document.getElementById('levels'); if (!box) return;
    var el = document.getElementById('tpStars'); if (el) el.textContent = stars();
    var save = {}; try { save = JSON.parse(localStorage.getItem('trafficpop.save.v1') || '{}'); } catch (e) {}
    box.querySelectorAll('.row').forEach(function (row) {
      var nodes = Array.prototype.slice.call(row.querySelectorAll('.lv')); if (!nodes.length) return;
      var W = row.clientWidth || 360, cols = 4, step = Math.min(150, W / cols * 1.1), colW = W / cols;
      var pts = nodes.map(function (n, i) {
        var r = Math.floor(i / cols), c = i % cols; if (r % 2) c = cols - 1 - c;
        return [colW * (c + .5), 50 + r * step * .75];
      });
      row.style.height = (pts[pts.length - 1][1] + 70) + 'px';
      nodes.forEach(function (n, i) {
        var sz = n.classList.contains('current') ? 76 : 60;
        n.style.left = (pts[i][0] - sz / 2) + 'px'; n.style.top = (pts[i][1] - sz / 2) + 'px';
        var star = n.querySelector('small');
        if (!n.classList.contains('locked') && !n.classList.contains('current') && star && star.textContent) n.classList.add('done');
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
