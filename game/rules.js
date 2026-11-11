// رايات — محرك القواعد (المشرف هو المرجع). نقي وحتمي: لا عشوائية فيه، وكل تغيير يُسجَّل حدثًا للعرض وشريط الحرب.
// يعمل في المتصفح وفي node. المرجع: وثيقة المواصفات + CLAUDE.md (البنود ز، ح، ط، 15a).
(function (G) {
  'use strict';
  const RES = ['food', 'gold', 'stone'];

  // ---------- الأرقام (تُضبط بالمحاكاة) ----------
  const CFG = {
    START: { food: 6, gold: 6, stone: 6 },
    SUPPLY: 3,
    YIELD: { farm: { food: 2 }, mine: { gold: 2 }, quarry: { stone: 2 }, village: { gold: 1, food: 1 }, port: { gold: 1 }, rich: { gold: 3 }, capital: { gold: 2, food: 2, stone: 1 }, castle: { gold: 3 } },
    CAP_BONUS: { 1: {}, 2: { gold: 1, food: 1 }, 3: { gold: 2, food: 2, stone: 1 } }, // فوق إنتاج العاصمة الأساسي
    LANDMARK_BONUS: { goldmine: { gold: 2 }, bigquarry: { stone: 2 } },
    CASTLE_TRIBUTE: { gold: 2 },
    COST: {
      occupy: { food: 4 }, walls: { stone: 4 }, tower: { stone: 3 },
      garInf: { gold: 4 }, garCav: { gold: 6, food: 2 },
      inf: { gold: 4 }, cav: { gold: 7, food: 2 }, cat: { gold: 6, stone: 2 },
      cap2: { stone: 6, gold: 4 }, cap3: { stone: 8, gold: 6 }
    },
    LOOT: { 1: .3, 2: .3, 3: .15 },       // نسبة ما يُنهب من مخزون العاصمة حسب درجتها (الحاضرة نصف النهب المعتاد)
    LOOT_MAX: 8,                           // سقف ما يُحمل في النهبة الواحدة (مجموع الموارد)
    LOOT_SHIELD: 2,
    CASTLE_POINTS: 4,                      // اعتمده المستخدم 9 نوفمبر بعد المحاكاة (كان 5)
    CASTLE_GRACE: 2,                       // من يفتح القلعة يأمن فيها الجولة التالية (يرمّم ويستقر)
    CASTLE_ONCE: true,                     // مواجهة واحدة على القلعة في الجولة                        // العاصمة المنهوبة لا تُنهب ثانية قبل مرور جولتين
    CAV_GARRISON_LOOT: 2,                  // ما تأخذه حامية الفرسان من المهاجم إذا صمدت الأرض
    PRED_GOLD_MAX: 3,
    REVENGE_CYCLES: 3,
    ORDERS: r => r >= .6 ? 2 : r > 0 ? 1 : 0,   // من يجاوب ولو واحد يأخذ أمرًا، و60٪ فأكثر أمرين
    PHASES: [
      { key: 'opening', name: 'الافتتاح', min: 5, unlock: ['occupy', 'supply'] },
      { key: 'expansion', name: 'التوسع', min: 10, unlock: ['inf', 'walls'] },
      { key: 'friction', name: 'الاحتكاك', min: 18, unlock: ['cav', 'tower', 'garInf', 'garCav', 'alliance'] },
      { key: 'war', name: 'الحرب', min: 25, unlock: ['cat', 'cap2', 'cap3'] },
      { key: 'siege', name: 'حصار القلعة', min: 17, unlock: ['castle'] },
      { key: 'final', name: 'المعركة الأخيرة', min: 10, unlock: [], dissolve: true },
      { key: 'crown', name: 'التتويج', min: 5, unlock: [] }
    ],
    MIN_CYCLE_LEFT_S: 45
  };

  const has = (res, cost) => RES.every(k => (res[k] || 0) >= (cost[k] || 0));
  const pay = (res, cost) => RES.forEach(k => { res[k] -= cost[k] || 0; });
  const gain = (res, add) => RES.forEach(k => { res[k] += add[k] || 0; });
  const half = (cost, up) => { const o = {}; RES.forEach(k => { if (cost[k]) o[k] = up ? Math.ceil(cost[k] / 2) : Math.floor(cost[k] / 2); }); return o; };
  const clone = s => JSON.parse(JSON.stringify(s));

  // ---------- الإعداد ----------
  // map: ناتج RayatMap.build (regions مع nb, type, land, coast, castle, name, at) و caps
  function setup(map, teams, opts = {}) {
    const regions = map.regions.map(r => ({ id: r.id, name: r.name, type: r.type, land: r.land, coast: !!(r.coast || r.land), nb: r.nb.slice(), at: r.at,
      owner: null, walls: false, tower: false, garrison: null, landmark: r.treasure || null }));
    const S = { cfg: CFG, cycle: 0, phase: 0, regions, events: [], duel: null, done: false,
      teams: teams.map((t, i) => ({ id: i, name: t.name, color: t.color, cap: map.caps[i], res: { ...CFG.START }, capLevel: 1,
        ally: null, offerFrom: null, endAllyAt: null, revenge: null, attackedThisCycle: false,
        stats: { holds: 0, wins: 0, attacks: 0, castleCycles: 0, predOk: 0, predAll: 0, ansOk: 0, ansAll: 0, orders: 0, supplies: 0 } })) };
    const capOf = new Set(map.caps);
    // العاصمة + إقليمان متجاوران بأنواع متكاملة (لا يبدأ فريق محظوظًا)
    teams.forEach((_, i) => { const c = S.regions[map.caps[i]]; c.owner = i; });
    const want = [['farm', 'village'], ['mine', 'quarry', 'village'], ['farm', 'mine', 'quarry', 'village', 'port']];
    for (let round = 0; round < 2; round++) teams.forEach((_, i) => {
      const c = S.regions[map.caps[i]], free = c.nb.map(j => S.regions[j]).filter(r => r.owner == null && !r.land && r.type !== 'castle' && !capOf.has(r.id));
      const prefs = round === 0 ? want[0] : want[1]; const pick = free.find(r => prefs.includes(r.type) && !S.regions.some(o => o.owner === i && o.type === r.type && o.id !== c.id)) || free.find(r => r.type !== 'port') || free[0];
      if (pick) pick.owner = i;
    });
    // أماكن النفوذ: في الوسط المتنازع عليه (أبعد ما يكون عن العواصم)، والمرصد على أرض عالية
    const distCap = r => Math.min(...map.caps.map(c => hop(S, c, r.id)));
    const pickLm = (types, lm) => { const c = S.regions.filter(r => types.includes(r.type) && r.owner == null && !r.land && !r.landmark).sort((a, b) => distCap(b) - distCap(a) || a.id - b.id)[0]; if (c) c.landmark = lm; };
    if (!S.regions.some(r => r.landmark === 'goldmine')) pickLm(['mine'], 'goldmine'); if (!S.regions.some(r => r.landmark === 'bigquarry')) pickLm(['quarry'], 'bigquarry'); pickLm(['quarry', 'mine', 'village'], 'observatory');
    S.regions.filter(r => r.type === 'port').forEach(r => { r.landmark = 'port'; });
    log(S, { t: 'start', teams: S.teams.length });
    return S;
  }
  function hop(S, a, b) { if (a === b) return 0; const seen = new Set([a]); let fr = [a], d = 0; while (fr.length) { d++; const nx = []; for (const x of fr) for (const y of S.regions[x].nb) { if (y === b) return d; if (!seen.has(y)) { seen.add(y); nx.push(y); } } fr = nx; } return 99; }

  const log = (S, e) => { e.cycle = S.cycle; e.phase = S.phase; S.events.push(e); return e; };
  const phaseKey = S => CFG.PHASES[S.phase].key;
  const unlocked = (S, what) => CFG.PHASES.slice(0, S.phase + 1).some(p => p.unlock.includes(what));
  const allied = (S, a, b) => a != null && b != null && S.teams[a].ally === b;
  const friendly = (S, team, owner) => owner === team || allied(S, team, owner);
  const score = (S, t) => S.regions.reduce((a, r) => a + (r.owner === t ? (r.type === 'castle' ? CFG.CASTLE_POINTS : 1) : 0), 0);
  const castleOpen = S => unlocked(S, 'castle');
  const ownsPort = (S, t) => S.regions.some(r => r.owner === t && r.type === 'port');

  // ---------- الوصول ----------
  function reachable(S, t, target) { // مجاور أو عبر البحر من ميناء
    const r = S.regions[target]; if (r.nb.some(j => S.regions[j].owner === t)) return true;
    return ownsPort(S, t) && r.coast;
  }
  // الاحتلال متصل (اعتمده المستخدم 11 نوفمبر): الأرض الفاضية تُحتل إذا لامست أرضك، والميناء يوصل للجزر الصغيرة فقط
  function occupyReach(S, t, target) {
    const r = S.regions[target]; if (r.nb.some(j => S.regions[j].owner === t)) return true;
    return !!r.land && ownsPort(S, t);
  }
  function cavReach(S, t, target) {
    const r = S.regions[target]; if (reachable(S, t, target) && r.nb.some(j => S.regions[j].owner === t)) return true;
    return r.nb.some(x => { const X = S.regions[x]; return (X.owner == null || friendly(S, t, X.owner)) && X.nb.some(j => S.regions[j].owner === t); });
  }
  const towerCover = (S, target) => { const r = S.regions[target], o = r.owner, tw = q => q.tower || q.landmark === 'observatory';
    return tw(r) || r.nb.some(j => { const q = S.regions[j]; return q.owner === o && tw(q); }); };

  // ---------- قائمة الأوامر الممكنة (للجوال وللمحاكاة) ----------
  function legal(S, t) {
    const T = S.teams[t], out = [], R = T.res, C = CFG.COST, ok = (k, c = C[k]) => unlocked(S, k) && has(R, c);
    out.push({ k: 'supply', res: 'food' }, { k: 'supply', res: 'gold' }, { k: 'supply', res: 'stone' });
    S.regions.forEach(r => {
      if (r.owner == null && r.type !== 'castle') { if (ok('occupy') && occupyReach(S, t, r.id)) out.push({ k: 'occupy', r: r.id }); }
      else if (r.owner === t) {
        if (r.type !== 'capital' && r.type !== 'castle' && !r.walls && ok('walls')) out.push({ k: 'walls', r: r.id });
        if (!r.tower && r.type !== 'castle' && ok('tower')) out.push({ k: 'tower', r: r.id });
        if (!r.garrison && r.type !== 'castle') { if (ok('garInf')) out.push({ k: 'garInf', r: r.id }); if (ok('garCav')) out.push({ k: 'garCav', r: r.id }); }
      }
    });
    if (T.capLevel === 1 && ok('cap2')) out.push({ k: 'cap2' }); if (T.capLevel === 2 && ok('cap3')) out.push({ k: 'cap3' });
    if (!T.attackedThisCycle) S.regions.forEach(r => attackOptions(S, t, r.id).forEach(a => out.push(a)));
    return out;
  }
  function attackOptions(S, t, target) {
    const r = S.regions[target], T = S.teams[t], out = []; if (r.owner === t) return out;
    if (r.type === 'capital' && S.teams[r.owner].shieldUntil >= S.cycle) return out; // استراحة بعد النهب
    if (r.type === 'castle') { if (!castleOpen(S) || !reachable(S, t, target) || S.castleGrace >= S.cycle || (CFG.CASTLE_ONCE && S.castleHit === S.cycle)) return out; }
    else if (r.owner == null) return out; // المحايد يُحتل لا يُهاجم
    if (r.owner != null && allied(S, t, r.owner)) { // نقض وهجوم
      if (unlocked(S, 'inf') && reachable(S, t, target) && has(T.res, CFG.COST.inf)) out.push({ k: 'attack', unit: 'inf', r: target, betray: true });
      return out; }
    const rev = T.revenge && T.revenge.on === r.owner && T.revenge.until >= S.cycle, cost = u => rev ? {} : CFG.COST[u];
    const canJoint = T.ally != null && !allied(S, T.ally, r.owner) && r.owner !== T.ally;
    const push = (unit) => { if (!unlocked(S, unit)) return; const c = cost(unit);
      if (has(T.res, c)) out.push({ k: 'attack', unit, r: target, revenge: rev || undefined });
      if (canJoint && !rev && has(T.res, half(c, true)) && has(S.teams[T.ally].res, half(c, false))) out.push({ k: 'attack', unit, r: target, joint: true }); };
    if (reachable(S, t, target)) push('inf');
    if (r.type !== 'capital' && r.type !== 'castle' && r.owner != null && cavReach(S, t, target) && !towerCover(S, target)) push('cav');
    if (reachable(S, t, target) && r.owner != null && (r.walls || r.type === 'capital' || r.type === 'castle')) push('cat');
    return out;
  }

  // ---------- الدورة ----------
  // ratios: نسبة الإجابات الصحيحة لكل فريق، speed: زمن متوسط للترتيب عند التساوي
  function startCycle(S, ratios, speeds = []) {
    S.cycle++; S.teams.forEach(T => { T.attackedThisCycle = false; if (T.endAllyAt != null && T.endAllyAt <= S.cycle) breakAlliance(S, T.id, 'quiet'); });
    const orders = ratios.map(r => CFG.ORDERS(r)), order = S.teams.map(T => T.id).sort((a, b) => ratios[b] - ratios[a] || (speeds[a] || 0) - (speeds[b] || 0) || a - b);
    S.turn = { orders, order, left: orders.slice() };
    log(S, { t: 'cycle', orders, order });
    return S.turn;
  }
  function act(S, t, o) { // أمر واحد من أوامر الفريق. يُرجع مواجهة إن كان هجومًا
    if (S.duel) throw new Error('مواجهة قائمة');
    if (!S.turn || S.turn.left[t] <= 0) throw new Error('لا أوامر');
    const L = legal(S, t); if (!L.some(x => same(x, o))) throw new Error('أمر غير مسموح: ' + JSON.stringify(o));
    const T = S.teams[t], C = CFG.COST; S.turn.left[t]--; T.stats.orders++;
    switch (o.k) {
      case 'supply': T.res[o.res] += CFG.SUPPLY; T.stats.supplies++; log(S, { t: 'supply', team: t, res: o.res, n: CFG.SUPPLY }); return null;
      case 'occupy': pay(T.res, C.occupy); S.regions[o.r].owner = t; log(S, { t: 'occupy', team: t, r: o.r }); return null;
      case 'walls': pay(T.res, C.walls); S.regions[o.r].walls = true; log(S, { t: 'walls', team: t, r: o.r }); return null;
      case 'tower': pay(T.res, C.tower); S.regions[o.r].tower = true; log(S, { t: 'tower', team: t, r: o.r }); return null;
      case 'garInf': case 'garCav': pay(T.res, C[o.k]); S.regions[o.r].garrison = o.k === 'garInf' ? 'inf' : 'cav'; log(S, { t: 'garrison', team: t, r: o.r, kind: S.regions[o.r].garrison }); return null;
      case 'cap2': case 'cap3': pay(T.res, C[o.k]); T.capLevel = o.k === 'cap2' ? 2 : 3; log(S, { t: 'capital', team: t, level: T.capLevel }); return null;
      case 'attack': return openDuel(S, t, o);
    }
  }
  const same = (a, b) => a.k === b.k && a.r === b.r && a.res === b.res && a.unit === b.unit && !!a.joint === !!b.joint && !!a.betray === !!b.betray;
  function skip(S, t) { if (S.turn && S.turn.left[t] > 0) { S.turn.left[t]--; } } // للحالات الاستثنائية من لوحة المشرف

  function openDuel(S, t, o) {
    const T = S.teams[t], r = S.regions[o.r], d = r.owner, C = CFG.COST[o.unit];
    if (o.betray) { breakAlliance(S, t, 'betray'); S.teams[d].revenge = { on: t, until: S.cycle + CFG.REVENGE_CYCLES }; pay(T.res, C); }
    else if (o.revenge) { /* مجانًا */ }
    else if (o.joint) { pay(T.res, half(C, true)); pay(S.teams[T.ally].res, half(C, false)); }
    else pay(T.res, C);
    T.attackedThisCycle = true; T.stats.attacks++;
    let need = { a: 1, d: 1 }, start = { a: 0, d: 0 }, kind = 'normal';
    if (r.type === 'castle' && d == null) kind = 'garrisonQ';
    else if (r.type === 'castle') { kind = 'castle'; need = { a: 2, d: 2 }; if (o.unit === 'cat') start.a = 1; }
    else if (r.type === 'capital') { kind = 'capital'; need = { a: 2, d: 1 }; }
    else if (r.walls) { kind = 'walls'; need = { a: 2, d: 1 }; }
    if ((kind === 'walls' || kind === 'capital') && (o.unit === 'cat' || o.betray || o.revenge)) need = { a: 1, d: 1 };
    if (r.type === 'castle') S.castleHit = S.cycle;
    S.duel = { a: t, d, ally: o.joint ? T.ally : null, r: o.r, unit: o.unit, kind, need, pts: start, betray: !!o.betray, revenge: !!o.revenge, cost: o.revenge ? {} : C };
    log(S, { t: 'duel', a: t, d, r: o.r, unit: o.unit, kind, joint: !!o.joint, betray: !!o.betray, revenge: !!o.revenge });
    return S.duel;
  }
  // نقطة في المواجهة: 'a' للمهاجم أو 'd' للمدافع (من حكم المشرف، أو البيني يعدّ انتصارًا واحدًا)
  function point(S, side) {
    const D = S.duel; if (!D) throw new Error('لا مواجهة'); D.pts[side]++;
    log(S, { t: 'point', side, pts: { ...D.pts } });
    if (D.pts.a >= D.need.a) return finishDuel(S, 'a'); if (D.pts.d >= D.need.d) return finishDuel(S, 'd'); return null;
  }
  function finishDuel(S, w) {
    const D = S.duel, r = S.regions[D.r], A = S.teams[D.a], Df = D.d != null ? S.teams[D.d] : null; S.duel = null;
    const res = { winner: w, kind: D.kind, r: D.r, a: D.a, d: D.d };
    // المنجنيق يهدم السور في كل الأحوال، حتى لو صمد المدافع (اعتمده المستخدم 11 نوفمبر)
    if (D.unit === 'cat' && r.walls) { r.walls = false; res.wallsBroken = true; }
    if (w === 'd') {
      if (Df) { Df.stats.holds++; if (r.garrison === 'cav') { const n = Math.min(CFG.CAV_GARRISON_LOOT, A.res.gold); A.res.gold -= n; Df.res.gold += n; res.cavLoot = n; } }
      log(S, { t: 'hold', ...res }); return res;
    }
    A.stats.wins++;
    if (D.kind === 'capital') {
      if (r.garrison) { r.garrison = null; res.garrisonFell = true; log(S, { t: 'garrisonFell', ...res }); return res; }
      const k = CFG.LOOT[Df.capLevel], loot = {}; let room = CFG.LOOT_MAX; RES.slice().sort((x, y) => Df.res[y] - Df.res[x]).forEach(x => { loot[x] = Math.min(room, Math.floor(Df.res[x] * k)); room -= loot[x]; Df.res[x] -= loot[x]; A.res[x] += loot[x]; });
      Df.shieldUntil = S.cycle + CFG.LOOT_SHIELD;
      res.loot = loot; log(S, { t: 'loot', ...res }); return res;
    }
    if (r.garrison && D.kind !== 'garrisonQ') { r.garrison = null; res.garrisonFell = true; log(S, { t: 'garrisonFell', ...res }); return res; }
    r.owner = D.a; r.walls = false; r.garrison = null; res.taken = true; if (r.type === 'castle') S.castleGrace = S.cycle + CFG.CASTLE_GRACE; log(S, { t: 'conquer', ...res });
    return res;
  }
  function predict(S, team, nCorrect) { const T = S.teams[team], n = Math.min(CFG.PRED_GOLD_MAX, nCorrect); T.res.gold += n; return n; }
  function bonusOrders(S, t, n) { S.turn.left[t] += n; log(S, { t: 'bini', team: t, n }); } // البيني بمضاعف: أوامر للفائز

  function endCycle(S) { // الحصاد وخراج القلعة
    const h = S.teams.map(() => ({ food: 0, gold: 0, stone: 0 }));
    S.regions.forEach(r => { if (r.owner == null) return; gain(h[r.owner], CFG.YIELD[r.type] || {}); if (r.landmark && CFG.LANDMARK_BONUS[r.landmark]) gain(h[r.owner], CFG.LANDMARK_BONUS[r.landmark]);
      if (r.type === 'castle') { gain(h[r.owner], CFG.CASTLE_TRIBUTE); S.teams[r.owner].stats.castleCycles++; } });
    S.teams.forEach((T, i) => { gain(h[i], CFG.CAP_BONUS[T.capLevel]); gain(T.res, h[i]); });
    log(S, { t: 'harvest', h }); S.turn = null; return h;
  }

  // ---------- التحالف ----------
  function offer(S, a, b) { if (S.teams.length < 3 || !unlocked(S, 'alliance') || CFG.PHASES[S.phase].dissolve || phaseKey(S) === 'crown') throw new Error('التحالف غير متاح');
    if (a === b || S.teams[a].ally != null || S.teams[b].ally != null) throw new Error('حليف واحد فقط'); S.teams[b].offerFrom = a; log(S, { t: 'offer', a, b }); }
  function accept(S, b, yes) { const a = S.teams[b].offerFrom; S.teams[b].offerFrom = null; if (a == null) return false;
    if (!yes || S.teams[a].ally != null || S.teams[b].ally != null) { log(S, { t: 'reject', a, b }); return false; }
    S.teams[a].ally = b; S.teams[b].ally = a; S.teams[a].endAllyAt = S.teams[b].endAllyAt = null; log(S, { t: 'ally', a, b }); return true; }
  function gift(S, a, res, n) { const T = S.teams[a]; if (T.ally == null || n <= 0 || T.res[res] < n) throw new Error('لا يمكن الإرسال'); T.res[res] -= n; S.teams[T.ally].res[res] += n; log(S, { t: 'gift', a, b: T.ally, res, n }); }
  function endQuiet(S, a) { const T = S.teams[a]; if (T.ally == null) return; T.endAllyAt = S.cycle + 1; S.teams[T.ally].endAllyAt = S.cycle + 1; log(S, { t: 'endAlly', a, b: T.ally }); }
  function breakAlliance(S, a, how) { const T = S.teams[a], b = T.ally; if (b == null) return; T.ally = null; S.teams[b].ally = null; T.endAllyAt = S.teams[b].endAllyAt = null; log(S, { t: how === 'betray' ? 'betray' : 'unally', a, b, how }); }

  // ---------- المراحل ----------
  function setPhase(S, i) { S.phase = i; const P = CFG.PHASES[i]; log(S, { t: 'phase', key: P.key, unlock: P.unlock });
    if (P.dissolve) S.teams.forEach(T => { if (T.ally != null) breakAlliance(S, T.id, 'final'); T.offerFrom = null; T.revenge = null; });
    if (P.key === 'crown') { const rk = ranking(S), tied = rk.filter(x => x.score === rk[0].score).map(x => x.team);
      if (tied.length > 1) { S.tie = { teams: tied, pts: tied.map(() => 0) }; log(S, { t: 'tie', teams: tied }); } // مواجهة فاصلة: أفضل من ثلاثة
      else { S.done = true; S.winner = rk[0].team; log(S, { t: 'end', ranking: rk, winner: S.winner }); } } }
  // نقطة في المواجهة الفاصلة (حكم المشرف): أول فريق يصل إلى نقطتين يُتوَّج
  function tiePoint(S, team) { const T = S.tie; if (!T) throw new Error('لا تعادل'); const i = T.teams.indexOf(team); if (i < 0) throw new Error('ليس من المتعادلين');
    T.pts[i]++; log(S, { t: 'tiePoint', team, pts: T.pts.slice() });
    if (T.pts[i] >= 2) { S.tiePts = {}; T.teams.forEach((t, k) => { S.tiePts[t] = T.pts[k]; }); S.tie = null; S.done = true; S.winner = team; log(S, { t: 'end', ranking: ranking(S), winner: team, tieBreak: true }); return team; } return null; }
  // الترتيب النهائي (مصدر واحد لكل الواجهات): الأكثر أرضًا؛ وعند التعادل: الفائز بالفاصلة أولًا، ثم الأكثر نقاطًا في الفاصلة، ثم الأكثر موارد، ثم ترتيب الإعداد
  function ranking(S) { const tp = S.tiePts || {}, resSum = t => RES.reduce((a, k) => a + (S.teams[t].res[k] || 0), 0), win = t => (S.done && S.winner === t ? 1 : 0);
    return S.teams.map(T => ({ team: T.id, score: score(S, T.id), tb: tp[T.id] != null ? tp[T.id] : null, win: !!win(T.id) }))
      .sort((a, b) => b.score - a.score || win(b.team) - win(a.team) || (b.tb || 0) - (a.tb || 0) || resSum(b.team) - resSum(a.team) || a.team - b.team); }

  // ---------- الثوابت: تُفحص بعد كل خطوة في الاختبارات والمحاكاة ----------
  function check(S) {
    const err = [];
    S.teams.forEach((T, i) => { RES.forEach(k => { if (!Number.isInteger(T.res[k]) || T.res[k] < 0) err.push(`مورد سالب ${i}.${k}=${T.res[k]}`); });
      if (S.regions[T.cap].owner !== i) err.push(`عاصمة ${i} سقطت`);
      if (T.ally != null && S.teams[T.ally].ally !== i) err.push(`حلف غير متماثل ${i}`); if (T.ally === i) err.push('حليف نفسه');
      if (![1, 2, 3].includes(T.capLevel)) err.push('درجة عاصمة'); });
    S.regions.forEach(r => { if (r.owner != null && !(r.owner >= 0 && r.owner < S.teams.length)) err.push(`مالك غير صالح ${r.id}`);
      if ((r.walls || r.tower || r.garrison) && r.owner == null) err.push(`بناء بلا مالك ${r.id}`);
      if (r.type === 'castle' && (r.garrison || r.walls)) err.push('حامية/سور في القلعة');
      if (r.type === 'capital' && r.walls) err.push('سور على عاصمة'); });
    if (!castleOpen(S) && S.regions.some(r => r.type === 'castle' && r.owner != null)) err.push('القلعة أُخذت قبل فتحها');
    if (CFG.PHASES[S.phase].dissolve && S.teams.some(T => T.ally != null)) err.push('تحالف في المعركة الأخيرة');
    return err;
  }

  // كلفة الأمر على صاحبه (مصدر واحد للواجهات): الثأر مجاني، والمشترك نصفه
  function costOf(o) { const C = CFG.COST; if (!o) return {}; if (o.k === 'supply') return {}; if (o.k === 'attack') { if (o.revenge) return {}; const c = C[o.unit || 'inf'] || {}; return o.joint ? half(c, true) : c; } return C[o.k] || {}; }
  G.RayatRules = { costOf, CFG, RES, setup, legal, attackOptions, startCycle, act, skip, point, predict, bonusOrders, endCycle, offer, accept, gift, endQuiet, breakAlliance, setPhase, tiePoint, ranking, score, check, clone, hop, unlocked, phaseKey, towerCover, reachable };
  if (typeof module !== 'undefined') module.exports = G.RayatRules;
})(typeof window !== 'undefined' ? window : globalThis);
