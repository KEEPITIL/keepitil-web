/* §27-§31 KWARS TITLE SCENE — the cinematic backdrop behind the landing.
   -------------------------------------------------------------------------
   Built ONLY from KWARS production visuals: the same soldier rig the battle
   uses, plus terrain and fortress geometry drawn here. No third-party art of
   any kind reaches this file, and none ever may (docs/kwars-reference is
   REFERENCE ONLY and the build refuses the tree).

   §30 PERFORMANCE. This is menu decoration, not a battle. The composition --
   sky, ridge, fortress, formations, the foreground rank -- is painted ONCE
   into an offscreen canvas. The animation loop only blits that bitmap and
   lays a little drifting haze and dust over it, at 12fps, and stops entirely
   when the tab is hidden or the title screen is not on screen. */
(function(){
'use strict';
const GOLD='#ffe27a';
let host=null, cv=null, ctx=null, plate=null, raf=0, last=0, t=0, W=0, H=0, dpr=1;

function ridge(c,y,h,col,seed){
  c.fillStyle=col; c.beginPath(); c.moveTo(0,H);
  let x=0, s=seed;
  const rnd=()=>{ s=(s*1103515245+12345)&0x7fffffff; return s/0x7fffffff; };
  c.lineTo(0,y);
  while(x<W){ const step=W/14; x+=step; c.lineTo(x, y + (rnd()-0.5)*h); }
  c.lineTo(W,H); c.closePath(); c.fill();
}

function banner(c,x,y,h,col){
  c.strokeStyle='#2b2118'; c.lineWidth=2; c.beginPath(); c.moveTo(x,y); c.lineTo(x,y+h); c.stroke();
  c.fillStyle=col; c.beginPath(); c.moveTo(x,y+3); c.lineTo(x+13,y+7); c.lineTo(x+9,y+13); c.lineTo(x+13,y+19); c.lineTo(x,y+15);
  c.closePath(); c.fill();
}

function fortress(c,x,base,w,hh){
  c.fillStyle='#141d26';
  c.fillRect(x,base-hh,w,hh);                                  // curtain wall
  for(let i=0;i<Math.floor(w/26);i++) c.fillRect(x+i*26, base-hh-10, 15, 11);   // crenellations
  // flanking towers
  for(const tx of [x-18, x+w+3]){
    c.fillRect(tx, base-hh-26, 16, hh+26);
    for(let i=0;i<2;i++) c.fillRect(tx+i*9, base-hh-36, 7, 11);
  }
  c.fillStyle='rgba(255,226,122,.16)';                          // lit arrow slits
  for(let i=0;i<Math.floor(w/40);i++) c.fillRect(x+12+i*40, base-hh*0.55, 3, 9);
  banner(c, x+w*0.32, base-hh-34, 26, '#8e2f2f');
  banner(c, x+w*0.68, base-hh-34, 26, '#8e2f2f');
}

/* A rank of real KWARS soldiers, drawn near-silhouette so the type reads over
   them. Uses the production rig: what the player sees here is the army they
   will command, not marketing art. */
function rank(c, y, units, scale, alpha){
  const R=window.KWRig; if(!R) return;
  c.save(); c.globalAlpha=alpha;
  for(const u of units){
    const po=R.poseFor(u.cls, u.st, u.p, u.p*6, u.opt||{});
    po.era=5;
    c.save(); c.translate(u.x, y); c.scale(scale*(u.flip?-1:1), scale);
    const pal=R.teamTint(R.PAL[u.cls], u.team||1);
    try{ R.drawSoldier(c, u.cls, po, pal, u.team||1, u.cls); }catch(e){}
    c.restore();
  }
  c.restore();
}

function paintPlate(){
  plate=document.createElement('canvas');
  plate.width=W; plate.height=H;
  const c=plate.getContext('2d');

  // --- sky: dusk over a battlefield ---
  let g=c.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#0a1119'); g.addColorStop(0.45,'#16212b');
  g.addColorStop(0.78,'#3a3222'); g.addColorStop(1,'#120d09');
  c.fillStyle=g; c.fillRect(0,0,W,H);
  // low sun behind the horizon
  const hz=H*0.72;
  g=c.createRadialGradient(W*0.62,hz,0,W*0.62,hz,H*0.52);
  g.addColorStop(0,'rgba(255,196,92,.30)'); g.addColorStop(1,'rgba(255,196,92,0)');
  c.fillStyle=g; c.fillRect(0,0,W,H);

  // --- distant ridges ---
  ridge(c, H*0.60, H*0.05, '#0f1922', 7);
  ridge(c, H*0.66, H*0.035,'#0c141c', 31);

  // --- fortress on the right, distant opposing formation on the left ---
  fortress(c, W*0.68, hz+10, Math.max(130,W*0.26), Math.max(64,H*0.19));
  c.fillStyle='rgba(0,0,0,.35)';                               // the wall sits ON the ground
  c.fillRect(W*0.62, hz+6, Math.max(170,W*0.34), 8);
  c.fillStyle='rgba(8,12,16,.72)';
  for(let i=0;i<26;i++){                                       // far enemy line
    const x=W*0.06+i*(W*0.34/26), h=7+(i%3);
    c.fillRect(x, hz-h, 2.4, h);
    if(i%4===0) c.fillRect(x+0.6, hz-h-7, 1, 7);               // spears above the line
  }

  // --- ground ---
  g=c.createLinearGradient(0,hz,0,H);
  g.addColorStop(0,'#2a2418'); g.addColorStop(1,'#0b0906');
  c.fillStyle=g; c.fillRect(0,hz,W,H-hz);

  // --- haze band along the horizon ---
  g=c.createLinearGradient(0,hz-H*0.10,0,hz+H*0.06);
  g.addColorStop(0,'rgba(190,160,110,0)'); g.addColorStop(0.5,'rgba(190,160,110,.16)');
  g.addColorStop(1,'rgba(190,160,110,0)');
  c.fillStyle=g; c.fillRect(0,hz-H*0.10,W,H*0.16);

  /* --- our own line, a SILHOUETTE band low on the field ---
     First attempt drew this at ~0.9 scale full-brightness: the soldiers filled
     the lower third, their spears crossed the whole screen as horizontal bars,
     and they collided with the footer controls. They are scenery, so they are
     small, low, and sunk into shadow. */
  const s=Math.max(0.26, Math.min(0.40, H/2100));
  const y=hz + (H-hz)*0.86;
  rank(c, y, [
    {cls:'spear', st:'march', p:0.15, x:W*0.06},
    {cls:'sword', st:'idle',  p:0.30, x:W*0.17},
    {cls:'spear', st:'march', p:0.55, x:W*0.28},
    {cls:'bow',   st:'hold',  p:0.90, x:W*0.40},
    {cls:'sword', st:'idle',  p:0.12, x:W*0.52},
    {cls:'spear', st:'march', p:0.35, x:W*0.64},
    {cls:'sword', st:'idle',  p:0.70, x:W*0.76},
    {cls:'spear', st:'march', p:0.05, x:W*0.88}
  ], s, 0.85);
  // sink the rank into shadow so it reads as silhouette, never as UI
  g=c.createLinearGradient(0,hz+(H-hz)*0.30,0,H);
  g.addColorStop(0,'rgba(8,10,14,.30)'); g.addColorStop(0.55,'rgba(8,10,14,.74)');
  g.addColorStop(1,'rgba(6,8,11,.94)');
  c.fillStyle=g; c.fillRect(0,hz+(H-hz)*0.30,W,H);

  // --- vignette so the wordmark and buttons always win ---
  g=c.createRadialGradient(W/2,H*0.36,H*0.10,W/2,H*0.42,H*0.85);
  g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,.72)');
  c.fillStyle=g; c.fillRect(0,0,W,H);
  c.fillStyle='rgba(6,10,14,.34)'; c.fillRect(0,0,W,H*0.46);
}

function frame(now){
  raf=0;
  if(!visible()) return;
  if(now-last < 83){ raf=requestAnimationFrame(frame); return; }   // §30 ~12fps
  last=now; t+=0.016;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,H);
  if(plate) ctx.drawImage(plate,0,0,W,H);
  // drifting haze + slow dust: the only thing that actually animates
  const hz=H*0.72;
  ctx.save();
  const g=ctx.createLinearGradient(0,hz-H*0.14,0,hz+H*0.02);
  g.addColorStop(0,'rgba(210,180,130,0)');
  g.addColorStop(0.5,'rgba(210,180,130,'+(0.05+0.035*Math.sin(t*0.6))+')');
  g.addColorStop(1,'rgba(210,180,130,0)');
  ctx.fillStyle=g;
  ctx.fillRect(-40+((t*7)%80),hz-H*0.14,W+80,H*0.16);
  ctx.fillStyle='rgba(226,206,168,.20)';
  for(let i=0;i<22;i++){
    const ph=t*0.22+i*0.7;
    const x=((i*W/22)+Math.sin(ph)*16+W)%W;
    const y=hz-((ph*13)%(H*0.30));
    ctx.fillRect(x,y,1.5,1.5);
  }
  ctx.restore();
  raf=requestAnimationFrame(frame);
}

