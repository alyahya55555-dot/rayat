// اختبارات تراجع للأخطاء التي ظهرت في التجربة الفعلية (10 نوفمبر): الفاصلة، رسالة الإجابة، الإيقاف المؤقت، قيمة القلعة، كلفة الأوامر، التحالف
const path = require('path'), fs = require('fs');
global.d3 = require(path.join(__dirname, '../r3d/node_modules/d3-delaunay'));
require('../proto/rayat-map.js'); require('../game/rules.js'); require('../app/bank-more.js'); require('../app/data.js');
const RayatGame = require('../app/game.js'), RR = globalThis.RayatRules;
// guide.js يعرّف دوال عامة (planCheck/CASTLE_AR): نحمّله في نطاق عام
const gsrc = fs.readFileSync(path.join(__dirname, '../app/guide.js'), 'utf8'); const GD = new Function('RayatRules', gsrc + '; return { planCheck, CASTLE_AR, CASTLE_N, GUIDE };')(RR);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('✗', m); } };
const NAMES = ['الصقور', 'السهم', 'الرواد', 'الهمّة'], COLORS = ['#2f6fdb', '#1f9d55', '#e07a2e', '#8e4fb8'];
function mk(n = 3, per = 3) { let clock = 1e12; const g = new RayatGame({ now: () => clock, bank: globalThis.RAYAT_BANK, binis: globalThis.RAYAT_BINIS, level: 'med', teams: NAMES.slice(0, n).map((x, i) => ({ name: x, color: COLORS[i], mark: x[0] })), mapSeed: 7 });
  for (let t = 0; t < n; t++) for (let k = 0; k < per; k++) g.join('p' + t + '-' + k, 'لاعب', t); g.adv = ms => { clock += ms; g.tick(); }; g.clock = () => clock; return g; }
const toStage = (g, st, max = 4000) => { let i = 0; while (g.s.stage !== st && i++ < max) { if (g.s.stage === 'judge') g.judge(false); g.adv(500); } return g.s.stage === st; };

// ---------- 1) الفاصلة: الفائز أولًا في كل المصادر، ولو كان ثانيًا أو ثالثًا في ترتيب الإعداد ----------
for (const winIdx of [1, 2, 0]) { const g = mk(3, 2); g.start(); toStage(g, 'question');
  const S = g.S; S.regions.forEach(r => { r.owner = null; }); const free = S.regions.filter(r => r.type !== 'castle'); [0, 1, 2].forEach(t => { for (let k = 0; k < 3; k++) free[t * 3 + k].owner = t; });
  RR.setPhase(S, RR.CFG.PHASES.length - 1); g.s.queue = []; g.crown();
  ok(g.s.stage === 'tie' && g.s.tie.teams.length === 3, `فاصلة: تعادل ثلاثي يفتح مواجهة فاصلة (${g.s.stage})`);
  for (let k = 0; k < 2; k++) { g.tieBuzz('p' + winIdx + '-0'); g.tieJudge(true); }
  const P = g.pub();
  ok(g.s.stage === 'crown' && P.winner === winIdx, `فاصلة: الفائز ${NAMES[winIdx]} متوَّج`);
  ok(P.rank[0].team === winIdx, `فاصلة: الفائز ${NAMES[winIdx]} أول الترتيب (كان ${NAMES[P.rank[0].team]})`);
  ok(P.rank[0].win === true && P.rank.slice(1).every(x => !x.win), 'فاصلة: علامة الفوز على الأول وحده');
  ok(JSON.stringify(RR.ranking(g.S)) === JSON.stringify(P.rank), 'فاصلة: الترتيب المنشور هو ترتيب القواعد نفسه (مصدر واحد)');
  const rest = P.rank.slice(1).map(x => x.team); ok(rest[0] < rest[1], 'فاصلة: بقية المتعادلين (بلا نقاط فاصلة ولا فرق موارد) بترتيب الإعداد'); }
{ // نقاط الفاصلة ترتّب الثاني والثالث
  const g = mk(3, 2); g.start(); toStage(g, 'question'); const S = g.S; S.regions.forEach(r => { r.owner = null; }); const free = S.regions.filter(r => r.type !== 'castle'); [0, 1, 2].forEach(t => { for (let k = 0; k < 2; k++) free[t * 2 + k].owner = t; });
  RR.setPhase(S, RR.CFG.PHASES.length - 1); g.s.queue = []; g.crown(); g.tieBuzz('p2-0'); g.tieJudge(true); g.tieBuzz('p1-0'); g.tieJudge(true); g.tieBuzz('p1-0'); g.tieJudge(true);
  const rk = g.pub().rank.map(x => x.team); ok(rk.join() === '1,2,0', `فاصلة: الفائز ثم صاحب نقطة الفاصلة ثم الباقي (${rk.join()})`); }

