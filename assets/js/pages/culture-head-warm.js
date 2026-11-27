/* KEEPITIL culture/index.html: inline script "head-warm" moved verbatim to an external file (CSP: no executable inline script). */
/* Warm the video connection only for visitors who did NOT send Global Privacy Control / Do Not Track (those get click-to-load and no early contact with Google). Same check as keepitil-shell.js (__kilOptedOut). */
(function(){var o=false;try{o=navigator.globalPrivacyControl===true||navigator.doNotTrack==='1'||navigator.doNotTrack==='yes'||window.doNotTrack==='1'||navigator.msDoNotTrack==='1';}catch(e){}
if(!o){['https://www.youtube-nocookie.com','https://i.ytimg.com'].forEach(function(h){var l=document.createElement('link');l.rel='preconnect';l.href=h;l.crossOrigin='';document.head.appendChild(l);});}
window.KIL_GPC=o;
/* GPC / DNT visitors: a video card's thumbnail is YouTube's own picture (i.ytimg.com), i.e. a request to Google for every card. Until they tap play they get our own default picture instead. */
window.kilVideoThumb=function(u){ try{ if(window.KIL_GPC && u){ var h=new window.URL(u,location.href).hostname; if(/(^|\.)(ytimg|youtube|youtube-nocookie|ggpht|googleusercontent)\.com$/i.test(h)) return ''; } }catch(e){} return u; };})();
