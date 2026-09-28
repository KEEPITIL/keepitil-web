/* Save profiles (2.0 owner testing). The owner's real save is the default profile.
   `?profile=seed` opens a SEPARATE seeded test save (its own localStorage key and photo
   database), so seeded evidence can never overwrite the owner's progress. */
const want = (() => { try { return new URLSearchParams(location.search).get('profile') || ''; } catch (e) { return ''; } })();
export const PROFILE = want === 'seed' ? 'seed' : '';
export const suffix = PROFILE ? ':' + PROFILE : '';
try { if (PROFILE) document.documentElement.dataset.profile = PROFILE; } catch (e) {}
