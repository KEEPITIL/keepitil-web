// Business photo uploads: shrink a phone photo in the browser BEFORE it is sent, and say plainly what went wrong when the server refuses one.
// The server (supabase/functions/fmw-upload-media) answers 413 "size" for a file over 5 MB OR a side over 1920 px, and re-encodes + strips EXIF itself, so an uncorrected
// rotated photo would come back sideways; here createImageBitmap(imageOrientation: 'from-image') bakes the rotation in. Longest side <= 1920, aspect kept, JPEG ~0.85
// (a PNG logo stays PNG so transparency survives), always under the 5 MB cap. Pure maths is exported for tests. No fetch, no innerHTML, no CSP change (canvas + Blob only).
(function (root) {
  var MAX_EDGE = 1920, MAX_BYTES = 5 * 1024 * 1024, QUALITY = 0.85, RAW_LIMIT = 40 * 1024 * 1024;
  var IMAGE = /^image\/(jpeg|png|webp)$/i;
  // the size an image should be drawn at: longest side <= max, aspect kept, never enlarged; null for a nonsense size
  function fit(w, h, max) {
    w = Number(w); h = Number(h); max = Number(max) || MAX_EDGE;
    if (!(w >= 1) || !(h >= 1) || !isFinite(w) || !isFinite(h)) return null;
    var s = Math.min(1, max / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)), scaled: s < 1 };
  }
  // PNG only for a logo that arrived as PNG (it may be transparent); everything else becomes JPEG
  function outType(file, category) { return category === 'logo' && file && /^image\/png$/i.test(String(file.type || '')) ? 'image/png' : 'image/jpeg'; }
  function extFor(type) { return type === 'image/png' ? '.png' : '.jpg'; }
  function toBlob(canvas, type, q) { return new Promise(function (res) { try { canvas.toBlob(function (b) { res(b || null); }, type, q); } catch (e) { res(null); } }); }
  // encode at the wanted size; if over the cap lower the quality, then the size, a few times; null when nothing fits
  function encode(win, bmp, type, size) {
    var doc = win.document, qs = type === 'image/png' ? [undefined] : [QUALITY, 0.7, 0.55], scale = 1, tries = 0;
    function attempt(qi) {
      var w = Math.max(1, Math.round(size.w * scale)), h = Math.max(1, Math.round(size.h * scale)), c = doc.createElement('canvas'), ctx;
      c.width = w; c.height = h; ctx = c.getContext && c.getContext('2d'); if (!ctx) return Promise.resolve(null);
      if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }   // a transparent PNG turned JPEG would go black
      ctx.drawImage(bmp, 0, 0, w, h);
      return toBlob(c, type, qs[qi]).then(function (b) {
        if (!b) return null;
        if (b.size <= MAX_BYTES) return b;
        if (qi + 1 < qs.length) return attempt(qi + 1);
        if (++tries > 4) return null;
        scale *= 0.8; return attempt(0);
      });
    }
    return attempt(0);
  }
  // -> Promise<{ file }> (maybe the very same file) or { error: code }. A non-image (a PDF claim document) and a browser that cannot decode pass through untouched: the server has the last word.
  function prepare(win, file, category) {
    if (!file || !IMAGE.test(String(file.type || '')) || typeof win.createImageBitmap !== 'function' || !win.document) return Promise.resolve({ file: file });
    if (file.size > RAW_LIMIT) return Promise.resolve({ error: 'size' });
    return Promise.resolve().then(function () { return win.createImageBitmap(file, { imageOrientation: 'from-image' }); }).then(function (bmp) {
      var size = fit(bmp.width, bmp.height, MAX_EDGE), type = outType(file, category);
      if (!size) { if (bmp.close) bmp.close(); return { error: 'dimension' }; }
      return encode(win, bmp, type, size).then(function (blob) {
        if (bmp.close) bmp.close();
        if (!blob) return { error: 'size' };
        var name = String(file.name || 'photo').replace(/\.[A-Za-z0-9]+$/, '') + extFor(type);
        var out = typeof win.File === 'function' ? new win.File([blob], name, { type: type }) : blob;
        return { file: out };
      });
    }, function () { return { file: file }; });
  }
  var MESSAGES = {
    type: 'That file is not a JPEG, PNG or WebP image. Choose a photo in one of those formats.',
    size: 'That image is too large even after shrinking it. Choose a smaller photo (5 MB or less).',
    dimension: 'That image could not be resized in this browser. Try a different photo.',
    quota: 'You have reached the photo limit for this listing. Remove one first.',
    'not-allowed': 'Your account is not approved to upload photos yet. Once your business is approved you can add them.',
    signin: 'Your session ended. Sign in again and retry.',
    network: 'No connection. Check your network and try again.',
    other: 'The upload failed. Try again in a minute.'
  };
  // one code (the server's { error } word, or "network") -> a plain sentence
  function messageFor(code) {
    var c = String(code || '');
    if (c === 'not-fmw') c = 'signin';
    return Object.prototype.hasOwnProperty.call(MESSAGES, c) ? MESSAGES[c] : MESSAGES.other;
  }
  // a fetch Response (or a thrown network error) -> { ok, error }
  function outcome(resp) {
    if (!resp) return Promise.resolve({ ok: false, error: 'network' });
    if (resp.ok) return Promise.resolve({ ok: true });
    var byStatus = { 401: 'signin', 403: 'not-allowed', 413: 'size', 415: 'type' };
    var read = resp.json ? Promise.resolve().then(function () { return resp.json(); }).then(function (j) { return j && typeof j.error === 'string' ? j.error : ''; }, function () { return ''; }) : Promise.resolve('');
    return read.then(function (code) { return { ok: false, error: code || byStatus[resp.status] || 'other' }; });
  }
  var api = { fit: fit, outType: outType, prepare: prepare, messageFor: messageFor, outcome: outcome, MESSAGES: MESSAGES, MAX_EDGE: MAX_EDGE, MAX_BYTES: MAX_BYTES, RAW_LIMIT: RAW_LIMIT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_UPLOAD_IMAGE = api;
})(typeof window !== 'undefined' ? window : globalThis);
