/* KEEPITIL — first-touch / last-touch for the five campaign fields only.
   utm_source, utm_medium, utm_campaign, utm_content, utm_term.
   No ref, no gclid, no fbclid, no ttclid, no msclkid, no email, no user id.
   Each record stores a timestamp and is deleted on read after 30 days.
   Nothing is captured or kept when Global Privacy Control or Do Not Track is on,
   or when the timezone or locale suggests the EU, the UK, or Switzerland.
   An unreadable signal skips storage.
   After the values are attached to a sign-up or a purchase, storage is cleared.
   The sign-up or order row is where attribution is recorded. */
(function (root) {
  "use strict";
  var KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  var FIRST_KEY = "kil_utm_first";
  var LAST_KEY = "kil_utm_last";
  var MAX = 120;
  var TTL = 30 * 24 * 60 * 60 * 1000;
  var EU_REGION = {
    AT: 1, BE: 1, BG: 1, HR: 1, CY: 1, CZ: 1, DK: 1, EE: 1, FI: 1, FR: 1, DE: 1,
    GR: 1, HU: 1, IE: 1, IT: 1, LV: 1, LT: 1, LU: 1, MT: 1, NL: 1, PL: 1, PT: 1,
    RO: 1, SK: 1, SI: 1, ES: 1, SE: 1, GB: 1, UK: 1, CH: 1
  };
  var EU_LANG = {
    de: 1, fr: 1, it: 1, nl: 1, pl: 1, sv: 1, fi: 1, da: 1, pt: 1, es: 1, el: 1,
    cs: 1, hu: 1, ro: 1, bg: 1, hr: 1, sk: 1, sl: 1, lt: 1, lv: 1, et: 1, mt: 1,
    ga: 1, lb: 1, gsw: 1
  };

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

  function remove(storage, storageKey) {
    try { storage.removeItem(storageKey); } catch (e) {}
  }

  function clear(storage) {
    if (!storage) return;
    remove(storage, FIRST_KEY);
    remove(storage, LAST_KEY);
  }

  function readRaw(storage, storageKey, now) {
    now = now || Date.now();
    try {
      var raw = storage.getItem(storageKey);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        remove(storage, storageKey);
        return null;
      }
      var t = Number(parsed.t);
      if (!t || t > now || now - t > TTL) {
        remove(storage, storageKey);
        return null;
      }
      var out = {};
      for (var i = 0; i < KEYS.length; i++) {
        var key = KEYS[i];
        var value = clean(parsed[key]);
        if (value) out[key] = value;
      }
      if (!hasKeys(out)) {
        remove(storage, storageKey);
        return null;
      }
      return out;
    } catch (e) {
      remove(storage, storageKey);
      return null;
    }
  }

  function writeRaw(storage, storageKey, obj, now) {
    var stored = { t: now };
    for (var i = 0; i < KEYS.length; i++) {
      var key = KEYS[i];
      if (obj[key]) stored[key] = obj[key];
    }
    try { storage.setItem(storageKey, JSON.stringify(stored)); } catch (e) {}
  }

  function read(storage, now) {
    return {
      first: readRaw(storage, FIRST_KEY, now),
      last: readRaw(storage, LAST_KEY, now)
    };
  }

  function capture(search, storage, now) {
    now = now || Date.now();
    var incoming = parseSearch(search);
    if (!hasKeys(incoming)) return read(storage, now);
    if (!readRaw(storage, FIRST_KEY, now)) writeRaw(storage, FIRST_KEY, incoming, now);
    writeRaw(storage, LAST_KEY, incoming, now);
    return read(storage, now);
  }

  function localeParts(tag) {
    var bits = String(tag || "").replace(/_/g, "-").split("-");
    var lang = (bits[0] || "").toLowerCase();
    var region = "";
    for (var i = 1; i < bits.length; i++) {
      if (/^[A-Za-z]{2}$/.test(bits[i])) {
        region = bits[i].toUpperCase();
        break;
      }
    }
    return { lang: lang, region: region };
  }

  /* IANA names that are UTC, including the aliases Intl accepts. Etc/GMT+1 is a
     real offset and is not in this list. */
  var UTC_ALIAS = {
    "utc": 1, "gmt": 1, "uct": 1, "universal": 1, "zulu": 1, "greenwich": 1,
    "gmt0": 1, "gmt+0": 1, "gmt-0": 1,
    "etc/utc": 1, "etc/uct": 1, "etc/universal": 1, "etc/zulu": 1,
    "etc/gmt": 1, "etc/gmt0": 1, "etc/gmt+0": 1, "etc/gmt-0": 1,
    "etc/greenwich": 1
  };

  function zoneKey(timeZone) {
    return String(timeZone == null ? "" : timeZone).replace(/^\s+|\s+$/g, "").toLowerCase();
  }

  function isKnownZone(timeZone) {
    var tz = String(timeZone == null ? "" : timeZone).replace(/^\s+|\s+$/g, "");
    if (!tz) return false;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch (e) {
      return false;
    }
  }

  function localesUnreadable(locales) {
    if (locales == null || !Array.isArray(locales) || locales.length === 0) return true;
    for (var i = 0; i < locales.length; i++) {
      if (String(locales[i] == null ? "" : locales[i]).replace(/^\s+|\s+$/g, "")) return false;
    }
    return true;
  }

  /* True when the visitor should not be stored. An unreadable locale, a blank,
     unknown, or invalid timezone, a UTC alias, Cyprus, a European timezone, an
     EU/UK/CH region, or an EU language with no region all skip. */
  function suggestsEuUkCh(timeZone, locales) {
    if (localesUnreadable(locales)) return true;
    var key = zoneKey(timeZone);
    if (!key || UTC_ALIAS[key]) return true;
    if (!isKnownZone(timeZone)) return true;
    if (/^europe\//.test(key)) return true;
    if (/^atlantic\/(canary|faroe|madeira|azores|reykjavik)$/.test(key)) return true;
    if (key === "asia/nicosia" || key === "asia/famagusta") return true;
    for (var i = 0; i < locales.length; i++) {
      var part = localeParts(locales[i]);
      if (part.region && EU_REGION[part.region]) return true;
      if (!part.region && EU_LANG[part.lang]) return true;
    }
    return false;
  }

  function trackingOff(env) {
    env = env || {};
    var nav = env.navigator || {};
    if (nav.globalPrivacyControl === true) return true;
    var dnt = nav.doNotTrack;
    if ((dnt == null || dnt === "") && env.doNotTrack != null) dnt = env.doNotTrack;
    if (dnt === "1" || dnt === "yes" || dnt === 1) return true;
    return suggestsEuUkCh(env.timeZone, env.locales);
  }

  function browserEnv() {
    var nav = (root && root.navigator) || {};
    var locales = null;
    try {
      if (nav.languages && typeof nav.languages.length === "number") {
        for (var i = 0; i < nav.languages.length; i++) locales.push(nav.languages[i]);
      } else if (nav.language) {
        locales = [nav.language];
      }
    } catch (e) { locales = null; }
    var timeZone = "";
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch (e2) { timeZone = ""; }
    return {
      navigator: nav,
      doNotTrack: root ? root.doNotTrack : undefined,
      timeZone: timeZone,
      locales: locales
    };
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

  function purchaseAttached(href, touch, base) {
    if (!hasKeys(touch) || !href) return false;
    var abs;
    try { abs = new URL(href, base || "https://keepitil.com"); }
    catch (e) { return false; }
    if (!isOutboundCheckout(abs)) return false;
    for (var i = 0; i < KEYS.length; i++) {
      var key = KEYS[i];
      if (touch[key] && abs.searchParams.get(key) === touch[key]) return true;
    }
    return false;
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

  /* Sign-up forms only. Contact and service-request forms, including #req, are not
     attribution targets. data-kil-utm="off" always wins. */
  function isSignupForm(form) {
    if (!form || typeof form.getAttribute !== "function") return false;
    var tag = String(form.nodeName || form.tagName || "").toUpperCase();
    if (tag !== "FORM") return false;
    if (form.getAttribute("data-kil-utm") === "off") return false;
    var id = String(form.id || "").toLowerCase();
    if (id === "req") return false;
    var blob = (id + " " + (form.className || "") + " " +
      (form.getAttribute("action") || "") + " " + (form.getAttribute("name") || "")).toLowerCase();
    if (/contact|service-request|support/.test(blob)) return false;
    if (/checkout|ticket|wifi/.test(blob)) return false;
    if (form.getAttribute("data-kil-utm") === "signup") return true;
    return /signup|sign-up/.test(blob);
  }

  function isAttributionForm(form) {
    return isSignupForm(form);
  }

  /* Re-reads expiry and the privacy gate. Does not reuse an earlier snapshot. */
  function currentRecord(storage, env, now) {
    if (!storage) return null;
    if (trackingOff(env || browserEnv())) {
      clear(storage);
      return null;
    }
    var stored = read(storage, now || Date.now());
    if (!stored || (!stored.first && !stored.last)) return null;
    return stored;
  }

  function currentTouch(storage, env, now) {
    var stored = currentRecord(storage, env, now);
    return stored && stored.last ? stored.last : null;
  }

  function fieldsForServer(storage, env, now) {
    return currentTouch(storage, env, now);
  }

  function mount(doc, storage, loc, env) {
    doc = doc || (root && root.document);
    if (!doc) return;
    storage = storage || (root && root.localStorage);
    loc = loc || (root && root.location);
    if (!storage || !loc) return;
    var fresh = function (now) { return currentRecord(storage, env, now); };
    if (trackingOff(env || browserEnv())) clear(storage);
    else capture(loc.search || "", storage);

    function applyLink(anchor) {
      if (!anchor || !anchor.getAttribute) return;
      if (anchor.getAttribute("data-kil-utm") === "off") return;
      var href = anchor.getAttribute("href");
      if (!href) return;
      if (!anchor.getAttribute("data-kil-utm-orig")) anchor.setAttribute("data-kil-utm-orig", href);
      var baseHref = anchor.getAttribute("data-kil-utm-orig");
      var record = fresh();
      var touch = record && record.last;
      if (!touch) {
        if (anchor.getAttribute("href") !== baseHref) anchor.setAttribute("href", baseHref);
        return;
      }
      var next = decorateUrl(baseHref, touch, loc.href);
      if (next !== anchor.getAttribute("href") && next !== anchor.href) anchor.setAttribute("href", next);
    }

    function applyForm(form) {
      if (!isSignupForm(form)) return;
      var record = fresh();
      var existing = form.querySelectorAll("input[data-kil-utm-field]");
      if (!record || !record.last) {
        for (var n = 0; n < existing.length; n++) {
          if (existing[n].parentNode) existing[n].parentNode.removeChild(existing[n]);
        }
        return;
      }
      var fields = hiddenFields(record);
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
      if (!anchor) return;
      applyLink(anchor);
      var record = fresh();
      var touch = record && record.last;
      if ((event.type === "click" || event.type === "auxclick") &&
          purchaseAttached(anchor.getAttribute("href"), touch, loc.href)) {
        clear(storage);
      }
    }

    function onSubmit(event) {
      var form = event.target;
      if (!isSignupForm(form)) return;
      applyForm(form);
      var record = fresh();
      if (!record || !record.last) return;
      clear(storage);
    }

    function boot() {
      scan();
      doc.addEventListener("pointerdown", onIntent, true);
      doc.addEventListener("click", onIntent, true);
      doc.addEventListener("auxclick", onIntent, true);
      doc.addEventListener("submit", onSubmit, true);
    }

    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot);
    else boot();

    return read(storage);
  }

  var api = {
    KEYS: KEYS,
    FIRST_KEY: FIRST_KEY,
    LAST_KEY: LAST_KEY,
    TTL: TTL,
    clean: clean,
    parseSearch: parseSearch,
    read: read,
    capture: capture,
    clear: clear,
    trackingOff: trackingOff,
    suggestsEuUkCh: suggestsEuUkCh,
    isOutboundCheckout: isOutboundCheckout,
    decorateUrl: decorateUrl,
    purchaseAttached: purchaseAttached,
    hiddenFields: hiddenFields,
    isAttributionForm: isAttributionForm,
    isSignupForm: isSignupForm,
    currentTouch: currentTouch,
    fieldsForServer: fieldsForServer,
    isKnownZone: isKnownZone,
    mount: mount
  };

  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.KIL_UTM = api;
    if (root.document) mount();
  }
})(typeof window !== "undefined" ? window : null);
