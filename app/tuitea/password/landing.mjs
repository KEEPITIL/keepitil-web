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
  if (p.code) return 'exchange-code';
  if (!p.tokenHash && !p.code && !(p.access && p.refresh)) return 'no-token';
  return 'recovery';
}

export function passwordLinkKind(search, hash) {
  const kind = passwordConfirmCase(search, hash);
  if (kind === 'exchange-code') return 'signup-code';
  return 'existing';
}
