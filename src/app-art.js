/* ===== فن الجزيرة: تضاريس وشواطئ وطرق وأشجار وقرى ومبانٍ بمنظور متساوي القياس (SVG خفيف) ===== */
const ISO_A = 78;          // نصف عرض بلاطة البناء
const VSC = 1.15;          // تكبير القرية على الجزيرة
const SLOT = { library: [0, 0], market: [1, 0], castle: [2, 0], house: [0, 1], workshop: [1, 1], farm: [2, 1] };
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shade(hex, k) { if (hex.length === 4) hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]; const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255; const f = v => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k))); return '#' + [f(r), f(g), f(b)].map(v => v.toString(16).padStart(2, '0')).join(''); }
const f1 = v => (+v).toFixed(1);
const pts = a => a.map(p => f1(p[0]) + ',' + f1(p[1])).join(' ');
const poly = (a, fill, extra = '') => `<polygon points="${pts(a)}" fill="${fill}" ${extra}/>`;
function isoBox(x, y, s, h, c, o = {}) {
  const L = [x - s, y], F = [x, y + s / 2], R = [x + s, y], K = [x, y - s / 2];
  const up = p => [p[0], p[1] - h], ln = 'stroke="rgba(0,0,0,.22)" stroke-width="1"';
  let g = poly([L, F, up(F), up(L)], shade(c, -.08), ln) + poly([F, R, up(R), up(F)], shade(c, -.3), ln);
  if (!o.noTop) g += poly([up(L), up(F), up(R), up(K)], o.top || shade(c, .14), ln);
  return g;
}
const faceL = (x, y, s, u, v) => [x - s + s * u, y + (s / 2) * u - v];
const faceR = (x, y, s, u, v) => [x + s * u, y + s / 2 - (s / 2) * u - v];
const quadL = (x, y, s, u0, u1, v0, v1, fill) => poly([faceL(x, y, s, u0, v0), faceL(x, y, s, u1, v0), faceL(x, y, s, u1, v1), faceL(x, y, s, u0, v1)], fill);
const quadR = (x, y, s, u0, u1, v0, v1, fill) => poly([faceR(x, y, s, u0, v0), faceR(x, y, s, u1, v0), faceR(x, y, s, u1, v1), faceR(x, y, s, u0, v1)], fill);
// سقف جملوني متساوي القياس (أجمل من الهرم)
function gable(x, y, s, h, rh, c) {
  const L = [x - s, y - h], F = [x, y + s / 2 - h], R = [x + s, y - h], K = [x, y - s / 2 - h];
  const A = [x - s / 2, y - s / 4 - h - rh], B = [x + s / 2, y + s / 4 - h - rh];
  const st = 'stroke="rgba(0,0,0,.25)" stroke-width="1"';
  return poly([L, F, B, A], shade(c, .05), st) + poly([F, R, B], shade(c, -.32), st) + poly([K, R, B, A], shade(c, -.18), st) +
    `<line x1="${f1(A[0])}" y1="${f1(A[1])}" x2="${f1(B[0])}" y2="${f1(B[1])}" stroke="${shade(c, -.45)}" stroke-width="2.5"/>`;
}
function pyramid(x, y, s, h, rh, c) { const L = [x - s, y - h], F = [x, y + s / 2 - h], R = [x + s, y - h], A = [x, y - h - rh]; return poly([L, F, A], shade(c, -.02), 'stroke="rgba(0,0,0,.25)"') + poly([F, R, A], shade(c, -.28), 'stroke="rgba(0,0,0,.25)"'); }
function flag(x, y, h, c, w = 26) { return `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x)}" y2="${f1(y - h)}" stroke="#e9e4d8" stroke-width="2.5"/><circle cx="${f1(x)}" cy="${f1(y - h)}" r="2.5" fill="#f4d35e"/><polygon class="flag" points="${f1(x)},${f1(y - h + 1)} ${f1(x + w)},${f1(y - h + w * .28)} ${f1(x)},${f1(y - h + w * .56)}" fill="${c}"/>`; }
const tileDiamond = (x, y, s) => [[x - s, y], [x, y + s / 2], [x + s, y], [x, y - s / 2]];
const shadowE = (x, y, rx, ry) => `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="rgba(20,30,10,.22)"/>`;
function smoothPath(P) {
  const n = P.length; let d = `M ${f1(P[0][0])} ${f1(P[0][1])}`;
  for (let i = 0; i < n; i++) { const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n]; d += ` C ${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`; }
  return d + ' Z';
}
function blob(cx, cy, rx, ry, seed, amp = .08, n = 28) { const r = rng(seed), ph = [r() * 6, r() * 6, r() * 6]; const P = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, k = 1 + amp * (Math.sin(3 * a + ph[0]) * .6 + Math.sin(5 * a + ph[1]) * .3 + Math.sin(7 * a + ph[2]) * .2); P.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); } return smoothPath(P); }

