/* KEEPITIL culture/index.html: inline script "feed-gate" moved verbatim to an external file (CSP: no executable inline script). */
/* Culture feed — shared Supabase backend + login-gated interactions (look but can't touch). */
(function(){
  var SB=null, SES=null, PST={};
  var ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
  function toast(m){var t=document.getElementById('cul-toast');if(!t){t=document.createElement('div');t.id='cul-toast';t.style.cssText='position:fixed;left:50%;bottom:96px;transform:translateX(-50%);background:#12121c;border:1px solid #242433;color:#fff;padding:10px 18px;border-radius:22px;z-index:13000;font:600 .85rem Inter,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5);opacity:0;transition:opacity .2s';document.body.appendChild(t);}t.textContent=m;t.style.opacity='1';clearTimeout(t._h);t._h=setTimeout(function(){t.style.opacity='0';},1800);}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function signedIn(){return !!(SES&&SES.user);}
  function meName(){var u=SES&&SES.user;if(!u)return 'You';var m=u.user_metadata||{};return m.handle||m.name||m.full_name||(u.email?u.email.split('@')[0]:'User');}
  function meAvatar(){var u=SES&&SES.user,m=(u&&u.user_metadata)||{};return m.avatar||m.avatar_url||'';}
  function closeWall(){var w=document.getElementById('kil-loginwall');if(w)w.remove();}
  window.__culCloseWall=closeWall;
  function wall(){if(document.getElementById('kil-loginwall'))return true;var next=encodeURIComponent(location.pathname+location.search);var ov=document.createElement('div');ov.className='kil-modal-ov';ov.id='kil-loginwall';ov.innerHTML='<div class="kil-modal" style="max-width:390px"><div class="kil-mh">Join KEEPITIL<button class="kil-mx" data-click="__culCloseWall">&times;</button></div><div class="kil-mb" style="padding:26px 22px;text-align:center"><div style="font-size:2.5rem;margin-bottom:12px">&#128274;</div><p style="font-size:1rem;line-height:1.55;color:var(--ink,#e8e8f0);margin:0 0 20px">Create a free account to like, reshare and save. Anyone can look around &mdash; you just need to be signed in to join in.</p><a href="/apply?next='+next+'" class="kil-join-btn" style="padding:12px 28px">Log in / Join &rarr;</a></div></div>';document.body.appendChild(ov);ov.addEventListener('click',function(e){if(e.target===ov)closeWall();});return true;}
  function gate(){if(signedIn())return false;wall();return true;}
  function keyOf(x){ x=String(x); if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x)) return x; return x.indexOf('cul:')===0?x:('cul:'+x); }
  function pst(k){return PST[k]||(PST[k]={likes:0,liked:false,resh:0,reshared:false,comments:0});}
  function cq(k){return (window.CSS&&CSS.escape)?CSS.escape(k):k;}
  function paint(k){var s=PST[k];if(!s)return;document.querySelectorAll('.fbcard[data-pid="'+cq(k)+'"]').forEach(function(card){var lk=card.querySelector('.fba-like'),rs=card.querySelector('.fba-resh');if(lk){lk.classList.toggle('on',!!s.liked);var b=lk.querySelector('b');if(b)b.textContent=s.likes||'';}if(rs){rs.classList.toggle('on',!!s.reshared);var b2=rs.querySelector('b');if(b2)b2.textContent=s.resh||'';}});}
  window.fbLike=function(k,el){k=keyOf(k);if(gate())return;if(!SB)return;var s=pst(k),uid=SES.user.id;if(s.liked){s.liked=false;s.likes=Math.max(0,s.likes-1);paint(k);SB.from('post_likes').delete().eq('post_key',k).eq('user_id',uid).then(function(){});}else{s.liked=true;s.likes++;paint(k);SB.from('post_likes').insert({post_key:k,profile_slug:'culture',user_id:uid}).then(function(r){if(r&&r.error){s.liked=false;s.likes=Math.max(0,s.likes-1);paint(k);}});}};
  window.fbReshareL=function(k,el){k=keyOf(k);if(gate())return;if(!SB)return;var s=pst(k),uid=SES.user.id;if(s.reshared){s.reshared=false;s.resh=Math.max(0,s.resh-1);paint(k);toast('Reshare removed');SB.from('post_reshares').delete().eq('post_key',k).eq('user_id',uid).then(function(){});}else{s.reshared=true;s.resh++;paint(k);toast('Reshared ✓');SB.from('post_reshares').insert({post_key:k,profile_slug:'culture',user_id:uid}).then(function(r){if(r&&r.error){s.reshared=false;s.resh=Math.max(0,s.resh-1);paint(k);}});}};
  window.fbSaveL=function(k,el){if(gate())return;k=keyOf(k);var on=el.classList.toggle('on');try{var m=JSON.parse(localStorage.getItem('kil-saves')||'{}');m[k]=on?1:0;localStorage.setItem('kil-saves',JSON.stringify(m));}catch(e){}toast(on?'Saved ✓':'Removed from saved');};
  window.fbShare=function(u){if(gate())return;try{if(navigator.share){navigator.share({url:u});return;}}catch(e){}try{navigator.clipboard.writeText(u);toast('Link copied ✓');}catch(e){prompt('Copy link:',u);}};
  function closeM(){var m=document.getElementById('culModal');if(m)m.remove();}
  window.__culCloseM=closeM;
  function hydrate(){if(!SB)return;var cards=[].slice.call(document.querySelectorAll('.fbcard[data-pid]'));var keys=cards.map(function(c){return c.getAttribute('data-pid');}).filter(function(v,i,a){return v&&a.indexOf(v)===i;});if(!keys.length)return;var uid=SES&&SES.user?SES.user.id:null;keys.forEach(function(k){var s=pst(k);s.likes=0;s.liked=false;s.resh=0;s.reshared=false;s.comments=0;});SB.from('post_likes').select('post_key,user_id').in('post_key',keys).then(function(r){if(r&&r.data){r.data.forEach(function(x){var s=PST[x.post_key];if(s){s.likes++;if(uid&&x.user_id===uid)s.liked=true;}});keys.forEach(paint);}});SB.from('post_reshares').select('post_key,user_id').in('post_key',keys).then(function(r){if(r&&r.data){r.data.forEach(function(x){var s=PST[x.post_key];if(s){s.resh++;if(uid&&x.user_id===uid)s.reshared=true;}});keys.forEach(paint);}});}
  /* ── CREATE VOTING IN CULTURE (Founder 2026-08-28 §7) ──────────────────────────────────
     "Reuse the current CREATE vote source. Do not create Culture-specific vote records."

     This calls the SAME two RPCs the CREATE entry page calls — vs_vote to record and
     vs_entry_totals to read back — so the Culture count, the CREATE count and the leaderboard
     are ONE number by construction. There is no Culture vote table, no local tally and no
     optimistic count that could drift from the backend.

     Every rule stays server-side: authentication, one vote per person, the voting window, the
     competition state and the no-self-vote rule are all enforced by vs_vote. The client shows
     the server's own refusal reason rather than guessing, because a client that predicts the
     rule will eventually predict it wrong.

     unique_voters is the number rendered — it counts PEOPLE, so pressing several things cannot
     inflate it. */
  function culBindCreateVotes(){
    [].forEach.call(document.querySelectorAll('.kvc-vote[data-entry]:not([data-bound])'), function(btn){
      btn.setAttribute('data-bound','1');
      var entryId = Number(btn.getAttribute('data-entry'));
      if(!entryId) return;

      /* Paint the real total on arrival so the card never shows a placeholder count. */
      if(SB){
        SB.rpc('vs_entry_totals', { p_entry: entryId }).then(function(t){
          var tot=(t&&t.data)||{}; var nEl=btn.querySelector('.n');
          if(nEl) nEl.textContent = tot.unique_voters || 0;
        }).catch(function(){});
      }

      btn.onclick = function(){
        if(!SB) return;
        if(!SES){
          /* Voting requires a real account; say so rather than failing silently. */
          location.href = '/apply?next=' + encodeURIComponent(location.pathname + location.search);
          return;
        }
        var wasVoted = btn.getAttribute('aria-pressed') === 'true';
        btn.disabled = true;
        SB.rpc('vs_vote', { p_entry: entryId, p_action: 'like', p_desired: !wasVoted })
          .then(function(r){ if(r.error) throw r.error;
                             return SB.rpc('vs_entry_totals', { p_entry: entryId }); })
          .then(function(t){
            var tot=(t&&t.data)||{};
            btn.setAttribute('aria-pressed', String(!wasVoted));
            var nEl=btn.querySelector('.n');
            if(nEl) nEl.textContent = tot.unique_voters || 0;
            btn.disabled = false;
          })
          .catch(function(ex){
            btn.disabled = false;
            /* The server's reason, not ours. */
            try{ console.warn('[culture] vote refused:', ex && ex.message); }catch(e){}
            var lb = btn.querySelector('.lb'); if(!lb) return;
            var prev = lb.textContent;
            lb.textContent = (ex && ex.message) ? String(ex.message).slice(0,28) : 'Not allowed';
            setTimeout(function(){ lb.textContent = prev; }, 2600);
          });
      };
    });
  }
  window.__culBindCreateVotes = culBindCreateVotes;

  window.__culHydrate=function(){ try{ hydrate(); }catch(e){} try{ culBindCreateVotes(); }catch(e){} };
  var _rf=window.renderFeed;if(typeof _rf==='function'){window.renderFeed=function(){_rf.apply(this,arguments);setTimeout(hydrate,30);};}
  (function boot(n){if(!window.supabase){if(n<40)setTimeout(function(){boot(n+1);},350);return;}try{SB=window.__culSB||(window.__culSB=window.supabase.createClient('https://ovmqtzjfpzrbzrlkxwgw.supabase.co',ANON));SB.auth.getSession().then(function(r){SES=(r&&r.data)?r.data.session:null;hydrate();});SB.auth.onAuthStateChange(function(_e,s){SES=s;hydrate();});}catch(e){}})(0);
})();
