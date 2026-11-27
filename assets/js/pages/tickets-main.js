/* KEEPITIL tickets.html: inline script "main" moved verbatim to an external file (CSP: no executable inline script). */
var SUPA_URL='https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
var SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
var supa=window.supabase?supabase.createClient(SUPA_URL,SUPA_KEY):null;
function $(id){return document.getElementById(id);}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function enc(s){return encodeURIComponent(String(s==null?'':s));}
/* Event times render in the VENUE's timezone (KIL formatter), not the viewer's device. */
var EVTZ='America/Los_Angeles';
function fmtDate(iso,tz){ if(!iso)return ''; var d=new Date(iso); if(isNaN(d))return ''; return d.toLocaleDateString('en-US',{timeZone:tz||EVTZ,weekday:'short',month:'short',day:'numeric',year:'numeric'}); }
function fmtTime(iso,tz){ if(!iso)return ''; var d=new Date(iso); if(isNaN(d))return ''; return d.toLocaleTimeString('en-US',{timeZone:tz||EVTZ,hour:'numeric',minute:'2-digit'}); }
function shortDate(iso,tz){ if(!iso)return ''; var d=new Date(iso); if(isNaN(d))return ''; return d.toLocaleDateString('en-US',{timeZone:tz||EVTZ,month:'short',day:'numeric'}); }

var TIX=[], ACTIVE=0, BACK='/', EXPANDED=false;
function toggleTix(){ EXPANDED=!EXPANDED; var el=document.getElementById('tixlist'); var cv=document.getElementById('tixchev'); if(el) el.style.display=EXPANDED?'flex':'none'; if(cv) cv.textContent=EXPANDED?'▴':'▾'; }

