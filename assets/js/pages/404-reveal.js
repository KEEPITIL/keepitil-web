/* KEEPITIL 404.html: inline script "reveal" moved verbatim to an external file (CSP: no executable inline script). */
/* only reveal the 404 message if the router didn't redirect */
/* exactly one main landmark: the box that is revealed gets role=main (the FMW one is a div until then) */
if(document.documentElement.getAttribute('data-nomatch')){ var box=document.getElementById(document.documentElement.getAttribute('data-fmw') ? 'fmwfourohfour' : 'fourohfour'); box.setAttribute('role','main'); box.style.display='flex'; }
