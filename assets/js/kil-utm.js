/* KEEPITIL — first-touch / last-touch for campaign tags only.
   Reads utm_source, utm_medium, utm_campaign, utm_content, utm_term and ref
   from the landing URL. Stores those keys in localStorage. No cookies, no email,
   no other query params.

   Last-touch is appended to Shopify store links (illestratedlifestyle.com,
   *.myshopify.com) and Stripe Payment Links (buy.stripe.com). Keys already on
   the link that this touch does not carry are left as they are, so a product
   utm_content set by shop-hub.js survives.

   Ticket checkout and WiFi Remote are not rewritten:
   - event checkout assigns location.href to a Checkout Session on
     checkout.stripe.com (create-checkout). This file never assigns location
     and never decorates that host.
   - KMOB does the same with stripe_checkout.
   - WiFi Remote leaves via apps.apple.com, which is not a store or payment link.
   Signup and contact forms that already exist get hidden fields. */
(function (root) {
  "use strict";
  var KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref"];
  var FIRST_KEY = "kil_utm_first";
  var LAST_KEY = "kil_utm_last";
  var MAX = 120;

  function clean(value) {
    if (value == null) return "";
    var v = String(value).replace(/^\s+|\s+$/g, "");
    if (!v || v.length > MAX) return "";
    try { v = decodeURIComponent(v.replace(/\+/g, " ")); } catch (e) { return ""; }
    v = v.replace(/^\s+|\s+$/g, "");
    if (!v || v.length > MAX) return "";
    if (v.indexOf("@") !== -1) return "";
    if (!/^[A-Za-z0-9._~\-]+$/.test(v)) return "";
    return v;
  }

  function parseSearch(search) {
    var out = {};
    var q = search || "";
    if (q.charAt(0) === "?") q = q.slice(1);
    if (!q) return out;
    var params;
    try { params = new URLSearchParams(q); } catch (e) { return out; }
    for (var i = 0; i < KEYS.length; i++) {
      var key = KEYS[i];
      var value = clean(params.get(key));
      if (value) out[key] = value;
    }
    return out;
  }

  function hasKeys(obj) {
    if (!obj) return false;
    for (var i = 0; i < KEYS.length; i++) if (obj[KEYS[i]]) return true;
    return false;
  }

  function readRaw(storage, storageKey) {
    try {
      var raw = storage.getItem(storageKey);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      var out = {};
      for (var i = 0; i < KEYS.length; i++) {
        var key = KEYS[i];
        var value = clean(parsed[key]);
        if (value) out[key] = value;
      }
      return hasKeys(out) ? out : null;
    } catch (e) { return null; }
  }

  function writeRaw(storage, storageKey, obj) {
    try { storage.setItem(storageKey, JSON.stringify(obj)); } catch (e) {}
  }

  function read(storage) {
    return {
      first: readRaw(storage, FIRST_KEY),
      last: readRaw(storage, LAST_KEY)
    };
  }

  function capture(search, storage) {
    var incoming = parseSearch(search);
    if (!hasKeys(incoming)) return read(storage);
    if (!readRaw(storage, FIRST_KEY)) writeRaw(storage, FIRST_KEY, incoming);
    writeRaw(storage, LAST_KEY, incoming);
    return read(storage);
  }

  function hostOf(url) {
    return url.hostname.toLowerCase().replace(/^www\./, "");
  }

  /* Storefronts and Stripe Payment Links only. Hosted Checkout Sessions
     (checkout.stripe.com, including /c/pay/cs_…) stay untouched. */
  function isOutboundCheckout(url) {
    var host = hostOf(url);
    if (host === "checkout.stripe.com") return false;
    if (host === "apps.apple.com" || host === "itunes.apple.com") return false;
    if (host === "illestratedlifestyle.com") return true;
    if (host === "myshopify.com" || host.slice(-14) === ".myshopify.com") return true;
    if (host === "buy.stripe.com") return true;
    return false;
  }

  function decorateUrl(href, touch, base) {
    if (!hasKeys(touch)) return href;
    var abs;
    try { abs = new URL(href, base || "https://keepitil.com"); }
    catch (e) { return href; }
    if (abs.protocol !== "http:" && abs.protocol !== "https:") return href;
    if (!isOutboundCheckout(abs)) return href;
    for (var i = 0; i < KEYS.length; i++) {
      var key = KEYS[i];
      if (touch[key]) abs.searchParams.set(key, touch[key]);
    }
    return abs.toString();
  }

  function hiddenFields(stored) {
    var fields = [];
    var last = (stored && stored.last) || {};
    var first = (stored && stored.first) || {};
    for (var i = 0; i < KEYS.length; i++) {
      var key = KEYS[i];
      if (last[key]) fields.push({ name: key, value: last[key] });
      if (first[key]) fields.push({ name: "first_" + key, value: first[key] });
    }
    return fields;
  }

  function isAttributionForm(form) {
    if (!form || typeof form.getAttribute !== "function") return false;
    var tag = String(form.nodeName || form.tagName || "").toUpperCase();
    if (tag !== "FORM") return false;
    var flag = form.getAttribute("data-kil-utm");
    if (flag === "off") return false;
    if (flag === "on") return true;
    if (form.id === "req") return true;
    var blob = ((form.id || "") + " " + (form.className || "") + " " +
      (form.getAttribute("action") || "") + " " + (form.getAttribute("name") || "")).toLowerCase();
    if (/checkout|ticket|wifi/.test(blob)) return false;
    return /signup|sign-up|contact/.test(blob);
  }

  function mount(doc, storage, loc) {
    doc = doc || (root && root.document);
    if (!doc) return;
    storage = storage || (root && root.localStorage);
    loc = loc || (root && root.location);
    if (!storage || !loc) return;
    var stored = capture(loc.search || "", storage);

    function applyLink(anchor) {
      if (!anchor || !anchor.getAttribute) return;
      if (anchor.getAttribute("data-kil-utm") === "off") return;
      var href = anchor.getAttribute("href");
      if (!href) return;
      var next = decorateUrl(href, stored.last, loc.href);
      if (next !== href && next !== anchor.href) anchor.setAttribute("href", next);
    }

    function applyForm(form) {
      if (!isAttributionForm(form)) return;
      var fields = hiddenFields(stored);
      for (var i = 0; i < fields.length; i++) {
        var field = fields[i];
        var input = form.querySelector('input[data-kil-utm-field][name="' + field.name + '"]');
        if (!input) {
          input = doc.createElement("input");
          input.type = "hidden";
          input.name = field.name;
          input.setAttribute("data-kil-utm-field", "1");
          form.appendChild(input);
        }
        input.value = field.value;
        input.setAttribute("value", field.value);
      }
    }

    function scan() {
      var links = doc.querySelectorAll("a[href]");
      for (var i = 0; i < links.length; i++) applyLink(links[i]);
      var forms = doc.querySelectorAll("form");
      for (var j = 0; j < forms.length; j++) applyForm(forms[j]);
    }

    function onIntent(event) {
      var target = event.target;
      if (!target || !target.closest) return;
      var anchor = target.closest("a[href]");
      if (anchor) applyLink(anchor);
    }

    function boot() {
      scan();
      doc.addEventListener("pointerdown", onIntent, true);
      doc.addEventListener("click", onIntent, true);
      doc.addEventListener("auxclick", onIntent, true);
    }

    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot);
    else boot();

    return stored;
  }

  var api = {
    KEYS: KEYS,
    FIRST_KEY: FIRST_KEY,
    LAST_KEY: LAST_KEY,
    clean: clean,
    parseSearch: parseSearch,
    read: read,
    capture: capture,
    isOutboundCheckout: isOutboundCheckout,
    decorateUrl: decorateUrl,
    hiddenFields: hiddenFields,
    isAttributionForm: isAttributionForm,
    mount: mount
  };

  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.KIL_UTM = api;
    if (root.document) mount();
  }
})(typeof window !== "undefined" ? window : null);
