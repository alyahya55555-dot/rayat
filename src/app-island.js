/* ===== رسم الجزيرة والقرى (منظور متساوي القياس) + شاشة الجمهور ===== */
const ISO_A = 78; // نصف عرض البلاطة
const SLOT = { castle: [0, 0], library: [1, 0], workshop: [2, 0], house: [0, 1], market: [1, 1], farm: [2, 1] };
const BICON = { house: '🏠', farm: '🌾', market: '🏪', workshop: '🔨', library: '📚', castle: '🏰' };
function shade(hex, k) { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255; const f = v => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k))); return '#' + [f(r), f(g), f(b)].map(v => v.toString(16).padStart(2, '0')).join(''); }
const pts = a => a.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
const poly = (a, fill, extra = '') => `<polygon points="${pts(a)}" fill="${fill}" ${extra}/>`;
// صندوق متساوي القياس قاعدته معيّن حول (x,y)
function isoBox(x, y, s, h, c, o = {}) {
  const L = [x - s, y], F = [x, y + s / 2], R = [x + s, y], K = [x, y - s / 2];
  const up = p => [p[0], p[1] - h];
  let g = poly([L, F, up(F), up(L)], shade(c, -.12), 'stroke="rgba(0,0,0,.25)" stroke-width="1"') + poly([F, R, up(R), up(F)], shade(c, -.3), 'stroke="rgba(0,0,0,.25)" stroke-width="1"');
  if (!o.noTop) g += poly([up(L), up(F), up(R), up(K)], o.top || shade(c, .12), 'stroke="rgba(0,0,0,.2)" stroke-width="1"');
  return g;
}
const faceL = (x, y, s, u, v) => [x - s + s * u, y + (s / 2) * u - v];
const faceR = (x, y, s, u, v) => [x + s * u, y + s / 2 - (s / 2) * u - v];
const quadL = (x, y, s, u0, u1, v0, v1, fill) => poly([faceL(x, y, s, u0, v0), faceL(x, y, s, u1, v0), faceL(x, y, s, u1, v1), faceL(x, y, s, u0, v1)], fill);
const quadR = (x, y, s, u0, u1, v0, v1, fill) => poly([faceR(x, y, s, u0, v0), faceR(x, y, s, u1, v0), faceR(x, y, s, u1, v1), faceR(x, y, s, u0, v1)], fill);
function pyramid(x, y, s, h, rh, c) { const L = [x - s, y - h], F = [x, y + s / 2 - h], R = [x + s, y - h], A = [x, y - h - rh]; return poly([L, F, A], shade(c, -.05), 'stroke="rgba(0,0,0,.25)"') + poly([F, R, A], shade(c, -.28), 'stroke="rgba(0,0,0,.25)"'); }
function flag(x, y, h, c) { return `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - h}" stroke="#eee" stroke-width="2.5"/><polygon class="flag" points="${x},${y - h} ${x + 26},${y - h + 7} ${x},${y - h + 14}" fill="${c}"/>`; }
const tileDiamond = (x, y, s) => [[x - s, y], [x, y + s / 2], [x + s, y], [x, y - s / 2]];

