/* ===== محرك «جزيرة القرى» — ميدان بناء =====
   منطق المسابقة كاملًا بلا واجهة. يعمل في متصفح المشرف، وهو المرجع الوحيد للنقاط والذهب.
   نظامان فقط: النقاط تحدد الفائز، والذهب يبني القرى. */
(function (root) {
  const TEAM_COLORS = ['#2F80ED', '#27AE60', '#F2994A', '#9B51E0'];
  const TEAM_NAMES = ['الفريق الأول', 'الفريق الثاني', 'الفريق الثالث', 'الفريق الرابع'];
  const BASE_BY_D = { 1: 10, 2: 20, 3: 30 };
  const VAULT_PTS = [30, 20, 10, 5];

  const clone = o => JSON.parse(JSON.stringify(o));

  class Engine {
    constructor(DATA, opts = {}) {
      this.D = DATA;
      this.rng = opts.rng || Math.random;
      this.now = opts.now || (() => Date.now());
      this.onChange = () => {};
      this.s = opts.state && opts.state.ver === 5 ? opts.state : this.freshState(opts);
      this.buildBank(opts.custom || [], opts.disabled || []);
    }

    // ---------- الحالة ----------
    freshState(opts = {}) {
      const n = Math.max(2, Math.min(4, opts.teamCount || 4));
      const teams = []; for (let i = 0; i < n; i++) teams.push({ id: 't' + (i + 1), name: TEAM_NAMES[i], color: TEAM_COLORS[i] });
      const s = {
        ver: 5, v: 0, code: opts.code || this.makeCode(), title: 'ميدان بناء', createdAt: this.now(),
        settings: { allowTeamChoice: true, answerTime: 10, fx: 'high', treasureGold: 40, buzzPenalty: 0, hideScores: true },
        teams, students: {}, banned: {}, ledger: [], txSeq: 0,
        vil: {}, captain: {}, buildLog: [], coh: {}, cohAll: {}, cohRes: {}, battles: [], news: [], councilN: 0,
        plan: clone(this.D.DEFAULT_PLAN), planIdx: -1, clock: { startedAt: null, segStart: null },
        seg: null, seq: 0, used: {}, timer: null, fx: { n: 0, k: null }, undo: [], leader: null, ended: false
      };
      teams.forEach((t, i) => { s.vil[t.id] = this.newVillage(this.D.THEME_KEYS[i % this.D.THEME_KEYS.length]); });
      return s;
    }
    newVillage(theme) { const b = {}; this.D.BUILD_KEYS.forEach(k => { b[k] = 0; }); return { gold: 0, earned: 0, b, theme: theme || null, off: {}, shield: false, stats: { blk: 0, dmg: 0, held: 0, hit: 0 } }; }
    news(x) { this.s.news.push({ t: this.now(), x }); if (this.s.news.length > 14) this.s.news.shift(); }
    makeCode() { let c = ''; for (let i = 0; i < 4; i++) c += Math.floor(this.rng() * 10); return c === '0000' ? '1357' : c; }
    touch(fxKind, fxData) { this.s.v++; if (fxKind) this.s.fx = { n: this.s.fx.n + 1, k: fxKind, d: fxData || null }; this.onChange(this.s); }
    pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }
    shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    team(id) { return this.s.teams.find(t => t.id === id); }

    // ---------- بنك الأسئلة ----------
    buildBank(custom, disabled) {
      const B = [];
      this.D.MCQ.forEach((m, i) => B.push({ id: 'm' + i, kind: 'mcq', cat: m[0], d: m[1], q: m[2], c: m[3], src: m[4] || '' }));
      this.D.VAULT.forEach((m, i) => B.push({ id: 'v' + i, kind: 'vault', cat: 'logic', d: 2, q: 'رمز الخزنة', a: m[0], clues: m[1] }));
      (custom || []).forEach(c => B.push(Object.assign({ custom: true }, c)));
      const dis = new Set(disabled || []);
      this.allBank = B; this.bank = B.filter(b => !dis.has(b.id));
    }
    draw(kind, n, filter = {}) {
      let pool = this.bank.filter(b => b.kind === kind && (!filter.d || filter.d.includes(b.d)));
      if (!pool.length) pool = this.bank.filter(b => b.kind === kind);
      const fresh = pool.filter(b => !this.s.used[b.id]);
      const out = this.shuffle(fresh.length >= n ? fresh : pool).slice(0, n);
      out.forEach(b => { this.s.used[b.id] = 1; });
      return out;
    }

    // ---------- الطلاب والقادة ----------
    teamMembers(tid, onlineOnly) { return Object.values(this.s.students).filter(st => st.team === tid && (!onlineOnly || st.online)); }
    smallestTeam() { let best = null, bc = 1e9; for (const t of this.s.teams) { const c = this.teamMembers(t.id).length; if (c < bc) { bc = c; best = t.id; } } return best; }
    upsertStudent({ sid, name, want, peer, by }) {
      if (!sid || this.s.banned[sid]) return null;
      name = String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) || 'مشارك';
      let st = this.s.students[sid];
      if (!st) {
        // طالب أغلق صفحته وعاد باسمه: يستعيد سجله إن كان القديم غير متصل
        const old = Object.values(this.s.students).find(x => x.name === name && !x.online && (!x.by || !by || x.by === by));
        if (old) { delete this.s.students[old.sid]; const wasCap = Object.keys(this.s.captain).find(t => this.s.captain[t] === old.sid); old.sid = sid; old.online = true; old.peer = peer; old.by = old.by || by || null; this.s.students[sid] = old; if (wasCap) this.s.captain[wasCap] = sid; this.touch('join', { name: old.name, team: old.team }); return old; }
        const taken = new Set(Object.values(this.s.students).map(x => x.name));
        let nm = name, k = 2; while (taken.has(nm)) nm = name + ' ' + (k++);
        const team = (this.s.settings.allowTeamChoice && this.team(want)) ? want : this.smallestTeam();
        st = { sid, name: nm, team, online: true, peer, by: by || null, joinedAt: this.now(), offAt: null, st: { ok: 0, ans: 0, bz: 0, win: 0, lastAct: 0 } };
        this.s.students[sid] = st;
        if (!this.s.captain[team]) this.s.captain[team] = sid;
        this.touch('join', { name: nm, team });
        return st;
      }
      if (!st.online || st.peer !== peer) { st.online = true; st.offAt = null; st.peer = peer; this.touch(); }
      return st;
    }
    setOffline(sid) { const st = this.s.students[sid]; if (st && st.online) { st.online = false; st.offAt = this.now(); this.touch(); } }
    moveStudent(sid, tid) { const st = this.s.students[sid]; if (!st || !this.team(tid) || st.team === tid) return; const from = st.team; st.team = tid; if (this.s.captain[from] === sid) this.autoCaptain(from, true); if (!this.s.captain[tid]) this.s.captain[tid] = sid; this.touch(); }
    removeStudent(sid, ban) { const st = this.s.students[sid]; if (!st) return; delete this.s.students[sid]; if (ban) this.s.banned[sid] = 1; if (this.s.captain[st.team] === sid) this.autoCaptain(st.team, true); this.touch(); }
    autoBalance() {
      const list = this.shuffle(Object.values(this.s.students));
      list.forEach((st, i) => { st.team = this.s.teams[i % this.s.teams.length].id; });
      this.s.teams.forEach(t => this.autoCaptain(t.id, true));
      this.touch('draw');
    }
    // القائد: أول من ينضم، ويستطيع المشرف تغييره. إن غاب القائد انتقلت القيادة لعضو متصل.
    autoCaptain(tid, force) {
      const cur = this.s.students[this.s.captain[tid]];
      if (!force && cur && cur.team === tid && (cur.online || !cur.offAt || this.now() - cur.offAt < 20000)) return false;
      const m = this.teamMembers(tid, true).sort((a, b) => a.joinedAt - b.joinedAt)[0] || this.teamMembers(tid).sort((a, b) => a.joinedAt - b.joinedAt)[0];
      const nid = m ? m.sid : null; if (nid === this.s.captain[tid]) return false;
      if (nid) this.s.captain[tid] = nid; else delete this.s.captain[tid];
      return true;
    }
    setCaptain(tid, sid) { const st = this.s.students[sid]; if (!this.team(tid) || !st || st.team !== tid) return false; this.s.captain[tid] = sid; this.touch(); return true; }
    isCaptain(sid) { const st = this.s.students[sid]; return !!st && this.s.captain[st.team] === sid; }

    // ---------- الفرق والإعدادات ----------
    setTeams(list) {
      const s = this.s;
      s.teams = list.slice(0, 4).map((t, i) => ({ id: t.id || ('t' + (i + 1)), name: String(t.name || TEAM_NAMES[i] || 'فريق').slice(0, 20), color: t.color || TEAM_COLORS[i] }));
      s.teams.forEach((t, i) => { if (!s.vil[t.id]) s.vil[t.id] = this.newVillage(this.D.THEME_KEYS[i % this.D.THEME_KEYS.length]); });
      const ids = new Set(s.teams.map(t => t.id));
      Object.values(s.students).forEach(st => { if (!ids.has(st.team)) st.team = this.smallestTeam(); });
      Object.keys(s.captain).forEach(t => { if (!ids.has(t)) delete s.captain[t]; });
      s.teams.forEach(t => this.autoCaptain(t.id));
      this.touch();
    }
    setSetting(k, v) { this.s.settings[k] = v; this.touch(); }

    // ---------- النقاط والذهب ----------
    vil(tid) { const s = this.s; if (!s.vil[tid]) { const i = Math.max(0, s.teams.findIndex(t => t.id === tid)); s.vil[tid] = this.newVillage(this.D.THEME_KEYS[i % this.D.THEME_KEYS.length]); } return s.vil[tid]; }
    scores() { const sc = {}; this.s.teams.forEach(t => { sc[t.id] = 0; }); this.s.ledger.forEach(e => { if (sc[e.team] !== undefined) sc[e.team] += e.d || 0; }); return sc; }
    ranking() {
      const sc = this.scores();
      const arr = this.s.teams.map(t => ({ id: t.id, score: sc[t.id] })).sort((a, b) => b.score - a.score);
      let rank = 0, prev = null; arr.forEach((r, i) => { if (r.score !== prev) { rank = i + 1; prev = r.score; } r.rank = rank; });
      return arr;
    }
    leaderId() { const r = this.ranking(); return (r.length > 1 && r[0].score > r[1].score && r[0].score > 0) ? r[0].id : null; }
    tieInfo() { const r = this.ranking(); if (r.length < 2 || r[0].score !== r[1].score) return null; return r.filter(x => x.score === r[0].score).map(x => x.id); }
    snapshot() { const s = this.s; return { len: s.ledger.length, vil: clone(s.vil), captain: clone(s.captain), bl: s.buildLog.length, ord: s.seg && s.seg.orders ? clone(s.seg.orders) : null, stu: Object.fromEntries(Object.entries(s.students).map(([k, v]) => [k, clone(v.st)])) }; }
    beginTx(label) { this.s.undo.push({ label, snap: this.snapshot() }); if (this.s.undo.length > 40) this.s.undo.shift(); return ++this.s.txSeq; }
    undo() {
      const u = this.s.undo.pop(); if (!u) return null;
      const s = this.s, sn = u.snap;
      s.ledger.length = sn.len; s.vil = sn.vil; s.captain = sn.captain; s.buildLog.length = Math.min(s.buildLog.length, sn.bl); if (sn.ord && s.seg && s.seg.orders && s.seg.phase === 'council') s.seg.orders = sn.ord;
      Object.entries(sn.stu).forEach(([k, v]) => { if (s.students[k]) s.students[k].st = v; });
      s.leader = this.leaderId(); this.touch('undo');
      return u.label;
    }
    // كل نقطة موجبة يكسبها الفريق = قطعة ذهب بالقيمة نفسها. الخصم لا ينقص الذهب.
    award(tid, d, why, tx, opts = {}) {
      if (!this.team(tid) || !d) return 0;
      const g = d > 0 && !opts.noGold ? d * (opts.goldMult || 1) : 0;
      this.s.ledger.push({ tx, t: this.now(), team: tid, d, g, why });
      if (g) { const v = this.vil(tid); v.gold += g; v.earned += g; }
      if (opts.q && d > 0) { const v = this.vil(tid), L = v.b.market; if (L && !v.off.market) { const bn = this.D.BUILD.market.bonus[L - 1]; v.gold += bn; v.earned += bn; this.s.ledger.push({ tx, t: this.now(), team: tid, d: 0, g: bn, why: 'مكسب السوق' }); } }
      return d;
    }
    // التماسك: نسبة الإجابات الصحيحة لأعضاء الفريق في الجولة
    coh(tid, ok) { const s = this.s; for (const k of ['coh', 'cohAll']) { const c = s[k][tid] = s[k][tid] || { ok: 0, n: 0 }; c.n++; if (ok) c.ok++; } }
    giveGold(tid, g, why, tx) { if (!this.team(tid) || !g) return; const v = this.vil(tid); v.gold = Math.max(0, v.gold + g); if (g > 0) v.earned += g; this.s.ledger.push({ tx, t: this.now(), team: tid, d: 0, g, why }); }
    afterScore() { const L = this.leaderId(), prev = this.s.leader; this.s.leader = L; if (L && L !== prev) this.touch('lead', { team: L }); else this.touch('score'); }
    manualAdjust(tid, d, why) { const tx = this.beginTx('تعديل يدوي'); this.award(tid, d, why || 'تعديل من المشرف', tx, { noGold: true }); this.afterScore(); }
    // تحدٍّ حضوري يحكم فيه المشرف: نقاط وذهب معًا
    liveWin(tid, pts = 20) { if (!this.team(tid)) return; const tx = this.beginTx('تحدٍّ حضوري'); this.award(tid, pts, 'فوز في تحدٍّ حضوري', tx); this.afterScore(); }
    manualGold(tid, g, why) { const tx = this.beginTx('تعديل الذهب'); this.giveGold(tid, g, why || 'تعديل الذهب من المشرف', tx); this.touch('gold'); }

    // ---------- البناء ----------
    buildCost(tid, key) { const B = this.D.BUILD[key]; if (!B) return null; const lv = this.vil(tid).b[key]; return lv >= B.cost.length ? null : B.cost[lv]; }
    // الشراء: قائد الفريق من جواله (sid)، أو المشرف (sid = null)
    buy(tid, key, sid) {
      const s = this.s; if (!this.team(tid) || !this.D.BUILD[key]) return { ok: false, why: 'bad' };
      if (sid != null && s.captain[tid] !== sid) return { ok: false, why: 'not-captain' };
      if (sid != null && !(s.seg && s.seg.g === 'council' && s.seg.phase === 'council')) return { ok: false, why: 'closed' };
      const v = this.vil(tid), c = this.buildCost(tid, key);
      if (c == null) return { ok: false, why: 'max' };
      if (v.gold < c) return { ok: false, why: 'gold' };
      const tx = this.beginTx('بناء'); v.gold -= c; v.b[key]++;
      const lv = v.b[key]; s.buildLog.push({ team: tid, key, lv, t: this.now() });
      s.ledger.push({ tx, t: this.now(), team: tid, d: 0, g: -c, why: 'بنى ' + this.D.BUILD[key].name + (lv > 1 ? ' (المستوى 2)' : '') });
      const hp = (this.D.BUILD[key].pts || [])[lv - 1]; if (hp) this.award(tid, hp, 'نقاط ' + this.D.BUILD[key].name, tx, { noGold: true });
      this.news((this.team(tid) || {}).name + (lv > 1 ? ' تطوّر ' : ' تبني ') + this.D.BUILD[key].name);
      if (sid) { const st = s.students[sid]; if (st) st.st.lastAct = s.seq; }
      if (hp) this.afterScore(); this.touch('build', { team: tid, key, lv }); return { ok: true };
    }
    buildScore(tid) { const b = this.vil(tid).b; return this.D.BUILD_KEYS.reduce((a, k) => a + b[k], 0); }
    // اسم القرية: يكتبه المشرف، أو القائد قبل بدء الجولات
    setTeamName(tid, name, sid) {
      const s = this.s, t = this.team(tid); if (!t) return false;
      if (sid != null && (s.captain[tid] !== sid || (s.seg && s.seg.g !== 'opening'))) return false;
      name = String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20); if (name.length < 2) return false;
      t.name = name; this.touch('name', { team: tid }); return true;
    }
    // طابع القرية: افتراضي لكل فريق، ويغيّره المشرف قبل المسابقة (شكل فقط)
    setTheme(tid, theme, sid) {
      const s = this.s; if (!this.team(tid) || !this.D.THEMES[theme]) return false;
      if (sid != null) return false;
      this.vil(tid).theme = theme; this.touch('theme', { team: tid, theme }); return true;
    }

    // ---------- المؤقت ----------
    startTimer(sec, label) { this.s.timer = { end: this.now() + sec * 1000, dur: sec * 1000, paused: null, label: label || '' }; }
    pauseTimer() { const t = this.s.timer; if (t && t.paused == null) { t.paused = Math.max(0, t.end - this.now()); this.touch(); } }
    resumeTimer() { const t = this.s.timer; if (t && t.paused != null) { t.end = this.now() + t.paused; t.paused = null; this.touch(); } }
    addTime(sec) { const t = this.s.timer; if (!t) return; if (t.paused != null) t.paused += sec * 1000; else t.end += sec * 1000; t.dur += sec * 1000; t.fired = false; this.touch(); }
    remaining() { const t = this.s.timer; if (!t) return null; return t.paused != null ? t.paused : Math.max(0, t.end - this.now()); }
    tick() {
      // نقل القيادة تلقائيًا إن غاب القائد أكثر من 20 ثانية
      let capChanged = false; this.s.teams.forEach(t => { if (this.autoCaptain(t.id)) capChanged = true; }); if (capChanged) this.touch();
      const t = this.s.timer, seg = this.s.seg;
      if (!t || t.paused != null || t.fired || this.now() < t.end) return;
      t.fired = true;
      const it = this.item();
      if (seg && seg.g === 'council' && seg.phase === 'council') return this.resolveCouncil();
      if (!seg || !it) return this.touch('timeup');
      if (seg.phase === 'show') return this.afterShow();
      if (seg.phase === 'open') {
        if (it.kind === 'vault') return this.revealItem(true);
        if (it.wagerQ) return this.judgeWager();
        if (seg.mode === 'all') return this.lockAll();
        if (seg.mode === 'buzz') return this.revealItem(true);
      }
      if (seg.phase === 'wager') return this.lockWagers();
      this.touch('timeup');
    }

    // ---------- البرنامج والجولات ----------
    gameDef(g) { return this.D.GAMES[g] || null; }
    segName(g) { if (g === 'opening') return 'الافتتاح'; if (g === 'crown') return 'التتويج'; if (g === 'council') return 'مجلس القرية'; if (g === 'tiebreak') return 'كسر التعادل'; const d = this.gameDef(g); return d ? d.name : g; }
    item() { const seg = this.s.seg; return seg && seg.idx >= 0 ? seg.items[seg.idx] || null : null; }
    schedule() {
      const s = this.s; let cum = 0; const rows = s.plan.map((p, i) => { const r = { i, g: p.g, name: this.segName(p.g), min: p.min, startAt: cum }; cum += p.min; return r; });
      const elapsed = s.clock.startedAt ? (this.now() - s.clock.startedAt) / 60000 : 0;
      let late = 0; if (s.planIdx >= 0 && rows[s.planIdx]) late = elapsed - (rows[s.planIdx].startAt + rows[s.planIdx].min);
      const segEl = s.clock.segStart ? (this.now() - s.clock.segStart) / 60000 : 0;
      return { rows, total: cum, elapsed, late, segElapsed: segEl };
    }
    goSegment(i) {
      const s = this.s, p = s.plan[i]; if (!p) return;
      if (!s.clock.startedAt) s.clock.startedAt = this.now();
      s.clock.segStart = this.now(); s.planIdx = i; s.timer = null;
      if (s.seg && s.seg.g === 'opening') this.fillThemes();
      if (s.seg && !['council', 'opening', 'crown'].includes(s.seg.g)) this.closeCohesion();
      s.seg = this.makeSeg(p); if (p.g !== 'council') s.coh = {};
      this.touch('seg', { g: p.g });
    }
    nextSegment() { if (this.s.planIdx + 1 < this.s.plan.length) this.goSegment(this.s.planIdx + 1); }
    fillThemes() { const used = new Set(); this.s.teams.forEach(t => { const th = this.vil(t.id).theme; if (th) used.add(th); }); this.s.teams.forEach(t => { const v = this.vil(t.id); if (!v.theme) { const free = this.D.THEME_KEYS.filter(k => !used.has(k)); v.theme = free.length ? free[0] : this.pick(this.D.THEME_KEYS); used.add(v.theme); } }); }
    makeSeg(p) {
      const g = p.g, def = this.gameDef(g) || {};
      const seg = { g, phase: 'intro', idx: -1, items: [], mode: def.mode || 'special', mult: def.mult || 1 };
      const n = p.count || def.count || 4, T = this.s.teams.map(t => t.id);
      if (def.kind === 'mcq') seg.items = this.draw('mcq', n, def.filter || {}).map(b => this.mcqItem(b));
      if (def.kind === 'observe') for (let i = 0; i < n; i++) seg.items.push(this.sceneItem(i));
      if (def.kind === 'vault') seg.items = this.draw('vault', n).map(b => ({ kind: 'vault', bid: b.id, q: 'افتحوا الخزنة', a: b.a, clues: b.clues, cracked: {}, order: 0, lock: {}, tries: {} }));
      if (def.pairs && T.length >= 2) { const P = this.pairList(T); seg.items.forEach((it, i) => { it.pair = P[i % P.length]; }); }
      if (def.treasure && seg.items.length >= 2) { const b = this.draw('mcq', 1, { d: [1, 2] })[0]; if (b) seg.items.splice(Math.floor(seg.items.length / 2), 0, Object.assign(this.mcqItem(b), { treasure: true })); }
      if (def.wager) { const w = this.draw('mcq', 1, { d: [2, 3] })[0]; if (w) seg.items.push(Object.assign(this.mcqItem(w), { wagerQ: true, wagers: {}, picks: {} })); }
      if (g === 'opening') { seg.mode = 'special'; seg.phase = 'welcome'; }
      if (g === 'council') { seg.mode = 'council'; seg.orders = {}; seg.results = null; seg.n = ++this.s.councilN; }
      if (g === 'crown') { seg.mode = 'special'; seg.phase = 'island'; seg.revealed = 0; }
      return seg;
    }
    mcqItem(b) { const order = this.shuffle(b.c.map((_, i) => i)); return { kind: 'mcq', bid: b.id, q: b.q, c: order.map(i => b.c[i]), a: order.indexOf(0), d: b.d, cat: b.cat, src: b.src }; }
    pairList(T) {
      if (T.length === 2) return [[T[0], T[1]]];
      if (T.length === 3) return [[T[0], T[1]], [T[2], T[0]], [T[1], T[2]]];
      return [[T[0], T[1]], [T[2], T[3]], [T[0], T[2]], [T[1], T[3]], [T[0], T[3]], [T[1], T[2]]];
    }
    // قوة الملاحظة: مشهد مرسوم يُعرض ثم يُسأل عنه (أو يتغيّر شيء فيه)
    sceneItem(i) {
      const S = this.D.SCENE, SC = this.D.SCENE_COLORS, colorable = ['boat', 'tent', 'flag', 'chest', 'fish', 'bird'];
      const types = Object.keys(S), colors = Object.keys(SC);
      const slots = []; for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) slots.push([170 + c * 330 + (r ? 160 : 0), 300 + r * 300]);
      const sl = this.shuffle(slots), pickT = this.shuffle(types);
      const kind = ['removed', 'count', 'color', 'added', 'whatcolor'][i % 5];
      let objs = [], q, c, a, B = null;
      const mk = (t, k) => ({ t, x: sl[k][0] + Math.round((this.rng() - .5) * 50), y: sl[k][1] + Math.round((this.rng() - .5) * 40), c: colorable.includes(t) ? this.pick(colors) : null });
      if (kind === 'count') {
        const t = this.pick(['palm', 'bird', 'fish', 'tent', 'rock']); const k = 3 + Math.floor(this.rng() * 3);
        for (let j = 0; j < k; j++) objs.push(mk(t, j));
        pickT.filter(x => x !== t).slice(0, 8 - k).forEach((x, j) => objs.push(mk(x, k + j)));
        const opts = this.shuffle([k - 1, k, k + 1, k + 2]); q = 'كم ' + S[t] + ' كانت في الصورة؟'; c = opts.map(String); a = opts.indexOf(k);
      } else {
        const base = pickT.slice(0, 8); base.forEach((t, j) => objs.push(mk(t, j)));
        if (kind === 'removed') { const gone = this.pick(objs); B = objs.filter(o => o !== gone); const opts = this.shuffle([gone.t, ...this.shuffle(base.filter(t => t !== gone.t)).slice(0, 3)]); q = 'ما الذي اختفى من الصورة؟'; c = opts.map(t => S[t]); a = opts.indexOf(gone.t); }
        else if (kind === 'added') { const nt = pickT[8]; B = objs.concat([mk(nt, 8)]); const opts = this.shuffle([nt, ...this.shuffle(base).slice(0, 3)]); q = 'ما الذي ظهر في الصورة الجديدة؟'; c = opts.map(t => S[t]); a = opts.indexOf(nt); }
        else {
          let cl = objs.filter(o => o.c);
          if (cl.length < 2) { objs[0] = mk('boat', 0); objs[1] = mk('tent', 1); cl = objs.filter(o => o.c); }
          if (kind === 'color') {
            const ch = this.pick(cl); const nc = this.pick(colors.filter(x => x !== ch.c));
            B = objs.map(o => o === ch ? Object.assign({}, o, { c: nc }) : o);
            const others = this.shuffle(objs.filter(o => o !== ch).map(o => o.t).filter((t, j, A) => A.indexOf(t) === j));
            const opts = this.shuffle([ch.t, ...others.slice(0, 3)]); q = 'ما الذي تغيّر لونه؟'; c = opts.map(t => S[t]); a = opts.indexOf(ch.t);
          } else { const o = this.pick(cl); const opts = this.shuffle([o.c, ...this.shuffle(colors.filter(x => x !== o.c)).slice(0, 3)]); q = 'ما لون ' + S[o.t] + ' في الصورة؟'; c = opts.map(x => SC[x]); a = opts.indexOf(o.c); }
        }
      }
      return { kind: 'mcq', obs: kind, A: objs, B, show: 7, q, c, a, d: 2, cat: 'memory' };
    }

    nextItem() {
      const s = this.s, seg = s.seg; if (!seg) return;
      if (seg.g === 'opening') return this.openingNext();
      if (seg.g === 'crown') return this.crownNext();
      if (seg.g === 'council') return this.councilNext();
      s.timer = null;
      seg.idx++;
      if (seg.idx >= seg.items.length) return this.finishSeg();
      const it = this.item(); s.seq++;
      Object.assign(it, { qid: s.seq, answers: {}, buzz: null, locked: [], late: [], result: null, revealed: false, bo: 0 });
      it.eligible = it.pair ? it.pair.slice() : s.teams.map(t => t.id);
      seg.phase = it.wagerQ ? 'wager' : 'ready';
      if (it.wagerQ) this.startTimer(30, 'الرهان');
      this.touch(it.treasure ? 'treasure-in' : 'item');
    }
    // فتح السؤال
    openItem() {
      const s = this.s, seg = s.seg, it = this.item(); if (!it || !['ready', 'show'].includes(seg.phase)) return;
      const def = this.gameDef(seg.g) || {};
      if (it.obs && seg.phase === 'ready') { seg.phase = 'show'; it.view = 'A'; this.startTimer(it.show, 'تذكّر'); this.touch('show'); return; }
      seg.phase = 'open'; it.openedAt = this.now(); it.bo = (it.bo || 0) + 1;
      if (seg.mode === 'all') { it.denom = {}; s.teams.forEach(t => { it.denom[t.id] = Math.max(1, this.teamMembers(t.id, true).length); }); }
      if (it.kind === 'vault') this.vaultDist(it);
      this.startTimer(def.time || 15, seg.mode === 'buzz' ? 'الاستباق' : 'الوقت');
      this.touch('open');
    }
    afterShow() { const seg = this.s.seg, it = this.item(); if (!it || seg.phase !== 'show') return; it.view = it.B ? 'B' : null; this.openItem(); }
    skipItem() { const seg = this.s.seg; if (!seg || seg.idx < 0) return; this.s.timer = null; this.nextItem(); }

    // ---------- الاستباق ----------
    canBuzz(sid) {
      const s = this.s, seg = s.seg, it = this.item(), st = s.students[sid];
      return !!(seg && it && st && seg.mode === 'buzz' && seg.phase === 'open' && !it.buzz && !it.wagerQ && it.eligible.includes(st.team) && !it.locked.includes(st.team));
    }
    // المرجع: ترتيب وصول الضغطات إلى حاسوب المشرف عبر خادم البث (لا يُستخدم وقت الجوال)
    buzz(sid, qid) {
      const s = this.s, it = this.item(), st = s.students[sid];
      if (!it || it.qid !== qid || !st) return { ok: false, why: 'stale' };
      st.st.lastAct = s.seq;
      if (!this.canBuzz(sid)) {
        if (it.buzz && it.buzz.sid !== sid && it.late.length < 5 && !it.late.find(l => l.sid === sid)) { it.late.push({ sid, dt: this.now() - it.buzz.at }); this.touch(); }
        return { ok: false, why: 'closed' };
      }
      it.buzz = { sid, team: st.team, at: this.now(), name: st.name }; st.st.bz++;
      s.seg.phase = 'answering'; this.startTimer(s.settings.answerTime || 10, 'وقت الإجابة');
      this.touch('buzz', { team: st.team, name: st.name });
      return { ok: true };
    }
    manualBuzz(tid) {
      const s = this.s, seg = s.seg, it = this.item();
      if (!it || !seg || seg.mode !== 'buzz' || it.wagerQ || !['open', 'ready', 'paused'].includes(seg.phase) || it.buzz || it.locked.includes(tid) || !it.eligible.includes(tid)) return false;
      if (seg.phase !== 'open') { it.openedAt = this.now(); }
      it.buzz = { sid: null, team: tid, at: this.now(), name: '' }; seg.phase = 'answering';
      this.startTimer(s.settings.answerTime || 10, 'وقت الإجابة'); this.touch('buzz', { team: tid, name: '' }); return true;
    }
    itemPoints(it) { return (BASE_BY_D[it.d] || 20) * (this.s.seg.mult || 1); }
    judge(correct) {
      const s = this.s, seg = s.seg, it = this.item(); if (!it || !it.buzz || seg.phase !== 'answering') return;
      const tid = it.buzz.team, st = it.buzz.sid ? s.students[it.buzz.sid] : null;
      const tx = this.beginTx(correct ? 'إجابة صحيحة' : 'إجابة خاطئة'); this.coh(tid, correct);
      if (correct) {
        if (it.treasure) { const g = s.settings.treasureGold || 40; this.giveGold(tid, g, 'سفينة الكنز' + (st ? ' — ' + st.name : ''), tx); it.gold = g; }
        else this.award(tid, this.itemPoints(it), this.segName(seg.g) + ': إجابة صحيحة' + (st ? ' — ' + st.name : ''), tx, { q: true });
        if (st) { st.st.ok++; st.st.win++; }
        it.result = { team: tid, ok: true, pts: it.treasure ? 0 : this.itemPoints(it), gold: it.treasure ? it.gold : this.itemPoints(it) };
        it.revealed = true; seg.phase = 'reveal'; s.timer = null;
        this.afterScore(); this.touch(it.treasure ? 'treasure' : 'correct', { team: tid });
      } else {
        const pen = s.settings.buzzPenalty || 0; if (pen && !it.treasure) this.award(tid, -pen, this.segName(seg.g) + ': إجابة خاطئة', tx);
        it.locked.push(tid); it.buzz = null;
        const left = it.eligible.filter(t => !it.locked.includes(t));
        if (!left.length) { it.result = { team: null, ok: false }; it.revealed = true; seg.phase = 'reveal'; s.timer = null; this.afterScore(); this.touch('wrong', { team: tid, final: true }); }
        else { seg.phase = 'paused'; s.timer = null; this.afterScore(); this.touch('wrong', { team: tid }); }
      }
    }
    reopen() { const seg = this.s.seg, it = this.item(); if (!it || seg.phase !== 'paused') return; seg.phase = 'open'; it.bo++; this.startTimer(10, 'الاستباق للفريق الآخر'); this.touch('open'); }
    revealItem(timeout) {
      const s = this.s, seg = s.seg, it = this.item(); if (!it) return;
      if (seg.mode === 'all' && seg.phase === 'open') return this.lockAll();
      if (it.wagerQ && seg.phase === 'open') return this.judgeWager();
      it.revealed = true; seg.phase = 'reveal'; s.timer = null; this.touch(timeout ? 'timeup' : 'reveal');
    }

    // ---------- الإجابة الفردية من الجوالات ----------
    answer(sid, qid, v) {
      const s = this.s, seg = s.seg, it = this.item(), st = s.students[sid];
      if (!it || !st || it.qid !== qid || seg.mode !== 'all' || seg.phase !== 'open' || it.answers[sid] !== undefined) return false;
      if (!(Number.isInteger(v) && v >= 0 && v < it.c.length)) return false;
      it.answers[sid] = { v, t: this.now() - (it.openedAt || this.now()) };
      st.st.ans++; st.st.lastAct = s.seq; this.touch(); return true;
    }
    answerCounts() { const it = this.item(), byTeam = {}; if (!it || !it.answers) return { n: 0, byTeam }; Object.keys(it.answers).forEach(sid => { const st = this.s.students[sid]; if (st) byTeam[st.team] = (byTeam[st.team] || 0) + 1; }); return { n: Object.keys(it.answers).length, byTeam }; }
    lockAll() {
      const s = this.s, seg = s.seg, it = this.item(); if (!it || seg.phase !== 'open' || seg.mode !== 'all') return;
      s.timer = null; seg.phase = 'reveal'; it.revealed = true;
      const base = ((this.gameDef(seg.g) || {}).base || 20) * (seg.mult || 1);
      const tx = this.beginTx(this.segName(seg.g)); const res = {};
      s.teams.forEach(t => { res[t.id] = { ok: 0, n: 0, pts: 0 }; });
      const per = Object.entries(it.answers).map(([sid, a]) => ({ sid, st: s.students[sid], a })).filter(x => x.st);
      per.forEach(x => { const ok = x.a.v === it.a; res[x.st.team].n++; if (ok) { res[x.st.team].ok++; if (!it.trial) x.st.st.ok++; } x.ok = ok; if (!it.trial) this.coh(x.st.team, ok); });
      if (!it.trial) s.teams.forEach(t => { const r = res[t.id], denom = (it.denom && it.denom[t.id]) || 1; if (r.ok) r.pts = this.award(t.id, Math.round(base * Math.min(1, r.ok / denom)), this.segName(seg.g) + ': ' + r.ok + ' إجابة صحيحة', tx, { q: true }); });
      const fastest = per.filter(x => x.ok).sort((a, b) => a.a.t - b.a.t)[0]; if (fastest) it.fastest = fastest.sid;
      it.result = res; it.dist = it.c.map((_, i) => per.filter(x => x.a.v === i).length);
      this.afterScore(); this.touch('reveal');
    }
    // للطوارئ: المشرف يحدد الفرق التي أجابت صحيحًا شفهيًا
    teamMark(tids) {
      const s = this.s, seg = s.seg, it = this.item(); if (!it || !['open', 'ready', 'paused'].includes(seg.phase)) return;
      const tx = this.beginTx('اعتماد يدوي'); const pts = this.itemPoints(it); const res = {};
      (tids || []).forEach(t => { res[t] = { pts: this.award(t, pts, this.segName(seg.g) + ': اعتماد المشرف', tx) }; });
      it.result = res; it.revealed = true; seg.phase = 'reveal'; s.timer = null; this.afterScore(); this.touch('reveal');
    }

    // ---------- الحسم: سؤال الرهان (القائد يراهن ويجيب من جواله) ----------
    maxWager(tid) { const sc = this.scores()[tid] || 0; return Math.max(0, Math.floor(sc * 0.25)); }
    setWager(tid, v, sid) { const it = this.item(), seg = this.s.seg; if (!it || !it.wagerQ || seg.phase !== 'wager') return false; if (sid != null && this.s.captain[tid] !== sid) return false; it.wagers[tid] = Math.max(0, Math.min(this.maxWager(tid), Math.round(+v || 0))); this.touch(); return true; }
    lockWagers() { const s = this.s, it = this.item(); if (!it || !it.wagerQ || s.seg.phase !== 'wager') return; s.teams.forEach(t => { if (it.wagers[t.id] == null) it.wagers[t.id] = 0; }); s.seg.phase = 'open'; it.openedAt = this.now(); it.bo = 1; this.startTimer(25, 'القادة يجيبون'); this.touch('open'); }
    wagerPick(tid, v, sid) { const it = this.item(), seg = this.s.seg; if (!it || !it.wagerQ || seg.phase !== 'open' || it.picks[tid] !== undefined) return false; if (sid != null && this.s.captain[tid] !== sid) return false; if (!(Number.isInteger(v) && v >= 0 && v < it.c.length)) return false; it.picks[tid] = v; this.touch(); return true; }
    judgeWager() {
      const s = this.s, it = this.item(); if (!it || !it.wagerQ || s.seg.phase !== 'open') return;
      const tx = this.beginTx('سؤال الرهان'); const res = {};
      s.teams.forEach(t => { const w = it.wagers[t.id] || 0, ok = it.picks[t.id] === it.a; res[t.id] = { ok, w, pick: it.picks[t.id], pts: w ? this.award(t.id, ok ? w : -w, 'سؤال الرهان: ' + (ok ? 'صحيح' : 'خطأ'), tx) : 0 }; });
      it.result = res; it.revealed = true; s.seg.phase = 'reveal'; s.timer = null; this.afterScore(); this.touch('reveal');
    }

    // ---------- فك الشفرة ----------
    vaultDist(it) { const d = {}; this.s.teams.forEach(t => { let m = this.teamMembers(t.id, true); if (!m.length) m = this.teamMembers(t.id); m = this.shuffle(m); if (!m.length) return; it.clues.forEach((c, i) => { const sid = m[i % m.length].sid; (d[sid] = d[sid] || []).push(i); }); }); it.cdist = d; }
    vaultTry(sid, qid, code) {
      const s = this.s, seg = s.seg, it = this.item(), st = s.students[sid];
      if (!it || it.kind !== 'vault' || it.qid !== qid || seg.phase !== 'open' || !st) return { ok: false };
      const t = st.team; if (it.cracked[t]) return { ok: false }; const now = this.now();
      if (it.lock[t] && now < it.lock[t]) return { ok: false, why: 'locked' };
      code = String(code || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '').slice(0, 8); if (!code) return { ok: false };
      it.tries[t] = (it.tries[t] || 0) + 1; st.st.lastAct = s.seq; st.st.ans++;
      if (code === it.a) return this.crack(t, sid);
      this.coh(t, false); it.lock[t] = now + 8000; this.touch('deny', { team: t }); return { ok: false, why: 'wrong' };
    }
    crack(t, sid) {
      const s = this.s, it = this.item(); if (!it || it.kind !== 'vault' || it.cracked[t] || s.seg.phase !== 'open') return { ok: false };
      const ord = ++it.order; const pts = VAULT_PTS[ord - 1] || 5; const tx = this.beginTx('فك الشفرة');
      it.cracked[t] = { ord, by: sid || null, at: this.now() - (it.openedAt || this.now()) }; this.coh(t, true); this.award(t, pts, 'فك الشفرة: المركز ' + ord, tx, { q: true });
      if (sid && s.students[sid]) { s.students[sid].st.ok++; s.students[sid].st.win++; }
      this.afterScore(); this.touch('crack', { team: t, ord });
      if (!s.teams.some(x => !it.cracked[x.id] && this.teamMembers(x.id).length)) this.revealItem();
      return { ok: true };
    }

    // ---------- مجلس القرية: البناء والدفاع والهجوم ----------
    // درع التماسك: من أجاب أغلب أعضائه إجابات صحيحة في الجولة
    closeCohesion() { const s = this.s, W = this.D.WAR; s.cohRes = {}; s.teams.forEach(t => { const c = s.coh[t.id]; s.cohRes[t.id] = !!(c && c.n >= 2 && c.ok / c.n >= W.cohesion); }); }
    councilNext() {
      const s = this.s, seg = s.seg;
      if (seg.phase === 'intro') return this.startCouncil();
      if (seg.phase === 'council') return this.resolveCouncil();
      if (seg.phase === 'battle') return this.finishSeg();
    }
    startCouncil() {
      const s = this.s, seg = s.seg, W = this.D.WAR; if (seg.phase !== 'intro') return;
      const tx = this.beginTx('مجلس القرية'), rk = this.ranking();
      seg.gains = {};
      s.teams.forEach(t => {
        const v = this.vil(t.id), gn = seg.gains[t.id] = {};
        const fl = v.b.farm; if (fl && !v.off.farm) { const g = this.D.BUILD.farm.inc[fl - 1]; this.giveGold(t.id, g, 'دخل المزرعة', tx); gn.farm = g; }
        v.off = {}; v.shield = !!s.cohRes[t.id]; if (v.shield) { gn.shield = 1; this.news(t.name + ' تنال درع التماسك'); }
      });
      // عون الجيران: للفريق الأخير وحده إن كان متأخرًا فعلًا
      const last = rk[rk.length - 1], prev = rk[rk.length - 2];
      if (last && prev && last.score < prev.score) { this.giveGold(last.id, W.aid, 'عون الجيران', tx); seg.gains[last.id].aid = W.aid; this.news('عون الجيران يصل إلى ' + this.team(last.id).name); }
      seg.phase = 'council'; this.startTimer(W.councilSec, 'مجلس القرية'); this.touch('council');
    }
    attacksOn(to, except) { const seg = this.s.seg; return seg && seg.orders ? Object.entries(seg.orders).filter(([f, o]) => o.to === to && f !== except).length : 0; }
    // أمر هجوم واحد لكل فريق في المجلس؛ يُحجز ذهبه فورًا ويُعاد إن أُلغي
    order(tid, o, sid) {
      const s = this.s, seg = s.seg, W = this.D.WAR, A = this.D.ATTACKS;
      if (!seg || seg.g !== 'council' || seg.phase !== 'council' || !this.team(tid)) return { ok: false, why: 'closed' };
      if (sid != null && s.captain[tid] !== sid) return { ok: false, why: 'not-captain' };
      const type = String(o.type), to = String(o.to), units = Math.round(+o.units || 0);
      if (!A[type] || !this.team(to) || to === tid || units < 1 || units > W.maxUnits) return { ok: false, why: 'bad' };
      if (this.attacksOn(to, tid) >= W.maxPerTarget) return { ok: false, why: 'full' };
      const v = this.vil(tid), old = seg.orders[tid], refund = old ? old.units * W.unitCost : 0, cost = units * W.unitCost;
      if (v.gold + refund < cost) return { ok: false, why: 'gold' };
      v.gold += refund - cost; seg.orders[tid] = { type, to, units, at: this.now() };
      if (!old) this.news('أمر سري جديد في مجلس ' + this.team(tid).name);
      this.touch('order', { team: tid }); return { ok: true };
    }
    cancelOrder(tid, sid) {
      const s = this.s, seg = s.seg; if (!seg || seg.g !== 'council' || seg.phase !== 'council') return false;
      if (sid != null && s.captain[tid] !== sid) return false; const o = seg.orders[tid]; if (!o) return false;
      this.vil(tid).gold += o.units * this.D.WAR.unitCost; delete seg.orders[tid]; this.touch(); return true;
    }
    resolveCouncil() {
      const s = this.s, seg = s.seg, W = this.D.WAR, A = this.D.ATTACKS, B = this.D.BUILD;
      if (!seg || seg.g !== 'council' || seg.phase !== 'council') return;
      s.timer = null; const tx = this.beginTx('المعركة'), res = [];
      s.teams.map(t => t.id).filter(f => seg.orders[f]).forEach(f => {
        const o = seg.orders[f], tv = this.vil(o.to), av = this.vil(f), lvl = tv.b[A[o.type].def];
        const block = this.D.BLOCK[lvl] + (tv.shield ? 1 : 0), hits = Math.max(0, o.units - block), from = this.team(f).name, toN = this.team(o.to).name;
        const r = { from: f, to: o.to, type: o.type, units: o.units, block, lvl, shield: tv.shield ? 1 : 0, hits };
        s.ledger.push({ tx, t: this.now(), team: f, d: 0, g: -o.units * W.unitCost, why: 'تجهيز ' + A[o.type].name + ' (' + o.units + ')' });
        if (o.type === 'raid' && hits) { const g = Math.min(hits * W.steal, tv.gold); tv.gold -= g; av.gold += g; r.gold = g; s.ledger.push({ tx, t: this.now(), team: o.to, d: 0, g: -g, why: 'غارة من ' + from }); s.ledger.push({ tx, t: this.now(), team: f, d: 0, g, why: 'غنيمة الغارة على ' + toN }); av.stats.dmg += g; }
        if (o.type === 'catapult' && hits) { const p = Math.min(hits * W.pts, Math.max(0, this.scores()[o.to] || 0)); if (p) this.award(o.to, -p, 'منجنيق ' + from, tx, { noGold: true }); r.pts = p; av.stats.dmg += p; }
        if (o.type === 'fire' && hits) {
          const g = Math.min(hits * W.burn, tv.gold); if (g) { tv.gold -= g; s.ledger.push({ tx, t: this.now(), team: o.to, d: 0, g: -g, why: 'حريق من ' + from }); } r.gold = g;
          const built = ['farm', 'market', 'house'].filter(k => tv.b[k] && !tv.off[k]).sort((a, b) => tv.b[b] - tv.b[a]);
          r.off = built.slice(0, hits >= 4 ? 2 : 1); r.off.forEach(k => { tv.off[k] = true; }); av.stats.dmg += g + r.off.length * 10;
        }
        tv.stats.blk += Math.min(o.units, block);
        if (!hits) { this.award(o.to, W.held, 'صمود أمام ' + A[o.type].name, tx, { noGold: true }); r.held = W.held; tv.stats.held++; }
        else av.stats.hit++;
        res.push(r);
        this.news(hits ? from + ' تصيب ' + toN + ' بـ' + A[o.type].name : toN + ' تصدّ ' + A[o.type].name + ' ' + from);
      });
      s.teams.forEach(t => { this.vil(t.id).shield = false; });
      seg.results = res; seg.phase = 'battle'; s.battles.push({ n: seg.n, res });
      this.afterScore(); this.touch('battle', { n: res.length });
    }

    // ---------- نهاية الجولة والافتتاح والتتويج ----------
    finishSeg() { const seg = this.s.seg; this.s.timer = null; seg.phase = 'done'; seg.idx = seg.items.length; this.touch('segdone'); }
    openingNext() {
      const s = this.s, seg = s.seg;
      // سؤال تجريبي بلا نقاط: يتأكد كل طالب أن جواله يعمل
      if (seg.phase === 'open') return this.lockAll();
      if (seg.phase === 'reveal') { seg.phase = 'done'; seg.mode = 'special'; s.timer = null; this.fillThemes(); return this.touch('seg'); }
      const order = ['welcome', 'explain', 'trial', 'done'];
      const i = order.indexOf(seg.phase); seg.phase = order[Math.min(order.length - 1, i + 1)];
      if (seg.phase === 'trial') {
        const b = this.draw('mcq', 1, { d: [1] })[0];
        if (b) { const it = Object.assign(this.mcqItem(b), { trial: true, qid: ++s.seq, answers: {}, buzz: null, locked: [], late: [], result: null, revealed: false, bo: 1, openedAt: this.now() }); it.eligible = s.teams.map(t => t.id); it.denom = {}; s.teams.forEach(t => { it.denom[t.id] = Math.max(1, this.teamMembers(t.id, true).length); }); seg.items = [it]; seg.idx = 0; seg.mode = 'all'; seg.phase = 'open'; this.startTimer(25, 'سؤال تجريبي'); return this.touch('open'); }
        seg.phase = 'done';
      }
      if (seg.phase === 'done') { s.timer = null; this.fillThemes(); }
      this.touch('seg');
    }
    crownNext() {
      const s = this.s, seg = s.seg, n = s.teams.length;
      if (seg.phase === 'island') { seg.phase = 'highlights'; seg.hl = this.highlights(); this.touch('seg'); return; }
      if (seg.phase === 'highlights') { seg.phase = 'reveal'; seg.revealed = 0; }
      if (seg.phase === 'reveal') {
        if (seg.revealed < n - 1) { seg.revealed++; this.touch('rank'); return; }
        seg.revealed = n; seg.phase = 'winner'; s.ended = true; this.touch('crown'); this.archiveSummary(); return;
      }
    }
    highlights() {
      const s = this.s, T = s.teams, out = [];
      const best = (f, min = 1) => { const L = T.map(t => ({ t: t.id, v: f(t.id) })).sort((a, b) => b.v - a.v); return L[0] && L[0].v >= min && (!L[1] || L[0].v > L[1].v) ? L[0] : null; };
      let x;
      if ((x = best(id => this.vil(id).stats.blk))) out.push({ k: 'wall', team: x.t, v: x.v });
      if ((x = best(id => this.vil(id).stats.dmg))) { const cap = s.students[s.captain[x.t]]; out.push({ k: 'cunning', team: x.t, v: x.v, name: cap ? cap.name : '' }); }
      if ((x = best(id => { const c = s.cohAll[id]; return c && c.n >= 3 ? Math.round(100 * c.ok / c.n) : 0; }))) out.push({ k: 'unity', team: x.t, v: x.v });
      if ((x = best(id => this.buildScore(id)))) out.push({ k: 'build', team: x.t, v: x.v });
      const L = Object.values(s.students).sort((a, b) => (b.st.ok - a.st.ok) || (b.st.win - a.st.win));
      if (L[0] && L[0].st.ok) out.push({ k: 'star', team: L[0].team, name: L[0].name, v: L[0].st.ok });
      return out;
    }
    startTiebreak() {
      const tied = this.tieInfo(); if (!tied) return;
      const s = this.s; s.returnTo = s.planIdx;
      const items = this.draw('mcq', 3, { d: [2, 3] }).map(b => Object.assign(this.mcqItem(b), { pair: tied }));
      s.seg = { g: 'tiebreak', phase: 'intro', idx: -1, items, mode: 'buzz', mult: 1 };
      this.touch('seg', { g: 'tiebreak' });
    }
    archiveSummary() {
      const s = this.s, rk = this.ranking();
      this.lastSummary = { code: s.code, title: s.title, at: this.now(), teams: rk.map(r => ({ name: this.team(r.id).name, color: this.team(r.id).color, score: r.score, rank: r.rank, built: this.buildScore(r.id) })), players: Object.keys(s.students).length };
      return this.lastSummary;
    }

    // رسائل خاصة لكل جوال (تُشفَّر في طبقة الاتصال): تلميحات الخزنة
    privData() {
      const s = this.s, seg = s.seg, it = this.item(), out = {};
      Object.values(s.students).forEach(st => {
        if (st.sid.startsWith('bot-')) return; const o = {};
        if (it && it.kind === 'vault' && it.cdist && seg.phase === 'open' && it.cdist[st.sid]) o.k = it.cdist[st.sid].map(i => it.clues[i]);
        if (seg && seg.g === 'council' && seg.orders && seg.orders[st.team]) { const r = seg.orders[st.team]; o.ord = [r.type, r.to, r.units]; }
        out[st.sid] = o;
      });
      return out;
    }

    // ---------- الحالة العامة (لا تحتوي الإجابة قبل كشفها) ----------
    pub() {
      const s = this.s, seg = s.seg, it = this.item(), sc = this.scores();
      const P = {
        v: s.v, code: s.code, title: s.title, fx: s.fx, fxl: s.settings.fx, ended: s.ended,
        // [id, name, color, score, gold, theme, levels[6], captainSid, captainName]
        T: s.teams.map(t => { const v = this.vil(t.id), cap = s.students[s.captain[t.id]]; return [t.id, t.name, t.color, sc[t.id], v.gold, v.theme, this.D.BUILD_KEYS.map(k => v.b[k]), cap ? cap.sid : null, cap ? cap.name : '', { sh: v.shield ? 1 : 0, off: Object.keys(v.off || {}) }]; }),
        hide: s.settings.hideScores ? 1 : 0, NW: s.news.slice(-4).map(n => n.x), nwn: s.news.length,
        el: s.clock.startedAt ? (this.now() - s.clock.startedAt) / 60000 : 0, tot: s.plan.reduce((a, p) => a + p.min, 0),
        BL: s.buildLog.length, B: s.buildLog.slice(-6).map((b, i, A) => [s.buildLog.length - A.length + i, b.team, b.key, b.lv]),
        tm: s.timer ? { r: this.remaining(), d: s.timer.dur, p: s.timer.paused != null ? 1 : 0, l: s.timer.label } : null
      };
      if (!seg) { P.g = null; return P; }
      P.g = seg.g; P.gn = this.segName(seg.g); P.ph = seg.phase; P.mode = seg.mode; P.mult = seg.mult; P.ii = seg.idx; P.in = seg.items.length;
      const def = this.gameDef(seg.g); if (def) { P.gi = def.icon; if (seg.phase === 'intro') P.how = def.how; }
      if (seg.g === 'tiebreak' && seg.phase === 'intro') P.how = ['الفرق المتعادلة فقط.', 'أول إجابة صحيحة تحسم.'];
      if (seg.g === 'council') { P.cn = seg.n; if (seg.phase === 'intro') P.how = this.D.COUNCIL_HOW; P.CO = { cnt: Object.fromEntries(s.teams.map(t => [t.id, this.attacksOn(t.id)])), done: Object.keys(seg.orders || {}) }; if (seg.gains) P.GN = seg.gains; if (seg.results) P.BR = seg.results; }
      if (seg.g === 'crown') { P.BX = s.buildLog.map(b => [b.team, b.key, b.lv]); P.rev = seg.revealed; P.rk = this.ranking().map(r => [r.id, r.score, r.rank]); if (seg.hl) P.hl = seg.hl; P.tie = this.tieInfo(); }
      if (it && seg.phase !== 'done') {
        const I = { k: it.kind, q: it.q, qid: it.qid, bo: it.bo || 0, d: it.d, el: it.eligible, lk: it.locked, rv: it.revealed ? 1 : 0 };
        if (it.c) I.c = it.c;
        if (it.pair) I.pair = it.pair;
        if (it.treasure) { I.tr = 1; I.tg = s.settings.treasureGold || 40; }
        if (it.obs) { I.obs = it.obs; if (seg.phase === 'show') I.scene = it.A; else if (seg.phase === 'open' && it.view === 'B') I.scene = it.B; if (it.revealed) { I.sA = it.A; if (it.B) I.sB = it.B; } }
        if (it.buzz) I.bz = [it.buzz.team, it.buzz.name];
        if (it.late && it.late.length) I.late = it.late.map(l => [s.students[l.sid] ? s.students[l.sid].name : '', l.dt]);
        if (it.kind === 'vault') { const now = this.now(); I.vt = { cr: Object.fromEntries(Object.entries(it.cracked).map(([t, c]) => [t, [c.ord, (s.students[c.by] || {}).name || '', c.at]])), lk: Object.fromEntries(Object.entries(it.lock).filter(([, u]) => u > now).map(([t, u]) => [t, u - now])), tr: it.tries, n: it.clues.length }; delete I.q; }
        if (it.wagerQ) { I.wq = 1; I.wset = Object.keys(it.wagers); I.wpick = Object.keys(it.picks); I.wmax = Object.fromEntries(s.teams.map(t => [t.id, this.maxWager(t.id)])); if (seg.phase === 'wager') { delete I.q; delete I.c; } }
        if (seg.mode === 'all' && seg.phase === 'open') { const ac = this.answerCounts(); I.an = ac.n; I.abt = ac.byTeam; I.ad = Object.keys(it.answers); }
        if (it.revealed) {
          if (it.a !== undefined) I.a = it.a;
          if (it.result) I.res2 = it.result;
          if (it.dist) I.dist = it.dist;
          if (it.fastest && s.students[it.fastest]) I.fast = s.students[it.fastest].name;
          if (it.src) I.src = it.src;
          if (it.wagerQ) { I.wg = it.wagers; I.wp = it.picks; }
        }
        P.I = I;
      }
      return P;
    }
    roster() { return { v: this.s.v, L: Object.values(this.s.students).map(st => [st.sid, st.name, st.team, st.online ? 1 : 0]) }; }
  }

  const API = { Engine, TEAM_COLORS, TEAM_NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.BENA_ENGINE = API;
})(typeof window !== 'undefined' ? window : globalThis);
