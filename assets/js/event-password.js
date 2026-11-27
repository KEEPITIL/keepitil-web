/* KEEPITIL event password overlay: moved verbatim out of event.html (and the 1,000 generated event pages) so the page needs no inline <script> (CSP).  */
/* password-protected events (V3.1): overlay until check_event_password passes. */
(function(){
  try{
    var q=new URLSearchParams(location.search); var slug=q.get('e'); if(!slug) return;
    var URL='https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
    var KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
    function rpc(fn,args){ return fetch(URL+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'},body:JSON.stringify(args)}).then(function(r){return r.json();}); }
    try{ if(sessionStorage.getItem('kil-pwok-'+slug)==='1') return; }catch(e){}
    rpc('event_requires_password',{p_slug:slug}).then(function(need){
      if(need!==true) return;
      var g=document.getElementById('kil-pwgate'); if(!g) return;
      g.style.display='flex';
      var go=function(){
        var pw=document.getElementById('kil-pw').value;
        rpc('check_event_password',{p_slug:slug,p_password:pw}).then(function(ok){
          if(ok===true){ try{sessionStorage.setItem('kil-pwok-'+slug,'1');}catch(e){} g.style.display='none'; }
          else document.getElementById('kil-pwerr').textContent='Wrong password — check with the host.';
        });
      };
      document.getElementById('kil-pwgo').addEventListener('click',go);
      document.getElementById('kil-pw').addEventListener('keydown',function(e){ if(e.key==='Enter') go(); });
    }).catch(function(){});
  }catch(e){}
})();
