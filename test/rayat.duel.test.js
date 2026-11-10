// اختبار المواجهة بالخيارات (طلب المستخدم 10 نوفمبر): الضاغط يختار من جواله، والتصحيح آلي، ولا تعادل
const path = require('path');
global.d3 = require(path.join(__dirname, '../r3d/node_modules/d3-delaunay'));
require('../proto/rayat-map.js'); require('../game/rules.js'); require('../app/bank-more.js'); require('../app/data.js');
const RayatGame = require('../app/game.js'), RR = globalThis.RayatRules;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('✗', m); } };
const NAMES = ['الصقور', 'السهم', 'الرواد', 'الهمّة'], COLORS = ['#2f6fdb', '#1f9d55', '#e07a2e', '#8e4fb8'];
function mk(n = 3, per = 3) { let clock = 1e12; const g = new RayatGame({ now: () => clock, bank: globalThis.RAYAT_BANK, binis: [], level: 'med', teams: NAMES.slice(0, n).map((x, i) => ({ name: x, color: COLORS[i], mark: x[0] })), mapSeed: 7 });
  for (let t = 0; t < n; t++) for (let k = 0; k < per; k++) g.join('p' + t + '-' + k, 'لاعب' + t + k, t); g.adv = ms => { clock += ms; g.tick(); }; return g; }
const toStage = (g, st, max = 400) => { let i = 0; while (g.s.stage !== st && i++ < max) g.adv(500); return g.s.stage === st; };
// يجهّز هجوم الفريق 0 على أرض للفريق 1 ويصل إلى مرحلة الجرس
function duel(walls = false) { const g = mk(); g.start(); toStage(g, 'question'); g.reveal(); toStage(g, 'orders', 40); const S = g.S; RR.setPhase(S, 1); g.s.phase = 1; const cap = g.M.caps[0], nb = S.regions[cap].nb.find(j => S.regions[j].owner == null && S.regions[j].type !== 'castle'); S.regions[nb].owner = 1; S.regions[nb].walls = walls;
  S.teams[0].res.gold = 40; if (!S.turn) S.turn = { orders: S.teams.map(() => 0), order: [0], left: S.teams.map(() => 0) }; S.turn.left = S.teams.map((_, i) => i === 0 ? 1 : 0); g.s.orderTeams = [0]; g.s.stage = 'orders'; g.s.ready = {}; g.s.orders = {}; const att = g.options(0).attack.find(o => o.r === nb && o.unit === 'inf'); g.setOrders(g.captain(0), [att]); g.setReady(g.captain(0)); const okk = toStage(g, 'buzz'); return { g, nb, okk }; }
const wrongOf = D => D.q.c.map((_, k) => k).filter(k => k !== D.q.a && !(D.wrong || []).includes(k))[0];
const A = 'p0-1', A2 = 'p0-2', Dp = 'p1-0', D2 = 'p1-2', X = 'p2-0';