// ---------- عناصر الطبيعة ----------
function treeRound(x, y, s = 1, hue = 0) {
  const c = ['#3f8a3a', '#4b9441', '#357a3a', '#5a9a3c'][hue % 4];
  return shadowE(x + 10 * s, y + 2, 26 * s, 9 * s) + `<rect x="${f1(x - 3.5 * s)}" y="${f1(y - 22 * s)}" width="${f1(7 * s)}" height="${f1(24 * s)}" fill="#6b4a2b"/>` +
    `<circle cx="${f1(x)}" cy="${f1(y - 36 * s)}" r="${f1(22 * s)}" fill="${shade(c, -.18)}"/><circle cx="${f1(x - 12 * s)}" cy="${f1(y - 30 * s)}" r="${f1(15 * s)}" fill="${c}"/><circle cx="${f1(x + 10 * s)}" cy="${f1(y - 44 * s)}" r="${f1(14 * s)}" fill="${shade(c, -.08)}"/><circle cx="${f1(x - 6 * s)}" cy="${f1(y - 46 * s)}" r="${f1(10 * s)}" fill="${shade(c, .22)}"/>`;
}
function treePine(x, y, s = 1) {
  let g = shadowE(x + 8 * s, y + 2, 20 * s, 7 * s) + `<rect x="${f1(x - 3 * s)}" y="${f1(y - 14 * s)}" width="${f1(6 * s)}" height="${f1(16 * s)}" fill="#5b3d22"/>`;
  [[0, 24, 26], [16, 19, 24], [30, 13, 22]].forEach(([dy, w, h]) => { const by = y - 10 * s - dy * s; g += `<polygon points="${f1(x - w * s)},${f1(by)} ${f1(x)},${f1(by - h * s)} ${f1(x)},${f1(by + 3 * s)}" fill="#2f7a46"/><polygon points="${f1(x)},${f1(by + 3 * s)} ${f1(x)},${f1(by - h * s)} ${f1(x + w * s)},${f1(by)}" fill="#245f37"/>`; });
  return g;
}
function bush(x, y, s = 1, c = '#4f9a45') { return shadowE(x + 4 * s, y + 2, 14 * s, 5 * s) + `<circle cx="${f1(x - 7 * s)}" cy="${f1(y - 6 * s)}" r="${f1(8 * s)}" fill="${shade(c, -.12)}"/><circle cx="${f1(x + 6 * s)}" cy="${f1(y - 7 * s)}" r="${f1(9 * s)}" fill="${c}"/><circle cx="${f1(x)}" cy="${f1(y - 12 * s)}" r="${f1(7 * s)}" fill="${shade(c, .18)}"/>`; }
function rock(x, y, s = 1) { return shadowE(x + 4 * s, y + 3 * s, 16 * s, 5 * s) + `<polygon points="${f1(x - 16 * s)},${f1(y + 2 * s)} ${f1(x - 9 * s)},${f1(y - 10 * s)} ${f1(x + 3 * s)},${f1(y - 14 * s)} ${f1(x + 15 * s)},${f1(y - 5 * s)} ${f1(x + 14 * s)},${f1(y + 3 * s)}" fill="#8f9396"/><polygon points="${f1(x - 9 * s)},${f1(y - 10 * s)} ${f1(x + 3 * s)},${f1(y - 14 * s)} ${f1(x + 1 * s)},${f1(y - 3 * s)} ${f1(x - 6 * s)},${f1(y)}" fill="#b4b8ba"/>`; }
function flowers(x, y, r) { let g = ''; const cs = ['#f4d35e', '#ffffff', '#e86a8a', '#b28be0']; for (let i = 0; i < 5; i++) g += `<circle cx="${f1(x + (r() - .5) * 26)}" cy="${f1(y + (r() - .5) * 10)}" r="2.6" fill="${cs[Math.floor(r() * 4)]}"/>`; return g; }
function tuft(x, y) { return `<path d="M ${f1(x - 6)} ${f1(y)} l 2 -9 M ${f1(x)} ${f1(y)} l 0 -11 M ${f1(x + 6)} ${f1(y)} l -2 -9" stroke="#3d7a35" stroke-width="2.2" stroke-linecap="round"/>`; }
function palm(x, y, i = 0) {
  const lean = (i % 2 ? 1 : -1) * 10;
  return shadowE(x + 22, y + 3, 30, 8) + `<path d="M ${x} ${y} Q ${x + lean * .4} ${y - 40} ${x + lean} ${y - 78}" stroke="#8b6239" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M ${x} ${y - 20} l ${lean * .1} -2 M ${x + lean * .2} ${y - 40} l 3 -2 M ${x + lean * .5} ${y - 58} l 3 -2" stroke="#6b4a2b" stroke-width="2"/>` +
    [-70, -30, 10, 50, 150, 200].map((a, k) => { const r = a * Math.PI / 180, px = x + lean, py = y - 78; return `<path d="M ${px} ${py} q ${f1(Math.cos(r) * 26)} ${f1(-14 + Math.sin(r) * 10)} ${f1(Math.cos(r) * 50)} ${f1(12 + Math.sin(r) * 18)}" stroke="${k % 2 ? '#2f7d32' : '#3f9a3a'}" stroke-width="8" fill="none" stroke-linecap="round"/>`; }).join('') +
    `<circle cx="${x + lean - 3}" cy="${y - 74}" r="4" fill="#6b4a2b"/><circle cx="${x + lean + 4}" cy="${y - 73}" r="4" fill="#7a5530"/>`;
}
function boat(x, y, c = '#a0522d', sail = '#f6efe0', s = 1) {
  return `<g class="bob"><ellipse cx="${x}" cy="${y + 6 * s}" rx="${44 * s}" ry="${8 * s}" fill="rgba(255,255,255,.25)"/><path d="M ${x - 38 * s} ${y - 4 * s} L ${x + 38 * s} ${y - 4 * s} L ${x + 26 * s} ${y + 8 * s} L ${x - 26 * s} ${y + 8 * s} Z" fill="${c}" stroke="${shade(c, -.4)}" stroke-width="1.5"/><line x1="${x}" y1="${y - 4 * s}" x2="${x}" y2="${y - 58 * s}" stroke="#5b3a1e" stroke-width="${2.5 * s}"/><polygon points="${x + 2 * s},${y - 56 * s} ${x + 30 * s},${y - 10 * s} ${x + 2 * s},${y - 10 * s}" fill="${sail}" stroke="rgba(0,0,0,.2)"/><polygon points="${x - 2 * s},${y - 48 * s} ${x - 22 * s},${y - 10 * s} ${x - 2 * s},${y - 10 * s}" fill="${shade(sail, -.1)}"/></g>`;
}

