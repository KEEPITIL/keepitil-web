/* Kingdom Wars — shared soldier motion rig (namespaced as window.KWRig to avoid collisions). */
window.KWRig=(function(){
/* =========================================================================
   SHARED SOLDIER RIG (consolidated) + live battle
   ========================================================================= */
const UP=-Math.PI/2, DN=Math.PI/2;
const L={spine:46,neck:7,headR:11,thigh:33,shin:32,foot:10,uarm:22,farm:20};
function fk(p,a,l){return [p[0]+Math.cos(a)*l,p[1]+Math.sin(a)*l];}
function ss(e0,e1,x){const t=Math.max(0,Math.min(1,(x-e0)/(e1-e0)));return t*t*(3-2*t);}
function lerp(a,b,t){return a+(b-a)*t;}
function shade(hex,amt){const n=parseInt(hex.slice(1),16);let r=(n>>16)&255,g=(n>>8)&255,b=n&255;const f=amt<0?0:255,p=Math.abs(amt);r=Math.round(r+(f-r)*p);g=Math.round(g+(f-g)*p);b=Math.round(b+(f-b)*p);return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);}
function cyl(ctx,x0,x1,base,lit){const g=ctx.createLinearGradient(x0,0,x1,0);g.addColorStop(0,shade(base,-.34));g.addColorStop(.5,shade(base,lit==null?.3:lit));g.addColorStop(1,shade(base,-.34));return g;}
function vg(ctx,y0,y1,a,b){const g=ctx.createLinearGradient(0,y0,0,y1);g.addColorStop(0,a);g.addColorStop(1,b);return g;}
function limb(ctx,a,b,wa,wb,col){const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(a[0]+nx*wa,a[1]+ny*wa);ctx.lineTo(b[0]+nx*wb,b[1]+ny*wb);ctx.lineTo(b[0]-nx*wb,b[1]-ny*wb);ctx.lineTo(a[0]-nx*wa,a[1]-ny*wa);ctx.closePath();ctx.fill();ctx.beginPath();ctx.arc(a[0],a[1],wa,0,7);ctx.fill();ctx.beginPath();ctx.arc(b[0],b[1],wb,0,7);ctx.fill();}
function poly(ctx,pts,fill,st,lw){ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(st){ctx.strokeStyle=st;ctx.lineWidth=lw||1;ctx.stroke();}}
function rot(pt,piv,a){const dx=pt[0]-piv[0],dy=pt[1]-piv[1];return [piv[0]+dx*Math.cos(a)-dy*Math.sin(a),piv[1]+dx*Math.sin(a)+dy*Math.cos(a)];}
function boot(ctx,an,toe,col){const dx=toe[0]-an[0],dy=toe[1]-an[1],a=Math.atan2(dy,dx),len=Math.hypot(dx,dy)||1;ctx.save();ctx.translate(an[0],an[1]);ctx.rotate(a);ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(-3,-4);ctx.lineTo(len+2,-2.2);ctx.quadraticCurveTo(len+4,1.2,len,3);ctx.lineTo(-3,3);ctx.closePath();ctx.fill();ctx.fillStyle=shade(col,-.4);ctx.fillRect(-3,2.4,len+4,1.6);ctx.restore();}
function hand(ctx,p,fore,col){const a=Math.atan2(p[1]-fore[1],p[0]-fore[0]);ctx.save();ctx.translate(p[0],p[1]);ctx.rotate(a);ctx.fillStyle=col;ctx.beginPath();ctx.ellipse(0.6,0,3,2.6,0,0,7);ctx.fill();ctx.restore();}
function greave(ctx,k,f,col){const dx=f[0]-k[0],dy=f[1]-k[1],len=Math.hypot(dx,dy)||1,a=Math.atan2(dy,dx);ctx.save();ctx.translate(k[0],k[1]);ctx.rotate(a);poly(ctx,[[2,-3.1],[len-2,-2.6],[len-2,2.6],[2,3.1]],vg(ctx,-3,3,shade(col,.4),shade(col,-.3)),null,0);ctx.restore();}
function head(ctx,J,C,bare){const [hx,hy]=J.head,r=L.headR,tilt=Math.atan2(J.head[1]-J.neck[1],J.head[0]-J.neck[0])+Math.PI/2;ctx.save();ctx.translate(hx,hy);ctx.rotate(tilt);
  ctx.fillStyle=shade(C.skin,-.4);ctx.beginPath();ctx.arc(0,0,r,0.15,Math.PI-0.15);ctx.fill();
  if(bare){ // armor depleted: helmet is gone, only the bare head remains
    ctx.fillStyle=shade(C.skin,.05);ctx.beginPath();ctx.arc(0,-0.5,r,Math.PI,Math.PI*2);ctx.fill();
    ctx.restore();return;
  }
  if(!ERA_HELM_DEFAULT.has(C._helm)){ drawHelm(ctx,r,C); ctx.restore(); return; }   // D-01 era headgear
  ctx.fillStyle=cyl(ctx,-r-1.5,r+1.5,C.metal,.32);ctx.strokeStyle=shade(C.metal,-.5);ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,-0.5,r+1.4,Math.PI*0.95,Math.PI*2.05);ctx.fill();ctx.stroke();
  ctx.fillStyle=shade(C.metal,.6);ctx.beginPath();ctx.ellipse(-2.2,-2.4,1.7,4.2,-.3,0,7);ctx.fill();
  if(C.mohawk){
    // tall transverse Spartan crest (mohawk)
    ctx.fillStyle=shade(C.crest,-.35);ctx.beginPath();ctx.moveTo(-r*1.05,-r+2);ctx.quadraticCurveTo(0,-r-25,r*1.05,-r+2);ctx.quadraticCurveTo(0,-r-13,-r*1.05,-r+2);ctx.closePath();ctx.fill();
    ctx.fillStyle=C.crest;ctx.beginPath();ctx.moveTo(-r*0.9,-r+1.5);ctx.quadraticCurveTo(0,-r-22,r*0.9,-r+1.5);ctx.quadraticCurveTo(0,-r-12,-r*0.9,-r+1.5);ctx.closePath();ctx.fill();
    ctx.strokeStyle=shade(C.crest,.22);ctx.lineWidth=0.5;for(let i=-4;i<=4;i++){const hx=i*1.5;ctx.beginPath();ctx.moveTo(hx,-r-1);ctx.lineTo(hx,-r-18+Math.abs(i)*1.4);ctx.stroke();}
    ctx.fillStyle=shade(C.metal,.1);ctx.fillRect(-1.4,-r-1,2.8,2);
  } else if(C.crest && C._helm!=='galea'){ctx.fillStyle=shade(C.crest,-.25);ctx.fillRect(-1.4,-r-1,2.8,2);ctx.fillStyle=C.crest;ctx.beginPath();ctx.moveTo(-r*0.8,-r);ctx.quadraticCurveTo(0,-r-9,r*0.8,-r);ctx.quadraticCurveTo(r*0.5,-r-3.5,0,-r-3);ctx.quadraticCurveTo(-r*0.5,-r-3.5,-r*0.8,-r);ctx.closePath();ctx.fill();ctx.fillStyle=shade(C.crest,.15);ctx.beginPath();ctx.moveTo(-r*0.7,-r);ctx.quadraticCurveTo(0,-r-8,r*0.2,-r-3.5);ctx.lineTo(-r*0.2,-r-1);ctx.closePath();ctx.fill();}
  if(C.hat==='cap'){                                   // archer soft leather cap over the dome
    ctx.fillStyle=cyl(ctx,-r-1,r+1,C.leather,.22);ctx.beginPath();ctx.arc(0,-1,r+1.2,Math.PI*0.9,Math.PI*2.1);ctx.fill();
    ctx.fillStyle=shade(C.leather,.15);ctx.beginPath();ctx.ellipse(-2,-2.2,1.5,3.4,-.3,0,7);ctx.fill();
    ctx.fillStyle=shade(C.leather,-.35);ctx.fillRect(-r,1.4,2*r,1.5);
  } else if(C.hat==='tricorne'){                        // gunner three-cornered hat
    ctx.fillStyle=shade(C.leather,-.05);
    ctx.beginPath();ctx.moveTo(-r-2.5,-r+1.5);ctx.quadraticCurveTo(0,-r-1.5,r+2.5,-r+1.5);ctx.quadraticCurveTo(r*0.55,-r-6.5,0,-r-7);ctx.quadraticCurveTo(-r*0.55,-r-6.5,-r-2.5,-r+1.5);ctx.closePath();ctx.fill();
    ctx.strokeStyle=C.trim;ctx.lineWidth=0.8;ctx.stroke();
    ctx.fillStyle=shade(C.leather,.12);ctx.beginPath();ctx.moveTo(-r*0.5,-r-3);ctx.quadraticCurveTo(0,-r-6,r*0.5,-r-3);ctx.closePath();ctx.fill();
  }
  ctx.fillStyle=shade(C.metal,-.1);ctx.fillRect(-r,2.4,2*r,1.6);ctx.restore();}
function legPts(pv,g){const hip=DN-g.fwd,kn=DN-g.fwd+g.bend;const p1=fk(pv,hip,L.thigh),p2=fk(p1,kn,L.shin),p3=fk(p2,0.06+(g.tilt||0),L.foot);return [pv,p1,p2,p3];}
function armPts(sh,a){const up=DN-a.fwd,fo=DN-a.fwd-a.bend;const e=fk(sh,up,L.uarm),h=fk(e,fo,L.farm);return [sh,e,h];}
function build(po){
  const pv=[po.px,-(L.thigh+L.shin)+po.py];
  /* The spine carries the stride's counter-rotation, so the shoulders -- and
     everything hanging off them: shield, spear, both arms -- move with the gait
     instead of riding rigidly on top of moving legs (§7). */
  const roll=po.extra&&po.extra.shoulderRoll||0;
  const sh=fk(pv,UP+po.lean+roll,L.spine), nk=fk(sh,UP+po.lean*1.1+roll*0.5,L.neck),
        hd=fk(nk,UP+po.lean*1.1+po.headTilt,L.headR+2);
  return {pelvis:pv,shoulder:sh,neck:nk,head:hd,
    legF:legPts(pv,po.legF),legB:legPts(pv,po.legB),armF:armPts(sh,po.armN),armB:armPts(sh,po.armF2)};
}

// palettes per class
const PAL={
  sword:{skin:'#1b1b1d',metal:'#c6ccd2',trim:'#e8b23b',tunic:'#9e2b25',leather:'#6d4a2c',shield:'#9e2b25',crest:'#bb2f22',wood:'#7a4a24'},
  spear:{skin:'#1c1c1e',metal:'#c9a24a',trim:'#e8b23b',tunic:'#8f3f2c',leather:'#6d4a2c',shield:'#9e2b25',crest:'#a83828',wood:'#9a6a34',mohawk:true},
  bow:{skin:'#1c1c1e',metal:'#b7823a',trim:'#e8b23b',tunic:'#9a5a2c',leather:'#6d4a2c',wood:'#a9782f',hat:'cap'},
  gun:{skin:'#1c1c1e',metal:'#7c8790',trim:'#c7ccce',jacket:'#5c6446',leather:'#4f4436',wood:'#7a4a24',hat:'tricorne'}
};
function teamTint(C,team){ if(team===1)return C; const c={...C}; c.skin=shade(C.skin,0.86); return c; } // enemy lighter body

// ---------- POSES (per class + state) ----------
/* ARM CHANNEL SEMANTICS — see docs/kwars-reference/combat-golden/ARM-CHANNEL-MAP.md
   build() maps  po.armF2 -> J.armB  and  po.armN -> J.armF.
   The renderer draws the WEAPON from J.armB and the OFF-HAND from J.armF, so:

       po.armF2  IS THE WEAPON ARM   (spear, gladius, bow GRIP, rifle fore-end)
       po.armN   IS THE OFF ARM      (aspis, scutum, bow DRAW hand, trigger hand)

   The historic comments claiming the reverse are wrong. Which channel should
   carry an attack is per-weapon: a sword or spear moves the WEAPON hand, but a
   bow correctly moves the DRAW hand and a rifle the TRIGGER hand. */