// ---------- المباني الستة (مستويان) ----------
const BUILDERS = {
  house(x, y, T, tc, lv) {
    const s = 34, h = lv > 1 ? 54 : 30; let g = isoBox(x, y, s, h, T.wall);
    g += quadR(x, y, s, .55, .8, 0, 18, '#5b3a1e') + quadL(x, y, s, .35, .62, 12, 24, '#7fb3d9');
    if (lv > 1) g += quadL(x, y, s, .35, .62, 34, 46, '#ffe9a8') + quadR(x, y, s, .2, .45, 34, 46, '#ffe9a8');
    g += pyramid(x, y, s + 4, h, 26, T.roof);
    if (lv > 1) g += isoBox(x + 14, y - h - 4, 6, 18, '#8a5a3c');
    return g;
  },
  farm(x, y, T, tc, lv) {
    const s = 62; let g = poly(tileDiamond(x, y + 4, s), '#5e9e45', 'stroke="#3f7a2e" stroke-width="2"');
    for (let k = -2; k <= 2; k++) g += `<line x1="${x - s * .8 + Math.abs(k) * 6 + k * 14}" y1="${y + 4 + k * 7}" x2="${x + s * .8 - Math.abs(k) * 6 + k * 14}" y2="${y + 4 + k * 7}" stroke="${lv > 1 ? '#e8c64a' : '#7fc15d'}" stroke-width="5" stroke-linecap="round" transform="rotate(26 ${x} ${y})"/>`;
    g += `<ellipse cx="${x + 30}" cy="${y + 10}" rx="9" ry="6" fill="#e3c05b" stroke="#a8862f"/>`;
    if (lv > 1) { g += isoBox(x - 26, y - 6, 20, 24, '#b33a2b') + pyramid(x - 26, y - 6, 22, 24, 16, '#5a2b22'); }
    return g;
  },
  market(x, y, T, tc, lv) {
    const one = (cx, cy) => { let g = isoBox(cx, cy, 26, 14, '#a0703c'); g += isoBox(cx - 10, cy + 2, 6, 6, '#c98b48') + `<circle cx="${cx + 8}" cy="${cy - 18}" r="4" fill="#e74c3c"/><circle cx="${cx + 15}" cy="${cy - 16}" r="4" fill="#f1c40f"/>`; for (let i = 0; i < 4; i++) { const u0 = i / 4, u1 = (i + 1) / 4; g += poly([faceR(cx, cy - 34, 30, u0, 0), faceR(cx, cy - 34, 30, u1, 0), faceR(cx, cy - 46, 30, u1, -10), faceR(cx, cy - 46, 30, u0, -10)], i % 2 ? '#fff' : tc); } g += `<line x1="${cx}" y1="${cy + 13}" x2="${cx}" y2="${cy - 34}" stroke="#5b3a1e" stroke-width="3"/><line x1="${cx + 30}" y1="${cy - 2}" x2="${cx + 30}" y2="${cy - 49}" stroke="#5b3a1e" stroke-width="3"/>`; return g; };
    let g = lv > 1 ? one(x - 22, y - 8) + one(x + 18, y + 10) : one(x - 6, y);
    if (lv > 1) g += `<path d="M ${x - 40} ${y - 58} Q ${x} ${y - 40} ${x + 44} ${y - 58}" stroke="#eee" fill="none" stroke-width="1.5"/>` + [0, 1, 2, 3].map(i => `<polygon points="${x - 32 + i * 22},${y - 54 + (i === 1 || i === 2 ? 6 : 0)} ${x - 26 + i * 22},${y - 44 + (i === 1 || i === 2 ? 6 : 0)} ${x - 20 + i * 22},${y - 54 + (i === 1 || i === 2 ? 6 : 0)}" fill="${i % 2 ? T.accent : tc}"/>`).join('');
    return g;
  },
  workshop(x, y, T, tc, lv) {
    const s = lv > 1 ? 40 : 32, h = lv > 1 ? 42 : 32; let g = isoBox(x, y, s, h, '#7b5a3c', { top: '#4a3a2c' });
    g += quadR(x, y, s, .25, .7, 0, 22, '#2f241a') + quadL(x, y, s, .4, .7, 14, 26, '#ffb35c');
    const ch = (cx, cy) => isoBox(cx, cy, 7, 26, '#6b6b6b') + `<g class="smoke"><circle cx="${cx}" cy="${cy - 36}" r="7" fill="rgba(220,220,220,.7)"/><circle cx="${cx + 6}" cy="${cy - 52}" r="9" fill="rgba(220,220,220,.5)"/><circle cx="${cx + 2}" cy="${cy - 70}" r="11" fill="rgba(220,220,220,.3)"/></g>`;
    g += ch(x + 10, y - h - 8); if (lv > 1) g += ch(x - 16, y - h - 2) + `<circle cx="${x - s * .55}" cy="${y - h * .55}" r="10" fill="none" stroke="${T.accent}" stroke-width="5" stroke-dasharray="4 3"/>`;
    return g;
  },
  library(x, y, T, tc, lv) {
    const s = 38, h = 34; let g = isoBox(x, y, s, h, T.wall);
    for (let i = 0; i < 4; i++) g += quadR(x, y, s, .12 + i * .22, .18 + i * .22, 0, h - 4, '#ffffff');
    g += quadL(x, y, s, .4, .62, 0, 18, '#5b3a1e');
    g += poly([[x - s - 4, y - h], [x, y + s / 2 - h + 2], [x + s + 4, y - h], [x, y - s / 2 - h - 2]], shade(T.wall, -.15)) + poly([[x, y + s / 2 - h + 2], [x + s + 4, y - h], [x + s / 2, y - h - 12]], shade(T.roof, -.1));
    if (lv > 1) g += `<ellipse cx="${x}" cy="${y - h - 6}" rx="${s * .55}" ry="${s * .28}" fill="${shade(T.roof, -.2)}"/><path d="M ${x - s * .55} ${y - h - 6} A ${s * .55} ${s * .6} 0 0 1 ${x + s * .55} ${y - h - 6} Z" fill="${T.roof}"/><rect x="${x - 2}" y="${y - h - 40}" width="4" height="14" fill="#ddd"/><circle cx="${x}" cy="${y - h - 42}" r="4" fill="${T.accent}"/>`;
    return g;
  },
  castle(x, y, T, tc, lv) {
    const stone = '#a9a39a';
    const tower = (cx, cy, s, h) => { let g = isoBox(cx, cy, s, h, stone); for (let i = 0; i < 3; i++) g += isoBox(cx - s * .6 + i * s * .6, cy - h - s * .15 + (i === 1 ? -s * .1 : 0), s * .22, 8, stone); g += quadL(cx, cy, s, .4, .6, h * .55, h * .7, '#2b2b2b') + flag(cx, cy - h - 8, 30, tc); return g; };
    if (lv > 1) { let g = isoBox(x, y + 4, 40, 30, stone) + quadR(x, y + 4, 40, .35, .65, 0, 20, '#3b2a1a'); g += tower(x - 36, y - 4, 16, 64) + tower(x + 36, y - 4, 16, 64) + tower(x, y - 20, 20, 84); return g; }
    return tower(x, y, 22, 74);
  }
};
// علامة طابع القرية (زخرفة بصرية فقط)
const THEME_MARK = {
  agri(x, y, T, tc) { return isoBox(x, y, 12, 58, '#e8dcc0') + pyramid(x, y, 14, 58, 14, '#8a4b2a') + `<g class="mill" style="transform-origin:${x}px ${y - 52}px">${[0, 90, 180, 270].map(a => `<rect x="${x - 3}" y="${y - 92}" width="6" height="40" fill="#f5f0e1" stroke="#9a8c6c" transform="rotate(${a} ${x} ${y - 52})"/>`).join('')}</g><circle cx="${x}" cy="${y - 52}" r="4" fill="#5b3a1e"/>`; },
  trade(x, y, T, tc) { return `<path d="M ${x - 40} ${y} L ${x + 40} ${y} L ${x + 28} ${y + 16} L ${x - 28} ${y + 16} Z" fill="#8b5a2b" stroke="#5b3a1e" stroke-width="2"/><line x1="${x}" y1="${y}" x2="${x}" y2="${y - 62}" stroke="#5b3a1e" stroke-width="3"/><polygon points="${x + 2},${y - 60} ${x + 34},${y - 10} ${x + 2},${y - 10}" fill="#f6ead2" stroke="#ccc"/><polygon points="${x - 2},${y - 50} ${x - 26},${y - 10} ${x - 2},${y - 10}" fill="${T.accent}"/>`; },
  science(x, y, T, tc) { return isoBox(x, y, 20, 26, '#e9edf3') + `<path d="M ${x - 20} ${y - 26} A 20 20 0 0 1 ${x + 20} ${y - 26} Z" fill="${T.roof}"/><line x1="${x}" y1="${y - 36}" x2="${x + 26}" y2="${y - 58}" stroke="#333" stroke-width="5" stroke-linecap="round"/><circle cx="${x + 27}" cy="${y - 59}" r="4" fill="${T.accent}"/>`; },
  fort(x, y, T, tc) { let g = ''; for (let i = 0; i < 7; i++) { const px = x - 54 + i * 18, py = y - 24 + i * 9; g += `<rect x="${px - 4}" y="${py - 30}" width="8" height="30" fill="#8b5a2b" stroke="#5b3a1e"/><polygon points="${px - 4},${py - 30} ${px},${py - 38} ${px + 4},${py - 30}" fill="#8b5a2b"/>`; } return g; }
};

