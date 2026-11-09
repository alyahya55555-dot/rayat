// رايات — المشهد ثلاثي الأبعاد (الإصدار 2: تضاريس متصلة، حدود دول، رايات بخط ثمانية، مشهد غزو)
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const S = 1 / 100, CX = 930, CY = 600;
const P = (x, y) => [(x - CX) * S, (y - CY) * S];
const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, seg = (t, a, b) => clamp((t - a) / (b - a));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const rnd = (s => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; })(91);

// ---------- ضجيج ناعم ثابت ----------
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v); };
const fbm = (x, y) => vnoise(x, y) * .5 + vnoise(x * 2.1, y * 2.1) * .25 + vnoise(x * 4.3, y * 4.3) * .125 + vnoise(x * 8.7, y * 8.7) * .0625;

// ---------- البيانات ----------
const M = RayatMap.build(4, 7);
const TEAMS = [{ name: 'الصقور', color: '#2f6fdb', mark: 'ص' }, { name: 'السهم', color: '#1f9d55', mark: 'س' }, { name: 'الرواد', color: '#e07a2e', mark: 'ر' }, { name: 'الهمّة', color: '#8e4fb8', mark: 'هـ' }];
const owner = {}; M.caps.forEach((c, t) => owner[c] = t);
const castleId = M.regions.find(r => r.castle).id; owner[castleId] = 1;
{ const quota = [9, 9, 6, 5], cnt = t => Object.values(owner).filter(v => v === t).length; let grew = true;
  for (let k = 0; k < 40 && grew; k++) { grew = false; for (let t = 0; t < 4; t++) { if (cnt(t) >= quota[t]) continue; const fr = M.regions.filter(r => owner[r.id] === t).flatMap(r => r.nb).filter(j => owner[j] == null && !M.regions[j].land); if (fr.length) { owner[fr.sort((a, b) => M.regions[a].nb.length - M.regions[b].nb.length)[0]] = t; grew = true; } } } }
owner[M.regions.filter(r => r.land === 1)[0].id] = 0;
const target = M.regions.find(r => owner[r.id] === 1 && r.type !== 'capital' && !r.castle && r.nb.some(j => owner[j] === 0 && M.regions[j].type !== 'capital'));
const from = M.regions[target.nb.find(j => owner[j] === 0 && M.regions[j].type !== 'capital') ?? target.nb.find(j => owner[j] === 0)];
const del = d3.Delaunay.from(M.regions.map(r => r.seed));
const regionAtW = (x, z) => del.find(x / S + CX, z / S + CY);
const at = r => P(...r.at);

// ---------- الأرض: مسافة إلى الساحل وارتفاع ----------
const coastSegs = []; [M.main.poly, ...M.isles.map(i => i.poly)].forEach(L => L.forEach((p, i) => { const q = L[(i + 1) % L.length], [ax, az] = P(...p), [bx, bz] = P(...q); coastSegs.push([ax, az, bx, bz]); }));
const lands = [M.main.poly, ...M.isles.map(i => i.poly)].map(L => L.map(p => P(...p)));
const inPoly = (x, z, L) => { let c = false; for (let i = 0, j = L.length - 1; i < L.length; j = i++) { const [xi, zi] = L[i], [xj, zj] = L[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
function coastDist(x, z) { let m = 1e9; for (const [ax, az, bx, bz] of coastSegs) { const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)), px = ax + t * dx - x, pz = az + t * dz - z, d = px * px + pz * pz; if (d < m) m = d; } m = Math.sqrt(m); return lands.some(L => inPoly(x, z, L)) ? m : -m; }
// معالم بحسب نوع الإقليم
const feats = [];
M.regions.forEach(r => { const [x, z] = at(r);
  if (r.type === 'mine') { feats.push({ x: x - .12, z: z - .05, h: .95, r: .42, k: 'm' }); feats.push({ x: x + .26, z: z + .08, h: .62, r: .32, k: 'm' }); }
  if (r.type === 'rich') feats.push({ x, z, h: .55, r: .3, k: 'm' });
  if (r.type === 'quarry') feats.push({ x, z, h: .28, r: .42, k: 'q' });
  if (r.type === 'castle') feats.push({ x, z, h: .42, r: .78, k: 'p' });
  if (r.type === 'capital') feats.push({ x, z, h: .16, r: .55, k: 'p' }); });
const flatRegion = id => ['farm', 'capital', 'castle', 'port', 'village'].includes(M.regions[id].type);
function heightAt(x, z, cd = coastDist(x, z)) {
  if (cd < 0) return .006 + cd * .2 - sstep(.1, 1.5, -cd) * .62;
  let h = .006 + sstep(0, .4, cd) * .13;
  const id = regionAtW(x, z), rough = flatRegion(id) ? .35 : 1;
  h += (fbm(x * .9 + 7, z * .9 + 3) - .45) * .16 * rough * sstep(0, .5, cd);
  for (const f of feats) { const d = Math.hypot(x - f.x, z - f.z) / f.r; if (d > 1.6) continue;
    if (f.k === 'm') h += f.h * Math.exp(-d * d * 2.6) * (.82 + .35 * fbm(x * 3 + 1, z * 3 + 2));
    else if (f.k === 'q') h += f.h * Math.exp(-d * d * 2) * (.6 + .8 * fbm(x * 6, z * 6));
    else if (f.k === 'p') h = Math.max(h, lerp(h, f.h, 1 - sstep(.75, 1.15, d))); }
  return h;
}

// ---------- المحرك ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08; renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const SEA = '#0e4a5e'; scene.background = new THREE.Color(SEA); scene.fog = new THREE.Fog(SEA, 20, 40);
const camera = new THREE.PerspectiveCamera(30, 16 / 9, .1, 200);
scene.add(new THREE.HemisphereLight('#dff0ff', '#6d5b3c', .85));
const sun = new THREE.DirectionalLight('#ffe9c9', 2.9); sun.position.set(-6, 11, 5); sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096); Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 8, bottom: -8, near: 1, far: 40 }); sun.shadow.bias = -.0005; sun.shadow.normalBias = .03; sun.shadow.radius = 3;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight('#a9d4ff', .55); fill.position.set(7, 5, -6); scene.add(fill);
const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture; scene.environmentIntensity = .22;
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType }));
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new OutputPass());
const U = { uTime: { value: 0 } };
const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .8, metalness: 0, flatShading: true, ...o });
const add = (m, p, opt = {}) => { m.castShadow = opt.cast !== false; m.receiveShadow = true; if (p) m.position.set(...p); (opt.to || scene).add(m); return m; };

