// رايات — مولّد الخريطة ورسمها (SVG). يعتمد على d3.Delaunay
(function (G) {
  const W = 1920, H = 1080;
  const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const NAMES = ['وادي الريح', 'جبل السحاب', 'سهل الذهب', 'مرفأ اللؤلؤ', 'عين الصفا', 'تل الصقر', 'غابة الأرز', 'هضبة الفجر', 'جرف النسور', 'خليج المرجان', 'مروج السنابل', 'بئر الوفاء', 'رأس الريح', 'سفح الغمام', 'واحة النخيل', 'صخرة البحّار', 'كثيب النجم', 'وادي الغيث', 'قمة الشهباء', 'ضفاف الندى', 'حقول الريحان', 'شعاب القمر', 'ربوة الخزامى', 'مرج الحمام', 'منجم الفضة', 'نبع الرمان', 'تلال العنبر', 'سهل الفرسان', 'درب القوافل', 'كهف الصدى', 'أرض السدرة', 'وادي العقيق', 'حمى الأبطال', 'مرسى الأمان'];
  const ISLE_NAMES = ['جزيرة الياقوت', 'جزيرة المحار', 'صخرة المنارة', 'شاطئ العنبر'];
  const TYPES = {
    farm: { name: 'مزارع', res: 'food', base: '#9cc45a', icon: '🌾' },
    mine: { name: 'منجم', res: 'gold', base: '#b9935f', icon: '💰' },
    quarry: { name: 'محجر', res: 'stone', base: '#a7a69a', icon: '🪨' },
    village: { name: 'قرية', res: 'mix', base: '#86b864', icon: '🏘️' },
    port: { name: 'ميناء', res: 'gold', base: '#8fbf9a', icon: '⚓' },
    rich: { name: 'منجم الجزيرة', res: 'gold', base: '#c9a45c', icon: '💎' },
    capital: { name: 'عاصمة', res: 'all', base: '#8bbb63', icon: '👑' },
    castle: { name: 'القلعة الكبرى', res: 'gold', base: '#a3a08f', icon: '🏰' }
  };
  // شكل الجزيرة: دائرة مشوّهة بموجات ثابتة
  function blob(cx, cy, rx, ry, k, n = 160) {
    const pts = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, r = 1 + k[0] * Math.sin(3 * a + k[1]) + k[2] * Math.sin(5 * a + k[3]) + k[4] * Math.sin(9 * a + k[5]) + .018 * Math.sin(17 * a); pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]); }
    return pts;
  }
  const inPoly = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
  const scalePoly = (poly, c, s) => poly.map(([x, y]) => [c[0] + (x - c[0]) * s, c[1] + (y - c[1]) * s]);
  const smooth = pts => { let d = ''; const n = pts.length; for (let i = 0; i < n; i++) { const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n]; if (!i) d += `M${p1[0].toFixed(1)},${p1[1].toFixed(1)}`; const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]; d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`; } return d + 'Z'; };
  const centroid = poly => { let a = 0, x = 0, y = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const f = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]; a += f; x += (poly[j][0] + poly[i][0]) * f; y += (poly[j][1] + poly[i][1]) * f; } a *= 3; return [x / a, y / a]; };

  // بناء الخريطة: الأقاليم ومجاوراتها وأنواعها
  const START = ['farm', 'mine'];
  function build(nTeams = 4, seed = 7) {
    const R = rng(seed), main = { c: [930, 600], poly: blob(930, 600, 700, 380, [.07, 1.2, .05, 2.1, .025, .4]) };
    const isles = [{ c: [1730, 250], poly: blob(1730, 250, 150, 92, [.08, .3, .06, 1, .03, 2]) }, { c: [215, 930], poly: blob(215, 930, 160, 88, [.07, 2, .06, .5, .03, 1]) }];
    const total = Math.min(40, 6 * nTeams + 8), nIsle = 2 * isles.length, nMain = total - nIsle; // القلعة من ضمن الرئيسية
    const seeds = [{ p: main.c.slice(), land: 0, castle: true }];
    const inner = scalePoly(main.poly, main.c, .86), minD = Math.sqrt(700 * 380 * 3.1 / nMain) * .72;
    while (seeds.filter(s => s.land === 0).length < nMain) {
      let best = null, bd = -1;
      for (let k = 0; k < 40; k++) { const p = [main.c[0] + (R() * 2 - 1) * 720, main.c[1] + (R() * 2 - 1) * 400]; if (!inPoly(p, inner) || Math.hypot(p[0] - main.c[0], (p[1] - main.c[1]) * 1.35) < 215) continue; const d = Math.min(...seeds.map(s => Math.hypot(s.p[0] - p[0], (s.p[1] - p[1]) * 1.25))); if (d > bd) { bd = d; best = p; } }
      if (best && bd > minD * .55) seeds.push({ p: best, land: 0 }); else if (best && seeds.length > 400) break;
    }
    isles.forEach((is, k) => { seeds.push({ p: [is.c[0] - 66, is.c[1] + 14], land: k + 1 }); seeds.push({ p: [is.c[0] + 66, is.c[1] - 14], land: k + 1 }); });
    const pts = seeds.map(s => s.p), del = d3.Delaunay.from(pts), vor = del.voronoi([-200, -200, W + 200, H + 200]);
    const regions = seeds.map((s, i) => { const poly = vor.cellPolygon(i); return { id: i, seed: s.p, land: s.land, castle: !!s.castle, poly, nb: [] }; });
    regions.forEach(r => { for (const j of del.neighbors(r.id)) if (regions[j].land === r.land) r.nb.push(j); });
    // مركز مرئي للإقليم داخل اليابسة: نقطة البذرة مسحوبة قليلًا نحو مركز الخلية
    const landPoly = l => l === 0 ? main.poly : isles[l - 1].poly;
    regions.forEach(r => { const c = centroid(r.poly); let p = [(c[0] + r.seed[0] * 2) / 3, (c[1] + r.seed[1] * 2) / 3]; if (!inPoly(p, scalePoly(landPoly(r.land), r.land ? isles[r.land - 1].c : main.c, .9))) p = r.seed.slice(); r.at = p; r.coast = !inPoly(c, scalePoly(landPoly(r.land), r.land ? isles[r.land - 1].c : main.c, .97)) || Math.hypot(...[0, 1].map(k => r.seed[k] - (r.land ? isles[r.land - 1].c : main.c)[k])) > 260; });
    // العواصم: موزعة بالتساوي حول المركز
    const caps = []; for (let t = 0; t < nTeams; t++) { const a = -Math.PI * .75 + t * Math.PI * 2 / nTeams, tgt = [main.c[0] + Math.cos(a) * 520, main.c[1] + Math.sin(a) * 270]; let b = null, bd = 1e9; regions.forEach(r => { if (r.land || r.castle || caps.includes(r.id) || r.nb.some(j => regions[j].castle)) return; const d = Math.hypot(r.at[0] - tgt[0], r.at[1] - tgt[1]); if (d < bd) { bd = d; b = r.id; } }); caps.push(b); }
    caps.forEach(id => { regions[id].type = 'capital'; });
    // أرض البداية: إقليمان ملاصقان للعاصمة من جهة الخلف (الأبعد عن المركز)، بنفس النوعين لكل الفرق
    const dC = r => Math.hypot(r.at[0] - main.c[0], (r.at[1] - main.c[1]) * 1.8), taken = new Set(caps);
    const team = {}; caps.forEach((id, t) => { team[id] = t; });
    const starts = caps.map(() => []), free = (r, t, strict) => !r.land && !r.castle && !taken.has(r.id) && !r.nb.some(k => team[k] != null && team[k] !== t && (strict || caps.includes(k)));
    for (const strict of [true, false]) for (let k = 0; k < 2; k++) caps.forEach((id, t) => { if (starts[t].length > k) return; const r = regions[id].nb.map(j => regions[j]).filter(x => free(x, t, strict)).sort((a, b) => dC(b) - dC(a))[0]; if (r) { starts[t].push(r.id); taken.add(r.id); team[r.id] = t; } });
    starts.forEach(two => two.forEach((j, k) => { regions[j].type = START[k]; }));
    regions.forEach(r => { if (r.castle) r.type = 'castle'; else if (r.land) r.type = 'rich'; });
    // موانئ: أقرب إقليم ساحلي لكل جزيرة صغيرة
    const routes = isles.map((is, k) => { let b = null, bd = 1e9; regions.forEach(r => { if (r.land || r.type) return; const d = Math.hypot(r.at[0] - is.c[0], r.at[1] - is.c[1]); if (d < bd) { bd = d; b = r; } }); b.type = 'port'; const to = regions.filter(r => r.land === k + 1).sort((x, y) => Math.hypot(x.at[0] - b.at[0], x.at[1] - b.at[1]) - Math.hypot(y.at[0] - b.at[0], y.at[1] - b.at[1]))[0]; b.nb.push(to.id); to.nb.push(b.id); return { from: b.id, to: to.id }; });
    // بقية الأنواع: توزيع متوازن (دورة ثابتة مخلوطة)
    // الأعداد النهائية متساوية تقريبًا بين الأنواع الأربعة (بعد احتساب أرض البداية)، والمتجاوران غالبًا مختلفان
    const rest = regions.filter(r => !r.type).sort((a, b) => Math.atan2(a.at[1] - main.c[1], a.at[0] - main.c[0]) - Math.atan2(b.at[1] - main.c[1], b.at[0] - main.c[0]));
    const K4 = ['farm', 'mine', 'quarry', 'village'], cnt = Object.fromEntries(K4.map(k => [k, regions.filter(r => r.type === k).length])), goal = (rest.length + K4.reduce((a, k) => a + cnt[k], 0)) / 4;
    const need = Object.fromEntries(K4.map(k => [k, Math.max(0, goal - cnt[k])])), seq = [];
    for (let i = 0; i < rest.length; i++) { const k = K4.filter(x => !seq.slice(-2).includes(x)).sort((a, b) => need[b] - need[a] || K4.indexOf(a) - K4.indexOf(b))[0]; seq.push(k); need[k]--; }
    const off = Math.floor(R() * rest.length); rest.forEach((r, i) => { r.type = seq[(i + off) % seq.length]; });
    const POOL = { farm: ['مروج السنابل', 'حقول الريحان', 'مرج الحمام', 'واحة النخيل', 'ضفاف الندى', 'نبع الرمان', 'وادي الغيث', 'أرض السدرة', 'ربوة الخزامى', 'سهل الخيرات'], mine: ['منجم الفضة', 'جبل السحاب', 'قمة الشهباء', 'جرف النسور', 'كهف الصدى', 'وادي العقيق', 'تلال العنبر', 'جبل الكحل'], quarry: ['صخرة البحّار', 'هضبة الفجر', 'سفح الغمام', 'شعاب القمر', 'رأس الريح', 'كثيب النجم', 'حرّة الصوّان'], village: ['عين الصفا', 'بئر الوفاء', 'تل الصقر', 'درب القوافل', 'غابة الأرز', 'سهل الفرسان', 'حمى الأبطال', 'وادي الريح'], port: ['مرفأ اللؤلؤ', 'خليج المرجان', 'مرسى الأمان', 'ميناء الشراع'], capital: ['العاصمة'] }, used = {};
    let ii = 0; regions.forEach(r => { if (r.castle) r.name = 'القلعة الكبرى'; else if (r.land) r.name = ISLE_NAMES[ii++]; else { const P = POOL[r.type] || NAMES, k = used[r.type] = (used[r.type] || 0) + 1; r.name = P[(k - 1) % P.length]; } });
    return { W, H, main, isles, regions, caps, starts, routes };
  }

  // خريطة عادلة: كل فريق له إقليما بداية، ولا تتلاصق أراضي الفرق في البداية. تُجرَّب البذور تباعًا
  function fair(nTeams = 4, seed = 7) {
    for (let k = 0; k < 200; k++) {
      const M = build(nTeams, seed + k), own = {}; M.caps.forEach((c, t) => { own[c] = t; }); M.starts.forEach((st, t) => st.forEach(j => { own[j] = t; }));
      const ok = M.starts.every(st => st.length === 2) && Object.keys(own).every(i => M.regions[i].nb.every(j => own[j] == null || own[j] === own[i]));
      if (ok) { M.seed = seed + k; return M; }
    }
    throw new Error('no fair map');
  }
  const mix = (a, b, t) => { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const A = p(a), B = p(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  const f1 = n => n.toFixed(1);
  // رسومات صغيرة لكل نوع أرض
  const sprite = {
    farm: (x, y) => { let s = ''; for (let i = -2; i <= 2; i++) s += `<path d="M${f1(x - 34 + i * 4)},${f1(y + i * 9)} l68,-10" stroke="#e9d27a" stroke-width="5" stroke-linecap="round" opacity=".9"/>`; return `<g opacity=".95">${s}<rect x="${x - 6}" y="${y - 30}" width="12" height="14" rx="2" fill="#a4643b"/><path d="M${x - 9},${y - 30} l9,-9 l9,9z" fill="#7b3f20"/></g>`; },
    mine: (x, y) => `<g><path d="M${x - 44},${y + 14} L${x - 14},${y - 30} L${x + 4},${y - 4} L${x + 18},${y - 22} L${x + 46},${y + 14}Z" fill="#8a6a45" stroke="#5e4630" stroke-width="2"/><path d="M${x - 14},${y - 30} l7,10 l-12,0z" fill="#efe6d8"/><path d="M${x - 6},${y + 14} a10,12 0 0 1 20,0z" fill="#2a1d12"/><circle cx="${x + 26}" cy="${y + 6}" r="5" fill="#f4c430"/><circle cx="${x + 34}" cy="${y + 9}" r="4" fill="#f4c430"/></g>`,
    quarry: (x, y) => `<g><path d="M${x - 40},${y + 12} l12,-26 l22,-6 l14,18 l-6,14z" fill="#8f8f8a" stroke="#62625d" stroke-width="2"/><path d="M${x + 4},${y + 12} l8,-20 l20,-2 l12,16 l-8,8z" fill="#a9a9a3" stroke="#62625d" stroke-width="2"/><rect x="${x - 10}" y="${y + 6}" width="14" height="10" fill="#c8c7bf" stroke="#62625d"/></g>`,
    village: (x, y) => { const h = (dx, dy, c) => `<rect x="${x + dx - 9}" y="${y + dy - 8}" width="18" height="14" fill="#e8d9bd" stroke="#8b6b4a"/><path d="M${x + dx - 12},${y + dy - 8} l12,-11 l12,11z" fill="${c}"/>`; return `<g>${h(-22, 4, '#b5523b')}${h(4, -6, '#9b4a33')}${h(22, 10, '#b5523b')}</g>`; },
    port: (x, y) => `<g><rect x="${x - 30}" y="${y - 2}" width="60" height="8" fill="#8b6b4a"/><rect x="${x - 26}" y="${y + 6}" width="4" height="12" fill="#6b4f35"/><rect x="${x + 22}" y="${y + 6}" width="4" height="12" fill="#6b4f35"/><path d="M${x - 8},${y - 34} v28 M${x - 8},${y - 34} l18,20 h-18z" stroke="#5c4632" stroke-width="2" fill="#f5f0e6"/><path d="M${x - 22},${y - 6} h30 l-6,8 h-18z" fill="#7b5236"/></g>`,
    rich: (x, y) => `<g><path d="M${x - 34},${y + 12} L${x - 8},${y - 26} L${x + 14},${y + 2} L${x + 36},${y + 12}Z" fill="#9b7a4a" stroke="#5e4630" stroke-width="2"/><path d="M${x + 6},${y - 4} l8,-12 l8,12 l-8,10z" fill="#5ec8e8" stroke="#2d7ea0"/><circle cx="${x - 16}" cy="${y + 4}" r="5" fill="#f4c430"/></g>`,
    capital: (x, y, col) => `<g><path d="M${x - 46},${y + 18} v-30 h10 v6 h8 v-6 h10 v6 h8 v-6 h10 v6 h8 v-6 h10 v30z" fill="#d9cdb4" stroke="#6b5a40" stroke-width="2"/><rect x="${x - 14}" y="${y - 40}" width="28" height="58" fill="#e6dcc6" stroke="#6b5a40" stroke-width="2"/><path d="M${x - 18},${y - 40} l18,-20 l18,20z" fill="${col}" stroke="#3a2f22" stroke-width="2"/><path d="M${x - 7},${y + 18} v-14 a7,7 0 0 1 14,0 v14z" fill="#3a2f22"/></g>`,
    castle: (x, y) => { const tw = (dx, h) => `<rect x="${x + dx - 15}" y="${y - h}" width="30" height="${h + 30}" fill="#cfc6b0" stroke="#5b5040" stroke-width="2.5"/><path d="M${x + dx - 17},${y - h} h34 v-9 h-6 v5 h-5 v-5 h-6 v5 h-5 v-5 h-6 v5 h-6 v-5 h-0z" fill="#bdb39b" stroke="#5b5040" stroke-width="2"/>`; return `<g><ellipse cx="${x}" cy="${y + 34}" rx="96" ry="22" fill="rgba(0,0,0,.18)"/><rect x="${x - 78}" y="${y - 30}" width="156" height="62" fill="#d8cfb9" stroke="#5b5040" stroke-width="2.5"/>${tw(-78, 56)}${tw(78, 56)}${tw(0, 92)}<path d="M${x - 14},${y + 32} v-26 a14,14 0 0 1 28,0 v26z" fill="#3b3226"/><rect x="${x - 40}" y="${y - 14}" width="8" height="14" fill="#3b3226"/><rect x="${x + 32}" y="${y - 14}" width="8" height="14" fill="#3b3226"/></g>`; }
  };
  const flag = (x, y, col, emb, big) => { const s = big ? 1.45 : 1; return `<g transform="translate(${f1(x)},${f1(y)}) scale(${s})"><rect x="-1.6" y="-62" width="3.2" height="62" fill="#4a3b2a"/><circle cx="0" cy="-63" r="3.2" fill="#e8c35a"/><path d="M1.6,-60 C16,-64 26,-54 44,-58 L44,-32 C26,-28 16,-38 1.6,-34Z" fill="${col}" stroke="rgba(0,0,0,.35)" stroke-width="1.2"/><text x="22" y="-40" font-size="15" text-anchor="middle">${emb}</text></g>`; };

  // ---------- الرسم ----------
  // state: { owner: {id|index: teamIdx} أو مصفوفة (‑1/null = محايد)، forts: Set، teams: [{name,color,emb}]، ally: [[a,b]] }
  // الطبقات الثابتة ترسم مرة واحدة، والمتغيرة (الألوان والحدود والحصون والرايات والأسماء والتحالفات) تُحدَّث في مكانها
  const ownOf = st => id => { const v = st.owner[id]; return v == null || v < 0 ? -1 : v; };
  const regionD = r => `M${r.poly.map(p => p.map(f1).join(',')).join('L')}Z`;
  function fillOf(M, st, r) { const ty = TYPES[r.type], o = ownOf(st)(r.id), base = r.coast ? mix(ty.base, '#d9c793', .12) : ty.base; return o < 0 ? mix(base, '#d6d3c2', .3) : mix(base, st.teams[o].color, .72); }
  // الحدود: رفيعة متقطعة داخل الدولة، سميكة بين الدول
  function borders(M, st) {
    const own = ownOf(st);
    if (!M._seg) { const seg = {}; M.regions.forEach(r => { const p = r.poly; for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1], k = [a, b].map(q => q.map(v => Math.round(v * 10)).join(':')).sort().join('|'); (seg[k] = seg[k] || { a, b, c: [] }).c.push(r.id); } }); M._seg = Object.values(seg).filter(e => e.c.length === 2 && M.regions[e.c[0]].land === M.regions[e.c[1]].land); }
    let thin = '', thick = ''; M._seg.forEach(e => { const d = `M${f1(e.a[0])},${f1(e.a[1])}L${f1(e.b[0])},${f1(e.b[1])}`; if (own(e.c[0]) === own(e.c[1])) thin += d; else thick += d; });
    return `<path d="${thin}" stroke="rgba(255,255,255,.55)" stroke-width="2" stroke-dasharray="6 6" fill="none"/><path d="${thick}" stroke="#1d1a14" stroke-opacity=".85" stroke-width="6.5" stroke-linecap="round" fill="none"/><path d="${thick}" stroke="#f3ead2" stroke-opacity=".55" stroke-width="1.4" fill="none"/>`;
  }
  const flagAt = r => [r.at[0] - (r.type === 'castle' ? 0 : 18), r.at[1] - (r.type === 'castle' ? 92 : r.type === 'capital' ? 38 : 4)];
  function flagOf(M, st, r) { const o = ownOf(st)(r.id); if (o < 0) return ''; const [x, y] = flagAt(r); return `<g class="flag" data-id="${r.id}" filter="url(#sh)">${flag(x, y, st.teams[o].color, st.teams[o].emb, r.type === 'capital' || r.type === 'castle')}</g>`; }
  function fortOf(M, st, r) { if (!(st.forts && st.forts.has(r.id)) || r.type === 'capital') return ''; const [x, y] = r.at, o = ownOf(st)(r.id), col = o < 0 ? '#d8d2c0' : st.teams[o].color; return `<g class="fort" data-id="${r.id}" filter="url(#sh)"><path d="M${f1(x + 34)},${f1(y - 18)} h26 v20 q0,16 -13,22 q-13,-6 -13,-22z" fill="#cfc6b0" stroke="#4d4333" stroke-width="2"/><path d="M${f1(x + 41)},${f1(y - 10)} h12 v8 q0,7 -6,10 q-6,-3 -6,-10z" fill="${col}"/></g>`; }
  function labelOf(M, st, r) {
    const [x, y] = r.at, o = ownOf(st)(r.id), ny = y + (r.type === 'castle' ? 82 : 44), nm = r.type === 'capital' ? '👑 ' + (o >= 0 ? st.teams[o].name : 'عاصمة') : r.name + (r.type === 'castle' ? ' ×5' : '');
    return `<text x="${f1(x)}" y="${f1(ny)}" text-anchor="middle" font-size="${r.type === 'castle' ? 28 : r.land ? 17 : r.type === 'capital' ? 21 : 19}" font-weight="800" fill="#fff" stroke="rgba(20,24,20,.82)" stroke-width="5" paint-order="stroke" stroke-linejoin="round">${nm}</text>`;
  }
  // قوس الحلف بين عاصمتين، ويعيد مركزه لرسم الرمز وقطعه عند النقض
  function allyArc(M, a, b) { const A = M.regions[M.caps[a]].at, B = M.regions[M.caps[b]].at, mx = (A[0] + B[0]) / 2, cy = Math.max(A[1], B[1]) + 150; return { d: `M${f1(A[0])},${f1(A[1] - 20)} Q${f1(mx)},${f1(cy)} ${f1(B[0])},${f1(B[1] - 20)}`, mid: [mx, (cy + (A[1] + B[1]) / 2 - 20) / 2] }; }
  function allies(M, st) { return (st.ally || []).map(([a, b]) => { const { d, mid } = allyArc(M, a, b); return `<g class="ally" data-k="${a}-${b}"><path d="${d}" fill="none" stroke="#f4c430" stroke-width="5" stroke-dasharray="14 10" opacity=".9"/><circle cx="${f1(mid[0])}" cy="${f1(mid[1])}" r="22" fill="#1b2a33" stroke="#f4c430" stroke-width="3"/><text x="${f1(mid[0])}" y="${f1(mid[1] + 8)}" font-size="22" text-anchor="middle">🤝</text></g>`; }).join(''); }

  function scene(M, st) {
    const landD = [M.main, ...M.isles].map(l => smooth(l.poly)), own = ownOf(st);
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="rmap">`;
    s += `<defs><radialGradient id="sea" cx="50%" cy="55%" r="75%"><stop offset="0" stop-color="#1f7f97"/><stop offset=".6" stop-color="#145e78"/><stop offset="1" stop-color="#0b3a52"/></radialGradient><clipPath id="land">${landD.map(d => `<path d="${d}"/>`).join('')}</clipPath><filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter><filter id="sh" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-opacity=".45"/></filter><pattern id="waves" width="90" height="40" patternUnits="userSpaceOnUse"><path d="M6,22 q10,-8 20,0 t20,0" stroke="rgba(255,255,255,.10)" stroke-width="2" fill="none"/><path d="M52,8 q8,-6 16,0" stroke="rgba(255,255,255,.07)" stroke-width="2" fill="none"/></pattern></defs>`;
    s += `<rect width="${W}" height="${H}" fill="url(#sea)"/><rect class="waves" width="${W}" height="${H}" fill="url(#waves)"/>`;
    landD.forEach(d => { s += `<path d="${d}" fill="none" stroke="#7fd3d8" stroke-opacity=".35" stroke-width="70" filter="url(#soft)"/><path d="${d}" fill="none" stroke="#9fe3e0" stroke-opacity=".55" stroke-width="26"/>`; });
    M.routes.forEach(r => { const a = M.regions[r.from].at, b = M.regions[r.to].at, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - 60; s += `<path d="M${f1(a[0])},${f1(a[1])} Q${f1(mx)},${f1(my)} ${f1(b[0])},${f1(b[1])}" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="3" stroke-dasharray="10 9"/><text x="${f1(mx)}" y="${f1(my + 16)}" font-size="22" text-anchor="middle">⛵</text>`; });
    s += `<g clip-path="url(#land)"><g id="m-regions">${M.regions.map(r => `<path id="rg-${r.id}" data-id="${r.id}" d="${regionD(r)}" fill="${fillOf(M, st, r)}"/>`).join('')}</g><g id="m-fx-land"></g><g id="m-borders">${borders(M, st)}</g></g>`;
    landD.forEach(d => { s += `<path d="${d}" fill="none" stroke="#e9d9a6" stroke-width="22" clip-path="url(#land)"/><path d="${d}" fill="none" stroke="#c9b27a" stroke-width="2.5"/>`; });
    s += `<g id="m-sprites">${M.regions.map(r => { const o = own(r.id); return `<g filter="url(#sh)">${sprite[r.type](r.at[0], r.at[1] + (r.type === 'castle' ? 0 : 6), o < 0 ? '#d8d2c0' : st.teams[o].color)}</g>`; }).join('')}</g>`;
    s += `<g id="m-forts">${M.regions.map(r => fortOf(M, st, r)).join('')}</g><g id="m-ally">${allies(M, st)}</g><g id="m-flags">${M.regions.map(r => flagOf(M, st, r)).join('')}</g><g id="m-labels">${M.regions.map(r => labelOf(M, st, r)).join('')}</g><g id="m-fx"></g>`;
    return s + `</svg>`;
  }
  // تحديث الطبقات المتغيرة في عنصر svg مرسوم بـ scene. only: أقاليم بعينها تُستثنى (تُرسم بالحركة)
  function paint(el, M, st) {
    const q = id => el.querySelector('#' + id);
    M.regions.forEach(r => { const p = q('rg-' + r.id); if (p) p.setAttribute('fill', fillOf(M, st, r)); });
    q('m-borders').innerHTML = borders(M, st);
    q('m-forts').innerHTML = M.regions.map(r => fortOf(M, st, r)).join('');
    q('m-flags').innerHTML = M.regions.map(r => flagOf(M, st, r)).join('');
    q('m-labels').innerHTML = M.regions.map(r => labelOf(M, st, r)).join('');
    q('m-ally').innerHTML = allies(M, st);
  }
  // صورة ثابتة كاملة (للنماذج): مع إبراز إقليم وسهم هجوم اختياريين
  function svg(M, st) {
    let s = scene(M, st).replace(/<\/svg>$/, '');
    if (st.focus != null) { const r = M.regions[st.focus], d = regionD(r); s += `<mask id="spot"><rect width="${W}" height="${H}" fill="#fff"/><path d="${d}" fill="#000" clip-path="url(#land)"/></mask><rect width="${W}" height="${H}" fill="rgba(5,12,18,.66)" mask="url(#spot)"/><path d="${d}" fill="none" stroke="#ffd34d" stroke-width="7" clip-path="url(#land)"/>`; }
    if (st.attack) s += attackArrow(M, st.attack.from, st.attack.to, st.teams[st.attack.team].color);
    return s + `</svg>`;
  }
  function attackArrow(M, from, to, c) { const a = M.regions[from].at, b0 = M.regions[to].at, b = [b0[0] + (a[0] - b0[0]) * .3, b0[1] + 40 + (a[1] - b0[1]) * .3], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - 70, d = `M${f1(a[0])},${f1(a[1] - 20)} Q${f1(mx)},${f1(my)} ${f1(b[0])},${f1(b[1] - 10)}`; return `<g class="atk"><defs><marker id="ah${from}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0L10,5L0,10z" fill="${c}"/></marker></defs><path d="${d}" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round" opacity=".9"/><path d="${d}" fill="none" stroke="${c}" stroke-width="10" stroke-linecap="round" marker-end="url(#ah${from})"/></g>`; }
  G.RayatMap = { build, fair, scene, paint, svg, attackArrow, allyArc, regionD, flag, flagAt, TYPES, mix, W, H };
})(typeof window !== 'undefined' ? window : globalThis);
