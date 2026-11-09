// اختبار عشوائي شامل: آلاف المسابقات بأوامر عشوائية مسموحة، وتحالفات وغدر وهدايا وبينيات عشوائية،
// ويُفحص بعد كل خطوة أن الحالة سليمة (لا مورد سالب، لا عاصمة ساقطة، لا حلف معوج، لا قلعة قبل وقتها...).
const path = require('path');
global.d3 = require(path.join(__dirname, '../r3d/node_modules/d3-delaunay'));
require('../proto/rayat-map.js');
const R = require('../game/rules.js');
const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const N = +process.argv[2] || 1500;
let games = 0, steps = 0, duels = 0, bad = [];
const pick = (a, r) => a[Math.floor(r() * a.length)];
for (let g = 1; g <= N; g++) {
  const r = rng(g * 31 + 7), n = 2 + (g % 5), M = RayatMap.build(n, g), S = R.setup(M, Array.from({ length: n }, (_, i) => ({ name: 'ف' + i })));
  const chk = w => { const e = R.check(S); if (e.length && bad.length < 10) bad.push(`مسابقة ${g} (${n} فرق) ${w}: ${e.join('، ')}`); };
  try {
    for (let ph = 0; ph < R.CFG.PHASES.length - 1; ph++) {
      if (ph) R.setPhase(S, ph); chk('مرحلة');
      const cycles = 2 + Math.floor(r() * 6);
      for (let c = 0; c < cycles; c++) {
        // دبلوماسية عشوائية
        S.teams.forEach(T => { const x = r();
          try { if (x < .15) R.offer(S, T.id, Math.floor(r() * n)); else if (x < .25 && T.offerFrom != null) R.accept(S, T.id, r() < .6); else if (x < .3) R.gift(S, T.id, pick(R.RES, r), 1 + Math.floor(r() * 4)); else if (x < .33) R.endQuiet(S, T.id); } catch (e) { /* رفض مسموح */ }
          chk('دبلوماسية'); });
        const tr = R.startCycle(S, S.teams.map(() => pick([0, .2, .4, .6, .8, 1], r)), S.teams.map(() => r())); chk('بداية');
        if (r() < .1) R.bonusOrders(S, Math.floor(r() * n), 1 + Math.floor(r() * 5));
        for (const t of tr.order) while (S.turn.left[t] > 0) {
          const L = R.legal(S, t); if (!L.length) { R.skip(S, t); continue; }
          const o = pick(L, r), D = R.act(S, t, o); steps++; chk('أمر ' + o.k);
          if (D) { duels++; let res = null, k = 0; while (!res && k++ < 9) res = R.point(S, r() < .5 ? 'a' : 'd'); if (!res) throw new Error('مواجهة لا تنتهي'); chk('مواجهة'); }
          if (r() < .1) { const p = Math.floor(r() * n); R.predict(S, p, Math.floor(r() * 5)); }
        }
        R.endCycle(S); chk('حصاد');
      }
    }
    R.setPhase(S, R.CFG.PHASES.length - 1); chk('نهاية'); if (!S.done) bad.push(`مسابقة ${g}: لم تنتهِ`);
    games++;
  } catch (e) { if (bad.length < 10) bad.push(`مسابقة ${g} (${n} فرق): ${e.message}`); }
}
console.log(`عشوائي: ${games}/${N} مسابقة سليمة، ${steps} أمر، ${duels} مواجهة، ${bad.length} خلل`);
bad.forEach(b => console.log('✗', b));
process.exit(bad.length ? 1 : 0);
