// اختبار تدفق المسابقة كاملًا عند المشرف: لاعبون آليون بساعة افتراضية، من اللوبي حتى التتويج
const path = require('path');
global.d3 = require(path.join(__dirname, '../r3d/node_modules/d3-delaunay'));
require('../proto/rayat-map.js'); require('../game/rules.js'); require('../app/bank-more.js'); require('../app/data.js');
const RayatGame = require('../app/game.js'), RR = globalThis.RayatRules;
const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const COLORS = ['#2f6fdb', '#1f9d55', '#e07a2e', '#8e4fb8', '#c43d5a', '#1aa3a3'], NAMES = ['الصقور', 'السهم', 'الرواد', 'الهمّة', 'النخبة', 'الأفق'];
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('✗', m); } };

function play(seed, nTeams, perTeam, opts = {}) {
  const r = rng(seed); let clock = 1e12; const now = () => clock;
  const g = new RayatGame({ now, bank: globalThis.RAYAT_BANK, binis: globalThis.RAYAT_BINIS, level: ['easy', 'med', 'hard'][seed % 3], teams: NAMES.slice(0, nTeams).map((n, i) => ({ name: n, color: COLORS[i], mark: n[0] })), mapSeed: seed });
  const pids = []; for (let t = 0; t < nTeams; t++) for (let k = 0; k < perTeam; k++) { const pid = 'p' + t + '-' + k; pids.push(pid); g.join(pid, 'لاعب ' + k, t); }
  ok(Object.keys(g.s.captains).length === nTeams, 'لكل فريق قائد');
  g.start(); const stages = {}, errs = []; let steps = 0, binis = 0, lastStage = '', stuck = 0;
  while (g.s.stage !== 'crown' && steps++ < 200000) {
    const s = g.s, P = g.pub(); stages[s.stage] = (stages[s.stage] || 0) + 1;
    if (s.stage === 'question') pids.forEach(pid => { if (r() < .3) g.answer(pid, s.q.id, r() < .6 ? s.q.a : Math.floor(r() * 4)); });
    if (s.stage === 'orders') s.orderTeams.forEach(t => { const cap = g.captain(t), O = P.opts[t], all = [].concat(...Object.values(O)); if (!all.length) return;
      const n = g.S.turn.left[t], pref = all.filter(o => o.k === 'attack' || o.k === 'occupy'); const list = []; for (let i = 0; i < n; i++) list.push((pref.length && r() < .7 ? pref : all)[Math.floor(r() * (pref.length && r() < .7 ? pref.length : all.length))]);
      g.setOrders(cap, list); g.members(t).forEach(pid => { if (pid !== cap && r() < .2) g.suggest(pid, all[Math.floor(r() * all.length)]); }); if (r() < .5) g.setReady(cap); });
    if (s.stage === 'predict') pids.forEach(pid => { if (r() < .4) g.predict(pid, s.duel.id, r() < .5 ? 'a' : 'd'); });
    if (s.stage === 'buzz' && r() < .3) { const side = pids.filter(pid => g.sideOf(g.s.players[pid].team)); if (side.length) g.buzz(side[Math.floor(r() * side.length)], s.duel.id); }
    if (s.stage === 'judge' && r() < .3) g.judge(r() < .55);
    if (s.stage === 'gq') pids.forEach(pid => { if (g.s.duel && r() < .3) g.answer(pid, g.s.duel.q.id, r() < .5 ? g.s.duel.q.a : 0); });
    if (s.stage === 'tie') { if (!s.tie.buzz) { const c = pids.filter(pid => s.tie.teams.includes(g.s.players[pid].team) && !s.tie.tried.includes(g.s.players[pid].team)); if (c.length && r() < .5) g.tieBuzz(c[Math.floor(r() * c.length)]); } else if (r() < .5) g.tieJudge(r() < .6); }
    if (opts.binis && s.stage === 'harvest' && lastStage !== 'harvest' && r() < .3) { g.biniStart(Math.floor(r() * 10), 1 + Math.floor(r() * 5)); binis++; }
    if (s.stage === 'bini') { if (!s.bini.running && r() < .5) g.biniTimer(30); else if (r() < .2) g.biniWinner(Math.floor(r() * nTeams)); }
    if (opts.dip && g.S && s.stage === 'orders' && r() < .1) { const t = Math.floor(r() * nTeams), cap = g.captain(t); const k = ['offer', 'accept', 'gift', 'end'][Math.floor(r() * 4)]; g.dip(cap, { k, b: Math.floor(r() * nTeams), yes: r() < .7, res: 'gold', n: 2 }); }
    if (opts.skip && r() < .05) g.skip();
    if (opts.drop && r() < .002) { const pid = pids[Math.floor(r() * pids.length)]; if (r() < .5) g.offline(pid); else g.join(pid, 'عائد', null); }
    clock += 250 + Math.floor(r() * 500); g.tick();
    if (g.S) { const e = RR.check(g.S); if (e.length && errs.length < 5) errs.push(s.stage + ': ' + e.join('، ')); }
    if (s.stage === lastStage) { if (++stuck > 4000) { errs.push('عالق في ' + s.stage); break; } } else { stuck = 0; lastStage = s.stage; }
  }
  const mins = (clock - 1e12) / 60000;
  return { g, stages, errs, mins, steps, binis };
}

