/* KEEPITIL apply.html: inline script "main" moved verbatim to an external file (CSP: no executable inline script). */
var SUPA_URL='https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
var SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
var supa=window.supabase?supabase.createClient(SUPA_URL,SUPA_KEY):null;
function $(id){return document.getElementById(id);}

/* If already signed in, go STRAIGHT to the profile (you stay logged in on this device —
   no re-login needed). Use ?stay=1 to remain on the login page (e.g. to switch accounts). */
if(supa){
  supa.auth.getSession().then(function(r){
    if(r&&r.data&&r.data.session){
      if(new URLSearchParams(location.search).get('stay')==='1'){ var p=$('portal-note'); if(p) p.style.display='inline-block'; }
      /* Back from Google/Apple sign-in (or already signed in): honour a safe ?next= (e.g. /submit-event), else profile. */
      else { location.replace(kilNext() || '/profile'); }
    }
  }).catch(function(){});
}

/* KEEPITIL 1.0 (Grok 2026-11-24): sign-in is by EMAIL only. @handle sign-in was never able to work (no email_for_handle function exists in production, and a lookup that
   returns an email to an anonymous caller would be a privacy leak), so the handle path and its RPC call are gone. */
function signIn(){
  if(!supa){ $('err').textContent='Sign-in is loading — try again in a moment.'; return; }
  var id=($('login-id').value||'').trim(), pw=$('password').value||'';
  $('err').textContent='';
  if(!id){ $('err').textContent='Enter your email.'; return; }
  if(id.indexOf('@')<1){ $('err').textContent='Log in with your email address.'; return; }
  if(!pw){ $('err').textContent='Enter your password.'; return; }
  var b=$('login-btn'); b.disabled=true; b.textContent='LOGGING IN…';
  var email=id;
  Promise.resolve().then(function(){
    return supa.auth.signInWithPassword({email:email,password:pw}).then(function(r){
      if(r&&r.error){
        var m=r.error.message||'';
        /* VERIFICATION IS REQUIRED NOW (2026-08-31). mailer_autoconfirm was on, so every
           signup got a live session immediately and this branch never fired. It fires now,
           and a dead end is not good enough: offer to send the email again. */
        if(/email not confirmed|not confirmed/i.test(m)){
          $('err').innerHTML='Verify your email to join communities, post, or chat. '
            + 'Check your inbox and spam. <button type="button" id="resend-verify" '
            + 'style="background:none;border:0;color:var(--blue);cursor:pointer;'
            + 'font:inherit;text-decoration:underline;padding:0">Send it again</button>';
          var rb=document.getElementById('resend-verify');
          if(rb) rb.addEventListener('click', function(){
            rb.disabled=true; rb.textContent='Sending…';
            supa.auth.resend({type:'signup', email:email,
              options:{emailRedirectTo:'https://keepitil.com/apply' + (kilNext() ? '?next=' + encodeURIComponent(kilNext()) : '')}})
              .then(function(rr){
                $('err').textContent = (rr && rr.error)
                  ? 'Could not send it just now — try again in a minute.'
                  : 'Sent. Check your inbox and spam for the verification link.';
              })
              .catch(function(){ $('err').textContent='Could not send it just now — try again in a minute.'; });
          });
        }
        else if(m==='Invalid login credentials') $('err').textContent='Wrong email or password. Try “Forgot password?”.';
        else $('err').textContent=m;
        b.disabled=false; b.textContent='LOG IN';
      } else {
        /* INTENT SURVIVES AUTH. A visitor who tapped a community and was asked to sign in
           should land back on that community, not on their profile with the thing they wanted
           forgotten. Same-origin PATHS only — an open redirect here would let any link send a
           freshly authenticated user anywhere. */
        location.replace(kilNext() || '/profile');
      }
    });
  }).catch(function(){ $('err').textContent='Could not log in — try again.'; b.disabled=false; b.textContent='LOG IN'; });
}

/* Returns a safe same-origin path from ?next=, or '' when there isn't one. Rejects anything
   that is not a single-slash-rooted path, which is what blocks //evil.com and absolute URLs. */
function kilNext(){
  try{
    var n = new URLSearchParams(location.search).get('next') || '';
    if(!n) return '';
    n = decodeURIComponent(n);
    if(n.charAt(0) !== '/' || n.charAt(1) === '/') return '';
    /* Browsers read a backslash as a slash and drop tabs and line breaks inside a URL, so /\evil.example
       and /%09/evil.example are protocol-relative (//evil.example). Refuse them and any control character. */
    if(/[\\\u0000-\u001f\u007f]/.test(n)) return '';
    return n;
  }catch(e){ return ''; }
}
$('login-btn').addEventListener('click',signIn);
/* Social sign-in (Google / Apple). Works once the provider is enabled in Supabase Auth.
   Until then it shows a friendly message instead of a raw error. */
function oauth(provider){
  if(!supa){ var e=$('err'); if(e){e.textContent='Sign-in is unavailable right now.';} return; }
  try{
    supa.auth.signInWithOAuth({ provider:provider, options:{ redirectTo: location.origin + (kilNext() ? '/apply?next=' + encodeURIComponent(kilNext()) : '/profile') } })
      .then(function(r){ if(r&&r.error){ var e=$('err'); if(e){ e.textContent=(provider.charAt(0).toUpperCase()+provider.slice(1))+' sign-in failed: '+r.error.message; } } })
      .catch(function(){ var e=$('err'); if(e){e.textContent='Could not start sign-in. Try email + password.';} });
  }catch(e2){ var e=$('err'); if(e){e.textContent='Could not start sign-in.';} }
}
(function(){ var g=$('btn-google'); if(g)g.addEventListener('click',function(){oauth('google');});
  var a=$('btn-apple'); if(a)a.addEventListener('click',function(){oauth('apple');}); })();
$('password').addEventListener('keydown',function(e){ if(e.key==='Enter') signIn(); });
$('login-id').addEventListener('keydown',function(e){ if(e.key==='Enter') signIn(); });
$('forgot-link').addEventListener('click',function(e){ e.preventDefault(); $('signin-box').style.display='none'; $('reset-box').style.display='block'; });
$('back-link').addEventListener('click',function(e){ e.preventDefault(); $('reset-box').style.display='none'; $('signin-box').style.display='block'; });
$('reset-btn').addEventListener('click',function(){
  if(!supa) return;
  var email=($('reset-email').value||'').trim(), msg=$('reset-msg');
  if(!email){ msg.style.color='#ff5c5c'; msg.textContent='Enter your email.'; return; }
  /* ⚠ WAS /portal.html (route cleanup 2026-08-31) — a page that does not exist and returns
     404. Anyone who asked to reset their password got the email, clicked the link, and landed
     on an error page with the recovery token in the URL and no form to use it, so password
     reset was broken end to end from this page. /reset-password is the real handler and
     already sets this same redirectTo for its own re-send. */
  supa.auth.resetPasswordForEmail(email,{redirectTo:'https://keepitil.com/reset-password'}).then(function(r){
    if(r&&r.error){ msg.style.color='#ff5c5c'; msg.textContent=r.error.message; }
    else { msg.style.color='var(--blue)'; msg.textContent='Check your email (and spam) for the reset link.'; }
  }).catch(function(){ msg.style.color='#ff5c5c'; msg.textContent='Could not send — try again.'; });
});
