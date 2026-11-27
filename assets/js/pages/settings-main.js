/* KEEPITIL settings.html: inline script "main" moved verbatim to an external file (CSP: no executable inline script). */
var SUPA_URL='https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
var SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
var SB=null; try{ if(window.supabase) SB=window.supabase.createClient(SUPA_URL,SUPA_KEY); }catch(e){}
var THEMES=[['dark','Dark','#0b0b0b'],['light','Light','#f4f5fa'],['midnight','Midnight','#070d1c'],['synthwave','Synth','#150018'],['sunset','Sunset','#160d07']];
var STATE={}, SIGNED=false;

/* ---- tabs ---- */
document.getElementById('snav').addEventListener('click',function(e){
  var b=e.target.closest('button'); if(!b) return;
  var g=b.getAttribute('data-g');
  [].forEach.call(document.querySelectorAll('.snav button'),function(x){x.classList.toggle('on',x===b);});
  [].forEach.call(document.querySelectorAll('.grp'),function(x){x.classList.toggle('on',x.getAttribute('data-g')===g);});
});

/* ---- theme swatches ---- */
function currentTheme(){try{return localStorage.getItem('kil-theme')||'dark';}catch(e){return 'dark';}}
function renderThemes(){
  var host=document.getElementById('themes'); host.innerHTML='';
  THEMES.forEach(function(t){
    var d=document.createElement('div'); d.className='sw'+(currentTheme()===t[0]?' on':''); d.style.background=t[2];
    d.innerHTML='<span>'+t[1]+'</span>';
    d.onclick=function(){ setTheme(t[0]); };
    host.appendChild(d);
  });
}
function setTheme(t){
  document.documentElement.setAttribute('data-theme',t);
  try{localStorage.setItem('kil-theme',t);}catch(e){}
  renderThemes();
  save({theme:t},'sz-appearance');
}

/* ---- toggles & selects ---- */
function applyState(){
  [].forEach.call(document.querySelectorAll('.tog[data-k]'),function(el){
    var k=el.getAttribute('data-k'); el.classList.toggle('on', !!STATE[k]);
    el.onclick=function(){ STATE[k]=!STATE[k]; el.classList.toggle('on',STATE[k]); var o={};o[k]=STATE[k]; save(o, szId(el)); };
  });
  [].forEach.call(document.querySelectorAll('select[data-k]'),function(el){
    var k=el.getAttribute('data-k'); if(STATE[k]!=null) el.value=STATE[k];
    el.onchange=function(){ STATE[k]=el.value; var o={};o[k]=el.value; save(o, szId(el)); };
  });
}
function szId(el){var g=el.closest('.grp'); return g?('sz-'+g.getAttribute('data-g')):null;}

/* ---- persistence ---- */
function save(patch, szid){
  for(var k in patch) STATE[k]=patch[k];
  var sz= szid?document.getElementById(szid):null;
  if(SIGNED && SB){
    SB.rpc('save_my_settings',{p_settings:patch}).then(function(r){
      if(sz){ sz.textContent = r && !r.error ? 'Saved ✓' : 'Saved on this device'; setTimeout(function(){sz.textContent='';},1800); }
    });
  } else {
    try{localStorage.setItem('kil-settings',JSON.stringify(STATE));}catch(e){}
    if(sz){ sz.textContent='Saved on this device'; setTimeout(function(){sz.textContent='';},1800); }
  }
}

/* ---- KEEPITIL App push (VAPID web push; per-category opt-in) ---- */
function pushSupported(){ return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
function urlB64ToU8(s){ var pad='='.repeat((4-s.length%4)%4); var b=(s+pad).replace(/-/g,'+').replace(/_/g,'/'); var raw=atob(b); var a=new Uint8Array(raw.length); for(var i=0;i<raw.length;i++)a[i]=raw.charCodeAt(i); return a; }
function setPushUI(on,msg){ var t=document.getElementById('pushTog'); if(t)t.classList.toggle('on',!!on); var st=document.getElementById('pushStatus'); if(st&&msg)st.textContent=msg; }
function initPush(){
  var t=document.getElementById('pushTog'); if(!t) return;
  if(!pushSupported()){ setPushUI(false,'Not supported in this browser — install the KEEPITIL App from Chrome, or add to Home Screen on iPhone first'); t.style.opacity=.4; return; }
  if(!SIGNED){ setPushUI(false,'Log in to turn on push'); t.style.opacity=.4; return; }
  navigator.serviceWorker.ready.then(function(reg){
    reg.pushManager.getSubscription().then(function(sub){ setPushUI(!!sub, sub?'On — alerts arrive on this device':'Turn on to get alerts even when KEEPITIL is closed'); });
  });
  t.onclick=function(){
    var sz=document.getElementById('sz-push');
    navigator.serviceWorker.ready.then(function(reg){
      reg.pushManager.getSubscription().then(function(sub){
        if(sub){
          var ep=sub.endpoint;
          sub.unsubscribe().then(function(){ SB.rpc('remove_push_subscription',{p_endpoint:ep}); setPushUI(false,'Off'); if(sz){sz.textContent='Push turned off';setTimeout(function(){sz.textContent='';},1800);} });
          return;
        }
        Notification.requestPermission().then(function(perm){
          if(perm!=='granted'){ setPushUI(false,'Blocked — allow notifications for keepitil.com in your browser settings'); return; }
          SB.rpc('get_vapid_public').then(function(r){
            var key=r&&r.data; if(!key){ setPushUI(false,'Could not load push key — try again'); return; }
            reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:urlB64ToU8(key)}).then(function(ns){
              var j=ns.toJSON();
              SB.rpc('save_push_subscription',{p_endpoint:ns.endpoint,p_p256dh:(j.keys||{}).p256dh||'',p_auth:(j.keys||{}).auth||'',p_user_agent:navigator.userAgent}).then(function(rr){
                var ok=rr&&rr.data&&rr.data.ok;
                if(ok){ setPushUI(true,'On — alerts arrive on this device'); if(sz){sz.textContent='Push is on ✓ Pick your categories below';setTimeout(function(){sz.textContent='';},2600);} }
                else { ns.unsubscribe(); setPushUI(false,'Could not save — try again'); }
              });
            }).catch(function(){ setPushUI(false,'Could not subscribe — try again'); });
          });
        });
      });
    });
  };
}