// ---------- التضاريس ----------
const X0 = -14, X1 = 14, Z0 = -9, Z1 = 9, NX = 600, NZ = 390;
const tgeo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, NX, NZ); tgeo.rotateX(-Math.PI / 2); tgeo.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
const tp = tgeo.attributes.position, cols = new Float32Array(tp.count * 3), regA = new Float32Array(tp.count), heights = new Float32Array(tp.count);
const cGrass = [new THREE.Color('#7db455'), new THREE.Color('#5f9e46'), new THREE.Color('#93c463')], cSand = new THREE.Color('#ead39a'), cWet = new THREE.Color('#cdb784'), cRock = new THREE.Color('#9b8f7c'), cRock2 = new THREE.Color('#7f7466'), cSnow = new THREE.Color('#f4f1ea'), cDeep = new THREE.Color('#165a6e'), cShallow = new THREE.Color('#bfe0cf'), cField = new THREE.Color('#c9c066');
const tmp = new THREE.Color();
for (let i = 0; i < tp.count; i++) {
  const x = tp.getX(i), z = tp.getZ(i), cd = coastDist(x, z), h = heightAt(x, z, cd); tp.setY(i, h); heights[i] = h;
  const id = regionAtW(x, z); regA[i] = cd > 0 ? id : -1;
  const n = fbm(x * 1.7 + 11, z * 1.7 - 4);
  if (cd < 0) tmp.copy(cShallow).lerp(cDeep, sstep(0, .9, -cd));
  else if (cd < .16) tmp.copy(cWet).lerp(cSand, sstep(0, .1, cd));
  else { tmp.copy(cGrass[0]).lerp(n > .5 ? cGrass[2] : cGrass[1], Math.abs(n - .5) * 1.6);
    if (M.regions[id] && M.regions[id].type === 'farm') tmp.lerp(cField, .22);
    tmp.lerp(cSand, 1 - sstep(.16, .3, cd));
    const rockK = sstep(.32, .55, h); if (rockK > 0) tmp.lerp(n > .5 ? cRock : cRock2, rockK);
    const snowK = sstep(.78, .9, h); if (snowK > 0) tmp.lerp(cSnow, snowK); }
  cols.set([tmp.r, tmp.g, tmp.b], i * 3);
}
tgeo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); tgeo.setAttribute('aRegion', new THREE.BufferAttribute(regA, 1)); tgeo.computeVertexNormals();
// ألوان الدول عبر المظلّل، مع سريان لون الفاتح
const NR = M.regions.length, teamU = { uTC: { value: Array.from({ length: 48 }, () => new THREE.Color(0, 0, 0)) }, uTA: { value: new Float32Array(48) }, uCR: { value: -1 }, uCFrom: { value: new THREE.Color() }, uCTo: { value: new THREE.Color() }, uCC: { value: new THREE.Vector2() }, uCRad: { value: 0 } };
const setTint = id => { const o = owner[id]; teamU.uTA.value[id] = o == null ? 0 : 1; if (o != null) teamU.uTC.value[id].set(TEAMS[o].color); };
M.regions.forEach(r => setTint(r.id));
const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .92, metalness: 0 });
terrainMat.onBeforeCompile = sh => { Object.assign(sh.uniforms, teamU, U);
  sh.vertexShader = 'attribute float aRegion; flat varying float vReg; varying vec3 vWP;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vReg = aRegion; vWP = (modelMatrix*vec4(transformed,1.)).xyz;');
  sh.fragmentShader = `uniform vec3 uTC[48]; uniform float uTA[48]; uniform float uCR; uniform vec3 uCFrom; uniform vec3 uCTo; uniform vec2 uCC; uniform float uCRad; uniform float uTime; flat varying float vReg; varying vec3 vWP;\n` +
    sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      int ri = int(vReg + .5);
      if (vReg > -.5) {
        float a = uTA[ri]; vec3 tc = uTC[ri];
        if (abs(vReg - uCR) < .5) { float dd = distance(vWP.xz, uCC); float k = 1. - smoothstep(uCRad - .3, uCRad, dd); tc = mix(uCFrom, uCTo, k); a = 1.; float rim = 1. - smoothstep(0., .12, abs(dd - uCRad)); diffuseColor.rgb += rim * step(.01, uCRad) * step(uCRad, 5.) * .25; }
        float land = smoothstep(.015, .07, vWP.y) * (1. - .75 * smoothstep(.34, .62, vWP.y));
        float lum = dot(diffuseColor.rgb, vec3(.3,.59,.11));
        diffuseColor.rgb = mix(diffuseColor.rgb, tc * (.55 + lum * .75), a * .58 * land);
      }
      float foam = smoothstep(.035, .0, abs(vWP.y - .012 - sin(uTime*1.3 + vWP.x*2.)*.006));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.), foam * .55);`); };
const terrain = new THREE.Mesh(tgeo, terrainMat); terrain.receiveShadow = true; terrain.castShadow = true; scene.add(terrain);
const groundY = (x, z) => heightAt(x, z);

// ---------- البحر ----------
const water = new THREE.Mesh(new THREE.PlaneGeometry(90, 90, 1, 1), new THREE.MeshStandardMaterial({ color: '#1a86a4', roughness: .18, metalness: .08, transparent: true, opacity: .78 }));
water.material.onBeforeCompile = sh => { Object.assign(sh.uniforms, U);
  sh.vertexShader = 'varying vec3 vWP2;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWP2 = (modelMatrix*vec4(transformed,1.)).xyz;');
  sh.fragmentShader = 'uniform float uTime; varying vec3 vWP2;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
    vec2 p = vWP2.xz; float t = uTime;
    vec2 g = vec2(cos(p.x*2.3+t*1.1)+cos((p.x+p.y)*3.7+t*1.6)*.6, sin(p.y*2.7+t*.9)+sin((p.x-p.y)*4.1+t*1.3)*.6)*.07;
    normal = normalize(normal + vec3(g.x, 0., g.y));`); };
water.rotation.x = -Math.PI / 2; water.position.y = .012; water.receiveShadow = true; scene.add(water);

// ---------- حدود الدول ----------
// أضلاع فورونوي المشتركة على اليابسة، مقسّمة لتتبع التضاريس
const edges = []; { const seen = {}; M.regions.forEach(r => { const p = r.poly; for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1], k = [a, b].map(q => q.map(v => Math.round(v * 10)).join(':')).sort().join('|'); (seen[k] = seen[k] || { a, b, c: [] }).c.push(r.id); } });
  Object.values(seen).forEach(e => { if (e.c.length === 2 && M.regions[e.c[0]].land === M.regions[e.c[1]].land) edges.push(e); }); }
const borderGrp = new THREE.Group(); scene.add(borderGrp);
function ribbon(pts, w, colr, opa = 1, lift = .025) { // شريط على التضاريس
  const pos = [], idx = []; for (let i = 0; i < pts.length; i++) { const [x, z] = pts[i], [px, pz] = pts[Math.max(0, i - 1)], [nx, nz] = pts[Math.min(pts.length - 1, i + 1)]; let dx = nx - px, dz = nz - pz; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; const ox = -dz * w / 2, oz = dx * w / 2;
    pos.push(x + ox, groundY(x + ox, z + oz) + lift, z + oz, x - ox, groundY(x - ox, z - oz) + lift, z - oz); if (i) { const b = (i - 1) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: colr, roughness: .45, emissive: colr, emissiveIntensity: .35, transparent: opa < 1, opacity: opa, side: THREE.DoubleSide, depthWrite: opa >= 1 })); m.receiveShadow = true; return m;
}
const dotGeo = new THREE.CylinderGeometry(.011, .011, .006, 10), dotMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .6, emissive: '#ffffff', emissiveIntensity: .25, transparent: true, opacity: .7 });
function buildBorders() {
  borderGrp.clear(); const dots = [];
  edges.forEach(e => { const [i, j] = e.c, oi = owner[i], oj = owner[j], [ax, az] = P(...e.a), [bx, bz] = P(...e.b), L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(L / .06));
    // أجزاء الضلع الواقعة على اليابسة فقط
    const runs = []; let cur = []; for (let k = 0; k <= n; k++) { const x = lerp(ax, bx, k / n), z = lerp(az, bz, k / n); if (coastDist(x, z) > .12) cur.push([x, z]); else if (cur.length) { runs.push(cur); cur = []; } } if (cur.length) runs.push(cur);
    runs.filter(r => r.length > 1).forEach(run => {
      if (oi === oj) { let acc = 0; for (let q = 1; q < run.length; q++) { const [x0, z0] = run[q - 1], [x1, z1] = run[q], l = Math.hypot(x1 - x0, z1 - z0); for (let u = acc; u < l; u += .055) { const x = lerp(x0, x1, u / l), z = lerp(z0, z1, u / l); dots.push([x, groundY(x, z) + .012, z]); } acc = (acc - l) % .055; if (acc < 0) acc += .055; } return; }
      const nx = -(bz - az) / L, nz = (bx - ax) / L, [ix, iz] = at(M.regions[i]), side = Math.sign((ix - ax) * nx + (iz - az) * nz) || 1;
      for (const [o, sg] of [[oi, side], [oj, -side]]) if (o != null) borderGrp.add(ribbon(run.map(([x, z]) => [x + nx * sg * .05, z + nz * sg * .05]), .075, TEAMS[o].color, 1, .035));
    }); });
  if (dots.length) { const im = new THREE.InstancedMesh(dotGeo, dotMat, dots.length), m4 = new THREE.Matrix4(); dots.forEach((d, i) => im.setMatrixAt(i, m4.makeTranslation(...d))); borderGrp.add(im); }
}
// مسار الزحف: من داخل أرض المهاجم إلى الحدّ الفعلي مع الهدف، بعيدًا عن البيوت
const MF = at(from), MT = at(target), mdL = Math.hypot(MT[0] - MF[0], MT[1] - MF[1]), mux = (MT[0] - MF[0]) / mdL, muz = (MT[1] - MF[1]) / mdL;
let MB = .5; for (let k = .15; k < .98; k += .005) if (regionAtW(lerp(MF[0], MT[0], k), lerp(MF[1], MT[1], k)) === target.id) { MB = k; break; }
const BP = [lerp(MF[0], MT[0], MB), lerp(MF[1], MT[1], MB)];
const clashP = [BP[0] + mux * .05, BP[1] + muz * .05];
// الجيش يخرج من خلف قريته ويمشي على الطريق نفسه حتى الحد
const startP = [MF[0] - mux * .22, MF[1] - muz * .22];
const pathEnd = [clashP[0] - mux * .4, clashP[1] - muz * .4];
const segDist = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)); return Math.hypot(a[0] + t * dx - x, a[1] + t * dz - z); };
const startBack = [startP[0] - mux * .24, startP[1] - muz * .24];
const MPATH = new THREE.CatmullRomCurve3([new THREE.Vector3(startP[0], 0, startP[1]), new THREE.Vector3(lerp(startP[0], pathEnd[0], .5), 0, lerp(startP[1], pathEnd[1], .5)), new THREE.Vector3(pathEnd[0], 0, pathEnd[1])]);
const MT0 = MPATH.getTangentAt(0), MPTS = [[startP[0] - MT0.x * .26, startP[1] - MT0.z * .26], ...MPATH.getSpacedPoints(40).map(v => [v.x, v.z]), [pathEnd[0] + mux * .6, pathEnd[1] + muz * .6]];
// شبكة طرق ترابية بين الأقاليم (شجرة امتداد صغرى على الجزيرة الكبرى + طريق الزحف)
const ROADS = []; { const L = M.regions.filter(r => !r.land), E = []; L.forEach(r => r.nb.forEach(j => { if (j > r.id && !M.regions[j].land) E.push([Math.hypot(...at(r).map((v, k) => v - at(M.regions[j])[k])), r.id, j]); }));
  E.sort((a, b) => a[0] - b[0]); const par = {}, f = i => par[i] == null || par[i] === i ? i : (par[i] = f(par[i])), keep = [[0, from.id, target.id]];
  par[from.id] = target.id; E.forEach(e => { const a = f(e[1]), b = f(e[2]); if (a !== b) { par[a] = b; keep.push(e); } });
  const endOff = r => r.type === 'capital' ? .3 : r.type === 'castle' ? .56 : r.type === 'village' ? .1 : .06;
  keep.forEach(([, i, j], k) => { const A = M.regions[i], B = M.regions[j], [ax, az] = at(A), [bx, bz] = at(B), L2 = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L2, dz = (bz - az) / L2, march = k === 0;
    const p0 = march ? [ax - dx * .5, az - dz * .5] : [ax + dx * endOff(A), az + dz * endOff(A)], p2 = [bx - dx * endOff(B), bz - dz * endOff(B)], bend = march ? 0 : (k % 2 ? 1 : -1) * L2 * .08, p1 = [(p0[0] + p2[0]) / 2 - dz * bend, (p0[1] + p2[1]) / 2 + dx * bend], pts = [];
    for (let t = 0; t <= 1.0001; t += 1 / 22) { const u = 1 - t; pts.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]); }
    if (pts.every(q => coastDist(...q) > .08)) ROADS.push(pts); }); }
