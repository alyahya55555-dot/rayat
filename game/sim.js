// رايات — محاكاة المسابقات الآلية: فرق بمستويات معرفة وحنكة وأساليب مختلفة، وزمن واقعي لكل خطوة.
// الاستعمال: node game/sim.js [عدد المسابقات لكل سيناريو]
const path = require('path');
global.d3 = require(path.join(__dirname, '../r3d/node_modules/d3-delaunay'));
require('../proto/rayat-map.js');
const R = require('./rules.js');
// تجارب الضبط: CFG_PATCH='{"LOOT_MAX":6}' و ORDERS=3 (أوامر 3/2/1)
if (process.env.CFG_PATCH) Object.assign(R.CFG, JSON.parse(process.env.CFG_PATCH));
if (process.env.ORDERS === '3') R.CFG.ORDERS = r => r >= .8 ? 3 : r >= .5 ? 2 : r > 0 ? 1 : 0;
if (process.env.ORDERS === '2b') R.CFG.ORDERS = r => r >= .6 ? 2 : r > 0 ? 1 : 0;

const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DIFF = { opening: .15, expansion: .15, friction: .07, war: 0, siege: -.08, final: -.08 }; // سهلة ← صعبة مع المراحل
const VAL = { food: 1, gold: 1.25, stone: .9 };

// ---------- نموذج الفريق ----------
// q: احتمال أن يعرف العضو الإجابة (سؤال متوسط)، m: عدد الأعضاء، speed: سرعة الاستباق، smart: الحنكة 0..1، style: الأسلوب
function teamModel(t, ph, rnd, hard = 0) { const p = clamp(t.q + DIFF[ph] + hard, .02, .97); return { p, know: 1 - Math.pow(1 - p, 2), lam: t.speed * Math.sqrt(t.m) }; }
function answerRatio(t, ph, rnd) { const p = clamp(t.q + DIFF[ph], .02, .97); let c = 0; for (let i = 0; i < t.m; i++) if (rnd() < p) c++; return c / t.m; }
function duelPoint(A, D, rnd) { // A,D: {know, lam}
  const aFirst = rnd() < A.lam / (A.lam + D.lam), f = aFirst ? A : D, o = aFirst ? D : A;
  if (rnd() < f.know) return { side: aFirst ? 'a' : 'd', pass: false };
  if (rnd() < o.know) return { side: aFirst ? 'd' : 'a', pass: true };
  return { side: 'd', pass: true };
}
const joinSide = (a, b) => ({ know: 1 - (1 - a.know) * (1 - b.know), lam: a.lam + b.lam });

// ---------- عقل القائد ----------
function regionValue(S, r, t) { const y = R.CFG.YIELD[r.type] || {}, lm = R.CFG.LANDMARK_BONUS[r.landmark] || {};
  let v = (r.type === 'castle' ? R.CFG.CASTLE_POINTS : 1) * 3; for (const k in y) v += y[k] * VAL[k] * 1.1; for (const k in lm) v += lm[k] * VAL[k];
  if (r.landmark === 'port' || r.landmark === 'observatory') v += 1.5; if (r.type === 'rich') v += 1; return v; }
function enemyThreat(S, r, t) { return r.nb.reduce((a, j) => { const o = S.regions[j].owner; return a + (o != null && o !== t && S.teams[t].ally !== o ? 1 : 0); }, 0); }
function estWin(S, sim, t, o, ph) { const D = S.regions[o.r], dOwner = D.owner, A = sim.teams[t];
  const est = x => sim.teams[x].smartEst ?? .5; // تقدير الفريق لقوة الآخرين
  const me = teamModel(A, ph), ally = o.joint ? teamModel(sim.teams[S.teams[t].ally], ph) : null, side = ally ? joinSide(me, ally) : me;
  if (dOwner == null) { const h = teamModel(A, ph, null, -.2); return h.know; }
  const op = sim.teams[dOwner], dm = A.smart > .5 ? teamModel(op, ph) : { know: .6, lam: side.lam };
  const p1 = (side.lam / (side.lam + dm.lam)) * (side.know + (1 - side.know) * 0) + (dm.lam / (side.lam + dm.lam)) * (1 - dm.know) * side.know;
  const kind = D.type === 'castle' ? 'castle' : D.type === 'capital' ? 'capital' : D.walls ? 'walls' : 'normal';
  const ign = o.unit === 'cat' || o.betray || o.revenge; let p = p1;
  if ((kind === 'walls' || kind === 'capital') && !ign) p = p1 * p1;
  if (kind === 'castle') p = o.unit === 'cat' ? 1 - (1 - p1) * (1 - p1) : p1 * p1 * (3 - 2 * p1);
  return p; }