const ARM={WEAPON:'armF2', OFF:'armN'};
function poseFor(cls,st,p,t,opt){
  const OPT=opt||{};
  const s=Math.sin(p*Math.PI*2), s2=Math.sin(p*Math.PI*4);
  let po={px:0,py:0,lean:0,headTilt:0,alpha:1,
    legF:{fwd:0.05,bend:0.16,tilt:0},legB:{fwd:-0.05,bend:0.16,tilt:0},
    armN:{fwd:0.3,bend:1.2},armF2:{fwd:0.4,bend:1.2},extra:{}};
  const walk=(amp,run)=>{const ml=(ps)=>({fwd:amp*ps,bend:0.18+Math.max(0,-ps)*0.8,tilt:Math.max(0,-ps)*0.4});
    po.legF=ml(s);po.legB=ml(-s);
    po.py=-Math.abs(s2)*(run?2.6:2.0);          // vertical bob on each footfall
    po.headTilt=-s*(run?0.06:0.04);             // head counter-sways to stay level (secondary motion)
    po.px=s*(run?1.3:0.55);                       // subtle weight-shift into each stride
    po.extra.stride=s;};
  if(st==='idle'){ const b=Math.sin(t*1.5), sway=Math.sin(t*0.8); po.py=b*0.9; po.lean=0.01+b*0.012; po.headTilt=sway*0.03; po.extra.breathe=b; }
  else if(st==='march'){ walk(0.24,false); po.lean=0.03; }        // tight formation steps, upright
  else if(st==='run'){ walk(0.54,true); po.lean=0.20; po.py-=1.4; } // long stride, leaning charge
  if(cls==='sword'){
    po.armF2={fwd:0.10,bend:1.32};         // WEAPON arm -> J.armB -> drawGladius
    po.armN ={fwd:0.28,bend:1.5};          // OFF arm    -> J.armF -> drawScutum
    if(st==='attack'){
      /* §6 SWORD STRIKE — a whole-body action, not an arm rotating on a statue.
         Owner rejection (build 60): the sword attack read as positional
         movement. The old pose moved `armN` and nothing else that matters: the
         torso never rotated, the hips never preloaded, the rear leg never
         drove, and the blade angle came only from `trail`. What follows is one
         chain -- rear foot -> hips -> torso -> shoulder -> elbow -> blade --
         so the strike has weight behind it.

         Two variations so repeated melee does not loop like a machine:
           0  DIAGONAL CUT   -- deeper wind-up over the shoulder, steeper arc
           1  ADVANCING CUT  -- shorter, flatter, more step into the target
         Both stay historically plausible; neither is acrobatic. */
      const v = OPT.swingVar ? 1 : 0;
      const ANTIC = v ? 0.20 : 0.26;          // wind-up ends
      const CONTACT = v ? 0.40 : 0.46;        // blade passes the target
      const wind = ss(0, ANTIC, p);                       // 0->1 loading
      const thr  = ss(ANTIC, CONTACT, p);                 // 0->1 driving
      const rec  = ss(CONTACT, v?0.80:0.88, p);           // 0->1 recovering
      const drive = thr * (1 - rec);                      // peaks at contact
      /* The wind-up must be UNWOUND by the recovery. `wind` is a smoothstep, so
         it saturates at 1 and stays there: every term built on it held its
         loaded value for the rest of the cycle, and the swing finished cocked
         back (armF2.fwd ended at -1.05 having started at 0.10) instead of at
         guard. The audit missed it because its blade formula was a stale copy
         of the pre-§9 independent angle -- it was measuring a sword that is no
         longer drawn. `set` is the load that recovery pays back. */
      const set = wind * (1 - rec);
      po.extra.swing = drive;
      po.extra.contact = ss(CONTACT-0.06,CONTACT,p) * (1-ss(CONTACT,CONTACT+0.10,p));

      // weight: rock back onto the rear foot, then drive through the front one
      po.px   = -set*(v?3.5:5) + drive*(v?15:12) - rec*2;
      po.py   = -set*1.2 + drive*(v?0.6:1.8);
      po.lean = -set*(v?0.05:0.08) + drive*(v?0.20:0.16);
      // hips + torso counter-rotate into the cut (build() feeds this to the spine)
      po.extra.shoulderRoll = -set*(v?0.06:0.10) + drive*(v?0.12:0.16);
      po.headTilt = drive*0.06;
      // legs: rear foot pushes, lead foot steps in and plants
      po.legF = {fwd: 0.05 + set*0.06 + drive*(v?0.52:0.34), bend: 0.16 + drive*0.10, tilt: 0};
      po.legB = {fwd: -0.05 - set*0.10 - drive*(v?0.30:0.22), bend: 0.18 + set*0.22 + drive*0.16, tilt: 0};
      // weapon arm: cocked back and bent, then extends through the target
      // the SWORD hand swings (armF2 = weapon arm), the shield tucks (armN)
      po.armF2 = {fwd: lerp(0.10, v?-0.62:-1.05, set) + drive*(v?2.30:2.75),
                  bend: lerp(1.32, v?1.62:1.92, set) - drive*(v?1.50:1.80)};
      po.armN  = {fwd: 0.28 - drive*0.14 + set*0.05, bend: 1.50 + drive*0.16};
      po.extra.trail = drive;
      po.extra.swingStyle = v;
    }
    else if(st==='shieldthrust'){
      /* §17-§19 SHIELD THRUST — GUARD -> PRELOAD -> DRIVE -> CONTACT ->
         FOLLOW-THROUGH -> RECOVERY -> GUARD.
         The drive is a body action: rear leg extends, hips arrive, torso and
         shoulder carry the shield. An arm extending on a static torso is
         exactly what was rejected.
         CHANNEL: the shield rides J.armF, which build() feeds from po.armN.
         This state used to drive po.armF2 -- the WEAPON arm -- so the thrust
         punched the SWORD forward while the shield was dragged BACKWARD
         (armN.fwd ran 0.10 -> -0.45 through the drive). Same inversion already
         fixed for spear and sword; fixed here too. */
      const pre  = ss(0,    0.24, p);              // load onto the rear foot
      const drv  = ss(0.24, 0.44, p);              // hips fire, lead foot steps
      const thru = ss(0.48, 0.60, p);              // stay committed past contact
      const rec  = ss(0.62, 0.95, p);              // catch the weight, re-guard
      const push = drv * (1 - rec);
      po.extra.shieldDrive = push;
      po.extra.contact = ss(0.42,0.48,p) * (1-ss(0.48,0.60,p));
      // centre of mass: back, decisively through, then caught and returned to guard
      po.px   = -pre*7 + push*20 + thru*2.5 + rec*4.5;   // ...and the preload is paid back
      po.py   =  pre*2.2 - push*1.4 - rec*2.2;     // sink, rise through the drive, settle
      po.lean = -pre*0.10 + push*0.26 + thru*0.05 + rec*0.05;
      po.extra.shoulderRoll = -pre*0.14 + push*0.30 + thru*0.04 + rec*0.10;
      po.headTilt = -pre*0.05 + push*0.08 + rec*0.05;
      // rear leg loads and extends; lead leg steps out, plants, then absorbs
      po.legB = {fwd: -0.10 - pre*0.30 + rec*0.30, bend: 0.20 + pre*0.55 - push*0.42 - rec*0.55, tilt: 0};
      po.legF = {fwd:  0.06 + pre*0.05 + push*0.62 + thru*0.06 - rec*0.11, bend: 0.18 + pre*0.22 + push*0.12 + thru*0.16 - rec*0.38, tilt: 0};
      // SHIELD arm (off hand): draws in under load, drives out as the last link,
      // then retracts to a defensive angle rather than snapping back.
      po.armN  = {fwd: 0.28 - pre*0.34 + push*1.55 + thru*0.08 + rec*0.26,
                  bend: 1.50 + pre*0.35 - push*1.05 - rec*0.35};
      // weapon arm counterbalances behind the body and returns combat-ready
      po.armF2 = {fwd: 0.10 - pre*0.20 - push*0.35 + rec*0.20,
                  bend: 1.32 + push*0.30};
      po.extra.brace = 1 - push;
    }
    else if(st==='overhead'){
      /* §4-§9 OVERHEAD — GUARD -> LOAD -> RAISE -> COMMIT -> CONTACT ->
         FOLLOW-THROUGH -> RECOVERY -> GUARD.
         It used to end slammed: extra.chop reached 1 at p=0.60 and simply held
         there for the remaining 40% of the cycle, so the unit stood with the
         blade buried in the ground until the state changed and the pose
         snapped. The recovery below is a real phase, not an ease-out. */
      const GUARD = 0.17;                           // chop value whose blade angle reads as guard
      const load  = ss(0,    0.14, p);              // feet settle, knees bend, hips preload
      const raise = ss(0.10, 0.34, p);              // shoulder lifts, elbow folds, sword cocks
      const slam  = ss(0.32, 0.56, p);              // commit: legs -> hips -> torso -> shoulder -> sword
      const thru  = ss(0.54, 0.66, p);              // follow through past the target plane
      const rec   = ss(0.68, 0.97, p);              // recover to a continuous guard
      po.extra.contact = ss(0.50,0.56,p) * (1-ss(0.56,0.66,p));
      let chop = GUARD*(1-raise);                   // guard -> fully cocked
      chop = chop + (1-chop)*slam;                  // -> slammed through
      chop = chop + (GUARD-chop)*rec;               // -> back to guard
      po.extra.chop = chop;
      po.py = -Math.sin(ss(0,0.58,p)*Math.PI)*20 + thru*3 - rec*3;   // leap, land, absorb
      po.px = ss(0.12,0.58,p)*20 + thru*3 - rec*4;                   // fly forward, then re-centre
      po.lean = 0.10 - load*0.10 + raise*0.02 + slam*0.30 + thru*0.06 - rec*0.28;
      po.extra.shoulderRoll = -raise*0.18 + slam*0.34 + thru*0.05 - rec*0.21;
      po.headTilt = -raise*0.06 + slam*0.10 - rec*0.04;
      po.legF={fwd: 0.12 - load*0.04 + raise*0.30 + slam*0.34 - rec*0.60,
               bend:0.22 + load*0.20 + raise*0.34 - slam*0.16 + thru*0.10 - rec*0.48, tilt:0};
      po.legB={fwd:-0.12 - load*0.06 - raise*0.14 - slam*0.22 + rec*0.42,
               bend:0.22 + load*0.24 + raise*0.36 - slam*0.24 + thru*0.08 - rec*0.44, tilt:0};
      /* Weapon hand: guard -> cocked ABOVE THE HEAD -> driven down through the
         target -> guard. The channel's sign is the opposite of what it reads
         like: a HIGH armF2.fwd raises the hand (fwd 2.45/bend 1.35 puts the
         forearm at -2.2 rad with the hand above the helmet), a low one drops
         it. The first attempt at this recovery drove fwd NEGATIVE to "cock
         back" and produced an overhead whose sword never left chest height --
         which the rendered strip caught and the geometry gate did not. */
      let aF = 0.60 + ( 2.45-0.60)*raise; aF = aF + ( 0.20-aF)*slam; aF = aF + ( 0.00-aF)*thru; aF = aF + (0.60-aF)*rec;
      let aB = 1.00 + ( 1.35-1.00)*raise; aB = aB + ( 0.96-aB)*slam; aB = aB + ( 0.84-aB)*thru; aB = aB + (1.00-aB)*rec;
      po.armF2={fwd:aF, bend:aB};
      // off hand stays a shield: tucked under the raise, braced on contact, back to guard
      po.armN ={fwd:0.28 - raise*0.14 + slam*0.12 - rec*0.10 + 0.02*thru,
                bend:1.46 + raise*0.14 - slam*0.12 + rec*0.10};
    }
    else if(st==='fury'){
      /* §12-§16 FURY — rapid multi-slash. The cadence and identity are
         unchanged; what was missing is the lower body. It used to hold
         legF/legB at fixed constants for the whole state, so an aggressive
         upper-body attack played on a frozen pelvis: the audit measured 4.0
         of travel at every lower-body joint. Each slash is now driven from
         the ground -- rear foot pushes, knees compress and extend, hips
         translate and the torso rotates -- while staying grounded: no flips,
         spins, jumps or lunges. */
      const sw    = Math.sin(p*Math.PI*6);
      const drive = 0.5 + 0.5*sw;                   // 1 = blow extended
      const load  = 1 - drive;                      // 1 = coiled between blows
      po.px   = 7 + drive*7;                        // hips translate into each blow
      po.py   = load*1.8;                           // sink on the load, rise through the strike
      po.lean = 0.06 + drive*0.16;
      po.extra.shoulderRoll = -0.10 + drive*0.30;   // torso rotates behind the arm
      po.headTilt = drive*0.06;
      // rear foot pushes and the lead foot catches: the stance works each strike
      po.legF={fwd: 0.18 + drive*0.30, bend: 0.30 + load*0.16 - drive*0.12, tilt:0};
      po.legB={fwd:-0.14 - drive*0.20, bend: 0.26 + load*0.34 - drive*0.14, tilt:0};
      po.armF2={fwd:lerp(0.1,1.5,drive),bend:lerp(1.3,0.3,drive)};  // weapon hand
      po.armN ={fwd:0.22 - drive*0.12, bend:1.44 + drive*0.12};      // off hand stays useful
      po.extra.trail=drive;                          // blade sweeps across the body
    }
  } else if(cls==='spear'){
    po.armF2={fwd:0.55,bend:0.85};         // WEAPON arm -> J.armB -> drawSpear
    po.armN ={fwd:0.5,bend:1.4};           // OFF arm    -> J.armF -> drawAspis
    po.extra.spearAng=-0.05;               // dory at waist level
    if(st==='march'){po.extra.brace=1;}             // phalanx: shield up, spear forward keeping distance
    if(st==='attack'){                               // dramatic stepping thrust
      const wind=ss(0,.2,p), thr=ss(.2,.44,p)*(1-ss(.52,.9,p));
      po.px = -wind*6 + thr*22;                      // rock back, drive forward
      po.lean = thr*0.16 - wind*0.05;
      po.legF={fwd:0.05+thr*0.55,bend:0.18,tilt:0};  // front foot steps in
      po.legB={fwd:-0.05-thr*0.35,bend:0.20+thr*0.2,tilt:0};
      /* CHANNEL NAMING IS INVERTED IN THIS RIG. build() maps po.armF2 -> J.armB,
         and the renderer draws the WEAPON from J.armB. So po.armF2 is the
         weapon arm and po.armN is the shield arm, despite the names. The thrust
         used to drive po.armN, which punched the SHIELD forward and left the
         dory welded to the body -- measured forward extension of the spear tip
         relative to the torso was exactly 0.0. It now drives the weapon arm. */
      po.armF2={fwd:lerp(0.5,1.55,thr)-wind*0.25,bend:lerp(0.85,0.32,thr)};
      po.armN ={fwd:0.5+thr*0.10, bend:1.4-thr*0.15};     // shield stays a shield
      po.extra.spearAng=-0.02; po.extra.brace=OPT.holdShield?1:1-thr;   // §14 DEFEND keeps the shield forward through the thrust
    }
    else if(st==='throw'){                           // overhead arch throw to the furthest enemy
      const wind=ss(0,.34,p), rel=ss(.34,.52,p), fly=ss(.52,1,p);
      po.px = -wind*4 + rel*20;
      po.lean = -wind*0.05 + rel*0.24;
      po.legF={fwd:0.05+rel*0.6,bend:0.18,tilt:0};
      po.legB={fwd:-0.1-rel*0.3,bend:0.22,tilt:0};
      po.armF2={fwd:lerp(-1.1,1.9,rel),bend:lerp(1.7,0.1,rel)};  // SPEAR hand cocks and hurls
      po.armN ={fwd:0.5-rel*0.15, bend:1.4+rel*0.10};            // shield stays a shield
      po.extra.spearAng=lerp(-2.0,-0.55,rel);        // over-shoulder cock -> launch angled upward
      po.extra.thrown=fly; po.extra.spearGone=p>0.52;
    }
  } else if(cls==='bow'){
    po.armF2={fwd:1.5,bend:0.12};          // bow arm (far, forward)
    po.armN ={fwd:0.3,bend:1.6};           // draw arm (near)
    po.extra.bowUp=1;
    if(st!=='march'&&st!=='run'){po.legF={fwd:0.34,bend:0.10,tilt:0};po.legB={fwd:-0.34,bend:0.18,tilt:0.12};} // braced archer stance
    if(st==='attack'){const pull=ss(.1,.5,p)*(1-ss(.6,.72,p));po.armN={fwd:lerp(0.3,-1.9,pull),bend:lerp(1.6,2.05,pull)};po.extra.nocked=pull>0.15&&pull<0.95;}
    else if(st==='hold'){
      /* §13 HELD DRAW. The owner asked for an archer that visibly WAITS at
         full draw for a target to enter range, instead of cycling draw/release
         into empty space. `p` is the approach into the anchor, not a shot
         clock: the release is decided by combat state, never by this reaching
         1. The stance is deliberately distinct from ARCHER_READY -- bow arm
         locked out, drawing elbow high and back, hand at the face. */
      const draw=ss(0,0.55,p);
      po.armF2={fwd:lerp(1.5,1.62,draw), bend:lerp(0.12,0.06,draw)};   // bow arm extends and locks
      po.armN ={fwd:lerp(0.3,-1.9,draw), bend:lerp(1.6,2.05,draw)};    // draw to anchor
      po.extra.nocked=true;                                            // arrow stays on the string
      po.extra.holding=draw;
      po.lean=0.03+draw*0.03;
      po.headTilt=0.05;
      po.legF={fwd:0.34,bend:0.10,tilt:0};                             // braced shooting stance
      po.legB={fwd:-0.34,bend:0.18,tilt:0.12};
      po.py=-draw*0.6;
    }
  } else if(cls==='gun'){
    po.armF2={fwd:1.44,bend:0.34};         // front hand
    po.armN ={fwd:0.66,bend:1.86};         // rear/trigger
    po.extra.rifle=1;
    if(st!=='march'&&st!=='run'){po.legF={fwd:0.42,bend:0.34,tilt:0};po.legB={fwd:-0.30,bend:0.55,tilt:0.16};po.py=3;} // low firing-line crouch (front leg planted, rear knee dropped)
    if(st==='attack'){
      // One aimed shot per attack: settle → muzzle flash + recoil → rack the bolt (reload) → back on aim.
      const fire = ss(.10,.18,p)*(1-ss(.18,.30,p));       // sharp flash spike
      const rack = ss(.34,.58,p)*(1-ss(.58,.86,p));       // trigger hand cycles the action
      po.px = -fire*4.5 + rack*1.4;                        // recoil kick back, small settle forward on rack
      po.lean = fire*0.07;
      po.extra.fire = fire;                                // drives the muzzle flash in drawRifle
      po.armN  = {fwd:0.66 - rack*0.55, bend:1.86 + rack*0.5};   // rear hand pulls the bolt back and returns
      po.armF2 = {fwd:1.44 - fire*0.12, bend:0.34 + fire*0.05};  // front hand absorbs the kick
      po.headTilt = 0.12 - fire*0.04;                      // cheek on the stock, tiny lift on the shot
    }
    else if(st!=='idle'&&st!=='march'){po.headTilt=0.1;}
  }
  /* §7 GAIT DRIVES THE WHOLE BODY, NOT JUST THE LEGS.
     Owner rejection 2026-09-14: soldiers "slide" while walking/marching/running.
     Cause: walk() animated legs, bob, head and weight-shift, but every class
     block then assigned CONSTANT arm poses -- so the shield, the spear and both
     arms were welded rigid for the entire cycle. On a hoplite, where the shield
     and dory are most of the silhouette, that reads as a cardboard cut-out on
     walking legs.
     Locomotion now modulates the arms the class already chose, contralaterally
     (near arm swings opposite the near leg), plus a shoulder roll and a small
     weapon-tip oscillation. A braced phalanx keeps it tight; a charge is loose.
     This adjusts the class pose rather than replacing it, so every stance,
     brace, attack and throw pose is preserved exactly. */
  /* §4 SHIELD BLOCK POSE. `blockRaise` is 0..1 from the unit's raise timer, so
     the shield travels into the projectile line over several frames instead of
     snapping. The shield arm lifts and crosses, the torso turns in behind it
     and the knees brace -- visibly different from the idle guard. */
  if(po.extra.blockRaise>0){
    const b=po.extra.blockRaise;
    po.armF2={fwd:(po.armF2.fwd)+b*0.95, bend:(po.armF2.bend)-b*0.55};
    po.armN ={fwd:(po.armN.fwd)-b*0.30, bend:(po.armN.bend)+b*0.35};
    po.lean += b*0.10;
    po.extra.shoulderRoll=(po.extra.shoulderRoll||0)+b*0.12;
    po.legF={fwd:(po.legF.fwd)-b*0.08, bend:(po.legF.bend)+b*0.20, tilt:po.legF.tilt||0};
    po.legB={fwd:(po.legB.fwd)-b*0.10, bend:(po.legB.bend)+b*0.24, tilt:po.legB.tilt||0};
    po.extra.brace=1;
    po.py += b*1.6;
  }
  /* Task F SHIELD RECOIL: a hit that lands on the shield drives it back into the body -- shield arm folds, torso and
     hips give a little, then recover over 0.18s. A block now reads as an impact, not a flag. */
  if(po.extra.blockRecoil>0){
    const r=po.extra.blockRecoil;
    po.armF2={fwd:po.armF2.fwd-r*0.22, bend:po.armF2.bend+r*0.38};
    po.lean -= r*0.14; po.px -= r*7; po.headTilt=(po.headTilt||0)-r*0.10;
    po.legF={fwd:po.legF.fwd+r*0.06, bend:po.legF.bend+r*0.12, tilt:po.legF.tilt||0};
  }
  if(po.extra.stride!==undefined && st!=='attack' && st!=='throw' && st!=='overhead' && st!=='fury'){
    const g=po.extra.stride;                 // -1..1, in phase with the front leg
    const run=(st==='run');
    const braced=!!po.extra.brace;
    // A braced shield wall keeps its shape; a charge swings freely.
    const amp = braced ? (run?0.13:0.075) : (run?0.34:0.17);
    po.armN  = {fwd:po.armN.fwd  - g*amp,        bend:po.armN.bend  + Math.max(0,g)*amp*0.55};
    po.armF2 = {fwd:po.armF2.fwd + g*amp*0.72,   bend:po.armF2.bend - g*amp*0.34};
    po.extra.shoulderRoll = g*(run?0.075:0.042);   // torso counter-rotates into each stride
    if(po.extra.spearAng!==undefined) po.extra.spearAng += g*(braced?0.022:0.055);
    po.extra.gait = g;
  }
  // ---- deaths ----
  if(st==='die_impale'){
    /* D-18: tip enters -> recoil -> fold around the shaft -> lose balance -> fall back -> settle. The embedded spear is
       drawn inside the body's rotation, so it stays attached through the whole fall. p spans 1.4 s. */
    const rec=ss(0,.12,p)*(1-ss(.12,.3,p)), fold=ss(.08,.36,p), fall=ss(.34,.74,p), bounce=Math.sin(Math.PI*ss(.74,.9,p))*(1-ss(.74,1,p));
    po.px=-7*ss(0,.12,p)-5*fall; po.lean=0.35*fold*(1-fall)-0.12*rec; po.headTilt=0.5*fold-0.3*rec;
    po.legF={fwd:0.05+0.25*fall,bend:0.16+0.9*fold*(1-fall*.6),tilt:0.3*fold};po.legB={fwd:-0.12,bend:0.16+1.1*fold*(1-fall*.5),tilt:0.4*fold};
    po.armN={fwd:0.55*fold+0.4*fall,bend:0.9-0.3*fall};po.armF2={fwd:0.6*fold+0.3*fall,bend:1.0-0.4*fall};
    po.py=fold*14*(1-fall)+fall*52-bounce*3; po.supine=fall; po.extra={impale:-0.18, dropGear:ss(.4,.7,p)};
  } else if(st==='die_kneel'){
    const q=ss(0,.45,p),sl=ss(.4,.96,p);po.py=q*30;po.lean=sl*0.3;po.headTilt=sl*0.6;
    po.legF={fwd:0.02,bend:0.16+1.4*q,tilt:0.5*q};po.legB={fwd:-0.1,bend:0.16+1.5*q,tilt:0.6*q};
    po.armN={fwd:0.3-sl*0.1,bend:0.85-sl*0.3};po.armF2={fwd:0.3,bend:0.9};po.extra={};
  } else if(st==='die_back'||st==='die_arrow'){
    const lay=ss(.24,.64,p),fly=ss(.05,.42,p);po.px=-(st==='die_arrow'?12:6)*fly;po.supine=lay;po.py=lay*55;po.headTilt=0.2;
    po.armN={fwd:0.7,bend:0.5};po.armF2={fwd:0.55,bend:0.55};po.legF={fwd:0.35,bend:0.4};po.legB={fwd:-0.1,bend:0.2};po.extra={dropGear:ss(.1,.4,p)};
    if(st==='die_arrow')po.extra.headArrow=1;
  }
  return po;
}

