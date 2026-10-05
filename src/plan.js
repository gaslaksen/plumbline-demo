// Sample plan geometry, in feet. x runs across the front of the house, z from front to back.
// The 2D plan, the 3D model and the material takeoff are all computed from this one source.

export const PLAN = {
  W: 60,
  D: 34,
  rooms: [
    { id: 'living', name: 'Great room', x0: 0, z0: 0, x1: 24, z1: 20, floor: 'wood' },
    { id: 'kitchen', name: 'Kitchen and dining', x0: 24, z0: 0, x1: 42, z1: 20, floor: 'wood' },
    { id: 'primary', name: 'Primary bedroom', x0: 42, z0: 0, x1: 60, z1: 20, floor: 'wood' },
    { id: 'hall', name: 'Hall', x0: 0, z0: 20, x1: 52, z1: 24, floor: 'wood' },
    { id: 'closet', name: 'Closet', x0: 52, z0: 20, x1: 60, z1: 34, floor: 'wood' },
    { id: 'bed2', name: 'Bedroom 2', x0: 0, z0: 24, x1: 14, z1: 34, floor: 'wood' },
    { id: 'bath2', name: 'Bath 2', x0: 14, z0: 24, x1: 22, z1: 34, floor: 'tile', wet: true },
    { id: 'bed3', name: 'Bedroom 3', x0: 22, z0: 24, x1: 34, z1: 34, floor: 'wood' },
    { id: 'laundry', name: 'Laundry', x0: 34, z0: 24, x1: 42, z1: 34, floor: 'tile', wet: true },
    { id: 'pbath', name: 'Primary bath', x0: 42, z0: 24, x1: 52, z1: 34, floor: 'tile', wet: true }
  ]
};

// Edges between rooms that have no wall (great room, kitchen and hall are open to each other).
export const OPEN_EDGE_LF = 20 + 24 + 18;

// Openings: offset `at` (ft) measured from wall point a toward b; `w` is the rough opening width.
export const WALLS = [
  { id: 'front', ext: true, a: [0, 0], b: [60, 0], o: [{ t: 'win', at: 3, w: 5 }, { t: 'door', at: 10, w: 3 }, { t: 'win', at: 16, w: 5 }, { t: 'win', at: 30, w: 5 }, { t: 'win', at: 48, w: 6 }] },
  { id: 'right', ext: true, a: [60, 0], b: [60, 34], o: [{ t: 'win', at: 6, w: 5 }] },
  { id: 'back', ext: true, a: [60, 34], b: [0, 34], o: [{ t: 'win', at: 12, w: 3 }, { t: 'win', at: 30, w: 5 }, { t: 'win', at: 51, w: 5 }] },
  { id: 'left', ext: true, a: [0, 34], b: [0, 0], o: [{ t: 'win', at: 3, w: 4 }, { t: 'win', at: 22, w: 6 }] },
  { id: 'i1', ext: false, a: [42, 0], b: [42, 20], o: [] },
  { id: 'i2', ext: false, a: [42, 20], b: [52, 20], o: [{ t: 'door', at: 0.5, w: 3 }] },
  { id: 'i3', ext: false, a: [52, 20], b: [60, 20], o: [{ t: 'door', at: 5, w: 2.5 }] },
  { id: 'i4', ext: false, a: [0, 24], b: [52, 24], o: [{ t: 'door', at: 9, w: 2.67 }, { t: 'door', at: 16, w: 2.5 }, { t: 'door', at: 26, w: 2.67 }, { t: 'door', at: 37, w: 2.67 }, { t: 'door', at: 45, w: 2.67 }] },
  { id: 'i5', ext: false, a: [52, 34], b: [52, 20], o: [{ t: 'door', at: 5.5, w: 2.5 }] },
  { id: 'i6', ext: false, a: [14, 24], b: [14, 34], o: [] },
  { id: 'i7', ext: false, a: [22, 24], b: [22, 34], o: [] },
  { id: 'i8', ext: false, a: [34, 24], b: [34, 34], o: [] },
  { id: 'i9', ext: false, a: [42, 24], b: [42, 34], o: [] }
];

