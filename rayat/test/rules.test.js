// اختبارات قواعد «رايات» — node rules.test.js
const assert = require('assert');
const { mk, join, goPhase, mapFor } = require('./util.js');
const { PHASES, PROD } = require('../engine.js');

let T = 0, pass = 0; const fails = [];
function test(name, fn) { T++; try { fn(); pass++; console.log('✓', name); } catch (e) { fails.push(name); console.log('✗', name, '\n   ', e.stack.split('\n').slice(0, 4).join('\n    ')); } }

// أدوات
const cap = (e, tid) => e.s.captain[tid];
const mem = (e, tid) => e.members(tid).map(x => x.sid);
// يبدأ دورة ويجيب كل فريق بعدد صحيح محدد (الباقي خطأ)
function ask(e, right = {}) {
  const r = e.nextCycle(); assert.ok(r.ok, 'nextCycle: ' + r.why); const a = e.s.q.a;
  e.s.teams.forEach(t => mem(e, t.id).forEach((sid, i) => e.answer(sid, i < (right[t.id] ?? 0) ? a : (a + 1) % 4)));
  assert.ok(['orders', 'harvest'].includes(e.s.step));
}
const neutralNear = (e, tid) => e.s.regions.find(r => !e.s.owner[r.id] && r.id !== e.s.castle && e.touches(tid, r.id));
// يجعل إقليمًا لفريق ويضمن تلاصقه مع فريق آخر: يعيد إقليمًا للمدافع ملاصقًا لأرض المهاجم
function border(e, att, def, type) {
  const s = e.s;
  for (const r of s.regions) {
    if (r.id === s.castle || r.type === 'capital' || r.land || (type && r.type !== type)) continue;
    const n = r.nb.find(j => s.regions[j].type !== 'capital' && j !== s.castle && !s.regions[j].land);
    if (n == null) continue;
    e.setOwner(r.id, def); e.setOwner(n, att); return r.id;
  }
  throw new Error('no border');
}
const settle = e => { while (e.s.step === 'resolve') e.next(); };
function attackTo(e, att, rid, extra = {}) { const r = e.setOrders(att, [Object.assign({ k: 'attack', r: rid }, extra)], cap(e, att)); settle(e); return r; }
function buzzAs(e, tid) { const sid = mem(e, tid)[0]; const r = e.buzz(sid); assert.ok(r.ok, 'buzz ' + r.why); }
function playing(k = 'friction', n = 4) { const e = mk(n); join(e, 4); goPhase(e, k); return e; }

test('الخريطة: عدد الأقاليم كما في الجدول، وكل فريق يبدأ بالعاصمة ومزرعة ومنجم و6 من كل مورد', () => {
  const want = { 2: 20, 3: 26, 4: 32, 5: 38, 6: 40 };
  for (const n of [2, 3, 4, 5, 6]) {
    const e = mk(n); assert.strictEqual(e.s.regions.length, want[n]);
    e.s.teams.forEach(t => {
      const own = e.regionsOf(t.id).map(i => e.s.regions[i].type).sort();
      assert.deepStrictEqual(own, ['capital', 'farm', 'mine'], n + ' فرق: ' + t.id);
      assert.deepStrictEqual(t.res, { food: 6, gold: 6, stone: 6 });
      e.regionsOf(t.id).forEach(i => assert.ok(!e.s.regions[i].nb.some(j => e.s.owner[j] && e.s.owner[j] !== t.id), 'لا تلاصق في البداية'));
    });
    assert.ok(!e.s.teams.some(t => e.s.regions[t.cap].nb.includes(e.s.castle)), 'لا عاصمة ملاصقة للقلعة');
  }
});

test('المراحل سبع ومجموعها 90 دقيقة، والقلعة تُفتح في الحصار', () => {
  assert.deepStrictEqual(PHASES.map(p => p.k), ['opening', 'expand', 'friction', 'war', 'siege', 'final', 'crown']);
  assert.strictEqual(PHASES.reduce((a, p) => a + p.min, 0), 90);
  assert.deepStrictEqual(PHASES.filter(p => p.castle).map(p => p.k), ['siege', 'final']);
});

