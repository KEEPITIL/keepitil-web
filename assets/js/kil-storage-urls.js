/* kil-storage-urls.js - DRAFT (17A PR-B). Signed-URL helper for private storage buckets (e.g. chat-images after the 17A P3c flip).
   createSignedUrl needs the VIEWING user's session and a SELECT policy on the object (uploader / profile owner / admin on chat-images), so it works only for people
   allowed to see the object. Short expiry by default (1 hour). Falls back to the input URL when signing is impossible, so it is safe to call while a bucket is still public.
   Browser: window.KilStorageUrls. Node tests: require(). No dependencies. */
(function (root) {
  var DEFAULT_TTL = 3600, MIN_TTL = 60, MAX_TTL = 86400;
  function clampTtl(s) { s = Number(s); if (!isFinite(s) || s <= 0) return DEFAULT_TTL; return Math.max(MIN_TTL, Math.min(MAX_TTL, Math.floor(s))); }
  function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  /* '.../storage/v1/object/(public|sign)/<bucket>/<path>[?query]' -> '<path>' (decoded), else null */
  function pathFromUrl(url, bucket) {
    var m = new RegExp('/storage/v1/object/(?:public|sign)/' + esc(bucket) + '/([^?#]+)').exec(String(url || ''));
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch (e) { return null; }
  }
  /* absolute expiry (ms since epoch) of a URL signed now with ttl seconds */
  function expiresAt(ttl, now) { return (now == null ? Date.now() : now) + clampTtl(ttl) * 1000; }
  /* Promise<string|null>: signed URL for bucket/path, null when signing fails */
  function signedUrl(sb, bucket, path, ttl) {
    if (!sb || !sb.storage || !path) return Promise.resolve(null);
    return sb.storage.from(bucket).createSignedUrl(path, clampTtl(ttl)).then(
      function (r) { return (r && r.data && r.data.signedUrl) || null; },
      function () { return null; });
  }
  /* Promise<string>: a stored public URL of `bucket` becomes a signed URL; anything else, or a failed signing, comes back unchanged */
  function resolve(sb, bucket, urlOrPath, ttl) {
    var p = pathFromUrl(urlOrPath, bucket);
    if (!p) return Promise.resolve(urlOrPath);
    return signedUrl(sb, bucket, p, ttl).then(function (u) { return u || urlOrPath; });
  }
  var api = { DEFAULT_TTL: DEFAULT_TTL, MIN_TTL: MIN_TTL, MAX_TTL: MAX_TTL, clampTtl: clampTtl, pathFromUrl: pathFromUrl, expiresAt: expiresAt, signedUrl: signedUrl, resolve: resolve };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KilStorageUrls = api;
})(typeof window !== 'undefined' ? window : globalThis);
