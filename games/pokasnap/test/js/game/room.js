/* ROOMS (2.1) — movable furniture, decor and toys in each location.
   ---------------------------------------------------------------------------
   Pure and DOM-free. A placement is { uid, obj, loc, x, y, z, rot, cat }:
     x, y  — 0..1 of the world width/height; y is the object's FOOT line (where it meets the floor/wall);
     z     — draw layer inside its category (rugs under everything, then depth-sorted by y);
     rot   — 0 | 90 | 180 | 270 (180 = facing the other way, 90/270 = turned side-on);
     cat   — floor | wall | surface | outdoor | toy.
   Edit Room works on a DRAFT copy; nothing is saved until Confirm. */

/** Where the wall meets the floor (fraction of the world height). Everything below it is walkable depth. */
export const FLOOR = 0.52;
export const ZONES = {
  wall:    { yMin: 0.16, yMax: 0.46 },            // below the floating HUD, above the floor line
  floor:   { yMin: 0.58, yMax: 0.965 },
  outdoor: { yMin: 0.56, yMax: 0.965 },
  toy:     { yMin: 0.6, yMax: 0.965 },
  surface: { yMin: 0.58, yMax: 0.965 },           // sits on a host (table/shelf) when dropped on one, else the floor
  xMin: 0.07, xMax: 0.93,
};
/* w/h are fractions of the world WIDTH at depth scale 1. host = can carry surface items. */
export const FURNITURE = {
  rug:       { name: 'Rug', cat: 'floor', w: 0.52, h: 0.06, flat: true, indoor: true },
  couch:     { name: 'Couch', cat: 'floor', w: 0.44, h: 0.22, indoor: true, seat: true },
  armchair:  { name: 'Armchair', cat: 'floor', w: 0.24, h: 0.22, indoor: true, seat: true },
  petbed:    { name: 'Poka Bed', cat: 'floor', w: 0.26, h: 0.09, indoor: true, bed: true },
  bed:       { name: 'Cozy Bed', cat: 'floor', w: 0.4, h: 0.16, indoor: true, bed: true },
  table:     { name: 'Side Table', cat: 'floor', w: 0.2, h: 0.14, indoor: true, host: 0.14 },
  shelf:     { name: 'Bookshelf', cat: 'floor', w: 0.2, h: 0.34, indoor: true, host: 0.34 },
  toybox:    { name: 'Toy Box', cat: 'floor', w: 0.16, h: 0.11, indoor: true },
  cattree:   { name: 'Climbing Tree', cat: 'floor', w: 0.16, h: 0.36, indoor: true },
  plant:     { name: 'Plant', cat: 'floor', w: 0.12, h: 0.2 },
  lamp:      { name: 'Lamp', cat: 'surface', w: 0.08, h: 0.13, indoor: true },
  vase:      { name: 'Flower Vase', cat: 'surface', w: 0.06, h: 0.08 },
  picture:   { name: 'Picture', cat: 'wall', w: 0.16, h: 0.12, indoor: true },
  clock:     { name: 'Clock', cat: 'wall', w: 0.09, h: 0.09, indoor: true },
  bench:     { name: 'Bench', cat: 'outdoor', w: 0.34, h: 0.12, seat: true },
  kennel:    { name: 'Kennel', cat: 'outdoor', w: 0.22, h: 0.2 },
  flowerpot: { name: 'Flower Pot', cat: 'outdoor', w: 0.1, h: 0.1 },
  sandbox:   { name: 'Sandbox', cat: 'outdoor', w: 0.3, h: 0.06, flat: true },
  // toys: the ball is a physics object (game/physics.js); the rest are carried, chased and fought over
  ball:      { name: 'Ball', cat: 'toy', w: 0.06, h: 0.06, toy: 'ball' },
  yarn:      { name: 'Yarn', cat: 'toy', w: 0.07, h: 0.06, toy: 'yarn' },
  squeaky:   { name: 'Squeaky Toy', cat: 'toy', w: 0.07, h: 0.06, toy: 'squeaky' },
  plush:     { name: 'Plush Buddy', cat: 'toy', w: 0.08, h: 0.08, toy: 'plush' },
};
export const INDOOR = new Set(['living_room', 'kitchen', 'photo_studio']);
/* Layouts were designed on a 0.70–0.96 floor band; fy() maps them onto the current floor band. */
const fy = y => y < 0.5 ? 0.16 + (y - 0.2) * 0.9 : 0.58 + (y - 0.7) / 0.26 * 0.385;
const P = (obj, x, y, rot = 0) => ({ obj, x, y: fy(y), rot });
export const DEFAULT_ROOMS = {
  living_room: [P('rug', 0.56, 0.9), P('couch', 0.3, 0.76), P('petbed', 0.78, 0.93), P('table', 0.8, 0.74), P('lamp', 0.8, 0.74 - 0.14), P('plant', 0.07 + 0.02, 0.78), P('picture', 0.3, 0.34), P('clock', 0.6, 0.28), P('toybox', 0.88, 0.84), P('ball', 0.55, 0.92), P('yarn', 0.18, 0.93)],
  kitchen: [P('rug', 0.5, 0.92), P('table', 0.72, 0.76), P('vase', 0.72, 0.76 - 0.14), P('petbed', 0.2, 0.93), P('ball', 0.5, 0.94)],
  photo_studio: [P('armchair', 0.3, 0.8), P('plant', 0.86, 0.8), P('plush', 0.6, 0.93), P('ball', 0.45, 0.94)],
  backyard: [P('kennel', 0.82, 0.76), P('bench', 0.3, 0.74), P('flowerpot', 0.12, 0.8), P('ball', 0.5, 0.92), P('squeaky', 0.66, 0.94)],
  playground: [P('sandbox', 0.4, 0.9), P('bench', 0.78, 0.76), P('ball', 0.55, 0.93)],
  garden: [P('bench', 0.5, 0.76), P('flowerpot', 0.2, 0.84), P('flowerpot', 0.86, 0.84), P('ball', 0.4, 0.93)],
  training_yard: [P('bench', 0.2, 0.74), P('ball', 0.55, 0.93), P('squeaky', 0.7, 0.94)],
  adventure_gate: [P('bench', 0.8, 0.76), P('ball', 0.4, 0.93)],
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let seq = 0;
const uid = () => 'f' + Date.now().toString(36) + (seq++).toString(36);
export const depthScale = y => 0.7 + (y - 0.56) * 0.86;     // farther (smaller y) = smaller
/** Wall decor hangs on the back wall at a fixed size; everything on the floor follows depth. */
export const scaleOf = p => (FURNITURE[p.obj]?.cat === 'wall' ? 0.95 : depthScale(p.y));

/** Keep one placement inside its category's zone (never under the HUD, never off the world). */
export function constrain(p) {
  const f = FURNITURE[p.obj] || { cat: p.cat || 'floor' }, cat = f.cat, Z = ZONES[cat] || ZONES.floor;
  const half = (f.w || 0.1) * (cat === 'wall' ? 0.95 : depthScale(p.y)) / 2;
  p.cat = cat;
  p.x = clamp(+p.x || 0.5, ZONES.xMin + Math.min(half, 0.2), ZONES.xMax - Math.min(half, 0.2));
  if (!(cat === 'surface' && p.on)) p.y = clamp(+p.y || Z.yMax, Z.yMin, Z.yMax);
  p.rot = [0, 90, 180, 270].includes(((+p.rot % 360) + 360) % 360) ? ((+p.rot % 360) + 360) % 360 : 0;
  p.z = f.flat ? 0 : cat === 'wall' ? 1 : 2;
  return p;
}
export function ensureRooms(st, locIds) {
  const v = (st.v21 = st.v21 || {}); v.rooms = v.rooms && typeof v.rooms === 'object' ? v.rooms : {};
  for (const loc of locIds) {
    if (!Array.isArray(v.rooms[loc])) { v.rooms[loc] = (DEFAULT_ROOMS[loc] || [P('ball', 0.5, 0.93)]).filter(p => INDOOR.has(loc) || !FURNITURE[p.obj].indoor).map(p => constrain({ uid: uid(), loc, ...p })); for (const p of v.rooms[loc]) settleSurface(p, v.rooms[loc], 2); }
    v.rooms[loc] = v.rooms[loc].filter(p => FURNITURE[p.obj]).map(constrain);
    // every room keeps exactly one ball (the throwable toy)
    if (!v.rooms[loc].some(p => p.obj === 'ball')) v.rooms[loc].push(constrain({ uid: uid(), loc, obj: 'ball', x: 0.5, y: 0.93, rot: 0 }));
  }
  return v.rooms;
}
/** Bounding box in world units (x0,x1 of width; y0,y1 of height given aspect = H/W). */
export function bbox(p, aspect) {
  const f = FURNITURE[p.obj], s = scaleOf(p), side = p.rot === 90 || p.rot === 270 ? 0.6 : 1;
  const w = f.w * s * side, h = f.h * s / aspect;
  return { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - h, y1: p.y };
}
/** Top-most placement under a point (toys first, then nearest-to-camera). */
export function hitTest(list, x, y, aspect, pad = 0.02) {
  const order = [...list].sort((a, b) => (b.cat === 'toy') - (a.cat === 'toy') || b.z - a.z || b.y - a.y);
  return order.find(p => { const b = bbox(p, aspect); return x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad; }) || null;
}
/** Where a surface item lands: on a host's top if dropped over one, else on the floor. */
export function settleSurface(p, list, aspect) {
  if (FURNITURE[p.obj]?.cat !== 'surface') { delete p.on; return p; }
  const host = list.find(o => o !== p && FURNITURE[o.obj]?.host && Math.abs(o.x - p.x) < FURNITURE[o.obj].w * depthScale(o.y) / 2 && p.y <= o.y + 0.02 && p.y >= o.y - FURNITURE[o.obj].host * depthScale(o.y) / aspect - 0.06);
  if (host) { p.on = host.uid; p.y = host.y - FURNITURE[host.obj].host * depthScale(host.y) / aspect; p.x = clamp(p.x, host.x - 0.06, host.x + 0.06); }
  else { delete p.on; p.y = Math.max(p.y, ZONES.floor.yMin); }
  return p;
}

/* ---------------------------------------------------------------- Edit Room (draft → confirm | cancel) */
export function beginEdit(st, loc) { return { loc, draft: JSON.parse(JSON.stringify(st.v21.rooms[loc] || [])), selected: null, moved: 0 }; }
export function move(ed, uidv, x, y, aspect) {
  const p = ed.draft.find(o => o.uid === uidv); if (!p) return null;
  const dx = x - p.x, dy = y - p.y;
  p.x = x; p.y = y; constrain(p); settleSurface(p, ed.draft, aspect);
  // items sitting on this one travel with it
  for (const o of ed.draft) if (o.on === p.uid) { o.x += dx; o.y += dy; constrain(o); o.on = p.uid; }
  ed.moved++; return p;
}
export function rotate(ed, uidv, by = 90) { const p = ed.draft.find(o => o.uid === uidv); if (!p) return null; p.rot = (p.rot + by) % 360; constrain(p); ed.moved++; return p; }
export function store(ed, uidv) {
  const p = ed.draft.find(o => o.uid === uidv); if (!p || p.obj === 'ball') return { ok: false, reason: p ? 'ball' : 'missing' };
  ed.draft = ed.draft.filter(o => o.uid !== uidv && o.on !== uidv); ed.stored = [...(ed.stored || []), p.obj]; ed.moved++; return { ok: true };
}
export function add(ed, obj, x = 0.5, y) {
  const f = FURNITURE[obj]; if (!f) return null;
  const p = constrain({ uid: uid(), loc: ed.loc, obj, x, y: y ?? (ZONES[f.cat] || ZONES.floor).yMax - 0.04, rot: 0 });
  ed.draft.push(p); ed.moved++; return p;
}
export function confirm(st, ed) {
  st.v21.rooms[ed.loc] = ed.draft.map(p => constrain({ ...p }));
  st.v21.storage = [...(st.v21.storage || []), ...(ed.stored || [])];
  return st.v21.rooms[ed.loc];
}
/** Items put away in Edit Room can be placed again (never lost). */
export function takeFromStorage(st, obj) { const s = st.v21.storage || []; const i = s.indexOf(obj); if (i < 0) return false; s.splice(i, 1); return true; }
