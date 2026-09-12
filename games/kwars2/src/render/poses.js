/* KWARS2 POSE SETS  (window.KW2Poses)
   One pose vocabulary per animSet produced by the role state machine. Poses are
   pure functions of phase t, so a role transition instantly changes how the
   soldier is held -- the animation follows the equipment, never the spawn class. */
(function(){
  'use strict';
  const ease=t=>t*t*(3-2*t), lerp=(a,b,t)=>a+(b-a)*t;

  // outArm carries the shield and stays braced; inArm does the work.
  const baseSpear=()=>({lean:0,headTilt:0,
    outArm:{sh:-0.34,el:1.55}, inArm:{sh:-2.05,el:0.95},
    legFar:{hip:0.16,knee:-0.26}, legNear:{hip:-0.14,knee:-0.34}});
  const baseSword=()=>{const p=baseSpear();p.inArm={sh:0.92,el:1.05};return p;};
  const baseBow=()=>{const p=baseSpear();p.inArm={sh:1.15,el:0.55};p.outArm={sh:0.70,el:0.85};return p;};
  const baseRide=()=>{const p=baseSpear();p.inArm={sh:0.55,el:0.75};p.outArm={sh:-0.20,el:1.10};
    p.legFar={hip:0.62,knee:-0.85};p.legNear={hip:0.58,knee:-0.90};return p;};

  function gait(P,t,amp,lift,lean){
    const s=Math.sin(t*Math.PI*2), s2=Math.sin(t*Math.PI*4);
    P.lean=lean;
    P.legNear.hip=-0.14+s*amp;  P.legFar.hip=0.16-s*amp;
    P.legNear.knee=-0.30-Math.max(0,-s)*lift;
    P.legFar.knee=-0.26-Math.max(0,s)*lift;
    P.outArm.sh+=s*0.05; P.inArm.sh+=s*0.10; P.headTilt=s2*0.02;
    return P;
  }
  function swing(P,t,restSh,restEl,dSh,dEl){
    let k;
    if(t<0.26)k=-ease(t/0.26)*0.6;
    else if(t<0.52)k=lerp(-0.6,1,ease((t-0.26)/0.26));
    else k=lerp(1,0,ease((t-0.52)/0.48));
    P.inArm.sh=restSh+k*dSh; P.inArm.el=restEl+k*dEl;
    P.lean=k*0.10; P.legNear.hip=-0.14+k*0.14; P.legNear.knee=-0.34-k*0.10;
    return P;
  }

  const SETS={
    spear_shield:{
      idle:t=>{const P=baseSpear(),b=Math.sin(t*Math.PI*2);P.lean=b*0.012;P.headTilt=b*0.018;
               P.inArm.sh=-2.05+b*0.02;return P;},
      march:t=>gait(baseSpear(),t,0.34,0.42,0.05),
      run:t=>gait(baseSpear(),t,0.52,0.70,0.14),
      attack:t=>swing(baseSpear(),t,-2.05,0.95,0.55,-0.45),
      hit:t=>{const P=baseSpear(),k=Math.sin(t*Math.PI);P.lean=-k*0.16;P.headTilt=-k*0.10;return P;},
      die:t=>{const P=baseSpear(),k=ease(Math.min(1,t*1.1));P.lean=k*0.42;P.headTilt=k*0.30;
              P.legNear.hip=-0.14+k*0.55;P.legNear.knee=-0.34-k*1.05;
              P.legFar.hip=0.16-k*0.30;P.legFar.knee=-0.26-k*0.85;
              P.inArm.sh=-2.05+k*2.35;P.outArm.sh=-0.34+k*0.28;return P;}
    },
    sword_shield:{
      idle:t=>{const P=baseSword(),b=Math.sin(t*Math.PI*2);P.lean=b*0.012;P.inArm.sh=0.92+b*0.03;return P;},
      march:t=>gait(baseSword(),t,0.34,0.42,0.05),
      run:t=>gait(baseSword(),t,0.50,0.66,0.13),
      attack:t=>swing(baseSword(),t,0.92,1.05,-0.34,0.55),
      hit:t=>{const P=baseSword(),k=Math.sin(t*Math.PI);P.lean=-k*0.16;return P;},
      die:t=>SETS.spear_shield.die(t)
    },
    sword:{   // no shield: the outside arm is free, so it swings naturally
      idle:t=>{const P=baseSword(),b=Math.sin(t*Math.PI*2);P.outArm={sh:0.18,el:0.55};
               P.lean=b*0.014;P.inArm.sh=0.92+b*0.035;return P;},
      march:t=>{const P=baseSword();P.outArm={sh:0.18,el:0.55};return gait(P,t,0.38,0.48,0.07);},
      run:t=>{const P=baseSword();P.outArm={sh:0.22,el:0.60};return gait(P,t,0.58,0.78,0.17);},
      attack:t=>{const P=baseSword();P.outArm={sh:0.18,el:0.55};return swing(P,t,0.92,1.05,-0.40,0.62);},
      hit:t=>{const P=baseSword();P.outArm={sh:0.18,el:0.55};const k=Math.sin(t*Math.PI);P.lean=-k*0.18;return P;},
      die:t=>{const P=SETS.spear_shield.die(t);P.outArm={sh:0.30,el:0.40};return P;}
    },
    ranged:{
      idle:t=>{const P=baseBow(),b=Math.sin(t*Math.PI*2);P.lean=b*0.010;return P;},
      march:t=>gait(baseBow(),t,0.32,0.40,0.04),
      run:t=>gait(baseBow(),t,0.52,0.70,0.12),
      attack:t=>{const P=baseBow();let k;                 // draw, loose, recover
        if(t<0.55)k=ease(t/0.55); else k=1-ease((t-0.55)/0.45);
        P.inArm.el=0.55-k*0.42; P.outArm.sh=0.70+k*0.10; P.lean=-k*0.05;return P;},
      hit:t=>{const P=baseBow(),k=Math.sin(t*Math.PI);P.lean=-k*0.16;return P;},
      die:t=>SETS.sword.die(t)
    },
    mounted:{
      idle:t=>{const P=baseRide(),b=Math.sin(t*Math.PI*2);P.lean=0.06+b*0.02;return P;},
      march:t=>{const P=baseRide(),b=Math.sin(t*Math.PI*4);P.lean=0.08+b*0.035;P.headTilt=b*0.02;return P;},
      run:t=>{const P=baseRide(),b=Math.sin(t*Math.PI*4);P.lean=0.16+b*0.06;P.headTilt=b*0.03;return P;},
      attack:t=>{const P=baseRide();let k;
        if(t<0.3)k=-ease(t/0.3)*0.5;else k=lerp(-0.5,1,ease((t-0.3)/0.7));
        P.inArm.sh=0.55+k*0.30;P.lean=0.10+k*0.12;return P;},
      hit:t=>{const P=baseRide(),k=Math.sin(t*Math.PI);P.lean=0.06-k*0.20;return P;},
      die:t=>{const P=baseRide(),k=ease(Math.min(1,t*1.1));P.lean=0.06+k*0.9;P.headTilt=k*0.4;return P;}
    }
  };
  /* Clip metadata. `releaseAt` is the phase at which the weapon leaves the hand.
     A collapsing body cannot keep a rigid 7-head spear welded to it without
     driving it through its own shield -- and a dying man drops his weapon
     anyway, so the physical truth and the fix are the same thing. The runtime
     spawns a dropped-weapon prop at that frame. */
  const CLIP_META={
    spear_shield:{die:{releaseAt:0.20}},
    sword_shield:{die:{releaseAt:0.28}},
    sword:{die:{releaseAt:0.28}},
    ranged:{die:{releaseAt:0.30}},
    mounted:{die:{releaseAt:0.25}}
  };
  const meta=(animSet,clip)=>(CLIP_META[animSet]&&CLIP_META[animSet][clip])||null;
  // What is actually in the hands at phase t. Returns null weapon after release.
  function kitAt(animSet,clip,t,kit){
    const m=meta(animSet,clip);
    if(m&&m.releaseAt!==undefined&&t>=m.releaseAt) return {...kit,weapon:null,weaponKind:null};
    return kit;
  }

  function pose(animSet,clip,t){
    const S=SETS[animSet]||SETS.sword;
    return (S[clip]||S.idle)(((t%1)+1)%1);
  }
  window.KW2Poses=Object.freeze({SETS,pose,meta,kitAt,CLIP_META});
})();