function leaderOf(S) { const sc = S.teams.map(T => R.score(S, T.id)), m = Math.max(...sc); return { id: sc.indexOf(m), sc, m }; }

function chooseOrder(S, sim, t, ph, rnd) {
  const T = S.teams[t], A = sim.teams[t], L = R.legal(S, t), lead = leaderOf(S), style = A.style;
  const W = { attack: 1, build: 1, grow: 1 }; if (style === 'aggressive') { W.attack = 1.6; W.build = .6; } if (style === 'builder') { W.attack = .55; W.build = 1.7; W.grow = 1.4; } if (style === 'diplomat') { W.attack = 1.1; }
  const left = (sim.cyclesLeft || 20), scored = L.map(o => { let v = 0;
    switch (o.k) {
      case 'supply': { const need = { food: 4 - T.res.food, gold: 6 - T.res.gold, stone: 4 - T.res.stone }; v = 1.2 + Math.max(0, need[o.res]) * .35 + (o.res === 'gold' ? .3 : 0); break; }
      case 'occupy': v = 9 + regionValue(S, S.regions[o.r], t) * .6; break;
      case 'walls': { const r = S.regions[o.r], th = enemyThreat(S, r, t); v = th ? (2.2 + th * 1.1 + regionValue(S, r, t) * .25) * W.build : .2; if (r.walls) v = 0; break; }
      case 'tower': { const r = S.regions[o.r], th = enemyThreat(S, r, t); v = th ? (1 + th * .6) * W.build * (R.towerCover(S, o.r) ? .2 : 1) : .1; break; }
      case 'garInf': case 'garCav': { const r = S.regions[o.r], th = enemyThreat(S, r, t); v = th ? (1.6 + th * .8 + regionValue(S, r, t) * .2 + (r.walls ? 1 : 0) + (r.type === 'capital' ? 1.5 : 0)) * W.build * (o.k === 'garCav' ? .85 : 1) : .1; break; }
      case 'cap2': case 'cap3': v = Math.min(left, 30) * (o.k === 'cap2' ? .32 : .45) * W.grow; break;
      case 'attack': { const r = S.regions[o.r], p = estWin(S, sim, t, o, ph), cost = o.revenge ? 0 : (R.CFG.COST[o.unit].gold || 0) * (o.joint ? .5 : 1);
        let gainV = r.type === 'capital' ? Math.min(R.CFG.LOOT_MAX, (S.teams[r.owner].res.gold + S.teams[r.owner].res.food + S.teams[r.owner].res.stone) * R.CFG.LOOT[S.teams[r.owner].capLevel]) * .6 : regionValue(S, r, t) * 1.15 + (r.garrison ? -2.5 : 0);
        if (r.owner === lead.id && lead.m - R.score(S, t) >= 2) gainV += 3 * A.smart; if (r.type === 'castle') gainV += 6 * A.smart;
        v = (p * gainV - cost * .45) * W.attack; if (o.betray) v = (A.style === 'diplomat' ? v * 1.1 - 2 : v - 9) + (r.owner === lead.id ? 4 : 0); break; }
    } return { o, v }; });
  if (A.smart >= .5) { scored.sort((a, b) => b.v - a.v); const best = scored[0]; const near = scored.filter(s => s.v >= best.v - (1 - A.smart) * 3); return near[Math.floor(rnd() * near.length)].o; }
  const tot = scored.reduce((a, s) => a + Math.exp(s.v / (1.5 + (1 - A.smart) * 4)), 0); let x = rnd() * tot; for (const s of scored) { x -= Math.exp(s.v / (1.5 + (1 - A.smart) * 4)); if (x <= 0) return s.o; } return scored[0].o;
}
function diplomacy(S, sim, rnd, M) { // عروض وقبول وهدايا وإنهاء
  const lead = leaderOf(S);
  S.teams.slice().sort(() => rnd() - .5).forEach(T => { const A = sim.teams[T.id];
    if (T.ally == null) { const pr = A.style === 'diplomat' ? .45 : .14 * (A.smart + .3); if (rnd() < pr) {
        const nbs = new Set(); S.regions.forEach(r => { if (r.owner === T.id) r.nb.forEach(j => { const o = S.regions[j].owner; if (o != null && o !== T.id) nbs.add(o); }); });
        const cand = [...nbs].filter(o => S.teams[o].ally == null && !(A.smart > .5 && o === lead.id && lead.m - R.score(S, T.id) > 2) && S.teams[o].offerFrom == null);
        if (cand.length) { const b = cand[Math.floor(rnd() * cand.length)]; try { R.offer(S, T.id, b); const B = sim.teams[b]; const yes = !(B.smart > .5 && T.id === lead.id && lead.m - R.score(S, b) > 2) && rnd() < (B.style === 'diplomat' ? .8 : .6); if (R.accept(S, b, yes)) M.alliances++; } catch (e) { } } } }
    else { const P = S.teams[T.ally]; if (A.smart > .6 && R.score(S, T.ally) - R.score(S, T.id) >= 5 && T.endAllyAt == null && rnd() < .5) { R.endQuiet(S, T.id); M.quietEnds++; }
      else if (T.res.gold > 14 && P.res.gold < 4 && rnd() < .5) { R.gift(S, T.id, 'gold', 3); M.gifts++; } } });
}

