/* رايات — العالم ثلاثي الأبعاد الحي (شاشة العرض)
   يرسم الجزيرة من خريطة RayatMap وحالة اللعبة، ويشغّل مشاهد الأحداث متدرجة بلا قفزات.
   كل الحركات تسير على مسارات تُحسب لحظتها (A*) بعيدًا عن البيوت والأشجار والأسوار، وكل شيء يُفحص آليًا. */
(function (G) {
  'use strict';
  const T3 = () => G.THREE;
  // المقاسات المعتمدة (11 نوفمبر) مقارنة بالسابق: الجزيرة +25٪، الجنود والفرسان والمنجنيق والعربات +25٪، السفن +35٪ وطاقمها بحجم الجنود،
  // البيوت والآبار والأسوار والأبراج +10٪، الأشجار والصخور +10٪، العواصم والقلعة والمعالم والرايات +15٪، الجبال والحقول تكبر مع الأرض، الطرق أعرض 15٪
  const SZ = Object.assign({ island: 1.25, unit: 1.25, ship: 1.35, house: 1.1, crew: 1.28, keep: 1.15, flag: 1.15, tree: 1.1, road: 1.15, frame: 1, lookZ: 0 }, G.RAYAT_SIZES || {});
  const K = SZ.island; // الأبعاد داخل الأرض (مواضع البيوت والحقول والأشجار والجبال) تكبر مع الجزيرة
  const S = SZ.island / 100, CX = 930, CY = 600;
  const P = (x, y) => [(x - CX) * S, (y - CY) * S];
  const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, seg = (t, a, b) => clamp((t - a) / (b - a));
  // حركة بسرعة ثابتة مع انطلاق وتوقف ناعمين (15٪ تسارع، 70٪ سرعة ثابتة، 15٪ تهدئة)
  const glide = k => { const a = .15; k = clamp(k); return k < a ? k * k / (2 * a * (1 - a)) : k > 1 - a ? 1 - (1 - k) * (1 - k) / (2 * a * (1 - a)) : (k - a / 2) / (1 - a); };
  // سرعات الوحدات (وحدة عالم في الثانية): المدة تُحسب من طول المسار
  const SPEED0 = { inf: .36, cav: .56, cat: .3, cart: .34, ship: 1.05, msg: .95 }; // سرعات بوحدات الجزيرة السابقة
  const SPEED = Object.fromEntries(Object.entries(SPEED0).map(([k, v]) => [k, v * K])); // المسافات أطول بنسبة الجزيرة، فتزيد السرعة بالنسبة نفسها وتبقى المشاهد 4–8 ثوانٍ
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const mkRnd = s => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const vnoise = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v); };
  const fbm = (x, y) => vnoise(x, y) * .5 + vnoise(x * 2.1, y * 2.1) * .25 + vnoise(x * 4.3, y * 4.3) * .125 + vnoise(x * 8.7, y * 8.7) * .0625;

  // أجواء المراحل: من الصباح إلى ليل التتويج (تتدرج، لا تقفز)
  const SKY = {
    opening: { sun: '#fff1d6', si: 2.9, hemi: .85, sea: '#0e4a5e', sx: -6, sy: 11, sz: 5, exp: 1.08, torch: 0 },
    expansion: { sun: '#ffeccc', si: 3.0, hemi: .88, sea: '#0e4a5e', sx: -4, sy: 12, sz: 4, exp: 1.08, torch: 0 },
    friction: { sun: '#fff6e8', si: 3.1, hemi: .9, sea: '#0f4d60', sx: -1, sy: 13, sz: 3, exp: 1.06, torch: 0 },
    war: { sun: '#ffd9a8', si: 2.8, hemi: .75, sea: '#0f4558', sx: 5, sy: 8, sz: 5, exp: 1.05, torch: 0 },
    siege: { sun: '#ffb874', si: 2.5, hemi: .6, sea: '#123d50', sx: 8, sy: 5, sz: 6, exp: 1.04, torch: .3 },
    final: { sun: '#ff8a5c', si: 2.0, hemi: .45, sea: '#1a2f45', sx: 9, sy: 3.6, sz: 7, exp: 1.0, torch: 1 },
    crown: { sun: '#9fb4ff', si: .9, hemi: .32, sea: '#0b1a2e', sx: -5, sy: 9, sz: -4, exp: 1.12, torch: 1 }
  };

  function World(canvas, map, teams, opt = {}) {
    const THREE = T3(), M = map, TEAMS = teams, rnd = mkRnd(opt.seed || 91);
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const W = { M, TEAMS, owner: {}, events: [], speed: 1, busy: false };
    M.regions.forEach(r => { W.owner[r.id] = null; });

    // ---------- الأرض ----------
    const del = d3.Delaunay.from(M.regions.map(r => r.seed));
    const regionAtW = (x, z) => del.find(x / S + CX, z / S + CY);
    const at = r => P(...r.at);
    const coastSegs = []; [M.main.poly, ...M.isles.map(i => i.poly)].forEach(L => L.forEach((p, i) => { const q = L[(i + 1) % L.length], [ax, az] = P(...p), [bx, bz] = P(...q); coastSegs.push([ax, az, bx, bz]); }));
    const lands = [M.main.poly, ...M.isles.map(i => i.poly)].map(L => L.map(p => P(...p)));
    const inPoly = (x, z, L) => { let c = false; for (let i = 0, j = L.length - 1; i < L.length; j = i++) { const [xi, zi] = L[i], [xj, zj] = L[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
    function coastDist(x, z) { let m = 1e9; for (const [ax, az, bx, bz] of coastSegs) { const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)), px = ax + t * dx - x, pz = az + t * dz - z, d = px * px + pz * pz; if (d < m) m = d; } m = Math.sqrt(m); return lands.some(L => inPoly(x, z, L)) ? m : -m; }
    const feats = [];
    M.regions.forEach(r => { const [x, z] = at(r);
      if (r.type === 'mine') { feats.push({ x: x - .12 * K, z: z - .05 * K, h: .95 * K, r: .42 * K, k: 'm' }); feats.push({ x: x + .26 * K, z: z + .08 * K, h: .62 * K, r: .32 * K, k: 'm' }); }
      if (r.type === 'rich') feats.push({ x, z, h: .55 * K, r: .3 * K, k: 'm' });
      if (r.type === 'quarry') feats.push({ x, z, h: .28 * K, r: .42 * K, k: 'q' });
      if (r.type === 'castle') feats.push({ x, z, h: .42, r: .78 * SZ.keep, k: 'p' });
      if (r.type === 'capital') feats.push({ x, z, h: .16, r: .55 * SZ.keep, k: 'p' }); });
    const flatRegion = id => ['farm', 'capital', 'castle', 'port', 'village'].includes(M.regions[id] && M.regions[id].type);
    function heightAt(x, z, cd = coastDist(x, z)) {
      if (cd < 0) return .006 + cd * .2 - sstep(.1, 1.5, -cd) * .62;
      let h = .006 + sstep(0, .4, cd) * .13;
      const id = regionAtW(x, z), rough = flatRegion(id) ? .35 : 1;
      h += (fbm(x * .9 / K + 7, z * .9 / K + 3) - .45) * .16 * rough * sstep(0, .5, cd);
      for (const f of feats) { const d = Math.hypot(x - f.x, z - f.z) / f.r; if (d > 1.6) continue;
        if (f.k === 'm') h += f.h * Math.exp(-d * d * 2.6) * (.82 + .35 * fbm(x * 3 + 1, z * 3 + 2));
        else if (f.k === 'q') h += f.h * Math.exp(-d * d * 2) * (.6 + .8 * fbm(x * 6, z * 6));
        else if (f.k === 'p') h = Math.max(h, lerp(h, f.h, 1 - sstep(.75, 1.15, d))); }
      return h;
    }
    // ذاكرة للارتفاع: شبكة دقيقة تُستعمل في الحركة والمباني (أسرع بكثير)
    // الارتفاع على سطح التضاريس المرسوم نفسه (من رؤوس الشبكة)، فلا يطفو شيء ولا يغوص
    let Hgrid = null, HW = 0, HH = 0, HX0 = 0, HZ0 = 0, HNX = 1, HNZ = 1;
    const groundY = (x, z) => { if (!Hgrid) return heightAt(x, z); const fx = (x - HX0) / HNX, fz = (z - HZ0) / HNZ, ix = Math.floor(fx), iz = Math.floor(fz); if (ix < 0 || iz < 0 || ix >= HW - 1 || iz >= HH - 1) return heightAt(x, z);
      const u = fx - ix, v = fz - iz, a = Hgrid[iz * HW + ix], b = Hgrid[iz * HW + ix + 1], c = Hgrid[(iz + 1) * HW + ix], d = Hgrid[(iz + 1) * HW + ix + 1];
      return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v); };

    // ---------- المحرك ----------
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: !!opt.capture, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(opt.maxDpr || 1.5, G.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08; renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY.opening.sea); scene.fog = new THREE.Fog(SKY.opening.sea, 20 * SZ.island, 40 * SZ.island);
    const camera = new THREE.PerspectiveCamera(30, 16 / 9, .1, 200);
    const hemi = new THREE.HemisphereLight('#dff0ff', '#6d5b3c', .85); scene.add(hemi);
    const sun = new THREE.DirectionalLight('#ffe9c9', 2.9); sun.position.set(-6, 11, 5); sun.castShadow = true;
    const SM_SIZE = opt.shadow || 2048; sun.shadow.mapSize.set(SM_SIZE, SM_SIZE); Object.assign(sun.shadow.camera, { left: -11 * SZ.island, right: 11 * SZ.island, top: 8 * SZ.island, bottom: -8 * SZ.island, near: 1, far: 40 * SZ.island }); sun.shadow.bias = -.0005; sun.shadow.normalBias = .03; sun.shadow.radius = 3;
    scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight('#a9d4ff', .55); fill.position.set(7, 5, -6); scene.add(fill);
    try { const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new G.RoomEnvironment(), .04).texture; scene.environmentIntensity = .22; } catch (e) { }
    const U = { uTime: { value: 0 } };
    const matCache = {};
    const mat = (c, o = {}) => { const k = (typeof c === 'string' ? c : c.getHexString()) + JSON.stringify(o, (kk, v) => (v && v.isTexture) ? v.uuid : v); if (!o.unique && matCache[k]) return matCache[k]; const m = new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .8, metalness: 0, flatShading: true }, o)); delete m.unique; if (!o.unique) matCache[k] = m; return m; };
    const add = (m, p, o = {}) => { m.castShadow = o.cast !== false; m.receiveShadow = true; if (p) m.position.set(...p); (o.to || scene).add(m); return m; };

    // ---------- التضاريس ----------
    const X0 = -14 * K, X1 = 14 * K, Z0 = -9.2 * K, Z1 = 9.2 * K, NX = Math.round((opt.lite ? 360 : 600) * Math.min(K, 1.15)), NZ = Math.round((opt.lite ? 234 : 390) * Math.min(K, 1.15));
    const tgeo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, NX, NZ); tgeo.rotateX(-Math.PI / 2); tgeo.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
    const tp = tgeo.attributes.position, cols = new Float32Array(tp.count * 3), regA = new Float32Array(tp.count);
    const cGrass = [new THREE.Color('#7db455'), new THREE.Color('#5f9e46'), new THREE.Color('#93c463')], cSand = new THREE.Color('#ead39a'), cWet = new THREE.Color('#cdb784'), cRock = new THREE.Color('#9b8f7c'), cRock2 = new THREE.Color('#7f7466'), cSnow = new THREE.Color('#f4f1ea'), cDeep = new THREE.Color('#165a6e'), cShallow = new THREE.Color('#bfe0cf'), cField = new THREE.Color('#c9c066');
    const tmp = new THREE.Color();
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i), z = tp.getZ(i), cd = coastDist(x, z), h = heightAt(x, z, cd); tp.setY(i, h);
      const id = regionAtW(x, z); regA[i] = cd > 0 ? id : -1;
      const n = fbm(x * 1.7 + 11, z * 1.7 - 4);
      if (cd < 0) tmp.copy(cShallow).lerp(cDeep, sstep(0, .9, -cd));
      else if (cd < .16) tmp.copy(cWet).lerp(cSand, sstep(0, .1, cd));
      else { tmp.copy(cGrass[0]).lerp(n > .5 ? cGrass[2] : cGrass[1], Math.abs(n - .5) * 1.6);
        if (M.regions[id] && M.regions[id].type === 'farm') tmp.lerp(cField, .22);
        tmp.lerp(cSand, 1 - sstep(.16, .3, cd));
        const rockK = sstep(.32, .55, h); if (rockK > 0) tmp.lerp(n > .5 ? cRock : cRock2, rockK);
        const snowK = sstep(.78, .9, h); if (snowK > 0) tmp.lerp(cSnow, snowK); }
      cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
    }
    // شبكة الارتفاع الدقيقة (للحركة)
    HW = NX + 1; HH = NZ + 1; HX0 = X0; HZ0 = Z0; HNX = (X1 - X0) / NX; HNZ = (Z1 - Z0) / NZ; Hgrid = new Float32Array(HW * HH); for (let i = 0; i < tp.count; i++) Hgrid[i] = tp.getY(i);
    tgeo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); tgeo.setAttribute('aRegion', new THREE.BufferAttribute(regA, 1)); tgeo.computeVertexNormals();
    const NRmax = 48, NSP = 6, teamU = { uTC: { value: Array.from({ length: NRmax }, () => new THREE.Color(0, 0, 0)) }, uTA: { value: new Float32Array(NRmax) }, uSR: { value: new Float32Array(NSP).fill(-1) }, uSFrom: { value: Array.from({ length: NSP }, () => new THREE.Color()) }, uSTo: { value: Array.from({ length: NSP }, () => new THREE.Color()) }, uSC: { value: Array.from({ length: NSP }, () => new THREE.Vector2()) }, uSRad: { value: new Float32Array(NSP) }, uSFA: { value: new Float32Array(NSP).fill(1) } };
    // سريان اللون: حتى ستة أقاليم في الوقت نفسه (للأحداث المتزامنة)
    const spreads = Array.from({ length: NSP }, (_, k) => ({ k, used: false }));
    const spreadSlot = () => { const sl = spreads.find(x => !x.used) || spreads[0]; sl.used = true; return {
      set(r, cx, cz, from, fromA, to, rad) { const k = sl.k; teamU.uSR.value[k] = rad > 0 && rad < 5 ? r : -1; teamU.uSC.value[k].set(cx, cz); teamU.uSFrom.value[k].set(from); teamU.uSFA.value[k] = fromA; teamU.uSTo.value[k].set(to); teamU.uSRad.value[k] = rad; },
      free() { teamU.uSR.value[sl.k] = -1; sl.used = false; } }; };
    const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .92, metalness: 0 });
    terrainMat.onBeforeCompile = sh => { Object.assign(sh.uniforms, teamU, U);
      sh.vertexShader = 'attribute float aRegion; flat varying float vReg; varying vec3 vWP;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vReg = aRegion; vWP = (modelMatrix*vec4(transformed,1.)).xyz;');
      sh.fragmentShader = `uniform vec3 uTC[${NRmax}]; uniform float uTA[${NRmax}]; uniform float uSR[${NSP}]; uniform vec3 uSFrom[${NSP}]; uniform vec3 uSTo[${NSP}]; uniform vec2 uSC[${NSP}]; uniform float uSRad[${NSP}]; uniform float uSFA[${NSP}]; uniform float uTime; flat varying float vReg; varying vec3 vWP;\n` +
        sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          int ri = int(vReg + .5);
          if (vReg > -.5) {
            float a = uTA[ri]; vec3 tc = uTC[ri];
            for (int q = 0; q < ${NSP}; q++) { if (abs(vReg - uSR[q]) < .5) { float dd = distance(vWP.xz, uSC[q]); float k = 1. - smoothstep(uSRad[q] - .3, uSRad[q], dd); tc = mix(uSFrom[q], uSTo[q], k); a = mix(uSFA[q], 1., k); float rim = 1. - smoothstep(0., .12, abs(dd - uSRad[q])); diffuseColor.rgb += rim * step(.01, uSRad[q]) * .25; } }
            float land = smoothstep(.015, .07, vWP.y) * (1. - .75 * smoothstep(.34, .62, vWP.y));
            float lum = dot(diffuseColor.rgb, vec3(.3,.59,.11));
            diffuseColor.rgb = mix(diffuseColor.rgb, tc * (.55 + lum * .75), a * .58 * land);
          }
          float foam = smoothstep(.035, .0, abs(vWP.y - .012 - sin(uTime*1.3 + vWP.x*2.)*.006));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.), foam * .55);`); };
    const terrain = new THREE.Mesh(tgeo, terrainMat); terrain.receiveShadow = true; terrain.castShadow = true; scene.add(terrain);
    const setTint = id => { const o = W.owner[id]; teamU.uTA.value[id] = o == null ? 0 : 1; if (o != null) teamU.uTC.value[id].set(TEAMS[o].color); };

    // ---------- البحر ----------
    const water = new THREE.Mesh(new THREE.PlaneGeometry(90, 90, 1, 1), new THREE.MeshStandardMaterial({ color: '#1a86a4', roughness: .18, metalness: .08, transparent: true, opacity: .78 }));
    water.material.onBeforeCompile = sh => { Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying vec3 vWP2;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWP2 = (modelMatrix*vec4(transformed,1.)).xyz;');
      sh.fragmentShader = 'uniform float uTime; varying vec3 vWP2;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 p = vWP2.xz; float t = uTime;
        vec2 g = vec2(cos(p.x*2.3+t*1.1)+cos((p.x+p.y)*3.7+t*1.6)*.6, sin(p.y*2.7+t*.9)+sin((p.x-p.y)*4.1+t*1.3)*.6)*.07;
        normal = normalize(normal + vec3(g.x, 0., g.y));`); };
    water.rotation.x = -Math.PI / 2; water.position.y = .012; water.receiveShadow = true; scene.add(water);

    // ---------- الحدود ----------
    const edges = []; { const seen = {}; M.regions.forEach(r => { const p = r.poly; for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1], k = [a, b].map(q => q.map(v => Math.round(v * 10)).join(':')).sort().join('|'); (seen[k] = seen[k] || { a, b, c: [] }).c.push(r.id); } });
      Object.values(seen).forEach(e => { if (e.c.length === 2 && M.regions[e.c[0]].land === M.regions[e.c[1]].land) edges.push(e); }); }
    // النقاط اليابسة من الضلع المشترك بين إقليمين (لعبور الجيوش)
    const sharedEdge = (i, j) => { const out = []; edges.forEach(e => { if (!(e.c.includes(i) && e.c.includes(j))) return; const [ax, az] = P(...e.a), [bx, bz] = P(...e.b), n = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / .04)); for (let k = 1; k < n; k++) { const x = lerp(ax, bx, k / n), z = lerp(az, bz, k / n); if (coastDist(x, z) > .18) out.push([x, z]); } }); return out; };
    const borderGrp = new THREE.Group(); scene.add(borderGrp);
    const ribMats = {};
    function ribbon(pts, w, colr, lift = .025) {
      const pos = [], idx = []; for (let i = 0; i < pts.length; i++) { const [x, z] = pts[i], [px, pz] = pts[Math.max(0, i - 1)], [nx, nz] = pts[Math.min(pts.length - 1, i + 1)]; let dx = nx - px, dz = nz - pz; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; const ox = -dz * w / 2, oz = dx * w / 2;
        pos.push(x + ox, groundY(x + ox, z + oz) + lift, z + oz, x - ox, groundY(x - ox, z - oz) + lift, z - oz); if (i) { const b = (i - 1) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, ribMats[colr] || (ribMats[colr] = new THREE.MeshStandardMaterial({ color: colr, roughness: .45, emissive: colr, emissiveIntensity: .35, side: THREE.DoubleSide }))); m.receiveShadow = true; return m;
    }
    const dotGeo = new THREE.CylinderGeometry(.011, .011, .006, 10), dotMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .6, emissive: '#ffffff', emissiveIntensity: .25, transparent: true, opacity: .7 });
    function buildBorders() {
      borderGrp.children.forEach(c => { if (c.geometry && c.geometry !== dotGeo) c.geometry.dispose(); }); borderGrp.clear(); const dots = [];
      edges.forEach(e => { const [i, j] = e.c, oi = W.owner[i], oj = W.owner[j], [ax, az] = P(...e.a), [bx, bz] = P(...e.b), L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(L / .06));
        const runs = []; let cur = []; for (let k = 0; k <= n; k++) { const x = lerp(ax, bx, k / n), z = lerp(az, bz, k / n); if (coastDist(x, z) > .12) cur.push([x, z]); else if (cur.length) { runs.push(cur); cur = []; } } if (cur.length) runs.push(cur);
        runs.filter(r => r.length > 1).forEach(run => {
          if (oi === oj) { let acc = 0; for (let q = 1; q < run.length; q++) { const [x0, z0] = run[q - 1], [x1, z1] = run[q], l = Math.hypot(x1 - x0, z1 - z0); for (let u = acc; u < l; u += .055) { const x = lerp(x0, x1, u / l), z = lerp(z0, z1, u / l); dots.push([x, groundY(x, z) + .012, z]); } acc = (acc - l) % .055; if (acc < 0) acc += .055; } return; }
          const nx = -(bz - az) / L, nz = (bx - ax) / L, [ix, iz] = at(M.regions[i]), side = Math.sign((ix - ax) * nx + (iz - az) * nz) || 1;
          for (const [o, sg] of [[oi, side], [oj, -side]]) if (o != null) borderGrp.add(ribbon(run.map(([x, z]) => [x + nx * sg * .05, z + nz * sg * .05]), .075, TEAMS[o].color, .035));
        }); });
      if (dots.length) { const im = new THREE.InstancedMesh(dotGeo, dotMat, dots.length), m4 = new THREE.Matrix4(); dots.forEach((d, i) => im.setMatrixAt(i, m4.makeTranslation(...d))); borderGrp.add(im); }
    }

    // ---------- الطرق ----------
    const ROADS = []; { const L = M.regions.filter(r => !r.land), E = []; L.forEach(r => r.nb.forEach(j => { if (j > r.id && !M.regions[j].land) { const a = at(r), b = at(M.regions[j]); E.push([Math.hypot(a[0] - b[0], a[1] - b[1]), r.id, j]); } }));
      E.sort((a, b) => a[0] - b[0]); const par = {}, f = i => par[i] == null || par[i] === i ? i : (par[i] = f(par[i])), keep = [];
      E.forEach(e => { const a = f(e[1]), b = f(e[2]); if (a !== b) { par[a] = b; keep.push(e); } });
      const endOff = r => r.type === 'capital' ? .3 * SZ.keep : r.type === 'castle' ? .56 * SZ.keep : r.type === 'village' ? .1 * K : .06;
      keep.forEach(([, i, j], k) => { const A = M.regions[i], B = M.regions[j], [ax, az] = at(A), [bx, bz] = at(B), L2 = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L2, dz = (bz - az) / L2;
        const p0 = [ax + dx * endOff(A), az + dz * endOff(A)], p2 = [bx - dx * endOff(B), bz - dz * endOff(B)], bend = (k % 2 ? 1 : -1) * L2 * .08, p1 = [(p0[0] + p2[0]) / 2 - dz * bend, (p0[1] + p2[1]) / 2 + dx * bend], pts = [];
        for (let t = 0; t <= 1.0001; t += 1 / 22) { const u = 1 - t; pts.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]); }
        if (pts.every(q => coastDist(...q) > .08)) ROADS.push(pts); }); }

    // ---------- العوائق والمواضع الخالية ----------
    const C = { roof: '#c4553a', roof2: '#a9452f', wall: '#f4ecdc', stone: '#d6cdb7', stone2: '#bdb39b', wood: '#8a6240', gold: '#f4c430' };
    const WALLS = ['#f4ecdc', '#efe2c8', '#f6efe3', '#e9dcc3'];
    const OBST = []; ROADS.forEach(L => L.forEach(q => OBST.push({ k: 'طريق', x: q[0], z: q[1], r: .035 * SZ.road, soft: true })));
    const hitObst = (x, z, rad, gap = 0, soft = false) => OBST.some(o => (soft || !o.soft) && Math.hypot(o.x - x, o.z - z) < o.r + rad + gap);
    const flatAt = (x, z, rad) => { const h0 = heightAt(x, z); if (h0 > .26) return false; for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283; if (Math.abs(heightAt(x + Math.cos(a) * rad, z + Math.sin(a) * rad) - h0) > .05) return false; } return true; };
    function spot(cx, cz, rMin, rMax, rad, rid, gap = .04, tries = 90) { for (let i = 0; i < tries; i++) { const a = rnd() * 6.283, d = lerp(rMin, rMax, rnd()) * K, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d * .82;
        if (rid != null && regionAtW(x, z) !== rid) continue; if (coastDist(x, z) < .12 + rad || !flatAt(x, z, Math.max(.05, rad))) continue;
        if (OBST.some(o => Math.hypot(o.x - x, o.z - z) < o.r + rad + gap)) continue; return [x, z]; } return null; }
    const faceTo = (x, z, cx, cz) => Math.atan2(cx - x, cz - z);

    // ---------- المباني ----------
    function well(x, z) { OBST.push({ k: 'بئر', x, z, r: .05 * SZ.house }); const g = new THREE.Group(), y = groundY(x, z); g.scale.setScalar(SZ.house);
      add(new THREE.Mesh(new THREE.CylinderGeometry(.036, .04, .04, 14), mat(C.stone, { flatShading: false })), [0, .02, 0], { to: g });
      add(new THREE.Mesh(new THREE.CylinderGeometry(.027, .027, .004, 14), mat('#2f6f86', { roughness: .2 })), [0, .039, 0], { to: g, cast: false });
      [-1, 1].forEach(k => add(new THREE.Mesh(new THREE.BoxGeometry(.007, .075, .007), mat(C.wood)), [k * .032, .072, 0], { to: g }));
      add(new THREE.Mesh(new THREE.CylinderGeometry(.004, .004, .07, 6), mat(C.wood)), [0, .1, 0], { to: g }).rotation.z = Math.PI / 2;
      [-1, 1].forEach(k => { const pl = add(new THREE.Mesh(new THREE.BoxGeometry(.09, .006, .05), mat(C.roof2)), [0, .124, k * .018], { to: g }); pl.rotation.x = k * .6; });
      add(new THREE.Mesh(new THREE.BoxGeometry(.095, .008, .008), mat('#7a3524')), [0, .137, 0], { to: g });
      g.position.set(x, y, z); scene.add(g); return g; }
    function house(x, z, s = 1, roof = C.roof, rotY = 0, to = scene) { s *= SZ.house; OBST.push({ k: 'بيت', x, z, r: .1 * s });
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
      g.position.set(x, y, z); g.rotation.y = rotY; to.add(g); return g;
    }
    function tower(x, y, z, r, h, roofCol, to = scene, reg = true) { if (reg) OBST.push({ k: 'برج', x, z, r });
      const g = new THREE.Group();
      add(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 12), mat(C.stone, { flatShading: false })), [0, h / 2, 0], { to: g });
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; add(new THREE.Mesh(new THREE.BoxGeometry(r * .34, r * .32, r * .34), mat(C.stone)), [Math.cos(a) * r * .88, h + r * .13, Math.sin(a) * r * .88], { to: g }); }
      let roof = null; if (roofCol) roof = add(new THREE.Mesh(new THREE.ConeGeometry(r * 1.18, r * 1.7, 12), mat(roofCol, { flatShading: false })), [0, h + r * 1.05, 0], { to: g });
      add(new THREE.Mesh(new THREE.BoxGeometry(r * .3, r * .5, .004), mat('#3b3226')), [0, h * .62, r * 1.01], { to: g });
      g.position.set(x, y, z); to.add(g); g.userData.roof = roof; return g;
    }
    function wallSeg(x1, z1, x2, z2, y, h, t, to = scene) {
      const len = Math.hypot(x2 - x1, z2 - z1), g = new THREE.Group(); add(new THREE.Mesh(new THREE.BoxGeometry(len, h, t), mat(C.stone2)), [0, h / 2, 0], { to: g });
      const n = Math.floor(len / .06); for (let i = 0; i < n; i += 2) add(new THREE.Mesh(new THREE.BoxGeometry(.035, .03, t * 1.08), mat(C.stone2)), [-len / 2 + .03 + i * .06, h + .015, 0], { to: g });
      g.position.set((x1 + x2) / 2, y, (z1 + z2) / 2); g.rotation.y = -Math.atan2(z2 - z1, x2 - x1); to.add(g); return g;
    }
    function ring(x, z, y, rx, rz, n, h, t, roofCol, towerR, to = scene, reg = true, gate = null) { const pts = []; if (reg) for (let i = 0; i < 48; i++) { const a = i / 48 * 6.283; OBST.push({ k: 'سور', x: x + Math.cos(a) * rx, z: z + Math.sin(a) * rz, r: t }); } for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + Math.PI / n; pts.push([x + Math.cos(a) * rx, z + Math.sin(a) * rz]); }
      const g = new THREE.Group(); to.add(g); pts.forEach((p, i) => { const q = pts[(i + 1) % n]; wallSeg(p[0], p[1], q[0], q[1], y, h, t, g); tower(p[0], y, p[1], towerR, h * 1.75, roofCol, g, false); }); return g; }
    function field(x, z, w, d, c, rot) { OBST.push({ k: 'حقل', x, z, r: Math.max(w, d) * .55 }); const g = new THREE.Group(); add(new THREE.Mesh(new THREE.BoxGeometry(w, .012, d), mat(c, { flatShading: false })), [0, .006, 0], { to: g, cast: false });
      for (let i = 1; i < 5; i++) add(new THREE.Mesh(new THREE.BoxGeometry(w * .94, .008, .006), mat(new THREE.Color(c).multiplyScalar(.82))), [0, .014, -d / 2 + i * d / 5], { to: g, cast: false });
      g.position.set(x, groundY(x, z) + .004, z); g.rotation.y = rot; scene.add(g); }
    function rock(x, z, s = 1) { s *= SZ.tree; OBST.push({ k: 'صخرة', x, z, r: .07 * s }); const m = new THREE.Mesh(new THREE.DodecahedronGeometry(.06 * s, 0), mat(rnd() > .5 ? '#a8a294' : '#c7c0ae')); m.scale.set(1.3, .75, 1.1); m.rotation.set(rnd(), rnd() * 6, rnd()); return add(m, [x, groundY(x, z) + .02 * s, z]); }
    // سفينة صغيرة متقنة: بدن مدبّب المقدمة بحافة داكنة، وصارٍ وعارضة، وشراع مربع فوق رؤوس الطاقم، وراية صغيرة في القمة
    function boat(x, z, rot) { const g = new THREE.Group(); g.scale.setScalar(SZ.ship);
      const hullG = boat.G || (boat.G = (() => { const sh = new THREE.Shape(); sh.moveTo(-.12, -.045); sh.lineTo(.07, -.045); sh.quadraticCurveTo(.13, -.03, .15, 0); sh.quadraticCurveTo(.13, .03, .07, .045); sh.lineTo(-.12, .045); sh.quadraticCurveTo(-.135, 0, -.12, -.045);
        const e = new THREE.ExtrudeGeometry(sh, { depth: .045, bevelEnabled: true, bevelThickness: .008, bevelSize: .008, bevelSegments: 2, curveSegments: 8 }); e.rotateX(-Math.PI / 2); e.translate(0, -.012, 0); return e; })());
      const hull = new THREE.Mesh(hullG, mat('#7b5236')); hull.castShadow = true; hull.receiveShadow = true; g.add(hull); // [0] البدن
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(.005, .006, .4, 6), mat('#5a4632')); mast.position.set(.01, .2, 0); mast.castShadow = true; g.add(mast); // [1] الصاري
      const sl = new THREE.Mesh(new THREE.PlaneGeometry(.15, .13, 4, 3), mat('#fbf6ea', { side: THREE.DoubleSide, flatShading: false })); { const pa = sl.geometry.attributes.position; for (let k = 0; k < pa.count; k++) { const u = pa.getX(k) / .075; pa.setZ(k, .018 * (1 - u * u)); } sl.geometry.computeVertexNormals(); }
      sl.rotation.y = Math.PI / 2; sl.position.set(.016, .3, 0); sl.castShadow = true; g.add(sl); // [2] الشراع منتفخ قليلًا
      const yard = new THREE.Mesh(new THREE.CylinderGeometry(.004, .004, .17, 5), mat('#5a4632')); yard.rotation.x = Math.PI / 2; yard.position.set(.016, .368, 0); g.add(yard);
      const rim = new THREE.Mesh(new THREE.BoxGeometry(.25, .012, .1), mat('#5b3b26')); rim.position.set(.005, .042, 0); rim.scale.set(1, 1, 1); g.add(rim);
      const pen = new THREE.Mesh(new THREE.PlaneGeometry(.05, .022), mat('#fbf6ea', { side: THREE.DoubleSide })); pen.position.set(-.014, .39, 0); g.add(pen); g.userData.pen = pen;
      g.position.set(x, .02, z); g.rotation.y = rot; scene.add(g); return g; }

    // ---------- الرايات ----------
    const flags = [], flagTexs = {};
    function flagTex(o) { const c = document.createElement('canvas'); c.width = 256; c.height = 160; const g = c.getContext('2d'); g.fillStyle = TEAMS[o].color; g.fillRect(0, 0, 256, 160);
      const gr = g.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(0,0,0,.18)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 160);
      g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(0, 126, 256, 8); g.font = '900 104px TDisplay'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.direction = 'rtl'; g.fillText(TEAMS[o].mark || TEAMS[o].name[0], 128, 70);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
    const ftex = o => flagTexs[o] || (flagTexs[o] = flagTex(o));
    function makeFlag(x, z, o, h = .5, big = 1, y0 = null) {
      const y = y0 == null ? groundY(x, z) : y0, g = new THREE.Group();
      add(new THREE.Mesh(new THREE.CylinderGeometry(.007 * big, .01 * big, h, 6), mat('#5a4632')), [0, h / 2, 0], { to: g });
      add(new THREE.Mesh(new THREE.SphereGeometry(.015 * big, 10, 8), mat(C.gold, { metalness: .65, roughness: .3, flatShading: false })), [0, h + .01, 0], { to: g });
      const Wd = .25 * big, Hh = .155 * big, geo = new THREE.PlaneGeometry(Wd, Hh, 14, 6); geo.translate(Wd / 2, 0, 0);
      const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: ftex(o), roughness: .75, side: THREE.DoubleSide })); cloth.castShadow = true; g.add(cloth);
      g.position.set(x, y, z); g.rotation.y = .35; scene.add(g);
      const f = { o, g, cloth, base: geo.attributes.position.array.slice(), h, Hh, W: Wd, ph: rnd() * 6, lift: 1, pole: 1 }; flags.push(f); return f;
    }
    function dropFlag(f) { const i = flags.indexOf(f); if (i >= 0) flags.splice(i, 1); scene.remove(f.g); f.cloth.geometry.dispose(); }
    function waveFlags(t) { flags.forEach(f => { if (!f.g.visible) return; const a = f.cloth.geometry.attributes.position; for (let i = 0; i < a.count; i++) { const x = f.base[i * 3], k = x / f.W; a.array[i * 3 + 2] = (Math.sin(x * 24 / (f.W / .25) - t * 6 + f.ph) * .02 + Math.sin(x * 9 - t * 3.1) * .01) * k * (f.W / .25); a.array[i * 3 + 1] = f.base[i * 3 + 1] - k * k * .008; } a.needsUpdate = true; f.cloth.geometry.computeVertexNormals();
      f.cloth.position.y = lerp(.02 + f.Hh / 2, f.h - f.Hh / 2 - .01, f.lift); f.cloth.visible = f.lift > .01; f.g.scale.y = Math.max(.001, f.pole); }); }

    // ---------- تخطيط الأقاليم: لكل إقليم «ساحة» للراية والسور والبرج والحامية ----------
    const R = {}; // region visual info
    M.regions.forEach(r => { const [x, z] = at(r); R[r.id] = { x, z, type: r.type, fort: null, tower: null, gar: [], flag: null }; });
    // العواصم والقلعة أولًا (مواضعها ثابتة)
    M.regions.forEach(r => { const I = R[r.id], { x, z } = I, y = groundY(x, z);
      if (r.type === 'capital') { const q = SZ.keep; I.keep = tower(x, y, z, .075 * q, .42 * q, '#8a8f99'); I.capRing = ring(x, z, y, .24 * q, .19 * q, 6, .1 * q, .035 * q, '#8a8f99', .045 * q); I.flagSpot = [x, z]; I.flagY = y + .42 * q + .08; I.flagH = .9 * SZ.flag; I.flagBig = 1.45 * SZ.flag; I.capHouses = []; I.yard = [x, z]; }
      if (r.type === 'castle') { const q = SZ.keep; ring(x, z, y, .5 * q, .4 * q, 8, .2 * q, .055 * q, '#6f7d8b', .075 * q); tower(x, y, z, .13 * q, .62 * q, '#5f6d7b'); tower(x - .17 * q, y, z + .08 * q, .07 * q, .4 * q, '#6f7d8b'); tower(x + .17 * q, y, z + .08 * q, .07 * q, .4 * q, '#6f7d8b'); I.flagSpot = [x, z]; I.flagY = y + .62 * q + .14; I.flagH = 1.25 * SZ.flag; I.flagBig = 1.45 * SZ.flag; I.yard = [x, z]; }
    });
    // ساحة كل إقليم عادي: دائرة خالية نصف قطرها .17 تحجز للسور والبرج والحامية
    M.regions.forEach(r => { const I = R[r.id]; if (I.flagSpot) return; const YR = .17 * SZ.house, q = spot(I.x, I.z, 0, .32, YR, r.id, .02, 200) || spot(I.x, I.z, .1, .75, YR * .9, r.id, .01, 300) || spot(I.x, I.z, .1, .9, YR * .72, r.id, 0, 400) || [I.x, I.z];
      I.yard = q; I.flagSpot = [q[0] - .03 * SZ.house, q[1] + .02 * SZ.house]; I.flagH = .52 * SZ.flag; I.flagBig = SZ.flag; OBST.push({ k: 'ساحة', x: q[0], z: q[1], r: YR, soft: true }); });
    M.regions.forEach(r => {
      const I = R[r.id], { x, z } = I;
      switch (r.type) {
        case 'farm': { const rot = rnd() * .3 - .15; const fc = ['#e3c45c', '#bcd36c', '#d9b04c', '#a9cc63']; let nf = 0; const NF = Math.round(6 * K * K); for (let i = 0; i < NF * 2.4 && nf < NF; i++) { const q = spot(x, z, .05, .7, .1 * K, r.id, .015); if (q) { field(q[0], q[1], .16 * K, .13 * K, fc[(nf + Math.floor(rnd() * 2)) % 4], rot); nf++; } } const q = spot(x, z, .2, .5, .1, r.id); if (q) house(q[0], q[1], .95, C.roof2, faceTo(q[0], q[1], x, z)); break; }
        case 'village': { const w = spot(x, z, 0, .12, .05, r.id, .03); const cx = w ? w[0] : x, cz = w ? w[1] : z; if (w) well(cx, cz); for (let i = 0; i < 6; i++) { const sc = .95 + rnd() * .15, q = spot(cx, cz, .17, .4, .1 * sc, r.id); if (q) house(q[0], q[1], sc, rnd() > .5 ? C.roof : C.roof2, faceTo(q[0], q[1], cx, cz) + (rnd() - .5) * .4); } break; }
        case 'quarry': for (let i = 0; i < Math.round(8 * K * K); i++) { const q = spot(x, z, 0, .32, .07, r.id, .0); if (q) rock(q[0], q[1], .8 + rnd() * 1.1); } break;
        case 'mine': { const q = spot(x + .1 * K, z + .2 * K, 0, .2, .06, r.id); if (q) { const [gx, gz] = q, gy = groundY(gx, gz); OBST.push({ k: 'منجم', x: gx, z: gz, r: .06 }); add(new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .02, 12, 1, false, 0, Math.PI), mat('#2a1d12')), [gx, gy + .03, gz]).rotation.x = Math.PI / 2;
            for (let i = 0; i < 4; i++) add(new THREE.Mesh(new THREE.OctahedronGeometry(.016 + rnd() * .01, 0), mat(C.gold, { metalness: .75, roughness: .25, emissive: '#7a5a00', emissiveIntensity: .3 })), [gx + .05 + rnd() * .03, gy + .015, gz + .02 + rnd() * .03]); } break; }
        case 'rich': { const q = spot(x, z, 0, .25, .05, r.id); if (q) { OBST.push({ k: 'جوهر', x: q[0], z: q[1], r: .05 }); add(new THREE.Mesh(new THREE.OctahedronGeometry(.04, 0), mat('#5ec8e8', { metalness: .3, roughness: .15, emissive: '#1f6f8a', emissiveIntensity: .5 })), [q[0], groundY(q[0], q[1]) + .05, q[1]]); } break; }
        case 'port': { // الرصيف يتجه نحو الجزيرة التي يخدمها، ويبدأ من الشاطئ نفسه فيمتد في الماء
          const rt = (M.routes || []).find(o => o.from === r.id), tg = rt ? at(M.regions[rt.to]) : [x * 2, z * 2], dir = Math.atan2(tg[1] - z, tg[0] - x), dx = Math.cos(dir), dz = Math.sin(dir);
          let ts = 0; while (ts < 3 * K && coastDist(x + dx * ts, z + dz * ts) > 0) ts += .01; const sx = x + dx * ts, sz = z + dz * ts;
          const q = spot(x, z, 0, .25, .1, r.id); if (q) house(q[0], q[1], .95, C.roof2, dir);
          const DL = .5 * SZ.house, dock = add(new THREE.Mesh(new THREE.BoxGeometry(DL, .025, .08 * SZ.house), mat(C.wood)), [sx + dx * (DL / 2 - .08), .05, sz + dz * (DL / 2 - .08)]); dock.rotation.y = -dir;
          const px = sx + dx * (DL + .05), pz = sz + dz * (DL + .05); I.port = { x: px, z: pz, dir }; OBST.push({ k: 'رصيف', x: sx, z: sz, r: .1 });
          boat(px - dx * .12 + dz * .14, pz - dz * .12 - dx * .14, -dir + .3); boat(px + dx * .1 - dz * .13, pz + dz * .1 + dx * .13, -dir - .4); break; }
        case 'capital': for (let i = 0; i < 5; i++) { const q = spot(x, z, .36, .58, .085, r.id); if (q) house(q[0], q[1], .82, i % 2 ? C.roof : C.roof2, faceTo(q[0], q[1], x, z)); } break;
      }
    });
    // ---------- المعالم الأربعة بمجسّمات مميزة (أكبر بـ15٪): منجم الذهب، المحجر الكبير، المرصد، والميناء (رصيفه وسفنه أعلاه) ----------
    const LMK = (() => { try { return G.RayatRules.setup(M, TEAMS.map(t => ({ name: t.name, color: t.color }))).regions.map(x => x.landmark); } catch (e) { return []; } })();
    M.regions.forEach(r => { r.lm = LMK[r.id] || null; });
    M.regions.forEach(r => { const lm = r.lm; if (!lm || lm === 'port') return; const I = R[r.id], q0 = SZ.keep;
      if (lm === 'goldmine') { const q = spot(I.x, I.z, .1, .45, .11 * q0, r.id) || spot(I.x, I.z, 0, .7, .09 * q0, r.id); if (!q) return; const [x, z] = q, y = groundY(x, z), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = faceTo(x, z, I.x, I.z); g.scale.setScalar(q0); scene.add(g); OBST.push({ k: 'منجم الذهب', x, z, r: .11 * q0 });
        add(new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .03, 16, 1, false, 0, Math.PI), mat('#22170e')), [0, .045, -.02], { to: g }).rotation.x = Math.PI / 2;
        [-1, 1].forEach(k => add(new THREE.Mesh(new THREE.BoxGeometry(.012, .1, .012), mat(C.wood)), [k * .058, .05, .0], { to: g })); add(new THREE.Mesh(new THREE.BoxGeometry(.14, .014, .016), mat(C.wood)), [0, .104, 0], { to: g });
        [-1, 1].forEach(k => add(new THREE.Mesh(new THREE.BoxGeometry(.004, .004, .16), mat('#6b6b6b', { metalness: .6 })), [k * .02, .004, .08], { to: g, cast: false }));
        const cart = new THREE.Group(); cart.position.set(0, .018, .09); g.add(cart); add(new THREE.Mesh(new THREE.BoxGeometry(.05, .026, .04), mat('#5b4330')), [0, .012, 0], { to: cart });
        for (let i = 0; i < 6; i++) add(new THREE.Mesh(new THREE.OctahedronGeometry(.012 + rnd() * .006, 0), mat(C.gold, { metalness: .8, roughness: .2, emissive: '#8a6200', emissiveIntensity: .45 })), [(rnd() - .5) * .035, .03, (rnd() - .5) * .025], { to: cart });
        for (let i = 0; i < 5; i++) add(new THREE.Mesh(new THREE.OctahedronGeometry(.014 + rnd() * .008, 0), mat(C.gold, { metalness: .8, roughness: .2, emissive: '#8a6200', emissiveIntensity: .4 })), [.06 + rnd() * .03, .01, .05 + rnd() * .04], { to: g }); }
      if (lm === 'bigquarry') { const q = spot(I.x, I.z, .1, .45, .13 * q0, r.id) || spot(I.x, I.z, 0, .7, .1 * q0, r.id); if (!q) return; const [x, z] = q, y = groundY(x, z), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rnd() * 6.28; g.scale.setScalar(q0); scene.add(g); OBST.push({ k: 'المحجر الكبير', x, z, r: .13 * q0 });
        [[.16, .05, .12], [.11, .1, .08], [.06, .15, .05]].forEach(([w, h, d], i) => add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(i % 2 ? '#c9c0ac' : '#b8ae98')), [-.02 + i * .015, h / 2, -.02], { to: g }));
        for (let i = 0; i < 4; i++) add(new THREE.Mesh(new THREE.BoxGeometry(.035, .022, .025), mat('#d8cfba')), [.08 + (i % 2) * .04, .011 + Math.floor(i / 2) * .022, .07], { to: g });
        const cr = new THREE.Group(); cr.position.set(-.08, 0, .07); g.add(cr); [-1, 1].forEach(k => { const leg = add(new THREE.Mesh(new THREE.BoxGeometry(.008, .19, .008), mat(C.wood)), [k * .03, .09, 0], { to: cr }); leg.rotation.z = -k * .16; });
        const boom = add(new THREE.Mesh(new THREE.BoxGeometry(.16, .008, .008), mat(C.wood)), [.05, .18, 0], { to: cr }); boom.rotation.z = -.25; add(new THREE.Mesh(new THREE.CylinderGeometry(.0015, .0015, .09, 4), mat('#3b2f25')), [.12, .125, 0], { to: cr, cast: false }); add(new THREE.Mesh(new THREE.BoxGeometry(.03, .02, .02), mat('#d8cfba')), [.12, .07, 0], { to: cr }); }
      if (lm === 'observatory') { let best = null, bh = -1; for (let k = 0; k < 60; k++) { const a = rnd() * 6.28, d = rnd() * .6 * K, x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d * .8; if (regionAtW(x, z) !== r.id || coastDist(x, z) < .25 || hitObst(x, z, .08)) continue; const h = heightAt(x, z); if (h > bh) { bh = h; best = [x, z]; } } if (!best) return;
        const [x, z] = best, y = groundY(x, z), g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(q0); scene.add(g); OBST.push({ k: 'المرصد', x, z, r: .07 * q0 });
        add(new THREE.Mesh(new THREE.CylinderGeometry(.034, .042, .2, 14), mat(C.stone, { flatShading: false })), [0, .1, 0], { to: g }); add(new THREE.Mesh(new THREE.CylinderGeometry(.046, .046, .018, 14), mat(C.stone2)), [0, .205, 0], { to: g });
        add(new THREE.Mesh(new THREE.SphereGeometry(.038, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#e9e4d6', { flatShading: false, metalness: .2 })), [0, .214, 0], { to: g });
        const tel = add(new THREE.Mesh(new THREE.CylinderGeometry(.006, .009, .06, 8), mat('#6d5434', { metalness: .4 })), [.014, .245, .01], { to: g }); tel.rotation.z = -.9; add(new THREE.Mesh(new THREE.BoxGeometry(.014, .03, .004), mat('#3a2c1d')), [0, .09, .041], { to: g, cast: false }); }
    });

    // مواضع محجوزة لتطوير العاصمة (تظهر البيوت مع كل درجة)
    M.regions.filter(r => r.type === 'capital').forEach(r => { const I = R[r.id]; I.capSpots = []; for (let i = 0; i < 6; i++) { const q = spot(I.x, I.z, .34, .62, .085, r.id, .03); if (q) { I.capSpots.push(q); OBST.push({ k: 'بيت', x: q[0], z: q[1], r: .085 }); } } });

    // ---------- النباتات ----------
    const treeSpots = { pine: [], round: [] };
    M.regions.forEach(r => { const [cx, cz] = at(r), n = Math.round(({ farm: 7, village: 9, port: 5, quarry: 8, mine: 10, rich: 4, capital: 6, castle: 4 }[r.type] || 6) * K * K);
      for (let tries = 0, k = 0; tries < n * 30 && k < n; tries++) { const a = rnd() * 6.283, d = (.32 + rnd() * .75) * K, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d * .8;
        if (regionAtW(x, z) !== r.id) continue; const cd = coastDist(x, z); if (cd < .25) continue; const h = heightAt(x, z, cd); if (h > .6) continue;
        const kind = h > .3 || r.type === 'mine' || r.type === 'quarry' ? 'pine' : (rnd() > .35 ? 'round' : 'pine'), cl = 1 + Math.floor(rnd() * 3);
        for (let c = 0; c < cl; c++) { const xx = x + (rnd() - .5) * .14, zz = z + (rnd() - .5) * .14; if (regionAtW(xx, zz) === r.id && coastDist(xx, zz) > .2 && !OBST.some(o => Math.hypot(o.x - xx, o.z - zz) < o.r + .06)) treeSpots[kind].push([xx, heightAt(xx, zz), zz, (.58 + rnd() * .36) * SZ.tree, rnd() * 6]); }
        k++; } });
    const TREES = [...treeSpots.pine.map(t => ({ t, k: 'pine' })), ...treeSpots.round.map(t => ({ t, k: 'round' }))];
    TREES.forEach(o => { o.x = o.t[0]; o.z = o.t[2]; o.r = .075 * o.t[3]; o.s = 1; });
    const treeMeshes = [];
    function instanced(geo, material, list, place) { const im = new THREE.InstancedMesh(geo, material, list.length); im.castShadow = true; im.receiveShadow = true; im.userData = { list, place }; scene.add(im); treeMeshes.push(im); return im; }
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), ee = new THREE.Euler();
    function updateTrees() { treeMeshes.forEach(im => { const { list, place } = im.userData; list.forEach((o, i) => { const [p, s] = place(o.t); s.multiplyScalar(Math.max(.0001, o.s)); qq.setFromEuler(ee.set(0, o.t[4], 0)); m4.compose(p, qq, s); im.setMatrixAt(i, m4); }); im.instanceMatrix.needsUpdate = true; }); }
    const PINE = TREES.filter(o => o.k === 'pine'), ROUND = TREES.filter(o => o.k === 'round');
    instanced(new THREE.CylinderGeometry(.016, .024, .1, 6), mat('#7a5236'), TREES, t => [V(t[0], t[1] + .05 * t[3], t[2]), V(t[3], t[3], t[3])]);
    instanced(new THREE.ConeGeometry(.1, .2, 7), mat('#2f7a3e'), PINE, t => [V(t[0], t[1] + .17 * t[3], t[2]), V(t[3], t[3], t[3])]);
    instanced(new THREE.ConeGeometry(.075, .16, 7), mat('#3f9248'), PINE, t => [V(t[0], t[1] + .27 * t[3], t[2]), V(t[3], t[3], t[3])]);
    instanced(new THREE.IcosahedronGeometry(.095, 0), mat('#5aa64a'), ROUND.filter((_, i) => i % 2), t => [V(t[0], t[1] + .17 * t[3], t[2]), V(t[3], t[3] * .95, t[3])]);
    instanced(new THREE.IcosahedronGeometry(.095, 0), mat('#6db552'), ROUND.filter((_, i) => !(i % 2)), t => [V(t[0], t[1] + .17 * t[3], t[2]), V(t[3], t[3] * .95, t[3])]);
    updateTrees();
    { const bush = [], flower = []; const BB = lands.flat().reduce((b, [x, z]) => [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], z), Math.max(b[3], z)], [1e9, -1e9, 1e9, -1e9]), bArea = (BB[1] - BB[0]) * (BB[3] - BB[2]) / (18.5 * 9.2);
      for (let i = 0; i < Math.round((opt.lite ? 900 : 2600) * bArea); i++) { const x = lerp(BB[0], BB[1], rnd()), z = lerp(BB[2], BB[3], rnd()), cd = coastDist(x, z); if (cd < .3) continue; const h = heightAt(x, z, cd); if (h > .42) continue; const b = rnd() > .3, it = [x, h, z, .6 + rnd() * .7, rnd() * 6]; if (!OBST.some(o => !o.soft && Math.hypot(o.x - x, o.z - z) < o.r + .03)) (b ? bush : flower).push(it); }
      const ib = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.03, 0), mat('#4f9a3f'), bush.length); bush.forEach((t, i) => { ib.setMatrixAt(i, m4.compose(V(t[0], t[1] + .012, t[2]), qq.setFromEuler(ee.set(0, t[4], 0)), V(t[3], t[3] * .7, t[3]))); }); ib.receiveShadow = true; scene.add(ib);
      const fl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.012, 0), mat('#ffffff'), flower.length), FC = ['#f6e27a', '#f4f1ea', '#e98aa0', '#c9a4ec'].map(c => new THREE.Color(c)); flower.forEach((t, i) => { fl.setMatrixAt(i, m4.makeTranslation(t[0], t[1] + .01, t[2])); fl.setColorAt(i, FC[i % 4]); }); scene.add(fl); }
    // الطرق
    { const pos = [], col = [], idx = [], c = new THREE.Color('#cfae7a'), Wd = .033 * SZ.road; let base = 0;
      ROADS.forEach(L => { L.forEach((q, i) => { const a = L[Math.max(0, i - 1)], b = L[Math.min(L.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz), nx = -dz / l, nz = dx / l, end = Math.min(i, L.length - 1 - i) / 2;
          [-1.9, -1, 0, 1, 1.9].forEach((k, j) => { const x = q[0] + nx * Wd * k, z = q[1] + nz * Wd * k; pos.push(x, heightAt(x, z) + .006, z); col.push(c.r, c.g, c.b, (j === 0 || j === 4 ? 0 : .95) * Math.min(1, end)); }); });
        for (let i = 0; i < L.length - 1; i++) for (let j = 0; j < 4; j++) { const a = base + i * 5 + j, b = a + 5; idx.push(a, b, a + 1, a + 1, b, b + 1); } base += L.length * 5; });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 1, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); m.receiveShadow = true; scene.add(m); }

    // ---------- الأسماء ----------
    function label(text, x, y, z, { size = 30, font = 'TSans', weight = 700, h = .03, sub, color = '#fff' } = {}) {
      const dpr = 3, Hd = sub ? 92 : 64; const meas = document.createElement('canvas').getContext('2d'); meas.font = `${weight} ${size}px ${font}`; const Wd = Math.ceil(Math.max(meas.measureText(text).width, sub ? 120 : 0) + 40);
      const cv = document.createElement('canvas'); cv.width = Wd * dpr; cv.height = Hd * dpr; const g = cv.getContext('2d'); g.scale(dpr, dpr);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
      const draw = (t, yy, f) => { g.font = f; g.lineJoin = 'round'; g.strokeStyle = 'rgba(12,28,24,.55)'; g.lineWidth = 6; g.strokeText(t, Wd / 2, yy); g.fillStyle = color; g.fillText(t, Wd / 2, yy); };
      draw(text, sub ? 34 : Hd / 2, `${weight} ${size}px ${font}`); if (sub) draw(sub, 70, `500 ${size * .55}px TSans`);
      const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8; tx.minFilter = THREE.LinearMipmapLinearFilter;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, depthTest: false, transparent: true, sizeAttenuation: false })); sp.center.set(.5, 1); sp.scale.set(h * Wd / Hd, h, 1); sp.position.set(x, y, z); sp.renderOrder = 10; sp.userData.tw = (Wd - 34) / Wd; scene.add(sp); return sp;
    }
    const labels = {};
    function makeLabel(r) { const I = R[r.id]; if (labels[r.id]) { scene.remove(labels[r.id]); labels[r.id].material.map.dispose(); }
      const o = W.owner[r.id], [x, z] = at(r);
      const LMI = { goldmine: '⛏️ ', bigquarry: '🪨 ', observatory: '🔭 ', port: '⚓ ' }, cnm = r.name.replace(/^قلعة /, 'قلعـة '), CI = W.castleInfo || {};
      let L; if (r.type === 'castle') L = label(cnm + (CI.owner != null && TEAMS[CI.owner] ? ' · ' + TEAMS[CI.owner].name : '') + (CI.safe > 0 ? ' · 🛡' + CI.safe : ''), x, groundY(x, z) + .05, z + .55 * SZ.keep, { size: 34, font: 'TDisplay', weight: 900, h: .034 });
      else if (r.type === 'capital') L = label('عاصمة ' + (o != null ? TEAMS[o].name : ''), x, groundY(x, z) + .05, z + .36 * SZ.keep, { size: 30, font: 'TDisplay', weight: 700, h: .026 });
      else L = label((LMI[r.lm] || '') + r.name, x, groundY(x, z + .3 * K) + .04, z + .3 * K, { size: 26, weight: 500, h: .022 });
      L.userData.reg = r.id; L.userData.pri = r.type === 'castle' ? 4 : r.type === 'capital' ? 3 : r.lm || r.landmark ? 2 : 1; L.material.opacity = 0; labels[r.id] = L; }
    W.labelsOn = true;
    // الأسماء لا تتراكب: كل إطار تُسقط على الشاشة، ويُقبل الأهم أولًا، ويُخفى ما يتداخل مع غيره أو مع البطاقات (بتلاشٍ ناعم)
    let lblMaster = 1, lblExcept = null, lblShown = []; W.reserved = [];
    function labelsOpacity(v, except) { lblMaster = v; lblExcept = except; }
    const _lp = new THREE.Vector3();
    function declutter(dt) { const el = renderer.domElement, Wp = el.clientWidth || W.vw || 1280, Hp = el.clientHeight || W.vh || 720, P5 = camera.projectionMatrix.elements[5], pad = 5;
      const acc = W.reserved.map(r => ({ x0: r.x0 - pad, y0: r.y0 - pad, x1: r.x1 + pad, y1: r.y1 + pad }));
      const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
      const L = Object.values(labels).map(l => { _lp.copy(l.position).project(camera); const x = (_lp.x * .5 + .5) * Wp, y = (-_lp.y * .5 + .5) * Hp, h = l.scale.y * P5 * .5 * Hp, w = l.scale.x * P5 * .5 * Hp * (l.userData.tw || .8);
        return { l, ok: _lp.z > -1 && _lp.z < 1, r: { x0: x - w / 2, x1: x + w / 2, y0: y + h * .12, y1: y + h * .88 }, p: l.userData.pri || 1, y }; });
      L.sort((a, b) => b.p - a.p || b.y - a.y); lblShown = [];
      L.forEach(it => { const r = it.r; let vis = it.ok && lblMaster > 0 && it.l.userData.reg !== lblExcept && r.x0 > 4 && r.x1 < Wp - 4 && r.y0 > 4 && r.y1 < Hp - 4 && !acc.some(a => hit(a, r));
        if (vis) { acc.push(r); lblShown.push({ id: it.l.userData.reg, ...r }); } const t = vis ? lblMaster : 0, m = it.l.material; m.opacity += (t - m.opacity) * Math.min(1, dt * 7); if (Math.abs(m.opacity - t) < .01) m.opacity = t; it.l.visible = m.opacity > .01; }); }
    W.labelRects = () => lblShown.slice();

    // ---------- الجنود والفرسان والمنجنيق ----------
    const teamMats = {}; const tm = (o, k) => { const key = o + k; if (teamMats[key]) return teamMats[key]; const c = new THREE.Color(TEAMS[o].color);
      const M2 = { cloth: mat(c, { flatShading: false, roughness: .7 }), dark: mat(c.clone().multiplyScalar(.62), { flatShading: false, roughness: .75, side: THREE.DoubleSide }), trim: mat('#f1e3b5', { flatShading: false, roughness: .6 }) }; return (teamMats[key] = M2[k]); };
    const SMT = { metal: new THREE.MeshStandardMaterial({ color: '#d4d8dd', metalness: .85, roughness: .28 }), gold: new THREE.MeshStandardMaterial({ color: '#e9b949', metalness: .9, roughness: .25 }), leather: mat('#5b3f2a', { flatShading: false }), skin: mat('#d9b48f', { flatShading: false }), wood: mat('#6b4f35', { flatShading: false }), horse: [mat('#7a4e2d', { flatShading: false, roughness: .6 }), mat('#3d2a1d', { flatShading: false, roughness: .6 }), mat('#d8cfc2', { flatShading: false, roughness: .6 })], hair: mat('#1f1610', { flatShading: false }) };
    const GEO = {}; const geo = (k, f) => GEO[k] || (GEO[k] = f());
    const cyl = (rt, rb, h, sg = 12) => geo('c' + [rt, rb, h, sg], () => new THREE.CylinderGeometry(rt, rb, h, sg)), sph = (r, a = 16, b = 12) => geo('s' + [r, a, b], () => new THREE.SphereGeometry(r, a, b));
    const box = (a, b, c) => geo('b' + [a, b, c], () => new THREE.BoxGeometry(a, b, c));
    function mesh(g, m, p, rot, to) { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; if (p) o.position.set(...p); if (rot) o.rotation.set(...rot); to.add(o); return o; }
    function torso(o, to) {
      const g = new THREE.Group(); to.add(g);
      mesh(cyl(.016, .025, .05, 14), tm(o, 'cloth'), [0, .055, 0], null, g);
      mesh(geo('belt', () => new THREE.TorusGeometry(.0185, .0035, 6, 16)), SMT.leather, [0, .043, 0], [Math.PI / 2, 0, 0], g);
      mesh(box(.006, .045, .004), tm(o, 'trim'), [0, .058, .019], null, g);
      mesh(sph(.012), SMT.metal, [-.019, .077, 0], null, g).scale.set(1, .7, 1); mesh(sph(.012), SMT.metal, [.019, .077, 0], null, g).scale.set(1, .7, 1);
      mesh(sph(.0125), SMT.skin, [0, .094, 0], null, g);
      mesh(geo('helm', () => new THREE.SphereGeometry(.0145, 16, 8, 0, Math.PI * 2, 0, Math.PI * .55)), SMT.metal, [0, .096, 0], null, g);
      mesh(geo('helmr', () => new THREE.TorusGeometry(.0138, .0018, 6, 18)), SMT.metal, [0, .093, 0], [Math.PI / 2, 0, 0], g);
      mesh(box(.004, .016, .02), tm(o, 'cloth'), [0, .112, -.002], null, g);
      const cape = mesh(geo('cape', () => new THREE.PlaneGeometry(.034, .05, 1, 3)), tm(o, 'dark'), [0, .06, -.02], [.18, 0, 0], g);
      const armR = new THREE.Group(); armR.position.set(.021, .072, 0); g.add(armR); mesh(cyl(.0055, .005, .036, 8), tm(o, 'cloth'), [0, -.016, .004], [.4, 0, 0], armR);
      const armL = new THREE.Group(); armL.position.set(-.021, .072, 0); g.add(armL); mesh(cyl(.0055, .005, .034, 8), tm(o, 'cloth'), [0, -.015, .006], [.6, 0, 0], armL);
      const shield = new THREE.Group(); shield.position.set(-.026, .055, .016); shield.rotation.y = -.5; g.add(shield);
      mesh(cyl(.019, .019, .004, 20), tm(o, 'cloth'), null, [Math.PI / 2, 0, 0], shield); mesh(geo('shr', () => new THREE.TorusGeometry(.019, .0022, 6, 22)), SMT.gold, null, null, shield); mesh(sph(.005, 10, 8), SMT.gold, [0, 0, .003], null, shield);
      const spear = new THREE.Group(); spear.position.set(.024, .06, .008); g.add(spear); mesh(cyl(.0022, .0022, .2, 6), SMT.wood, [0, .045, 0], null, spear); mesh(geo('spt', () => new THREE.ConeGeometry(.0055, .022, 8)), SMT.metal, [0, .156, 0], null, spear);
      return { g, armR, armL, spear, cape };
    }
    const UNIT_S = 1.4 * SZ.unit;
    function soldier(o) {
      const g = new THREE.Group(); scene.add(g);
      const legL = new THREE.Group(), legR = new THREE.Group(); legL.position.set(-.008, .032, 0); legR.position.set(.008, .032, 0); g.add(legL, legR);
      for (const L of [legL, legR]) { mesh(cyl(.0055, .005, .028, 8), SMT.leather, [0, -.014, 0], null, L); mesh(box(.011, .007, .016), SMT.leather, [0, -.029, .003], null, L); }
      const t = torso(o, g); g.userData = { legL, legR, ...t, kind: 'foot', o }; g.scale.setScalar(UNIT_S); return g;
    }
    function rider(o, coat = 0, banner = false) {
      const g = new THREE.Group(); scene.add(g); const H = SMT.horse[coat % 3];
      const horse = new THREE.Group(); g.add(horse);
      mesh(geo('hb', () => new THREE.CapsuleGeometry(.03, .06, 8, 16)), H, [0, .092, -.004], [Math.PI / 2, 0, 0], horse);
      mesh(sph(.031, 16, 12), H, [0, .097, .036], null, horse).scale.set(1, 1.05, .9);
      const neck = new THREE.Group(); neck.position.set(0, .108, .05); horse.add(neck); mesh(cyl(.014, .021, .06, 12), H, [0, .026, .012], [.5, 0, 0], neck);
      const head = new THREE.Group(); head.position.set(0, .056, .032); neck.add(head); mesh(geo('hh', () => new THREE.CapsuleGeometry(.0115, .026, 4, 12)), H, [0, -.006, .014], [2.0, 0, 0], head);
      mesh(geo('ear', () => new THREE.ConeGeometry(.004, .012, 6)), H, [-.006, .014, -.002], null, head); mesh(geo('ear', () => new THREE.ConeGeometry(.004, .012, 6)), H, [.006, .014, -.002], null, head);
      mesh(box(.006, .055, .014), SMT.hair, [0, .03, .002], [.5, 0, 0], neck);
      const tail = mesh(geo('tail', () => new THREE.ConeGeometry(.009, .06, 8)), SMT.hair, [0, .095, -.064], [-2.4, 0, 0], horse);
      mesh(box(.05, .012, .05), tm(o, 'cloth'), [0, .124, -.004], null, horse);
      mesh(box(.064, .03, .006), tm(o, 'cloth'), [0, .105, -.03], null, horse); mesh(box(.065, .004, .007), tm(o, 'trim'), [0, .089, -.03], null, horse);
      const legs = []; for (const [x, z] of [[-.015, .036], [.015, .036], [-.015, -.03], [.015, -.03]]) { const L = new THREE.Group(); L.position.set(x, .08, z); horse.add(L); mesh(cyl(.0085, .006, .066, 8), H, [0, -.033, 0], null, L); mesh(cyl(.0065, .0072, .008, 8), SMT.hair, [0, -.07, 0], null, L); legs.push(L); }
      const man = new THREE.Group(); man.position.set(0, .088, -.004); horse.add(man); const t = torso(o, man);
      mesh(cyl(.006, .005, .03, 8), SMT.leather, [-.02, .035, .005], [0, 0, .9], man); mesh(cyl(.006, .005, .03, 8), SMT.leather, [.02, .035, .005], [0, 0, -.9], man);
      t.spear.rotation.x = .9; t.spear.scale.set(1, 1.25, 1);
      let flag = null; if (banner) { const pole = new THREE.Group(); pole.position.set(.024, .06, -.01); man.add(pole); mesh(cyl(.002, .002, .28, 6), SMT.wood, [0, .1, 0], null, pole);
        const Wd = .07, Hh = .045, gg = new THREE.PlaneGeometry(Wd, Hh, 8, 4); gg.translate(-Wd / 2, 0, 0); const cl = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ map: ftex(o), side: THREE.DoubleSide, roughness: .75 })); cl.position.set(0, .215, 0); cl.rotation.y = Math.PI / 2; cl.castShadow = true; pole.add(cl); flag = { cl, base: gg.attributes.position.array.slice(), W: Wd, o }; t.spear.visible = false; }
      g.userData = { horse, neck, head, tail, legs, ...t, flag, kind: 'horse', o }; g.scale.setScalar(UNIT_S); return g;
    }
    function catapult(o) {
      const g = new THREE.Group(); scene.add(g); const wood = SMT.wood;
      mesh(box(.07, .012, .11), wood, [0, .022, 0], null, g);
      for (const [x, z] of [[-.04, .035], [.04, .035], [-.04, -.035], [.04, -.035]]) mesh(geo('wheel', () => new THREE.CylinderGeometry(.018, .018, .008, 12)), SMT.leather, [x, .018, z], [0, 0, Math.PI / 2], g);
      mesh(box(.008, .06, .008), wood, [-.025, .055, -.01], null, g); mesh(box(.008, .06, .008), wood, [.025, .055, -.01], null, g); mesh(box(.06, .008, .008), wood, [0, .085, -.01], null, g);
      const arm = new THREE.Group(); arm.position.set(0, .04, -.01); g.add(arm); mesh(box(.007, .007, .11), wood, [0, 0, .045], null, arm); const cup = mesh(sph(.012, 10, 8), SMT.leather, [0, .006, .1], null, arm);
      mesh(box(.074, .02, .006), tm(o, 'cloth'), [0, .03, .056], null, g);
      // جنديان يجرّانه بحبلين (اعتمده المستخدم): أمام المنجنيق، يمشيان معه ويقفان حين يقف
      const haul = [-1, 1].map(k => { const m = soldier(o); scene.remove(m); m.scale.setScalar(1); m.position.set(k * .032, 0, .13); g.add(m); return m; });
      [-1, 1].forEach(k => { const a = V(k * .03, .026, .058), b2 = V(k * .032, .034, .12), r = mesh(geo('rope', () => new THREE.CylinderGeometry(.0013, .0013, 1, 4)), mat('#8a6a42'), [(a.x + b2.x) / 2, (a.y + b2.y) / 2, (a.z + b2.z) / 2], null, g); r.scale.y = a.distanceTo(b2); r.quaternion.setFromUnitVectors(V(0, 1, 0), b2.clone().sub(a).normalize()); });
      g.userData = { arm, cup, haul, kind: 'cat', o }; g.scale.setScalar(UNIT_S); return g;
    }
    function cart(o) { const g = new THREE.Group(); scene.add(g); mesh(box(.05, .022, .07), SMT.wood, [0, .03, 0], null, g); for (const z of [-.022, .022]) for (const x of [-.03, .03]) mesh(geo('wheel', () => new THREE.CylinderGeometry(.018, .018, .008, 12)), SMT.leather, [x, .018, z], [0, 0, Math.PI / 2], g);
      mesh(box(.046, .02, .05), mat('#d9c08f'), [0, .05, 0], null, g); mesh(box(.004, .004, .06), SMT.wood, [0, .03, .06], null, g); g.userData = { kind: 'cart', o }; g.scale.setScalar(UNIT_S); return g; }
    function animUnit(s, t, walking, i, fighting) {
      const u = s.userData, ph = t * (u.kind === 'horse' ? 13 : 10) + i * 1.7;
      if (u.kind === 'foot') { u.legL.rotation.x = walking ? Math.sin(ph) * .65 : 0; u.legR.rotation.x = walking ? -Math.sin(ph) * .65 : 0; u.armL.rotation.x = walking ? -Math.sin(ph) * .25 : 0; s.position.y += walking ? Math.abs(Math.sin(ph)) * .007 : 0; }
      else if (u.kind === 'horse') { const gg = walking ? 1 : 0; u.legs[0].rotation.x = Math.sin(ph) * .55 * gg; u.legs[1].rotation.x = Math.sin(ph + .5) * .55 * gg; u.legs[2].rotation.x = -Math.sin(ph + .3) * .5 * gg; u.legs[3].rotation.x = -Math.sin(ph + .8) * .5 * gg;
        u.horse.position.y = walking ? Math.abs(Math.sin(ph)) * .012 : 0; u.horse.rotation.x = walking ? Math.sin(ph) * .06 : 0; u.neck.rotation.x = walking ? Math.sin(ph + 1) * .12 : Math.sin(t * 2 + i) * .04; u.tail.rotation.x = -2.4 + Math.sin(t * 6 + i) * .15;
        if (u.flag) { const a = u.flag.cl.geometry.attributes.position; for (let k = 0; k < a.count; k++) { const x = u.flag.base[k * 3], q = -x / u.flag.W; a.array[k * 3 + 2] = Math.sin(-x * 70 - t * 9 + i) * .006 * q; } a.needsUpdate = true; } }
      else if (u.kind === 'cat' || u.kind === 'cart') { s.position.y += walking ? Math.abs(Math.sin(ph * .7)) * .003 : 0; if (u.haul) u.haul.forEach((m, k) => { const y0 = s.position.y; animUnit(m, t, walking, i + k + 7, false); m.position.y = 0; }); return; }
      if (u.spear) u.spear.rotation.x = fighting ? -.6 + Math.sin(t * 16 + i * 2) * .7 : (u.kind === 'horse' ? .9 : 0);
      if (u.cape) u.cape.rotation.x = .18 + (walking ? Math.sin(ph * .5) * .12 + .15 : 0);
    }
    function disposeUnit(s) { scene.remove(s); }

    // ---------- الغبار والشرر ----------
    const dustTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.5, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    let puffs = [];
    function puff(x, y, z, t0, { col = '#d9c49a', size = .25, life = 1.4, vy = .12, spread = .15, additive = false, op = .65 } = {}) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, color: col, transparent: true, opacity: 0, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
      sp.position.set(x, y, z); sp.visible = false; scene.add(sp); puffs.push({ sp, x, y, z, t0, size, life, vy, dx: (rnd() - .5) * spread, dz: (rnd() - .5) * spread, op }); }
    function updatePuffs(t) { puffs = puffs.filter(p => { const k = (t - p.t0) / p.life; if (k > 1) { scene.remove(p.sp); p.sp.material.dispose(); return false; } if (k < 0) { p.sp.visible = false; return true; } p.sp.visible = true; p.sp.material.opacity = Math.sin(k * Math.PI) * p.op; p.sp.scale.setScalar(p.size * (.6 + k * 1.2)); p.sp.position.set(p.x + p.dx * k, p.y + p.vy * k, p.z + p.dz * k); return true; }); }

    // ---------- إيجاد المسارات (A*) بعيدًا عن كل العوائق ----------
    const blockers = (extra, minS = .05) => [...OBST.filter(o => !o.soft), ...TREES.filter(o => o.s > minS), ...flags.filter(f => f.g && f.g.visible !== false && f.lift > .05).map(f => ({ k: 'راية', x: f.g.position.x, z: f.g.position.z, r: .07 })), ...(extra || [])]; // والرايات أيضًا: لا يقف جيش ولا منجنيق على سارية // المسار يتجنب حتى الشجرة التي تنمو من جديد
    function findPath(a, b, clear = .07, extra) {
      const mg = 1.6 * K, cell = .04, minx = Math.min(a[0], b[0]) - mg, minz = Math.min(a[1], b[1]) - mg, nx = Math.ceil((Math.max(a[0], b[0]) + mg - minx) / cell), nz = Math.ceil((Math.max(a[1], b[1]) + mg - minz) / cell);
      const blk = new Uint8Array(nx * nz), obs = blockers(extra);
      for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) { const x = minx + ix * cell, z = minz + iz * cell; if (coastDist(x, z) < .14 || groundY(x, z) > .45 * K) { blk[iz * nx + ix] = 1; continue; } }
      obs.forEach(o => { const rr = o.r + clear, i0 = Math.max(0, Math.floor((o.x - rr - minx) / cell)), i1 = Math.min(nx - 1, Math.ceil((o.x + rr - minx) / cell)), j0 = Math.max(0, Math.floor((o.z - rr - minz) / cell)), j1 = Math.min(nz - 1, Math.ceil((o.z + rr - minz) / cell));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (Math.hypot(minx + i * cell - o.x, minz + j * cell - o.z) < rr) blk[j * nx + i] = 1; });
      const toI = p => [clamp(Math.round((p[0] - minx) / cell), 0, nx - 1), clamp(Math.round((p[1] - minz) / cell), 0, nz - 1)];
      const [sx, sz] = toI(a), [gx, gz] = toI(b); [[sx, sz], [gx, gz]].forEach(([cx0, cz0]) => { if (!blk[cz0 * nx + cx0]) return; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const x2 = cx0 + dx, z2 = cz0 + dz; if (x2 >= 0 && z2 >= 0 && x2 < nx && z2 < nz) blk[z2 * nx + x2] = 0; } }); // مخرج صغير حول البداية والنهاية
      const N = nx * nz, gs = new Float32Array(N).fill(1e9), came = new Int32Array(N).fill(-1), hp = [], push = (f, i) => { hp.push([f, i]); let k = hp.length - 1; while (k) { const pk = (k - 1) >> 1; if (hp[pk][0] <= hp[k][0]) break; [hp[pk], hp[k]] = [hp[k], hp[pk]]; k = pk; } }, pop = () => { const top = hp[0], last = hp.pop(); if (hp.length) { hp[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r2 = l + 1; let m = k; if (l < hp.length && hp[l][0] < hp[m][0]) m = l; if (r2 < hp.length && hp[r2][0] < hp[m][0]) m = r2; if (m === k) break; [hp[m], hp[k]] = [hp[k], hp[m]]; k = m; } } return top; }; push(0, sz * nx + sx); gs[sz * nx + sx] = 0;
      const H = (i) => Math.hypot(i % nx - gx, Math.floor(i / nx) - gz); let found = false, it = 0;
      while (hp.length && it++ < 400000) { const [fc, cur] = pop(); if (fc - H(cur) * 1.001 > gs[cur] + 1e-6) continue; if (cur === gz * nx + gx) { found = true; break; }
        const cx = cur % nx, cz = Math.floor(cur / nx); for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dz) continue; const x2 = cx + dx, z2 = cz + dz; if (x2 < 0 || z2 < 0 || x2 >= nx || z2 >= nz) continue; const ni = z2 * nx + x2; if (blk[ni]) continue; if (dx && dz && (blk[cz * nx + x2] || blk[z2 * nx + cx])) continue;
          const g2 = gs[cur] + Math.hypot(dx, dz); if (g2 < gs[ni]) { gs[ni] = g2; came[ni] = cur; push(g2 + H(ni) * 1.001, ni); } } }
      if (!found) return null;
      let pts = []; for (let c = gz * nx + gx; c !== -1; c = came[c]) pts.push([minx + (c % nx) * cell, minz + Math.floor(c / nx) * cell]); pts.reverse(); pts[0] = a.slice(); pts[pts.length - 1] = b.slice();
      // تبسيط: نقطة إلى أبعد نقطة مرئية بلا عائق
      const free = (p, q) => { const L = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.ceil(L / (cell * .5)); for (let k = 0; k <= n; k++) { const x = lerp(p[0], q[0], k / n), z = lerp(p[1], q[1], k / n), [i, j] = toI([x, z]); if (blk[j * nx + i]) return false; } return true; };
      const out = [pts[0]]; let i = 0; while (i < pts.length - 1) { let j = pts.length - 1; while (j > i + 1 && !free(pts[i], pts[j])) j--; out.push(pts[j]); i = j; }
      return out;
    }
    // منحنى ناعم يمر بنقاط المسار، بطول قوسي
    // المنحنى يمر قريبًا من خط المسار: تُضاف نقاط على المقاطع الطويلة فلا ينتفخ المنحنى عند المنعطفات نحو شجرة أو بيت
    function curve(pts) { const v = []; pts.forEach((p, i) => { const P = V(p[0], 0, p[1]); if (i) { const Q = v[v.length - 1], L = Q.distanceTo(P), n = Math.floor(L / .22); for (let k = 1; k <= n; k++) { const t = k / (n + 1); if (L * t > .06 && L * (1 - t) > .06) v.push(Q.clone().lerp(P, t)); } } v.push(P); });
      if (v.length === 2) v.splice(1, 0, v[0].clone().lerp(v[1], .5)); return new THREE.CatmullRomCurve3(v, false, 'centripetal', .2); }

    // اليابسة والبحر: هل النقطة على أرض؟ ومسار بحري لا يلمس اليابسة
    const onLand = (x, z) => lands.some(L => { let c = false; for (let i = 0, j = L.length - 1; i < L.length; j = i++) { const [xi, zi] = L[i], [xj, zj] = L[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; });
    function seaRoute(A, B) { const sample = c => { const out = []; for (let i = 0; i <= 40; i++) { const t = i / 40, u = 1 - t; out.push([u * u * A[0] + 2 * u * t * c[0] + t * t * B[0], u * u * A[1] + 2 * u * t * c[1] + t * t * B[1]]); } return out; };
      const mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2, dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
      for (const k0 of [0, .4, -.4, .9, -.9, 1.5, -1.5, 2.2, -2.2, 3, -3, 4, -4]) { const k = k0 * K, pts = sample([mx + nx * k, mz + nz * k]); if (pts.slice(2, -2).every(([x, z], i) => !onLand(x, z) && (i < 4 || i > 32 || coastDist(x, z) < -.04))) return curve(pts.filter((_, i) => i % 4 === 0)); }
      // التفاف حول الجزيرة الكبرى على دائرة خارج الساحل
      const L0 = lands[0], cx = L0.reduce((a2, p) => a2 + p[0], 0) / L0.length, cz = L0.reduce((a2, p) => a2 + p[1], 0) / L0.length, R0 = Math.max(...L0.map(p => Math.hypot(p[0] - cx, p[1] - cz)));
      let a1 = Math.atan2(A[1] - cz, A[0] - cx), a2 = Math.atan2(B[1] - cz, B[0] - cx), da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      // مسار بحري عام بالبحث على شبكة الماء (يلتف حول أي جزيرة، ويبقى بعيدًا عن الساحل قليلًا)
      { const cell = .1 * K, x0 = Math.min(A[0], B[0], ...lands.flat().map(p => p[0])) - 1.5, z0 = Math.min(A[1], B[1], ...lands.flat().map(p => p[1])) - 1.5, x1 = Math.max(A[0], B[0], ...lands.flat().map(p => p[0])) + 1.5, z1 = Math.max(A[1], B[1], ...lands.flat().map(p => p[1])) + 1.5, nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
        const blk = new Uint8Array(nx * nz); for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = x0 + i * cell, z = z0 + j * cell; if (onLand(x, z) || coastDist(x, z) > -.1) blk[j * nx + i] = 1; }
        const ti = p => [clamp(Math.round((p[0] - x0) / cell), 0, nx - 1), clamp(Math.round((p[1] - z0) / cell), 0, nz - 1)], [si, sj] = ti(A), [gi, gj] = ti(B); blk[sj * nx + si] = 0; blk[gj * nx + gi] = 0;
        const gs = new Float32Array(nx * nz).fill(1e9), came = new Int32Array(nx * nz).fill(-1), hp = [], H = i => Math.hypot(i % nx - gi, Math.floor(i / nx) - gj);
        const push = (f, i) => { hp.push([f, i]); let k = hp.length - 1; while (k) { const pk = (k - 1) >> 1; if (hp[pk][0] <= hp[k][0]) break; [hp[pk], hp[k]] = [hp[k], hp[pk]]; k = pk; } }, pop = () => { const top = hp[0], last = hp.pop(); if (hp.length) { hp[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r2 = l + 1; let m = k; if (l < hp.length && hp[l][0] < hp[m][0]) m = l; if (r2 < hp.length && hp[r2][0] < hp[m][0]) m = r2; if (m === k) break; [hp[m], hp[k]] = [hp[k], hp[m]]; k = m; } } return top; };
        const S0 = sj * nx + si, G0 = gj * nx + gi; gs[S0] = 0; push(0, S0); let found = false, it = 0;
        while (hp.length && it++ < 200000) { const [fc, cur] = pop(); if (cur === G0) { found = true; break; } if (fc - H(cur) > gs[cur] + 1e-6) continue; const cxi = cur % nx, czi = Math.floor(cur / nx);
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dz) continue; const x2 = cxi + dx, z2 = czi + dz; if (x2 < 0 || z2 < 0 || x2 >= nx || z2 >= nz) continue; const ni = z2 * nx + x2; if (blk[ni]) continue; const g2 = gs[cur] + Math.hypot(dx, dz); if (g2 < gs[ni]) { gs[ni] = g2; came[ni] = cur; push(g2 + H(ni), ni); } } }
        if (found) { let pts = []; for (let c = G0; c !== -1; c = came[c]) pts.push([x0 + (c % nx) * cell, z0 + Math.floor(c / nx) * cell]); pts.reverse(); pts[0] = A.slice(); pts[pts.length - 1] = B.slice();
          const free = (p, q) => { const L = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.ceil(L / (cell * .4)); for (let k = 1; k < n; k++) { const x = lerp(p[0], q[0], k / n), z = lerp(p[1], q[1], k / n); if (onLand(x, z) || coastDist(x, z) > -.06) return false; } return true; };
          const out = [pts[0]]; let i = 0; while (i < pts.length - 1) { let j = pts.length - 1; while (j > i + 1 && !free(pts[i], pts[j])) j--; out.push(pts[j]); i = j; }
          if (out.length === 2) out.splice(1, 0, [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]); const c3 = curve(out); if (Array.from({ length: 160 }, (_, i) => c3.getPointAt((i + 4) / 168)).every(v => !onLand(v.x, v.z))) return c3; } }
      // التفاف حول الجزيرة الكبرى على قطع ناقص يحاذي شكلها (أقرب للساحل من الدائرة، فلا يصطدم بالجزر الصغيرة)
      const ex = Math.max(...L0.map(p => Math.abs(p[0] - cx))), ez = Math.max(...L0.map(p => Math.abs(p[1] - cz)));
      for (const mg of [.35, .7, 1.1, 1.6, 2.3]) for (const dd of [da, da > 0 ? da - 2 * Math.PI : da + 2 * Math.PI]) { const n = Math.max(4, Math.ceil(Math.abs(dd) / .2)), pts = [A]; for (let i = 0; i <= n; i++) { const an = a1 + dd * i / n; pts.push([cx + Math.cos(an) * (ex + mg), cz + Math.sin(an) * (ez + mg)]); } pts.push(B);
        const c2 = curve(pts), ok2 = Array.from({ length: 120 }, (_, i) => c2.getPointAt((i + 4) / 128)).every(v => !onLand(v.x, v.z)); if (ok2) return c2; }
      for (const Rr of [R0 + .35, R0 + .9, R0 + 1.6]) for (const dd of [da, da > 0 ? da - 2 * Math.PI : da + 2 * Math.PI]) { const n = Math.max(3, Math.ceil(Math.abs(dd) / .3)), pts = [A]; for (let i = 0; i <= n; i++) { const an = a1 + dd * i / n; pts.push([cx + Math.cos(an) * Rr, cz + Math.sin(an) * Rr]); } pts.push(B);
        const c2 = curve(pts), ok2 = Array.from({ length: 60 }, (_, i) => c2.getPointAt((i + 3) / 66)).every(v => !onLand(v.x, v.z)); if (ok2) return c2; }
      return null; }
    // أمام السور: نقطة خالية قبالة الأسوار من جهة المهاجم (للحصار)
    const RING = t => t === 'castle' ? { rx: .5 * SZ.keep, rz: .4 * SZ.keep, h: .2 * SZ.keep } : { rx: .24 * SZ.keep, rz: .19 * SZ.keep, h: .1 * SZ.keep };
    function wallFront(r, c0) { const I = R[r], tgt = M.regions[r], { rx, rz } = RING(tgt.type), a0 = Math.atan2(c0[1] - I.z, c0[0] - I.x);
      for (let k = 0; k < 11; k++) { const aa = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * .14; for (const o of [.24, .3, .2, .36, .44]) { const x = I.x + Math.cos(aa) * (rx + o), z = I.z + Math.sin(aa) * (rz + o); if (!hitObst(x, z, .12) && coastDist(x, z) > .25 && !TREES.some(t => t.s > .5 && Math.hypot(t.x - x, t.z - z) < t.r + .06)) { const dd = Math.hypot(I.x - x, I.z - z) || 1; return { p: [x, z], dir: [(I.x - x) / dd, (I.z - z) / dd] }; } } }
      return null; }
    function freeNear(x, z, rid, c = .05) { for (let k = 0; k < 24; k++) { const a2 = k * 2.4, rr = .06 + k * .012, px = x + Math.cos(a2) * rr, pz = z + Math.sin(a2) * rr; if ((rid == null || regionAtW(px, pz) === rid) && !hitObst(px, pz, c) && !TREES.some(t => t.s > .5 && Math.hypot(t.x - px, t.z - pz) < t.r + c)) return [px, pz]; } return [x, z]; }
    // إبحار السفينة: سرعة ثابتة على طول المسار، دوران ناعم مع الانعطاف، وأثر ماء خلفها
    function sailShip(ship, nav, lt, t) { const q = glide(seg(lt, nav.t0, nav.t1)), p = nav.route.getPointAt(q), tg = nav.route.getTangentAt(clamp(q, .001, .999)); ship.position.set(p.x, .02 + Math.sin(lt * 3) * .004, p.z);
      if (q < 1) { const want = -Math.atan2(tg.z, tg.x); let d = want - ship.rotation.y; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; ship.rotation.y += ship.userData.aimed ? d * .18 : d; ship.userData.aimed = true; ship.rotation.z = Math.sin(lt * 2.2) * .025;
        if (q > 0 && t - (ship.userData.wake || 0) > .11) { ship.userData.wake = t; puff(p.x - tg.x * .09, .03, p.z - tg.z * .09, t, { col: '#ffffff', size: .09, life: 1.2, vy: .01, spread: .07, op: .55 }); } } else ship.rotation.z *= .9; }
    // الكاميرا تتابع السفينة بإزاحة ثابتة، وتنظر قليلًا أمامها نحو وجهتها، فتبقى السفينة والشاطئ في الإطار طوال الرحلة
    function shipCam(ship, nav) { const p0 = nav.route.getPointAt(0), p1 = nav.route.getPointAt(1), cd = V(p1.x - p0.x, 0, p1.z - p0.z).normalize(), q = SZ.ship;
      // من خلف السفينة على خط إبحارها العام (ثابت الاتجاه فلا تتأرجح الكاميرا مع الانعطاف)، والموج والشاطئ المقصود أمامها
      const pose = () => { const sp = ship.position, look = V(sp.x + cd.x * .35 * q, .04, sp.z + cd.z * .35 * q); return { pos: V(sp.x - cd.x * 1.5 * q + cd.z * .35, .8 * q, sp.z - cd.z * 1.5 * q - cd.x * .35), look }; }; camTo(pose(), 1.1); camFollow(pose); }
    // خطة الإنزال البحري: من ميناء الفريق (أو أقرب ساحل له) إلى شاطئ الإقليم المستهدف
    function navalPlan(a, ally, r) { const tgt = M.regions[r], [tx, tz] = at(tgt), mine = j => W.owner[j] === a || (ally != null && W.owner[j] === ally);
      const own = M.regions.filter(q => mine(q.id) && q.type !== 'castle'); if (!own.length) { W._why = 'own'; return null; } const ports = own.filter(q => R[q.id].port), srcs = ports.length ? ports : own;
      const exitRay = (cx, cz, id, ang) => { const ux = Math.cos(ang), uz = Math.sin(ang); for (let s2 = .05; s2 < 2.6; s2 += .02) { const x = cx + ux * s2, z = cz + uz * s2; if (!onLand(x, z)) { const b = [cx + ux * (s2 - .2), cz + uz * (s2 - .2)]; if (regionAtW(...b) !== id || coastDist(...b) < .08) return null; return { shore: b, sea: [cx + ux * (s2 + .22), cz + uz * (s2 + .22)], u: [ux, uz] }; } } return null; };
      let best = null;
      srcs.forEach(q => { const I = R[q.id]; let sea = null; if (I.port) { const ux = Math.cos(I.port.dir), uz = Math.sin(I.port.dir); let q = 0; while (q < 1.5 && onLand(I.port.x + ux * q, I.port.z + uz * q)) q += .03; sea = [I.port.x + ux * (q + .15), I.port.z + uz * (q + .15)]; } else { let bb = null; for (let k = 0; k < 24; k++) { const e2 = exitRay(I.x, I.z, q.id, k / 24 * 6.283); if (e2) { const d = Math.hypot(e2.sea[0] - tx, e2.sea[1] - tz); if (!bb || d < bb.d) bb = { d, sea: e2.sea }; } } if (bb) sea = bb.sea; }
        if (!sea) return; for (let k = 0; k < 36; k++) { const e2 = exitRay(tx, tz, r, k / 36 * 6.283); if (!e2) continue; const d = Math.hypot(e2.sea[0] - sea[0], e2.sea[1] - sea[1]); if (!best || d < best.d) best = { d, seaA: sea, land: e2 }; } });
      if (!best) { W._why = 'best'; return null; } const route = seaRoute(best.seaA, best.land.sea); if (!route) { W._why = ['route', best.seaA, best.land.sea]; return null; }
      const rl = route.getLength(), sail = clamp(rl / SPEED.ship, 1.1, 6.2), u = best.land.u, dir = [-u[0], -u[1]], shore = best.land.shore; let cross = null;
      for (const k of [.34, .28, .22, .4, .17]) { const c = [shore[0] + dir[0] * k, shore[1] + dir[1] * k]; if (regionAtW(...c) === r && onLand(...c) && !hitObst(c[0], c[1], .08)) { cross = c; break; } }
      if (!cross) cross = [shore[0] + dir[0] * .2, shore[1] + dir[1] * .2];
      return { route, len: rl, t0: .6, t1: .6 + sail, shore, cross, dir, seaB: best.land.sea }; }
    // سفينة حربية بشراع بلون الفريق وجنود على سطحها
    function warship(o, n = 3) { const g = boat(0, 0, 0); g.scale.setScalar(1.35 * SZ.ship); const sl = g.children[2]; if (sl) sl.material = mat(TEAMS[o].color, { side: THREE.DoubleSide, flatShading: false }); if (g.userData.pen) g.userData.pen.material = mat(TEAMS[o].color, { side: THREE.DoubleSide });
      const crew = []; for (let i = 0; i < n; i++) { const m = soldier(o); scene.remove(m); m.scale.setScalar(.75 * SZ.crew); m.position.set(-.07 + i * .06, .045, (i % 2 ? .015 : -.015)); m.rotation.y = Math.PI / 2; g.add(m); crew.push(m); } g.userData.crew = crew; return g; }
    // سلّم حصار يستند إلى السور
    function ladder(bx, bz, tx, tz, yb, yt) { const g = new THREE.Group(), L = Math.hypot(tx - bx, yt - yb, tz - bz); g.position.set(bx, yb, bz); scene.add(g);
      const inner = new THREE.Group(); g.add(inner); for (const x of [-.012, .012]) mesh(box(.004, L, .004), SMT.wood, [x, L / 2, 0], null, inner); for (let y = .02; y < L; y += .024) mesh(box(.026, .003, .003), SMT.wood, [0, y, 0], null, inner);
      g.quaternion.setFromUnitVectors(V(0, 1, 0), V(tx - bx, yt - yb, tz - bz).normalize()); g.userData.inner = inner; inner.scale.y = .001; return g; }
    const arrowGeo = new THREE.CylinderGeometry(.0013, .0013, .04, 4), arrowMat = mat('#3b2f25');
    // سقالات خشبية حول البناء
    function scaffold(x, z, rx, rz, h) { const g = new THREE.Group(), y = groundY(x, z); g.position.set(x, y, z); scene.add(g); const n = 8;
      for (let i = 0; i < n; i++) { const a = i / n * 6.283, px = Math.cos(a) * rx, pz = Math.sin(a) * rz; mesh(box(.005, h, .005), SMT.wood, [px, h / 2, pz], null, g);
        const a2 = (i + 1) / n * 6.283, qx = Math.cos(a2) * rx, qz = Math.sin(a2) * rz, ln = Math.hypot(qx - px, qz - pz); for (const hy of [h * .45, h * .9]) { const b = mesh(box(ln, .004, .012), SMT.wood, [(px + qx) / 2, hy, (pz + qz) / 2], null, g); b.rotation.y = -Math.atan2(qz - pz, qx - px); } }
      g.scale.y = .001; return g; }

    // ---------- الكاميرا ----------
    // منظر الجزيرة كاملة: يُحسب ليملأ الشاشة بالجزيرة الكبرى والجزيرتين معًا بأقل بحر حولها (لأي نسبة شاشة)، وبالزاوية نفسها
    const OVD = V(0, 15.6, 11.8).normalize(), ovCache = {}, landPts = lands.flat().filter((_, i) => i % 3 === 0);
    const overview = () => { const a = camera.aspect || 16 / 9, key = a.toFixed(3);
      if (!ovCache[key]) { const tc = new THREE.PerspectiveCamera(30, a, .1, 400), pv = V(0, 0, 0); let best = null;
        const x0 = Math.min(...landPts.map(p => p[0])), x1 = Math.max(...landPts.map(p => p[0])), z0 = Math.min(...landPts.map(p => p[1])), z1 = Math.max(...landPts.map(p => p[1]));
        for (let lx = -1.6 * K; lx <= 1.6 * K; lx += .2) for (let lz = -1.4 * K; lz <= 1.4 * K; lz += .2) { const look = V((x0 + x1) / 2 + lx, 0, (z0 + z1) / 2 + lz); let lo = 4, hi = 80;
          for (let it = 0; it < 16; it++) { const d = (lo + hi) / 2; tc.position.copy(look).addScaledVector(OVD, d); tc.lookAt(look); tc.updateMatrixWorld(); tc.updateProjectionMatrix();
            const fits = landPts.every(([x, z]) => { pv.set(x, .02, z).project(tc); return Math.abs(pv.x) < .955 && pv.y < .9 && pv.y > -.93; }); if (fits) hi = d; else lo = d; }
          if (!best || hi < best.d) best = { d: hi, look }; }
        ovCache[key] = best; }
      const o = ovCache[key], d = o.d * SZ.frame; return { pos: o.look.clone().addScaledVector(OVD, d), look: o.look.clone().add(V(0, 0, SZ.lookZ)) }; };
    let cam = { from: overview(), to: overview(), t0: 0, d: 0, follow: null };
    const camNow = { pos: overview().pos.clone(), look: overview().look.clone() };
    // مدة الانتقال تطول مع المسافة (فلا تندفع الكاميرا في لقطة بعيدة)، والتسارع والتهدئة ناعمان
    const camDur = (pose, d, cap = 2.6) => Math.min(cap, Math.max(d, camNow.pos.distanceTo(pose.pos) / 7)), camEase = t => t * t * t * (t * (6 * t - 15) + 10);
    function camTo(pose, d = 1.4) { cam = { from: { pos: camNow.pos.clone(), look: camNow.look.clone() }, to: pose, t0: W.time, d: d < .05 ? .01 : camDur(pose, d), follow: null }; }
    function camFollow(fn) { cam.follow = fn; }
    // ---------- وضعان للكاميرا لا يتصارعان: «متابعة» (المشاهد تحرّكها) و«استكشاف» (المستخدم يحرّكها) ----------
    const man = { on: false, tgt: V(0, 0, 0), az: 1, el: .9, dist: 12 }, LB = (() => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; lands.forEach(L => L.forEach(([x, z]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); })); return { x0, x1, z0, z1 }; })();
    const maxDist = () => overview().pos.distanceTo(overview().look) * 1.12;
    function manClamp() { man.dist = clamp(man.dist, 1.8, maxDist()); man.el = clamp(man.el, .38, 1.45); man.tgt.x = clamp(man.tgt.x, LB.x0, LB.x1); man.tgt.z = clamp(man.tgt.z, LB.z0, LB.z1); man.tgt.y = 0; }
    function manPose() { const ce = Math.cos(man.el), pos = V(man.tgt.x + Math.cos(man.az) * ce * man.dist, Math.sin(man.el) * man.dist, man.tgt.z + Math.sin(man.az) * ce * man.dist), gy = groundY(pos.x, pos.z); if (pos.y < gy + .4) pos.y = gy + .4; return { pos, look: man.tgt.clone() }; }
    function manFrom(pose) { const d = pose.pos.clone().sub(pose.look); man.dist = d.length() || 1; man.el = Math.asin(clamp(d.y / man.dist, .1, .999)); man.az = Math.atan2(d.z, d.x); man.tgt.copy(pose.look); manClamp(); }
    W.camMode = () => man.on ? 'manual' : 'follow';
    W.manual = v => { v = !!v; if (v === man.on) return; if (!v) { camVel.pos.set(0, 0, 0); camVel.look.set(0, 0, 0); camT = W.time; } if (v) manFrom(camNow); else cam = { from: { pos: camNow.pos.clone(), look: camNow.look.clone() }, to: cam.to, t0: W.time, d: camDur(cam.follow ? cam.follow() : cam.to, .9, 3.6), follow: cam.follow }; /* العودة من الاستكشاف قد تكون مسافة كبيرة على الجزيرة الأوسع، فتأخذ وقتًا أطول قليلًا لتبقى ناعمة */ man.on = v; W.emit('cam', W.camMode()); };
    W.zoomBy = f => { W.manual(true); man.dist *= f; manClamp(); };
    W.orbitBy = (dAz, dEl = 0) => { W.manual(true); man.az += dAz; man.el += dEl; manClamp(); };
    W.panBy = (dx, dy) => { W.manual(true); const k = man.dist * .0016, rx = -Math.sin(man.az), rz = Math.cos(man.az), fx = Math.cos(man.az), fz = Math.sin(man.az); man.tgt.x += (dx * rx + dy * fx) * k; man.tgt.z += (dx * rz + dy * fz) * k; manClamp(); };
    W.viewAll = () => { W.manual(true); manFrom(overview()); };
    W.followEvent = () => W.manual(false);
    W.focus = r => { const I = R[r]; if (!I) return; W.manual(true); man.tgt.set(I.x, 0, I.z); man.dist = Math.min(man.dist, 4.4); man.el = clamp(man.el, .6, 1.0); manClamp(); };
    // النقطة تحت المؤشر → الإقليم (أو null في البحر)
    const _ray = new THREE.Raycaster(), _pl = new THREE.Plane(V(0, 1, 0), -.1), _hit = V(0, 0, 0);
    W.pick = (cx, cy) => { const b = renderer.domElement.getBoundingClientRect(); _ray.setFromCamera(new THREE.Vector2((cx - b.left) / b.width * 2 - 1, -((cy - b.top) / b.height * 2 - 1)), camera); if (!_ray.ray.intersectPlane(_pl, _hit)) return null; if (!onLand(_hit.x, _hit.z)) return null; const id = regionAtW(_hit.x, _hit.z); return id != null && id >= 0 && M.regions[id] ? id : null; };
    // إيماءات الفأرة واللمس: عجلة أو إصبعان للتقريب، سحب للتحريك، زر أيمن أو Shift أو لفّ إصبعين للتدوير، ونقرة لاختيار أرض
    W.attachControls = (el, opt = {}) => { el.style.touchAction = 'none'; const pts = new Map(); let moved = 0, t0 = 0, last2 = null;
      const two = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; };
      const down = e => { if (e.pointerType === 'mouse' && e.button > 2) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY, btn: e.button, shift: e.shiftKey || e.ctrlKey }); if (pts.size === 1) { moved = 0; t0 = performance.now(); } if (pts.size === 2) last2 = two(); try { el.setPointerCapture(e.pointerId); } catch (er) { } };
      const move = e => { const p = pts.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
        if (pts.size === 1) { if (moved < 6) return; if (p.btn === 2 || p.shift) W.orbitBy(dx * .006, dy * .004); else W.panBy(-dx, -dy); }
        else if (pts.size === 2 && last2) { const n = two(); if (n.d > 10 && last2.d > 10) W.zoomBy(last2.d / n.d); let da = n.ang - last2.ang; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; if (Math.abs(da) < .5) W.orbitBy(da); W.panBy(-(n.mx - last2.mx), -(n.my - last2.my)); last2 = n; moved += 10; } };
      const up = e => { const p = pts.get(e.pointerId); pts.delete(e.pointerId); if (pts.size < 2) last2 = null; if (p && !pts.size && moved < 6 && performance.now() - t0 < 500 && opt.onPick) opt.onPick(W.pick(e.clientX, e.clientY), e); };
      const wheel = e => { e.preventDefault(); W.zoomBy(Math.exp(clamp(e.deltaY, -120, 120) * .0016)); }, ctx = e => e.preventDefault();
      el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('wheel', wheel, { passive: false }); el.addEventListener('contextmenu', ctx);
      return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('wheel', wheel); el.removeEventListener('contextmenu', ctx); }; };
    function updateCam(rdt = .016) { if (window.__cam) { camera.position.set(...window.__cam[0]); camera.lookAt(...window.__cam[1]); return; }
      if (man.on) { const to = manPose(), k = 1 - Math.exp(-Math.min(.1, rdt) * 11); camNow.pos.lerp(to.pos, k); camNow.look.lerp(to.look, k); camera.position.copy(camNow.pos); camera.lookAt(camNow.look); return; }
      let to = cam.to; if (cam.follow) to = cam.follow();
      const k = camEase(seg(W.time, cam.t0, cam.t0 + cam.d)); camNow.pos.lerpVectors(cam.from.pos, to.pos, k); camNow.look.lerpVectors(cam.from.look, to.look, k);
      // حارس التضاريس: إن حجب جبلٌ أو تلٌّ ما تنظر إليه الكاميرا ترتفع بنعومة حتى يظهر، ثم تعود
      let need = terrNeed; if (actors.length && (++terrN % 3 === 0)) { need = 0; const tg = [camNow.look]; for (const o of scene.children) { if (tg.length > 30) break; if (o.userData && o.userData.kind && o.visible !== false && o.position.distanceToSquared(camNow.look) < 9) tg.push(o.position); }
        for (const t of tg) for (let h = need; h <= 2.4 && terrBlock(camNow.pos, t, h); h += .1) need = h + .1; terrNeed = need; } else if (!actors.length) need = terrNeed = 0; terrLift += (need - terrLift) * Math.min(1, rdt * (need > terrLift ? 9 : 2.5));
      camera.position.copy(camNow.pos); camera.position.y += terrLift; camera.lookAt(camNow.look);
      if (shakeA > 0) { const k = 1 - (W.time - shakeT0) / shakeD; if (k <= 0) shakeA = 0; else { const a = shakeA * k * k * K; camera.position.x += Math.sin(W.time * 61) * a; camera.position.y += Math.sin(W.time * 47 + 1) * a * .7; camera.position.z += Math.cos(W.time * 53) * a; } } }
    let terrLift = 0, terrNeed = 0, terrN = 0; // يُحسب كل ثالث إطار فقط، خفيف على الأداء
    function terrBlock(cp, tp, up) { const L = Math.hypot(cp.x - tp.x, cp.z - tp.z), n = Math.max(6, Math.ceil(L / .08)), cy = cp.y + up;
      for (let i = 1; i < n; i++) { const q = i / n, x = lerp(tp.x, cp.x, q), z = lerp(tp.z, cp.z, q), y = lerp(tp.y + .04, cy, q); if (q > .04 && groundY(x, z) > y) return true; } return false; }
    let camT = 0; const camVel = { pos: V(0, 0, 0), look: V(0, 0, 0) }, _ch = V(0, 0, 0), _tp = V(0, 0, 0), _g1 = V(0, 0, 0), _g2 = V(0, 0, 0);
    function sdamp(cur, tgt, vel, st, dt) { const om = 2 / st, x = om * dt, ex = 1 / (1 + x + .48 * x * x + .235 * x * x * x); _ch.copy(cur).sub(tgt); _tp.copy(vel).addScaledVector(_ch, om).multiplyScalar(dt); vel.sub(_tp.clone().multiplyScalar(om)).multiplyScalar(ex); cur.copy(tgt).add(_ch.add(_tp).multiplyScalar(ex)); }
    // لقطة بلا حجب: نجرّب زوايا حول الهدف ونختار الأقرب للمفضّلة التي لا يحجبها جبل
    // هل يحجب بيت أو شجرة أو جبل أو راية خطَّ النظر بين الكاميرا والهدف؟
    // هل النقطة داخل سارية راية أو قماشها؟ القماش شريط يمتد من السارية في اتجاه دورانها، لا قرص حولها
    function flagHit(x, y, z) { return flags.some(f => { if (!f.g || f.g.visible === false || f.lift < .05) return false; const gx = f.g.position.x, gz = f.g.position.z, top = f.g.position.y + (f.h || .5) * f.pole; if (y > top + .04) return false;
      if (Math.hypot(gx - x, gz - z) < .05) return true; const ry = f.g.rotation.y, dx = Math.cos(ry), dz = -Math.sin(ry), u = clamp(((x - gx) * dx + (z - gz) * dz) / f.W) * f.W, ex = gx + dx * u - x, ez = gz + dz * u - z;
      return Math.hypot(ex, ez) < .06 && y > top - (f.Hh || .15) - .05; }); }
    function losBlocked(cp, tp) { const L = Math.hypot(cp.x - tp.x, cp.z - tp.z), n = Math.max(6, Math.ceil(L / .06));
      for (let k = 1; k < n - 1; k++) { const q = k / n, x = lerp(tp.x, cp.x, q), z = lerp(tp.z, cp.z, q), y = lerp(tp.y + .05, cp.y, q), gy = groundY(x, z); if (q > .06 && gy > y - .03) return true;
        if (q > .03 && flagHit(x, y, z)) return true;
        if (q < .12) continue; if (OBST.some(o => !o.soft && (o.k === 'بيت' || o.k === 'سور' || o.k === 'برج') && Math.hypot(o.x - x, o.z - z) < o.r * .9 && y < gy + .26 * SZ.house)) return true;
        if (TREES.some(o => o.s > .5 && Math.hypot(o.x - x, o.z - z) < o.r * .9 && y < gy + .34 * o.t[3])) return true;
        if (flagHit(x, y, z)) return true; }
      return false; }
    // لا شيء ضخم ملاصق للكاميرا (راية أو شجرة أو بيت) يملأ جانب الصورة ولو لم يقطع خط النظر
    function nearClutter(p, rad = .42) { const gy = groundY(p.x, p.z);
      if (flags.some(f => { if (!f.g || f.g.visible === false) return false; const cx = f.g.position.x + Math.cos(.35) * f.W / 2, cz = f.g.position.z - Math.sin(.35) * f.W / 2; return Math.hypot(cx - p.x, cz - p.z) < rad + f.W / 2 && p.y < f.g.position.y + (f.h || .5) + .25; })) return true;
      if (TREES.some(o => o.s > .5 && Math.hypot(o.x - p.x, o.z - p.z) < rad * .8 + o.r && p.y < gy + .5 * o.t[3] + .15)) return true;
      return OBST.some(o => !o.soft && (o.k === 'بيت' || o.k === 'سور' || o.k === 'برج') && Math.hypot(o.x - p.x, o.z - p.z) < rad * .8 + o.r && p.y < gy + .4 * SZ.house + .15); }
    function clearView(focus, prefAz, dist, h, extra = [], tries = 0) { let best = null, bestN = -1, bestPos = null;
      for (let k = 0; k < 24; k++) { const da = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 12, az = prefAz + da, pos = focus.clone().add(V(Math.cos(az) * dist, h, Math.sin(az) * dist));
        let ok = true; for (let q = .08; q < .95; q += .04) { const x = lerp(focus.x, pos.x, q), z = lerp(focus.z, pos.z, q), y = lerp(focus.y + .06, pos.y, q); if (groundY(x, z) > y - .03 || (q > .35 && flags.some(f => f.g && Math.hypot(f.g.position.x - x, f.g.position.z - z) < .16 && f.g.position.y + (f.h || .5) + .05 > y))) { ok = false; break; } }
        if (ok && losBlocked(pos, focus)) ok = false;
        // نقاط إضافية (مسار القافلة أو الجيش) يجب أن تُرى أيضًا فلا يختفي جزء من الحدث خلف جبل
        if (ok && extra.length) { const n = extra.filter(e => !terrBlock(pos, e, 0)).length; if (n < extra.length) { if (n > bestN) { bestN = n; bestPos = pos; } ok = false; } }
        if (ok) { best = pos; break; } }
      // لا زاوية جانبية ترى الحدث كله؟ نرتفع ونقترب (لقطة أعلى) حتى لا يحجب الجبل شيئًا
      if (!best && bestPos && tries < 3) return clearView(focus, prefAz, dist * .62, h * 1.12, extra, tries + 1);
      if (!best && bestPos) best = bestPos;
      return { pos: best || focus.clone().add(V(0, h * 1.6, dist * .6)), look: focus.clone().add(V(0, .06, 0)) }; }
    const sideView = (focus, dir, dist = 2.3, h = 2.3, extra) => clearView(focus, Math.atan2(dir[0], -dir[1]) , Math.hypot(dist, .2), h, extra);
    const nearView = (focus, dist = 1.8, h = 1.5) => clearView(focus, Math.atan2(1.6, .9), dist, h);

    // ---------- الأجواء ----------
    const torches = []; const fireTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 40, 0, 32, 36, 30); gr.addColorStop(0, 'rgba(255,240,180,1)'); gr.addColorStop(.35, 'rgba(255,150,40,.9)'); gr.addColorStop(1, 'rgba(255,60,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    function torch(x, y, z, s = 1) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); sp.position.set(x, y, z); sp.scale.setScalar(.07 * s); scene.add(sp); const t = { sp, s, ph: rnd() * 6, base: 0 }; torches.push(t); return t; }
    M.regions.filter(r => r.type === 'capital' || r.type === 'castle').forEach(r => { const I = R[r.id], rx = r.type === 'castle' ? .5 : .24, rz = r.type === 'castle' ? .4 : .19, h = r.type === 'castle' ? .35 : .18, n = r.type === 'castle' ? 8 : 6; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + Math.PI / n; torch(I.x + Math.cos(a) * rx, groundY(I.x, I.z) + h + .03, I.z + Math.sin(a) * rz, 1); } });
    let sky = { ...SKY.opening }, skyFrom = sky, skyTo = sky, skyT0 = 0, skyD = 1;
    const cSun = new THREE.Color(), cA = new THREE.Color(), cB = new THREE.Color();
    function setSky(key, d = 6) { skyFrom = { ...sky }; skyTo = SKY[key] || SKY.opening; skyT0 = W.time; skyD = d; }
    function updateSky() { const k = ease(seg(W.time, skyT0, skyT0 + skyD)); const f = skyFrom, t = skyTo;
      sky = { si: lerp(f.si, t.si, k), hemi: lerp(f.hemi, t.hemi, k), sx: lerp(f.sx, t.sx, k), sy: lerp(f.sy, t.sy, k), sz: lerp(f.sz, t.sz, k), exp: lerp(f.exp, t.exp, k), torch: lerp(f.torch, t.torch, k), sun: '#' + cA.set(f.sun).lerp(cB.set(t.sun), k).getHexString(), sea: '#' + cA.set(f.sea).lerp(cB.set(t.sea), k).getHexString() };
      sun.color.set(sky.sun); sun.intensity = sky.si; sun.position.set(sky.sx, sky.sy, sky.sz); hemi.intensity = sky.hemi; renderer.toneMappingExposure = sky.exp; scene.background.set(sky.sea); scene.fog.color.set(sky.sea);
      torches.forEach(tc => { const fl = .75 + .25 * Math.sin(W.time * 13 + tc.ph) * Math.sin(W.time * 7.3 + tc.ph * 2); tc.sp.material.opacity = sky.torch * fl; tc.sp.scale.setScalar(.07 * tc.s * (.9 + .2 * fl)); }); }

    // ---------- الحالة الثابتة: ملكية ورايات وتحصينات ----------
    function placeFlag(id, o, lift = 1) { const I = R[id]; if (I.flag) { dropFlag(I.flag); I.flag = null; } if (o == null) return null;
      const [fx, fz] = I.flagSpot; I.flag = makeFlag(fx, fz, o, I.flagH, I.flagBig, I.flagY); I.flag.lift = lift; return I.flag; }
    function fortGroup(id) { // سور صغير حول الساحة
      const I = R[id], [x, z] = I.yard, y = groundY(x, z), q = SZ.house, g = ring(x, z, y, .15 * q, .13 * q, 6, .06 * q, .022 * q, '#8a8f99', .026 * q, scene, false); return g; }
    function towerGroup(id) { const I = R[id], [x, z] = I.yard, tx = x + .07 * SZ.house, tz = z - .05 * SZ.house, y = groundY(tx, tz), g = new THREE.Group(); g.position.set(tx, y, tz); g.scale.setScalar(SZ.house); scene.add(g);
      const t = tower(0, 0, 0, .028, .2, '#7a5236', g, false); const man = soldier(I.owner ?? 0); scene.remove(man); man.scale.setScalar(.9); man.position.set(0, .2 + .03, 0); g.add(man);
      const tc = torch(tx, y + .3 * SZ.house, tz, .8 * SZ.house); tc.always = true; g.userData = { t, man, tc }; return g; }
    function garGroup(id, o, kind) { const I = R[id], [x, z] = I.yard, list = []; for (let i = 0; i < 3; i++) { const u = kind === 'cav' ? rider(o, i) : soldier(o), a = 2.2 + i * .9; const px = x + Math.cos(a) * .07 * SZ.house, pz = z + Math.sin(a) * .06 * SZ.house; u.position.set(px, groundY(px, pz), pz); u.rotation.y = a + Math.PI / 2; u.scale.setScalar((kind === 'cav' ? 1.1 : 1.2) * SZ.unit); list.push(u); } return list; }
    function setFort(id, on) { const I = R[id]; if (!!I.fort === !!on) return; if (on) I.fort = fortGroup(id); else { scene.remove(I.fort); I.fort = null; } }
    function setTower(id, on) { const I = R[id]; if (!!I.tower === !!on) return; if (on) I.tower = towerGroup(id); else { const tc = I.tower.userData.tc; scene.remove(tc.sp); torches.splice(torches.indexOf(tc), 1); scene.remove(I.tower); I.tower = null; } }
    function setGar(id, o, kind) { const I = R[id]; const want = kind ? o + kind : null; if (I.garKey === want) return; I.gar.forEach(disposeUnit); I.gar = []; I.garKey = want; if (kind) I.gar = garGroup(id, o, kind); }
    const capLevel = {};
    function setCapLevel(team, level, anim = false) { const id = M.caps ? M.caps[team] : null; if (id == null) return []; const I = R[id]; capLevel[team] = level; const want = level >= 3 ? 6 : level >= 2 ? 3 : 0, made = [];
      while (I.capHouses.length < want && I.capHouses.length < I.capSpots.length) { const [x, z] = I.capSpots[I.capHouses.length], h = house(x, z, .82, I.capHouses.length % 2 ? C.roof : C.roof2, faceTo(x, z, I.x, I.z)); OBST.pop(); I.capHouses.push(h); made.push(h); if (anim) h.scale.setScalar(.001); }
      while (I.capHouses.length > want) scene.remove(I.capHouses.pop());
      if (I.keep) { I.keep.scale.y = level >= 3 ? 1.25 : level >= 2 ? 1.1 : 1; if (I.keep.userData.roof) I.keep.userData.roof.material = mat(TEAMS[team].color, { flatShading: false }); }
      return made; }
    // ضبط الحالة كاملة دفعة واحدة (عند البداية أو عند إعادة الاتصال)
    W.setState = (st) => {
      st.regions.forEach(r => { W.owner[r.id] = r.owner; setTint(r.id); const I = R[r.id];
        if (I.flag && I.flag.o !== r.owner || !I.flag && r.owner != null) placeFlag(r.id, r.owner);
        setFort(r.id, r.walls); setTower(r.id, r.tower || false); setGar(r.id, r.owner, r.garrison); I.owner = r.owner; });
      (st.teams || []).forEach((T, i) => setCapLevel(i, T.capLevel || 1));
      if (st.allies) setAllies(st.allies);
      buildBorders(); M.regions.forEach(makeLabel); updateTrees();
    };

    // ---------- خيوط التحالف ----------
    const threads = {};
    function threadKey(a, b) { return Math.min(a, b) + '-' + Math.max(a, b); }
    function makeThread(a, b) { const A = R[M.caps[a]], B = R[M.caps[b]], p0 = V(A.x, groundY(A.x, A.z) + .9, A.z), p1 = V(B.x, groundY(B.x, B.z) + .9, B.z), mid = p0.clone().lerp(p1, .5); mid.y += p0.distanceTo(p1) * .22;
      const crv = new THREE.QuadraticBezierCurve3(p0, mid, p1), g = new THREE.TubeGeometry(crv, 64, .012, 8, false), m = new THREE.MeshStandardMaterial({ color: '#f4c430', emissive: '#f4c430', emissiveIntensity: .6, metalness: .6, roughness: .3, transparent: true, opacity: .9 });
      const mesh2 = new THREE.Mesh(g, m); mesh2.geometry.setDrawRange(0, 0); scene.add(mesh2); return { mesh: mesh2, crv, total: g.index.count, a, b }; }
    function setAllies(pairs) { const want = new Set(pairs.map(([a, b]) => threadKey(a, b))); Object.keys(threads).forEach(k => { if (!want.has(k)) { scene.remove(threads[k].mesh); delete threads[k]; } }); pairs.forEach(([a, b]) => { const k = threadKey(a, b); if (!threads[k]) { threads[k] = makeThread(a, b); threads[k].mesh.geometry.setDrawRange(0, threads[k].total); } }); }

    // ---------- المشاهد ----------
    const actors = [];  // دوال تُنادى كل إطار حتى تنتهي
    function run(fn) { return new Promise(res => actors.push({ fn, res, t0: W.time })); }
    W.skip = () => { W.skipping = true; };
    function sceneDone() { W.skipping = false; W.snapping = false; }
    // نقطة عبور الحد بين إقليمين ومكان التجمع ونقطة الالتحام، مع خلوّ المسار
    function crossing(fromId, toId) {
      const pts = sharedEdge(fromId, toId), [ax, az] = at(M.regions[fromId]), [bx, bz] = at(M.regions[toId]);
      const mid = pts.length ? pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]) : [(ax + bx) / 2, (az + bz) / 2];
      const cand = (pts.length ? pts : [mid]).map(p => ({ p, d: Math.hypot(p[0] - mid[0], p[1] - mid[1]) })).sort((x, y) => x.d - y.d);
      for (const c of cand) { const p = c.p; if (coastDist(p[0], p[1]) < .28 || groundY(p[0], p[1]) > .36 * K || hitObst(p[0], p[1], .1) || TREES.some(o => o.s > .5 && Math.hypot(o.x - p[0], o.z - p[1]) < o.r + .08)) continue; return p; }
      for (const c of cand) { const p = c.p; if (coastDist(p[0], p[1]) < .18 || groundY(p[0], p[1]) > .42 * K || hitObst(p[0], p[1], .08)) continue; return p; } // نقطة العبور بعيدة عن الشاطئ
      return cand[0].p;
    }
    // ترتيب الجيش حسب نوع الوحدة
    function army(team, unit, ally, small) { const list = [];
      const mk = (o, k, i) => { const u = k === 'r' ? rider(o, i, i === 0) : k === 'c' ? catapult(o) : soldier(o); list.push(u); };
      if (unit === 'cav') { for (let i = 0; i < 4; i++) mk(i % 2 && ally != null ? ally : team, 'r', i); }
      else if (unit === 'cat') { for (let i = 0; i < (small ? 4 : 6); i++) mk(i % 2 && ally != null ? ally : team, 'f', i); mk(team, 'c', 0); } // المنجنيق في المؤخرة: يقف على مسافة من السور
      else if (small) { for (let i = 0; i < 6; i++) mk(i % 2 && ally != null ? ally : team, 'f', i); }
      else { for (let i = 0; i < 8; i++) mk(i % 2 && ally != null ? ally : team, 'f', i); mk(team, 'r', 0); } // القائد الراكب خلف جنوده
      return list; }
    const spacing = u => (u.userData.kind === 'horse' ? .19 : u.userData.kind === 'cat' ? .3 : u.userData.kind === 'cart' ? .09 : .065) * SZ.unit * Math.max(1, u.scale.x / UNIT_S);
    // يضع الوحدات على المنحنى صفًا (اثنين اثنين للمشاة) بحسب موضع المقدمة
    function muster(cross, dir, back, regId) { const freeAt = (x, z, c) => coastDist(x, z) > .2 && !hitObst(x, z, c) && !flags.some(f => f.g && Math.hypot(f.g.position.x - x, f.g.position.z - z) < c + .3) && !TREES.some(o => o.s > .5 && Math.hypot(o.x - x, o.z - z) < o.r + c) && groundY(x, z) < .4;
      for (const extra of [0, .1, .2, -.1, .3]) for (let k = 0; k < 13; k++) { const da = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * .14, c = Math.cos(da), sn = Math.sin(da), dx = dir[0] * c - dir[1] * sn, dz = dir[0] * sn + dir[1] * c, x = cross[0] - dx * (back + extra), z = cross[1] - dz * (back + extra);
        if (regId != null && regionAtW(x, z) !== regId && k < 12) continue; if (freeAt(x, z, .1)) return [x, z]; }
      for (let k = 0; k < 40; k++) { const a2 = k * 2.4, rr = .1 + k * .03, x = cross[0] - dir[0] * back + Math.cos(a2) * rr, z = cross[1] - dir[1] * back + Math.sin(a2) * rr; if ((regId == null || regionAtW(x, z) === regId) && freeAt(x, z, .08)) return [x, z]; }
      if (regId != null) { const [yx, yz] = R[regId].yard; for (let k = 0; k < 36; k++) { const a2 = k * 2.4, rr = .17 + k * .012, x = yx + Math.cos(a2) * rr, z = yz + Math.sin(a2) * rr; if (freeAt(x, z, .06)) return [x, z]; } return [yx + .17, yz + .1]; } // لا تجمّع في الماء ولا عند السارية أبدًا
      return [cross[0] - dir[0] * back, cross[1] - dir[1] * back]; }
    let obC = null, obT = -9; const nearOb = (x, z) => { if (!obC || Math.abs(W.time - obT) > .5) { obC = blockers(null, .5); obT = W.time; } return obC.filter(o => Math.abs(o.x - x) < o.r + .12 && Math.abs(o.z - z) < o.r + .12); };
    function placeColumn(units, crv, len, s, walking, t, retreat = false, hide = false) {
      let off = 0; const out = [];
      units.forEach((u, i) => { const k = u.userData.kind, narrow = !!crv.narrow; const pair = k === 'foot' && !narrow ? (i % 2 ? .028 : -.028) * SZ.unit : 0; if (k !== 'foot' || i % 2 === 0 || narrow) off += spacing(u) * (i ? 1 : 0);
        if (hide) u.visible = s - off > .002; const ss = clamp((s - off) / len, 0, 1), p = crv.getPointAt(ss), tg = crv.getTangentAt(Math.min(.999, Math.max(.001, ss))); let x = p.x - tg.z * pair, z = p.z + tg.x * pair;
        // دفع ناعم: إن لامس الجندي شجرة أو بيتًا بملّيمترات (انحناء المسار) يُزاح جانبًا قدر التلامس فقط
        { const rr = (k === 'horse' ? .05 : k === 'cat' ? .06 : .025) + .006; for (const o of nearOb(x, z)) { const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz) || 1e-4, ov = o.r + rr - d; if (ov > 0 && ov < .05) { x += dx / d * ov; z += dz / d * ov; } } }
        u.position.set(x, groundY(x, z), z); u.rotation.y = Math.atan2(tg.x, tg.z) + (retreat ? Math.PI : 0); animUnit(u, t, walking, i, false); out.push(u);
        if (W.audit && u.visible !== false && (!onLand(x, z) || coastDist(x, z) < .02)) W.hits.push(['ماء', +coastDist(x, z).toFixed(3), +x.toFixed(2), +z.toFixed(2), k, +s.toFixed(2), i, +ss.toFixed(3), +len.toFixed(2)]);
        if (W.audit && u.visible !== false) { const rr = k === 'horse' ? .05 : k === 'cat' ? .06 : .025, hx = x + Math.sin(u.rotation.y) * .13 * UNIT_S, hz = z + Math.cos(u.rotation.y) * .13 * UNIT_S; blockers(null, .5).forEach(o => { if (k === 'cat' && Math.hypot(o.x - hx, o.z - hz) - o.r - .03 < -.005) W.hits.push(['طاقم المنجنيق/' + (o.k || 'شجرة'), +x.toFixed(2), +z.toFixed(2)]); const dd = Math.hypot(o.x - x, o.z - z) - o.r - rr; if (dd < -.005) W.hits.push([o.k || 'شجرة', +dd.toFixed(3), +x.toFixed(2), +z.toFixed(2), k, +s.toFixed(2), i, +ss.toFixed(3), +len.toFixed(2)]); }); } });
      return off; }

    // مشهد الهجوم الكامل
    // هندسة الهجوم (مشتركة بين لحظة الترقب والمشهد نفسه، فلا يقفز شيء بينهما)
    function geom(e) { const { a, d, r, unit = 'inf', ally, from } = e, tgt = M.regions[r], Lr = tgt.land || 0;
      const nav = (e.naval || (unit !== 'cav' && !tgt.nb.some(j => (M.regions[j].land || 0) === Lr && (W.owner[j] === a || (ally != null && W.owner[j] === ally))))) ? navalPlan(a, ally, r) : null; // الفرسان تعبر البر فوق أرض، لا بحرًا
      const fromId = from != null ? from : (tgt.nb.find(j => W.owner[j] === a) ?? tgt.nb.find(j => W.owner[j] === ally) ?? M.caps[a]);
      const c0 = crossing(fromId, r), [fx, fz] = at(M.regions[fromId]), dir0 = [c0[0] - fx, c0[1] - fz], dl = Math.hypot(...dir0) || 1, dirB = [dir0[0] / dl, dir0[1] / dl], wallF = !nav && (tgt.type === 'castle' || tgt.type === 'capital') && d != null ? wallFront(r, c0) : null, cross = nav ? nav.cross : wallF ? wallF.p : c0, dir = nav ? nav.dir : wallF ? wallF.dir : dirB;
      const units = army(a, unit, ally, !!nav), colLen = units.reduce((s, u, i) => s + (u.userData.kind !== 'foot' || i % 2 === 0 ? spacing(u) : 0), 0);
      // نقطة التجمّع: خالية تمامًا داخل أرض المهاجم، خلف الحد بطول الصف ومسافة المسير
      const endP = [cross[0] - dir[0] * .05 * SZ.unit, cross[1] - dir[1] * .05 * SZ.unit], start = nav ? nav.shore : wallF ? muster(c0, dirB, colLen + .3, fromId) : muster(cross, dir, colLen + .5, fromId);
      let narrow = false; const full = (nav ? findPath(start, endP, .06) : findPath(start, endP, .09)) || (narrow = true, findPath(start, endP, .05)) || [start, endP]; // في الممر الضيق يمشون صفًّا واحدًا
      const crv = curve(full); crv.narrow = narrow; const colL = narrow ? units.reduce((a2, u, i) => a2 + (i ? spacing(u) : 0), 0) : colLen, len = crv.getLength(), s0 = Math.min(colL + .02, len * .9), s1 = len;
      // المدافعون عند الحد من جهة الهدف (أو الحامية)
      const I = R[r], defs = []; const dO = d;
      if (dO != null && tgt.type !== 'castle' && tgt.type !== 'capital') { for (let i = 0; i < 6; i++) { const off = (i - 2.5) * .07 * SZ.unit, row = i % 2 ? .075 * SZ.unit : 0; const px = cross[0] + dir[0] * (.09 * SZ.unit + row) - dir[1] * off, pz = cross[1] + dir[1] * (.09 * SZ.unit + row) + dir[0] * off; if (hitObst(px, pz, .03) || coastDist(px, pz) < .15) continue; const u = soldier(dO); u.position.set(px, groundY(px, pz), pz); u.rotation.y = Math.atan2(-dir[0], -dir[1]); defs.push(u); } }
      if (tgt.type === 'castle' || tgt.type === 'capital') { const RG = RING(tgt.type); for (let i = 0; i < 4; i++) { if (dO == null) break; const a2 = Math.atan2(cross[1] - I.z, cross[0] - I.x) + (i - 1.5) * .18; const px = I.x + Math.cos(a2) * (RG.rx - .02), pz = I.z + Math.sin(a2) * (RG.rz - .02); const u = soldier(dO); u.position.set(px, groundY(px, pz) + RG.h, pz); u.rotation.y = a2 + Math.PI / 2 - Math.PI / 2; defs.push(u); } }
      return { nav, fromId, c0, cross, dir, dirB, wallF, units, colLen, endP, start, full, crv, len, s0, s1, I, defs }; }
    W.attack = async (e) => {
      W.busy = true; const { a, d, r, unit = 'inf', result, ally } = e, tgt = M.regions[r];
      const fk = [a, r, unit, ally].join(':'), G0 = W.fo && W.fo.key === fk ? W.fo.g : (W.faceoffEnd(), geom(e)); if (W.fo) { W.fo.keep = true; W.faceoffEnd(); }
      const { nav, fromId, cross, dir, dirB, wallF, units, colLen, crv, len, s0, s1, I, defs } = G0;
      // لقطات
      // رحلة قصيرة: لقطة تجمع الميناء والشاطئ معًا، والسفينة تنتظر في الميناء حتى تصل الكاميرا فلا يفوت المتفرج الإبحار
      const shortSail = !!nav && nav.t1 - nav.t0 < 2.6;
      if (shortSail && !nav.camSet) { nav.camSet = true; const q0 = nav.route.getPointAt(0), q1 = nav.route.getPointAt(1), md = V((q0.x + q1.x) / 2, 0, (q0.z + q1.z) / 2), L0 = Math.hypot(q1.x - q0.x, q1.z - q0.z); camTo(sideView(md, [(q1.x - q0.x) / (L0 || 1), (q1.z - q0.z) / (L0 || 1)], Math.max(1.8, L0 * 1.4), Math.max(1.3, L0 * .9)), 1.1); const ex = Math.max(0, cam.d - nav.t0 - .15); nav.t0 += ex; nav.t1 += ex; }
      const mv = SPEED[unit] || SPEED.inf, mdur = nav ? clamp(len / mv, 1.3, 2.6) : clamp((s1 - s0) / mv, unit === 'cat' ? 3.2 : 2.4, 5.6), mT = nav ? [nav.t1 + .5, nav.t1 + .5 + mdur] : [1.2, 1.2 + mdur], FIRE = units.some(u => u.userData.kind === 'cat') ? 2.1 : 0, c1 = mT[1] + FIRE, T = { march: mT, fire: [mT[1], c1], clash: [c1, c1 + 1.6], res: [c1 + 1.6, c1 + 3.8], end: c1 + 5 };
      const focus = V(cross[0], groundY(...cross), cross[1]);
      const firstCam = () => camTo(sideView(focus.clone().add(V(-dir[0] * .4, 0, -dir[1] * .4)), dir, 3.0, 3.0), 1.2);
      // لقطات البث: خلف الجيش وهو يزحف، ولقطة منخفضة بجانب الفرسان وهي تعدو
      const f0 = crv.getPointAt(clamp(s0 / len, 0, 1)), sideFree = sg => Math.min(9, ...flags.filter(fl => fl.g).map(fl => Math.hypot(fl.g.position.x - (f0.x - dir[0] * 1.55 - dir[1] * sg * .6), fl.g.position.z - (f0.z - dir[1] * 1.55 + dir[0] * sg * .6)))), sgn = sideFree(1) >= sideFree(-1) ? 1 : -1, side = [-dir[1] * sgn, dir[0] * sgn], cavShot = unit === 'cav', lift = (p, h) => { p.y = Math.max(p.y, groundY(p.x, p.z) + h); return p; };
      const chase = () => { const f = units[0].position, q = SZ.unit; return cavShot
        ? (() => { const m = units[Math.min(1, units.length - 1)].position; return { pos: lift(V(m.x + side[0] * 1.55 * q - dir[0] * .35, m.y + .55 * q, m.z + side[1] * 1.55 * q - dir[1] * .35), .3), look: V(m.x + dir[0] * .3, m.y + .04, m.z + dir[1] * .3) }; })()
        : (() => { const p = lift(V(f.x - dir[0] * 1.55 * q + side[0] * .45, f.y + 1.3 * q, f.z - dir[1] * 1.55 * q + side[1] * .45), .45); // لا راية بين الكاميرا والجيش: إن اعترضت راية خط النظر ارتفعت الكاميرا حتى تتجاوزها
          let need = 0; for (let k = 0; k < 8; k++) { const hit = flags.some(fl => { if (!fl.g || !fl.g.visible) return false; const gx = fl.g.position.x, gz = fl.g.position.z, vx = f.x - p.x, vz = f.z - p.z, L2 = vx * vx + vz * vz || 1, u = clamp(((gx - p.x) * vx + (gz - p.z) * vz) / L2), dx = p.x + vx * u - gx, dz = p.z + vz * u - gz; if (Math.hypot(dx, dz) > .3) return false; const lineY = lerp(p.y, f.y + .1, u); return fl.g.position.y + (fl.h || .6) * (fl.g.scale ? fl.g.scale.y : 1) > lineY - .05; }); if (!hit && !losBlocked(p, V(f.x, f.y + .04, f.z))) break; p.y += .25; need += .25; }
          p.y -= need; chaseLift += (need - chaseLift) * Math.min(1, Math.max(0, W.time - chaseT) * 2.5); chaseT = W.time; p.y += chaseLift; // الارتفاع فوق الرايات يتغير بنعومة لا قفزًا
          return { pos: p, look: V(f.x + dir[0] * .8, f.y, f.z + dir[1] * .8) }; })(); };
      let chaseLift = 0, chaseT = W.time; const startCam = () => { camTo(chase(), 1.1); camFollow(chase); };
      W.track = { ship: null, units, nav: null, T };
      labelsOpacity(0); let ship = null, navCam = false;
      if (nav) { ship = warship(a, 3); const p0 = nav.route.getPointAt(0); ship.position.set(p0.x, .02, p0.z); if (shortSail) navCam = true; else shipCam(ship, nav); W.track = { ship, units, nav, T }; W.emit('sfx', { k: 'sail', at: nav.t0, dur: nav.t1 - nav.t0 }); }
      else startCam();
      // الحصار: سلالم على السور، ورماة يتبادلون السهام
      const siege = (tgt.type === 'castle' || tgt.type === 'capital') && d != null, ladders = [], arrows = []; let nextArrow = 0;
      if (siege) { const RG = RING(tgt.type), rx = RG.rx, rz = RG.rz, hW = RG.h * .95, a0 = Math.atan2(cross[1] - I.z, cross[0] - I.x);
        for (const da of [-.17, .17]) { const aa = a0 + da, wx = I.x + Math.cos(aa) * rx, wz = I.z + Math.sin(aa) * rz, bx = I.x + Math.cos(aa) * (rx + .09), bz = I.z + Math.sin(aa) * (rz + .09); if (hitObst(bx, bz, .02) && tgt.type === 'capital') continue; ladders.push(ladder(bx, bz, wx, wz, groundY(bx, bz), groundY(wx, wz) + hW)); } }
      const won = result === 'taken' || result === 'loot' || result === 'garrisonFell', taken = result === 'taken';
      // غبار المسير والالتحام
      const tw = W.time;
      for (let i = 0; i < 24; i++) { const k = i / 24, p = crv.getPointAt(lerp(s0 / len, 1, k)); puff(p.x + (rnd() - .5) * .14, groundY(p.x, p.z) + .02, p.z + (rnd() - .5) * .14, tw + lerp(T.march[0], T.march[1], k), { size: .16, life: 1.1, vy: .05, op: .45 }); }
      for (let i = 0; i < 26; i++) { const x = cross[0] + (rnd() - .5) * .3, z = cross[1] + (rnd() - .5) * .3; puff(x, groundY(x, z) + .03, z, tw + T.clash[0] + rnd() * 1.2, { size: .24 + rnd() * .2, life: 1.2 + rnd() * .5, op: .7 }); }
      for (let i = 0; i < 18; i++) { const x = cross[0] + (rnd() - .5) * .2, z = cross[1] + (rnd() - .5) * .2; puff(x, groundY(x, z) + .1 + rnd() * .06, z, tw + T.clash[0] + .2 + rnd() * 1.1, { col: '#ffd27a', size: .05, life: .3, vy: .22, spread: .45, additive: true, op: 1 }); }
      if (siege) W.emit('sfx', { k: 'arrows', at: T.march[1] - 1.2, dur: 2.6 });
      const mixed = units.some(u => u.userData.kind === 'horse') && unit !== 'cav'; W.emit('sfx', { k: unit === 'cav' ? 'gallop' : 'march', at: T.march[0], dur: T.march[1] - T.march[0], mixed }); W.emit('sfx', { k: 'clash', at: T.clash[0], dur: T.clash[1] - T.clash[0], cav: unit === 'cav', mixed });
      // منجنيق: قذيفة على الأسوار قبل الالتحام
      // المنجنيق: يقف في المؤخرة، يشدّ الطاقم ذراعه ويضع الحجر، ثم يقذفه في قوس عالٍ فيصيب السور نفسه وتنفتح فيه ثغرة
      const catU = units.find(u => u.userData.kind === 'cat'); let shot = null, stone = null, shadow = null, chunks = [];
      if (catU) { const fortOn = !!I.fort && !siege, RG = siege ? RING(tgt.type) : null; let tx, tz, ty;
        if (fortOn) { const [yx, yz] = I.yard, rr = .15 * SZ.house, ang = Math.atan2(-dir[1], -dir[0]); tx = yx + Math.cos(ang) * rr; tz = yz + Math.sin(ang) * rr * (.13 / .15); ty = groundY(tx, tz) + .035 * SZ.house; }
        else if (siege) { const ang = Math.atan2(cross[1] - I.z, cross[0] - I.x); tx = I.x + Math.cos(ang) * RG.rx; tz = I.z + Math.sin(ang) * RG.rz; ty = groundY(tx, tz) + RG.h * .6; }
        else { tx = cross[0] + dir[0] * .25; tz = cross[1] + dir[1] * .25; ty = groundY(tx, tz) + .05; }
        shot = { t: T.fire[0], rel: T.fire[0] + 1.05, hit: T.fire[0] + 1.85, to: V(tx, ty, tz), fort: fortOn };
        stone = new THREE.Mesh(sph(.02 * SZ.unit, 10, 8), mat('#6f685c')); stone.visible = false; scene.add(stone);
        shadow = new THREE.Mesh(new THREE.CircleGeometry(.02 * SZ.unit, 14), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: .28, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.visible = false; scene.add(shadow);
        W.emit('sfx', { k: 'catwind', at: shot.t + .05 }); W.emit('sfx', { k: 'catfire', at: shot.rel }); W.emit('sfx', { k: 'catimpact', at: shot.hit }); }
      // الثغرة: أقرب قطع السور إلى موضع الإصابة تنهار، وتتطاير حجارتها
      const breach = () => { if (!shot || !shot.fort || !I.fort) return; const P = shot.to, cand = I.fort.children.map(m => ({ m, d: Math.hypot(m.position.x - P.x, m.position.z - P.z) })).sort((x, y) => x.d - y.d);
        cand.filter((c, i) => i < 2 || c.d < .09 * SZ.house).forEach(c => { c.m.userData.fallAt = W.time; c.m.userData.p0 = c.m.position.clone(); c.m.userData.r0 = c.m.rotation.z; });
        I.fort.userData.broken = true; for (let i = 0; i < 9; i++) { const ch = new THREE.Mesh(new THREE.DodecahedronGeometry(.008 + rnd() * .008, 0), mat(C.stone2)); ch.position.copy(P); scene.add(ch); chunks.push({ m: ch, v: V((rnd() - .5) * .5 - dir[0] * .2, .35 + rnd() * .35, (rnd() - .5) * .5 - dir[1] * .2), t0: W.time }); } };
      const crumble = (now) => { if (!I.fort) return; I.fort.children.forEach(m => { const u = m.userData; if (u.fallAt == null) return; const k = clamp((now - u.fallAt) / .55); m.position.y = u.p0.y - k * .06 * SZ.house; m.rotation.z = u.r0 + k * .9; m.scale.setScalar(Math.max(.001, 1 - k * .85)); }); };
      let flagNew = null, looted = false, camMoved = false, oldFlag = I.flag, carry = null; if (!won) W.emit('sfx', { k: 'hold', at: T.res[0] }); else if (taken && I.fort) W.emit('sfx', { k: 'fall', at: T.res[0] + .6 }); const SPa = spreadSlot();
      await run((t) => { const lt = t - tw;
        const k = glide(seg(lt, ...T.march)), retreat = !won && lt > T.res[0], rk = ease(seg(lt, T.res[0], T.res[1] + .4));
        const s = retreat ? lerp(s1, Math.max(s1 - .55, s0 + (units.some(u => u.userData.kind === 'cat') ? .14 * UNIT_S : 0)), rk) : lerp(nav ? 0 : s0, s1, k); // الارتداد لا يتجاوز نقطة الانطلاق، فلا يتكدس الجيش ولا يدخل طاقم المنجنيق في الراية
        placeColumn(units, crv, len, s, (k > 0 && k < 1) || (retreat && rk < 1), lt, retreat, !!nav && lt < T.clash[0]);
        if (ship) { sailShip(ship, nav, lt, t); ship.userData.crew.forEach((m, i) => { m.visible = lt < nav.t1 + .2 + i * .18; m.position.y = .045 + Math.abs(Math.sin(lt * 5 + i)) * .004; });
          if (lt > nav.t1 + .05 && !navCam) { navCam = true; firstCam(); } }
        if (siege) { ladders.forEach((l, i) => { l.userData.inner.scale.y = Math.max(.001, ease(seg(lt, T.march[1] - .8 + i * .2, T.march[1] + .2 + i * .2))); });
          if (lt > T.march[1] - 1.4 && lt < T.clash[1] && lt > nextArrow && defs.length) { nextArrow = lt + .11; const fromDef = Math.random() < .7, A = fromDef ? defs[Math.floor(Math.random() * defs.length)] : units[Math.floor(Math.random() * Math.min(5, units.length))], B = fromDef ? units[Math.floor(Math.random() * Math.min(5, units.length))] : defs[Math.floor(Math.random() * defs.length)];
            if (A && B && A.visible !== false && B.visible !== false) { const m = new THREE.Mesh(arrowGeo, arrowMat); scene.add(m); arrows.push({ m, p0: A.position.clone().add(V(0, .05, 0)), p1: B.position.clone().add(V((Math.random() - .5) * .05, .02, (Math.random() - .5) * .05)), t0: lt }); } }
          for (let i = arrows.length - 1; i >= 0; i--) { const ar = arrows[i], q = (lt - ar.t0) / .55; if (q >= 1) { scene.remove(ar.m); arrows.splice(i, 1); continue; } const h = .14 + ar.p0.distanceTo(ar.p1) * .15, P0 = ar.p0.clone().lerp(ar.p1, q), P1 = ar.p0.clone().lerp(ar.p1, Math.min(1, q + .02)); P0.y += Math.sin(q * Math.PI) * h; P1.y += Math.sin(Math.min(1, q + .02) * Math.PI) * h; ar.m.position.copy(P0); ar.m.quaternion.setFromUnitVectors(V(0, 1, 0), P1.sub(P0).normalize()); } }
        const fight = lt > T.clash[0] && lt < T.clash[1]; if (fight) units.forEach((u, i) => { if (i < 5) { u.position.x += Math.sin(lt * 23 + i) * .005 + dir[0] * .028 * seg(lt, T.clash[0], T.clash[0] + .5); u.position.z += Math.cos(lt * 19 + i) * .005 + dir[1] * .028 * seg(lt, T.clash[0], T.clash[0] + .5); animUnit(u, lt, false, i, true); } });
        if (catU && shot) { const arm = catU.userData.arm, cup = catU.userData.cup, wk = ease(seg(lt, shot.t + .1, shot.rel - .1)), fk = seg(lt, shot.rel, shot.rel + .16);
          arm.rotation.x = lt < shot.rel ? .55 * wk : lerp(.55, -1.2, ease(fk)) * (1 - .6 * seg(lt, shot.rel + .5, shot.rel + 1.4));
          if (lt > shot.t + .45 && lt < shot.rel) { stone.visible = true; cup.getWorldPosition(stone.position); stone.position.y += .008; }
          else if (lt >= shot.rel && lt < shot.hit) { if (!shot.p0) { shot.p0 = V(0, 0, 0); cup.getWorldPosition(shot.p0); } const q = seg(lt, shot.rel + .04, shot.hit), H = .22 + shot.p0.distanceTo(shot.to) * .28; stone.visible = true; stone.position.lerpVectors(shot.p0, shot.to, q); stone.position.y += Math.sin(q * Math.PI) * H; shadow.visible = true; shadow.position.set(stone.position.x, groundY(stone.position.x, stone.position.z) + .006, stone.position.z); shadow.material.opacity = .12 + .2 * q; }
          else { stone.visible = false; shadow.visible = false; }
          const breachPos = () => { const cp = catU.position, dx = shot.to.x - cp.x, dz = shot.to.z - cp.z, dl = Math.hypot(dx, dz) || 1, ux = dx / dl, uz = dz / dl; const P = shot.to, side = [V(P.x + uz * .08, P.y, P.z - ux * .08), V(P.x - uz * .08, P.y, P.z + ux * .08)]; let pos = null; for (let k = 0; k < 4 && !pos; k++) for (let i = 0; i < 12 && !pos; i++) { const a = Math.atan2(-uz, -ux) + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * .32, dd = .95 + k * .12, c = V(P.x + Math.cos(a) * dd, P.y + .8 + k * .16, P.z + Math.sin(a) * dd); c.y = Math.max(c.y, groundY(c.x, c.z) + .3); const low = V(P.x, P.y - .03, P.z); if (!losBlocked(c, P) && !losBlocked(c, low) && side.every(q => !losBlocked(c, q)) && !nearClutter(c, .32)) pos = c; } return pos; }; // لقطة الثغرة: زاوية عالية من جهة المهاجم لا يحجبها بيت ولا شجرة ولا راية
          if (lt > shot.rel + .04 && !shot.pan && shot.camPos) { shot.pan = true; const lk = shot.look.clone().lerp(shot.to, .8); lk.y = Math.max(lk.y, shot.to.y + .08); let pp = shot.camPos.clone(); const bp = breachPos(); shot.bp = bp; if (bp) pp = bp; else for (const f of [.45, .3, .15]) { const c = shot.camPos.clone().lerp(shot.to, f); c.y = Math.max(shot.camPos.y * (1 - f * .5), groundY(c.x, c.z) + .5); if (!losBlocked(c, shot.to) && !nearClutter(c, .25)) { pp = c; break; } } const p0 = shot.camPos.clone(), w0 = W.time, wd = Math.max(.6, shot.hit - shot.rel); const pose = () => { const k = ease(clamp((W.time - w0) / wd)), lkS = stone.visible ? stone.position.clone().lerp(shot.to, .45) : lk.clone(); return { pos: p0.clone().lerp(pp, k), look: lkS.lerp(lk, k * k) }; }; camTo(pose(), .35); camFollow(pose); } // الرامي يتابع الحجر بعينه: الكاميرا تلتفت معه وتتقدم نحو السور فتُرى الإصابة
          if (lt > shot.hit + .05 && !shot.cam2) { shot.cam2 = true; const P = shot.to; let pos = shot.bp || null; if (!pos) { const cp = catU.position, ux = (P.x - cp.x), uz = (P.z - cp.z); pos = clearView(P, Math.atan2(-uz, -ux), 1.1, .8).pos; } camTo({ pos, look: P.clone() }, .7); } // بعد الإصابة تستقر الكاميرا على الثغرة
          if (lt >= shot.hit && !shot.done) { shot.done = true; W.slowUntil = W.time + .45; W.shake(.014, .4); breach(); for (let i = 0; i < 14; i++) puff(shot.to.x + (rnd() - .5) * .12, shot.to.y, shot.to.z + (rnd() - .5) * .12, t + i * .02, { col: '#bdb39b', size: .2 + rnd() * .12, life: 1.1 + rnd() * .4, op: .75 }); }
          // لقطة الرامي: من خلف المنجنيق نحو السور، فيرى المتفرج الشدّ والإطلاق والحجر وهو يطير حتى يصيب
          if (lt > shot.t + .05 && !shot.cam) { shot.cam = true; const cp = catU.position, dx = shot.to.x - cp.x, dz = shot.to.z - cp.z, dl = Math.hypot(dx, dz) || 1, ux = dx / dl, uz = dz / dl, q = SZ.unit;
            // الكاميرا خلف المنجنيق وفوقه قليلًا، والنظر إلى نقطة بين المنجنيق والسور: فيظهر المنجنيق في مقدمة الصورة والسور في عمقها
            const look = cp.clone().lerp(shot.to, .3); look.y = groundY(look.x, look.z) + .05; let pos = null;
            // نقاط من قوس الحجر وفوق المنجنيق: يجب أن تُرى كلها، فلا تحجب الرايةُ أو الشجرةُ الطيرانَ
            const Hs = .22 + cp.distanceTo(shot.to) * .28, arcPts = [.15, .3, .5, .7].map(q => { const a = cp.clone().lerp(shot.to, q); a.y = lerp(cp.y + .1, shot.to.y, q) + Math.sin(q * Math.PI) * Hs; return a; }).concat([V(cp.x, cp.y + .22, cp.z), look]);
            for (let pass = 0; pass < 2 && !pos; pass++) for (let k = 0; k < 8 && !pos; k++) for (const ang of [.18, -.18, .45, -.45, .75, -.75, 1.05, -1.05]) { const dist = (.75 + k * .1) * q, up = (.42 + k * .12) * q, ca = Math.cos(ang), sa = Math.sin(ang), bx = -(ux * ca - uz * sa), bz = -(uz * ca + ux * sa), p2 = V(cp.x + bx * dist, groundY(cp.x, cp.z) + up, cp.z + bz * dist); p2.y = Math.max(p2.y, groundY(p2.x, p2.z) + .3); if (!losBlocked(p2, shot.to) && !losBlocked(p2, cp) && arcPts.every(a => !losBlocked(p2, a)) && (pass || !nearClutter(p2))) { pos = p2; break; } }
            let lk = look; if (!pos) { const cv = clearView(look, Math.atan2(-uz, -ux), 1.6, 1.1); pos = cv.pos; lk = cv.look; }
            shot.camPos = pos.clone(); shot.look = lk.clone(); camTo({ pos, look: lk }, 1.0); } }
        crumble(t); for (let i = chunks.length - 1; i >= 0; i--) { const c = chunks[i], tt = t - c.t0, gy = groundY(c.m.position.x, c.m.position.z) + .006; if (c.m.position.y <= gy && tt > .1) continue; c.m.position.x += c.v.x * .016; c.m.position.z += c.v.z * .016; c.m.position.y = Math.max(gy, shot.to.y + c.v.y * tt - 1.6 * tt * tt); c.m.rotation.x += .2; }
        // إن صمد المدافع والسور مهدوم: تتساقط بقيته ركامًا (لا يبقى سور قائم بعد ضربة المنجنيق)
        if (shot && shot.fort && !won && lt > T.res[0] + .3 && I.fort && !I.fort.userData.allDown) { I.fort.userData.allDown = true; I.fort.children.forEach((m, i) => { if (m.userData.fallAt == null) { m.userData.fallAt = W.time + .08 * i; m.userData.p0 = m.position.clone(); m.userData.r0 = m.rotation.z; } }); }
        // المدافعون: يقاتلون ثم يسقطون إن فاز المهاجم، أو يرفعون رماحهم إن صمدوا
        defs.forEach((u, i) => { const fall = won ? seg(lt, T.clash[0] + .5 + i * .1, T.clash[1] + .1) : 0; animUnit(u, lt, false, i + 20, fight && fall < 1);
          if (won) { u.rotation.z = ease(fall) * 1.4 * (i % 2 ? 1 : -1); const gone = ease(seg(lt, T.clash[1] + .1, T.clash[1] + .8)); u.scale.setScalar(UNIT_S * (1 - gone)); u.visible = gone < .99; }
          else if (lt > T.res[0]) { u.userData.spear.rotation.x = -.3 + Math.sin(lt * 6 + i) * .15; } });
        // الحامية تسقط بدل الأرض
        if (result === 'garrisonFell' && I.gar.length) I.gar.forEach((u, i) => { const f = ease(seg(lt, T.clash[1], T.clash[1] + .8)); u.rotation.z = f * 1.4 * (i % 2 ? 1 : -1); u.scale.setScalar(1.2 * (1 - ease(seg(lt, T.clash[1] + .6, T.res[0] + .6)))); });
        // الراية: تنزل راية المدافع وترتفع راية الفاتح، ويسري اللون
        if (taken) { if (oldFlag) oldFlag.lift = 1 - ease(seg(lt, T.res[0], T.res[0] + .8));
          if (lt > T.res[0] + .8 && !flagNew) { if (oldFlag) { dropFlag(oldFlag); I.flag = null; } setFort(r, false); setGar(r, null, null); flagNew = placeFlag(r, a, 0); W.emit('sfx', { k: 'raise', at: 0 }); W.slowUntil = W.time + .5; }
          if (flagNew) flagNew.lift = ease(seg(lt, T.res[0] + .8, T.res[0] + 1.8));
          const sp = ease(seg(lt, T.res[0] + 1.2, T.res[1] + .8)); SPa.set(r, cross[0], cross[1], d != null ? TEAMS[d].color : '#ffffff', d != null ? 1 : 0, TEAMS[a].color, sp < 1 ? sp * 2.4 : 0);
          if (sp >= 1 && W.owner[r] !== a) { W.owner[r] = a; R[r].owner = a; setTint(r); buildBorders(); makeLabel(tgt); } }
        if (result === 'loot' && lt > T.res[0] + .2 && !carry) { const ext = units.map(u => ({ x: u.position.x, z: u.position.z, r: .05 })), side = [-dir[1], dir[0]], goal = [cross[0] - dir[0] * .1 + side[0] * .26, cross[1] - dir[1] * .1 + side[1] * .26];
          const aS = Math.atan2(cross[1] - I.z, cross[0] - I.x) + .55, wf = wallFront(r, [I.x + Math.cos(aS), I.z + Math.sin(aS)]), y0 = wf ? wf.p : freeNear(I.yard[0], I.yard[1], r, .06), g2 = wf ? freeNear(y0[0] - wf.dir[0] * .45, y0[1] - wf.dir[1] * .45, null, .06) : goal, pth = findPath(y0, g2, .05, ext) || [y0, g2], cc = curve(pth), cl = cc.getLength(), cu = [soldier(a), cart(a), soldier(a)]; for (let k2 = 0; k2 < 3; k2++) mesh(box(.016, .014, .016), mat(C.gold, { metalness: .7, roughness: .3 }), [-.012 + k2 * .012, .066 + (k2 === 1 ? .012 : 0), 0], null, cu[1]); carry = { cu, cc, cl }; }
        if (carry) { const q = ease(seg(lt, T.res[0] + .3, T.end - .1)); placeColumn(carry.cu, carry.cc, carry.cl, lerp(.16, Math.max(.17, carry.cl), q), q > 0 && q < 1, lt); }
        if (result === 'loot' && lt > T.res[0] && !looted) { looted = true; W.emit('sfx', { k: 'loot', at: 0 }); for (let i = 0; i < 14; i++) puff(I.x + (rnd() - .5) * .25, groundY(I.x, I.z) + .15, I.z + (rnd() - .5) * .2, t + i * .05, { col: '#ffd24a', size: .07, life: .7, vy: .3, spread: .5, additive: true, op: 1 }); }
        if (lt > T.clash[0] - .15 && !camMoved) { camMoved = true; W.shake(.008, .35); camTo(sideView(focus.clone().lerp(V(I.x, focus.y, I.z), .3), dir, 2.4, 2.2), FIRE ? 1.0 : 1.4); }
        if (taken && lt > T.res[0] + .9 && !W._top) { W._top = true; const c0p = camNow.pos.clone(), c0l = camNow.look.clone(), lk = c0l.clone().lerp(V(I.x, groundY(I.x, I.z), I.z), .35); camTo({ pos: c0p.clone().add(V(0, .9 * K, 0)).lerp(lk, .08), look: lk }, 1.8); } // ارتفاع هادئ فوق المعركة نفسها ليُرى سريان اللون
        return lt >= T.end || W.skipping; });
      // التنظيف: الجيش يتلاشى بعيدًا عن الكاميرا
      W._top = false; units.forEach(disposeUnit); defs.forEach(disposeUnit); if (stone) scene.remove(stone); if (shadow) scene.remove(shadow); chunks.forEach(c => scene.remove(c.m)); if (shot && shot.fort && e.wallsBroken !== false) setFort(r, false); if (ship) scene.remove(ship); ladders.forEach(l => scene.remove(l)); arrows.forEach(ar => scene.remove(ar.m)); if (carry) carry.cu.forEach(disposeUnit);
      if (taken && W.owner[r] !== a) { if (oldFlag && flags.includes(oldFlag)) dropFlag(oldFlag); I.flag = null; setFort(r, false); setGar(r, null, null); placeFlag(r, a, 1); W.owner[r] = a; I.owner = a; setTint(r); buildBorders(); makeLabel(tgt); }
      if (result === 'garrisonFell') setGar(r, null, null);
      SPa.free(); if (flagNew) flagNew.lift = 1;
      camTo(overview(), 1.6); labelsOpacity(1); await wait(1.4); sceneDone(); W.busy = false;
    };
    const wait = sec => new Promise(res => { const t0 = W.time; actors.push({ fn: t => t - t0 >= sec || W.skipping, res }); });

    // مشهد الاحتلال: قافلة مستوطنين تصل وتغرس الراية والأرض تتلوّن
    W.occupy = async ({ team, r, from, wide }) => {
      W.busy = true; const SPo = spreadSlot(); const tgt = M.regions[r], I = R[r];
      const fromId = from != null ? from : (tgt.nb.find(j => W.owner[j] === team) ?? M.caps[team]);
      const cross = crossing(fromId, r), [fx, fz] = at(M.regions[fromId]), goal = (() => { const [sx, sz] = I.flagSpot, gx = I.yard[0] + .06 - sx, gz = I.yard[1] + .08 - sz, gd = Math.hypot(gx, gz) || 1, m = Math.max(.17, gd); return [sx + gx / gd * m, sz + gz / gd * m]; })(); // القافلة تقف بجانب موضع الراية لا فوقه
      const dir0 = [cross[0] - fx, cross[1] - fz], dl = Math.hypot(...dir0) || 1, dir = [dir0[0] / dl, dir0[1] / dl];
      const nav = !tgt.nb.some(j => (M.regions[j].land || 0) === (tgt.land || 0) && W.owner[j] === team) ? navalPlan(team, null, r) : null;
      const start = nav ? nav.shore : muster(cross, dir, .5, fromId);
      const fx0 = [{ k: 'راية', x: I.flagSpot[0], z: I.flagSpot[1], r: .07 }], p1 = findPath(start, goal, .085, fx0) || findPath(start, goal, .06, fx0) || findPath(start, goal, .06) || [start, goal]; // موضع الراية الجديدة محجوز قبل غرسها // خلوص يكفي صف المستوطنين بحجمهم الجديد
      const crv = curve(p1), len = crv.getLength();
      const units = [soldier(team), cart(team), soldier(team)]; const colLen = .2;
      const o2 = nav ? nav.t1 - .2 : 0, wd = clamp((len - (nav ? 0 : colLen)) / SPEED.cart, 1.6, 3.6), we = .8 + o2 + wd, tw = W.time, T = { walk: [.8 + o2, we], plant: [we, we + 1], spread: [we + .8, we + 2.6], end: we + 3.6 };
      let ship = null; if (nav) { ship = warship(team, 2); const p0 = nav.route.getPointAt(0); ship.position.set(p0.x, .02, p0.z); if (!wide) shipCam(ship, nav); W.emit('sfx', { k: 'sail', at: nav.t0, dur: nav.t1 - nav.t0 }); }
      if (!wide) { labelsOpacity(0, r); if (nav) { /* الكاميرا تتابع السفينة: تُضبط بعد إنشائها */ } else { const pts = [...Array(13).keys()].map(i => { const p = crv.getPointAt(i / 12); return V(p.x, groundY(p.x, p.z), p.z); }); camTo(sideView(V(goal[0], groundY(...goal), goal[1]).lerp(V(cross[0], 0, cross[1]), .4), dir, 2.6, 2.6, pts), 1.2); } } W.emit('sfx', { k: 'settle', at: T.walk[0] }); W.emit('sfx', { k: 'raise', at: T.plant[0] + .2 });
      const f = placeFlag(r, team, 0); f.pole = .001;
      let navCam = false; await run(t => { const lt = t - tw, k = glide(seg(lt, ...T.walk)); placeColumn(units, crv, len, lerp(nav ? 0 : colLen + .01, len - .04, k), k > 0 && k < 1, lt, false, !!nav);
        if (ship) { sailShip(ship, nav, lt, t); ship.userData.crew.forEach((m, i) => { m.visible = lt < T.walk[0] + .1 + i * .25; }); if (!wide && lt > nav.t1 - .7 && !navCam) { navCam = true; camTo(sideView(V(goal[0], groundY(...goal), goal[1]).lerp(V(cross[0], 0, cross[1]), .4), dir, 2.6, 2.6), 1.2); } }
        f.pole = ease(seg(lt, T.plant[0], T.plant[0] + .5)); f.lift = ease(seg(lt, T.plant[0] + .3, T.plant[1]));
        const sp = ease(seg(lt, ...T.spread)); SPo.set(r, I.flagSpot[0], I.flagSpot[1], '#ffffff', 0, TEAMS[team].color, sp < 1 ? sp * 2.2 : 0);
        if (sp >= 1 && W.owner[r] !== team) { W.owner[r] = team; I.owner = team; setTint(r); buildBorders(); makeLabel(tgt); }
        return lt >= T.end || W.skipping; });
      units.forEach(disposeUnit); if (ship) scene.remove(ship); f.pole = 1; f.lift = 1; SPo.free(); if (W.owner[r] !== team) { W.owner[r] = team; I.owner = team; setTint(r); buildBorders(); makeLabel(tgt); }
      if (!wide) { camTo(overview(), 1.4); labelsOpacity(1); await wait(1.2); } else makeLabel(tgt); sceneDone(); W.busy = false;
    };
    // البناء: سور يرتفع حجرًا حجرًا، أو برج مراقبة، أو حامية تصل
    async function buildScene(r, kind, team, wide) { W.busy = true; const I = R[r], [x, z] = I.yard, focus = V(x, groundY(x, z), z), tw = W.time;
      if (!wide) { labelsOpacity(0); camTo(nearView(focus), 1.2); }
      let g = null, units = []; const T = { up: [1.2, 4.2], end: 5.4 };
      let scf = null; if (kind === 'walls' || kind === 'tower') { scf = kind === 'walls' ? scaffold(x, z, .19, .17, .06) : scaffold(x + .07, z - .05, .05, .05, .22); }
      if (kind === 'walls') { setFort(r, true); g = I.fort; g.scale.y = .001; W.emit('sfx', { k: 'build', at: T.up[0] }); for (let i = 0; i < 10; i++) { const a = rnd() * 6.28; puff(x + Math.cos(a) * .15, groundY(x, z) + .03, z + Math.sin(a) * .13, tw + T.up[0] + rnd() * 2.6, { col: '#cfc6b0', size: .14, life: 1, op: .6 }); } }
      else if (kind === 'tower') { setTower(r, true); g = I.tower; g.scale.y = .001; W.emit('sfx', { k: 'build', at: T.up[0] }); }
      else { const list = garGroup(r, team, kind === 'garCav' ? 'cav' : 'inf'); units = list; const tgts = list.map(u => [u.position.x, u.position.z]); const crv = list.map((u, i) => curve([[x + .55 + i * .05, z + .3], [x + .2, z + .15], tgts[i]])); W.emit('sfx', { k: kind === 'garCav' ? 'gallop' : 'march', at: .8, dur: 2.6 });
        await run(t => { const lt = t - tw, k = ease(seg(lt, .8, 3.6)); list.forEach((u, i) => { const p = crv[i].getPointAt(k), tg = crv[i].getTangentAt(Math.min(.999, k)); u.position.set(p.x, groundY(p.x, p.z), p.z); u.rotation.y = Math.atan2(tg.x, tg.z); animUnit(u, lt, k < 1, i, false); }); return lt >= T.end || W.skipping; });
        I.gar.forEach(disposeUnit); I.gar = list; I.garKey = team + (kind === 'garCav' ? 'cav' : 'inf'); }
      if (g) await run(t => { const lt = t - tw; g.scale.y = Math.max(.001, ease(seg(lt, ...T.up))); if (scf) { scf.scale.y = Math.max(.001, ease(seg(lt, .6, 1.2)) * (1 - ease(seg(lt, T.up[1] + .1, T.up[1] + .8)))); scf.visible = scf.scale.y > .01; }
        if (kind === 'walls' && lt > T.up[0] && lt < T.up[1] && Math.random() < .25) { const a2 = Math.random() * 6.283; puff(x + Math.cos(a2) * .15, groundY(x, z) + .02 + g.scale.y * .06, z + Math.sin(a2) * .13, t, { col: '#bfb6a0', size: .05, life: .5, vy: .04, op: .8 }); }
        return lt >= T.end || W.skipping; });
      if (scf) scene.remove(scf);
      if (g) g.scale.y = 1; if (!wide) { camTo(overview(), 1.4); labelsOpacity(1); await wait(1.2); } sceneDone(); W.busy = false; }
    W.build = e => buildScene(e.r, e.k, e.team, e.wide);
    // أحداث هادئة متزامنة (احتلال/بناء) تُعرض معًا على الخريطة كاملة لتبقى الجولة سريعة
    W.batch = async (list) => { camTo(overview(), 1); await Promise.all(list.map(e => e.k === 'occupy' ? W.occupy({ ...e, wide: true }) : e.k === 'capital' ? W.capital({ ...e, wide: true }) : W.build({ ...e, wide: true }))); };
    // تطوير العاصمة: بيوت جديدة تنمو واحدًا بعد الآخر
    W.capital = async ({ team, level, wide }) => { W.busy = true; const id = M.caps[team], I = R[id], focus = V(I.x, groundY(I.x, I.z), I.z), tw = W.time;
      if (!wide) { labelsOpacity(0); camTo(nearView(focus, 2.6, 2.2), 1.2); } const made = setCapLevel(team, level, true); W.emit('sfx', { k: 'build', at: 1.2 });
      await run(t => { const lt = t - tw; made.forEach((h, i) => { const k = ease(seg(lt, 1.2 + i * .5, 2.2 + i * .5)); h.scale.setScalar(Math.max(.001, k)); }); return lt >= 2.6 + made.length * .5 || W.skipping; });
      made.forEach(h => h.scale.setScalar(1)); if (!wide) { camTo(overview(), 1.4); labelsOpacity(1); await wait(1.2); } sceneDone(); W.busy = false; };
    // طريق بري طويل عبر الأقاليم: أقصر سلسلة أقاليم، ثم مسار خالٍ بين كل عبورين
    function landRoute(fromId, toId) { const L = M.regions[fromId].land || 0, prev = { [fromId]: -1 }, q = [fromId]; while (q.length) { const x = q.shift(); if (x === toId) break; M.regions[x].nb.forEach(y => { if (prev[y] === undefined && (M.regions[y].land || 0) === L) { prev[y] = x; q.push(y); } }); }
      if (prev[toId] === undefined) return null; const chain = []; for (let x = toId; x !== -1; x = prev[x]) chain.unshift(x);
      const wp = [R[fromId].yard]; for (let i = 0; i + 1 < chain.length; i++) wp.push(crossing(chain[i], chain[i + 1])); wp.push(R[toId].yard);
      const gate = (id, toward) => { const t2 = M.regions[id].type; if (t2 !== 'capital' && t2 !== 'castle') return null; const wf = wallFront(id, toward); return wf ? wf.p : null; }; if (wp.length > 2) { const g0 = gate(fromId, wp[1]), g1 = gate(toId, wp[wp.length - 2]); if (g0) wp[0] = g0; if (g1) wp[wp.length - 1] = g1; }
      let out = []; for (let i = 0; i + 1 < wp.length; i++) { const seg2 = findPath(wp[i], wp[i + 1], .09) || findPath(wp[i], wp[i + 1], .06) || [wp[i], wp[i + 1]]; out = out.concat(i ? seg2.slice(1) : seg2); } return out; }
    // لقطة تجمع عاصمتين في الإطار (للتحالف ونقضه)
    function pairView(a, b) { const A = R[M.caps[a]], B = R[M.caps[b]]; if (!A || !B) return overview(); const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2, sep = Math.hypot(A.x - B.x, A.z - B.z), d = Math.max(2.8, sep * 1.6 + 1.4), asp = camera.aspect || 1.6, k = asp < 1 ? 1.6 / asp : 1;
      return { pos: V(mx - .2, d * .95 * k, mz + d * .8 * k), look: V(mx, .3, mz - .35) }; }
    // الحصاد: من كل فريق عربة صغيرة تحمل موارد أقرب أرض له إلى عاصمته
    const RESC = { food: '#e3c45c', gold: C.gold, stone: '#b9b4a6' }, typeRes = { farm: 'food', mine: 'gold', quarry: 'stone', village: 'food', port: 'gold', rich: 'gold' };
    W.harvest = async () => { if (W.busy) return; W.busy = true; const tw = W.time, conv = []; { const o = overview(); camTo({ pos: o.look.clone().lerp(o.pos, .78), look: o.look.clone() }, 1); }
      TEAMS.forEach((T0, t) => { const cap = M.caps[t]; if (cap == null || W.owner[cap] !== t) return; const C0 = R[cap];
        const mine = M.regions.filter(q => W.owner[q.id] === t && q.id !== cap && q.type !== 'castle' && (q.land || 0) === (M.regions[cap].land || 0) && R[q.id].yard).sort((x, y) => Math.hypot(R[x.id].x - C0.x, R[x.id].z - C0.z) - Math.hypot(R[y.id].x - C0.x, R[y.id].z - C0.z));
        const src = mine[0]; if (!src) return; const pth = findPath(R[src.id].yard, C0.yard, .06); if (!pth) return; const crv = curve(pth), len = crv.getLength(); if (len < .35) return;
        const u = [soldier(t), cart(t)]; u.forEach(m => m.scale.setScalar(UNIT_S * 2.1)); mesh(box(.04, .016, .04), mat(RESC[typeRes[src.type]] || C.gold, { flatShading: false }), [0, .068, 0], null, u[1]); conv.push({ u, crv, len, done: false, end: C0 }); });
      await run(t => { const lt = t - tw, k = ease(seg(lt, .3, 3.3)); conv.forEach(c => { placeColumn(c.u, c.crv, c.len, lerp(.22, c.len - .06, k), k > 0 && k < 1, lt); if (k > 0 && k < 1 && Math.random() < .2) { const cp = c.u[1].position; puff(cp.x, cp.y + .1, cp.z, t, { col: '#ffe08a', size: .05, life: .7, vy: .08, spread: .05, additive: true, op: .8 }); }
          if (k >= 1 && !c.done) { c.done = true; for (let i = 0; i < 8; i++) puff(c.end.yard[0] + (rnd() - .5) * .1, groundY(...c.end.yard) + .08, c.end.yard[1] + (rnd() - .5) * .1, t + i * .04, { col: '#ffd24a', size: .05, life: .6, vy: .25, spread: .3, additive: true, op: 1 }); } });
        return lt >= 3.9 || W.skipping; });
      conv.forEach(c => c.u.forEach(disposeUnit)); camTo(overview(), .8); sceneDone(); W.busy = false; };
    // التحالف: خيط ذهبي يمتد بين العاصمتين؛ والنقض: الخيط ينقطع
    W.ally = async ({ a, b }) => { W.busy = true; const k = threadKey(a, b); if (!threads[k]) threads[k] = makeThread(a, b); const th = threads[k], tw = W.time; th.mesh.geometry.setDrawRange(0, 0); camTo(pairView(a, b), 1.2);
      // رسول على حصان يحمل الراية من عاصمة إلى عاصمة، ثم يمتد خيط الحلف
      const A = R[M.caps[a]], B = R[M.caps[b]], pth = A && B ? landRoute(M.caps[a], M.caps[b]) : null; let msg = null, crv = null, len = 0; if (pth) { crv = curve(pth); len = crv.getLength(); msg = rider(a, 0, true); }
      const ride = msg ? clamp(len / 1.0, 1.6, 3.0) : 0; if (msg) W.emit('sfx', { k: 'gallop', at: .3, dur: ride }); W.emit('sfx', { k: 'ally', at: .3 + ride });
      await run(t => { const lt = t - tw; if (msg) { const q = ease(seg(lt, .3, .3 + ride)); placeColumn([msg], crv, len, lerp(.02, len - .02, q), q > 0 && q < 1, lt); msg.visible = lt < .6 + ride; }
        const q2 = ease(seg(lt, .3 + ride, 1.9 + ride)); th.mesh.geometry.setDrawRange(0, Math.floor(th.total * q2 / 3) * 3); return lt >= 2.4 + ride || W.skipping; });
      if (msg) disposeUnit(msg); th.mesh.geometry.setDrawRange(0, th.total); camTo(overview(), 1.2); sceneDone(); W.busy = false; };
    W.unally = async ({ a, b, betray }) => { W.busy = true; const k = threadKey(a, b), th = threads[k]; if (!th) { W.busy = false; return; } const tw = W.time; camTo(pairView(a, b), 1); W.emit('sfx', { k: betray ? 'betray' : 'unally', at: betray ? .55 : .2 });
      let half = null; if (betray) { th.mesh.material.color.set('#e0483c'); th.mesh.material.emissive.set('#e0483c'); half = new THREE.Mesh(th.mesh.geometry.clone(), th.mesh.material.clone()); scene.add(half); th.split = Math.floor(th.total / 6) * 3; th.mp = th.crv.getPointAt(.5); }
      await run(t => { const lt = t - tw;
        if (betray) { const snap = lt > .55, gap = snap ? Math.floor(ease(seg(lt, .55, 1.1)) * th.total * .08 / 3) * 3 : 0; th.mesh.geometry.setDrawRange(0, Math.max(0, th.split - gap)); half.geometry.setDrawRange(th.split + gap, Math.max(0, th.total - th.split - gap));
          if (snap && !th.sparked) { th.sparked = true; for (let i = 0; i < 16; i++) puff(th.mp.x, th.mp.y, th.mp.z, t + i * .02, { col: '#ff6a4a', size: .06, life: .6, vy: -.3, spread: .8, additive: true, op: 1 }); }
          const f = ease(seg(lt, 1.0, 2.6)); th.mesh.position.y = half.position.y = -f * .5; th.mesh.material.opacity = half.material.opacity = .9 * (1 - f); }
        else { const q = ease(seg(lt, .4, 2.2)); th.mesh.material.opacity = .9 * (1 - q); th.mesh.position.y = -q * .3; }
        return lt >= (betray ? 3.0 : 2.6) || W.skipping; });
      scene.remove(th.mesh); if (half) scene.remove(half); delete threads[k]; camTo(overview(), 1); sceneDone(); W.busy = false; };
    // المرحلة: تحليق الكاميرا وتبدّل الجو
    W.phase = async ({ key, hold = 0 }) => { W.busy = true; setSky(key, 5); const tw = W.time, o = overview();
      camTo({ pos: o.pos.clone().multiplyScalar(.82).add(V(4, 0, 0)), look: o.look.clone() }, 2.4); await run(t => t - tw >= 2.6 || W.skipping); camTo(o, 2.2); await run(t => t - tw >= Math.max(4.8, hold) || W.skipping); sceneDone(); W.busy = false; }; // hold: وقت قراءة ما انفتح
    W.setSky = (key, d = 0) => setSky(key, d);
    W.focusRegion = (r, d = 1.2) => { const I = R[r]; const f = V(I.x, groundY(I.x, I.z), I.z); camTo(nearView(f, 4.6, 3.2), d); };
    W.overview = (d = 1.4) => { W.faceoffEnd(); camTo(overview(), d); };
    // لحظة الترقب أثناء سؤال المواجهة: الجيشان متقابلان على الحد، والكاميرا تدور حولهما ببطء
    W.fo = null;
    W.faceoff = (e) => { if (W.busy || man.on || !e || e.r == null) return; const fk = [e.a, e.r, e.unit || 'inf', e.ally].join(':'); if (W.fo && W.fo.key === fk) return; W.faceoffEnd();
      let g; try { g = geom(e); } catch (er) { return; } if (g.nav) { g.units.forEach(disposeUnit); g.defs.forEach(disposeUnit); camTo(nearView(V(...at(M.regions[e.r]).flatMap((v, i) => i ? [0, v] : [v]))), 1.6); return; }
      placeColumn(g.units, g.crv, g.len, g.s0, false, W.time); const fo = { key: fk, g }; W.fo = fo; labelsOpacity(0);
      const focus = V(g.cross[0], groundY(...g.cross), g.cross[1]).lerp(g.units[Math.min(2, g.units.length - 1)].position.clone(), .35), t0 = W.time, base = Math.atan2(g.dir[0], -g.dir[1]) - .5;
      const pose = () => { const az = base + (W.time - t0) * .085, R0 = 2.0 * SZ.unit, p = V(focus.x + Math.cos(az) * R0, 0, focus.z + Math.sin(az) * R0); p.y = Math.max(focus.y + 1.15 * SZ.unit, groundY(p.x, p.z) + .4); return { pos: p, look: focus.clone().add(V(0, .05, 0)) }; };
      camTo(pose(), 1.8); camFollow(pose);
      actors.push({ fn: t => { if (W.fo !== fo) return true; g.units.forEach((u, i) => animUnit(u, t, false, i, false)); g.defs.forEach((u, i) => animUnit(u, t, false, i + 20, false)); return false; }, res: () => { } }); };
    W.faceoffEnd = () => { const fo = W.fo; if (!fo) return; W.fo = null; if (!fo.keep) { fo.g.units.forEach(disposeUnit); fo.g.defs.forEach(disposeUnit); } labelsOpacity(1); };
    // بين الأحداث: الكاميرا تنساب ببطء فوق أسخن جبهة (حيث تتلامس أراضي الفرق)، والأسماء ظاهرة
    function hotFront() { const pts = []; M.regions.forEach(r => r.nb.forEach(j => { if (j > r.id && W.owner[r.id] != null && W.owner[j] != null && W.owner[r.id] !== W.owner[j]) { const a2 = at(r), b2 = at(M.regions[j]); pts.push([(a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2]); } }));
      if (!pts.length) return null; let best = null, bs = -1; pts.forEach(p => { const sc = pts.filter(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1.6 * K).length; if (sc > bs) { bs = sc; best = p; } });
      const near = pts.filter(q => Math.hypot(q[0] - best[0], q[1] - best[1]) < 1.6 * K); return [near.reduce((s2, q) => s2 + q[0], 0) / near.length, near.reduce((s2, q) => s2 + q[1], 0) / near.length]; }
    W.idle = () => { if (W.busy || man.on) return; W.faceoffEnd(); const f = hotFront(); if (!f) { camTo(overview(), 1.6); return; } const o = overview(), D0 = o.pos.distanceTo(o.look), el = Math.asin((o.pos.y - o.look.y) / D0), t0 = W.time, dist = D0 * .52;
      const pose = () => { const tt = W.time - t0, az = Math.sin(tt * .045) * .3, look = V(f[0] + Math.sin(tt * .035) * .5 * K, 0, f[1]); return { pos: V(look.x + Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, look.z + Math.cos(az) * Math.cos(el) * dist), look }; };
      camTo(pose(), 2.6); camFollow(pose); };
    // معلومات القلعة فوقها: صاحبها وجولات أمانه
    W._dbg = { sizes: () => { const B = new THREE.Box3(), h = o => { B.setFromObject(o); const v = new THREE.Vector3(); B.getSize(v); return [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]; }; const tmp = new THREE.Group(); const sd = soldier(0), rd = rider(0); house(0, 0, 1, C.roof, 0, tmp); const out = { soldier: h(sd), rider: h(rd), house: h(tmp), UNIT_S, SZ }; const ids = Object.keys(R); const fid = ids.find(i => R[i].fort), tid = ids.find(i => R[i].tower); if (fid) out.fort = h(R[fid].fort); if (tid) out.tower = h(R[tid].tower); const tr = TREES.filter(t => t.s > .5).slice(0, 3).map(t => t.t); out.tree = tr; return out; }, trees: () => TREES, flags: () => flags, terrBlock, groundY, cam: () => cam, lift: () => terrLift, landRoute: (a, b) => landRoute(a, b), crossing: (a, b) => crossing(a, b), findPath: (a, b, c) => findPath(a, b, c), blockers: () => blockers() };
    W.setCastle = (info) => { const k = JSON.stringify(info || {}); if (k === W._ck) return; W._ck = k; W.castleInfo = info || {}; const c = M.regions.find(x => x.type === 'castle'); if (c) makeLabel(c); };

    // ---------- الإطار ----------
    W.time = 0; let last = null; W.listeners = {};
    W.on = (k, f) => { (W.listeners[k] = W.listeners[k] || []).push(f); }; W.emit = (k, v) => (W.listeners[k] || []).forEach(f => { try { f(v); } catch (e) { } });
    // السرعة تتغير بنعومة (لا قفزة)، والتخطي ×10 بطلب المشرف فقط، و«snap» ينهي المشهد فورًا بلا تسارع مرئي (عند العودة من تبويب مخفي)
    W.speedNow = 1; W.snap = () => { if (actors.length) { W.skipping = true; W.snapping = true; } };
    // لحظة الحسم بطيئة قليلًا (تبطيء ناعم يدخل ويخرج)، ولا تبطيء أثناء التخطي
    // فحص آلي: هل يحجب جبلٌ أو تلٌّ الجنودَ الظاهرين في اللقطة؟ (طلب المستخدم: لا جبل يغطي المعركة، ولا جنود يختفون فيه)
    let occN = 0; const _v = new THREE.Vector3();
    function occAudit() { camera.updateMatrixWorld(); const cp = camera.position; let on = 0, bl = 0;
      scene.children.forEach(o => { const k = o.userData && o.userData.kind; if (!k || o.visible === false) return; _v.set(o.position.x, o.position.y + .05, o.position.z).project(camera); if (Math.abs(_v.x) > .95 || Math.abs(_v.y) > .95 || _v.z > 1) return; on++;
        const tx = o.position.x, ty = o.position.y + .05, tz = o.position.z, L = Math.hypot(cp.x - tx, cp.z - tz), n = Math.max(6, Math.ceil(L / .05));
        for (let i = 1; i < n; i++) { const q = i / n, x = lerp(tx, cp.x, q), z = lerp(tz, cp.z, q), y = lerp(ty, cp.y, q); if (q > .04 && groundY(x, z) > y + .005) { bl++; break; } } });
      if (on >= 3 && bl / on > .3 && !W._occDbg) { W._occDbg = scene.children.filter(o => o.userData && o.userData.kind && o.visible !== false).map(o => { const tx = o.position.x, ty = o.position.y + .05, tz = o.position.z, L = Math.hypot(cp.x - tx, cp.z - tz), n = Math.max(6, Math.ceil(L / .05)); let worst = null; for (let i = 1; i < n; i++) { const q = i / n, x = lerp(tx, cp.x, q), z = lerp(tz, cp.z, q), y = lerp(ty, cp.y, q), d = groundY(x, z) - y; if (q > .04 && (!worst || d > worst[0])) worst = [+d.toFixed(3), +q.toFixed(2), +x.toFixed(2), +z.toFixed(2), +groundY(x, z).toFixed(2)]; } return [o.userData.kind, +tx.toFixed(2), +o.position.y.toFixed(3), +tz.toFixed(2), worst]; }).concat([['cam', cp.x, cp.y, cp.z, cam.to && cam.to.pos ? [cam.to.pos.x, cam.to.pos.y, cam.to.pos.z] : null]]); }
      if (on >= 3 && bl / on > .3) W.hits.push(['حجب جبل', +(bl / on).toFixed(2), on, +W.time.toFixed(1), +terrLift.toFixed(2), man.on ? 'man' : cam.follow ? 'f' : 'to', [cp.x, cp.y, cp.z].map(v => +v.toFixed(2))]); }
    W.slowUntil = -1; W.slowK = 1; let shakeA = 0, shakeT0 = 0, shakeD = 0;
    W.shake = (amp, dur) => { if (W.skipping || W.snapping) return; shakeA = amp; shakeT0 = W.time; shakeD = dur; };
    W.step = (dt, draw = true) => { const rdt = dt; if (W.paused) dt = 0; W.speedNow += ((W.speed || 1) - W.speedNow) * Math.min(1, dt * 2.5);
      W.slowK += ((W.time < W.slowUntil && !W.skipping ? .38 : 1) - W.slowK) * Math.min(1, rdt * 7); dt *= W.slowK;
      if (W.snapping) { let n = 0; while (actors.length && n++ < 400) { W.time += .1; for (let i = actors.length - 1; i >= 0; i--) { const a = actors[i]; let done = false; try { done = a.fn(W.time); } catch (e) { done = true; } if (done) { actors.splice(i, 1); a.res(); } } } W.snapping = false; }
      W.time += dt * (W.skipping ? 10 : W.speedNow); U.uTime.value = W.time;
      for (let i = actors.length - 1; i >= 0; i--) { const a = actors[i]; let done = false; try { done = a.fn(W.time); } catch (e) { console.error(e); done = true; } if (done) { actors.splice(i, 1); a.res(); } }
      if (W.audit && actors.length && !W.skipping && (++occN % 5 === 0)) occAudit();
      updatePuffs(W.time); if (draw) { waveFlags(W.time); updateSky(); updateCam(rdt); declutter(rdt); renderer.render(scene, camera); } else { updateSky(); updateCam(rdt); camera.updateMatrixWorld(); } };
    W.resize = (w, h) => { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); if (!actors.length) { const o = overview(); camNow.pos.copy(o.pos); camNow.look.copy(o.look); camVel.pos.set(0, 0, 0); camVel.look.set(0, 0, 0); cam = { from: o, to: o, t0: 0, d: .01 }; } };
    // جودة تلقائية: إن هبط الأداء عن ~42 إطارًا في الثانية تُخفَّض الدقة ثم الظلال خطوة خطوة، بلا قفزات ظاهرة
    W.quality = 0; let fAcc = 0, fN = 0;
    W.degrade = () => { if (W.quality >= 3) return; W.quality++; const q = W.quality, el = renderer.domElement;
      if (q === 1) renderer.setPixelRatio(Math.min(1, renderer.getPixelRatio()));
      if (q === 2) { if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } sun.shadow.mapSize.set(1024, 1024); }
      if (q === 3) renderer.setPixelRatio(.8);
      W.resize(el.clientWidth || innerWidth, el.clientHeight || innerHeight); };
    W.start = () => { W.running = true; const loop = now => { if (!W.running) return; const dt = last == null ? 0 : Math.min(.05, (now - last) / 1000); last = now; W.step(dt);
        if (!document.hidden && dt > 0) { fAcc += dt; fN++; if (fAcc > 3) { const fps = fN / fAcc; W.fps = fps; fAcc = 0; fN = 0; if (fps < 42) W.degrade(); } }
        requestAnimationFrame(loop); }; requestAnimationFrame(loop); };
    // إغلاق نظيف (خريطة الطالب تُفتح وتُغلق مرارًا): إيقاف الحلقة وتحرير الهندسة والخامات وسياق الرسم
    W.dispose = () => { W.running = false; try { scene.traverse(o => { if (o.geometry) o.geometry.dispose(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => { if (x.map) x.map.dispose(); x.dispose(); }); }); renderer.dispose(); if (renderer.forceContextLoss) renderer.forceContextLoss(); } catch (e) { } };
    W.renderer = renderer; W.scene = scene; W.camera = camera;
    W.stats = () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles });
    W.fontsReady = async () => { try { await Promise.all(['900 40px TDisplay', '700 30px TDisplay', '700 26px TSans', '500 16px TSans'].map(f => document.fonts.load(f))); } catch (e) { } Object.keys(flagTexs).forEach(k => delete flagTexs[k]); flags.forEach(f => { f.cloth.material.map = ftex(f.o); f.cloth.material.needsUpdate = true; }); M.regions.forEach(makeLabel); };
    // فحص التداخل للمجسّمات الثابتة (يُستعمل في الاختبار)
    W.layout = () => { const L = OBST.filter(o => !o.soft && o.k !== 'سور' && o.k !== 'ساحة'), bad = [];
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const a = L[i], b = L[j]; if (a.k === b.k && (a.k === 'حقل' || a.k === 'صخرة' || a.k === 'برج')) continue; const dd = Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r; if (dd < 0) bad.push([a.k, b.k, +dd.toFixed(3)]); }
      return { n: bad.length, first: bad.slice(0, 8), houses: L.filter(o => o.k === 'بيت').length }; };
    W.hits = []; W.R = R; W.findPath = findPath; W.navalPlan = navalPlan; W.onLand = onLand; W.seaRoute = seaRoute; W.regionAtW = regionAtW; W.coastDist = coastDist; W.OBST = OBST; W.TREES = TREES; W.groundY = groundY; W.at = at;
    W.resize(canvas.clientWidth || 1280, canvas.clientHeight || 720);
    // البداية: أصحاب العواصم
    M.regions.forEach(r => makeLabel(r));
    buildBorders();
    return W;
  }
  G.RayatWorld = World;
})(typeof window !== 'undefined' ? window : globalThis);
