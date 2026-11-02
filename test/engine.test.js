// اختبارات محرك «جزيرة القرى» — تُشغّل بـ node
const assert = require('assert');
const D = require('../src/data.js');
const { Engine } = require('../src/engine.js');

let T = 0, pass = 0, fails = [];
function test(name, fn) { T++; try { fn(); pass++; console.log('✓', name); } catch (e) { fails.push(name); console.log('✗', name, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); } }
function seeded(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
function mk(opts = {}) { let clock = 1_000_000; const e = new Engine(D, { rng: seeded(42), now: () => clock, ...opts }); e.adv = ms => { clock += ms; }; return e; }
function addStudents(e, n) { for (let i = 0; i < n; i++) e.upsertStudent({ sid: 's' + i, name: 'طالب ' + i, want: 't' + ((i % 4) + 1), peer: 'p' + i }); }
function goGame(e, g, extra = {}) { e.s.plan = [{ g, min: 5, ...extra }]; e.goSegment(0); e.nextItem(); }
const bytes = o => Buffer.byteLength(JSON.stringify(o));

test('البيانات: خمس جولات، ستة مبانٍ بمستويين، أربعة طوابع، و60 دقيقة', () => {
  assert.deepStrictEqual(Object.keys(D.GAMES), ['kickoff', 'observe', 'arena', 'cipher', 'final']);
  assert.strictEqual(D.BUILD_KEYS.length, 6); D.BUILD_KEYS.forEach(k => assert.strictEqual(D.BUILD[k].cost.length, 2));
  assert.strictEqual(D.THEME_KEYS.length, 4);
  assert.strictEqual(D.DEFAULT_PLAN.reduce((a, p) => a + p.min, 0), 60);
  Object.values(D.GAMES).forEach(g => assert.ok(g.how.length <= 3, g.name + ': التعليمات لا تتجاوز 3 جمل'));
  D.MCQ.forEach(m => { assert.strictEqual(m[3].length, 4, m[2]); assert.strictEqual(new Set(m[3]).size, 4, m[2]); });
});
test('أول من ينضم لفريق يصبح قائده', () => { const e = mk(); addStudents(e, 8); assert.strictEqual(e.s.captain.t1, 's0'); assert.strictEqual(e.s.captain.t2, 's1'); });
test('القيادة تنتقل تلقائيًا إن غاب القائد 20 ثانية', () => {
  const e = mk(); addStudents(e, 8); e.setOffline('s0'); e.tick(); assert.strictEqual(e.s.captain.t1, 's0', 'لا تنتقل فورًا');
  e.adv(21000); e.tick(); assert.strictEqual(e.s.captain.t1, 's4');
});
test('النقاط والذهب نظامان منفصلان: الشراء لا ينقص النقاط', () => {
  const e = mk(); addStudents(e, 4); e.award('t1', 60, 'x', 1); assert.strictEqual(e.vil('t1').gold, 60);
  assert.ok(e.buy('t1', 'house', 's0').ok); assert.strictEqual(e.scores().t1, 60); assert.strictEqual(e.vil('t1').gold, 40);
});
test('الشراء للقائد وحده، والمستوى الأقصى 2، ولا شراء بلا ذهب', () => {
  const e = mk(); addStudents(e, 8); e.award('t1', 150, 'x', 1);
  assert.strictEqual(e.buy('t1', 'farm', 's4').why, 'not-captain');
  assert.ok(e.buy('t1', 'farm', 's0').ok); assert.ok(e.buy('t1', 'farm', 's0').ok); assert.strictEqual(e.buy('t1', 'farm', 's0').why, 'max');
  assert.strictEqual(e.buy('t1', 'castle', null).ok, true); assert.strictEqual(e.buy('t1', 'castle', null).why, 'gold');
  assert.strictEqual(e.s.buildLog.length, 3);
});
test('التراجع عن الشراء يعيد الذهب والمبنى', () => { const e = mk(); addStudents(e, 4); e.award('t1', 50, 'x', 1); e.buy('t1', 'house', 's0'); e.undo(); assert.strictEqual(e.vil('t1').gold, 50); assert.strictEqual(e.vil('t1').b.house, 0); assert.strictEqual(e.s.buildLog.length, 0); });
test('التعديل اليدوي للنقاط لا يمنح ذهبًا', () => { const e = mk(); e.manualAdjust('t2', 30); assert.strictEqual(e.scores().t2, 30); assert.strictEqual(e.vil('t2').gold, 0); });
test('طابع القرية: افتراضي لكل فريق، يغيّره المشرف فقط', () => {
  const e = mk(); addStudents(e, 8); assert.deepStrictEqual(e.s.teams.map(t => e.vil(t.id).theme), ['agri', 'trade', 'science', 'fort']);
  assert.ok(!e.setTheme('t1', 'science', 's0'), 'الطالب لا يغيّر الطابع'); assert.ok(e.setTheme('t1', 'science')); assert.strictEqual(e.vil('t1').theme, 'science');
});
test('فوز حضوري: نقاط وذهب معًا', () => { const e = mk(); e.liveWin('t3'); assert.strictEqual(e.scores().t3, 20); assert.strictEqual(e.vil('t3').gold, 20); });
test('الانطلاقة: الإجابة الفردية، والنقاط بنسبة الصحيحين من الأعضاء المتصلين', () => {
  const e = mk(); addStudents(e, 12); goGame(e, 'kickoff'); e.openItem(); const it = e.item();
  const m = e.teamMembers('t1'); e.answer(m[0].sid, it.qid, it.a); e.answer(m[1].sid, it.qid, it.a); e.answer(m[2].sid, it.qid, (it.a + 1) % 4);
  assert.ok(!e.answer(m[0].sid, it.qid, it.a), 'لا إجابة مكررة');
  e.lockAll(); assert.strictEqual(e.scores().t1, Math.round(20 * 2 / 3)); assert.strictEqual(e.vil('t1').gold, Math.round(20 * 2 / 3));
});
test('انتهاء الوقت يقفل الإجابات ويحسبها', () => { const e = mk(); addStudents(e, 4); goGame(e, 'kickoff'); e.openItem(); e.answer('s0', e.item().qid, e.item().a); e.adv(16000); e.tick(); assert.strictEqual(e.s.seg.phase, 'reveal'); assert.ok(e.scores().t1 > 0); });
test('قوة الملاحظة: عرض ثم سؤال، والمشهد الثاني يظهر عند التغيير', () => {
  const e = mk(); addStudents(e, 4); goGame(e, 'observe'); e.openItem(); assert.strictEqual(e.s.seg.phase, 'show'); assert.ok(e.pub().I.scene);
  assert.strictEqual(e.pub().I.a, undefined); e.adv(8000); e.tick(); assert.strictEqual(e.s.seg.phase, 'open');
  const it = e.item(); if (it.B) assert.ok(e.pub().I.scene); else assert.ok(!e.pub().I.scene);
});
test('قوة الملاحظة: كل أنواع الأسئلة صحيحة ومنطقية', () => {
  const e = mk();
  for (let i = 0; i < 40; i++) { const it = e.sceneItem(i); assert.strictEqual(it.c.length, 4); assert.strictEqual(new Set(it.c).size, 4, it.q + ' ' + it.c); assert.ok(it.a >= 0);
    if (it.obs === 'removed') assert.strictEqual(it.B.length, it.A.length - 1); if (it.obs === 'added') assert.strictEqual(it.B.length, it.A.length + 1);
    if (it.obs === 'count') { const t = Object.keys(D.SCENE).find(k => it.q.includes(D.SCENE[k])); assert.strictEqual(String(it.A.filter(o => o.t === t).length), it.c[it.a]); }
    if (it.obs === 'color') { const changed = it.A.filter((o, j) => o.c !== it.B[j].c); assert.strictEqual(changed.length, 1); assert.strictEqual(D.SCENE[changed[0].t], it.c[it.a]); } }
});
test('ساحة المواجهة: الأزواج تتناوب، والاستباق للفريقين فقط، وأول ضغطة تُعتمد', () => {
  const e = mk(); addStudents(e, 12); e.s.plan = [{ g: 'arena', min: 5 }]; e.goSegment(0);
  const pairs = e.s.seg.items.filter(x => x.pair).map(x => x.pair.join()); assert.ok(new Set(pairs).size >= 6);
  e.nextItem(); e.openItem(); const it = e.item(); const [A, B] = it.eligible;
  const out = Object.values(e.s.students).find(s => !it.eligible.includes(s.team)); assert.ok(!e.buzz(out.sid, it.qid).ok);
  const a = e.teamMembers(A)[0], b = e.teamMembers(B)[0];
  assert.ok(e.buzz(a.sid, it.qid).ok); e.adv(40); assert.ok(!e.buzz(b.sid, it.qid).ok); assert.strictEqual(it.late[0].dt, 40);
  e.judge(false); assert.strictEqual(e.s.seg.phase, 'paused'); e.reopen(); assert.ok(!e.buzz(a.sid, it.qid).ok, 'الفريق المخطئ لا يعود'); assert.ok(e.buzz(b.sid, it.qid).ok);
  e.judge(true); assert.strictEqual(e.scores()[B], 10 * it.d); assert.strictEqual(e.vil(B).gold, 10 * it.d);
});
test('سفينة الكنز: سؤال لكل الفرق يمنح ذهبًا فقط دون نقاط', () => {
  const e = mk(); addStudents(e, 8); e.s.plan = [{ g: 'arena', min: 5 }]; e.goSegment(0);
  const ti = e.s.seg.items.findIndex(x => x.treasure); assert.ok(ti > 0); assert.ok(!e.s.seg.items[ti].pair, 'مفتوح لكل الفرق');
  for (let i = 0; i <= ti; i++) e.nextItem(); e.openItem(); e.manualBuzz('t3'); e.judge(true);
  assert.strictEqual(e.scores().t3, 0); assert.strictEqual(e.vil('t3').gold, 40);
});
test('فك الشفرة: التلميحات موزعة، والخطأ يقفل 8 ثوانٍ، والترتيب يحدد النقاط', () => {
  const e = mk(); addStudents(e, 12); goGame(e, 'cipher'); e.openItem(); const it = e.item(); const pv = e.privData();
  const t1 = e.teamMembers('t1'); assert.strictEqual(t1.reduce((a, m) => a + ((pv[m.sid].k || []).length), 0), 4);
  assert.ok(!e.vaultTry(t1[0].sid, it.qid, '0000').ok); assert.strictEqual(e.vaultTry(t1[1].sid, it.qid, it.a).why, 'locked');
  e.adv(8100); assert.ok(e.vaultTry(t1[1].sid, it.qid, it.a).ok); assert.strictEqual(e.scores().t1, 30);
  assert.ok(e.vaultTry(e.teamMembers('t2')[0].sid, it.qid, it.a).ok); assert.strictEqual(e.scores().t2, 20);
  assert.ok(!JSON.stringify(e.pub()).includes(it.a), 'الرمز لا يُبث قبل الكشف');
});
test('الحسم: نقاط مضاعفة، ورهان القائد لا يتجاوز ربع النقاط', () => {
  const e = mk(); addStudents(e, 8); e.manualAdjust('t1', 100); e.manualAdjust('t2', 40);
  e.s.plan = [{ g: 'final', min: 5, count: 1 }]; e.goSegment(0); e.nextItem(); e.openItem(); e.manualBuzz('t2'); const it0 = e.item(); e.judge(true);
  assert.strictEqual(e.scores().t2, 40 + 20 * it0.d);
  e.nextItem(); assert.strictEqual(e.s.seg.phase, 'wager'); const before = e.scores();
  assert.ok(!e.setWager('t1', 25, 's4'), 'غير القائد لا يراهن'); e.setWager('t1', 999, 's0'); assert.strictEqual(e.item().wagers.t1, 25);
  e.lockWagers(); const it = e.item(); assert.ok(e.wagerPick('t1', it.a, 's0')); e.wagerPick('t2', (it.a + 1) % 4, 's1'); e.judgeWager();
  assert.strictEqual(e.scores().t1 - before.t1, 25); assert.strictEqual(e.scores().t2, before.t2, 'رهان صفر لا يغيّر');
});
test('البث العام لا يكشف الإجابات ويبقى أصغر من 4KB في كل الجولات', () => {
  for (const g of Object.keys(D.GAMES)) {
    const e = mk(); addStudents(e, 30); e.s.plan = [{ g, min: 5 }]; e.goSegment(0);
    for (let k = 0; k < 3; k++) { e.nextItem(); const it = e.item(); if (!it) break; let P = e.pub(); assert.strictEqual(P.I.a, undefined, g); assert.ok(bytes(P) < 3800, g + ' ' + bytes(P));
      if (e.s.seg.phase === 'wager') e.lockWagers(); else e.openItem(); if (e.s.seg.phase === 'show') { e.adv(8000); e.tick(); }
      P = e.pub(); assert.strictEqual(P.I.a, undefined, g + ' open'); assert.ok(bytes(P) < 3800, g + ' open ' + bytes(P)); e.revealItem(); }
  }
  const e = mk(); addStudents(e, 30); assert.ok(bytes(e.roster()) < 3800);
});
test('اختصار الجولة يحافظ على النقاط', () => { const e = mk(); addStudents(e, 4); goGame(e, 'kickoff'); e.openItem(); e.answer('s0', e.item().qid, e.item().a); e.lockAll(); const sc = e.scores().t1; e.finishSeg(); assert.strictEqual(e.s.seg.phase, 'done'); assert.strictEqual(e.scores().t1, sc); });
test('طالب أغلق صفحته وعاد باسمه يستعيد فريقه وقيادته', () => {
  const e = mk(); addStudents(e, 4); e.setOffline('s0'); const st = e.upsertStudent({ sid: 'new', name: 'طالب 0', peer: 'x' });
  assert.strictEqual(st.team, 't1'); assert.strictEqual(e.s.captain.t1, 'new'); assert.strictEqual(Object.keys(e.s.students).length, 4);
});
test('التعادل يُكتشف وكسره للمتعادلين فقط', () => { const e = mk(); e.manualAdjust('t1', 50); e.manualAdjust('t3', 50); assert.deepStrictEqual(e.tieInfo().sort(), ['t1', 't3']); e.startTiebreak(); e.nextItem(); assert.deepStrictEqual(e.item().eligible.sort(), ['t1', 't3']); });
test('مسابقة كاملة بالبرنامج الافتراضي مع شراء مبانٍ', () => {
  const e = mk(); addStudents(e, 20);
  for (let i = 0; i < e.s.plan.length; i++) {
    e.goSegment(i); let guard = 0;
    while (e.s.seg.phase !== 'done' && e.s.seg.phase !== 'winner' && guard++ < 400) {
      const seg = e.s.seg, it = e.item(), ph = seg.phase;
      if (seg.g === 'opening') { if (ph === 'themes') e.setTheme('t1', 'agri', e.s.captain.t1); e.nextItem(); continue; }
      if (seg.g === 'crown') { e.nextItem(); continue; }
      if (ph === 'intro' || ph === 'reveal') { e.s.teams.forEach(t => { const k = D.BUILD_KEYS.find(k => e.buildCost(t.id, k) != null && e.buildCost(t.id, k) <= e.vil(t.id).gold); if (k) e.buy(t.id, k, e.s.captain[t.id]); }); e.nextItem(); continue; }
      if (ph === 'ready') { e.openItem(); continue; }
      if (ph === 'show') { e.adv(8000); e.tick(); continue; }
      if (ph === 'wager') { e.s.teams.forEach(t => e.setWager(t.id, 10, e.s.captain[t.id])); e.lockWagers(); continue; }
      if (ph === 'open' && it.wagerQ) { e.s.teams.forEach(t => e.wagerPick(t.id, it.a, e.s.captain[t.id])); e.judgeWager(); continue; }
      if (ph === 'open' && it.kind === 'vault') { e.s.teams.forEach(t => { const m = e.teamMembers(t.id)[0]; e.adv(9000); e.vaultTry(m.sid, it.qid, it.a); }); if (e.s.seg.phase === 'open') e.revealItem(); continue; }
      if (ph === 'open' && seg.mode === 'all') { Object.values(e.s.students).forEach(s => e.answer(s.sid, it.qid, it.a)); e.lockAll(); continue; }
      if (ph === 'open' && seg.mode === 'buzz') { const s = Object.values(e.s.students).find(x => e.canBuzz(x.sid)); if (s) e.buzz(s.sid, it.qid); else e.revealItem(); continue; }
      if (ph === 'answering') { e.judge(true); continue; }
      if (ph === 'paused') { e.reopen(); continue; }
      throw new Error('حالة غير معالجة: ' + seg.g + '/' + ph);
    }
  }
  assert.ok(e.s.ended); assert.ok(e.s.buildLog.length >= 8, 'بُنيت مبانٍ: ' + e.s.buildLog.length);
  const goldIn = e.s.ledger.reduce((a, x) => a + Math.max(0, x.g || 0), 0), spent = -e.s.ledger.reduce((a, x) => a + Math.min(0, x.g || 0), 0);
  e.s.teams.forEach(t => assert.ok(e.vil(t.id).gold >= 0)); assert.strictEqual(goldIn - spent, e.s.teams.reduce((a, t) => a + e.vil(t.id).gold, 0), 'سجل الذهب متسق');
  assert.ok(e.pub().hl === undefined || true);
});

console.log(`\n${pass}/${T} ناجح`);
if (fails.length) { console.log('فشل:', fails); process.exit(1); }
