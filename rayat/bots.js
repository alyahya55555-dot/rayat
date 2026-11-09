/* لاعبون آليون لـ«رايات»: قائد ذكي أو عشوائي، يستعملهم اختبار التوازن والتشغيل التجريبي في المتصفح. */
(function (root) {
  const E = typeof module !== 'undefined' && module.exports ? require('./engine.js') : root.RayatEngine;
  const { PROD, RES } = E;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  // احتمال أن يعرف لاعب معرفته p الإجابة، حسب الصعوبة
  const qOk = (p, d) => clamp(p + ({ 1: 0.15, 2: 0, 3: -0.2 })[d || 2], 0.05, 0.97);

  // ---------- القائد ----------
// smart: يقيّم كل أمر بقيمته واحتمال نجاحه ويحسب حساب الحدود والحلف. naive: يختار أمرًا صالحًا عشوائيًا.
function value(e, rid) { const p = PROD[e.s.regions[rid].type] || {}; return ((p.gold || 0) + (p.food || 0) + (p.stone || 0)) * 0.15; } // نقاط الإنتاج
function roundP(pa, pd) { return clamp(0.5 + 0.9 * (pa - pd) - 0.08, 0.08, 0.92); }
function winP(e, att, rid, pEst) {
  const def = e.s.owner[rid], pa = pEst[att];
  if (!def) return qOk(pa, 3);
  const r = roundP(pa, pEst[def]), kind = rid === e.s.castle ? 'castle' : e.isFort(rid) ? 'fort' : 'normal';
  const byp = e.revengeOn(att, def) || e.allied(att, def);
  const bo3 = r * r * (3 - 2 * r);
  if (kind === 'castle') return bo3;
  return kind === 'fort' && !byp ? (e.R.fortHold >= 2 ? bo3 : r * r) : r;
}
function decide(e, tid, n, brain, pEst, rng) {
  const s = e.s, t = e.team(tid), res = Object.assign({}, t.res), R = e.R, ph = e.ph(), out = [];
  const mine = new Set(e.regionsOf(tid)), pending = new Set(); let attacked = false;
  const touches = rid => s.regions[rid].nb.some(j => mine.has(j));
  const enemyNb = rid => s.regions[rid].nb.filter(j => s.owner[j] && s.owner[j] !== tid && !e.allied(tid, s.owner[j])).length;
  const rk = e.ranking(), leader = rk[0].id;
  for (let k = 0; k < n; k++) {
    const opts = [];
    s.regions.forEach(r => {
      const id = r.id, own = s.owner[id];
      if (pending.has(id)) return;
      if (!own && id !== s.castle && touches(id) && res.food >= R.cost.occupy) opts.push({ o: { k: 'occupy', r: id }, u: 3 + value(e, id) });
      if (own === tid && !s.fort[id] && r.type !== 'capital' && id !== s.castle && res.stone >= R.cost.fortify) {
        const th = enemyNb(id), soon = r.nb.filter(j => !s.owner[j]).length;
        const u = ph.attack ? Math.min(3, th) * 0.35 * (1 + value(e, id)) : (ph.k === 'expand' && e.phaseLeft() < 4 * 60000 ? Math.min(2, soon) * 0.15 : 0);
        if (u > 0) opts.push({ o: { k: 'fortify', r: id }, u });
      }
      if (ph.attack && !attacked && id !== undefined && touches(id) && own !== tid && (own || (id === s.castle && ph.castle))) {
        const ally = own && e.allied(tid, own);
        if (ally && brain !== 'smart') return;
        const cost = e.attackCost(tid, own); if (res.gold < cost) return;
        const P = winP(e, tid, id, pEst);
        let gain = r.type === 'capital' ? Math.max(0, RES.reduce((a, x) => a + e.team(own).res[x], 0) * R.loot - 15) / 20 : 2 + value(e, id) + (id === s.castle ? 8 : 0) - (own ? 0 : 1);
        if (own === leader && own !== tid) gain += 0.5;
        if (brain === 'smart' && P < 0.25) return;
        let u = P * gain - cost * 0.05;
        if (ally) { // النقض: يستحق فقط حين يكون الحليف متصدرًا أو الضربة مغرية قرب النهاية
          const late = ['siege'].includes(ph.k) || (ph.k === 'war' && e.phaseLeft() < 6 * 60000);
          if (!(late && (own === leader || P * gain > 2))) return; u -= 0.5;
          opts.push({ o: { k: 'attack', r: id, betray: true }, u }); return;
        }
        opts.push({ o: { k: 'attack', r: id }, u });
      }
    });
    const low = RES.slice().sort((a, b) => res[a] - res[b])[0];
    const want = ph.attack ? (res.gold < R.cost.attack ? 'gold' : low) : (res.food < R.cost.occupy ? 'food' : low);
    opts.push({ o: { k: 'supply', res: brain === 'smart' ? want : RES[Math.floor(rng() * 3)] }, u: 0.35 });
    let pick;
    if (brain === 'smart') pick = opts.sort((a, b) => b.u - a.u)[0];
    else { const real = opts.filter(x => x.o.k !== 'supply' && (x.o.k !== 'attack' || rng() < 0.5)); pick = real.length && rng() < 0.8 ? real[Math.floor(rng() * real.length)] : opts[opts.length - 1]; }
    const o = pick.o; out.push(o);
    if (o.k === 'occupy') { res.food -= R.cost.occupy; mine.add(o.r); pending.add(o.r); }
    if (o.k === 'fortify') { res.stone -= R.cost.fortify; pending.add(o.r); }
    if (o.k === 'attack') { res.gold -= e.attackCost(tid, s.owner[o.r]); attacked = true; pending.add(o.r); }
    if (o.k === 'supply') res[o.res] += R.supply;
  }
  return out;
}
// الحلف: الذكي يحالف جارًا ليس متصدرًا، ويقبل ممن ليس متصدرًا بفارق
function diplomacy(e, prof, rng) {
  const s = e.s; if (!e.ph().ally) return;
  const rk = e.ranking(), top = rk[0];
  s.offers.slice().forEach(o => { const b = prof[o.to].brain; const yes = b === 'smart' ? !(o.from === top.id && top.score - rk[1].score > 2) : rng() < 0.5; e.answerAlly(o.to, o.from, yes, s.captain[o.to]); });
  s.teams.forEach(t => {
    if (t.ally || prof[t.id].brain !== 'smart' || rng() > 0.3) return;
    const border = {}; e.regionsOf(t.id).forEach(i => s.regions[i].nb.forEach(j => { const o = s.owner[j]; if (o && o !== t.id) border[o] = (border[o] || 0) + 1; }));
    const cand = Object.keys(border).filter(x => x !== top.id && !e.team(x).ally && !(t.revenge && t.revenge.on === x)).sort((a, b) => border[b] - border[a]);
    if (cand[0]) e.offerAlly(t.id, cand[0], s.captain[t.id]);
  });
}


  const api = { decide, diplomacy, qOk, value, winP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RayatBots = api;
})(typeof window !== 'undefined' ? window : globalThis);
