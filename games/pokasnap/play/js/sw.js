/* ACCOUNTS — the KEEPITIL identity, reused (not a new auth architecture).
   ---------------------------------------------------------------------------
   Same Supabase project and client as KEEPITIL and Kingdom Wars
   (ovmqtzjfpzrbzrlkxwgw). Apple, Google, email and anonymous providers are all
   enabled there already.

   Rules carried over from KWARS, each learned the hard way:
     - Signed-in state comes from the SESSION only. signUp() returns a user
       even when email confirmation is pending and no session exists.
     - Guest play is never gated. Local progress is the working copy.
     - signUp passes emailRedirectTo so the confirmation link returns to the
       game, not the KEEPITIL homepage.

   Account deletion calls public.tupu_delete_account(): a PokaSnap account IS a
   KEEPITIL account, and that function already performs every other product's
   cleanup (it hands TUITEA households on before deleting the user). A second,
   PokaSnap-only deleter would orphan them. */

import { isNative } from './native.js';

const URL_ = 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
export const PLAY_URL = 'https://keepitil.com/games/pokasnap/play/';

let sb = null, loading = null;
function loadLib() {
  if (window.supabase?.createClient) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = new URL('./supabase.min.js', import.meta.url).href;
    s.onload = res; s.onerror = () => rej(new Error('offline'));
    document.head.appendChild(s);
  });
  return loading;
}
export async function client() {
  if (sb) return sb;
  await loadLib();
  sb = window.supabase.createClient(URL_, ANON, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'pokasnap-auth' },
  });
  return sb;
}

/* Which third-party buttons can honestly work here. Google blocks OAuth inside
   embedded web views, and Apple's native flow needs the app's bundle ID added to
   the Supabase Apple provider -- so the iOS build offers email + guest until the
   native Sign in with Apple step is configured. No dead buttons. */
export const providers = { apple: !isNative, google: !isNative, email: true };

export async function session() {
  try { const c = await client(); const { data } = await c.auth.getSession(); return data.session || null; }
  catch (e) { return null; }
}

export async function oauth(provider) {
  const c = await client();
  const { error } = await c.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin + location.pathname } });
  if (error) throw error;
}

export async function emailSignUp(email, password) {
  const c = await client();
  const { data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: PLAY_URL } });
  if (error) throw error;
  return { session: data.session, needsConfirm: !data.session };
}

export async function emailSignIn(email, password) {
  const c = await client();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() { try { const c = await client(); await c.auth.signOut(); } catch (e) {} }

export async function deleteAccount() {
  const c = await client();
  const s = (await c.auth.getSession()).data.session;
  if (!s) throw new Error('Please sign in again to delete your account.');
  const { error } = await c.rpc('tupu_delete_account');
  if (error) throw error;
  await c.auth.signOut();
  return true;
}

export async function onAuth(fn) {
  try { const c = await client(); c.auth.onAuthStateChange((_e, s) => fn(s)); } catch (e) {}
}