const inMarch = (x, z, R = .36) => { if (Math.hypot(x - clashP[0], z - clashP[1]) < .5) return true; for (let i = 1; i < MPTS.length; i++) if (segDist(x, z, MPTS[i - 1], MPTS[i]) < R) return true; return false; };
buildBorders();

// ---------- النباتات (مجسّمات متكررة) ----------
const treeSpots = { pine: [], round: [] };
M.regions.forEach(r => { const [cx, cz] = at(r), n = { farm: 7, village: 9, port: 5, quarry: 8, mine: 10, rich: 4, capital: 6, castle: 4 }[r.type];
  for (let tries = 0, k = 0; tries < n * 30 && k < n; tries++) { const a = rnd() * 6.283, d = .32 + rnd() * .75, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d * .8;
    if (regionAtW(x, z) !== r.id) continue; const cd = coastDist(x, z); if (cd < .25) continue; const h = heightAt(x, z, cd); if (h > .6) continue;
    // تجمعات: شجرة ثم جاراتها
    const kind = h > .3 || r.type === 'mine' || r.type === 'quarry' ? 'pine' : (rnd() > .35 ? 'round' : 'pine'), cl = 1 + Math.floor(rnd() * 3);
    for (let c = 0; c < cl; c++) { const xx = x + (rnd() - .5) * .14, zz = z + (rnd() - .5) * .14; if (regionAtW(xx, zz) === r.id && coastDist(xx, zz) > .2) treeSpots[kind].push([xx, heightAt(xx, zz), zz, .58 + rnd() * .36, rnd() * 6]); }
    k++; } });
for (const k in treeSpots) treeSpots[k] = treeSpots[k].filter(t => !inMarch(t[0], t[2]));
function instanced(geo, material, list, place) { const im = new THREE.InstancedMesh(geo, material, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(); list.forEach((t, i) => { const [p, s] = place(t); q.setFromEuler(e.set(0, t[4], 0)); m4.compose(p, q, s); im.setMatrixAt(i, m4); }); im.castShadow = true; im.receiveShadow = true; scene.add(im); return im; }
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// ---------- المباني ----------
const C = { roof: '#c4553a', roof2: '#a9452f', wall: '#f4ecdc', stone: '#d6cdb7', stone2: '#bdb39b', wood: '#8a6240', gold: '#f4c430' };
const WALLS = ['#f4ecdc', '#efe2c8', '#f6efe3', '#e9dcc3'], OBST = []; ROADS.forEach(L => L.forEach(q => OBST.push(['طريق', q[0], q[1], .035])));
// موضع خالٍ: داخل الإقليم، بعيد عن الساحل وطريق الجيش وكل مجسّم قائم (لا تلاصق ولا تداخل)
function spot(cx, cz, rMin, rMax, rad, rid, gap = .04) { for (let i = 0; i < 80; i++) { const a = rnd() * 6.283, d = lerp(rMin, rMax, rnd()), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d * .82;
    if (rid != null && regionAtW(x, z) !== rid) continue; if (coastDist(x, z) < .12 + rad || inMarch(x, z) || heightAt(x, z) > .5) continue;
    if (OBST.some(o => Math.hypot(o[1] - x, o[2] - z) < o[3] + rad + gap)) continue; return [x, z]; } return null; }
const faceTo = (x, z, cx, cz) => Math.atan2(cx - x, cz - z);
function well(x, z) { OBST.push(['بئر', x, z, .05]); const g = new THREE.Group(), y = groundY(x, z);
  add(new THREE.Mesh(new THREE.CylinderGeometry(.036, .04, .04, 14), mat(C.stone, { flatShading: false })), [0, .02, 0], { to: g });
  add(new THREE.Mesh(new THREE.CylinderGeometry(.027, .027, .004, 14), mat('#2f6f86', { roughness: .2 })), [0, .039, 0], { to: g, cast: false });
  [-1, 1].forEach(k => add(new THREE.Mesh(new THREE.BoxGeometry(.007, .07, .007), mat(C.wood)), [k * .03, .07, 0], { to: g }));
  [-1, 1].forEach(k => { const pl = add(new THREE.Mesh(new THREE.BoxGeometry(.085, .005, .042), mat(C.roof2)), [0, .118, k * .016], { to: g }); pl.rotation.x = k * .62; }); add(new THREE.Mesh(new THREE.CylinderGeometry(.004, .004, .064, 6), mat(C.wood)), [0, .095, 0], { to: g }).rotation.z = Math.PI / 2;
  g.position.set(x, y, z); scene.add(g); return g; }
function house(x, z, s = 1, roof = C.roof, rotY = 0) { if (inMarch(x, z)) return; OBST.push(['بيت', x, z, .1 * s]);
  const g = new THREE.Group(), y = groundY(x, z), w = .15 * s, d = .12 * s, h = .085 * s, wc = WALLS[Math.floor(rnd() * WALLS.length)];
  add(new THREE.Mesh(new THREE.BoxGeometry(w + .012, .016 * s, d + .012), mat(C.stone2)), [0, .008 * s, 0], { to: g });
  add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(wc)), [0, .016 * s + h / 2, 0], { to: g });
  const top = .016 * s + h, rg = new THREE.BufferGeometry(), ow = w / 2 + .014 * s, od = d / 2 + .016 * s, rh = .07 * s;
  rg.setAttribute('position', new THREE.Float32BufferAttribute([-ow, 0, -od, ow, 0, -od, ow, rh, 0, -ow, rh, 0, -ow, 0, od, ow, 0, od, ow, rh, 0, -ow, rh, 0, -ow * .92, 0, -od * .9, -ow * .92, rh * .96, 0, -ow * .92, 0, od * .9, ow * .92, 0, -od * .9, ow * .92, 0, od * .9, ow * .92, rh * .96, 0], 3));
  rg.setIndex([0, 3, 2, 0, 2, 1, 4, 5, 6, 4, 6, 7, 8, 10, 9, 11, 13, 12]); rg.computeVertexNormals();
  add(new THREE.Mesh(rg, mat(roof, { side: THREE.DoubleSide })), [0, top, 0], { to: g });
  add(new THREE.Mesh(new THREE.BoxGeometry(w + .03 * s, .01 * s, .012 * s), mat(new THREE.Color(roof).multiplyScalar(.7))), [0, top + rh, 0], { to: g });
  add(new THREE.Mesh(new THREE.BoxGeometry(.018 * s, .05 * s, .018 * s), mat('#8d7d6a')), [w * .28, top + rh * .75, -d * .18], { to: g });
  add(new THREE.Mesh(new THREE.BoxGeometry(.03 * s, .05 * s, .006), mat('#6b4a2f')), [0, .016 * s + .025 * s, d / 2 + .002], { to: g });
  [-1, 1].forEach(k => add(new THREE.Mesh(new THREE.BoxGeometry(.022 * s, .022 * s, .006), mat('#ffd98a', { emissive: '#ffb54a', emissiveIntensity: .25 })), [k * w * .3, .016 * s + h * .6, d / 2 + .002], { to: g }));
  g.position.set(x, y, z); g.rotation.y = rotY; scene.add(g); return g;
}
function tower(x, y, z, r, h, roofCol, to = scene) { if (to === scene) OBST.push(['برج', x, z, r]);
  const g = new THREE.Group();
  add(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 12), mat(C.stone, { flatShading: false })), [0, h / 2, 0], { to: g });
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; add(new THREE.Mesh(new THREE.BoxGeometry(r * .34, r * .32, r * .34), mat(C.stone)), [Math.cos(a) * r * .88, h + r * .13, Math.sin(a) * r * .88], { to: g }); }
  if (roofCol) add(new THREE.Mesh(new THREE.ConeGeometry(r * 1.18, r * 1.7, 12), mat(roofCol, { flatShading: false })), [0, h + r * 1.05, 0], { to: g });
  add(new THREE.Mesh(new THREE.BoxGeometry(r * .3, r * .5, .004), mat('#3b3226')), [0, h * .62, r * 1.01], { to: g });
  g.position.set(x, y, z); to.add(g); return g;
}
function wallSeg(x1, z1, x2, z2, y, h, t, to = scene) {
  const len = Math.hypot(x2 - x1, z2 - z1), g = new THREE.Group(); add(new THREE.Mesh(new THREE.BoxGeometry(len, h, t), mat(C.stone2)), [0, h / 2, 0], { to: g });
  const n = Math.floor(len / .06); for (let i = 0; i < n; i += 2) add(new THREE.Mesh(new THREE.BoxGeometry(.035, .03, t * 1.08), mat(C.stone2)), [-len / 2 + .03 + i * .06, h + .015, 0], { to: g });
  g.position.set((x1 + x2) / 2, y, (z1 + z2) / 2); g.rotation.y = -Math.atan2(z2 - z1, x2 - x1); to.add(g); return g;
}
function ring(x, z, y, rx, rz, n, h, t, roofCol, towerR) { const pts = []; for (let i = 0; i < 48; i++) { const a = i / 48 * 6.283; OBST.push(['سور', x + Math.cos(a) * rx, z + Math.sin(a) * rz, t]); } for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + Math.PI / n; pts.push([x + Math.cos(a) * rx, z + Math.sin(a) * rz]); }
  pts.forEach((p, i) => { const q = pts[(i + 1) % n]; wallSeg(p[0], p[1], q[0], q[1], y, h, t); tower(p[0], y, p[1], towerR, h * 1.75, roofCol); }); }
