/* KEEPITIL culture/index.html: inline script "supabase-cfg" moved verbatim to an external file (CSP: no executable inline script). */
(function(){
  var U='https://ovmqtzjfpzrbzrlkxwgw.supabase.co',
      K='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
  function fmtN(n){ n=Number(n)||0; return n>=1000 ? (n/1000).toFixed(n>=10000?0:1).replace(/\.0$/,'')+'K' : String(n); }
  function set(id,v){ var e=document.getElementById(id); if(e) e.textContent=fmtN(v); }
  fetch(U+'/rest/v1/rpc/culture_page_stats',{method:'POST',headers:{apikey:K,Authorization:'Bearer '+K,'Content-Type':'application/json'},body:'{}'})
    .then(function(r){ return r.ok?r.json():null; })
    .then(function(d){ var s=Array.isArray(d)?d[0]:d; if(!s)return; set('kA',s.articles); set('kP',s.photos); set('kV',s.videos); })
    .catch(function(){});
})();
