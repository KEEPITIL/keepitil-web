/* KWARS2 DEPTH MODEL  (window.KW2Depth)
   Directive §32: a stable, maintainable depth ordering -- not scattered manual
   draw calls. Every actor lives on a battlefield LANE (z). Screen position and
   scale derive from that lane, so a soldier standing behind another genuinely
   renders behind it, and equipment can never jump depth independently of the
   body carrying it. */
(function(){
  'use strict';
  const LANES=7;                 // combat depth: 0 = far rank, 6 = near rank
  const Z_NEAR=1.00, Z_FAR=0.62; // perspective scale at the near/far lanes
  const LANE_RISE=22;            // screen-y lift per lane away from camera

  const t=lane=>LANES<=1?0:Math.min(1,Math.max(0,lane/(LANES-1)));
  const scaleAt=lane=>Z_FAR+(Z_NEAR-Z_FAR)*t(lane);
  const yOffsetAt=lane=>-(1-t(lane))*LANE_RISE*(LANES-1)*0.5;

  // Planes are drawn back-to-front. Actors interleave by lane inside COMBAT.
  const PLANE=Object.freeze({SKY:0,FAR_TERRAIN:1,BACK_FORT:2,COMBAT:3,NEAR_FORT:4,FX:5,FOREGROUND:6});

  /* One integer sort key so the whole frame is a single stable sort:
        plane | lane | feet-y | tiebreak
     Ordering by FEET (not centre) is what makes overlapping bodies read
     correctly; `sub` keeps a unit's own parts welded to it. */
  function key(plane,lane,feetY,sub){
    return ((plane&7)<<27) | ((lane&15)<<23) | ((Math.round(feetY+4096)&0x3FFF)<<9) | (sub&511);
  }
  function project(x,y,lane,cam){
    const s=scaleAt(lane);
    return {sx:(x-cam.x)*cam.zoom, sy:(y+yOffsetAt(lane)-cam.y)*cam.zoom, scale:s*cam.zoom};
  }
  // Deterministic lane for a unit: spread across ranks without jitter.
  function laneFor(u,seed){
    if(u.lane!==undefined&&u.lane!==null)return u.lane;
    const h=((u.id||seed||0)*2654435761)>>>0;
    return h%LANES;
  }
  function sortActors(list){ return list.sort((a,b)=>a.__key-b.__key); }

  window.KW2Depth=Object.freeze({LANES,PLANE,scaleAt,yOffsetAt,key,project,laneFor,sortActors});
})();
