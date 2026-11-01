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
