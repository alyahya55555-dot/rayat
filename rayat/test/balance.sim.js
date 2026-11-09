// محاكاة توازن «رايات»: مسابقات كاملة عبر المحرك الحقيقي بساعة وهمية، بفرق مختلفة المعرفة والحنكة.
// node balance.sim.js [عدد المسابقات لكل سيناريو]   ·   RULES='{"cost":{"occupy":5}}' لتجربة أرقام أخرى
const { mk, seeded } = require('./util.js');
const { PHASES } = require('../engine.js');

const N = +process.argv[2] || 100;
const RULES = process.env.RULES ? JSON.parse(process.env.RULES) : {};
const PH = process.env.PH ? JSON.parse(process.env.PH) : null; // تعديل مدد المراحل للتجربة
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

const { decide, diplomacy, qOk } = require('../bots.js');

// ---------- مسابقة كاملة ----------
function game(prof, opt = {}) {
  const n = prof.length, rng = seeded(opt.seed * 7919 + 13);
  const e = mk(n, { seed: opt.seed * 31, rngSeed: opt.seed * 97 + 1, rules: RULES });
  if (PH) Object.assign(e.s.settings.min, PH);
  const P = {}; e.s.teams.forEach((t, i) => { P[t.id] = Object.assign({ size: 5 }, prof[i]); });
  e.s.teams.forEach((t, i) => { for (let k = 0; k < P[t.id].size; k++) e.upsertStudent({ sid: t.id + 'm' + k, name: t.id + k, want: t.id }); });
  const obs = {}; e.s.teams.forEach(t => { obs[t.id] = { sum: 0, n: 0 }; });
  const pEst = () => Object.fromEntries(e.s.teams.map(t => [t.id, obs[t.id].n ? clamp(obs[t.id].sum / obs[t.id].n - 0.05, 0.2, 0.95) : 0.6]));
  const M = { atkBy: {}, act: {}, kind: {}, orders: {}, cycles: {}, cycleSec: [], duels: 0, fortAtk: 0, fortWin: 0, atk: 0, atkWin: 0, betray: 0, castleSwaps: 0, neutralAt: {}, leadChanges: 0, firstContact: null, idleExpand: 0 };
  let lastLead = null;
  const adv = sec => { e.adv(sec); e.tick(); };
  e.start(); e.adv(PHASES[0].min * 60); e.nextPhase();
  const neutral = () => e.s.owner.filter((o, i) => !o && i !== e.s.castle).length;
  while (e.s.step !== 'crown' && e.s.step !== 'tiebreak') {
    const k = PHASES[e.s.phase].k;
    if (e.s.step === 'phaseEnd') { M.neutralAt[k] = neutral(); e.nextPhase(); if (PHASES[e.s.phase].k === 'friction') M.frictionAt = e.clock(); continue; }
    adv(4); // المشرف يضغط الدورة التالية
    const t0 = e.clock(); const r = e.nextCycle(); if (!r.ok) continue;
    M.cycles[k] = (M.cycles[k] || 0) + 1; diplomacy(e, P, rng);
    // السؤال للجميع
    const q = e.s.q, ans = Object.values(e.s.students).map(st => ({ sid: st.sid, t: 4 + rng() * 14, ok: rng() < qOk(P[st.team].p, q.d) })).sort((a, b) => a.t - b.t);
    let now = 0; for (const a of ans) { if (a.t > 20 || e.s.step !== 'question') break; e.adv(a.t - now); now = a.t; e.answer(a.sid, a.ok ? q.a : (q.a + 1) % 4); }
    if (e.s.step === 'question') adv(20 - now + 0.1);
    e.s.teams.forEach(t => { obs[t.id].sum += e.s.turn.ratio[t.id]; obs[t.id].n++; (M.orders[t.id] = M.orders[t.id] || []).push(e.s.turn.n[t.id]); });
    adv(3); // كشف الإجابة
    // الأوامر: كل قائد يقرر في وقت مختلف
    if (e.s.step === 'orders') {
      const pe = pEst(); const who = e.s.turn.order.filter(t => e.s.turn.n[t] > 0).map(t => ({ t, at: 5 + rng() * 9 })).sort((a, b) => a.at - b.at);
      let tt = 0; for (const w of who) { if (e.s.step === 'orders') e.s.turn._pend = 1; if (e.s.step !== 'orders') break; e.adv(w.at - tt); tt = w.at; e.setOrders(w.t, decide(e, w.t, e.s.turn.n[w.t], P[w.t].brain, pe, rng), e.s.captain[w.t]); }
    }
    const RS = e.s.turn.res || []; RS.forEach(x => { const A = M.act[x.tid] = M.act[x.tid] || {}; A[x.k] = (A[x.k] || 0) + 1; });
    if (e.s.step === 'resolve') adv((e.s.deadline - e.clock()) / 1000 + 0.1); // مشاهد الفتح والتحصين
    if (k === 'expand' && neutral() === 0) M.idleExpand++;
    // المواجهات
    let guard = 0;
    while (e.s.step === 'duel' && guard++ < 60) {
      const d = e.s.duel;
      if (d.sub === 'predict') {
        if (d.round === 0) { M.duels++; if (d.def) { M.atk++; if (d.kind === 'fort' || d.kind === 'capital') M.fortAtk++; } if (d.betray) M.betray++; if (M.firstContact == null) M.firstContact = (e.clock() - M.frictionAt) / 60000; }
        Object.values(e.s.students).forEach(st => { if (!d.sides.includes(st.team)) e.predict(st.sid, d.def ? (rng() < 0.5 ? d.att : d.def) : (rng() < 0.4 ? d.att : 'hold')); });
        adv(5); continue;
      }
      if (d.sub === 'buzz') {
        const dd = d.q.d, cands = d.allowed.map(x => { const knows = rng() < qOk(P[x].p, dd); const gamble = !knows && rng() < 0.3; return { x, knows, at: knows ? 3 + rng() * 6 : gamble ? 6 + rng() * 8 : 99 }; }).sort((a, b) => a.at - b.at);
        const f = cands[0]; if (f.at > 15) { adv(15.1); continue; }
        adv(f.at); e.buzz(e.members(f.x)[0].sid); adv(4); d._first = f; e.judge(f.knows || rng() < 0.25); continue;
      }
      if (d.sub === 'answer') { adv(d.kind === 'garrison' ? 9 : 5); const x = d.buzz; e.judge(rng() < qOk(P[x].p, d.q.d) + (d.kind === 'garrison' ? 0 : 0.1)); continue; }
      if (d.sub === 'round') { adv(3); continue; }
      if (d.sub === 'end') {
        const K = M.kind[d.kind] = M.kind[d.kind] || [0, 0]; K[0]++; if (d.winner === d.att) K[1]++;
        const AB = (M.atkBy[d.att] = M.atkBy[d.att] || {}); const KB = AB[d.kind] = AB[d.kind] || [0, 0]; KB[0]++; if (d.winner === d.att) KB[1]++;
        if (d.def && d.winner === d.att) { M.atkWin++; if (d.kind === 'fort' || d.kind === 'capital') M.fortWin++; }
        if (d.r === e.s.castle && d.winner === d.att) M.castleSwaps++;
        adv((e.s.deadline - e.clock()) / 1000 + 0.1); continue;
      }
      adv(1);
    }
    if (e.s.step === 'harvest') adv((e.s.deadline - e.clock()) / 1000 + 0.1);
    const lead = e.ranking()[0].id; if (lastLead && lead !== lastLead) M.leadChanges++; lastLead = lead;
    M.cycleSec.push((e.clock() - t0) / 1000 + 4);
  }
  if (e.s.step === 'tiebreak') { M.tie = true; }
  const sc = e.scores(); M.total = (e.clock() - e.s.createdAt) / 60000 + PHASES[6].min;
  M.end = PHASES.slice(0, 6).map(p => p.k);
  return { sc, ids: e.s.teams.map(t => t.id), M, e };
}