// ---------- CLASS DRAW ----------
/* §7 DORY GEOMETRY -- ONE SOURCE OF TRUTH.
   drawSpear() and drawSpearAheadOfShield() must agree exactly or the re-drawn
   forward segment lands in the wrong place; they used to carry duplicate magic
   numbers. Owner rejection 2026-09-14: the spear read as a twig in motion.
   The shaft length was defensible (190 units on a ~140-unit man is a real
   dory ratio) but only the last ~44 units cleared the shield rim, and at 2.5
   line-width that stub is a hairline at gameplay zoom. So the weapon is
   re-balanced FORWARD -- more reach ahead of the hand, less butt behind it --
   and thickened, which is what actually makes it legible while moving. */
const SPEAR={FWD:155, BACK:60, W:3.4, TIP:18, TIPW:5.2, SAUROTER:8};
function drawSpear(ctx,h,ang,C,X){const d=[Math.cos(ang),Math.sin(ang)];X=X||{};
  const G=X.spearGrip||0, FWD=SPEAR.FWD+G, BACK=Math.max(4,SPEAR.BACK-G);   // §10 rear-rank grip: hands slide back, the point projects
  const b=[h[0]-d[0]*BACK,h[1]-d[1]*BACK],tp=[h[0]+d[0]*FWD,h[1]+d[1]*FWD];
  ctx.strokeStyle=shade(C.wood,-.1);ctx.lineWidth=SPEAR.W;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(b[0],b[1]);
  if(X.spearStress>0){ /* §6 shaft under stress: a growing kink at 55% before it snaps */ const k=[h[0]+d[0]*FWD*0.55,h[1]+d[1]*FWD*0.55]; const bend=X.spearStress*0.45; const d2=[Math.cos(ang+bend),Math.sin(ang+bend)];
    ctx.lineTo(k[0],k[1]); ctx.lineTo(k[0]+d2[0]*FWD*0.45,k[1]+d2[1]*FWD*0.45); ctx.stroke();
    ctx.strokeStyle='#2a1a0c'; ctx.lineWidth=1.2; ctx.beginPath(); ctx.moveTo(k[0]-d[1]*3,k[1]+d[0]*3); ctx.lineTo(k[0]+d[1]*3,k[1]-d[0]*3); ctx.stroke(); return; }
  ctx.lineTo(tp[0],tp[1]);ctx.stroke();
  if(X.spearWear>=1){ /* §15 subtle wear marks: binding damage at light wear, a visible crack when critical */ ctx.strokeStyle='#2a1a0c'; ctx.lineWidth=1;
    for(const q of (X.spearWear>=2?[0.40,0.48,0.55]:[0.44])){ const m=[h[0]+d[0]*FWD*q,h[1]+d[1]*FWD*q]; ctx.beginPath(); ctx.moveTo(m[0]-d[1]*2.2,m[1]+d[0]*2.2); ctx.lineTo(m[0]+d[1]*2.2,m[1]-d[0]*2.2); ctx.stroke(); }
    if(X.spearWear>=2){ const m=[h[0]+d[0]*FWD*0.52,h[1]+d[1]*FWD*0.52]; ctx.strokeStyle='#d9c9a8'; ctx.beginPath(); ctx.moveTo(m[0]-d[0]*5,m[1]-d[1]*5); ctx.lineTo(m[0]+d[0]*5,m[1]+d[1]*5); ctx.stroke(); } }
  // bronze butt-spike (sauroter) at the rear
  ctx.strokeStyle=C.trim;ctx.lineWidth=SPEAR.W+0.6;ctx.beginPath();ctx.moveTo(b[0]-d[0]*SPEAR.SAUROTER,b[1]-d[1]*SPEAR.SAUROTER);ctx.lineTo(b[0]+d[0]*3,b[1]+d[1]*3);ctx.stroke();
  spearHead(ctx,tp,d,C);}
