// How /app/tuitea/password/ treats the URL.
// A sign-up confirmation can arrive as ?code= with no type. That is not a
// password reset. A real reset carries type=recovery and must stay on the
// existing reset path, even when it also has a code.
export function passwordLinkKind(search, hash) {
  const params = new URLSearchParams(typeof search === 'string' ? search : '');
  const h = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const flowType = (params.get('type') || h.get('type') || '').toLowerCase();
  if (params.get('code') && flowType !== 'recovery') return 'signup-code';
  return 'existing';
}
