// create-event.html lines 485-487 at 32fe95c (main before the payouts fix): the browser claimed payouts itself.
// Kept as a fixture so the negative control in connect-payouts.test.mjs runs on a shallow CI checkout.
export const OLD_CREATE_EVENT_32FE95C = String.raw`
  var uid=s.user&&s.user.id, payok=false;
  try{ if(uid){ var q=await supa.from('app_users').select('handle,payouts_enabled').eq('id',uid).maybeSingle(); if(q&&q.data){ if(q.data.handle) MY_HANDLE=q.data.handle; payok=!!q.data.payouts_enabled; } } }catch(e){}
  try{ if(uid && new URLSearchParams(location.search).get('payouts')==='done' && !payok){ await supa.rpc('mark_payouts_enabled'); payok=true; } }catch(e){}
`;
