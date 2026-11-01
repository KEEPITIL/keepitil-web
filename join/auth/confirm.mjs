// /join/auth sign-up confirmation.
// 'verify-signup' is the only path that may say the email is confirmed, and
// only after verifyOtp({ token_hash, type: 'signup' }) succeeds.
// Anything else that looks like a confirmation gets a resend form.
// type=recovery stays on the existing wording.
function parts(search, hash) {
  const q = new URLSearchParams(typeof search === 'string' ? search : '');
  const h = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const type = (q.get('type') || h.get('type') || '').toLowerCase();
  const flow = (q.get('flow') || '').toLowerCase();
  const token = q.get('token_hash') || h.get('token_hash') || '';
  const err = h.get('error_description') || q.get('error_description') || h.get('error') || q.get('error') || '';
  const code = q.get('code') || '';
  const recovery = type === 'recovery' || type === 'magiclink';
  const confirmish = flow === 'confirm' || type === 'signup' || type === 'email' || type === 'email_change' || type === 'invite' || (!!code && !recovery);
  return { type, flow, token, err, code, recovery, confirmish };
}

export function confirmOtpType(search, hash) {
  const p = parts(search, hash);
  if (p.recovery || !p.token) return null;
  if (p.flow === 'confirm' || p.type === 'signup') return 'signup';
  return null;
}

export function confirmAction(search, hash) {
  const p = parts(search, hash);
  if (p.err && p.recovery) return 'recovery-error';
  if (p.token && !p.recovery && (p.flow === 'confirm' || p.type === 'signup')) return 'verify-signup';
  if (p.confirmish || (p.err && !p.recovery)) return 'resend';
  if (p.recovery) return 'recovery';
  return 'default';
}

// Address left in the bar after /join/auth handles a link.
// verify-signup drops the whole query and hash, including token_hash.
// resend, recovery, and default drop ?code= and #access_token (and token_hash).
// resend and default also drop #refresh_token. recovery keeps it.
export function joinAuthUrl(href, action) {
  const url = new URL(href, 'https://keepitil.com');
  if (action === 'verify-signup') return url.pathname + '?flow=confirm';
  if (action !== 'resend' && action !== 'recovery' && action !== 'default') return url.pathname + url.search + url.hash;
  url.searchParams.delete('code');
  url.searchParams.delete('token_hash');
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  hash.delete('access_token');
  hash.delete('token_hash');
  if (action === 'resend' || action === 'default') hash.delete('refresh_token');
  const rest = hash.toString();
  return url.pathname + url.search + (rest ? '#' + rest : '');
}