// مواقع القرى على الجزيرة حسب عدد الفرق
function plotCenters(n) {
  if (n === 2) return [[620, 610], [1300, 610]];
  if (n === 3) return [[960, 470], [600, 760], [1320, 760]];
  return [[620, 470], [1300, 470], [620, 830], [1300, 830]];
}
const tilePos = (cx, cy, i, j) => [cx + (i - j - .5) * ISO_A, cy + (i + j - 1.5) * ISO_A / 2];
// قرية واحدة: الأرض والمباني والعلامة
function plotSVG(team, idx, cx, cy, opts = {}) {
  const T = D.THEMES[team.theme] || { ground: '#9cbf7f', roof: '#a35a3a', wall: '#efe5cf', accent: '#d9b44a' };
  const lv = opts.levels || {}, a = ISO_A, m = .45;
  const G = [[-.5 - m, -.5 - m], [2.5 + m, -.5 - m], [2.5 + m, 1.5 + m], [-.5 - m, 1.5 + m]].map(([i, j]) => tilePos(cx, cy, i, j));
  const down = p => [p[0], p[1] + 16];
  let g = `<g class="plot" data-t="${team.id}">`;
  g += poly([G[3], G[2], down(G[2]), down(G[3])], shade(T.ground, -.35)) + poly([G[2], G[1], down(G[1]), down(G[2])], shade(T.ground, -.5));
  g += poly(G, T.ground, `stroke="${team.color}" stroke-width="5" stroke-linejoin="round"`);
  if (team.theme && THEME_MARK[team.theme]) { const [mx, my] = tilePos(cx, cy, -1.25, .9); g += `<g class="mark">${THEME_MARK[team.theme](mx, my, T, team.color)}</g>`; }
  // مركز القرية: علم الفريق
  const [fx, fy] = tilePos(cx, cy, -.55, -.55); g += flag(fx, fy, 62, team.color);
  const order = D.BUILD_KEYS.slice().sort((p, q) => (SLOT[p][0] + SLOT[p][1]) - (SLOT[q][0] + SLOT[q][1]) || SLOT[p][0] - SLOT[q][0]);
  order.forEach(k => {
    const [i, j] = SLOT[k], [x, y] = tilePos(cx, cy, i, j), L = lv[k] || 0;
    if (!L) { g += `<g class="slot">${poly(tileDiamond(x, y, a * .78), 'rgba(255,255,255,.08)', 'stroke="rgba(255,255,255,.35)" stroke-width="2" stroke-dasharray="6 6"')}${opts.labels ? `<text x="${x}" y="${y + 6}" text-anchor="middle" font-size="15" fill="rgba(255,255,255,.75)" font-family="IBM Plex Sans Arabic">${D.BUILD[k].name}</text>` : ''}</g>`; return; }
    g += `<g class="bld" data-k="${k}" data-lv="${L}" style="transform-origin:${x}px ${y}px">${BUILDERS[k](x, y, T, team.color, L)}</g>`;
  });
  return g + '</g>';
}
// قرية مستقلة (للجوال ولوحة المشرف)
function villageSVG(team, levels, opts = {}) {
  const cx = 300, cy = 230;
  return `<svg viewBox="40 70 520 300" class="vsvg" xmlns="http://www.w3.org/2000/svg">${plotSVG(team, 0, cx, cy, { levels, labels: opts.labels })}</svg>`;
}
// الجزيرة كاملة
function islandBase(n) {
  return `<defs><linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d5c7a"/><stop offset="1" stop-color="#083a52"/></linearGradient><radialGradient id="sand" cx=".5" cy=".55" r=".6"><stop offset=".78" stop-color="#e6d39f"/><stop offset="1" stop-color="#c9b27a"/></radialGradient><radialGradient id="grass" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#78b862"/><stop offset="1" stop-color="#4f8f45"/></radialGradient></defs>
  <rect width="1920" height="1080" fill="url(#sea)"/>
  <g class="waves">${Array.from({ length: 14 }, (_, i) => `<path d="M ${(i * 211) % 1900} ${120 + (i * 137) % 900} q 20 -10 40 0 t 40 0" stroke="rgba(255,255,255,.18)" stroke-width="3" fill="none"/>`).join('')}</g>
  <path d="M 960 150 C 1450 140 1800 330 1820 600 C 1840 870 1500 1050 960 1050 C 420 1050 80 870 100 600 C 120 330 470 160 960 150 Z" fill="#0e6b8a" opacity=".55" transform="translate(0,14)"/>
  <path d="M 960 150 C 1450 140 1800 330 1820 600 C 1840 870 1500 1050 960 1050 C 420 1050 80 870 100 600 C 120 330 470 160 960 150 Z" fill="url(#sand)"/>
  <path d="M 960 200 C 1400 195 1740 360 1760 600 C 1775 840 1460 1000 960 1000 C 460 1000 145 840 160 600 C 175 360 520 205 960 200 Z" fill="url(#grass)"/>
  ${[[190, 560], [1735, 560], [960, 1005], [960, 210], [330, 900], [1590, 900]].map(([x, y], i) => palm(x, y, i)).join('')}
  ${[[260, 420], [1660, 430], [800, 990], [1150, 205]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="20" ry="11" fill="#9aa0a6"/><ellipse cx="${x - 6}" cy="${y - 4}" rx="10" ry="6" fill="#b8bec4"/>`).join('')}`;
}
function palm(x, y, i) { return `<g><path d="M ${x} ${y} Q ${x + 6} ${y - 40} ${x - 4} ${y - 80}" stroke="#8b5a2b" stroke-width="7" fill="none"/>${[-60, -20, 20, 60, 160].map(a => `<path d="M ${x - 4} ${y - 80} q ${Math.cos(a * Math.PI / 180) * 30} ${-10 + Math.sin(a * Math.PI / 180) * 18} ${Math.cos(a * Math.PI / 180) * 50} ${10 + Math.sin(a * Math.PI / 180) * 20}" stroke="#2f7d32" stroke-width="9" fill="none" stroke-linecap="round"/>`).join('')}</g>`; }

// ---------- رسم مشهد «قوة الملاحظة» ----------
const SCOL = { red: '#e74c3c', blue: '#3498db', green: '#27ae60', yellow: '#f1c40f', purple: '#9b59b6', orange: '#e67e22' };
const SDRAW = {
  palm: (x, y) => palm(x, y + 40, 0),
  boat: (x, y, c) => `<path d="M ${x - 60} ${y} L ${x + 60} ${y} L ${x + 40} ${y + 30} L ${x - 40} ${y + 30} Z" fill="${c}" stroke="#333" stroke-width="3"/><line x1="${x}" y1="${y}" x2="${x}" y2="${y - 80}" stroke="#5b3a1e" stroke-width="5"/><polygon points="${x + 4},${y - 76} ${x + 50},${y - 10} ${x + 4},${y - 10}" fill="#fff" stroke="#999"/>`,
  camel: (x, y) => `<g fill="#c89b5a" stroke="#7a5a2c" stroke-width="3"><ellipse cx="${x}" cy="${y}" rx="50" ry="26"/><ellipse cx="${x - 12}" cy="${y - 24}" rx="18" ry="16"/><rect x="${x + 36}" y="${y - 50}" width="12" height="44" rx="5"/><ellipse cx="${x + 52}" cy="${y - 52}" rx="16" ry="10"/><rect x="${x - 38}" y="${y + 14}" width="9" height="40"/><rect x="${x - 16}" y="${y + 14}" width="9" height="40"/><rect x="${x + 12}" y="${y + 14}" width="9" height="40"/><rect x="${x + 30}" y="${y + 14}" width="9" height="40"/></g>`,
  tent: (x, y, c) => `<polygon points="${x - 60},${y + 40} ${x},${y - 50} ${x + 60},${y + 40}" fill="${c}" stroke="#333" stroke-width="3"/><polygon points="${x - 14},${y + 40} ${x},${y - 6} ${x + 14},${y + 40}" fill="rgba(0,0,0,.35)"/>`,
  bird: (x, y, c) => `<ellipse cx="${x}" cy="${y}" rx="34" ry="20" fill="${c}" stroke="#333" stroke-width="3"/><circle cx="${x + 30}" cy="${y - 14}" r="13" fill="${c}" stroke="#333" stroke-width="3"/><polygon points="${x + 42},${y - 16} ${x + 58},${y - 12} ${x + 42},${y - 8}" fill="#f39c12"/><path d="M ${x - 10} ${y - 4} q -20 -40 -40 -20" fill="${shade(c, -.2)}" stroke="#333" stroke-width="3"/><circle cx="${x + 33}" cy="${y - 17}" r="3"/>`,
  cloud: (x, y) => `<g fill="#fff" stroke="#bcd" stroke-width="2"><circle cx="${x - 30}" cy="${y}" r="26"/><circle cx="${x}" cy="${y - 16}" r="32"/><circle cx="${x + 32}" cy="${y}" r="26"/><rect x="${x - 30}" y="${y}" width="62" height="26"/></g>`,
  fish: (x, y, c) => `<ellipse cx="${x}" cy="${y}" rx="44" ry="22" fill="${c}" stroke="#333" stroke-width="3"/><polygon points="${x - 40},${y} ${x - 70},${y - 22} ${x - 70},${y + 22}" fill="${c}" stroke="#333" stroke-width="3"/><circle cx="${x + 24}" cy="${y - 6}" r="5" fill="#fff"/><circle cx="${x + 25}" cy="${y - 6}" r="2.5"/>`,
  well: (x, y) => `<rect x="${x - 40}" y="${y}" width="80" height="44" fill="#9aa0a6" stroke="#555" stroke-width="3"/><line x1="${x - 34}" y1="${y}" x2="${x - 34}" y2="${y - 50}" stroke="#5b3a1e" stroke-width="6"/><line x1="${x + 34}" y1="${y}" x2="${x + 34}" y2="${y - 50}" stroke="#5b3a1e" stroke-width="6"/><polygon points="${x - 50},${y - 50} ${x},${y - 78} ${x + 50},${y - 50}" fill="#8b3a2b"/><line x1="${x}" y1="${y - 50}" x2="${x}" y2="${y - 10}" stroke="#333" stroke-width="2"/><rect x="${x - 8}" y="${y - 14}" width="16" height="14" fill="#7a5a2c"/>`,
  flag: (x, y, c) => `<line x1="${x - 20}" y1="${y + 50}" x2="${x - 20}" y2="${y - 60}" stroke="#555" stroke-width="6"/><path d="M ${x - 18} ${y - 58} q 30 -14 60 0 t 0 0 l 0 44 q -30 -14 -60 0 Z" fill="${c}" stroke="#333" stroke-width="2"/>`,
  rock: (x, y) => `<path d="M ${x - 50} ${y + 30} L ${x - 30} ${y - 16} L ${x + 4} ${y - 30} L ${x + 44} ${y - 4} L ${x + 52} ${y + 30} Z" fill="#8e9499" stroke="#555" stroke-width="3"/><path d="M ${x - 30} ${y - 16} L ${x - 6} ${y + 6} L ${x + 4} ${y - 30}" fill="#a9afb4"/>`,
  lantern: (x, y) => `<line x1="${x}" y1="${y - 60}" x2="${x}" y2="${y - 40}" stroke="#555" stroke-width="4"/><rect x="${x - 22}" y="${y - 40}" width="44" height="64" rx="8" fill="#f9d56e" stroke="#8a6d1c" stroke-width="4"/><rect x="${x - 26}" y="${y + 24}" width="52" height="10" fill="#8a6d1c"/><circle cx="${x}" cy="${y - 8}" r="10" fill="#fff6c8"/>`,
  tree: (x, y) => `<rect x="${x - 8}" y="${y}" width="16" height="50" fill="#7a5a2c"/><circle cx="${x}" cy="${y - 20}" r="42" fill="#2e8b57" stroke="#1d5e3a" stroke-width="3"/><circle cx="${x - 26}" cy="${y}" r="26" fill="#2e8b57" stroke="#1d5e3a" stroke-width="3"/><circle cx="${x + 26}" cy="${y}" r="26" fill="#2e8b57" stroke="#1d5e3a" stroke-width="3"/>`,
  chest: (x, y, c) => `<rect x="${x - 46}" y="${y - 10}" width="92" height="50" rx="4" fill="${c}" stroke="#333" stroke-width="3"/><path d="M ${x - 46} ${y - 10} Q ${x} ${y - 50} ${x + 46} ${y - 10} Z" fill="${shade(c, -.2)}" stroke="#333" stroke-width="3"/><rect x="${x - 8}" y="${y - 6}" width="16" height="18" fill="#f1c40f" stroke="#333" stroke-width="2"/>`
};
function sceneSVG(objs) {
  return `<svg viewBox="0 0 1920 900" class="scene"><rect width="1920" height="900" fill="#e9dcc0"/><rect width="1920" height="900" fill="url(#sc-sky)"/><defs><linearGradient id="sc-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe3f5"/><stop offset=".35" stop-color="#e9f4f8"/><stop offset=".36" stop-color="#ead9b0"/><stop offset="1" stop-color="#dcc28e"/></linearGradient></defs>${(objs || []).map(o => `<g>${(SDRAW[o.t] || (() => ''))(o.x, o.y, SCOL[o.c] || '#888')}</g>`).join('')}</svg>`;
}

// ---------- شاشة الجمهور ----------
class Stage {
  constructor(host, opts = {}) {
    this.host = host; this.opts = opts; this.P = null; this.R = { L: [] }; this.sound = !!opts.sound; this.clock = Object.create(Clock);
    this.shown = {}; this.animIdx = null; this.queue = []; this.prevScores = {}; this.lastFx = null; this.islKey = ''; this.panelKey = '';
    host.innerHTML = `<div class="stage"><div class="isl-wrap"><svg class="isl" viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg"><g class="isl-base"></g><g class="isl-plots"></g><g class="isl-labels"></g><g class="isl-fx"></g></svg></div>
      <div class="st-top"><div class="st-logo">${Brand.logoImg()}</div><div class="st-title"></div><div class="st-seg hide"></div></div>
      <div class="panel hide"></div><div class="center hide"></div>
      <div class="ring hide"><svg width="150" height="150" viewBox="0 0 170 170"><circle cx="85" cy="85" r="76" stroke="rgba(255,255,255,.15)" stroke-width="12" fill="rgba(4,20,26,.6)"/><circle class="arc" cx="85" cy="85" r="76" stroke="var(--brand)" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="477.5" transform="rotate(-90 85 85)"/></svg><div class="num"></div><div class="lbl"></div></div>
      <div class="notes"></div><div class="banner-layer"></div><div class="confetti"></div></div>`;
    this.el = $('.stage', host); this.svg = $('.isl', this.el); this.panel = $('.panel', this.el); this.center = $('.center', this.el); this.ring = $('.ring', this.el);
    this.fit(); this.ro = new ResizeObserver(() => this.fit()); this.ro.observe(host);
    this.loop = setInterval(() => this.tickUI(), 100);
    this.center.classList.remove('hide'); this.center.innerHTML = `<div class="card-c"><div class="wl">${Brand.logoImg()}</div><div class="mut" style="font-size:34px">بانتظار لوحة المشرف…</div></div>`;
  }
  fit() { const w = this.host.clientWidth, h = this.host.clientHeight; if (!w || !h) return; const s = Math.min(w / 1920, h / 1080); this.el.style.transform = `translate(${(w - 1920 * s) / 2}px,${(h - 1080 * s) / 2}px) scale(${s})`; }
  refreshLogo() { $('.st-logo', this.el).innerHTML = Brand.logoImg(); this.panelKey = ''; if (this.P) this.update(this.P); }
  teams() { return (this.P ? this.P.T : []).map(t => ({ id: t[0], name: t[1], color: t[2], score: t[3], gold: t[4], theme: t[5], lv: t[6], cap: t[8] })); }
  tm(id) { return this.teams().find(t => t.id === id) || { name: '', color: '#888' }; }
  setRoster(R) { if (R && R.L) { this.R = R; if (this.P && (!this.P.g || (this.P.g === 'opening' && this.P.ph === 'welcome'))) { this.panelKey = ''; this.update(this.P); } } }
  calm(P) { return !['open', 'answering', 'show', 'paused', 'wager'].includes(P.ph); }
  mode(P) {
    if (!P.g || P.g === 'opening' || P.g === 'crown' || P.ph === 'done' || P.ph === 'intro') return 'full';
    if (P.ph === 'show' || (P.I && P.I.obs && P.I.scene)) return 'focus';
    return 'side';
  }
  update(P) {
    this.P = P; this.clock.set(P.tm);
    this.el.classList.toggle('fx-low', P.fxl === 'low' || P.fxl === 'off');
    $('.st-title', this.el).textContent = P.title || 'ميدان بناء';
    const segEl = $('.st-seg', this.el);
    if (P.g && !['opening', 'crown'].includes(P.g)) { segEl.classList.remove('hide'); segEl.innerHTML = `<span>${esc(P.gi || '')}</span><span>${esc(P.gn)}</span>${P.in && P.ii >= 0 && P.ii < P.in ? `<small>${P.ii + 1} / ${P.in}</small>` : ''}${P.mult > 1 ? '<small class="x2">النقاط ×2</small>' : ''}`; } else segEl.classList.add('hide');
    // مستويات المباني: تُعرض الجديدة بحركة بناء في أقرب توقف
    const T = this.teams(); const first = this.animIdx == null;
    if (first) { T.forEach(t => { this.shown[t.id] = Object.fromEntries(D.BUILD_KEYS.map((k, i) => [k, t.lv[i]])); }); this.animIdx = P.BL || 0; }
    else if ((P.BL || 0) > this.animIdx) { (P.B || []).forEach(b => { if (b[0] >= this.animIdx) { this.queue.push(b); this.note(b); } }); this.animIdx = P.BL; }
    else if ((P.BL || 0) < this.animIdx) { T.forEach(t => { this.shown[t.id] = Object.fromEntries(D.BUILD_KEYS.map((k, i) => [k, t.lv[i]])); }); this.animIdx = P.BL || 0; this.queue = []; }
    T.forEach(t => { if (!this.shown[t.id]) this.shown[t.id] = Object.fromEntries(D.BUILD_KEYS.map((k, i) => [k, t.lv[i]])); });
    this.drawIsland(P);
    this.drawLabels(P);
    this.el.dataset.mode = this.mode(P);
    this.drawPanel(P);
    if (this.calm(P)) this.flushQueue();
    if (P.fx && P.fx.n !== this.lastFx) { const firstFx = this.lastFx == null; this.lastFx = P.fx.n; if (!firstFx) this.onFx(P.fx); }
    if (this.opts.ambient && !this.amb && P.g) this.startAmbient();
  }
  drawIsland(P) {
    const T = this.teams();
    const key = JSON.stringify([T.map(t => [t.id, t.color, t.theme]), this.shown]);
    if (key === this.islKey) return; this.islKey = key;
    const C = plotCenters(T.length);
    if (this.baseN !== T.length) { this.baseN = T.length; $('.isl-base', this.svg).innerHTML = islandBase(T.length); }
    $('.isl-plots', this.svg).innerHTML = T.map((t, i) => plotSVG(t, i, C[i][0], C[i][1], { levels: this.shown[t.id] })).join('');
  }
  drawLabels(P) {
    const T = this.teams(), C = plotCenters(T.length), rk = P.rk ? Object.fromEntries(P.rk.map(r => [r[0], r[2]])) : null;
    const sorted = [...T].sort((a, b) => b.score - a.score); const lead = sorted.length > 1 && sorted[0].score > sorted[1].score && sorted[0].score > 0 ? sorted[0].id : null;
    const showRank = P.g === 'crown' && ['reveal', 'winner'].includes(P.ph); const n = T.length;
    const winner = P.g === 'crown' && P.ph === 'winner' && !P.tie ? (P.rk || [])[0] && P.rk[0][0] : null;
    const html = T.map((t, i) => {
      const [cx, cy] = C[i], y = cy - 175, w = 300;
      let rankBadge = '';
      if (showRank && rk) { const r = rk[t.id], pos = (P.rk || []).findIndex(x => x[0] === t.id); const revealed = P.ph === 'winner' || pos >= n - (P.rev || 0); if (revealed) rankBadge = `<g class="rank-b"><circle cx="${cx + w / 2 - 6}" cy="${y - 6}" r="30" fill="${r === 1 ? '#f4c430' : '#fff'}" stroke="#333" stroke-width="3"/><text x="${cx + w / 2 - 6}" y="${y + 6}" text-anchor="middle" font-size="34" font-weight="800" fill="#222">${r}</text></g>`; }
      const capT = P.g === 'opening' && P.ph === 'themes' ? (t.theme ? 'قرية ' + D.THEMES[t.theme].name : 'يختار الطابع…') : '';
      return `<g class="lbl ${t.id === lead ? 'lead' : ''} ${t.id === winner ? 'win' : ''}" data-t="${t.id}">
        ${t.id === winner ? `<text x="${cx}" y="${y - 50}" text-anchor="middle" font-size="90" class="crown-i">👑</text>` : ''}
        <rect x="${cx - w / 2}" y="${y - 34}" width="${w}" height="68" rx="34" fill="${t.color}" stroke="rgba(255,255,255,.85)" stroke-width="3"/>
        <text x="${cx + 34}" y="${y + 12}" text-anchor="middle" font-size="34" font-weight="800" fill="#fff" class="nm">${esc(t.name)}</text>
        <circle cx="${cx - w / 2 + 36}" cy="${y}" r="27" fill="rgba(0,0,0,.28)"/>
        <text x="${cx - w / 2 + 36}" y="${y + 12}" text-anchor="middle" font-size="${t.score >= 100 ? 26 : 32}" font-weight="900" fill="#fff" class="sc" direction="ltr">${t.score}</text>
        <rect x="${cx - 62}" y="${y + 40}" width="124" height="40" rx="20" fill="rgba(4,20,26,.75)"/>
        <text x="${cx}" y="${y + 68}" text-anchor="middle" font-size="24" font-weight="700" fill="#f4d35e">💰 ${t.gold}</text>
        ${capT ? `<text x="${cx}" y="${cy + 210}" text-anchor="middle" font-size="28" font-weight="700" fill="#fff" stroke="rgba(0,0,0,.5)" stroke-width="5" paint-order="stroke">${esc(capT)}</text>` : ''}
        ${rankBadge}</g>`;
    }).join('');
    const L = $('.isl-labels', this.svg); if (L._h !== html) { L._h = html; L.innerHTML = html; }
    // نقاط طائرة عند تغير النتيجة
    T.forEach((t, i) => { const pv = this.prevScores[t.id]; if (pv != null && pv !== t.score) this.floatText(C[i][0], C[i][1] - 230, (t.score > pv ? '+' : '') + (t.score - pv), t.score > pv ? '#7CFC9A' : '#ff8a8a'); this.prevScores[t.id] = t.score; });
  }
  floatText(x, y, txt, color) { const fx = $('.isl-fx', this.svg); const g = document.createElementNS('http://www.w3.org/2000/svg', 'text'); g.setAttribute('x', x); g.setAttribute('y', y); g.setAttribute('text-anchor', 'middle'); g.setAttribute('font-size', '54'); g.setAttribute('font-weight', '900'); g.setAttribute('fill', color); g.setAttribute('stroke', 'rgba(0,0,0,.5)'); g.setAttribute('stroke-width', '6'); g.setAttribute('paint-order', 'stroke'); g.setAttribute('class', 'float'); g.setAttribute('direction', 'ltr'); g.textContent = txt; fx.appendChild(g); setTimeout(() => g.remove(), 2000); }
  note(b) { const t = this.tm(b[1]); const n = document.createElement('div'); n.className = 'note-b'; n.style.setProperty('--tc', t.color); n.innerHTML = `🏗️ <b>${esc(t.name)}</b> ${b[3] > 1 ? 'طوّرت' : 'بنت'} ${esc(D.BUILD[b[2]].name)}`; const box = $('.notes', this.el); box.appendChild(n); while (box.children.length > 3) box.firstChild.remove(); setTimeout(() => n.remove(), 4500); if (this.sound) SFX.play('coinsoft'); }
  flushQueue() {
    if (this.flushing || !this.queue.length) return; this.flushing = true;
    const step = () => {
      const b = this.queue.shift(); if (!b) { this.flushing = false; return; }
      const [, tid, key, lv] = b; if (!this.shown[tid]) { step(); return; }
      this.shown[tid][key] = Math.max(this.shown[tid][key] || 0, lv); this.drawIsland(this.P);
      const g = this.svg.querySelector(`.plot[data-t="${tid}"] .bld[data-k="${key}"]`);
      if (g) { g.classList.add('b-new'); const box = g.getBBox(); this.dust(box.x + box.width / 2, box.y + box.height); this.floatText(box.x + box.width / 2, box.y - 10, (lv > 1 ? '⬆ ' : '+ ') + D.BUILD[key].name, '#fff'); }
      if (this.sound) SFX.play('build');
      setTimeout(step, 1300);
    };
    step();
  }
  dust(x, y) { const fx = $('.isl-fx', this.svg); for (let i = 0; i < 10; i++) { const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('cx', x + (Math.random() - .5) * 80); c.setAttribute('cy', y - Math.random() * 20); c.setAttribute('r', 8 + Math.random() * 10); c.setAttribute('fill', 'rgba(230,215,180,.85)'); c.setAttribute('class', 'dust'); c.style.animationDelay = (Math.random() * .3) + 's'; fx.appendChild(c); setTimeout(() => c.remove(), 1800); } }
  fireworks(tid) { const i = this.teams().findIndex(t => t.id === tid); if (i < 0) return; const [cx, cy] = plotCenters(this.teams().length)[i]; const fx = $('.isl-fx', this.svg), col = this.tm(tid).color; for (let k = 0; k < 3; k++) { const x = cx + (k - 1) * 110, y = cy - 300 - (k % 2) * 40; for (let r = 0; r < 14; r++) { const a = r / 14 * Math.PI * 2; const l = document.createElementNS('http://www.w3.org/2000/svg', 'line'); l.setAttribute('x1', x); l.setAttribute('y1', y); l.setAttribute('x2', x + Math.cos(a) * 70); l.setAttribute('y2', y + Math.sin(a) * 70); l.setAttribute('stroke', r % 2 ? col : '#ffe27a'); l.setAttribute('stroke-width', '6'); l.setAttribute('stroke-linecap', 'round'); l.setAttribute('class', 'fw'); l.style.animationDelay = (k * .25) + 's'; fx.appendChild(l); setTimeout(() => l.remove(), 2200); } } }
  onFx(fx) {
    if (this.sound && FX_SOUND[fx.k]) SFX.play(FX_SOUND[fx.k]);
    if ((fx.k === 'correct' || fx.k === 'lead' || fx.k === 'crack' || fx.k === 'treasure') && fx.d && fx.d.team && this.P.fxl !== 'off') this.fireworks(fx.d.team);
    if (fx.k === 'crown') { this.confetti(160); const w = this.P.rk && this.P.rk[0]; if (w) { this.fireworks(w[0]); setTimeout(() => this.fireworks(w[0]), 900); } }
  }
  confetti(n) { if (this.P && (this.P.fxl === 'low' || this.P.fxl === 'off')) return; const C = $('.confetti', this.el); const cols = this.teams().map(t => t.color).concat(['#DCF5E2', '#A3D68F', '#22A391', '#f4d35e']); for (let i = 0; i < n; i++) { const e = document.createElement('i'); e.style.left = Math.random() * 1920 + 'px'; e.style.background = cols[i % cols.length]; e.style.animationDuration = (2.5 + Math.random() * 2.5) + 's'; e.style.animationDelay = Math.random() * .8 + 's'; C.appendChild(e); setTimeout(() => e.remove(), 6000); } }
  startAmbient() { this.amb = true; this.ambT = setInterval(() => { if (this.sound && SFX.ambientOn) SFX.ambient(); }, 1000); }
  tickUI() {
    const r = this.clock.rem(), ring = this.ring;
    if (r == null || !this.P || !this.P.tm) { ring.classList.add('hide'); return; }
    ring.classList.remove('hide'); $('.num', ring).textContent = fmtTime(r); $('.lbl', ring).textContent = this.clock.label || '';
    $('.arc', ring).setAttribute('stroke-dashoffset', String(477.5 * (1 - Math.min(1, r / this.clock.dur))));
    ring.classList.toggle('low', r <= 5000 && r > 0);
    const s = Math.ceil(r / 1000); if (this.sound && r > 0 && s <= 5 && s !== this.lastTickS && this.clock.paused == null) { this.lastTickS = s; SFX.play('tick'); }
  }
  // ---------- اللوحة: السؤال أو البطاقة ----------
  drawPanel(P) {
    const I = P.I || {};
    const key = JSON.stringify([P.g, P.ph, P.ii, I.qid, I.rv, I.bz, I.lk, I.scene ? I.scene.length + (I.obs || '') : 0, I.res2 ? 1 : 0, I.vt && [I.vt.cr, Object.keys(I.vt.lk || {}), I.vt.tr], I.wset, I.wpick, P.rev, P.tie, P.g ? 0 : (this.R.L || []).length + (P.fp || ''), P.ph === 'welcome' ? (this.R.L || []).length : 0, P.T.map(t => t[5]).join()]);
    const fresh = key !== this.panelKey; this.panelKey = key;
    const m = this.mode(P);
    let side = '', center = '';
    if (!P.g || (P.g === 'opening' && P.ph === 'welcome')) center = this.joinCard(P);
    else if (P.g === 'opening') center = this.openingCard(P);
    else if (P.g === 'crown') center = this.crownCard(P);
    else if (P.ph === 'intro') center = this.introCard(P);
    else if (P.ph === 'done') center = `<div class="card-c slim"><div class="h1">انتهت جولة ${esc(P.gn)}</div><div class="mut" style="font-size:30px">الجزيرة كما بنيتموها حتى الآن</div></div>`;
    else if (m === 'focus') center = this.sceneCard(P);
    else side = this.questionHTML(P);
    if (fresh) {
      this.panel.classList.toggle('hide', !side); this.center.classList.toggle('hide', !center);
      if (side) this.panel.innerHTML = side; if (center) this.center.innerHTML = center;
    }
    this.updateDyn(P);
    this.banner(P);
  }
  joinCard(P) {
    const url = joinUrl(P.code, P.fp), L = this.R.L || [], T = this.teams();
    return `<div class="join-card"><div class="jt"><div class="h1">انضموا إلى <span>${esc(P.title || 'ميدان بناء')}</span></div><div class="mut" style="font-size:28px">امسح الرمز بكاميرا الجوال، أو افتح الرابط وأدخل الرمز</div><div class="code">${esc(P.code)}</div>${url ? `<div class="url">${esc(url.replace(/^https?:\/\//, ''))}</div>` : ''}<div class="tcount">${T.map(t => `<span style="--tc:${t.color}">${esc(t.name)}: ${L.filter(x => x[2] === t.id).length}</span>`).join('')}</div></div><div class="qr">${url ? qrSvg(url) : '<div style="color:#333;font-size:26px;text-align:center;padding:20px">أضف رابط الصفحة من الإعدادات</div>'}</div></div>`;
  }
  openingCard(P) {
    if (P.ph === 'explain') { const L = D.PITCH(this.teams().length); return `<div class="card-c"><div class="wl small">${Brand.logoImg()}</div><div class="pitch">${L.map((x, i) => `<div style="animation-delay:${i * .5}s">${esc(x)}</div>`).join('')}</div></div>`; }
    if (P.ph === 'themes') return `<div class="card-c slim top"><div class="h1">🎨 اختاروا طابع قريتكم</div><div class="mut" style="font-size:28px">قائد كل فريق يختار من جواله: ${D.THEME_KEYS.map(k => D.THEMES[k].name).join('، ')}</div></div>`;
    return `<div class="card-c slim top"><div class="h1">🏝️ الجزيرة جاهزة… لنبدأ!</div></div>`;
  }
  introCard(P) { return `<div class="card-c"><div class="ico">${esc(P.gi || '🏁')}</div><div class="h1 big">${esc(P.gn)}</div><div class="how">${(P.how || []).map((x, i) => `<div style="animation-delay:${.3 + i * .35}s"><b>${i + 1}</b>${esc(x)}</div>`).join('')}</div>${P.mult > 1 ? '<div class="x2b">النقاط مضاعفة ×2</div>' : ''}</div>`; }
  sceneCard(P) {
    const I = P.I; const sc = I.scene;
    const head = P.ph === 'show' ? '👁️ ركّزوا جيدًا…' : (I.obs === 'removed' || I.obs === 'added' || I.obs === 'color' ? '🔎 هذه هي الصورة الآن' : '');
    return `<div class="scene-wrap">${head ? `<div class="scene-h">${head}</div>` : ''}${sceneSVG(sc)}${P.ph === 'open' ? `<div class="scene-q">${esc(I.q)}</div><div data-dyn="status"></div>` : ''}</div>`;
  }
  questionHTML(P) {
    const I = P.I || {};
    let h = '';
    if (I.tr) h += `<div class="tr-h">⛵ سفينة الكنز رست! <b>+${I.tg} ذهب</b> لأول إجابة صحيحة</div>`;
    if (I.pair && I.pair.length === 2) { const [a, b] = I.pair.map(id => this.tm(id)); h += `<div class="vs"><span class="${(I.lk || []).includes(I.pair[0]) ? 'lk' : ''}" style="--tc:${a.color}">${esc(a.name)}</span><b>⚔️</b><span class="${(I.lk || []).includes(I.pair[1]) ? 'lk' : ''}" style="--tc:${b.color}">${esc(b.name)}</span></div>`; }
    if (I.k === 'vault') return h + this.vaultHTML(P);
    if (I.wq && P.ph === 'wager') return h + `<div class="q">🎲 سؤال الرهان</div><div class="sub">قائد كل فريق يحدد رهانه من جواله (حتى ربع نقاط فريقه)</div><div class="wl-list">${this.teams().map(t => `<span style="--tc:${t.color}" class="${(I.wset || []).includes(t.id) ? 'ok' : ''}">${esc(t.name)} ${(I.wset || []).includes(t.id) ? '✓' : '…'}</span>`).join('')}</div>`;
    h += `<div class="q ${String(I.q || '').length > 70 ? 'sm' : ''}">${esc(I.q || '')}</div>`;
    const showC = I.c && (P.ph !== 'ready' || P.mode !== 'buzz');
    if (showC) { const tot = I.dist ? I.dist.reduce((a, b) => a + b, 0) : 0; h += `<div class="choices">${I.c.map((c, i) => { const ok = I.rv && I.a === i, dim = I.rv && I.a !== undefined && I.a !== i; const pc = tot ? Math.round(100 * (I.dist[i] || 0) / tot) : 0; return `<div class="ch ${ok ? 'ok' : ''} ${dim ? 'dim' : ''}"><span class="L">${LET[i]}</span><span class="t">${esc(c)}</span>${I.dist ? `<span class="cnt">${I.dist[i] || 0}</span><i style="width:${pc}%"></i>` : ''}</div>`; }).join('')}</div>`; }
    h += '<div data-dyn="status"></div>';
    if (I.rv) h += this.resultsHTML(P);
    return h;
  }
  statusHTML(P) {
    const I = P.I || {}; if (!P.I || I.rv) return '';
    if (P.ph === 'ready') return `<div class="st">استعدوا…</div>`;
    if (P.ph === 'answering' && I.bz) { const t = this.tm(I.bz[0]); return `<div class="st"><span class="pill-t" style="--tc:${t.color}">⚡ ${esc(t.name)}${I.bz[1] ? ' — ' + esc(I.bz[1]) : ''}</span>${I.late ? `<div class="late">بعده: ${I.late.map(l => esc(l[0]) + ' +' + (l[1] / 1000).toFixed(2) + 'ث').join(' · ')}</div>` : ''}</div>`; }
    if (P.ph === 'paused') return `<div class="st">❌ إجابة خاطئة — الفرصة للفريق الآخر</div>`;
    if (P.ph === 'open' && I.wq) return `<div class="wl-list">${this.teams().map(t => `<span style="--tc:${t.color}" class="${(I.wpick || []).includes(t.id) ? 'ok' : ''}">${esc(t.name)} ${(I.wpick || []).includes(t.id) ? '✓' : '…'}</span>`).join('')}</div><div class="st">القادة يجيبون من جوالاتهم</div>`;
    if (P.ph === 'open' && P.mode === 'buzz') return `<div class="st">⚡ <b>الاستباق مفتوح</b> — اضغطوا الزر في جوالاتكم</div>`;
    if (P.ph === 'open' && P.mode === 'all') return `<div class="prog">${this.teams().map(t => `<span style="--tc:${t.color}">${esc(t.name)} <b>${(I.abt && I.abt[t.id]) || 0}</b></span>`).join('')}</div>`;
    return '';
  }
  updateDyn(P) { $$('[data-dyn="status"]', this.el).forEach(d => { const h = this.statusHTML(P); if (d._h !== h) { d._h = h; d.innerHTML = h; } }); }
  resultsHTML(P) {
    const I = P.I, R = I.res2;
    if (!R) return `<div class="st">لم يُجب أحد — الإجابة: <b>${esc(I.c ? I.c[I.a] : '')}</b></div>`;
    if (R.team !== undefined) { if (!R.team) return `<div class="st">لم يُجب أحد إجابة صحيحة</div>`; const t = this.tm(R.team); return `<div class="st"><span class="pill-t" style="--tc:${t.color}">✅ ${esc(t.name)}</span> ${R.pts ? `<b class="g">+${R.pts} نقطة</b>` : ''} <b class="gold">+${R.gold} 💰</b></div>`; }
    const T = this.teams();
    return `<div class="res">${T.filter(t => R[t.id]).map(t => { const r = R[t.id]; let sub = ''; if (r.n !== undefined) sub = `${r.ok} من ${r.n}`; if (r.w !== undefined) sub = (r.ok ? '✅ ' : '❌ ') + 'رهان ' + r.w; return `<div style="--tc:${t.color}"><b>${esc(t.name)}</b><span class="p">${r.pts > 0 ? '+' : ''}${r.pts || 0}</span><small>${sub}</small></div>`; }).join('')}</div>${I.fast ? `<div class="st sm">⚡ أسرع إجابة صحيحة: <b>${esc(I.fast)}</b></div>` : ''}`;
  }
  vaultHTML(P) {
    const I = P.I, T = this.teams(), V = I.vt || { cr: {}, lk: {}, tr: {} };
    return `<div class="term"><div class="tl">&gt; خزنة الجزيرة مقفلة برمز من ${V.n || 4} أرقام</div><div class="tl">&gt; ${P.ph === 'ready' ? 'استعدوا…' : 'التلميحات في جوالات أعضاء كل فريق'}</div><div class="tl">&gt; الرمز: ${I.rv ? esc(I.a) : '████'}</div>${T.map(t => { const c = V.cr[t.id], lk = V.lk[t.id]; return `<div class="tt ${c ? 'ok' : lk ? 'lk' : ''}" style="--tc:${t.color}"><b>${esc(t.name)}</b><span>${c ? `✅ فُتحت — المركز ${c[0]}` : lk ? '⛔ رمز خاطئ' : P.ph === 'open' ? '⌛ يحاولون…' : '🔒'}</span><small>${(V.tr || {})[t.id] || 0} محاولة</small></div>`; }).join('')}</div>`;
  }
  banner(P) {
    const L = $('.banner-layer', this.el), I = P.I;
    if (P.ph === 'answering' && I && I.bz) { const t = this.tm(I.bz[0]); const k = 'bz' + I.qid + I.bz[0] + I.bo; if (L.dataset.k !== k) { L.dataset.k = k; L.innerHTML = `<div class="bb" style="--tc:${t.color}"><div class="t">⚡ ${esc(t.name)}</div>${I.bz[1] ? `<div class="s">${esc(I.bz[1])}</div>` : ''}</div>`; clearTimeout(this.bto); this.bto = setTimeout(() => { L.innerHTML = ''; }, 1700); } }
    else if (L.dataset.k) { L.dataset.k = ''; L.innerHTML = ''; }
  }
  crownCard(P) {
    const rk = (P.rk || []).map(r => ({ ...this.tm(r[0]), id: r[0], score: r[1], rank: r[2] }));
    if (P.ph === 'island') return `<div class="card-c slim top"><div class="h1">🏝️ هذه جزيرتكم بعد ساعة من البناء</div></div>`;
    if (P.ph === 'highlights') { const H = P.hl || []; const lbl = { build: '🏗️ أعظم عمران', gold: '💰 أكثر ذهبًا كسبًا', star: '⭐ نجم الإجابات' }; return `<div class="card-c"><div class="h1">أبرز الإنجازات</div><div class="hl">${H.map((h, i) => { const t = this.tm(h.team); return `<div style="--tc:${t.color};animation-delay:${i * .6}s"><span>${lbl[h.k]}</span><b>${esc(h.name ? h.name + ' — ' + t.name : t.name)}</b><small>${h.k === 'build' ? h.v + ' مبانٍ' : h.k === 'gold' ? h.v + ' ذهب' : h.v + ' إجابات صحيحة'}</small></div>`; }).join('') || '<div class="mut">—</div>'}</div></div>`; }
    if (P.ph === 'reveal') return `<div class="card-c slim top"><div class="h1">🥁 الترتيب النهائي…</div></div>`;
    if (P.ph === 'winner') { if (P.tie) return `<div class="card-c slim top"><div class="h1">⚖️ تعادل في الصدارة! جولة كسر التعادل</div></div>`; const w = rk[0]; return `<div class="win-card" style="--tc:${w.color}"><div class="wl">${Brand.logoImg()}</div><div class="h1">🏆 فريق <span>${esc(w.name)}</span> بطل ميدان بناء</div><div class="mut" style="font-size:30px">${w.score} نقطة</div></div>`; }
    return '';
  }
}
