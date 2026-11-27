/* KEEPITIL connect/index.html: inline script "main" moved verbatim to an external file (CSP: no executable inline script). */
/* ── COMMUNITY ── */
/* ══ COMMUNITY MODULE ════════════════════════════════════════════════════════════════════
   Landing (search + topics + cards) and detail (FEED / CHAT / RESOURCES) for the COMMUNITY
   filter inside CONNECT.

   ⚠ THE SERVER IS THE AUTHORITY, NOT THIS FILE. Every control below is drawn from a role the
   database reported, and every write is a plain PostgREST call that RLS accepts or rejects on
   its own. Hiding a button is a courtesy to the reader; it is never the check. The Phase 4
   tests proved the policies hold with the UI removed entirely.

   State lives in one object so backing out of a community can restore the search text, the
   selected topic and the scroll position rather than dumping the visitor at the top. */
(function(){
  var U='https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
  var K=window.__KIL_ANON||'';
  var SB=null, SES=null, ME=null;
  var pane=document.getElementById('commPane');
  if(!pane) return;

  var S={ q:'', topic:'', scroll:0, view:'list', slug:null, tab:'feed',
          list:[], topics:[], mine:{}, cur:null, role:null };

  /* ── plumbing ───────────────────────────────────────────────────────────────────────── */
  function hdrs(){
    var h={apikey:K,'Content-Type':'application/json'};
    h.Authorization='Bearer '+((SES&&SES.access_token)||K);
    return h;
  }
  function rest(path,opt){
    opt=opt||{};
    return fetch(U+'/rest/v1/'+path,{method:opt.method||'GET',headers:Object.assign(hdrs(),opt.headers||{}),
      body:opt.body?JSON.stringify(opt.body):undefined})
      .then(function(r){ return r.text().then(function(t){
        var j=null; try{ j=t?JSON.parse(t):null; }catch(e){}
        return {ok:r.ok,status:r.status,data:j};
      });});
  }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function when(t){
    try{ var d=new Date(t), m=Math.floor((Date.now()-d)/60000);
      if(m<1) return 'now'; if(m<60) return m+'m'; if(m<1440) return Math.floor(m/60)+'h';
      return d.toLocaleDateString([], {month:'short',day:'numeric'});
    }catch(e){ return ''; }
  }
  function initial(n){ return (String(n||'?').trim()[0]||'?').toUpperCase(); }

  /* ── data ───────────────────────────────────────────────────────────────────────────── */
  function loadTopics(){
    return rest('community_topics?select=key,label&enabled=is.true&order=sort_order')
      .then(function(r){ S.topics=(r.data||[]); });
  }
  function loadCommunities(){
    var p='communities?select=id,slug,name,description,topic_key,tags,icon_url,member_count,visibility'
         +'&archived=is.false&order=member_count.desc,name.asc&limit=100';
    return rest(p).then(function(r){
      S.list=(r.data||[]);
      /* The hero COMMUNITY stat counts the communities TABLE. cnt('community') reads the
         directory array, which has no community rows in it and always reported 0. */
      var el=document.getElementById('cO'); if(el) el.textContent=String(S.list.length);
    });
  }
  /* Membership comes from the DATABASE every time. A local "joined" flag would be a lie the
     moment the same account opened another device. */
  function loadMine(){
    S.mine={};
    if(!SES) return Promise.resolve();
    return rest('community_members?select=community_id,role&user_id=eq.'+SES.user.id)
      .then(function(r){ (r.data||[]).forEach(function(m){ S.mine[m.community_id]=m.role; }); });
  }

  /* ── landing ────────────────────────────────────────────────────────────────────────── */
  function visible(){
    var q=S.q.trim().toLowerCase();
    return S.list.filter(function(c){
      if(S.topic && c.topic_key!==S.topic) return false;
      if(!q) return true;
      var hay=[c.name,c.description,c.topic_key].concat(c.tags||[]).join(' ').toLowerCase();
      return hay.indexOf(q)>-1;
    });
  }
  function renderList(){
    var rows=visible();
    var chips='<div class="comm-chips" id="commChips">'
      +'<button data-t="" class="'+(S.topic?'':'on')+'">All</button>'
      +S.topics.map(function(t){
         return '<button data-t="'+esc(t.key)+'" class="'+(S.topic===t.key?'on':'')+'">'+esc(t.label)+'</button>';
       }).join('')+'</div>';
    var body;
    if(!rows.length){
      /* An empty PLATFORM and an empty SEARCH are different sentences. Saying "no matches"
         when nothing has been created yet reads as a broken search. */
      body = S.list.length===0
        ? '<div class="comm-empty"><b>Communities are opening soon</b><span>Learn, ask and share with other creators — communities for DJing, production, writing, art, events and more.</span></div>'
        : '<div class="comm-empty"><b>No communities match your search</b><span>Try a different word, or clear the topic filter.</span></div>';
    } else {
      body='<div class="comm-cards">'+rows.map(cardHtml).join('')+'</div>';
    }
    pane.innerHTML=
      chips+body;
    /* The shared #q drives this list now; no second input to keep in sync. */
  }
  function cardHtml(c){
    var joined=!!S.mine[c.id];
    var topic=(S.topics.filter(function(t){return t.key===c.topic_key;})[0]||{}).label||'';
    return '<div class="comm-card" data-slug="'+esc(c.slug)+'">'
      +'<div class="comm-ic">'+(c.icon_url?'<img src="'+esc(c.icon_url)+'" alt=""/>':esc(initial(c.name)))+'</div>'
      +'<div class="comm-body">'
        +'<div class="comm-name">'+esc(c.name)+'</div>'
        +(c.description?'<div class="comm-desc">'+esc(c.description)+'</div>':'')
        +'<div class="comm-meta">'
          +(topic?'<span class="comm-topic">'+esc(topic)+'</span>':'')
          /* member_count is a database counter maintained by a trigger. No invented
             "active now" or "trending" number appears anywhere in this UI. */
          +'<span>'+(c.member_count||0)+' member'+((c.member_count===1)?'':'s')+'</span>'
          +(c.visibility!=='public'?'<span>'+esc(c.visibility)+'</span>':'')
        +'</div>'
      +'</div>'
      +'<button class="comm-join'+(joined?' joined':'')+'" data-join="'+esc(c.id)+'">'+(joined?'Joined':'Join')+'</button>'
      +'</div>';
  }
  window.__commRenderList=renderList;

  /* ── join / leave ───────────────────────────────────────────────────────────────────── */
  function needAuth(){
    if(SES) return false;
    location.href='/apply?next='+encodeURIComponent(location.pathname+location.search);
    return true;
  }
  function toggleJoin(cid,btn){
    if(needAuth()) return;
    var joined=!!S.mine[cid];
    btn.disabled=true;
    var p = joined
      ? rest('community_members?community_id=eq.'+cid+'&user_id=eq.'+SES.user.id,{method:'DELETE'})
      : rest('community_members',{method:'POST',body:{community_id:cid,user_id:SES.user.id,role:'member'},
              headers:{Prefer:'return=minimal'}});
    p.then(function(r){
      /* The server decides. On refusal the button goes back to what the DATABASE says it is,
         so a denied join can never leave the UI claiming membership. */
      if(!r.ok) throw new Error('denied '+r.status);
      return loadMine().then(loadCommunities);
    }).then(function(){
      /* ⚠ REFRESH THE ROLE, NOT JUST THE BUTTON. S.role is set when a community is opened and
         was never updated after a join, so joining from the detail header flipped the label to
         "Joined" while the feed composer and chat stayed locked until a page reload — the user
         is a member and the page still treats them as a visitor. Found with a real verified
         session; the API call had always succeeded. */
      if(S.cur) S.role = S.mine[S.cur.id] || null;
      if(S.view==='detail') renderDetail(); else renderList();
    }).catch(function(){
      btn.disabled=false;
      btn.textContent=S.mine[cid]?'Joined':'Join';
      alert(joined?'Could not leave — please try again.':'Could not join. This community may be invite-only.');
    });
  }

  /* ── detail ─────────────────────────────────────────────────────────────────────────── */
  function openCommunity(slug){
    S.scroll=window.pageYOffset||0;      /* remembered for the back button */
    S.view='detail'; S.slug=slug; S.tab='feed';
    pane.innerHTML='<div class="comm-note">Loading…</div>';
    rest('communities?select=id,slug,name,description,topic_key,icon_url,cover_url,member_count,visibility,owner_id&slug=eq.'+encodeURIComponent(slug))
      .then(function(r){
        S.cur=(r.data||[])[0]||null;
        if(!S.cur){ pane.innerHTML='<div class="comm-empty"><b>Community not found</b><span>It may have been archived.</span></div>'; return; }
        S.role=S.mine[S.cur.id]||null;
        /* Fetched once per community rather than on every tab switch. */
        S.opps='';
        rest('rpc/community_active_competitions?p_community_slug='+encodeURIComponent(slug))
          .then(function(o){ S.opps=oppsHtml(o.data||[]); if(S.tab==='feed') renderFeed(); });
        /* instant, not smooth: html{scroll-behavior:smooth} animates this, and the visitor
           lands on a community header that is still sliding. Measured: opening from
           scrollY 260 left the page at 260. */
        try{ window.scrollTo({top:0,behavior:'instant'}); }catch(e){ window.scrollTo(0,0); }
        renderDetail();
      });
  }
  function headHtml(){
    var c=S.cur, joined=!!S.mine[c.id];
    return '<button class="comm-back" id="commBack">&#8249; Community</button>'
      +'<div class="comm-head">'
        +'<div class="comm-ic">'+(c.icon_url?'<img src="'+esc(c.icon_url)+'" alt=""/>':esc(initial(c.name)))+'</div>'
        +'<div class="comm-body"><h2>'+esc(c.name)+'</h2>'
          +(c.description?'<div class="comm-desc">'+esc(c.description)+'</div>':'')
          +'<div class="comm-meta"><span>'+(c.member_count||0)+' member'+((c.member_count===1)?'':'s')+'</span>'
          +(S.role?'<span class="comm-topic">'+esc(S.role)+'</span>':'')+'</div>'
        +'</div>'
        +'<button class="comm-join'+(joined?' joined':'')+'" data-join="'+esc(c.id)+'">'+(joined?'Joined':'Join')+'</button>'
      +'</div>'
      +'<div class="comm-tabs" id="commTabs">'
        +['feed','chat','resources'].map(function(t){
            return '<button data-tab="'+t+'" class="'+(S.tab===t?'on':'')+'">'+t.toUpperCase()+'</button>';
          }).join('')
      +'</div>';
  }
  function renderDetail(){
    if(!S.cur) return;
    pane.innerHTML=headHtml()+'<div id="commTabBody"><div class="comm-note">Loading…</div></div>';
    if(S.tab==='feed') renderFeed();
    else if(S.tab==='chat') renderChat();
    else renderResources();
  }
  var isMod=function(){ return S.role==='owner'||S.role==='moderator'; };
  var canWrite=function(){ return !!S.role; };

  /* ── FEED ───────────────────────────────────────────────────────────────────────────── */
  /* COMMUNITY -> CREATE. Shown above the feed so a live opportunity is visible without
     hunting for it, and only when there is one. */
  function oppsHtml(rows){
    if(!rows||!rows.length) return '';
    return '<div class="copps">'+rows.map(function(o){
      return '<a class="copp" href="/create/?c='+encodeURIComponent(o.slug)+'">'
        +'<div style="min-width:0"><span>Open on CREATE</span><b>'+esc(o.title)+'</b></div></a>';
    }).join('')+'</div>';
  }
  function renderFeed(){
    var box=document.getElementById('commTabBody'); if(!box) return;
    Promise.all([
      rest('community_posts?select=id,author_id,title,body,kind,media_url,link_url,pinned,locked,removed,reply_count,created_at&community_id=eq.'+S.cur.id+'&order=pinned.desc,created_at.desc&limit=50'),
      rest('community_replies?select=id,post_id,parent_id,author_id,body,removed,created_at&community_id=eq.'+S.cur.id+'&order=created_at.asc&limit=300')
    ]).then(function(res){
      var posts=res[0].data||[], reps=res[1].data||[];
      var byPost={}; reps.forEach(function(r){ (byPost[r.post_id]=byPost[r.post_id]||[]).push(r); });
      var comp = canWrite()
        ? '<div class="ccomp"><textarea id="cpBody" rows="2" placeholder="Ask a question or share something…"></textarea>'
          +'<button id="cpSend">Post</button></div>'
        : '<div class="comm-note">'+(SES?'Join this community to post.':'Sign in and join to post.')+'</div>';
      box.innerHTML = (S.opps||'') + comp + (posts.length
        ? posts.map(function(p){ return postHtml(p,byPost[p.id]||[]); }).join('')
        : '<div class="comm-empty"><b>No posts yet</b><span>Be the first to start a discussion here.</span></div>');
    });
  }
  function postHtml(p,reps){
    var mine=SES&&p.author_id===SES.user.id;
    var ctl=[];
    /* Controls are drawn from the role the DATABASE reported. The server rejects the write
       regardless of what is drawn — proven by the Phase 4 negative tests. */
    if(canWrite() && !p.locked) ctl.push('<button data-reply="'+esc(p.id)+'">Reply</button>');
    if(mine||isMod()) ctl.push('<button class="danger" data-rm="'+esc(p.id)+'">'+(p.removed?'Restore':'Remove')+'</button>');
    if(isMod()) ctl.push('<button data-lock="'+esc(p.id)+'">'+(p.locked?'Unlock':'Lock')+'</button>',
                         '<button data-pin="'+esc(p.id)+'">'+(p.pinned?'Unpin':'Pin')+'</button>');
    var top=reps.filter(function(r){ return !r.parent_id; });
    return '<div class="cpost'+(p.removed?' removed':'')+'" data-post="'+esc(p.id)+'">'
      +(p.pinned?'<div class="comm-meta"><span class="comm-topic">Pinned</span></div>':'')
      +(p.title?'<h4>'+esc(p.title)+'</h4>':'')
      +(p.body?'<p>'+esc(p.body)+'</p>':'')
      +(p.kind==='image'&&p.media_url?'<img class="cmedia" src="'+esc(p.media_url)+'" alt="" loading="lazy"/>':'')
      +(p.kind==='link'&&p.link_url?'<div class="cmeta"><a href="'+esc(p.link_url)+'" target="_blank" rel="noopener noreferrer">'+esc(p.link_url)+'</a></div>':'')
      +'<div class="cmeta"><time>'+when(p.created_at)+'</time><span>'+(p.reply_count||0)+' repl'+((p.reply_count===1)?'y':'ies')+'</span>'
        +(p.locked?'<span>Locked</span>':'')+(p.removed?'<span>Removed</span>':'')+ctl.join('')+'</div>'
      +top.map(function(r){ return replyHtml(r,reps,1); }).join('')
      +'<div class="ccomp" data-rbox="'+esc(p.id)+'" style="display:none;margin-top:9px">'
        +'<input type="text" placeholder="Write a reply…"/><button data-rsend="'+esc(p.id)+'">Send</button></div>'
      +'</div>';
  }
  function replyHtml(r,all,depth){
    var kids=all.filter(function(x){ return x.parent_id===r.id; });
    var mine=SES&&r.author_id===SES.user.id;
    var ctl='';
    if(mine||isMod()) ctl='<button class="danger" data-rrm="'+esc(r.id)+'">'+(r.removed?'Restore':'Remove')+'</button>';
    /* Depth is capped at two visually. Deeper replies still exist and still render, they just
       stop indenting — an infinitely nested thread on a 320px screen ends with a column two
       words wide. */
    return '<div class="creply">'
      +'<p>'+esc(r.body)+'</p>'
      +'<div class="cmeta"><time>'+when(r.created_at)+'</time>'
      +(canWrite()?'<button data-reply2="'+esc(r.id)+'" data-post="'+esc(r.post_id)+'">Reply</button>':'')+ctl+'</div>'
      +(depth<2?kids.map(function(k){ return replyHtml(k,all,depth+1); }).join(''):'')
      +'</div>';
  }

  /* ── CHAT ───────────────────────────────────────────────────────────────────────────── */
  /* Members only, even when the community is public. Enforced by the RLS SELECT policy — this
     branch only decides what to draw for someone the server will refuse anyway. */
  function renderChat(){
    var box=document.getElementById('commTabBody'); if(!box) return;
    if(!S.role){
      box.innerHTML='<div class="comm-empty"><b>Chat is for members</b><span>'
        +(SES?'Join this community to read and take part in the chat.':'Sign in and join this community to take part in the chat.')
        +'</span></div>';
      return;
    }
    loadChat(null);
  }
  function loadChat(before){
    var box=document.getElementById('commTabBody'); if(!box) return;
    var p='community_chat_messages?select=id,user_id,handle,body,image_url,removed,created_at'
         +'&community_id=eq.'+S.cur.id+'&order=created_at.desc&limit=30';
    if(before) p+='&created_at=lt.'+encodeURIComponent(before);
    rest(p).then(function(r){
      var rows=(r.data||[]).slice().reverse();
      var older = rows.length===30
        ? '<div style="text-align:center;margin:0 0 10px"><button class="comm-back" id="cmore">Load older</button></div>' : '';
      var list = rows.length ? rows.map(msgHtml).join('')
        : '<div class="comm-note">No messages yet. Say hello.</div>';
      if(before){
        var cur=document.getElementById('cchat');
        if(cur){ var h0=cur.scrollHeight; cur.insertAdjacentHTML('afterbegin',older+list);
                 cur.scrollTop=cur.scrollHeight-h0; wire(); return; }
      }
      box.innerHTML='<div id="cchat">'+older+list+'</div>'
        +'<div class="ccomp"><input id="cmBody" type="text" placeholder="Message…" maxlength="1000"/>'
        +'<button id="cmSend">Send</button></div>';
      var c=document.getElementById('cchat'); if(c) c.scrollTop=c.scrollHeight;
      wire();
    });
  }
  function msgHtml(m){
    var mine=SES&&m.user_id===SES.user.id;
    var ctl=(mine||isMod())?'<button class="danger" data-mrm="'+esc(m.id)+'">Remove</button>':'';
    return '<div class="cmsg" data-msg="'+esc(m.id)+'" data-at="'+esc(m.created_at)+'">'
      +'<div class="cav">'+esc(initial(m.handle))+'</div>'
      +'<div class="cmsg-b"><div class="cmsg-h">'+esc(m.handle||'member')+'<time>'+when(m.created_at)+'</time>'+ctl+'</div>'
      +'<div class="cmsg-t">'+(m.removed?'<em style="color:#7d8b9c">message removed</em>':esc(m.body))+'</div></div></div>';
  }

  /* ── RESOURCES ──────────────────────────────────────────────────────────────────────── */
  function renderResources(){
    var box=document.getElementById('commTabBody'); if(!box) return;
    rest('community_resources?select=id,title,description,kind,url,body,added_by,removed,sort_order,created_at'
        +'&community_id=eq.'+S.cur.id+'&order=sort_order.asc,created_at.desc&limit=100')
      .then(function(r){
        var rows=r.data||[];
        /* Publishing is owner/moderator only — the RLS INSERT policy requires it, and a plain
           member's attempt was refused in testing. The form is only drawn for those roles. */
        var form = isMod()
          ? '<div class="ccomp"><input id="crTitle" type="text" placeholder="Resource title"/>'
            +'<input id="crUrl" type="text" placeholder="https://…"/><button id="crAdd">Add</button></div>'
          : '';
        box.innerHTML = form + (rows.length
          ? rows.map(function(x){
              return '<div class="cres'+(x.removed?' removed':'')+'" data-res="'+esc(x.id)+'">'
                +'<span class="cres-k">'+esc(x.kind)+'</span><div style="flex:1;min-width:0">'
                +'<b>'+esc(x.title)+'</b>'
                +(x.description?'<span>'+esc(x.description)+'</span>':'')
                +(x.url?'<div><a href="'+esc(x.url)+'" target="_blank" rel="noopener noreferrer">Open &#8599;</a></div>':'')
                +(isMod()?'<div class="cmeta"><button class="danger" data-resrm="'+esc(x.id)+'">'+(x.removed?'Restore':'Remove')+'</button></div>':'')
                +'</div></div>';
            }).join('')
          : '<div class="comm-empty"><b>No resources yet</b><span>'
            +(isMod()?'Add a guide, link or template to get this started.':'Guides and links pinned by the moderators will appear here.')
            +'</span></div>');
      });
  }

  /* ── writes ─────────────────────────────────────────────────────────────────────────── */
  function post(body){ return rest('community_posts',{method:'POST',body:body,headers:{Prefer:'return=minimal'}}); }
  function refuse(r,what){
    if(r.ok) return true;
    /* An RLS refusal is reported, not swallowed. Silently doing nothing is how a permission
       bug looks exactly like a broken button. */
    alert('That was not permitted'+(what?' ('+what+')':'')+'. You may need to join, or you may not have that role.');
    return false;
  }

  /* ── one delegated handler ──────────────────────────────────────────────────────────── */
  function wire(){}
  pane.addEventListener('click', function(e){
    var t=e.target;
    var j=t.closest&&t.closest('[data-join]');
    if(j){ e.stopPropagation(); toggleJoin(j.getAttribute('data-join'),j); return; }
    if(t.closest&&t.closest('#commBack')){ backToList(); return; }
    var chip=t.closest&&t.closest('#commChips button');
    if(chip){ S.topic=chip.getAttribute('data-t')||''; renderList(); return; }
    var tab=t.closest&&t.closest('#commTabs button');
    if(tab){ S.tab=tab.getAttribute('data-tab'); renderDetail(); return; }
    var card=t.closest&&t.closest('.comm-card');
    if(card && S.view==='list'){
      /* Discovery is public; entry is not. The database refuses the interior content to a
         signed-out caller regardless — this is the explanation, not the enforcement. */
      if(!SES){ openGate(card.getAttribute('data-slug')); return; }
      openCommunity(card.getAttribute('data-slug'));
      return;
    }

    if(t.id==='cmore'){ var first=pane.querySelector('.cmsg'); loadChat(first?first.getAttribute('data-at'):null); return; }

    var rb=t.closest&&t.closest('[data-reply]');
    if(rb){ var box=pane.querySelector('[data-rbox="'+rb.getAttribute('data-reply')+'"]');
            if(box){ box.style.display='flex'; box.querySelector('input').focus(); } return; }
    var rb2=t.closest&&t.closest('[data-reply2]');
    if(rb2){ var pid=rb2.getAttribute('data-post');
             var b2=pane.querySelector('[data-rbox="'+pid+'"]');
             if(b2){ b2.style.display='flex'; b2.dataset.parent=rb2.getAttribute('data-reply2'); b2.querySelector('input').focus(); } return; }

    if(t.id==='cpSend'){ sendPost(); return; }
    var rs=t.closest&&t.closest('[data-rsend]');
    if(rs){ sendReply(rs.getAttribute('data-rsend')); return; }
    if(t.id==='cmSend'){ sendChat(); return; }
    if(t.id==='crAdd'){ addResource(); return; }

    var rm=t.closest&&t.closest('[data-rm]');
    if(rm){ modSet('community_posts',rm.getAttribute('data-rm'),{removed:rm.textContent==='Remove'},renderFeed); return; }
    var lk=t.closest&&t.closest('[data-lock]');
    if(lk){ modSet('community_posts',lk.getAttribute('data-lock'),{locked:lk.textContent==='Lock'},renderFeed); return; }
    var pn=t.closest&&t.closest('[data-pin]');
    if(pn){ modSet('community_posts',pn.getAttribute('data-pin'),{pinned:pn.textContent==='Pin'},renderFeed); return; }
    var rr=t.closest&&t.closest('[data-rrm]');
    if(rr){ modSet('community_replies',rr.getAttribute('data-rrm'),{removed:rr.textContent==='Remove'},renderFeed); return; }
    var mr=t.closest&&t.closest('[data-mrm]');
    if(mr){ modSet('community_chat_messages',mr.getAttribute('data-mrm'),{removed:true},function(){loadChat(null);}); return; }
    var xr=t.closest&&t.closest('[data-resrm]');
    if(xr){ modSet('community_resources',xr.getAttribute('data-resrm'),{removed:xr.textContent==='Remove'},renderResources); return; }
  });
  function modSet(table,id,patch,after){
    rest(table+'?id=eq.'+id,{method:'PATCH',body:patch,headers:{Prefer:'return=minimal'}})
      .then(function(r){ if(refuse(r,'moderation')) after(); });
  }
  function sendPost(){
    var ta=document.getElementById('cpBody'); if(!ta) return;
    var v=(ta.value||'').trim(); if(!v) return;
    var btn=document.getElementById('cpSend'); if(btn) btn.disabled=true;
    post({community_id:S.cur.id,author_id:SES.user.id,body:v,kind:'text'})
      .then(function(r){ if(btn) btn.disabled=false; if(refuse(r,'post')) renderFeed(); });
  }
  function sendReply(postId){
    var box=pane.querySelector('[data-rbox="'+postId+'"]'); if(!box) return;
    var inp=box.querySelector('input'), v=(inp.value||'').trim(); if(!v) return;
    var parent=box.dataset.parent||null;
    rest('community_replies',{method:'POST',headers:{Prefer:'return=minimal'},
      body:{post_id:postId,community_id:S.cur.id,author_id:SES.user.id,body:v,parent_id:parent}})
      .then(function(r){ delete box.dataset.parent; if(refuse(r,'reply')) renderFeed(); });
  }
  function sendChat(){
    var inp=document.getElementById('cmBody'); if(!inp) return;
    var v=(inp.value||'').trim(); if(!v) return;
    inp.value='';
    rest('community_chat_messages',{method:'POST',headers:{Prefer:'return=minimal'},
      body:{community_id:S.cur.id,user_id:SES.user.id,handle:(ME&&ME.handle)||null,body:v}})
      .then(function(r){ if(refuse(r,'chat')) loadChat(null); });
  }
  function addResource(){
    var t=document.getElementById('crTitle'), u=document.getElementById('crUrl');
    var tv=(t.value||'').trim(); if(!tv) return;
    rest('community_resources',{method:'POST',headers:{Prefer:'return=minimal'},
      body:{community_id:S.cur.id,added_by:SES.user.id,title:tv,url:(u.value||'').trim()||null,kind:'link'}})
      .then(function(r){ if(refuse(r,'resource')) renderResources(); });
  }

  /* ── the account gate ───────────────────────────────────────────────────────────────── */
  var gate=null;
  function openGate(slug){
    var c=S.list.filter(function(x){ return x.slug===slug; })[0];
    if(!c) return;
    /* The destination the visitor actually asked for, carried through signup and login so they
       come back HERE rather than being dropped on a profile page. */
    var next=encodeURIComponent('/connect/?c='+slug);
    if(!gate){
      gate=document.createElement('div');
      gate.id='commGate';
      document.body.appendChild(gate);
      /* ⚠ ITS OWN LISTENER. The delegated handler is bound to #commPane and the gate lives on
         document.body, outside it — so Not now and X were unreachable and the gate could not be
         dismissed at all. Backdrop click closes it too. */
      gate.addEventListener('click', function(ev){
        if(ev.target===gate || (ev.target.closest && ev.target.closest('.g-not, .g-x'))) closeGate();
      });
    }
    gate.innerHTML='<div class="g-panel" role="dialog" aria-modal="true">'
      +'<button class="g-x" aria-label="Close">&#10005;</button>'
      +'<h3>Join the community</h3>'
      +'<p>Create a KEEPITIL account or sign in to enter '+esc(c.name)+' and take part.</p>'
      +'<div class="g-act">'
        +'<a class="g-primary" href="/signup?next='+next+'">Create account</a>'
        +'<a class="g-secondary" href="/apply?next='+next+'">Log in</a>'
        +'<button type="button" class="g-not">Not now</button>'
      +'</div></div>';
    gate.classList.add('on');
    document.body.style.overflow='hidden';
  }
  function closeGate(){
    if(gate) gate.classList.remove('on');
    document.body.style.overflow='';
    /* Nothing is re-rendered and nothing scrolls: the directory was never touched, so the
       search text, the selected topic and the scroll position are exactly as they were. */
  }

  /* ── back preserves search, topic and scroll ────────────────────────────────────────── */
  function backToList(){
    S.view='list'; S.slug=null; S.cur=null; S.role=null;
    renderList();
    /* Restore AFTER paint, or the document is not yet tall enough to scroll to. */
    requestAnimationFrame(function(){ try{ window.scrollTo({top:S.scroll||0,behavior:'instant'}); }catch(e){ window.scrollTo(0,S.scroll||0); } });
  }

  /* ── boot ───────────────────────────────────────────────────────────────────────────── */
  function boot(n){
    if(!window.supabase){ if(n<40) setTimeout(function(){ boot(n+1); },300); else start(); return; }
    try{
      SB=window.__kilSB||(window.__kilSB=window.supabase.createClient(U,K));
      SB.auth.getSession().then(function(r){
        SES=(r&&r.data)?r.data.session:null;
        return SES ? rest('app_users?select=handle&id=eq.'+SES.user.id).then(function(x){ ME=(x.data||[])[0]||null; }) : null;
      }).then(start);
      SB.auth.onAuthStateChange(function(_e,s){ SES=s; loadMine().then(function(){
        if(S.view==='detail'&&S.cur){ S.role=S.mine[S.cur.id]||null; renderDetail(); } else renderList(); }); });
    }catch(e){ start(); }
  }
  function start(){
    Promise.all([loadTopics(),loadCommunities()]).then(loadMine).then(function(){
      /* DEEP LINK: /connect/?c=<slug> opens that community directly. This is what CREATE's
         "Communities for this CREATE" strip and Culture's DISCUSS IN COMMUNITY link point at,
         so without it both would land on the list and leave the visitor to find it again. */
      var want='';
      try{ want=(new URLSearchParams(location.search).get('c')||'').trim(); }catch(e){}
      if(want && S.list.some(function(c){ return c.slug===want; }) && !SES){
        /* Arriving at /connect/?c=<slug> signed out shows the directory with the gate over it,
           so a shared community link still explains itself instead of failing silently. */
        document.body.classList.add('comm-on');
        var seg0=document.getElementById('seg');
        if(seg0){ [].forEach.call(seg0.querySelectorAll('button'),function(b){
          b.classList.toggle('on', b.dataset.k==='community'); }); }
        renderList();
        openGate(want);
        return;
      }
      if(want && S.list.some(function(c){ return c.slug===want; })){
        document.body.classList.add('comm-on');
        var seg=document.getElementById('seg');
        if(seg){ [].forEach.call(seg.querySelectorAll('button'),function(b){
          b.classList.toggle('on', b.dataset.k==='community'); }); }
        openCommunity(want);
        return;
      }
      if(document.body.classList.contains('comm-on')) renderList();
    });
  }
  window.__commActivate=function(){
    if(S.view==='detail') renderDetail(); else renderList();
  };
  /* The single CONNECT search bar drives the community list (Founder 2026-09-05). Exposed
     rather than duplicated, so there is one input and one source of the query. */
  window.__commSetQuery=function(value){
    S.q = value || '';
    if(S.view!=='detail') renderList();
  };
  boot(0);
})();