{ const { g, nb, okk } = duel(); ok(okk, 'وصلنا مرحلة الجرس'); const P = g.pub(); ok(P.duel.q && P.duel.q.c.length === 4 && P.duel.q.a === undefined && P.duel.ans === undefined, 'السؤال يُنشر مع خياراته وبلا الإجابة');
  g.buzz(A, g.s.duel.id); ok(g.s.stage === 'judge' && g.s.duel.buzz.pid === A, 'ضغط المهاجم الجرس'); ok(g.pub().duel.q.a === undefined, 'الإجابة لا تُنشر أثناء الاختيار');
  g.pick(A2, g.s.duel.id, g.s.duel.q.a); ok(g.s.stage === 'judge', 'زميل الضاغط لا يختار عنه'); g.pick(Dp, g.s.duel.id, g.s.duel.q.a); ok(g.s.stage === 'judge', 'الفريق الآخر لا يختار قبل انتقال السؤال'); g.pick(X, g.s.duel.id, g.s.duel.q.a); ok(g.s.stage === 'judge', 'المتفرج لا يختار');
  g.pick(A, g.s.duel.id, g.s.duel.q.a); ok(g.s.stage === 'scene' && g.S.regions[nb].owner === 0, 'المهاجم أجاب صحيحًا: أخذ الأرض مباشرة (' + g.s.stage + ')'); }
{ const { g, nb } = duel(); const D = g.s.duel, w = wrongOf(D); g.buzz(A, D.id); g.pick(A, D.id, w); ok(g.s.stage === 'judge' && g.s.duel.buzz.pass && g.s.duel.buzz.side === 'd', 'المهاجم أخطأ: السؤال انتقل مباشرة للمدافع بلا جرس ثانٍ');
  ok(g.pub().duel.wrong.includes(w), 'الخيار الخاطئ مشطوب عند الجميع'); g.pick(A, D.id, D.q.a); ok(g.s.stage === 'judge', 'المهاجم لا يختار مرة ثانية'); g.pick(D2, D.id, w); ok(g.s.stage === 'judge', 'لا يُختار خيار مشطوب');
  g.pick(D2, D.id, D.q.a); ok(g.s.stage === 'scene' && g.S.regions[nb].owner === 1 && g.s.ev.result === 'hold', 'أي عضو من المدافعين اختار صحيحًا: صدّوا الهجوم'); }
{ const { g, nb } = duel(); const D = g.s.duel; g.buzz(A, D.id); g.pick(A, D.id, wrongOf(D)); g.pick(Dp, D.id, wrongOf(D)); ok(g.s.stage === 'scene' && g.S.regions[nb].owner === 0, 'أخطأ المهاجم ثم المدافع: ينفذ الهجوم ويأخذ المهاجم الأرض (لا تعادل)'); }
{ const { g, nb } = duel(); const D = g.s.duel; g.buzz(Dp, D.id); g.pick(Dp, D.id, wrongOf(D)); ok(g.s.duel.buzz.pass && g.s.duel.buzz.side === 'a', 'المدافع ضغط وأخطأ: السؤال للمهاجم'); g.pick(A2, D.id, D.q.a); ok(g.s.stage === 'scene' && g.S.regions[nb].owner === 0, 'المهاجم أجاب صحيحًا بعد خطأ المدافع: أخذ الأرض'); }
{ const { g, nb } = duel(); const D = g.s.duel, q0 = D.q.id; g.buzz(Dp, D.id); g.pick(Dp, D.id, wrongOf(D)); g.pick(A, D.id, wrongOf(D)); ok(g.s.stage === 'buzz' && g.s.duel.q.id !== q0, 'أخطأ المدافع ثم المهاجم: سؤال جديد'); ok(g.s.duel.pts.a === 0 && g.s.duel.pts.d === 0 && g.s.duel.wrong.length === 0 && !g.s.duel.tried.length && g.S.regions[nb].owner === 1, 'السؤال الجديد يبدأ نظيفًا بلا نقاط');
  g.buzz(A, D.id); g.pick(A, D.id, g.s.duel.q.a); ok(g.S.regions[nb].owner === 0, 'السؤال الجديد يحسم المواجهة'); }
{ const { g, nb } = duel(); const D = g.s.duel; g.buzz(A, D.id); g.adv(13000); ok(g.s.stage === 'judge' && g.s.duel.buzz.pass && g.s.duel.buzz.side === 'd', 'انتهى وقت الضاغط بلا اختيار: يُعدّ خطأ وينتقل السؤال'); g.adv(13000); ok(g.s.stage === 'scene' && g.S.regions[nb].owner === 0, 'لم يختر المدافع في وقته: يُعدّ خطأ وينفذ الهجوم'); }
{ const { g, nb } = duel(); g.adv(16000); ok(g.s.stage === 'scene' && g.S.regions[nb].owner === 1, 'لم يضغط أحد الجرس: يصمد المدافع'); }
{ const { g } = duel(); const D = g.s.duel; g.buzz(A, D.id); g.pause(true); g.pick(A, D.id, D.q.a); ok(g.s.stage === 'judge', 'الاختيار مرفوض أثناء الإيقاف المؤقت'); g.pause(false); g.pick(A, D.id, D.q.a); ok(g.s.stage === 'scene', 'ويُقبل بعد الاستئناف'); }
{ const { g, nb } = duel(true); const D = g.s.duel; ok(D.need.a === 2, 'أرض محصّنة: المهاجم يحتاج فوزين'); g.buzz(A, D.id); g.pick(A, D.id, D.q.a); ok(g.s.stage === 'point' && g.s.duel.pts.a === 1 && g.pub().duel.ans === D.q.a, 'نقطة أولى للمهاجم، وتُكشف الإجابة الصحيحة عند النقطة'); toStage(g, 'buzz');
  g.buzz(Dp, D.id); g.pick(Dp, D.id, g.s.duel.q.a); ok(g.s.stage === 'scene' && g.S.regions[nb].owner === 1, 'المدافع أجاب صحيحًا في السؤال الثاني: صمد خلف السور'); }
{ // الفاصلة بالخيارات
  const g = mk(3, 2); g.start(); toStage(g, 'question'); g.S.regions.forEach(r => { if (r.type !== 'capital' && r.type !== 'castle') r.owner = null; }); g.s.queue = []; g.enterPhase(RR.CFG.PHASES.length - 1); ok(g.s.stage === 'tie', 'تعادل في الصدارة: مواجهة فاصلة'); const T = g.s.tie;
  ok(g.pub().tie.q.a === undefined, 'إجابة الفاصلة لا تُنشر'); const b = 'p' + T.teams[1] + '-0', o = 'p' + T.teams[0] + '-0'; g.tieBuzz(b); g.tiePick(o, T.q.a); ok(g.s.tie.buzz && g.s.tie.pts[1] === 0, 'غير الضاغط لا يختار في الفاصلة');
  const w = T.q.c.map((_, k) => k).find(k => k !== T.q.a); g.tiePick(b, w); ok(!g.s.tie.buzz && g.s.tie.tried.includes(T.teams[1]) && g.pub().tie.wrong.includes(w), 'خطأ في الفاصلة: يُشطب الخيار والفرصة للبقية'); g.tieBuzz(b); ok(!g.s.tie.buzz, 'من أخطأ لا يضغط ثانية في السؤال نفسه');
  g.tieBuzz(o); g.tiePick(o, g.s.tie.q.a); ok(g.s.tie && g.s.tie.pts[0] === 1, 'إجابة صحيحة في الفاصلة: نقطة'); g.tieBuzz(o); g.tiePick(o, g.s.tie.q.a); ok(g.s.stage === 'crown' && g.s.winner === T.teams[0] && g.pub().rank[0].team === T.teams[0], 'نقطتان: بطل الفاصلة في المركز الأول'); }
console.log(`المواجهة بالخيارات: ${pass} نجح، ${fail} فشل`); process.exit(fail ? 1 : 0);
