// اختبارات قواعد رايات: كل قاعدة في المواصفات وCLAUDE.md لها فحص هنا
const path = require('path');
global.d3 = require(path.join(__dirname, '../r3d/node_modules/d3-delaunay'));
require('../proto/rayat-map.js');
const R = require('../game/rules.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('✗', m); } };
const throws = (f, m) => { try { f(); fail++; console.log('✗ (لم يُرفض)', m); } catch (e) { pass++; } };
const TEAMS = n => Array.from({ length: n }, (_, i) => ({ name: 'ف' + i, color: '#000' }));

// خريطة صغيرة يدوية: سلسلة 0-1-2-3-4-5 + قلعة 6 مجاورة لـ 2 و3، عاصمتان 0 و5
function mini() {
  const T = ['capital', 'farm', 'mine', 'quarry', 'village', 'capital', 'castle'];
  const nb = [[1], [0, 2], [1, 3, 6], [2, 4, 6], [3, 5], [4], [2, 3]];
  return { caps: [0, 5], regions: T.map((type, id) => ({ id, type, nb: nb[id], land: 0, coast: false, name: 'r' + id, at: [0, 0] })) };
}
const goPhase = (S, key) => R.setPhase(S, R.CFG.PHASES.findIndex(p => p.key === key));
const rich = S => S.teams.forEach(T => { T.res = { food: 50, gold: 50, stone: 50 }; });

// 1) الإعداد على الخرائط الحقيقية لكل عدد فرق
for (let n = 2; n <= 6; n++) for (const seed of [1, 7, 42]) {
  const M = RayatMap.build(n, seed), S = R.setup(M, TEAMS(n));
  const want = { 2: 22, 3: 28, 4: 34, 5: 40, 6: 42 }[n]; // الجزيرتان الصغيرتان بثلاث أراضٍ لكل واحدة (11 نوفمبر)
  ok(S.regions.length === want, `عدد الأقاليم حسب المواصفات ${n}: ${S.regions.length}`);
  S.teams.forEach((T, i) => ok(S.regions.filter(r => r.owner === i).length === 3, `فريق ${i} يبدأ بالعاصمة + إقليمين (n=${n},s=${seed})`));
  ok(S.teams.every(T => T.res.food === 6 && T.res.gold === 6 && T.res.stone === 6), 'يبدأ كل فريق بـ 6 من كل مورد');
  ok(S.regions.some(r => r.landmark === 'goldmine') && S.regions.some(r => r.landmark === 'bigquarry') && S.regions.some(r => r.landmark === 'observatory'), 'أماكن النفوذ موجودة');
  ok(S.regions.filter(r => r.landmark && r.landmark !== 'port').every(r => r.owner == null), 'أماكن النفوذ محايدة في البداية');
  ok(R.check(S).length === 0, 'الثوابت سليمة بعد الإعداد ' + R.check(S));
}

// 2) الأوامر حسب النسبة
ok(R.CFG.ORDERS(0) === 0 && R.CFG.ORDERS(.2) === 1 && R.CFG.ORDERS(.59) === 1 && R.CFG.ORDERS(.6) === 2 && R.CFG.ORDERS(1) === 2, 'الأوامر: لا إجابة = لا أمر، إجابة واحدة = أمر، 60٪+ = أمران');
{ const S = R.setup(mini(), TEAMS(2)); const tr = R.startCycle(S, [.4, .9]); ok(tr.order[0] === 1, 'الأعلى نسبة يتحرك أولًا'); ok(tr.left[0] === 1 && tr.left[1] === 2, 'عدد الأوامر');
  const tr2 = (R.endCycle(S), R.startCycle(S, [.9, .9], [3, 2])); ok(tr2.order[0] === 1, 'عند التساوي الأسرع أولًا'); }

// 3) الانفتاح على مراحل
{ const S = R.setup(mini(), TEAMS(2)); rich(S); S.regions[1].owner = 0; S.regions[4].owner = 1; S.regions[2].owner = 0; S.regions[3].owner = 1; R.startCycle(S, [1, 1]);
  const L = () => R.legal(S, 0).map(o => o.k + (o.unit || ''));
  ok(!L().includes('attackinf') && !L().includes('walls'), 'الافتتاح: لا هجوم ولا أسوار');
  goPhase(S, 'expansion'); ok(L().includes('attackinf') && L().includes('walls') && !L().includes('tower') && !L().includes('attackcav'), 'التوسع: المشاة والأسوار فقط');
  goPhase(S, 'friction'); ok(L().includes('tower') && L().includes('garInf') && L().includes('garCav'), 'الاحتكاك: البرج والحامية'); ok(!L().includes('cap2') && !L().includes('attackcat'), 'المنجنيق والعاصمة ليست قبل الحرب');
  goPhase(S, 'war'); ok(L().includes('cap2'), 'الحرب: تطوير العاصمة');
  ok(!R.legal(S, 0).some(o => o.r === 6), 'القلعة مغلقة قبل الحصار'); goPhase(S, 'siege'); ok(R.legal(S, 0).some(o => o.k === 'attack' && o.r === 6), 'الحصار: القلعة مفتوحة'); }

// 4) الاحتلال والتكلفة والتموين
{ const S = R.setup(mini(), TEAMS(2)); R.startCycle(S, [1, 1]); const f = S.teams[0].res.food;
  R.act(S, 0, { k: 'occupy', r: 1 === S.regions[1].owner ? 2 : (S.regions[1].owner == null ? 1 : 2) });
  ok(S.teams[0].res.food === f - 4, 'الاحتلال 4 طعام');
  R.act(S, 0, { k: 'supply', res: 'stone' }); ok(S.teams[0].res.stone === 9, 'التموين +3'); throws(() => R.act(S, 0, { k: 'supply', res: 'gold' }), 'لا أمر ثالث'); }

// 5) المواجهات حسب نوع الأرض
function duelSetup() { const S = R.setup(mini(), TEAMS(2)); rich(S); S.regions.forEach(r => { if (r.type !== 'castle') r.owner = r.id <= 2 ? 0 : 1; }); goPhase(S, 'war'); R.startCycle(S, [1, 1]); return S; }
{ const S = duelSetup(); const D = R.act(S, 0, { k: 'attack', unit: 'inf', r: 3 }); ok(D.need.a === 1, 'أرض عادية: فوز واحد'); const res = R.point(S, 'a'); ok(res.taken && S.regions[3].owner === 0, 'الفاتح يأخذ الأرض'); ok(S.teams[0].res.gold === 46, 'الهجوم 4 ذهب'); }
{ const S = duelSetup(); S.regions[3].walls = true; const D = R.act(S, 0, { k: 'attack', unit: 'inf', r: 3 }); ok(D.need.a === 2 && D.need.d === 1, 'المحصّن: المهاجم يحتاج فوزين والمدافع فوزًا');
  R.point(S, 'a'); ok(S.duel, 'لم تنتهِ بعد فوز واحد'); const res = R.point(S, 'a'); ok(res.taken && !S.regions[3].walls, 'الفتح يهدم السور'); }
{ const S = duelSetup(); S.regions[3].walls = true; R.act(S, 0, { k: 'attack', unit: 'inf', r: 3 }); const res = R.point(S, 'd'); ok(res.winner === 'd' && S.regions[3].owner === 1 && S.teams[1].stats.holds === 1, 'صمود المدافع'); ok(S.teams[0].res.gold === 46, 'خسارة المهاجم: يذهب ذهب الهجوم فقط'); }
{ const S = duelSetup(); S.regions[3].walls = true; const D = R.act(S, 0, { k: 'attack', unit: 'cat', r: 3 }); ok(D.need.a === 1, 'المنجنيق يلغي ميزة السور'); ok(S.teams[0].res.gold === 44 && S.teams[0].res.stone === 48, 'المنجنيق 6 ذهب + 2 حجر'); }
{ const S = duelSetup(); throws(() => R.act(S, 0, { k: 'attack', unit: 'cat', r: 3 }), 'المنجنيق لا يُستخدم على أرض غير محصّنة'); }
{ const S = duelSetup(); S.regions[4].owner = 0; const s0 = { ...S.teams[1].res }; const D = R.act(S, 0, { k: 'attack', unit: 'inf', r: 5 }); ok(D.kind === 'capital' && D.need.a === 2, 'العاصمة محصّنة دائمًا');
  R.point(S, 'a'); const res = R.point(S, 'a'); ok(S.regions[5].owner === 1, 'العاصمة لا تسقط'); const tot = R.RES.reduce((a, k) => a + res.loot[k], 0); ok(tot <= R.CFG.LOOT_MAX && tot > 0 && S.teams[1].res.gold === s0.gold - res.loot.gold, 'النهب: نسبة من المخزون وبسقف ' + R.CFG.LOOT_MAX);
  ok(S.teams[1].shieldUntil === S.cycle + R.CFG.LOOT_SHIELD, 'العاصمة المنهوبة تستريح جولتين'); ok(!R.attackOptions(S, 0, 5).length, 'لا نهب ثانٍ وقت الاستراحة'); S.cycle += R.CFG.LOOT_SHIELD + 1; S.teams[0].attackedThisCycle = false; ok(R.attackOptions(S, 0, 5).length > 0, 'بعد الاستراحة تُهاجم من جديد'); }
{ const S = duelSetup(); S.regions[4].owner = 0; S.teams[1].capLevel = 3; S.teams[1].res = { food: 0, gold: 40, stone: 0 }; R.act(S, 0, { k: 'attack', unit: 'cat', r: 5 }); const res = R.point(S, 'a'); ok(res.loot.gold === Math.min(R.CFG.LOOT_MAX, Math.floor(40 * R.CFG.LOOT[3])) && R.CFG.LOOT[3] === R.CFG.LOOT[1] / 2, 'الحاضرة: نهبها نصف المعتاد'); }
{ const S = duelSetup(); S.regions[4].owner = 0; S.regions[5].garrison = 'inf'; R.act(S, 0, { k: 'attack', unit: 'cat', r: 5 }); const g = S.teams[1].res.gold, res = R.point(S, 'a'); ok(res.garrisonFell && S.teams[1].res.gold === g && !S.regions[5].garrison, 'حامية العاصمة تصد نهبة واحدة'); }

// 6) القلعة
{ const S = duelSetup(); goPhase(S, 'siege'); S.regions[3].owner = 0; const D = R.act(S, 0, { k: 'attack', unit: 'inf', r: 6 }); ok(D.kind === 'garrisonQ' && D.need.a === 1, 'القلعة المحايدة: سؤال الحامية'); R.point(S, 'a'); ok(S.regions[6].owner === 0, 'تؤخذ بإجابته');
  ok(R.score(S, 0) === 4 + R.CFG.CASTLE_POINTS, 'القلعة تُحسب بخمسة'); for (let i = 0; i <= R.CFG.CASTLE_GRACE; i++) { R.endCycle(S); R.startCycle(S, [1, 1]); }
  S.regions[4].owner = 1; S.regions[3].owner = 1; const D2 = R.act(S, 1, { k: 'attack', unit: 'cat', r: 6 }); ok(D2.need.a === 2 && D2.pts.a === 1, 'القلعة بيد فريق: أفضل من ثلاثة، والمنجنيق يبدأ 1–0');
  ok(!R.legal(S, 0).some(o => o.k === 'garInf' && o.r === 6) && !R.legal(S, 0).some(o => o.k === 'walls' && o.r === 6), 'لا حامية ولا سور في القلعة'); }
{ const S = duelSetup(); goPhase(S, 'siege'); S.regions[6].owner = 1; R.endCycle(S); const g = S.teams[1].res.gold; ok(true); R.startCycle(S, [1, 1]); R.endCycle(S); ok(S.teams[1].res.gold - g >= 3 + 2, 'خراج القلعة فوق إنتاجها'); }

// 7) الفرسان والبرج
{ const S = duelSetup(); S.regions[3].owner = null; S.regions[4].owner = 1; // 2(لي) → 3(محايد) → 4(عدو)
  ok(R.legal(S, 0).some(o => o.k === 'attack' && o.unit === 'cav' && o.r === 4), 'الفرسان يعبرون إقليمًا محايدًا');
  ok(!R.legal(S, 0).some(o => o.k === 'attack' && o.unit === 'inf' && o.r === 4), 'المشاة لا تصل إقليمين');
  S.regions[5].tower = true; ok(!R.legal(S, 0).some(o => o.unit === 'cav' && o.r === 4), 'برج المراقبة يحمي الأرض المجاورة له');
  S.regions[5].tower = false; S.regions[4].tower = true; ok(!R.legal(S, 0).some(o => o.unit === 'cav' && o.r === 4), 'برج المراقبة يحمي أرضه');
  ok(!R.legal(S, 0).some(o => o.unit === 'cav' && o.r === 5), 'الفرسان لا تهاجم العواصم');
  const D = (S.regions[4].tower = false, R.act(S, 0, { k: 'attack', unit: 'cav', r: 4 })); ok(S.teams[0].res.gold === 43 && S.teams[0].res.food === 48, 'الفرسان 7 ذهب + 2 طعام'); }
{ const S = duelSetup(); S.regions[4].landmark = 'observatory'; S.regions[3].owner = null; ok(!R.legal(S, 0).some(o => o.unit === 'cav' && o.r === 4), 'المرصد يعمل كبرج مجاني'); }

// 8) الحامية
{ const S = duelSetup(); S.regions[3].garrison = 'inf'; R.act(S, 0, { k: 'attack', unit: 'inf', r: 3 }); const res = R.point(S, 'a'); ok(res.garrisonFell && S.regions[3].owner === 1, 'الحامية تسقط بدل الأرض ويرتد المهاجم'); }
{ const S = duelSetup(); S.regions[3].garrison = 'cav'; R.act(S, 0, { k: 'attack', unit: 'inf', r: 3 }); const g = S.teams[1].res.gold, res = R.point(S, 'd'); ok(res.cavLoot === 2 && S.teams[1].res.gold === g + 2, 'حامية الفرسان تأخذ غنيمة إذا صمدت'); }
{ const S = duelSetup(); S.regions[3].garrison = 'inf'; S.regions[3].walls = true; R.act(S, 0, { k: 'attack', unit: 'cat', r: 3 }); const res = R.point(S, 'a'); ok(res.garrisonFell && S.regions[3].owner === 1 && !S.regions[3].walls && res.wallsBroken, 'المنجنيق لا يكسر الحامية، لكنه يهدم السور'); }
{ const S = duelSetup(); S.regions[3].walls = true; R.act(S, 0, { k: 'attack', unit: 'cat', r: 3 }); const res = R.point(S, 'd'); ok(res.winner === 'd' && S.regions[3].owner === 1 && !S.regions[3].walls && res.wallsBroken, 'المنجنيق يهدم السور حتى لو صمد المدافع'); }
{ const S = duelSetup(); S.regions[3].walls = true; R.act(S, 0, { k: 'attack', unit: 'inf', r: 3 }); R.point(S, 'd'); ok(S.regions[3].walls, 'هجوم المشاة الفاشل لا يهدم السور'); }
{ const S = duelSetup(); goPhase(S, 'friction'); throws(() => R.act(S, 0, { k: 'garInf', r: 6 }), 'لا حامية في القلعة'); R.act(S, 0, { k: 'garInf', r: 2 }); throws(() => R.act(S, 0, { k: 'garCav', r: 2 }), 'حامية واحدة لكل أرض'); }

// 9) هجوم واحد في الدورة
{ const S = duelSetup(); R.act(S, 0, { k: 'attack', unit: 'inf', r: 3 }); R.point(S, 'd'); throws(() => R.act(S, 0, { k: 'attack', unit: 'inf', r: 3 }), 'هجوم واحد لكل فريق في الدورة'); }

// 10) التحالف والنقض والثأر والهجوم المشترك
{ const M = mini(); M.caps = [0, 5, 4]; M.regions[4].type = 'capital'; const S = R.setup(M, TEAMS(3)); rich(S);
  S.regions[1].owner = 0; S.regions[2].owner = 0; S.regions[3].owner = 1; goPhase(S, 'expansion'); throws(() => R.offer(S, 0, 1), 'لا تحالف قبل الاحتكاك');
  goPhase(S, 'war'); R.offer(S, 0, 2); ok(R.accept(S, 2, true) && S.teams[0].ally === 2, 'قبول الحلف'); throws(() => R.offer(S, 1, 0), 'حليف واحد فقط');
  R.startCycle(S, [1, 1, 1]); ok(!R.legal(S, 2).some(o => o.k === 'attack' && !o.betray && S.regions[o.r].owner === 0), 'الحليف لا يهاجم حليفه إلا بالنقض');
  R.gift(S, 0, 'gold', 5); ok(S.teams[2].res.gold === 55, 'إرسال الموارد للحليف');
  const g0 = S.teams[0].res.gold, g2 = S.teams[2].res.gold; const D = R.act(S, 0, { k: 'attack', unit: 'inf', r: 3, joint: true }); ok(D.ally === 2 && S.teams[0].res.gold === g0 - 2 && S.teams[2].res.gold === g2 - 2, 'الهجوم المشترك: التكلفة مناصفة');
  R.point(S, 'a'); ok(S.regions[3].owner === 0, 'الأرض لمن أعطى الأمر');
  S.regions[3].walls = true; const D2 = R.act(S, 2, { k: 'attack', unit: 'inf', r: 3, betray: true }); ok(D2.betray && D2.need.a === 1 && S.teams[0].ally == null, 'النقض: الضربة تتجاوز التحصين والحلف ينتهي');
  ok(S.teams[0].revenge.on === 2, 'الثأر للمغدور'); R.point(S, 'd'); R.endCycle(S); R.startCycle(S, [1, 1, 1]);
  const rv = R.legal(S, 0).find(o => o.k === 'attack' && o.revenge && S.regions[o.r].owner === 2); ok(rv, 'هجوم الثأر متاح'); const gg = S.teams[0].res.gold; R.act(S, 0, rv); ok(S.teams[0].res.gold === gg, 'هجوم الثأر مجاني');
  R.point(S, 'd'); for (let i = 0; i < 4; i++) { R.endCycle(S); R.startCycle(S, [1, 1, 1]); } ok(!R.legal(S, 0).some(o => o.revenge), 'الثأر ينتهي بعد ثلاث دورات'); }
{ const M3 = mini(); M3.caps = [0, 5, 4]; M3.regions[4].type = 'capital'; const S = R.setup(M3, TEAMS(3)); goPhase(S, 'war'); R.offer(S, 0, 1); R.accept(S, 1, true); R.startCycle(S, [1, 1, 1]); R.endQuiet(S, 0); ok(S.teams[0].ally === 1, 'الإنهاء الهادئ يسري من الدورة التالية'); R.endCycle(S); R.startCycle(S, [1, 1, 1]); ok(S.teams[0].ally == null && !S.teams[0].revenge, 'انتهى بلا أثر آخر'); }
{ const M3 = mini(); M3.caps = [0, 5, 4]; M3.regions[4].type = 'capital'; const S = R.setup(M3, TEAMS(3)); goPhase(S, 'war'); R.offer(S, 0, 1); R.accept(S, 1, true); goPhase(S, 'final'); ok(S.teams[0].ally == null, 'المعركة الأخيرة تُسقط التحالفات'); throws(() => R.offer(S, 0, 1), 'لا تحالف في المعركة الأخيرة'); }

// 11) التوقع، والبيني، والحصاد، وتطوير العاصمة
{ const S = R.setup(mini(), TEAMS(2)); const g = S.teams[1].res.gold; ok(R.predict(S, 1, 5) === 3 && S.teams[1].res.gold === g + 3, 'التوقع: حتى 3 ذهب للفريق'); }
{ const S = R.setup(mini(), TEAMS(2)); R.startCycle(S, [0, 0]); R.bonusOrders(S, 0, 3); ok(S.turn.left[0] === 3, 'البيني ×3 = ثلاثة أوامر'); }
{ const S = R.setup(mini(), TEAMS(2)); S.regions[1].owner = 0; R.startCycle(S, [0, 0]); const before = { ...S.teams[0].res }; R.endCycle(S); const r = S.teams[0].res; ok(r.food - before.food === 2 + 2 && r.gold - before.gold === 2 && r.stone - before.stone === 1, 'حصاد العاصمة والمزرعة'); }
{ const S = R.setup(mini(), TEAMS(2)); rich(S); goPhase(S, 'war'); R.startCycle(S, [1, 1]); R.act(S, 0, { k: 'cap2' }); ok(S.teams[0].capLevel === 2 && S.teams[0].res.stone === 44, 'تطوير العاصمة إلى مدينة'); const b = S.teams[0].res.gold; R.endCycle(S); ok(S.teams[0].res.gold - b === 2 + 1 + 0, 'المدينة تزيد الحصاد'); }
{ const S = R.setup(mini(), TEAMS(2)); S.regions[2].owner = 0; S.regions[2].landmark = 'goldmine'; R.startCycle(S, [0, 0]); const b = S.teams[0].res.gold; R.endCycle(S); ok(S.teams[0].res.gold - b === 2 + 2 + 2, 'منجم الذهب: ذهب إضافي'); }

// 12) الأمر غير المسموح يُرفض، والثوابت
{ const S = duelSetup(); S.regions[4].owner = 0; throws(() => R.act(S, 0, { k: 'occupy', r: 4 }), 'لا احتلال لأرض عدو'); throws(() => R.act(S, 0, { k: 'walls', r: 5 }), 'لا تحصين لأرض العدو'); throws(() => R.act(S, 0, { k: 'attack', unit: 'inf', r: 1 }), 'لا هجوم على أرضي');
  S.teams[0].res.gold = 3; throws(() => R.act(S, 0, { k: 'attack', unit: 'inf', r: 3 }), 'لا هجوم بلا ذهب كافٍ'); ok(R.check(S).length === 0, 'الثوابت'); }

// القلعة: مواجهة واحدة في الجولة، ومن يفتحها يأمن فيها جولتين
{ const S = R.setup(mini(), TEAMS(2)); rich(S); goPhase(S, 'siege'); S.regions[2].owner = 0; S.regions[3].owner = 1; R.startCycle(S, [1, 1]);
  R.act(S, 0, { k: 'attack', unit: 'inf', r: 6 }); R.point(S, 'a'); ok(S.regions[6].owner === 0, 'فتح القلعة');
  ok(!R.attackOptions(S, 1, 6).length, 'لا مواجهة ثانية على القلعة في نفس الجولة'); R.endCycle(S); R.startCycle(S, [1, 1]); ok(!R.attackOptions(S, 1, 6).length, 'صاحب القلعة يأمن فيها الجولة التالية');
  R.endCycle(S); R.startCycle(S, [1, 1]); R.endCycle(S); R.startCycle(S, [1, 1]); ok(R.attackOptions(S, 1, 6).length > 0, 'بعد مهلة القلعة تُهاجم من جديد'); }
// فريقان: لا تحالف
{ const S = R.setup(mini(), TEAMS(2)); goPhase(S, 'friction'); throws(() => R.offer(S, 0, 1), 'لا تحالف بين فريقين فقط'); }
// التعادل في الصدارة: مواجهة فاصلة أفضل من ثلاثة
{ const S = R.setup(mini(), TEAMS(2)); R.setPhase(S, R.CFG.PHASES.length - 1); ok(S.tie && !S.done && S.tie.teams.length === 2, 'التعادل يفتح مواجهة فاصلة'); ok(R.tiePoint(S, 1) === null && R.tiePoint(S, 0) === null, 'نقطة لكل فريق ولا حسم'); ok(R.tiePoint(S, 1) === 1 && S.done && S.winner === 1, 'أول من يصل نقطتين يُتوَّج'); }
{ const S = R.setup(mini(), TEAMS(2)); S.regions[1].owner = 1; R.setPhase(S, R.CFG.PHASES.length - 1); ok(S.done && S.winner === 1 && !S.tie, 'بلا تعادل يُتوَّج الأكثر أرضًا مباشرة'); }
ok(R.CFG.CASTLE_POINTS === 4, 'القلعة بأربع أراضٍ (اعتماد المستخدم)');
// التوسع المتصل (11 نوفمبر): الاحتلال للملاصق فقط، والميناء للجزر الصغيرة فقط
{ const M = RayatMap.build(4, 7), S = R.setup(M, TEAMS(4)); goPhase(S, 'opening'); S.teams.forEach(T => { T.res.food = 99; });
  const occ = R.legal(S, 0).filter(o => o.k === 'occupy'); ok(occ.length && occ.every(o => S.regions[o.r].nb.some(j => S.regions[j].owner === 0)), 'كل احتلال ملاصق لأرض الفريق');
  const port = S.regions.find(r => r.type === 'port' && !r.land); port.owner = 0;
  const occ2 = R.legal(S, 0).filter(o => o.k === 'occupy'); ok(occ2.every(o => S.regions[o.r].nb.some(j => S.regions[j].owner === 0) || S.regions[o.r].land), 'الميناء لا يفتح احتلال سواحل بعيدة في الجزيرة الكبرى');
  ok(S.regions.filter(r => r.land && r.owner == null).every(r => occ2.some(o => o.r === r.id)), 'الميناء يوصل لكل أراضي الجزر الصغيرة الفاضية'); }
console.log(`قواعد رايات: ${pass} نجح، ${fail} فشل`); process.exit(fail ? 1 : 0);
