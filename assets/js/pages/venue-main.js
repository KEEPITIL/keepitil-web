/* KEEPITIL venue.html: inline script "main" moved verbatim to an external file (CSP: no executable inline script). */
var SUPA_URL='https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
var SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
var SB=window.supabase?supabase.createClient(SUPA_URL,SUPA_KEY):null;
function $(id){return document.getElementById(id);}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
var V=null, SLUG='';

/* Same not-found state as /event and /profile: a heading, a way out, and noindex. A bare line of
   text in the loading box gave a dead end with no navigation and left the page indexable. */
function venueNF(){
  var el=$('loading');
  if(window.KIL_NOT_FOUND) window.KIL_NOT_FOUND({ what:'venue', heading:'That venue isn’t here',
    body:'It may have been removed, or the link may be wrong.', into:'#loading',
    links:[['/','Explore events'],['/connect/','Connect'],['/submit-event','Submit an event']] });
  else if(el){ el.textContent=''; var h=document.createElement('h1'); h.className='vh'; h.textContent='Venue'; el.appendChild(h); el.appendChild(document.createTextNode('This venue is not available.')); }   // keep the heading even without the shell
}
function setHero(v){
  var box=$('vCover'); if(!box||!v||!v.cover_url) return;
  var cur=box.querySelector('img'); if(cur&&cur.getAttribute('data-hero')===v.cover_url) return;   // already drawn (early path): do not create a second request
  box.innerHTML='<img src="'+esc(v.cover_url)+'" data-hero="'+esc(v.cover_url)+'" alt="'+esc(v.name)+'" fetchpriority="high" decoding="async" data-fb="hide">';   /* the LCP element: the .v-cover box already holds its 16:9 space + gradient, so nothing shifts when it arrives */
}
async function load(){
  SLUG=new URLSearchParams(location.search).get('v')||new URLSearchParams(location.search).get('slug')||'';
  /* PERF: start the venue request NOW. It used to wait for DOMContentLoaded, which waits for the deferred shell/radio/echo scripts (~1.8 s on a throttled phone), so the data and then the hero image started that much later. Only the not-found / render step still waits for the shell (below). */
  var req=null; if(SB&&SLUG){ try{ req=Promise.resolve(SB.rpc('get_venue',{p_slug:SLUG})).catch(function(){ return null; }); }catch(e){ req=null; } }
  /* and draw the hero as soon as its URL is known (before DOMContentLoaded) so the image request starts then; render() below skips it when it is already there */
  if(req) req.then(function(r){ var v=r&&r.data&&r.data[0]; if(v&&v.cover_url) setHero(v); });
  /* keepitil-shell.js is deferred and defines KIL_NOT_FOUND; running before DOMContentLoaded took the bare-text fallback below, which replaced the page's only h1 (axe page-has-heading-one on /venue). */
  if(document.readyState==='loading') await new Promise(function(r){ document.addEventListener('DOMContentLoaded', r, {once:true}); });
  if(!SB||!SLUG){ venueNF(); return; }
  var r=null; try{ r=await req; }catch(e){ r=null; }
  V=r&&r.data&&r.data[0];
  if(!V){ venueNF(); return; }
  render();
}
function render(){
  document.title=V.name+' — Book on KEEPITIL';
  $('mDesc').setAttribute('content',(V.tagline||V.about||V.name));
  $('mOg').setAttribute('content',V.name+' — KEEPITIL');
  /* Clean /venue form, matching how Pages already serves it; create the tag since there is
     no longer a static one to mutate. */
  var _vc=document.getElementById('mCanon');
  if(!_vc){ _vc=document.createElement('link'); _vc.rel='canonical'; _vc.id='mCanon';
            document.head.appendChild(_vc); }
  _vc.setAttribute('href','https://keepitil.com/venue?v='+encodeURIComponent(V.slug));
  if(V.cover_url){ setHero(V); $('mImg').setAttribute('content',V.cover_url); }
  try{ $('ldjson').textContent=JSON.stringify({"@context":"https://schema.org","@type":"EventVenue","name":V.name,"description":V.about||V.tagline,"address":V.address||V.city,"maximumAttendeeCapacity":V.capacity_summary,"image":V.cover_url||undefined,"url":'https://keepitil.com/venue?v='+V.slug}); }catch(e){}
  $('vName').textContent=V.name;
  $('vTag').textContent=V.tagline||'';
  var loc=V.address||V.city;
  $('vLoc').innerHTML=loc?('📍 <a style="color:inherit;border-bottom:1px solid var(--line);display:inline-block;padding:3px 0;min-height:24px;box-sizing:border-box" href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(V.maps_query||loc)+'" target="_blank" rel="noopener noreferrer">'+esc(loc)+' ↗</a>'):'';
  // quick answers (host? / cost? / book?)
  var rooms=V.rooms||[]; var lowest='';
  try{ var ps=[]; rooms.forEach(function(rm){(rm.pricing||[]).forEach(function(p){var n=parseInt(String(p.price).replace(/[^0-9]/g,''),10); if(n)ps.push(n);});}); if(ps.length)lowest='from $'+Math.min.apply(null,ps).toLocaleString(); }catch(e){}
  $('vQuick').innerHTML=
    '<div class="q"><div class="k">Can it host my event?</div><div class="val">'+esc(V.capacity_summary||'Ask us')+'</div></div>'+
    '<div class="q"><div class="k">What will it cost?</div><div class="val">'+esc(lowest||'Request a quote')+'</div></div>'+
    '<div class="q"><div class="k">How do I book it?</div><div class="val">Send a request below</div></div>';
  $('vAbout').textContent=V.about||'';
  // rooms
  $('vRooms').innerHTML=rooms.map(function(rm){
    var pr=(rm.pricing||[]).map(function(p){return '<div class="price"><span>'+esc(p.label)+'</span><span class="p">'+esc(p.price)+'</span></div>';}).join('');
    return '<div class="card room"><div class="rn">'+esc(rm.name)+'</div><div class="rc">'+esc(rm.capacity||'')+'</div>'+pr+'</div>';
  }).join('')||'<div class="card">Room details on request.</div>';
  $('vRental').textContent=V.rental_terms||'';
  $('vAmenities').innerHTML=(V.amenities||[]).map(function(a){return '<span class="chip">'+esc(a)+'</span>';}).join('')||'<span class="mini">On request.</span>';
  $('vEventTypes').innerHTML=(V.event_types||[]).map(function(a){return '<span class="chip">'+esc(a)+'</span>';}).join('')||'<span class="mini">All event types.</span>';
  $('vAddons').innerHTML=(V.addons||[]).map(function(a){return '<div class="addon"><span>'+esc(a.name)+'</span><span class="p">'+esc(a.price)+'</span></div>';}).join('')||'No add-ons listed.';
  // booking room options
  $('bRoom').innerHTML='<option value="">Any / not sure</option>'+rooms.map(function(rm){return '<option>'+esc(rm.name)+'</option>';}).join('');
  $('bNote').textContent=V.booking_note||'';
  // socials
  var soc=V.socials||{};
  var sl=[];
  if(soc.instagram)sl.push('<a href="'+esc(soc.instagram)+'" target="_blank" rel="noopener noreferrer">Instagram ↗</a>');
  if(soc.tiktok)sl.push('<a href="'+esc(soc.tiktok)+'" target="_blank" rel="noopener noreferrer">TikTok ↗</a>');
  if(soc.yelp)sl.push('<a href="'+esc(soc.yelp)+'" target="_blank" rel="noopener noreferrer">Yelp ↗</a>');
  if(soc.website)sl.push('<a href="'+esc(soc.website)+'" target="_blank" rel="noopener noreferrer">Website ↗</a>');
  $('vSocial').innerHTML=sl.join('');
  // reviews (only show rating/count if present)
  var rev=V.reviews||{};
  if(rev && rev.source){
    var rc=(rev.rating||rev.count)?(' · '+esc(rev.rating||'')+(rev.count?(' ('+esc(rev.count)+' reviews)'):'')):'';
    $('vReviews').innerHTML='<b>'+esc(rev.source)+'</b>'+rc+(rev.note?('<div style="margin-top:6px">'+esc(rev.note)+'</div>'):'')+(rev.url?('<div style="margin-top:8px"><a style="color:var(--brand);display:inline-block;padding:3px 0;min-height:24px;box-sizing:border-box" href="'+esc(rev.url)+'" target="_blank" rel="noopener noreferrer nofollow">View on '+esc(rev.source)+' ↗</a></div>'):'');
  } else { $('vReviews').innerHTML=esc((rev&&rev.note)||'No reviews yet.'); }
  // on-site reviews + gallery (auto-filled from tagged posts, filterable)
  loadReviews();
  $('gFilter').innerHTML=[['all','All'],['image','Photos'],['video','Videos'],['blog','Blogs'],['artist','Artists']].map(function(f){return '<button data-g="'+f[0]+'"'+(f[0]==='all'?' class="on"':'')+' data-click="loadGallery" data-a="'+esc(JSON.stringify([f[0]]))+'">'+f[1]+'</button>';}).join('');
  loadGallery('all');
  // faq
  $('vFaq').innerHTML=(V.faqs||[]).map(function(f,i){return '<div class="faq" data-click="vToggleOpen" data-a="[&quot;$el&quot;]"><div class="fq"><span>'+esc(f.q)+'</span><span>+</span></div><div class="fa">'+esc(f.a)+'</div></div>';}).join('')||'No FAQs yet.';
  // ask
  $('askName').textContent=V.name;
  $('askSugg').innerHTML=['How many guests fit?','Can I bring outside food?','Can I have alcohol?','Can I tour first?'].map(function(q){return '<button data-click="vAskFromEl" data-a="[&quot;$el&quot;]">'+esc(q)+'</button>';}).join('');
  // claim
  $('vClaim').innerHTML=V.owner_handle?('Managed by <a href="/profile?slug='+esc(V.owner_handle)+'">@'+esc(V.owner_handle)+'</a>'):'Is this your venue? <a data-click="claim">Claim this page →</a>';
  $('loading').style.display='none'; $('vBody').style.display='block';
}
/* ── Gallery (auto-filled from posts/blogs that tag or mention the venue) ── */
function loadGallery(kind){
  var buttons=document.querySelectorAll('#gFilter button');
  for(var i=0;i<buttons.length;i++){ buttons[i].classList.toggle('on',buttons[i].getAttribute('data-g')===kind); }
  var box=$('vGallery'); box.innerHTML='<div class="ph" style="grid-column:1/-1;aspect-ratio:auto;padding:20px">Loading…</div>';
  SB.rpc('get_venue_media',{p_slug:V.slug,p_kind:(kind==='all'?null:kind)}).then(function(r){
    var items=(r&&r.data)||[];
    if(!items.length){ galleryEmpty(); return; }
    box.innerHTML=items.map(function(m){
      var href=m.source_url||m.media_url||'#'; var ext=(m.source_url||m.media_url)?' target="_blank" rel="noopener noreferrer"':'';
      if(m.kind==='video'&&m.media_url){ return '<a class="gcard" href="'+esc(href)+'"'+ext+'><span class="lab">Video</span><video src="'+esc(m.media_url)+'" muted playsinline></video>'+(m.author_handle?'<div class="by">@'+esc(m.author_handle)+'</div>':'')+'</a>'; }
      if(m.kind==='blog'){ return '<a class="gcard blogc" href="'+esc(href)+'"'+ext+'><span class="lab">Blog</span>'+(m.media_url?'<img src="'+esc(m.media_url)+'" alt="" data-fb="hide">':'')+'<div class="bt">'+esc(m.title||'Read')+'</div>'+(m.author_handle?'<div class="by">by '+esc(m.author_handle)+'</div>':'')+'</a>'; }
      var img=m.media_url?'<img src="'+esc(m.media_url)+'" alt="" data-fb="hide-closest" data-fb-sel=".gcard">':'';
      var inner=img||('<div class="bt">'+esc(m.title||'')+'</div>');
      return '<a class="gcard" href="'+esc(href)+'"'+ext+'><span class="lab">'+esc((m.kind||'post').toUpperCase())+'</span>'+inner+(m.author_handle?'<div class="by">@'+esc(m.author_handle)+'</div>':'')+'</a>';
    }).join('');
  }).catch(function(){ galleryEmpty(); });
}
function galleryEmpty(){
  var soc=V.socials||{}; var box=$('vGallery');
  var tag='Tag <b>'+esc(V.name)+'</b> in your posts and they show up here automatically.';
  if(soc.instagram||soc.tiktok){ box.innerHTML='<div class="ph" style="grid-column:1/-1;aspect-ratio:auto;min-height:0;padding:24px">No tagged posts yet — see photos &amp; videos on '+(soc.instagram?'<a style="color:var(--brand)" href="'+esc(soc.instagram)+'" target="_blank" rel="noopener noreferrer">Instagram</a>':'')+(soc.instagram&&soc.tiktok?' · ':'')+(soc.tiktok?'<a style="color:var(--brand)" href="'+esc(soc.tiktok)+'" target="_blank" rel="noopener noreferrer">TikTok</a>':'')+'.<br>'+tag+'</div>'; }
  else { box.innerHTML='<div class="ph" style="grid-column:1/-1;aspect-ratio:auto;padding:24px">'+tag+'</div>'; }
}
/* ── On-site reviews ── */
function loadReviews(){
  SB.rpc('get_venue_reviews',{p_slug:V.slug,p_limit:30}).then(function(r){
    var rows=(r&&r.data)||[];
    $('vReviewsList').innerHTML=rows.map(function(rv){
      var stars=rv.rating?('<span class="stars">'+Array(rv.rating+1).join('★')+'</span>'):'';
      return '<div class="rvw"><div class="who">@'+esc(rv.author_handle||'guest')+stars+'</div><div class="txt">'+esc(rv.body)+'</div></div>';
    }).join('');
  }).catch(function(){});
  SB.auth.getSession().then(function(s){
    if(s&&s.data&&s.data.session){
      $('reviewForm').innerHTML='<div class="card"><label for="rvRating">Leave a review</label><select id="rvRating" style="max-width:160px"><option value="5">★★★★★</option><option value="4">★★★★</option><option value="3">★★★</option><option value="2">★★</option><option value="1">★</option></select><textarea id="rvBody" placeholder="How was your event at '+esc(V.name)+'?" style="margin-top:10px"></textarea><button class="submit" data-click="submitReview">Post review</button><div class="msg" id="rvMsg"></div></div>';
    }
  });
}
function submitReview(){
  var m=$('rvMsg'); m.className='msg'; m.textContent=''; var body=($('rvBody').value||'').trim();
  if(!body){ m.className='msg err'; m.textContent='Write your review first.'; return; }
  SB.rpc('submit_venue_review',{p_slug:V.slug,p_rating:parseInt($('rvRating').value,10)||5,p_body:body}).then(function(r){
    if(r.error){ m.className='msg err'; m.textContent='Could not post: '+(r.error.message||r.error); return; }
    $('rvBody').value=''; m.className='msg ok'; m.textContent='Thanks — your review is posted ✓'; loadReviews();
  });
}
function scrollToBook(){ $('bookSec').scrollIntoView({behavior:'smooth'}); }
function scrollToAsk(){ $('askSec').scrollIntoView({behavior:'smooth'}); }

async function submitBooking(){
  var m=$('bMsg'); m.className='msg'; m.textContent='';
  var name=$('bName').value.trim(), email=$('bEmail').value.trim();
  if(!name||!email){ m.className='msg err'; m.textContent='Name and email are required.'; return; }
  var b=$('bSend'); b.disabled=true; b.textContent='Sending…';
  try{
    var r=await SB.rpc('submit_booking_request',{p_venue_slug:V.slug,p_room:$('bRoom').value||null,p_date:$('bDate').value||null,p_event_type:$('bType').value||null,p_guests:parseInt($('bGuests').value||'0',10)||null,p_name:name,p_email:email,p_phone:$('bPhone').value||null,p_addons:$('bAddons').value||null,p_notes:$('bNotes').value||null});
    if(r.error)throw r.error;
    m.className='msg ok'; m.textContent='Request sent ✓ The '+V.name+' team will follow up by email.';
    ['bType','bGuests','bName','bEmail','bPhone','bAddons','bNotes'].forEach(function(id){$(id).value='';});
  }catch(e){ m.className='msg err'; m.textContent='Could not send: '+(e.message||e); }
  b.disabled=false; b.textContent='Send booking request';
}

/* Delegated actions (assets/js/kil-actions.js): the markup carries data-click / data-keydown instead of inline handlers; only the names listed here can run. */
function vAskFromEl(el){ askVQ(el.textContent); }
function vToggleOpen(el){ el.classList.toggle('open'); }
function vAskEnter(e){ if(e.key==='Enter') askV(); }
if(window.KilActions) KilActions.allow(["askV", "claim", "loadGallery", "scrollToAsk", "scrollToBook", "submitBooking", "submitReview", "vAskEnter", "vAskFromEl", "vToggleOpen"]);
function askVQ(q){ $('askInput').value=q; askV(); }
function askV(){
  var inp=$('askInput'); var q=(inp.value||'').trim(); if(!q)return;
  var log=$('askLog');
  var you=document.createElement('div'); you.className='ask-msg you'; you.textContent=q; log.appendChild(you);
  inp.value='';
  var pend=document.createElement('div'); pend.className='ask-msg bot'; pend.textContent='…'; log.appendChild(pend);
  log.scrollTop=log.scrollHeight;
  SB.rpc('ask_venue',{p_slug:V.slug,p_question:q}).then(function(r){
    var d=(r&&r.data)||{}; pend.textContent=d.answer||'…'; log.scrollTop=log.scrollHeight;
  }).catch(function(){ pend.textContent='Something went wrong — try again.'; });
}
async function claim(){
  var c=prompt('Enter your email or phone so the KEEPITIL team can verify you manage '+V.name+':');
  if(!c)return;
  try{ var r=await SB.rpc('claim_venue',{p_slug:V.slug,p_contact:c,p_note:null}); if(r.error)throw r.error; alert('Thanks — your claim was submitted. The KEEPITIL team will reach out to verify.'); }
  catch(e){ alert('Could not submit claim: '+(e.message||e)); }
}
load();
