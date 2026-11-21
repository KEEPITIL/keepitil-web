/* KEEPITIL bottom tabs for standalone pages (Grok GO 2026-11-21, draft #208).
   The five mobile tabs, Discover · Connect · Create · Culture · Earn, for pages that do NOT load
   keepitil-shell.js (about, artists, business, venues, apps, game night, needs, build service,
   studio, WiFi Remote, organizer dashboard, SkillVault). Those pages keep their own header and
   footer, so the whole shell (header nav, footer, desktop radio, analytics, chat) is NOT pulled in:
   this renders the shell's #kil-bnav and nothing else, phones only (≤860px).
   The list, hrefs, tints and icons MIRROR keepitil-shell.js DESTINATIONS / ICON_GEOMETRY.
   assets/js/core-pass.test.mjs fails if they drift apart, or if a Shop tab appears in either.
   No-op inside frames and on any page where the shell already mounted #kil-bnav. */
(function(){
  try{ if(window.self!==window.top) return; }catch(e){ return; }
  var TABS=[
    {href:'/',         pill:'DISCOVER', label:'Discover', icon:'home',    home:true, match:/^\/(index(\.html)?)?$/},
    {href:'/connect/', pill:'CONNECT',  label:'Connect',  icon:'scene',   match:/(^|\/)connect\/?$/,
     tint:'#22e07a', glow:'rgba(34,224,122,.75)'},
    {href:'/create/',  pill:'CREATE',   label:'Create',   icon:'vs',      match:/(^|\/)(create|vs)(\.html)?\/?$/,
     tint:'#ff5c8a', glow:'rgba(255,92,138,.75)'},
    {href:'/culture/', pill:'CULTURE',  label:'Culture',  icon:'culture', match:/(^|\/)culture(\.html)?\/?$/,
     tint:'#a06bff', glow:'rgba(160,107,255,.75)'},
    {href:'/earn/',    pill:'EARN',     label:'Earn',     icon:'radio',   match:/(^|\/)(earn|radio)(\.html)?\/?$/,
     tint:'#ff9f43', glow:'rgba(255,159,67,.75)'}
  ];
  var ICONS={
    home: '<circle cx="10.8" cy="10.8" r="6.2"/><path d="M15.4 15.4L20 20"/><path d="M6.2 12.4c1.6-1.5 3.1-2.2 4.6-2.2s3 .7 4.6 2.2"/>',
    scene: '<path d="M8 8l3 6M16 8l-3 6M8.4 6.6h7.2"/><circle cx="6" cy="6" r="2.1"/><circle cx="18" cy="6" r="2.1"/><circle cx="12" cy="17" r="2.1"/>',
    vs: '<path d="M4 6l3.4 12L10.8 6"/><path d="M13.6 18h5l-4.6-6h5"/>',
    culture: '<path d="M6.5 4.8h11"/><path d="M4.6 7.6h14.8"/><rect x="3" y="10.4" width="18" height="9.8" rx="2.2"/><path d="M6.6 16.6l2.3-2.9 2.2 2.6 2.1-3.6 2.4 3.9"/>',
    radio: '<circle cx="12" cy="12" r="1.6"/><path d="M7.8 7.8a5.9 5.9 0 0 0 0 8.4M16.2 7.8a5.9 5.9 0 0 1 0 8.4"/><path d="M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/>'
  };
  var ATTRS='viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
  var CSS=
    '#kil-bnav{display:none;position:fixed;left:0;right:0;bottom:0;z-index:980;max-height:96px;background:rgba(10,10,16,.97);'
  + 'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid rgba(255,255,255,.08);'
  + 'padding:6px 10px calc(6px + env(safe-area-inset-bottom,0px));align-items:center;justify-content:space-around;box-sizing:border-box;'
  + 'font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}'
  + '#kil-bnav a{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:6px 2px;'
  + 'color:rgba(255,255,255,.72);text-decoration:none;transition:color .15s,filter .15s,transform .1s}'
  + '#kil-bnav a svg{width:23px;height:23px;display:block}'
  + '#kil-bnav .kb-l{font-size:10px;line-height:1;letter-spacing:.04em;font-weight:700;text-transform:uppercase;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
  + '#kil-bnav a:not(.on){color:rgba(255,255,255,.55)!important;filter:none!important}'
  + '#kil-bnav a:focus-visible{outline:2px solid #fff;outline-offset:-3px;border-radius:8px}'
  + '#kil-bnav a:active{transform:scale(.9)}'
  + '@media(max-width:860px){#kil-bnav{display:flex}'
  /* Content clears the bar; a page with its own bottom bar marks it data-kil-above-tabs and sets
     --kil-tabs-extra to that bar's height, so both stay visible and nothing sits under them. */
  + 'body{padding-bottom:calc(var(--kil-bnav-h,64px) + var(--kil-tabs-extra,0px) + 8px)!important}'
  + '[data-kil-above-tabs]{bottom:var(--kil-bnav-h,64px)!important}'
  /* floating buttons clear both bars AND the KEEPITIL chat button, which also docks above --kil-bnav-h */
  + '[data-kil-above-tabs="float"]{bottom:calc(var(--kil-bnav-h,64px) + var(--kil-tabs-extra,0px) + 72px)!important}}';

  function mount(){
    try{
      if(document.getElementById('kil-bnav')) return;
      if(!document.getElementById('kil-tabs-css')){
        var st=document.createElement('style'); st.id='kil-tabs-css'; st.textContent=CSS; document.head.appendChild(st);
      }
      var path=location.pathname, bn=document.createElement('nav');
      bn.id='kil-bnav'; bn.setAttribute('aria-label','KEEPITIL');
      bn.innerHTML=TABS.map(function(d){
        var on=d.match.test(path), mark=on?' class="on" aria-current="page"':'';
        var an=d.pill+' — '+d.label, ic='<svg '+ATTRS+' data-icon="'+d.icon+'">'+ICONS[d.icon]+'</svg>';
        var pill='<span class="kb-l">'+d.pill+'</span>';
        if(d.home) return '<a href="'+d.href+'" id="kb-home" aria-label="'+an+'"'+mark+'>'+ic+pill+'</a>';
        return '<a href="'+d.href+'" aria-label="'+an+'"'+mark+' style="color:'+d.tint+';filter:drop-shadow(0 0 5px '+d.glow+')">'+ic+pill+'</a>';
      }).join('');
      document.body.appendChild(bn);
      var publish=function(){ var h=Math.round(bn.getBoundingClientRect().height);
        if(h>0 && h<=96) document.documentElement.style.setProperty('--kil-bnav-h', h+'px'); };
      publish(); window.addEventListener('resize', publish);
    }catch(e){}
  }
  if(document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
