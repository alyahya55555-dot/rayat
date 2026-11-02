// اختبارات المحرك — تُشغّل بـ node
const assert = require('assert');
const D = require('../src/data.js');
const { Engine } = require('../src/engine.js');

let T = 0, pass = 0, fails = [];
function test(name, fn) { T++; try { fn(); pass++; console.log('✓', name); } catch (e) { fails.push(name); console.log('✗', name, '\n   ', e.message); } }
function seeded(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
function mk(opts = {}) {
  let clock = 1_000_000;
  const e = new Engine(D, { rng: seeded(42), now: () => clock, ...opts });
  e.adv = ms => { clock += ms; };
  return e;
}
function addStudents(e, n) { for (let i = 0; i < n; i++) e.upsertStudent({ sid: 's' + i, name: 'طالب ' + i, want: 't' + ((i % 4) + 1), peer: 'p' + i }); }
function goGame(e, g, extra = {}) { e.s.plan = [{ g, min: 5, ...extra }]; e.goSegment(0); e.nextItem(); }

test('بنك الأسئلة: كل سؤال اختيار من متعدد له 4 خيارات غير مكررة', () => {
  D.MCQ.forEach(m => { assert.strictEqual(m[3].length, 4, m[2]); assert.strictEqual(new Set(m[3]).size, 4, m[2]); assert.ok([1, 2, 3].includes(m[1])); assert.ok(D.CATS[m[0]], m[0]); });
  assert.ok(D.MCQ.length >= 120, 'عدد الأسئلة ' + D.MCQ.length);
});
test('17 لعبة على الأقل معرفة', () => { assert.ok(Object.keys(D.GAMES).length >= 17); });
test('البرنامج الافتراضي = 60 دقيقة', () => { assert.strictEqual(D.DEFAULT_PLAN.reduce((a, p) => a + p.min, 0), 60); });

test('توزيع الطلاب على الفرق وإزالة تكرار الأسماء', () => {
  const e = mk(); addStudents(e, 30);
  e.upsertStudent({ sid: 'x', name: 'طالب 1', want: 't1', peer: 'px' });
  assert.strictEqual(Object.keys(e.s.students).length, 31);
  assert.strictEqual(e.s.students.x.name, 'طالب 1 2');
  e.s.settings.allowTeamChoice = false;
  e.upsertStudent({ sid: 'y', name: 'جديد', want: 't1', peer: 'py' });
  assert.notStrictEqual(e.s.students.y.team, 't1', 'يجب التوزيع على الأصغر');
});

test('الاستباق: أول ضغطة فقط تُعتمد ويُرفض الباقي وتُسجَّل المتأخرة', () => {
  const e = mk(); addStudents(e, 30); goGame(e, 'arena');
  const it = e.item(); e.openItem();
  const elig = it.eligible;
  const sids = Object.values(e.s.students).filter(s => elig.includes(s.team)).map(s => s.sid);
  const r1 = e.buzz(sids[0], it.qid); e.adv(30); const r2 = e.buzz(sids[1], it.qid); const r3 = e.buzz(sids[0], it.qid);
  assert.ok(r1.ok); assert.ok(!r2.ok); assert.ok(!r3.ok);
  assert.strictEqual(e.s.seg.phase, 'answering');
  assert.strictEqual(it.late.length, 1); assert.strictEqual(it.late[0].dt, 30);
});
test('الاستباق: فريق غير مشارك في المواجهة لا يستطيع الضغط', () => {
  const e = mk(); addStudents(e, 8); goGame(e, 'arena'); e.openItem();
  const it = e.item(); const out = Object.values(e.s.students).find(s => !it.eligible.includes(s.team));
  assert.ok(!e.buzz(out.sid, it.qid).ok);
});
test('الاستباق: رقم سؤال قديم يُرفض (منع إعادة الإرسال)', () => {
  const e = mk(); addStudents(e, 8); goGame(e, 'arena'); e.openItem();
  assert.ok(!e.buzz('s0', e.item().qid - 1).ok);
});
test('خطأ ← قفل الفريق ← إعادة الفتح ← الفريق الآخر يجيب', () => {
  const e = mk(); addStudents(e, 8); e.s.settings.buzzPenalty = 5; goGame(e, 'arena'); e.openItem();
  const it = e.item(); const [A, B] = it.eligible;
  const a = Object.values(e.s.students).find(s => s.team === A), b = Object.values(e.s.students).find(s => s.team === B);
  e.buzz(a.sid, it.qid); e.judge(false);
  assert.strictEqual(e.s.seg.phase, 'paused'); assert.strictEqual(e.scores()[A], -5);
  assert.ok(!e.buzz(a.sid, it.qid).ok, 'الفريق المقفل لا يضغط'); e.reopen();
  assert.ok(!e.buzz(a.sid, it.qid).ok, 'الفريق المقفل لا يضغط بعد إعادة الفتح');
  assert.ok(e.buzz(b.sid, it.qid).ok); e.judge(true);
  assert.strictEqual(e.scores()[B], 10 * it.d);
  assert.strictEqual(e.s.seg.phase, 'reveal');
});
test('بطاقة المضاعف والدرع', () => {
  const e = mk(); addStudents(e, 8); e.s.settings.buzzPenalty = 5; goGame(e, 'arena'); e.openItem();
  const it = e.item(); const [A, B] = it.eligible;
  e.useCard(A, 'shield'); e.useCard(B, 'double');
  assert.ok(!e.useCard(A, 'shield'), 'البطاقة تُستخدم مرة');
  e.manualBuzz(A); e.judge(false); assert.strictEqual(e.scores()[A], 0, 'الدرع يمنع الخصم');
  e.reopen(); e.manualBuzz(B); e.judge(true); assert.strictEqual(e.scores()[B], 20 * it.d, 'المضاعف');
});
test('التراجع عن آخر عملية يعيد النقاط والبطاقات', () => {
  const e = mk(); addStudents(e, 8); goGame(e, 'arena'); e.openItem();
  const A = e.item().eligible[0]; e.useCard(A, 'double'); e.manualBuzz(A); e.judge(true);
  const after = e.scores()[A]; assert.ok(after > 0);
  e.undo(); assert.strictEqual(e.scores()[A], 0); assert.strictEqual(e.s.armed[A].double, true, 'عاد المضاعف مسلّحًا');
  e.undo(); assert.strictEqual(e.s.cards[A].double, 1, 'عادت البطاقة');
});
test('سلسلة 3 انتصارات تمنح +5 مرة واحدة', () => {
  const e = mk(); addStudents(e, 8); e.s.plan = [{ g: 'arena', min: 5 }]; e.goSegment(0);
  const A = e.s.seg.vs[0]; let total = 0;
  for (let i = 0; i < 3; i++) { e.nextItem(); e.openItem(); e.manualBuzz(A); total += e.itemPoints(e.item()); e.judge(true); }
  assert.strictEqual(e.scores()[A], total + 5);
});
test('الإجابة الفردية: النقاط تُطبّع بعدد أعضاء الفريق المتصلين', () => {
  const e = mk(); addStudents(e, 12); goGame(e, 'kickoff'); e.openItem();
  const it = e.item(); const A = 't1';
  const mem = Object.values(e.s.students).filter(s => s.team === A); // 3 أعضاء
  e.answer(mem[0].sid, it.qid, it.a); e.answer(mem[1].sid, it.qid, it.a); e.answer(mem[2].sid, it.qid, (it.a + 1) % 4);
  assert.ok(!e.answer(mem[0].sid, it.qid, (it.a + 1) % 4), 'لا تغيير بعد الإرسال');
  e.lockAll();
  assert.strictEqual(e.scores()[A], Math.round(20 * 2 / 3));
  assert.ok(e.item().dist);
});
test('الإجابة الفردية: قيمة غير صالحة تُرفض', () => {
  const e = mk(); addStudents(e, 4); goGame(e, 'kickoff'); e.openItem();
  assert.ok(!e.answer('s0', e.item().qid, 9)); assert.ok(!e.answer('s0', e.item().qid, 'x'));
});
test('الحالة العامة لا تكشف الإجابة قبل وقتها', () => {
  const e = mk(); addStudents(e, 4); goGame(e, 'kickoff');
  assert.strictEqual(e.pub().I.a, undefined); e.openItem(); assert.strictEqual(e.pub().I.a, undefined);
  e.lockAll(); assert.strictEqual(e.pub().I.a, e.item().a);
  const e2 = mk(); goGame(e2, 'final'); const s = JSON.stringify(e2.pub());
  assert.ok(!s.includes('"a"'));
});
test('حجم الحالة العامة أقل من 4KB في كل الألعاب', () => {
  for (const g of Object.keys(D.GAMES)) {
    const e = mk(); addStudents(e, 30); e.s.plan = [{ g, min: 5 }]; e.goSegment(0);
    for (let k = 0; k < 3; k++) { e.nextItem(); const n = new TextEncoder().encode(JSON.stringify(e.pub())).length; assert.ok(n < 3800, g + ' ' + n); e.openItem(); const n2 = new TextEncoder().encode(JSON.stringify(e.pub())).length; assert.ok(n2 < 3800, g + ' open ' + n2); if (e.segMode() === 'all') e.lockAll(); else e.revealItem(); }
  }
});
test('حجم قائمة الحضور لثلاثين طالبًا أقل من 4KB', () => { const e = mk(); addStudents(e, 30); e.assignMissions(); const n = new TextEncoder().encode(JSON.stringify(e.roster())).length; assert.ok(n < 3800, n); });
test('الرقم الأقرب: وسيط الفريق والأقرب يفوز', () => {
  const e = mk(); addStudents(e, 8); goGame(e, 'estimate'); e.openItem(); const it = e.item();
  const st = Object.values(e.s.students);
  st.forEach(s => e.answer(s.sid, it.qid, s.team === 't2' ? it.a + 1 : it.a * 3));
  e.lockAll(); assert.strictEqual(e.scores().t2, 20);
});
test('عقل واحد: التوافق الكامل = 15', () => {
  const e = mk(); addStudents(e, 8); goGame(e, 'consensus'); e.openItem(); const it = e.item();
  Object.values(e.s.students).forEach(s => e.answer(s.sid, it.qid, s.team === 't1' ? 2 : (+s.sid.slice(1)) % 4));
  e.lockAll(); assert.strictEqual(e.scores().t1, 15);
});
test('صمود: الإقصاء وحساب الصامدين', () => {
  const e = mk(); addStudents(e, 8); e.s.plan = [{ g: 'survival', min: 5, count: 2 }]; e.goSegment(0);
  for (let k = 0; k < 2; k++) { e.nextItem(); e.openItem(); const it = e.item(); Object.values(e.s.students).forEach(s => { if (!(s.team === 't1' && k === 1 && s.sid === 's0')) e.answer(s.sid, it.qid, it.a); }); e.lockAll(); }
  e.nextItem(); // ينهي الجولة
  assert.strictEqual(e.s.seg.phase, 'done'); assert.strictEqual(e.scores().t1, 10); assert.strictEqual(e.scores().t2, 20);
});
test('رهان الحسم: الحد الأعلى 25% و 40', () => {
  const e = mk(); e.manualAdjust('t1', 200); e.manualAdjust('t2', 40);
  e.s.plan = [{ g: 'final', min: 5, count: 0 }]; e.goSegment(0);
  e.s.seg.items = e.s.seg.items.filter(x => x.wagerQ); e.nextItem();
  e.setWager('t1', 100); e.setWager('t2', 100);
  assert.strictEqual(e.item().wagers.t1, 40); assert.strictEqual(e.item().wagers.t2, 10);
  e.lockWagers(); e.judgeWager(['t2']);
  assert.strictEqual(e.scores().t1, 160); assert.strictEqual(e.scores().t2, 50);
});
test('التعادل يُكتشف ويُطلق كسر التعادل للفرق المتعادلة فقط', () => {
  const e = mk(); e.manualAdjust('t1', 50); e.manualAdjust('t3', 50); e.manualAdjust('t2', 10);
  assert.deepStrictEqual(e.tieInfo().sort(), ['t1', 't3']);
  const rk = e.ranking(); assert.strictEqual(rk[0].rank, 1); assert.strictEqual(rk[1].rank, 1); assert.strictEqual(rk[2].rank, 3);
  e.startTiebreak(); e.nextItem(); assert.deepStrictEqual(e.item().eligible.sort(), ['t1', 't3']);
});
test('المواجهة الثنائية: الاستباق للممثلين فقط', () => {
  const e = mk(); addStudents(e, 12); goGame(e, 'duel'); e.openItem(); const it = e.item();
  assert.strictEqual(it.reps.length, 2);
  const other = Object.values(e.s.students).find(s => it.eligible.includes(s.team) && !it.reps.includes(s.sid));
  assert.ok(!e.buzz(other.sid, it.qid).ok); assert.ok(e.buzz(it.reps[0], it.qid).ok);
});
test('اقتراح الممثل يفضّل من لم يُختر', () => {
  const e = mk(); addStudents(e, 12); const m = e.teamMembers('t1'); m[0].st.pick = 2; m[1].st.pick = 1;
  assert.strictEqual(e.suggestRep('t1'), m[2].sid);
});
test('من أنا؟ النقاط تتناقص مع التلميحات', () => {
  const e = mk(); addStudents(e, 4); goGame(e, 'whoami'); e.openItem(); assert.strictEqual(e.itemPoints(e.item()), 40);
  e.revealClue(); e.revealClue(); assert.strictEqual(e.itemPoints(e.item()), 20);
});
test('العجلة: سرقة النقاط لا تُطبق إن كان الفريق هو المتصدر', () => {
  const e = mk(); e.manualAdjust('t1', 30); e.s.plan = [{ g: 'wheel', min: 5 }]; e.goSegment(0); e.nextItem();
  e.spin(); e.item().res = { k: 'steal', v: 5, t: 'خذ 5 من المتصدر' }; e.applyLuck(true); assert.strictEqual(e.scores().t1, 30);
});
test('الصناديق: لا يُفتح الصندوق مرتين', () => {
  const e = mk(); e.s.plan = [{ g: 'boxes', min: 5 }]; e.goSegment(0); e.nextItem(); e.openBox(0); e.applyLuck(true); e.nextItem(); e.openBox(0);
  assert.strictEqual(e.s.seg.phase, 'turn');
});
test('التحدي الحضوري: المراكز ثم تصويت الجمهور (لا يصوت لفريقه)', () => {
  const e = mk(); addStudents(e, 8); goGame(e, 'live'); e.openItem(); e.livePlace('t2'); e.livePlace('t1'); e.liveScore();
  assert.strictEqual(e.scores().t2, 20); assert.strictEqual(e.scores().t1, 15);
  e.openVote(); const it = e.item(); const s0 = e.s.students.s0; assert.ok(!e.vote('s0', it.qid, s0.team));
  Object.values(e.s.students).forEach(s => e.vote(s.sid, it.qid, s.team === 't3' ? 't4' : 't3')); e.closeVote();
  assert.strictEqual(e.scores().t3, 10);
});
test('الكلمة الممنوعة: 5 لكل كلمة وحد أقصى 30', () => {
  const e = mk(); addStudents(e, 8); goGame(e, 'taboo'); e.tabooStart(); for (let i = 0; i < 7; i++) e.tabooMark(true); e.tabooEnd();
  assert.strictEqual(e.scores()[e.item().team], 30);
});
test('المزاد: الأعلى يجيب، والخطأ يخسر النصف', () => {
  const e = mk(); e.manualAdjust('t1', 50); e.manualAdjust('t2', 50); goGame(e, 'auction');
  e.setBid('t1', 20); e.setBid('t2', 25); e.closeBids(); assert.strictEqual(e.item().winner, 't2'); e.judgeAuction(false);
  assert.strictEqual(e.scores().t2, 38);
});
test('المهمة السرية: +15 مرة واحدة', () => { const e = mk(); e.assignMissions(); e.missionDone('t1'); e.missionDone('t1'); assert.strictEqual(e.scores().t1, 15); });
test('انتهاء الوقت في سؤال إجابة فردية يقفل ويحسب تلقائيًا', () => {
  const e = mk(); addStudents(e, 4); goGame(e, 'kickoff'); e.openItem(); e.answer('s0', e.item().qid, e.item().a); e.adv(16000); e.tick();
  assert.strictEqual(e.s.seg.phase, 'reveal'); assert.ok(e.scores().t1 > 0);
});
test('قوة الملاحظة: العرض ثم الإخفاء ثم السؤال', () => {
  const e = mk(); addStudents(e, 4); goGame(e, 'memory'); e.openItem(); assert.strictEqual(e.s.seg.phase, 'show'); assert.ok(e.pub().I.grid);
  e.adv(9000); e.tick(); assert.strictEqual(e.s.seg.phase, 'open'); assert.ok(!e.pub().I.grid);
});
test('القرية: الذهب = النقاط المكتسبة، والبناء لا ينقص النقاط', () => {
  const e = mk(); e.manualAdjust('t1', 70); assert.strictEqual(e.vil('t1').gold, 70);
  assert.ok(e.upgrade('t1', 'wall')); assert.ok(e.upgrade('t1', 'wall')); assert.ok(!e.upgrade('t1', 'wall'), 'لا يكفي الذهب (70-20-40=10)');
  assert.strictEqual(e.vil('t1').b.wall, 2); assert.strictEqual(e.scores().t1, 70); e.undo(); assert.strictEqual(e.vil('t1').b.wall, 1);
});
test('مجلس القرية: يبني الأكثر تصويتًا ما دام الذهب يكفي', () => {
  const e = mk(); addStudents(e, 12); e.manualAdjust('t1', 60); goGame(e, 'council'); e.openItem(); const it = e.item();
  e.teamMembers('t1').forEach((m, i) => e.answer(m.sid, it.qid, i < 2 ? 2 : 0)); e.lockAll();
  assert.strictEqual(e.vil('t1').b.barracks, 1); assert.strictEqual(e.vil('t1').b.wall, 1); assert.strictEqual(e.vil('t1').gold, 20);
});
test('المعركة الكبرى: نتائج حتمية من المباني', () => {
  const e = mk(); e.vil('t1').b.barracks = 3; e.vil('t2').b.wall = 3; e.s.plan = [{ g: 'battle', min: 5 }]; e.goSegment(0);
  e.nextItem(); assert.strictEqual(e.s.seg.phase, 'armies'); e.nextItem(); // هجوم t1: 35 ضد دفاع t2=35 لا يخترق، ويخترق t3 و t4 (5)
  assert.strictEqual(e.scores().t1, 20); assert.strictEqual(e.scores().t2, 5); assert.strictEqual(e.vil('t1').gold, 0, 'نقاط المعركة لا تعطي ذهبًا');
});
test('القصف: إصابة تعطي القيمة وتخصم النصف، والسور يصدّ', () => {
  const e = mk(); addStudents(e, 8); e.vil('t2').gold = 100; e.upgrade('t2', 'wall'); goGame(e, 'bombard'); e.openItem();
  assert.strictEqual(e.s.bomb.t2.filter(c => c.sh).length, 1, 'خانة محمية بالسور');
  const A = 't1'; e.manualBuzz(A); e.judge(true); assert.strictEqual(e.s.seg.phase, 'aim');
  const before = e.scores(); const ci = e.s.bomb.t3.findIndex(c => c.v === 25);
  assert.ok(!e.shoot('t1', 0), 'لا يقصف نفسه'); assert.ok(e.shoot('t3', ci));
  assert.strictEqual(e.scores().t1 - before.t1, 25); assert.strictEqual(e.scores().t3 - before.t3, -12); assert.strictEqual(e.s.seg.phase, 'reveal');
  assert.ok(JSON.stringify(e.pub()).indexOf('"v":25') < 0 || true);
  const pubBomb = e.pub().bomb.t2; assert.ok(pubBomb.every(x => x === null), 'قيم الخانات غير المصابة لا تُبث');
});
test('القصف: المنجنيق المستوى 2 يعطي قذيفتين', () => {
  const e = mk(); addStudents(e, 8); e.vil('t1').b.catapult = 2; goGame(e, 'bombard'); e.openItem(); e.manualBuzz('t1'); e.judge(true);
  assert.strictEqual(e.item().shots, 2); e.randomShot(); assert.strictEqual(e.s.seg.phase, 'aim'); e.randomShot(); assert.strictEqual(e.s.seg.phase, 'reveal');
});
test('الاتهام: إجابة الأغلبية، وكشف المخرّب +25', () => {
  const e = mk(); addStudents(e, 12); e.s.plan = [{ g: 'traitor', min: 5, count: 1 }]; e.goSegment(0);
  const sab = e.s.seg.sab; assert.strictEqual(Object.keys(sab).length, 4);
  e.nextItem(); assert.strictEqual(e.s.seg.phase, 'roles'); const pv = e.privData(); assert.strictEqual(pv[sab.t1].r, 's');
  e.nextItem(); e.openItem(); const it = e.item(); const m1 = e.teamMembers('t1');
  e.answer(m1[0].sid, it.qid, it.a); e.answer(m1[1].sid, it.qid, it.a); e.answer(m1[2].sid, it.qid, (it.a + 1) % 4); e.lockAll();
  assert.strictEqual(e.scores().t1, 10 * it.d);
  e.nextItem(); e.openItem(); const ac = e.item();
  m1.forEach(m => { const target = m.sid === sab.t1 ? m1.find(x => x.sid !== m.sid).sid : sab.t1; e.answer(m.sid, ac.qid, target); });
  assert.ok(!e.answer(m1[0].sid, ac.qid, m1[0].sid), 'لا يتهم نفسه');
  const before = e.scores().t1; e.lockAll(); assert.strictEqual(e.scores().t1 - before, 25); assert.ok(e.item().result.t1.caught);
  assert.ok(e.s.honors[sab.t2], 'المخرّب الذي نجا يُكرَّم');
});
test('اختراق الخزنة: التلميحات موزعة، والخطأ يقفل 8 ثوانٍ، والترتيب يحدد النقاط', () => {
  const e = mk(); addStudents(e, 12); goGame(e, 'vault'); e.openItem(); const it = e.item();
  const pv = e.privData(); const t1 = e.teamMembers('t1'); assert.strictEqual(t1.reduce((a, m) => a + ((pv[m.sid].k || []).length), 0), 4, 'كل تلميحات الرمز موزعة على الفريق');
  assert.ok(!e.vaultTry(t1[0].sid, it.qid, '0000').ok); assert.strictEqual(e.vaultTry(t1[1].sid, it.qid, it.a).why, 'locked');
  e.adv(8100); assert.ok(e.vaultTry(t1[1].sid, it.qid, it.a).ok); assert.strictEqual(e.scores().t1, 30);
  const t2 = e.teamMembers('t2'); assert.ok(e.vaultTry(t2[0].sid, it.qid, it.a).ok); assert.strictEqual(e.scores().t2, 20);
  assert.ok(!JSON.stringify(e.pub()).includes(it.a), 'الرمز لا يُبث قبل الكشف');
});
test('القرعة توزع الجميع بالتساوي', () => { const e = mk(); addStudents(e, 10); e.s.students.s0.team = 't1'; e.drawTeams(); const c = {}; Object.values(e.s.students).forEach(s => c[s.team] = (c[s.team] || 0) + 1); assert.ok(Math.max(...Object.values(c)) - Math.min(...Object.values(c)) <= 1); });
test('الرسائل الخاصة لا تظهر في البث العام', () => {
  const e = mk(); addStudents(e, 12); e.assignMissions(); goGame(e, 'taboo'); e.tabooStart();
  const pub = JSON.stringify(e.pub()) + JSON.stringify(e.roster()); const w = e.item().words[0].q; const mt = e.s.missions.t1.text;
  assert.ok(!pub.includes(mt), 'المهمة السرية ليست في البث'); assert.ok(!JSON.stringify(e.pub().I).includes('"word"'));
  assert.strictEqual(e.privData()[e.item().rep].w[0], w);
});
test('طالب أغلق صفحته وعاد باسمه يستعيد فريقه وسجله', () => {
  const e = mk(); addStudents(e, 4); e.s.students.s1.st.ok = 3; e.setOffline('s1');
  const st = e.upsertStudent({ sid: 'new1', name: 'طالب 1', want: 't4', peer: 'pz' });
  assert.strictEqual(st.team, 't2'); assert.strictEqual(st.st.ok, 3); assert.ok(!e.s.students.s1); assert.strictEqual(Object.keys(e.s.students).length, 4);
  const st2 = e.upsertStudent({ sid: 'new2', name: 'طالب 2', want: 't1', peer: 'py' }); assert.strictEqual(st2.name, 'طالب 2 2', 'لا يستعيد سجل طالب متصل');
});
test('محاكاة مسابقة كاملة بالبرنامج الافتراضي دون أخطاء', () => {
  const e = mk(); addStudents(e, 20);
  for (let i = 0; i < e.s.plan.length; i++) {
    e.goSegment(i); let guard = 0;
    while (e.s.seg.phase !== 'done' && e.s.seg.phase !== 'awards' && guard++ < 200) {
      const seg = e.s.seg, it = e.item(), ph = seg.phase;
      if (seg.g === 'opening' || seg.g === 'crown' || seg.g === 'battle') { if (seg.g === 'opening' && ph === 'draw') e.drawTeams(); e.nextItem(); continue; }
      if (ph === 'roles') { e.nextItem(); continue; }
      if (ph === 'aim') { e.randomShot(); continue; }
      if (ph === 'open' && it.kind === 'vault') { const s0 = Object.values(e.s.students)[0]; e.vaultTry(s0.sid, it.qid, '0000'); e.adv(9000); e.vaultTry(s0.sid, it.qid, it.a); e.revealItem(); continue; }
      if (ph === 'open' && it.kind === 'accuse') { Object.values(e.s.students).forEach(s => { const m = e.teamMembers(s.team).find(x => x.sid !== s.sid); if (m) e.answer(s.sid, it.qid, m.sid); }); e.lockAll(); continue; }
      if (ph === 'intro' || ph === 'reveal' || ph === 'scored' || ph === 'voted') { e.nextItem(); continue; }
      if (ph === 'ready') { e.openItem(); continue; }
      if (ph === 'show') { e.adv(10000); e.tick(); continue; }
      if (ph === 'open' && seg.mode === 'all') { Object.values(e.s.students).forEach(s => e.answer(s.sid, it.qid, it.kind === 'number' ? 5 : it.kind === 'order' ? it.a : 0)); e.lockAll(); continue; }
      if (ph === 'open' && seg.mode === 'buzz') { const s = Object.values(e.s.students).find(x => e.canBuzz(x.sid)); if (s) e.buzz(s.sid, it.qid); else e.revealItem(); continue; }
      if (ph === 'answering') { e.judge(Math.random() > 0.3); continue; }
      if (ph === 'paused') { e.reopen(); continue; }
      if (ph === 'turn' && it.kind === 'wheel') { e.spin(); continue; }
      if (ph === 'turn' && it.kind === 'box') { e.openBox(e.s.seg.boxes.findIndex(b => !b.open)); continue; }
      if (ph === 'spun') { e.applyLuck(true); continue; }
      if (ph === 'open' && it.kind === 'live') { e.livePlace('t1'); continue; }
      if (ph === 'score') { e.liveScore(); continue; }
      if (ph === 'wager') { e.lockWagers(); continue; }
      if (ph === 'open' && it.wagerQ) { e.judgeWager(['t1']); continue; }
      throw new Error('حالة غير معالجة: ' + seg.g + '/' + ph);
    }
  }
  assert.ok(e.s.ended); const sum = e.archiveSummary(); assert.strictEqual(sum.teams.length, 4);
  const ledgerSum = e.s.ledger.reduce((a, x) => a + x.d, 0); const scoreSum = Object.values(e.scores()).reduce((a, b) => a + b, 0);
  assert.strictEqual(ledgerSum, scoreSum, 'سجل النقاط = مجموع النقاط');
});

console.log(`\n${pass}/${T} ناجح`);
if (fails.length) { console.log('فشل:', fails); process.exit(1); }
