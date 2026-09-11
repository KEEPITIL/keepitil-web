/* KWARS1 ACCOUNT UI (window.KWAccount)
   A compact account surface. Home shows at most one line about saving online;
   everything else lives in Settings. No account is required to play. */
(function(){
  'use strict';
  const X=window.KWExperience, C=window.KWCloud;
  if(!X||!C)return;
  const $=id=>document.getElementById(id);
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const when=t=>t?new Date(t).toLocaleDateString():'never';

  function line(label,a,b){
    return '<li><span>'+label+'</span><b>'+a+'</b><b>'+b+'</b></li>';
  }
  function summary(d){
    return '<ul class="acctfacts">'+
      '<li><span>Kingdoms conquered</span><b>'+d.kingdoms+'</b></li>'+
      '<li><span>Highest Endless wave</span><b>'+d.highestWave+'</b></li>'+
      '<li><span>Legacy XP</span><b>'+d.legacyXP+'</b></li>'+
      '<li><span>Gems</span><b>'+d.gems+'</b></li>'+
      (d.activeWave!=null?'<li><span>Battle in progress</span><b>Wave '+d.activeWave+'</b></li>':'')+
      '<li><span>Last played</span><b>'+when(d.lastPlayed)+'</b></li></ul>';
  }

  /* ---- §16 conflict: never silently overwrite either side ---- */
  function conflict(localD, cloudD, onDone){
    X.showPanel('CHOOSE WHICH PROGRESS TO KEEP',
      '<p class="note">This device and your account both hold progress. Nothing is '+
      'overwritten until you choose. The copy you do not pick stays where it is.</p>'+
      '<div class="modecard"><h3>THIS DEVICE</h3>'+summary(localD)+
        '<button class="menubtn primary" id="useLocal">USE THIS DEVICE</button></div>'+
      '<div class="modecard"><h3>YOUR ACCOUNT</h3>'+summary(cloudD)+
        '<button class="menubtn primary" id="useCloud">USE ACCOUNT</button></div>');
    $('useLocal').onclick=async()=>{
      const r=await C.push(true);
      done(r.ok?'This device’s progress is now saved to your account.':'Could not reach your account. Your device progress is untouched — it will sync later.',onDone);
    };
    $('useCloud').onclick=async()=>{
      const r=await C.restore();
      if(r.ok){ done('Account progress restored to this device. Reloading…',onDone,true); }
      else done('Could not restore from your account. Your device progress is untouched.',onDone);
    };
  }
  function done(msg,cb,reload){
    X.showPanel('ACCOUNT','<p>'+esc(msg)+'</p>'+
      (reload?'':'<button class="menubtn" id="acctBack">BACK</button>'));
    if(reload){ setTimeout(()=>location.reload(),1200); return; }
    $('acctBack').onclick=()=>{ (cb||showAccount)(); };
  }

  /* ---- after a successful sign-in / sign-up ---- */
  async function afterAuth(){
    const localD=C.digest(C.bundle());
    const r=await C.pull();
    if(!r.ok){
      return done('Signed in. Your account could not be reached just now, so this device keeps playing locally and will sync later.');
    }
    if(r.empty){
      if(C.isEmpty(localD)) return done('Signed in. Progress on this device will be saved to your account from now on.');
      // §16: local progress, empty cloud -> offer import, do not auto-push silently
      X.showPanel('SAVE THIS DEVICE’S PROGRESS?',
        '<p class="note">Your account has no saved progress yet.</p>'+summary(localD)+
        '<button class="menubtn primary" id="doImport">IMPORT THIS DEVICE’S PROGRESS</button>'+
        '<button class="menubtn" id="skipImport">NOT NOW</button>');
      $('doImport').onclick=async()=>{ const p=await C.push(true);
        done(p.ok?'Progress saved to your account.':'Could not reach your account. Nothing was lost.'); };
      $('skipImport').onclick=()=>showAccount();
      return;
    }
    if(C.isEmpty(localD)){
      const rr=await C.restore();
      return done(rr.ok?'Your account progress has been restored to this device. Reloading…'
                      :'Could not restore your account progress. This device is unchanged.',null,rr.ok);
    }
    conflict(localD,r.digest);
  }

  /* ---- forms ---- */
  function authForm(mode){
    const title=mode==='up'?'CREATE ACCOUNT':'SIGN IN';
    X.showPanel(title,
      '<p class="note">An account is only used to save your progress online. '+
      'You can keep playing as a guest without one.</p>'+
      '<label class="acctlabel">Email<input id="acctEmail" type="email" autocomplete="email" inputmode="email"></label>'+
      '<label class="acctlabel">Password<input id="acctPass" type="password" autocomplete="'+(mode==='up'?'new-password':'current-password')+'"></label>'+
      '<p class="acctmsg" id="acctMsg" role="status"></p>'+
      '<button class="menubtn primary" id="acctGo">'+title+'</button>'+
      (mode==='up'?'<button class="menubtn" id="acctSwap">I ALREADY HAVE AN ACCOUNT</button>'
                  :'<button class="menubtn" id="acctSwap">CREATE AN ACCOUNT</button>'+
                   '<button class="menubtn" id="acctForgot">FORGOT PASSWORD</button>')+
      '<button class="menubtn" id="acctBack2">BACK</button>');
    const msg=t=>{ $('acctMsg').textContent=t; };
    $('acctGo').onclick=async()=>{
      const e=$('acctEmail').value.trim(), p=$('acctPass').value;
      if(!e||!p)return msg('Enter an email and password.');
      if(mode==='up'&&p.length<8)return msg('Use at least 8 characters.');
      $('acctGo').disabled=true; msg('Working…');
      const r=mode==='up'?await C.signUp(e,p):await C.signIn(e,p);
      $('acctGo').disabled=false;
      if(!r.ok)return msg(r.error||'That did not work.');
      if(r.needsConfirm)return msg('Check your email to confirm the account, then sign in.');
      afterAuth();
    };
    $('acctSwap').onclick=()=>authForm(mode==='up'?'in':'up');
    if($('acctForgot'))$('acctForgot').onclick=async()=>{
      const e=$('acctEmail').value.trim();
      if(!e)return msg('Enter your email first.');
      const r=await C.resetPassword(e);
      msg(r.ok?'Check your email for a reset link.':(r.error||'Could not send the link.'));
    };
    $('acctBack2').onclick=showAccount;
  }

  function showAccount(){
    const s=C.state();
    if(!s.available){
      return X.showPanel('ACCOUNT','<p class="note">Online accounts are unavailable right now. '+
        'Your progress is saved on this device and the game is fully playable.</p>');
    }
    if(!s.signedIn){
      X.showPanel('ACCOUNT',
        '<p>You are playing as a <b>guest</b>. Progress is saved on this device only.</p>'+
        '<p class="note">Create an account to keep your progress if you clear your browser '+
        'or want to play on another device. Not required to play.</p>'+
        summary(C.digest(C.bundle()))+
        '<button class="menubtn primary" id="acctUp">SAVE PROGRESS ONLINE</button>'+
        '<button class="menubtn" id="acctIn">SIGN IN</button>');
      $('acctUp').onclick=()=>authForm('up');
      $('acctIn').onclick=()=>authForm('in');
      return;
    }
    X.showPanel('ACCOUNT',
      '<p>Signed in as <b>'+esc(s.email)+'</b></p>'+
      '<p class="note" id="syncState">Progress on this device syncs to your account at checkpoints.</p>'+
      summary(C.digest(C.bundle()))+
      '<button class="menubtn primary" id="acctSync">SAVE TO ACCOUNT NOW</button>'+
      '<button class="menubtn" id="acctRestore">RESTORE FROM ACCOUNT</button>'+
      '<button class="menubtn" id="acctOut">SIGN OUT</button>');
    $('acctSync').onclick=async()=>{ $('syncState').textContent='Saving…';
      const r=await C.push(true);
      $('syncState').textContent=r.ok?'Saved to your account just now.'
        :'Could not reach your account. This device still has your progress.'; };
    $('acctRestore').onclick=async()=>{
      const r=await C.pull();
      if(!r.ok||r.empty)return done('There is no saved progress on your account yet.');
      conflict(C.digest(C.bundle()),r.digest);
    };
    $('acctOut').onclick=async()=>{ await C.signOut();
      done('Signed out. This device keeps a playable copy of your progress.'); };
  }

  /* ---- checkpoints that trigger a debounced cloud push ---- */
  const R=window.KWRuntime&&window.KWRuntime.events;
  if(R){ ['wave_completed','campaign_battle_completed','campaign_result','run_ended']
         .forEach(e=>R.on(e,()=>C.checkpoint(e))); }
  window.addEventListener('pagehide',()=>{ if(C.state().signedIn) C.push().catch(()=>{}); });

  window.KWAccount=Object.freeze({showAccount,authForm,afterAuth,conflict,summary});
  C.init();
})();