/* Leaf blade, drawn identically wherever the tip appears. */
function spearHead(ctx,tp,d,C){
  const nx=-d[1],ny=d[0],hb=[tp[0]-d[0]*SPEAR.TIP,tp[1]-d[1]*SPEAR.TIP];
  const k=C._head;   // D-01 era spearhead; the tip point (and so all spear geometry) is unchanged
  if(k&&k!=='iron'){
    const P=(t,o)=>[tp[0]-d[0]*t+nx*o,tp[1]-d[1]*t+ny*o];
    if(k==='stone'){poly(ctx,[P(0,0),P(7,4.6),P(13,5.4),P(18,3),P(18,-3),P(12,-5.6),P(6,-4.2)],'#6e6b64',shade('#6e6b64',-.45),0.7);ctx.strokeStyle='#c8b48a';ctx.lineWidth=1.6;ctx.beginPath();const a=P(17,4),b=P(17,-4);ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();return;}
    if(k==='bronze'){poly(ctx,[P(0,0),P(7,5.8),P(15,4.2),P(19,1.6),P(19,-1.6),P(15,-4.2),P(7,-5.8)],'#d4a44a',shade('#d4a44a',-.4),0.6);return;}
    if(k==='winged'){poly(ctx,[P(0,0),P(SPEAR.TIP,SPEAR.TIPW),P(SPEAR.TIP,-SPEAR.TIPW)],'#dfe4e8',shade('#dfe4e8',-.3),0.6);ctx.strokeStyle='#9ea4aa';ctx.lineWidth=2.2;ctx.beginPath();const a=P(SPEAR.TIP+3,6),b=P(SPEAR.TIP+3,-6);ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();return;}
    if(k==='yari'){poly(ctx,[P(0,0),P(22,2.4),P(24,0),P(22,-2.4)],'#e6eaee',shade('#e6eaee',-.35),0.6);return;}
    if(k==='pike'){poly(ctx,[P(0,0),P(11,2.6),P(14,0),P(11,-2.6)],'#dfe4e8',shade('#dfe4e8',-.35),0.6);ctx.strokeStyle='#9ea4aa';ctx.lineWidth=1.2;ctx.beginPath();const a=P(13,0),b=P(30,0);ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();return;}   // langets
    if(k==='bayonet'){ctx.strokeStyle='#cfd4d8';ctx.lineWidth=2;ctx.lineCap='round';ctx.beginPath();const a=P(0,0),b=P(22,0);ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();ctx.strokeStyle='#8a8f96';ctx.lineWidth=3.2;ctx.beginPath();const c=P(22,0),e=P(27,0);ctx.moveTo(c[0],c[1]);ctx.lineTo(e[0],e[1]);ctx.stroke();return;}
  }
  poly(ctx,[[tp[0],tp[1]],[hb[0]+nx*SPEAR.TIPW,hb[1]+ny*SPEAR.TIPW],[hb[0]-nx*SPEAR.TIPW,hb[1]-ny*SPEAR.TIPW]],'#dfe4e8',shade('#dfe4e8',-.3),0.6);
  // socket collar: reads as a real head rather than a paper dart at small scale
  ctx.strokeStyle=C.trim;ctx.lineWidth=SPEAR.W;ctx.beginPath();
  ctx.moveTo(hb[0],hb[1]);ctx.lineTo(hb[0]-d[0]*3,hb[1]-d[1]*3);ctx.stroke();}

/* §2/§13 SPEAR HEDGE. The aspis is drawn after the weapon arm, so the forward
   half of the dory was being painted over by the shield and the phalanx showed
   no spear points at all -- only the butt-spikes protruding backwards. A spear
   held on the far arm genuinely projects PAST the shield rim, and beyond that
   rim it is visible. So after the shield we re-draw only the segment that lies
   outside the shield disc. Nothing about the weapon's geometry or its reach
   changes; this only stops the shield from hiding what should be in front of it. */
function drawSpearAheadOfShield(ctx,J,po,C){
  if(po.supine||po.extra.impale||po.extra.spearGone||po.extra.spearStress>0)return;
  const ang=po.extra.spearAng||0, d=[Math.cos(ang),Math.sin(ang)];
  const h=J.armB[2], FWD=SPEAR.FWD+(po.extra.spearGrip||0);
  const tip=[h[0]+d[0]*FWD,h[1]+d[1]*FWD];
  const {cx,cy,R}=aspisDisc(J,po);
  /* Find where the shaft LAST leaves the shield disc. Scanning for the first
     clear point was wrong: the weapon hand sits on the far arm and is usually
     already outside the disc, so that scan returned t=0 and the guard below
     silently skipped every soldier -- which is why the first attempt at this
     drew nothing at all. */
  let tIn=-1;
  for(let t=0;t<=FWD;t+=3){
    const px=h[0]+d[0]*t, py=h[1]+d[1]*t;
    if(Math.hypot(px-cx,py-cy)<=R) tIn=t;
  }
  if(tIn<0) return;                 // shaft never crosses the shield: already visible
  const t0=Math.min(FWD,tIn+3);
  if(t0>=FWD) return;         // the disc swallows the whole shaft
  const a=[h[0]+d[0]*t0,h[1]+d[1]*t0];
  ctx.strokeStyle=shade(C.wood,-.1);ctx.lineWidth=SPEAR.W;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(tip[0],tip[1]);ctx.stroke();
  spearHead(ctx,tip,d,C);
}
/* How much of the dory projects past the shield rim, in rig units. This is the
   number that decides whether the weapon reads as a spear while the soldier is
   moving; the test suite asserts a floor on it. */
function spearClearance(J,po){
  const ang=po.extra.spearAng||0, d=[Math.cos(ang),Math.sin(ang)];
  const h=J.armB[2], {cx,cy,R}=aspisDisc(J,po);
  let tIn=-1;
  for(let t=0;t<=SPEAR.FWD;t+=1){
    if(Math.hypot(h[0]+d[0]*t-cx,h[1]+d[1]*t-cy)<=R) tIn=t;
  }
  return SPEAR.FWD-Math.max(0,tIn);
}
/* §7 The aspis was R = torso*0.92 -- an 84-unit disc on a 140-unit man, centred
   over the chest, which hid the body, both arms and most of the dory. It is now
   0.78 and braced slightly less far forward, so the soldier reads as a soldier
   and the weapon reads as a weapon. Still a big round hoplite shield. */
function aspisDisc(J,po){
  const top=J.shoulder,bot=J.pelvis,hd=J.armF[2];
  const th=Math.hypot(bot[0]-top[0],bot[1]-top[1]), R=th*0.78;
  const mid=[lerp(top[0],bot[0],0.5),lerp(top[1],bot[1],0.64)];
  const gap=po.extra.brace?R*0.28+4:R*0.10;
  return {cx:lerp(mid[0],hd[0],0.2)+gap, cy:lerp(mid[1],hd[1],0.2), R};
}
function drawAspis(ctx,J,C,po){const {cx,cy,R}=aspisDisc(J,po);ctx.save();ctx.translate(cx,cy);ctx.fillStyle=cyl(ctx,-R,R,C.shield,.15);ctx.strokeStyle=shade(C.shield,-.4);ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(0,0,R,0,7);ctx.fill();ctx.stroke();ctx.strokeStyle=C.trim;ctx.lineWidth=R*0.09;ctx.beginPath();ctx.arc(0,0,R-R*0.06,0,7);ctx.stroke();ctx.strokeStyle=C.trim;ctx.lineWidth=R*0.13;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(0,-R*0.4);ctx.lineTo(-R*0.32,R*0.4);ctx.moveTo(0,-R*0.4);ctx.lineTo(R*0.32,R*0.4);ctx.stroke();ctx.restore();}
/* §6 The scutum was th*0.86 x th*0.30 -- a 79x55 slab on a 140-unit man,
   centred over the torso and drawn AFTER the weapon arm. It hid the body and
   the entire sword strike, which is why the owner saw "positional movement"
   instead of an attack. Same defect the aspis had over the dory. */
function scutumRect(J,po){
  const top=J.shoulder,bot=J.pelvis,hd=J.armF[2];
  const th=Math.hypot(bot[0]-top[0],bot[1]-top[1]);
  const HH=th*0.72,HW=th*0.26;
  const mid=[lerp(top[0],bot[0],0.5),lerp(top[1],bot[1],0.6)];
  return {cx:lerp(mid[0],hd[0],0.32)+HW*0.5, cy:lerp(mid[1],hd[1],0.38), HH, HW};
}
function drawScutum(ctx,J,C,po){const {cx,cy,HH,HW}=scutumRect(J,po);ctx.save();ctx.translate(cx,cy);ctx.fillStyle=cyl(ctx,-HW,HW,C.shield,.14);ctx.strokeStyle=shade(C.shield,-.4);ctx.lineWidth=1.4;ctx.beginPath();ctx.roundRect(-HW,-HH,HW*2,HH*2,4);ctx.fill();ctx.stroke();ctx.strokeStyle=C.trim;ctx.lineWidth=1.2;ctx.beginPath();ctx.roundRect(-HW+1.2,-HH+1.4,HW*2-2.4,HH*2-2.8,3);ctx.stroke();ctx.fillStyle=C.trim;ctx.beginPath();ctx.arc(0,0,HW*0.24,0,7);ctx.fill();ctx.restore();}
/* The blade rides the FAR arm and genuinely projects past the shield's edge.
   Re-draw only the part that lies outside the shield rectangle, after it. */