// ---------- الزمن (ثوانٍ) ----------
const TIME = { question: 17, reveal: 5, captain: 13, calm: 4, harvest: 3, duelIntro: 3, predict: 5, point: 11, passExtra: 9, conquer: 7, hold: 4, loot: 6, garrisonQ: 18, phase: 6, unlockGuide: 5 };

// ---------- مسابقة واحدة ----------
function game(cfg, seed) {
  const rnd = rng(seed * 7919 + 13), n = cfg.teams.length, map = RayatMap.build(n, cfg.mapSeed ? cfg.mapSeed(seed) : 1 + (seed % 97));
  const order = cfg.shuffleSeats ? cfg.teams.map((_, i) => i).sort(() => rnd() - .5) : cfg.teams.map((_, i) => i); // تبديل المقاعد
  const sim = { teams: order.map(i => ({ ...cfg.teams[i], seatOf: i })) };
  const S = R.setup(map, sim.teams.map((t, i) => ({ name: 'ف' + i, color: '#000' })));
  const M = { cycles: 0, cycleT: [], phaseT: [], duels: { normal: [0, 0], walls: [0, 0], capital: [0, 0], castle: [0, 0], garrisonQ: [0, 0] }, alliances: 0, betrayals: 0, joint: 0, quietEnds: 0, gifts: 0,
    supplies: 0, orders: 0, ordersLate: 0, suppliesLate: 0, neutralAfterExp: null, leadAt: {}, leadChanges: 0, castleChanges: 0, binis: 0, errors: [], marginFinal: null, garrisonFell: 0, actions: {} };
  let T = 0, lastLead = null; const P = R.CFG.PHASES;
  const inv = where => { const e = R.check(S); if (e.length) M.errors.push(where + ': ' + e.join('، ')); };
  for (let ph = 0; ph < P.length - 1; ph++) {
    if (ph) R.setPhase(S, ph); T += TIME.phase + (P[ph].unlock.length ? TIME.unlockGuide : 0); inv('phase');
    const key = P[ph].key, end = T + P[ph].min * 60 * (cfg.timeScale || 1) - TIME.phase; M.leadAt[key] = leaderOf(S);
    if (key === 'final') { const sc = leaderOf(S).sc.slice().sort((a, b) => b - a); M.marginFinal = sc[0] - sc[1]; }
    while (end - T >= R.CFG.MIN_CYCLE_LEFT_S) {
      const t0 = T; M.cycles++; sim.cyclesLeft = Math.round((90 * 60 - T) / 75);
      if (key !== 'opening' && key !== 'expansion' && key !== 'final') diplomacy(S, sim, rnd, M);
      const ratios = sim.teams.map(tm => answerRatio(tm, key, rnd)), speeds = sim.teams.map(tm => 1 / tm.speed + rnd());
      sim.teams.forEach((tm, i) => { tm.ansOk = (tm.ansOk || 0) + ratios[i]; });
      const tr = R.startCycle(S, ratios, speeds); T += TIME.question + TIME.reveal + TIME.captain;
      // بيني بمضاعف يختاره المشرف (إن فُعّلت)
      if (cfg.binis && M.cycles % cfg.binis.every === 0) { const w = Math.floor(rnd() * n); R.bonusOrders(S, w, cfg.binis.mult(rnd, key)); M.binis++; T += cfg.binis.seconds; }
      let calm = false;
      for (const t of tr.order) while (S.turn.left[t] > 0) {
        const o = chooseOrder(S, sim, t, key, rnd); M.orders++; M.actions[o.k + (o.unit || '')] = (M.actions[o.k + (o.unit || '')] || 0) + 1;
        if (o.k === 'supply') M.supplies++; if (ph >= 2) { M.ordersLate++; if (o.k === 'supply') M.suppliesLate++; }
        if (o.joint) M.joint++; if (o.betray) M.betrayals++;
        const castleOwner = S.regions.find(r => r.type === 'castle').owner;
        const D = R.act(S, t, o); inv('act');
        if (!D) { calm = true; continue; }
        // المواجهة
        T += TIME.duelIntro + (D.d != null ? TIME.predict : 0); let res = null;
        const A = teamModel(sim.teams[D.a], key), Am = D.ally != null ? joinSide(A, teamModel(sim.teams[D.ally], key)) : A;
        if (D.kind === 'garrisonQ') { const h = teamModel(sim.teams[D.a], key, rnd, -.2); res = R.point(S, rnd() < h.know ? 'a' : 'd'); T += TIME.garrisonQ; }
        else { const Dm = teamModel(sim.teams[D.d], key); const bini = cfg.duelBini && (D.kind === 'castle' || D.kind === 'capital') && rnd() < cfg.duelBini;
          while (!res) { if (bini) { res = R.point(S, rnd() < .5 + (sim.teams[D.a].q - sim.teams[D.d].q) * .5 ? 'a' : 'd'); T += 60; M.binis++; continue; }
            const pt = duelPoint(Am, Dm, rnd); T += TIME.point + (pt.pass ? TIME.passExtra : 0); res = R.point(S, pt.side); } }
        inv('duel');
        M.duels[D.kind][0]++; if (res.winner === 'a' && (res.taken || res.loot || D.kind === 'garrisonQ')) M.duels[D.kind][1]++; if (res.garrisonFell) M.garrisonFell++;
        T += res.taken ? TIME.conquer : res.loot ? TIME.loot : TIME.hold;
        if (D.d != null) S.teams.forEach((Tm, i) => { if (i !== D.a && i !== D.d && i !== D.ally) { const tm = sim.teams[i], fav = (sim.teams[D.a].q > sim.teams[D.d].q) === (res.winner === 'a'); let c = 0; for (let k = 0; k < tm.m; k++) if (rnd() < (fav ? .62 : .38)) c++; R.predict(S, i, c); } });
        if (S.regions.find(r => r.type === 'castle').owner !== castleOwner && castleOwner != null) M.castleChanges++;
      }
      if (calm) T += TIME.calm; R.endCycle(S); T += TIME.harvest; inv('harvest');
      const L = leaderOf(S); if (lastLead != null && L.id !== lastLead && L.sc.filter(x => x === L.m).length === 1) M.leadChanges++; if (L.sc.filter(x => x === L.m).length === 1) lastLead = L.id;
      M.cycleT.push(T - t0);
      if (key === 'expansion') M.neutralAfterExp = S.regions.filter(r => r.owner == null && r.type !== 'castle' && !r.land).length;
    }
    T = Math.max(T, end); M.phaseT.push(T);
  }
  R.setPhase(S, P.length - 1); inv('end');
  const rk = R.ranking(S); // تعادل الصدارة: مواجهة استباق فاصلة أفضل من ثلاثة
  if (S.tie) { M.tieBreak = true; let k = 0; while (!S.done && k++ < 50) { const ms = S.tie.teams.map(x => teamModel(sim.teams[x], 'final')), w = ms.map(m => m.know * m.lam * (.5 + rnd())); R.tiePoint(S, S.tie.teams[w.indexOf(Math.max(...w))]); T += TIME.point; } }
  const win = S.winner;
  M.totalMin = (T + 60 * P[P.length - 1].min) / 60; M.winner = win; M.winnerSeat = sim.teams[win].seatOf; M.scores = rk; M.seats = sim.teams.map(t => t.seatOf);
  M.finalLeaderWon = M.leadAt.final && M.leadAt.final.sc.filter(x => x === M.leadAt.final.m).length === 1 ? M.leadAt.final.id === win : null;
  M.warLeaderWon = M.leadAt.war && M.leadAt.war.sc.filter(x => x === M.leadAt.war.m).length === 1 ? M.leadAt.war.id === win : null;
  M.siegeLeaderWon = M.leadAt.siege && M.leadAt.siege.sc.filter(x => x === M.leadAt.siege.m).length === 1 ? M.leadAt.siege.id === win : null;
  M.castleHolderWon = S.regions.find(r => r.type === 'castle').owner === win; M.castleHeld = S.regions.find(r => r.type === 'castle').owner != null;
  return M;
}

