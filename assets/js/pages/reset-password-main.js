/* KEEPITIL reset-password.html: inline script "main" moved verbatim to an external file (CSP: no executable inline script). */
(function(){
  var URL='https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
  var KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
  var sb=window.supabase?window.supabase.createClient(URL,KEY):null;
  function $(id){return document.getElementById(id);}
  function setMsg(t,err){var m=$('msg');m.textContent=t||'';m.className='msg'+(err?' err':'');}
  var recovering=false;
  if(sb){
    sb.auth.onAuthStateChange(function(ev){ if(ev==='PASSWORD_RECOVERY'){ recovering=true; } });
  }
  // If arriving without a recovery token, show the "request a link" form instead
  setTimeout(function(){
    var hasToken=(location.hash.indexOf('type=recovery')>-1)||(location.hash.indexOf('access_token')>-1)||recovering;
    if(!hasToken){
      $('ttl').textContent='Forgot your password?';
      $('sub').textContent='Enter your email and we will send a reset link.';
      $('form-set').style.display='none';
      $('form-request').style.display='block';
    }
  }, 400);

  $('save').onclick=function(){
    var pw=$('pw').value||'', pw2=$('pw2').value||'';
    if(pw.length<8){ setMsg('Password must be at least 8 characters.',true); return; }
    if(pw!==pw2){ setMsg('Passwords do not match.',true); return; }
    if(!sb){ setMsg('Reset is being set up — try again shortly.',true); return; }
    setMsg('Saving…');
    sb.auth.updateUser({password:pw}).then(function(r){
      if(r&&r.error){ setMsg(r.error.message||'Could not update password. Your reset link may have expired — request a new one.',true); }
      else{ setMsg('Password updated! Redirecting…'); setTimeout(function(){ location.href='/'; },1200); }
    }).catch(function(){ setMsg('Could not update password.',true); });
  };

  $('send').onclick=function(){
    var email=$('email').value||'';
    if(!email){ setMsg('Enter your email.',true); return; }
    if(!sb){ setMsg('Reset is being set up — try again shortly.',true); return; }
    setMsg('Sending…');
    sb.auth.resetPasswordForEmail(email,{redirectTo:'https://keepitil.com/reset-password'}).then(function(r){
      setMsg((r&&r.error)?(r.error.message||'Could not send reset link.'):'Check your email for the reset link.', r&&r.error);
    }).catch(function(){ setMsg('Could not send reset link.',true); });
  };
})();
