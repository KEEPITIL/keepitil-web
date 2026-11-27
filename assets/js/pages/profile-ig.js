/* KEEPITIL profile.html: inline script "ig" moved verbatim to an external file (CSP: no executable inline script). */
/* ══ IG-PARITY ENHANCEMENTS (Founder 2026-07-18) ══ */
/* Create Event chooser — the ONLY two gold standards */
function openCreateChooser(){
  closeModal();
  var ov=document.createElement('div');ov.className='kil-modal-ov';ov.id='kilModal';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-label','Dialog');
  ov.innerHTML='<div class="kil-modal"><div class="kil-mh">Create Event<button class="kil-mx" data-click="closeModal">&times;</button></div>'
    +'<div class="kil-mb"><div class="ev-choose">'
    +'<a class="ev-opt" href="/submit-event"><span class="ei"><svg viewBox="0 0 24 24"><path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.9 6.2 19.9l.9-5.4L3.2 10.7l5.4-.8L12 2z"/></svg></span><span><h4>New event</h4><p>Host your own — tickets, tiers, payouts. The full event form.</p></span></a>'
    +'<a class="ev-opt" href="/submit-event"><span class="ei"><svg viewBox="0 0 24 24"><path d="M10 6v2H5v11h11v-5h2v6a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1h6zm11-3v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14V3h7z"/></svg></span><span><h4>Repost event</h4><p>Share a show you found — listing + ticket link out. Reviewed before it goes live.</p></span></a>'
    +'</div></div></div>';
  document.body.appendChild(ov);
  ov.addEventListener('click',function(e){if(e.target===ov)closeModal();});
}
/* ＋ CREATE menu: feed · event · story · highlight · chat */
function toggleCreateMenu(e){
  pfStop(e);
  var m=document.getElementById('createMenu');
  if(m){ m.remove(); return; }
  m=document.createElement('div'); m.id='createMenu';
  m.style.cssText='position:absolute;z-index:120;background:#15151f;border:1px solid rgba(255,255,255,.16);border-radius:12px;padding:6px;box-shadow:0 12px 30px rgba(0,0,0,.5);display:flex;flex-direction:column;min-width:170px';
  [['Feed',function(){openCreatePost('feed');}],
   ['Event',openCreateChooser],
   ['Story',function(){openCreatePost('story');}],
   ['Chat',function(){showTab('chat');}]].forEach(function(it){
    var b=document.createElement('button');
    b.textContent=it[0];
    b.style.cssText='background:none;border:0;color:var(--text,#f0f0f0);text-align:left;padding:10px 14px;font:600 .88rem Inter,sans-serif;cursor:pointer;border-radius:8px';
    b.onmouseover=function(){b.style.background='rgba(0,180,255,.12)';};
    b.onmouseout=function(){b.style.background='none';};
    b.onclick=function(ev){ev.stopPropagation();m.remove();it[1]();};
    m.appendChild(b);
  });
  var btn=document.getElementById('pfCreate'); btn.parentElement.style.position='relative';
  m.style.top=(btn.offsetTop+btn.offsetHeight+6)+'px'; m.style.left=btn.offsetLeft+'px';
  btn.parentElement.appendChild(m);
  setTimeout(function(){document.addEventListener('click',function once(){var x=document.getElementById('createMenu');if(x)x.remove();document.removeEventListener('click',once);});},0);
}
function createHighlight(){
  if(!CAN_EDIT())return;
  var name=prompt('Highlight name:'); if(!name)return;
  SB.from('profile_content').insert({profile_slug:PROFILE_SLUG,kind:'highlight',data:{title:name,items:[]},created_by:SESSION&&SESSION.user?SESSION.user.id:null})
    .then(function(r){ if(r.error){toast('Could not create highlight.');} else {toast('Highlight created ✓');} });
}
/* ARCHIVE — expired stories + manually archived posts; archive/unarchive own content */
function openArchive(){
  closeModal();
  var ov=document.createElement('div');ov.className='kil-modal-ov';ov.id='kilModal';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-label','Dialog');
  ov.innerHTML='<div class="kil-modal"><div class="kil-mh">Archive<button class="kil-mx" data-click="closeModal">&times;</button></div><div class="kil-mb" id="archList" style="max-height:60vh;overflow:auto">Loading…</div></div>';
  document.body.appendChild(ov);
  ov.addEventListener('click',function(e){if(e.target===ov)closeModal();});
  SB.from('profile_content').select('id,kind,data,archived,created_at').eq('profile_slug',PROFILE_SLUG).order('created_at',{ascending:false}).limit(120).then(function(r){
    var rows=(r&&r.data)||[]; var box=document.getElementById('archList'); if(!box)return;
    if(!rows.length){ box.innerHTML='<div style="color:var(--muted);padding:20px;text-align:center">Nothing here yet.</div>'; return; }
    box.innerHTML=rows.map(function(x){
      var d=x.data||{}; var label=(d.title||d.text||d.caption||x.kind||'').toString().slice(0,60);
      return '<div style="display:flex;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px solid var(--line)">'
        +'<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><b style="font-size:.7rem;color:var(--accent);text-transform:uppercase">'+esc(x.kind)+'</b> '+esc(label)+'</span>'
        +'<button class="evsub-b" data-arch-id="'+esc(x.id)+'" data-arch-val="'+(x.archived?'false':'true')+'">'+(x.archived?'Unarchive':'Archive')+'</button></div>';
    }).join('');
    /* F1b — id in data-*, not inline JS; the boolean is derived from a fixed 'true'/'false' token. */
    box.onclick=function(e){ var b=e.target&&e.target.closest&&e.target.closest('button[data-arch-id]'); if(!b)return; toggleArchived(b.getAttribute('data-arch-id'),b.getAttribute('data-arch-val')==='true'); };
  });
}
function toggleArchived(id,val){
  SB.from('profile_content').update({archived:val}).eq('id',id).then(function(r){
    if(r.error){toast('Could not update.');return;}
    toast(val?'Archived — hidden from the feed.':'Restored ✓'); closeModal(); if(typeof loadFromDB==='function') try{loadFromDB();}catch(e){}
  });
}
/* FEED category filter — FEED (all) default, collapsible to icons on mobile */
/* header stats + about + links(≤5) + account type */
(function(){
  function boot(){
    if(!window.SB||!PROFILE_SLUG){ setTimeout(boot,500); return; }
    try{
      SB.rpc('get_profile_stats',{p_slug:PROFILE_SLUG}).then(function(r){
        var d=(r&&r.data)||{};
        var set=function(id,v){var e=document.getElementById(id);if(e)e.textContent=(v==null?0:v);};
        set('stPosts',d.posts); set('stFollowers',d.followers); set('stLikes',d.likes);
        if(d.posts===0&&window.__pfGate) window.__pfGate.mark('feed');   // no posts on the record: nothing will land above the partner block, so it needs no hold
        window.__pfGate&&window.__pfGate.mark('stats');
      },function(){ window.__pfGate&&window.__pfGate.mark('stats'); });
      SB.from('profile_meta').select('about,links,account_type,links_label,badges').eq('slug',PROFILE_SLUG).maybeSingle().then(function(r){
        var m=(r&&r.data)||{};
        /* S2: never print the raw enum — post-migration that reads "editorial_brand". */
        checkClaimed().then(function(){
          var _lbl=window.KIL_PROFILE_LABEL(m.account_type);
          var a=document.getElementById('pfAcctType');
          if(a){ if(_lbl){ a.textContent=_lbl; a.style.display='block'; } else { a.style.display='none'; } }
          /* Re-filter badges once ownership is known, so a claimed profile keeps its Member badge
             and an unclaimed one never gains one. */
          try{ var _b=document.getElementById('pfBadges');
            if(_b){ var _seen2={}, _ac2=String(m.account_type||'').toLowerCase().trim();
              var _l=window.KIL_FILTER_BADGES(Array.isArray(m.badges)?m.badges:[]).filter(function(x){
                var k=String(x).toLowerCase().trim(); if(!k||k===_ac2||_seen2[k])return false; _seen2[k]=1; return true; });
              _b.innerHTML=_l.slice(0,6).map(function(x){return '<span class="bdg">'+String(x).replace(/[<>]/g,'').slice(0,16)+'</span>';}).join(''); } }catch(e){}
        }).then(function(){ window.__pfGate&&window.__pfGate.mark('claim'); },function(){ window.__pfGate&&window.__pfGate.mark('claim'); });
        PROFILE.about=m.about||''; PROFILE.links=Array.isArray(m.links)?m.links:[];
        PROFILE.links_label=m.links_label||''; PROFILE.badges=Array.isArray(m.badges)?m.badges:null;
        /* editable Links dropdown title */
        try{ var _lb=(m.links_label&&String(m.links_label).trim())||'Links'; var _btn=document.querySelector('#pfLinksDrop button'); if(_btn) _btn.textContent='🔗 '+_lb+' ▾'; }catch(e){}
        /* render preset badges chosen in Edit Profile (fallback: Member) */
        try{ var _bg=document.getElementById('pfBadges'); if(_bg){ var _acct=String(m.account_type||'').toLowerCase().trim(); var _seen={}; var _arr=window.KIL_FILTER_BADGES(Array.isArray(m.badges)?m.badges:[]).filter(function(x){var k=String(x).toLowerCase().trim(); if(!k||k===_acct||_seen[k])return false; _seen[k]=1; return true;}); _bg.innerHTML=_arr.slice(0,6).map(function(x){return '<span class="bdg">'+String(x).replace(/[<>]/g,'').slice(0,16)+'</span>';}).join(''); } }catch(e){}
        /* description renders UNDER the avatar in .pf-meta (pfAbout), matching the Groove Trooper gold standard — not beside the avatar (Founder 2026-07-27) */
        if(m.about){ var _at=document.getElementById('pfAboutTop'); if(_at)_at.style.display='none'; var ab=document.getElementById('pfAbout'); if(ab){ ab.textContent=m.about; ab.style.display='block'; } }
        /* socials + links → the About "Links" dropdown (icons live here, not in the footer) */
        if(Array.isArray(m.links))PROFILE.links=m.links;
        if(m.socials&&typeof m.socials==='object')PROFILE.socials=Object.assign({},PROFILE.socials,m.socials);
        renderLinksMenu();
        document.addEventListener('click',function(){ var mm=document.getElementById('pfLinksMenu'); if(mm)mm.style.display='none'; });
        window.__pfGate&&window.__pfGate.mark('about');
      },function(){ window.__pfGate&&window.__pfGate.mark('about'); });
    }catch(e){}
  }
  boot();
})();
/* SAVED + TAGGED loaders + collections */
var CUR_COLL=null;
function loadSaved(){
  if(!SESSION){ return; }
  Promise.all([
    SB.from('collections').select('id,name').order('created_at'),
    SB.from('post_saves').select('content_id,collection_id,profile_content(id,kind,data,profile_slug)').order('created_at',{ascending:false})
  ]).then(function(res){
    var colls=(res[0].data)||[], saves=(res[1].data)||[];
    colls.sort(function(a,b){var A=String(a.name).toLowerCase()==='saved'?0:1,B=String(b.name).toLowerCase()==='saved'?0:1;return A-B;});
    var cbox=document.getElementById('saved-coll');
    /* F2: collection names are user-typed (newCollection prompt). Built with textContent + a closure listener:
       no HTML parse of the name, and no collection id interpolated into inline JS. */
    cbox.replaceChildren();
    colls.forEach(function(c){
      var btn=document.createElement('button');
      btn.className='evsub-b'+(CUR_COLL===c.id?' on':'');
      btn.textContent=String(c.name).slice(0,24);
      btn.addEventListener('click',function(){ CUR_COLL=(CUR_COLL===c.id?null:c.id); loadSaved(); });
      cbox.appendChild(btn);
    });
    var rows=saves.filter(function(s){return CUR_COLL==null||s.collection_id===CUR_COLL;});
    var g=document.getElementById('saved-grid'), emp=document.getElementById('saved-empty');
    if(!rows.length){ g.innerHTML=''; emp.style.display='block'; return; }
    emp.style.display='none';
    g.replaceChildren();
    rows.forEach(function(s){
      var c=s.profile_content||{}; var d=c.data||{};
      var img=kilSafeUrl(d.img||d.cover||d.image||'');
      var tile=document.createElement('div');
      tile.className='gal-tile';
      tile.style.aspectRatio='1/1';
      tile.style.borderRadius='10px';
      tile.style.overflow='hidden';
      tile.style.border='1px solid var(--line)';
      tile.style.backgroundColor='#0a0a0f';
      tile.style.backgroundPosition='center';
      tile.style.backgroundSize='cover';
      tile.style.backgroundRepeat='no-repeat';
      if(img){
        tile.style.backgroundImage='url('+JSON.stringify(img)+')';
      } else {
        var cap=document.createElement('div');
        cap.style.display='flex';
        cap.style.alignItems='center';
        cap.style.justifyContent='center';
        cap.style.height='100%';
        cap.style.color='var(--muted)';
        cap.style.fontSize='.72rem';
        cap.style.padding='8px';
        cap.style.textAlign='center';
        cap.textContent=String(d.title||d.text||c.kind||'').slice(0,50);
        tile.appendChild(cap);
      }
      g.appendChild(tile);
    });
  });
}
function newCollection(){
  var name=prompt('Collection name:'); if(!name)return;
  SB.from('collections').insert({user_id:SESSION.user.id,name:name}).then(function(r){
    if(r.error){toast('Could not create (name taken?).');} else {toast('Collection ✓');loadSaved();}
  });
}
/* EVENTS TAB — purchased tickets (Founder 2026-08-19, replacing "tagged" posts).
   Reads event_orders, which is what the ticket webhook writes on a completed purchase, joined to
   the event for title/date/venue. Keyed on buyer_handle.
   A failed query must NOT render as "no tickets" — someone who paid and sees an empty tab will
   reasonably conclude their money vanished. Error and empty are shown differently on purpose. */