// ---------- 2) الإجابات: الرسالة تطابق المحفوظ، والنسبة والأوامر صحيحة، ولا احتساب مرتين ----------
{ const g = mk(3, 4); g.start(); ok(toStage(g, 'question'), 'إجابة: وصلنا للسؤال'); const q = g.s.q, wrong = (q.a + 1) % 4;
  g.answer('p0-0', q.id, q.a); g.answer('p0-1', q.id, q.a); g.answer('p0-2', q.id, q.a); g.answer('p0-3', q.id, wrong);
  g.answer('p1-0', q.id, q.a); g.answer('p1-1', q.id, wrong); g.answer('p1-2', q.id, wrong);
  g.answer('p0-3', q.id, q.a); // محاولة ثانية تُتجاهل
  ok(g.s.answers['p0-3'].c === wrong, 'إجابة: المحاولة الثانية لا تغيّر الأولى');
  let P = g.pub(); ok(P.answered.includes('p0-0') && !P.answered.includes('p2-0'), 'إجابة: قائمة الواصلين صحيحة قبل الكشف'); ok(P.q.a === undefined, 'إجابة: مفتاح الإجابة غير منشور قبل الكشف');
  toStage(g, 'reveal'); P = g.pub();
  ok(P.ans.by['p0-0'] === q.a && P.ans.by['p0-3'] === wrong && P.ans.by['p2-0'] === undefined && P.ans.by['p1-3'] === undefined, 'إجابة: خريطة إجابات اللاعبين عند الكشف تطابق المحفوظ');
  ok(Math.abs(P.ans.ratios[0] - .75) < 1e-9 && Math.abs(P.ans.ratios[1] - .25) < 1e-9 && P.ans.ratios[2] === 0, `إجابة: نسب الفرق صحيحة (${P.ans.ratios.join()})`);
  ok(P.ans.orders[0] === 2 && P.ans.orders[1] === 1 && P.ans.orders[2] === 0, `إجابة: الأوامر 2 و1 و0 (${P.ans.orders.join()})`);
  const before = JSON.stringify(g.s.ans); g.answer('p2-0', q.id, q.a); ok(JSON.stringify(g.s.ans) === before && g.s.answers['p2-0'] === undefined, 'إجابة: لا تُقبل إجابة بعد الكشف'); }

