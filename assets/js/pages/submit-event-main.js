/* KEEPITIL submit-event.html: inline script "main" moved verbatim to an external file (CSP: no executable inline script). */
var SUPA_URL='https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
var SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
var supa=window.supabase?supabase.createClient(SUPA_URL,SUPA_KEY):null;
function $(id){return document.getElementById(id);}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
var GENRE='electronic', ARTISTS=[], EDIT_ID=null;
/* Pacific wall-clock date+time -> UTC ISO, whatever time zone the browser is in. The edit path
   used new Date(date+'T'+time), which reads the BROWSER's zone, so an edit made outside
   California moved the event by the zone difference. The submit path already sends
   local_date/local_time for the server to place in Pacific time. */
function laWallToISO(date, time){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')) return null;
  var t=/^\d{2}:\d{2}$/.test(time||'')?time:'21:00';
  var guess=new Date(date+'T'+t+':00Z');
  for(var i=0;i<2;i++){
    var p={}; new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
      .formatToParts(guess).forEach(function(x){ p[x.type]=x.value; });
    var shown=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour%24,+p.minute);
    guess=new Date(guess.getTime()+(Date.parse(date+'T'+t+':00Z')-shown));
  }
  return guess.toISOString();
}
function laToday(){ return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }

/* ── debounced autocomplete against community_suggest ── */
function debounce(fn,ms){ var t; return function(){ var a=arguments; clearTimeout(t); t=setTimeout(function(){fn.apply(null,a);},ms); }; }
function wireAC(inputId,listId,kind,pick){
  var inp=$(inputId), list=$(listId);
  var run=debounce(function(){
    var q=inp.value.trim();
    if(q.length<2){ list.classList.remove('on'); return; }
    supa.rpc('community_suggest',{p_kind:kind,p_q:q}).then(function(r){
      var rows=(r&&r.data)||[];
      if(!rows.length){ list.classList.remove('on'); return; }
      list.innerHTML=rows.map(function(x,i){ return '<button type="button" data-i="'+i+'">'+esc(x.name)+(x.city?' <small>· '+esc(x.city)+'</small>':'')+'</button>'; }).join('');
      list.classList.add('on');
      list.querySelectorAll('button').forEach(function(b){ b.addEventListener('click',function(){ pick(rows[+b.dataset.i]); list.classList.remove('on'); }); });
    });
  },250);
  inp.addEventListener('input',run);
  document.addEventListener('click',function(e){ if(!list.contains(e.target)&&e.target!==inp) list.classList.remove('on'); });
}
wireAC('venue','venueList','venue',function(v){ $('venue').value=v.name; if(v.city)$('city').value=v.city; });
wireAC('artist','artistList','artist',function(a){ addArtist(a.name); $('artist').value=''; });

/* ── headliner pills ── */
function addArtist(n){ n=(n||'').trim(); if(!n||ARTISTS.indexOf(n)>-1) return; ARTISTS.push(n); paintArtists(); }
function paintArtists(){ $('artistPills').innerHTML=ARTISTS.map(function(a,i){ return '<span class="pill">'+esc(a)+'<button type="button" data-i="'+i+'" aria-label="Remove">✕</button></span>'; }).join('');
  $('artistPills').querySelectorAll('button').forEach(function(b){ b.addEventListener('click',function(){ ARTISTS.splice(+b.dataset.i,1); paintArtists(); }); }); }
$('artist').addEventListener('keydown',function(e){ if(e.key==='Enter'||e.key===','){ e.preventDefault(); addArtist(this.value.replace(/,$/,'')); this.value=''; } });

/* ── extra links ("More" — secondary/additional links) ── */
$('moreLinks').addEventListener('click',function(){ addXlink(); });
function addXlink(val){ var d=document.createElement('div'); d.className='xlrow';
  d.innerHTML='<input class="xl" type="url" placeholder="https://… (second ticket outlet, info page…)"/><button type="button" class="rm">✕</button>';
  $('xlinks').appendChild(d); if(val)d.querySelector('.xl').value=val;
  d.querySelector('.rm').addEventListener('click',function(){d.remove();}); }

/* ── genre segment ── */
$('gseg').addEventListener('click',function(e){ var b=e.target.closest('button'); if(!b)return; GENRE=b.dataset.g;
  this.querySelectorAll('button').forEach(function(x){x.classList.toggle('on',x===b);}); });

