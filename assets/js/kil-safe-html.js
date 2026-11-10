/* Stored post/article HTML is never inserted as-is.
   New rows are rebuilt from escaped fields. Legacy HTML-only rows go through
   vendored DOMPurify 3.4.17 (assets/js/vendor/purify.min.js). No CDN.
   git hash-object 416c7d0be33481ae845288a8e0fb477e96184469
   sha256 2ffc14b99b081b271d8df0740b688e0163bc5f0fdfc3e1888acc88f005ab0700 */
(function (root) {
  'use strict';

  var ALLOWED_TAGS = ['a','b','blockquote','br','code','div','em','figcaption','figure','h1','h2','h3','h4','h5','h6','hr','i','img','li','ol','p','pre','small','span','strong','u','ul','video','source'];
  var ALLOWED_ATTR = ['href','src','alt','title','class','controls','playsinline','rel','target','width','height','loading','poster','type'];
  var PURIFY_CONFIG = {
    ALLOWED_TAGS: ALLOWED_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script','iframe','object','embed','style','form','input','button','link','meta','svg','math','base','noscript'],
    FORBID_ATTR: ['style'],
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ALLOWED_URI_REGEXP: /^(?:https:\/\/|\/(?!\/))/i
  };
  var hooked = false;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function blocked(s) {
    return /[\u0000-\u001f\u007f\s"'<>`\\]/.test(s);
  }

  function pageOrigin() {
    try {
      if (typeof location !== 'undefined' && location.origin && location.origin !== 'null') return location.origin;
    } catch (e) {}
    return 'https://keepitil.com';
  }

  function pageHref() {
    try {
      if (typeof location !== 'undefined' && location.href && location.href !== 'about:blank') return location.href;
    } catch (e) {}
    return 'https://keepitil.com/';
  }

  /* https, or a same-origin path/URL. javascript:, data:, and protocol-relative URLs are dropped. */
  function safeNavUrl(url) {
    var s = String(url == null ? '' : url).trim();
    if (!s || blocked(s)) return '';
    if (s.charAt(0) === '/' && (s.charAt(1) === '/' || s.charAt(1) === '\\')) return '';
    if (s.charAt(0) === '/' ) return s;
    try {
      var u = new URL(s, pageHref());
      if (u.username || u.password) return '';
      if (u.origin === pageOrigin()) return u.href;
      if (u.protocol === 'https:') return u.href;
    } catch (e) {}
    return '';
  }

  /* Media is https-only, plus same-origin path URLs. */
  function safeMediaUrl(url) {
    var s = String(url == null ? '' : url).trim();
    if (!s || blocked(s)) return '';
    if (s.charAt(0) === '/' && (s.charAt(1) === '/' || s.charAt(1) === '\\')) return '';
    if (s.charAt(0) === '/') return s;
    try {
      var u = new URL(s);
      if (u.protocol === 'https:' && !u.username && !u.password) return u.href;
    } catch (e) {}
    return '';
  }

  function list(v) {
    if (v == null || v === '') return [];
    return Array.isArray(v) ? v : [v];
  }

  function handle(h) {
    return String(h == null ? '' : h).replace(/^@+/, '');
  }

  /* Rebuild a post body. User text is escaped. Media must already be a safe URL. */
  function buildBody(rec) {
    rec = rec || {};
    var desc = rec.desc != null ? rec.desc : (rec.text != null ? rec.text : rec.body_text);
    var media = safeMediaUrl(rec.img || rec.media || '');
    var mtype = rec.mtype || 'image';
    var tags = list(rec.tags);
    var collab = list(rec.collab);
    var loc = rec.location || rec.loc || '';
    var m = '';
    if (media) {
      m = (mtype === 'video')
        ? '<video src="' + esc(media) + '" controls playsinline style="width:100%;border-radius:12px;display:block;margin-bottom:14px;background:#000"></video>'
        : '<img src="' + esc(media) + '" alt="" style="width:100%;border-radius:12px;display:block;margin-bottom:14px">';
    }
    var col = collab.length
      ? '<div class="kil-tag">✦ COLLAB · ' + collab.map(function (h) { return '@' + esc(handle(h)); }).join(', ') + '</div>'
      : '';
    var body = (desc != null && String(desc) !== '')
      ? '<p class="intro-text">' + esc(desc).replace(/\n/g, '<br>') + '</p>'
      : '';
    var lc = loc
      ? '<p class="intro-text" style="color:var(--muted);font-size:.82rem">📍 ' + esc(loc) + '</p>'
      : '';
    var tg = tags.length
      ? '<p class="intro-text" style="font-size:.9rem;color:var(--accent)">' + tags.map(function (h) { return '@' + esc(handle(h)); }).join(' ') + '</p>'
      : '';
    return col + m + body + lc + tg;
  }

  function purify() {
    var DP = root.DOMPurify;
    if (!DP || typeof DP.sanitize !== 'function') return null;
    if (!hooked && typeof DP.addHook === 'function') {
      hooked = true;
      DP.addHook('uponSanitizeAttribute', function (_node, data) {
        if (!data || !data.attrName) return;
        if (/^on/i.test(data.attrName)) data.keepAttr = false;
        var name = String(data.attrName).toLowerCase();
        if ((name === 'href' || name === 'src' || name === 'poster' || name === 'action' || name === 'xlink:href')
            && /^\s*javascript:/i.test(String(data.attrValue || ''))) {
          data.keepAttr = false;
        }
      });
    }
    return DP;
  }

  /* Legacy stored HTML only. Fail closed when the vendored sanitizer is missing. */
  function sanitize(html) {
    var DP = purify();
    if (!DP) return '';
    return DP.sanitize(String(html == null ? '' : html), PURIFY_CONFIG);
  }

  function hasStructured(rec) {
    return !!(rec && (rec.desc != null || rec.text != null || rec.body_text != null));
  }

  /* Prefer a rebuild from structured fields. Sanitize html only when those fields are absent. */
  function renderStored(rec) {
    rec = rec || {};
    if (hasStructured(rec)) return buildBody(rec);
    if (rec.html == null || rec.html === '') return '';
    return sanitize(rec.html);
  }

  root.KilSafeHtml = {
    esc: esc,
    safeNavUrl: safeNavUrl,
    safeMediaUrl: safeMediaUrl,
    kilSafeUrl: safeMediaUrl,
    buildBody: buildBody,
    sanitize: sanitize,
    renderStored: renderStored
  };
})(typeof window !== 'undefined' ? window : globalThis);
