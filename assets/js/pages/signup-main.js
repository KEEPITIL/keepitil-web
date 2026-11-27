/* KEEPITIL signup.html: inline script "main" moved verbatim to an external file (CSP: no executable inline script). */
var SUPA_URL='https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
var SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
var supa=window.supabase?supabase.createClient(SUPA_URL,SUPA_KEY):null;
function $(id){return document.getElementById(id);}
var MSG=$('msg');
function say(t,ok){ MSG.textContent=t; MSG.className='msg '+(ok?'ok':'err'); }

/* Social sign-up (Google / Apple): same providers as /apply. Both are enabled in keepitil-prod Auth and
   sign-ups are open, so the first sign-in with a provider creates the account. */
function oauth(provider){
  if(!supa){ say('Sign-up is unavailable right now.'); return; }
  try{
    supa.auth.signInWithOAuth({ provider:provider, options:{ redirectTo: location.origin + '/profile' } })
      .then(function(r){ if(r&&r.error){ say((provider.charAt(0).toUpperCase()+provider.slice(1))+' sign-up failed: '+r.error.message); } })
      .catch(function(){ say('Could not start sign-up. Try email + password.'); });
  }catch(e2){ say('Could not start sign-up.'); }
}
(function(){ var g=$('btn-google'); if(g)g.addEventListener('click',function(){oauth('google');});
  var ap=$('btn-apple'); if(ap)ap.addEventListener('click',function(){oauth('apple');}); })();

/* ⚠ WAS /u.html (route cleanup 2026-08-31) — a page that does not exist. An already
   signed-in visitor who opened the signup page was thrown straight to a 404. */
if(supa){ supa.auth.getSession().then(function(r){ if(r&&r.data&&r.data.session) location.replace('/dashboard'); }).catch(function(){}); }

function signUp(){
  if(!supa){ say('Loading — try again in a moment.'); return; }
  var email=($('email').value||'').trim(), pw=$('pw').value||'', pw2=$('pw2').value||'';
  say('');
  if(!email||email.indexOf('@')<0){ say('Enter a valid email.'); return; }
  if(pw.length<8){ say('Password must be at least 8 characters.'); return; }
  if(pw!==pw2){ say('Passwords do not match.'); return; }
  var b=$('signup-btn'); b.disabled=true; b.textContent='CREATING…';
  supa.auth.signUp({email:email,password:pw}).then(function(r){
    if(r&&r.error){
      var m=r.error.message||'';
      if(/already registered|already exists/i.test(m)) say('That email already has an account — log in instead.');
      else say(m);
      b.disabled=false; b.textContent='SIGN UP';
      return;
    }
    /* ⚠ WAS /create-profile.html — a page that does not exist. Signing up SUCCEEDED and then
       dropped the brand-new account on a 404: the single worst place on the site to send
       someone. The dashboard is the signed-in home and carries the profile edit link. */
    /* A profile is part of creating an account, not a later step (Founder rule 2026-09-23:
       "if no profile/account created than no one should be logged in"). This page collects no
       handle, so it is derived from the email exactly as claim_profile() would slug it; the
       shell enforces the same rule on every page, so a verification-first signup that has no
       session here is still covered at first sign-in. */
    if(r&&r.data&&r.data.session){
      var h=(email.split('@')[0]||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
      var go=function(){ location.replace('/dashboard'); };
      if(h.length<2){ go(); return; }
      supa.rpc('claim_profile',{p_handle:h,p_display:''}).then(function(c){
        if(c&&!c.error&&c.data){ location.replace('/profile?slug='+encodeURIComponent(c.data)); return; }
        supa.rpc('claim_profile',{p_handle:h+'-1',p_display:''}).then(function(c2){
          if(c2&&!c2.error&&c2.data){ location.replace('/profile?slug='+encodeURIComponent(c2.data)); return; }
          go();
        }, go);
      }, go);
    }
    else {
      /* No session means verification is required, which is the intended production flow.
         Say what happens next in the customer's terms, and give them a way to re-send rather
         than leaving them waiting on an email that may not have arrived. */
      /* Carry the caller's destination into the login link so the intent survives the whole
         signup -> verify -> log in journey. */
      var nx=''; try{ nx=new URLSearchParams(location.search).get('next')||''; }catch(e){}
      var loginHref='/apply'+(nx?('?next='+encodeURIComponent(nx)):'');
      MSG.innerHTML='<b>Account created.</b> Check your email for a verification link, then '
        + '<a href="'+loginHref+'" style="color:var(--blue)">log in</a>. '
        + 'You will need to verify before you can enter or join communities. '
        + '<button type="button" id="resend-verify" style="background:none;border:0;color:var(--blue);'
        + 'cursor:pointer;font:inherit;text-decoration:underline;padding:0">Send it again</button>';
      MSG.className='msg ok';
      var rb=document.getElementById('resend-verify');
      if(rb) rb.addEventListener('click', function(){
        rb.disabled=true; rb.textContent='Sending…';
        supa.auth.resend({type:'signup', email:email,
          options:{emailRedirectTo:'https://keepitil.com/apply'}})
          .then(function(rr){ say(rr && rr.error
              ? 'Could not send it just now — try again in a minute.'
              : 'Sent. Check your inbox and spam.', !(rr&&rr.error)); })
          .catch(function(){ say('Could not send it just now — try again in a minute.'); });
      });
      b.disabled=false; b.textContent='SIGN UP';
    }
  }).catch(function(){ say('Could not sign up — try again.'); b.disabled=false; b.textContent='SIGN UP'; });
}
$('signup-btn').addEventListener('click',signUp);
$('pw2').addEventListener('keydown',function(e){ if(e.key==='Enter') signUp(); });