/* ── recent (mine) + edit ── */
var RECENT_OFFSET=0, RECENT_PAGE=25;
/* My events: prefer get_my_events (community AND organizer events, paged, has_orders). Until that server
   function is deployed, fall back to get_my_community_events (community only, 25 rows) exactly as before. */
function loadRecent(more){
  var off=more?RECENT_OFFSET:0;
  return supa.rpc('get_my_events',{p_limit:RECENT_PAGE,p_offset:off}).then(function(r){
    if(r&&r.error&&memberFnMissing(r.error)) return supa.rpc('get_my_community_events').then(function(r2){ return {rows:(r2&&r2.data)||[],paged:false}; });
    if(r&&r.error) return {error:true,rows:[],paged:false};
    return {rows:(r&&r.data)||[],paged:true};
  }).then(function(res){
    if(res.error){ $('recent').innerHTML='<div class="rc" role="alert">Could not load your events. Try again.</div>'; return RECENT; }
    var rows=res.rows; RECENT=more?RECENT.concat(rows):rows; RECENT_OFFSET=RECENT.length;
    if(!RECENT.length) return RECENT;
    $('recent').innerHTML=RECENT.map(function(e,i){
      var d=e.starts_at?new Date(e.starts_at):null;
      var ds=d?new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',month:'numeric',day:'numeric',year:'2-digit'}).format(d):'';
      var mine=e.source==null||e.source==='community';
      var acts=mine
        ?'<button type="button" class="ed" data-i="'+i+'">Edit</button>'
          +(MEMBER_DATA_CONTROLS&&MEMBER_LIVE.indexOf(e.status)>-1?'<button type="button" class="ed" data-act="unpublish" data-i="'+i+'">Unpublish</button>':'')
          +(MEMBER_DATA_CONTROLS&&!e.has_orders?'<button type="button" class="ed danger" data-act="delete" data-i="'+i+'">Delete</button>':'')
        :'<a class="ed" href="/create-event?e='+encodeURIComponent(e.slug)+'">Edit</a>';
      return '<div class="rc"><div class="t"><b>'+esc(e.title)+'</b><span>'+esc([e.venue,e.city].filter(Boolean).join(' · '))+(ds?' · '+ds:'')+'</span></div>'
        +'<span class="st'+(e.status==='published'?' live':'')+'">'+esc(e.status)+'</span>'
        +'<span class="acts">'+acts+'</span></div>';
    }).join('')+(res.paged&&rows.length===RECENT_PAGE?'<div class="rc"><button type="button" class="ed" id="recentMore">Show more</button></div>':'')
      +(MEMBER_DATA_CONTROLS?'':'<div class="rc" id="recentHelp">To unpublish or delete an event, email <a href="mailto:info@keepitil.com">info@keepitil.com</a> and we will do it for you.</div>');
    $('recent').querySelectorAll('button.ed[data-i], .ed[data-i]').forEach(function(b){ b.addEventListener('click',function(){
      var row=RECENT[+b.dataset.i], act=b.dataset.act; if(!act){ startEdit(row); return; } memberAct(act,row,b); }); });
    var mb=$('recentMore'); if(mb) mb.addEventListener('click',function(){ loadRecent(true); });
    return RECENT;
  }).catch(function(e){ try{ console.error('[submit-event] listings', e); }catch(x){} return []; });
}
var RECENT=[];
/* MEMBER CONTROL: unpublish / delete my own submitted event. Server functions are owner-only
   (events.submitted_by = auth.uid()). */
