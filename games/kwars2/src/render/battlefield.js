/* KWARS2 2.5D BATTLEFIELD  (window.KW2Field)
   Directive §15/§20/§32: real depth planes, parallax, depth-scaled actors, a
   camera that frames the fight. Readability wins over decoration -- the
   foreground never hides a combat unit. */
(function(){
  'use strict';
  const DP=window.KW2Depth, SOL=window.KW2Soldier, POSE=window.KW2Poses, R=window.KW2Roles;
  const GROUND=430;

  const cam={x:0,y:0,zoom:1,mode:'FIXED',targetX:0,targetZoom:1,shake:0};
  let viewScale=1;   // set each frame from viewport height

  function resize(cv){
    const dpr=Math.min(2,window.devicePixelRatio||1);
    const w=cv.clientWidth||window.innerWidth, h=cv.clientHeight||window.innerHeight;
    cv.width=Math.round(w*dpr); cv.height=Math.round(h*dpr);
    return {w,h,dpr};
  }

  /* ---- camera: frames the contact line, bounded, eased, never lurching ---- */
  function updateCamera(S,view,dt){
    const live=S.units.filter(u=>!u.dead);
    let focus=(S.playerFort.x+S.enemyFort.x)/2;
    if(live.length){
      const ps=live.filter(u=>u.team===1), es=live.filter(u=>u.team===-1);
      if(ps.length&&es.length){
        const pf=Math.max(...ps.map(u=>u.x)), ef=Math.min(...es.map(u=>u.x));
        focus=(pf+ef)/2;                                  // the contact line
      } else focus=live.reduce((a,u)=>a+u.x,0)/live.length;
    }
    // a giant or boss pulls the frame toward it
    const big=live.find(u=>u.giant||u.boss);
    if(big)focus=focus*0.45+big.x*0.55;
    cam.targetX=focus-view.w/(2*cam.zoom);
    const maxX=Math.max(0,2400-view.w/cam.zoom);
    cam.targetX=Math.min(maxX,Math.max(0,cam.targetX));
    const ease=cam.mode==='FIXED'?4.2:2.6;                // FIXED tracks tighter
    // A large delta means the battle just started or jumped; easing across it
    // would leave the army off-screen for seconds. Snap, then ease.
    if(Math.abs(cam.targetX-cam.x)>view.w*0.9||cam.snap){cam.x=cam.targetX;cam.snap=false;}
    else cam.x+=(cam.targetX-cam.x)*Math.min(1,ease*dt);
    cam.zoom+=(cam.targetZoom-cam.zoom)*Math.min(1,3*dt);
    cam.y=GROUND-view.h*0.62;
    if(cam.shake>0){cam.shake=Math.max(0,cam.shake-dt*2.4);}
  }
  const shake=a=>{cam.shake=Math.min(1,cam.shake+a);};

  /* ---- planes ---- */
  function sky(c,view,civ){
    const g=c.createLinearGradient(0,0,0,view.h);
    const p=civ.palette||['#e8dfc8','#b58a35','#31558a'];
    g.addColorStop(0,'#16283c');g.addColorStop(0.50,'#2d4a63');g.addColorStop(1,'#6b7f8c');
    c.fillStyle=g;c.fillRect(0,0,view.w,view.h);
    // low sun glow
    const s=c.createRadialGradient(view.w*0.72,view.h*0.30,0,view.w*0.72,view.h*0.30,view.h*0.55);
    s.addColorStop(0,'rgba(255,214,150,.46)');s.addColorStop(1,'rgba(255,214,140,0)');
    c.fillStyle=s;c.fillRect(0,0,view.w,view.h);
  }
  // Parallax ridges: the further the plane, the slower it tracks the camera.
  function ridges(c,view){
    const bands=[{f:0.08,y:0.46,col:'#1a2a3a'},
                 {f:0.16,y:0.54,col:'#1e3242'},
                 {f:0.30,y:0.61,col:'#243c48'},
                 {f:0.48,y:0.67,col:'#2b4750'}];
    for(const b of bands){
      const off=-cam.x*b.f;
      c.fillStyle=b.col;c.beginPath();
      c.moveTo(0,view.h);
      for(let x=-200;x<view.w+200;x+=100){
        const yy=view.h*b.y+Math.sin((x-off)*0.0045)*38+Math.cos((x-off)*0.0021)*26;
        c.lineTo(x,yy);
      }
      c.lineTo(view.w,view.h);c.closePath();c.fill();
    }
    // aerial haze between the far hills and the field
    const hz=c.createLinearGradient(0,view.h*0.52,0,view.h*0.80);
    hz.addColorStop(0,'rgba(150,180,205,.16)');hz.addColorStop(1,'rgba(150,180,205,0)');
    c.fillStyle=hz;c.fillRect(0,view.h*0.52,view.w,view.h*0.30);
  }
  function ground(c,view){
    const gy=(GROUND-cam.y)*cam.zoom;
    const g=c.createLinearGradient(0,gy-60,0,view.h);
    g.addColorStop(0,'#5a6b45');g.addColorStop(0.35,'#45543492');g.addColorStop(1,'#232c1c');
    c.fillStyle=g;c.fillRect(0,gy-70,view.w,view.h-gy+70);
    // lane bands give the ground readable depth
    for(let i=0;i<DP.LANES;i++){
      const y=gy+DP.yOffsetAt(i)*cam.zoom;
      c.fillStyle=i%2?'rgba(255,255,255,.035)':'rgba(0,0,0,.070)';
      c.fillRect(0,y-6,view.w,12);
    }
  }
  function fortress(c,fort,civ,mirror,view){
    const F=civ.fortress||{}, wallH=F.wallH||120, towers=F.towers||2;
    const x=(fort.x-cam.x)*cam.zoom, gy=(GROUND-cam.y)*cam.zoom, s=cam.zoom;
    c.save();c.translate(x,gy);c.scale(mirror?-1:1,1);
    const marble='#cdbf9d', shade='#9c8e70', dark='#6f6553';
    // depth: back block, then face, then towers -- a solid volume, not a flat wall
    c.fillStyle=dark; c.fillRect(-52*s,-wallH*s*0.96,104*s,wallH*s*0.96);
    c.fillStyle=shade;c.fillRect(-44*s,-wallH*s,88*s,wallH*s);
    c.fillStyle=marble;c.fillRect(-38*s,-wallH*s*0.92,76*s,wallH*s*0.92);
    for(let i=0;i<towers;i++){
      const tx=(-30+i*60)*s;
      c.fillStyle=shade;c.fillRect(tx-13*s,-(wallH+34)*s,26*s,(wallH+34)*s);
      c.fillStyle=marble;c.fillRect(tx-10*s,-(wallH+30)*s,20*s,(wallH+30)*s);
      c.fillStyle=dark;for(let k=0;k<3;k++)c.fillRect(tx-9*s+k*7*s,-(wallH+28)*s,4*s,7*s);
    }
    const gw=(F.gateW||64)*0.5;
    c.fillStyle='#3a2f22';c.fillRect(-gw*0.5*s,-52*s,gw*s,52*s);
    c.fillStyle='rgba(0,0,0,.35)';c.fillRect(-gw*0.5*s,-52*s,gw*s,6*s);
    // damage reads on the structure itself
    const dmg=1-Math.max(0,fort.hp)/fort.max;
    if(dmg>0.05){c.fillStyle='rgba(0,0,0,.30)';
      for(let i=0;i<Math.floor(dmg*9);i++)c.fillRect((-34+i*9)*s,-(wallH*0.85-i*7)*s,7*s,12*s);}
    c.restore();
  }

  /* ---- actors ---- */
  function drawUnit(c,u,S){
    const lane=u.lane|0;
    const p=DP.project(u.x,GROUND,lane,cam);
    const depthScale=DP.scaleAt(lane);
    const headPx=(u.giant?2.1:1)*13.5*viewScale*(u.scale||1)*depthScale*cam.zoom;
    const clip=u.dead?'die':(u.anim==='attack'?'attack':(u.anim==='run'?'run':(u.anim==='march'?'march':(u.anim==='hit'?'hit':'idle'))));
    const dur=clip==='attack'?0.5:(clip==='die'?1.6:(clip==='run'?0.55:0.9));
    const t=((u.dead?u.deadT:u.animT)/dur)%1;
    const pose=POSE.pose(u.animSet||'sword',clip,t);

    // The kit is what the unit CURRENTLY carries -- a broken shield is simply
    // absent, and a dying soldier's weapon leaves his hand at the release frame.
    let kit={
      weapon:u.weapon, weaponKind:(R.weapon(u.weapon)||{}).kind||null,
      shield:u.shield, shieldR:1.95, wrist:R.isLong(u.weapon)?2.28:-0.85,
      reachHeads:R.isLong(u.weapon)?5.4:2.45, backHeads:R.isLong(u.weapon)?1.5:0.35,
      helmet:true, cuirass:true, crest:u.role==='HEAVY',
      civColor:(S.civ.palette||[])[1]||'#b58a35',
      crestColor:(S.civ.palette||[])[0]||'#e8dfc8'
    };
    kit=POSE.kitAt(u.animSet||'sword',clip,t,kit);

    c.save();
    c.translate(p.sx,p.sy);
    c.scale(u.face||1,1);
    if(u.dead)c.globalAlpha=Math.max(0,1-Math.max(0,u.deadT-1.1)/0.5);
    if(u.mount){                                   // platform under the rider
      const s=headPx;
      c.fillStyle='#4a3a2a';
      c.fillRect(-1.5*s,-2.3*s,3.2*s,1.15*s);
      c.fillRect(-1.2*s,-1.2*s,0.34*s,1.2*s); c.fillRect(1.1*s,-1.2*s,0.34*s,1.2*s);
      c.beginPath();c.arc(1.7*s,-2.15*s,0.52*s,0,7);c.fill();
      c.translate(0,-2.15*s);
    }
    try{ SOL.draw(c,pose,kit,headPx,0,0); }catch(e){}
    c.restore();

    // team tint + health, drawn in screen space so they stay readable
    if(!u.dead){
      const w=16*depthScale*cam.zoom;
      c.fillStyle=u.team===1?'rgba(120,200,255,.85)':'rgba(255,120,110,.85)';
      c.fillRect(p.sx-w/2,p.sy+4,w*(Math.max(0,u.hp)/u.hpMax),2.6*cam.zoom);
    }
  }
  function drawProjectile(c,p){
    const pr=DP.project(p.x,p.y,p.lane|0,cam);
    c.strokeStyle=p.team===1?'#dfe8f2':'#ffd0a0';
    c.lineWidth=1.6*cam.zoom;
    c.beginPath();c.moveTo(pr.sx,pr.sy);c.lineTo(pr.sx-Math.sign(p.vx)*9*cam.zoom,pr.sy-4*cam.zoom);c.stroke();
  }
  function drawFx(c,f){
    const pr=DP.project(f.x,f.y,f.lane|0,cam), a=1-f.t/0.5;
    if(f.type==='shieldBreak'){
      c.strokeStyle='rgba(255,220,140,'+a+')';c.lineWidth=2*cam.zoom;
      for(let i=0;i<5;i++){const ang=i*1.26+f.t*3;
        c.beginPath();c.moveTo(pr.sx,pr.sy-16*cam.zoom);
        c.lineTo(pr.sx+Math.cos(ang)*22*cam.zoom*f.t*2,pr.sy-16*cam.zoom+Math.sin(ang)*18*cam.zoom*f.t*2);c.stroke();}
    } else {
      c.fillStyle='rgba(255,235,190,'+a*0.8+')';
      c.beginPath();c.arc(pr.sx,pr.sy-18*cam.zoom,(3+f.t*16)*cam.zoom,0,7);c.fill();
    }
  }

  /* ---- frame ---- */
  function render(ctx,cv,S,dt){
    const view=resize(cv);
    // 7.5 heads tall at ~13% of viewport height, clamped so phones stay readable
    viewScale=Math.max(0.52,Math.min(1.35,view.h/760));
    const c=ctx; c.save();
    c.scale(view.dpr,view.dpr);
    updateCamera(S,view,dt);
    if(cam.shake>0){c.translate((Math.random()-0.5)*10*cam.shake,(Math.random()-0.5)*7*cam.shake);}

    sky(c,view,S.civ);
    ridges(c,view);
    ground(c,view);
    fortress(c,S.playerFort,S.civ,false,view);
    fortress(c,S.enemyFort,S.civ,true,view);

    // corpses sit under the living
    for(const k of S.corpses){
      const pr=DP.project(k.x,GROUND,k.lane|0,cam);
      c.fillStyle='rgba(20,26,32,.45)';
      c.beginPath();c.ellipse(pr.sx,pr.sy,11*cam.zoom,3.4*cam.zoom,0,0,7);c.fill();
    }
    // ONE stable sort for the whole combat plane (directive §32)
    const actors=[];
    for(const u of S.units)actors.push({__key:DP.key(DP.PLANE.COMBAT,u.lane|0,u.dead?-1:0,u.id&511),u,kind:'u'});
    for(const p of S.projectiles)actors.push({__key:DP.key(DP.PLANE.COMBAT,p.lane|0,1,0),p,kind:'p'});
    DP.sortActors(actors);
    for(const a of actors){ if(a.kind==='u')drawUnit(c,a.u,S); else drawProjectile(c,a.p); }
    for(const f of S.fx)drawFx(c,f);

    // foreground haze -- atmosphere only, never over the combat lanes
    const gy=(GROUND-cam.y)*cam.zoom;
    const h=c.createLinearGradient(0,gy+40,0,view.h);
    h.addColorStop(0,'rgba(10,16,22,0)');h.addColorStop(1,'rgba(10,16,22,.55)');
    c.fillStyle=h;c.fillRect(0,gy+40,view.w,view.h-gy-40);
    c.restore();
    return view;
  }
  window.KW2Field=Object.freeze({render,cam,shake,resize,GROUND,
    snap:()=>{cam.snap=true;},
    setMode:m=>{cam.mode=m;},setZoom:z=>{cam.targetZoom=Math.max(0.6,Math.min(1.8,z));}});
})();
