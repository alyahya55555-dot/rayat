/* ===== لوحة المشرف: منظمة وبسيطة ===== */
const Host = {
  init() {
    this.HS = uid(6); this.sideTab = 'room'; this.bcPeers = new Map(); this.handled = {}; this.display = 0; this.lastMsg = 0; this.sim = { on: false };
    this.sound = LS.get('bena.hostSound', false); this.pks = {}; this.keys = {};
    if (Crypt.ok) Crypt.keypair().then(kp => { this.kp = kp; this.changed(); }).catch(() => { });
    const saved = LS.get('bena.host', null);
    this.custom = LS.get('bena.custom', []); this.disabled = LS.get('bena.disabled', []);
    this.newEngine(null);
    this.root = $('#app');
    this.net = new Net('host');
    this.net.on('peers', ch => this.onPeers(ch));
    this.net.on('bcpres', (peer, pr, code, fp) => this.onBcPres(peer, pr, fp));
    this.net.on('bcbye', peer => this.onLeave(peer));
    this.net.on('foreignhost', fp => this.onForeignHost(fp));
    this.net.on('mqup', () => { this.broadcast(true); this.sendPriv(true); });
    this.net.on('status', () => this.renderBar());
    this.net.on('caps', () => this.onCaps());
    this.net.on('state', P => { if (P && P.code === this.e.s.code && P.hs !== this.HS) { this.otherHost = Date.now(); this.renderBar(); } });
    this.layout();
    this.net.init().then(() => { if (this.net.mq) this.net.mq.ensureKey().then(k => { if (k) { this.fp = k.fp; this.render(); this.broadcast(true); } }); });
    if (saved && saved.code && saved.ver === 5) this.resumeAsk(saved);
    setInterval(() => { this.e.tick(); this.tickUI(); }, 200);
    setInterval(() => this.broadcast(true), 3000);
    setInterval(() => this.sendPriv(true), 6000);
    setInterval(() => this.checkBc(), 3000);
    setInterval(() => this.simTick(), 350);
    window.addEventListener('beforeunload', () => this.saveNow());
    document.addEventListener('keydown', e => this.key(e));
  },
  newEngine(state) { this.e = new Engine(D, { state, custom: this.custom, disabled: this.disabled }); this.e.onChange = () => this.changed(); },
  resumeAsk(saved) {
    modal(`<div class="col"><div class="h" style="font-size:20px">مسابقة محفوظة</div><div class="note">وُجدت مسابقة سابقة (الرمز ${esc(saved.code)}، ${Object.keys(saved.students || {}).length} مشاركًا). هل تستأنفها؟</div><div class="row"><button class="btn pri" data-r>استئناف</button><button class="btn" data-close>مسابقة جديدة</button></div></div>`, (m, close) => {
      $('[data-r]', m).onclick = () => { close(); this.newEngine(saved); Object.values(this.e.s.students).forEach(s => { if (!s.sid.startsWith('bot-')) s.online = false; }); this.afterReset(); toast('تم الاستئناف'); };
    });
  },
  afterReset() { this.handled = {}; this.net.joinRoom(this.e.s.code); this.stage.prevScores = {}; this.changed(); },
  async onCaps() {
    await this.net.joinRoom(this.e.s.code); this.net.presence({ r: 'h', c: this.e.s.code }); this.renderBar();
    const u = this.net.user; if (u) { try { this.uidv = await u.id(); } catch (e) { } }
    if (this.net.db && this.uidv && !LS.get('bena.host', null)) { try { const d = await this.net.db.doc(`data/users/${this.uidv}/current`).get(); if (d.exists && d.data().s) { const s = JSON.parse(d.data().s); if (s && s.ver === 5 && s.code && !this.e.s.clock.startedAt) this.resumeAsk(s); } } catch (e) { } }
  },
  // ---------- استقبال الجوالات ----------
  onPeers(ch) {
    this.lastMsg = Date.now();
    [...ch.joined, ...ch.updated].filter(p => !p.sameTab && p.kind === 'viewer').sort((a, b) => a.updatedAt - b.updatedAt).forEach(p => this.onPres(p.peer, p.presence || {}, p.by));
    ch.left.forEach(p => this.onLeave(p.peer));
    this.display = ch.peers.filter(p => p.presence && p.presence.r === 'd').length;
    this.otherHostPeer = ch.peers.some(p => !p.isMe && p.presence && p.presence.r === 'h' && p.presence.c === this.e.s.code);
    if (ch.joined.length) this.broadcast(true);
    this.renderBar();
  },
  onBcPres(peer, pr, fp) { const isNew = !this.bcPeers.has(peer); this.bcPeers.set(peer, Date.now()); this.lastMsg = Date.now(); if (isNew) { setTimeout(() => this.broadcast(true), 50); setTimeout(() => this.sendPriv(true), 400); } if (pr.r === 'd') { this.bcDisplay = Date.now(); return; } this.onPres(peer, pr, fp || null); },
  checkBc() { const now = Date.now(); this.bcPeers.forEach((t, peer) => { if (now - t > 10000) { this.bcPeers.delete(peer); this.onLeave(peer); } }); },
  onLeave(peer) { const st = Object.values(this.e.s.students).find(s => s.peer === peer); if (st) this.e.setOffline(st.sid); },
  onForeignHost() { const s = this.e.s; if (!s.clock.startedAt && !Object.keys(s.students).length) { s.code = this.e.makeCode(); this.afterReset(); toast('الرمز كان مستخدمًا في مسابقة أخرى، فأنشأت رمزًا جديدًا: ' + s.code); } else { this.foreign = Date.now(); this.renderBar(); } },
  onPres(peer, pr, by) {
    const E = this.e; if (pr.r !== 's' || !pr.sid || pr.c !== E.s.code) return;
    const sid = String(pr.sid).slice(0, 16), ex = E.s.students[sid];
    if (ex && ex.by && by && ex.by !== by) return; // منع انتحال هوية طالب آخر
    const st = E.upsertStudent({ sid, name: pr.nm, want: pr.tw, peer, by }); if (!st) return;
    if (pr.pk && this.pks[sid] !== pr.pk) { this.pks[sid] = pr.pk; this.schedulePriv(); }
    const h = this.handled[sid] = this.handled[sid] || {}, it = E.item();
    const fresh = f => { const m = pr[f]; if (!m || typeof m.n !== 'number' || m.n <= (h[f] || 0)) return null; h[f] = m.n; return m; };
    let m;
    if ((m = fresh('bz')) && it && m.q === it.qid && m.o === it.bo) E.buzz(sid, m.q);
    if ((m = fresh('an')) && it) E.answer(sid, m.q, m.v);
    if ((m = fresh('vc')) && it) E.vaultTry(sid, m.q, m.c);
    if ((m = fresh('buy'))) E.buy(st.team, String(m.k), sid);
    if ((m = fresh('ord'))) E.order(st.team, m, sid);
    if ((m = fresh('oc'))) E.cancelOrder(st.team, sid);
    if ((m = fresh('tn'))) E.setTeamName(st.team, String(m.v || ''), sid);
    if ((m = fresh('wg')) && it && m.q === it.qid) E.setWager(st.team, m.v, sid);
    if ((m = fresh('wp')) && it && m.q === it.qid) E.wagerPick(st.team, m.v, sid);
  },
  // ---------- البث والحفظ ----------
  changed() {
    if (!this.bq) this.bq = setTimeout(() => { this.bq = null; this.broadcast(false); }, 40);
    if (!this.rq) this.rq = requestAnimationFrame(() => { this.rq = null; this.render(); });
    if (!this.sq) this.sq = setTimeout(() => { this.sq = null; this.saveNow(); }, 500);
    this.schedulePriv();
    if (this.e.lastSummary && this.e.lastSummary !== this.archived) { this.archived = this.e.lastSummary; this.archive(this.e.lastSummary); }
  },
  pubState() { const P = this.e.pub(); P.hs = this.HS; if (this.kp) P.hk = this.kp.pub; if (this.fp) P.fp = this.fp; return P; },
  broadcast(force) {
    const P = this.pubState(); this.net.emit('state', P);
    const R = this.e.roster(), rs = JSON.stringify(R.L);
    if (force || rs !== this.lastRoster) { this.lastRoster = rs; this.net.emit('roster', R); this.stage.setRoster(R); if (this.present) this.present.setRoster(R); }
    this.stage.update(P); if (this.present) this.present.update(P);
  },
  schedulePriv() { if (this.pq) return; this.pq = setTimeout(() => { this.pq = null; this.sendPriv(false); }, 120); },
  // رسائل خاصة مشفّرة لكل جوال (تلميحات الخزنة)
  async sendPriv(force) {
    if (this.privBusy) { this.privAgain = true; return; } this.privBusy = true;
    try {
      const data = this.e.privData(); this.privCache = this.privCache || {}; const out = {};
      for (const [sid, obj] of Object.entries(data)) {
        const pt = JSON.stringify(obj), pk = this.pks[sid], c = this.privCache[sid];
        if (c && c.pt === pt && c.pk === pk) { out[sid] = c.ct; continue; }
        if (!pk) continue; let ct = null;
        if (pk !== 'none' && this.kp) { try { if (!this.keys[sid] || this.keys[sid].pk !== pk) this.keys[sid] = { pk, k: await Crypt.derive(this.kp.priv, pk) }; ct = 'e:' + await Crypt.enc(this.keys[sid].k, obj); } catch (e) { ct = null; } }
        if (!ct) { if (pk !== 'none') continue; ct = 'p:' + pt; }
        this.privCache[sid] = { pt, pk, ct }; out[sid] = ct;
      }
      const sig = JSON.stringify(out); if (!force && sig === this.lastPrivSig) return; this.lastPrivSig = sig; this.privSeq = (this.privSeq || 0) + 1;
      let chunk = {}, size = 0; const send = () => { if (Object.keys(chunk).length) this.net.emit('priv', { h: this.HS, code: this.e.s.code, n: this.privSeq, m: chunk }); chunk = {}; size = 0; };
      for (const [sid, ct] of Object.entries(out)) { const l = sid.length + ct.length + 8; if (size + l > 3300) send(); chunk[sid] = ct; size += l; }
      send();
    } finally { this.privBusy = false; if (this.privAgain) { this.privAgain = false; this.schedulePriv(); } }
  },
  saveNow() {
    const s = this.e.s; if (!LS.set('bena.host', s)) LS.set('bena.host', Object.assign({}, s, { undo: s.undo.slice(-5) }));
    const now = Date.now();
    if (this.net.db && this.uidv && (!this.lastDb || now - this.lastDb > 4000) && !this.dbBusy) { this.dbBusy = true; this.lastDb = now; const lite = JSON.stringify(Object.assign({}, s, { undo: [] })); if (lite.length < 240000) this.net.db.doc(`data/users/${this.uidv}/current`).set({ s: lite, at: now }).catch(() => { }).finally(() => { this.dbBusy = false; }); else this.dbBusy = false; }
  },
  archive(sum) { const list = LS.get('bena.archive', []); list.push(sum); LS.set('bena.archive', list.slice(-50)); },
  saveBank() { LS.set('bena.custom', this.custom); LS.set('bena.disabled', this.disabled); this.e.buildBank(this.custom, this.disabled); },
  // ---------- طلاب افتراضيون للتجربة فقط ----------
  addBots(n) { const E = this.e, base = Object.keys(E.s.students).filter(k => k.startsWith('bot-')).length; for (let i = 0; i < n; i++) E.upsertStudent({ sid: 'bot-' + (base + i + 1), name: '🤖 تجريبي ' + (base + i + 1), want: null, peer: 'sim' }); this.sim.on = true; },
  removeBots() { const E = this.e; Object.keys(E.s.students).filter(k => k.startsWith('bot-')).forEach(k => E.removeStudent(k)); this.sim.on = false; },
  simTick() {
    if (!this.sim.on) return; const E = this.e, s = E.s, seg = s.seg, it = E.item(); if (!seg) return;
    const bots = Object.values(s.students).filter(x => x.sid.startsWith('bot-'));
    const capBot = tid => { const c = s.captain[tid]; return c && c.startsWith('bot-') ? c : null; };
    if (seg.g === 'council' && seg.phase === 'council' && !this.demoOn && Math.random() < .12) s.teams.forEach(t => {
      const c = capBot(t.id); if (!c || Math.random() < .5) return; const v = E.vil(t.id);
      if (!seg.orders[t.id] && Math.random() < .35 && v.gold >= 30) { const others = s.teams.filter(x => x.id !== t.id && E.attacksOn(x.id) < D.WAR.maxPerTarget); if (others.length) { const to = E.pick(others).id, tv = E.vil(to), type = D.ATTACK_KEYS.slice().sort((a, b) => tv.b[D.ATTACKS[a].def] - tv.b[D.ATTACKS[b].def])[0]; E.order(t.id, { type, to, units: Math.min(D.WAR.maxUnits, Math.max(2, Math.floor(v.gold * .4 / 10))) }, c); } return; }
      const k = D.BUILD_KEYS.filter(k => { const x = E.buildCost(t.id, k); return x != null && x <= v.gold; }); if (k.length) E.buy(t.id, E.pick(k), c);
    });
    if (!it) return;
    if (seg.mode === 'buzz' && seg.phase === 'open' && !it.wagerQ && Math.random() < .1) { const c = bots.filter(b => E.canBuzz(b.sid)); if (c.length) E.buzz(E.pick(c).sid, it.qid); }
    if (seg.mode === 'all' && seg.phase === 'open' && it.answers) bots.forEach(b => { if (it.answers[b.sid] === undefined && Math.random() < .2) E.answer(b.sid, it.qid, Math.random() < .65 ? it.a : Math.floor(Math.random() * it.c.length)); });
    if (it.kind === 'vault' && seg.phase === 'open') { const done = new Set(); bots.forEach(b => { if (!done.has(b.team) && !it.cracked[b.team] && Math.random() < .03) { done.add(b.team); E.vaultTry(b.sid, it.qid, Math.random() < .6 ? it.a : '1111'); } }); }
    if (it.wagerQ && seg.phase === 'wager') s.teams.forEach(t => { const c = capBot(t.id); if (c && it.wagers[t.id] == null && Math.random() < .2) E.setWager(t.id, Math.round(E.maxWager(t.id) * Math.random()), c); });
    if (it.wagerQ && seg.phase === 'open') s.teams.forEach(t => { const c = capBot(t.id); if (c && it.picks[t.id] === undefined && Math.random() < .2) E.wagerPick(t.id, Math.random() < .6 ? it.a : 0, c); });
  },
  // ---------- التشغيل التجريبي الكامل: طلاب افتراضيون + مشرف آلي يمرّ على كل الفقرات ----------
  demo(on = true) {
    clearInterval(this.demoT); this.demoOn = on; if (!on) { this.render(); return; }
    const E = this.e, s = E.s;
    if (s.seg) { toast('التشغيل التجريبي يبدأ من شاشة الانتظار: اضغط «مسابقة جديدة» أولًا'); this.demoOn = false; return; }
    const names = ['الصقور', 'السهم', 'الرواد', 'الهمّة']; E.setTeams(s.teams.map((t, i) => ({ ...t, name: names[i] || t.name })));
    const cnt = { kickoff: 3, observe: 2, arena: 3, cipher: 1, final: 2 }; s.plan.forEach(p => { if (cnt[p.g]) p.count = cnt[p.g]; }); E.touch();
    if (!Object.keys(s.students).some(k => k.startsWith('bot-'))) this.addBots(12); this.sim.on = true;
    this.dk = ''; this.dt = Date.now(); this.demoT = setInterval(() => this.demoStep(), 500); toast('🎬 بدأ التشغيل التجريبي');
  },
  demoStep() {
    const E = this.e, s = E.s, seg = s.seg, it = E.item(), now = Date.now();
    if (!this.demoOn) return; if (!seg) return this.act('start');
    const key = [s.planIdx, seg.g, seg.phase, seg.idx, seg.revealed].join('|'); if (key !== this.dk) { this.dk = key; this.dt = now; this.dDid = false; }
    const age = (now - this.dt) / 1000, go = (sec, a, arg) => { if (age >= sec) { this.dt = now + 1e9; this.act(a, arg); } }, ph = seg.phase;
    if (seg.g === 'opening') return go({ welcome: 5, explain: 6, open: 7, reveal: 4, done: 3 }[ph] || 4, ph === 'done' ? 'nextseg' : 'next');
    if (seg.g === 'council') {
      if (ph === 'intro') return go(5, 'next');
      if (ph === 'council') { if (!this.dDid && age > 2) { this.dDid = true; this.demoCouncil(); } return go(11, 'next'); }
      if (ph === 'battle') return go(4 + 3.8 * (seg.results || []).length + 3, 'next');
      return go(2, 'nextseg');
    }
    if (seg.g === 'crown') { if (ph === 'winner') { if (age > 14) this.demo(false); return; } return go({ island: 7, highlights: 9, reveal: 4 }[ph] || 4, 'next'); }
    if (ph === 'intro') return go(5, 'next');
    if (ph === 'done') return go(3, 'nextseg');
    if (!it) return;
    if (it.kind === 'vault') { if (ph === 'ready') return go(2, 'open'); if (ph === 'open') return go(16, 'reveal'); if (ph === 'reveal') return go(5, 'next'); return; }
    if (it.wagerQ) { if (ph === 'wager') return go(6, 'lockw'); if (ph === 'open') return go(7, 'judgew'); if (ph === 'reveal') return go(5, 'next'); return; }
    if (ph === 'ready') return go(2, 'open');
    if (ph === 'show') return;
    if (ph === 'open' && seg.mode === 'all') return go(7, 'lock');
    if (ph === 'open') { if (age > 8) { const el = it.eligible.filter(t => !it.locked.includes(t)); if (el.length) go(0, 'mbuzz', E.pick(el)); else go(0, 'reveal'); } return; }
    if (ph === 'answering') return go(2.5, 'judge', Math.random() < .72 ? '1' : '0');
    if (ph === 'paused') return go(2, 'reopen');
    if (ph === 'reveal') return go(4.5, 'next');
  },
  // قرارات قادة افتراضيين بخطة واضحة: يبنون ما ينقصهم ويهاجم بعضهم أضعف دفاع عند المتصدر
  demoCouncil() {
    const E = this.e, s = E.s, W = D.WAR, rk = E.ranking();
    s.teams.forEach((t, i) => {
      const c = s.captain[t.id]; if (!c) return; const v = E.vil(t.id);
      const want = (s.seg.n + i) % 2 ? ['wall', 'tower', 'well', 'farm', 'house', 'market'] : ['farm', 'house', 'market', 'wall', 'tower', 'well'];
      let built = 0; for (const k of want) { const x = E.buildCost(t.id, k); if (built < 2 && x != null && x <= v.gold - (i % 2 ? 0 : 20)) { E.buy(t.id, k, c); built++; } }
      if ((i + s.seg.n) % 3 === 0 || v.gold < W.unitCost * 2) return;
      const tgt = rk.map(r => r.id).filter(id => id !== t.id && E.attacksOn(id) < W.maxPerTarget)[0]; if (!tgt) return;
      const tv = E.vil(tgt), type = D.ATTACK_KEYS.slice().sort((a, b) => tv.b[D.ATTACKS[a].def] - tv.b[D.ATTACKS[b].def])[0];
      E.order(t.id, { type, to: tgt, units: Math.min(W.maxUnits, Math.max(2, Math.floor(E.vil(t.id).gold * .6 / W.unitCost))) }, c);
    });
  },
  // ---------- الواجهة ----------
  layout() {
    this.root.innerHTML = `<div class="host"><div class="hbar" id="hbar"></div><div class="hmain"><div class="col" style="min-width:0"><div class="card" id="sched"></div><div class="card deck" id="deck"></div><div id="teams" class="tgrid"></div></div><div class="col" style="min-width:0"><div class="preview"><div class="stage-wrap" id="pv"></div></div><div class="mut" style="font-size:12px;text-align:center">معاينة شاشة العرض</div><div class="card" id="side"></div></div></div></div>`;
    this.stage = new Stage($('#pv'), { sound: false });
    this.root.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b && !b.disabled) { SFX.unlock(); this.act(b.dataset.act, b.dataset.arg, b); } });
    this.root.addEventListener('change', e => this.onChangeInput(e.target));
    this.render();
  },
  busy(el) { const a = document.activeElement; return a && el && el.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName); },
  render() { this.renderBar(); this.renderSched(); if (!this.busy($('#deck'))) this.renderDeck(); if (!this.busy($('#teams'))) this.renderTeams(); if (!this.busy($('#side'))) this.renderSide(); },
  renderBar() {
    const E = this.e, l = this.net.label(), sc = E.schedule();
    const disp = this.display || (this.bcDisplay && Date.now() - this.bcDisplay < 10000);
    const on = Object.values(E.s.students).filter(s => s.online).length, total = Object.keys(E.s.students).length;
    const rem = 60 - sc.elapsed, late = sc.late > 1;
    $('#hbar').innerHTML = `<div class="brand"><div class="lg">${Brand.logoImg()}</div>${esc(E.s.title)}</div><span class="code-badge" title="رمز الغرفة">${esc(E.s.code)}</span>
      <span class="pill"><span class="dot ${l.cls}"></span>${esc(l.t)}</span><span class="pill">👥 ${on}/${total}</span>
      <span class="pill"><span class="dot ${disp ? 'on' : ''}"></span>الشاشة ${disp ? 'متصلة' : 'غير متصلة'}</span>
      ${E.s.clock.startedAt ? `<span class="pill ${late ? 'late' : ''}" title="الوقت المنقضي من 60 دقيقة">⏱ ${fmtMin(sc.elapsed)} / 60:00${late ? ' — متأخر ' + Math.round(sc.late) + ' د' : ''}</span>` : ''}
      ${(this.foreign && Date.now() - this.foreign < 10000) || this.otherHostPeer || (this.otherHost && Date.now() - this.otherHost < 8000) ? '<span class="pill late">⚠️ لوحة أخرى تبث بالرمز نفسه</span>' : ''}
      <span class="grow"></span>
      <button class="btn sm" data-act="undo" ${E.s.undo.length ? '' : 'disabled'} title="Ctrl+Z">↶ تراجع</button>
      <button class="btn sm" data-act="sound">${this.sound ? '🔊' : '🔇'}</button>
      <button class="btn sm" data-act="displayhelp">🖥️ فتح شاشة العرض</button>
      <button class="btn sm gold" data-act="present">▶ العرض في هذه النافذة</button>`;
  },
  renderSched() {
    const E = this.e, sc = E.schedule(), cur = sc.rows[E.s.planIdx];
    $('#sched').innerHTML = `<div class="sched">${sc.rows.map(r => `<button class="s ${r.i === E.s.planIdx ? 'cur' : ''} ${r.i < E.s.planIdx ? 'past' : ''}" data-act="goseg" data-arg="${r.i}"><b>${esc(r.name)}</b><span>${r.min} د</span></button>`).join('')}</div>${cur && E.s.clock.segStart ? `<div class="mut" style="font-size:12px;margin-top:6px">الفقرة الحالية: ${fmtMin(sc.segElapsed)} من ${cur.min}:00 ${sc.segElapsed > cur.min ? '<b style="color:var(--warn)">— تجاوزت وقتها: اختصرها أو تخطَّ أسئلة</b>' : ''}</div>` : ''}`;
  },
  // ---------- لوحة التحكم ----------
  renderDeck() {
    const E = this.e, s = E.s, seg = s.seg, it = E.item(), el = $('#deck'), T = s.teams;
    const timer = s.timer ? `<div class="row"><span class="timerbox" data-htm></span><button class="btn sm" data-act="${s.timer.paused != null ? 'resume' : 'pause'}">${s.timer.paused != null ? '▶ متابعة' : '⏸ إيقاف'}</button><button class="btn sm" data-act="add10">+10ث</button></div>` : '';
    const big = (label, act, arg = '') => `<button class="btn pri big" data-act="${act}" data-arg="${arg}">${label}</button>`;
    let h = '';
    if (!seg) h = `<div class="h2">جاهز للبدء</div><div class="note">اعرض شاشة الانضمام، وانتظر دخول الطلاب (تبويب «الغرفة»)، ثم ابدأ.</div><div class="ctl">${big('▶ ابدأ المسابقة', 'start')}</div>`;
    else if (seg.g === 'opening') {
      const steps = { welcome: ['الانضمام وعرض الجزيرة', 'شرح الفكرة ←'], explain: ['شرح الفكرة (دقيقتان)', 'سؤال تجريبي بلا نقاط ←'], open: ['سؤال تجريبي: الطلاب يجيبون', 'إغلاق وكشف الإجابة ←'], reveal: ['نتيجة السؤال التجريبي', 'إنهاء الافتتاح ←'], done: ['الجزيرة جاهزة', 'الجولة الأولى: ' + this.nextName() + ' ←'] };
      const [t, b] = steps[seg.phase] || ['', 'التالي ←'];
      h = `<div class="h2">🎬 الافتتاح: ${t}</div>${seg.phase === 'themes' ? `<div class="row wrap">${T.map(x => { const th = E.vil(x.id).theme; return `<span class="pill" style="border-bottom:3px solid ${x.color}">${esc(x.name)}: ${th ? D.THEMES[th].name : '…'}</span>`; }).join('')}</div>` : ''}${seg.phase === 'welcome' ? '<div class="note">تأكد أن كل فريق له قائد (يظهر بالتاج في بطاقات الفرق). القائد يستطيع كتابة اسم قريته من جواله الآن.</div>' : ''}${seg.phase === 'open' ? (() => { const ac = E.answerCounts(); return `<div class="row wrap">${T.map(t => `<span class="pill" style="border-bottom:3px solid ${t.color}">${esc(t.name)}: ${ac.byTeam[t.id] || 0}/${E.teamMembers(t.id, true).length}</span>`).join('')}<b>${ac.n} إجابة</b></div><div class="note">من لم تظهر إجابته فجواله لا يصل: ساعده الآن قبل البدء.</div>`; })() : ''}<div class="ctl">${big(b, seg.phase === 'done' ? 'nextseg' : 'next')}</div>` + timer;
    } else if (seg.g === 'council') {
      const A = D.ATTACKS, W = D.WAR;
      if (seg.phase === 'intro') h = `<div class="h2">🏛️ مجلس القرية ${seg.n || ''}</div><div class="note">${D.COUNCIL_HOW.map(esc).join('<br>')}</div><div class="ctl">${big('افتح المجلس (' + W.councilSec + ' ث) ←', 'next')}<button class="btn" data-act="nextseg">تخطي المجلس</button></div>`;
      else if (seg.phase === 'council') h = `<div class="h2">🏛️ المجلس مفتوح — القادة يقررون</div><div class="col">${T.map(t => { const o = seg.orders[t.id], g = (seg.gains || {})[t.id] || {}; return `<div class="row"><b style="color:${t.color};min-width:90px">${esc(t.name)}</b><span class="mut">💰 ${E.vil(t.id).gold}</span>${g.farm ? `<span class="pill">🌾 +${g.farm}</span>` : ''}${g.aid ? `<span class="pill">🤝 +${g.aid}</span>` : ''}${E.vil(t.id).shield ? '<span class="pill">🛡️ درع</span>' : ''}<span class="grow"></span>${o ? `<span class="pill gold-p">${A[o.type].icon} ${o.units} → ${esc(E.team(o.to).name)}</span>` : '<span class="mut">لا هجوم</span>'}</div>`; }).join('')}</div><div class="note">الأوامر سرية عن الطلاب وتظهر لك فقط. ينتهي المجلس تلقائيًا بانتهاء الوقت.</div><div class="ctl">${big('⚔️ إنهاء المجلس وبدء المعركة ←', 'next')}</div>` + timer;
      else if (seg.phase === 'battle') h = `<div class="h2">⚔️ المعركة تُعرض على الشاشة</div><div class="col">${(seg.results || []).map(r => `<div class="row"><b style="color:${E.team(r.from).color}">${esc(E.team(r.from).name)}</b> ${A[r.type].icon} <b style="color:${E.team(r.to).color}">${esc(E.team(r.to).name)}</b><span class="mut">${r.units} ${A[r.type].units} · أوقف ${Math.min(r.units, r.block)}</span><span class="grow"></span><b>${r.held ? 'صمود +' + r.held : r.type === 'raid' ? r.gold + ' 💰' : r.type === 'catapult' ? '−' + r.pts : (r.off || []).map(k => D.BUILD[k].name).join('، ')}</b></div>`).join('') || '<div class="mut">لم يهاجم أحد</div>'}</div><div class="ctl">${big('متابعة ←', 'next')}</div>`;
      else h = `<div class="h2">✅ انتهى المجلس</div><div class="ctl">${big('الجولة التالية: ' + this.nextName() + ' ←', 'nextseg')}</div>`;
    } else if (seg.g === 'crown') {
      const tie = E.tieInfo(), lbl = { island: 'ألقاب التتويج ←', highlights: 'كشف الترتيب ←', reveal: 'كشف المركز التالي ←' }[seg.phase];
      h = `<div class="h2">🏆 التتويج</div>${tie && seg.phase === 'winner' ? `<div class="warnbox">تعادل في الصدارة. شغّل جولة كسر التعادل (3 أسئلة استباق للمتعادلين).</div>` : ''}<div class="ctl">${lbl ? big(lbl, 'next') : '<span class="pill">انتهت المسابقة وحُفظت النتيجة</span>'}${tie ? '<button class="btn gold" data-act="tiebreak">⚖️ كسر التعادل</button>' : ''}</div>`;
    } else if (seg.phase === 'intro') {
      const def = E.gameDef(seg.g) || {};
      h = `<div class="h2">${esc(def.icon || '⚖️')} ${esc(E.segName(seg.g))}</div><div class="note">${(def.how || ['الفرق المتعادلة فقط.']).map(esc).join('<br>')}</div><div class="ctl">${big('ابدأ الجولة (' + seg.items.length + ') ←', 'next')}<button class="btn" data-act="nextseg">تخطي الجولة</button></div>`;
    } else if (seg.phase === 'done') h = `<div class="h2">✅ انتهت جولة ${esc(E.segName(seg.g))}</div><div class="note">وقت مناسب لشراء المباني: تظهر حركة البناء الآن على الشاشة.</div><div class="ctl">${seg.g === 'tiebreak' ? big('العودة إلى التتويج ←', 'backcrown') : big('الجولة التالية: ' + this.nextName() + ' ←', 'nextseg')}</div>`;
    else if (it) h = this.itemDeck(seg, it, timer);
    el.innerHTML = h;
  },
  nextName() { const p = this.e.s.plan[this.e.s.planIdx + 1]; return p ? this.e.segName(p.g) : '—'; },
  answerText(it) { if (it.kind === 'vault') return it.a; if (it.c) return `${LET[it.a]}) ${it.c[it.a]}`; return ''; },
  itemDeck(seg, it, timer) {
    const E = this.e, s = E.s, T = s.teams, ph = seg.phase, tn = id => (E.team(id) || {}).name || '';
    const big = (label, act, arg = '', cls = 'pri') => `<button class="btn ${cls} big" data-act="${act}" data-arg="${arg}">${label}</button>`;
    const head = `<div class="row wrap"><span class="pill">${esc(E.segName(seg.g))} — ${seg.idx + 1}/${seg.items.length}</span>${it.pair ? `<span class="pill">⚔️ ${esc(tn(it.pair[0]))} × ${esc(tn(it.pair[1]))}</span>` : ''}${it.treasure ? '<span class="pill gold-p">⛵ سفينة الكنز</span>' : ''}${it.wagerQ ? '<span class="pill gold-p">🎲 الرهان</span>' : ''}<span class="grow"></span><button class="btn sm" data-act="skip">تخطي السؤال</button><button class="btn sm" data-act="endseg">إنهاء الجولة الآن</button></div>`;
    const ans = this.answerText(it) ? `<div class="ans-secret">🔒 الإجابة (لك فقط): ${esc(this.answerText(it))}${it.src ? `<small>المصدر: ${esc(it.src)}</small>` : ''}</div>` : '';
    let q = it.q && it.kind !== 'vault' ? `<div class="q">${esc(it.q)}</div>` : '';
    if (it.c) q += `<div class="opts">${it.c.map((c, i) => `<span class="${i === it.a ? 'ok' : ''}">${LET[i]}) ${esc(c)}</span>`).join('')}</div>`;
    let c = head;
    if (it.kind === 'vault') {
      c += `<div class="ans-secret">🔒 الرمز: <span style="direction:ltr;letter-spacing:4px">${esc(it.a)}</span><small>${it.clues.map(esc).join(' · ')}</small></div>`;
      if (ph === 'ready') c += `<div class="ctl">${big('🔓 بدء فك الشفرة', 'open')}</div>`;
      if (ph === 'open' || ph === 'reveal') c += `<div class="col">${T.map(t => { const cr = it.cracked[t.id]; return `<div class="row"><b style="color:${t.color};min-width:70px">${esc(t.name)}</b><span>${cr ? '✅ المركز ' + cr.ord : (it.tries[t.id] || 0) + ' محاولة'}</span>${!cr && ph === 'open' ? `<button class="chipbtn" data-act="vaultman" data-arg="${t.id}">اعتماد يدوي</button>` : ''}</div>`; }).join('')}</div>`;
      if (ph === 'open') c += `<div class="ctl"><button class="btn" data-act="reveal">إنهاء وكشف الرمز</button></div>`;
      if (ph === 'reveal') c += `<div class="ctl">${big(seg.idx + 1 >= seg.items.length ? 'إنهاء الجولة ←' : 'الخزنة التالية ←', 'next')}</div>`;
      return c + timer;
    }
    if (it.wagerQ) {
      c += q + ans;
      if (ph === 'wager') c += `<div class="note">القادة يراهنون من جوالاتهم (حتى ربع نقاط الفريق). يمكنك الإدخال نيابةً عنهم:</div><div class="col">${T.map(t => `<label class="row"><b style="color:${t.color};min-width:70px">${esc(t.name)}</b><input class="in" type="number" min="0" style="width:90px" data-wager="${t.id}" value="${it.wagers[t.id] != null ? it.wagers[t.id] : ''}"><span class="mut">الحد ${E.maxWager(t.id)}</span>${it.wagers[t.id] != null ? '✓' : ''}</label>`).join('')}</div><div class="ctl">${big('تثبيت الرهانات وعرض السؤال ←', 'lockw')}</div>`;
      if (ph === 'open') c += `<div class="col">${T.map(t => `<label class="row"><b style="color:${t.color};min-width:70px">${esc(t.name)}</b><span class="mut">رهان ${it.wagers[t.id] || 0}</span><select class="in" data-wpick="${t.id}"><option value="">${it.picks[t.id] !== undefined ? LET[it.picks[t.id]] + ' (من الجوال)' : '— لم يجب —'}</option>${it.c.map((x, i) => `<option value="${i}">${LET[i]}) ${esc(x)}</option>`).join('')}</select></label>`).join('')}</div><div class="ctl">${big('كشف النتيجة ←', 'judgew')}</div>`;
      if (ph === 'reveal') c += `<div class="ctl">${big('إنهاء الجولة ←', 'next')}</div>`;
      return c + timer;
    }
    c += q + ans;
    const manual = () => `<div class="row wrap"><span class="mut" style="font-size:12px">منح الأسبقية يدويًا (طوارئ):</span>${T.filter(t => it.eligible.includes(t.id) && !it.locked.includes(t.id)).map(t => `<button class="chipbtn" style="border-bottom:3px solid ${t.color}" data-act="mbuzz" data-arg="${t.id}">${esc(t.name)}</button>`).join('')}</div>`;
    if (ph === 'ready') c += `<div class="ctl">${big(it.obs ? '👁️ عرض الصورة' : seg.mode === 'buzz' ? '⚡ فتح الاستباق' : '📱 فتح الإجابة', 'open')}</div>` + (seg.mode === 'buzz' ? manual() : '');
    if (ph === 'show') c += `<div class="note">الصورة معروضة… ثم يظهر السؤال تلقائيًا.</div><button class="btn" data-act="aftershow">إظهار السؤال الآن</button>`;
    if (ph === 'open' && seg.mode === 'all') { const ac = E.answerCounts(); c += `<div class="row wrap">${T.map(t => `<span class="pill" style="border-bottom:3px solid ${t.color}">${esc(t.name)}: ${ac.byTeam[t.id] || 0}/${E.teamMembers(t.id, true).length}</span>`).join('')}<b>${ac.n} إجابة</b></div><div class="ctl">${big('إغلاق وكشف النتيجة', 'lock')}</div>`; }
    if (ph === 'open' && seg.mode === 'buzz') c += `<div class="ctl"><button class="btn" data-act="reveal">كشف الإجابة دون نقاط</button></div>` + manual();
    if (ph === 'answering') { const st = it.buzz.sid ? s.students[it.buzz.sid] : null; const pts = it.treasure ? '+' + (s.settings.treasureGold || 40) + ' ذهب' : '+' + E.itemPoints(it); c += `<div class="buzzed" style="--tc:${(E.team(it.buzz.team) || {}).color}">⚡ ${esc(tn(it.buzz.team))}${st ? ' — ' + esc(st.name) : ''}</div>${it.late && it.late.length ? `<div class="note">بعده: ${it.late.map(l => esc((s.students[l.sid] || {}).name || '') + ' +' + (l.dt / 1000).toFixed(2) + 'ث').join('، ')}</div>` : ''}<div class="ctl"><button class="btn ok big" data-act="judge" data-arg="1">✔ صحيحة (${pts})</button><button class="btn bad big" data-act="judge" data-arg="0">✘ خاطئة</button></div>`; }
    if (ph === 'paused') c += `<div class="warnbox">إجابة خاطئة من ${it.locked.map(tn).join('، ')}</div><div class="ctl">${big('⚡ إعادة الفتح للفريق الآخر', 'reopen')}<button class="btn" data-act="reveal">كشف الإجابة</button></div>` + manual();
    if (ph === 'reveal') c += `<div class="ctl">${big(seg.idx + 1 >= seg.items.length ? 'إنهاء الجولة ←' : 'السؤال التالي ←', 'next')}</div>`;
    return c + timer;
  },
  // ---------- بطاقات الفرق ----------
  renderTeams() {
    const E = this.e, s = E.s, sc = E.scores(), rk = E.ranking();
    $('#teams').innerHTML = s.teams.map(t => {
      const v = E.vil(t.id), r = rk.find(x => x.id === t.id), mem = E.teamMembers(t.id), cap = s.captain[t.id], on = mem.filter(m => m.online).length;
      return `<div class="tcard" style="--tc:${t.color}"><div class="row">${!s.seg || s.seg.g === 'opening' ? `<input class="in sm grow" style="font-weight:800" value="${esc(t.name)}" data-tname="${s.teams.indexOf(t)}" title="اسم القرية">` : `<b class="h" style="font-size:18px">${esc(t.name)}</b>`}<span class="pill">#${r ? r.rank : ''}</span><span class="grow"></span><span class="sc">${sc[t.id]}</span></div>
        <div class="row" style="justify-content:space-between;font-size:13px"><span>💰 <b>${v.gold}</b> ذهب</span><span class="mut">👥 ${on}/${mem.length}</span>${!s.seg || s.seg.g === 'opening' ? `<select class="in sm" data-theme-t="${t.id}" title="طابع القرية (شكل فقط)">${D.THEME_KEYS.map(k => `<option value="${k}" ${v.theme === k ? 'selected' : ''}>قرية ${D.THEMES[k].name}</option>`).join('')}</select>` : `<span class="mut">${v.theme ? 'قرية ' + D.THEMES[v.theme].name : ''}</span>`}</div>
        <div class="tvil">${villageSVG({ id: t.id, color: t.color, theme: v.theme, name: t.name }, v.b, { gold: v.gold, shield: v.shield, off: v.off })}</div>
        <label class="row" style="font-size:12px">👑 القائد <select class="in sm" data-cap="${t.id}">${mem.length ? mem.map(m => `<option value="${m.sid}" ${m.sid === cap ? 'selected' : ''}>${esc(m.name)}${m.online ? '' : ' (غير متصل)'}</option>`).join('') : '<option>— لا أعضاء —</option>'}</select></label>
        <div class="cards-row"><button class="chipbtn win" data-act="live" data-arg="${t.id}" title="فاز في تحدٍّ حضوري: +20 نقطة و+20 ذهب">🏆 فوز حضوري</button><button class="chipbtn" data-act="adj" data-arg="${t.id}|10" title="نقاط فقط">+10 نقاط</button><button class="chipbtn" data-act="adj" data-arg="${t.id}|-10" title="خصم نقاط">−10 نقاط</button><button class="chipbtn" data-act="gold" data-arg="${t.id}|10">+10 ذهب</button><button class="chipbtn" data-act="buildm" data-arg="${t.id}">🏗️ بناء</button></div></div>`;
    }).join('');
  },
  // ---------- التبويبات ----------
  renderSide() {
    const tabs = [['room', 'الغرفة'], ['plan', 'البرنامج'], ['bank', 'الأسئلة'], ['log', 'السجل'], ['settings', 'الإعدادات'], ['help', 'الدليل']];
    $('#side').innerHTML = `<div class="tabs">${tabs.map(t => `<button class="tab ${this.sideTab === t[0] ? 'on' : ''}" data-act="tab" data-arg="${t[0]}">${t[1]}</button>`).join('')}</div><div id="sidebody">${this['side_' + this.sideTab]()}</div>`;
  },
  side_room() {
    const E = this.e, s = E.s, url = joinUrl(s.code, this.fp), bots = Object.keys(s.students).filter(k => k.startsWith('bot-')).length;
    const byTeam = s.teams.map(t => { const mem = E.teamMembers(t.id); return `<div style="margin-top:8px"><b style="color:${t.color}">${esc(t.name)}</b> <span class="mut">(${mem.length})</span><div class="row wrap" style="margin-top:4px">${mem.map(m => `<span class="member"><span class="dot ${m.online ? 'on' : ''}"></span>${s.captain[t.id] === m.sid ? '👑' : ''}${esc(m.name)}<select class="in sm" data-move="${m.sid}">${s.teams.map(x => `<option value="${x.id}" ${x.id === m.team ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select><button class="chipbtn" data-act="kick" data-arg="${m.sid}" title="إزالة">✕</button></span>`).join('') || '<span class="mut" style="font-size:12px">لا أحد بعد</span>'}</div></div>`; }).join('');
    return `<div class="row" style="align-items:flex-start;gap:12px"><div class="qrbox">${url ? qrSvg(url) : '<div style="color:#333;font-size:11px;padding:8px">ضع رابط الصفحة في الإعدادات</div>'}</div><div class="col grow" style="min-width:0"><div>الرمز: <span class="code-badge">${esc(s.code)}</span></div>${url ? `<div class="mut" style="font-size:11px;direction:ltr;word-break:break-all">${esc(url)}</div><button class="btn sm" data-act="copy" data-arg="${esc(url)}">نسخ رابط الانضمام</button>` : ''}<div class="row wrap"><button class="btn sm" data-act="newcode" ${s.clock.startedAt ? 'disabled' : ''}>رمز جديد</button><button class="btn sm" data-act="balance">🎲 قرعة متوازنة</button><label class="row" style="font-size:12px"><input type="checkbox" data-set="allowTeamChoice" ${s.settings.allowTeamChoice ? 'checked' : ''}> الطالب يختار فريقه</label></div></div></div>
      ${IN_CLAUDE ? '<div class="infobox">داخل Claude: يحتاج كل طالب حساب Claude ودعوة إلى الصفحة. للدخول بلا حسابات استخدم النسخة المنشورة على GitHub Pages.</div>' : '<div class="infobox">يدخل الطلاب بالرابط أو رمز QR دون أي حساب.</div>'}
      ${byTeam}
      <details class="card" style="margin-top:10px;background:rgba(255,255,255,.03)"><summary><b>🤖 طلاب افتراضيون للتجربة</b></summary><div class="note">يضيف مشاركين وهميين داخل هذا الحاسوب فقط يجيبون ويشترون عشوائيًا. ليسوا أجهزة حقيقية. «التشغيل التجريبي الكامل» يمرّ وحده على المسابقة كلها مختصرة (نحو 6 دقائق) لترى كل شيء على الشاشة.</div><div class="row wrap"><button class="btn sm" data-act="bots" data-arg="8">+8</button><button class="btn sm" data-act="bots" data-arg="20">+20</button><label class="row" style="font-size:12px"><input type="checkbox" data-simon ${this.sim.on ? 'checked' : ''}> تشغيل تلقائي</label><button class="btn sm gold" data-act="demo">${this.demoOn ? '⏹ إيقاف التشغيل التجريبي' : '🎬 تشغيل تجريبي كامل'}</button>${bots ? `<button class="btn sm bad" data-act="nobots">حذف (${bots})</button>` : ''}</div></details>
      <div class="note" style="margin-top:8px">التشخيص: ${esc(this.net.label().t)}${this.net.mq ? ' · ' + this.net.mq.links.filter(Boolean).map(l => l.b.n + (l.up ? ' ✓' : ' ✗')).join('، ') + ' · وارد ' + this.net.mq.stats.in + ' · مرفوض ' + this.net.mq.stats.bad : ''}</div>`;
  },
  side_plan() {
    const E = this.e, s = E.s, sc = E.schedule();
    return `<div class="row"><b>المجموع: ${sc.total} دقيقة</b><span class="grow"></span><button class="btn sm" data-act="plan60">البرنامج الأصلي</button></div><table class="tbl" style="margin-top:8px"><tr><th>الفقرة</th><th>دقائق</th><th>أسئلة</th></tr>${s.plan.map((p, i) => `<tr style="${i === s.planIdx ? 'background:rgba(34,163,145,.15)' : ''}"><td>${esc(E.segName(p.g))}</td><td><input class="in sm" style="width:60px" type="number" min="1" value="${p.min}" data-pmin="${i}"></td><td>${E.gameDef(p.g) ? `<input class="in sm" style="width:60px" type="number" min="1" max="20" value="${p.count || E.gameDef(p.g).count}" data-pcnt="${i}">` : ''}</td></tr>`).join('')}</table><div class="note">تغيير عدد الأسئلة يسري على الجولات التي لم تبدأ بعد. وللاختصار أثناء اللعب: «تخطي السؤال» أو «إنهاء الجولة الآن»، والنقاط محفوظة.</div>`;
  },
  side_bank() {
    const E = this.e, f = this.bf = this.bf || { cat: '', d: '', q: '' }, dis = new Set(this.disabled);
    const list = E.allBank.filter(b => b.kind === 'mcq' && (!f.cat || b.cat === f.cat) && (!f.d || b.d === +f.d) && (!f.q || (b.q + b.c.join()).includes(f.q)));
    return `<div class="row wrap"><select class="in sm" data-bf="cat"><option value="">كل المجالات</option>${Object.entries(D.CATS).map(([k, v]) => `<option value="${k}" ${f.cat === k ? 'selected' : ''}>${v}</option>`).join('')}</select><select class="in sm" data-bf="d"><option value="">كل المستويات</option>${['', 'سهل', 'متوسط', 'صعب'].map((x, i) => i ? `<option value="${i}" ${f.d === String(i) ? 'selected' : ''}>${x}</option>` : '').join('')}</select><input class="in sm grow" placeholder="بحث" data-bf="q" value="${esc(f.q)}"></div>
      <div class="row wrap" style="margin-top:6px"><button class="btn sm pri" data-act="qadd">+ سؤال</button><button class="btn sm" data-act="qimport">استيراد</button><button class="btn sm" data-act="qexport">تصدير المخصّص</button><span class="mut" style="font-size:12px">${list.length} سؤالًا</span></div>
      <div class="scroll" style="margin-top:6px"><table class="tbl">${list.map(b => `<tr style="${dis.has(b.id) ? 'opacity:.4' : ''}"><td><div>${esc(b.q)}</div><div class="mut" style="font-size:12px">✔ ${esc(b.c[0])}${b.src ? ' · ' + esc(b.src) : ''}</div></td><td style="white-space:nowrap">${['', 'سهل', 'متوسط', 'صعب'][b.d] || ''}</td><td><button class="chipbtn" data-act="qtoggle" data-arg="${b.id}">${dis.has(b.id) ? 'تفعيل' : 'تعطيل'}</button>${b.custom ? `<button class="chipbtn" data-act="qdel" data-arg="${b.id}">حذف</button>` : ''}</td></tr>`).join('')}</table></div>`;
  },
  side_log() {
    const E = this.e, s = E.s;
    return `<div class="row"><button class="btn sm" data-act="undo" ${s.undo.length ? '' : 'disabled'}>↶ تراجع${s.undo.length ? ' (' + esc(s.undo[s.undo.length - 1].label) + ')' : ''}</button></div><div class="scroll" style="margin-top:6px"><table class="tbl"><tr><th>الفريق</th><th>نقاط</th><th>ذهب</th><th>السبب</th></tr>${[...s.ledger].reverse().slice(0, 200).map(x => { const t = E.team(x.team) || {}; return `<tr><td style="color:${t.color}">${esc(t.name || '')}</td><td style="direction:ltr">${x.d ? (x.d > 0 ? '+' : '') + x.d : ''}</td><td style="direction:ltr;color:var(--gold)">${x.g ? (x.g > 0 ? '+' : '') + x.g : ''}</td><td>${esc(x.why)}</td></tr>`; }).join('')}</table></div>`;
  },
  side_settings() {
    const s = this.e.s, st = s.settings;
    return `<div class="col">
      <label class="col"><span class="mut">اسم المسابقة</span><input class="in" data-title value="${esc(s.title)}"></label>
      <div class="mut">الفرق (2–4)</div>${s.teams.map((t, i) => `<div class="row"><input type="color" value="${t.color}" data-tcolor="${i}" style="width:40px;height:34px;border:0;background:none"><input class="in grow" value="${esc(t.name)}" data-tname="${i}">${s.teams.length > 2 ? `<button class="chipbtn" data-act="tdel" data-arg="${i}">✕</button>` : ''}</div>`).join('')}${s.teams.length < 4 ? '<button class="btn sm" data-act="tadd">+ فريق</button>' : ''}
      <div class="row wrap"><label class="row">وقت الإجابة بعد الاستباق <input class="in sm" style="width:60px" type="number" min="3" max="60" data-set="answerTime" value="${st.answerTime}"> ث</label><label class="row">ذهب سفينة الكنز <input class="in sm" style="width:60px" type="number" min="0" max="200" data-set="treasureGold" value="${st.treasureGold}"></label></div>
      <label class="row"><input type="checkbox" data-set="hideScores" ${st.hideScores ? 'checked' : ''}> إخفاء أرقام النقاط على الشاشة (يُعرف الترتيب من «سارية المجد» حتى التتويج)</label>
      <label class="row">المؤثرات على الشاشة <select class="in sm" data-set="fx"><option value="high" ${st.fx === 'high' ? 'selected' : ''}>كاملة</option><option value="low" ${st.fx === 'low' ? 'selected' : ''}>مخففة</option><option value="off" ${st.fx === 'off' ? 'selected' : ''}>بلا حركة</option></select></label>
      <hr><div class="row wrap"><b>الشعار</b><label class="btn sm">تغيير<input type="file" accept="image/*" data-logo hidden></label><button class="btn sm" data-act="logoreset">الأصلي</button><b style="margin-inline-start:12px">الخط</b><label class="btn sm">تحميل ملف خط<input type="file" accept=".otf,.ttf,.woff,.woff2" data-font hidden></label><button class="btn sm" data-act="fontreset">الافتراضي</button></div>
      <label class="col"><span class="mut">رابط الصفحة لرمز QR (اتركه فارغًا للتلقائي)</span><input class="in" data-url value="${esc(LS.get('bena.url', ''))}" style="direction:ltr"></label>
      <hr><div class="row wrap"><button class="btn sm" data-act="backup">نسخة احتياطية</button><button class="btn sm" data-act="restore">استعادة</button><button class="btn sm bad" data-act="reset">مسابقة جديدة</button></div></div>`;
  },
  side_help() {
    return `<div class="col note" style="color:var(--tx)">
      <b class="h">يوم المسابقة</b>
      <div>1. افتح المنصة على حاسوب المشرف ← «لوحة المشرف».</div>
      <div>2. شاشة العرض: «🖥️ فتح شاشة العرض» (نافذة ثانية على البروجكتور)، أو «▶ العرض في هذه النافذة» إن كانت الشاشة مكررة.</div>
      <div>3. يمسح الطلاب رمز QR ويكتبون أسماءهم. أول من يدخل كل فريق يصبح قائده، ويمكنك تغييره.</div>
      <div>4. اضغط الزر الأخضر الكبير في كل خطوة. المسافة = الزر الكبير، 1/0 = صحيحة/خاطئة، Ctrl+Z = تراجع.</div>
      <b class="h" style="margin-top:6px">القواعد</b>
      <div>سهل 10، متوسط 20، صعب 30 نقطة، والحسم ×2. كل نقطة مكتسبة = قطعة ذهب. الخزنة: 30/20/10. سفينة الكنز: ذهب فقط. الرهان حتى ربع النقاط.</div>
      <div><b>مجلس القرية</b> بعد كل جولة (90 ثانية): القائد يبني ويحصّن ويرسل أمرًا سريًا واحدًا. كل وحدة هجوم بـ10 ذهب. الغارة يصدها السور، والمنجنيق يصده البرج، والسهام المشتعلة يطفئها البئر؛ كل مستوى دفاع يوقف وحدتين. ما يتجاوز يصيب: الفارس يسرق 15 ذهبًا، والحجر يخصم 15 نقطة، والسهم يحرق 5 ذهب ويعطّل مبنى. الصد الكامل = +5 نقاط صمود. لا تُهاجَم قرية أكثر من مرتين في المجلس.</div>
      <div><b>كل مبنى</b> يضيف 5 نقاط (المنزل 15). المزرعة دخل كل مجلس، والسوق ذهب مع كل سؤال تكسبونه. <b>درع التماسك</b> لمن أجاب 60% من أعضائه صحيحًا في الجولة. <b>عون الجيران</b> 15 ذهبًا للأخير.</div>
      <b class="h" style="margin-top:6px">الاتصال</b>
      <div>خارج Claude تعمل المنصة عبر خوادم بث مجانية عامة (EMQX ثم HiveMQ ثم Mosquitto). كل الجوالات تتصل بالخادم الأول نفسه، فأسبقية الضغط تُحدَّد بترتيب وصولها إليه ثم إلى حاسوبك. وأي رسالة مزيفة تُرفض لأن كل رسالة موقّعة رقميًا.</div>
      <div>أبقِ نافذة اللوحة ظاهرة، ولا تصغّرها.</div>
      <b class="h" style="margin-top:6px">وضع الطوارئ</b>
      <div>إن انقطع الإنترنت تبقى اللوحة والشاشة تعملان في المتصفح نفسه: امنح الأسبقية يدويًا، واعتمد الخزنة يدويًا، وعدّل النقاط، وابنِ نيابةً عن الفرق. الحالة تُحفظ تلقائيًا كل نصف ثانية.</div></div>`;
  },
  onChangeInput(x) {
    const E = this.e;
    if (x.dataset.set) { let v = x.type === 'checkbox' ? x.checked : x.value; if (x.type === 'number') v = +v; E.setSetting(x.dataset.set, v); }
    if (x.dataset.move) E.moveStudent(x.dataset.move, x.value);
    if (x.dataset.cap) E.setCaptain(x.dataset.cap, x.value);
    if (x.dataset.themeT) E.setTheme(x.dataset.themeT, x.value);
    if (x.hasAttribute('data-simon')) this.sim.on = x.checked;
    if (x.dataset.pmin) { E.s.plan[+x.dataset.pmin].min = Math.max(1, +x.value || 1); E.touch(); }
    if (x.dataset.pcnt) { E.s.plan[+x.dataset.pcnt].count = Math.max(1, Math.min(20, +x.value || 1)); E.touch(); }
    if (x.dataset.bf) { this.bf[x.dataset.bf] = x.value; this.renderSide(); }
    if (x.hasAttribute('data-title')) { E.s.title = x.value.slice(0, 40) || 'ميدان بناء'; E.touch(); }
    if (x.dataset.tname) { const L = E.s.teams.map(t => ({ ...t })); L[+x.dataset.tname].name = x.value; E.setTeams(L); }
    if (x.dataset.tcolor) { const L = E.s.teams.map(t => ({ ...t })); L[+x.dataset.tcolor].color = x.value; E.setTeams(L); }
    if (x.dataset.wpick) { if (x.value !== '') E.wagerPick(x.dataset.wpick, +x.value, null); }
    if (x.dataset.wager) E.setWager(x.dataset.wager, x.value, null);
    if (x.hasAttribute('data-logo')) this.loadLogo(x.files[0]);
    if (x.hasAttribute('data-font')) { const f = x.files[0]; if (f) { const r = new FileReader(); r.onload = () => { if (!LS.set('bena.font', r.result)) toast('الملف كبير؛ سيعمل حتى إغلاق الصفحة فقط'); Brand.apply(); toast('تم تحميل الخط'); }; r.readAsDataURL(f); } }
    if (x.hasAttribute('data-url')) { LS.set('bena.url', x.value.trim()); this.broadcast(true); this.renderSide(); }
  },
  loadLogo(f) {
    if (!f) return; const r = new FileReader();
    r.onload = () => { const img = new Image(); img.onload = () => { const k = Math.min(1, 900 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); const url = c.toDataURL('image/png'); LS.set('bena.logo', url); this.net.emit('logo', url); this.stage.refreshLogo(); this.render(); toast('تم تحديث الشعار'); }; img.src = r.result; };
    r.readAsDataURL(f);
  },
  // ---------- الأوامر ----------
  act(a, arg) {
    const E = this.e, s = E.s, [x, y] = String(arg || '').split('|');
    switch (a) {
      case 'start': E.goSegment(0); break;
      case 'goseg': if (s.planIdx >= 0 && +arg !== s.planIdx) confirmBox('الانتقال إلى «' + E.segName(s.plan[+arg].g) + '»؟ النقاط محفوظة.', () => E.goSegment(+arg)); else E.goSegment(+arg); break;
      case 'nextseg': E.nextSegment(); break;
      case 'next': E.nextItem(); break;
      case 'open': E.openItem(); break;
      case 'aftershow': E.afterShow(); break;
      case 'skip': E.skipItem(); break;
      case 'endseg': confirmBox('إنهاء الجولة الآن؟ النقاط المكتسبة محفوظة.', () => E.finishSeg()); break;
      case 'judge': E.judge(arg === '1'); break;
      case 'reopen': E.reopen(); break;
      case 'reveal': E.revealItem(); break;
      case 'lock': E.lockAll(); break;
      case 'mbuzz': E.manualBuzz(arg); break;
      case 'vaultman': E.crack(arg, null); break;
      case 'lockw': E.lockWagers(); break;
      case 'judgew': E.judgeWager(); break;
      case 'tiebreak': E.startTiebreak(); break;
      case 'backcrown': E.goSegment(s.returnTo != null ? s.returnTo : s.plan.length - 1); break;
      case 'pause': E.pauseTimer(); break;
      case 'resume': E.resumeTimer(); break;
      case 'add10': E.addTime(10); break;
      case 'undo': { const l = E.undo(); toast(l ? 'تم التراجع: ' + l : 'لا يوجد ما يُتراجع عنه'); break; }
      case 'adj': E.manualAdjust(x, +y); break;
      case 'live': E.liveWin(x); break;
      case 'gold': E.manualGold(x, +y); break;
      case 'buildm': this.buildModal(arg); break;
      case 'tab': this.sideTab = arg; this.renderSide(); break;
      case 'copy': this.copy(arg); break;
      case 'newcode': s.code = E.makeCode(); this.afterReset(); break;
      case 'balance': confirmBox('إعادة توزيع كل الطلاب على الفرق بالقرعة؟', () => E.autoBalance()); break;
      case 'kick': confirmBox('إزالة هذا المشارك؟', () => E.removeStudent(arg, true)); break;
      case 'bots': this.addBots(+arg); break;
      case 'nobots': this.removeBots(); break;
      case 'demo': this.demo(!this.demoOn); break;
      case 'plan60': s.plan = JSON.parse(JSON.stringify(D.DEFAULT_PLAN)); if (s.planIdx >= s.plan.length) s.planIdx = s.plan.length - 1; E.touch(); break;
      case 'qtoggle': { const i = this.disabled.indexOf(arg); if (i >= 0) this.disabled.splice(i, 1); else this.disabled.push(arg); this.saveBank(); this.renderSide(); break; }
      case 'qdel': this.custom = this.custom.filter(c => c.id !== arg); this.saveBank(); this.renderSide(); break;
      case 'qadd': this.qAddForm(); break;
      case 'qimport': this.qImport(); break;
      case 'qexport': this.textOut('الأسئلة المخصّصة (JSON)', JSON.stringify(this.custom, null, 1)); break;
      case 'tdel': E.setTeams(s.teams.filter((_, i) => i !== +arg)); break;
      case 'tadd': { const L = s.teams.map(t => ({ ...t })), i = L.length, used = new Set(L.map(t => t.id)); let id = 't' + (i + 1), k = i + 1; while (used.has(id)) id = 't' + (++k); L.push({ id, name: BENA_ENGINE.TEAM_NAMES[i] || 'فريق ' + (i + 1), color: BENA_ENGINE.TEAM_COLORS[i] || '#888' }); E.setTeams(L); break; }
      case 'logoreset': LS.del('bena.logo'); this.net.emit('logo', null); this.stage.refreshLogo(); this.render(); break;
      case 'fontreset': LS.del('bena.font'); document.documentElement.style.removeProperty('--fh'); break;
      case 'backup': this.textOut('نسخة احتياطية — احفظ النص في ملف', JSON.stringify(Object.assign({}, s, { undo: [] }))); break;
      case 'restore': modal(`<div class="col"><b>الصق نص النسخة الاحتياطية</b><textarea class="in" rows="8" id="rs" style="direction:ltr"></textarea><div class="row"><button class="btn pri" data-ok>استعادة</button><button class="btn" data-close>إلغاء</button></div></div>`, (m, close) => { $('[data-ok]', m).onclick = () => { try { const st = JSON.parse($('#rs', m).value); if (st.ver !== 5 || !st.teams) throw 0; st.undo = st.undo || []; this.newEngine(st); this.afterReset(); close(); toast('تمت الاستعادة'); } catch (e) { toast('النص غير صالح'); } }; }); break;
      case 'reset': confirmBox('بدء مسابقة جديدة؟ تُمسح النقاط والطلاب والقرى.', () => { const keep = { teams: s.teams, settings: s.settings, plan: s.plan, title: s.title }; this.sim.on = false; clearInterval(this.demoT); this.demoOn = false; this.newEngine(null); Object.assign(this.e.s, JSON.parse(JSON.stringify(keep))); this.e.s.vil = {}; this.e.s.teams.forEach((t, i) => { this.e.s.vil[t.id] = this.e.newVillage(D.THEME_KEYS[i % 4]); }); this.afterReset(); }); break;
      case 'sound': this.sound = !this.sound; LS.set('bena.hostSound', this.sound); this.renderBar(); break;
      case 'present': this.presentMode(); break;
      case 'displayhelp': this.displayHelp(); break;
    }
  },
  displayHelp() {
    const url = (pageBase() || '') + '#display-' + this.e.s.code;
    modal(`<div class="col"><div class="h" style="font-size:20px">🖥️ شاشة العرض</div><div class="note" style="color:var(--tx)"><b>شاشة ممتدة (الأفضل):</b> اجعل البروجكتور شاشة ممتدة، وافتح الصفحة نفسها في نافذة ثانية واسحبها إليه، ثم اختر «شاشة العرض» واضغط في أي مكان لتفعيل الصوت وملء الشاشة.<br><br><b>جهاز آخر:</b> افتح المنصة واختر «شاشة العرض» وأدخل الرمز <b>${esc(this.e.s.code)}</b>.<br><br><b>شاشة مكررة:</b> استخدم «▶ العرض في هذه النافذة»، وتخرج منه بـ Esc.</div>${pageBase() ? `<button class="btn pri" data-open>فتح شاشة العرض في نافذة جديدة</button>` : ''}<button class="btn" data-close>حسنًا</button></div>`, (m) => { const b = $('[data-open]', m); if (b) b.onclick = () => { try { window.open(url, 'bena-display', 'popup=yes,width=1280,height=720'); } catch (e) { toast('افتح الرابط يدويًا: ' + url); } }; });
  },
  buildModal(tid) {
    const E = this.e, t = E.team(tid);
    const html = () => { const v = E.vil(tid); return `<div class="col"><div class="h" style="font-size:20px">🏗️ البناء لفريق ${esc(t.name)} — 💰 ${v.gold}</div><div style="max-width:360px;margin:auto">${villageSVG({ id: t.id, color: t.color, theme: v.theme }, v.b, { labels: true })}</div><div class="row wrap"><span class="mut">الطابع:</span>${D.THEME_KEYS.map(k => `<button class="chipbtn ${v.theme === k ? 'armed' : ''}" data-th="${k}">${D.THEMES[k].name}</button>`).join('')}</div>${D.BUILD_KEYS.map(k => { const lv = v.b[k], c = E.buildCost(tid, k); return `<div class="row"><span style="width:90px"><b>${D.BUILD[k].name}</b></span><span class="mut grow">${lv}/2</span><button class="btn sm ${c != null && c <= v.gold ? 'pri' : ''}" data-up="${k}" ${c == null || c > v.gold ? 'disabled' : ''}>${c == null ? 'مكتمل' : (lv ? 'ترقية' : 'بناء') + ' (' + c + ')'}</button></div>`; }).join('')}<div class="note">الأصل أن يشتري القائد من جواله. استخدم هذا للطوارئ.</div><button class="btn" data-close>إغلاق</button></div>`; };
    modal(html(), (m, close) => { const bind = () => { $$('[data-up]', m).forEach(b => b.onclick = () => { E.buy(tid, b.dataset.up, null); m.innerHTML = html(); $$('[data-close]', m).forEach(c => c.onclick = close); bind(); }); $$('[data-th]', m).forEach(b => b.onclick = () => { E.setTheme(tid, b.dataset.th, null); m.innerHTML = html(); $$('[data-close]', m).forEach(c => c.onclick = close); bind(); }); }; bind(); });
  },
  copy(t) { try { navigator.clipboard.writeText(t).then(() => toast('تم النسخ'), () => this.textOut('انسخ النص', t)); } catch (e) { this.textOut('انسخ النص', t); } },
  textOut(title, text) { modal(`<div class="col"><b>${esc(title)}</b><textarea class="in" rows="10" readonly style="direction:ltr;font-size:12px">${esc(text)}</textarea><div class="row"><button class="btn pri" data-cp>نسخ</button><button class="btn" data-close>إغلاق</button></div></div>`, m => { $('[data-cp]', m).onclick = () => { $('textarea', m).select(); try { navigator.clipboard.writeText(text).then(() => toast('تم النسخ'), () => toast('حدّد النص وانسخه يدويًا')); } catch (e) { toast('حدّد النص وانسخه يدويًا'); } }; }); },
  qAddForm() {
    modal(`<div class="col"><b>سؤال جديد</b><textarea class="in" id="nq" rows="2" placeholder="نص السؤال"></textarea><input class="in" id="na" placeholder="الإجابة الصحيحة" style="border-color:var(--ok)"><input class="in" id="w1" placeholder="خيار خاطئ 1"><input class="in" id="w2" placeholder="خيار خاطئ 2"><input class="in" id="w3" placeholder="خيار خاطئ 3"><div class="row"><select class="in" id="nc">${Object.entries(D.CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><select class="in" id="nd"><option value="1">سهل</option><option value="2" selected>متوسط</option><option value="3">صعب</option></select></div><div class="row"><button class="btn pri" data-ok>حفظ</button><button class="btn" data-close>إلغاء</button></div></div>`, (m, close) => {
      $('[data-ok]', m).onclick = () => { const v = id => $('#' + id, m).value.trim(); const c = [v('na'), v('w1'), v('w2'), v('w3')]; if (!v('nq') || c.some(x => !x) || new Set(c).size < 4) return toast('أكمل السؤال وأربعة خيارات مختلفة'); this.custom.push({ id: 'u' + Date.now().toString(36), kind: 'mcq', cat: v('nc'), d: +v('nd'), q: v('nq'), c }); this.saveBank(); close(); this.renderSide(); toast('أُضيف السؤال'); };
    });
  },
  qImport() {
    modal(`<div class="col"><b>استيراد أسئلة</b><div class="note">JSON: [{"q":"…","c":["الصحيحة","خطأ","خطأ","خطأ"],"cat":"general","d":2}] أو CSV: السؤال,الصحيحة,خطأ1,خطأ2,خطأ3,المجال,الصعوبة</div><textarea class="in" rows="8" id="imp" style="direction:ltr"></textarea><label class="btn sm">اختيار ملف<input type="file" hidden id="impf" accept=".json,.csv,.txt"></label><div class="row"><button class="btn pri" data-ok>استيراد</button><button class="btn" data-close>إلغاء</button></div></div>`, (m, close) => {
      $('#impf', m).onchange = e => { const f = e.target.files[0]; if (f) f.text().then(t => { $('#imp', m).value = t; }); };
      $('[data-ok]', m).onclick = () => {
        const txt = $('#imp', m).value.trim(); let items = [];
        try { items = txt.startsWith('[') ? JSON.parse(txt) : txt.split(/\r?\n/).filter(Boolean).map(l => l.split(',').map(x => x.trim())).filter(r => r.length >= 5).map(r => ({ q: r[0], c: r.slice(1, 5), cat: r[5], d: +r[6] })); } catch (e) { return toast('تعذّرت قراءة النص'); }
        const ok = items.filter(x => x && typeof x.q === 'string' && x.q.trim() && Array.isArray(x.c) && x.c.length === 4 && x.c.every(c => typeof c === 'string' && c) && new Set(x.c).size === 4).map((x, i) => ({ id: 'u' + Date.now().toString(36) + i, kind: 'mcq', q: x.q, c: x.c, cat: D.CATS[x.cat] ? x.cat : 'general', d: [1, 2, 3].includes(+x.d) ? +x.d : 2 }));
        this.custom.push(...ok); this.saveBank(); close(); this.renderSide(); toast('استُورد ' + ok.length + ' من ' + items.length);
      };
    });
  },
  presentMode() {
    SFX.unlock();
    const ov = document.createElement('div'); ov.className = 'stage-host'; ov.style.zIndex = 500; document.body.appendChild(ov);
    const st = new Stage(ov, { sound: true, ambient: true }); st.setRoster(this.e.roster()); st.update(this.pubState()); this.present = st;
    const ex = document.createElement('button'); ex.className = 'btn sm'; ex.textContent = '✕ رجوع للوحة (Esc)'; ex.style.cssText = 'position:fixed;top:8px;left:8px;z-index:501;opacity:.25'; ex.onmouseenter = () => ex.style.opacity = 1; ex.onmouseleave = () => ex.style.opacity = .25;
    const close = () => { ov.remove(); ex.remove(); clearInterval(st.loop); clearInterval(st.ambT); SFX.stopAmbient(); this.present = null; try { document.fullscreenElement && document.exitFullscreen(); } catch (e) { } };
    ex.onclick = close; document.body.appendChild(ex); this.closePresent = close;
    try { document.documentElement.requestFullscreen().catch(() => { }); } catch (e) { }
  },
  key(e) {
    if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName)) return;
    if (e.key === 'Escape' && this.present) return this.closePresent();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); return this.act('undo'); }
    const seg = this.e.s.seg; if (seg && seg.phase === 'answering' && (e.key === '1' || e.key === '0')) return this.act('judge', e.key);
    if (e.key === ' ' && !e.repeat) { const b = $('#deck .btn.pri.big'); if (b && !b.disabled) { e.preventDefault(); b.click(); } }
  },
  tickUI() {
    const r = this.e.remaining(); $$('[data-htm]').forEach(x => { x.textContent = r == null ? '' : fmtTime(r); x.style.color = r != null && r < 5000 ? 'var(--bad)' : ''; });
    const now = Date.now(); if (!this._lb || now - this._lb > 5000) { this._lb = now; this.renderBar(); this.renderSched(); }
  }
};
function fmtMin(m) { const s = Math.max(0, Math.floor(m * 60)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
