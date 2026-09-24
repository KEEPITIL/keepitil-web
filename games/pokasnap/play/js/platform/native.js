/* PLATFORM BRIDGE — the only file that knows web from iOS.
   ---------------------------------------------------------------------------
   On iOS (Capacitor) the app registers a tiny local plugin, PokaNative, that
   saves to the Photos library and presents the native share sheet. On the web
   the same calls fall back to the Web Share API or a download. Screens call
   these functions and never branch on platform themselves. */

export const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
export const platform = isNative ? 'ios' : 'web';
/* PokaNative is registered at runtime by PokaViewController, after Capacitor
   announced its plugin list, so it is never in Capacitor.Plugins; and there is
   no @capacitor/core bundle here, so Capacitor.registerPlugin does not exist
   either. The native bridge's own nativePromise(plugin, method, options)
   reaches any registered plugin by name -- that is the call that works.
   (Both other lookups silently fell back to the share sheet on iOS.) */
const call = method => opts => window.Capacitor.nativePromise('PokaNative', method, opts);
const Native = () => (isNative && typeof window.Capacitor?.nativePromise === 'function')
  ? { savePhoto: call('savePhoto'), share: call('share'), haptic: call('haptic') } : null;

async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Save to the device photo library. Resolves { ok, how }. */
export async function saveToPhotos(blob, name = 'pokasnap.jpg') {
  if (isNative && Native()) {
    try { await Native().savePhoto({ base64: await blobToBase64(blob) }); return { ok: true, how: 'photos' }; }
    catch (e) { return { ok: false, how: 'photos', error: String(e?.message || e) }; }
  }
  // Mobile web: the share sheet offers "Save Image" -- the only way a web page
  // can put an image into the Photos app on iOS.
  const file = new File([blob], name, { type: 'image/jpeg' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return { ok: true, how: 'share' }; }
    catch (e) { if (e && e.name === 'AbortError') return { ok: false, how: 'share', cancelled: true }; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  return { ok: true, how: 'download' };
}

export async function share(blob, text = 'Look at my PokaSnap! 📸') {
  if (isNative && Native()) {
    try { await Native().share({ base64: await blobToBase64(blob), text }); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e?.message || e) }; }
  }
  const file = new File([blob], 'pokasnap.jpg', { type: 'image/jpeg' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return { ok: true }; }
    catch (e) { return { ok: false, cancelled: e?.name === 'AbortError' }; }
  }
  return saveToPhotos(blob);
}

import { get } from '../game/state.js';

export function haptic(kind = 'light') {
  if (!get().settings.haptics) return;          // the Settings toggle governs BOTH platforms
  if (isNative && Native()) { Native().haptic({ style: kind }).catch(() => {}); return; }
  if (navigator.vibrate && (navigator.userActivation?.hasBeenActive ?? true)) navigator.vibrate(kind === 'heavy' ? 30 : kind === 'success' ? [12, 40, 18] : 10);
}