/* MEMBER_DATA_CONTROLS: ON since keepitil.github.io #95 (unpublish/delete_my_community_event) was applied and verified on prod (2026-11-25 15:30 window). Keep it equal here AND in settings.html (a test keeps both equal). Off = the email-request fallback is shown instead. */
var MEMBER_DATA_CONTROLS=true;
var MEMBER_LIVE=['published','review','sold_out'];
function memberFnMissing(err){ return !!err && (err.code==='PGRST202' || /could not find the function|does not exist/i.test(String(err.message||''))); }
function memberAct(act,row,btn){
  var del=act==='delete';
  var q=del?('Delete "'+(row.title||'this event')+'" permanently? This cannot be undone.'):('Take "'+(row.title||'this event')+'" off the public site? You can edit it and submit it again later.');
  if(!window.confirm(q)) return;
  var m=$('msg'); if(btn) btn.disabled=true;
  supa.rpc(del?'delete_my_community_event':'unpublish_my_community_event',{p_id:row.id}).then(function(r){
    var d=r&&r.data, err=r&&r.error;
    if(btn) btn.disabled=false;
    if(err){ m.className='msg err'; m.textContent=memberFnMissing(err)?'This is not available yet. Email info@keepitil.com and we will do it for you.':'Could not complete that. Nothing was changed.'; return; }
    if(d&&d.ok===false){ m.className='msg err'; m.textContent=d.message||d.error||'Could not complete that.'; return; }
    m.className='msg ok'; m.textContent=del?'Event deleted.':'Event unpublished.'; loadRecent();
  }).catch(function(){ if(btn) btn.disabled=false; m.className='msg err'; m.textContent='Could not complete that. Nothing was changed.'; });
}
/* After an edit: the server (update_community_event, edit-review policy) says whether the event went back to
   review. Only an explicit needs_review === false means it stayed live; the older server (no flag) always re-reviews. */
