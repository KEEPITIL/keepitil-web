/* KEEPITIL delegated actions: replaces inline on*="..." handler attributes so a Content-Security-Policy without 'unsafe-inline' for script can be enforced later
   (docs/cloudflare/csp-report-only.md). Same behaviour, no inline code.

   Markup:   <button data-click="closeModal">            calls window.closeModal()
             <button data-click="cpMoveItem" data-a="[3,-1]">   calls cpMoveItem(3, -1)
             data-a is a JSON array; the strings "$e" and "$el" stand for the event and the element carrying the attribute.
   Events:   data-click, data-change, data-input, data-keydown, data-over (mouseover), data-out (mouseout), data-submit
   Stop:     data-stop  = event.stopPropagation() of the old inline handler. Because this listener sits on document and is registered before the page's own
             document listeners, stopImmediatePropagation() reproduces "other document/window listeners do not see this event".
   Safety:   ONLY names the page has allowed with KilActions.allow([...]) can run, and only if window[name] is a function. Markup that reaches the page from data
             (a name or a tweet) can therefore never call eval, location.assign, or any other global.
   Bubbling: like inline handlers, every element on the path from the target up with the attribute runs, inner to outer, unless a data-stop element ran. */
(function () {
  if (window.KilActions) return;
  var allowed = Object.create(null);
  var EVENTS = { click: 'data-click', change: 'data-change', input: 'data-input', keydown: 'data-keydown', mouseover: 'data-over', mouseout: 'data-out', submit: 'data-submit' };
  function args(el, ev) {
    var raw = el.getAttribute('data-a'), list = [];
    if (raw) { try { list = JSON.parse(raw); } catch (e) { list = []; } if (!Array.isArray(list)) list = []; }
    return list.map(function (a) { return a === '$e' ? ev : a === '$el' ? el : a; });
  }
  function run(type, ev) {
    var attr = EVENTS[type], el = ev.target;
    while (el && el !== document) {
      if (el.nodeType === 1 && el.hasAttribute && el.hasAttribute(attr)) {
        var name = el.getAttribute(attr);
        if (allowed[name] === true && typeof window[name] === 'function') {
          try { window[name].apply(el, args(el, ev)); } catch (e) { if (window.console && console.error) console.error(e); }
        }
        if (el.hasAttribute('data-stop')) { ev.stopImmediatePropagation(); return; }
      }
      el = el.parentNode;
    }
  }
  Object.keys(EVENTS).forEach(function (t) { document.addEventListener(t, function (ev) { run(t, ev); }); });
  window.KilActions = { allow: function (names) { (names || []).forEach(function (n) { if (typeof n === 'string' && /^[A-Za-z_$][\w$]*$/.test(n)) allowed[n] = true; }); } };
})();
