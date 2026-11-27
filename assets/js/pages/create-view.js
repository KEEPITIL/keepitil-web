/* KEEPITIL create/index.html: inline script "view" moved verbatim to an external file (CSP: no executable inline script). */
  /* A competition view (?c= / ?view=) owns the page: hide the hub there. vs-app.js changes views
     with history.pushState/replaceState (no reload), so re-check after every history change. */
  (function(){
    var h=document.getElementById('createHub'); if(!h) return;
    function sync(){ try{ var q=new URLSearchParams(location.search); h.hidden=!!(q.get('c')||q.get('view')); }catch(e){} }
    ['pushState','replaceState'].forEach(function(m){
      var orig=history[m]; if(typeof orig!=='function') return;
      history[m]=function(){ var r=orig.apply(this,arguments); sync(); return r; };
    });
    window.addEventListener('popstate',sync);
    sync();
  })();
  