function goProfile(){ var h=window.__myHandle; if(h){ location.href='/profile?slug='+encodeURIComponent(h); } else if(document.referrer&&/\/v31\//.test(document.referrer)){ history.back(); } else { location.href='/'; } }
function saveEmail(){ var sz=document.getElementById('sz-account'); var el=document.getElementById('acc-email-in'); var email=(el.value||'').trim();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ if(sz){sz.textContent='Enter a valid email';setTimeout(function(){sz.textContent='';},2200);} return; }
  if(!SB||!SIGNED){ if(sz)sz.textContent='Log in to change your email'; return; }
  if(sz)sz.textContent='Updating…';
  SB.auth.updateUser({email:email}).then(function(r){ if(sz){ sz.textContent=(r&&r.error)?('Could not update: '+r.error.message):'Check your new email to confirm the change ✓'; setTimeout(function(){sz.textContent='';},4000);} }); }
function savePass(){ var sz=document.getElementById('sz-account'); var el=document.getElementById('acc-pass'); var p=(el.value||'');
  if(p.length<8){ if(sz){sz.textContent='Password must be at least 8 characters';setTimeout(function(){sz.textContent='';},2200);} return; }
  if(!SB||!SIGNED){ if(sz)sz.textContent='Log in to change your password'; return; }
  if(sz)sz.textContent='Updating…';
  SB.auth.updateUser({password:p}).then(function(r){ el.value=''; if(sz){ sz.textContent=(r&&r.error)?('Could not update: '+r.error.message):'Password changed ✓'; setTimeout(function(){sz.textContent='';},3000);} }); }
/* MEMBER_DATA_CONTROLS: ON since keepitil.github.io #95 (export_my_data) was applied and verified on prod (2026-11-25 15:30 window). Keep it equal here AND in submit-event.html (a test keeps both equal). Off = an email request row is shown instead. */
var MEMBER_DATA_CONTROLS=true;
(function(){ var d=document.getElementById('exp-row'), m=document.getElementById('exp-mail-row'); if(!MEMBER_DATA_CONTROLS){ if(d) d.hidden=true; if(m) m.hidden=false; } })();
/* DATA EXPORT: export_my_data() returns only the signed-in person's own rows. */
function exportFileName(d){ d=d||new Date(); return 'keepitil-my-data-'+d.toISOString().slice(0,10)+'.json'; }
function exportMyData(){ var sz=document.getElementById('sz-account'), b=document.getElementById('exp-go');
  if(!SB||!SIGNED){ if(sz)sz.textContent='Log in to download your data'; return; }
  if(b)b.disabled=true; if(sz)sz.textContent='Preparing your data…';
  SB.rpc('export_my_data').then(function(r){
    if(b)b.disabled=false;
    if(!r||r.error||!r.data){ var miss=r&&r.error&&(r.error.code==='PGRST202'||/could not find the function/i.test(String(r.error.message||'')));
      if(sz)sz.textContent=miss?'Not available yet. Email info@keepitil.com and we will send you a copy.':'Could not prepare your data. Try again.'; return; }
    var blob=new Blob([JSON.stringify(r.data,null,2)],{type:'application/json'}), a=document.createElement('a');
    a.href=URL.createObjectURL(blob); a.download=exportFileName(); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(a.href); },2000); if(sz)sz.textContent='Downloaded ✓';
  }).catch(function(){ if(b)b.disabled=false; if(sz)sz.textContent='Could not prepare your data. Try again.'; }); }
/* ACCOUNT DELETION (owner-only). Server does the work in delete_my_account(); it refuses with a list of
   blocker codes (e.g. a TUITEA household that still has members). The page asks for typed confirmation first. */