test('الأوامر بالنسبة لا بالعدد: 80% أمران، 50% أمر، أقل لا شيء', () => {
  const e = mk(4); join(e, 4); e.removeStudent('s3'); e.removeStudent('s7'); // t4 فيه 3 أعضاء
  goPhase(e, 'expand');
  ask(e, { t1: 4, t2: 2, t3: 1, t4: 3 });
  assert.deepStrictEqual(e.s.turn.n, { t1: 2, t2: 1, t3: 0, t4: 2 });
  assert.strictEqual(e.s.turn.ratio.t4, 1);
});

test('يتحرك الأعلى نسبة أولًا، والأسرع عند التساوي', () => {
  const e = playing('expand'); e.nextCycle(); const a = e.s.q.a;
  // t2 يجيب أولًا صحيحًا، ثم t1 كلهم صحيح أيضًا لكن أبطأ، t3 نصف
  ['t2', 't1', 't3', 't4'].forEach(t => { e.adv(2); mem(e, t).forEach((sid, i) => e.answer(sid, t === 't3' && i > 1 ? (a + 1) % 4 : t === 't4' ? (a + 2) % 4 : a)); });
  assert.deepStrictEqual(e.s.turn.order.slice(0, 3), ['t2', 't1', 't3']);
});

test('الاحتلال: محايد ملاصق بـ4 طعام، والمتنازع عليه للأسبق، والخاسر يأخذ تموينًا', () => {
  const e = playing('expand'); const s = e.s;
  // إقليم محايد يلاصق t1 و t2 معًا
  const r = s.regions.find(x => !s.owner[x.id] && x.id !== s.castle); e.setOwner(r.nb.find(j => s.regions[j].type !== 'capital' && j !== s.castle), 't1');
  const other = r.nb.find(j => !s.owner[j] && s.regions[j].type !== 'capital' && j !== s.castle); e.setOwner(other, 't2');
  ask(e, { t1: 4, t2: 3, t3: 0, t4: 0 });
  e.setOrders('t2', [{ k: 'occupy', r: r.id }], cap(e, 't2'));
  e.setOrders('t1', [{ k: 'occupy', r: r.id }, { k: 'supply', res: 'stone' }], cap(e, 't1'));
  assert.strictEqual(s.owner[r.id], 't1'); assert.strictEqual(s.step, 'resolve', 'وقت لمشهد الفتح'); e.adv(4); e.tick(); assert.strictEqual(s.step, 'harvest');
  assert.strictEqual(e.team('t1').res.food, 6 - 4 + e.s.turn.harvest.t1.food); assert.strictEqual(e.team('t1').res.stone, 6 + 3 + e.s.turn.harvest.t1.stone);
  const t2r = s.turn.res.find(x => x.tid === 't2'); assert.ok(t2r.fb && t2r.k === 'supply' && t2r.why === 'taken');
});

test('الاحتلال البعيد أو بلا طعام يتحول إلى تموين من أقل مورد', () => {
  const e = playing('expand'); const far = e.s.regions.find(r => !e.s.owner[r.id] && r.id !== e.s.castle && !e.touches('t1', r.id));
  e.team('t1').res.stone = 1;
  ask(e, { t1: 4 }); e.setOrders('t1', [{ k: 'occupy', r: far.id }], cap(e, 't1'));
  const x = e.s.turn.res.find(y => y.tid === 't1'); assert.strictEqual(x.why, 'far'); assert.strictEqual(x.res, 'stone');
});