function gladiusAheadOfShield(ctx,J,po,C){
  if(po.supine||po.extra.spearGone)return;
  if(C._blade && C._blade!=='gladius'){ if(C._sS==='none') return;
    const {cx,cy,HH,HW}=scutumRect(J,po), h=J.armB[2], ang=gladiusAngle(J,po,po.extra.trail||0,po.extra.swingStyle||0);
    ctx.save(); ctx.beginPath(); ctx.rect(-1e4,-1e4,2e4,2e4); ctx.rect(cx-HW,cy-HH,HW*2,HH*2); ctx.clip('evenodd');
    drawEraBlade(ctx,h,[Math.cos(ang),Math.sin(ang)],C._blade,C,po.extra.bigSword?1.35:1); ctx.restore(); return; }
  const h=J.armB[2], trail=po.extra.trail||0, style=po.extra.swingStyle||0;
  const ang = gladiusAngle(J,po,trail,style);   // §9 one source of truth
  const d=[Math.cos(ang),Math.sin(ang)],nx=-d[1],ny=d[0];
  const big=po.extra.bigSword?1.6:1, blade=70*big, bw=3.5*big;
  const {cx,cy,HH,HW}=scutumRect(J,po);
  const inside=(x,y)=>Math.abs(x-cx)<=HW&&Math.abs(y-cy)<=HH;
  let tIn=-1;
  for(let t=0;t<=blade;t+=2) if(inside(h[0]+d[0]*t,h[1]+d[1]*t)) tIn=t;
  if(tIn<0) return;                  // never crosses the shield: already visible
  const t0=Math.min(blade,tIn+2);
  if(t0>=blade) return;              // the shield swallows the whole blade
  const a=[h[0]+d[0]*t0,h[1]+d[1]*t0], tip=[h[0]+d[0]*blade,h[1]+d[1]*blade];
  poly(ctx,[[a[0]+nx*bw,a[1]+ny*bw],[tip[0]+nx*0.6,tip[1]+ny*0.6],
            [tip[0]+d[0]*2.4,tip[1]+d[1]*2.4],[tip[0]-nx*0.6,tip[1]-ny*0.6],
            [a[0]-nx*bw,a[1]-ny*bw]],'#e9edf1',shade('#e9edf1',-.35),0.6);
  ctx.strokeStyle=shade('#e9edf1',.25);ctx.lineWidth=0.8;ctx.beginPath();
  ctx.moveTo(a[0]+d[0]*2,a[1]+d[1]*2);ctx.lineTo(tip[0]-d[0]*5,tip[1]-d[1]*5);ctx.stroke();
}
/* The blade direction, derived once from the forearm + a bounded wrist. Both
   the main draw and the ahead-of-shield redraw must use this or they diverge. */
function gladiusAngle(J,po,trail,style){
  const h=J.armB[2];
  const fore=Math.atan2(h[1]-J.armB[1][1], h[0]-J.armB[1][0]);
  const wristMax=1.25;
  const wrist = po.extra.chop!=null ? lerp(-0.55,0.20,po.extra.chop)
              : (style ? lerp(-0.62,0.42,trail) : lerp(-0.95,0.55,trail));
  return fore + Math.max(-wristMax, Math.min(wristMax, wrist));
}
function drawGladius(ctx,J,po,C){
  const h=J.armB[2];const trail=po.extra.trail||0;
  /* §9 RIGID-WEAPON CONTRACT.
     The blade angle used to be derived from `trail` alone, completely
     independently of where the hand actually was. That is why the sword could
     arc convincingly around a welded hand -- and why, once the hand started
     moving, hand and blade stopped agreeing. The blade is a rigid object
     gripped at the hilt, so its direction must come from the FOREARM, with the
     wrist adding only a bounded offset. `trail` now describes the wrist, not
     the sword. */
  const style = po.extra.swingStyle||0;
  const ang = gladiusAngle(J,po,trail,style);
  const d=[Math.cos(ang),Math.sin(ang)],nx=-d[1],ny=d[0];
  if(C._blade && C._blade!=='gladius'){ drawEraBlade(ctx,h,d,C._blade,C,po.extra.bigSword?1.35:1); return; }   // D-01 era weapon, same grip/angle contract
  const big=po.extra.bigSword?1.6:1;                       // raged: oversized greatsword
  const blade=70*big,grip=9,guardW=8.2*big,bw=3.5*big;
  const tip=[h[0]+d[0]*blade,h[1]+d[1]*blade];
  const gripEnd=[h[0]-d[0]*grip,h[1]-d[1]*grip];
  // grip + pommel (behind hand)
  ctx.strokeStyle=shade(C.leather,-.05);ctx.lineWidth=3.0;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(h[0],h[1]);ctx.lineTo(gripEnd[0],gripEnd[1]);ctx.stroke();
  ctx.fillStyle=C.trim;ctx.beginPath();ctx.arc(gripEnd[0],gripEnd[1],2.4,0,7);ctx.fill();
  // crossguard
  ctx.strokeStyle=C.trim;ctx.lineWidth=2.6;ctx.beginPath();ctx.moveTo(h[0]+nx*guardW,h[1]+ny*guardW);ctx.lineTo(h[0]-nx*guardW,h[1]-ny*guardW);ctx.stroke();
  // tapered blade
  const b0=[h[0]+d[0]*2,h[1]+d[1]*2];
  poly(ctx,[[b0[0]+nx*bw,b0[1]+ny*bw],[tip[0]+nx*0.6,tip[1]+ny*0.6],[tip[0]+d[0]*2.4,tip[1]+d[1]*2.4],[tip[0]-nx*0.6,tip[1]-ny*0.6],[b0[0]-nx*bw,b0[1]-ny*bw]],'#e9edf1',shade('#e9edf1',-.35),0.6);
  // fuller highlight
  ctx.strokeStyle=shade('#e9edf1',.25);ctx.lineWidth=0.8;ctx.beginPath();ctx.moveTo(b0[0]+d[0]*3,b0[1]+d[1]*3);ctx.lineTo(tip[0]-d[0]*5,tip[1]-d[1]*5);ctx.stroke();
}
// Second sword in the near (former shield) hand — for the ex-spearman dual-blade rage.
function drawGladius2(ctx,J,po,C){
  const h=J.armF[2];const trail=po.extra.trail||0;
  const ang = (po.extra.chop!=null ? lerp(-2.5,0.78,po.extra.chop) : lerp(-1.46,-0.05,trail)) + 0.55;  // offset so the two blades slash out of phase
  const d=[Math.cos(ang),Math.sin(ang)],nx=-d[1],ny=d[0];const big=po.extra.bigSword?1.55:1;const blade=58*big,grip=8,bw=2.6*big;
  const tip=[h[0]+d[0]*blade,h[1]+d[1]*blade],gripEnd=[h[0]-d[0]*grip,h[1]-d[1]*grip];
  ctx.strokeStyle=shade(C.leather,-.05);ctx.lineWidth=2.8;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(h[0],h[1]);ctx.lineTo(gripEnd[0],gripEnd[1]);ctx.stroke();
  ctx.strokeStyle=C.trim;ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(h[0]+nx*6.5,h[1]+ny*6.5);ctx.lineTo(h[0]-nx*6.5,h[1]-ny*6.5);ctx.stroke();
  const b0=[h[0]+d[0]*2,h[1]+d[1]*2];
  poly(ctx,[[b0[0]+nx*bw,b0[1]+ny*bw],[tip[0]+nx*0.5,tip[1]+ny*0.5],[tip[0]+d[0]*2.2,tip[1]+d[1]*2.2],[tip[0]-nx*0.5,tip[1]-ny*0.5],[b0[0]-nx*bw,b0[1]-ny*bw]],'#e9edf1',shade('#e9edf1',-.35),0.6);
}
/* §7/§16 ARROW SILHOUETTE — one definition, used by the nocked arrow here and
   by the flying projectile in index.html. The old arrow was a 14px line with a
   4px head and NO fletching, which is why the owner said arrows do not read as
   arrows. Head and fletching are deliberately a little generous: this is a
   readability decision at battle zoom, not a scale drawing.
   Draws along +X from the nock at the origin; the caller supplies rotation. */
const ARROW={LEN:30, BACK:9, W:2.2, HEAD:9, HEADW:3.4, FLETCH:7, FLETCHW:3.2};
function drawArrowShape(ctx,shaftCol,headCol,fletchCol,tipAt){
  /* `tipAt` lets the nocked arrow reach PAST the bow: on the string the nock
     sits well behind the grip, so a fixed-length arrow drawn from the nock
     stops short and the fletching juts out behind the archer's back. The
     flying projectile uses the default length. */
  const A=ARROW, tip=(tipAt===undefined?A.LEN-A.BACK:tipAt);
  ctx.strokeStyle=shaftCol; ctx.lineWidth=A.W; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(-A.BACK,0); ctx.lineTo(tip-A.HEAD*0.4,0); ctx.stroke();
  // barbed head
  poly(ctx,[[tip,0],[tip-A.HEAD,-A.HEADW],[tip-A.HEAD*0.55,0],[tip-A.HEAD,A.HEADW]],headCol,null,0);
  // fletching: two vanes swept back from the nock
  ctx.fillStyle=fletchCol;
  for(const sgn of [-1,1]){
    ctx.beginPath();
    ctx.moveTo(-A.BACK,0);
    ctx.lineTo(-A.BACK+A.FLETCH*0.35, sgn*A.FLETCHW);
    ctx.lineTo(-A.BACK+A.FLETCH,      sgn*A.FLETCHW*0.35);
    ctx.lineTo(-A.BACK+A.FLETCH*0.8,  0);
    ctx.closePath(); ctx.fill();
  }
}
function drawBow(ctx,G,dh,po){const bk=po.extra.bowKind, half=bk==='long'?50:bk==='yumi'?46:bk==='composite'?35:40, depth=bk==='composite'?10:bk==='long'?13:15;   /* D-01 era bow profile */const aim=po.extra.nocked?Math.atan2(G[1]-dh[1],G[0]-dh[0]):0;ctx.save();ctx.translate(G[0],G[1]);ctx.rotate(aim);const T=[-depth,-half],B=[-depth,half];ctx.strokeStyle='#8a5a2c';ctx.lineWidth=2.6;ctx.lineCap='round';ctx.beginPath();if(bk==='yumi'){T[1]=-half*1.15;B[1]=half*0.7;}ctx.moveTo(T[0],T[1]);ctx.quadraticCurveTo(2,T[1]*0.5,2,0);ctx.quadraticCurveTo(2,B[1]*0.5,B[0],B[1]);ctx.stroke();if(bk==='composite'){ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(T[0],T[1]);ctx.lineTo(T[0]-4,T[1]-3);ctx.moveTo(B[0],B[1]);ctx.lineTo(B[0]-4,B[1]+3);ctx.stroke();}let nock;if(po.extra.nocked){const dx=dh[0]-G[0],dy=dh[1]-G[1];nock=[dx*Math.cos(aim)+dy*Math.sin(aim),-dx*Math.sin(aim)+dy*Math.cos(aim)];}else nock=[-depth,0];ctx.strokeStyle='rgba(238,232,214,.8)';ctx.lineWidth=0.7;ctx.beginPath();ctx.moveTo(T[0],T[1]);ctx.lineTo(nock[0],nock[1]);ctx.lineTo(B[0],B[1]);ctx.stroke();if(po.extra.nocked){ctx.save();ctx.translate(nock[0],nock[1]);
    drawArrowShape(ctx,'#7a5330','#e6ebef','#d9cfc0', 28-nock[0]);   // tip clears the bow
    ctx.restore();}ctx.restore();}
/* TASK RANGED: the gun-class weapon follows the era family (po.extra.gunKind): crossbow (stock + prod + string, the
   bolt on the tiller until it is loosed), matchlock/flintlock/musket (long smoothbore), bolt rifle (shorter, bolt
   handle). Same grip points, so every firearm pose is unchanged. */
function drawCrossbow(ctx,rear,front,po,C){const ang=Math.atan2(front[1]-rear[1],front[0]-rear[0]),len=Math.hypot(front[0]-rear[0],front[1]-rear[1]);ctx.save();ctx.translate(rear[0],rear[1]);ctx.rotate(ang);
  const tip=len+16;ctx.fillStyle=shade(C.wood,-.05);ctx.beginPath();ctx.roundRect(-14,-2.6,tip+14,5.2,1.5);ctx.fill();   // tiller
  const spanned=!(po.extra.fire>0.05);const bend=spanned?7:2;ctx.strokeStyle='#5a3d22';ctx.lineWidth=2.6;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(tip-bend,-15);ctx.quadraticCurveTo(tip+4,0,tip-bend,15);ctx.stroke();   // prod
  ctx.strokeStyle='rgba(238,232,214,.85)';ctx.lineWidth=0.8;ctx.beginPath();ctx.moveTo(tip-bend,-15);ctx.lineTo(spanned?tip-26:tip-6,0);ctx.lineTo(tip-bend,15);ctx.stroke();   // string: spanned back, or snapped forward
  if(spanned){ctx.save();ctx.translate(tip-26,0);ctx.scale(0.72,1.2);drawArrowShape(ctx,'#3a2c1c','#c9ccd0','#9a8a6a',30);ctx.restore();}   // bolt on the tiller
  ctx.restore();}