function field(x, z, w, d, c, rot) { if (inMarch(x, z, .48)) return; OBST.push(['حقل', x, z, Math.max(w, d) * .55]); const g = new THREE.Group(); add(new THREE.Mesh(new THREE.BoxGeometry(w, .012, d), mat(c, { flatShading: false })), [0, .006, 0], { to: g, cast: false });
  for (let i = 1; i < 5; i++) add(new THREE.Mesh(new THREE.BoxGeometry(w * .94, .008, .006), mat(new THREE.Color(c).multiplyScalar(.82))), [0, .014, -d / 2 + i * d / 5], { to: g, cast: false });
  g.position.set(x, groundY(x, z) + .004, z); g.rotation.y = rot; scene.add(g); }
function rock(x, z, s = 1) { if (inMarch(x, z)) return; OBST.push(['صخرة', x, z, .07 * s]); const m = new THREE.Mesh(new THREE.DodecahedronGeometry(.06 * s, 0), mat(rnd() > .5 ? '#a8a294' : '#c7c0ae')); m.scale.set(1.3, .75, 1.1); m.rotation.set(rnd(), rnd() * 6, rnd()); return add(m, [x, groundY(x, z) + .02 * s, z]); }
function boat(x, z, rot) { const g = new THREE.Group(); add(new THREE.Mesh(new THREE.BoxGeometry(.24, .05, .09), mat('#7b5236')), [0, .02, 0], { to: g }); add(new THREE.Mesh(new THREE.CylinderGeometry(.005, .005, .24, 5), mat('#5a4632')), [0, .14, 0], { to: g });
  const sl = new THREE.Mesh(new THREE.PlaneGeometry(.12, .15), new THREE.MeshStandardMaterial({ color: '#fbf6ea', side: THREE.DoubleSide, roughness: .8 })); sl.position.set(.06, .15, 0); sl.castShadow = true; g.add(sl); g.position.set(x, .02, z); g.rotation.y = rot; scene.add(g); return g; }

const flags = [];
function flagTex(o) { const c = document.createElement('canvas'); c.width = 256; c.height = 160; const g = c.getContext('2d'); g.fillStyle = TEAMS[o].color; g.fillRect(0, 0, 256, 160);
  const gr = g.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(0,0,0,.18)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 160);
  g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(0, 126, 256, 8); g.font = '900 104px TDisplay'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.direction = 'rtl'; g.fillText(TEAMS[o].mark, 128, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
const flagTexs = TEAMS.map((_, i) => null);
function makeFlag(x, z, o, h = .5, big = 1) {
  const y = groundY(x, z), g = new THREE.Group();
  add(new THREE.Mesh(new THREE.CylinderGeometry(.007 * big, .01 * big, h, 6), mat('#5a4632')), [0, h / 2, 0], { to: g });
  add(new THREE.Mesh(new THREE.SphereGeometry(.015 * big, 10, 8), mat(C.gold, { metalness: .65, roughness: .3, flatShading: false })), [0, h + .01, 0], { to: g });
  const W = .25 * big, Hh = .155 * big, geo = new THREE.PlaneGeometry(W, Hh, 14, 6); geo.translate(W / 2, 0, 0);
  flagTexs[o] = flagTexs[o] || flagTex(o);
  const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: flagTexs[o], roughness: .75, side: THREE.DoubleSide })); cloth.castShadow = true; g.add(cloth);
  g.position.set(x, y, z); g.rotation.y = .35; scene.add(g);
  const f = { o, g, cloth, base: geo.attributes.position.array.slice(), h, Hh, W, ph: rnd() * 6, lift: 1 }; flags.push(f); return f;
}
function waveFlags(t) { flags.forEach(f => { if (!f.g.visible) return; const a = f.cloth.geometry.attributes.position; for (let i = 0; i < a.count; i++) { const x = f.base[i * 3], k = x / f.W; a.array[i * 3 + 2] = (Math.sin(x * 24 / (f.W / .25) - t * 6 + f.ph) * .02 + Math.sin(x * 9 - t * 3.1) * .01) * k * (f.W / .25); a.array[i * 3 + 1] = f.base[i * 3 + 1] - k * k * .008; } a.needsUpdate = true; f.cloth.geometry.computeVertexNormals();
  f.cloth.position.y = lerp(.02 + f.Hh / 2, f.h - f.Hh / 2 - .01, f.lift); f.cloth.visible = f.lift > .01; }); }