test('القائد وحده يأمر، وبعدد أوامره فقط، والمتأخر يُموَّن تلقائيًا من أقل مورد', () => {
  const e = playing('expand'); ask(e, { t1: 2, t2: 0, t3: 0, t4: 0 });
  const nb = neutralNear(e, 't1').id;
  assert.strictEqual(e.setOrders('t1', [{ k: 'occupy', r: nb }], mem(e, 't1')[1]).why, 'not-captain');
  assert.strictEqual(e.setOrders('t1', [{ k: 'supply', res: 'gold' }, { k: 'supply', res: 'gold' }], cap(e, 't1')).why, 'count');
  e.team('t1').res.food = 1; e.adv(16); e.tick();
  assert.strictEqual(e.s.step, 'harvest'); const x = e.s.turn.res.find(y => y.tid === 't1'); assert.ok(x.auto && x.res === 'food');
});

test('لا هجوم في التوسع، وهجوم واحد لكل فريق في الدورة', () => {
  const e = playing('expand'); const rid = border(e, 't1', 't2'); ask(e, { t1: 4 }); attackTo(e, 't1', rid);
  assert.strictEqual(e.s.turn.res.find(y => y.tid === 't1').why, 'no-attack');
  const f = playing('friction'); const a = border(f, 't1', 't2'), b = f.s.regions[a].nb.find(j => !f.s.owner[j] && j !== f.s.castle && f.s.regions[j].type !== 'capital');
  f.setOwner(b, 't3'); ask(f, { t1: 4 }); f.team('t1').res.gold = 20;
  f.setOrders('t1', [{ k: 'attack', r: a }, { k: 'attack', r: b }], cap(f, 't1'));
  assert.strictEqual(f.s.turn.res.filter(y => y.tid === 't1')[1].why, 'one-attack');
});

test('التحصين بـ4 حجر، ولا تحصين للعاصمة ولا لأرض الغير', () => {
  const e = playing('expand'); const t = e.team('t1'), mine = e.regionsOf('t1').find(i => e.s.regions[i].type === 'mine');
  ask(e, { t1: 4 }); e.setOrders('t1', [{ k: 'fortify', r: mine }, { k: 'fortify', r: t.cap }], cap(e, 't1')); settle(e);
  assert.ok(e.s.fort[mine]); assert.strictEqual(e.s.turn.res.filter(y => y.tid === 't1')[1].why, 'no-fort');
});

test('مواجهة عادية: الاستباق الصحيح يأخذ الإقليم، والهجوم يكلف 4 ذهب', () => {
  const e = playing(); const rid = border(e, 't1', 't2'); ask(e, { t1: 4 }); attackTo(e, 't1', rid);
  assert.strictEqual(e.s.duel.cost, 4);
  assert.strictEqual(e.s.duel.sub, 'predict'); e.next(); assert.strictEqual(e.s.duel.sub, 'buzz');
  assert.strictEqual(e.buzz(mem(e, 't3')[0]).why, 'closed', 'غير المتواجهين لا يستبقون');
  buzzAs(e, 't1'); e.judge(true);
  assert.strictEqual(e.s.owner[rid], 't1'); assert.strictEqual(e.s.duel.winner, 't1');
  assert.strictEqual(e.team('t1').stats.atkWin, 1); assert.strictEqual(e.team('t2').stats.lost, 1);
});

test('الخطأ ينقل الفرصة للآخر، وخطأ الاثنين أو انتهاء الوقت للمدافع', () => {
  let e = playing(); let rid = border(e, 't1', 't2'); ask(e, { t1: 4 }); attackTo(e, 't1', rid); e.next();
  buzzAs(e, 't2'); e.judge(false); assert.strictEqual(e.s.duel.buzz, 't1'); assert.ok(e.s.duel.second); e.judge(true);
  assert.strictEqual(e.s.owner[rid], 't1', 'الفرصة الثانية للمهاجم تكسبه');
  e = playing(); rid = border(e, 't1', 't2'); ask(e, { t1: 4 }); attackTo(e, 't1', rid); e.next();
  buzzAs(e, 't1'); e.judge(false); e.judge(false); assert.strictEqual(e.s.owner[rid], 't2'); assert.strictEqual(e.team('t2').stats.held, 1);
  e = playing(); rid = border(e, 't1', 't2'); ask(e, { t1: 4 }); attackTo(e, 't1', rid); e.next();
  e.adv(16); e.tick(); assert.strictEqual(e.s.duel.winner, 't2', 'لا استباق حتى انتهاء الوقت');
  e = playing(); rid = border(e, 't1', 't2'); ask(e, { t1: 4 }); attackTo(e, 't1', rid); e.next();
  buzzAs(e, 't2'); e.adv(11); e.tick(); assert.strictEqual(e.s.duel.buzz, 't1'); e.adv(11); e.tick(); assert.strictEqual(e.s.duel.winner, 't2', 'انتهاء وقت الإجابة خطأ');
});