function drawRifle(ctx,rear,front,po,C){if(po.extra.gunKind==='xbow')return drawCrossbow(ctx,rear,front,po,C);const ang=Math.atan2(front[1]-rear[1],front[0]-rear[0]),len=Math.hypot(front[0]-rear[0],front[1]-rear[1]);ctx.save();ctx.translate(rear[0],rear[1]);ctx.rotate(ang);
  const gk=po.extra.gunKind, longArm=gk==='musket'||gk==='matchlock'||gk==='flintlock';
  if(longArm){ctx.fillStyle=shade(C.metal,.1);ctx.fillRect(len*0.4,-1.1,len*0.6+40,2.2);}   // long smoothbore barrel past the standard muzzle
  if(gk==='matchlock'){ctx.strokeStyle='#5a3d22';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(4,-2);ctx.quadraticCurveTo(0,-8,-4,-6);ctx.stroke();ctx.fillStyle='#ffb347';ctx.beginPath();ctx.arc(-4,-6,1.2,0,7);ctx.fill();}   // serpentine + glowing match
  if(gk==='rifle'||gk==='boltrifle'){ctx.strokeStyle=shade(C.metal,-.2);ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(6,-2);ctx.lineTo(9,-6);ctx.stroke();}   // bolt handle
  const muzzle=len+24;ctx.fillStyle=shade(C.wood,-.1);ctx.beginPath();ctx.moveTo(-16,-3.4);ctx.lineTo(-2,-2.2);ctx.lineTo(-2,2);ctx.lineTo(-16,3.6);ctx.closePath();ctx.fill();ctx.fillStyle=cyl(ctx,-3,3,C.metal,.3);ctx.beginPath();ctx.roundRect(-2,-2.4,len*0.5+4,4.2,1);ctx.fill();ctx.fillStyle=shade(C.metal,-.1);ctx.beginPath();ctx.moveTo(3,2);ctx.lineTo(8,2);ctx.lineTo(7,9);ctx.lineTo(4,9);ctx.closePath();ctx.fill();ctx.fillStyle=shade(C.metal,.1);ctx.fillRect(len*0.4,-1.2,muzzle-len*0.4,2.4);ctx.fillStyle=shade(C.wood,-.05);ctx.beginPath();ctx.roundRect(len-8,-2.2,16,4.4,1.2);ctx.fill();if(po.extra.fire>0.05){ctx.globalAlpha=Math.min(1,po.extra.fire*1.4);ctx.fillStyle='#ffd24a';poly(ctx,[[muzzle+2,0],[muzzle+9,-4],[muzzle+15,0],[muzzle+9,4]],'#ffd24a',null,0);ctx.globalAlpha=1;}ctx.restore();}

// ---- Roman legionary armor overlays (sword class) ----
function drawSegmentata(ctx,J,C){
  const sh=J.shoulder,pv=J.pelvis;const a=Math.atan2(pv[1]-sh[1],pv[0]-sh[0]);
  const tl=Math.hypot(pv[0]-sh[0],pv[1]-sh[1]);
  ctx.save();ctx.translate(sh[0],sh[1]);ctx.rotate(a-Math.PI/2);
  const bands=5,top=2.5,bot=tl*0.60,bh=(bot-top)/bands;
  for(let i=0;i<bands;i++){const y=top+i*bh,w=lerp(8.3,6.6,i/(bands-1));
    ctx.fillStyle=cyl(ctx,-w,w,C.metal,.36);ctx.strokeStyle=shade(C.metal,-.55);ctx.lineWidth=0.6;
    ctx.beginPath();ctx.roundRect(-w,y,w*2,bh*0.92,1.6);ctx.fill();ctx.stroke();}
  ctx.restore();
}
function drawPteruges(ctx,J,C){
  const pv=J.pelvis,strips=7;ctx.save();ctx.translate(pv[0],pv[1]);
  for(let i=0;i<strips;i++){const fx=lerp(-8,8,i/(strips-1));
    poly(ctx,[[fx-1.9,-1],[fx+1.9,-1],[fx+1.5,9.5],[fx-1.5,9.5]],cyl(ctx,fx-1.9,fx+1.9,C.leather,.18),shade(C.leather,-.45),0.4);
    ctx.fillStyle=C.trim;ctx.fillRect(fx-1.7,8.1,3.4,1.5);}
  ctx.restore();
}
function drawPauldron(ctx,sh,C){
  ctx.fillStyle=cyl(ctx,sh[0]-7.5,sh[0]+7.5,C.metal,.42);ctx.strokeStyle=shade(C.metal,-.55);ctx.lineWidth=0.7;
  ctx.beginPath();ctx.ellipse(sh[0],sh[1]+1.5,7.5,5.2,0,0,7);ctx.fill();ctx.stroke();
  ctx.strokeStyle=shade(C.metal,.1);ctx.lineWidth=0.5;ctx.beginPath();ctx.ellipse(sh[0],sh[1]+1.5,5,3.4,0,0,7);ctx.stroke();
}
// Civilization armor tiers across the 15 eras — recolors the metal/trim of every
// worn piece (helmet, greaves, cuirass) and picks the chest style so a tribal
// spearman, a bronze hoplite and an industrial trooper are unmistakable.
/* D-01 ERA KITS -- the design source is docs/kwars-art/ERA_VISUAL_BIBLE.md. One row per canonical civilization
   (civilizations.js order). Team identity stays in cloth/shield paint (C.tunic/C.shield); the kit changes the
   SILHOUETTE: headgear, armour surface, blade, spearhead, both shield shapes and the bow.
   sS = sword-class shield, pS = spear-class shield ('none' = carried as armour instead, see index.html spawn). */