// ---------- 3) الإيقاف المؤقت: يجمّد الوقت والإجابات والأوامر والانتقالات ----------
{ const g = mk(3, 2); g.start(); toStage(g, 'question'); const q = g.s.q; g.adv(5000); const left0 = g.left();
  g.pause(true); g.adv(60000); ok(g.left() === left0 && g.s.stage === 'question', 'إيقاف: الوقت والمرحلة ثابتان بعد دقيقة توقف'); ok(g.pub().paused === true && g.pub().tm.r === left0, 'إيقاف: الحالة المنشورة تُظهر التوقف والوقت المتبقي');
  Object.keys(g.s.players).forEach(pid => g.answer(pid, q.id, q.a)); ok(Object.keys(g.s.answers).length === 0 && g.s.stage === 'question', 'إيقاف: لا تُقبل الإجابات ولا يحدث الكشف'); ok(g.refused >= 6, 'إيقاف: الرفض في منطق اللعبة نفسه');
  g.skip(); ok(g.s.stage === 'question', 'إيقاف: التخطي معطّل');
  g.pause(false); ok(g.left() === left0, 'استئناف: الوقت المتبقي كما كان بالضبط'); g.adv(left0 - 1000); ok(g.s.stage === 'question', 'استئناف: لم ينته الوقت قبل أوانه'); g.adv(1500); ok(g.s.stage === 'reveal', 'استئناف: الكشف عند انتهاء الوقت المتبقي'); }
{ // الإيقاف لحظة انتهاء الوقت، ولحظة آخر إجابة
  const g = mk(3, 2); g.start(); toStage(g, 'question'); const q = g.s.q; const cl = g.left(); g.adv(cl - 500); g.pause(true); g.adv(5000); ok(g.s.stage === 'question', 'إيقاف قبل النهاية بنصف ثانية: لا انتقال');
  g.pause(false); g.adv(600); ok(g.s.stage === 'reveal', 'ثم استئناف: ينتقل بعد نصف الثانية');
  const g2 = mk(2, 1); g2.start(); toStage(g2, 'question'); const q2 = g2.s.q; g2.answer('p0-0', q2.id, q2.a); g2.pause(true); g2.answer('p1-0', q2.id, q2.a); ok(g2.s.stage === 'question', 'إيقاف قبل آخر إجابة: الإجابة الأخيرة مرفوضة ولا كشف'); g2.pause(false); g2.answer('p1-0', q2.id, q2.a); ok(g2.s.stage === 'reveal', 'بعد الاستئناف: آخر إجابة تكشف'); }
{ // الأوامر أثناء التوقف + رسالة جولة قديمة
  const g = mk(3, 2); g.start(); toStage(g, 'question'); const q = g.s.q; Object.keys(g.s.players).forEach(pid => g.answer(pid, q.id, q.a)); toStage(g, 'orders');
  const snap = JSON.stringify(g.S.regions.map(r => r.owner)) + JSON.stringify(g.S.teams.map(t => t.res)); const cap = g.captain(0), opt = g.options(0).occupy[0];
  g.pause(true); g.setOrders(cap, [opt], g.s.cycle); g.setReady(cap, g.s.cycle); [1, 2].forEach(t => g.setReady(g.captain(t), g.s.cycle)); g.adv(40000);
  ok(g.s.stage === 'orders' && !g.s.ready[0] && JSON.stringify(g.S.regions.map(r => r.owner)) + JSON.stringify(g.S.teams.map(t => t.res)) === snap, 'إيقاف: لا تأكيد أوامر ولا تنفيذ ولا تغيّر في الأرض والموارد');
  g.pause(false); g.setReady(cap, g.s.cycle - 1); ok(!g.s.ready[0], 'رسالة «جاهز» من جولة سابقة تُهمل'); g.setOrders(cap, [opt], g.s.cycle); g.setReady(cap, g.s.cycle); ok(g.s.ready[0] === true, 'بعد الاستئناف: التأكيد يُقبل'); }
{ // مرحلة اللعب تتجمد أيضًا
  const g = mk(3, 2); g.start(); toStage(g, 'question'); const pl = g.pub().phaseLeft; g.pause(true); g.adv(120000); ok(g.pub().phaseLeft === pl, 'إيقاف: وقت المرحلة يتجمد'); }

// ---------- 5) القلعة: قيمة واحدة في الحساب والنص والخريطة ----------
{ const g = mk(3, 2); g.start(); const S = g.S, c = S.regions.find(r => r.type === 'castle'), N = RR.CFG.CASTLE_POINTS; ok(N === 4, 'القلعة: القيمة المعتمدة 4');
  const b0 = RR.score(S, 0), b1 = RR.score(S, 1); c.owner = 0; ok(RR.score(S, 0) === b0 + N, `القلعة: امتلاكها يضيف ${N}`); c.owner = 1; ok(RR.score(S, 0) === b0 && RR.score(S, 1) === b1 + N, 'القلعة: انتقالها ينقل القيمة كاملة');
  ok(GD.CASTLE_AR() === 'بأربع أراضٍ' && GD.GUIDE.castle.what.includes('بأربع أراضٍ'), 'القلعة: نص المرشد من المصدر نفسه');
  const svg = globalThis.RayatMap.svg(g.M, { teams: g.s.teams.map(t => ({ ...t, emb: t.mark })), owner: S.regions.map(r => r.owner), forts: new Set() }); ok(svg.includes('القلعة الكبرى ×4') && !svg.includes('×5'), 'القلعة: الخريطة الثنائية تعرض ×4');
  const all = ['app/ui-phone.js', 'app/ui-display.js', 'app/ui-host.js', 'app/guide.js', 'proto/rayat-map.js'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n'); ok(!/×5'|بخمس أراض/.test(all.replace(/5: 'بخمس أراضٍ'/, '')), 'القلعة: لا قيمة 5 مكتوبة يدويًا في الواجهات'); }

