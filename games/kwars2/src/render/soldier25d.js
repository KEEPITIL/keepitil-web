/* KWARS2 2.5D SOLDIER  (window.KW2Soldier)
   Contract §6 / directive §38: a weapon is a rigid object held by a HAND; a
   shield is a rigid object supported by an ARM. Neither is a decorative layer.
   Richer perspective must not relax that, so the skeleton is built first and
   every piece of equipment is positioned FROM a joint -- never placed by eye.

   Draw order gives true side-view occlusion over solid fills:
     far leg -> weapon(inside arm) -> inside arm -> torso -> near leg
     -> cuirass -> outside arm -> shield -> head/helm
   The outside arm carries the shield; the inside arm carries the weapon. */
(function(){
  'use strict';
  const HEADS=7.5;                                  // Character Bible proportion
  const L={hip:3.30,waist:3.95,shoulder:5.55,neck:5.90,headR:0.50,
           upperArm:1.75,foreArm:1.75,thigh:1.85,shin:1.65};

  const PAL={body:'#12181f',metal:'#c9ab5e',bronze:'#b5822f',shield:'#b2873a',
             shieldRim:'#e3c579',cloth:'#7d2020',shadow:'rgba(0,0,0,.34)'};

  /* ---- anatomy: elbows flex forward only, knees backward only ---- */
  function arm(sh,a,el){
    const e=[sh[0]+Math.sin(a)*L.upperArm, sh[1]-Math.cos(a)*L.upperArm];
    const f=a+Math.max(0,el);                       // clamp: never reverses
    return {shoulder:sh,elbow:e,hand:[e[0]+Math.sin(f)*L.foreArm,e[1]-Math.cos(f)*L.foreArm],fore:f};
  }
  function leg(hip,a,kn){
    const k=[hip[0]+Math.sin(a)*L.thigh, hip[1]-Math.cos(a)*L.thigh];
    const s=a+Math.min(0,kn);                       // clamp: knee bends back only
    return {hip,knee:k,ankle:[k[0]+Math.sin(s)*L.shin,k[1]-Math.cos(s)*L.shin]};
  }
  function build(P){
    const hip=[0,L.hip], sh=[Math.sin(P.lean||0)*2.0,L.shoulder];
    const neck=[sh[0],L.neck], head=[neck[0]+Math.sin((P.lean||0)+(P.headTilt||0))*L.headR,L.neck+L.headR];
    return {hip,sh,neck,head,
      inArm:arm([sh[0]+0.06,sh[1]-0.05],P.inArm.sh,P.inArm.el),
      outArm:arm([sh[0]-0.05,sh[1]-0.05],P.outArm.sh,P.outArm.el),
      legFar:leg([hip[0]-0.03,hip[1]],P.legFar.hip,P.legFar.knee),
      legNear:leg([hip[0]+0.03,hip[1]],P.legNear.hip,P.legNear.knee)};
  }
  // Weapon axis derives from the FOREARM plus a wrist angle: it can never be
  // positioned independently of the arm holding it.
  function weaponAxis(J,wrist){
    const a=J.inArm.fore+(wrist||0);
    return {hand:J.inArm.hand,dir:[Math.sin(a),Math.cos(a)],ang:a};
  }
  // The shield rides the OUTSIDE forearm.
  function shieldCentre(J,push,lift){
    const e=J.outArm.elbow,h=J.outArm.hand;
    return [(e[0]+h[0])/2+(push||0.34),(e[1]+h[1])/2+(lift||-0.30)];
  }

  function limb(c,x0,y0,x1,y1,w0,w1,col){
    const dx=x1-x0,dy=y1-y0,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
    c.fillStyle=col;c.beginPath();
    c.moveTo(x0+nx*w0,y0+ny*w0);c.lineTo(x1+nx*w1,y1+ny*w1);
    c.lineTo(x1-nx*w1,y1-ny*w1);c.lineTo(x0-nx*w0,y0-ny*w0);c.closePath();c.fill();
  }
  const disc=(c,x,y,r,col)=>{c.fillStyle=col;c.beginPath();c.arc(x,y,r,0,7);c.fill();};

  /* kit describes what the soldier ACTUALLY carries right now. A null weapon or
     shield is simply not drawn -- that is how a broken shield stops existing. */
  function draw(ctx,P,kit,pxPerHead,ox,gy){
    const J=build(P);
    ctx.save();ctx.translate(ox,gy);ctx.scale(pxPerHead,-pxPerHead);

    // contact shadow grounds the figure in the 2.5D plane
    ctx.save();ctx.scale(1,-1);
    ctx.fillStyle=PAL.shadow;ctx.beginPath();ctx.ellipse(0,-0.06,0.95,0.22,0,0,7);ctx.fill();
    ctx.restore();

    const LF=J.legFar,LN=J.legNear;
    limb(ctx,LF.hip[0],LF.hip[1],LF.knee[0],LF.knee[1],0.150,0.122,PAL.body);
    limb(ctx,LF.knee[0],LF.knee[1],LF.ankle[0],LF.ankle[1],0.122,0.092,PAL.body);

    let weapon=null,shield=null;
    if(kit.weapon){                                  // drawn BEHIND the body
      const W=weaponAxis(J,kit.wrist);
      const fwd=kit.reachHeads||5.4,back=kit.backHeads||1.5;
      weapon={a:[W.hand[0]-W.dir[0]*back,W.hand[1]-W.dir[1]*back],
              b:[W.hand[0]+W.dir[0]*fwd,W.hand[1]+W.dir[1]*fwd]};
      if(kit.weaponKind==='ranged'){
        // a bow is held ACROSS the hand, not thrust forward
        ctx.strokeStyle=PAL.bronze;ctx.lineWidth=0.085;ctx.beginPath();
        ctx.arc(W.hand[0],W.hand[1],0.85,W.ang-1.1,W.ang+1.1);ctx.stroke();
      } else {
        limb(ctx,weapon.a[0],weapon.a[1],weapon.b[0],weapon.b[1],0.055,0.040,PAL.bronze);
        if(kit.weaponKind==='long'){                  // spearhead
          limb(ctx,weapon.b[0]-W.dir[0]*0.55,weapon.b[1]-W.dir[1]*0.55,weapon.b[0],weapon.b[1],0.115,0.012,PAL.metal);
        }
      }
    }
    // inside (weapon) arm, then torso, then near leg
    limb(ctx,J.inArm.shoulder[0],J.inArm.shoulder[1],J.inArm.elbow[0],J.inArm.elbow[1],0.118,0.100,PAL.body);
    limb(ctx,J.inArm.elbow[0],J.inArm.elbow[1],J.inArm.hand[0],J.inArm.hand[1],0.100,0.082,PAL.body);
    limb(ctx,J.hip[0],J.hip[1],J.sh[0],J.sh[1],0.300,0.330,PAL.body);
    limb(ctx,LN.hip[0],LN.hip[1],LN.knee[0],LN.knee[1],0.155,0.126,PAL.body);
    limb(ctx,LN.knee[0],LN.knee[1],LN.ankle[0],LN.ankle[1],0.126,0.095,PAL.body);
    if(kit.cuirass){
      ctx.fillStyle=kit.civColor||PAL.cloth;
      ctx.beginPath();ctx.moveTo(-0.34,L.waist);ctx.lineTo(0.34,L.waist);
      ctx.lineTo(0.40,L.shoulder-0.1);ctx.lineTo(-0.40,L.shoulder-0.1);ctx.closePath();ctx.fill();
    }
    // outside (shield) arm, then the shield ON it
    limb(ctx,J.outArm.shoulder[0],J.outArm.shoulder[1],J.outArm.elbow[0],J.outArm.elbow[1],0.118,0.100,PAL.body);
    limb(ctx,J.outArm.elbow[0],J.outArm.elbow[1],J.outArm.hand[0],J.outArm.hand[1],0.100,0.082,PAL.body);
    if(kit.shield){
      const [cx,cy]=shieldCentre(J,kit.shieldPush,kit.shieldLift);
      const r=kit.shieldR||1.95;
      shield={kind:'circle',cx,cy,r};
      disc(ctx,cx,cy,r,PAL.shield);
      ctx.strokeStyle=PAL.shieldRim;ctx.lineWidth=0.14;
      ctx.beginPath();ctx.arc(cx,cy,r-0.08,0,7);ctx.stroke();
      disc(ctx,cx,cy,r*0.20,PAL.shieldRim);
    }
    disc(ctx,J.head[0],J.head[1],L.headR,PAL.body);
    if(kit.helmet){
      ctx.fillStyle=kit.civColor||PAL.cloth;
      ctx.beginPath();ctx.arc(J.head[0],J.head[1]+0.05,L.headR*1.12,Math.PI,0);ctx.fill();
      if(kit.crest){ctx.fillStyle=kit.crestColor||PAL.cloth;
        ctx.beginPath();ctx.ellipse(J.head[0],J.head[1]+0.62,0.11,0.40,0,0,7);ctx.fill();}
    }
    ctx.restore();
    return {J,weapon,shield};
  }

  window.KW2Soldier=Object.freeze({HEADS,L,PAL,build,draw,weaponAxis,shieldCentre,arm,leg});
})();
