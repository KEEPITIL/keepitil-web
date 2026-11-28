// Dashboard "API keys" tab (owner only): create a key (name + scopes), see the secret ONCE with a Copy button, list the keys by prefix and scopes, revoke. The server (fmw.create_api_key,
// list_api_keys, revoke_api_key) enforces owner-only, the limit of 3, the scope allowlist and stores only a fingerprint. This file never stores the secret anywhere: it exists only in the page until
// the list is redrawn. textContent only, no markup, no network of its own (ctx.rpc). Registers in window.FMW_DASHBOARD_TABS for the owner role.
(function (root) {
  var SCOPES = ['catalog:read', 'catalog:write', 'hours:write'];
  function el(doc, tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function clean(data) {
    if (!Array.isArray(data)) return null;
    return data.filter(function (k) { return k && typeof k.id === 'string' && /^[0-9a-f-]{36}$/i.test(k.id) && typeof k.prefix === 'string' && /^fmwk_[0-9a-f]{7}$/.test(k.prefix); }).map(function (k) {
      return { id: k.id, name: String(k.name == null ? '' : k.name).slice(0, 60), prefix: k.prefix, scopes: (Array.isArray(k.scopes) ? k.scopes : []).filter(function (s) { return SCOPES.indexOf(s) >= 0; }), created: String(k.created || '').slice(0, 10), last_used: k.last_used ? String(k.last_used).slice(0, 10) : '', revoked: k.revoked === true };
    });
  }
  function whyCreate(copy, r) { var m = String(r && r.message || '').toLowerCase(); return m.indexOf('at most 3') >= 0 ? copy.max : copy.fail; }
  function mount(doc, panel, ctx) {
    var C = (ctx.win && ctx.win.FMW_COPY) || root.FMW_COPY || {}, copy = C.bizDash && C.bizDash.keys;
    if (!copy) return;
    panel.appendChild(el(doc, 'h2', null, copy.title)); panel.appendChild(el(doc, 'p', 'muted', copy.note));
    var form = el(doc, 'form'); form.noValidate = true;
    var nl = el(doc, 'label', null, copy.nameLabel), name = el(doc, 'input'); name.type = 'text'; name.maxLength = 60; nl.appendChild(name); form.appendChild(nl);
    var fs = el(doc, 'fieldset'); fs.appendChild(el(doc, 'legend', null, copy.scopesLegend)); var boxes = [];
    SCOPES.forEach(function (s) { var l = el(doc, 'label', 'key-scope'), b = el(doc, 'input'); b.type = 'checkbox'; b.value = s; l.appendChild(b); l.appendChild(el(doc, 'span', null, copy.scopeLabel[s])); fs.appendChild(l); boxes.push(b); });
    form.appendChild(fs);
    var make = el(doc, 'button', 'btn', copy.create); make.type = 'submit'; var msg = el(doc, 'p', 'muted'); msg.setAttribute('role', 'status'); form.appendChild(make); form.appendChild(msg); panel.appendChild(form);
    var secretBox = el(doc, 'div', 'key-secret'), listBox = el(doc, 'div', 'key-list'); listBox.setAttribute('aria-live', 'polite'); panel.appendChild(secretBox); panel.appendChild(listBox);
    function load() {
      listBox.textContent = ''; listBox.appendChild(el(doc, 'p', 'muted', copy.loading));
      ctx.rpc('list_api_keys', {}).then(function (r) {
        listBox.textContent = '';
        var keys = r && r.ok ? clean(r.data) : null;
        if (!keys) { listBox.appendChild(el(doc, 'p', 'muted', copy.error)); var b = el(doc, 'button', 'btn ghost', copy.retry); b.type = 'button'; b.addEventListener('click', load); listBox.appendChild(b); return; }
        listBox.appendChild(el(doc, 'h3', null, copy.listHead));
        if (!keys.length) { listBox.appendChild(el(doc, 'p', 'muted', copy.none)); return; }
        var ul = el(doc, 'ul', 'key-rows');
        keys.forEach(function (k) {
          var li = el(doc, 'li'); li.setAttribute('data-id', k.id);
          li.appendChild(el(doc, 'p', null, copy.row(k.name, k.prefix, k.scopes.map(function (s) { return copy.scopeLabel[s]; }).join(', '))));
          li.appendChild(el(doc, 'p', 'muted', copy.created(k.created) + ' · ' + copy.used(k.last_used)));
          if (k.revoked) li.appendChild(el(doc, 'p', 'muted', copy.revoked));
          else {
            var rv = el(doc, 'button', 'btn ghost', copy.revoke); rv.type = 'button'; var armed = false;
            rv.addEventListener('click', function () {
              if (!armed) { armed = true; rv.textContent = copy.revokeSure; return; }
              rv.disabled = true; ctx.rpc('revoke_api_key', { p_id: k.id }).then(function (x) { if (x && x.ok) { secretBox.textContent = ''; load(); } else { rv.disabled = false; armed = false; rv.textContent = copy.revoke; msg.textContent = copy.fail; } });
            });
            li.appendChild(rv);
          }
          ul.appendChild(li);
        });
        listBox.appendChild(ul);
      });
    }
    function showSecret(key) {
      secretBox.textContent = ''; secretBox.appendChild(el(doc, 'p', 'key-warn', copy.secretHead));
      var inp = el(doc, 'input', 'key-value'); inp.type = 'text'; inp.readOnly = true; inp.value = key; inp.setAttribute('aria-label', copy.secretHead); secretBox.appendChild(inp);
      var cp = el(doc, 'button', 'btn ghost', copy.copy); cp.type = 'button'; var st = el(doc, 'p', 'muted'); st.setAttribute('role', 'status');
      cp.addEventListener('click', function () {
        var nav = ctx.win && ctx.win.navigator;
        if (nav && nav.clipboard && nav.clipboard.writeText) nav.clipboard.writeText(key).then(function () { st.textContent = copy.copied; }, function () { st.textContent = copy.copyFail; });
        else { if (inp.select) inp.select(); st.textContent = copy.copyFail; }
      });
      secretBox.appendChild(cp); secretBox.appendChild(st);
    }
    form.addEventListener('submit', function (e) {
      if (e && e.preventDefault) e.preventDefault();
      var nm = String(name.value || '').trim(), sc = boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; });
      msg.textContent = ''; if (!nm || !sc.length) { msg.textContent = copy.needName; return; }
      make.disabled = true;
      ctx.rpc('create_api_key', { p_name: nm, p_scopes: sc }).then(function (r) {
        make.disabled = false;
        if (r && r.ok && r.data && typeof r.data.key === 'string' && /^fmwk_[0-9a-f]{64}$/.test(r.data.key)) { name.value = ''; boxes.forEach(function (b) { b.checked = false; }); showSecret(r.data.key); load(); }
        else msg.textContent = whyCreate(copy, r);
      });
    });
    load();
  }
  var list = root.FMW_DASHBOARD_TABS = root.FMW_DASHBOARD_TABS || [];
  list.push({ key: 'api-keys', label: function (C) { return C && C.bizDash && C.bizDash.keys ? C.bizDash.keys.tab : 'API keys'; }, roles: ['owner'], mount: mount });
  var api = { clean: clean, mount: mount, SCOPES: SCOPES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_BIZ_KEYS = api;
})(typeof window !== 'undefined' ? window : globalThis);