const ERA_KITS=[null,
  {metal:'#77736a',trim:'#c8a45a',chest:'hide',  helm:'hair',     blade:'club',     head:'stone',  sS:'hide_oval', pS:'hide_oval', bow:'self',     emblem:'stripes'},
  {metal:'#b5893c',trim:'#e8c46a',chest:'scale', helm:'cap',      blade:'axe',      head:'bronze', sS:'wicker',    pS:'wicker',    bow:'composite',emblem:'sun'},
  {metal:'#c39a4a',trim:'#e8d28a',chest:'linen', helm:'headcloth',blade:'khopesh',  head:'bronze', sS:'tomb',      pS:'tomb',      bow:'composite',emblem:'bands'},
  {metal:'#9aa2aa',trim:'#c7ccce',chest:'scale', helm:'conical',  blade:'short',    head:'iron',   sS:'spara',     pS:'round',     bow:'composite',emblem:'rosette'},
  {metal:'#c2a15a',trim:'#e8d28a',chest:'muscle',helm:'crested',  blade:'xiphos',   head:'bronze', sS:'aspis',     pS:'aspis',     bow:'self',     emblem:'lambda'},
  {metal:'#aeb4b8',trim:'#e0c060',chest:'plate', helm:'galea',    blade:'gladius',  head:'iron',   sS:'scutum',    pS:'scutum',    bow:'composite',emblem:'wings'},
  {metal:'#aeb4bb',trim:'#e0c060',chest:'mail',  helm:'ridge',    blade:'spatha',   head:'iron',   sS:'oval',      pS:'oval',      bow:'composite',emblem:'cross'},
  {metal:'#9ea4aa',trim:'#cfd4d8',chest:'mail',  helm:'nasal',    blade:'daneaxe',  head:'winged', sS:'roundboss', pS:'roundboss', bow:'self',     emblem:'quarter'},
  {metal:'#c6ccd2',trim:'#e8b23b',chest:'surcoat',helm:'great',   blade:'arming',   head:'iron',   sS:'heater',    pS:'kite',      bow:'long',     emblem:'cross'},
  {metal:'#a08a6a',trim:'#e8b23b',chest:'lamellar',helm:'steppe', blade:'saber',    head:'iron',   sS:'steppe',    pS:'steppe',    bow:'composite',emblem:'none'},
  {metal:'#3d3a3a',trim:'#c9a24a',chest:'lamellar',helm:'kabuto', blade:'katana',   head:'yari',   sS:'none',      pS:'none',      bow:'yumi',     emblem:'mon'},
  {metal:'#b9bec4',trim:'#d9c07a',chest:'plate', helm:'morion',   blade:'longsword',head:'pike',   sS:'buckler',   pS:'none',      bow:'composite',emblem:'none'},
  {metal:'#8f8f93',trim:'#d6b45a',chest:'coat',  helm:'tricorne', blade:'hanger',   head:'bayonet',sS:'none',      pS:'none',      bow:'composite',emblem:'none'},
  {metal:'#8f8f93',trim:'#e8e8e8',chest:'coat',  helm:'shako',    blade:'briquet',  head:'bayonet',sS:'none',      pS:'none',      bow:'composite',emblem:'none'},
  {metal:'#5f6a5a',trim:'#aab0b6',chest:'coat',  helm:'brodie',   blade:'trench',   head:'bayonet',sS:'none',      pS:'none',      bow:'composite',emblem:'none'}
];
function eraKit(civ){ civ=Math.max(1,Math.min(15,(civ|0)||1)); return ERA_KITS[civ]; }
/* ---- era headgear (drawn in head-local space: origin at the head centre, radius r) ---- */
function drawHelm(ctx,r,C){
  const k=C._helm, m=C.metal, dark=shade(m,-.5);
  const dome=(col,lift)=>{ctx.fillStyle=cyl(ctx,-r-1.5,r+1.5,col,lift==null?.3:lift);ctx.strokeStyle=shade(col,-.5);ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,-0.5,r+1.4,Math.PI*0.95,Math.PI*2.05);ctx.fill();ctx.stroke();};
  if(k==='hair'){ ctx.fillStyle='#2b1d12';ctx.beginPath();ctx.arc(0,-0.6,r+0.8,Math.PI*0.92,Math.PI*2.08);ctx.fill();ctx.beginPath();ctx.ellipse(-r*0.9,-r*0.5,3,3.6,0,0,7);ctx.fill();   // hair + knot
    ctx.fillStyle=C.shield||'#b5562c';ctx.fillRect(-r-0.6,-2.2,2*r+1.2,2.2);                                               // painted headband (team)
    ctx.strokeStyle='#e9e2cf';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(-r*0.7,-2);ctx.quadraticCurveTo(-r*1.6,-r*1.9,-r*0.9,-r*2.6);ctx.stroke(); return; }   // feather
  if(k==='headcloth'){ ctx.fillStyle='#e8dcbc';ctx.beginPath();ctx.arc(0,-0.5,r+1.4,Math.PI*0.95,Math.PI*2.05);ctx.lineTo(-r*0.9,r*1.4);ctx.lineTo(-r-2.5,r*1.6);ctx.closePath();ctx.fill();
    ctx.strokeStyle=C.shield||'#2e5c9a';ctx.lineWidth=1.3;for(const y of [-r*0.6,-r*0.15,r*0.3])for(let i=0;i<1;i++){ctx.beginPath();ctx.moveTo(-r-1,y);ctx.lineTo(r+1,y);ctx.stroke();} return; }
  if(k==='fur'||k==='steppe'){ dome(k==='steppe'?m:'#6b4a2a',.2);
    if(k==='steppe'){ctx.fillStyle=shade(m,.1);ctx.beginPath();ctx.moveTo(-r*0.7,-r);ctx.lineTo(0,-r-8);ctx.lineTo(r*0.7,-r);ctx.closePath();ctx.fill();ctx.fillStyle=C.shield||'#a33';ctx.fillRect(-0.6,-r-11,1.2,4);}
    ctx.fillStyle='#5a3d22';ctx.beginPath();ctx.ellipse(0,-r*0.05,r+2.6,2.6,0,Math.PI,Math.PI*2);ctx.fill(); return; }        // fur brim
  if(k==='cap'){ dome(m,.35); ctx.fillStyle=shade(m,-.25);ctx.fillRect(-r-1,-0.8,2*r+2,1.6); return; }
  if(k==='conical'){ ctx.fillStyle=cyl(ctx,-r-1.5,r+1.5,m,.3);ctx.strokeStyle=dark;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-r-1.4,0);ctx.lineTo(0,-r-9);ctx.lineTo(r+1.4,0);ctx.closePath();ctx.fill();ctx.stroke(); return; }
  if(k==='ridge'){ dome(m,.3); ctx.strokeStyle=C.trim;ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(0,-0.5,r+1.4,Math.PI*1.05,Math.PI*1.95);ctx.stroke();ctx.fillStyle=dark;ctx.fillRect(r*0.2,-1,r*0.9,r*1.2); return; }
  if(k==='nasal'){ ctx.fillStyle=cyl(ctx,-r-1.5,r+1.5,m,.3);ctx.strokeStyle=dark;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-r-1.4,0);ctx.quadraticCurveTo(-r,-r-4,0,-r-5.5);ctx.quadraticCurveTo(r,-r-4,r+1.4,0);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.strokeStyle=shade(m,-.3);ctx.lineWidth=0.9;ctx.beginPath();ctx.moveTo(0,-r-5);ctx.lineTo(0,0);ctx.stroke();ctx.fillStyle=dark;ctx.fillRect(r*0.55,-1,1.8,r*0.95); return; }   // band + nasal
  if(k==='great'){ ctx.fillStyle=cyl(ctx,-r-2,r+2,m,.3);ctx.strokeStyle=dark;ctx.lineWidth=1;ctx.beginPath();ctx.rect(-r-1.8,-r-2.5,2*r+3.6,2*r+3);ctx.fill();ctx.stroke();
    ctx.fillStyle='#14171a';ctx.fillRect(r*0.1,-r*0.35,r+1.6,1.4);ctx.strokeStyle=C.trim;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(r*0.6,-r-2);ctx.lineTo(r*0.6,r);ctx.stroke(); return; }   // flat-top great helm + vision slit
  if(k==='kabuto'){ dome(m,.25); ctx.fillStyle=shade(m,-.15);ctx.beginPath();ctx.moveTo(-r-1,-1);ctx.lineTo(-r-6,r*0.9);ctx.lineTo(-r*0.2,r*0.6);ctx.lineTo(-r*0.2,-1);ctx.closePath();ctx.fill();   // shikoro neck guard
    ctx.strokeStyle=C.trim;ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(r*0.2,-r);ctx.quadraticCurveTo(r*1.4,-r-6,r*1.8,-r-9);ctx.moveTo(r*0.2,-r);ctx.quadraticCurveTo(-r*0.6,-r-7,-r*0.3,-r-10);ctx.stroke(); return; }   // kuwagata horns
  if(k==='morion'){ dome(m,.35); ctx.fillStyle=cyl(ctx,-r-5,r+5,m,.25);ctx.beginPath();ctx.moveTo(-r-5,-1);ctx.quadraticCurveTo(0,-4,r+5,-1);ctx.quadraticCurveTo(r+6,-4.5,r+4,-5.5);ctx.lineTo(-r-4,-5.5);ctx.quadraticCurveTo(-r-6,-4.5,-r-5,-1);ctx.fill();
    ctx.fillStyle=shade(m,.15);ctx.beginPath();ctx.moveTo(-r*0.6,-r);ctx.quadraticCurveTo(0,-r-8,r*0.6,-r);ctx.closePath();ctx.fill(); return; }   // brim + comb
  if(k==='tricorne'){ ctx.fillStyle='#1d1a17';ctx.beginPath();ctx.moveTo(-r-3,-r+2);ctx.quadraticCurveTo(0,-r-1.5,r+3,-r+2);ctx.quadraticCurveTo(r*0.55,-r-7,0,-r-7.5);ctx.quadraticCurveTo(-r*0.55,-r-7,-r-3,-r+2);ctx.closePath();ctx.fill();ctx.strokeStyle=C.trim;ctx.lineWidth=0.9;ctx.stroke(); return; }
  if(k==='shako'){ ctx.fillStyle='#1b1d22';ctx.fillRect(-r-0.5,-r-9,2*r+1,r+8);ctx.fillStyle='#111';ctx.fillRect(-r-1,-1.4,2*r+4,1.8);ctx.fillStyle=C.trim;ctx.fillRect(-r-0.5,-r-9,2*r+1,1.4);
    ctx.fillStyle=C.shield||'#b22';ctx.beginPath();ctx.ellipse(r*0.2,-r-11,1.8,3,0,0,7);ctx.fill(); return; }   // stovepipe + plume
  if(k==='brodie'){ ctx.fillStyle=cyl(ctx,-r-5,r+5,m,.2);ctx.strokeStyle=shade(m,-.45);ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,-r*0.25,r+5,2.2,0,0,7);ctx.fill();ctx.stroke();ctx.beginPath();ctx.arc(0,-r*0.25,r*0.95,Math.PI,Math.PI*2);ctx.fill();ctx.stroke(); return; }
}
const ERA_HELM_DEFAULT=new Set([undefined,'galea','crested']);
/* ---- era shields: drawn centred at (cx,cy) inside the rect the shield occupies (HW,HH half sizes) ---- */
function drawEraShield(ctx,kind,cx,cy,HW,HH,C){
  const paint=C.shield||'#9e2b25', trim=C.trim, hide='#8a6340', wick='#b89a5e';
  ctx.save();ctx.translate(cx,cy);ctx.lineWidth=1.3;
  const fs=(fill,stroke)=>{ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.stroke();};
  ctx.beginPath();
  if(kind==='hide_oval'){ctx.ellipse(0,0,HW*1.0,HH*0.95,0,0,7);fs(cyl(ctx,-HW,HW,hide,.18),shade(hide,-.5));
    ctx.strokeStyle=paint;ctx.lineWidth=2;for(const y of [-HH*0.35,0,HH*0.35]){ctx.beginPath();ctx.moveTo(-HW*0.75,y);ctx.lineTo(HW*0.75,y);ctx.stroke();}}
  else if(kind==='wicker'||kind==='spara'){ctx.rect(-HW,-HH*(kind==='spara'?0.95:1.05),HW*2,HH*(kind==='spara'?1.9:2.1));fs(cyl(ctx,-HW,HW,wick,.18),shade(wick,-.5));
    ctx.strokeStyle=shade(wick,-.3);ctx.lineWidth=0.7;for(let y=-HH;y<HH;y+=4){ctx.beginPath();ctx.moveTo(-HW,y);ctx.lineTo(HW,y);ctx.stroke();}ctx.fillStyle=paint;ctx.fillRect(-HW,-HH*0.12,HW*2,HH*0.24);}
  else if(kind==='tomb'){ctx.moveTo(-HW,HH);ctx.lineTo(-HW,-HH*0.4);ctx.quadraticCurveTo(-HW,-HH*1.05,0,-HH*1.05);ctx.quadraticCurveTo(HW,-HH*1.05,HW,-HH*0.4);ctx.lineTo(HW,HH);ctx.closePath();fs(cyl(ctx,-HW,HW,hide,.2),shade(hide,-.5));
    ctx.fillStyle=paint;ctx.beginPath();ctx.ellipse(0,-HH*0.25,HW*0.5,HH*0.3,0,0,7);ctx.fill();}
  else if(kind==='round'||kind==='roundboss'||kind==='steppe'||kind==='buckler'){const R=kind==='buckler'?Math.min(HW,HH)*0.55:kind==='steppe'?Math.min(HW*1.1,HH*0.8):Math.min(HW*1.35,HH*0.95);
    ctx.arc(0,0,R,0,7);fs(cyl(ctx,-R,R,kind==='round'?(C.metal||'#b5893c'):kind==='steppe'?wick:paint,.2),shade(paint,-.45));
    if(kind==='roundboss'){ctx.strokeStyle=shade(paint,-.3);ctx.lineWidth=0.8;for(let x=-R+R/3;x<R;x+=R/3){ctx.beginPath();ctx.moveTo(x,-Math.sqrt(Math.max(0,R*R-x*x)));ctx.lineTo(x,Math.sqrt(Math.max(0,R*R-x*x)));ctx.stroke();}ctx.fillStyle=trim;ctx.fillRect(-R*0.08,-R,R*0.16,R*2);}
    if(kind==='round'){ctx.strokeStyle=paint;ctx.lineWidth=2.4;ctx.beginPath();ctx.arc(0,0,R*0.6,0,7);ctx.stroke();}
    if(kind==='steppe'){ctx.strokeStyle=shade(wick,-.35);ctx.lineWidth=0.7;for(let q=0.3;q<1;q+=0.25){ctx.beginPath();ctx.arc(0,0,R*q,0,7);ctx.stroke();}}
    ctx.fillStyle=shade(C.metal||'#999',.2);ctx.beginPath();ctx.arc(0,0,R*0.22,0,7);ctx.fill();}
  else if(kind==='scutum'){ctx.roundRect(-HW*0.85,-HH*1.0,HW*1.7,HH*2.0,4);fs(cyl(ctx,-HW,HW,paint,.14),shade(paint,-.4));ctx.strokeStyle=trim;ctx.lineWidth=1.2;ctx.beginPath();ctx.roundRect(-HW*0.7,-HH*0.86,HW*1.4,HH*1.72,3);ctx.stroke();ctx.fillStyle=shade(C.metal,.2);ctx.beginPath();ctx.arc(0,0,HW*0.28,0,7);ctx.fill();}
  else if(kind==='oval'){ctx.ellipse(0,0,HW*1.15,HH*1.0,0,0,7);fs(cyl(ctx,-HW,HW,paint,.16),shade(paint,-.45));ctx.strokeStyle=trim;ctx.lineWidth=1.4;ctx.beginPath();ctx.ellipse(0,0,HW*0.95,HH*0.84,0,0,7);ctx.stroke();
    ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(0,-HH*0.55);ctx.lineTo(0,HH*0.55);ctx.moveTo(-HW*0.45,-HH*0.15);ctx.lineTo(HW*0.45,-HH*0.15);ctx.stroke();ctx.fillStyle=shade(C.metal,.2);ctx.beginPath();ctx.arc(0,0,HW*0.25,0,7);ctx.fill();}
  else if(kind==='heater'||kind==='kite'){const top=-HH*(kind==='kite'?1.05:0.9), bot=HH*(kind==='kite'?1.2:0.95);
    ctx.moveTo(-HW*1.05,top);ctx.lineTo(HW*1.05,top);ctx.quadraticCurveTo(HW*1.05,bot*(kind==='kite'?0.1:0.45),0,bot);ctx.quadraticCurveTo(-HW*1.05,bot*(kind==='kite'?0.1:0.45),-HW*1.05,top);ctx.closePath();fs(cyl(ctx,-HW,HW,paint,.16),shade(paint,-.45));
    ctx.strokeStyle=trim;ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(0,top+2);ctx.lineTo(0,bot-4);ctx.moveTo(-HW*0.75,top+HH*0.45);ctx.lineTo(HW*0.75,top+HH*0.45);ctx.stroke();}
  ctx.restore();
}
/* ---- era blades: one rigid object gripped at h along direction d (same contract as the gladius) ---- */
function drawEraBlade(ctx,h,d,kind,C,big){
  const nx=-d[1],ny=d[0], at=(t,o)=>[h[0]+d[0]*t+nx*o,h[1]+d[1]*t+ny*o], steel='#e2e6ea', wood='#6a4526';
  const L={club:62,axe:64,khopesh:66,short:60,xiphos:64,gladius:70,spatha:76,daneaxe:78,arming:74,saber:72,katana:76,longsword:78,hanger:64,briquet:62,trench:62}[kind]*(big||1);
  const grip=(len,col,w)=>{ctx.strokeStyle=col||shade(C.leather,-.05);ctx.lineWidth=w||3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(h[0],h[1]);const e=at(-len,0);ctx.lineTo(e[0],e[1]);ctx.stroke();};
  const guard=(w,col)=>{ctx.strokeStyle=col||C.trim;ctx.lineWidth=2.4;ctx.beginPath();const a=at(0,w),b=at(0,-w);ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();};
  const haft=(len,w)=>{ctx.strokeStyle=wood;ctx.lineWidth=w||3.4;ctx.lineCap='round';ctx.beginPath();const a=at(-8,0),b=at(len,0);ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();};
  const curved=(len,bow,w,tipw)=>{const pts=[];for(let i=0;i<=10;i++){const t=i/10;pts.push(at(2+len*t,bow*t*t+w*(1-t)+tipw*t));}for(let i=10;i>=0;i--){const t=i/10;pts.push(at(2+len*t,bow*t*t-w*(1-t)*0.4));}poly(ctx,pts,steel,shade(steel,-.35),0.6);};
  if(kind==='club'){haft(L-10,3.6);ctx.fillStyle='#6f6a60';ctx.beginPath();const c=at(L-6,0);ctx.ellipse(c[0],c[1],7,5.4,Math.atan2(d[1],d[0]),0,7);ctx.fill();ctx.strokeStyle='#c8b48a';ctx.lineWidth=1.2;const q=at(L-13,0);ctx.beginPath();ctx.arc(q[0],q[1],2.6,0,7);ctx.stroke();return;}
  if(kind==='axe'||kind==='daneaxe'){haft(L,kind==='daneaxe'?3.2:3);const bw=kind==='daneaxe'?13:9, a0=at(L-(kind==='daneaxe'?16:12),0),a1=at(L,0),e0=at(L-(kind==='daneaxe'?20:14),bw),e1=at(L+3,bw);
    poly(ctx,[a0,a1,e1,e0],kind==='daneaxe'?steel:'#c8813a',shade(steel,-.4),0.6);return;}
  if(kind==='trench'){haft(L,4);ctx.fillStyle='#4a4a44';for(let t=L-14;t<=L;t+=5){const p=at(t,0);ctx.beginPath();ctx.arc(p[0],p[1],2.4,0,7);ctx.fill();}return;}
  if(kind==='khopesh'){grip(10);const pts=[at(2,2.6),at(32,2.6),at(44,6),at(56,16),at(62,26),at(58,27),at(50,14),at(40,3),at(32,-1.2),at(2,-1.2)];poly(ctx,pts,'#d4a44a',shade('#d4a44a',-.4),0.6);return;}
  if(kind==='saber'||kind==='katana'||kind==='hanger'||kind==='briquet'){
    grip(kind==='katana'?16:9,kind==='katana'?'#22201e':null,kind==='katana'?3.4:3);
    if(kind==='katana'){ctx.fillStyle=C.trim;const g=at(0,0);ctx.beginPath();ctx.arc(g[0],g[1],4,0,7);ctx.fill();} else guard(kind==='hanger'||kind==='briquet'?5.5:6.5);
    if(kind==='hanger'||kind==='briquet'){ctx.strokeStyle=C.trim;ctx.lineWidth=1.4;ctx.beginPath();const a=at(0,5.5),b=at(-9,3.5);ctx.moveTo(a[0],a[1]);ctx.quadraticCurveTo(...at(-4,8),b[0],b[1]);ctx.stroke();}   // knuckle bow
    curved(L,kind==='katana'?-6:-10,2.8,0.4);return;}
  // straight blades
  const w={short:3.6,xiphos:3.4,gladius:3.5,spatha:3.0,arming:3.2,longsword:3.0}[kind]||3.4;
  grip(kind==='longsword'?17:9); guard({short:5,xiphos:5.5,gladius:8.2,spatha:7,arming:11,longsword:13}[kind]||7);
  const b0=at(2,0),tip=at(L,0);
  if(kind==='xiphos'){poly(ctx,[at(2,w*0.8),at(L*0.62,w*1.45),at(L,0.4),at(L+2.4,0),at(L,-0.4),at(L*0.62,-w*1.45),at(2,-w*0.8)],'#d9b468',shade('#d9b468',-.35),0.6);return;}
  poly(ctx,[at(2,w),at(L,0.6),at(L+2.4,0),at(L,-0.6),at(2,-w)],steel,shade(steel,-.35),0.6);
  ctx.strokeStyle=shade(steel,.25);ctx.lineWidth=0.8;ctx.beginPath();const f0=at(5,0),f1=at(L-5,0);ctx.moveTo(f0[0],f0[1]);ctx.lineTo(f1[0],f1[1]);ctx.stroke();
}
// A fitted breastplate that follows the torso (shoulder→pelvis) and carries an
// era-specific surface: hide straps, bronze scales, mail rings, muscle relief, coat.
function drawCuirass(ctx,J,C,style){
  const sh=J.shoulder,pv=J.pelvis;const a=Math.atan2(pv[1]-sh[1],pv[0]-sh[0]);
  const tl=Math.hypot(pv[0]-sh[0],pv[1]-sh[1]);
  ctx.save();ctx.translate(sh[0],sh[1]);ctx.rotate(a-Math.PI/2);
  const top=1.5, bot=tl*0.66;
  ctx.fillStyle=cyl(ctx,-8,8,C.metal,.34);ctx.strokeStyle=shade(C.metal,-.5);ctx.lineWidth=0.8;
  ctx.beginPath();ctx.moveTo(-8,top);ctx.quadraticCurveTo(-9,bot*0.5,-6,bot);ctx.lineTo(6,bot);ctx.quadraticCurveTo(9,bot*0.5,8,top);ctx.quadraticCurveTo(0,top-2,-8,top);ctx.closePath();ctx.fill();ctx.stroke();
  if(style==='scale'){ctx.fillStyle=shade(C.metal,-.16);for(let r=0;r<4;r++)for(let c=-2;c<=2;c++){ctx.beginPath();ctx.arc(c*3.2+(r%2?1.6:0),top+4+r*4,1.7,0,Math.PI);ctx.fill();}}
  else if(style==='mail'){ctx.fillStyle=shade(C.metal,-.22);for(let r=0;r<5;r++)for(let c=-2;c<=2;c++){ctx.beginPath();ctx.arc(c*3+(r%2?1.5:0),top+3+r*3,0.8,0,7);ctx.fill();}}
  else if(style==='muscle'){ctx.strokeStyle=shade(C.metal,-.28);ctx.lineWidth=0.7;ctx.beginPath();ctx.arc(-3,top+bot*0.28,3,0.1,Math.PI-0.1);ctx.arc(3.2,top+bot*0.28,3,0.1,Math.PI-0.1);ctx.moveTo(0,top+bot*0.42);ctx.lineTo(0,bot*0.86);ctx.stroke();}
  else if(style==='hide'){ctx.strokeStyle=shade(C.metal,-.3);ctx.lineWidth=1.4;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(-7,top+3+i*4.6);ctx.lineTo(7,top+2+i*4.6);ctx.stroke();}}
  else if(style==='coat'){ctx.strokeStyle=shade(C.metal,-.3);ctx.lineWidth=0.8;ctx.beginPath();ctx.moveTo(0,top);ctx.lineTo(0,bot);ctx.stroke();ctx.fillStyle=C.trim;for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(0,top+3.5+i*4.6,0.9,0,7);ctx.fill();}}
  else {ctx.strokeStyle=shade(C.metal,.12);ctx.lineWidth=0.6;ctx.beginPath();ctx.moveTo(-6,top+bot*0.5);ctx.lineTo(6,top+bot*0.5);ctx.stroke();}
  ctx.strokeStyle=C.trim;ctx.lineWidth=1.0;ctx.beginPath();ctx.moveTo(-8,top);ctx.quadraticCurveTo(0,top-2,8,top);ctx.stroke();
  ctx.restore();
}

