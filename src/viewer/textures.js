// Procedural PBR textures drawn on canvases: wood plank flooring, porcelain tile, lap siding,
// painted drywall, quartz, fabric and grass. Each returns color (sRGB), roughness and bump maps.
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tileable value noise, returned as a Float32Array in [0,1].
function noiseField(size, seed, octaves = 4, base = 8) {
  const out = new Float32Array(size * size);
  const rand = rng(seed);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const g = base << o;
    const grid = new Float32Array(g * g);
    for (let i = 0; i < grid.length; i++) grid[i] = rand();
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * g, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
      const ya = (y0 % g) * g, yb = ((y0 + 1) % g) * g;
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * g, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
        const xa = x0 % g, xb = (x0 + 1) % g;
        const a = grid[ya + xa] + (grid[ya + xb] - grid[ya + xa]) * sx;
        const b = grid[yb + xa] + (grid[yb + xb] - grid[yb + xa]) * sx;
        out[y * size + x] += (a + (b - a) * sy) * amp;
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function tex(c, { color = false, repeat = 1 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.repeat.set(repeat, repeat);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}

const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

// Write a grayscale field into a canvas.
function grayCanvas(size, fn) {
  const [c, g] = canvas(size);
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.max(0, Math.min(255, fn(i) * 255));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Wood plank floor. One texture tile covers `tileFt` x `tileFt` feet. */
export function woodFloor(baseHex, seed = 7, { size = 1024, plankIn = 7, tileFt = 8 } = {}) {
  const rand = rng(seed);
  const [c, g] = canvas(size);
  const img = g.createImageData(size, size);
  const rough = new Float32Array(size * size);
  const bump = new Float32Array(size * size);
  const grain = noiseField(size, seed + 1, 5, 4);
  const fine = noiseField(size, seed + 2, 3, 64);
  const pxPerFt = size / tileFt;
  const plankPx = Math.round((plankIn / 12) * pxPerFt);
  const rows = Math.ceil(size / plankPx);
  const base = hex(baseHex);
  // Plank layout: rows along y, plank lengths 3-7 ft with random joints (wraps for tiling).
  const joints = [], tints = [];
  for (let r = 0; r < rows; r++) {
    const js = [];
    let x = Math.floor(rand() * size);
    const start = x;
    while (x < start + size) { js.push(x % size); x += Math.round((3 + rand() * 4) * pxPerFt); }
    joints.push(js.sort((a, b) => a - b));
    tints.push(js.map(() => 0.82 + rand() * 0.3));
  }
  for (let y = 0; y < size; y++) {
    const r = Math.min(rows - 1, Math.floor(y / plankPx));
    const yIn = y - r * plankPx;
    const js = joints[r];
    for (let x = 0; x < size; x++) {
      let k = js.length - 1;
      for (let j = 0; j < js.length; j++) if (x >= js[j]) k = j;
      const tint = tints[r][k];
      const i = y * size + x;
      // stretched grain: sample noise compressed along x
      const gx = Math.floor((x * 0.18 + k * 131 + r * 57) % size);
      const gi = ((y * 3 + r * 97) % size) * size + gx;
      const gr = grain[gi];
      const ring = 0.5 + 0.5 * Math.sin(gr * 38 + yIn * 0.15);
      let v = tint * (0.8 + 0.25 * ring + 0.12 * (fine[i] - 0.5));
      let seam = 0;
      if (yIn < 2 || js.some((jx) => Math.abs(x - jx) < 2)) seam = 1;
      if (seam) v *= 0.55;
      img.data[i * 4] = Math.min(255, base[0] * v);
      img.data[i * 4 + 1] = Math.min(255, base[1] * v);
      img.data[i * 4 + 2] = Math.min(255, base[2] * v);
      img.data[i * 4 + 3] = 255;
      rough[i] = 0.42 + 0.18 * fine[i] + 0.1 * ring + (seam ? 0.3 : 0);
      bump[i] = seam ? 0.1 : 0.55 + 0.15 * ring + 0.1 * fine[i];
    }
  }
  g.putImageData(img, 0, 0);
  return {
    map: tex(c, { color: true }),
    roughnessMap: tex(grayCanvas(size, (i) => rough[i])),
    bumpMap: tex(grayCanvas(size, (i) => bump[i])),
    tileFt
  };
}

/** Square porcelain tile with grout. */
export function tileFloor(baseHex, groutHex, seed = 11, { size = 1024, tileIn = 24, tileFt = 4 } = {}) {
  const [c, g] = canvas(size);
  const img = g.createImageData(size, size);
  const n = noiseField(size, seed, 5, 6);
  const fine = noiseField(size, seed + 3, 2, 96);
  const per = Math.round((tileIn / 12) * (size / tileFt));
  const groutPx = 4;
  const base = hex(baseHex), gr = hex(groutHex);
  const rough = new Float32Array(size * size), bump = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const isG = x % per < groutPx || y % per < groutPx;
    const cell = Math.floor(x / per) * 7 + Math.floor(y / per) * 13;
    const v = isG ? 1 : 0.94 + 0.08 * n[(i + cell * 997) % (size * size)] + 0.03 * fine[i];
    const col = isG ? gr : base;
    img.data[i * 4] = Math.min(255, col[0] * v);
    img.data[i * 4 + 1] = Math.min(255, col[1] * v);
    img.data[i * 4 + 2] = Math.min(255, col[2] * v);
    img.data[i * 4 + 3] = 255;
    rough[i] = isG ? 0.9 : 0.18 + 0.1 * fine[i];
    bump[i] = isG ? 0.2 : 0.8;
  }
  g.putImageData(img, 0, 0);
  return {
    map: tex(c, { color: true }),
    roughnessMap: tex(grayCanvas(size, (i) => rough[i])),
    bumpMap: tex(grayCanvas(size, (i) => bump[i])),
    tileFt
  };
}

/** Horizontal lap siding, 7" exposure. */
export function lapSiding(baseHex, seed = 21, { size = 512, exposureIn = 7, tileFt = 4 } = {}) {
  const [c, g] = canvas(size);
  const img = g.createImageData(size, size);
  const n = noiseField(size, seed, 4, 8);
  const per = Math.round((exposureIn / 12) * (size / tileFt));
  const base = hex(baseHex);
  const bump = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const t = (y % per) / per; // 0 at the drip edge (bottom of the board above)
    const shade = t < 0.06 ? 0.62 : 0.9 + 0.1 * t;
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const v = shade * (0.96 + 0.06 * n[i]);
      img.data[i * 4] = Math.min(255, base[0] * v);
      img.data[i * 4 + 1] = Math.min(255, base[1] * v);
      img.data[i * 4 + 2] = Math.min(255, base[2] * v);
      img.data[i * 4 + 3] = 255;
      bump[i] = t < 0.06 ? 0 : 0.3 + 0.7 * t;
    }
  }
  g.putImageData(img, 0, 0);
  return { map: tex(c, { color: true }), bumpMap: tex(grayCanvas(size, (i) => bump[i])), tileFt };
}

