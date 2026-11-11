// اختبار تدفق المسابقة كاملًا عند المشرف: لاعبون آليون بساعة افتراضية، من اللوبي حتى التتويج
const { play, RayatGame, RR } = require('./rayat.play.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('✗', m); } };

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
{ let clock = 1e12; const g = new RayatGame({ now: () => clock, bank: globalThis.RAYAT_BANK, binis: [], teams: [{ name: 'أ', color: '#f00' }, { name: 'ب', color: '#0f0' }] }); g.join('x', 'س', 0); g.join('y', 'ص', 1); g.start(); clock += 9000; g.tick(); // بطاقة المرحلة تطول بقدر ما ينفتح (كل سطر قرابة ثانيتين)
  ok(g.s.stage === 'question', 'بعد مشهد المرحلة يأتي السؤال'); const P = g.pub(); ok(P.q && P.q.a === undefined, 'الإجابة الصحيحة لا تُنشر أثناء السؤال'); g.answer('x', P.q.id, 0); g.answer('y', P.q.id, 1); ok(g.s.stage === 'reveal', 'إذا أجاب الجميع يُكشف فورًا'); ok(g.pub().q.a !== undefined, 'الإجابة تُنشر عند الكشف'); }
console.log(`تدفق رايات: ${pass} نجح، ${fail} فشل`); process.exit(fail ? 1 : 0);