// ---------- المباني الستة (مستويان) — إحداثيات محلية للقرية ----------
const BUILDERS = {
  house(x, y, T, tc, lv) {
    const one = (hx, hy, s, h) => { let g = shadowE(hx + 12, hy + 6, s * 1.4, s * .5) + isoBox(hx, hy, s, h, T.wall); g += quadR(hx, hy, s, .55, .78, 0, 18, '#5b3a1e') + quadL(hx, hy, s, .3, .55, 10, 22, '#8fc3e6') + quadL(hx, hy, s, .3, .55, 10, 11.5, '#fff'); if (h > 36) g += quadL(hx, hy, s, .3, .55, h - 20, h - 9, '#ffe9a8') + quadR(hx, hy, s, .18, .4, h - 20, h - 9, '#ffe9a8'); g += gable(hx, hy, s + 3, h, 24, T.roof) + isoBox(hx + s * .45, hy - h - 6, 4.5, 16, '#8a5a3c'); return g; };
    if (lv > 1) return one(x - 14, y - 8, 28, 48) + one(x + 22, y + 12, 22, 26) + `<path d="M ${x - 40} ${y + 30} l 30 15" stroke="#8b6b3d" stroke-width="3"/>`;
    return one(x, y, 30, 30) + `<path d="M ${x - 34} ${y + 14} l 22 11 M ${x - 30} ${y + 10} l 0 6 M ${x - 20} ${y + 15} l 0 6" stroke="#8b6b3d" stroke-width="2.5"/>`;
  },
  farm(x, y, T, tc, lv) {
    const s = 60; let g = poly(tileDiamond(x, y + 4, s), '#7a5a35', 'stroke="#5e4428" stroke-width="2"');
    for (let k = -3; k <= 3; k++) { const a = faceL(x, y + 4, s, .5 + k * .13, 0), b = [a[0] + s, a[1] - s / 2]; g += `<line x1="${f1(a[0] + s * .06)}" y1="${f1(a[1] - s * .03)}" x2="${f1(b[0] - s * .06)}" y2="${f1(b[1] + s * .03)}" stroke="${lv > 1 ? '#e2c04a' : '#6fb84f'}" stroke-width="6" stroke-linecap="round"/>`; }
    // فزّاعة
    g += `<line x1="${x + 18}" y1="${y + 8}" x2="${x + 18}" y2="${y - 26}" stroke="#6b4a2b" stroke-width="3"/><line x1="${x + 6}" y1="${y - 16}" x2="${x + 30}" y2="${y - 16}" stroke="#6b4a2b" stroke-width="3"/><circle cx="${x + 18}" cy="${y - 30}" r="6" fill="#e9c27a"/><polygon points="${x + 10},${y - 34} ${x + 18},${y - 44} ${x + 26},${y - 34}" fill="#8b5a2b"/>`;
    if (lv > 1) g += shadowE(x - 18, y - 10, 30, 10) + isoBox(x - 30, y - 16, 20, 26, '#b33a2b') + gable(x - 30, y - 16, 22, 26, 16, '#5a2b22') + quadL(x - 30, y - 16, 20, .35, .7, 0, 16, '#f1e3c4') +
      `<rect x="${x - 4}" y="${y - 58}" width="16" height="46" fill="#cfd5d9" stroke="#8a9196"/><ellipse cx="${x + 4}" cy="${y - 58}" rx="8" ry="4" fill="#9aa3a8"/>`;
    return g;
  },
  market(x, y, T, tc, lv) {
    const shop = (cx, cy, s, h, c) => {
      let g = shadowE(cx + 10, cy + 6, s * 1.45, s * .5) + isoBox(cx, cy, s, h, T.wall);
      g += quadL(cx, cy, s, .12, .42, 0, 16, '#5b3a1e') + quadL(cx, cy, s, .55, .88, 6, 18, '#8fc3e6') + quadR(cx, cy, s, .3, .7, 8, 18, '#8fc3e6');
      for (let i = 0; i < 5; i++) { const u0 = i / 5, u1 = (i + 1) / 5, a0 = faceL(cx, cy, s, u0, h - 6), a1 = faceL(cx, cy, s, u1, h - 6); g += poly([a0, a1, [a1[0] - 11, a1[1] + 9], [a0[0] - 11, a0[1] + 9]], i % 2 ? '#ffffff' : c, 'stroke="rgba(0,0,0,.15)"'); }
      return g + gable(cx, cy, s + 2, h, 18, shade(c, -.25));
    };
    if (lv > 1) return shop(x - 20, y - 12, 26, 30, tc) + shop(x + 24, y + 12, 22, 24, T.accent) + `<path d="M ${x - 46} ${y - 40} Q ${x} ${y - 20} ${x + 46} ${y - 22}" stroke="#eee" fill="none" stroke-width="1.5"/>` + [0, 1, 2, 3, 4].map(i => `<circle cx="${x - 36 + i * 18}" cy="${y - 34 + (i === 2 ? 8 : i === 1 || i === 3 ? 5 : 0)}" r="3.5" fill="#ffe27a"/>`).join('') + DECO.crates(x - 46, y + 18) + DECO.barrels(x + 50, y - 6);
    return shop(x, y, 28, 28, tc) + DECO.crates(x - 34, y + 18) + `<circle cx="${x - 20}" cy="${y + 8}" r="4" fill="#e74c3c"/><circle cx="${x - 13}" cy="${y + 11}" r="4" fill="#f1c40f"/>`;
  },
  workshop(x, y, T, tc, lv) {
    const s = lv > 1 ? 40 : 32, h = lv > 1 ? 40 : 30; let g = shadowE(x + 12, y + 6, s * 1.4, s * .5) + isoBox(x, y, s, h, '#86603e', { top: '#4a3a2c' });
    g += quadR(x, y, s, .2, .62, 0, 24, '#2f241a') + quadR(x, y, s, .22, .6, 2, 20, 'rgba(255,170,80,.55)') + quadL(x, y, s, .4, .7, 14, 26, '#ffb35c');
    g += gable(x, y, s + 2, h, 16, '#5d4a3a');
    const ch = (cx, cy) => isoBox(cx, cy, 6, 24, '#777') + `<g class="smoke"><circle cx="${cx}" cy="${cy - 34}" r="7" fill="rgba(220,220,220,.7)"/><circle cx="${cx + 6}" cy="${cy - 50}" r="9" fill="rgba(220,220,220,.5)"/><circle cx="${cx + 2}" cy="${cy - 68}" r="11" fill="rgba(220,220,220,.3)"/></g>`;
    g += ch(x + 14, y - h - 10);
    g += isoBox(x + s + 8, y + 10, 8, 10, '#a3a7aa') + `<rect x="${x - s - 14}" y="${y - 6}" width="6" height="14" fill="#6b4a2b"/><rect x="${x - s - 20}" y="${y - 9}" width="18" height="4" fill="#555"/>`;
    if (lv > 1) g += ch(x - 14, y - h - 2) + `<circle cx="${x - s * .5}" cy="${y - h * .5}" r="11" fill="none" stroke="${T.accent}" stroke-width="5" stroke-dasharray="4 3" class="gear"/>`;
    return g;
  },
  library(x, y, T, tc, lv) {
    const s = lv > 1 ? 42 : 36, h = lv > 1 ? 40 : 32; let g = shadowE(x + 12, y + 6, s * 1.45, s * .5) + isoBox(x, y + 4, s + 6, 6, '#d9d2c3') + isoBox(x, y, s, h, T.wall);
    for (let i = 0; i < 4; i++) g += quadR(x, y, s, .1 + i * .22, .17 + i * .22, 0, h - 5, '#ffffff') + quadR(x, y, s, .17 + i * .22, .2 + i * .22, 0, h - 5, '#d6d6d6');
    g += quadL(x, y, s, .4, .6, 0, 18, '#5b3a1e') + quadL(x, y, s, .12, .28, 14, 24, '#8fc3e6') + quadL(x, y, s, .72, .88, 14, 24, '#8fc3e6');
    g += poly([[x - s - 4, y - h], [x, y + s / 2 - h + 2], [x + s + 4, y - h], [x, y - s / 2 - h - 2]], shade(T.wall, -.12)) + poly([[x, y + s / 2 - h + 2], [x + s + 4, y - h], [x + s * .5, y - h - 14]], shade(T.roof, -.1));
    if (lv > 1) g += `<ellipse cx="${x}" cy="${y - h - 4}" rx="${s * .55}" ry="${s * .27}" fill="${shade(T.roof, -.25)}"/><path d="M ${x - s * .55} ${y - h - 4} A ${s * .55} ${s * .62} 0 0 1 ${x + s * .55} ${y - h - 4} Z" fill="${T.roof}"/><path d="M ${x - s * .2} ${y - h - 20} A ${s * .3} ${s * .3} 0 0 1 ${x + s * .1} ${y - h - 26}" stroke="rgba(255,255,255,.45)" stroke-width="3" fill="none"/><rect x="${x - 2}" y="${y - h - 46}" width="4" height="14" fill="#ddd"/><circle cx="${x}" cy="${y - h - 48}" r="4" fill="${T.accent}"/>`;
    else g += pyramid(x, y, s * .5, h + 2, 18, T.roof);
    return g;
  },
  castle(x, y, T, tc, lv) {
    const stone = '#aaa49b';
    const tower = (cx, cy, s, h) => { let g = isoBox(cx, cy, s, h, stone); for (let i = 0; i < 3; i++) g += isoBox(cx - s * .6 + i * s * .6, cy - h - s * .15 + (i === 1 ? -s * .1 : 0), s * .22, 8, stone); g += quadL(cx, cy, s, .4, .6, h * .55, h * .72, '#2b2b2b') + quadR(cx, cy, s, .4, .6, h * .4, h * .55, '#2b2b2b'); for (let k = 1; k < 4; k++) g += quadL(cx, cy, s, 0, 1, h * k / 4, h * k / 4 + 1, 'rgba(0,0,0,.12)'); return g + flag(cx, cy - h - 8, 30, tc); };
    if (lv > 1) { let g = shadowE(x + 14, y + 10, 66, 22) + isoBox(x, y + 6, 44, 30, stone); [.12, .32, .52, .72, .92].forEach(u => { const p = faceL(x, y + 6, 44, u, 30), q = faceR(x, y + 6, 44, u, 30); g += isoBox(p[0], p[1] + 2, 4, 6, stone) + isoBox(q[0], q[1] + 2, 4, 6, stone); }); g += quadR(x, y + 6, 44, .38, .62, 0, 22, '#3b2a1a') + poly([faceR(x, y + 6, 44, .38, 22), faceR(x, y + 6, 44, .5, 28), faceR(x, y + 6, 44, .62, 22)], '#3b2a1a'); g += tower(x - 40, y - 4, 16, 60) + tower(x + 40, y - 4, 16, 60) + tower(x, y - 24, 20, 80); return g; }
    return shadowE(x + 12, y + 6, 34, 12) + tower(x, y, 22, 70) + isoBox(x + 30, y + 10, 16, 18, stone);
  }
};