function editSavedMessage(d){ return (d&&d.needs_review===false)?'Saved — your event stays live. ✓':'Saved — back in review. ✓'; }
function startEdit(e){
  EDIT_ID=e.id; $('formTitle').textContent='EDIT EVENT'; $('submitBtn').textContent='Save changes';
  $('venue').value=e.venue||''; $('city').value=e.city||'Los Angeles'; $('title').value=e.title||'';
  if(e.starts_at){ var d=new Date(e.starts_at);
    var f=function(o){o.timeZone='America/Los_Angeles';return new Intl.DateTimeFormat('en-CA',o).format(d);};
    $('date').value=f({year:'numeric',month:'2-digit',day:'2-digit'});
    var tp=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Los_Angeles',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
    $('time').value=tp; }
  $('ticket_link').value=e.source_url||''; $('note').value=e.description||''; $('subgenres').value=e.genres||'';
  $('xlinks').innerHTML=''; (Array.isArray(e.extra_links)?e.extra_links:[]).forEach(function(u){ addXlink(u); });
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ── duplicate search panel ── */
var SKIND='event';
document.querySelector('.tabs').addEventListener('click',function(e){ var b=e.target.closest('button'); if(!b)return; SKIND=b.dataset.k;
  this.querySelectorAll('button').forEach(function(x){x.classList.toggle('on',x===b);}); doSearch(); });
var doSearch=debounce(function(){
  var q=$('sq').value.trim(); if(q.length<2){ $('sres').innerHTML=''; return; }
  supa.rpc('community_suggest',{p_kind:SKIND==='event'?'event':SKIND,p_q:q}).then(function(r){
    var rows=(r&&r.data)||[];
    $('sres').innerHTML=rows.length?rows.map(function(x){
      if(SKIND==='event'){ var d=x.starts_at?new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',month:'numeric',day:'numeric',year:'2-digit'}).format(new Date(x.starts_at)):'';
        return '<div class="sres"><b>'+esc(x.title)+'</b><br><small>'+esc([x.venue,x.city].filter(Boolean).join(' · '))+(d?' · '+d:'')+' · '+esc(x.status)+'</small></div>'; }
      return '<div class="sres"><b>'+esc(x.name)+'</b>'+(x.city?'<small> · '+esc(x.city)+'</small>':'')+'</div>';
    }).join(''):'<div class="sres"><small>No matches — likely not listed yet.</small></div>';
  });
},300);
$('sq').addEventListener('input',doSearch);

/* ── clear / submit ── */
function clearForm(){ EDIT_ID=null; $('formTitle').textContent='NEW EVENT'; $('submitBtn').textContent='Submit event';
  $('form').reset(); $('city').value='Los Angeles'; $('time').value='21:00'; ARTISTS=[]; paintArtists(); $('xlinks').innerHTML=''; $('msg').textContent=''; $('msg').className='msg'; }
$('clearBtn').addEventListener('click',clearForm);

$('form').addEventListener('submit',function(e){
  e.preventDefault();
  var msg=$('msg'); msg.className='msg'; msg.textContent='';
  var b=$('submitBtn'); b.disabled=true; var old=b.textContent; b.textContent='Submitting…';
  function fail(t){ msg.className='msg err'; msg.textContent=t; b.disabled=false; b.textContent=old; }
  function offline(e){ fail('Could not reach KEEPITIL. Check your connection and try again.'); try{ console.error('[submit-event]', e); }catch(x){} }
  if(!$('venue').value.trim()){ fail('Add the venue.'); return; }
  if(!$('date').value){ fail('Pick the date.'); return; }
  /* A new listing can't start in the past (Pacific date). Edits are allowed so a host can fix
     an old listing's details. */
  if(!EDIT_ID && $('date').value < laToday()){ fail('That date has passed. Pick today or a later date.'); return; }
  var tl=$('ticket_link').value.trim();
  if(tl && !/^https?:\/\//i.test(tl)){ tl='https://'+tl; $('ticket_link').value=tl; }   /* "posh.vip/e/x" -> https://posh.vip/e/x */
  if(tl && !/^https?:\/\/[^\s\/.]+\.[^\s]+$/i.test(tl)){ fail('The ticket link does not look like a web address. Paste the full link, e.g. https://posh.vip/e/your-event'); return; }
  var xl=[]; document.querySelectorAll('#xlinks .xl').forEach(function(i){ var u=i.value.trim(); if(u) xl.push(u); });
  var genres=(GENRE==='other'?'Other':'')+($('subgenres').value.trim()?((GENRE==='other'?' · ':'')+$('subgenres').value.trim()):(GENRE==='other'?'':'Electronic'));
  if(EDIT_ID){
    var startsISO=null;
    if($('date').value){ startsISO=laWallToISO($('date').value, $('time').value||'21:00'); }
    supa.rpc('update_community_event',{p_id:EDIT_ID,p:{
      title:$('title').value.trim()||null, venue:$('venue').value.trim(), city:$('city').value,
      starts_at:startsISO, ticket_link:$('ticket_link').value.trim(), note:$('note').value.trim(),
      genres:genres, extra_links:xl
    }}).then(function(r){
      var d=(r&&r.data)||{};
      if(r.error||!d.ok){ fail((r.error&&r.error.message)||d.error||'Could not save.'); return; }
      msg.className='msg ok'; msg.textContent=editSavedMessage(d);
      b.disabled=false; b.textContent=old; clearForm(); loadRecent();
    }).catch(offline);
    return;
  }
  supa.rpc('submit_community_event',{p:{
    venue:$('venue').value.trim(), city:$('city').value,
    local_date:$('date').value, local_time:$('time').value||'21:00', days:parseInt($('days').value,10)||1,
    title:$('title').value.trim(), headliners:ARTISTS,
    ticket_link:$('ticket_link').value.trim(), extra_links:xl,
    note:$('note').value.trim(), genres:genres
  }}).then(function(r){
    var d=(r&&r.data)||{};
    if(r.error||!d.ok){ fail((r.error&&r.error.message)||d.error||'Could not submit.'); return; }
    msg.className='msg ok'; msg.textContent='Submitted for review ✓ — it appears on the calendar once approved. Track it under Manage your events.';
    b.disabled=false; b.textContent=old; clearForm(); loadRecent();
  }).catch(offline);
});

/* ── boot: auth gate ── */
(function boot(){
  if(!supa){ $('gate').style.display='block'; return; }
  supa.auth.getSession().then(function(r){
    var s=r&&r.data&&r.data.session;
    if(!s){
      /* Return here after login, keeping any ?vs= / ?edit= prefill (apply.html only accepts same-origin paths via kilNext). */
      $('gateLogin').href='/apply?next='+encodeURIComponent(location.pathname+location.search);
      $('gate').style.display='block'; return;
    }
    $('app').style.display='block';
    var qs=new URLSearchParams(location.search);
    if(qs.get('why')==='keepitil-events-are-company-only') $('whyNote').hidden=false;
    var hl=$('hostLink'); if(hl) hl.hidden=false;
    /* ?edit=<id> opens one of YOUR listings for editing (the dashboard links here). */
    var want=qs.get('edit');
    loadRecent().then(function(rows){
      if(!want) return;
      var hit=(rows||[]).filter(function(e){ return String(e.id)===String(want); })[0];
      if(hit) startEdit(hit);
    });
  });
})();
