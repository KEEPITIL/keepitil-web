/* KEEPITIL profile.html: inline script "links" moved verbatim to an external file (CSP: no executable inline script). */
/* Founder a->d ABOUT: hyperlink dropdown = links(<=5) + socials(<=5); + Scene "Previous" back button */
(function(){
  if(!window.matchMedia('(max-width:768px)').matches) return; /* mobile only — desktop untouched */
  var bk=document.getElementById('pfBack'); if(bk&&/\/v31\/scene\.html/.test(document.referrer||'')) bk.style.display='block';
  /* Enforce ABOUT order a->d: move the header's links-dropdown + about text into .pf-meta so CSS order applies */
  try{ var pm=document.querySelector('.pf-meta'); var ld=document.getElementById('pfLinksDrop');
    /* About = description block, full-width, directly UNDER the avatar+metrics widget (Instagram layout) */
    ['pfAboutTop'].forEach(function(id){ var el=document.getElementById(id); if(pm&&el&&el.parentElement!==pm) pm.appendChild(el); });
    if(pm&&ld&&ld.parentElement!==pm) pm.appendChild(ld);
    /* hide the empty tagline (&nbsp;) that was creating the gap above the About text */
    var _bio=document.getElementById('pfBio'); if(_bio && (_bio.textContent||'').replace(/[\s ]/g,'')==='') _bio.style.display='none';
    var _sh=document.querySelector('#pfShare button'); if(_sh && !_sh.querySelector('.pf-share-lbl')){ var _sp=document.createElement('span'); _sp.className='pf-share-lbl'; _sp.textContent='SHARE'; _sp.style.cssText='margin-left:8px;font-weight:700;letter-spacing:.06em'; _sh.appendChild(_sp); }
  }catch(e){}
  /* Badges row (genre + Member). The Passport chip was removed entirely on 2026-08-26
     (Founder) — markup, styles and the claimed-profile gate that kept it honest all went with
     it, rather than leaving a hidden element and dead code behind. */
  try{ var pollB=0; var ivB=setInterval(function(){ pollB++;
    var bg=document.getElementById('pfBadges'); var P=window.PROFILE||{};
    if(bg && !bg.children.length){ var _ac=String(P.account_type||'').toLowerCase().trim(); var _sn={}; var arr=window.KIL_FILTER_BADGES(Array.isArray(P.badges)?P.badges.slice():[]).filter(function(x){var k=String(x).toLowerCase().trim(); if(!k||k===_ac||_sn[k])return false; _sn[k]=1; return true;}); bg.innerHTML=arr.slice(0,6).map(function(x){return '<span class="bdg">'+String(x).replace(/[<>]/g,'').slice(0,16)+'</span>';}).join(''); }
    if(pollB>20 || (bg&&bg.children.length)) clearInterval(ivB); },600); }catch(e){}
  /* full HTML escape: this esc shadows the global one in this IIFE and used to only strip quotes, so a URL-derived label reached innerHTML raw */
  function esc(u){return String(u==null?'':u).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function build(){
    try{
      var P=window.PROFILE||{}; var links=(P.links||[]).slice(0,5);
      var soc=P.socials||{}; var socArr=[];
      ['instagram','soundcloud','tiktok','youtube','spotify','website'].forEach(function(k){ if(soc[k]&&socArr.length<5) socArr.push([k,soc[k]]); });
      var menu=document.getElementById('pfLinksMenu'), drop=document.getElementById('pfLinksDrop'); if(!menu||!drop) return;
      if(!links.length && !socArr.length) return;
      var html=links.map(function(u){var href=safeNav(u); if(!href) return ''; var lbl=String(href).replace(/^https?:\/\//,'').slice(0,34);return '<a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer" style="display:block;padding:8px 10px;color:var(--brand,#00b4ff);font-size:.84rem;font-weight:700;border-radius:8px">'+esc(lbl)+'</a>';}).join('');
      html+=socArr.map(function(p){var href=safeNav(p[1]); if(!href) return ''; var lbl=p[0].charAt(0).toUpperCase()+p[0].slice(1);return '<a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer" style="display:block;padding:8px 10px;color:var(--accent,#8b5cff);font-size:.84rem;font-weight:700;border-radius:8px">'+esc(lbl)+'</a>';}).join('');
      menu.innerHTML=html; drop.style.display='block';
    }catch(e){}
  }
  var n=0; var iv=setInterval(function(){ n++; build(); if(n>20) clearInterval(iv); },600);
})();