// ---------- 6) كلفة الخطة بترتيب التنفيذ ----------
{ const o1 = { k: 'occupy', r: 1 }, o2 = { k: 'occupy', r: 2 }, sup = { k: 'supply', res: 'food' };
  let c = GD.planCheck([o1, o2], { food: 5, gold: 6, stone: 6 }); ok(c.bad === 1 && c.steps[0].ok && !c.steps[1].ok && c.steps[1].short.join() === 'food' && c.after.food === 1 && c.total.food === 4, 'الخطة: احتلالان برصيد 5 طعام → الثاني متعذر');
  c = GD.planCheck([sup, o1], { food: 2, gold: 0, stone: 0 }); ok(c.bad === 0 && c.after.food === 1, 'الخطة: تموين ثم احتلال صحيحة (2+3−4)');
  c = GD.planCheck([o1, sup], { food: 2, gold: 0, stone: 0 }); ok(c.bad === 1, 'الخطة: احتلال ثم تموين متعذرة (الترتيب مهم)');
  ok(JSON.stringify(RR.costOf({ k: 'attack', unit: 'cav' })) === JSON.stringify(RR.CFG.COST.cav) && Object.keys(RR.costOf({ k: 'attack', unit: 'inf', revenge: true })).length === 0 && RR.costOf({ k: 'attack', unit: 'cav', joint: true }).gold === 4, 'الخطة: كلفة الهجوم والثأر والمشترك من القواعد');
  // السجل يذكر السبب
  const g = mk(3, 2); g.start(); toStage(g, 'question'); const q = g.s.q; Object.keys(g.s.players).forEach(pid => g.answer(pid, q.id, q.a)); toStage(g, 'orders'); const cap = g.captain(0), occ = g.options(0).occupy; g.S.teams[0].res.food = 5;
  g.setOrders(cap, [occ[0], occ[1]], g.s.cycle); [0, 1, 2].forEach(t => g.setReady(g.captain(t), g.s.cycle)); toStage(g, 'question');
  ok(g.s.log.some(x => /تعذّر الاحتلال \(لا يكفي طعام\) فصار تموينًا/.test(x.text)), 'الخطة: السجل يبيّن سبب التعذر'); }

// ---------- التحالف: هدية بمقدار ثابت، وكل رسالة تُقبل ----------
{ const g = mk(3, 2); g.start(); RR.setPhase(g.S, 2); g.s.phase = 2; toStage(g, 'question'); g.dip(g.captain(0), { k: 'offer', b: 1 }); g.dip(g.captain(1), { k: 'accept', yes: true });
  ok(g.S.teams[0].ally === 1, 'تحالف: عرض وقبول'); const a0 = g.S.teams[0].res.gold, b0 = g.S.teams[1].res.gold; g.dip(g.captain(0), { k: 'gift', res: 'gold', amt: 3 }); ok(g.S.teams[0].res.gold === a0 - 3 && g.S.teams[1].res.gold === b0 + 3, 'تحالف: الهدية 3 بالضبط'); }

// ---------- مشهد: إشارة شاشة العرض ----------
{ const g = mk(3, 2); g.hasDisplay = () => true; g.start(); ok(g.s.stage === 'phase', 'مشهد: مرحلة الافتتاح'); const nom = g.s.sceneNom, d0 = g.s.dur; ok(d0 > nom * 1000, 'مشهد: مع شاشة عرض، السقف أطول من المدة الاسمية');
  g.sceneAck('scene:999'); ok(g.s.stage === 'phase', 'مشهد: إشارة بمفتاح خاطئ تُهمل'); g.sceneAck(g.ackKey()); ok(g.s.stage !== 'phase', 'مشهد: إشارة صحيحة تنقل فورًا'); }

console.log(`اختبارات الإصلاحات: ${pass} نجح، ${fail} فشل`); process.exit(fail ? 1 : 0);