/** Fine noise used as a bump map for paint, plaster and fabric. */
export function finishNoise(seed = 31, scale = 64, size = 512) {
  const n = noiseField(size, seed, 3, scale);
  return tex(grayCanvas(size, (i) => n[i]));
}

/** Quartz countertop with soft veining. */
export function quartz(baseHex, veinHex, seed = 41, size = 1024) {
  const [c, g] = canvas(size);
  const img = g.createImageData(size, size);
  const n = noiseField(size, seed, 6, 3);
  const speck = noiseField(size, seed + 1, 1, 256);
  const base = hex(baseHex), vein = hex(veinHex);
  for (let i = 0; i < size * size; i++) {
    const x = i % size, y = (i / size) | 0;
    const vv = Math.abs(Math.sin((x * 0.004 + y * 0.002 + n[i] * 6) * Math.PI));
    const m = Math.pow(1 - vv, 18) * 0.85;
    const s = 0.97 + 0.04 * speck[i];
    for (let ch = 0; ch < 3; ch++) img.data[i * 4 + ch] = (base[ch] * (1 - m) + vein[ch] * m) * s;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { map: tex(c, { color: true }), tileFt: 6 };
}

/** Woven rug with a border. Not tiled: maps once across the rug. */
export function rug(fieldHex, borderHex, seed = 51, size = 1024) {
  const [c, g] = canvas(size);
  const img = g.createImageData(size, size);
  const n = noiseField(size, seed, 4, 16);
  const weave = noiseField(size, seed + 1, 1, 256);
  const f = hex(fieldHex), b = hex(borderHex);
  for (let i = 0; i < size * size; i++) {
    const x = i % size, y = (i / size) | 0;
    const ex = Math.min(x, size - 1 - x) / size, ey = Math.min(y, size - 1 - y) / size;
    const e = Math.min(ex, ey);
    const isB = (e > 0.04 && e < 0.075) || (e > 0.1 && e < 0.11);
    const col = isB ? b : f;
    const v = 0.88 + 0.14 * n[i] + 0.08 * (weave[i] - 0.5);
    for (let ch = 0; ch < 3; ch++) img.data[i * 4 + ch] = Math.min(255, col[ch] * v);
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = tex(c, { color: true });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return { map: t, bumpMap: tex(grayCanvas(size, (i) => weave[i])) };
}

/** Lawn for the lot around the house. */
export function grass(seed = 61, size = 512) {
  const [c, g] = canvas(size);
  const img = g.createImageData(size, size);
  const n = noiseField(size, seed, 5, 4);
  const blade = noiseField(size, seed + 1, 1, 200);
  for (let i = 0; i < size * size; i++) {
    const v = 0.75 + 0.3 * n[i] + 0.2 * (blade[i] - 0.5);
    img.data[i * 4] = 86 * v;
    img.data[i * 4 + 1] = 112 * v;
    img.data[i * 4 + 2] = 58 * v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { map: tex(c, { color: true }), tileFt: 12 };
}