function visible(){
  return !document.hidden && host && !host.classList.contains('hidden')
         && host.offsetParent!==null;
}
function start(){ if(!raf && visible()){ last=0; raf=requestAnimationFrame(frame); } }
function stop(){ if(raf){ cancelAnimationFrame(raf); raf=0; } }

function size(){
  if(!cv) return;
  dpr=Math.min(2, window.devicePixelRatio||1);
  const r=host.getBoundingClientRect();
  W=Math.max(320, Math.round(r.width)); H=Math.max(360, Math.round(r.height));
  cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr);
  cv.style.width=W+'px'; cv.style.height=H+'px';
  ctx=cv.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
  paintPlate();
  if(raf){ stop(); start(); } else { // paint one frame even while paused
    ctx.clearRect(0,0,W,H); if(plate) ctx.drawImage(plate,0,0,W,H);
  }
}

function init(){
  host=document.getElementById('title');
  if(!host || document.getElementById('titlescene')) return;
  cv=document.createElement('canvas');
  cv.id='titlescene'; cv.setAttribute('aria-hidden','true');
  host.insertBefore(cv, host.firstChild);
  size(); start();
  let rt=0;
  window.addEventListener('resize',()=>{ clearTimeout(rt); rt=setTimeout(size,180); });
  document.addEventListener('visibilitychange',()=>{ document.hidden?stop():start(); });
}

window.KWTitleScene={ init, start, stop, _size:size };
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
else init();
})();
