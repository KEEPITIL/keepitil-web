/* KMOB purchased currency (server-held), shared by the website and the iPhone app. pay() in the SHOP spends earned (local)
   currency first; if that is short it calls KM.Purchased.spend, which debits the cached balance at once and queues a server
   spend with a unique key. The queue is persisted (kmob.spendq) and retried until the server answers, so a spend happens exactly
   once even with lost responses, offline play or two devices. Nothing is spendable until the wallet MODE is known:
   iPhone → the App Store environment (production = live, Sandbox/TestFlight = test); website → the server's Stripe mode. */
(function (G) {
  const KM = G.KM, A2 = KM.Account; if (!A2) return;
  const QK = 'kmob.spendq', ls = () => { try { return G.localStorage; } catch (e) { return null; } };
  A2.mode = 'test'; let envReady = false; KM.envReady = () => { envReady = true; };
  const q = () => { try { return JSON.parse(ls().getItem(QK) || '[]'); } catch (e) { return []; } }, setq = a => { try { ls().setItem(QK, JSON.stringify(a)); } catch (e) { /* storage off */ } };
  const log = o => { try { if (G.Capacitor && G.Capacitor.nativePromise) G.Capacitor.nativePromise('KmobNative', 'log', { line: JSON.stringify(o) }); } catch (e) { /* web: nothing */ } };
  const P = KM.Purchased = { diamonds: 0, tokens: 0, flushing: false,
    apply(w) { const pend = q(), sum = c => pend.filter(x => x.cur === c).reduce((s, x) => s + x.n, 0);
      P.diamonds = Math.max(0, (w && w.diamonds || 0) - sum('diamonds')); P.tokens = Math.max(0, (w && w.tokens || 0) - sum('tokens')); },
    spend(cur, n) { if (G.KMOB_STAGING || !envReady || !A2.session || !(n > 0) || P[cur] < n) return false;
      const b = new Uint8Array(12); G.crypto.getRandomValues(b); const key = 'shop-' + Array.prototype.map.call(b, x => ('0' + x.toString(16)).slice(-2)).join('');
      P[cur] -= n; const a = q(); a.push({ key, cur, n, mode: A2.mode, user: A2.session.user.id }); setq(a); P.flush(); return true; },
    flush() { if (G.KMOB_STAGING || P.flushing || !A2.session) return; const a = q(), it = a[0]; if (!it) return;   // STAGING never sends a queued deduction
      if (it.user !== A2.session.user.id || it.mode !== A2.mode) { setq(a.slice(1)); return P.flush(); }   // belongs to another account / wallet: drop, never charge it elsewhere
      P.flushing = true; A2.spend(it.cur, it.n, it.key, 'shop').then(w => { setq(q().filter(x => x.key !== it.key)); if (!w.ok) log({ spendRefused: it });
        P.flushing = false; P.apply(A2.wallet); P.flush(); }, () => { P.flushing = false; G.setTimeout(P.flush, 15000); }); } };   // offline: keep it, retry
  const rw = A2.refreshWallet.bind(A2); A2.refreshWallet = () => rw().then(w => { P.apply(w); P.flush(); return w; });
  const so = A2.signOut.bind(A2); A2.signOut = () => { P.diamonds = 0; P.tokens = 0; return so(); };
  if (!G.KMOB_NATIVE && G.fetch) KM.walletStart = () => {   // website (started by main.js once the public key is set): the wallet follows the server's Stripe mode
    // returning from Stripe Checkout: ?checkout=success|cancel (the webhook credits the wallet; the page only shows and refreshes)
    const back = (() => { try { const u = new URL(G.location.href), c = u.searchParams.get('checkout'); if (!c) return null; u.searchParams.delete('checkout'); u.searchParams.delete('session');
      G.history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); return c; } catch (e) { return null; } })();
    // owner preview before public activation: ?store=preview reveals the store UI on this browser (the SERVER still only lets allow-listed accounts pay)
    try { if (/[?&]store=preview\b/.test(G.location.search)) ls().setItem('kmob.storepreview', '1'); KM.WEB_PREVIEW = ls().getItem('kmob.storepreview') === '1'; } catch (e) { KM.WEB_PREVIEW = false; }
    if (back === 'cancel') KM.webNotice = 'Checkout canceled — nothing was charged.';
    if (back === 'success') KM.webNotice = 'Payment received — adding your purchase…';
    Promise.resolve(A2.fromRedirect ? A2.fromRedirect().catch(() => false) : false).then(() => A2.call('/functions/v1/kmob-wallet', { action: 'status' })).then(s => {
      A2.mode = s.stripeMode === 'live' ? 'live' : 'test'; KM.WEB_STORE = !!s.webStore; KM.WEB_PUBLIC = !!s.webPublic; KM.envReady();
      if (A2.load) { A2.load(); if (A2.session) A2.refreshWallet().then(() => { if (KM.shopRedraw) KM.shopRedraw(); }, () => { /* offline */ }); }
      if (back === 'success' && A2.session) { const before = JSON.stringify(A2.wallet || {}); let n = 0;
        const poll = () => A2.refreshWallet().then(w => { if (JSON.stringify(w) !== before || ++n > 10) { KM.webNotice = JSON.stringify(w) !== before ? 'Purchase added to your account.' : 'Payment received — it can take a minute to appear. It will not be lost.'; if (KM.shopRedraw) KM.shopRedraw(); } else G.setTimeout(poll, 3000); }, () => G.setTimeout(poll, 5000));
        G.setTimeout(poll, 1500); }
      if (KM.shopRedraw) KM.shopRedraw(); }, () => { /* offline: purchased currency stays unspendable; free play is unaffected */ });
  };
})(typeof window !== 'undefined' ? window : globalThis);
