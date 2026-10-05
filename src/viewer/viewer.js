// Realistic real-time house viewer built from the plan, plus a path-traced photo mode.
// Units are feet throughout; glTF furniture (authored in meters) is scaled by FT_PER_M.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { N8AOPass } from 'n8ao';
import { PLAN, WALLS, DOOR_H, SILL, HEAD, wallLen, thickness } from '../plan.js';
import * as TX from './textures.js';
import { ROOMS_WALK } from './rooms.js';
export { ROOMS_WALK };

const FT_PER_M = 3.28084;
const EYE = 5.4;
const R_PLAYER = 0.9;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);



const PALETTES = {
  coastal: {
    paint: 0xeeebe4, ceiling: 0xf5f4f0, trim: 0xf7f6f2, siding: 0xdbe3e7, wood: 0xc29159, tile: 0xe6e3dd, grout: 0xb6b1a8,
    cab: 0xf1f0eb, island: 0x5e7a8f, counter: 0xf2f0eb, vein: 0xb5b2ac, hardware: 0xb08d57, steel: 0xc8cbcd,
    bedding: 0xf2efe8, accent: 0x8fa9b8, furn: 0x9c7a55, rugField: 0xcfc8b8, rugBorder: 0x6f8796, frontDoor: 0x2f5d73,
    deck: 0x8a7764, found: 0xbdb8ae, chair: 0xd9d2c3, shade: 0xf3ebdd
  },
  modern: {
    paint: 0xebeae7, ceiling: 0xf3f3f1, trim: 0xf0f0ee, siding: 0x3b4044, wood: 0x6d4f35, tile: 0x8e8d89, grout: 0x5d5c58,
    cab: 0x2d3134, island: 0x2d3134, counter: 0xe9e7e2, vein: 0x9a9894, hardware: 0x1f1f1f, steel: 0xb9bcbe,
    bedding: 0xe9e7e3, accent: 0x5d6b72, furn: 0x4d3a2a, rugField: 0x55595c, rugBorder: 0x2b2e30, frontDoor: 0x1e1f21,
    deck: 0x5a4a3c, found: 0x8f8b84, chair: 0x6a6e70, shade: 0xe8e2d6
  }
};

const MODELS = ['SheenWoodLeatherSofa', 'SheenChair', 'GlamVelvetSofa', 'AnisotropyBarnLamp', 'DiffuseTransmissionPlant'];
// Fabric choices per finish, from each model's KHR_materials_variants list.
const VARIANTS = { coastal: { SheenChair: 'Peacock Velvet', GlamVelvetSofa: 'Champagne' }, modern: { SheenChair: 'Mango Velvet', GlamVelvetSofa: 'Gray' } };

