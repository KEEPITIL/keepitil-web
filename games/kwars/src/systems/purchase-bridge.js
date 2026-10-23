/* Age of Wars — purchase bridge.
 * One entry point for buying gem packs across platforms, plus secure fulfillment.
 *   - Web / PWA / desktop  -> Stripe (KWStripe.purchase)
 *   - Native store app      -> store billing (KWStoreBilling.buy) when present
 * HOTFIX B89: purchases are disabled. Nothing on the client credits purchase gems
 * (no URL, no stored pack, no worker reply); see docs/HOTFIX-B89-SECURITY.md. */
(function () {
  'use strict';
  // Stable anonymous player id (ties purchases to this device/account).
  var PK = 'ageofwars-player-id';
  var pid = null;
  try { pid = localStorage.getItem(PK); if (!pid) { pid = 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); localStorage.setItem(PK, pid); } } catch (e) {}
  window.KWPlayerId = pid;

  var isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  window.KWPurchase = {
    native: isNative,
    buy: function (id) {
      if (isNative && window.KWStoreBilling && window.KWStoreBilling.buy) return window.KWStoreBilling.buy(id);
      if (window.KWStripe && window.KWStripe.purchase) return window.KWStripe.purchase(id);
      if (window.showMsg) showMsg('Store is not connected yet.'); else alert('Store is not connected yet.');
    }
  };

  // HOTFIX B89 (security): this build has NO server-verified fulfillment, so the
  // client never credits purchase gems. A "?checkout=success" return URL, a
  // session_id, a stored kw-pending-pack or a worker response are all
  // attacker-controllable and grant NOTHING here. Verified grants arrive with the
  // server fulfillment work (PR #1, security/server-verified-gems).
  var PURCHASE_UNAVAILABLE = 'Gem purchases are not available yet, so no gems were added. If you were charged, contact info@keepitil.com.';
  // A self-contained notice: the battle toast (#msg) is hidden on the home/shell
  // screens, which is exactly where a checkout return lands.
  function notice(text) {
    try {
      var old = document.getElementById('kwPurchaseNotice'); if (old) old.remove();
      var el = document.createElement('div');
      el.id = 'kwPurchaseNotice'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
      el.textContent = text;
      el.style.cssText = 'position:fixed;left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483000;max-width:min(92vw,520px);box-sizing:border-box;padding:12px 16px;border-radius:10px;background:rgba(14,20,28,.94);color:#eef2f5;border:1px solid rgba(242,201,77,.55);font:600 14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.45);cursor:pointer';
      el.onclick = function () { el.remove(); };
      document.body.appendChild(el);
      setTimeout(function () { if (el.parentNode) el.remove(); }, 9000);
    } catch (e) { if (window.showMsg) showMsg(text, 6000); }
  }
  function claimCheckout() {
    var q; try { q = new URLSearchParams(location.search); } catch (e) { return; }
    if (!q.has('checkout') && !q.has('session_id')) return;
    try { localStorage.removeItem('kw-pending-pack'); } catch (e) {}
    try { history.replaceState({}, '', location.pathname); } catch (e) {}
    notice(PURCHASE_UNAVAILABLE);
  }
  window.KWPurchaseUnavailableMessage = PURCHASE_UNAVAILABLE;
  window.KWPurchaseNotice = notice;
  if (document.readyState !== 'loading') claimCheckout();
  else document.addEventListener('DOMContentLoaded', claimCheckout);
})();
