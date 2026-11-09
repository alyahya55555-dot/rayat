// محاكاة اقتصاد المسابقة واستراتيجياتها: هل يربح العلم وحده؟ هل يطغى الهجوم؟
const D = require('../src/data.js'); const { Engine } = require('../src/engine.js');
function seeded(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
const STY = {
  builder: { grow: .8, def: .2, atk: 0 }, defender: { grow: .3, def: .7, atk: .1 },
  attacker: { grow: .2, def: .2, atk: .9 }, balanced: { grow: .5, def: .4, atk: .4 }, idle: { grow: 0, def: 0, atk: 0 }
};
function run(seed, styles, acc, N = 20) {
  let clock = 1e6; const R = seeded(seed); const e = new Engine(D, { rng: seeded(seed + 1), now: () => clock });
  for (let i = 0; i < N; i++) e.upsertStudent({ sid: 's' + i, name: 'ط' + i, want: 't' + ((i % 4) + 1), peer: 'p' + i });
  const T = e.s.teams.map(t => t.id), A = Object.fromEntries(T.map((t, i) => [t, acc[i]])), S = Object.fromEntries(T.map((t, i) => [t, STY[styles[i]]]));
  const council = () => {
    T.forEach(t => {
      const st = S[t], v = () => e.vil(t), cap = e.s.captain[t];
      // هجوم: على المتصدر غالبًا، بالنوع الأضعف دفاعًا عنده
      if (R() < st.atk) {
        const rk = e.ranking().filter(r => r.id !== t), to = (R() < .6 ? rk[0] : rk[Math.floor(R() * rk.length)]).id, tv = e.vil(to);
        const type = D.ATTACK_KEYS.slice().sort((a, b) => tv.b[D.ATTACKS[a].def] - tv.b[D.ATTACKS[b].def])[0];
        const units = Math.min(D.WAR.maxUnits, Math.floor(v().gold * (.4 + R() * .3) / 10));
        if (units >= 2) e.order(t, { type, to, units }, cap);
      }
      for (let k = 0; k < 6; k++) {
        const grp = R() < st.grow / (st.grow + st.def + 1e-9) ? 'grow' : 'def';
        const opts = D.BUILD_KEYS.filter(x => D.BUILD[x].grp === grp && e.buildCost(t, x) != null && e.buildCost(t, x) <= v().gold);
        if (!opts.length || R() > st.grow + st.def) break; e.buy(t, opts[Math.floor(R() * opts.length)], cap);
      }
    });
    e.resolveCouncil(); e.finishSeg();
  };
  const log = [];
  e.s.plan.forEach((p, pi) => {
    e.goSegment(pi); const seg = e.s.seg;
    if (seg.g === 'opening' || seg.g === 'crown') return;
    if (seg.g === 'council') { e.nextItem(); council(); log.push(T.map(t => e.vil(t).gold)); return; }
    for (let guard = 0; guard < 60; guard++) {
      e.nextItem(); if (e.s.seg.phase === 'done') break; const it = e.item();
      if (it.wagerQ) { T.forEach(t => e.setWager(t, e.maxWager(t) * .5, e.s.captain[t])); e.lockWagers(); T.forEach(t => e.wagerPick(t, R() < A[t] ? it.a : (it.a + 1) % 4, e.s.captain[t])); e.judgeWager(); continue; }
      e.openItem(); if (e.s.seg.phase === 'show') e.openItem();
      if (seg.mode === 'all') { Object.values(e.s.students).forEach(st => e.answer(st.sid, it.qid, R() < A[st.team] ? it.a : (it.a + 1) % 4)); e.lockAll(); }
      else if (seg.mode === 'buzz') { const el = it.eligible; const t = el[Math.floor(R() * el.length)]; e.buzz(e.teamMembers(t)[0].sid, it.qid); if (e.s.seg.phase === 'answering') e.judge(R() < A[t]); if (e.s.seg.phase === 'paused') { const o = el.find(x => x !== t); if (o) { e.reopen(); e.buzz(e.teamMembers(o)[0].sid, it.qid); if (e.s.seg.phase === 'answering') e.judge(R() < A[o]); } } }
      else if (it.kind === 'vault') { [...T].sort((a, b) => A[b] - A[a] + (R() - .5) * .3).forEach(t => { if (R() < A[t] + .2) { clock += 15000; e.vaultTry(e.teamMembers(t)[0].sid, it.qid, it.a); } }); }
    }
  });
  return { sc: e.scores(), T, built: T.map(t => e.buildScore(t)), held: T.map(t => e.vil(t).stats.held), dmg: T.map(t => e.vil(t).stats.dmg) };
}
const scen = [
  ['نفس المستوى، استراتيجيات مختلفة', ['builder', 'defender', 'attacker', 'balanced'], [.6, .6, .6, .6]],
  ['الأقوى علمًا بلا استراتيجية', ['idle', 'balanced', 'balanced', 'balanced'], [.75, .6, .6, .6]],
  ['الأقوى علمًا ومتوازن', ['balanced', 'attacker', 'attacker', 'attacker'], [.75, .6, .6, .6]],
  ['مهاجم ضعيف علمًا', ['attacker', 'balanced', 'balanced', 'balanced'], [.5, .6, .6, .6]]
];
for (const [name, sty, acc] of scen) {
  const wins = [0, 0, 0, 0], avg = [0, 0, 0, 0], bl = [0, 0, 0, 0], K = 60;
  for (let s = 1; s <= K; s++) { const r = run(s * 7, sty, acc); const sc = r.T.map(t => r.sc[t]); const m = Math.max(...sc); sc.forEach((v, i) => { avg[i] += v / K; bl[i] += r.built[i] / K; if (v === m) wins[i]++; }); }
  console.log('\n' + name); sty.forEach((st, i) => console.log(`  ${st.padEnd(9)} دقة ${acc[i]}  فوز ${String(wins[i]).padStart(2)}/60  متوسط النقاط ${Math.round(avg[i])}  مستويات البناء ${bl[i].toFixed(1)}/12`));
}
if (process.argv[2] === 'dbg') { const r = run(7, ['builder', 'defender', 'attacker', 'balanced'], [.6, .6, .6, .6]); console.log('dmg', r.dmg, 'held', r.held, 'sc', r.sc); }
