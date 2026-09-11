/* KWARS1 CLOUD SAVES + ACCOUNTS  (window.KWCloud)
   ---------------------------------------------------------------------------
   Guest play is the default and is never gated. An account exists only so a
   player can carry progress to another device.

   Design rules this module obeys:
     * LOCAL IS THE WORKING COPY. Cloud is a second persistence layer, never a
       replacement for local recovery. Every failure path -- offline, auth
       expiry, empty row, malformed response -- leaves the local save alone.
     * NEVER SILENTLY OVERWRITE. When both sides hold progress, the player is
       shown what each contains and chooses. We do not merge run state.
     * NO NETWORK WRITE PER FRAME. Pushes are debounced and only fire on
       meaningful checkpoints.
   The anon key below is the site's public publishable key (role: "anon"); it is
   meant to ship. Row access is enforced server-side by RLS (auth.uid()=user_id).
*/
(function(){
  'use strict';
  const URL_='https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
  const ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
  const TABLE='kwars_saves';
  const PUSH_DEBOUNCE=4000;

  let sb=null, user=null, ready=false, lastPush=0, pushTimer=null, status='guest';
  const listeners=[];
  const emit=()=>listeners.forEach(f=>{try{f(state())}catch(e){}});
  function state(){return {signedIn:!!user, email:user?user.email:null, userId:user?user.id:null, status, available:!!sb};}
  function on(f){listeners.push(f);try{f(state())}catch(e){}}

  function client(){
    if(sb)return sb;
    if(!window.supabase||!window.supabase.createClient)return null;
    try{
      sb=window.supabase.createClient(URL_,ANON,{auth:{persistSession:true,autoRefreshToken:true,
        storageKey:'kwars1-auth'}});
    }catch(e){ sb=null; }
    return sb;
  }

  /* ---------------- the save bundle -------------------------------------
     Exactly the keys the game already persists locally. We ship the existing
     envelopes verbatim rather than inventing a second format, so schema 3 and
     the hash/backup machinery keep working on restore. */
  const KEYS=['kw-save-v2-profile-current','kw-save-v2-run-current','kw-save-v2-campaign-current',
              'kw-save-v2-final-sieges-current','kingdom-wars-commerce-v1','kingdom-wars-equipment-v2'];
  function bundle(){
    const out={};
    for(const k of KEYS){ const v=localStorage.getItem(k); if(v!=null) out[k]=v; }
    return out;
  }
  // A human-readable digest so a conflict can be judged on real progress.
  function digest(b){
    const g=k=>{try{return JSON.parse(b[k]||'null')}catch(e){return null}};
    const prof=g('kw-save-v2-profile-current'), run=g('kw-save-v2-run-current'),
          camp=g('kw-save-v2-campaign-current'), com=(()=>{try{return JSON.parse(b['kingdom-wars-commerce-v1']||'null')}catch(e){return null}})();
    const p=prof&&prof.payload||{}, r=run&&run.payload&&run.payload.active, c=camp&&camp.payload||{};
    return {
      highestWave:(p.records&&p.records.highestWave)||0,
      kingdoms:c.completed?Object.keys(c.completed).length:0,
      legacyXP:(p.profile&&p.profile.legacyXP)||0,
      gems:(com&&com.wallet&&com.wallet.currentBalance)||0,
      activeWave:r?r.wave:null,
      lastPlayed:p.lastPlayed||0
    };
  }
  function isEmpty(d){ return !d || (!d.highestWave && !d.kingdoms && !d.legacyXP && d.activeWave==null); }

  function applyBundle(b){
    if(!b||typeof b!=='object')return false;
    let n=0;
    for(const k of KEYS){
      if(typeof b[k]==='string'){ localStorage.setItem(k,b[k]); n++; }
      // a key absent from the cloud bundle is left alone rather than cleared:
      // deleting local data to mirror an incomplete cloud row is exactly the
      // destructive behaviour this module exists to prevent.
    }
    return n>0;
  }

  /* ---------------- auth ---------------- */
  async function init(){
    const c=client(); if(!c){status='unavailable';emit();return state();}
    try{
      const {data}=await c.auth.getSession();
      user=(data&&data.session&&data.session.user)||null;
      status=user?'signed-in':'guest';
      c.auth.onAuthStateChange((_e,s)=>{ user=(s&&s.access_token&&s.user)||null; status=user?'signed-in':'guest'; emit(); });
    }catch(e){ status='offline'; }
    ready=true; emit(); return state();
  }
  async function signUp(email,password){
    const c=client(); if(!c)return {ok:false,error:'Accounts are unavailable right now.'};
    try{
      const {data,error}=await c.auth.signUp({email,password});
      if(error)return {ok:false,error:error.message};
      // Authority is the SESSION, never data.user. When the project requires
      // email confirmation, signUp returns a user with no session: there is no
      // access token, so every cloud write would be denied by RLS. Claiming
      // "signed in" there would tell the player their progress is being saved
      // online when it is not.
      const session=(data&&data.session)||null;
      user=session?session.user:null;
      status=user?'signed-in':'guest'; emit();
      return {ok:true,needsConfirm:!session};
    }catch(e){ return {ok:false,error:'Could not reach the account service.'}; }
  }
  async function signIn(email,password){
    const c=client(); if(!c)return {ok:false,error:'Accounts are unavailable right now.'};
    try{
      const {data,error}=await c.auth.signInWithPassword({email,password});
      if(error)return {ok:false,error:error.message};
      const session=(data&&data.session)||null;
      if(!session){ status='guest'; emit(); return {ok:false,error:'Confirm your email address, then sign in.'}; }
      user=session.user; status='signed-in'; emit();
      return {ok:true};
    }catch(e){ return {ok:false,error:'Could not reach the account service.'}; }
  }
  async function signOut(){
    const c=client(); if(!c)return {ok:true};
    try{ await c.auth.signOut(); }catch(e){}
    user=null; status='guest'; emit();
    // The local save deliberately survives sign-out: the device keeps a usable copy.
    return {ok:true};
  }
  async function resetPassword(email){
    const c=client(); if(!c)return {ok:false,error:'Accounts are unavailable right now.'};
    try{
      const {error}=await c.auth.resetPasswordForEmail(email,{redirectTo:'https://keepitil.com/reset-password'});
      return error?{ok:false,error:error.message}:{ok:true};
    }catch(e){ return {ok:false,error:'Could not send the reset link.'}; }
  }

  /* ---------------- cloud i/o ---------------- */
  async function pull(){
    const c=client(); if(!c||!user)return {ok:false,reason:'not-signed-in'};
    try{
      const {data,error}=await c.from(TABLE).select('payload,schema_version,updated_at').eq('user_id',user.id).maybeSingle();
      if(error)return {ok:false,reason:'error',error:error.message};
      if(!data)return {ok:true,empty:true};
      if(!data.payload||typeof data.payload!=='object')return {ok:false,reason:'corrupt'};
      return {ok:true,empty:false,bundle:data.payload,digest:digest(data.payload),
              updatedAt:data.updated_at,schema:data.schema_version};
    }catch(e){ return {ok:false,reason:'offline'}; }
  }
  async function push(force){
    const c=client(); if(!c||!user)return {ok:false,reason:'not-signed-in'};
    const b=bundle();
    if(isEmpty(digest(b))&&!force)return {ok:false,reason:'nothing-to-save'};
    try{
      const {error}=await c.from(TABLE).upsert({
        user_id:user.id, payload:b, schema_version:(window.KWSave&&window.KWSave.schemaVersion)||3,
        app_version:(window.KWBuild&&window.KWBuild.appVersion)||null,
        device_updated_at:new Date().toISOString()
      },{onConflict:'user_id'});
      if(error)return {ok:false,reason:'error',error:error.message};
      lastPush=Date.now();
      return {ok:true};
    }catch(e){ return {ok:false,reason:'offline'}; }
  }
  // Checkpoint pushes are debounced; offline failures are swallowed on purpose,
  // because losing connectivity must never interrupt play.
  function checkpoint(reason){
    if(!user)return;
    clearTimeout(pushTimer);
    pushTimer=setTimeout(()=>{ push().catch(()=>{}); }, PUSH_DEBOUNCE);
  }
  async function restore(){
    const r=await pull();
    if(!r.ok||r.empty)return r;
    return applyBundle(r.bundle)?{ok:true,applied:true,digest:r.digest}:{ok:false,reason:'corrupt'};
  }

  window.KWCloud=Object.freeze({init,on,state,signUp,signIn,signOut,resetPassword,
    pull,push,restore,checkpoint,bundle,digest,isEmpty,applyBundle,KEYS});
})();
