/* ===== محرك ميدان بناء =====
   منطق المسابقة كاملًا بلا واجهة: الجولات، الاستباق، النقاط، المشاركة.
   يعمل في متصفح المشرف فقط، وهو المرجع الوحيد للنتائج. */
(function (root) {
  const TEAM_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#A855F7'];
  const TEAM_NAMES = ['الوفاء', 'النماء', 'الإخاء', 'العطاء'];
  const BASE_BY_D = { 1: 10, 2: 20, 3: 30 };
  const WHO_PTS = [40, 30, 20, 10];
  const LIVE_PTS = [20, 15, 10, 5];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function median(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

  class Engine {
    constructor(DATA, opts = {}) {
      this.D = DATA;
      this.rng = opts.rng || Math.random;
      this.now = opts.now || (() => Date.now());
      this.onChange = () => {};
      this.s = opts.state ? opts.state : this.freshState(opts);
      this.buildBank(opts.custom || [], opts.disabled || []);
    }

    // ---------- الحالة ----------
    freshState(opts = {}) {
      const n = opts.teamCount || 4;
      const teams = [];
      for (let i = 0; i < n; i++) teams.push({ id: 't' + (i + 1), name: TEAM_NAMES[i] || ('فريق ' + (i + 1)), color: TEAM_COLORS[i] || '#888' });
      const s = {
        ver: 1, v: 0, code: opts.code || this.makeCode(), title: 'ميدان بناء', createdAt: this.now(),
        settings: { allowTeamChoice: true, buzzPenalty: 0, answerTime: 10, fx: 'high', autoSecret: false, minutes: 60, village: true, treasureGold: 40 },
        teams, students: {}, banned: {}, ledger: [], txSeq: 0,
        cards: {}, armed: {}, frozen: {}, streak: {}, missions: {}, village: {}, captain: {}, honors: {}, buildLog: [],
        plan: clone(this.D.DEFAULT_PLAN), planIdx: -1, clock: { startedAt: null, segStart: null },
        seg: null, seq: 0, used: {}, timer: null, fx: { n: 0, k: null }, undo: [], leader: null, ended: false
      };
      teams.forEach(t => this.initTeam(s, t.id));
      return s;
    }
    initTeam(s, id) { s.cards[id] = { double: 1, shield: 1, freeze: 1 }; s.armed[id] = { double: false, shield: false }; s.streak[id] = 0; if (!s.village) s.village = {}; if (!s.village[id]) s.village[id] = this.newVillage(); }
    newVillage() { const b = {}; this.D.BUILD_KEYS.forEach(k => { b[k] = 0; }); return { gold: 0, earned: 0, b, theme: null }; }
    makeCode() { let c = ''; for (let i = 0; i < 4; i++) c += Math.floor(this.rng() * 10); return c === '0000' ? '1357' : c; }
    touch(fxKind, fxData) { this.s.v++; if (fxKind) this.s.fx = { n: this.s.fx.n + 1, k: fxKind, d: fxData || null }; this.onChange(this.s); }
    pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }
    shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    team(id) { return this.s.teams.find(t => t.id === id); }

    // ---------- بنك الأسئلة ----------
    buildBank(custom, disabled) {
      const D = this.D, B = [];
      D.MCQ.forEach((m, i) => B.push({ id: 'm' + i, kind: 'mcq', cat: m[0], d: m[1], q: m[2], c: m[3], src: m[4] || '' }));
      D.TF.forEach((m, i) => B.push({ id: 'f' + i, kind: 'tf', cat: 'general', d: 1, q: m[0], a: m[1] }));
      D.ORDER.forEach((m, i) => B.push({ id: 'o' + i, kind: 'order', cat: m[0], d: m[1], q: m[2], c: m[3] }));
      D.WHOAMI.forEach((m, i) => B.push({ id: 'w' + i, kind: 'whoami', cat: m[0], d: 2, q: 'من أنا؟', a: m[1], clues: m[2] }));
      D.CIPHER.forEach((m, i) => B.push({ id: 'c' + i, kind: 'open', cat: 'logic', d: m[3], q: m[0], a: m[1], hint: m[2] }));
      D.ESTIMATE.forEach((m, i) => B.push({ id: 'e' + i, kind: 'number', cat: 'general', d: 2, q: m[0], a: m[1], unit: m[2] }));
      D.CONSENSUS.forEach((m, i) => B.push({ id: 'n' + i, kind: 'consensus', cat: 'fun', d: 1, q: m[0], c: m[1] }));
      D.TABOO.forEach((m, i) => B.push({ id: 'b' + i, kind: 'taboo', cat: 'arabic', d: 1, q: m[0], c: m[1] }));
      D.LIVE.forEach((m, i) => B.push({ id: 'l' + i, kind: 'live', cat: 'fun', d: 1, q: m[0], a: m[1], time: m[2] }));
      (D.VAULT || []).forEach((m, i) => B.push({ id: 'v' + i, kind: 'vault', cat: 'logic', d: 2, q: 'رمز الخزنة', a: m[0], clues: m[1] }));
      (custom || []).forEach(c => B.push(Object.assign({ custom: true }, c)));
      const dis = new Set(disabled || []);
      this.bank = B.filter(b => !dis.has(b.id));
      this.allBank = B;
    }
    draw(kind, n, filter = {}) {
      let pool = this.bank.filter(b => b.kind === kind && (!filter.d || filter.d.includes(b.d)) && (!filter.cats || !filter.cats.length || filter.cats.includes(b.cat)));
      if (!pool.length) pool = this.bank.filter(b => b.kind === kind);
      const fresh = pool.filter(b => !this.s.used[b.id]);
      const src = fresh.length >= n ? fresh : pool;
      const out = this.shuffle(src).slice(0, n);
      out.forEach(b => { this.s.used[b.id] = 1; });
      return out;
    }

    // ---------- الطلاب ----------
    teamMembers(tid, onlineOnly) { return Object.values(this.s.students).filter(st => st.team === tid && (!onlineOnly || st.online)); }
    upsertStudent({ sid, name, want, peer, by }) {
      if (!sid || this.s.banned[sid]) return null;
      name = String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) || 'مشارك';
      let st = this.s.students[sid];
      if (!st) {
        // عودة طالب أغلق صفحته: يستعيد سجله إن كان اسمه مطابقًا وسجله القديم غير متصل
        const old = Object.values(this.s.students).find(x => x.name === name && !x.online && (!x.by || !by || x.by === by));
        if (old) { delete this.s.students[old.sid]; old.sid = sid; old.online = true; old.peer = peer; old.by = old.by || by || null; this.s.students[sid] = old; this.touch('join', { name: old.name, team: old.team }); return old; }
        const taken = new Set(Object.values(this.s.students).map(x => x.name));
        let nm = name, k = 2; while (taken.has(nm)) nm = name + ' ' + (k++);
        let team = (this.s.settings.allowTeamChoice && this.team(want)) ? want : this.smallestTeam();
        st = { sid, name: nm, team, online: true, peer, by: by || null, joinedAt: this.now(), st: { bz: 0, win: 0, ok: 0, ans: 0, pick: 0, lastPick: 0, lastAct: 0 } };
        this.s.students[sid] = st;
        this.touch('join', { name: nm, team });
        return st;
      }
      let changed = false;
      if (!st.online || st.peer !== peer) { st.online = true; st.peer = peer; changed = true; }
      if (changed) this.touch();
      return st;
    }
    smallestTeam() { let best = null, bc = 1e9; for (const t of this.s.teams) { const c = this.teamMembers(t.id).length; if (c < bc) { bc = c; best = t.id; } } return best; }
    setOffline(sid) { const st = this.s.students[sid]; if (st && st.online) { st.online = false; this.touch(); } }
    moveStudent(sid, tid) { const st = this.s.students[sid]; if (st && this.team(tid)) { st.team = tid; this.touch(); } }
    renameStudent(sid, nm) { const st = this.s.students[sid]; if (st && nm) { st.name = String(nm).slice(0, 24); this.touch(); } }
    removeStudent(sid, ban) { delete this.s.students[sid]; if (ban) this.s.banned[sid] = 1; this.touch(); }
    autoBalance() {
      const list = this.shuffle(Object.values(this.s.students));
      list.forEach((st, i) => { st.team = this.s.teams[i % this.s.teams.length].id; });
      this.touch();
    }
    suggestRep(tid, exclude = []) {
      const m = this.teamMembers(tid, true).filter(x => !exclude.includes(x.sid));
      const pool = m.length ? m : this.teamMembers(tid).filter(x => !exclude.includes(x.sid));
      if (!pool.length) return null;
      pool.sort((a, b) => (a.st.pick - b.st.pick) || (a.st.lastPick - b.st.lastPick) || (a.st.ans + a.st.bz - b.st.ans - b.st.bz));
      return pool[0].sid;
    }
    participation(tid) {
      const m = this.teamMembers(tid);
      if (!m.length) return { members: 0, online: 0, active: 0, ratio: 0, quiet: [] };
      const window = 5, since = Math.max(0, this.s.seq - window);
      const active = m.filter(x => x.st.lastAct > since);
      const quiet = m.filter(x => x.st.lastAct <= since).map(x => x.sid);
      return { members: m.length, online: m.filter(x => x.online).length, active: active.length, ratio: active.length / m.length, quiet };
    }

    // ---------- الفرق والإعدادات ----------
    setTeams(list) {
      const s = this.s;
      const old = new Set(s.teams.map(t => t.id));
      s.teams = list.map((t, i) => ({ id: t.id || ('t' + (i + 1)), name: String(t.name || TEAM_NAMES[i] || 'فريق').slice(0, 20), color: t.color || TEAM_COLORS[i] }));
      s.teams.forEach(t => { if (!old.has(t.id)) this.initTeam(s, t.id); });
      const ids = new Set(s.teams.map(t => t.id));
      Object.values(s.students).forEach(st => { if (!ids.has(st.team)) st.team = this.smallestTeam(); });
      this.touch();
    }
    setSetting(k, v) { this.s.settings[k] = v; this.touch(); }

    // ---------- النقاط ----------
    scores() { const sc = {}; this.s.teams.forEach(t => { sc[t.id] = 0; }); this.s.ledger.forEach(e => { if (sc[e.team] !== undefined) sc[e.team] += e.d; }); return sc; }
    ranking() {
      const sc = this.scores();
      const arr = this.s.teams.map(t => ({ id: t.id, score: sc[t.id] })).sort((a, b) => b.score - a.score);
      let rank = 0, prev = null;
      arr.forEach((r, i) => { if (r.score !== prev) { rank = i + 1; prev = r.score; } r.rank = rank; });
      return arr;
    }
    leaderId() { const r = this.ranking(); return (r.length > 1 && r[0].score > r[1].score && r[0].score > 0) ? r[0].id : null; }
    snapshot() { const s = this.s; return { len: s.ledger.length, cards: clone(s.cards), armed: clone(s.armed), streak: clone(s.streak), frozen: clone(s.frozen), missions: clone(s.missions), village: clone(s.village || {}), captain: clone(s.captain || {}), buildLog: (s.buildLog || []).length, honors: clone(s.honors || {}), stu: Object.fromEntries(Object.entries(s.students).map(([k, v]) => [k, clone(v.st)])) }; }
    beginTx(label) { this.s.undo.push({ label, snap: this.snapshot() }); if (this.s.undo.length > 40) this.s.undo.shift(); return ++this.s.txSeq; }
    undo() {
      const u = this.s.undo.pop(); if (!u) return null;
      const s = this.s, sn = u.snap;
      s.ledger.length = sn.len; s.cards = sn.cards; s.armed = sn.armed; s.streak = sn.streak; s.frozen = sn.frozen; s.missions = sn.missions; if (sn.village) s.village = sn.village; if (sn.captain) s.captain = sn.captain; if (s.buildLog) s.buildLog.length = Math.min(s.buildLog.length, sn.buildLog || 0); if (sn.honors) s.honors = sn.honors;
      Object.entries(sn.stu).forEach(([k, v]) => { if (s.students[k]) s.students[k].st = v; });
      s.leader = this.leaderId();
      this.touch('undo');
      return u.label;
    }
    // تسجيل نقاط مع تطبيق بطاقات المضاعف والدرع
    award(tid, d, why, tx, opts = {}) {
      if (!this.team(tid) || !d) return 0;
      let note = '';
      const ar = this.s.armed[tid];
      if (!opts.raw && d > 0 && ar && ar.double) { d *= 2; ar.double = false; note = ' (×2 مضاعف)'; }
      if (!opts.raw && d < 0 && ar && ar.shield) { ar.shield = false; this.s.ledger.push({ tx, t: this.now(), team: tid, d: 0, why: why + ' — أوقفه الدرع' }); return 0; }
      this.s.ledger.push({ tx, t: this.now(), team: tid, d, why: why + note });
      if (d > 0 && !opts.noGold && this.s.settings.village !== false) { const v = this.vil(tid); v.gold += d; v.earned += d; }
      return d;
    }
    afterScore() {
      const L = this.leaderId(), prev = this.s.leader;
      this.s.leader = L;
      if (L && L !== prev) this.touch('lead', { team: L }); else this.touch('score');
    }
    manualAdjust(tid, d, why) { const tx = this.beginTx('تعديل يدوي'); this.award(tid, d, why || 'تعديل يدوي من المشرف', tx, { raw: true }); this.afterScore(); }
    useCard(tid, card, target) {
      const c = this.s.cards[tid]; if (!c || !c[card]) return false;
      this.beginTx('بطاقة');
      c[card]--;
      if (card === 'double') this.s.armed[tid].double = true;
      else if (card === 'shield') this.s.armed[tid].shield = true;
      else if (card === 'freeze') { if (!this.team(target) || target === tid) { c[card]++; this.s.undo.pop(); return false; } this.s.frozen[target] = true; }
      this.s.ledger.push({ tx: this.s.txSeq, t: this.now(), team: tid, d: 0, why: 'استخدم بطاقة ' + ({ double: 'المضاعف', shield: 'الدرع', freeze: 'التجميد' })[card] + (card === 'freeze' ? ' على ' + this.team(target).name : '') });
      this.touch('card', { team: tid, card, target });
      return true;
    }
    giveCard(tid, card) { if (this.s.cards[tid]) { this.s.cards[tid][card] = (this.s.cards[tid][card] || 0) + 1; } }

    // ---------- المهام السرية ----------
    assignMissions() {
      const pool = this.shuffle(this.D.MISSIONS);
      this.s.teams.forEach((t, i) => { this.s.missions[t.id] = { text: pool[i % pool.length], done: false }; });
      this.touch('secret');
    }
    missionDone(tid) {
      const m = this.s.missions[tid]; if (!m || m.done) return;
      const tx = this.beginTx('مهمة سرية'); m.done = true;
      this.award(tid, 15, 'إنجاز المهمة السرية', tx); this.afterScore();
    }

    // ---------- المؤقت ----------
    startTimer(sec, label) { this.s.timer = { end: this.now() + sec * 1000, dur: sec * 1000, paused: null, label: label || '' }; }
    pauseTimer() { const t = this.s.timer; if (t && t.paused == null) { t.paused = Math.max(0, t.end - this.now()); this.touch(); } }
    resumeTimer() { const t = this.s.timer; if (t && t.paused != null) { t.end = this.now() + t.paused; t.paused = null; this.touch(); } }
    addTime(sec) { const t = this.s.timer; if (!t) return; if (t.paused != null) t.paused += sec * 1000; else t.end += sec * 1000; t.dur += sec * 1000; this.touch(); }
    clearTimer() { this.s.timer = null; }
    remaining() { const t = this.s.timer; if (!t) return null; return t.paused != null ? t.paused : Math.max(0, t.end - this.now()); }
    // يُستدعى دوريًا من الواجهة
    tick() {
      const t = this.s.timer, seg = this.s.seg;
      if (!t || t.paused != null || t.fired) return;
      if (this.now() >= t.end) {
        t.fired = true;
        if (!seg) return this.touch('timeup');
        const it = this.item();
        if (seg.phase === 'show') return this.memHide();
        if (seg.phase === 'open' && it && this.segMode() === 'all') return this.lockAll();
        if (seg.phase === 'open' && this.segMode() === 'buzz') return this.revealItem(true);
        if (seg.phase === 'open' && it && it.kind === 'taboo') return this.tabooEnd();
        if (seg.phase === 'vote') return this.closeVote();
        if (seg.phase === 'open' && it && it.kind === 'vault') return this.revealItem(true);
        this.touch('timeup');
      }
    }

    // ---------- البرنامج والجولات ----------
    gameDef(g) { return this.D.GAMES[g] || null; }
    segName(g) { if (g === 'opening') return 'الافتتاح'; if (g === 'crown') return 'التتويج'; if (g === 'tiebreak') return 'كسر التعادل'; const d = this.gameDef(g); return d ? d.name : g; }
    segMode() { const seg = this.s.seg; if (!seg) return null; return seg.mode; }
    item() { const seg = this.s.seg; return seg && seg.idx >= 0 ? seg.items[seg.idx] : null; }
    schedule() {
      const s = this.s; let cum = 0; const rows = s.plan.map((p, i) => { const r = { i, g: p.g, name: this.segName(p.g), min: p.min, startAt: cum }; cum += p.min; return r; });
      const elapsed = s.clock.startedAt ? (this.now() - s.clock.startedAt) / 60000 : 0;
      let late = 0;
      if (s.planIdx >= 0 && rows[s.planIdx]) { const plannedEnd = rows[s.planIdx].startAt + rows[s.planIdx].min; late = elapsed - plannedEnd; }
      const segEl = s.clock.segStart ? (this.now() - s.clock.segStart) / 60000 : 0;
      return { rows, total: cum, elapsed, late, segElapsed: segEl };
    }
    setPlan(plan) { this.s.plan = plan.filter(p => p.g === 'opening' || p.g === 'crown' || this.gameDef(p.g)).map(p => ({ g: p.g, min: Math.max(1, Math.min(60, +p.min || 5)), count: p.count ? +p.count : undefined, mode: p.mode || undefined, teams: p.teams })); this.touch(); }
    goSegment(i) {
      const s = this.s, p = s.plan[i]; if (!p) return;
      if (!s.clock.startedAt) s.clock.startedAt = this.now();
      s.clock.segStart = this.now();
      s.planIdx = i; s.timer = null;
      s.seg = this.makeSeg(p);
      if (p.g === 'opening' && s.settings.autoSecret && !Object.keys(s.missions).length) this.assignMissions();
      this.touch('seg', { g: p.g });
    }
    nextSegment() { if (this.s.planIdx + 1 < this.s.plan.length) this.goSegment(this.s.planIdx + 1); }
    makeSeg(p) {
      const g = p.g, def = this.gameDef(g) || {};
      const seg = { g, phase: 'intro', idx: -1, items: [], mode: p.mode || def.mode || 'special', mult: def.mult || 1, vs: null, stepI: 0 };
      const n = p.count || def.count || 4;
      const T = this.s.teams.map(t => t.id);
      switch (def.kind) {
        case 'mcq': seg.items = this.draw('mcq', n, def.filter || {}).map(b => this.mcqItem(b)); break;
        case 'memory': for (let i = 0; i < n; i++) seg.items.push(this.memoryItem(i)); break;
        case 'open': seg.items = this.draw('open', n).map(b => ({ kind: 'open', bid: b.id, q: b.q, a: b.a, hint: b.hint, d: b.d, cat: b.cat })); break;
        case 'whoami': seg.items = this.draw('whoami', n).map(b => ({ kind: 'whoami', bid: b.id, q: 'من أنا؟', a: b.a, clues: b.clues, clue: 0, d: 2, cat: b.cat })); break;
        case 'order': seg.items = this.draw('order', n).map(b => { const sh = this.shuffle(b.c.map((x, i) => i)); return { kind: 'order', bid: b.id, q: b.q, c: sh.map(i => b.c[i]), a: b.c.map((_, k) => sh.indexOf(k)), d: b.d, cat: b.cat }; }); break;
        case 'number': seg.items = this.draw('number', n).map(b => ({ kind: 'number', bid: b.id, q: b.q, a: b.a, unit: b.unit, d: 2 })); break;
        case 'tf': seg.items = this.draw('tf', n).map(b => ({ kind: 'tf', bid: b.id, q: b.q, c: ['صح', 'خطأ'], a: b.a ? 0 : 1, d: 1 })); seg.alive = null; break;
        case 'consensus': seg.items = this.draw('consensus', n).map(b => ({ kind: 'consensus', bid: b.id, q: b.q, c: b.c })); break;
        case 'wheel': for (let i = 0; i < n; i++) seg.items.push({ kind: 'wheel', team: T[i % T.length], res: null }); break;
        case 'boxes': seg.boxes = this.shuffle(this.D.BOXES).map(b => ({ ...b, open: false, by: null })); for (let i = 0; i < n; i++) seg.items.push({ kind: 'box', team: T[i % T.length], res: null }); break;
        case 'secret': seg.items = [{ kind: 'secret' }]; break;
        case 'auction': seg.items = this.draw('mcq', n, { d: [3] }).map(b => Object.assign(this.mcqItem(b), { kind: 'mcq', auction: true, bids: {}, winner: null })); seg.mode = 'special'; break;
        case 'taboo': { const words = this.draw('taboo', 18); seg.items = T.map((tid, i) => ({ kind: 'taboo', team: tid, words: words.slice(i * 4, i * 4 + 4).concat(this.shuffle(words).slice(0, 4)), wi: 0, got: 0, rep: null })); break; }
        case 'observe': for (let i = 0; i < n; i++) seg.items.push(this.sceneItem(i)); break;
        case 'vault': seg.items = this.draw('vault', n).map(b => ({ kind: 'vault', bid: b.id, q: 'اخترقوا الخزنة', a: b.a, clues: b.clues, cracked: {}, order: 0, lock: {}, tries: {} })); break;
        case 'live': { const L = this.draw('live', n); seg.items = L.map(b => ({ kind: 'live', bid: b.id, q: b.q, desc: b.a, time: b.time, places: [], votes: {} })); break; }
      }
      if (def.pairs && T.length >= 2) { const P = this.pairList(T); seg.items.forEach((it, i) => { it.pair = P[i % P.length]; }); }
      if (def.treasure && seg.items.length >= 2) { const b = this.draw('mcq', 1, { d: [1, 2] })[0]; if (b) seg.items.splice(Math.floor(seg.items.length / 2), 0, Object.assign(this.mcqItem(b), { treasure: true })); }
      if (def.vs) seg.vs = T.length >= 2 ? [T[0], T[1]] : null;
      if (def.duel) seg.duelPairs = this.duelPairs(seg.items.length);
      if (def.wager) { const w = this.draw('mcq', 1, { d: [3] })[0]; if (w) seg.items.push(Object.assign(this.mcqItem(w), { wagerQ: true, wagers: {} })); }
      if (g === 'opening') { seg.mode = 'special'; seg.items = []; seg.phase = 'welcome'; }
      if (g === 'crown') { seg.mode = 'special'; seg.phase = 'island'; seg.revealed = 0; }
      return seg;
    }
    mcqItem(b) { const order = this.shuffle(b.c.map((_, i) => i)); return { kind: 'mcq', bid: b.id, q: b.q, c: order.map(i => b.c[i]), a: order.indexOf(0), d: b.d, cat: b.cat, src: b.src }; }
    memoryItem(i) {
      const pool = this.shuffle(this.D.MEMORY_POOL); const grid = pool.slice(0, 9); const outside = pool.slice(9);
      const N = this.D.MEMORY_NAMES; const type = i % 3;
      let q, c, a;
      if (type === 0) { const wrong = this.shuffle(grid).slice(0, 3); const right = outside[0]; const opts = this.shuffle([right, ...wrong]); q = 'أي هذه العناصر لم يكن في الشبكة؟'; c = opts.map(e => e + ' ' + N[e]); a = opts.indexOf(right); }
      else if (type === 1) { const right = grid[4]; const opts = this.shuffle([right, ...this.shuffle(grid.filter(x => x !== right)).slice(0, 3)]); q = 'ما العنصر الذي كان في وسط الشبكة؟'; c = opts.map(e => e + ' ' + N[e]); a = opts.indexOf(right); }
      else { const right = grid[0]; const opts = this.shuffle([right, ...this.shuffle(grid.filter(x => x !== right)).slice(0, 3)]); q = 'ما العنصر الذي كان في الزاوية العليا اليمنى؟'; c = opts.map(e => e + ' ' + N[e]); a = opts.indexOf(right); }
      return { kind: 'mcq', mem: true, grid, show: 6 + (i < 2 ? 2 : 0), q, c, a, d: 2, cat: 'memory' };
    }
    duelPairs(n) { const T = this.s.teams.map(t => t.id); const pairs = []; for (let i = 0; i < n; i++) { const a = T[i % T.length], b = T[(i + 1 + Math.floor(i / T.length)) % T.length]; pairs.push(a === b ? [a, T[(T.indexOf(a) + 1) % T.length]] : [a, b]); } return pairs; }

    // الانتقال إلى البند التالي داخل الجولة
    nextItem() {
      const s = this.s, seg = s.seg; if (!seg) return;
      if (seg.g === 'opening') return this.openingNext();
      if (seg.g === 'crown') return this.crownNext();
      s.timer = null;
      if (seg.g === 'survival' && seg.idx >= 0 && seg.items[seg.idx] && !seg.items[seg.idx].done) return;
      seg.idx++;
      if (seg.idx >= seg.items.length) { this.finishSeg(); return; }
      const it = this.item();
      s.seq++;
      it.qid = s.seq; it.answers = {}; it.buzz = null; it.locked = []; it.late = []; it.result = null; it.revealed = false;
      const def = this.gameDef(seg.g) || {};
      if (it.pair) it.eligible = it.pair.slice();
      else if (seg.vs) it.eligible = seg.vs.slice();
      else if (seg.duelPairs) { const pr = seg.duelPairs[seg.idx]; it.eligible = pr.slice(); it.reps = pr.map(t => this.suggestRep(t)).filter(Boolean); it.reps.forEach(sid => { const st = s.students[sid]; st.st.pick++; st.st.lastPick = s.seq; st.st.lastAct = s.seq; }); }
      else it.eligible = s.teams.map(t => t.id);
      if (it.kind === 'wheel' || it.kind === 'box' || it.kind === 'taboo') { seg.phase = 'turn'; if (it.kind === 'taboo') it.rep = this.suggestRep(it.team); it.repSid = this.suggestRep(it.team); }
      else if (it.kind === 'secret') seg.phase = 'secret';
      else if (it.auction) { seg.phase = 'bidding'; }
      else if (it.wagerQ) { seg.phase = 'wager'; }
      else if (it.kind === 'live') seg.phase = 'ready';
      else seg.phase = 'ready';
      if (seg.g === 'survival' && !seg.alive) { seg.alive = {}; Object.values(s.students).forEach(st => { seg.alive[st.sid] = st.team; }); seg.start = {}; s.teams.forEach(t => { seg.start[t.id] = this.teamMembers(t.id).length; }); }
      this.touch('item');
    }
    // فتح السؤال للإجابة/الاستباق
    openItem() {
      const s = this.s, seg = s.seg, it = this.item(); if (!it) return;
      const def = this.gameDef(seg.g) || {};
      if (it.mem && seg.phase === 'ready') { seg.phase = 'show'; this.startTimer(it.show, 'تذكّر'); this.touch('show'); return; }
      seg.phase = 'open';
      it.openedAt = this.now(); it.bo = (it.bo || 0) + 1;
      if (seg.mode === 'all' || seg.mode === 'team') {
        it.denom = {}; s.teams.forEach(t => { it.denom[t.id] = Math.max(1, this.teamMembers(t.id, true).length); });
      }
      if (it.kind === 'vault') this.vaultDist(it);
      const time = it.kind === 'live' ? it.time : (it.auction ? def.time || 20 : (def.time || 20));
      this.startTimer(time, seg.mode === 'buzz' ? 'الاستباق مفتوح' : 'الوقت');
      this.touch('open');
    }
    memHide() { const seg = this.s.seg; if (!seg) return; seg.phase = 'ready'; const it = this.item(); it.mem = false; it.memDone = true; this.openItem(); }
    revealClue() { const it = this.item(); if (it && it.kind === 'whoami' && it.clue < it.clues.length - 1) { it.clue++; this.touch('clue'); } }

    // ---------- الاستباق ----------
    canBuzz(sid) {
      const s = this.s, seg = s.seg, it = this.item(), st = s.students[sid];
      if (!seg || !it || !st || seg.mode !== 'buzz' || seg.phase !== 'open' || it.buzz) return false;
      if (!it.eligible.includes(st.team) || it.locked.includes(st.team) || s.frozen[st.team]) return false;
      if (it.reps && it.reps.length && !it.reps.includes(sid)) return false;
      return true;
    }
    // الخادم المرجعي هنا هو متصفح المشرف: أول ضغطة تصل وتُعالج تُعتمد
    buzz(sid, qid) {
      const s = this.s, it = this.item(), st = s.students[sid];
      if (!it || it.qid !== qid || !st) return { ok: false, why: 'stale' };
      st.st.lastAct = s.seq;
      if (!this.canBuzz(sid)) {
        if (it.buzz && it.late.length < 5 && !it.late.find(l => l.sid === sid) && it.buzz.sid !== sid) { it.late.push({ sid, dt: this.now() - it.buzz.at }); this.touch(); }
        return { ok: false, why: 'closed' };
      }
      it.buzz = { sid, team: st.team, at: this.now(), name: st.name };
      st.st.bz++;
      s.seg.phase = 'answering';
      this.startTimer(s.settings.answerTime || 10, 'وقت الإجابة');
      this.touch('buzz', { team: st.team, name: st.name });
      return { ok: true };
    }
    // للمشرف: منح الأولوية يدويًا (وضع الطوارئ أو المشاركة الشفهية)
    manualBuzz(tid) {
      const s = this.s, seg = s.seg, it = this.item();
      if (!it || !seg || seg.mode !== 'buzz' || (seg.phase !== 'open' && seg.phase !== 'ready') || it.buzz || it.locked.includes(tid)) return false;
      if (seg.phase === 'ready') { seg.phase = 'open'; it.openedAt = this.now(); }
      it.buzz = { sid: null, team: tid, at: this.now(), name: '' };
      seg.phase = 'answering';
      this.startTimer(s.settings.answerTime || 10, 'وقت الإجابة');
      this.touch('buzz', { team: tid, name: '' });
      return true;
    }
    itemPoints(it) {
      const seg = this.s.seg;
      if (it.kind === 'whoami') return WHO_PTS[Math.min(it.clue, 3)] * (seg.mult || 1);
      return (BASE_BY_D[it.d] || 20) * (seg.mult || 1);
    }
    judge(correct) {
      const s = this.s, seg = s.seg, it = this.item(); if (!it || !it.buzz || seg.phase !== 'answering') return;
      const tid = it.buzz.team, st = it.buzz.sid ? s.students[it.buzz.sid] : null;
      const tx = this.beginTx(correct ? 'إجابة صحيحة' : 'إجابة خاطئة');
      if (correct) {
        if (it.treasure) { const g = s.settings.treasureGold || 40; this.vil(tid).gold += g; it.gold = g; s.ledger.push({ tx, t: this.now(), team: tid, d: 0, why: 'كنز الجزيرة: +' + g + ' ذهب' + (st ? ' — ' + st.name : '') }); }
        else { const pts = this.itemPoints(it); this.award(tid, pts, this.segName(seg.g) + ': إجابة صحيحة' + (st ? ' — ' + st.name : ''), tx); }
        if (st) { st.st.ok++; st.st.win++; }
        it.result = { team: tid, ok: true }; it.revealed = true; seg.phase = 'reveal'; s.timer = null;
        if (s.frozen && it.eligible) it.eligible.forEach(t => { if (s.frozen[t]) delete s.frozen[t]; });
        this.afterScore();
        this.touch(it.treasure ? 'treasure' : (it.pair ? 'cannon' : 'correct'), { team: tid });
      } else {
        const pen = s.settings.buzzPenalty || 0;
        if (pen) this.award(tid, -pen, this.segName(seg.g) + ': إجابة خاطئة', tx);
        it.locked.push(tid);
        it.buzz = null;
        const remainingTeams = it.eligible.filter(t => !it.locked.includes(t) && !s.frozen[t]);
        if (!remainingTeams.length) { it.result = { team: null, ok: false }; it.revealed = true; seg.phase = 'reveal'; s.timer = null; this.afterScore(); this.touch('wrong', { team: tid, final: true }); }
        else { seg.phase = 'paused'; s.timer = null; this.afterScore(); this.touch('wrong', { team: tid }); }
      }
    }
    // إعادة فتح الاستباق للفرق المتبقية بعد خطأ
    reopen() {
      const seg = this.s.seg, it = this.item(); if (!it || seg.phase !== 'paused') return;
      seg.phase = 'open'; it.bo = (it.bo || 0) + 1; this.startTimer(Math.max(8, Math.round(((this.gameDef(seg.g) || {}).time || 15) / 2)), 'الاستباق مفتوح للبقية');
      this.touch('open');
    }
    revealItem(timeout) {
      const s = this.s, seg = s.seg, it = this.item(); if (!it) return;
      if (seg.mode === 'all' && seg.phase === 'open') return this.lockAll();
      it.revealed = true; seg.phase = 'reveal'; s.timer = null;
      if (s.frozen && it.eligible) it.eligible.forEach(t => { if (s.frozen[t]) delete s.frozen[t]; });
      this.touch(timeout ? 'timeup' : 'reveal');
    }

    // ---------- الإجابة الفردية من الجوالات ----------
    answer(sid, qid, v) {
      const s = this.s, seg = s.seg, it = this.item(), st = s.students[sid];
      if (!it || !st || it.qid !== qid || seg.mode !== 'all' || seg.phase !== 'open') return false;
      if (it.answers[sid] !== undefined) return false;
      if (seg.g === 'survival' && seg.alive && !(sid in seg.alive)) return false;
      if (!this.validAnswer(it, v)) return false;
      it.answers[sid] = { v, t: this.now() - (it.openedAt || this.now()) };
      st.st.ans++; st.st.lastAct = s.seq;
      this.touch();
      return true;
    }
    // تصويت الجمهور في التحدي الحضوري
    vote(sid, qid, tid) {
      const s = this.s, seg = s.seg, it = this.item(), st = s.students[sid];
      if (!it || !st || it.qid !== qid || it.kind !== 'live' || seg.phase !== 'vote' || it.votes[sid] || tid === st.team || !this.team(tid)) return false;
      it.votes[sid] = tid; st.st.lastAct = s.seq; this.touch(); return true;
    }
    validAnswer(it, v) {
      if (it.kind === 'mcq' || it.kind === 'tf' || it.kind === 'consensus') return Number.isInteger(v) && v >= 0 && v < it.c.length;
      if (it.kind === 'order') return Array.isArray(v) && v.length === it.c.length && new Set(v).size === v.length && v.every(x => Number.isInteger(x) && x >= 0 && x < it.c.length);
      if (it.kind === 'number') return typeof v === 'number' && isFinite(v) && Math.abs(v) < 1e12;
      return false;
    }
    isCorrect(it, v) { if (it.kind === 'order') return JSON.stringify(v) === JSON.stringify(it.a); return v === it.a; }
    answerCounts() { const it = this.item(); if (!it || !it.answers) return { n: 0, byTeam: {} }; const byTeam = {}; Object.keys(it.answers).forEach(sid => { const st = this.s.students[sid]; if (st) byTeam[st.team] = (byTeam[st.team] || 0) + 1; }); return { n: Object.keys(it.answers).length, byTeam }; }
    lockAll() {
      const s = this.s, seg = s.seg, it = this.item(); if (!it || seg.phase !== 'open') return;
      s.timer = null; seg.phase = 'reveal'; it.revealed = true;
      const def = this.gameDef(seg.g) || {}; const base = (def.base || 20) * (seg.mult || 1);
      const tx = this.beginTx(this.segName(seg.g));
      const res = {}; s.teams.forEach(t => { res[t.id] = { ok: 0, n: 0, pts: 0 }; });
      const per = Object.entries(it.answers).map(([sid, a]) => ({ sid, st: s.students[sid], a })).filter(x => x.st);
      if (it.kind === 'number') {
        const meds = {};
        s.teams.forEach(t => { const vals = per.filter(x => x.st.team === t.id).map(x => x.a.v); res[t.id].n = vals.length; meds[t.id] = median(vals); res[t.id].med = meds[t.id]; });
        const ranked = s.teams.filter(t => meds[t.id] != null).map(t => ({ id: t.id, diff: Math.abs(meds[t.id] - it.a) })).sort((a, b) => a.diff - b.diff);
        if (ranked.length) {
          const best = ranked[0].diff; const firsts = ranked.filter(r => r.diff === best);
          firsts.forEach(r => { res[r.id].pts = this.award(r.id, 20, 'الرقم الأقرب: الأقرب للإجابة', tx); });
          const rest = ranked.filter(r => r.diff > best); if (rest.length) { const b2 = rest[0].diff; rest.filter(r => r.diff === b2).forEach(r => { res[r.id].pts = this.award(r.id, 10, 'الرقم الأقرب: المركز الثاني', tx); }); }
        }
        if (per.length) { per.sort((x, y) => Math.abs(x.a.v - it.a) - Math.abs(y.a.v - it.a)); const top = per[0]; top.st.st.ok++; it.bestSid = top.sid; }
      } else if (it.kind === 'consensus') {
        s.teams.forEach(t => {
          const vals = per.filter(x => x.st.team === t.id).map(x => x.a.v); res[t.id].n = vals.length;
          if (vals.length >= 2) { const cnt = {}; vals.forEach(v => { cnt[v] = (cnt[v] || 0) + 1; }); const mx = Math.max(...Object.values(cnt)); const ratio = mx / vals.length; res[t.id].ratio = ratio; const pts = Math.round(15 * ratio); if (pts) res[t.id].pts = this.award(t.id, pts, 'عقل واحد: توافق ' + Math.round(ratio * 100) + '%', tx); }
        });
      } else {
        per.forEach(x => { const ok = this.isCorrect(it, x.a.v); res[x.st.team].n++; if (ok) { res[x.st.team].ok++; x.st.st.ok++; } x.ok = ok; });
        if (seg.g === 'survival' && seg.alive) {
          Object.keys(seg.alive).forEach(sid => { const a = it.answers[sid]; if (!a || !this.isCorrect(it, a.v)) delete seg.alive[sid]; });
          it.done = true;
        } else {
          s.teams.forEach(t => { const denom = (it.denom && it.denom[t.id]) || 1; const r = res[t.id]; if (r.ok) { const pts = Math.round(base * Math.min(1, r.ok / denom)); r.pts = this.award(t.id, pts, this.segName(seg.g) + ': ' + r.ok + ' إجابة صحيحة', tx); } });
          const fastest = per.filter(x => x.ok).sort((a, b) => a.a.t - b.a.t)[0]; if (fastest) it.fastest = fastest.sid;
        }
      }
      it.result = res;
      it.dist = it.c ? it.c.map((_, i) => per.filter(x => JSON.stringify(x.a.v) === JSON.stringify(i)).length) : null;
      this.afterScore();
      this.touch('reveal');
    }

    // إجابة الفريق: المشرف يحدد الفرق التي أجابت صحيحًا
    teamMark(tids) {
      const s = this.s, seg = s.seg, it = this.item(); if (!it || (seg.phase !== 'open' && seg.phase !== 'ready')) return;
      const tx = this.beginTx('إجابة الفريق');
      const pts = this.itemPoints(it);
      const res = {}; (tids || []).forEach(t => { res[t] = { pts: this.award(t, pts, this.segName(seg.g) + ': إجابة الفريق', tx) }; });
      it.result = res; it.revealed = true; seg.phase = 'reveal'; s.timer = null;
      this.afterScore(); this.touch('reveal');
    }
    setMode(mode) { const seg = this.s.seg; if (!seg) return; const it = this.item(); if (it && (it.kind === 'open' || it.kind === 'whoami') && mode === 'all') return; seg.mode = mode; this.touch(); }

    // ---------- العجلة والصناديق ----------
    spin() {
      const s = this.s, seg = s.seg, it = this.item(); if (!it || it.kind !== 'wheel' || seg.phase !== 'turn') return;
      const W = this.D.WHEEL; const idx = Math.floor(this.rng() * W.length);
      it.res = { idx, ...W[idx] }; it.spinAt = this.now(); seg.phase = 'spun';
      if (it.repSid && s.students[it.repSid]) { s.students[it.repSid].st.pick++; s.students[it.repSid].st.lastPick = s.seq; s.students[it.repSid].st.lastAct = s.seq; }
      this.touch('spin', { idx });
    }
    openBox(i) {
      const s = this.s, seg = s.seg, it = this.item(); if (!it || it.kind !== 'box' || seg.phase !== 'turn') return;
      const b = seg.boxes[i]; if (!b || b.open) return;
      b.open = true; b.by = it.team; it.res = { ...b, i }; seg.phase = 'spun';
      if (it.repSid && s.students[it.repSid]) { s.students[it.repSid].st.pick++; s.students[it.repSid].st.lastPick = s.seq; s.students[it.repSid].st.lastAct = s.seq; }
      this.touch('box', { i });
    }
    // تطبيق نتيجة العجلة/الصندوق. success للتحديات والأسئلة الخاصة
    applyLuck(success) {
      const s = this.s, seg = s.seg, it = this.item(); if (!it || !it.res || seg.phase !== 'spun') return;
      const r = it.res, tid = it.team, tx = this.beginTx('مفاجأة');
      const why = (it.kind === 'wheel' ? 'عجلة المصير: ' : 'الصناديق: ') + r.t;
      if (r.k === 'pts') this.award(tid, r.v, why, tx);
      else if (r.k === 'all') s.teams.forEach(t => this.award(t.id, r.v, why, tx));
      else if (r.k === 'others') s.teams.forEach(t => { if (t.id !== tid) this.award(t.id, r.v, why, tx); });
      else if (r.k === 'card') { this.giveCard(tid, r.v); s.ledger.push({ tx, t: this.now(), team: tid, d: 0, why }); }
      else if (r.k === 'combo') { this.award(tid, r.v, why, tx); this.giveCard(tid, 'double'); }
      else if (r.k === 'steal') { const L = this.ranking()[0]; if (L && L.id !== tid && L.score >= r.v) { this.award(L.id, -r.v, why + ' (خُصمت)', tx, { raw: true }); this.award(tid, r.v, why, tx, { raw: true }); } }
      else if ((r.k === 'challenge' || r.k === 'question') && success) this.award(tid, r.v, why + ' — نجح', tx);
      it.applied = true; seg.phase = 'reveal';
      this.afterScore();
    }

    // ---------- المزاد ----------
    setBid(tid, v) { const it = this.item(); if (!it || !it.auction || this.s.seg.phase !== 'bidding') return; const sc = this.scores()[tid] || 0; v = Math.max(0, Math.min(30, Math.round(+v || 0), Math.max(0, sc))); it.bids[tid] = v; this.touch(); }
    closeBids() {
      const s = this.s, it = this.item(); if (!it || !it.auction || s.seg.phase !== 'bidding') return;
      const entries = Object.entries(it.bids).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
      if (!entries.length) { it.winner = null; s.seg.phase = 'open'; it.eligible = s.teams.map(t => t.id); this.startTimer(20); this.touch('open'); return; }
      const top = entries[0][1]; const tied = entries.filter(e => e[1] === top).map(e => e[0]);
      it.winner = tied.length === 1 ? tied[0] : this.pick(tied); it.bid = top;
      s.seg.phase = 'open'; it.openedAt = this.now(); this.startTimer(20, 'وقت الإجابة'); this.touch('open');
    }
    judgeAuction(correct) {
      const s = this.s, it = this.item(); if (!it || !it.auction || s.seg.phase !== 'open') return;
      const tx = this.beginTx('المزاد');
      if (it.winner) { if (correct) this.award(it.winner, it.bid, 'المزاد: إجابة صحيحة', tx); else this.award(it.winner, -Math.floor(it.bid / 2), 'المزاد: إجابة خاطئة', tx); }
      it.result = { team: it.winner, ok: correct }; it.revealed = true; s.seg.phase = 'reveal'; s.timer = null; this.afterScore(); this.touch(correct ? 'correct' : 'wrong');
    }

    // ---------- رهان الحسم ----------
    maxWager(tid) { const sc = this.scores()[tid] || 0; return Math.max(0, Math.min(40, Math.floor(sc * 0.25))); }
    setWager(tid, v) { const it = this.item(); if (!it || !it.wagerQ || this.s.seg.phase !== 'wager') return; it.wagers[tid] = Math.max(0, Math.min(this.maxWager(tid), Math.round(+v || 0))); this.touch(); }
    lockWagers() { const s = this.s, it = this.item(); if (!it || !it.wagerQ || s.seg.phase !== 'wager') return; s.teams.forEach(t => { if (it.wagers[t.id] == null) it.wagers[t.id] = 0; }); s.seg.phase = 'open'; it.openedAt = this.now(); this.startTimer(30, 'الفرق تكتب إجاباتها'); this.touch('open'); }
    judgeWager(correctTids) {
      const s = this.s, it = this.item(); if (!it || !it.wagerQ || s.seg.phase !== 'open') return;
      const tx = this.beginTx('رهان الحسم'); const res = {};
      s.teams.forEach(t => { const w = it.wagers[t.id] || 0; const ok = correctTids.includes(t.id); res[t.id] = { ok, pts: w ? this.award(t.id, ok ? w : -w, 'رهان الحسم: ' + (ok ? 'صحيح' : 'خطأ'), tx, { raw: true }) : 0 }; });
      it.result = res; it.revealed = true; s.seg.phase = 'reveal'; s.timer = null; this.afterScore(); this.touch('reveal');
    }

    // ---------- الكلمة الممنوعة ----------
    tabooStart() { const s = this.s, it = this.item(); if (!it || it.kind !== 'taboo' || s.seg.phase !== 'turn') return; s.seg.phase = 'open'; const st = s.students[it.rep]; if (st) { st.st.pick++; st.st.lastPick = s.seq; st.st.lastAct = s.seq; } this.startTimer((this.gameDef('taboo').time) || 60, 'الوصف'); this.touch('open'); }
    tabooMark(ok) { const s = this.s, it = this.item(); if (!it || it.kind !== 'taboo' || s.seg.phase !== 'open') return; if (ok) it.got++; it.wi++; if (it.wi >= it.words.length) { this.tabooEnd(); return; } this.touch(ok ? 'tick-ok' : 'skip'); }
    tabooEnd() { const s = this.s, it = this.item(); if (!it || it.kind !== 'taboo' || s.seg.phase !== 'open') return; const tx = this.beginTx('الكلمة الممنوعة'); const pts = Math.min(30, it.got * 5); if (pts) this.award(it.team, pts, 'الكلمة الممنوعة: ' + it.got + ' كلمات', tx); it.result = { pts }; it.revealed = true; s.seg.phase = 'reveal'; s.timer = null; this.afterScore(); this.touch('reveal'); }
    setDuelRep(tid, sid) { const it = this.item(), st = this.s.students[sid]; if (!it || !it.reps || !st || st.team !== tid) return; it.reps = it.reps.filter(x => this.s.students[x] && this.s.students[x].team !== tid); it.reps.push(sid); st.st.pick++; st.st.lastPick = this.s.seq; this.touch(); }
    setRep(sid) { const it = this.item(); if (!it) return; if (it.kind === 'taboo') it.rep = sid; it.repSid = sid; this.touch(); }

    // ---------- التحدي الحضوري ----------
    livePlace(tid) { const s = this.s, it = this.item(); if (!it || it.kind !== 'live' || !['open', 'score'].includes(s.seg.phase)) return; if (it.places.includes(tid)) it.places = it.places.filter(x => x !== tid); else it.places.push(tid); s.seg.phase = 'score'; s.timer = null; this.touch(); }
    liveScore() {
      const s = this.s, it = this.item(); if (!it || it.kind !== 'live' || s.seg.phase !== 'score') return;
      const tx = this.beginTx('التحدي الحضوري'); it.result = {};
      it.places.forEach((tid, i) => { it.result[tid] = { place: i + 1, pts: this.award(tid, LIVE_PTS[i] || 5, 'التحدي الحضوري: المركز ' + (i + 1), tx) }; });
      s.seg.phase = 'scored'; it.revealed = true; this.afterScore(); this.touch('reveal');
    }
    openVote() { const s = this.s, it = this.item(); if (!it || it.kind !== 'live' || s.seg.phase !== 'scored') return; s.seg.phase = 'vote'; it.votes = {}; this.startTimer(20, 'تصويت الجمهور'); this.touch('open'); }
    closeVote() {
      const s = this.s, it = this.item(); if (!it || it.kind !== 'live' || s.seg.phase !== 'vote') return;
      const cnt = {}; Object.values(it.votes).forEach(t => { cnt[t] = (cnt[t] || 0) + 1; });
      const mx = Math.max(0, ...Object.values(cnt)); const winners = mx ? Object.keys(cnt).filter(t => cnt[t] === mx) : [];
      const tx = this.beginTx('تصويت الجمهور'); winners.forEach(t => this.award(t, 10, 'تصويت الجمهور: الأفضل أداءً', tx));
      it.voteRes = { cnt, winners }; s.seg.phase = 'voted'; s.timer = null; this.afterScore(); this.touch('reveal');
    }

    // ---------- جزيرة القرى: الذهب والمباني ----------
    vil(tid) { if (!this.s.village) this.s.village = {}; if (!this.s.village[tid]) this.s.village[tid] = this.newVillage(); const v = this.s.village[tid]; this.D.BUILD_KEYS.forEach(k => { if (v.b[k] == null) v.b[k] = 0; }); return v; }
    buildCost(tid, key) { const B = this.D.BUILD[key]; if (!B) return null; const lv = this.vil(tid).b[key]; return lv >= B.cost.length ? null : B.cost[lv]; }
    // الشراء: القائد وحده من جواله (sid)، أو المشرف (sid = null)
    buy(tid, key, sid) {
      const s = this.s; if (!this.team(tid) || !this.D.BUILD[key]) return { ok: false, why: 'bad' };
      if (sid !== null && sid !== undefined && s.captain[tid] !== sid) return { ok: false, why: 'not-captain' };
      const v = this.vil(tid), c = this.buildCost(tid, key);
      if (c == null) return { ok: false, why: 'max' };
      if (v.gold < c) return { ok: false, why: 'gold' };
      const tx = this.beginTx('بناء'); v.gold -= c; v.b[key]++;
      const lv = v.b[key]; s.buildLog = s.buildLog || []; s.buildLog.push({ team: tid, key, lv, t: this.now() });
      s.ledger.push({ tx, t: this.now(), team: tid, d: 0, why: 'بنى ' + this.D.BUILD[key].name + (lv > 1 ? ' (المستوى ' + lv + ')' : '') + ' بـ' + c + ' ذهب' });
      if (sid) { const st = s.students[sid]; if (st) st.st.lastAct = s.seq; }
      this.touch('build', { team: tid, key, lv }); return { ok: true };
    }
    setCaptain(tid, sid) { const s = this.s; if (!this.team(tid)) return false; if (sid && (!s.students[sid] || s.students[sid].team !== tid)) return false; if (sid) s.captain[tid] = sid; else delete s.captain[tid]; this.touch(); return true; }
    // طابع القرية: يختاره القائد في الافتتاح، ويستطيع المشرف تغييره متى شاء
    setTheme(tid, theme, sid) {
      const s = this.s; if (!this.team(tid) || !this.D.THEMES[theme]) return false;
      if (sid !== null && sid !== undefined) { if (s.captain[tid] !== sid) return false; if (s.planIdx > 0 && s.plan[s.planIdx] && s.plan[s.planIdx].g !== 'opening') return false; }
      this.vil(tid).theme = theme; this.touch('theme', { team: tid, theme }); return true;
    }
    buildScore(tid) { const b = this.vil(tid).b; return this.D.BUILD_KEYS.reduce((a, k) => a + b[k], 0); }
    // أزواج المواجهة: كل فريق يواجه الجميع بالتناوب
    pairList(T) {
      if (T.length === 2) return [[T[0], T[1]]];
      if (T.length === 3) return [[T[0], T[1]], [T[2], T[0]], [T[1], T[2]]];
      return [[T[0], T[1]], [T[2], T[3]], [T[0], T[2]], [T[1], T[3]], [T[0], T[3]], [T[1], T[2]]];
    }
    // ---------- قوة الملاحظة: مشهد مرسوم ----------
    sceneItem(i) {
      const S = this.D.SCENE, SC = this.D.SCENE_COLORS, colorable = ['boat', 'tent', 'flag', 'chest', 'fish', 'bird'];
      const types = Object.keys(S).filter(t => t !== 'sun'), colors = Object.keys(SC);
      const slots = []; for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) slots.push([110 + c * 240 + (r ? 120 : 0), 210 + r * 230]);
      const sl = this.shuffle(slots);
      const pickT = this.shuffle(types);
      const kind = ['removed', 'count', 'color', 'added', 'whatcolor'][i % 5];
      let objs = [], q, c, a, B = null;
      const mk = (t, k) => ({ t, x: sl[k][0] + Math.round((this.rng() - .5) * 40), y: sl[k][1] + Math.round((this.rng() - .5) * 30), c: colorable.includes(t) ? this.pick(colors) : null });
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
          const cols = objs.filter(o => o.c); if (cols.length < 2) { objs[0] = Object.assign(mk('boat', 0)); objs[1] = Object.assign(mk('tent', 1)); }
          const cl = objs.filter(o => o.c);
          if (kind === 'color') { const ch = this.pick(cl); const nc = this.pick(colors.filter(x => x !== ch.c)); B = objs.map(o => o === ch ? Object.assign({}, o, { c: nc }) : o); const others = this.shuffle(cl.filter(o => o !== ch).map(o => o.t)); const pool = others.concat(this.shuffle(colorable.filter(t => t !== ch.t && !others.includes(t)))); const opts = this.shuffle([ch.t, ...pool.slice(0, 3)]); q = 'ما الذي تغيّر لونه؟'; c = opts.map(t => S[t]); a = opts.indexOf(ch.t); }
          else { const o = this.pick(cl); const opts = this.shuffle([o.c, ...this.shuffle(colors.filter(x => x !== o.c)).slice(0, 3)]); q = 'ما لون ' + S[o.t] + ' في الصورة؟'; c = opts.map(x => SC[x]); a = opts.indexOf(o.c); }
        }
      }
      return { kind: 'mcq', mem: true, obs: kind, A: objs, B, show: 7, q, c, a, d: 2, cat: 'memory' };
    }
    // ---------- اختراق الخزنة ----------
    vaultDist(it) { const d = {}; this.s.teams.forEach(t => { let m = this.teamMembers(t.id, true); if (!m.length) m = this.teamMembers(t.id); m = this.shuffle(m); if (!m.length) return; it.clues.forEach((c, i) => { const sid = m[i % m.length].sid; (d[sid] = d[sid] || []).push(i); }); }); it.cdist = d; }
    vaultTry(sid, qid, code) {
      const s = this.s, seg = s.seg, it = this.item(), st = s.students[sid];
      if (!it || it.kind !== 'vault' || it.qid !== qid || seg.phase !== 'open' || !st) return { ok: false };
      const t = st.team; if (it.cracked[t]) return { ok: false }; const now = this.now();
      if (it.lock[t] && now < it.lock[t]) return { ok: false, why: 'locked' };
      code = String(code || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '').slice(0, 8); if (!code) return { ok: false };
      it.tries[t] = (it.tries[t] || 0) + 1; st.st.lastAct = s.seq; st.st.ans++;
      if (code === it.a) {
        const ord = ++it.order; const pts = [30, 20, 10, 5][ord - 1] || 5; const tx = this.beginTx('اختراق الخزنة');
        it.cracked[t] = { ord, by: sid, at: now - (it.openedAt || now) }; this.award(t, pts, 'اختراق الخزنة: المركز ' + ord, tx); st.st.ok++; st.st.win++;
        this.afterScore(); this.touch('crack', { team: t, ord });
        if (!s.teams.some(x => !it.cracked[x.id] && this.teamMembers(x.id).length)) this.revealItem();
        return { ok: true };
      }
      it.lock[t] = now + 8000; this.touch('deny', { team: t }); return { ok: false, why: 'wrong' };
    }
    // ---------- القرعة ----------
    drawTeams() { this.autoBalance(); const seg = this.s.seg; if (seg && seg.g === 'opening') seg.drawN = (seg.drawN || 0) + 1; this.s.drawN = (this.s.drawN || 0) + 1; this.touch('draw'); }
    // ---------- الرسائل الخاصة لكل جوال (تُشفَّر في الواجهة) ----------
    privData() {
      const s = this.s, seg = s.seg, it = this.item(), out = {};
      Object.values(s.students).forEach(st => {
        if (st.sid.startsWith('bot-')) return; const o = {};
        const m = s.missions[st.team]; if (m) o.m = [m.text, m.done ? 1 : 0];
        if (it && it.kind === 'taboo' && it.rep === st.sid && seg.phase === 'open') { const w = it.words[it.wi]; if (w) o.w = [w.q, w.c]; }
        if (it && it.kind === 'vault' && it.cdist && seg.phase === 'open' && it.cdist[st.sid]) o.k = it.cdist[st.sid].map(i => it.clues[i]);
        out[st.sid] = o;
      });
      return out;
    }

    // ---------- نهاية الجولة ----------
    finishSeg() {
      const s = this.s, seg = s.seg; s.timer = null;
      if (seg.g === 'survival' && seg.alive && !seg.awarded) {
        const tx = this.beginTx('صمود'); seg.survRes = {};
        s.teams.forEach(t => { const start = seg.start[t.id] || 0; const alive = Object.values(seg.alive).filter(x => x === t.id).length; const pts = start ? Math.round(20 * alive / start) : 0; seg.survRes[t.id] = { alive, start, pts: pts ? this.award(t.id, pts, 'صمود: ' + alive + ' من ' + start + ' صامدون', tx) : 0 }; });
        seg.awarded = true; this.afterScore();
      }
      seg.phase = 'done'; seg.idx = seg.items.length;
      this.touch('segdone');
    }
    survivalEnd() { this.finishSeg(); }

    // ---------- الافتتاح والتتويج ----------
    openingNext() {
      const seg = this.s.seg; const order = ['welcome', 'explain', 'teams', 'done'];
      if (seg.phase === 'teams' && seg.stepI < this.s.teams.length) { seg.stepI++; this.touch('team-in', { i: seg.stepI }); return; }
      const i = order.indexOf(seg.phase); seg.phase = order[Math.min(order.length - 1, i + 1)]; if (seg.phase === 'teams') seg.stepI = 0; this.touch('seg');
    }
    crownNext() {
      const s = this.s, seg = s.seg, n = s.teams.length;
      if (seg.phase === 'island') { seg.phase = 'highlights'; seg.hl = this.highlights(); this.touch('seg'); return; }
      if (seg.phase === 'highlights') { seg.phase = 'reveal'; seg.revealed = 0; }
      if (seg.phase === 'reveal') {
        if (seg.revealed < n - 1) { seg.revealed++; this.touch('rank'); return; }
        seg.revealed = n; seg.phase = 'winner'; seg.final = this.ranking(); s.ended = true; seg.mvp = this.mvp(); this.touch('crown'); this.archiveSummary(); return;
      }
    }
    // أبرز الإنجازات للمشهد الختامي
    highlights() {
      const s = this.s, T = s.teams; const out = [];
      const built = T.map(t => ({ t: t.id, v: this.buildScore(t.id) })).sort((a, b) => b.v - a.v);
      if (built[0] && built[0].v > 0 && (!built[1] || built[0].v > built[1].v)) out.push({ k: 'build', team: built[0].t, v: built[0].v });
      const gold = T.map(t => ({ t: t.id, v: this.vil(t.id).earned })).sort((a, b) => b.v - a.v);
      if (gold[0] && gold[0].v > 0) out.push({ k: 'gold', team: gold[0].t, v: gold[0].v });
      const L = Object.values(s.students).sort((a, b) => (b.st.ok - a.st.ok) || (b.st.win - a.st.win)); if (L[0] && L[0].st.ok) out.push({ k: 'star', team: L[0].team, name: L[0].name, v: L[0].st.ok });
      return out;
    }
    mvp() {
      const L = Object.values(this.s.students); if (!L.length) return null;
      const best = [...L].sort((a, b) => (b.st.ok - a.st.ok) || (b.st.win - a.st.win) || (b.st.ans - a.st.ans))[0];
      const active = {}; this.s.teams.forEach(t => { const m = this.teamMembers(t.id); if (m.length) active[t.id] = [...m].sort((a, b) => (b.st.ans + b.st.bz + b.st.pick) - (a.st.ans + a.st.bz + a.st.pick))[0].sid; });
      const sab = Object.keys(this.s.honors || {}).filter(sid => this.s.students[sid]);
      return { best: best && best.st.ok ? best.sid : null, active, sab };
    }
    tieInfo() { const r = this.ranking(); if (r.length < 2) return null; return r[0].score === r[1].score ? r.filter(x => x.score === r[0].score).map(x => x.id) : null; }
    startTiebreak() {
      const tied = this.tieInfo(); if (!tied) return;
      const s = this.s; s.returnTo = s.planIdx;
      const items = this.draw('mcq', 3, { d: [2, 3] }).map(b => this.mcqItem(b));
      s.seg = { g: 'tiebreak', phase: 'intro', idx: -1, items, mode: 'buzz', mult: 1, vs: tied, stepI: 0 };
      this.touch('seg', { g: 'tiebreak' });
    }
    archiveSummary() {
      const s = this.s; const rk = this.ranking();
      this.lastSummary = { code: s.code, title: s.title, at: this.now(), teams: rk.map(r => ({ name: this.team(r.id).name, color: this.team(r.id).color, score: r.score, rank: r.rank })), players: Object.keys(s.students).length };
      return this.lastSummary;
    }

    // ---------- الحالة العامة (لا تحتوي إجابات قبل كشفها) ----------
    pub() {
      const s = this.s, seg = s.seg, it = this.item(), sc = this.scores();
      const P = { v: s.v, code: s.code, title: s.title, fx: s.fx, fxl: s.settings.fx, ended: s.ended,
        T: s.teams.map(t => [t.id, t.name, t.color, sc[t.id], s.cards[t.id] ? [s.cards[t.id].double, s.cards[t.id].shield, s.cards[t.id].freeze] : [0, 0, 0], (s.armed[t.id] && s.armed[t.id].double) ? 1 : 0, s.frozen[t.id] ? 1 : 0, s.streak[t.id] || 0]),
        tm: s.timer ? { r: this.remaining(), d: s.timer.dur, p: s.timer.paused != null ? 1 : 0, l: s.timer.label } : null };
      if (s.settings.village !== false) P.V = s.teams.map(t => { const v = this.vil(t.id), p = this.power(t.id); return [t.id, v.gold, v.b.wall, v.b.tower, v.b.barracks, v.b.catapult, p.atk, p.def]; });
      if (!seg) { P.g = null; return P; }
      P.g = seg.g; P.gn = this.segName(seg.g); P.ph = seg.phase; P.mode = seg.mode; P.mult = seg.mult; P.ii = seg.idx; P.in = seg.items.length;
      const def = this.gameDef(seg.g); if (def) { P.gi = def.icon; P.gd = def.desc; }
      if (seg.vs) P.vs = seg.vs;
      if (seg.g === 'opening') { P.step = seg.stepI; P.dn = seg.drawN || 0; }
      if ((this.gameDef(seg.g) || {}).bomb && s.bomb) P.bomb = Object.fromEntries(Object.entries(s.bomb).map(([t, cells]) => [t, cells.map(c => c.hit ? (c.sh ? 's' : c.v) : null)]));
      if (seg.g === 'battle') { P.bt = seg.battle ? seg.battle.map(r => [r.a, r.atk, r.def, r.vs.map(x => [x.b, x.win ? 1 : 0, x.pts || 0])]) : null; P.bs = seg.step || 0; }
      if (seg.g === 'traitor') P.tr = seg.sab ? Object.keys(seg.sab).length : 0;
      if (seg.g === 'crown') { P.rev = seg.revealed; P.rk = this.ranking().map(r => [r.id, r.score, r.rank]); if (seg.mvp) P.mvp = { best: seg.mvp.best ? this.s.students[seg.mvp.best] && this.s.students[seg.mvp.best].name : null, active: Object.fromEntries(Object.entries(seg.mvp.active).map(([k, v]) => [k, this.s.students[v] ? this.s.students[v].name : ''])), sab: (seg.mvp.sab || []).map(x => this.s.students[x].name) }; P.tie = this.tieInfo(); }
      if (seg.boxes) P.boxes = seg.boxes.map(b => b.open ? [1, b.t, b.by] : [0]);
      if (seg.survRes) P.surv = seg.survRes;
      if (seg.g === 'survival' && seg.alive) P.alive = Object.keys(seg.alive);
      if (it && seg.phase !== 'done') {
        const I = { k: it.kind, q: it.q, qid: it.qid, bo: it.bo || 0, d: it.d, cat: it.cat, el: it.eligible, lk: it.locked, rv: it.revealed ? 1 : 0 };
        if (it.c && !(it.kind === 'taboo')) I.c = it.c;
        if (it.mem || it.memDone) { I.mem = 1; if (seg.phase === 'show') I.grid = it.grid; }
        if (it.kind === 'whoami') { I.clues = it.clues.slice(0, it.clue + 1); I.pts = this.itemPoints(it); }
        if (it.kind === 'open' && it.hint && seg.phase !== 'ready') I.hint = it.hint;
        if (it.kind === 'number') I.unit = it.unit;
        if (it.reps) I.reps = it.reps.map(sid => [sid, s.students[sid] ? s.students[sid].name : '', s.students[sid] ? s.students[sid].team : '']);
        if (it.buzz) I.bz = [it.buzz.team, it.buzz.name];
        if (it.late && it.late.length) I.late = it.late.map(l => [s.students[l.sid] ? s.students[l.sid].name : '', l.dt]);
        if (it.kind === 'wheel' || it.kind === 'box') { I.team = it.team; I.rep = it.repSid && s.students[it.repSid] ? s.students[it.repSid].name : ''; if (it.res) { I.res = { t: it.res.t, k: it.res.k, i: it.res.idx != null ? it.res.idx : it.res.i }; } }
        if (it.kind === 'taboo') { I.team = it.team; I.rep = it.rep; I.repName = it.rep && s.students[it.rep] ? s.students[it.rep].name : ''; I.got = it.got; I.wi = it.wi; }
        if (it.shooter) { I.sh = [it.shooter.team, it.shooter.sid && s.students[it.shooter.sid] ? s.students[it.shooter.sid].name : '', it.shots, it.shooter.sid]; I.shl = it.shotLog; }
        if (it.kind === 'vault') { const now = this.now(); I.vt = { cr: Object.fromEntries(Object.entries(it.cracked).map(([t, c]) => [t, [c.ord, (s.students[c.by] || {}).name || '', c.at]])), lk: Object.fromEntries(Object.entries(it.lock).filter(([, u]) => u > now).map(([t, u]) => [t, u - now])), tr: it.tries, n: it.clues.length }; if (seg.phase === 'open' && it.cdist) I.vt.has = Object.keys(it.cdist).length; }
        if (it.kind === 'accuse' && seg.phase === 'open') I.c = null;
        if (it.kind === 'live') { I.desc = it.desc; I.places = it.places; if (it.voteRes) I.vr = it.voteRes; if (seg.phase === 'vote') I.vc = Object.keys(it.votes).length; }
        if (it.auction) { I.auc = 1; I.bids = it.bids; I.win = it.winner; I.bid = it.bid; if (seg.phase === 'bidding') { delete I.q; delete I.c; } }
        if (it.wagerQ) { I.wq = 1; I.wg = it.wagers; if (seg.phase === 'wager') { delete I.q; delete I.c; } }
        if (seg.mode === 'all' && seg.phase === 'open') { const ac = this.answerCounts(); I.an = ac.n; I.abt = ac.byTeam; }
        if (it.revealed) {
          if (it.a !== undefined) I.a = it.a;
          if (it.result) I.res2 = it.result;
          if (it.dist) I.dist = it.dist;
          if (it.fastest && s.students[it.fastest]) I.fast = s.students[it.fastest].name;
          if (it.bestSid && s.students[it.bestSid]) I.best = s.students[it.bestSid].name;
          if (it.src) I.src = it.src;
          if (it.streakBonus) I.streak = 1;
        }
        if (seg.phase === 'ready' && seg.mode === 'buzz' && it.kind !== 'whoami') { /* السؤال يظهر قبل فتح الاستباق */ }
        P.I = I;
      }
      return P;
    }
    roster() { return { v: this.s.v, L: Object.values(this.s.students).map(st => [st.sid, st.name, st.team, st.online ? 1 : 0]), M: Object.fromEntries(Object.entries(this.s.missions).map(([k, m]) => [k, m.done ? 1 : 0])) }; }
  }

  const API = { Engine, TEAM_COLORS, TEAM_NAMES, median };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.BENA_ENGINE = API;
})(typeof window !== 'undefined' ? window : globalThis);
