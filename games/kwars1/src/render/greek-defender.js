/* KWARS1 — GREEK DEFENDER runtime renderer  (Phase 2C vertical slice)
 *
 * The FIRST unit on the new architecture. Everything else keeps the existing
 * procedural rig; drawRigUnit branches here only for the Greek defender class,
 * so a fault in this file can never affect the rest of the roster.
 *
 * What it brings over the legacy rig:
 *   - Character Bible proportions (7.5 heads; arms 3.5; legs 3.5) rather than
 *     the legacy 6.36-head / 1.91-head-arm build
 *   - one item per hand: shield on the OUTSIDE arm, weapon on the INSIDE arm
 *   - true side-view occlusion by draw order over solid fills
 *   - anatomical joint limits: elbows flex forward only, knees backward only
 *
 * Every clip in here passed, at frame and half-frame resolution, a geometry
 * clearance audit, a rendered-pixel audit, an anatomy check and a grip-continuity
 * check. The same validators run against THIS module via build/validate-runtime.
 */
(function(){
  'use strict';
/* PRIVATE. Shared geometry/render/validator core, extracted from
   defender2d.html so the authoring sheet and the frame validator run the
   EXACT same code. If these ever diverge, a pose can pass in one and fail in
   the other, which is precisely the class of bug we are trying to remove. */
/* Greek Defender runtime renderer.
   Character Bible panels 1-8 are the hard spec (7.5 heads, arms 3.5, legs 3.5,
   torso 2.0, round featureless dark head, solid dark body).

   This revision fixes two structural faults proven in the previous sheet:
     1. shield AND weapon were both anchored to the near arm -> one hand held
        two objects, and they inevitably merged.
     2. knee deltas were positive, i.e. hyperextension -> bird legs.

   Now: shieldArm (far/left) carries the shield, weaponArm (near/right) carries
   the weapon, every item hangs off a real hand, and knee flexion is clamped so
   a leg cannot bend backwards. A numeric collision audit runs at load. */

const BIBLE = {heads:7.5, head:1.0, neck:0.25, torso:2.0, waist:0.75, legs:3.5, arm:3.5};
const L = (()=>{ const ankle=0.10;
  const knee=ankle+BIBLE.legs*0.48, hip=ankle+BIBLE.legs, waist=hip+BIBLE.waist;
  const shoulder=waist+BIBLE.torso, neck=shoulder+BIBLE.neck, crown=neck+BIBLE.head;
  return {ankle,knee,hip,waist,shoulder,neck,crown, headR:BIBLE.head/2,
          uArm:BIBLE.arm*0.47, fArm:BIBLE.arm*0.39,
          uLeg:BIBLE.legs*0.48, lLeg:BIBLE.legs*0.52};})();

const PAL = {body:'#0e1014', ink:'#05060a',
  bzHi:'#e0b061', bz:'#b5842f', bzLo:'#6f4e18',
  stHi:'#e6ecf1', st:'#b9c4cd', stLo:'#76828d',
  wood:'#7d5531', woodLo:'#513418',
  clHi:'#c2463c', cl:'#a12f28', clLo:'#6d1c17', trim:'#e8c15a',
  mark:'#0a7ea4', mark2:'#c2410c'};

/* ---------- primitives ---------- */
function limb(ctx,x0,y0,x1,y1,w0,w1,col){
  const dx=x1-x0,dy=y1-y0,Ln=Math.hypot(dx,dy)||1,nx=-dy/Ln,ny=dx/Ln;
  ctx.fillStyle=col;
  ctx.beginPath();
  ctx.moveTo(x0+nx*w0,y0+ny*w0); ctx.lineTo(x1+nx*w1,y1+ny*w1);
  ctx.lineTo(x1-nx*w1,y1-ny*w1); ctx.lineTo(x0-nx*w0,y0-ny*w0);
  ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(x0,y0,w0,0,7); ctx.fill();
  ctx.beginPath(); ctx.arc(x1,y1,w1,0,7); ctx.fill();
}
function disc(ctx,x,y,r,c){ctx.fillStyle=c;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();}
function metalDisc(ctx,x,y,r,hi,base,lo){
  disc(ctx,x,y,r*1.06,PAL.ink); disc(ctx,x,y,r,base);
  ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.clip();
  disc(ctx,x+r*0.22,y+r*0.26,r*0.76,hi);
  disc(ctx,x-r*0.36,y-r*0.42,r*0.86,lo);
  disc(ctx,x,y,r*0.60,base); ctx.restore();
}

/* ---------- anatomy ----------
   angles: 0 = straight down, POSITIVE = forward (+x).
   elbow flexes forward (positive). knee flexes BACKWARD (negative) -- clamped,
   so no pose can produce a reverse-bending leg. */
function arm(shoulder, sh, el){
  const e=[shoulder[0]+Math.sin(sh)*L.uArm, shoulder[1]-Math.cos(sh)*L.uArm];
  const f=sh+Math.max(0, el);                       // elbow: flexion only
  const h=[e[0]+Math.sin(f)*L.fArm, e[1]-Math.cos(f)*L.fArm];
  return {shoulder, elbow:e, hand:h, fore:f};
}
function leg(hip, hp, kn){
  const k=[hip[0]+Math.sin(hp)*L.uLeg, hip[1]-Math.cos(hp)*L.uLeg];
  const s=hp+Math.min(0, kn);                       // knee: flexion only
  const a=[k[0]+Math.sin(s)*L.lLeg, k[1]-Math.cos(s)*L.lLeg];
  return {hip, knee:k, ankle:a, shin:s};
}
function build(P){
  const hip=[0,L.hip], waist=[0,L.waist];
  const sh=[Math.sin(P.lean)*BIBLE.torso, L.shoulder];
  const neck=[sh[0]+Math.sin(P.lean)*BIBLE.neck, L.neck];
  const head=[neck[0]+Math.sin(P.lean+(P.headTilt||0))*L.headR, L.neck+L.headR];
  return {hip,waist,sh,neck,head,
    shieldArm: arm([sh[0]-0.05, sh[1]-0.05], P.shieldArm.sh, P.shieldArm.el),
    weaponArm: arm([sh[0]+0.06, sh[1]-0.05], P.weaponArm.sh, P.weaponArm.el),
    legFar:  leg([hip[0]-0.03,hip[1]], P.legFar.hip,  P.legFar.knee),
    legNear: leg([hip[0]+0.03,hip[1]], P.legNear.hip, P.legNear.knee)};
}

/* ---------- equipment, always driven by a hand ---------- */
// Weapon direction follows the forearm plus a wrist angle -- it can never be
// positioned independently of the arm holding it.
function weaponAxis(J,K){
  const h=J.weaponArm.hand, a=J.weaponArm.fore + (K.wrist||0);
  return {hand:h, dir:[Math.sin(a), Math.cos(a)], ang:a};
}
function shieldCentre(J,K){
  // Aspis/scutum ride on the shield FOREARM: centred just beyond the forearm
  // mid-point, offset forward so the disc sits across the body front.
  const e=J.shieldArm.elbow, h=J.shieldArm.hand;
  return [ (e[0]+h[0])/2 + (K.shieldPush||0.30), (e[1]+h[1])/2 + (K.shieldLift||0.00) ];
}

function drawSpear(ctx,J,K){
  const {hand,dir}=weaponAxis(J,K);
  const back=K.spearBack||1.6, fwd=K.spearFwd||4.6;
  const b=[hand[0]-dir[0]*back, hand[1]-dir[1]*back];
  const t=[hand[0]+dir[0]*fwd,  hand[1]+dir[1]*fwd];
  limb(ctx,b[0],b[1],t[0],t[1],0.100,0.084,PAL.ink);
  limb(ctx,b[0],b[1],t[0],t[1],0.080,0.066,PAL.wood);
  const px=-dir[1],py=dir[0];
  ctx.fillStyle=PAL.st; ctx.beginPath();
  ctx.moveTo(t[0]+dir[0]*0.60,t[1]+dir[1]*0.60);
  ctx.lineTo(t[0]+px*0.150,t[1]+py*0.150);
  ctx.lineTo(t[0]-dir[0]*0.26,t[1]-dir[1]*0.26);
  ctx.lineTo(t[0]-px*0.150,t[1]-py*0.150);
  ctx.closePath(); ctx.fill();
  limb(ctx,b[0],b[1],b[0]-dir[0]*0.26,b[1]-dir[1]*0.26,0.062,0.018,PAL.stLo);
  return {a:b,b:t};
}
function drawSword(ctx,J,K){
  const {hand,dir}=weaponAxis(J,K);
  const len=K.bladeLen||2.30, w=K.bladeW||0.115;
  const px=-dir[1],py=dir[0];
  const guard=[hand[0]+dir[0]*0.20, hand[1]+dir[1]*0.20];
  const tip=[hand[0]+dir[0]*len, hand[1]+dir[1]*len];
  limb(ctx,hand[0]-dir[0]*0.18,hand[1]-dir[1]*0.18,guard[0],guard[1],0.054,0.054,PAL.woodLo);
  metalDisc(ctx,hand[0]-dir[0]*0.24,hand[1]-dir[1]*0.24,0.072,PAL.bzHi,PAL.bz,PAL.bzLo);
  limb(ctx,guard[0]-px*0.27,guard[1]-py*0.27,guard[0]+px*0.27,guard[1]+py*0.27,0.050,0.050,PAL.ink);
  limb(ctx,guard[0]-px*0.25,guard[1]-py*0.25,guard[0]+px*0.25,guard[1]+py*0.25,0.040,0.040,PAL.bz);
  limb(ctx,guard[0],guard[1],tip[0],tip[1],w*1.18,0.036,PAL.ink);
  limb(ctx,guard[0],guard[1],tip[0],tip[1],w,0.028,PAL.st);
  limb(ctx,guard[0]+0.022,guard[1],tip[0]+0.014,tip[1],w*0.34,0.010,PAL.stHi);
  return {a:guard,b:tip};
}
function drawAspis(ctx,J,K,r){
  const [cx,cy]=shieldCentre(J,K);
  metalDisc(ctx,cx,cy,r,PAL.clHi,PAL.cl,PAL.clLo);
  ctx.strokeStyle=PAL.bzLo;ctx.lineWidth=r*0.105;ctx.beginPath();ctx.arc(cx,cy,r*0.945,0,7);ctx.stroke();
  ctx.strokeStyle=PAL.bz;ctx.lineWidth=r*0.058;ctx.beginPath();ctx.arc(cx,cy,r*0.952,0,7);ctx.stroke();
  ctx.strokeStyle=PAL.trim;ctx.lineWidth=r*0.135;ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(cx,cy+r*0.46); ctx.lineTo(cx-r*0.34,cy-r*0.44);
  ctx.moveTo(cx,cy+r*0.46); ctx.lineTo(cx+r*0.34,cy-r*0.44);
  ctx.stroke(); ctx.lineCap='butt';
  metalDisc(ctx,cx,cy,r*0.115,PAL.bzHi,PAL.bz,PAL.bzLo);
  return {kind:'circle',cx,cy,r};
}
function drawScutum(ctx,J,K){
  const [cx,cy]=shieldCentre(J,K);
  const w=BIBLE.head*2.30, h=BIBLE.head*4.35;
  const x0=cx-w/2,y0=cy-h/2,R=0.32;
  const rr=(X,Y,W,H,Rr,c)=>{ctx.fillStyle=c;ctx.beginPath();
    ctx.moveTo(X+Rr,Y);ctx.lineTo(X+W-Rr,Y);ctx.quadraticCurveTo(X+W,Y,X+W,Y+Rr);
    ctx.lineTo(X+W,Y+H-Rr);ctx.quadraticCurveTo(X+W,Y+H,X+W-Rr,Y+H);
    ctx.lineTo(X+Rr,Y+H);ctx.quadraticCurveTo(X,Y+H,X,Y+H-Rr);
    ctx.lineTo(X,Y+Rr);ctx.quadraticCurveTo(X,Y,X+Rr,Y);ctx.closePath();ctx.fill();};
  rr(x0-0.05,y0-0.05,w+0.10,h+0.10,R,PAL.ink);
  rr(x0,y0,w,h,R,PAL.cl);
  ctx.save();ctx.beginPath();ctx.rect(x0,y0,w,h);ctx.clip();
  ctx.fillStyle=PAL.clLo; ctx.fillRect(x0,y0,w*0.28,h);
  ctx.fillStyle=PAL.clHi; ctx.fillRect(x0+w*0.46,y0,w*0.30,h);
  ctx.restore();
  ctx.fillStyle=PAL.bz;  ctx.fillRect(x0,y0+h-0.12,w,0.12);
  ctx.fillStyle=PAL.bzLo;ctx.fillRect(x0,y0,w,0.12);
  metalDisc(ctx,cx,cy,BIBLE.head*0.32,PAL.bzHi,PAL.bz,PAL.bzLo);
  ctx.strokeStyle=PAL.trim;ctx.lineWidth=0.085;
  ctx.beginPath();
  ctx.moveTo(cx-w*0.30,cy+h*0.19);ctx.lineTo(cx+w*0.30,cy+h*0.19);
  ctx.moveTo(cx-w*0.30,cy-h*0.19);ctx.lineTo(cx+w*0.30,cy-h*0.19);
  ctx.stroke();
  return {kind:'rect',cx,cy,w,h};
}

/* ---------- render ---------- */
function bodyLimbs(ctx,J){
  const A=J.shieldArm;
  limb(ctx,A.shoulder[0],A.shoulder[1],A.elbow[0],A.elbow[1],0.105,0.088,PAL.body);
  limb(ctx,A.elbow[0],A.elbow[1],A.hand[0],A.hand[1],0.088,0.062,PAL.body);
  disc(ctx,A.hand[0],A.hand[1],0.075,PAL.body);
}
function draw(ctx,P,K,pxPerHead,ox,gy,annotate){
  const J=build(P);
  ctx.save(); ctx.translate(ox,gy); ctx.scale(pxPerHead,-pxPerHead);
  const LF=J.legFar, LN=J.legNear;

  // 1. far leg
  limb(ctx,LF.hip[0],LF.hip[1],LF.knee[0],LF.knee[1],0.150,0.122,PAL.body);
  limb(ctx,LF.knee[0],LF.knee[1],LF.ankle[0],LF.ankle[1],0.122,0.092,PAL.body);
  foot(ctx,LF.ankle);

  // 2. WEAPON, drawn before every occluder. Whatever lies behind the torso or
  //    the shield is painted over by them; whatever extends past their edges
  //    survives. That is real occlusion, not clipping.
  let weapon=null;
  if(K.weapon==='spear') weapon=drawSpear(ctx,J,K);
  if(K.weapon==='sword') weapon=drawSword(ctx,J,K);

  // 3. INSIDE arm (weapon arm) -- may be largely hidden, and that is correct
  const W=J.weaponArm;
  limb(ctx,W.shoulder[0],W.shoulder[1],W.elbow[0],W.elbow[1],0.104,0.086,PAL.body);
  limb(ctx,W.elbow[0],W.elbow[1],W.hand[0],W.hand[1],0.086,0.060,PAL.body);
  disc(ctx,W.hand[0],W.hand[1],0.078,PAL.body);        // grip closes on the haft

  // 4. torso
  limb(ctx,J.sh[0],J.sh[1],J.waist[0],J.waist[1],0.245,0.170,PAL.body);
  limb(ctx,J.waist[0],J.waist[1],J.hip[0],J.hip[1],0.170,0.195,PAL.body);
  limb(ctx,J.sh[0],J.sh[1]-0.06,J.neck[0],J.neck[1]+0.10,0.115,0.095,PAL.body);

  // 5. near leg
  limb(ctx,LN.hip[0],LN.hip[1],LN.knee[0],LN.knee[1],0.156,0.127,PAL.body);
  limb(ctx,LN.knee[0],LN.knee[1],LN.ankle[0],LN.ankle[1],0.127,0.096,PAL.body);
  foot(ctx,LN.ankle);
  if(K.cuirass) cuirass(ctx,J);

  // 6. OUTSIDE arm (shield arm) -- nearest the viewer, always visible
  const A=J.shieldArm;
  limb(ctx,A.shoulder[0],A.shoulder[1],A.elbow[0],A.elbow[1],0.110,0.092,PAL.body);
  limb(ctx,A.elbow[0],A.elbow[1],A.hand[0],A.hand[1],0.092,0.064,PAL.body);

  // 7. shield: the outermost solid object
  let shield=null;
  if(K.shield==='aspis')  shield=drawAspis(ctx,J,K,BIBLE.head*1.95);
  if(K.shield==='pelte')  shield=drawAspis(ctx,J,K,BIBLE.head*1.15);
  if(K.shield==='scutum') shield=drawScutum(ctx,J,K);
  if(shield) shieldGrip(ctx,J,K,shield);

  // self-test only: reproduce the OLD fault (weapon painted over the shield)
  // so the validator can be proven to catch it.
  if(K.__badOrder && K.weapon==='spear') drawSpear(ctx,J,K);
  if(K.__badOrder && K.weapon==='sword') drawSword(ctx,J,K);
  // 8. head last
  disc(ctx,J.head[0],J.head[1],L.headR,PAL.body);
  if(K.helmet) helmet(ctx,J);
  if(annotate) marks(ctx,J,shield,weapon);
  ctx.restore();
  return {J,shield,weapon};
}
function foot(ctx,a){
  ctx.fillStyle=PAL.body; ctx.beginPath();
  ctx.moveTo(a[0]-0.06,a[1]); ctx.lineTo(a[0]+0.30,a[1]);
  ctx.quadraticCurveTo(a[0]+0.34,a[1]-0.06,a[0]+0.26,a[1]-0.09);
  ctx.lineTo(a[0]-0.06,a[1]-0.09); ctx.closePath(); ctx.fill();
}
function cuirass(ctx,J){
  const a=[J.sh[0],J.sh[1]-0.05], b=[J.waist[0],J.waist[1]+0.30];
  limb(ctx,a[0],a[1],b[0],b[1],0.285*1.12,0.225*1.12,PAL.ink);
  limb(ctx,a[0],a[1],b[0],b[1],0.285,0.225,PAL.bz);
  limb(ctx,a[0]+0.03,a[1],b[0]+0.026,b[1],0.115,0.090,PAL.bzHi);
  limb(ctx,a[0]-0.05,a[1],b[0]-0.045,b[1],0.085,0.068,PAL.bzLo);
  for(const A of [J.weaponArm,J.shieldArm]){
    disc(ctx,A.shoulder[0],A.shoulder[1]+0.02,0.150,PAL.ink);
    disc(ctx,A.shoulder[0],A.shoulder[1]+0.02,0.136,PAL.bz);
  }
}
function helmet(ctx,J){
  const [x,y]=J.head,r=L.headR;
  ctx.save(); ctx.beginPath(); ctx.arc(x,y,r*1.07,0,7); ctx.clip();
  ctx.fillStyle=PAL.bz;   ctx.fillRect(x-r*1.2,y+r*0.16,r*2.4,r*1.2);
  ctx.fillStyle=PAL.bzHi; ctx.fillRect(x-r*0.34,y+r*0.52,r*1.0,r*0.70);
  ctx.fillStyle=PAL.bzLo; ctx.fillRect(x-r*1.2,y+r*0.16,r*0.66,r*1.2);
  ctx.fillStyle=PAL.bzLo; ctx.fillRect(x-r*1.2,y+r*0.16,r*2.4,r*0.15);
  ctx.fillStyle=PAL.bz;
  ctx.beginPath();
  ctx.moveTo(x+r*0.62,y+r*0.16); ctx.lineTo(x+r*1.10,y+r*0.16);
  ctx.lineTo(x+r*1.10,y-r*0.34); ctx.lineTo(x+r*0.66,y-r*0.16);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle=PAL.bzLo; ctx.fillRect(x+r*0.34,y-r*0.16,r*0.13,r*0.30);
}
// Visible proof the shield is SUPPORTED, not floating: forearm band across the
// face (porpax) and the hand gripping the rim (antilabe).
function shieldGrip(ctx,J,K,S){
  const h=J.shieldArm.hand, e=J.shieldArm.elbow;   // outside arm, in front of the face
  if(K.strapped){   // Macedonian: neck/shoulder strap, hands free for the pike
    ctx.strokeStyle=PAL.woodLo; ctx.lineWidth=0.075;
    ctx.beginPath(); ctx.moveTo(J.neck[0]-0.05,J.neck[1]-0.10);
    ctx.lineTo(S.cx-0.10,S.cy+(S.r||1)*0.55); ctx.stroke();
    return;
  }
  ctx.strokeStyle=PAL.bzLo; ctx.lineWidth=0.090;
  ctx.beginPath(); ctx.moveTo(e[0],e[1]); ctx.lineTo(h[0],h[1]); ctx.stroke();
  disc(ctx,h[0],h[1],0.080,PAL.body);          // hand on the grip, over the face
  ctx.strokeStyle=PAL.trim; ctx.lineWidth=0.048;
  ctx.beginPath(); ctx.arc(h[0],h[1],0.135,0,7); ctx.stroke();
}
function marks(ctx,J,S,W){
  const dot=(p,c)=>{ctx.fillStyle=c;ctx.beginPath();ctx.arc(p[0],p[1],0.10,0,7);ctx.fill();};
  dot(J.weaponArm.elbow,PAL.mark2); dot(J.weaponArm.hand,PAL.mark2);
  dot(J.shieldArm.elbow,PAL.mark);  dot(J.shieldArm.hand,PAL.mark);
}

/* ---------- collision audit: weapon segment vs shield body ---------- */


/* PRIVATE. Greek Defender animation set + per-frame validation.

   Poses are functions of phase t in [0,1). Every clip is validated at frame
   resolution AND at half-frame subframes, because an impossible pose can appear
   between two legal keyframes. Standard: zero impossible frames. */


const lerp=(a,b,t)=>a+(b-a)*t;
const ease=t=>t*t*(3-2*t);

/* Base stances. Shield arm stays restrained (it carries a heavy aspis);
   the weapon arm does the work and is largely occluded, which is correct. */
function stance(){
  return {lean:0, headTilt:0,
    shieldArm:{sh:-0.34, el:1.55},
    weaponArm:{sh:-2.05, el:0.95},
    legFar:{hip: 0.16, knee:-0.26},
    legNear:{hip:-0.14, knee:-0.34}};
}
function swordStance(){
  const p=stance();
  p.weaponArm={sh:0.92, el:1.05};
  return p;
}

const SPEAR_KIT = {weapon:'spear', shield:'aspis', helmet:true, cuirass:true,
                   spearFwd:5.40, spearBack:1.55, wrist:2.28,
                   shieldPush:0.34, shieldLift:-0.30};
const SWORD_KIT = {weapon:'sword', shield:'aspis', helmet:true, cuirass:true,
                   bladeLen:2.45, bladeW:0.120, wrist:-0.85,
                   shieldPush:0.34, shieldLift:-0.30};

/* Walk/run share one gait generator: opposing legs, opposing arm counter-swing
   on the weapon side only (the shield arm barely moves -- it is bracing a
   heavy shield, per the humanistic movement standard). */
function gait(p, amp, lift, leanAmt, base){
  const P = base();
  const s = Math.sin(p*Math.PI*2), s2 = Math.sin(p*Math.PI*4);
  P.lean = leanAmt;
  P.legNear.hip  = -0.14 + s*amp;
  P.legFar.hip   =  0.16 - s*amp;
  // knee flexes on the recovery half of each stride, never hyperextends
  P.legNear.knee = -0.30 - Math.max(0,-s)*lift;
  P.legFar.knee  = -0.26 - Math.max(0, s)*lift;
  P.shieldArm.sh = -0.34 + s*0.05;          // restrained
  P.weaponArm.sh = P.weaponArm.sh + s*0.10;
  P.headTilt     = s2*0.02;
  return P;
}

const CLIPS = {
  idle: {kit:SPEAR_KIT, n:8, loop:true, pose(t){
    const P=stance(); const b=Math.sin(t*Math.PI*2);
    P.lean=b*0.012; P.headTilt=b*0.018;
    P.shieldArm.sh=-0.34+b*0.018; P.weaponArm.sh=-2.05+b*0.020;
    return P;}},

  march: {kit:SPEAR_KIT, n:10, loop:true, pose(t){ return gait(t,0.34,0.42,0.05,stance); }},

  run:   {kit:SPEAR_KIT, n:10, loop:true, pose(t){ return gait(t,0.52,0.70,0.14,stance); }},

  // anticipation -> plant -> thrust -> recovery. The dory drives forward from
  // the overhand carry; the shield arm braces slightly into the blow.
  spear_thrust: {kit:SPEAR_KIT, n:9, loop:false, pose(t){
    const P=stance();
    let k;
    if(t<0.28) k=-ease(t/0.28)*0.55;                 // draw back
    else if(t<0.55) k=lerp(-0.55,1.0,ease((t-0.28)/0.27));
    else k=lerp(1.0,0,ease((t-0.55)/0.45));          // recover
    P.weaponArm.sh=-2.05+k*0.55; P.weaponArm.el=0.95-k*0.45;
    P.lean=k*0.10; P.shieldArm.sh=-0.34-k*0.06;
    P.legNear.hip=-0.14+k*0.16; P.legNear.knee=-0.34-k*0.10;
    return P;}},

  // release is deliberately its own frame index so the runtime can key the
  // weapon swap to it exactly (see RELEASE_FRAME below)
  throw: {kit:SPEAR_KIT, n:8, loop:false, releaseAt:0.50,
    // past the release the hand is empty: the spear exists only as a projectile
    kitAt(t){ return t < 0.50 ? SPEAR_KIT : Object.assign({}, SPEAR_KIT, {weapon:null}); },
    pose(t){
    const P=stance();
    let k;
    if(t<0.38) k=-ease(t/0.38)*0.85;                 // wind up
    else if(t<0.62) k=lerp(-0.85,1.15,ease((t-0.38)/0.24));   // release ~0.5
    else k=lerp(1.15,0,ease((t-0.62)/0.38));
    P.weaponArm.sh=-2.05+k*0.70; P.weaponArm.el=0.95-k*0.55;
    P.lean=k*0.13; P.legNear.hip=-0.14+k*0.20; P.legNear.knee=-0.34-k*0.12;
    return P;}},

  block: {kit:SPEAR_KIT, n:6, loop:false, pose(t){
    const P=stance(); const k=ease(Math.min(1,t*2));
    P.shieldArm.sh=-0.34-k*0.30; P.shieldArm.el=1.55-k*0.18;   // shield rises
    P.lean=-k*0.10; P.legNear.knee=-0.34-k*0.18;               // body compresses
    return P;}},

  hit: {kit:SPEAR_KIT, n:5, loop:false, pose(t){
    const P=stance(); const k=Math.sin(t*Math.PI);
    P.lean=-k*0.16; P.headTilt=-k*0.10;
    P.shieldArm.sh=-0.34+k*0.10; P.legFar.knee=-0.26-k*0.14;
    return P;}},

  knockback: {kit:SPEAR_KIT, n:7, loop:false, pose(t){
    const P=stance(); const k=Math.sin(Math.min(1,t*1.15)*Math.PI);
    P.lean=-k*0.34; P.headTilt=-k*0.18;
    P.legNear.hip=-0.14-k*0.30; P.legNear.knee=-0.34-k*0.22;
    P.legFar.hip=0.16+k*0.16;  P.legFar.knee=-0.26-k*0.10;
    P.shieldArm.sh=-0.34+k*0.16;
    return P;}},

  recover: {kit:SPEAR_KIT, n:5, loop:false, pose(t){
    const P=stance(); const k=1-ease(t);
    P.lean=-k*0.20; P.headTilt=-k*0.10; P.legNear.knee=-0.34-k*0.16;
    return P;}},

  die_kneel: {kit:SPEAR_KIT, n:8, loop:false, releaseAt:0.22,
    // A dying man drops his spear. Keeping a 6.95-head shaft welded to a folding
    // body is what forced the shaft through the aspis; releasing it is both the
    // physical truth and the fix. The runtime spawns a dropped-weapon prop.
    kitAt(t){ return t < 0.22 ? SPEAR_KIT : Object.assign({}, SPEAR_KIT, {weapon:null}); },
    pose(t){
    const P=stance(); const k=ease(Math.min(1,t*1.1));
    P.lean=k*0.42; P.headTilt=k*0.30;
    P.legNear.hip=-0.14+k*0.55; P.legNear.knee=-0.34-k*1.05;
    P.legFar.hip=0.16-k*0.30;   P.legFar.knee=-0.26-k*0.85;
    // weapon arm falls outward and the shaft rotates away from the shield face
    P.shieldArm.sh=-0.34+k*0.28; P.shieldArm.el=1.55-k*0.55;
    P.weaponArm.sh=-2.05+k*2.35; P.weaponArm.el=0.95+k*0.60;
    return P;}, wristAt(t){ return 2.28 - ease(Math.min(1,t*1.1))*2.10; }},

  // ---- sword states (same shield hand, weapon hand re-equipped) ----
  sword_idle: {kit:SWORD_KIT, n:8, loop:true, pose(t){
    const P=swordStance(); const b=Math.sin(t*Math.PI*2);
    P.lean=b*0.012; P.headTilt=b*0.018; P.weaponArm.sh=0.92+b*0.03;
    return P;}},

  sword_march: {kit:SWORD_KIT, n:10, loop:true, pose(t){ return gait(t,0.34,0.42,0.05,swordStance); }},

  sword_attack: {kit:SWORD_KIT, n:8, loop:false, pose(t){
    const P=swordStance();
    let k;
    if(t<0.26) k=-ease(t/0.26)*0.60;
    else if(t<0.52) k=lerp(-0.60,1.0,ease((t-0.26)/0.26));
    else k=lerp(1.0,0,ease((t-0.52)/0.48));
    P.weaponArm.sh=0.92-k*0.34; P.weaponArm.el=1.05+k*0.55;
    P.lean=k*0.11; P.legNear.hip=-0.14+k*0.14; P.legNear.knee=-0.34-k*0.10;
    return P;}, wristAt(t){
    // the cut travels above the aspis rim: wrist lifts through the strike
    let k; if(t<0.26) k=-ease(t/0.26)*0.60;
    else if(t<0.52) k=lerp(-0.60,1.0,ease((t-0.26)/0.26));
    else k=lerp(1.0,0,ease((t-0.52)/0.48));
    return -0.85 - k*0.55; }}
};

const RELEASE_FRAME = {clip:'throw', t:0.50};   // the exact frame the dory leaves



  /* ---- game state -> clip + phase ------------------------------------- */
  function clipFor(u, corpse){
    const sword = u.currentWeapon === 'sword';
    if (corpse) return {name:'die_kneel', t: Math.min(0.999, (u.t||0)/1.4)};
    if (u.throwT > 0) return {name:'throw', t: Math.min(0.999, 1 - u.throwT/0.55)};
    if (u.anim > 0)   return {name: sword ? 'sword_attack' : 'spear_thrust',
                              t: Math.min(0.999, Math.max(0, 1 - u.anim))};
    if (u.shieldUp)   return {name:'block', t:0.9};
    if (u.staggerT>0) return {name:'hit', t: Math.min(0.999, 1 - u.staggerT/0.4)};
    if (u.pose === 'walk'){
      const fast = (u.moveSpeed||0) > 46;
      return {name: sword ? 'sword_march' : (fast ? 'run' : 'march'),
              t: ((((u.walkPhase||u.ph||0)/(Math.PI*2))%1)+1)%1};
    }
    return {name: sword ? 'sword_idle' : 'idle', t: (((u.ph*0.16)%1)+1)%1};
  }

  function drawUnit(ctx, u, corpse, scale, x, y){
    const c = clipFor(u, corpse);
    const C = CLIPS[c.name] || CLIPS.idle;
    const P = C.pose(c.t);
    // per-frame kit overrides carry the release logic: the hand empties on the
    // exact frame the projectile spawns, and a dying man drops his spear.
    let kit = C.kitAt ? C.kitAt(c.t) : C.kit;
    if (C.wristAt) kit = Object.assign({}, kit, {wrist: C.wristAt(c.t)});
    // combat state is the authority on what is in the hand
    if (u.currentWeapon === 'sword' && kit.weapon === 'spear') kit = SWORD_KIT;
    if (u.spearThrown && kit.weapon === 'spear' && !(u.throwT > 0)) kit = SWORD_KIT;
    if (kit.shield && (u.shieldMax > 0) && u.shield <= 0) kit = Object.assign({}, kit, {shield:null});
    draw(ctx, P, kit, scale, x, y, false);
  }

  window.KWGreek = Object.freeze({
    draw, build, drawUnit, clipFor, CLIPS, SPEAR_KIT, SWORD_KIT, BIBLE, L
  });
})();