function render(){
  var x=TIX[ACTIVE]; if(!x) return; var e=x.row;
  var flyerBg=e.cover_url?("background-image:url('"+String(e.cover_url).replace(/'/g,'')+"')"):"";
  var org = e.owner_handle ? ('<a href="/profile?slug='+enc(e.owner_handle)+'">'+esc(e.owner_name||e.owner_handle)+'</a>') : '<span>KEEPITIL Event</span>';
  var used=!!e.checked_in_at;
  var price=e.price_cents!=null?('$'+(e.price_cents/100).toFixed(2).replace(/\.00$/,'')):'';
  var door=KilTicketQr.payload(e.qr_token,{prefix:true});
  var qr='';
  if(door){ var qrDraw=qrcode(0,'M'); qrDraw.addData(door); qrDraw.make(); qr=qrDraw.createDataURL(6,0); }
  var loc=[e.venue,e.city].filter(Boolean).join(', ');
  var maps=loc?('<a href="https://www.google.com/maps/search/?api=1&query='+enc(loc)+'" target="_blank" rel="noopener noreferrer">'+esc(loc)+' ↗</a>'):'—';
  var dt=fmtDate(e.starts_at,e.tz)+(fmtTime(e.starts_at,e.tz)?(' · '+fmtTime(e.starts_at,e.tz)):'');
  /* expandable picker — only the tickets this buyer holds FOR THIS EVENT */
  var sameTix=TIX.map(function(tk,i){return {tk:tk,i:i};}).filter(function(o){return o.tk.row.event_id===e.event_id;});
  var tixItems=sameTix.map(function(o){
    var er=o.tk.row, i=o.i; var pr=er.price_cents!=null?('$'+(er.price_cents/100).toFixed(2).replace(/\.00$/,'')):'Free';
    return '<div class="tixpick'+(i===ACTIVE?' on':'')+'" data-click="setActive" data-a="['+i+']">'+
      '<span class="tp-n">'+esc(er.tier_name||'General Admission')+'</span>'+
      '<span class="tp-q">Qty '+(er.qty||1)+'</span>'+
      '<span class="tp-p">'+esc(pr)+'</span>'+
      '</div>';
  }).join('');
  var tixCount=sameTix.length;
  var totQty=0, totCents=0; sameTix.forEach(function(o){ var er=o.tk.row; var q=er.qty||1; totQty+=q; totCents+=(er.price_cents||0)*q; });
  var totPrice='$'+(totCents/100).toFixed(2).replace(/\.00$/,'');

  $('ticketview').innerHTML=
  '<div class="card">'+
    '<div class="tp-head">'+
      '<a class="backbtn" href="'+BACK+'">&larr; Profile</a>'+
      '<div class="orgbar">'+org+'</div>'+
    '</div>'+
    '<div class="tp-body">'+
      '<div class="tp-col">'+
        '<div class="flyer" style="'+flyerBg+'"></div>'+
        '<div class="qrcard"><img src="'+qr+'" alt="Ticket QR code"'+(used?' style="opacity:.4;filter:grayscale(1)"':'')+'/><div class="cap">'+(used?'Already scanned':'Scan at the door')+'</div></div>'+
      '</div>'+
      '<div class="tp-col">'+
        '<div class="infocard">'+
          '<a class="buymore" href="/event?e='+enc(x.slug)+'">BUY TICKETS</a>'+
          '<h1>'+esc(e.title||'Event')+'</h1>'+
          '<div class="irow"><span class="k">Date</span><span class="v">'+esc(dt)+'</span></div>'+
          '<div class="irow"><span class="k">Venue</span><span class="v">'+esc(e.venue||'—')+'</span></div>'+
          '<div class="irow"><span class="k">Address</span><span class="v">'+maps+'</span></div>'+
          '<div class="irow"><span class="k">Genre</span><span class="v">'+esc(e.genres||'—')+'</span></div>'+
          '<div class="tixhead" data-click="toggleTix"><span class="th-k">Your tickets</span><span class="th-v">'+totQty+' ticket'+(totQty===1?'':'s')+' · '+totPrice+'</span><span class="chev" id="tixchev">'+(EXPANDED?'▴':'▾')+'</span></div>'+
          '<div class="tixlist" id="tixlist" style="display:'+(EXPANDED?'flex':'none')+'">'+tixItems+'</div>'+
        '</div>'+
      '</div>'+
    '</div>'+
  '</div>';

  var others=TIX.filter(function(_,i){return i!==ACTIVE;});
  if(others.length){
    $('carwrap').style.display='';
    $('carwrap').innerHTML='<div class="car-h">More of your tickets</div>'+
      '<div class="car" id="car"><button class="car-arrow prev" aria-label="Previous" data-click="carScroll" data-a="[-1]">&lsaquo;</button><div class="car-row" id="car-row">'+
      TIX.map(function(t,i){ if(i===ACTIVE) return ''; var ee=t.row;
        var im=ee.cover_url?'<img src="'+esc(ee.cover_url)+'" alt="" data-fb="hide">':'';
        return '<div class="car-card" data-click="setActive" data-a="['+i+']">'+im+'<div class="shade"></div><div class="cdate">'+esc(shortDate(ee.starts_at,ee.tz)||'TICKET')+'</div><div class="cbody"><div class="ct">'+esc(ee.title||'Event')+'</div><div class="cc">'+esc(ee.city||'')+'</div></div></div>';
      }).join('')+'</div><button class="car-arrow next" aria-label="Next" data-click="carScroll" data-a="[1]">&rsaquo;</button></div>';
    carMark();
  } else { $('carwrap').style.display='none'; }
}
function carScroll(d){ var row=$('car-row'); if(!row)return; var c=row.querySelector('.car-card'); var w=c?(c.offsetWidth+14)*Math.max(1,Math.floor(row.clientWidth/(c.offsetWidth+14))):320; row.scrollBy({left:d*w,behavior:'smooth'}); }
function carMark(){ var car=$('car'),row=$('car-row'); if(!car||!row)return; function u(){ var sc=row.scrollWidth-row.clientWidth>4; car.classList.toggle('scrollable',sc); var p=car.querySelector('.prev'),n=car.querySelector('.next'); if(p)p.disabled=row.scrollLeft<=2; if(n)n.disabled=row.scrollLeft>=row.scrollWidth-row.clientWidth-2; } u(); row.onscroll=u; }
/* Delegated actions (assets/js/kil-actions.js): the markup carries data-click instead of inline handlers; only the names listed here can run. */
if(window.KilActions) KilActions.allow(["carScroll", "setActive", "toggleTix"]);
function setActive(i){ if(i<0||i>=TIX.length)return; ACTIVE=i; render(); window.scrollTo({top:0,behavior:'smooth'}); }

async function init(){
  if(!supa){ $('loading').style.display='none'; $('gate').style.display='block'; return; }
  var b=$('loginBtn'); if(b) b.href='/apply?next='+encodeURIComponent(location.pathname+location.search);
  /* session can restore a beat late (Google/Apple sign-in) — retry before showing the login gate */
  var s=null;
  for(var _i=0;_i<5;_i++){ var r=await supa.auth.getSession().catch(function(){return null;}); s=r&&r.data?r.data.session:null; if(s) break; await new Promise(function(res){setTimeout(res,500);}); }
  if(!s){ $('loading').style.display='none'; $('gate').style.display='block'; return; }
  try{ var ps=await supa.rpc('my_profile_slug'); if(ps&&!ps.error&&ps.data){ BACK='/profile?slug='+enc(ps.data)+'&tab=shows'; } }catch(e){}
  try{
    var o=await supa.rpc('get_my_tickets'); var rows=(o&&o.data)||[];
    if(!rows.length){ $('loading').style.display='none'; $('empty').style.display='block'; return; }
    TIX=rows.map(function(x){ return {row:x, slug:(x.slug||('event-'+x.event_id)), title:(x.title||'Event')}; });
    var want=new URLSearchParams(location.search).get('e');
    if(want){ var idx=TIX.findIndex(function(x){return x.slug===want;}); if(idx>=0) ACTIVE=idx; }
    $('loading').style.display='none'; $('ticketview').style.display='block';
    render();
  }catch(err){ $('loading').textContent='Could not load your ticket. Please refresh.'; }
}
init();