/* COMPETITION ENTRIES — moved here from /create/?view=mine (Founder 2026-08-19).
   Owner-only: vs_my_entries is scoped to the signed-in user, so it renders nothing on someone
   else's profile. Carries the Submit control, which is the step that turns a PAID draft into a
   SUBMITTED entry. That control existing is the difference between an entrant's $1 buying them
   a place in the competition and buying them nothing. */
function loadMyEntries(){
  var box=document.getElementById('pfEntries'); if(!box) return;
  if(!SB || !SESSION || !OWNS){ box.innerHTML=''; return; }
  SB.rpc('vs_my_entries').then(function(r){
    if(r && r.error){
      box.innerHTML='<div style="color:var(--text-danger,#e24b4a);font-size:.82rem">'
        +'Could not load your competition entries. This is a loading error, not an empty list.</div>';
      console.error('[profile] vs_my_entries failed', r.error); return;
    }
    var rows=(r&&r.data)||[];
    if(!rows.length){ box.innerHTML=''; return; }
    var esc=function(v){return String(v==null?'':v).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});};
    box.innerHTML='<div class="pfe-head">Competition entries</div><div class="pfe-grid">'
      + rows.map(function(x){
        var img = x.thumb_url || '';
        /* Same two-copy trick as the homepage: blurred fill behind, real art contained on top,
           so an entry whose cover is not 2:3 is never centre-cropped. */
        var media = img
          ? '<img class="pfe-bg" src="'+esc(img)+'" alt="" aria-hidden="true" loading="lazy">'
            +'<img class="pfe-img" src="'+esc(img)+'" alt="'+esc(x.title||'')+'" loading="lazy">'
          : '';
        return '<div>'
          + '<a class="pfe-fly" href="/create/?view=entry&e='+x.entry_id+'">'
          +   media + '<div class="pfe-shade"></div>'
          +   '<span class="pfe-tag ent">Entry</span>'
          +   '<span class="pfe-badge">'+esc(x.status)+'</span>'
          +   '<div class="pfe-body">'
          +     '<div class="pfe-date">'+esc(x.competition_title||'CREATE')+'</div>'
          +     '<div class="pfe-title">'+esc(x.title||'Untitled')+'</div>'
          +     '<div class="pfe-meta">🏆 '+(x.total_votes||0)+' vote'+((x.total_votes||0)===1?'':'s')+'</div>'
          +     '<div class="pfe-foot"><span class="pfe-price">'+esc(x.payment_status)+'</span>'
          +       '<span class="pfe-cta">View</span></div>'
          +   '</div>'
          + '</a>'
          + '</div>';
      }).join('') + '</div>';
    /* No submit control here by design (Founder 2026-08-19). Completing an entry submits it —
       vs_fulfill_entry_payment advances draft → submitted when the entry is confirmed. Asking an
       entrant to submit work they already submitted is a step that should not exist. */
  }).catch(function(e){ console.error('[profile] vs_my_entries threw', e); });
}

