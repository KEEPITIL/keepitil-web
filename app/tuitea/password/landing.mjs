// How /app/tuitea/password/ treats the URL.
// 'confirmed' is allowed only after verify-otp or exchange-code succeeds.
// A visit with no token is 'no-token' and must not say the email is confirmed.
// type=recovery stays on the existing reset path, even when it also has a code.
function read(search, hash) {
  const params = new URLSearchParams(typeof search === 'string' ? search : '');
  const h = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const type = (params.get('type') || h.get('type') || '').toLowerCase();
  const flow = (params.get('flow') || '').toLowerCase();
  const tokenHash = params.get('token_hash') || h.get('token_hash') || '';
  const code = params.get('code') || '';
  const access = h.get('access_token') || params.get('access_token') || '';
  const refresh = h.get('refresh_token') || params.get('refresh_token') || '';
  return { type, flow, tokenHash, code, access, refresh };
}

export function passwordConfirmCase(search, hash) {
  const p = read(search, hash);
  if (p.type === 'recovery') return 'recovery';
  if (p.flow === 'confirm' && p.tokenHash) return 'verify-otp';
  if (p.tokenHash && ['signup', 'email', 'email_change', 'invite'].includes(p.type)) return 'verify-otp';
  // A hash access_token for sign-up is a confirmation, not a password reset.
  if (p.access && ['signup', 'email', 'email_change', 'invite'].includes(p.type)) return 'confirm-session';
  // A bare ?code= is not assumed to be sign-up. persistSession:false means this
  // page has no PKCE verifier, so the code cannot be redeemed here.
  if (p.code) return 'maybe-confirmed';
  if (!p.tokenHash && !p.code && !p.access) return 'no-token';
  return 'recovery';
}

export function passwordLinkKind(search, hash) {
  return passwordConfirmCase(search, hash) === 'recovery' ? 'existing' : passwordConfirmCase(search, hash);
}

// Recovery fragment (#access_token, #refresh_token, type, expires_*) is removed
// after setSession. The in-memory session is left alone so updateUser can run.
export function urlWithoutHash(href) {
  const url = new URL(href, 'https://keepitil.com');
  url.hash = '';
  return url.pathname + url.search;
}

export async function settleRecoverySession(href, setSession, replaceState) {
  let error = null;
  try {
    const result = await setSession();
    if (result && result.error) error = result.error;
  } catch (e) {
    error = e || new Error('setSession failed');
  } finally {
    replaceState(urlWithoutHash(href));
  }
  return error;
}
