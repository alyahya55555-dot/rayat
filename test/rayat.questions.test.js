// اختبار الأسئلة (اعتمده المستخدم 11 نوفمبر): لا تكرار بين المسابقات، والمستوى يُحترم من أول سؤال، والمواجهة من الأصعب
const path = require('path');
global.d3 = require(path.join(__dirname, '../r3d/node_modules/d3-delaunay'));
require('../proto/rayat-map.js'); require('../game/rules.js'); require('../app/bank-more.js'); require('../app/bank-adab.js'); require('../app/data.js');
const RayatGame = require('../app/game.js'), BANK = globalThis.RAYAT_BANK;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('✗', m); } };
const mk = level => new RayatGame({ bank: BANK, binis: [], level, teams: [{ name: 'أ', color: '#000' }, { name: 'ب', color: '#111' }], mapSeed: 7 });
const byId = Object.fromEntries(BANK.map(q => [q.id, q]));

for (const level of ['hard', 'med', 'easy']) {
  const nLevel = BANK.filter(q => q.level === level).length;
  // مسابقة أولى: 40 سؤالًا عاديًا في بدايتها + 30 مواجهة
  const g1 = mk(level), ids1 = [];
  for (let i = 0; i < 40; i++) ids1.push(g1.pickQuestion(Math.random() < .25 ? 3 : 2).id);
  const duel1 = []; for (let i = 0; i < 30; i++) duel1.push(g1.pickQuestion(3).id);
  const all1 = ids1.concat(duel1);
  ok(new Set(all1).size === all1.length, `${level}: لا تكرار داخل المسابقة`);
  ok(all1.every(id => byId[id].level === level), `${level}: كل الأسئلة من المستوى المختار`);
  ok(ids1.every(id => byId[id].d >= 2), `${level}: لا أسئلة من الدرجة الأسهل في البداية`);
  ok(duel1.filter(id => byId[id].d === 3).length >= 25, `${level}: أسئلة المواجهة من الأصعب (${duel1.filter(id => byId[id].d === 3).length}/30)`);
  // مسابقة ثانية: لا يتكرر أي سؤال من الأولى ما دام في المستوى جديد
  const g2 = mk(level), ids2 = []; for (let i = 0; i < 70; i++) ids2.push(g2.pickQuestion(i % 2 ? 3 : 2).id);
  const s1 = new Set(all1), rep = ids2.filter(id => s1.has(id)).length;
  ok(rep === 0, `${level}: المسابقة الثانية بلا سؤال من الأولى (${rep} مكرر)`);
  // استهلاك المستوى كله ثم دورة جديدة بلا خطأ ولا تكرار داخل المسابقة
  const g3 = mk(level), ids3 = []; for (let i = 0; i < nLevel; i++) ids3.push(g3.pickQuestion(2).id);
  ok(new Set(ids3).size === ids3.length && ids3.every(id => byId[id].level === level), `${level}: دورة كاملة (${nLevel}) بلا تكرار داخل المسابقة`);
  const extra = g3.pickQuestion(3); ok(extra && !ids3.includes(extra.id), `${level}: بعد نفاد المستوى يُستعار من مستوى قريب لا من المكرر`);
}
// تنويع الأبواب: لا باب مرتين متتاليتين، ولا يطغى باب
{ const g = mk('hard'), ts = []; for (let i = 0; i < 40; i++) ts.push(byId[g.pickQuestion(i % 3 ? 2 : 3).id].t);
  ok(ts.every((t, i) => !i || t !== ts[i - 1]), 'لا يتكرر الباب مرتين متتاليتين');
  const cnt = {}; ts.forEach(t => cnt[t] = (cnt[t] || 0) + 1); const mx = Math.max(...Object.values(cnt));
  ok(mx <= 5 && Object.keys(cnt).length >= 10, `توزيع الأبواب متوازن (${Object.keys(cnt).length} بابًا، أعلى باب ${mx} من 40)`);
  ok(['قرآن', 'سنة', 'شعر', 'ذكاء'].every(t => cnt[t] >= 1), 'الأبواب الجديدة تظهر: قرآن، سنة، شعر، ذكاء'); }
console.log(`الأسئلة: ${pass} نجح، ${fail} فشل`); process.exit(fail ? 1 : 0);