function loadTagged(){
  try{ loadMyEntries(); }catch(e){ console.error('[profile] loadMyEntries threw', e); }
  var g=document.getElementById('tagged-grid'), emp=document.getElementById('tagged-empty');
  if(!g||!emp) return;
  SB.from('event_orders')
    .select('id,qty,amount_cents,status,created_at,qr_token,events(title,slug,starts_at,venue,city,cover_url)')
    .eq('buyer_handle', PROFILE_SLUG)
    .neq('status','refunded')
    .order('created_at',{ascending:false})
    .then(function(r){
      if(r && r.error){
        g.innerHTML='';
        emp.style.display='block';
        emp.textContent='Could not load your tickets. This is a loading error, not an empty list — reload, and tell us if it persists.';
        console.error('[profile] event_orders failed', r.error);
        return;
      }
      var rows=(r&&r.data)||[];
      if(!rows.length){ g.innerHTML=''; emp.style.display='block'; emp.textContent='No tickets yet.'; return; }
      emp.style.display='none';
      var th=document.getElementById('pfTicketsHead'); if(th) th.style.display='block';
      var esc=function(v){return String(v==null?'':v).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});};
      g.innerHTML=rows.map(function(o){
        var e=o.events||{};
        var when='';
        try{ var dt=new Date(e.starts_at); if(!isNaN(dt)) when=dt.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'}).toUpperCase(); }catch(x){}
        var where=[e.venue,e.city].filter(Boolean).join(' · ');
        var amt=o.amount_cents ? '$'+(o.amount_cents/100).toFixed(2) : 'Free';
        var href=e.slug ? '/event?e='+encodeURIComponent(e.slug) : '#';
        var img=KH(e.cover_url)||'';
        var media = img
          ? '<img class="pfe-bg" src="'+esc(img)+'" alt="" aria-hidden="true" loading="lazy">'
            +'<img class="pfe-img" src="'+esc(img)+'" alt="'+esc(e.title||'')+'" loading="lazy">'
          : '';
        return '<a class="pfe-fly" href="'+href+'">'
          + media + '<div class="pfe-shade"></div>'
          + '<span class="pfe-tag tix">Ticket</span>'
          + (o.qty>1 ? '<span class="pfe-badge">×'+o.qty+'</span>' : '')
          + '<div class="pfe-body">'
          +   '<div class="pfe-date">'+esc(when||'Date TBC')+'</div>'
          +   '<div class="pfe-title">'+esc(e.title||'Event')+'</div>'
          +   '<div class="pfe-meta">📍 '+esc(where||'Venue TBC')+'</div>'
          +   '<div class="pfe-foot"><span class="pfe-price">'+esc(amt)+'</span>'
          +     '<span class="pfe-cta">Details</span></div>'
          + '</div></a>';
      }).join('');
    });
}
(function(){ /* lazy-load saved/tagged when their tab opens */
  var done={};
  var orig=window.showTab;
  window.showTab=function(name){
    orig(name);
    if(name==='saved'&&!done.saved){done.saved=1;try{loadSaved();}catch(e){}}
    if(name==='tagged'&&!done.tagged){done.tagged=1;try{loadTagged();}catch(e){}}
  };
})();
/* CHAT: remove the "All" chip (retry until the filter builds) */
(function(){
  var tries=0;
  var iv=setInterval(function(){
    tries++;
    var chips=document.querySelectorAll('#chat-filter .pf-chip, #chat-filter button');
    var hit=false;
    chips.forEach(function(c){ if(/^all$/i.test((c.textContent||'').trim())){ c.remove(); hit=true; } });
    if(hit||tries>20) clearInterval(iv);
  },800);
})();
/* FEED 2-col grid (IG keepitil ref) */
(function(){ var s=document.createElement('style'); s.textContent=
  '#feed-grid{grid-template-columns:1fr!important;gap:18px;max-width:620px;margin:0 auto}'
  +'.fbcard{border-radius:16px;overflow:hidden;background:rgba(12,12,20,.93);border:1px solid var(--line,#242433);cursor:default;padding:0;aspect-ratio:auto!important;height:auto!important}'
  +'.fbcard::after,.fbcard::before{display:none!important}'  /* remove the .pf-card dark gradient overlay from feed cards — was making the profile feed visibly darker than Culture; now identical */
  +'.fb-head{display:flex;align-items:center;gap:10px;padding:11px 14px;cursor:pointer}'
  +'.fb-av{width:36px;height:36px;border-radius:50%;object-fit:cover;flex:0 0 auto;background:#0a0a0f}'
  +'.fb-who{flex:1;min-width:0;line-height:1.25}.fb-who b{display:block;font-size:.9rem;color:#fff}.fb-who span{font-size:.7rem;color:#8f89ab;text-transform:uppercase;letter-spacing:.06em}'
  +'.fb-more{background:none;border:0;color:var(--muted);font-size:1.3rem;cursor:pointer;padding:2px 8px}'
  /* THE universal media window: ~1:1, any image/video fits (cover, centered) */
  /* SAME square card as before — only change vs original: contain (whole image fits inside the card) instead of cover (cropped) */
  +'.fb-media{width:100%;aspect-ratio:1/1.02;overflow:hidden;background:#000;cursor:default}'
  +'.fb-media img,.fb-media video{width:100%!important;height:100%!important;object-fit:contain;object-position:center;display:block}'
  +'.fb-nomedia{display:flex;align-items:center;justify-content:center;height:100%;padding:24px;text-align:center;color:#cfd3df;font-family:var(--font-head,\'Bebas Neue\'),sans-serif;font-size:1.5rem;letter-spacing:.04em}'
  +'.fb-cap{padding:11px 14px 2px;font-size:.92rem;line-height:1.5;color:#cfd3df;cursor:pointer}'
  +'.fb-cap b{color:#fff}'
  +'.fb-cap-lead{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}'
  +'.fb-cap.open .fb-cap-lead{-webkit-line-clamp:unset;overflow:visible}'
  +'.fb-cap-full{display:none;margin-top:8px;color:var(--text-soft,#d4d7e2)}'
  +'.fb-cap.open .fb-cap-full{display:block}'
  +'.fb-cap-full p{margin:0 0 8px}.fb-cap-full a{color:var(--accent,#00b4ff)}.fb-cap-full img,.fb-cap-full video,.fb-cap-full iframe,.fb-cap-full .kil-tag{display:none!important}'
  +'.fb-more-txt{color:var(--muted);font-weight:600;display:inline-block;margin-top:4px}.fb-cap.open .fb-more-txt{display:none}'
  +'.fb-actions{display:flex;align-items:center;gap:4px;padding:6px 10px 10px}'
  +'.fba{display:inline-flex;align-items:center;gap:5px;background:none;border:0;color:#cfd3df;cursor:pointer;padding:7px 10px;border-radius:9px;font:700 .8rem Inter,sans-serif}'
  +'.fba svg{width:21px;height:21px}.fba:hover{color:var(--text);background:rgba(255,255,255,.05)}'
  +'.fba-like.on{color:#ff4d8d}.fba-resh.on{color:#22c55e}.fb-save.on{color:var(--accent,#00b4ff)}'
  +'.fba b{font-size:.78rem;min-width:6px}'
  +'.fb-head{cursor:default}.fb-avlink{flex:0 0 auto;display:block}.fb-who{display:flex;flex-direction:column;text-decoration:none;color:inherit}.fb-who:hover b{text-decoration:underline}'
  +'.fbcard .pc-hidden{position:static;margin-left:6px}'
  +'.fb-caro{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;width:100%;height:100%;scrollbar-width:none}'
  +'.fb-caro::-webkit-scrollbar{display:none}'
  +'.fb-slide{flex:0 0 100%;scroll-snap-align:start;height:100%}'
  +'.fb-slide img,.fb-slide video{width:100%!important;height:100%!important;object-fit:cover;display:block}'
  +'.fb-dots{display:flex;gap:5px;justify-content:center;padding:6px 0 0;position:relative;top:-24px;pointer-events:none}'
  +'.fb-dots span{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.4)}'
  +'.fb-dots span.on{background:#fff}'
  /* per-post ⋯ menu */
  +'.post-menu{position:absolute;z-index:9000;min-width:186px;background:var(--surface,#15151f);border:1px solid var(--line,#2a2a3a);border-radius:12px;box-shadow:0 12px 34px rgba(0,0,0,.5);padding:6px;display:flex;flex-direction:column}'
  +'.post-menu button{background:none;border:0;color:var(--text,#eceefb);text-align:left;font:600 .86rem Inter,sans-serif;padding:9px 12px;border-radius:8px;cursor:pointer}'
  +'.post-menu button:hover{background:rgba(255,255,255,.07)}'
  +'.kil-join-btn{background:var(--accent,#00b4ff);color:#001018;border:0;border-radius:22px;padding:10px 18px;font:700 .84rem Inter,sans-serif;cursor:pointer;white-space:nowrap}';
  document.head.appendChild(s); })();
/* published-only feed (Founder live review): hide draft/unpublished cards */
(function(){ var iv=setInterval(function(){ var n=0; document.querySelectorAll('#feed-grid [data-status]').forEach(function(c){ if(!/published|live/i.test(c.getAttribute('data-status')||'published')) { c.style.display='none'; n++; } }); },1200); setTimeout(function(){clearInterval(iv);},12000); })();