var DEL_BLOCKERS=[];
function delBlockerText(code){
  if(code==='household_with_members') return 'You own a TUITEA family household that still has other members. Move or remove them in TUITEA first.';
  return 'Something on your account needs attention first ('+String(code)+'). Email info@keepitil.com and we will sort it out.';
}
function delReady(typed,blockers){ return String(typed||'').trim()==='DELETE' && !(blockers&&blockers.length); }
function delSync(){ var b=document.getElementById('del-go'); if(b) b.disabled=!delReady((document.getElementById('del-confirm')||{}).value,DEL_BLOCKERS); }
function delShowBlockers(list){ DEL_BLOCKERS=Array.isArray(list)?list:[]; var ul=document.getElementById('del-blockers'); if(!ul)return;
  ul.innerHTML=''; DEL_BLOCKERS.forEach(function(c){ var li=document.createElement('li'); li.textContent=delBlockerText(c); ul.appendChild(li); }); delSync(); }
function delOpen(){ var p=document.getElementById('del-panel'),sz=document.getElementById('sz-delete'); if(!p)return;
  if(!SB||!SIGNED){ var z=document.getElementById('sz-account'); if(z)z.textContent='Log in to delete your account'; return; }
  p.hidden=false; if(sz)sz.textContent='Checking your account…';
  SB.rpc('my_account_deletion_blockers').then(function(r){ if(sz)sz.textContent=''; delShowBlockers(r&&!r.error?r.data:[]); })
    .catch(function(){ if(sz)sz.textContent=''; delShowBlockers([]); });
  var c=document.getElementById('del-confirm'); if(c)c.focus(); }
function delClose(){ var p=document.getElementById('del-panel'),c=document.getElementById('del-confirm'); if(p)p.hidden=true; if(c)c.value=''; delSync(); }
function delGo(){ var sz=document.getElementById('sz-delete'),b=document.getElementById('del-go');
  if(!SB||!SIGNED||!delReady((document.getElementById('del-confirm')||{}).value,DEL_BLOCKERS)) return;
  b.disabled=true; if(sz)sz.textContent='Deleting…';
  SB.rpc('delete_my_account').then(function(r){
    if(r&&r.error){
      var msg=String(r.error.message||''), det=String(r.error.details||'');
      if(/account_deletion_blocked/.test(msg)){ var codes=[]; try{ codes=JSON.parse(det); }catch(e){} delShowBlockers(codes.length?codes:['unknown']); if(sz)sz.textContent='Your account cannot be deleted yet.'; }
      else if(sz){ sz.textContent='Could not delete your account. Nothing was changed. Try again, or email info@keepitil.com.'; b.disabled=false; }
      return; }
    SB.auth.signOut().then(function(){ location.href='/?account=deleted'; },function(){ location.href='/?account=deleted'; });
  }).catch(function(){ if(sz)sz.textContent='Could not delete your account. Nothing was changed. Try again, or email info@keepitil.com.'; b.disabled=false; }); }
function doLogout(){ if(SB){ SB.auth.signOut().then(function(){ location.href='/'; }); } else { location.href='/'; } }
/* Delegated actions (assets/js/kil-actions.js): the markup carries data-click / data-input instead of inline handlers; only the names listed here can run. */
function setShowAnyway(e){ showAnyway(); e.preventDefault(); }
if(window.KilActions) KilActions.allow(["delClose", "delGo", "delOpen", "delSync", "doLogout", "exportMyData", "goProfile", "saveEmail", "savePass", "setShowAnyway"]);
function showAnyway(){ document.getElementById('gate').style.display='none'; document.getElementById('cols').style.display='grid'; renderThemes(); }

/* ---- boot ---- */
(function boot(){
  renderThemes();
  if(!SB){ document.getElementById('gate').style.display='block'; return; }
  SB.auth.getSession().then(function(res){
    var s=res && res.data && res.data.session;
    if(!s){ document.getElementById('gate').style.display='block'; return; }
    SIGNED=true;
    document.getElementById('cols').style.display='grid';
    var u=s.user||{};
    var emIn=document.getElementById('acc-email-in'); if(emIn) emIn.value=u.email||'';
    var handle=(u.user_metadata&&(u.user_metadata.handle||u.user_metadata.username))||'';
    document.getElementById('acc-handle').textContent=handle?('@'+handle):'—';
    window.__myHandle=handle;
    SB.rpc('get_my_settings').then(function(r){
      STATE = (r && r.data) ? r.data : {};
      // sensible defaults
      ['notif_events','notif_chat','notif_follows','privacy_directory','chat_receipts','radio_autoplay'].forEach(function(k){ if(STATE[k]==null) STATE[k]=true; });
      if(STATE.theme && STATE.theme!==currentTheme()){ document.documentElement.setAttribute('data-theme',STATE.theme); try{localStorage.setItem('kil-theme',STATE.theme);}catch(e){} renderThemes(); }
      /* push categories are OPT-IN by design — no defaulting to true */
      applyState();
      initPush();
    });
  }).catch(function(){ document.getElementById('gate').style.display='block'; });
})();