// ---------- السيناريوهات ----------
const team = (o = {}) => ({ q: .6, m: 5, speed: 1, smart: .7, style: 'balanced', ...o });
const SCEN = {
  'متكافئة (4)': { teams: [team(), team(), team(), team()] },
  'معرفة متفاوتة': { teams: [team({ q: .45 }), team({ q: .55 }), team({ q: .65 }), team({ q: .75 })] },
  'حنكة ضد معرفة': { teams: [team({ q: .52, smart: 1 }), team({ q: .64, smart: .2 }), team({ q: .64, smart: .2 }), team({ q: .64, smart: .2 })] },
  'أساليب مختلفة': { teams: [team({ style: 'aggressive' }), team({ style: 'builder' }), team({ style: 'balanced' }), team({ style: 'diplomat' })], shuffleSeats: true },
  'أحجام الفرق': { teams: [team({ m: 3 }), team({ m: 5 }), team({ m: 7 }), team({ m: 9 })], shuffleSeats: true },
  'فريقان': { teams: [team(), team()] },
  'ثلاثة فرق': { teams: [team(), team(), team()] },
  'خمسة فرق': { teams: [team(), team(), team(), team(), team()] },
  'ستة فرق': { teams: [team(), team(), team(), team(), team(), team()] },
  'فريق لا يجاوب': { teams: [team({ q: .03 }), team(), team(), team()] },
  'مع البينيات ×2–×3': { teams: [team(), team(), team(), team()], binis: { every: 9, seconds: 120, mult: (r, k) => 2 + Math.floor(r() * 2) }, duelBini: .5 },
  'بيني ×5 في الأخير': { teams: [team(), team(), team(), team()], binis: { every: 40, seconds: 120, mult: (r, k) => 5 } },
  'قائد عشوائي': { teams: [team({ smart: 0 }), team({ smart: 0 }), team({ smart: 0 }), team({ smart: 0 })] }
};