function drawSoldier(ctx,cls,po,C,team,armorCls){
  armorCls=armorCls||cls;   // motion/weapon follows `cls`; worn armor & shield follow `armorCls`
  if(po.era){ const k=eraKit(po.era); C={...C, metal:k.metal, trim:k.trim, _chest:k.chest, _helm:k.helm, _blade:k.blade, _head:k.head, _sS:k.sS, _pS:k.pS, _bow:k.bow, _emblem:k.emblem}; }  // D-01 civilization kit
  const J=build(po),sk=C.skin,far=shade(sk,team===1?0.1:-0.1);
  if(po.extra.dropGear){ctx.save();ctx.globalAlpha=po.alpha*po.extra.dropGear;ctx.fillStyle=cyl(ctx,po.px-16,po.px+16,C.shield||'#8a8f96',.1);ctx.strokeStyle='#3a3f45';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(po.px-6,1,15,5,0,0,7);ctx.fill();ctx.stroke();ctx.restore();}
  ctx.globalAlpha=po.alpha;
  const supRot=po.supine?-1.5*po.supine:0;
  if(supRot){ctx.save();ctx.translate(J.pelvis[0],J.pelvis[1]);ctx.rotate(supRot);ctx.translate(-J.pelvis[0],-J.pelvis[1]);}
  // far leg
  limb(ctx,J.legB[0],J.legB[1],6.7,5.4,far);limb(ctx,J.legB[1],J.legB[2],5.4,3.6,far);greave(ctx,J.legB[1],J.legB[2],C.metal);boot(ctx,J.legB[2],J.legB[3],shade(C.leather,-.1));
  // far arm (weapon side for sword/spear; bow arm for bow; front for gun)
  limb(ctx,J.armB[0],J.armB[1],5.1,4.1,far);limb(ctx,J.armB[1],J.armB[2],4.1,3.0,far);hand(ctx,J.armB[2],J.armB[1],far);
  if(!po.supine&&!po.extra.impale){
    if(cls==='spear'&&!po.extra.spearGone)drawSpear(ctx,J.armB[2],po.extra.spearAng,C,po.extra);
    if(cls==='bow'){ po.extra.bowKind=C._bow; drawBow(ctx,J.armB[2],J.armF[2],po); }
  }
  if(cls==='sword'&&!po.supine)drawGladius(ctx,J,po,C);
  if(cls==='sword'&&!po.supine&&po.extra.dualSword)drawGladius2(ctx,J,po,C);   // dual-blade ex-spearman
  // torso
  limb(ctx,J.pelvis,J.shoulder,6.2,7.6,sk);
  const jc=C.jacket||C.tunic; ctx.save();const sA=Math.atan2(J.pelvis[1]-J.shoulder[1],J.pelvis[0]-J.shoulder[0]);ctx.translate(J.shoulder[0],J.shoulder[1]);ctx.rotate(sA-Math.PI/2);const tl=Math.hypot(J.pelvis[0]-J.shoulder[0],J.pelvis[1]-J.shoulder[1]);poly(ctx,[[-7.6,3],[7.6,3],[6.3,tl],[-6.3,tl]],cyl(ctx,-7.6,7.6,jc,.15),shade(jc,-.4),0.7);ctx.restore();
  if(armorCls==='sword'&&!po.supine&&!po.extra.impale)drawSegmentata(ctx,J,C);
  if((armorCls==='spear'||armorCls==='bow'||armorCls==='gun')&&!po.supine&&!po.extra.impale)drawCuirass(ctx,J,C,C._chest||'plate');  // era-fitted breastplate
  // near leg
  limb(ctx,J.legF[0],J.legF[1],6.7,5.4,sk);limb(ctx,J.legF[1],J.legF[2],5.4,3.6,sk);greave(ctx,J.legF[1],J.legF[2],C.metal);boot(ctx,J.legF[2],J.legF[3],shade(C.leather,-.1));
  if(armorCls==='sword'&&!po.supine&&!po.extra.impale)drawPteruges(ctx,J,C);
  // head
  limb(ctx,J.shoulder,fk(J.neck,0,0),4.2,4.2,sk);head(ctx,J,C,po.dropHelmet);
  if(po.extra.headArrow){ctx.save();ctx.translate(J.head[0],J.head[1]);ctx.strokeStyle='#6b4a2a';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-15,0);ctx.lineTo(13,0);ctx.stroke();ctx.fillStyle='#dfe4e8';poly(ctx,[[16,0],[12,-2],[12,2]],'#dfe4e8',null,0);ctx.fillStyle='rgba(150,10,10,.7)';for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(-16-i*2,(i-2)*1.5,1.4,0,7);ctx.fill();}ctx.restore();}
  // near arm (shield for sword/spear; draw for bow; rear for gun)
  limb(ctx,J.armF[0],J.armF[1],5.1,4.1,sk);limb(ctx,J.armF[1],J.armF[2],4.1,3.0,sk);hand(ctx,J.armF[2],J.armF[1],shade(sk,.1));
  if(armorCls==='sword'&&!po.supine&&!po.extra.impale)drawPauldron(ctx,J.shoulder,C);
  if(!po.supine&&!po.extra.impale&&!po.extra.dropGear&&!po.dropShield){
    if(armorCls==='sword' && C._sS!=='none'){ if(!C._sS||C._sS==='scutum') drawScutum(ctx,J,C,po); else { const q=scutumRect(J,po); drawEraShield(ctx,C._sS,q.cx,q.cy,q.HW,q.HH,C); }
      if(cls==='sword')gladiusAheadOfShield(ctx,J,po,C);}
    if(armorCls==='spear' && C._pS!=='none'){ if(!C._pS||C._pS==='aspis') drawAspis(ctx,J,C,po); else { const q=aspisDisc(J,po); drawEraShield(ctx,C._pS,q.cx,q.cy,q.R*0.82,q.R*1.08,C); }
      if(cls==='spear')drawSpearAheadOfShield(ctx,J,po,C);}
  }
  if(cls==='gun'&&!po.supine)drawRifle(ctx,J.armF[2],J.armB[2],po,C);
  if(po.extra.impale){const cx=lerp(J.shoulder[0],J.pelvis[0],0.4),cy=lerp(J.shoulder[1],J.pelvis[1],0.42);const d=[Math.cos(po.extra.impale),Math.sin(po.extra.impale)];ctx.strokeStyle=shade(C.wood||'#8a5a2c',-.1);ctx.lineWidth=2.4;ctx.lineCap='round';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(cx+d[0]*120,cy+d[1]*120);ctx.lineTo(cx-d[0]*12,cy-d[1]*12);ctx.stroke();/* D-18: full-length dory shaft stays in the body; bronze point exits the back */const bx=cx-d[0]*12,by=cy-d[1]*12,nx=-d[1],ny=d[0];ctx.fillStyle=C.metal||'#b08d57';ctx.beginPath();ctx.moveTo(bx-d[0]*12,by-d[1]*12);ctx.lineTo(bx+nx*3,by+ny*3);ctx.lineTo(bx-nx*3,by-ny*3);ctx.closePath();ctx.fill();ctx.fillStyle='#5a0e0e';ctx.beginPath();ctx.arc(cx,cy,2.6,0,7);ctx.fill();}
  if(cls==='spear'&&po.extra.thrown>0){const f=po.extra.thrown;
    const sx=J.armF[2][0]+18+f*230;
    const sy=J.shoulder[1]-4 - 4*f*(1-f)*82 + f*f*34;   // parabolic arc: rises then descends
    const ang=lerp(-0.55,0.52,f);                          // nose up on launch, tips down while falling
    drawSpear(ctx,[sx,sy],ang,C);}
  if(supRot)ctx.restore();
  ctx.globalAlpha=1;
}


return {eraKit,ERA_KITS,drawSoldier,poseFor,build,PAL,teamTint,poly,shade,SPEAR,aspisDisc,spearClearance,scutumRect,ARROW,drawArrowShape,ARM,gladiusAngle};
})();