// ---------- معالم الطابع (تميّز القرية منذ البداية) ----------
const THEME_MARK = {
  agri(x, y, T, tc) { return shadowE(x + 10, y + 4, 22, 8) + isoBox(x, y, 13, 62, '#e8dcc0') + pyramid(x, y, 15, 62, 16, '#8a4b2a') + quadL(x, y, 13, .35, .65, 0, 14, '#5b3a1e') + `<g class="mill">${[0, 90, 180, 270].map(a => `<g transform="rotate(${a} ${x} ${y - 56})"><rect x="${x - 2}" y="${y - 98}" width="4" height="42" fill="#7a5a3a"/><rect x="${x + 2}" y="${y - 96}" width="9" height="32" fill="#f5f0e1" stroke="#9a8c6c"/></g>`).join('')}</g><circle cx="${x}" cy="${y - 56}" r="4.5" fill="#5b3a1e"/>`; },
  trade(x, y, T, tc) { return `<path d="${blob(x, y + 4, 56, 26, 91, .1, 18)}" fill="#3b95b5" stroke="#d9c79a" stroke-width="4"/><path d="M ${x - 30} ${y + 4} q 10 -4 20 0" stroke="rgba(255,255,255,.5)" stroke-width="2" fill="none"/>` + poly([[x + 6, y - 10], [x + 52, y + 13], [x + 44, y + 17], [x - 2, y - 6]], '#8b6239', 'stroke="#5b3a1e"') + boat(x - 14, y + 6, '#9c4a22', '#f6ead2', .8) + isoBox(x + 46, y - 8, 7, 9, '#b88a4a') + isoBox(x + 56, y - 2, 6, 8, '#a0703c'); },
  science(x, y, T, tc) { return shadowE(x + 10, y + 4, 28, 10) + isoBox(x, y, 22, 28, '#e9edf3') + `<path d="M ${x - 22} ${y - 28} A 22 22 0 0 1 ${x + 22} ${y - 28} Z" fill="${T.roof}"/><path d="M ${x - 6} ${y - 46} L ${x + 4} ${y - 49} L ${x + 4} ${y - 28} L ${x - 6} ${y - 28} Z" fill="#1d1f3a"/><line x1="${x}" y1="${y - 40}" x2="${x + 28}" y2="${y - 62}" stroke="#333" stroke-width="6" stroke-linecap="round"/><circle cx="${x + 29}" cy="${y - 63}" r="4" fill="${T.accent}"/>`; },
  fort(x, y, T, tc) { let g = shadowE(x + 10, y + 4, 22, 8); [[-12, 0], [12, 0]].forEach(([dx]) => { g += `<line x1="${x + dx}" y1="${y + 6}" x2="${x + dx * .6}" y2="${y - 70}" stroke="#6b4a2b" stroke-width="5"/>`; }); g += `<path d="M ${x - 11} ${y - 10} L ${x + 11} ${y - 30} M ${x + 11} ${y - 10} L ${x - 11} ${y - 30} M ${x - 9} ${y - 40} L ${x + 9} ${y - 58}" stroke="#7a5530" stroke-width="3"/>` + isoBox(x, y - 70, 18, 14, '#8b6239') + pyramid(x, y - 70, 20, 14, 18, '#5b3a1e') + flag(x, y - 102, 22, tc, 20); return g; }
};
// ---------- إضافات تظهر تدريجيًا مع نمو القرية (بحسب الطابع) ----------
const DECO = {
  hay: (x, y) => shadowE(x + 4, y + 3, 16, 5) + `<ellipse cx="${x}" cy="${y - 8}" rx="14" ry="10" fill="#e3c05b"/><path d="M ${x - 10} ${y - 10} q 10 -6 20 0" stroke="#b8963a" stroke-width="1.5" fill="none"/>`,
  crops: (x, y) => poly(tileDiamond(x, y, 26), '#7a5a35') + [-1, 0, 1].map(k => `<line x1="${x - 18 + k * 8}" y1="${y + 4 + k * 4}" x2="${x + 2 + k * 8}" y2="${y - 6 + k * 4}" stroke="#86c35a" stroke-width="4" stroke-linecap="round"/>`).join(''),
  cart: (x, y, c) => shadowE(x + 4, y + 4, 20, 6) + isoBox(x, y - 4, 14, 8, c || '#8b6239') + `<circle cx="${x - 8}" cy="${y + 2}" r="5" fill="none" stroke="#3b2a1a" stroke-width="2"/><circle cx="${x + 9}" cy="${y + 4}" r="5" fill="none" stroke="#3b2a1a" stroke-width="2"/>`,
  sheep: (x, y) => [[0, 0], [16, 6], [-12, 8]].map(([dx, dy]) => shadowE(x + dx + 3, y + dy + 3, 9, 3) + `<ellipse cx="${x + dx}" cy="${y + dy - 6}" rx="8" ry="6" fill="#f4f1ea"/><circle cx="${x + dx + 7}" cy="${y + dy - 8}" r="3" fill="#333"/>`).join(''),
  scarecrow: (x, y) => `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - 34}" stroke="#6b4a2b" stroke-width="3"/><line x1="${x - 12}" y1="${y - 24}" x2="${x + 12}" y2="${y - 24}" stroke="#6b4a2b" stroke-width="3"/><circle cx="${x}" cy="${y - 37}" r="6" fill="#e9c27a"/>`,
  crates: (x, y) => isoBox(x, y, 9, 12, '#b88a4a') + isoBox(x + 14, y + 6, 8, 10, '#a0703c') + isoBox(x + 4, y - 12, 7, 9, '#c79a58'),
  barrels: (x, y) => [[0, 0], [12, 5], [-10, 6]].map(([dx, dy]) => `<rect x="${x + dx - 6}" y="${y + dy - 16}" width="12" height="16" rx="3" fill="#8b5a2b"/><ellipse cx="${x + dx}" cy="${y + dy - 16}" rx="6" ry="2.5" fill="#a87442"/><line x1="${x + dx - 6}" y1="${y + dy - 6}" x2="${x + dx + 6}" y2="${y + dy - 6}" stroke="#444" stroke-width="1.5"/>`).join(''),
  stall: (x, y, c) => isoBox(x, y, 12, 8, '#a0703c') + `<line x1="${x - 12}" y1="${y}" x2="${x - 12}" y2="${y - 24}" stroke="#5b3a1e" stroke-width="2"/><line x1="${x + 12}" y1="${y}" x2="${x + 12}" y2="${y - 24}" stroke="#5b3a1e" stroke-width="2"/>` + poly([[x - 16, y - 24], [x, y - 32], [x + 16, y - 24], [x, y - 16]], c),
  lamp: (x, y) => `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - 34}" stroke="#3b3b3b" stroke-width="3"/><rect x="${x - 5}" y="${y - 44}" width="10" height="11" rx="2" fill="#ffe27a" stroke="#3b3b3b" stroke-width="1.5"/><circle cx="${x}" cy="${y - 38}" r="10" fill="rgba(255,226,122,.25)"/>`,
  camel: (x, y) => shadowE(x + 4, y + 3, 18, 5) + `<g fill="#c89b5a"><ellipse cx="${x}" cy="${y - 14}" rx="14" ry="8"/><ellipse cx="${x - 3}" cy="${y - 21}" rx="6" ry="5"/><rect x="${x + 10}" y="${y - 28}" width="4" height="14"/><ellipse cx="${x + 15}" cy="${y - 29}" rx="5" ry="3"/><rect x="${x - 10}" y="${y - 9}" width="2.5" height="10"/><rect x="${x - 3}" y="${y - 9}" width="2.5" height="10"/><rect x="${x + 4}" y="${y - 9}" width="2.5" height="10"/><rect x="${x + 9}" y="${y - 9}" width="2.5" height="10"/></g>`,
  telescope: (x, y) => `<path d="M ${x - 8} ${y} L ${x} ${y - 16} L ${x + 8} ${y}" stroke="#555" stroke-width="2.5" fill="none"/><line x1="${x - 10}" y1="${y - 10}" x2="${x + 14}" y2="${y - 30}" stroke="#3a4a7a" stroke-width="6" stroke-linecap="round"/>`,
  garden: (x, y, c, r) => poly(tileDiamond(x, y, 22), '#5c9a48') + flowers(x, y - 2, r) + bush(x - 10, y + 2, .6),
  bench: (x, y) => isoBox(x, y, 12, 6, '#8b6239') + `<rect x="${x - 10}" y="${y - 18}" width="20" height="5" fill="#a87442"/>`,
  statue: (x, y, c) => isoBox(x, y, 10, 10, '#c9c3b8') + `<circle cx="${x}" cy="${y - 22}" r="9" fill="${c}" stroke="#555"/><path d="M ${x - 9} ${y - 22} h 18 M ${x} ${y - 31} v 18" stroke="#fff" stroke-width="1.5"/>`,
  sundial: (x, y) => `<ellipse cx="${x}" cy="${y - 4}" rx="14" ry="7" fill="#d9d2c3" stroke="#999"/><polygon points="${x},${y - 4} ${x + 2},${y - 18} ${x + 8},${y - 4}" fill="#666"/>`,
  wall: (x, y) => { let g = ''; for (let i = 0; i < 6; i++) { const px = x - 26 + i * 10, py = y - 12 + i * 5; g += `<rect x="${px - 4}" y="${py - 26}" width="8" height="26" fill="#8b5a2b" stroke="#5b3a1e" stroke-width="1"/><polygon points="${px - 4},${py - 26} ${px},${py - 33} ${px + 4},${py - 26}" fill="#8b5a2b"/>`; } return g; },
  torch: (x, y) => `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - 28}" stroke="#5b3a1e" stroke-width="3"/><path class="fire" d="M ${x - 5} ${y - 28} q 5 -16 10 0 z" fill="#ff9a2e"/><circle cx="${x}" cy="${y - 32}" r="9" fill="rgba(255,154,46,.2)"/>`,
  banner: (x, y, c) => `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - 46}" stroke="#5b3a1e" stroke-width="3"/><path d="M ${x} ${y - 44} h 16 v 22 l -8 -5 l -8 5 z" fill="${c}"/>`,
  stones: (x, y) => rock(x, y, .8) + rock(x + 14, y + 6, .6),
  tower: (x, y, c) => shadowE(x + 6, y + 3, 16, 6) + isoBox(x, y, 10, 46, '#9a948a') + isoBox(x, y - 46, 13, 6, '#8a847a') + flag(x, y - 52, 18, c, 16)
};
const DECO_BY = {
  agri: ['hay', 'crops', 'sheep', 'cart', 'scarecrow', 'hay'],
  trade: ['crates', 'barrels', 'stall', 'camel', 'lamp', 'cart'],
  science: ['telescope', 'lamp', 'garden', 'statue', 'bench', 'sundial'],
  fort: ['wall', 'torch', 'banner', 'tower', 'stones', 'wall']
};
const DECO_AT = [1, 2, 4, 6, 8, 10];
const DECO_SPOT = [[205, -25], [-170, -70], [120, 106], [-232, 60], [22, 124], [55, -108]];
function starterHut(x, y, T, theme) {
  const roof = { agri: '#d8b45a', trade: '#d0603a', science: '#7d8fc8', fort: '#6b4a2b' }[theme] || T.roof;
  return shadowE(x + 8, y + 5, 26, 8) + isoBox(x, y, 17, 16, theme === 'fort' ? '#9c7a52' : T.wall) + quadR(x, y, 17, .4, .7, 0, 11, '#5b3a1e') + gable(x, y, 19, 16, 14, roof);
}
function well(x, y) { return shadowE(x + 5, y + 4, 16, 6) + `<ellipse cx="${x}" cy="${y}" rx="13" ry="6.5" fill="#8a9196"/><rect x="${x - 13}" y="${y - 10}" width="26" height="10" fill="#9aa0a6"/><ellipse cx="${x}" cy="${y - 10}" rx="13" ry="6.5" fill="#aab0b4"/><ellipse cx="${x}" cy="${y - 10}" rx="9" ry="4.2" fill="#2e6f8e"/><line x1="${x - 11}" y1="${y - 10}" x2="${x - 11}" y2="${y - 32}" stroke="#6b4a2b" stroke-width="3"/><line x1="${x + 11}" y1="${y - 10}" x2="${x + 11}" y2="${y - 32}" stroke="#6b4a2b" stroke-width="3"/><polygon points="${x - 16},${y - 31} ${x},${y - 41} ${x + 16},${y - 31}" fill="#8b3a2b"/>`; }