function run(name, cfg, N) {
  const G = []; for (let s = 1; s <= N; s++) { try { G.push(game(cfg, s)); } catch (e) { G.push({ crash: e.stack.split('\n').slice(0, 3).join(' | ') }); } }
  const ok = G.filter(g => !g.crash), n = cfg.teams.length, pct = x => Math.round(100 * x) + '%', avg = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const seatWins = Array(n).fill(0); ok.forEach(g => seatWins[g.winnerSeat]++);
  const cyc = ok.flatMap(g => g.cycleT).sort((a, b) => a - b), med = cyc[Math.floor(cyc.length / 2)] || 0, p90 = cyc[Math.floor(cyc.length * .9)] || 0;
  const rate = k => { const a = ok.reduce((x, g) => x + g.duels[k][0], 0), w = ok.reduce((x, g) => x + g.duels[k][1], 0); return a ? `${pct(w / a)} (${a})` : '—'; };
  const share = f => { const v = ok.map(f).filter(x => x != null); return v.length ? pct(avg(v.map(Number))) : '—'; };
  return { name, N, crashes: G.filter(g => g.crash).map(g => g.crash).slice(0, 2), errors: ok.flatMap(g => g.errors).slice(0, 3), errorGames: ok.filter(g => g.errors.length).length,
    seatWin: seatWins.map(w => pct(w / ok.length)), totalMin: avg(ok.map(g => g.totalMin)).toFixed(1), cycles: avg(ok.map(g => g.cycles)).toFixed(1), cycleMed: (med / 60).toFixed(2), cycleP90: (p90 / 60).toFixed(2),
    neutralAfterExp: avg(ok.map(g => g.neutralAfterExp ?? 0)).toFixed(2), normal: rate('normal'), walls: rate('walls'), capital: rate('capital'), castle: rate('castle'), garrisonQ: rate('garrisonQ'),
    finalLeaderWon: share(g => g.finalLeaderWon), siegeLeaderWon: share(g => g.siegeLeaderWon), warLeaderWon: share(g => g.warLeaderWon), leadChanges: avg(ok.map(g => g.leadChanges)).toFixed(1),
    decidedBeforeFinal: pct(avg(ok.map(g => (g.marginFinal ?? 0) >= 8 ? 1 : 0))), marginFinal: avg(ok.map(g => g.marginFinal ?? 0)).toFixed(1),
    supplyLate: pct(ok.reduce((a, g) => a + g.suppliesLate, 0) / Math.max(1, ok.reduce((a, g) => a + g.ordersLate, 0))), castleHeld: share(g => g.castleHeld), castleChanges: avg(ok.map(g => g.castleChanges)).toFixed(2), castleHolderWon: share(g => g.castleHolderWon),
    alliances: avg(ok.map(g => g.alliances)).toFixed(1), betrayals: avg(ok.map(g => g.betrayals)).toFixed(2), joint: avg(ok.map(g => g.joint)).toFixed(2), garrisonFell: avg(ok.map(g => g.garrisonFell)).toFixed(2), tieBreak: pct(avg(ok.map(g => g.tieBreak ? 1 : 0))),
    actions: (() => { const t = {}; ok.forEach(g => { for (const k in g.actions) t[k] = (t[k] || 0) + g.actions[k]; }); const s = Object.values(t).reduce((a, b) => a + b, 0); return Object.fromEntries(Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, pct(v / s)])); })() };
}

if (require.main === module) {
  const N = +process.argv[2] || 200, only = process.argv[3], out = [];
  for (const [name, cfg] of Object.entries(SCEN)) { if (only && !name.includes(only)) continue; const t0 = Date.now(); const r = run(name, cfg, N); r.sec = ((Date.now() - t0) / 1000).toFixed(1); out.push(r); console.log(JSON.stringify(r)); }
  require('fs').writeFileSync(path.join(__dirname, 'sim-results.json'), JSON.stringify(out, null, 1));
}
module.exports = { game, run, SCEN, team };