const regFlag = {};
M.regions.forEach(r => {
  const [x, z] = at(r), o = owner[r.id];
  switch (r.type) {
    case 'farm': { const rot = rnd() * .3 - .15; const fc = ['#e3c45c', '#bcd36c', '#d9b04c', '#a9cc63']; let nf = 0; for (let i = 0; i < 6; i++) { const gx = x - .3 + (i % 3) * .19, gz = z - .02 + Math.floor(i / 3) * .16; if (!inMarch(gx, gz, .48)) { field(gx, gz, .16, .13, fc[(i + Math.floor(rnd() * 2)) % 4], rot); nf++; } } for (let i = 0; nf < 6 && i < 12; i++) { const q = spot(x, z, .3, .75, .1, r.id, .01); if (q && !inMarch(q[0], q[1], .48)) { field(q[0], q[1], .16, .13, fc[i % 4], rot); nf++; } } const q = spot(x + .1, z - .1, .25, .45, .1, r.id); if (q) house(q[0], q[1], .95, C.roof2, faceTo(q[0], q[1], x, z)); break; }
    case 'village': { if (!inMarch(x, z)) well(x, z); for (let i = 0; i < 5; i++) { const sc = .95 + rnd() * .15, q = spot(x, z, .2, .38, .1 * sc, r.id); if (q) house(q[0], q[1], sc, rnd() > .5 ? C.roof : C.roof2, faceTo(q[0], q[1], x, z) + (rnd() - .5) * .4); } break; }
    case 'quarry': for (let i = 0; i < 8; i++) rock(x + (rnd() - .5) * .45, z + (rnd() - .5) * .35, .8 + rnd() * 1.1); add(new THREE.Mesh(new THREE.BoxGeometry(.08, .05, .06), mat('#d8d0bc')), [x + .2, groundY(x + .2, z + .15) + .025, z + .15]); break;
    case 'mine': { const gx = x + .1, gz = z + .25, gy = groundY(gx, gz); add(new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .02, 12, 1, false, 0, Math.PI), mat('#2a1d12')), [gx, gy + .03, gz]).rotation.x = Math.PI / 2;
      for (let i = 0; i < 4; i++) add(new THREE.Mesh(new THREE.OctahedronGeometry(.016 + rnd() * .01, 0), mat(C.gold, { metalness: .75, roughness: .25, emissive: '#7a5a00', emissiveIntensity: .3 })), [gx + .05 + rnd() * .06, gy + .015, gz + .02 + rnd() * .05]); break; }
    case 'rich': add(new THREE.Mesh(new THREE.OctahedronGeometry(.04, 0), mat('#5ec8e8', { metalness: .3, roughness: .15, emissive: '#1f6f8a', emissiveIntensity: .5 })), [x + .16, groundY(x + .16, z + .1) + .05, z + .1]); break;
    case 'port': { const y = groundY(x, z); const dir = Math.atan2(-z, -x) + Math.PI; house(x - .05, z - .05, .95, C.roof2, dir); const dx = Math.cos(dir), dz = Math.sin(dir);
      const dock = add(new THREE.Mesh(new THREE.BoxGeometry(.5, .025, .08), mat(C.wood)), [x + dx * .35, .05, z + dz * .35]); dock.rotation.y = -dir; boat(x + dx * .55 + dz * .12, z + dz * .55 - dx * .12, -dir + .3); boat(x + dx * .7 - dz * .1, z + dz * .7 + dx * .1, -dir - .4); break; }
    case 'capital': { const y = groundY(x, z), col = TEAMS[o].color; tower(x, y, z, .075, .42, col); ring(x, z, y, .24, .19, 6, .1, .035, col, .045);
      for (let i = 0; i < 7; i++) { const q = spot(x, z, .36, .58, .085, r.id); if (q) house(q[0], q[1], .82, i % 2 ? C.roof : C.roof2, faceTo(q[0], q[1], x, z)); } break; }
    case 'castle': { const y = groundY(x, z); ring(x, z, y, .5, .4, 8, .2, .055, '#6f7d8b', .075); tower(x, y, z, .13, .62, '#5f6d7b'); tower(x - .17, y, z + .08, .07, .4, '#6f7d8b'); tower(x + .17, y, z + .08, .07, .4, '#6f7d8b'); break; }
  }
  if (o != null) { const big = r.type === 'capital' || r.type === 'castle';
    const fs = big ? [x, z] : (spot(x, z, 0, .3, .04, r.id, .03) || spot(x, z, .2, .6, .04, r.id, .01) || [x, z]); if (!big) OBST.push(['راية', fs[0], fs[1], .035]); const [fx, fz] = fs; regFlag[r.id] = makeFlag(fx, fz, o, r.type === 'castle' ? 1.25 : big ? .9 : .52, big ? 1.45 : 1);
    if (r.type === 'castle' || r.type === 'capital') regFlag[r.id].g.position.y += r.type === 'castle' ? .62 + .13 * 1.05 : .42 + .08; }
});

for (const k in treeSpots) treeSpots[k] = treeSpots[k].filter(t => !OBST.some(o => Math.hypot(o[1] - t[0], o[2] - t[2]) < o[3] + .075 * t[3]));
instanced(new THREE.CylinderGeometry(.016, .024, .1, 6), mat('#7a5236'), [...treeSpots.pine, ...treeSpots.round], t => [V(t[0], t[1] + .05 * t[3], t[2]), V(t[3], t[3], t[3])]);
instanced(new THREE.ConeGeometry(.1, .2, 7), mat('#2f7a3e'), treeSpots.pine, t => [V(t[0], t[1] + .17 * t[3], t[2]), V(t[3], t[3], t[3])]);
instanced(new THREE.ConeGeometry(.075, .16, 7), mat('#3f9248'), treeSpots.pine, t => [V(t[0], t[1] + .27 * t[3], t[2]), V(t[3], t[3], t[3])]);
instanced(new THREE.IcosahedronGeometry(.095, 0), mat('#5aa64a'), treeSpots.round.filter((_, i) => i % 2), t => [V(t[0], t[1] + .17 * t[3], t[2]), V(t[3], t[3] * .95, t[3])]);
instanced(new THREE.IcosahedronGeometry(.095, 0), mat('#6db552'), treeSpots.round.filter((_, i) => !(i % 2)), t => [V(t[0], t[1] + .17 * t[3], t[2]), V(t[3], t[3] * .95, t[3])]);

// شجيرات وأزهار صغيرة تكسو الأرض
{ const bush = [], flower = []; for (let i = 0; i < 2600; i++) { const x = lerp(-9, 9.5, rnd()), z = lerp(-4.6, 4.6, rnd()), cd = coastDist(x, z); if (cd < .3) continue; const h = heightAt(x, z, cd); if (h > .42) continue; const b = rnd() > .3, it = [x, h, z, .6 + rnd() * .7, rnd() * 6]; if (!inMarch(x, z) && !OBST.some(o => Math.hypot(o[1] - x, o[2] - z) < o[3] + .03)) (b ? bush : flower).push(it); }
  instanced(new THREE.IcosahedronGeometry(.03, 0), mat('#4f9a3f'), bush, t => [V(t[0], t[1] + .012, t[2]), V(t[3], t[3] * .7, t[3])]);
  const fl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.012, 0), mat('#ffffff'), flower.length), m4 = new THREE.Matrix4(), FC = ['#f6e27a', '#f4f1ea', '#e98aa0', '#c9a4ec'].map(c => new THREE.Color(c)); flower.forEach((t, i) => { fl.setMatrixAt(i, m4.makeTranslation(t[0], t[1] + .01, t[2])); fl.setColorAt(i, FC[i % 4]); }); scene.add(fl); }

