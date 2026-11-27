/* KEEPITIL findmyweed-directory.html: inline script "directory" moved verbatim to an external file (CSP: no executable inline script). */
var cat='all';
function apply(){
  var county=document.getElementById('county').value;
  document.querySelectorAll('#grid .card').forEach(function(c){
    var okCat=(cat==='all'||c.dataset.cat===cat);
    var okCo=(county==='all'||c.dataset.county===county||c.dataset.county==='all');
    c.style.display=(okCat&&okCo)?'block':'none';
  });
}
document.querySelectorAll('#chips .chip').forEach(function(ch){
  ch.addEventListener('click',function(){
    document.querySelectorAll('#chips .chip').forEach(function(x){x.classList.remove('on');});
    ch.classList.add('on'); cat=ch.dataset.cat; apply();
  });
});
document.getElementById('county').addEventListener('change',apply);