// ---------- القرية (إحداثيات محلية حول المركز 0,0) ----------
const tilePos = (cx, cy, i, j) => [cx + (i - j - .5) * ISO_A, cy + (i + j - 1.5) * ISO_A / 2];
function villageArt(team, opts = {}) {
  const th = team.theme || 'agri', T = D.THEMES[th] || D.THEMES.agri, tc = team.color, lv = opts.levels || {};
  const seed = (team.id || 't1').charCodeAt(1) * 31 + th.length * 7, r = rng(seed);
  const tot = D.BUILD_KEYS.reduce((a, k) => a + (lv[k] || 0), 0);
  let g = `<path d="${blob(0, 8, 258, 134, seed, .06)}" fill="${shade(T.ground, -.25)}" opacity=".35"/><path d="${blob(0, 0, 242, 122, seed + 1, .05)}" fill="${T.ground}" opacity=".82"/>`;
  for (let i = 0; i < 9; i++) g += `<ellipse cx="${f1((r() - .5) * 360)}" cy="${f1((r() - .5) * 170)}" rx="${f1(20 + r() * 40)}" ry="${f1(8 + r() * 14)}" fill="${shade(T.ground, r() > .5 ? .12 : -.08)}" opacity=".6"/>`;
  // ممرات ترابية داخل القرية
  g += `<path d="M -190 40 Q -60 70 60 30 T 220 -10" stroke="${shade(T.ground, -.2)}" stroke-width="16" fill="none" stroke-linecap="round" opacity=".55"/>`;
  // سياج خفيف وأعلام الفريق على الأطراف
  const fence = []; for (let a = 0; a < 360; a += 9) { if (a > 60 && a < 120) continue; const rad = a * Math.PI / 180, x = Math.cos(rad) * 238, y = Math.sin(rad) * 120; fence.push([x, y]); }
  const back = [], front = [];
  fence.forEach(([x, y]) => (y < 0 ? back : front).push(`<rect x="${f1(x - 1.6)}" y="${f1(y - 11)}" width="3.2" height="11" fill="#7a5a3a"/>`));
  g += back.join('');
  const items = [];
  [[-150, -100], [160, -96]].forEach(([x, y]) => items.push([y, `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - 48}" stroke="#5b3a1e" stroke-width="3"/><path d="M ${x} ${y - 46} h 18 v 24 l -9 -6 l -9 6 z" fill="${tc}"/>`]));
  items.push([5, THEME_MARK[th] ? THEME_MARK[th](-200, 8, T, tc) : '']);
  items.push([-64, shadowE(136, -60, 10, 4) + flag(130, -62, 76, tc, 34) + `<ellipse cx="130" cy="-62" rx="8" ry="4" fill="#8a847a"/>`]);
  items.push([82, starterHut(-140, 82, T, th)]); items.push([100, starterHut(-62, 102, T, th)]);
  items.push([66, well(185, 66)]);
  const decos = DECO_BY[th] || DECO_BY.agri;
  DECO_AT.forEach((need, k) => { if (tot >= need) { const [x, y] = DECO_SPOT[k]; items.push([y, `<g class="deco">${DECO[decos[k]](x, y, tc, r)}</g>`]); } });
  D.BUILD_KEYS.forEach(k => {
    const [i, j] = SLOT[k], [x, y] = tilePos(0, 0, i, j), L = lv[k] || 0;
    if (!L) { items.push([y, `<g class="slot">${(i + j) % 2 ? treeRound(x + 10, y, .7, i + j) : treePine(x + 12, y + 2, .75)}${bush(x - 20, y + 6, .8)}${tuft(x + 4, y + 14)}${tuft(x - 30, y - 6)}${opts.labels ? `<text x="${x}" y="${y + 30}" text-anchor="middle" font-size="15" fill="rgba(255,255,255,.85)" stroke="rgba(0,0,0,.35)" stroke-width="3" paint-order="stroke">${D.BUILD[k].name}</text>` : ''}</g>`]); return; }
    items.push([y, `<g class="bld" data-k="${k}" data-lv="${L}">${poly(tileDiamond(x, y + 2, 54), shade(T.ground, -.14), 'opacity=".7"')}<g transform="translate(${x} ${y}) scale(1.2) translate(${-x} ${-y})">${BUILDERS[k](x, y, T, tc, L)}</g></g>`]);
  });
  items.sort((a, b) => a[0] - b[0]);
  return g + items.map(x => x[1]).join('') + front.join('');
}
function plotSVG(team, idx, cx, cy, opts = {}) { return `<g class="plot" data-t="${team.id}" transform="translate(${cx} ${cy}) scale(${VSC})">${villageArt(team, opts)}</g>`; }
// قرية مستقلة (للجوال ولوحة المشرف)
function villageSVG(team, levels, opts = {}) { return `<svg viewBox="-268 -200 536 340" class="vsvg" xmlns="http://www.w3.org/2000/svg"><rect x="-268" y="-200" width="536" height="340" fill="#4f8f45"/>${villageArt(team, { levels, labels: opts.labels })}</svg>`; }