for (let seed = 1; seed <= 24; seed++) {
  const n = 2 + (seed % 5), res = play(seed, n, 2 + (seed % 4), { binis: seed % 2 === 0, dip: true, skip: seed % 3 === 0, drop: seed % 4 === 0 });
  const { g, stages, errs, mins } = res;
  ok(!errs.length, `مسابقة ${seed} (${n} فرق): لا خلل ${errs.join(' | ')}`);
  ok(g.s.stage === 'crown' && g.s.winner != null, `مسابقة ${seed}: انتهت بتتويج فائز (${g.s.stage})`);
  ok(mins > 75 && mins < 125, `مسابقة ${seed}: المدة ${mins.toFixed(0)} دقيقة`);
  ok(stages.question > 10 && stages.scene > 10, `مسابقة ${seed}: أسئلة ومشاهد كافية`);
  const P = g.pub(); ok(P.rank && P.rank.length === n && P.winner === g.s.winner, `مسابقة ${seed}: الترتيب منشور`);
  ok(JSON.stringify(P).length < 60000, `مسابقة ${seed}: حجم الحالة المنشورة معقول (${JSON.stringify(P).length})`);
  if (seed <= 3) console.log(`  مسابقة ${seed}: ${n} فرق، ${mins.toFixed(0)} دقيقة، جولات ${g.s.cycle}، مراحل:`, Object.entries(stages).map(([k, v]) => k + ':' + v).join(' '));
}
// لا تسريب للإجابة أثناء السؤال
{ const r = play(99, 3, 2, {}); const g = r.g; ok(true, ''); }
{ let clock = 1e12; const g = new RayatGame({ now: () => clock, bank: globalThis.RAYAT_BANK, binis: [], teams: [{ name: 'أ', color: '#f00' }, { name: 'ب', color: '#0f0' }] }); g.join('x', 'س', 0); g.join('y', 'ص', 1); g.start(); clock += 7000; g.tick();
  ok(g.s.stage === 'question', 'بعد مشهد المرحلة يأتي السؤال'); const P = g.pub(); ok(P.q && P.q.a === undefined, 'الإجابة الصحيحة لا تُنشر أثناء السؤال'); g.answer('x', P.q.id, 0); g.answer('y', P.q.id, 1); ok(g.s.stage === 'reveal', 'إذا أجاب الجميع يُكشف فورًا'); ok(g.pub().q.a !== undefined, 'الإجابة تُنشر عند الكشف'); }
console.log(`تدفق رايات: ${pass} نجح، ${fail} فشل`); process.exit(fail ? 1 : 0);