// ---------- الطرق: شريط ترابي ناعم الحواف يتبع التضاريس ----------
{ const pos = [], col = [], idx = [], c = new THREE.Color('#cfae7a'), W = .033; let base = 0;
  ROADS.forEach(L => { L.forEach((q, i) => { const a = L[Math.max(0, i - 1)], b = L[Math.min(L.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz), nx = -dz / l, nz = dx / l, end = Math.min(i, L.length - 1 - i) / 2;
      [-1.9, -1, 0, 1, 1.9].forEach((k, j) => { const x = q[0] + nx * W * k, z = q[1] + nz * W * k; pos.push(x, heightAt(x, z) + .006, z); col.push(c.r, c.g, c.b, (j === 0 || j === 4 ? 0 : .95) * Math.min(1, end)); }); });
    for (let i = 0; i < L.length - 1; i++) for (let j = 0; j < 4; j++) { const a = base + i * 5 + j, b = a + 5; idx.push(a, b, a + 1, a + 1, b, b + 1); } base += L.length * 5; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 1, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); m.receiveShadow = true; scene.add(m); }

// ---------- الأسماء (خط ثمانية، حجم ثابت على الشاشة) ----------
function label(text, x, y, z, { size = 30, font = 'TSans', weight = 700, h = .03, sub } = {}) {
  const dpr = 3, Hd = sub ? 92 : 64; const meas = document.createElement('canvas').getContext('2d'); meas.font = `${weight} ${size}px ${font}`; const Wd = Math.ceil(Math.max(meas.measureText(text).width, sub ? 120 : 0) + 40);
  const cv = document.createElement('canvas'); cv.width = Wd * dpr; cv.height = Hd * dpr; const g = cv.getContext('2d'); g.scale(dpr, dpr);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
  const draw = (t, y, f) => { g.font = f; g.lineJoin = 'round'; g.strokeStyle = 'rgba(12,28,24,.55)'; g.lineWidth = 6; g.strokeText(t, Wd / 2, y); g.fillStyle = '#fff'; g.fillText(t, Wd / 2, y); };
  draw(text, sub ? 34 : Hd / 2, `${weight} ${size}px ${font}`); if (sub) draw(sub, 70, `500 ${size * .55}px TSans`);
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8; tx.minFilter = THREE.LinearMipmapLinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, depthTest: false, transparent: true, sizeAttenuation: false })); sp.center.set(.5, 1); sp.scale.set(h * Wd / Hd, h, 1); sp.position.set(x, y, z); sp.renderOrder = 10; scene.add(sp); return sp;
}
const labels = [];
function makeLabels() {
  M.regions.forEach(r => { const [x, z] = at(r);
    if (r.type === 'castle') labels.push(label('القلعـة الكبرى', x, groundY(x, z) + .05, z + .55, { size: 34, font: 'TDisplay', weight: 900, h: .034 }));
    else if (r.type === 'capital') labels.push(label('عاصمة ' + TEAMS[owner[r.id]].name, x, groundY(x, z) + .05, z + .36, { size: 30, font: 'TDisplay', weight: 700, h: .026 }));
    else labels.push(Object.assign(label(r.name, x, groundY(x, z + .3) + .04, z + .3, { size: 26, weight: 500, h: .022 }), { userData: { reg: r.id } })); });
}

// ---------- الجنود والفرسان (مجسّمات بلا وجوه) ----------
const teamMats = {}; const tm = (o, k) => { const key = o + k; if (teamMats[key]) return teamMats[key]; const c = new THREE.Color(TEAMS[o].color);
  const M2 = { cloth: mat(c, { flatShading: false, roughness: .7 }), dark: mat(c.clone().multiplyScalar(.62), { flatShading: false, roughness: .75, side: THREE.DoubleSide }), trim: mat('#f1e3b5', { flatShading: false, roughness: .6 }) }; return (teamMats[key] = M2[k]); };
const SM = { metal: new THREE.MeshStandardMaterial({ color: '#d4d8dd', metalness: .85, roughness: .28 }), gold: new THREE.MeshStandardMaterial({ color: '#e9b949', metalness: .9, roughness: .25 }), leather: mat('#5b3f2a', { flatShading: false }), skin: mat('#d9b48f', { flatShading: false }), wood: mat('#6b4f35', { flatShading: false }), horse: [mat('#7a4e2d', { flatShading: false, roughness: .6 }), mat('#3d2a1d', { flatShading: false, roughness: .6 }), mat('#d8cfc2', { flatShading: false, roughness: .6 })], hair: mat('#1f1610', { flatShading: false }) };
const cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg), sph = (r, a = 16, b = 12) => new THREE.SphereGeometry(r, a, b);
function mesh(g, m, p, rot, to) { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; if (p) o.position.set(...p); if (rot) o.rotation.set(...rot); to.add(o); return o; }
// جسم المحارب (للمشاة والفارس)
function torso(o, to, seated = false) {
  const g = new THREE.Group(); to.add(g);
  mesh(cyl(.016, .025, .05, 14), tm(o, 'cloth'), [0, .055, 0], null, g);                     // السترة
  mesh(new THREE.TorusGeometry(.0185, .0035, 6, 16), SM.leather, [0, .043, 0], [Math.PI / 2, 0, 0], g); // الحزام
  mesh(new THREE.BoxGeometry(.006, .045, .004), tm(o, 'trim'), [0, .058, .019], null, g);    // شريط الصدر
  mesh(sph(.012), SM.metal, [-.019, .077, 0], null, g).scale.set(1, .7, 1); mesh(sph(.012), SM.metal, [.019, .077, 0], null, g).scale.set(1, .7, 1); // الكتفان
  mesh(sph(.0125), SM.skin, [0, .094, 0], null, g);                                          // الرأس
  mesh(new THREE.SphereGeometry(.0145, 16, 8, 0, Math.PI * 2, 0, Math.PI * .55), SM.metal, [0, .096, 0], null, g); // الخوذة
  mesh(new THREE.TorusGeometry(.0138, .0018, 6, 18), SM.metal, [0, .093, 0], [Math.PI / 2, 0, 0], g);
  mesh(new THREE.BoxGeometry(.004, .016, .02), tm(o, 'cloth'), [0, .112, -.002], null, g);   // العُرف
  const cape = mesh(new THREE.PlaneGeometry(.034, .05, 1, 3), tm(o, 'dark'), [0, .06, -.02], [.18, 0, 0], g); // الرداء
  const armR = new THREE.Group(); armR.position.set(.021, .072, 0); g.add(armR); mesh(cyl(.0055, .005, .036, 8), tm(o, 'cloth'), [0, -.016, .004], [.4, 0, 0], armR);
  const armL = new THREE.Group(); armL.position.set(-.021, .072, 0); g.add(armL); mesh(cyl(.0055, .005, .034, 8), tm(o, 'cloth'), [0, -.015, .006], [.6, 0, 0], armL);
  // الدرس: ترس دائري بحافة ذهبية
  const shield = new THREE.Group(); shield.position.set(-.026, .055, .016); shield.rotation.y = -.5; g.add(shield);
  mesh(cyl(.019, .019, .004, 20), tm(o, 'cloth'), null, [Math.PI / 2, 0, 0], shield); mesh(new THREE.TorusGeometry(.019, .0022, 6, 22), SM.gold, null, null, shield); mesh(sph(.005, 10, 8), SM.gold, [0, 0, .003], null, shield);
  // الرمح
  const spear = new THREE.Group(); spear.position.set(.024, .06, .008); g.add(spear); mesh(cyl(.0022, .0022, .2, 6), SM.wood, [0, .045, 0], null, spear); mesh(new THREE.ConeGeometry(.0055, .022, 8), SM.metal, [0, .156, 0], null, spear);
  return { g, armR, armL, spear, cape };
}
function soldier(o) {
  const g = new THREE.Group(); scene.add(g);
  const legL = new THREE.Group(), legR = new THREE.Group(); legL.position.set(-.008, .032, 0); legR.position.set(.008, .032, 0); g.add(legL, legR);
  for (const L of [legL, legR]) { mesh(cyl(.0055, .005, .028, 8), SM.leather, [0, -.014, 0], null, L); mesh(new THREE.BoxGeometry(.011, .007, .016), SM.leather, [0, -.029, .003], null, L); }
  const t = torso(o, g); g.userData = { legL, legR, ...t, kind: 'foot' }; g.scale.setScalar(1.55); return g;
}
function rider(o, coat = 0, banner = false) {
  const g = new THREE.Group(); scene.add(g); const H = SM.horse[coat];
  const horse = new THREE.Group(); g.add(horse);
  mesh(new THREE.CapsuleGeometry(.03, .06, 8, 16), H, [0, .092, -.004], [Math.PI / 2, 0, 0], horse);          // الجسم
  mesh(sph(.031, 16, 12), H, [0, .097, .036], null, horse).scale.set(1, 1.05, .9);                                // الصدر
  const neck = new THREE.Group(); neck.position.set(0, .108, .05); horse.add(neck); mesh(cyl(.014, .021, .06, 12), H, [0, .026, .012], [.5, 0, 0], neck);
  const head = new THREE.Group(); head.position.set(0, .056, .032); neck.add(head); mesh(new THREE.CapsuleGeometry(.0115, .026, 4, 12), H, [0, -.006, .014], [2.0, 0, 0], head);
  mesh(new THREE.ConeGeometry(.004, .012, 6), H, [-.006, .014, -.002], null, head); mesh(new THREE.ConeGeometry(.004, .012, 6), H, [.006, .014, -.002], null, head);
  mesh(new THREE.BoxGeometry(.006, .055, .014), SM.hair, [0, .03, .002], [.5, 0, 0], neck);                      // العرف
  const tail = mesh(new THREE.ConeGeometry(.009, .06, 8), SM.hair, [0, .095, -.064], [-2.4, 0, 0], horse);
  mesh(new THREE.BoxGeometry(.05, .012, .05), tm(o, 'cloth'), [0, .124, -.004], null, horse);                    // السرج
  mesh(new THREE.BoxGeometry(.064, .03, .006), tm(o, 'cloth'), [0, .105, -.03], null, horse); mesh(new THREE.BoxGeometry(.065, .004, .007), tm(o, 'trim'), [0, .089, -.03], null, horse); // الغطاء الخلفي
  const legs = []; for (const [x, z] of [[-.015, .036], [.015, .036], [-.015, -.03], [.015, -.03]]) { const L = new THREE.Group(); L.position.set(x, .08, z); horse.add(L); mesh(cyl(.0085, .006, .066, 8), H, [0, -.033, 0], null, L); mesh(cyl(.0065, .0072, .008, 8), SM.hair, [0, -.07, 0], null, L); legs.push(L); }
  const man = new THREE.Group(); man.position.set(0, .088, -.004); horse.add(man); const t = torso(o, man);
  mesh(cyl(.006, .005, .03, 8), SM.leather, [-.02, .035, .005], [0, 0, .9], man); mesh(cyl(.006, .005, .03, 8), SM.leather, [.02, .035, .005], [0, 0, -.9], man);
  t.spear.rotation.x = .9; t.spear.scale.set(1, 1.25, 1);
  let flag = null; if (banner) { const pole = new THREE.Group(); pole.position.set(.024, .06, -.01); man.add(pole); mesh(cyl(.002, .002, .28, 6), SM.wood, [0, .1, 0], null, pole);
    const W = .07, Hh = .045, geo = new THREE.PlaneGeometry(W, Hh, 8, 4); geo.translate(-W / 2, 0, 0); const cl = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: flagTexs[o] || null, color: flagTexs[o] ? '#fff' : TEAMS[o].color, side: THREE.DoubleSide, roughness: .75 })); cl.position.set(0, .215, 0); cl.rotation.y = Math.PI / 2; cl.castShadow = true; pole.add(cl); flag = { cl, base: geo.attributes.position.array.slice(), W, o }; t.spear.visible = false; }
  g.userData = { horse, neck, head, tail, legs, ...t, flag, kind: 'horse' }; g.scale.setScalar(1.55); return g;
}
function animUnit(s, t, walking, i, fighting) {
  const u = s.userData, ph = t * (u.kind === 'horse' ? 13 : 10) + i * 1.7;
  if (u.kind === 'foot') { u.legL.rotation.x = walking ? Math.sin(ph) * .65 : 0; u.legR.rotation.x = walking ? -Math.sin(ph) * .65 : 0; u.armL.rotation.x = walking ? -Math.sin(ph) * .25 : 0;
    s.position.y += walking ? Math.abs(Math.sin(ph)) * .007 : 0; }
  else { const g = walking ? 1 : 0; u.legs[0].rotation.x = Math.sin(ph) * .55 * g; u.legs[1].rotation.x = Math.sin(ph + .5) * .55 * g; u.legs[2].rotation.x = -Math.sin(ph + .3) * .5 * g; u.legs[3].rotation.x = -Math.sin(ph + .8) * .5 * g;
    u.horse.position.y = walking ? Math.abs(Math.sin(ph)) * .012 : 0; u.horse.rotation.x = walking ? Math.sin(ph) * .06 : 0; u.neck.rotation.x = walking ? Math.sin(ph + 1) * .12 : Math.sin(t * 2 + i) * .04; u.tail.rotation.x = -2.4 + Math.sin(t * 6 + i) * .15;
    if (u.flag) { const a = u.flag.cl.geometry.attributes.position; for (let k = 0; k < a.count; k++) { const x = u.flag.base[k * 3], q = -x / u.flag.W; a.array[k * 3 + 2] = Math.sin(-x * 70 - t * 9 + i) * .006 * q; } a.needsUpdate = true; } }
  u.spear.rotation.x = fighting ? -.6 + Math.sin(t * 16 + i * 2) * .7 : (u.kind === 'horse' ? .9 : 0);
  u.cape.rotation.x = .18 + (walking ? Math.sin(ph * .5) * .12 + .15 : 0);
}
const dustTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.5, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const puffs = [];
function puff(x, y, z, t0, { col = '#d9c49a', size = .25, life = 1.4, vy = .12, spread = .15, additive = false, op = .65 } = {}) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, color: col, transparent: true, opacity: 0, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
  sp.position.set(x, y, z); sp.visible = false; scene.add(sp); puffs.push({ sp, x, y, z, t0, size, life, vy, dx: (rnd() - .5) * spread, dz: (rnd() - .5) * spread, op }); }