test('المحصّن: المهاجم يحتاج فوزين والمدافع فوزًا، والفتح يهدم الحصن', () => {
  let e = playing(); let rid = border(e, 't1', 't2'); e.s.fort[rid] = true; ask(e, { t1: 4 }); attackTo(e, 't1', rid); e.next();
  assert.strictEqual(e.s.duel.kind, 'fort');
  buzzAs(e, 't1'); e.judge(true); assert.strictEqual(e.s.owner[rid], 't2'); assert.strictEqual(e.s.duel.sub, 'round');
  e.next(); buzzAs(e, 't1'); e.judge(true); assert.strictEqual(e.s.owner[rid], 't1'); assert.ok(!e.s.fort[rid]);
  e = playing(); rid = border(e, 't1', 't2'); e.s.fort[rid] = true; ask(e, { t1: 4 }); attackTo(e, 't1', rid); e.next();
  buzzAs(e, 't1'); e.judge(true); e.next(); buzzAs(e, 't2'); e.judge(true); assert.strictEqual(e.s.duel.winner, 't2'); assert.strictEqual(e.s.owner[rid], 't2');
});

test('العاصمة لا تسقط: فوزان ينهبان نصف مخزونها', () => {
  const e = playing(); const capId = e.team('t2').cap, n = e.s.regions[capId].nb.find(j => j !== e.s.castle && e.s.regions[j].type !== 'capital');
  e.setOwner(n, 't1'); e.team('t2').res = { food: 9, gold: 7, stone: 4 };
  ask(e, { t1: 4 }); attackTo(e, 't1', capId); e.next(); assert.strictEqual(e.s.duel.kind, 'capital');
  buzzAs(e, 't1'); e.judge(true); e.next(); buzzAs(e, 't1'); e.judge(true);
  assert.strictEqual(e.s.owner[capId], 't2'); assert.deepStrictEqual(e.s.duel.loot, { food: 4, gold: 3, stone: 2 });
});

test('القلعة مغلقة قبل الحصار، ثم سؤال الحامية الصعب، ثم أفضل من ثلاثة، وتُحسب بخمسة', () => {
  let e = playing('war'); const c = e.s.castle, n = e.s.regions[c].nb[0];
  e.setOwner(n, 't1'); ask(e, { t1: 4 }); attackTo(e, 't1', c); assert.strictEqual(e.s.turn.res.find(y => y.tid === 't1').why, 'castle-closed');
  e = playing('siege'); e.setOwner(n, 't1'); ask(e, { t1: 4 }); attackTo(e, 't1', c); e.next();
  assert.strictEqual(e.s.duel.kind, 'garrison'); assert.strictEqual(e.s.duel.sub, 'answer'); assert.strictEqual(e.s.duel.q.d, 3);
  e.judge(false); assert.strictEqual(e.s.duel.winner, 'hold'); assert.strictEqual(e.s.owner[c], null);
  e.next(); e.next(); ask(e, { t1: 4 }); attackTo(e, 't1', c); e.next(); e.judge(true); assert.strictEqual(e.s.owner[c], 't1');
  const before = e.score('t1'); assert.strictEqual(before, e.regionsOf('t1').length - 1 + 5);
  // فريق آخر يهاجم القلعة المملوكة: أفضل من ثلاثة
  e.next(); e.next(); const m = e.s.regions[c].nb.find(j => e.s.owner[j] !== 't1'); e.setOwner(m, 't2');
  ask(e, { t2: 4 }); attackTo(e, 't2', c); e.next(); assert.strictEqual(e.s.duel.kind, 'castle');
  buzzAs(e, 't2'); e.judge(true); e.next(); buzzAs(e, 't1'); e.judge(true); e.next(); assert.strictEqual(e.s.owner[c], 't1');
  buzzAs(e, 't2'); e.judge(true); assert.strictEqual(e.s.owner[c], 't2');
});

