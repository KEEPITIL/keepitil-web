/* KEEPITIL findmyweed-explore.html: inline script "view" moved verbatim to an external file (CSP: no executable inline script). */
if(window.KilActions) KilActions.allow(["showView"]);
function showView(v){
  document.getElementById('listPanel').style.display = v==='list' ? 'block' : 'none';
  document.getElementById('mapPanel').style.display = v==='map' ? 'block' : 'none';
  document.getElementById('btnList').classList.toggle('on', v==='list');
  document.getElementById('btnMap').classList.toggle('on', v==='map');
}