function updatePuffs(t) { puffs.forEach(p => { const k = (t - p.t0) / p.life; if (k < 0 || k > 1) { p.sp.visible = false; return; } p.sp.visible = true; p.sp.material.opacity = Math.sin(k * Math.PI) * p.op; p.sp.scale.setScalar(p.size * (.6 + k * 1.2)); p.sp.position.set(p.x + p.dx * k, p.y + p.vy * k, p.z + p.dz * k); }); }

// ---------- مشهد الغزو ----------
const A = 0, D = 1, [fx, fz] = at(from), [tx, tz] = at(target);
const dirX = tx - fx, dirZ = tz - fz, dL = Math.hypot(dirX, dirZ), ux = dirX / dL, uz = dirZ / dL;
const path = MPATH;
const army = [], guards = [];
const ROWS = [[.02, .36, 'r', 0, true], [-.11, .25, 'r', 1], [.12, .14, 'r', 2]];
for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) ROWS.push([(c - 1.5) * .085, -r * .09, 'f']);
ROWS.forEach(([, , k, coat, ban]) => army.push(k === 'r' ? rider(A, coat, ban) : soldier(A)));
const guardPos = []; for (let i = 0; i < 7; i++) { const off = (i - 3) * .085, row = i % 2 ? .07 : 0; guardPos.push([clashP[0] + ux * (.07 + row) - uz * off, clashP[1] + uz * (.07 + row) + ux * off]); guards.push(soldier(D)); }
const T = { start: .8, march: [1.6, 5.2], clash: [5.2, 6.7], lower: [6.7, 7.5], raise: [7.5, 8.5], spread: [8.2, 10], end: 11.4 };
for (let i = 0; i < 30; i++) { const x = clashP[0] + (rnd() - .5) * .35, z = clashP[1] + (rnd() - .5) * .35; puff(x, groundY(x, z) + .03, z, T.clash[0] + rnd() * 1.3, { size: .26 + rnd() * .22, life: 1.2 + rnd() * .6, op: .75 }); }
for (let i = 0; i < 22; i++) { const x = clashP[0] + (rnd() - .5) * .22, z = clashP[1] + (rnd() - .5) * .22; puff(x, groundY(x, z) + .1 + rnd() * .06, z, T.clash[0] + .2 + rnd() * 1.2, { col: '#ffd27a', size: .05, life: .3, vy: .22, spread: .45, additive: true, op: 1 }); }
for (let i = 0; i < 34; i++) { const k = i / 34, p = path.getPointAt(k); puff(p.x + (rnd() - .5) * .16, groundY(p.x, p.z) + .02, p.z + (rnd() - .5) * .16, lerp(T.march[0], T.march[1], k), { size: .18, life: 1.1, vy: .05, op: .5 }); }
const oldFlag = regFlag[target.id], newFlag = makeFlag(oldFlag.g.position.x, oldFlag.g.position.z, A, .52, 1); newFlag.lift = 0;