// مبنى منفرد (لسوق البناء في الجوال)
function buildingSVG(team, k, lv) { const T = D.THEMES[team.theme] || D.THEMES.agri; return `<svg viewBox="-85 -160 170 195" class="vsvg" xmlns="http://www.w3.org/2000/svg"><ellipse cx="0" cy="8" rx="78" ry="30" fill="${T.ground}"/>${BUILDERS[k](0, 0, T, team.color, lv)}</svg>`; }

// ---------- الجزيرة ----------
const IC = [960, 605], IR = [835, 448];
const coastK = a => 1 + .045 * Math.sin(3 * a + .7) + .03 * Math.sin(5 * a + 2.1) + .018 * Math.sin(8 * a + .4) + .01 * Math.sin(13 * a + 1.3);
function islandPath(k = 1, dy = 0, wob = 0) { const P = []; for (let i = 0; i < 96; i++) { const a = i / 96 * Math.PI * 2, kk = k * (coastK(a) + wob * Math.sin(11 * a + 3)); P.push([IC[0] + Math.cos(a) * IR[0] * kk, IC[1] + dy + Math.sin(a) * IR[1] * kk]); } return smoothPath(P); }
function coastPt(a, k = 1) { const kk = k * coastK(a); return [IC[0] + Math.cos(a) * IR[0] * kk, IC[1] + Math.sin(a) * IR[1] * kk]; }
function inIsland(x, y, k) { const dx = (x - IC[0]) / IR[0], dy = (y - IC[1]) / IR[1]; return Math.hypot(dx, dy) < k * coastK(Math.atan2(dy, dx)); }
function plotCenters(n) {
  if (n === 2) return [[600, 640], [1320, 640]];
  if (n === 3) return [[960, 445], [590, 820], [1330, 820]];
  return [[610, 452], [1310, 452], [610, 830], [1310, 830]];
}
function layoutFor(n) {
  if (n === 3) return { plaza: [960, 690], hills: [[400, 420, 1], [1520, 420, 0]], lake: [960, 945], pier: .05 };
  if (n === 2) return { plaza: [960, 640], hills: [[960, 330, 1]], lake: [1250, 925], pier: Math.PI / 2 };
  return { plaza: [960, 640], hills: [[960, 318, 1]], lake: [960, 945], pier: .03 };
}
function hill(x, y, big) {
  const s = big ? 1 : .8; let g = `<path d="${blob(x, y + 18 * s, 165 * s, 72 * s, 21, .08)}" fill="#3f7d3a" opacity=".55"/>`;
  g += `<path d="${blob(x, y, 150 * s, 64 * s, 22, .09)}" fill="#5c9a4a"/><path d="${blob(x - 8, y - 22 * s, 110 * s, 46 * s, 23, .1)}" fill="#6aa653"/><path d="${blob(x - 14, y - 44 * s, 68 * s, 28 * s, 24, .12)}" fill="#8a8f80"/><path d="${blob(x - 22, y - 56 * s, 40 * s, 16 * s, 25, .15)}" fill="#a9ad9f"/>`;
  g += `<path d="M ${x - 60 * s} ${y - 40 * s} q 20 -16 40 -10" stroke="rgba(255,255,255,.25)" stroke-width="3" fill="none"/>`;
  const r = rng(Math.round(x + y)); const tr = []; for (let i = 0; i < 9; i++) { const a = r() * Math.PI * 2, d = .55 + r() * .35; tr.push([x + Math.cos(a) * 130 * s * d, y + Math.sin(a) * 52 * s * d + 8]); }
  tr.sort((p, q) => p[1] - q[1]).forEach(([tx, ty]) => { g += treePine(tx, ty, .85 + r() * .3); });
  return g;
}
function lake(x, y) {
  return `<path d="${blob(x, y, 104, 40, 41, .12)}" fill="#c9b27a"/><path d="${blob(x, y, 92, 33, 42, .12)}" fill="#3790b3"/><path d="${blob(x - 6, y - 2, 70, 22, 43, .12)}" fill="#47a6c6"/><path d="M ${x - 40} ${y - 6} q 14 -5 28 0 M ${x + 10} ${y + 8} q 14 -5 28 0" stroke="rgba(255,255,255,.55)" stroke-width="2.5" fill="none" class="ripple"/>` +
    [-86, -78, 80, 88].map((dx, i) => `<path d="M ${x + dx} ${y + 6 - (i % 2) * 4} l -3 -16 M ${x + dx + 4} ${y + 6 - (i % 2) * 4} l 1 -14" stroke="#4d7a35" stroke-width="2.5"/>`).join('');
}
function plaza(x, y) {
  let g = shadowE(x + 6, y + 8, 116, 44) + `<ellipse cx="${x}" cy="${y}" rx="112" ry="50" fill="#cbbf9f" stroke="#a89a78" stroke-width="3"/><ellipse cx="${x}" cy="${y}" rx="80" ry="35" fill="none" stroke="#b3a684" stroke-width="2" stroke-dasharray="10 6"/>`;
  g += `<ellipse cx="${x}" cy="${y + 4}" rx="40" ry="17" fill="#8f969b"/><rect x="${x - 40}" y="${y - 6}" width="80" height="10" fill="#a3aaae"/><ellipse cx="${x}" cy="${y - 6}" rx="40" ry="17" fill="#b5bbbf"/><ellipse cx="${x}" cy="${y - 6}" rx="33" ry="13" fill="#5fb6d6"/>`;
  g += `<rect x="${x - 5}" y="${y - 34}" width="10" height="28" fill="#c9cfd2"/><ellipse cx="${x}" cy="${y - 34}" rx="13" ry="5" fill="#b5bbbf"/><g class="spout"><path d="M ${x} ${y - 36} q -12 -18 -24 14 M ${x} ${y - 36} q 12 -18 24 14" stroke="#bfe8f6" stroke-width="3" fill="none"/></g>`;
  [[-96, -10], [96, -10], [-60, 34], [60, 34]].forEach(([dx, dy]) => { g += DECO.lamp(x + dx, y + dy); });
  return g;
}
function road(a, b, w = 26) {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, nx = -(b[1] - a[1]) * .12, ny = (b[0] - a[0]) * .12;
  const d = `M ${f1(a[0])} ${f1(a[1])} Q ${f1(mx + nx)} ${f1(my + ny)} ${f1(b[0])} ${f1(b[1])}`;
  return { d, svg: `<path d="${d}" stroke="#a7834f" stroke-width="${w + 8}" fill="none" stroke-linecap="round" opacity=".75"/><path d="${d}" stroke="#d8ba82" stroke-width="${w}" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#e8d1a0" stroke-width="3" fill="none" stroke-dasharray="2 18" stroke-linecap="round"/>`, pts: [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1].map(t => [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * (mx + nx) + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * (my + ny) + t * t * b[1]]) };
}
function islandBase(n) {
  const C = plotCenters(n), L = layoutFor(n), r = rng(1000 + n);
  let g = `<defs><linearGradient id="sea" gradientUnits="userSpaceOnUse" x1="0" y1="-200" x2="0" y2="1300"><stop offset="0" stop-color="#0b5878"/><stop offset="1" stop-color="#06364d"/></linearGradient>
    <radialGradient id="shallow" cx=".5" cy=".5" r=".5"><stop offset=".8" stop-color="#2fb1c4" stop-opacity=".85"/><stop offset="1" stop-color="#2fb1c4" stop-opacity="0"/></radialGradient>
    <linearGradient id="sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ecdcab"/><stop offset="1" stop-color="#d9c38a"/></linearGradient>
    <radialGradient id="grass" cx=".5" cy=".42" r=".62"><stop offset="0" stop-color="#7dbb5c"/><stop offset=".7" stop-color="#5f9f48"/><stop offset="1" stop-color="#4b8a3d"/></radialGradient>
    <filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="14"/></filter></defs>
  <rect x="-1200" y="-900" width="4320" height="2880" fill="url(#sea)"/>
  <g class="waves">${Array.from({ length: 22 }, (_, i) => `<path d="M ${(i * 211) % 1900} ${40 + (i * 137) % 1020} q 16 -8 32 0 t 32 0" stroke="rgba(255,255,255,.16)" stroke-width="2.5" fill="none"/>`).join('')}</g>
  <path d="${islandPath(1.11, 8)}" fill="#1d8fa8" opacity=".55" filter="url(#soft)"/>
  <path d="${islandPath(1.06, 6)}" fill="#3cbcc9" opacity=".55"/>
  <path d="${islandPath(1.035, 4)}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="5" stroke-dasharray="26 14" class="foam"/>
  <path d="${islandPath(1, 20)}" fill="#a88a55"/><path d="${islandPath(1, 10)}" fill="#c4a66c"/>
  <path d="${islandPath(1)}" fill="url(#sand)"/>
  <path d="${islandPath(.985)}" fill="none" stroke="#c8b07a" stroke-width="3" opacity=".6"/>
  <path d="${islandPath(.915, -4, .006)}" fill="#467f37" opacity=".5"/>
  <path d="${islandPath(.9, -8, .008)}" fill="url(#grass)"/>`;
  // بقع عشبية متفاوتة
  for (let i = 0; i < 46; i++) { const x = 150 + r() * 1620, y = 210 + r() * 780; if (!inIsland(x, y, .82)) continue; g += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(30 + r() * 90)}" ry="${f1(12 + r() * 30)}" fill="${r() > .5 ? '#86c262' : '#4f8f40'}" opacity="${f1(.18 + r() * .2)}"/>`; }
  L.hills.forEach(([x, y, b]) => { g += hill(x, y, b); });
  g += lake(L.lake[0], L.lake[1]);
  // طرق من الساحة إلى كل قرية
  const roads = C.map(([x, y]) => { const dx = L.plaza[0] - x, dy = L.plaza[1] - y, d = Math.hypot(dx / 250, dy / 128) || 1; return road(L.plaza, [x + dx / d * .92, y + dy / d * .92]); });
  // طريق إلى المرسى جنوبًا
  const pa = L.pier, pc = coastPt(pa, .97), ps = [L.plaza[0] + Math.cos(pa) * 100, L.plaza[1] + Math.sin(pa) * 46], pier = road(ps, [pc[0] - Math.cos(pa) * 10, pc[1] - Math.sin(pa) * 6], 22);
  g += roads.map(x => x.svg).join('') + pier.svg + plaza(L.plaza[0], L.plaza[1]);
  // رصيف ومراكب
  const pe = coastPt(pa, 1.05), nx = -Math.sin(pa) * 10, ny = Math.cos(pa) * 5; g += `<path d="M ${f1(pc[0] + nx)} ${f1(pc[1] + ny)} L ${f1(pe[0] + nx)} ${f1(pe[1] + ny)} L ${f1(pe[0] - nx)} ${f1(pe[1] - ny)} L ${f1(pc[0] - nx)} ${f1(pc[1] - ny)} Z" fill="#8b6239" stroke="#5b3a1e" stroke-width="2"/>` + (() => { const tx = -Math.sin(pa), ty = Math.cos(pa), ox = pe[0] - Math.cos(pa) * 40, oy = pe[1] - Math.sin(pa) * 30; return boat(ox + tx * 75, oy + ty * 52, '#2f6db5', '#f6efe0', 1) + boat(ox - tx * 75, oy - ty * 52, '#b03a2e', '#fff8e8', .8); })();
  g += `<g class="sail-far">${boat(1720, 140, '#7a5530', '#f6efe0', .7)}</g><g class="sail-far2">${boat(230, 1010, '#4a6b3a', '#f6efe0', .6)}</g>`;
  // أشجار موزعة بعيدًا عن القرى والطرق والساحة
  const near = (x, y) => C.some(([cx, cy]) => Math.hypot((x - cx) / 300, (y - cy + 30) / 175) < 1) || Math.hypot((x - L.plaza[0]) / 160, (y - L.plaza[1]) / 85) < 1 || L.hills.some(([hx, hy, b]) => Math.hypot((x - hx) / (b ? 175 : 140), (y - hy) / (b ? 85 : 68)) < 1) || Math.hypot((x - L.lake[0]) / 125, (y - L.lake[1]) / 55) < 1 || roads.concat([pier]).some(rd => rd.pts.some(([px, py]) => Math.hypot(px - x, py - y) < 34));
  const trees = [];
  for (let i = 0; i < 900 && trees.length < 120; i++) { const x = 120 + r() * 1680, y = 190 + r() * 860; if (!inIsland(x, y, .86) || near(x, y)) continue; trees.push([x, y, r()]); }
  // أشجار النخيل على الشاطئ
  const palms = []; for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + .2 + r() * .15; if (Math.abs(a - pa) < .2) continue; const [x, y] = coastPt(a, .93 + r() * .02); palms.push([x, y]); }
  const rocks = []; for (let i = 0; i < 10; i++) { const a = r() * Math.PI * 2; const [x, y] = coastPt(a, .97 + r() * .05); rocks.push([x, y]); }
  const objs = [...trees.map(([x, y, q]) => [y, q < .55 ? treeRound(x, y, .85 + q * .5, Math.floor(q * 40)) : q < .8 ? treePine(x, y, .9 + q * .3) : bush(x, y, 1.2) + flowers(x, y + 8, r)]), ...palms.map(([x, y], i) => [y, palm(x, y, i)]), ...rocks.map(([x, y]) => [y, rock(x, y, 1 + r() * .6)])];
  objs.sort((a, b) => a[0] - b[0]); g += objs.map(o => o[1]).join('');
  g += `<g class="gulls">${[[300, 240], [340, 225], [1600, 200], [1560, 180]].map(([x, y]) => `<path d="M ${x - 10} ${y} q 5 -6 10 0 q 5 -6 10 0" stroke="#f2f2f2" stroke-width="2.5" fill="none"/>`).join('')}</g>`;
  return g;
}