export const DOOR_H = 6.67;
export const SILL = 3;
export const HEAD = 7;
export const wallLen = (w) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
export const thickness = (w) => (w.ext ? 0.5 : 0.4);

export const COUNTS = (() => {
  let doors = 0, windows = 0;
  WALLS.forEach((w) => w.o.forEach((o) => (o.t === 'door' ? doors++ : windows++)));
  return { walls: WALLS.length, doors, windows, rooms: PLAN.rooms.length };
})();

export const AREA = PLAN.rooms.reduce((s, r) => s + (r.x1 - r.x0) * (r.z1 - r.z0), 0);

export const ftin = (ft) => {
  const i = Math.round(ft * 12);
  return Math.floor(i / 12) + "'-" + (i % 12) + '"';
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Material takeoff. `a` = assumptions, `qtyEdits` / `priceEdits` = per-line overrides keyed by line key.
export function takeoff(a, qtyEdits = {}, priceEdits = {}) {
  const H = clamp(+a.height || 9, 7, 14);
  const sp = +a.spacing || 16;
  const wf = 1 + clamp(+a.waste || 0, 0, 40) / 100;
  const ext6 = a.ext === '2x6';
  let extLen = 0, intLen = 0, extOpen = 0, intOpenFaces = 0, studsExt = 0, studsInt = 0, headerLF = 0;
  const extDoors = {}, intDoors = {}, wins = {};

  WALLS.forEach((w) => {
    const L = wallLen(w);
    let add = 0;
    w.o.forEach((o) => {
      const h = o.t === 'door' ? DOOR_H : HEAD - SILL;
      const area = o.w * h;
      add += o.t === 'door' ? 3 : 4; // king + jack studs, plus sill cripples on windows
      headerLF += (o.w + 0.5) * 2;
      if (w.ext) extOpen += area; else intOpenFaces += area * 2;
      const k = ftin(o.w);
      if (o.t === 'door') { const m = w.ext ? extDoors : intDoors; m[k] = (m[k] || 0) + 1; }
      else { const kk = k + " × 4'-0\""; wins[kk] = (wins[kk] || 0) + 1; }
    });
    const studs = Math.ceil((L * 12) / sp) + 1 + 2 + add; // +2 for corners and intersections
    if (w.ext) { extLen += L; studsExt += studs; } else { intLen += L; studsInt += studs; }
  });

  const extNet = extLen * H - extOpen;
  const wallDW = 2 * intLen * H - intOpenFaces + extNet;
  const wet = PLAN.rooms.filter((r) => r.wet);
  const wetWall = wet.reduce((s, r) => s + 2 * (r.x1 - r.x0 + (r.z1 - r.z0)) * H, 0);
  const wetFloor = wet.reduce((s, r) => s + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
  const ceil = a.ceilings ? AREA : 0;
  const ceilWet = a.ceilings ? wetFloor : 0;
  const mr = Math.min(wetWall, wallDW) + ceilWet;
  const reg = Math.max(0, wallDW - Math.min(wetWall, wallDW)) + ceil - ceilWet;
  const wood = PLAN.rooms.filter((r) => r.floor === 'wood').reduce((s, r) => s + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
  const tile = AREA - wood;
  const perim = PLAN.rooms.reduce((s, r) => s + 2 * (r.x1 - r.x0 + (r.z1 - r.z0)), 0);
  let doorW = 0;
  WALLS.forEach((w) => w.o.forEach((o) => { if (o.t === 'door') doorW += w.ext ? o.w : o.w * 2; }));
  const baseLF = perim - 2 * OPEN_EDGE_LF - doorW;
  const sz = ext6 ? '2x6' : '2x4';

  const rows = [
    ['Framing', 'studExt', `${sz} exterior studs, ${H}' walls`, Math.ceil(studsExt * wf), 'ea', ext6 ? 9.8 : 6.2],
    ['Framing', 'studInt', `2x4 interior studs, ${H}' walls`, Math.ceil(studsInt * wf), 'ea', 6.2],
    ['Framing', 'bpExt', `Treated bottom plate, ${sz} × 16'`, Math.ceil((extLen / 16) * wf), 'ea', ext6 ? 16.5 : 11.4],
    ['Framing', 'bpInt', "Treated bottom plate, 2x4 × 16'", Math.ceil((intLen / 16) * wf), 'ea', 11.4],
    ['Framing', 'tpExt', `Double top plate, ${sz} × 16'`, Math.ceil(((2 * extLen) / 16) * wf), 'ea', ext6 ? 13.9 : 8.9],
    ['Framing', 'tpInt', "Double top plate, 2x4 × 16'", Math.ceil(((2 * intLen) / 16) * wf), 'ea', 8.9],
    ['Framing', 'hdr', 'Headers, 2x10, two-ply', Math.ceil(headerLF * wf), 'LF', 2.4],
    ['Sheathing and wrap', 'osb', `7/16" OSB wall sheathing, 4' × ${H}'`, Math.ceil((extNet / (4 * H)) * wf), 'ea', 24 + (H - 8) * 3],
    ['Sheathing and wrap', 'wrap', "House wrap, 9' × 150' roll", Math.ceil((extNet * wf) / 1350), 'roll', 185],
    ['Insulation', 'batt', `${ext6 ? 'R-21' : 'R-15'} wall batts`, Math.ceil(extNet * wf), 'sf', ext6 ? 0.95 : 0.7],
    ['Insulation', 'blown', 'R-38 blown ceiling insulation', Math.ceil(AREA * wf), 'sf', 1.35],
    ['Drywall', 'dw', `1/2" drywall, 4' × 12'`, Math.ceil((reg * wf) / 48), 'ea', 19],
    ['Drywall', 'mr', `1/2" moisture-resistant drywall, 4' × 12'`, Math.ceil((mr * wf) / 48), 'ea', 24]
  ];
  Object.entries(extDoors).forEach(([k, n]) => rows.push(['Doors and windows', 'xd' + k, `Exterior entry door, ${k}`, n, 'ea', 1250]));
  Object.entries(intDoors).forEach(([k, n]) => rows.push(['Doors and windows', 'id' + k, `Interior door, prehung, ${k}`, n, 'ea', 210]));
  Object.entries(wins).forEach(([k, n]) => {
    const w = parseInt(k, 10);
    rows.push(['Doors and windows', 'w' + k, `Window, impact-rated, ${k}`, n, 'ea', Math.round(140 * w + 90)]);
  });
  rows.push(
    ['Flooring', 'lvp', 'Luxury vinyl plank', Math.ceil(wood * wf), 'sf', 3.4],
    ['Flooring', 'tile', 'Porcelain floor tile', Math.ceil(tile * wf), 'sf', 5.5],
    ['Trim and paint', 'base', 'Baseboard, primed MDF', Math.ceil(baseLF * wf), 'LF', 1.85],
    ['Trim and paint', 'pw', 'Interior wall paint, 2 coats', Math.ceil(((wallDW * 2) / 350) * wf), 'gal', 42],
    ['Trim and paint', 'pc', 'Ceiling paint, 1 coat', a.ceilings ? Math.ceil((AREA / 350) * wf) : 0, 'gal', 34]
  );

  return rows.map((r) => {
    const key = r[1];
    const q = qtyEdits[key];
    const p = priceEdits[key];
    return {
      cat: r[0], key, item: r[2], calc: r[3], qty: q != null ? q : r[3], unit: r[4],
      price: p != null ? p : r[5], qEdited: q != null, pEdited: p != null
    };
  });
}