test('التوقع: ذهبة لكل توقع صحيح بحد 3 للفريق', () => {
  const e = mk(4); join(e, 5); goPhase(e, 'friction'); const rid = border(e, 't1', 't2'); ask(e, { t1: 5 }); attackTo(e, 't1', rid);
  const g3 = e.team('t3').res.gold, g4 = e.team('t4').res.gold;
  mem(e, 't3').forEach(sid => e.predict(sid, 't1')); mem(e, 't4').forEach((sid, i) => e.predict(sid, i < 2 ? 't1' : 't2'));
  assert.strictEqual(e.predict(mem(e, 't1')[0], 't1').why, 'closed', 'المتواجهون لا يتوقعون');
  e.adv(5); e.tick(); buzzAs(e, 't1'); e.judge(true);
  assert.strictEqual(e.team('t3').res.gold - g3, 3); assert.strictEqual(e.team('t4').res.gold - g4, 2);
});

test('البيني يحسب انتصارًا واحدًا', () => {
  const e = playing(); const rid = border(e, 't1', 't2'); e.s.fort[rid] = true; ask(e, { t1: 4 }); attackTo(e, 't1', rid); e.next();
  e.duelInter('حبل'); e.duelRound('t1'); assert.strictEqual(e.s.duel.wins.t1, 1); assert.strictEqual(e.s.owner[rid], 't2');
});

test('الحلف: عرض وقبول، لا هجوم بين الحليفين، وإرسال موارد', () => {
  const e = playing(); assert.ok(e.offerAlly('t1', 't2', cap(e, 't1')).ok);
  assert.strictEqual(e.offerAlly('t3', 't1', cap(e, 't3')).ok, true);
  assert.ok(e.answerAlly('t2', 't1', true, cap(e, 't2')).allied); assert.strictEqual(e.s.offers.length, 0, 'العروض الأخرى تسقط');
  assert.strictEqual(e.offerAlly('t3', 't1', cap(e, 't3')).why, 'has-ally');
  assert.ok(e.sendRes('t1', 'gold', 4, cap(e, 't1')).ok); assert.strictEqual(e.team('t2').res.gold, 10);
  const rid = border(e, 't1', 't2'); ask(e, { t1: 4 }); attackTo(e, 't1', rid); assert.strictEqual(e.s.turn.res.find(y => y.tid === 't1').why, 'ally');
});

test('العرض يسقط بعد 30 ثانية، ولا حلف في التوسع', () => {
  const e = playing(); e.offerAlly('t1', 't2', cap(e, 't1')); e.adv(31); e.tick(); assert.strictEqual(e.s.offers.length, 0);
  const f = playing('expand'); assert.strictEqual(f.offerAlly('t1', 't2', cap(f, 't1')).why, 'closed');
});

test('الإنهاء الهادئ يسري من الدورة التالية', () => {
  const e = playing(); e.offerAlly('t1', 't2', cap(e, 't1')); e.answerAlly('t2', 't1', true, cap(e, 't2'));
  e.endAlly('t1', cap(e, 't1')); assert.strictEqual(e.team('t1').ally, 't2');
  ask(e, {}); assert.strictEqual(e.s.step, 'harvest'); assert.strictEqual(e.team('t1').ally, null); assert.strictEqual(e.team('t2').ally, null);
});

