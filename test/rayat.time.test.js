// اختبار أنماط المدة الأربعة (40، 50، 60، 90 دقيقة) بمحاكاة زمنية كاملة: الإغلاق في الوقت، بلوغ كل المراحل،
// البينيات، التمديد، الإنهاء بعد الجولة، الإيقاف والاستئناف، الانتقال المبكر، والحفظ والاستعادة.
const { play, RayatGame, RR, COLORS, NAMES } = require('./rayat.play.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('✗', m); } };
const PH = RR.CFG.PHASES, avg = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
console.log('النمط | خطة المراحل (د): افتتاح، توسع، احتكاك، حرب، حصار، أخيرة، ختام | المدة الفعلية | الجولات | مواجهات | بلغوا الأخيرة | فُتحت القلعة | تطوير عاصمة | أسوار');
for (const total of [40, 50, 60, 90]) {
  const st = { mins: [], rounds: [], duels: [], castle: 0, capUp: [], walls: [], n: 0, final: 0 }; let plan = null;
  for (let seed = 1; seed <= 10; seed++) { const n = 3 + (seed % 4), res = play(seed + total, n, 3, { total, binis: seed % 2 === 0, dip: true }), g = res.g, s = g.s, c = g.timeInfo(); plan = plan || PH.map((_, i) => 0) && require('../app/game.js') && null;
    ok(!res.errs.length, `${total}د/${seed}: لا خلل ${res.errs.join('|')}`); ok(s.stage === 'crown' && s.winner != null, `${total}د/${seed}: انتهت بتتويج`);
    const mins = c.el / 60000; ok(mins <= total + .6 + (s.extra || 0), `${total}د/${seed}: لم تتجاوز المدة (${mins.toFixed(1)})`); ok(mins >= total - 9, `${total}د/${seed}: لم تنتهِ مبكرًا جدًا (${mins.toFixed(1)})`);
    const phases = new Set((s.chron || []).map(x => x.p)); const reached = g.S.events.filter(e => e.t === 'phase').map(e => e.key);
    ok(['expansion', 'friction', 'war', 'siege', 'final', 'crown'].every(k => reached.includes(k)), `${total}د/${seed}: مرّت بكل المراحل (${reached.join(',')})`);
    st.n++; st.mins.push(mins); st.rounds.push(s.cycle); st.duels.push(g.S.events.filter(e => e.t === 'duel' || e.t === 'attack').length || res.stages.buzz ? (res.stages.point || 0) : 0); if (g.S.events.some(e => (e.t === 'take' || e.t === 'attack') && g.S.regions[e.r] && g.S.regions[e.r].type === 'castle') || g.S.regions.find(r => r.type === 'castle').owner != null) st.castle++;
    st.capUp.push(g.S.teams.filter(T => T.capLevel > 1).length / n); st.walls.push(g.S.regions.filter(r => r.walls && r.type !== 'castle').length); }
  const g0 = new RayatGame({ total, teams: NAMES.slice(0, 4).map((n, i) => ({ name: n, color: COLORS[i] })) });
  console.log(`${total} د | ${g0.plan().join('، ')} | ${avg(st.mins).toFixed(1)} د | ${avg(st.rounds).toFixed(0)} | ${avg(st.duels).toFixed(0)} | ${st.n}/${st.n} | ${st.castle}/${st.n} | ${(avg(st.capUp) * 100).toFixed(0)}٪ من الفرق | ${avg(st.walls).toFixed(1)}`);
  ok(g0.plan().reduce((a, b) => a + b, 0) === total, `${total}د: مجموع الخطة يساوي المدة`); ok(avg(st.rounds) >= total * .45, `${total}د: عدد جولات كافٍ (${avg(st.rounds).toFixed(0)})`);
}
// ---------- أدوات المشرف على الوقت ----------
const mk = (total = 60) => { let clock = 1e12; const g = new RayatGame({ now: () => clock, bank: globalThis.RAYAT_BANK, binis: globalThis.RAYAT_BINIS, total, teams: NAMES.slice(0, 3).map((n, i) => ({ name: n, color: COLORS[i] })) }); for (let t = 0; t < 3; t++) for (let k = 0; k < 2; k++) g.join('p' + t + k, 'ل' + k, t); return { g, adv: ms => { clock += ms; }, run: (ms, step = 500) => { const end = clock + ms; while (clock < end && g.s.stage !== 'crown' && g.s.stage !== 'tie') { clock += step; if (g.s.stage === 'judge') g.judge(true); g.tick(); } } }; };
{ const { g } = mk(); ok(g.s.total === 60, 'الافتراضي 60 دقيقة'); g.setTotal(40); ok(g.s.total === 40, 'تغيير المدة قبل البدء'); g.setTotal(33); ok(g.s.total === 40, 'قيمة غير معتمدة تُرفض'); g.start(); g.setTotal(90); ok(g.s.total === 40, 'لا تغيير للمدة بعد البدء'); }
{ const { g, adv, run } = mk(60); g.start(); run(10 * 60000); const c0 = g.timeInfo(); ok(Math.abs(c0.el - 10 * 60000) < 2000 && Math.abs(c0.rem - 50 * 60000) < 2000, 'المنقضي والمتبقي صحيحان بعد 10 دقائق');
  g.pause(true); adv(7 * 60000); const c1 = g.timeInfo(); ok(Math.abs(c1.el - c0.el) < 600 && Math.abs(c1.rem - c0.rem) < 600, 'الإيقاف يجمّد وقت المسابقة (7 دقائق توقف لم تُحسب)'); g.pause(false); run(60000); ok(Math.abs(g.timeInfo().el - c0.el - 60000) < 2000, 'الاستئناف يكمل من حيث توقف');
  const end0 = g.gameEnd(), ph = g.s.phase; g.extend(5); ok(Math.abs(g.gameEnd() - end0 - 5 * 60000) < 500 && g.s.extra === 5, 'التمديد يزيد النهاية 5 دقائق'); ok(g.plan().slice(0, ph).every((v, i) => v === [4, 7, 12, 15, 11, 7, 4][i]) && g.plan()[6] === 4, 'التمديد يوزَّع على المراحل الباقية فقط، ومخصص الختام ثابت');
  const json = g.save(); const h = new RayatGame({ now: g.now, bank: globalThis.RAYAT_BANK, binis: [] }); h.load(json); ok(h.s.total === 60 && h.s.extra === 5 && Math.abs(h.gameEnd() - g.gameEnd()) < 5 && JSON.stringify(h.plan()) === JSON.stringify(g.plan()), 'الحفظ والاستعادة يحفظان المدة والتمديد والخطة');
  const e1 = g.gameEnd(), p1 = g.s.phase; g.nextPhaseNow(); run(4 * 60000); ok(g.s.phase > p1, 'الانتقال المبكر للمرحلة التالية يعمل'); ok(Math.abs(g.gameEnd() - e1) < 500, 'الانتقال المبكر لا يغيّر موعد النهاية (الوقت الموفَّر للمراحل التالية)');
  g.endAfterRound(); const t0 = g.timeInfo().el; run(5 * 60000); ok(g.s.stage === 'crown' || g.s.stage === 'tie', '«إنهاء بعد الجولة الحالية» ينهي المسابقة (' + g.s.stage + ')'); ok(g.timeInfo().el - t0 < 4 * 60000, 'الإنهاء خلال جولة واحدة'); }
{ // لا تبدأ جولة لا يتسع لها الوقت: آخر جولة تنتهي قبل نهاية اللعب، والختام محجوز
  const { g, run } = mk(40); g.start(); run(39 * 60000); ok(g.s.stage === 'crown' || g.s.stage === 'tie', '40 دقيقة: انتهى اللعب قبل الدقيقة 39'); const c = g.timeInfo(); ok(c.el <= 40 * 60000 + 30000, '40 دقيقة: النهاية داخل المدة (' + (c.el / 60000).toFixed(1) + ')'); }
{ // بيني طويل يأكل من وقت المرحلة لا من النهاية
  const { g, run, adv } = mk(50); g.start(); run(6 * 60000); let guard = 0; while (g.s.stage !== 'harvest' && guard++ < 2000) run(500); const end0 = g.gameEnd(); g.biniStart(0, 2); ok(g.s.stage === 'bini', 'بدأ البيني'); adv(6 * 60000); g.biniWinner(1); run(45 * 60000); ok(Math.abs(g.gameEnd() - end0) < 500, 'بيني مدته 6 دقائق لا يؤخّر موعد النهاية'); ok(g.s.stage === 'crown' || g.s.stage === 'tie', 'المسابقة انتهت في وقتها بعد بيني طويل'); ok(g.timeInfo().el <= 50 * 60000 + 60000, 'المدة الكلية محفوظة (' + (g.timeInfo().el / 60000).toFixed(1) + ')'); }

{ // وقت التفكير (طلب المستخدم 11 نوفمبر): 40 ثانية، و+20 في أول جولة بعد أدوات جديدة، والمشرف يمدّ 15 ثانية حتى ثلاث مرات
  const { g, adv } = mk(60); g.start(); let seenNew = false, seenBase = false, seenCy = -1;
  for (let i = 0; i < 4000 && !(seenNew && seenBase); i++) { if (g.s.stage === 'orders' && g.s.cycle !== seenCy) { seenCy = g.s.cycle; const d = g.s.dur / 1000; if (g.s.ordersNew) { seenNew = true; ok(d === 60, 'أول جولة بعد أدوات جديدة: 60 ثانية (' + d + ')'); } else { seenBase = true; ok(d === 40, 'وقت القرار 40 ثانية (' + d + ')'); }
      const dl = g.s.deadline; g.moreTime(); ok(g.s.deadline - dl === 15000, '+15 ثانية تمدّ الموعد'); g.moreTime(); g.moreTime(); const dl2 = g.s.deadline; g.moreTime(); ok(g.s.deadline === dl2, 'لا تمديد بعد الثالثة'); }
    if (g.s.stage === 'question' && g.s.q) Object.keys(g.s.players).forEach(pid => g.answer(pid, g.s.q.id, g.s.q.a)); if (g.s.stage === 'judge') g.judge(true);
    adv(1000); g.tick(); }
  ok(seenNew && seenBase, 'مرّت جولة عادية وجولة أدوات جديدة'); }

{ // القيادة بالتناوب: مع كل مرحلة جديدة تنتقل القيادة لعضو آخر متصل، ويقود كل طالب مرة على الأقل
  const { g, adv } = mk(60); g.start(); const seen = {}, rec = () => g.s.teams.forEach((T, t) => { const c = g.s.captains[t]; (seen[t] = seen[t] || new Set()).add(c); }); rec(); let ph = g.s.phase, changes = 0, ev = null;
  for (let i = 0; i < 4000 && g.s.stage !== 'crown'; i++) { if (g.s.stage === 'question' && g.s.q) Object.keys(g.s.players).forEach(pid => g.answer(pid, g.s.q.id, g.s.q.a)); adv(1000); g.tick(); if (g.s.phase !== ph) { ph = g.s.phase; changes++; if (g.s.ev && g.s.ev.k === 'phase' && g.s.ev.key !== 'crown') { ev = ev || g.s.ev; } rec(); } }
  const per = g.s.teams.map((T, t) => Object.keys(g.s.players).filter(pid => g.s.players[pid].team === t).length);
  ok(changes >= 3, 'مرّت مراحل (' + changes + ')'); ok(g.s.teams.every((T, t) => seen[t].size === Math.min(per[t], changes + 1)), 'كل عضو قاد مرة على الأقل: ' + JSON.stringify(g.s.teams.map((T, t) => [seen[t].size, per[t]])));
  ok(ev && Array.isArray(ev.caps) && ev.caps.length === g.s.teams.length, 'بطاقة المرحلة تعلن القادة الجدد'); }
console.log(`الوقت والمدة: ${pass} نجح، ${fail} فشل`); process.exit(fail ? 1 : 0);