function placeArmy(t) {
  const k = ease(seg(t, ...T.march)), fight = seg(t, ...T.clash), push = ease(seg(t, T.clash[0] + .6, T.clash[1])) * .12;
  const lead = path.getPointAt(Math.min(1, k)), tan = path.getTangentAt(Math.min(.999, k)), ang = Math.atan2(tan.x, tan.z);
  army.forEach((s, i) => { const [ox, oz] = ROWS[i], c = Math.cos(ang), sn = Math.sin(ang); let x = lead.x + ox * c + oz * sn + ux * push, z = lead.z - ox * sn + oz * c + uz * push;
    if (fight > 0 && fight < 1) { x += Math.sin(t * 23 + i) * .006; z += Math.cos(t * 19 + i) * .006; }
    s.visible = t >= T.march[0] - .2; s.position.set(x, groundY(x, z), z); s.rotation.y = ang;
    animUnit(s, t, k > 0 && k < 1, i, fight > 0 && fight < 1); });
  guards.forEach((s, i) => { const [x0, z0] = guardPos[i], fall = seg(t, T.clash[0] + .6 + i * .1, T.clash[1] + .1), back = ease(fall) * .1, x = x0 + ux * back, z = z0 + uz * back;
    s.position.set(x, groundY(x, z), z); s.rotation.set(0, Math.atan2(-ux, -uz), 0); s.rotation.z = ease(fall) * 1.5 * (i % 2 ? 1 : -1); s.position.y -= ease(fall) * .015;
    animUnit(s, t, false, i + 20, fight > 0 && fall < 1);
    const gone = ease(seg(t, T.clash[1] + .1, T.clash[1] + .8)); s.scale.setScalar(1.55 * (1 - gone)); s.visible = gone < .99; });
}
const tgtV = V(tx, groundY(tx, tz), tz), fromV = V(fx, groundY(fx, fz), fz);
const overview = { pos: V(-.25, 17.4, 13.2), look: V(-.25, 0, -.55) };
function camAt(t) {
  const focus = tgtV.clone().lerp(fromV, .5), close = { pos: focus.clone().add(V(-uz * 2.6 + ux * .8, 3.4, ux * 2.6 + uz * .8)), look: focus.clone() };
  const pk = Math.min(1, ease(seg(t, ...T.march))), pp = path.getPointAt(pk), follow = { pos: pp.clone().add(V(-uz * 2.0 + ux * 1.0, 2.0, ux * 2.0 + uz * 1.0)), look: pp.clone().add(V(ux * .1, .05, uz * .1)) };
  const cp = V(clashP[0], groundY(...clashP), clashP[1]), fL = cp.clone().lerp(tgtV, .42), fin = { pos: fL.clone().add(V(-uz * 2.3 - ux * .2, 2.3, ux * 2.3 - uz * .2)), look: fL.clone().add(V(0, .1, 0)) };
  const out = { pos: tgtV.clone().add(V(0, 9.5, 6.6)), look: tgtV.clone().add(V(0, 0, -.4)) };
  let a, b, k;
  if (t < T.start) { a = b = overview; k = 0; }
  else if (t < T.march[0] + .5) { a = overview; b = close; k = ease(seg(t, T.start, T.march[0] + .5)); }
  else if (t < T.march[1]) { a = close; b = follow; k = ease(seg(t, T.march[0] + .5, T.march[0] + 1.6)); }
  else if (t < T.lower[0]) { a = follow; b = fin; k = ease(seg(t, T.march[1], T.lower[0])); }
  else if (t < T.spread[1]) { a = b = fin; k = 0; }
  else { a = fin; b = out; k = ease(seg(t, T.spread[1], T.end)); }
  camera.position.lerpVectors(a.pos, b.pos, k); camera.lookAt(new THREE.Vector3().lerpVectors(a.look, b.look, k));
}

// ---------- الواجهة ----------
const share = () => TEAMS.map((_, i) => M.regions.reduce((a, r) => a + (owner[r.id] === i ? (r.castle ? 5 : 1) : 0), 0));
function hud() { const s = share(), tot = M.regions.length + 4;
  document.getElementById('bar').innerHTML = TEAMS.map((t, i) => `<i style="flex:${s[i]};background:${t.color}"></i>`).join('') + `<i style="flex:${tot - s.reduce((a, b) => a + b)};background:rgba(255,255,255,.22)"></i>`;
  document.getElementById('names').innerHTML = TEAMS.map((t, i) => `<span><i class="chip" style="background:${t.color}"></i>${t.name}<b>${Math.round(s[i] / tot * 100)}٪</b></span>`).join(''); }
const banner = document.getElementById('banner');
const setBanner = (k, html, col) => { document.getElementById('bk').textContent = k; document.getElementById('bt').innerHTML = html; banner.style.setProperty('--c', col); };
let conquered = false;
function applyT(t) {
  U.uTime.value = t; placeArmy(t); updatePuffs(t); if (window.__cam) { camera.position.set(...window.__cam[0]); camera.lookAt(...window.__cam[1]); } else camAt(t);
  oldFlag.lift = 1 - ease(seg(t, ...T.lower)); oldFlag.g.visible = t < T.lower[1] + .05;
  newFlag.g.visible = t >= T.raise[0]; newFlag.lift = ease(seg(t, ...T.raise)); waveFlags(t);
  const sp = ease(seg(t, ...T.spread)); teamU.uCR.value = sp > 0 && sp < 1 ? target.id : -1; teamU.uCFrom.value.set(TEAMS[D].color); teamU.uCTo.value.set(TEAMS[A].color); teamU.uCC.value.set(clashP[0], clashP[1]); teamU.uCRad.value = sp * 2.4;
  const now = t >= T.spread[0] + .9; if (now !== conquered) { conquered = now; owner[target.id] = conquered ? A : D; setTint(target.id); buildBorders(); hud(); }
  labels.forEach(l => l.material.opacity = l.userData.reg === target.id ? 0 : t < T.start ? 1 - ease(seg(t, T.start - .5, T.start)) : ease(seg(t, T.end - .7, T.end)));
  if (t >= T.start && t < T.clash[1]) { setBanner('هجوم', `<em>${TEAMS[A].name}</em> يزحفـون على ${target.name}`, TEAMS[A].color); banner.classList.add('on'); }
  else if (t >= T.raise[0]) { setBanner('فتح', `<em>${TEAMS[A].name}</em> يفتحـون ${target.name}`, TEAMS[A].color); banner.classList.add('on'); }
  else banner.classList.remove('on');
}
function resize(w, h) { renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
window.R = {
  ready: (async () => { await Promise.all(['900 40px TDisplay', '700 30px TDisplay', '700 26px TSans', '500 16px TSans'].map(f => document.fonts.load(f))); await document.fonts.ready;
    TEAMS.forEach((_, i) => { flagTexs[i] = flagTex(i); }); flags.forEach(f => { f.cloth.material.map = flagTexs[f.o]; f.cloth.material.needsUpdate = true; });
    army.forEach(s => { const f = s.userData.flag; if (f) { f.cl.material.map = flagTexs[f.o]; f.cl.material.color.set('#fff'); f.cl.material.needsUpdate = true; } });
    makeLabels(); hud(); resize(innerWidth, innerHeight); return true; })(),
  renderAt(t) { applyT(t); renderer.render(scene, camera); }, resize, T, stats: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
  armyPos: () => army.slice(0, 3).map(s => s.position.toArray()),
  layout() { const L = OBST.filter(o => o[0] !== 'سور' && o[0] !== 'طريق'), bad = [];
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const a = L[i], b = L[j]; if (a[0] === b[0] && (a[0] === 'حقل' || a[0] === 'صخرة')) continue; if (a[0] === 'برج' && b[0] === 'برج') continue; const d = Math.hypot(a[1] - b[1], a[2] - b[2]) - a[3] - b[3]; if (d < 0) bad.push([a[0], b[0], +d.toFixed(3)]); }
    const walls = OBST.filter(o => o[0] === 'سور'); L.filter(o => o[0] === 'بيت' || o[0] === 'بئر').forEach(h => walls.forEach(w => { const d = Math.hypot(h[1] - w[1], h[2] - w[2]) - h[3] - w[3]; if (d < 0) bad.push([h[0], 'سور', +d.toFixed(3)]); }));
    return { houses: L.filter(o => o[0] === 'بيت').length, n: bad.length, first: bad.slice(0, 10) }; },
  check() { const bad = [], obs = [...OBST.filter(o => o[0] !== 'طريق'), ...[...treeSpots.pine, ...treeSpots.round].map(t => ['شجرة', t[0], t[2], .08 * t[3]])];
    for (let t = T.march[0]; t <= T.end; t += .05) { placeArmy(t); [...army, ...guards].forEach((u, i) => { if (!u.visible || u.scale.x < .5) return; const r = i < 3 ? .06 : .035;
      obs.forEach(([k, x, z, R]) => { const d = Math.hypot(u.position.x - x, u.position.z - z) - R - r; if (d < 0) bad.push([+t.toFixed(2), i < army.length ? 'مهاجم' + i : 'مدافع', k, +d.toFixed(3)]); }); }); }
    return { n: bad.length, first: bad.slice(0, 12) }; },
  info: () => ({ roads: ROADS.length, roadPts: ROADS.reduce((a, l) => a + l.length, 0), dB: mdL * MB, mdL, target: target.name, from: from.name, regions: M.regions.length, trees: treeSpots.pine.length + treeSpots.round.length })
};
if (!location.hash.includes('manual')) R.ready.then(() => { const t0 = performance.now(); const loop = () => { R.renderAt(((performance.now() - t0) / 1000) % (T.end + 3)); requestAnimationFrame(loop); }; loop(); });
addEventListener('resize', () => resize(innerWidth, innerHeight));