test('النقض: ضربة تتجاوز التحصين بفوز واحد، ثم ثأر مجاني يتجاوز التحصين لثلاث دورات', () => {
  const e = playing(); const rid = border(e, 't1', 't2'); e.s.fort[rid] = true;
  e.offerAlly('t1', 't2', cap(e, 't1')); e.answerAlly('t2', 't1', true, cap(e, 't2'));
  ask(e, { t1: 4 }); attackTo(e, 't1', rid, { betray: true });
  assert.strictEqual(e.team('t1').ally, null); assert.strictEqual(e.team('t1').stats.betray, 1);
  e.next(); assert.ok(e.s.duel.bypass); buzzAs(e, 't1'); e.judge(true); assert.strictEqual(e.s.owner[rid], 't1');
  e.next(); e.next();
  const c0 = e.s.cycle; assert.deepStrictEqual(e.team('t2').revenge, { on: 't1', until: c0 + 3 });
  // الثأر: إقليم محصّن للغادر
  const back = e.s.regions[rid].nb.find(j => e.s.owner[j] === 't2') ?? border(e, 't2', 't1'); const tgt = e.s.regions[back].nb.find(j => e.s.owner[j] === 't1') ?? rid;
  e.s.fort[tgt] = true; const g = e.team('t2').res.gold;
  ask(e, { t2: 4 }); attackTo(e, 't2', tgt); assert.strictEqual(e.team('t2').res.gold, g, 'مجاني');
  e.next(); assert.strictEqual(e.s.duel.need.t2, 1); buzzAs(e, 't2'); e.judge(true); assert.strictEqual(e.s.owner[tgt], 't2');
  e.next(); e.next(); ask(e, {}); e.next(); ask(e, {}); assert.strictEqual(e.s.step, 'harvest'); e.next();
  assert.strictEqual(e.team('t2').revenge, null, 'ينتهي بعد ثلاث دورات');
  assert.strictEqual(e.offerAlly('t1', 't3', cap(e, 't1')).ok, true);
});

test('النقض بلا حلف مرفوض', () => {
  const e = playing(); const rid = border(e, 't1', 't2'); ask(e, { t1: 4 }); attackTo(e, 't1', rid, { betray: true });
  assert.strictEqual(e.s.turn.res.find(y => y.tid === 't1').why, 'no-ally');
});

test('المعركة الأخيرة: تسقط التحالفات، والهجوم بنصف التكلفة', () => {
  const e = playing('siege'); e.offerAlly('t1', 't2', cap(e, 't1')); e.answerAlly('t2', 't1', true, cap(e, 't2'));
  e.s.step = 'phaseEnd'; e.nextPhase(); assert.strictEqual(PHASES[e.s.phase].k, 'final');
  assert.strictEqual(e.team('t1').ally, null); assert.strictEqual(e.offerAlly('t1', 't2', cap(e, 't1')).why, 'closed');
  const rid = border(e, 't1', 't2'); ask(e, { t1: 4 }); attackTo(e, 't1', rid); assert.strictEqual(e.s.duel.cost, 2);
});

test('الحصاد حسب الأنواع، ومضاعف من مرحلة الحرب', () => {
  for (const [k, m] of [['friction', 1], ['war', 2]]) {
    const e = playing(k); e.setOwner(neutralNear(e, 't1').id, 't1');
    const want = { food: 0, gold: 0, stone: 0 }; e.regionsOf('t1').forEach(i => { const p = PROD[e.s.regions[i].type]; for (const r in p) want[r] += p[r] * m; });
    ask(e, {}); assert.deepStrictEqual(e.s.turn.harvest.t1, want, k);
  }
});

test('المرحلة تنتهي مع آخر دورة بدأت في وقتها، والمشرف يمددها', () => {
  const e = playing('expand'); e.adv(7 * 60); ask(e, {}); e.adv(120); e.next();
  assert.strictEqual(e.s.step, 'phaseEnd'); assert.strictEqual(e.nextCycle().ok, false);
  e.setPhaseMin('expand', 12); e.s.step = 'ready'; assert.ok(e.nextCycle().ok);
});