export async function createViewer(stage, { mobile = false, onPhoto = () => {} } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = 'three-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '3D model of the sample house. Drag to look around. In walk mode use W A S D or the arrow buttons.');
  stage.prepend(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.3, 3000);

  // Sky and image-based light
  const hdr = await new RGBELoader().setDataType(THREE.FloatType).loadAsync('/hdri/forest_slope_1k.hdr');
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = hdr;
  scene.environment = hdr;
  scene.backgroundRotation.y = scene.environmentRotation.y = 2.4;

  const sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 2048 : 4096, mobile ? 2048 : 4096);
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 260 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  sun.shadow.radius = 3;
  sun.target.position.set(30, 0, 17);
  sun.position.copy(sun.target.position).add(new THREE.Vector3(-0.55, 0.62, -0.56).normalize().multiplyScalar(120));
  scene.add(sun, sun.target);
  // Soft fill standing in for light bouncing off floors and walls indoors.
  const bounce = new THREE.HemisphereLight(0xfffaf2, 0xcdbfa8, 0);
  scene.add(bounce);

  const composer = new EffectComposer(renderer);
  const ao = new N8AOPass(scene, camera, 16, 9);
  ao.configuration.aoRadius = 2.2;
  ao.configuration.distanceFalloff = 1.0;
  ao.configuration.intensity = 2.4;
  ao.configuration.gammaCorrection = false;
  if (mobile) ao.configuration.halfRes = true;
  ao.setQualityMode(mobile ? 'Low' : 'Medium');
  composer.addPass(ao);
  composer.addPass(new OutputPass());

  // Models
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const models = {};
  const variantMats = {};
  const modelsReady = Promise.all(MODELS.map((n) => loader.loadAsync(`/models/${n}.glb`).then(async (g) => {
    const json = g.parser.json;
    const names = (json.extensions && json.extensions.KHR_materials_variants && json.extensions.KHR_materials_variants.variants || []).map((x) => x.name);
    const need = new Set();
    g.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      // Keep one attribute layout across every mesh so the photo renderer can merge them safely.
      for (const k of Object.keys(o.geometry.attributes)) if (!['position', 'normal', 'uv'].includes(k)) o.geometry.deleteAttribute(k);
      if (!o.geometry.attributes.uv) o.geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(o.geometry.attributes.position.count * 2), 2));
      const a = g.parser.associations.get(o);
      const prim = a && a.meshes != null && json.meshes[a.meshes].primitives[a.primitives];
      const ext = prim && prim.extensions && prim.extensions.KHR_materials_variants;
      if (!ext) return;
      o.userData.vmap = {};
      ext.mappings.forEach((mp) => mp.variants.forEach((vi) => { o.userData.vmap[names[vi]] = mp.material; need.add(mp.material); }));
    });
    variantMats[n] = {};
    await Promise.all([...need].map((i) => g.parser.getDependency('material', i).then((m) => { variantMats[n][i] = m; })));
    models[n] = g.scene;
  }).catch(() => {})));

  const st = {
    mode: 'orbit', style: 'coastal', furnished: true, height: 9, lighting: 'day',
    orbit: { az: -0.75, el: 0.82, rad: 92, tx: 30, tz: 15 },
    walk: { x: 11.5, z: -6.5, yaw: 0, pitch: -0.05 },
    keys: {}, held: null, drag: null, anim: null, raf: 0, last: 0, running: false,
    photo: null, house: null, ceilings: [], lamps: [], roomLights: [], segs: [], boxes: [], built: ''
  };
  const texCache = {};
  const tx = (key, fn) => texCache[key] || (texCache[key] = fn());

  // Thin transparent pane: keeps the view outside sharp.
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.12, ior: 1.5, thickness: 0.02 });


  /* ---------------- materials ---------------- */
  function materials(p) {
    const k = st.style;
    const wood = tx('wood' + k, () => TX.woodFloor(p.wood, 7));
    const tile = tx('tile' + k, () => TX.tileFloor(p.tile, p.grout, 11));
    const siding = tx('siding' + k, () => TX.lapSiding(p.siding, 21));
    const paintN = tx('paintN', () => TX.finishNoise(31, 96));
    const fabricN = tx('fabricN', () => TX.finishNoise(33, 160));
    const qz = tx('quartz' + k, () => TX.quartz(p.counter, p.vein, 41));
    const rugT = tx('rug' + k, () => TX.rug(p.rugField, p.rugBorder, 51));
    const lawn = tx('grass', () => TX.grass(61));
    const furnWood = tx('furnWood' + k, () => TX.woodFloor(p.furn, 9, { plankIn: 30, tileFt: 6 }));
    const S = (o) => new THREE.MeshStandardMaterial(o);
    const P = (o) => new THREE.MeshPhysicalMaterial(o);
    const tiled = (m, t) => { m.userData.tile = t; return m; };
    return {
      paint: tiled(S({ color: p.paint, roughness: 0.9 }), 3),
      siding: tiled(S({ color: 0xffffff, map: siding.map, bumpMap: siding.bumpMap, bumpScale: 2.5, roughness: 0.75 }), siding.tileFt),
      ceiling: tiled(S({ color: p.ceiling, roughness: 0.95 }), 3),
      trim: S({ color: p.trim, roughness: 0.38 }),
      wood: tiled(S({ map: wood.map, roughnessMap: wood.roughnessMap, bumpMap: wood.bumpMap, bumpScale: 1.2 }), wood.tileFt),
      tile: tiled(S({ map: tile.map, roughnessMap: tile.roughnessMap, bumpMap: tile.bumpMap, bumpScale: 1.5 }), tile.tileFt),
      cab: S({ color: p.cab, roughness: 0.45 }),
      island: S({ color: p.island, roughness: 0.45 }),
      counter: tiled(P({ map: qz.map, roughness: 0.12, clearcoat: 0.6, clearcoatRoughness: 0.1 }), qz.tileFt),
      hardware: S({ color: p.hardware, metalness: 1, roughness: 0.3 }),
      steel: S({ color: p.steel, metalness: 1, roughness: 0.28 }),
      black: S({ color: 0x111214, roughness: 0.25 }),
      screen: S({ color: 0x050607, roughness: 0.08, metalness: 0.2 }),
      porcelain: P({ color: 0xf6f6f4, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
      mirror: S({ color: 0xffffff, metalness: 1, roughness: 0.02 }),
      glass: glassMat,
      bedding: P({ color: p.bedding, roughness: 0.95, sheen: 1, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.6, bumpMap: fabricN, bumpScale: 0.15 }),
      accent: P({ color: p.accent, roughness: 0.9, sheen: 0.8, sheenColor: new THREE.Color(p.accent), bumpMap: fabricN, bumpScale: 0.15 }),
      upholstery: P({ color: p.chair, roughness: 0.9, sheen: 0.6, sheenColor: new THREE.Color(0xffffff), bumpMap: fabricN, bumpScale: 0.15 }),
      furn: tiled(S({ map: furnWood.map, roughnessMap: furnWood.roughnessMap, bumpMap: furnWood.bumpMap, bumpScale: 0.6, color: 0xffffff }), 6),
      rug: S({ map: rugT.map, bumpMap: rugT.bumpMap, bumpScale: 1.5, roughness: 1 }),
      deck: tiled(S({ map: wood.map, color: p.deck, roughnessMap: wood.roughnessMap, bumpMap: wood.bumpMap, bumpScale: 1.5 }), wood.tileFt),
      found: tiled(S({ color: p.found, roughness: 0.95, bumpMap: paintN, bumpScale: 0.3 }), 4),
      concrete: tiled(S({ color: 0xbfbcb5, roughness: 0.9, bumpMap: paintN, bumpScale: 0.3 }), 4),
      lawn: tiled(S({ map: lawn.map, roughness: 1 }), lawn.tileFt),
      frontDoor: S({ color: p.frontDoor, roughness: 0.35 }),
      shade: S({ color: p.shade, roughness: 0.8, emissive: new THREE.Color(0xffd9a8), emissiveIntensity: 0.25, side: THREE.DoubleSide }),
      bulb: S({ color: 0xffffff, emissive: new THREE.Color(0xffe2bf), emissiveIntensity: 2 })
    };
  }

  /* ---------------- house builder ---------------- */
  function build() {
    const key = [st.style, st.height, st.furnished].join('|');
    if (st.built === key && st.house) return;
    st.built = key;
    if (st.house) {
      scene.remove(st.house);
      st.house.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); });
      st.roomLights.forEach((l) => scene.remove(l));
    }
    const H = clamp(st.height, 8, 12);
    const p = PALETTES[st.style];
    const M = materials(p);
    const group = new THREE.Group();
    const staticG = new THREE.Group();     // merged by material later
    const ceilG = new THREE.Group();       // shown only in walk mode
    const dyn = new THREE.Group();         // doors, models, lamps (not merged)
    group.add(staticG, ceilG, dyn);
    st.segs = [];
    st.boxes = [];
    st.lamps = [];

    const mesh = (geo, mat, parent = staticG) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = mat !== M.glass;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    // Axis box: bottom at y0, centered on x/z.
    const box = (w, h, d, mat, x, y0, z, ry = 0, parent, r = 0) => {
      const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
      const m = mesh(geo, mat, parent);
      m.position.set(x, y0 + h / 2, z);
      m.rotation.y = ry;
      return m;
    };
    const solid = (x0, x1, z0, z1) => st.boxes.push([x0, x1, z0, z1]);

    // Site: lawn, foundation, porch, steps and walk
    box(1200, 0.2, 1200, M.lawn, 30, -1.4, 17);
    box(60.2, 1.1, 34.2, M.found, 30, -1.2, 17);
    box(30, 1.0, 8, M.found, 15, -1.2, -4);
    box(30, 0.2, 8, M.deck, 15, -0.2, -4);
    box(4.5, 0.4, 1, M.deck, 11.5, -0.6, -8.5);
    box(4.5, 0.4, 1, M.deck, 11.5, -1.0, -9.5);
    box(4, 0.08, 34, M.concrete, 11.5, -1.24, -27);
    [0.6, 10, 20, 29.4].forEach((x) => { box(0.75, H - 0.3, 0.75, M.trim, x, 0, -7.6); box(1, 0.3, 1, M.trim, x, 0, -7.6); });
    box(30.6, 0.9, 0.8, M.trim, 15, H - 0.9, -7.6);
    box(30.6, 0.35, 8.6, M.ceiling, 15, H, -4);

    // Floors and ceilings
    PLAN.rooms.forEach((r) => {
      const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      box(w, 0.1, d, r.floor === 'tile' ? M.tile : M.wood, cx, -0.1, cz);
      box(w, 0.2, d, M.ceiling, cx, H, cz, 0, ceilG);
    });

    // Walls, baseboards, windows, door casings and door slabs
    WALLS.forEach((wl) => {
      const L = wallLen(wl), t = thickness(wl);
      const dx = (wl.b[0] - wl.a[0]) / L, dz = (wl.b[1] - wl.a[1]) / L;
      const nx = -dz, nz = dx; // inward normal for exterior walls
      const rot = -Math.atan2(dz, dx);
      const at = (s, off = 0) => [wl.a[0] + dx * s + nx * off, wl.a[1] + dz * s + nz * off];
      const piece = (s0, s1, y0, y1, off = 0, depth = t, mat) => {
        if (s1 - s0 < 0.01 || y1 - y0 < 0.01) return;
        const [cx, cz] = at((s0 + s1) / 2, off);
        const m = box(s1 - s0, y1 - y0, depth, mat || M.paint, cx, y0, cz, rot);
        if (wl.ext && !mat) {
          // Exterior walls: siding on the outside face (-local z), paint inside.
          m.material = [M.paint, M.paint, M.paint, M.paint, M.paint, M.siding];
        }
        return m;
      };
      const base = (s0, s1) => {
        if (s1 - s0 < 0.05) return;
        const off = t / 2 + 0.03;
        piece(s0, s1, 0, 0.36, off, 0.06, M.trim);
        if (!wl.ext) piece(s0, s1, 0, 0.36, -off, 0.06, M.trim);
      };
      const wallSeg = (s0, s1) => { st.segs.push([...at(s0), ...at(s1), t / 2]); };
      let c = wl.ext ? -t / 2 : 0;
      [...wl.o].sort((p1, p2) => p1.at - p2.at).forEach((o) => {
        piece(c, o.at, 0, H); base(Math.max(c, 0), o.at); wallSeg(c, o.at);
        const s0 = o.at, s1 = o.at + o.w;
        if (o.t === 'door') {
          piece(s0, s1, DOOR_H, H);
          // casing on both faces
          [1, wl.ext ? 0 : -1].filter(Boolean).forEach((sgn) => {
            const off = sgn * (t / 2 + 0.03);
            piece(s0 - 0.3, s0, 0, DOOR_H + 0.3, off, 0.06, M.trim);
            piece(s1, s1 + 0.3, 0, DOOR_H + 0.3, off, 0.06, M.trim);
            piece(s0 - 0.3, s1 + 0.3, DOOR_H, DOOR_H + 0.3, off, 0.06, M.trim);
          });
          if (wl.ext) piece(s0 - 0.3, s1 + 0.3, DOOR_H, DOOR_H + 0.35, -(t / 2 + 0.03), 0.08, M.trim);
          // slab, hinged at s0, swung ~75 degrees toward the inward normal
          const slabW = o.w - 0.1, ang = 1.3;
          const hinge = at(s0 + 0.05);
          const slab = new THREE.Group();
          slab.position.set(hinge[0], 0, hinge[1]);
          slab.rotation.y = rot - ang;
          dyn.add(slab);
          const leaf = box(slabW, DOOR_H - 0.05, 0.15, wl.ext ? M.frontDoor : M.trim, slabW / 2, 0.02, 0, 0, slab);
          leaf.userData.door = true;
          box(0.06, 0.06, 0.4, M.hardware, slabW - 0.25, 3, 0, 0, slab);
        } else {
          piece(s0, s1, 0, SILL); piece(s0, s1, HEAD, H); wallSeg(s0, s1);
          const fr = 0.16, fd = t * 0.6;
          piece(s0, s0 + fr, SILL, HEAD, 0, fd, M.trim);
          piece(s1 - fr, s1, SILL, HEAD, 0, fd, M.trim);
          piece(s0, s1, HEAD - fr, HEAD, 0, fd, M.trim);
          piece(s0, s1, SILL, SILL + fr, 0, fd, M.trim);
          piece(s0 + fr, s1 - fr, (SILL + HEAD) / 2 - 0.06, (SILL + HEAD) / 2 + 0.06, 0, fd * 0.8, M.trim);
          if (o.w >= 5) piece((s0 + s1) / 2 - 0.06, (s0 + s1) / 2 + 0.06, SILL + fr, HEAD - fr, 0, fd * 0.8, M.trim);
          const [gx, gz] = at((s0 + s1) / 2);
          box(o.w - 2 * fr, HEAD - SILL - 2 * fr, 0.04, M.glass, gx, SILL + fr, gz, rot, dyn);
          // interior stool and apron, exterior sill
          piece(s0 - 0.25, s1 + 0.25, SILL - 0.08, SILL, t / 2 + 0.2, 0.4, M.trim);
          piece(s0 - 0.2, s1 + 0.2, SILL - 0.35, SILL - 0.08, t / 2 + 0.03, 0.06, M.trim);
          piece(s0 - 0.15, s1 + 0.15, SILL - 0.12, SILL, -(t / 2 + 0.12), 0.25, M.trim);
          piece(s0 - 0.35, s0, SILL, HEAD + 0.35, -(t / 2 + 0.04), 0.08, M.trim);
          piece(s1, s1 + 0.35, SILL, HEAD + 0.35, -(t / 2 + 0.04), 0.08, M.trim);
          piece(s0 - 0.35, s1 + 0.35, HEAD, HEAD + 0.35, -(t / 2 + 0.04), 0.08, M.trim);
        }
        c = s1;
      });
      const end = wl.ext ? L + t / 2 : L;
      piece(c, end, 0, H); base(c, Math.min(end, L)); wallSeg(c, end);
      // crown-ish frieze board on the outside at the top
      if (wl.ext) piece(-t / 2, L + t / 2, H - 0.7, H, -(t / 2 + 0.04), 0.08, M.trim);
    });

    if (st.furnished) furnish(M, H, box, dyn, solid);

    // Merge static meshes by material, with world-scale UVs for tiled materials.
    group.updateMatrixWorld(true);
    mergeStatic(staticG);
    mergeStatic(ceilG);
    st.ceilings = ceilG;
    ceilG.visible = st.mode === 'walk';

    // Room lights near the ceiling
    st.roomLights = [];
    const lp = [[7, 10], [17, 10], [29, 9], [36, 14], [51, 10], [20, 22], [44, 22], [7, 29], [18, 29], [28, 29], [38, 29], [47, 29], [56, 27], [15, -4]];
    lp.forEach(([x, z]) => {
      const l = new THREE.PointLight(0xffd6a8, 0, 0, 2);
      l.position.set(x, H - 0.8, z);
      st.roomLights.push(l);
      group.add(l);
    });

    scene.add(group);
    st.house = group;
    applyLighting();
  }

  function mergeStatic(g) {
    const buckets = new Map();
    g.children.slice().forEach((m) => {
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      geo.applyMatrix4(m.matrixWorld);
      if (mats.length > 1) {
        // split multi-material boxes by group
        m.geometry.groups.forEach((gr) => {
          const part = new THREE.BufferGeometry();
          for (const name of ['position', 'normal', 'uv']) {
            const a = geo.getAttribute(name);
            part.setAttribute(name, new THREE.BufferAttribute(a.array.slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize), a.itemSize));
          }
          addBucket(buckets, mats[gr.materialIndex], part);
        });
      } else addBucket(buckets, mats[0], geo);
      g.remove(m);
      m.geometry.dispose();
    });
    buckets.forEach((geos, mat) => {
      if (mat.userData.tile) geos.forEach((gg) => worldUV(gg, mat.userData.tile));
      const merged = mergeGeometries(geos.map((gg) => { for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gg.deleteAttribute(k); return gg; }));
      geos.forEach((gg) => gg.dispose());
      if (!merged) return;
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    });
  }
  function addBucket(b, mat, geo) {
    if (geo.index) geo = geo.toNonIndexed();
    if (!b.has(mat)) b.set(mat, []);
    b.get(mat).push(geo);
  }
  // Box-projected UVs from world position so tiles, planks and siding line up across pieces.
  function worldUV(geo, tile) {
    const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal');
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
      let u, v;
      if (ay >= ax && ay >= az) { u = pos.getX(i); v = pos.getZ(i); }
      else if (ax >= az) { u = pos.getZ(i); v = pos.getY(i); }
      else { u = pos.getX(i); v = pos.getY(i); }
      uv[i * 2] = u / tile;
      uv[i * 2 + 1] = v / tile;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }

  /* ---------------- furniture ---------------- */
  function furnish(M, H, box, dyn, solid) {
    const add = (mesh) => { mesh.castShadow = true; mesh.receiveShadow = true; return mesh; };
    const legs = (w, d, h, x, z, mat, inset = 0.15, s = 0.15) => {
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => box(s, h, s, mat, x + a * (w / 2 - inset), 0, z + b * (d / 2 - inset)));
    };
    const place = (name, x, z, ry, y = 0, s = 1) => {
      modelsReady.then(() => {
        const src = models[name];
        if (!src || st.house == null) return;
        const m = src.clone(true);
        m.scale.setScalar(FT_PER_M * s);
        m.rotation.y = ry;
        m.position.set(x, y, z);
        const variant = (VARIANTS[st.style] || {})[name];
        m.traverse((o) => {
          if (o.geometry) o.userData.shared = true;
          if (variant && o.userData.vmap && o.userData.vmap[variant] != null) o.material = variantMats[name][o.userData.vmap[variant]];
        });
        dyn.add(m);
      });
    };
    // Planar mirror: a real reflection of the room on desktop, a satin silver panel on phones.
    const mirror = (w, h, x, yc, z, ry) => {
      let m;
      if (mobile) m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: 0xd9dcde, metalness: 1, roughness: 0.18 }));
      else m = new Reflector(new THREE.PlaneGeometry(w, h), { textureWidth: 1024, textureHeight: 512, color: 0xcfd3d5, clipBias: 0.003 });
      m.position.set(x, yc, z);
      m.rotation.y = ry;
      dyn.add(m);
      box(w + 0.25, h + 0.25, 0.04, M.trim, x - Math.sin(ry) * 0.03, yc - (h + 0.25) / 2, z - Math.cos(ry) * 0.03, ry, dyn);
    };
    const lamp = (x, z, y0) => {
      box(0.3, 1.2, 0.3, M.hardware, x, y0, z, 0, dyn, 0.1);
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 0.9, 32, 1, true), M.shade);
      shade.position.set(x, y0 + 1.6, z);
      dyn.add(add(shade));
      st.lamps.push(shade);
    };
    const pendant = (x, z) => {
      box(0.03, H - 6.6, 0.03, M.black, x, 6.6, z, 0, dyn);
      const sh = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.shade);
      sh.position.set(x, 6.15, z);
      dyn.add(add(sh));
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 8), M.bulb);
      b.position.set(x, 6.15, z);
      dyn.add(b);
      st.lamps.push(sh);
    };
    const bed = (cx, cz, w, len, ry, headAt) => {
      // modeled facing +z (headboard at -z), then rotated
      const g = new THREE.Group();
      g.position.set(cx, 0, cz);
      g.rotation.y = ry;
      dyn.add(g);
      box(w + 0.3, 1.05, len, M.upholstery, 0, 0.35, 0, 0, g, 0.15);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => box(0.2, 0.35, 0.2, M.furn, a * (w / 2 - 0.1), 0, b * (len / 2 - 0.3), 0, g));
      box(w, 0.9, len - 0.3, M.bedding, 0, 1.1, 0.1, 0, g, 0.3);
      box(w + 0.1, 0.35, len * 0.62, M.bedding, 0, 1.75, len * 0.17, 0, g, 0.17);
      box(w + 0.16, 0.12, len * 0.22, M.accent, 0, 1.95, len * 0.36, 0, g, 0.06);
      const pw = w > 5.5 ? 3 : 2, pwid = (w - 0.4) / pw;
      for (let i = 0; i < pw; i++) box(pwid - 0.1, 0.55, 1.1, M.bedding, -w / 2 + 0.2 + pwid * (i + 0.5), 2.0, -len / 2 + 0.85, -0.12, g, 0.25);
      box(w + 0.5, headAt, 0.35, M.upholstery, 0, 0, -len / 2 - 0.1, 0, g, 0.12);
      const v = new THREE.Vector3();
      const corners = [[-(w + 0.5) / 2, -len / 2 - 0.3], [(w + 0.5) / 2, len / 2]].map(([a, b]) => { v.set(a, 0, b).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry); return [cx + v.x, cz + v.z]; });
      solid(Math.min(corners[0][0], corners[1][0]), Math.max(corners[0][0], corners[1][0]), Math.min(corners[0][1], corners[1][1]), Math.max(corners[0][1], corners[1][1]));
    };
    const nightstand = (x, z, ry) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; dyn.add(g);
      box(1.9, 2.1, 1.5, M.furn, 0, 0.25, 0, 0, g, 0.03);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => box(0.12, 0.25, 0.12, M.furn, a * 0.8, 0, b * 0.6, 0, g));
      box(1.7, 0.02, 0.02, M.black, 0, 1.35, 0.76, 0, g);
      box(0.4, 0.05, 0.05, M.hardware, 0, 1.75, 0.78, 0, g);
      lamp(x, z, 2.35);
    };
    const chair = (x, z, ry) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; dyn.add(g);
      box(1.55, 0.3, 1.55, M.upholstery, 0, 1.4, 0, 0, g, 0.1);
      box(1.5, 1.6, 0.18, M.upholstery, 0, 1.6, -0.72, -0.08, g, 0.08);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => box(0.12, 1.4, 0.12, M.furn, a * 0.65, 0, b * 0.65, 0, g));
    };
    const cabRun = (x0, x1, zWall, dir, mat, top = true, upper = false) => {
      // dir = +1 means fronts face +z (cabinet against wall at zWall)
      const depth = upper ? 1.1 : 2.0, h = upper ? 2.6 : 2.85, y0 = upper ? 4.6 : 0.33;
      const cz = zWall + dir * depth / 2, fz = zWall + dir * depth;
      if (!upper) box(x1 - x0 - 0.1, 0.33, depth - 0.25, M.black, (x0 + x1) / 2, 0, cz - dir * 0.12);
      box(x1 - x0, h, depth, mat, (x0 + x1) / 2, y0, cz);
      const n = Math.max(1, Math.round((x1 - x0) / 1.6)), dw = (x1 - x0) / n;
      for (let i = 0; i < n; i++) {
        const cx = x0 + dw * (i + 0.5);
        // shaker door: stiles and rails proud of the box
        const fy = y0 + 0.08, fh = h - 0.16;
        box(dw - 0.06, 0.2, 0.06, mat, cx, fy, fz + dir * 0.03);
        box(dw - 0.06, 0.2, 0.06, mat, cx, fy + fh - 0.2, fz + dir * 0.03);
        box(0.2, fh, 0.06, mat, cx - dw / 2 + 0.13, fy, fz + dir * 0.03);
        box(0.2, fh, 0.06, mat, cx + dw / 2 - 0.13, fy, fz + dir * 0.03);
        box(0.05, upper ? 0.5 : 0.6, 0.06, M.hardware, cx + (i % 2 ? -1 : 1) * (dw / 2 - 0.35), upper ? y0 + 0.25 : y0 + h - 0.95, fz + dir * 0.1);
      }
      if (top && !upper) box(x1 - x0 + 0.1, 0.12, depth + 0.12, M.counter, (x0 + x1) / 2, y0 + h, cz + dir * 0.06);
      if (!upper) solid(Math.min(x0, x1), Math.max(x0, x1), Math.min(zWall, fz), Math.max(zWall, fz));
    };

    /* Great room */
    box(10, 0.04, 8.6, M.rug, 9, 0, 15.6);
    box(1.6, 1.9, 6.4, M.furn, 1.1, 0, 15.6, 0, undefined, 0.03);
    box(0.12, 2.6, 4.6, M.screen, 0.32, 3.4, 15.6);
    place('SheenWoodLeatherSofa', 15.2, 15.6, -Math.PI / 2);
    solid(13.6, 16.8, 11.2, 20.0);
    box(2.4, 0.14, 4.4, M.furn, 8.8, 1.32, 15.6, 0, undefined, 0.04);
    legs(2.4, 4.4, 1.32, 8.8, 15.6, M.furn, 0.2, 0.18);
    place('SheenChair', 6.2, 10.4, 0.25);
    place('SheenChair', 11.6, 10.4, -0.25);
    place('DiffuseTransmissionPlant', 1.6, 2.2, 0.4);
    place('DiffuseTransmissionPlant', 22.3, 1.6, 2.1, 0, 0.9);

    /* Kitchen and dining */
    cabRun(25, 30, 0.25, 1, M.cab);
    box(5, 2.85, 2, M.cab, 32.5, 0.33, 1.25);
    box(5.1, 0.12, 2.12, M.counter, 32.5, 3.18, 1.31);
    box(2.4, 0.5, 1.4, M.steel, 32.5, 2.8, 1.25);
    box(0.08, 1.1, 0.08, M.steel, 32.5, 3.3, 0.55);
    box(0.08, 0.08, 0.7, M.steel, 32.5, 4.36, 0.85);
    cabRun(35, 36.2, 0.25, 1, M.cab);
    box(2.6, 3.0, 2.2, M.steel, 37.5, 0.18, 1.35);
    box(2.4, 0.06, 2.0, M.black, 37.5, 3.18, 1.35);
    box(2.8, 1.6, 1.8, M.steel, 37.5, 6.0, 1.15);
    cabRun(38.8, 39.0, 0.25, 1, M.cab);
    box(2.7, 6.2, 2.6, M.steel, 40.45, 0, 1.55);
    box(0.05, 2.8, 0.06, M.black, 40.45, 3.2, 2.87);
    solid(36.2, 41.8, 0.25, 2.9);
    cabRun(25, 30, 0.25, 1, M.cab, false, true);
    cabRun(35, 36.2, 0.25, 1, M.cab, false, true);
    // island with seating overhang
    box(8, 2.85, 3.2, M.island, 32.5, 0.33, 7.9);
    box(7.9, 0.33, 2.9, M.black, 32.5, 0, 7.9);
    box(8.6, 0.13, 4.4, M.counter, 32.5, 3.18, 8.4);
    solid(28.3, 36.7, 6.2, 10.6);
    [30, 32.5, 35].forEach((x) => {
      box(1.35, 0.25, 1.35, M.upholstery, x, 2.35, 11.6, 0, undefined, 0.1);
      box(0.12, 2.35, 0.12, M.hardware, x, 0, 11.6);
      box(1.0, 0.06, 1.0, M.hardware, x, 0, 11.6);
      pendant(x, 8.2);
    });
    // dining
    box(7.2, 0.17, 3.6, M.furn, 32.5, 2.35, 16.0, 0, undefined, 0.04);
    legs(7.2, 3.6, 2.35, 32.5, 16.0, M.furn, 0.4, 0.22);
    solid(28.9, 36.1, 14.2, 17.8);
    [30.2, 32.5, 34.8].forEach((x) => { chair(x, 13.7, 0); chair(x, 18.3, Math.PI); });
    pendant(32.5, 16.0);

    /* Primary bedroom */
    box(9.5, 0.04, 8, M.rug, 51.5, 0, 14.4);
    bed(51.5, 16.3, 6.4, 7, Math.PI, 4.4);
    nightstand(47.15, 18.9, Math.PI);
    nightstand(55.85, 18.9, Math.PI);
    place('GlamVelvetSofa', 51.5, 2.3, 0);
    solid(47.8, 55.2, 1.0, 3.5);
    box(1.8, 3.0, 5, M.furn, 58.9, 0.3, 15, 0, undefined, 0.03);
    legs(1.8, 5, 0.3, 58.9, 15, M.furn, 0.15, 0.15);
    solid(58, 59.8, 12.5, 17.5);
    place('SheenChair', 57.2, 3.4, -0.75);

    /* Primary bath */
    box(2, 2.85, 7, M.cab, 43.25, 0.33, 30);
    box(2.1, 0.12, 7.1, M.counter, 43.3, 3.18, 30);
    [28.3, 31.7].forEach((z) => {
      box(1.3, 0.06, 1.0, M.porcelain, 43.4, 3.3, z);
      box(0.06, 0.8, 0.06, M.hardware, 42.55, 3.3, z);
      lampSconce(z);
    });
    function lampSconce(z) {
      box(0.25, 0.6, 0.25, M.shade, 42.45, 6.4, z, 0, dyn);
    }
    mirror(6, 3, 42.24, 5.6, 30, Math.PI / 2);
    box(5.4, 1.9, 2.6, M.porcelain, 48.1, 0, 32.4, 0, undefined, 0.6);
    box(0.08, 1.1, 0.08, M.hardware, 50.6, 1.6, 32.4);
    box(1.6, 1.4, 2.2, M.porcelain, 51.0, 0, 25.6, 0, undefined, 0.3);
    box(1.7, 1.3, 0.6, M.porcelain, 51.45, 1.4, 25.6, 0, undefined, 0.12);
    solid(45.3, 50.9, 31.0, 33.8);

    /* Closet */
    [52.9, 59.1].forEach((x) => {
      box(1.4, 0.1, 12, M.trim, x, 5.6, 27, 0, undefined);
      box(1.4, 0.1, 12, M.trim, x, 6.6, 27, 0, undefined);
      box(0.05, 0.05, 12, M.steel, x, 5.3, 27);
      for (let i = 0; i < 16; i++) box(0.12, 2.6 + (i % 3) * 0.4, 1.1, i % 4 === 0 ? M.accent : i % 3 === 0 ? M.upholstery : M.bedding, x, 5.3 - (2.6 + (i % 3) * 0.4), 21.6 + i * 0.68);
    });

    /* Bedroom 2 */
    box(7, 0.04, 6.5, M.rug, 9.5, 0, 29);
    bed(10.4, 29, 5, 6.7, -Math.PI / 2, 4);
    nightstand(13.0, 25.35, -Math.PI / 2);
    nightstand(13.0, 32.65, -Math.PI / 2);

    /* Bath 2 */
    box(4, 2.85, 1.8, M.cab, 16.6, 0.33, 32.9);
    box(4.1, 0.12, 1.9, M.counter, 16.6, 3.18, 32.85);
    box(1.2, 0.06, 0.9, M.porcelain, 16.6, 3.3, 32.8);
    mirror(3.6, 3, 16.6, 5.6, 33.74, Math.PI);
    box(2.5, 1.8, 5.1, M.porcelain, 20.55, 0, 31.2, 0, undefined, 0.1);
    box(1.6, 1.4, 2.2, M.porcelain, 15.3, 0, 29.4, Math.PI / 2, undefined, 0.3);
    solid(19.3, 21.8, 28.6, 33.8);

    /* Bedroom 3 */
    bed(30.6, 29, 4.6, 6.5, -Math.PI / 2, 3.8);
    nightstand(33.0, 32.6, -Math.PI / 2);
    place('DiffuseTransmissionPlant', 23.2, 32.8, 1.1, 0, 0.85);

    /* Laundry */
    [35.6, 38.0].forEach((x, i) => {
      box(2.3, 3.0, 2.3, M.porcelain, x, 0, 32.6, 0, undefined, 0.08);
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 40), i ? M.black : M.steel);
      d.rotation.x = Math.PI / 2;
      d.position.set(x, 1.4, 31.43);
      dyn.add(add(d));
    });
    cabRun(34.5, 41.5, 33.75, -1, M.cab, false, true);
    solid(34.4, 39.2, 31.4, 33.8);

    /* Porch */
    place('AnisotropyBarnLamp', 9.4, -0.3, Math.PI, 6.4, 1.6);
    place('AnisotropyBarnLamp', 13.6, -0.3, Math.PI, 6.4, 1.6);
    place('DiffuseTransmissionPlant', 8.4, -7.2, 0.6, 0, 1.1);
    place('DiffuseTransmissionPlant', 14.6, -7.2, 2.6, 0, 1.1);
  }

  /* ---------------- lighting presets ---------------- */
  function applyLighting() {
    const evening = st.lighting === 'evening';
    const walk = st.mode === 'walk';
    sun.intensity = evening ? 0 : 2.6;
    scene.environmentIntensity = evening ? 0.04 : walk ? 0.55 : 1.0;
    scene.backgroundIntensity = evening ? 0.08 : 1.0;
    bounce.intensity = evening ? 0.06 : walk ? 1.1 : 0.25;
    st.roomLights.forEach((l) => { l.intensity = evening ? 55 : walk ? 6 : 0; });
    st.lamps.forEach((s) => { s.material.emissiveIntensity = evening ? 2.2 : 0.25; });
  }

  /* ---------------- camera, input and collisions ---------------- */
  function collides(x, z) {
    for (const [ax, az, bx, bz, ht] of st.segs) {
      const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1;
      const t = clamp(((x - ax) * vx + (z - az) * vz) / l2, 0, 1);
      const px = ax + vx * t - x, pz = az + vz * t - z;
      if (px * px + pz * pz < (R_PLAYER + ht) ** 2) return true;
    }
    for (const [x0, x1, z0, z1] of st.boxes) if (x > x0 - R_PLAYER && x < x1 + R_PLAYER && z > z0 - R_PLAYER && z < z1 + R_PLAYER) return true;
    return false;
  }
  function moveBy(dx, dz) {
    const w = st.walk;
    if (!collides(w.x + dx, w.z + dz)) { w.x += dx; w.z += dz; return; }
    if (!collides(w.x + dx, w.z)) w.x += dx;
    else if (!collides(w.x, w.z + dz)) w.z += dz;
  }
  function placeCamera() {
    if (st.mode === 'walk') {
      const w = st.walk;
      camera.fov = 66;
      camera.position.set(w.x, EYE, w.z);
      camera.lookAt(w.x + Math.sin(w.yaw) * Math.cos(w.pitch), EYE + Math.sin(w.pitch), w.z + Math.cos(w.yaw) * Math.cos(w.pitch));
    } else {
      const o = st.orbit;
      camera.fov = 45;
      camera.position.set(o.tx + o.rad * Math.cos(o.el) * Math.sin(o.az), o.rad * Math.sin(o.el), o.tz - o.rad * Math.cos(o.el) * Math.cos(o.az));
      camera.lookAt(o.tx, 0, o.tz);
    }
    camera.updateProjectionMatrix();
  }

  const KEYMAP = { w: 'f', W: 'f', ArrowUp: 'f', s: 'b', S: 'b', ArrowDown: 'b', a: 'l', A: 'l', d: 'r', D: 'r', ArrowLeft: 'tl', ArrowRight: 'tr' };
  const pointers = new Map();
  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    canvas.focus({ preventScroll: true });
    cancelPhoto();
    st.anim = null;
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    if (pointers.size === 2 && st.mode === 'orbit') {
      const [a, b] = [...pointers.values()];
      const before = Math.hypot(a.x - b.x, a.y - b.y);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [c, d] = [...pointers.values()];
      const after = Math.hypot(c.x - d.x, c.y - d.y);
      if (before > 0) st.orbit.rad = clamp(st.orbit.rad * (before / after), 25, 200);
      return;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (st.mode === 'walk') {
      st.walk.yaw -= dx * 0.0045;
      st.walk.pitch = clamp(st.walk.pitch - dy * 0.0035, -1.0, 1.0);
    } else {
      st.orbit.az -= dx * 0.006;
      st.orbit.el = clamp(st.orbit.el + dy * 0.005, 0.18, 1.45);
    }
  });
  const up = (e) => pointers.delete(e.pointerId);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => {
    if (st.mode !== 'orbit') return;
    e.preventDefault();
    cancelPhoto();
    st.orbit.rad = clamp(st.orbit.rad * (e.deltaY > 0 ? 1.08 : 0.92), 25, 200);
  }, { passive: false });
  canvas.addEventListener('keydown', (e) => { const k = KEYMAP[e.key]; if (k) { st.keys[k] = true; cancelPhoto(); e.preventDefault(); } });
  canvas.addEventListener('keyup', (e) => { const k = KEYMAP[e.key]; if (k) st.keys[k] = false; });
  canvas.addEventListener('blur', () => { st.keys = {}; });

  /* ---------------- photo mode (high-quality still) ---------------- */
  // Renders the current view supersampled, with a larger shadow map and accumulated ambient occlusion.
  const baseRatio = renderer.getPixelRatio();
  const PHOTO_FRAMES = mobile ? 24 : 48;
  function startPhoto() {
    if (st.photo) return;
    st.anim = null;
    st.keys = {};
    st.held = null;
    st.photo = { frame: 0 };
    onPhoto({ state: 'preparing' });
    const w = stage.clientWidth;
    const ratio = Math.min(mobile ? 2 : 3, Math.max(baseRatio, 3000 / Math.max(1, w)));
    renderer.setPixelRatio(ratio);
    sun.shadow.mapSize.set(mobile ? 4096 : 8192, mobile ? 4096 : 8192);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    ao.setQualityMode('Ultra');
    ao.configuration.halfRes = false;
    ao.configuration.accumulate = true;
    resize();
  }
  function endPhoto() {
    renderer.setPixelRatio(baseRatio);
    sun.shadow.mapSize.set(mobile ? 2048 : 4096, mobile ? 2048 : 4096);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    ao.setQualityMode(mobile ? 'Low' : 'Medium');
    ao.configuration.halfRes = mobile;
    ao.configuration.accumulate = false;
    resize();
  }
  function cancelPhoto() {
    if (st.photo) { st.photo = null; endPhoto(); onPhoto({ state: 'off' }); }
  }
  function savePhoto() {
    placeCamera();
    composer.render();
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/jpeg', 0.92);
    a.download = 'shoreline-drive-' + (st.mode === 'walk' ? 'interior' : 'dollhouse') + '.jpg';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* ---------------- loop ---------------- */
  function frame(t) {
    st.raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - (st.last || t)) / 1000);
    st.last = t;
    if (st.anim) {
      const a = st.anim, k = Math.min(1, (t - a.t0) / a.dur), e = ease(k);
      const w = st.walk;
      w.x = a.from.x + (a.to.x - a.from.x) * e;
      w.z = a.from.z + (a.to.z - a.from.z) * e;
      let dy = a.to.yaw - a.from.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      w.yaw = a.from.yaw + dy * e;
      w.pitch = a.from.pitch + (a.to.pitch - a.from.pitch) * e;
      if (k >= 1) st.anim = null;
    } else if (st.mode === 'walk') {
      const k = st.keys, h = st.held, w = st.walk;
      const f = (k.f || h === 'f' ? 1 : 0) - (k.b || h === 'b' ? 1 : 0);
      const s = (k.r || h === 'r' ? 1 : 0) - (k.l || h === 'l' ? 1 : 0);
      if (k.tl || h === 'tl') w.yaw += 1.6 * dt;
      if (k.tr || h === 'tr') w.yaw -= 1.6 * dt;
      if (f || s) {
        const sp = 7 * dt;
        moveBy((Math.sin(w.yaw) * f - Math.cos(w.yaw) * s) * sp, (Math.cos(w.yaw) * f + Math.sin(w.yaw) * s) * sp);
        w.x = clamp(w.x, -2, 62); w.z = clamp(w.z, -9.5, 35);
      }
    }
    if (st.photo) {
      const ph = st.photo;
      if (ph.frame < PHOTO_FRAMES) {
        ph.frame++;
        placeCamera();
        composer.render();
        onPhoto({ state: 'rendering', samples: ph.frame, target: PHOTO_FRAMES });
        if (ph.frame === PHOTO_FRAMES) onPhoto({ state: 'done' });
      }
      return;
    }
    placeCamera();
    composer.render();
  }
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    ao.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  function start() { if (!st.raf) { st.last = 0; st.raf = requestAnimationFrame(frame); } }
  function stop() { if (st.raf) cancelAnimationFrame(st.raf); st.raf = 0; st.keys = {}; st.held = null; }

  build();
  ro.observe(stage);
  resize();
  placeCamera();
  start();

  return {
    canvas,
    attach(el) { stage = el; el.prepend(canvas); ro.disconnect(); ro.observe(el); resize(); start(); },
    stop,
    start,
    setMode(m) {
      cancelPhoto();
      st.mode = m;
      st.ceilings.visible = m === 'walk';
      applyLighting();
    },
    setStyle(s) { cancelPhoto(); st.style = s; build(); },
    setFurnished(f) { cancelPhoto(); st.furnished = f; build(); },
    setHeight(h) { st.height = +h || 9; if (st.house) build(); },
    setLighting(l) { cancelPhoto(); st.lighting = l; applyLighting(); },
    zoom(d) { cancelPhoto(); st.orbit.rad = clamp(st.orbit.rad * (d > 0 ? 1.15 : 0.87), 25, 200); },
    hold(dir) { if (dir) cancelPhoto(); st.held = dir; },
    goTo(id) {
      const r = ROOMS_WALK.find((x) => x[0] === id);
      if (!r) return;
      cancelPhoto();
      const to = { x: r[2], z: r[3], yaw: r[4], pitch: -0.05 };
      if (st.mode !== 'walk') { Object.assign(st.walk, to); return; }
      st.anim = { from: { ...st.walk }, to, t0: performance.now(), dur: 900 };
    },
    photo: startPhoto,
    cancelPhoto,
    savePhoto,
    get mode() { return st.mode; }
  };
}
