// محاكاة اقتصاد المسابقة كاملة: كم ذهبًا يكسب كل فريق، وكم مبنى يستطيع بناءه
const D = require('../src/data.js'); const { Engine } = require('../src/engine.js');
function seeded(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
function run(seed, N = 20, acc = [.75, .6, .5, .4]) {
  let clock = 1e6; const R = seeded(seed); const e = new Engine(D, { rng: seeded(seed + 1), now: () => clock });
  for (let i = 0; i < N; i++) e.upsertStudent({ sid: 's' + i, name: 'ط' + i, want: 't' + ((i % 4) + 1), peer: 'p' + i });
  const T = e.s.teams.map(t => t.id), A = Object.fromEntries(T.map((t, i) => [t, acc[i]]));
  const shop = () => T.forEach(t => { for (;;) { const v = e.vil(t); const opts = D.BUILD_KEYS.map(k => [k, e.buildCost(t, k)]).filter(x => x[1] != null && x[1] <= v.gold).sort((a, b) => a[1] - b[1]); if (!opts.length) break; e.buy(t, opts[0][0], e.s.captain[t]); } });
  const log = [];
  e.s.plan.forEach((p, pi) => {
    e.goSegment(pi); const seg = e.s.seg; if (['opening', 'crown'].includes(seg.g)) return;
    for (let guard = 0; guard < 60; guard++) {
      e.nextItem(); if (e.s.seg.phase === 'done') break; const it = e.item();
      if (it.wagerQ) { T.forEach(t => e.setWager(t, e.maxWager(t) * .5, e.s.captain[t])); e.lockWagers(); T.forEach(t => e.wagerPick(t, R() < A[t] ? it.a : (it.a + 1) % 4, e.s.captain[t])); e.judgeWager(); shop(); continue; }
      e.openItem(); if (e.s.seg.phase === 'show') e.openItem();
      if (seg.mode === 'all') { Object.values(e.s.students).forEach(st => e.answer(st.sid, it.qid, R() < A[st.team] ? it.a : (it.a + 1) % 4)); e.lockAll(); }
      else if (seg.mode === 'buzz') { const el = it.eligible; const t = el[Math.floor(R() * el.length)]; const m = e.teamMembers(t); e.buzz(m[0].sid, it.qid); if (e.s.seg.phase === 'answering') e.judge(R() < A[t]); if (e.s.seg.phase === 'paused') { const o = el.find(x => x !== t); if (o) { e.reopen(); e.buzz(e.teamMembers(o)[0].sid, it.qid); if (e.s.seg.phase === 'answering') e.judge(R() < A[o]); } } if (e.s.seg.phase !== 'reveal') e.skipItem && e.skipItem(); }
      else if (it.kind === 'vault') { [...T].sort((a, b) => A[b] - A[a] + (R() - .5) * .3).forEach(t => { if (R() < A[t] + .2) { clock += 15000; e.vaultTry(e.teamMembers(t)[0].sid, it.qid, it.a); } }); e.lockAll && e.lockAll(); if (e.s.seg.phase !== 'reveal' && e.skipItem) e.skipItem(); }
      shop();
    }
    log.push([seg.g, T.map(t => e.vil(t).earned), T.map(t => e.buildScore(t))]);
  });
  return { sc: e.scores(), earned: T.map(t => e.vil(t).earned), built: T.map(t => e.buildScore(t)), log };
}
const rs = [1, 2, 3, 4, 5].map(s => run(s));
rs.forEach((r, i) => console.log('تشغيل', i + 1, 'النقاط', JSON.stringify(r.sc), 'الذهب المكتسب', r.earned.join('/'), 'مستويات البناء (من 12)', r.built.join('/')));
console.log('\nتطور البناء في التشغيل الأول:'); rs[0].log.forEach(l => console.log(' ', l[0].padEnd(8), 'ذهب', l[1].join('/'), '| مستويات', l[2].join('/')));