// ---------- السيناريوهات ----------
const SMART = p => ({ p, brain: 'smart' }), NAIVE = p => ({ p, brain: 'naive' });
const SCEN = [
  ['تكافؤ تام (عدالة المقاعد)', [SMART(.6), SMART(.6), SMART(.6), SMART(.6)]],
  ['الأقوى معرفةً وحنكةً', [SMART(.75), SMART(.6), NAIVE(.6), NAIVE(.6)]],
  ['الأقوى معرفةً بلا حنكة', [NAIVE(.75), SMART(.6), SMART(.6), SMART(.6)]],
  ['الذكي الأقل معرفةً', [SMART(.55), NAIVE(.65), NAIVE(.65), NAIVE(.65)]],
  ['الذكي الأقل معرفةً أمام أذكياء', [SMART(.5), SMART(.6), SMART(.6), SMART(.6)]],
  ['فريقان متكافئان', [SMART(.6), SMART(.6)]],
  ['ستة فرق متكافئة', [SMART(.6), SMART(.6), SMART(.6), SMART(.6), SMART(.6), SMART(.6)]]
];
const pct = x => Math.round(x * 100) + '%', avg = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const all = { act: {}, kind: {}, cyc: [], fortAtk: 0, fortWin: 0, atk: 0, atkWin: 0, total: [], neutral: {}, cycles: {}, first: [], idle: [], betray: 0, lead: [], swaps: [], duels: [] };
const only = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;
SCEN.forEach(([name, prof], si) => {
  if (only && !only.includes(si)) return;
  const wins = prof.map(() => 0), sc = prof.map(() => 0), ord = prof.map(() => 0), act = prof.map(() => ({}));
  for (let g = 1; g <= N; g++) {
    const { sc: S, ids, M } = game(prof, { seed: g + si * 1000 });
    const v = ids.map(i => S[i]), m = Math.max(...v), w = v.filter(x => x === m).length;
    v.forEach((x, i) => { sc[i] += x / N; if (x === m) wins[i] += 1 / w; });
    ids.forEach((t, i) => { ord[i] += avg(M.orders[t]) / N; });
    ids.forEach((t, i) => { const A = act[i]; Object.entries(M.act[t] || {}).forEach(([k, x]) => { A[k] = (A[k] || 0) + x / N; }); });
    if (prof.length === 4) {
      all.cyc.push(...M.cycleSec); Object.entries(M.kind).forEach(([k, [a, b]]) => { const K = all.kind[k] = all.kind[k] || [0, 0]; K[0] += a; K[1] += b; }); all.fortAtk += M.fortAtk; all.fortWin += M.fortWin; all.atk += M.atk; all.atkWin += M.atkWin; all.total.push(M.total);
      Object.entries(M.neutralAt).forEach(([k, x]) => (all.neutral[k] = all.neutral[k] || []).push(x)); Object.entries(M.cycles).forEach(([k, x]) => (all.cycles[k] = all.cycles[k] || []).push(x));
      if (M.firstContact != null) all.first.push(M.firstContact); all.idle.push(M.idleExpand); all.betray += M.betray; all.lead.push(M.leadChanges); all.swaps.push(M.castleSwaps); all.duels.push(M.duels);
    }
  }
  console.log(`\n${name}  (${N} مسابقة)`);
  prof.forEach((p, i) => console.log(`  ${i + 1}. ${p.brain === 'smart' ? 'ذكي ' : 'عادي'} معرفة ${p.p}   فوز ${pct(wins[i] / N).padStart(4)}   متوسط الأرض ${sc[i].toFixed(1).padStart(4)}   أوامر/دورة ${ord[i].toFixed(2)}   احتلال ${(act[i].occupy || 0).toFixed(0)} تحصين ${(act[i].fortify || 0).toFixed(0)} هجوم ${(act[i].attack || 0).toFixed(0)} تموين ${(act[i].supply || 0).toFixed(0)}`));
});
if (all.total.length) {
  const C = all.cyc.slice().sort((a, b) => a - b), q = f => C[Math.floor(f * (C.length - 1))];
  console.log('\nمؤشرات المسابقات رباعية الفرق:');
  console.log(`  طول الدورة: وسيط ${(q(.5) / 60).toFixed(2)} د، من ${(q(.1) / 60).toFixed(2)} إلى ${(q(.9) / 60).toFixed(2)} د (10%–90%)`);
  console.log(`  الدورات في كل مرحلة: ${Object.entries(all.cycles).map(([k, x]) => `${PHASES.find(p => p.k === k).name} ${avg(x).toFixed(1)}`).join(' · ')}`);
  console.log(`  الأرض المحايدة الباقية بنهاية: ${Object.entries(all.neutral).map(([k, x]) => `${PHASES.find(p => p.k === k).name} ${avg(x).toFixed(1)}`).join(' · ')}`);
  console.log(`  دورات توسع بلا أرض محايدة: ${avg(all.idle).toFixed(1)}   أول مواجهة بعد ${avg(all.first).toFixed(1)} د من بدء الاحتكاك`);
  console.log(`  نجاح المهاجم حسب نوع المواجهة: ${Object.entries(all.kind).map(([k, [a, b]]) => `${k} ${pct(b / a)} (${(a / all.total.length).toFixed(1)})`).join(' · ')}`);
  console.log(`  نجاح الهجوم: عادي+محصّن ${pct(all.atkWin / all.atk)}، على المحصّن والعواصم ${pct(all.fortWin / (all.fortAtk || 1))} (${(all.fortAtk / all.total.length).toFixed(1)} لكل مسابقة)`);
  console.log(`  مواجهات لكل مسابقة ${avg(all.duels).toFixed(1)} · نقض ${(all.betray / all.total.length).toFixed(2)} · تبدّل الصدارة ${avg(all.lead).toFixed(1)} · انتقال القلعة ${avg(all.swaps).toFixed(1)}`);
  console.log(`  مدة المسابقة كلها: متوسط ${avg(all.total).toFixed(1)} د، أقصى ${Math.max(...all.total).toFixed(1)} د`);
}
module.exports = { game, decide };
