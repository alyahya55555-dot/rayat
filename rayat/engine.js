/* ===== محرك «رايات» — حرب السيطرة على الجزيرة =====
   منطق المسابقة كاملًا بلا واجهة. يعمل في متصفح المشرف، وهو المرجع الوحيد.
   الخريطة يولّدها RayatMap.build، والمحرك يحفظ منها الطوبولوجيا فقط (الأنواع والجوار)،
   والشاشات تعيد رسم الشكل من البذرة نفسها.
   الوقت يأتي من opts.now، والتقدم التلقائي من tick()، فالمحاكاة تقدّم ساعة وهمية. */
(function (root) {
  const RES = ['food', 'gold', 'stone'];
  const RES_NAME = { food: 'طعام', gold: 'ذهب', stone: 'حجر' };

  // إنتاج كل نوع في الدورة الواحدة
  const PROD = {
    farm: { food: 2 }, mine: { gold: 2 }, quarry: { stone: 2 }, village: { gold: 1, food: 1 },
    port: { gold: 1 }, rich: { gold: 3 }, capital: { gold: 2, food: 2, stone: 1 }, castle: { gold: 3 }
  };

  // كل الأرقام هنا قابلة للضبط، والمحاكاة تجرّب بدائلها
  const RULES = {
    start: 6,                                   // من كل مورد
    cost: { occupy: 4, fortify: 4, attack: 4 }, // طعام، حجر، ذهب
    supply: 3,                                  // التموين
    tiers: [[0.8, 2], [0.5, 1]],                // نسبة الصحيح في الفريق ← عدد الأوامر
    castleWorth: 5, loot: 0.5, revenge: 3, predictCap: 3,
    fortHold: 1,                                // انتصارات يحتاجها المدافع في أرض محصّنة أو عاصمة
    lastStart: 45,                              // لا تبدأ دورة إن بقي من المرحلة أقل من هذا (ثوانٍ)
    t: { q: 20, orders: 15, predict: 5, buzz: 15, answer: 10, second: 10, round: 3, end: 5, harvest: 4, offer: 30, away: 20 },
    scene: { occupy: 4, fortify: 2, betray: 4 }  // ثوانٍ تعطيها المسابقة لمشاهد الشاشة قبل المواجهات
  };

  // المراحل: attack/ally/castle مفاتيح ما يُسمح به، harvest مضاعف الحصاد، atk مضاعف تكلفة الهجوم، d صعوبات الأسئلة
  // المدد مضبوطة بالمحاكاة: الأرض المحايدة تنفد في نحو 6 دورات، فالتوسع 8 دقائق لا 15، والفرق للمراحل التالية
  const PHASES = [
    { k: 'opening', name: 'الافتتاح', min: 8 },
    { k: 'expand', name: 'التوسع', min: 8, play: true, harvest: 1, d: [1, 1, 1, 2] },
    { k: 'friction', name: 'الاحتكاك', min: 15, play: true, attack: true, ally: true, harvest: 1, d: [1, 2] },
    { k: 'war', name: 'الحرب', min: 22, play: true, attack: true, ally: true, harvest: 2, d: [2] },
    { k: 'siege', name: 'حصار القلعة', min: 15, play: true, attack: true, ally: true, castle: true, harvest: 2, d: [2, 3] },
    { k: 'final', name: 'المعركة الأخيرة', min: 15, play: true, attack: true, castle: true, harvest: 2, atk: 0.5, d: [2, 3] },
    { k: 'crown', name: 'التتويج', min: 7 }
  ];
  const TRIAL_PH = Object.assign({}, PHASES[2], { k: 'trial', name: 'دورة تجريبية' });

  const COLORS = ['#C0392B', '#2471A3', '#D4AC0D', '#1E8449', '#7D3C98', '#CA6F1E', '#17A589', '#5D6D7E'];
  const EMBLEMS = { falcon: 'صقر', sword: 'سيف', palm: 'نخلة', crescent: 'هلال', star: 'نجمة', horse: 'خيل', arrow: 'سهم', shield: 'درع' };
  const EMB_KEYS = Object.keys(EMBLEMS);
  const TEAM_NAMES = ['الفريق الأول', 'الفريق الثاني', 'الفريق الثالث', 'الفريق الرابع', 'الفريق الخامس', 'الفريق السادس'];
  const LEVELS = { mid: 'متوسط', sec: 'ثانوي', uni: 'جامعي وكبار' };

  const clone = o => JSON.parse(JSON.stringify(o));
  const merge = (a, b) => { for (const k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]); else a[k] = b[k]; } return a; };
  const ok = (x = {}) => Object.assign({ ok: true }, x), no = why => ({ ok: false, why });

  class Rayat {
    /* opts: map (من RayatMap.build) أو state، bank [{id,lv,d,q,c:[4],a,src}]، seen [ids سُئلت قبل]، rules (تعديلات)، rng، now */
    constructor(opts = {}) {
      this.rng = opts.rng || Math.random;
      this.now = opts.now || (() => Date.now());
      this.onChange = () => {};
      this.bank = opts.bank || [];
      this.seen = new Set(opts.seen || []);
      this.s = opts.state && opts.state.ver === 1 ? opts.state : this.fresh(opts);
      this.R = this.s.rules;
    }

    // ---------- الحالة ----------
    fresh(o) {
      const M = o.map; if (!M) throw new Error('map required');
      const n = M.caps.length, rules = merge(clone(RULES), o.rules || {});
      const regions = M.regions.map(r => ({ id: r.id, type: r.type, name: r.name, land: r.land, nb: r.nb.slice() }));
      const teams = M.caps.map((cap, i) => ({
        id: 't' + (i + 1), name: TEAM_NAMES[i], color: COLORS[i], emb: EMB_KEYS[i], cap,
        res: { food: rules.start, gold: rules.start, stone: rules.start }, ally: null, allyEnd: false, revenge: null,
        stats: { atkWin: 0, atkLoss: 0, held: 0, lost: 0, castle: 0, betray: 0, looted: 0 }
      }));
      const owner = regions.map(() => null), fort = regions.map(() => false);
      teams.forEach((t, i) => { owner[t.cap] = t.id; (M.starts[i] || []).forEach(j => { owner[j] = t.id; }); });
      const s = {
        ver: 1, v: 0, code: o.code || this.makeCode(), createdAt: this.now(), rules,
        settings: { level: o.level || 'sec', diff: o.diff || 0, inter: !!o.inter, seed: M.seed != null ? M.seed : o.seed, min: Object.fromEntries(PHASES.map(p => [p.k, p.min])) },
        regions, castle: regions.findIndex(r => r.type === 'castle'), teams, owner, owner0: owner.slice(), fort,
        students: {}, captain: {}, banned: {}, sugg: {},
        phase: -1, phaseAt: null, cycle: 0, step: 'lobby', deadline: null,
        q: null, turn: null, duels: [], duel: null, offers: [],
        hist: [], news: [], used: {}, fx: { n: 0, k: null }, undo: [], trial: null, tie: null, result: null
      };
      return s;
    }
    makeCode() { let c = ''; for (let i = 0; i < 4; i++) c += Math.floor(this.rng() * 10); return c === '0000' ? '2468' : c; }
    touch(k, d) { this.s.v++; if (k) this.s.fx = { n: this.s.fx.n + 1, k, d: d || null }; this.onChange(this.s); }
    news(x) { this.s.news.push({ t: this.now(), x }); if (this.s.news.length > 12) this.s.news.shift(); }
    team(id) { return this.s.teams.find(t => t.id === id); }
    tname(id) { const t = this.team(id); return t ? t.name : ''; }
    ph() { return this.s.trial ? TRIAL_PH : PHASES[this.s.phase] || PHASES[0]; }
    pick(a) { return a[Math.floor(this.rng() * a.length)]; }
    shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

    // ---------- الأرض ----------
    regionsOf(tid) { return this.s.owner.map((o, i) => o === tid ? i : -1).filter(i => i >= 0); }
    score(tid) { return this.s.owner.reduce((a, o, i) => a + (o === tid ? (i === this.s.castle ? this.R.castleWorth : 1) : 0), 0); }
    scores() { return Object.fromEntries(this.s.teams.map(t => [t.id, this.score(t.id)])); }
    touches(tid, rid) { return this.s.regions[rid].nb.some(j => this.s.owner[j] === tid); }
    isFort(rid) { return this.s.fort[rid] || this.s.regions[rid].type === 'capital'; }
    allied(a, b) { const t = this.team(a); return !!t && !!b && t.ally === b; }
    revengeOn(a, b) { const t = this.team(a); return !!t && !!t.revenge && t.revenge.on === b && this.s.cycle <= t.revenge.until; }
    setOwner(rid, tid) { const s = this.s; if (s.owner[rid] === tid) return; s.owner[rid] = tid; s.fort[rid] = false; s.hist.push([s.cycle, rid, tid]); }
    ranking() {
      const sc = this.scores();
      return this.s.teams.map(t => ({ id: t.id, name: t.name, score: sc[t.id], land: this.regionsOf(t.id).length })).sort((a, b) => b.score - a.score || b.land - a.land);
    }
    attackCost(att, def) { if (def && this.revengeOn(att, def)) return 0; return Math.ceil(this.R.cost.attack * (this.ph().atk || 1)); }

    // ---------- الطلاب والقادة ----------
    members(tid, online) { return Object.values(this.s.students).filter(x => x.team === tid && (!online || x.online)); }
    smallestTeam() { let b = null, bc = 1e9; this.s.teams.forEach(t => { const c = this.members(t.id).length; if (c < bc) { bc = c; b = t.id; } }); return b; }
    upsertStudent({ sid, name, want }) {
      const s = this.s; if (!sid || s.banned[sid]) return null;
      name = String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) || 'مشارك';
      let st = s.students[sid];
      if (st) { st.online = true; st.offAt = null; this.touch(); return st; }
      const old = Object.values(s.students).find(x => x.name === name && !x.online);
      if (old) {
        delete s.students[old.sid]; const cap = Object.keys(s.captain).find(t => s.captain[t] === old.sid);
        old.sid = sid; old.online = true; old.offAt = null; s.students[sid] = old; if (cap) s.captain[cap] = sid; this.touch('join', { name: old.name, team: old.team }); return old;
      }
      const taken = new Set(Object.values(s.students).map(x => x.name)); let nm = name, k = 2; while (taken.has(nm)) nm = name + ' ' + (k++);
      const team = this.team(want) ? want : this.smallestTeam();
      st = { sid, name: nm, team, online: true, offAt: null, st: { ans: 0, ok: 0, pred: 0, predOk: 0, buzz: 0, buzzOk: 0 } };
      s.students[sid] = st; if (!s.captain[team]) s.captain[team] = sid;
      this.touch('join', { name: nm, team }); return st;
    }
    setOffline(sid) { const st = this.s.students[sid]; if (st && st.online) { st.online = false; st.offAt = this.now(); this.touch(); } }
    moveStudent(sid, tid) { const st = this.s.students[sid]; if (!st || !this.team(tid) || st.team === tid) return false; const from = st.team; st.team = tid; if (this.s.captain[from] === sid) this.autoCaptain(from, true); if (!this.s.captain[tid]) this.s.captain[tid] = sid; this.touch(); return true; }
    removeStudent(sid, ban) { const st = this.s.students[sid]; if (!st) return; delete this.s.students[sid]; if (ban) this.s.banned[sid] = 1; if (this.s.captain[st.team] === sid) this.autoCaptain(st.team, true); this.touch(); }
    setCaptain(tid, sid) { const st = this.s.students[sid]; if (!st || st.team !== tid) return false; this.s.captain[tid] = sid; this.touch(); return true; }
    isCaptain(sid) { const st = this.s.students[sid]; return !!st && this.s.captain[st.team] === sid; }
    autoCaptain(tid, force) {
      const s = this.s, cur = s.students[s.captain[tid]];
      if (!force && cur && (cur.online || this.now() - cur.offAt < this.R.t.away * 1000)) return false;
      const m = this.members(tid, true).find(x => x.sid !== s.captain[tid]) || null;
      if (m) s.captain[tid] = m.sid; else if (force) delete s.captain[tid]; else return false;
      return true;
    }
    // القائد (أو المشرف بلا sid) فقط
    lead(tid, sid) { return sid == null || this.s.captain[tid] === sid; }
    setLook(tid, look, sid) {
      const t = this.team(tid); if (!t || !this.lead(tid, sid)) return no('not-captain'); if (this.s.phase > 0) return no('locked');
      if (look.name) t.name = String(look.name).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 18) || t.name;
      if (look.emb && EMBLEMS[look.emb]) t.emb = look.emb;
      if (look.color && COLORS.includes(look.color)) { if (this.s.teams.some(x => x !== t && x.color === look.color)) return no('color-taken'); t.color = look.color; }
      this.touch(); return ok();
    }

    // ---------- التراجع ----------
    snap(label) { const c = Object.assign({}, this.s); delete c.undo; this.s.undo.push({ label, s: JSON.stringify(c) }); if (this.s.undo.length > 30) this.s.undo.shift(); }
    undo() {
      const u = this.s.undo.pop(); if (!u) return null;
      const live = this.s.students, prev = JSON.parse(u.s), undo = this.s.undo;
      Object.values(prev.students).forEach(p => { const L = live[p.sid]; if (L) p.online = L.online; });
      Object.values(live).forEach(L => { if (!prev.students[L.sid]) prev.students[L.sid] = L; });
      this.s = prev; this.s.undo = undo; this.R = this.s.rules; this.touch('undo'); return u.label;
    }

    // ---------- بنك الأسئلة ----------
    draw(d) {
      const s = this.s, lv = s.settings.level, dd = Math.max(1, Math.min(3, d + (s.settings.diff || 0)));
      const byLv = this.bank.filter(b => !b.lv || b.lv === lv);
      const tiers = [b => b.d === dd && !s.used[b.id] && !this.seen.has(b.id), b => b.d === dd && !s.used[b.id], b => Math.abs(b.d - dd) === 1 && !s.used[b.id], b => !s.used[b.id], () => true];
      for (const f of tiers) { const p = byLv.filter(f); if (p.length) { const q = this.pick(p); s.used[q.id] = 1; return { id: q.id, d: q.d, q: q.q, c: q.c.slice(), a: q.a, src: q.src || '' }; } }
      return null;
    }
    phaseD() { return this.pick(this.ph().d || [1]); }

    // ---------- سير المسابقة ----------
    start() { if (this.s.step !== 'lobby') return no('started'); this.snap('بدء'); this.s.phase = 0; this.s.phaseAt = this.now(); this.s.step = 'setup'; this.touch('phase', { k: 'opening' }); return ok(); }
    phaseLeft() { const s = this.s, p = PHASES[s.phase]; if (!p || s.phaseAt == null) return 0; return s.settings.min[p.k] * 60000 - (this.now() - s.phaseAt); }
    setPhaseMin(k, min) { if (this.s.settings.min[k] == null) return false; this.s.settings.min[k] = Math.max(1, Math.min(60, +min || 1)); this.touch(); return true; }
    nextPhase() {
      const s = this.s; if (s.phase >= PHASES.length - 1 || ['question', 'orders', 'resolve', 'duel'].includes(s.step)) return no('busy');
      this.snap('المرحلة التالية'); s.phase++; s.phaseAt = this.now(); s.step = 'ready'; s.deadline = null;
      const p = PHASES[s.phase];
      if (p.k === 'final') { s.offers = []; s.teams.forEach(t => { if (t.ally && t.id < t.ally) { s.hist.push([s.cycle, 'end', t.id, t.ally]); } t.ally = null; t.allyEnd = false; }); this.news('سقطت التحالفات كلها: المعركة الأخيرة'); }
      if (p.castle && !PHASES[s.phase - 1].castle) this.news('القلعة الكبرى فُتحت!');
      if (p.k === 'crown') { this.finish(); return ok(); }
      this.touch('phase', { k: p.k }); return ok();
    }
    // دورة تجريبية في الافتتاح: تجري بقواعد الاحتكاك ثم تُمحى آثارها
    trialCycle() {
      const s = this.s; if (s.phase !== 0 || s.step !== 'setup') return no('not-now');
      s.trial = JSON.stringify({ teams: s.teams, owner: s.owner, fort: s.fort, hist: s.hist, news: s.news, stu: Object.fromEntries(Object.entries(s.students).map(([k, v]) => [k, v.st])) });
      s.step = 'ready'; return this.nextCycle();
    }
    endTrial() {
      const s = this.s, t = JSON.parse(s.trial); s.teams = t.teams; s.owner = t.owner; s.fort = t.fort; s.hist = t.hist; s.news = t.news;
      Object.entries(t.stu).forEach(([k, v]) => { if (s.students[k]) s.students[k].st = v; });
      s.trial = null; s.cycle = 0; s.step = 'setup'; s.turn = null; s.q = null; s.duel = null; s.duels = []; s.deadline = null;
    }
    nextCycle() {
      const s = this.s, p = this.ph(); if (!p.play || s.step !== 'ready') return no('not-ready');
      if (!s.trial && this.phaseLeft() < this.R.lastStart * 1000) { s.step = 'phaseEnd'; this.touch(); return no('phase-over'); }
      if (!s.trial) this.snap('دورة جديدة');
      s.cycle++; s.sugg = {}; s.turn = null;
      const q = this.draw(this.phaseD()); if (!q) return no('no-questions');
      const roster = Object.values(s.students).filter(x => x.online).map(x => x.sid);
      s.q = Object.assign(q, { at: this.now(), roster, ans: {} });
      s.step = 'question'; s.deadline = this.now() + this.R.t.q * 1000; this.touch('question'); return ok();
    }
    answer(sid, c) {
      const s = this.s, st = s.students[sid]; if (s.step !== 'question' || !st || !s.q) return no('closed');
      if (s.q.ans[sid]) return no('done'); c = +c; if (!(c >= 0 && c < 4)) return no('bad');
      s.q.ans[sid] = { c, t: this.now() - s.q.at }; if (!s.q.roster.includes(sid)) s.q.roster.push(sid);
      const waiting = s.q.roster.filter(x => s.students[x] && s.students[x].online && !s.q.ans[x]);
      if (!waiting.length) this.closeQuestion(); else this.touch();
      return ok();
    }
    closeQuestion() {
      const s = this.s, q = s.q; if (s.step !== 'question') return no('closed');
      const turn = { ratio: {}, n: {}, spd: {}, order: [], orders: {}, res: [], harvest: null };
      s.teams.forEach(t => {
        const roster = q.roster.filter(x => s.students[x] && s.students[x].team === t.id);
        const right = roster.filter(x => q.ans[x] && q.ans[x].c === q.a);
        roster.forEach(x => { const st = s.students[x].st; st.ans++; if (q.ans[x] && q.ans[x].c === q.a) st.ok++; });
        const r = roster.length ? right.length / roster.length : 0;
        turn.ratio[t.id] = r; turn.n[t.id] = (this.R.tiers.find(([th]) => r >= th - 1e-9) || [0, 0])[1];
        turn.spd[t.id] = right.length ? right.reduce((a, x) => a + q.ans[x].t, 0) / right.length : 1e9;
      });
      turn.order = this.shuffle(s.teams.map(t => t.id)).sort((a, b) => turn.ratio[b] - turn.ratio[a] || turn.spd[a] - turn.spd[b]);
      s.turn = turn; s.step = 'orders'; s.deadline = this.now() + this.R.t.orders * 1000;
      this.touch('reveal', { a: q.a });
      if (!turn.order.some(t => turn.n[t] > 0)) this.closeOrders();
      return ok();
    }

    // ---------- الأوامر ----------
    // يرجع null إن كان الأمر صالحًا الآن، وإلا سبب الرفض
    check(tid, o, attacked) {
      const s = this.s, t = this.team(tid), p = this.ph(), R = this.R; if (!t || !o) return 'bad';
      if (o.k === 'supply') return RES.includes(o.res) ? null : 'bad';
      const r = s.regions[o.r]; if (!r) return 'bad';
      const own = s.owner[o.r];
      if (o.k === 'occupy') { if (own) return 'taken'; if (o.r === s.castle) return 'castle'; if (!this.touches(tid, o.r)) return 'far'; if (t.res.food < R.cost.occupy) return 'food'; return null; }
      if (o.k === 'fortify') { if (own !== tid) return 'not-yours'; if (r.type === 'capital' || o.r === s.castle) return 'no-fort'; if (s.fort[o.r]) return 'fortified'; if (t.res.stone < R.cost.fortify) return 'stone'; return null; }
      if (o.k === 'attack') {
        if (!p.attack) return 'no-attack'; if (attacked) return 'one-attack'; if (own === tid) return 'yours';
        if (o.r === s.castle) { if (!p.castle) return 'castle-closed'; } else if (!own) return 'neutral';
        if (!this.touches(tid, o.r)) return 'far';
        if (own && this.allied(tid, own) && !o.betray) return 'ally';
        if (o.betray && !(own && this.allied(tid, own))) return 'no-ally';
        if (t.res.gold < this.attackCost(tid, own)) return 'gold';
        return null;
      }
      return 'bad';
    }
    lowest(tid) { const r = this.team(tid).res; return RES.slice().sort((a, b) => r[a] - r[b])[0]; }
    setOrders(tid, list, sid) {
      const s = this.s; if (s.step !== 'orders') return no('closed'); if (!this.lead(tid, sid)) return no('not-captain');
      const n = s.turn.n[tid] || 0; if (!Array.isArray(list) || list.length > n) return no('count');
      s.turn.orders[tid] = list.map(o => ({ k: o.k, r: o.r == null ? null : +o.r, res: o.res || null, betray: !!o.betray }));
      if (s.turn.order.every(x => !(s.turn.n[x] > 0) || s.turn.orders[x])) this.closeOrders(); else this.touch();
      return ok();
    }
    suggest(sid, rid) { const st = this.s.students[sid]; if (!st || !this.s.regions[rid]) return false; (this.s.sugg[st.team] = this.s.sugg[st.team] || {})[sid] = +rid; this.touch(); return true; }
    suggestions(tid) { const c = {}; Object.values(this.s.sugg[tid] || {}).forEach(r => { c[r] = (c[r] || 0) + 1; }); return c; }
    closeOrders() {
      const s = this.s, R = this.R; if (s.step !== 'orders') return no('closed');
      s.duels = [];
      for (const tid of s.turn.order) {
        const t = this.team(tid), n = s.turn.n[tid] || 0, list = (s.turn.orders[tid] || []).slice(0, n); let attacked = false;
        const auto = !s.turn.orders[tid];
        while (list.length < n) list.push({ k: 'supply', res: null, auto: true });
        for (const o0 of list) {
          let o = o0, why = o.k === 'supply' && !o.res ? null : this.check(tid, o, attacked), fb = false;
          if (o.k === 'supply' && !o.res) o = { k: 'supply', res: this.lowest(tid) };
          else if (why) { o = { k: 'supply', res: this.lowest(tid) }; fb = true; }
          if (o.k === 'supply') t.res[o.res] += R.supply;
          else if (o.k === 'occupy') { t.res.food -= R.cost.occupy; this.setOwner(o.r, tid); }
          else if (o.k === 'fortify') { t.res.stone -= R.cost.fortify; s.fort[o.r] = true; s.hist.push([s.cycle, 'fort', o.r]); }
          else if (o.k === 'attack') {
            const def = s.owner[o.r], cost = this.attackCost(tid, def); t.res.gold -= cost; attacked = true;
            if (o.betray) this.betray(tid, def);
            s.duels.push(this.mkDuel(tid, o.r, !!o.betray, cost));
          }
          s.turn.res.push({ tid, k: o.k, r: o.r, res: o.res, fb, why: fb ? why : null, auto: auto || !!o0.auto, betray: o.k === 'attack' && !!o.betray });
        }
      }
      // مشاهد الفتح والتحصين والنقض تأخذ وقتها على الشاشة قبل المواجهات
      const sc = this.R.scene, show = s.turn.res.reduce((a, x) => a + (x.fb ? 0 : (sc[x.k] || 0) + (x.betray ? sc.betray : 0)), 0);
      this.touch('orders', { res: s.turn.res });
      if (show > 0) { s.step = 'resolve'; s.deadline = this.now() + show * 1000; this.touch(); }
      else this.resolveDone();
      return ok();
    }
    resolveDone() { const s = this.s; if (!['orders', 'resolve'].includes(s.step)) return no('closed'); s.deadline = null; if (s.duels.length) this.nextDuel(); else this.harvest(); return ok(); }
    betray(att, def) {
      const s = this.s, a = this.team(att), d = this.team(def);
      a.ally = null; a.allyEnd = false; d.ally = null; d.allyEnd = false; a.stats.betray++;
      d.revenge = { on: att, until: s.cycle + this.R.revenge };
      s.hist.push([s.cycle, 'betray', att, def]); this.news(`${a.name} ينقضون الحلف ويضربون ${d.name}!`); this.touch('betray', { att, def });
    }

    // ---------- المواجهات ----------
    mkDuel(att, rid, betray, cost) {
      const s = this.s, def = s.owner[rid], r = s.regions[rid];
      const kind = rid === s.castle ? (def ? 'castle' : 'garrison') : r.type === 'capital' ? 'capital' : s.fort[rid] ? 'fort' : 'normal';
      const bypass = betray || (def && this.revengeOn(att, def));
      const need = {}; need[att] = kind === 'castle' ? 2 : (kind === 'fort' || kind === 'capital') && !bypass ? 2 : 1; if (def) need[def] = kind === 'castle' ? 2 : (kind === 'fort' || kind === 'capital') && !bypass ? this.R.fortHold : 1;
      return { kind, att, def, r: rid, betray, bypass: !!bypass, cost, sides: def ? [att, def] : [att], need, wins: { [att]: 0, ...(def ? { [def]: 0 } : {}) }, inter: !!s.settings.inter && (kind === 'castle' || kind === 'capital' || kind === 'garrison') };
    }
    nextDuel() {
      const s = this.s;
      while (s.duels.length) {
        const d = s.duels.shift();
        // الأرض تغيّرت بمواجهة سابقة في الدورة نفسها: يُرد الذهب
        if (s.owner[d.r] !== d.def || !this.touches(d.att, d.r)) { this.team(d.att).res.gold += d.cost; s.turn.res.push({ tid: d.att, k: 'refund', r: d.r }); continue; }
        if (d.def && this.allied(d.att, d.def)) { this.team(d.att).res.gold += d.cost; continue; }
        Object.assign(d, { sub: 'predict', round: 0, preds: {}, q: null, allowed: [], buzz: null, by: null, log: [] });
        s.duel = d; s.step = 'duel';
        const watchers = Object.values(s.students).some(x => x.online && !d.sides.includes(x.team));
        if (watchers && d.kind !== 'tie') { s.deadline = this.now() + this.R.t.predict * 1000; this.touch('duel', { att: d.att, def: d.def, r: d.r }); }
        else this.beginRound();
        return true;
      }
      s.duel = null; this.harvest(); return false;
    }
    predict(sid, pick) {
      const s = this.s, d = s.duel, st = s.students[sid]; if (!d || d.sub !== 'predict' || !st || d.sides.includes(st.team)) return no('closed');
      const valid = d.def ? d.sides : [d.att, 'hold']; if (!valid.includes(pick)) return no('bad');
      d.preds[sid] = pick; this.touch(); return ok();
    }
    beginRound() {
      const s = this.s, d = s.duel; d.round++;
      d.q = this.draw(d.kind === 'garrison' ? 3 : d.kind === 'tie' ? 2 : this.phaseD()); d.buzz = null; d.by = null; d.second = false;
      if (d.kind === 'garrison') { d.allowed = [d.att]; d.buzz = d.att; d.sub = 'answer'; s.deadline = this.now() + (this.R.t.buzz + this.R.t.answer) * 1000; }
      else { d.allowed = d.sides.slice(); d.sub = 'buzz'; s.deadline = this.now() + this.R.t.buzz * 1000; }
      this.touch('round', { n: d.round }); return ok();
    }
    buzz(sid) {
      const s = this.s, d = s.duel, st = s.students[sid]; if (!d || d.sub !== 'buzz' || !st || !d.allowed.includes(st.team)) return no('closed');
      d.buzz = st.team; d.by = sid; st.st.buzz++; d.sub = 'answer'; s.deadline = this.now() + this.R.t.answer * 1000;
      this.touch('buzz', { team: st.team, name: st.name }); return ok();
    }
    judge(right) {
      const s = this.s, d = s.duel; if (!d || d.sub !== 'answer') return no('closed');
      this.snap('حكم');
      if (right) { if (d.by && s.students[d.by]) s.students[d.by].st.buzzOk++; return this.roundWin(d.buzz); }
      d.allowed = d.allowed.filter(x => x !== d.buzz);
      if (d.allowed.length === 1 && d.kind !== 'garrison') { d.buzz = d.allowed[0]; d.by = null; d.second = true; d.sub = 'answer'; s.deadline = this.now() + this.R.t.second * 1000; this.touch('second', { team: d.buzz }); return ok(); }
      if (d.allowed.length > 1) { d.sub = 'buzz'; d.buzz = null; d.by = null; s.deadline = this.now() + this.R.t.second * 1000; this.touch(); return ok(); }
      return this.roundWin(d.kind === 'tie' ? null : d.def);
    }
    // بيني حركي بدل السؤال: المشرف يعلن الفائز بـ duelRound
    duelInter(card) { const d = this.s.duel; if (!d || !['predict', 'buzz', 'answer'].includes(d.sub)) return no('closed'); this.snap('بيني'); d.sub = 'inter'; d.card = card || null; this.s.deadline = null; this.touch('inter', { card }); return ok(); }
    duelRound(tid) { const d = this.s.duel; if (!d || ['round', 'end'].includes(d.sub) || (tid && !d.sides.includes(tid))) return no('closed'); if (d.sub !== 'inter') this.snap('حسم يدوي'); return this.roundWin(tid || null); }
    roundWin(w) {
      const s = this.s, d = s.duel; d.log.push(w);
      if (w) d.wins[w]++;
      let winner;
      if (d.kind === 'tie') { if (w && d.wins[w] >= 2) winner = w; }
      else if (w === d.att && d.wins[d.att] >= d.need[d.att]) winner = d.att;
      else if (!d.def && w !== d.att) winner = 'hold';
      else if (d.def && d.wins[d.def] >= d.need[d.def]) winner = d.def;
      if (winner) return this.endDuel(winner);
      d.sub = 'round'; s.deadline = this.now() + this.R.t.round * 1000; this.touch('roundEnd', { w }); return ok();
    }
    endDuel(w) {
      const s = this.s, d = s.duel, R = this.R; d.winner = w; d.sub = 'end'; s.deadline = this.now() + R.t.end * 1000;
      if (d.kind === 'tie') { s.tie.winner = w; this.touch('tieEnd', { w }); return ok(); }
      const A = this.team(d.att), D = d.def ? this.team(d.def) : null, rn = s.regions[d.r].name;
      if (w === d.att) {
        A.stats.atkWin++;
        if (d.kind === 'capital') { const got = {}; RES.forEach(k => { got[k] = Math.floor(D.res[k] * R.loot); D.res[k] -= got[k]; A.res[k] += got[k]; }); d.loot = got; A.stats.looted++; this.news(`${A.name} ينهبون عاصمة ${D.name}`); }
        else { this.setOwner(d.r, d.att); if (D) D.stats.lost++; this.news(`${A.name} يفتحون ${rn}`); }
      } else { A.stats.atkLoss++; if (D) D.stats.held++; this.news(`صمد ${rn}!`); }
      // التوقعات: ذهبة لكل توقع صحيح، بحد أقصى للفريق
      const per = {};
      Object.entries(d.preds).forEach(([sid, p]) => { const st = s.students[sid]; if (!st) return; st.st.pred++; if (p === w) { st.st.predOk++; per[st.team] = (per[st.team] || 0) + 1; } });
      d.predGold = {}; Object.entries(per).forEach(([tid, c]) => { const g = Math.min(R.predictCap, c); this.team(tid).res.gold += g; d.predGold[tid] = g; });
      this.touch('duelEnd', { w, att: d.att, def: d.def, r: d.r, kind: d.kind }); return ok();
    }
    afterDuel() { const s = this.s; if (s.tie) { s.duel = null; return this.crownFinal(); } s.duel = null; this.nextDuel(); }

    // ---------- الحصاد ونهاية الدورة ----------
    harvest() {
      const s = this.s, m = this.ph().harvest || 1, got = {};
      s.teams.forEach(t => { got[t.id] = { food: 0, gold: 0, stone: 0 }; });
      s.owner.forEach((o, i) => { if (!o) return; const p = PROD[s.regions[i].type] || {}; for (const k in p) got[o][k] += p[k] * m; });
      s.teams.forEach(t => { RES.forEach(k => { t.res[k] += got[t.id][k]; }); });
      if (s.owner[s.castle]) this.team(s.owner[s.castle]).stats.castle++;
      s.teams.forEach(t => { if (t.revenge && s.cycle >= t.revenge.until) t.revenge = null; if (t.allyEnd && t.ally) { const b = this.team(t.ally); if (t.id < b.id) s.hist.push([s.cycle, 'end', t.id, b.id]); b.ally = null; b.allyEnd = false; t.ally = null; t.allyEnd = false; } });
      s.turn.harvest = got; s.step = 'harvest'; s.deadline = this.now() + this.R.t.harvest * 1000;
      this.touch('harvest', got); return ok();
    }
    endCycle() {
      const s = this.s; if (s.step !== 'harvest') return no('closed');
      if (s.trial) { this.endTrial(); this.touch(); return ok(); }
      s.step = !this.ph().play || this.phaseLeft() < this.R.lastStart * 1000 ? 'phaseEnd' : 'ready'; s.deadline = null; this.touch(); return ok();
    }

    // ---------- التحالف ----------
    offerAlly(from, to, sid) {
      const s = this.s, A = this.team(from), B = this.team(to); if (!A || !B || from === to) return no('bad'); if (!this.lead(from, sid)) return no('not-captain');
      if (!this.ph().ally) return no('closed'); if (A.ally || B.ally) return no('has-ally'); if (s.offers.some(o => o.from === from)) return no('pending');
      s.offers.push({ from, to, until: this.now() + this.R.t.offer * 1000 }); this.touch('offer', { from, to }); return ok();
    }
    answerAlly(to, from, yes, sid) {
      const s = this.s, i = s.offers.findIndex(o => o.from === from && o.to === to); if (i < 0) return no('none'); if (!this.lead(to, sid)) return no('not-captain');
      s.offers.splice(i, 1); const A = this.team(from), B = this.team(to);
      if (!yes || !this.ph().ally || A.ally || B.ally) { this.touch('offerNo', { from, to }); return ok({ allied: false }); }
      A.ally = to; B.ally = from; s.offers = s.offers.filter(o => ![from, to].includes(o.from) && ![from, to].includes(o.to));
      s.hist.push([s.cycle, 'ally', from, to]); this.news(`حلف بين ${A.name} و${B.name}`); this.touch('ally', { a: from, b: to }); return ok({ allied: true });
    }
    endAlly(tid, sid) { const t = this.team(tid); if (!t || !t.ally) return no('none'); if (!this.lead(tid, sid)) return no('not-captain'); t.allyEnd = true; this.team(t.ally).allyEnd = true; this.news(`${t.name} ينهون حلفهم مع ${this.tname(t.ally)} من الدورة القادمة`); this.touch('allyEnd', { a: tid, b: t.ally }); return ok(); }
    sendRes(from, res, amt, sid) {
      const A = this.team(from); amt = Math.floor(+amt); if (!A || !A.ally || !RES.includes(res) || !(amt > 0)) return no('bad'); if (!this.lead(from, sid)) return no('not-captain');
      if (A.res[res] < amt) return no('short'); A.res[res] -= amt; this.team(A.ally).res[res] += amt; this.touch('gift', { from, to: A.ally, res, amt }); return ok();
    }

    // ---------- التتويج ----------
    finish() {
      const s = this.s, rk = this.ranking(), top = rk.filter(r => r.score === rk[0].score);
      s.step = 'crown'; s.deadline = null;
      if (top.length > 1) { s.tie = { teams: top.map(r => r.id), winner: null }; s.step = 'tiebreak'; }
      else this.crownFinal();
      this.touch('crown'); return ok();
    }
    startTiebreak() {
      const s = this.s; if (s.step !== 'tiebreak' || s.duel) return no('closed');
      const sides = s.tie.teams; s.duel = { kind: 'tie', sides, need: Object.fromEntries(sides.map(t => [t, 2])), wins: Object.fromEntries(sides.map(t => [t, 0])), sub: 'predict', round: 0, preds: {}, log: [], allowed: [] };
      return this.beginRound();
    }
    crownFinal() {
      const s = this.s; let rk = this.ranking();
      if (s.tie && s.tie.winner) { const w = rk.find(r => r.id === s.tie.winner); rk = [w, ...rk.filter(r => r !== w)]; }
      s.result = { rank: rk, titles: this.titles() }; s.step = 'crown'; s.deadline = null; this.touch('final'); return ok();
    }
    titles() {
      const s = this.s, out = [], best = (arr, f, min = 1) => { let b = null, bv = 0; arr.forEach(x => { const v = f(x); if (v >= min && v > bv) { bv = v; b = x; } }); return b ? { x: b, v: bv } : null; };
      const T = s.teams, S = Object.values(s.students);
      let b;
      if ((b = best(T, t => t.stats.held))) out.push({ k: 'wall', name: 'أصلب دفاع', team: b.x.id, v: b.v });
      if ((b = best(T, t => t.stats.atkWin))) out.push({ k: 'cunning', name: 'أدهى قائد', team: b.x.id, sid: s.captain[b.x.id] || null, v: b.v });
      if ((b = best(T, t => t.stats.castle))) out.push({ k: 'keeper', name: 'حامي القلعة', team: b.x.id, v: b.v });
      if ((b = best(S.filter(x => x.st.pred >= 3), x => x.st.predOk / x.st.pred + x.st.predOk * 1e-3, 0.01))) out.push({ k: 'seer', name: 'أصدق توقعًا', sid: b.x.sid, team: b.x.team, v: Math.round(b.x.st.predOk / b.x.st.pred * 100) });
      if ((b = best(S.filter(x => x.st.ans >= 5), x => x.st.ok / x.st.ans + x.st.ok * 1e-3, 0.01))) out.push({ k: 'star', name: 'نجم الإجابات', sid: b.x.sid, team: b.x.team, v: Math.round(b.x.st.ok / b.x.st.ans * 100) });
      return out;
    }

    // ---------- الزر الكبير والوقت ----------
    // ما يفعله زر المشرف الواحد في كل خطوة
    next() {
      const s = this.s, d = s.duel;
      switch (s.step) {
        case 'lobby': return this.start();
        case 'setup': return this.nextPhase();
        case 'ready': return this.nextCycle();
        case 'question': return this.closeQuestion();
        case 'orders': return this.closeOrders();
        case 'resolve': return this.resolveDone();
        case 'duel': if (d.sub === 'predict') return this.beginRound(); if (d.sub === 'round') return this.beginRound(); if (d.sub === 'end') return this.afterDuel(); return no('judge');
        case 'harvest': return this.endCycle();
        case 'phaseEnd': return this.nextPhase();
        case 'tiebreak': if (!d) return this.startTiebreak(); if (d.sub === 'round') return this.beginRound(); if (d.sub === 'end') return this.afterDuel(); return no('judge');
      }
      return no('none');
    }
    tick() {
      const s = this.s, t = this.now(); let moved = false;
      s.teams.forEach(x => { if (this.autoCaptain(x.id)) moved = true; });
      const nOff = s.offers.length; s.offers = s.offers.filter(o => o.until > t); if (s.offers.length !== nOff) moved = true;
      if (s.deadline != null && t >= s.deadline) {
        const d = s.duel;
        if (s.step === 'question') this.closeQuestion();
        else if (s.step === 'orders') this.closeOrders();
        else if (s.step === 'resolve') this.resolveDone();
        else if (s.step === 'harvest') this.endCycle();
        else if (d && d.sub === 'predict') this.beginRound();
        else if (d && d.sub === 'buzz') this.roundWin(d.kind === 'tie' ? null : d.def);
        else if (d && d.sub === 'answer') this.judge(false);
        else if (d && d.sub === 'round') this.beginRound();
        else if (d && d.sub === 'end') this.afterDuel();
        return true;
      }
      if (moved) this.touch();
      return moved;
    }

    // ---------- الطوارئ ----------
    grant(rid, tid) { if (!this.s.regions[rid] || (tid && !this.team(tid))) return no('bad'); this.snap('منح إقليم'); this.setOwner(rid, tid || null); this.touch('grant', { r: rid, tid }); return ok(); }
    adjust(tid, res, delta) { const t = this.team(tid); if (!t || !RES.includes(res)) return no('bad'); this.snap('تعديل موارد'); t.res[res] = Math.max(0, t.res[res] + Math.round(+delta || 0)); this.touch(); return ok(); }
    skipQuestion() {
      const s = this.s; this.snap('تخطي سؤال');
      if (s.step === 'question') { const q = this.draw(s.q.d); if (!q) return no('no-questions'); s.q = Object.assign(q, { at: this.now(), roster: s.q.roster, ans: {} }); s.deadline = this.now() + this.R.t.q * 1000; this.touch('question'); return ok(); }
      const d = s.duel; if (d && ['buzz', 'answer'].includes(d.sub)) { d.round--; return this.beginRound(); }
      return no('not-now');
    }

    // ما يُبث للشاشات والجوالات: بلا الإجابة الصحيحة قبل كشفها، وبلا سجل التراجع
    pub() {
      const s = this.s, c = Object.assign({}, s); delete c.undo; delete c.used; delete c.trial; c.now = this.now(); c.isTrial = !!s.trial;
      if (s.q) {
        c.q = Object.assign({}, s.q); if (s.step === 'question') delete c.q.a; delete c.q.ans; delete c.q.roster; c.q.n = Object.keys(s.q.ans).length;
        c.q.cnt = Object.fromEntries(s.teams.map(t => { const r = s.q.roster.filter(x => s.students[x] && s.students[x].team === t.id); return [t.id, [r.filter(x => s.q.ans[x]).length, r.length]]; }));
      }
      // أوامر القادة سرية حتى تُغلق
      if (s.turn && s.step === 'orders') c.turn = Object.assign({}, s.turn, { orders: Object.fromEntries(Object.keys(s.turn.orders).map(k => [k, true])) });
      if (s.duel && s.duel.q) { c.duel = Object.assign({}, s.duel, { q: Object.assign({}, s.duel.q) }); if (!['round', 'end'].includes(s.duel.sub)) delete c.duel.q.a; }
      return c;
    }
  }

  const api = { Rayat, RULES, PHASES, PROD, RES, RES_NAME, COLORS, EMBLEMS, LEVELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RayatEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
