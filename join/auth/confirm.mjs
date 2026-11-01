// /join/auth sign-up confirmation.
// thrive-app sends new accounts to ?flow=confirm and verifies token_hash
// with type=signup. A recovery link (type=recovery) is not verified here.
export function confirmOtpType(search, hash) {
  const q = new URLSearchParams(typeof search === 'string' ? search : '');
  const h = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const type = (q.get('type') || h.get('type') || '').toLowerCase();
  if (type === 'recovery') return null;
  const flow = (q.get('flow') || '').toLowerCase();
  const token = q.get('token_hash') || h.get('token_hash');
  if (!token) return null;
  if (flow === 'confirm' || type === 'signup') return 'signup';
  return null;
}

export function isConfirmFlow(search, hash) {
  const q = new URLSearchParams(typeof search === 'string' ? search : '');
  const h = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const type = (q.get('type') || h.get('type') || '').toLowerCase();
  const flow = (q.get('flow') || '').toLowerCase();
  return flow === 'confirm' || type === 'signup' || type === 'email' || type === 'email_change' || type === 'invite';
}
