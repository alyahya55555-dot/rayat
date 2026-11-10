/* رايات — تدفق المسابقة عند المشرف (المرجع الوحيد للحالة). نقي بلا واجهة، فيُختبر في node.
   المراحل: لوبي ← (مرحلة) ← سؤال ← كشف ← أوامر ← تنفيذ (مواجهات ومشاهد) ← حصاد ← سؤال ... ← تتويج */
(function (G) {
  'use strict';
  const RR = () => G.RayatRules;
  const SEC = 1000;
  const DUR = { phase: 6, question: 20, reveal: 5, orders: 20, harvest: 4.6, predict: 7, buzz: 15, buzz2: 10, judgeMax: 25, duelRes: 2.5, gq: 20,
    // مدد المشاهد على شاشة العرض (ثوانٍ) — المشرف يتخطاها بضغطة
    scene: { occupy: 8.6, attack: 11.2, walls: 6.8, tower: 6.8, garInf: 6.8, garCav: 6.8, capital: 5.6, supply: 2.2, ally: 5.8, unally: 3.4, sail: 2.9, batch: 8, phase: 5.2 } };
  const LEVELS = { easy: 'سهل', med: 'متوسط', hard: 'صعب' }, LV_OLD = { mid: 'easy', sec: 'med', uni: 'hard' }, lv = k => LV_OLD[k] || (LEVELS[k] ? k : 'med');
  const PH_DIFF = { opening: 1, expansion: 1, friction: 2, war: 2, siege: 3, final: 3, crown: 3 };
  const clone = o => JSON.parse(JSON.stringify(o));
  const RES_AR = { food: 'طعام', gold: 'ذهب', stone: 'حجر' };
  const UNIT_AR = { inf: 'مشاة', cav: 'فرسان', cat: 'منجنيق' };

  class RayatGame {
    constructor(o = {}) {
      this.now = o.now || (() => Date.now());
      this.bank = o.bank || []; this.binis = o.binis || [];
      this.s = { v: 0, code: o.code || String(1000 + Math.floor(Math.random() * 9000)), stage: 'lobby', level: lv(o.level), nTeams: o.teams ? o.teams.length : 4,
        teams: (o.teams || []).map((t, i) => ({ id: i, name: t.name, color: t.color, mark: t.mark })), players: {}, captains: {}, mapSeed: o.mapSeed || 7,
        cycle: 0, phase: 0, phaseStart: 0, paused: null, used: [], q: null, answers: {}, ans: null, orders: {}, sug: {}, ready: {}, queue: [], ev: null, evSeq: 0, duel: null, log: [], vis: null, bini: null, binisOn: o.binisOn !== false, tie: null, winner: null, deadline: 0, dur: 0, startedAt: 0 };
      this.S = null; this.M = null; this.onChange = () => { };
    }
    // ---------- مساعدات ----------
    changed() { this.s.v++; this.onChange(); }
    // ساعة اللعب: تتجمد أثناء الإيقاف المؤقت، فتتجمد معها كل المؤقتات والمراحل
    t() { const s = this.s, n = this.now(); if (!s) return n; return n - (s.pOff || 0) - (s.paused ? n - s.paused.at : 0); }
    setTimer(sec) { this.s.dur = sec * SEC; this.s.deadline = this.t() + sec * SEC; }
    left() { return Math.max(0, this.s.deadline - this.t()); }
    // المشاهد: إن كانت شاشة عرض متصلة ينتظر المشرف إشارتها «انتهى المشهد» (بسقف زمني)، فلا يُقطع مشهد ولا يُسرَّع؛ وإلا فالمدة الاسمية
    sceneTimer(d) { const wait = !!(this.hasDisplay && this.hasDisplay()); this.s.sceneNom = d; this.setTimer(wait ? d * 1.6 + 4 : d); }
    ackKey() { const s = this.s; return ['scene', 'phase', 'harvest'].includes(s.stage) ? s.stage + ':' + (s.ev ? s.ev.id : 'c' + s.cycle) : null; }
    sceneAck(key) { const s = this.s; if (s.paused || !key || key !== this.ackKey() || !s.deadline) return; if (s.stage === 'harvest' && this.s.dur - this.left() < 2500) { s.deadline = this.t() + 2500 - (s.dur - this.left()); this.changed(); return; } s.deadline = this.t(); this.tick(); }
    say(text, kind = 'info') { const s = this.s; s.log.push({ t: this.t(), text, kind }); if (s.log.length > 60) s.log.shift(); if (kind === 'big') { (s.chron = s.chron || []).push({ p: s.phase || 0, c: s.cycle || 0, text }); if (s.chron.length > 300) s.chron.shift(); } }
    // شريط الحرب: لكل مرحلة أبرز حدثين
    ribbon() { const P = RR().CFG.PHASES, ch = this.s.chron || []; return P.map((ph, i) => { const ev = ch.filter(x => x.p === i && !/^بدأت/.test(x.text)), key = ev.filter(x => /القلعة|ينقضون|ينهبون|عاصمة|يتوَّجون/.test(x.text)), pick = (key.length ? key : ev); return { name: ph.name, ev: [pick[0], pick.length > 1 ? pick[pick.length - 1] : null].filter(Boolean).map(x => x.text) }; }).filter(x => x.ev.length); }
    team(i) { return this.s.teams[i]; }
    tn(i) { return i == null ? 'محايد' : this.s.teams[i].name; }
    rn(r) { return this.S.regions[r].name; }
    phaseKey() { return RR().CFG.PHASES[this.S ? this.S.phase : 0].key; }
    members(team) { return Object.entries(this.s.players).filter(([, p]) => p.team === team).map(([pid]) => pid); }
    online(team) { return this.members(team).filter(pid => this.s.players[pid].online !== false); }
    captain(team) { const c = this.s.captains[team]; if (c && this.s.players[c] && this.s.players[c].online !== false) return c; const on = this.online(team); return on[0] || c || null; }
    snapshot() { const S = this.S; return { regions: S.regions.map(r => ({ id: r.id, owner: r.owner, walls: r.walls, tower: r.tower, garrison: r.garrison })), teams: S.teams.map(T => ({ capLevel: T.capLevel })), allies: S.teams.filter(T => T.ally != null && T.id < T.ally).map(T => [T.id, T.ally]) }; }

    // ---------- اللوبي ----------
    join(pid, name, want) {
      const s = this.s; name = String(name || '').trim().slice(0, 24) || 'مشارك'; let p = s.players[pid];
      if (!p) { let team = want != null && s.teams[want] ? +want : null; if (team == null) { const c = s.teams.map(T => this.members(T.id).length); team = c.indexOf(Math.min(...c)); }
        p = s.players[pid] = { name, team, online: true, at: this.t() }; if (s.captains[team] == null) s.captains[team] = pid; this.changed(); }
      else { let ch = false; if (p.name !== name) { p.name = name; ch = true; } if (p.online === false) { p.online = true; ch = true; } if (s.stage === 'lobby' && want != null && s.teams[want] && p.team !== +want) { p.team = +want; if (Object.values(s.captains).includes(pid)) Object.keys(s.captains).forEach(k => { if (s.captains[k] === pid) delete s.captains[k]; }); if (s.captains[p.team] == null) s.captains[p.team] = pid; ch = true; } if (ch) this.changed(); }
      return p;
    }
    offline(pid) { const p = this.s.players[pid]; if (p && p.online !== false) { p.online = false; this.changed(); } }
    setCaptain(team, pid) { if (this.s.players[pid] && this.s.players[pid].team === team) { this.s.captains[team] = pid; this.changed(); } }
    movePlayer(pid, team) { const p = this.s.players[pid]; if (!p || !this.s.teams[team]) return; Object.keys(this.s.captains).forEach(k => { if (this.s.captains[k] === pid) delete this.s.captains[k]; }); p.team = team; if (this.s.captains[team] == null) this.s.captains[team] = pid; this.changed(); }
    kick(pid) { delete this.s.players[pid]; Object.keys(this.s.captains).forEach(k => { if (this.s.captains[k] === pid) delete this.s.captains[k]; }); this.changed(); }

    // ---------- البداية ----------
    start() {
      const s = this.s; if (s.stage !== 'lobby') return;
      this.M = G.RayatMap.build(s.teams.length, s.mapSeed); this.S = RR().setup(this.M, s.teams);
      s.vis = this.snapshot(); s.startedAt = this.t(); s.phaseStart = this.t(); s.cycle = 0;
      s.teams.forEach(T => { if (s.captains[T.id] == null) { const m = this.members(T.id); if (m.length) s.captains[T.id] = m[0]; } });
      this.say('بدأت المسابقة', 'big'); this.enterPhase(0);
    }
    enterPhase(i) { const s = this.s, P = RR().CFG.PHASES[i]; if (i > 0) RR().setPhase(this.S, i); s.phase = i; s.phaseStart = this.t();
      this.S.events.filter(e => e.t === 'unally' && e.phase === i).forEach(e => this.pushEv({ k: 'unally', a: e.a, b: e.b, betray: false }));
      s.stage = 'phase'; s.ev = { id: ++s.evSeq, k: 'phase', key: P.key, name: P.name, unlock: P.unlock }; this.sceneTimer(DUR.scene.phase); this.say('بدأت مرحلة ' + P.name, 'big');
      if (P.key === 'crown') { s.vis = this.snapshot(); this.crown(); return; }
      this.changed(); }
    pushEv(e) { this.s.queue.push(e); }

    // ---------- السؤال ----------
    // يُختار السؤال من مستوى المسابقة؛ فإن نفد يُستعار من أقرب مستوى آخر قبل أي تكرار (450 سؤالًا تكفي مسابقة كاملة بلا تكرار)
    pickQuestion(diffWant, forDuel) {
      const s = this.s, near = { easy: ['easy', 'med', 'hard'], med: ['med', 'easy', 'hard'], hard: ['hard', 'med', 'easy'] }[s.level] || [s.level];
      let c = [];
      for (const lv of near) { const pool = this.bank.filter(q => q.level === lv && !s.used.includes(q.id)); if (!pool.length) continue;
        const shift = lv === s.level ? 0 : (near.indexOf(lv) && ['easy', 'med', 'hard'].indexOf(lv) < ['easy', 'med', 'hard'].indexOf(s.level) ? 2 : -1), want = Math.max(1, Math.min(3, diffWant + (lv === s.level ? 0 : shift)));
        c = pool.filter(q => q.d === want); if (!c.length) c = pool.filter(q => Math.abs(q.d - want) <= 1); if (!c.length) c = pool; break; }
      if (!c.length) { s.used = []; c = this.bank.filter(q => q.level === s.level); }
      if (!c.length) c = this.bank; const q = c[Math.floor(Math.random() * c.length)]; s.used.push(q.id); return q;
    }
    nextQuestion() { const s = this.s, q = this.pickQuestion(PH_DIFF[this.phaseKey()]);
      s.cycle++; s.q = { id: q.id, text: q.q, c: q.c, a: q.a, topic: q.t || '' }; s.answers = {}; s.stage = 'question'; this.setTimer(DUR.question); this.changed(); }
    answer(pid, qid, choice) { const s = this.s, p = s.players[pid]; if (!p || !s.q || s.q.id !== qid) return;
      if (s.stage === 'question') { if (s.answers[pid] != null) return; s.answers[pid] = { c: +choice, t: this.t() }; this.changed(); if (this.allAnswered()) this.reveal(); return; }
      if (s.stage === 'gq' && s.duel && (p.team === s.duel.a || p.team === s.duel.ally)) { if (s.duel.gqAns[pid] != null) return; s.duel.gqAns[pid] = +choice; this.changed(); const need = this.online(s.duel.a).concat(s.duel.ally != null ? this.online(s.duel.ally) : []); if (need.every(x => s.duel.gqAns[x] != null)) this.gqEnd(); } }
    allAnswered() { const on = Object.keys(this.s.players).filter(pid => this.s.players[pid].online !== false); return on.length > 0 && on.every(pid => this.s.answers[pid] != null); }
    reveal() { const s = this.s; s.stage = 'reveal'; const ratios = [], speeds = [];
      s.teams.forEach(T => { const m = this.members(T.id).filter(pid => s.players[pid].online !== false || s.answers[pid] != null), ok = m.filter(pid => s.answers[pid] && s.answers[pid].c === s.q.a);
        ratios[T.id] = m.length ? ok.length / m.length : 0; const ts = ok.map(pid => s.answers[pid].t); speeds[T.id] = ts.length ? ts.reduce((a, b) => a + b, 0) / ts.length : 1e15; });
      const tr = RR().startCycle(this.S, ratios, speeds); s.ans = { ratios, orders: tr.orders, order: tr.order }; this.setTimer(DUR.reveal); this.changed(); }

    // ---------- الأوامر ----------
    options(team) { // الأوامر الممكنة للقائد، مجمّعة
      const L = RR().legal(this.S, team), O = { supply: [], occupy: [], walls: [], tower: [], garInf: [], garCav: [], cap: [], attack: [] };
      L.forEach(o => { if (o.k === 'supply') O.supply.push(o); else if (o.k === 'cap2' || o.k === 'cap3') O.cap.push(o); else if (O[o.k]) O[o.k].push(o); });
      return O; }
    openOrders(teams) { const s = this.s; s.stage = 'orders'; s.orders = {}; s.sug = {}; s.ready = {}; s.orderTeams = teams; this.setTimer(DUR.orders); this.changed(); }
    // القائد يحدد أوامره (قائمة بطول عدد أوامره)
    setOrders(pid, list, cy) { const s = this.s, p = s.players[pid]; if (cy != null && cy !== s.cycle) return; if (s.stage !== 'orders' || !p || this.captain(p.team) !== pid || !s.orderTeams.includes(p.team)) return;
      const n = this.S.turn ? this.S.turn.left[p.team] : 0; s.orders[p.team] = (Array.isArray(list) ? list : []).slice(0, n).map(o => this.cleanOrder(o)).filter(Boolean); this.changed(); }
    cleanOrder(o) { if (!o || typeof o !== 'object') return null; const k = String(o.k || ''); const out = { k }; if (o.r != null) out.r = +o.r; if (o.res) out.res = String(o.res); if (o.unit) out.unit = String(o.unit); if (o.joint) out.joint = true; if (o.betray) out.betray = true; if (o.revenge) out.revenge = true; return out; }
    setReady(pid, cy) { const s = this.s, p = s.players[pid]; if (cy != null && cy !== s.cycle) return; if (s.stage !== 'orders' || !p || this.captain(p.team) !== pid) return; s.ready[p.team] = true; this.changed(); if (s.orderTeams.every(t => s.ready[t] || !(this.S.turn.left[t] > 0))) this.execute(); }
    suggest(pid, o) { const s = this.s, p = s.players[pid]; if (s.stage !== 'orders' || !p) return; const c = this.cleanOrder(o); if (!c) return; (s.sug[p.team] = s.sug[p.team] || {})[pid] = c; this.changed(); }
    // التنفيذ: حسب ترتيب الدقة، وأي أمر صار غير ممكن يتحول إلى تموين
    execute() { const s = this.s, S = this.S; s.stage = 'exec'; const plan = [];
      const order = (s.ans ? s.ans.order : s.teams.map(T => T.id)).filter(t => s.orderTeams.includes(t));
      order.forEach(t => { const n = S.turn.left[t]; let picks = (s.orders[t] || []).slice(0, n);
        if (picks.length < n) { const votes = {}; Object.values(s.sug[t] || {}).forEach(o => { const k = JSON.stringify(o); votes[k] = (votes[k] || 0) + 1; }); const best = Object.entries(votes).sort((a, b) => b[1] - a[1]).map(x => JSON.parse(x[0])); while (picks.length < n && best.length) picks.push(best.shift()); }
        while (picks.length < n) picks.push({ k: 'supply', res: this.lowRes(t) });
        picks.forEach(o => plan.push({ t, o })); });
      s.plan = plan; this.changed(); this.nextAction(); }
    lowRes(t) { const R = this.S.teams[t].res; return ['gold', 'food', 'stone'].sort((a, b) => R[a] - R[b])[0]; }
    same(a, b) { return a.k === b.k && a.r === b.r && a.res === b.res && a.unit === b.unit && !!a.joint === !!b.joint && !!a.betray === !!b.betray; }
    nextAction() { const s = this.s, S = this.S;
      // نجمع الأوامر الهادئة المتتالية في دفعة واحدة تُعرض معًا
      const calm = [];
      while (s.plan.length) { const { t, o } = s.plan[0]; const L = RR().legal(S, t); let act = L.find(x => this.same(x, o));
        if (!act && o.k === 'attack') act = L.find(x => x.k === 'attack' && x.r === o.r && x.unit === o.unit && !!x.joint === !!o.joint);
        if (!act) { const c = RR().costOf(o), R = S.teams[t].res, short = Object.keys(c).filter(k => (R[k] || 0) < c[k]), taken = o.k === 'occupy' && o.r != null && S.regions[o.r] && S.regions[o.r].owner != null;
          const why = short.length ? `لا يكفي ${short.map(k => RES_AR[k]).join(' و')}` : taken ? `سبقهم غيرهم إلى ${this.rn(o.r)}` : 'لم يعد ممكنًا'; act = { k: 'supply', res: this.lowRes(t) }; if (o.k !== 'supply') this.say(`${this.tn(t)}: تعذّر ${o.k === 'occupy' ? 'الاحتلال' : o.k === 'attack' ? 'الهجوم' : 'الأمر'} (${why}) فصار تموينًا`, 'warn'); }
        if (act.k === 'attack') { if (calm.length) break; s.plan.shift(); return this.beginDuel(t, act); }
        s.plan.shift(); RR().act(S, t, act); calm.push(this.calmEvent(t, act)); }
      if (calm.length) { this.showCalm(calm); return; }
      if (s.biniMode) { s.biniMode = false; s.vis = this.snapshot(); return this.nextQuestion(); }
      this.harvest(); }
    calmEvent(t, o) { const S = this.S; switch (o.k) {
      case 'supply': this.say(`${this.tn(t)}: تموين +${RR().CFG.SUPPLY} ${RES_AR[o.res]}`); return { k: 'supply', team: t, res: o.res, n: RR().CFG.SUPPLY };
      case 'occupy': this.say(`${this.tn(t)} يحتلون ${this.rn(o.r)}`); return { k: 'occupy', team: t, r: o.r, naval: this.seaTo(t, o.r) };
      case 'walls': this.say(`${this.tn(t)} يبنون سورًا في ${this.rn(o.r)}`); return { k: 'walls', team: t, r: o.r };
      case 'tower': this.say(`${this.tn(t)} يرفعون برج مراقبة في ${this.rn(o.r)}`); return { k: 'tower', team: t, r: o.r };
      case 'garInf': case 'garCav': this.say(`${this.tn(t)} ينشرون حامية ${o.k === 'garCav' ? 'فرسان' : 'مشاة'} في ${this.rn(o.r)}`); return { k: o.k, team: t, r: o.r };
      case 'cap2': case 'cap3': this.say(`${this.tn(t)} يطوّرون عاصمتهم إلى ${o.k === 'cap2' ? 'مدينة' : 'حاضرة'}`, 'big'); return { k: 'capital', team: t, level: S.teams[t].capLevel };
    } return { k: 'supply', team: t, res: 'gold', n: 0 }; }
    // هل يصل الفريق إلى الإقليم بحرًا؟ (لا أرض له ولا لحليفه مجاورة على اليابسة نفسها)
    seaTo(team, r, ally) { const M = this.M, S = this.S; if (!M || !M.regions[r]) return false; const L = M.regions[r].land || 0; return !M.regions[r].nb.some(j => (M.regions[j].land || 0) === L && (S.regions[j].owner === team || (ally != null && S.regions[j].owner === ally))); }
    showCalm(list) { const s = this.s; const vis = list.filter(e => e.k !== 'supply');
      let d = DUR.scene.supply; if (vis.length === 1) d = DUR.scene[vis[0].k] || 6; else if (vis.length > 1) d = DUR.scene.batch; if (vis.some(e => e.naval)) d += DUR.scene.sail;
      s.ev = vis.length === 1 ? { id: ++s.evSeq, ...vis[0], list, one: vis[0] } : vis.length === 0 && list.length === 1 ? { id: ++s.evSeq, ...list[0], list } : { id: ++s.evSeq, k: 'batch', list, one: null };
      if (s.ev.k === 'batch' && !vis.length) d = 3; s.stage = 'scene'; s.afterScene = 'next'; this.sceneTimer(d); this.changed(); }
    sceneDone() { const s = this.s; s.vis = this.snapshot();
      if (s.queue.length) { const e = s.queue.shift(); s.ev = { id: ++s.evSeq, ...e }; s.stage = 'scene'; this.sceneTimer(DUR.scene[e.k] || 3); this.changed(); return; }
      s.ev = null; const a = s.afterScene; s.afterScene = null;
      if (a === 'question') this.nextQuestion(); else if (a === 'harvestDone') this.afterHarvest(); else this.nextAction(); }

    // ---------- المواجهة ----------
    beginDuel(t, o) { const s = this.s, S = this.S, D = RR().act(S, t, o); if (!D) return this.nextAction();
      const kindAr = { normal: 'مواجهة', walls: 'مواجهة على أرض محصّنة', capital: 'غارة على عاصمة', castle: 'حصار القلعة الكبرى', garrisonQ: 'سؤال حامية القلعة' }[D.kind];
      s.duel = { id: ++s.evSeq, a: D.a, d: D.d, ally: D.ally, r: D.r, unit: D.unit, kind: D.kind, kindAr, need: D.need, pts: { ...D.pts }, betray: D.betray, revenge: D.revenge, joint: !!o.joint, preds: {}, buzz: null, tried: [], q: null, gqAns: {}, from: S.regions[D.r].nb.find(j => S.regions[j].owner === t) };
      this.say(`${this.tn(t)} ${o.betray ? 'ينقضون الحلف ويهاجمون' : 'يهاجمون'} ${this.rn(D.r)} (${UNIT_AR[D.unit]})${o.joint ? ' مع حليفهم' : ''}`, 'big');
      if (o.betray) this.pushEv({ k: 'unally', a: t, b: D.d, betray: true });
      if (D.kind === 'garrisonQ') { const q = this.pickQuestion(3, true); s.duel.q = { id: q.id, text: q.q, c: q.c, a: q.a }; s.q = s.duel.q; s.stage = 'gq'; this.setTimer(DUR.gq); this.changed(); return; }
      s.stage = 'predict'; this.setTimer(DUR.predict); this.changed(); }
    predict(pid, duelId, side) { const s = this.s, p = s.players[pid], D = s.duel; if (!D || D.id !== duelId || s.stage !== 'predict' || !p || [D.a, D.d, D.ally].includes(p.team) || !['a', 'd'].includes(side)) return; D.preds[pid] = side; this.changed(); }
    duelQuestion() { const s = this.s, D = s.duel, q = this.pickQuestion(PH_DIFF[this.phaseKey()], true); D.q = { id: q.id, text: q.q, c: q.c, a: q.a }; D.buzz = null; D.tried = []; s.stage = 'buzz'; this.setTimer(DUR.buzz); this.changed(); }
    sideOf(team) { const D = this.s.duel; if (!D) return null; if (team === D.a || (D.ally != null && team === D.ally)) return 'a'; if (team === D.d) return 'd'; return null; }
    buzz(pid, duelId) { const s = this.s, D = s.duel, p = s.players[pid]; if (!D || D.id !== duelId || s.stage !== 'buzz' || !p) return; const side = this.sideOf(p.team); if (!side || D.tried.includes(side) || D.buzz) return;
      D.buzz = { pid, team: p.team, side, name: p.name, t: this.t() }; s.stage = 'judge'; this.setTimer(DUR.judgeMax); this.changed(); }
    // حكم المشرف على الإجابة الشفهية
    judge(ok) { const s = this.s, D = s.duel; if (!D || s.stage !== 'judge' || !D.buzz) return; const side = D.buzz.side;
      if (ok) return this.duelPoint(side);
      D.tried.push(side); this.say(`${this.tn(D.buzz.team)}: إجابة خاطئة`); D.buzz = null;
      if (D.tried.length >= 2) return this.duelPoint('d');
      s.stage = 'buzz'; this.setTimer(DUR.buzz2); this.changed(); }
    duelPoint(side) { const s = this.s, D = s.duel; const res = RR().point(this.S, side); D.pts = res ? D.pts : { ...this.S.duel.pts }; if (!res) { D.pts = { ...this.S.duel.pts }; D.last = side; s.stage = 'point'; this.setTimer(DUR.duelRes); this.changed(); return; }
      D.pts[side]++; D.result = res; this.finishDuel(res); }
    gqEnd() { const s = this.s, D = s.duel; if (!D || s.stage !== 'gq') return; const ids = Object.keys(D.gqAns), ok = ids.filter(pid => D.gqAns[pid] === D.q.a).length, all = this.online(D.a).concat(D.ally != null ? this.online(D.ally) : []).length || 1;
      D.gqRatio = ok / all; const res = RR().point(this.S, D.gqRatio >= .5 ? 'a' : 'd'); D.result = res; this.finishDuel(res); }
    finishDuel(res) { const s = this.s, D = s.duel, S = this.S;
      // التوقعات: كل متوقع صحيح يضيف لفريقه ذهبًا (بسقف)
      if (D.d != null) { const per = {}; Object.entries(D.preds).forEach(([pid, side]) => { const p = s.players[pid]; if (p && side === res.winner) per[p.team] = (per[p.team] || 0) + 1; }); Object.entries(per).forEach(([t, n]) => { const g = RR().predict(S, +t, n); if (g) this.say(`${this.tn(+t)}: توقعات صحيحة +${g} ذهب`); }); D.predWin = per; }
      const r = D.r, result = res.taken ? 'taken' : res.loot ? 'loot' : res.garrisonFell ? 'garrisonFell' : 'hold';
      this.say(result === 'taken' ? `${this.tn(D.a)} يفتحون ${this.rn(r)}` : result === 'loot' ? `${this.tn(D.a)} ينهبون عاصمة ${this.tn(D.d)}` : result === 'garrisonFell' ? `سقطت حامية ${this.rn(r)} وصمدت الأرض` : `${this.tn(D.d != null ? D.d : null)} يصدّون الهجوم على ${this.rn(r)}`, 'big');
      s.stage = 'scene'; const naval = this.seaTo(D.a, r, D.ally); s.ev = { id: ++s.evSeq, k: 'attack', a: D.a, d: D.d, ally: D.ally, r, unit: D.unit, result, from: D.from, loot: res.loot || null, cavLoot: res.cavLoot || 0, naval };
      s.lastDuel = { a: D.a, d: D.d, r, result, pts: D.pts, kindAr: D.kindAr }; s.duel = null; s.afterScene = 'next'; this.sceneTimer(DUR.scene.attack + (naval ? DUR.scene.sail : 0));
      // أحداث مؤجلة (خيط الحلف ينقطع) تُعرض بعد المشهد
      this.changed(); }

    // ---------- الحصاد والمراحل ----------
    harvest() { const s = this.s; const h = RR().endCycle(this.S); s.harvest = h; s.vis = this.snapshot(); s.stage = 'harvest'; s.ev = null; this.sceneTimer(DUR.harvest); this.changed(); }
    afterHarvest() { const s = this.s, P = RR().CFG.PHASES, i = s.phase, el = (this.t() - s.phaseStart) / 60000;
      if (s.forcePhase || (el >= P[i].min && i < P.length - 1)) { s.forcePhase = false; this.enterPhase(i + 1); return; }
      this.nextQuestion(); }
    nextPhaseNow() { this.s.forcePhase = true; if (this.s.stage === 'question' || this.s.stage === 'reveal') { /* تُطبَّق بعد الجولة */ } this.changed(); }

    // ---------- الدبلوماسية (من جوال القائد في أي وقت خارج المواجهة) ----------
    dip(pid, m) { const s = this.s, p = s.players[pid]; if (!p || this.captain(p.team) !== pid || !this.S || s.stage === 'lobby' || s.stage === 'crown') return; const t = p.team;
      try { if (m.k === 'offer') { RR().offer(this.S, t, +m.b); this.say(`${this.tn(t)} يعرضون التحالف على ${this.tn(+m.b)}`); }
        else if (m.k === 'accept') { const a = this.S.teams[t].offerFrom; if (RR().accept(this.S, t, !!m.yes) && a != null) { this.say(`تحالف بين ${this.tn(a)} و${this.tn(t)}`, 'big'); this.pushEv({ k: 'ally', a, b: t }); } }
        else if (m.k === 'gift') { const amt = Math.max(1, Math.min(20, +m.amt || 3)); RR().gift(this.S, t, String(m.res), amt); this.say(`${this.tn(t)} يرسلون ${amt} ${RES_AR[m.res]} لحليفهم`); }
        else if (m.k === 'end') { RR().endQuiet(this.S, t); this.say(`${this.tn(t)} ينهون الحلف بهدوء`); }
      } catch (e) { return; } this.changed(); }

    // ---------- البيني ----------
    biniStart(idx, mult) { const s = this.s; if (!['question', 'harvest', 'reveal'].includes(s.stage)) return; const b = this.binis[idx]; if (!b) return; s.bini = { idx, name: b.name, desc: b.desc, n: b.n || null, mult: Math.max(1, Math.min(5, +mult || 1)), prevStage: s.stage, prevLeft: this.left(), running: false, winner: null }; s.stage = 'bini'; s.deadline = 0; s.dur = 0; this.changed(); }
    biniTimer(sec) { const b = this.s.bini; if (!b) return; b.running = true; this.setTimer(sec); this.changed(); }
    biniWinner(team) { const s = this.s, b = s.bini; if (!b || !s.teams[team]) return; b.winner = team; if (b.prevStage === 'reveal' || b.prevStage === 'question') s.cycle = Math.max(0, s.cycle - 1); this.S.turn = { orders: s.teams.map(() => 0), order: [team], left: s.teams.map(() => 0) }; this.S.teams[team].attackedThisCycle = false; RR().bonusOrders(this.S, team, b.mult); s.biniMode = true; this.say(`${this.tn(team)} يفوزون بالبيني: ${b.mult} أوامر`, 'big'); s.ans = { ratios: s.teams.map(() => 0), orders: s.teams.map(T => T.id === team ? b.mult : 0), order: [team] }; s.afterBini = b.prevStage; s.bini = null; this.openOrders([team]); }
    biniCancel() { const s = this.s, b = s.bini; if (!b) return; s.bini = null; s.stage = b.prevStage; this.setTimer(Math.max(3, b.prevLeft / 1000)); this.changed(); }

    // ---------- التتويج ----------
    crown() { const s = this.s, S = this.S; if (S.tie) { s.stage = 'tie'; s.tie = { teams: S.tie.teams.slice(), pts: S.tie.pts.slice(), buzz: null, tried: [], q: null }; this.tieQuestion(); return; }
      s.winner = S.winner; s.stage = 'crown'; s.rank = RR().ranking(S); this.say(`${this.tn(s.winner)} يتوَّجون أبطالًا للجزيرة`, 'big'); s.deadline = 0; this.changed(); }
    tieQuestion() { const s = this.s, q = this.pickQuestion(3, true); s.tie.q = { id: q.id, text: q.q, c: q.c, a: q.a }; s.tie.buzz = null; s.tie.tried = []; this.setTimer(DUR.buzz); this.changed(); }
    tieBuzz(pid) { const s = this.s, T = s.tie, p = s.players[pid]; if (s.stage !== 'tie' || !T || T.buzz || !p || !T.teams.includes(p.team) || T.tried.includes(p.team)) return; T.buzz = { pid, team: p.team, name: p.name }; this.setTimer(DUR.judgeMax); this.changed(); }
    tieJudge(ok) { const s = this.s, T = s.tie; if (!T || !T.buzz) return; const team = T.buzz.team;
      if (ok) { const w = RR().tiePoint(this.S, team); T.pts = this.S.tie ? this.S.tie.pts.slice() : T.pts.map((v, i) => T.teams[i] === team ? v + 1 : v); if (w != null) { s.tie = null; s.winner = w; s.stage = 'crown'; s.rank = RR().ranking(this.S); this.say(`${this.tn(w)} يحسمون المواجهة الفاصلة ويتوَّجون`, 'big'); this.changed(); return; } this.tieQuestion(); return; }
      T.tried.push(team); T.buzz = null; if (T.tried.length >= T.teams.length) this.tieQuestion(); else { this.setTimer(DUR.buzz2); this.changed(); } }

    // ---------- المؤقت ----------
    tick() { const s = this.s; if (s.paused || !s.deadline || this.left() > 0) return;
      switch (s.stage) {
        case 'phase': s.stage = 'scene'; s.afterScene = 'question'; this.sceneDone(); break;
        case 'question': this.reveal(); break;
        case 'reveal': this.openOrders(s.teams.map(T => T.id).filter(t => this.S.turn.left[t] > 0)); if (!s.orderTeams.length) this.execute(); break;
        case 'orders': this.execute(); break;
        case 'scene': this.sceneDone(); break;
        case 'predict': this.duelQuestion(); break;
        case 'buzz': { const D = s.duel; D.tried.push(...['a', 'd'].filter(x => !D.tried.includes(x))); this.duelPoint('d'); break; }
        case 'judge': this.judge(false); break;
        case 'point': this.duelQuestion(); break;
        case 'gq': this.gqEnd(); break;
        case 'harvest': s.stage = 'scene'; s.afterScene = 'harvestDone'; this.sceneDone(); break;
        case 'bini': if (s.bini) { s.bini.running = false; s.deadline = 0; this.changed(); } break;
        case 'tie': if (s.tie && s.tie.buzz) this.tieJudge(false); else this.tieQuestion(); break;
      } }
    // المشرف يتخطى المشهد/المؤقت الحالي
    skip() { const s = this.s; if (s.stage === 'scene' || s.stage === 'phase' || s.stage === 'harvest' || s.stage === 'reveal' || s.stage === 'point' || s.stage === 'predict') { s.deadline = this.t(); s.skipSeq = (s.skipSeq || 0) + 1; this.tick(); } else if (s.stage === 'question') this.reveal(); else if (s.stage === 'orders') this.execute(); }
    pause(on) { const s = this.s, n = this.now(); if (on && !s.paused) { s.paused = { at: n, left: this.left() }; } else if (!on && s.paused) { s.pOff = (s.pOff || 0) + (n - s.paused.at); s.paused = null; } this.changed(); }

    // ---------- الحالة العامة (للعرض والجوالات) ----------
    pub() { const s = this.s, S = this.S, st = s.stage, hideA = ['question', 'buzz', 'judge', 'predict', 'gq', 'point', 'tie'].includes(st);
      const P = { v: s.v, code: s.code, stage: st, level: s.level, cycle: s.cycle, phase: s.phase, paused: !!s.paused, tm: s.deadline ? { r: this.left(), d: s.dur } : null,
        teams: s.teams.map(T => ({ id: T.id, name: T.name, color: T.color, mark: T.mark, cap: this.captain(T.id), n: this.members(T.id).length })),
        players: Object.fromEntries(Object.entries(s.players).map(([pid, p]) => [pid, { n: p.name, t: p.team, on: p.online !== false }])),
        log: s.log.slice(-8), mapSeed: s.mapSeed, skipSeq: s.skipSeq || 0 };
      if (S) { P.vis = s.vis; P.score = S.teams.map(T => RR().score(S, T.id)); P.res = S.teams.map(T => ({ ...T.res })); P.capLevel = S.teams.map(T => T.capLevel);
        P.ally = S.teams.map(T => T.ally); P.offer = S.teams.map(T => T.offerFrom); P.revenge = S.teams.map(T => T.revenge && T.revenge.until >= S.cycle ? T.revenge.on : null); P.phaseKey = this.phaseKey(); P.phaseName = RR().CFG.PHASES[S.phase].name;
        P.phaseLeft = Math.max(0, RR().CFG.PHASES[S.phase].min * 60000 - (this.t() - s.phaseStart)); P.left = S.turn ? S.turn.left.slice() : null; P.nRegions = S.regions.length; }
      if (s.q && (st === 'question' || st === 'reveal')) P.q = { id: s.q.id, text: s.q.text, c: s.q.c, a: st === 'reveal' ? s.q.a : undefined, topic: s.q.topic, answered: Object.keys(s.answers).length, mine: null };
      if (st === 'question' || st === 'reveal') P.answered = Object.keys(s.answers);
      if (st === 'reveal' && s.ans) P.ans = { ...s.ans, by: Object.fromEntries(Object.entries(s.answers).map(([pid, a]) => [pid, a.c])) };
      if (st === 'orders') { P.orderTeams = s.orderTeams; P.opts = {}; s.orderTeams.forEach(t => { P.opts[t] = this.options(t); }); P.ready = s.ready; P.chosen = Object.fromEntries(Object.entries(s.orders).map(([t, l]) => [t, l.length])); P.sug = s.sug; P.ans = s.ans; }
      if (s.duel) { const D = s.duel; P.duel = { id: D.id, a: D.a, d: D.d, ally: D.ally, r: D.r, rn: S.regions[D.r].name, unit: D.unit, kind: D.kind, kindAr: D.kindAr, need: D.need, pts: D.pts, betray: D.betray, revenge: D.revenge, joint: D.joint, buzz: D.buzz, tried: D.tried, preds: Object.keys(D.preds).length, last: D.last,
        q: D.q ? { id: D.q.id, text: D.q.text, c: D.q.c } : null, gqN: Object.keys(D.gqAns).length };
        if (st === 'gq') P.q = { id: D.q.id, text: D.q.text, c: D.q.c, gq: true }; }
      if (s.lastDuel) P.lastDuel = s.lastDuel;
      if (s.ev) P.ev = s.ev; P.ack = this.ackKey();
      if (st === 'harvest') P.harvest = s.harvest;
      if (s.bini) P.bini = s.bini;
      if (s.tie) P.tie = { teams: s.tie.teams, pts: s.tie.pts, buzz: s.tie.buzz, tried: s.tie.tried, q: s.tie.q ? { id: s.tie.q.id, text: s.tie.q.text, c: s.tie.q.c } : null };
      if (st === 'crown') { P.winner = s.winner; P.rank = s.rank; P.ribbon = this.ribbon(); }
      return P; }
    // ما يراه المشرف فقط (مفتاح الإجابة)
    hostView() { const s = this.s; return { key: s.stage === 'judge' || s.stage === 'buzz' ? (s.duel && s.duel.q ? s.duel.q.a : null) : s.stage === 'tie' && s.tie && s.tie.q ? s.tie.q.a : s.q ? s.q.a : null }; }
    // حفظ واسترجاع
    save() { return JSON.stringify({ s: this.s, S: this.S }); }
    load(json) { const o = JSON.parse(json); this.s = o.s; this.s.level = lv(this.s.level); this.S = o.S; if (this.S) this.M = G.RayatMap.build(this.s.teams.length, this.s.mapSeed); this.changed(); }
  }
  // أثناء الإيقاف المؤقت لا يُقبل أي إجراء يغيّر مجرى اللعب (يُرفض في منطق اللعبة نفسه، لا في الأزرار فقط)
  ['answer', 'setOrders', 'setReady', 'suggest', 'predict', 'buzz', 'judge', 'dip', 'tieBuzz', 'tieJudge', 'skip', 'biniStart', 'biniTimer', 'biniWinner', 'biniCancel'].forEach(k => { const f = RayatGame.prototype[k]; RayatGame.prototype[k] = function (...a) { if (this.s.paused) { this.refused = (this.refused || 0) + 1; return; } return f.apply(this, a); }; });
  RayatGame.DUR = DUR; RayatGame.LEVELS = LEVELS; RayatGame.RES_AR = RES_AR; RayatGame.UNIT_AR = UNIT_AR;
  G.RayatGame = RayatGame;
  if (typeof module !== 'undefined') module.exports = RayatGame;
})(typeof window !== 'undefined' ? window : globalThis);
