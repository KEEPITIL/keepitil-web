/* KMOB account + wallet client (OFF until the kmob-wallet function is deployed: KM.ACCOUNT_ENABLED).
   Free offline play never needs an account. Signing in (email code now, Sign in with Apple on iPhone later) links the
   server wallet; purchased Diamonds / War Tokens live ONLY on the server, so a reinstall or a new phone keeps them.
   No secrets here: the anon key is the public key the game already ships for leaderboards. */
(function (G) {
  const KM = G.KM;
  KM.ACCOUNT_ENABLED = false;
  const BASE = 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co', SKEY = 'kmob.session.v1';
  const store = () => { try { return G.localStorage; } catch (e) { return null; } };
  const anon = () => KM.PUBLIC_KEY || '';
  const Account = {
    session: null, wallet: null, status: 'signed-out', mode: 'live',   // 'test' = Apple Sandbox / Stripe test mode balance (never mixed with live)   // signed-out · code-sent · signed-in · offline · error
    load() { try { const s = JSON.parse(store().getItem(SKEY) || 'null'); if (s && s.access_token && s.refresh_token && s.user && s.user.id) this.session = s; } catch (e) { this.session = null; }
      this.status = this.session ? 'signed-in' : 'signed-out'; return this; },
    save() { try { if (this.session) store().setItem(SKEY, JSON.stringify(this.session)); else store().removeItem(SKEY); } catch (e) { /* private mode */ } },
    async call(path, body, token) {
      const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', apikey: anon(), Authorization: 'Bearer ' + (token || anon()) }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j.error_description || j.msg || j.error || ('HTTP ' + r.status)); e.status = r.status; throw e; } return j;
    },
    validEmail: e => typeof e === 'string' && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e),
    async sendCode(email) { email = String(email || '').trim().toLowerCase(); if (!this.validEmail(email)) throw new Error('Enter a valid email');
      await this.call('/auth/v1/otp', { email, create_user: true }); this.pending = email; this.status = 'code-sent'; },
    async verify(code) { code = String(code || '').replace(/\s/g, ''); if (!/^\d{6,10}$/.test(code) || !this.pending) throw new Error('Enter the code from the email');
      const s = await this.call('/auth/v1/verify', { type: 'email', email: this.pending, token: code }); this.adopt(s); this.pending = null; return this.refreshWallet(); },
    adopt(s) { if (!s || !s.access_token || !s.user) throw new Error('sign-in failed'); this.session = { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || (Date.now() / 1000 + (s.expires_in || 3600)), user: { id: s.user.id, email: s.user.email } }; this.status = 'signed-in'; this.save(); },
    async token() { const s = this.session; if (!s) return null;
      if (s.expires_at - 60 > Date.now() / 1000) return s.access_token;
      try { this.adopt(await this.call('/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh_token })); return this.session.access_token; }
      catch (e) { if (e.status === 400 || e.status === 401) this.signOut(); else this.status = 'offline'; return null; } },
    async wallet_(body) { const t = await this.token(); if (!t) throw new Error('sign in required'); return this.call('/functions/v1/kmob-wallet', Object.assign({ mode: this.mode }, body), t); },
    // server balance is authoritative for PURCHASED currency; the local save keeps earned currency as before
    async refreshWallet() { try { const w = await this.wallet_({ action: 'balance' }); if (!Number.isInteger(w.diamonds) || !Number.isInteger(w.tokens) || w.diamonds < 0 || w.tokens < 0) throw new Error('bad wallet'); this.wallet = w; this.status = 'signed-in'; return w; }
      catch (e) { if (this.session) this.status = 'offline'; throw e; } },
    // StoreKit (native plugin, Mac session): after Apple returns a transaction, the app sends its signed JWS here and calls
    // finish() ONLY after this resolves — so a charge can never be lost; an unfinished transaction is re-delivered at launch.
    async creditApple(signedTransaction) { const w = await this.wallet_({ action: 'apple_credit', signedTransaction }); this.wallet = { diamonds: w.diamonds, tokens: w.tokens }; return w; },
    async spend(currency, amount, key, ref) { const w = await this.wallet_({ action: 'spend', currency, amount, key, ref }); this.wallet = { diamonds: w.diamonds, tokens: w.tokens }; return w; },
    // in-app account deletion (App Store 5.1.1(v)); Sign in with Apple players pass a fresh authorizationCode so Apple's token is revoked
    async deleteAccount(appleAuthorizationCode) { const r = await this.wallet_({ action: 'delete_account', confirm: 'DELETE', appleAuthorizationCode: appleAuthorizationCode || undefined });
      this.signOut(); return r; },
    signOut() { this.session = null; this.wallet = null; this.pending = null; this.status = 'signed-out'; this.save(); },
  };
  KM.Account = Account;
})(typeof window !== 'undefined' ? window : globalThis);