test('الدورة التجريبية لا تترك أثرًا', () => {
  const e = mk(4); join(e, 4); e.start(); const before = JSON.stringify([e.s.owner, e.s.teams]);
  assert.ok(e.trialCycle().ok); const a = e.s.q.a; mem(e, 't1').forEach(sid => e.answer(sid, a)); e.next();
  const nb = neutralNear(e, 't1').id; e.setOrders('t1', [{ k: 'occupy', r: nb }, { k: 'supply', res: 'gold' }], cap(e, 't1')); settle(e);
  assert.strictEqual(e.s.step, 'harvest'); e.next();
  assert.strictEqual(e.s.step, 'setup'); assert.strictEqual(JSON.stringify([e.s.owner, e.s.teams]), before); assert.strictEqual(e.s.cycle, 0);
});

test('التراجع يعيد الحكم والمنح', () => {
  const e = playing(); const rid = border(e, 't1', 't2'); ask(e, { t1: 4 }); attackTo(e, 't1', rid); e.next(); buzzAs(e, 't1');
  e.judge(true); assert.strictEqual(e.s.owner[rid], 't1'); e.undo(); assert.strictEqual(e.s.owner[rid], 't2'); assert.strictEqual(e.s.duel.sub, 'answer');
  e.judge(false); assert.strictEqual(e.s.duel.buzz, 't2');
});

test('القيادة تنتقل إن غاب القائد 20 ثانية', () => {
  const e = playing(); const c = cap(e, 't1'); e.setOffline(c); e.tick(); assert.strictEqual(cap(e, 't1'), c);
  e.adv(21); e.tick(); assert.notStrictEqual(cap(e, 't1'), c);
});

test('الإجابة الصحيحة لا تُبث قبل كشفها', () => {
  const e = playing(); e.nextCycle(); assert.ok(!('a' in e.pub().q)); assert.ok(!('undo' in e.pub()));
  const rid = border(e, 't1', 't2'); mem(e, 't1').forEach(sid => e.answer(sid, e.s.q.a)); e.next(); assert.ok('a' in e.pub().q);
  attackTo(e, 't1', rid); e.next(); assert.ok(!('a' in e.pub().duel.q));
});

test('هدف تغيّر مالكه بمواجهة سابقة في الدورة نفسها: يُرد الذهب', () => {
  const e = playing(); const rid = border(e, 't2', 't3'); const n = e.s.regions[rid].nb.find(j => e.s.owner[j] !== 't2' && j !== e.s.castle && e.s.regions[j].type !== 'capital');
  e.setOwner(n, 't1'); ask(e, { t1: 4, t2: 3 });
  attackTo(e, 't1', rid); attackTo(e, 't2', rid); // t1 أعلى نسبة فيهاجم أولًا
  e.next(); buzzAs(e, 't1'); e.judge(true); assert.strictEqual(e.s.owner[rid], 't1');
  const g = e.team('t2').res.gold; e.next(); assert.ok(['harvest'].includes(e.s.step)); assert.ok(e.team('t2').res.gold >= g + 4);
});

test('التتويج: ترتيب بالأرض، والقلعة بخمسة، والألقاب، والتعادل يُحسم بمواجهة', () => {
  const e = playing('final'); const s = e.s; s.owner = s.owner.map(() => null); s.owner[s.castle] = 't3';
  [0, 1, 2, 3, 4, 5].forEach(i => { if (i !== s.castle) s.owner[i] = 't1'; }); e.team('t2').stats.held = 3; e.team('t1').stats.atkWin = 2;
  s.step = 'phaseEnd'; e.nextPhase(); assert.strictEqual(s.step, 'tiebreak'); assert.deepStrictEqual(s.tie.teams.sort(), ['t1', 't3']);
  e.next(); buzzAs(e, 't3'); e.judge(true); e.next(); buzzAs(e, 't3'); e.judge(true); e.next();
  assert.strictEqual(s.step, 'crown'); assert.strictEqual(s.result.rank[0].id, 't3');
  const names = s.result.titles.map(t => t.name); assert.ok(names.includes('أصلب دفاع') && names.includes('أدهى قائد'));
});

console.log(`\n${pass}/${T}` + (fails.length ? '  فشل: ' + fails.join('، ') : ''));
process.exit(fails.length ? 1 : 0);
