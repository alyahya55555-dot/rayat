/* ===== لوحة المشرف ===== */
const MODE_LBL = { buzz: '⚡ استباق', all: '📱 الجميع يجيب', team: '👥 إجابة الفريق', live: '🏃 حضوري', special: '🎲 خاص' };
const Host = {
  init() {
    this.HS = uid(6); this.tab = 'deck'; this.sideTab = 'room'; this.peers = new Map(); this.bcPeers = new Map(); this.handled = {}; this.display = 0; this.lastMsg = 0; this.sim = { on: false };
    this.sound = LS.get('bena.hostSound', false); SFX.on = true; this.pks = {}; this.keys = {};
    if (Crypt.ok) Crypt.keypair().then(kp => { this.kp = kp; this.changed(); }).catch(() => { });
    const saved = LS.get('bena.host', null);
    this.custom = LS.get('bena.custom', []); this.disabled = LS.get('bena.disabled', []);
    this.newEngine(null);
    this.root = $('#app');
    this.net = new Net('host');
    this.net.on('peers', ch => this.onPeers(ch));
    this.net.on('bcpres', (peer, pr, code, fp) => this.onBcPres(peer, pr, fp));
    this.net.on('foreignhost', fp => this.onForeignHost(fp));
    this.net.on('mqup', () => this.broadcast(true));
    this.net.on('bcbye', peer => this.onLeave(peer));
    this.net.on('status', () => this.renderBar());
    this.net.on('caps', () => this.onCaps());
    this.net.on('state', (P, m) => { if (P && P.code === this.e.s.code && P.hs !== this.HS) { this.otherHost = Date.now(); this.renderBar(); } });
    this.layout();
    this.net.init().then(() => { if (this.net.mq) this.net.mq.ensureKey().then(k => { if (k) { this.fp = k.fp; this.render(); this.broadcast(true); } }); });
    if (saved && saved.code) { this.resumeAsk(saved); }
    setInterval(() => { this.e.tick(); this.tickUI(); }, 200);
    setInterval(() => this.broadcast(true), 3000);
    setInterval(() => this.sendPriv(true), 6000);
    setInterval(() => this.checkBc(), 3000);
    setInterval(() => this.simTick(), 350);
    window.addEventListener('beforeunload', () => this.saveNow());
    document.addEventListener('keydown', e => this.key(e));
  },
  newEngine(state) {
    this.e = new Engine(D, { state, custom: this.custom, disabled: this.disabled });
    this.e.onChange = () => this.changed();
  },
  resumeAsk(saved) {
    modal(`<div class="col"><div class="h" style="font-size:20px">مسابقة محفوظة</div><div class="note">وُجدت مسابقة سابقة (رمز ${esc(saved.code)}، ${Object.keys(saved.students || {}).length} مشارك، ${(saved.ledger || []).length} عملية نقاط). هل تستأنفها؟</div><div class="row"><button class="btn pri" data-r>استئناف</button><button class="btn" data-close>مسابقة جديدة</button></div></div>`, (m, close) => {
      $('[data-r]', m).onclick = () => { close(); this.newEngine(saved); Object.values(this.e.s.students).forEach(s => { if (!s.sid.startsWith('bot-')) s.online = false; }); this.afterReset(); toast('تم الاستئناف'); };
    });
  },
  afterReset() { this.handled = {}; this.stage.prevScores = {}; this.net.joinRoom(this.e.s.code); this.changed(); },
  async onCaps() {
    await this.net.joinRoom(this.e.s.code);
    this.net.presence({ r: 'h', c: this.e.s.code });
    this.renderBar();
    const u = this.net.user;
    if (u) { try { this.uidv = await u.id(); } catch (e) { } try { this.canEdit = u.canEdit(); } catch (e) { } }
    if (this.net.db && this.uidv) {
      try { const a = await this.net.db.doc(`data/users/${this.uidv}/archive`).get(); if (a.exists) { const l = a.data().list || []; const loc = LS.get('bena.archive', []); const merged = [...loc]; l.forEach(x => { if (!merged.find(y => y.at === x.at)) merged.push(x); }); LS.set('bena.archive', merged.slice(-50)); } } catch (e) { }
      if (!LS.get('bena.host', null)) { try { const d = await this.net.db.doc(`data/users/${this.uidv}/current`).get(); if (d.exists && d.data().s) { const s = JSON.parse(d.data().s); if (s && s.code && !this.e.s.clock.startedAt) this.resumeAsk(s); } } catch (e) { } }
    }
    this.renderSide();
  },
  // ---------- استقبال المشاركين ----------
  onPeers(ch) {
    this.lastMsg = Date.now();
    const ups = [...ch.joined, ...ch.updated].filter(p => !p.sameTab && p.kind === 'viewer').sort((a, b) => a.updatedAt - b.updatedAt);
    ups.forEach(p => this.onPres(p.peer, p.presence || {}, p.by));
    ch.left.forEach(p => this.onLeave(p.peer));
    this.display = ch.peers.filter(p => p.presence && p.presence.r === 'd').length;
    this.otherHostPeer = ch.peers.some(p => !p.isMe && p.presence && p.presence.r === 'h' && p.presence.c === this.e.s.code);
    if (ch.joined.length) this.broadcast(true);
    this.renderBar();
  },
  onBcPres(peer, pr, fp) { const isNew = !this.bcPeers.has(peer); this.bcPeers.set(peer, Date.now()); this.lastMsg = Date.now(); if (isNew) { setTimeout(() => this.broadcast(true), 50); setTimeout(() => this.sendPriv(true), 400); } if (pr.r === 'd') { this.bcDisplay = Date.now(); this.renderBar(); return; } this.onPres(peer, pr, fp || null); },
  onForeignHost(fp) { const s = this.e.s; if (!s.clock.startedAt && !Object.keys(s.students).length) { s.code = this.e.makeCode(); this.afterReset(); toast('الرمز كان مستخدمًا في مسابقة أخرى، فأنشأت رمزًا جديدًا: ' + s.code); } else { this.foreign = Date.now(); this.renderBar(); } },
  checkBc() { const now = Date.now(); this.bcPeers.forEach((t, peer) => { if (now - t > 10000) { this.bcPeers.delete(peer); this.onLeave(peer); } }); },
  onLeave(peer) { const st = Object.values(this.e.s.students).find(s => s.peer === peer); if (st) this.e.setOffline(st.sid); },
  onPres(peer, pr, by) {
    const E = this.e;
    if (pr.r !== 's' || !pr.sid || pr.c !== E.s.code) return;
    const sid = String(pr.sid).slice(0, 16);
    const ex = E.s.students[sid];
    if (ex && ex.by && by && ex.by !== by) return; // منع انتحال هوية طالب آخر
    const st = E.upsertStudent({ sid, name: pr.nm, want: pr.tw, peer, by });
    if (!st) return;
    const h = this.handled[sid] = this.handled[sid] || {};
    if (pr.pk && this.pks[sid] !== pr.pk) { this.pks[sid] = pr.pk; this.schedulePriv(); }
    const it = E.item();
    if (pr.sh && it && pr.sh.q === it.qid) { const k = pr.sh.q + '.' + pr.sh.n; if (h.sh !== k) { h.sh = k; E.shoot(pr.sh.t, +pr.sh.c, sid); } }
    if (pr.vc && it && pr.vc.q === it.qid) { const k = pr.vc.q + '.' + pr.vc.n; if (h.vc !== k) { h.vc = k; E.vaultTry(sid, pr.vc.q, pr.vc.c); } }
    if (pr.bz && it && pr.bz.q === it.qid && (pr.bz.o || 0) === (it.bo || 0)) { const k = pr.bz.q + '.' + (pr.bz.o || 0); if (h.bz !== k) { h.bz = k; E.buzz(sid, pr.bz.q); } }
    if (pr.an && it && pr.an.q === it.qid && h.an !== pr.an.q) { if (E.answer(sid, pr.an.q, pr.an.v)) h.an = pr.an.q; }
    if (pr.vt && it && pr.vt.q === it.qid && h.vt !== pr.vt.q) { if (E.vote(sid, pr.vt.q, pr.vt.t)) h.vt = pr.vt.q; }
  },
  // ---------- البث والحفظ ----------
  changed() {
    this.dirty = true;
    if (!this.bq) { this.bq = setTimeout(() => { this.bq = null; this.broadcast(false); }, 40); }
    if (!this.rq) this.rq = requestAnimationFrame(() => { this.rq = null; this.render(); });
    if (!this.sq) this.sq = setTimeout(() => { this.sq = null; this.saveNow(); }, 500);
    this.schedulePriv();
    const fx = this.e.s.fx; if (fx && fx.n !== this.lastFxN) { this.lastFxN = fx.n; if (this.sound && FX_SOUND[fx.k]) SFX.play(FX_SOUND[fx.k]); }
    if (this.e.lastSummary && this.e.lastSummary !== this.archived) { this.archived = this.e.lastSummary; this.archive(this.e.lastSummary); }
  },
  pubState() { const P = this.e.pub(); P.hs = this.HS; if (this.kp) P.hk = this.kp.pub; if (this.fp) P.fp = this.fp; const it = this.e.item(); if (P.I && it && it.answers && P.mode === 'all' && P.ph === 'open') P.I.ad = Object.keys(it.answers); return P; },
  broadcast(force) {
    const P = this.pubState();
    this.net.emit('state', P);
    const R = this.e.roster(); const rs = JSON.stringify([R.L, R.M]);
    if (force || rs !== this.lastRoster) { this.lastRoster = rs; this.net.emit('roster', R); this.stage.setRoster(R); }
    this.stage.update(P);
    if (this.present) this.present.update(P);
  },
  schedulePriv() { if (this.pq) return; this.pq = setTimeout(() => { this.pq = null; this.sendPriv(false); }, 120); },
  // رسائل خاصة مشفّرة لكل جوال: الدور السري، المهمة، كلمة الوصف، تلميحات الخزنة
  async sendPriv(force) {
    if (this.privBusy) { this.privAgain = true; return; } this.privBusy = true;
    try {
      const data = this.e.privData(); this.privCache = this.privCache || {}; const out = {};
      for (const [sid, obj] of Object.entries(data)) {
        const pt = JSON.stringify(obj), pk = this.pks[sid], c = this.privCache[sid];
        if (c && c.pt === pt && c.pk === pk) { out[sid] = c.ct; continue; }
        if (!pk) continue;
        let ct = null;
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
    const s = this.e.s;
    if (!LS.set('bena.host', s)) { const lite = Object.assign({}, s, { undo: s.undo.slice(-5) }); LS.set('bena.host', lite); }
    const now = Date.now();
    if (this.net.db && this.uidv && (!this.lastDb || now - this.lastDb > 4000) && !this.dbBusy) {
      this.dbBusy = true; this.lastDb = now;
      const lite = JSON.stringify(Object.assign({}, s, { undo: [] }));
      if (lite.length < 240000) this.net.db.doc(`data/users/${this.uidv}/current`).set({ s: lite, at: now }).catch(() => { }).finally(() => { this.dbBusy = false; }); else this.dbBusy = false;
    }
  },
  archive(sum) {
    const list = LS.get('bena.archive', []); list.push(sum); LS.set('bena.archive', list.slice(-50));
    if (this.net.db && this.uidv) this.net.db.doc(`data/users/${this.uidv}/archive`).set({ list: list.slice(-50) }).catch(() => { });
  },
  saveBank() { LS.set('bena.custom', this.custom); LS.set('bena.disabled', this.disabled); this.e.buildBank(this.custom, this.disabled); },
  // ---------- الطلاب الافتراضيون (للتجربة فقط) ----------
  addBots(n) { const E = this.e; const base = Object.keys(E.s.students).filter(k => k.startsWith('bot-')).length; for (let i = 0; i < n; i++) E.upsertStudent({ sid: 'bot-' + (base + i + 1), name: '🤖 تجريبي ' + (base + i + 1), want: null, peer: 'sim' }); this.sim.on = true; },
  removeBots() { Object.keys(this.e.s.students).filter(k => k.startsWith('bot-')).forEach(k => delete this.e.s.students[k]); this.sim.on = false; this.e.touch(); },
  simTick() {
    if (!this.sim.on) return; const E = this.e, seg = E.s.seg, it = E.item(); if (!seg || !it) return;
    const bots = Object.values(E.s.students).filter(s => s.sid.startsWith('bot-'));
    if (seg.mode === 'buzz' && seg.phase === 'open' && Math.random() < .12) { const c = bots.filter(b => E.canBuzz(b.sid)); if (c.length) { const b = c[Math.floor(Math.random() * c.length)]; E.buzz(b.sid, it.qid); } }
    if (seg.phase === 'aim' && it.shooter && (!it.shooter.sid || it.shooter.sid.startsWith('bot-')) && Math.random() < .25) E.randomShot();
    if (it.kind === 'vault' && seg.phase === 'open') { const done = new Set(); bots.forEach(b => { if (!done.has(b.team) && !it.cracked[b.team] && Math.random() < .03) { done.add(b.team); E.vaultTry(b.sid, it.qid, Math.random() < .6 ? it.a : '1111'); } }); }
    if (seg.mode === 'all' && seg.phase === 'open') bots.forEach(b => { if (it.answers[b.sid] === undefined && Math.random() < .2) { let v; if (it.kind === 'accuse') { const m = E.teamMembers(b.team).filter(x => x.sid !== b.sid); if (!m.length) return; v = m[Math.floor(Math.random() * m.length)].sid; } else if (it.kind === 'number') v = Math.round(it.a * (.6 + Math.random() * .8)); else if (it.kind === 'order') v = Math.random() < .5 ? it.a.slice() : E.shuffle(it.a); else if (it.kind === 'consensus') v = Math.floor(Math.random() * it.c.length); else v = Math.random() < .65 ? it.a : Math.floor(Math.random() * it.c.length); E.answer(b.sid, it.qid, v); } });
    if (it.kind === 'live' && seg.phase === 'vote') bots.forEach(b => { if (!it.votes[b.sid] && Math.random() < .2) { const o = E.s.teams.filter(t => t.id !== b.team); E.vote(b.sid, it.qid, o[Math.floor(Math.random() * o.length)].id); } });
  },
  // ---------- الواجهة ----------
  layout() {
    this.root.innerHTML = `<div class="host"><div class="hbar" id="hbar"></div><div class="hmain"><div class="col" style="min-width:0"><div class="card" id="sched"></div><div class="card deck" id="deck"></div><div id="teams" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px"></div></div><div class="col" style="min-width:0"><div class="preview"><div class="stage-wrap" id="pv"></div></div><div class="mut" style="font-size:12px;text-align:center">معاينة مباشرة لما يظهر على شاشة العرض (لا تظهر فيها الإجابات قبل كشفها)</div><div class="card" id="side"></div></div></div></div>`;
    this.stage = new Stage($('#pv'), { sound: false });
    this.root.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b && !b.disabled) { SFX.unlock(); this.act(b.dataset.act, b.dataset.arg, b); } });
    this.render();
  },
  busy(el) { const a = document.activeElement; return a && el.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName); },
  render() { this.renderBar(); this.renderSched(); if (!this.busy($('#deck'))) this.renderDeck(); this.renderTeams(); if (!this.busy($('#side'))) this.renderSide(); },
  renderBar() {
    const E = this.e, l = this.net.label(), sc = E.schedule();
    const disp = this.display || (this.bcDisplay && Date.now() - this.bcDisplay < 10000);
    const online = Object.values(E.s.students).filter(s => s.online).length, total = Object.keys(E.s.students).length;
    const late = sc.late > 1 ? `<span class="pill" style="background:rgba(239,68,68,.2)">⏰ متأخر ${Math.round(sc.late)} د</span>` : '';
    $('#hbar').innerHTML = `<div class="brand"><div class="lg">${Brand.logoImg()}</div>${esc(E.s.title)}</div><span class="code-badge" title="رمز الغرفة">${esc(E.s.code)}</span>
      <span class="pill"><span class="dot ${l.cls}"></span>${esc(l.t)}</span>
      <span class="pill">👥 ${online}/${total}</span>
      <span class="pill"><span class="dot ${disp ? 'on' : ''}"></span>شاشة العرض ${disp ? 'متصلة' : 'غير متصلة'}</span>
      ${E.s.clock.startedAt ? `<span class="pill">⏱ ${Math.floor(sc.elapsed)} / ${sc.total} د</span>` : ''}${late}
      ${this.foreign && Date.now() - this.foreign < 10000 ? '<span class="pill" style="background:rgba(239,68,68,.25)">⚠️ جهاز آخر يبث بالرمز نفسه — غيّر الرمز</span>' : ''}${(this.otherHostPeer || (this.otherHost && Date.now() - this.otherHost < 8000)) ? '<span class="pill" style="background:rgba(239,68,68,.25)">⚠️ لوحة مشرف أخرى مفتوحة بالرمز نفسه</span>' : ''}
      <span class="grow"></span>
      <button class="btn sm" data-act="undo" ${E.s.undo.length ? '' : 'disabled'} title="تراجع (Ctrl+Z)">↶ تراجع</button>
      <button class="btn sm" data-act="sound">${this.sound ? '🔊' : '🔇'} صوت اللوحة</button>
      <button class="btn sm" data-act="displayhelp">🖥️ شاشة العرض</button>
      <button class="btn sm gold" data-act="present">▶ عرض في هذه النافذة</button>`;
  },
  renderSched() {
    const E = this.e, sc = E.schedule();
    $('#sched').innerHTML = `<div class="row" style="margin-bottom:8px"><b class="h">البرنامج</b><span class="mut" style="font-size:12px">اضغط أي فقرة للانتقال إليها مباشرة</span><span class="grow"></span>${E.s.clock.segStart && E.s.planIdx >= 0 ? `<span class="mut" style="font-size:13px">الفقرة الحالية: ${Math.floor(sc.segElapsed)} من ${sc.rows[E.s.planIdx] ? sc.rows[E.s.planIdx].min : '?'} د</span>` : ''}</div>
      <div class="sched">${sc.rows.map(r => `<div class="s ${r.i === E.s.planIdx ? 'cur' : ''} ${r.i < E.s.planIdx ? 'past' : ''}" data-act="goseg" data-arg="${r.i}"><b>${esc(r.name)}</b><div class="mut">${r.min} د</div></div>`).join('')}</div>`;
  },
  // ---------- لوحة التحكم الرئيسة ----------
  renderDeck() {
    const E = this.e, s = E.s, seg = s.seg, it = E.item(), el = $('#deck');
    const T = s.teams, tn = id => (E.team(id) || {}).name || '';
    const timer = s.timer ? `<div class="row"><span class="timerbox" data-htm></span><button class="btn sm" data-act="${s.timer.paused != null ? 'resume' : 'pause'}">${s.timer.paused != null ? '▶ متابعة' : '⏸ إيقاف'}</button><button class="btn sm" data-act="add10">+10ث</button><button class="btn sm" data-act="cleartimer">إلغاء المؤقت</button></div>` : '';
    let h = '';
    if (!seg) {
      h = `<div class="h" style="font-size:22px">جاهز للبدء</div><div class="note">1) اعرض شاشة الانضمام على الشاشة الكبيرة. 2) انتظر دخول الطلاب (تبويب «الغرفة» يعرض المتصلين). 3) اضغط «ابدأ المسابقة».</div><div class="ctl"><button class="btn pri big" data-act="start">▶ ابدأ المسابقة</button><button class="btn" data-act="tab" data-arg="room">إدارة الغرفة والطلاب</button></div>`;
    } else if (seg.g === 'opening') {
      const nx = { welcome: 'إدخال الفرق', teams: seg.stepI < T.length ? 'دخول فريق ' + (T[seg.stepI] || {}).name : 'عرض القواعد', rules: 'إنهاء الافتتاح', done: '' }[seg.phase];
      h = `<div class="h" style="font-size:22px">🎬 الافتتاح</div><div class="ctl">${seg.phase !== 'done' ? `<button class="btn pri big" data-act="next">${esc(nx)} ←</button>` : `<button class="btn pri big" data-act="nextseg">الجولة التالية: ${esc(this.nextName())} ←</button>`}<button class="btn" data-act="missions">🤫 توزيع المهام السرية من جديد</button></div>`;
    } else if (seg.g === 'crown') {
      const tie = E.tieInfo();
      h = `<div class="h" style="font-size:22px">🏆 التتويج</div>${tie && seg.phase === 'winner' ? `<div class="warnbox">تعادل في الصدارة بين: ${tie.map(tn).join('، ')}. شغّل جولة كسر التعادل (3 أسئلة استباق للفرق المتعادلة فقط).</div>` : ''}<div class="ctl">${seg.phase !== 'awards' ? `<button class="btn pri big" data-act="next">${seg.phase === 'drum' ? 'كشف الترتيب' : seg.phase === 'reveal' ? 'كشف المركز التالي' : 'لوحة الشرف'} ←</button>` : '<span class="pill">انتهت المسابقة — حُفظت النتيجة في الأرشيف</span>'}${tie ? '<button class="btn gold" data-act="tiebreak">⚖️ كسر التعادل</button>' : ''}</div>`;
    } else if (seg.phase === 'intro') {
      const def = E.gameDef(seg.g) || {};
      h = `<div class="row"><span style="font-size:34px">${esc(def.icon || '⚖️')}</span><div><div class="h" style="font-size:22px">${esc(E.segName(seg.g))}</div><div class="note">${esc(def.desc || 'الفرق المتعادلة فقط')}</div></div></div>${this.modeSel(seg)}<div class="ctl"><button class="btn pri big" data-act="next">ابدأ الجولة (${seg.items.length}) ←</button><button class="btn" data-act="nextseg">تخطي الجولة</button></div>`;
    } else if (seg.phase === 'done') {
      h = `<div class="h" style="font-size:22px">✅ انتهت جولة ${esc(E.segName(seg.g))}</div><div class="ctl">${seg.g === 'tiebreak' ? '<button class="btn pri big" data-act="backcrown">العودة إلى التتويج ←</button>' : `<button class="btn pri big" data-act="nextseg">الجولة التالية: ${esc(this.nextName())} ←</button>`}</div>`;
    } else if (it) h = this.itemDeck(seg, it, timer);
    el.innerHTML = h + (it || !seg ? '' : timer);
  },
  nextName() { const p = this.e.s.plan[this.e.s.planIdx + 1]; return p ? this.e.segName(p.g) : '—'; },
  modeSel(seg) { const def = this.e.gameDef(seg.g) || {}; if (!['mcq', 'memory', 'open', 'whoami'].includes(def.kind) && seg.g !== 'tiebreak') return ''; const opts = def.kind === 'open' || def.kind === 'whoami' ? ['buzz', 'team'] : ['buzz', 'all', 'team']; return `<div class="row"><span class="mut">نمط المشاركة:</span>${opts.map(m => `<button class="chipbtn ${seg.mode === m ? 'armed' : ''}" data-act="mode" data-arg="${m}">${MODE_LBL[m]}</button>`).join('')}</div>`; },
  answerText(it) {
    if (it.kind === 'mcq' || it.kind === 'tf') return `${LET[it.a]}) ${it.c[it.a]}`;
    if (it.kind === 'order') return it.a.map(i => it.c[i]).join(' ← ');
    if (it.kind === 'number') return it.a + ' ' + (it.unit || '');
    if (it.kind === 'open' || it.kind === 'whoami') return it.a;
    return '';
  },
  itemDeck(seg, it, timer) {
    const E = this.e, s = E.s, T = s.teams, ph = seg.phase, tn = id => (E.team(id) || {}).name || '';
    const head = `<div class="row wrap"><span class="pill">${esc(E.segName(seg.g))} — ${seg.idx + 1}/${seg.items.length}</span><span class="pill">${MODE_LBL[seg.mode] || ''}</span>${it.d ? `<span class="pill">${['', 'سهل', 'متوسط', 'صعب'][it.d] || ''}</span>` : ''}${it.cat && D.CATS[it.cat] ? `<span class="pill">${D.CATS[it.cat]}</span>` : ''}<span class="pill">المرحلة: ${esc(ph)}</span></div>`;
    const ansBox = this.answerText(it) ? `<div class="ans-secret">🔒 الإجابة (لك فقط): ${esc(this.answerText(it))}${it.src ? `<small>المصدر: ${esc(it.src)}</small>` : ''}${it.hint ? `<small>تلميح يظهر للجمهور بعد الفتح: ${esc(it.hint)}</small>` : ''}</div>` : '';
    let q = it.q ? `<div class="q">${esc(it.q)}</div>` : '';
    if (it.c && it.kind !== 'taboo') q += `<div class="col" style="gap:4px">${it.c.map((c, i) => `<div class="mut">${LET[i]}) ${esc(c)}</div>`).join('')}</div>`;
    if (it.kind === 'whoami') q += `<div class="col" style="gap:4px">${it.clues.map((c, i) => `<div style="opacity:${i <= it.clue ? 1 : .4}">${i + 1}. ${esc(c)} ${i <= it.clue ? '✓' : ''}</div>`).join('')}</div>`;
    let c = '';
    const cardsQuick = (ph === 'ready' || ph === 'intro') && seg.mode === 'buzz' ? `<div class="note">💡 تفعيل بطاقات القوة يكون من بطاقات الفرق بالأسفل قبل فتح السؤال.</div>` : '';
    // أنواع خاصة
    if (it.kind === 'wheel' || it.kind === 'box') {
      const reps = E.teamMembers(it.team); const repSel = reps.length ? `<select class="in" data-change="rep">${reps.map(m => `<option value="${m.sid}" ${m.sid === it.repSid ? 'selected' : ''}>${esc(m.name)} (اختير ${m.st.pick})</option>`).join('')}</select>` : '';
      c = `<div class="h" style="font-size:20px">${it.kind === 'wheel' ? '🎡' : '🎁'} دور فريق ${esc(tn(it.team))}</div><div class="row"><span class="mut">الممثل المقترح:</span>${repSel}</div>`;
      if (ph === 'turn') c += it.kind === 'wheel' ? `<button class="btn pri big" data-act="spin">🎡 أدر العجلة</button>` : `<div class="boxgrid-h">${seg.boxes.map((b, i) => `<button class="${b.open ? 'op' : ''}" data-act="box" data-arg="${i}" ${b.open ? 'disabled' : ''}>${b.open ? '✓' : i + 1}</button>`).join('')}</div><div class="note">اضغط رقم الصندوق الذي يختاره الفريق.</div>`;
      if (ph === 'spun') { const r = it.res; c += `<div class="ans-secret">النتيجة: ${esc(r.t)}</div>` + ((r.k === 'challenge' || r.k === 'question') ? `<div class="ctl"><button class="btn ok big" data-act="luck" data-arg="1">✔ نجح التحدي</button><button class="btn bad big" data-act="luck" data-arg="0">✘ لم ينجح</button></div>` : `<button class="btn pri big" data-act="luck" data-arg="1">تطبيق النتيجة</button>`); }
      if (ph === 'reveal') c += `<button class="btn pri big" data-act="next">التالي ←</button>`;
      return head + c;
    }
    if (it.kind === 'secret') return head + `<div class="h" style="font-size:20px">🤫 المهام السرية</div><div class="col">${T.map(t => `<div class="row"><b style="color:${t.color}">${esc(t.name)}:</b><span class="grow">${esc((s.missions[t.id] || {}).text || '')}</span></div>`).join('')}</div><div class="note">تظهر كل مهمة على جوالات أعضاء فريقها فقط. سجّل الإنجاز من بطاقة الفريق بالأسفل في أي وقت.</div><div class="ctl"><button class="btn" data-act="missions">إعادة التوزيع</button><button class="btn pri big" data-act="next">التالي ←</button></div>`;
    if (it.kind === 'taboo') {
      const mem = E.teamMembers(it.team);
      c = `<div class="h" style="font-size:20px">🤐 دور ${esc(tn(it.team))}</div><div class="row"><span class="mut">الواصف:</span><select class="in" data-change="rep">${mem.map(m => `<option value="${m.sid}" ${m.sid === it.rep ? 'selected' : ''}>${esc(m.name)}${m.online ? '' : ' (غير متصل)'}</option>`).join('')}</select></div>`;
      if (ph === 'turn') c += `<button class="btn pri big" data-act="taboostart" ${it.rep ? '' : 'disabled'}>ابدأ 60 ثانية</button>${!mem.length ? '<div class="warnbox">لا يوجد أعضاء في الفريق. يمكنك تخطي الدور.</div><button class="btn" data-act="tabooskip">تخطي الدور</button>' : ''}`;
      if (ph === 'open') { const w = it.words[it.wi]; c += `<div class="ans-secret" style="font-size:26px">${esc(w ? w.q : '')} <small>الممنوع: ${w ? w.c.map(esc).join('، ') : ''}</small></div><div class="ctl"><button class="btn ok big" data-act="tabook" data-arg="1">✔ صحيح (+5)</button><button class="btn big" data-act="tabook" data-arg="0">تخطي ⏭</button><button class="btn bad" data-act="tabooend">إنهاء الدور</button></div><div class="h">✓ ${it.got}</div>`; }
      if (ph === 'reveal') c += `<div class="ans-secret">${it.got} كلمات = +${(it.result || {}).pts || 0}</div><button class="btn pri big" data-act="next">الفريق التالي ←</button>`;
      return head + c + timer;
    }
    if (it.kind === 'live') {
      c = `<div class="q">${esc(it.q)}</div><div>${esc(it.desc)}</div>`;
      if (ph === 'ready') c += `<div class="ctl"><button class="btn pri big" data-act="open">▶ ابدأ التحدي (${it.time}ث)</button><button class="btn" data-act="livescorephase">تسجيل النتائج مباشرة</button></div>`;
      if (ph === 'open' || ph === 'score') c += `<div class="note">اضغط الفرق بترتيب إنهائها (الأول ثم الثاني…). النقاط: 20 / 15 / 10 / 5.</div><div class="ctl">${T.map(t => { const p = it.places.indexOf(t.id); return `<button class="btn ${p >= 0 ? 'gold' : ''}" data-act="place" data-arg="${t.id}">${p >= 0 ? (p + 1) + '. ' : ''}${esc(t.name)}</button>`; }).join('')}</div><button class="btn pri big" data-act="livescore" ${it.places.length ? '' : 'disabled'}>اعتماد النتائج</button>`;
      if (ph === 'scored') c += `<div class="ctl"><button class="btn gold" data-act="vote">🗳️ فتح تصويت الجمهور (+10 للأفضل)</button><button class="btn pri big" data-act="next">التالي ←</button></div>`;
      if (ph === 'vote') c += `<div class="ans-secret">الأصوات: ${Object.keys(it.votes).length}</div><button class="btn pri big" data-act="closevote">إغلاق التصويت</button>`;
      if (ph === 'voted') c += `<button class="btn pri big" data-act="next">التالي ←</button>`;
      return head + c + timer;
    }
    if (it.auction && ph === 'bidding') return head + `<div class="h" style="font-size:20px">🔨 المزايدة</div><div class="note">أدخل رهان كل فريق (0–30، ولا يتجاوز نقاطه). السؤال مخفي عن الجمهور حتى الإغلاق.</div>${q}${ansBox}<div class="col">${T.map(t => `<label class="row"><b style="color:${t.color};min-width:80px">${esc(t.name)}</b><input class="in" type="number" min="0" max="30" data-bid="${t.id}" value="${it.bids[t.id] != null ? it.bids[t.id] : ''}"><span class="mut">نقاطه ${E.scores()[t.id]}</span></label>`).join('')}</div><button class="btn pri big" data-act="closebids">إغلاق المزاد وعرض السؤال</button>`;
    if (it.wagerQ && ph === 'wager') return head + `<div class="h" style="font-size:20px">🎲 رهان الحسم</div><div class="note">الحد الأعلى لكل فريق = 25% من نقاطه (بحد أقصى 40).</div>${q}${ansBox}<div class="col">${T.map(t => `<label class="row"><b style="color:${t.color};min-width:80px">${esc(t.name)}</b><input class="in" type="number" min="0" data-wager="${t.id}" value="${it.wagers[t.id] != null ? it.wagers[t.id] : ''}"><span class="mut">الحد ${E.maxWager(t.id)}</span></label>`).join('')}</div><button class="btn pri big" data-act="lockw">تثبيت الرهانات وعرض السؤال</button>`;
    // أسئلة عامة
    c = head + q + ansBox + cardsQuick;
    if (it.reps) c += `<div class="row wrap"><span class="mut">الممثلان:</span>${it.eligible.map(tid => { const mem = E.teamMembers(tid); const cur = it.reps.find(r => s.students[r] && s.students[r].team === tid); return `<select class="in" data-change="duelrep" data-team="${tid}">${mem.map(m => `<option value="${m.sid}" ${m.sid === cur ? 'selected' : ''}>${esc(tn(tid))}: ${esc(m.name)} (${m.st.pick})</option>`).join('')}</select>`; }).join('')}</div>`;
    if (ph === 'ready') {
      if (seg.mode === 'team') c += `<div class="ctl"><button class="btn pri big" data-act="open">▶ عرض السؤال وبدء التشاور</button></div>`;
      else c += `<div class="ctl"><button class="btn pri big" data-act="open">${it.mem ? '👁️ عرض الشبكة' : seg.mode === 'buzz' ? '⚡ فتح الاستباق' : '📱 فتح الإجابة للجميع'}</button><button class="btn" data-act="next">تخطي السؤال</button></div>`;
      if (seg.mode === 'buzz') c += this.manualBuzzRow(it);
    }
    if (ph === 'show') c += `<div class="note">الشبكة معروضة… ستختفي تلقائيًا.</div><button class="btn" data-act="memhide">إخفاء الآن</button>`;
    if (ph === 'open' && it.auction) c += `<div class="ans-secret">يجيب: ${esc(tn(it.winner) || 'الجميع')} — الرهان ${it.bid || 0}</div><div class="ctl"><button class="btn ok big" data-act="auc" data-arg="1">✔ صحيحة</button><button class="btn bad big" data-act="auc" data-arg="0">✘ خاطئة</button></div>`;
    else if (ph === 'open' && it.wagerQ) c += `<div class="note">حدد الفرق التي أجابت صحيحًا:</div><div class="ctl">${T.map(t => `<label class="chipbtn"><input type="checkbox" data-wok="${t.id}"> ${esc(t.name)} (${it.wagers[t.id] || 0})</label>`).join('')}</div><button class="btn pri big" data-act="judgew">اعتماد نتائج الرهان</button>`;
    else if (ph === 'open' && seg.mode === 'buzz') c += `<div class="ctl">${it.kind === 'whoami' ? `<button class="btn gold" data-act="clue" ${it.clue >= it.clues.length - 1 ? 'disabled' : ''}>💡 التلميح التالي (${E.itemPoints(it)} ← ${Math.max(10, E.itemPoints(it) - 10)})</button>` : ''}<button class="btn" data-act="reveal">كشف الإجابة دون نقاط</button></div>` + this.manualBuzzRow(it);
    else if (ph === 'open' && seg.mode === 'all') { const ac = E.answerCounts(); c += `<div class="row wrap">${T.map(t => `<span class="pill" style="border-bottom:3px solid ${t.color}">${esc(t.name)}: ${ac.byTeam[t.id] || 0}/${E.teamMembers(t.id, true).length}</span>`).join('')}<b>المجموع ${ac.n}</b></div>${seg.alive ? `<div class="note">الصامدون: ${Object.keys(seg.alive).length}</div>` : ''}<div class="ctl"><button class="btn pri big" data-act="lock">إغلاق الإجابات وكشف النتيجة</button><button class="btn" data-act="mode" data-arg="team">التحويل إلى إجابة الفريق</button></div>`; }
    else if (ph === 'open' && seg.mode === 'team') c += `<div class="note">حدد الفرق التي أجابت صحيحًا (${E.itemPoints(it)} نقطة لكل فريق):</div><div class="ctl">${T.map(t => `<label class="chipbtn"><input type="checkbox" data-tok="${t.id}"> ${esc(t.name)}</label>`).join('')}</div><button class="btn pri big" data-act="teammark">اعتماد</button>`;
    if (ph === 'answering') { const st = it.buzz.sid ? s.students[it.buzz.sid] : null; c += `<div class="ans-secret" style="font-size:22px;background:rgba(255,255,255,.06);border-color:${(E.team(it.buzz.team) || {}).color}">⚡ ${esc(tn(it.buzz.team))}${st ? ' — ' + esc(st.name) : ''}</div>${it.late && it.late.length ? `<div class="note">وصل بعده: ${it.late.map(l => esc((s.students[l.sid] || {}).name || '') + ' (+' + (l.dt / 1000).toFixed(2) + 'ث)').join('، ')}</div>` : ''}<div class="ctl"><button class="btn ok big" data-act="judge" data-arg="1">✔ صحيحة (+${E.itemPoints(it)})</button><button class="btn bad big" data-act="judge" data-arg="0">✘ خاطئة${s.settings.buzzPenalty ? ' (−' + s.settings.buzzPenalty + ')' : ''}</button></div>`; }
    if (ph === 'paused') c += `<div class="warnbox">إجابة خاطئة. الفرق الخارجة: ${it.locked.map(tn).join('، ')}</div><div class="ctl"><button class="btn pri big" data-act="reopen">⚡ إعادة فتح الاستباق للبقية</button><button class="btn" data-act="reveal">كشف الإجابة</button></div>` + this.manualBuzzRow(it, true);
    if (ph === 'reveal') c += `<div class="ctl"><button class="btn pri big" data-act="next">${seg.idx + 1 >= seg.items.length ? 'إنهاء الجولة' : 'السؤال التالي'} ←</button>${seg.g === 'survival' ? '<button class="btn" data-act="survend">إنهاء الصمود الآن</button>' : ''}</div>`;
    return c + timer;
  },
  manualBuzzRow(it, paused) { const T = this.e.s.teams.filter(t => it.eligible.includes(t.id) && !it.locked.includes(t.id)); return `<div class="row wrap"><span class="mut" style="font-size:12px">منح الأسبقية يدويًا (شفهي/طوارئ):</span>${T.map(t => `<button class="chipbtn" style="border-bottom:3px solid ${t.color}" data-act="mbuzz" data-arg="${t.id}">${esc(t.name)}</button>`).join('')}</div>`; },
  // ---------- بطاقات الفرق ----------
  renderTeams() {
    const E = this.e, s = E.s, sc = E.scores(), rk = E.ranking();
    const el = $('#teams'); if (this.busy(el)) return;
    el.innerHTML = s.teams.map(t => {
      const p = E.participation(t.id), c = s.cards[t.id] || {}, a = s.armed[t.id] || {}, m = s.missions[t.id], r = rk.find(x => x.id === t.id);
      return `<div class="tcard" style="--tc:${t.color}"><div class="row"><b class="h" style="font-size:18px">${esc(t.name)}</b><span class="pill">#${r ? r.rank : ''}</span><span class="grow"></span><span class="sc">${sc[t.id]}</span></div>
        <div class="row mut" style="font-size:12px;margin:4px 0"><span>👥 ${p.online}/${p.members}</span><span>نشِط مؤخرًا ${p.active}/${p.members}</span>${s.frozen[t.id] ? '<span>❄️ مجمّد</span>' : ''}${s.streak[t.id] >= 2 ? '<span>🔥' + s.streak[t.id] + '</span>' : ''}</div>
        <div class="bar"><i style="width:${Math.round(p.ratio * 100)}%"></i></div>
        ${p.quiet.length && p.members > 1 ? `<div class="mut" style="font-size:11px;margin-top:4px">أقل مشاركة: ${p.quiet.slice(0, 3).map(sid => esc((s.students[sid] || {}).name || '')).join('، ')}</div>` : ''}
        <div class="cards-row" style="margin-top:8px"><button class="chipbtn ${a.double ? 'armed' : ''}" data-act="card" data-arg="${t.id}|double" ${c.double ? '' : 'disabled'}>⚡×2 (${c.double || 0})</button><button class="chipbtn ${a.shield ? 'armed' : ''}" data-act="card" data-arg="${t.id}|shield" ${c.shield ? '' : 'disabled'}>🛡️ درع (${c.shield || 0})</button><button class="chipbtn" data-act="card" data-arg="${t.id}|freeze" ${c.freeze ? '' : 'disabled'}>❄️ تجميد (${c.freeze || 0})</button></div>
        <div class="cards-row" style="margin-top:6px"><button class="chipbtn" data-act="adj" data-arg="${t.id}|5">+5</button><button class="chipbtn" data-act="adj" data-arg="${t.id}|10">+10</button><button class="chipbtn" data-act="adj" data-arg="${t.id}|-5">−5</button><button class="chipbtn" data-act="adjc" data-arg="${t.id}">± مخصص</button>${m ? `<button class="chipbtn ${m.done ? 'armed' : ''}" data-act="mission" data-arg="${t.id}" ${m.done ? 'disabled' : ''} title="${esc(m.text)}">🤫 ${m.done ? 'أُنجزت' : 'إنجاز المهمة'}</button>` : ''}</div></div>`;
    }).join('');
  },
  // ---------- التبويبات الجانبية ----------
  renderSide() {
    const tabs = [['room', 'الغرفة'], ['plan', 'البرنامج'], ['bank', 'بنك الأسئلة'], ['log', 'سجل النقاط'], ['settings', 'الإعدادات'], ['archive', 'الأرشيف'], ['help', 'الدليل']];
    const el = $('#side');
    el.innerHTML = `<div class="tabs">${tabs.map(t => `<button class="tab ${this.sideTab === t[0] ? 'on' : ''}" data-act="tab" data-arg="${t[0]}">${t[1]}</button>`).join('')}</div><div id="sidebody">${this['side_' + this.sideTab]()}</div>`;
    this.bindSide();
  },
  side_room() {
    const E = this.e, s = E.s, url = joinUrl(s.code, this.fp);
    const byTeam = s.teams.map(t => { const mem = E.teamMembers(t.id); return `<div style="margin-top:10px"><b style="color:${t.color}">${esc(t.name)}</b> <span class="mut">(${mem.length})</span><div class="row wrap" style="margin-top:6px">${mem.map(m => `<span class="member ${E.participation(t.id).quiet.includes(m.sid) ? 'quiet' : ''}"><span class="dot ${m.online ? 'on' : ''}"></span>${esc(m.name)}<span class="mut" style="font-size:11px">✓${m.st.ok} ✎${m.st.ans} ⚡${m.st.bz}</span><select class="in" style="padding:2px 4px;font-size:11px" data-move="${m.sid}">${s.teams.map(x => `<option value="${x.id}" ${x.id === m.team ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select><button class="chipbtn" data-act="kick" data-arg="${m.sid}" title="إزالة">✕</button></span>`).join('') || '<span class="mut" style="font-size:12px">لا أحد بعد</span>'}</div></div>`; }).join('');
    const bots = Object.keys(s.students).filter(k => k.startsWith('bot-')).length;
    return `<div class="row" style="align-items:flex-start;gap:14px"><div style="width:150px;height:150px;background:#fff;border-radius:12px;padding:6px;flex:none">${url ? qrSvg(url) : '<div style="color:#333;font-size:11px;padding:8px">ضع رابط الصفحة في الإعدادات لإظهار QR</div>'}</div><div class="col grow" style="min-width:0"><div>رمز الغرفة: <span class="code-badge">${esc(s.code)}</span></div>${url ? `<div class="mut" style="font-size:12px;direction:ltr;word-break:break-all">${esc(url)}</div><button class="btn sm" data-act="copy" data-arg="${esc(url)}">نسخ رابط الانضمام</button>` : ''}<div class="row wrap"><button class="btn sm" data-act="newcode" ${s.clock.startedAt ? 'disabled' : ''}>رمز جديد</button><button class="btn sm" data-act="balance">توزيع متوازن عشوائي</button><label class="row" style="font-size:13px"><input type="checkbox" data-set="allowTeamChoice" ${s.settings.allowTeamChoice ? 'checked' : ''}> يختار الطالب فريقه</label></div></div></div>
      <div class="infobox" style="margin-top:10px">لدخول الطلاب: يجب أن يكون كل طالب مسجّل الدخول في Claude ومدعوًّا إلى هذه الصفحة من زر المشاركة. انظر «الدليل» للتفاصيل.</div>
      ${byTeam}
      <div class="card" style="margin-top:12px;background:rgba(255,255,255,.03)"><b>🤖 طلاب افتراضيون للتجربة</b><div class="note">يضيف مشاركين وهميين داخل هذا الحاسوب فقط، يضغطون ويجيبون عشوائيًا لتجربة الألعاب والنقاط. <b>ليسوا أجهزة حقيقية</b>، وأسماؤهم تبدأ بـ🤖.</div><div class="row wrap"><button class="btn sm" data-act="bots" data-arg="8">+8</button><button class="btn sm" data-act="bots" data-arg="20">+20</button><label class="row" style="font-size:13px"><input type="checkbox" data-simon ${this.sim.on ? 'checked' : ''}> تشغيل تلقائي</label>${bots ? `<button class="btn sm bad" data-act="nobots">حذف التجريبيين (${bots})</button>` : ''}</div></div>
      <div class="note" style="margin-top:10px">التشخيص: ${esc(this.net.label().t)}${this.net.mq ? ' · خوادم البث: ' + this.net.mq.links.filter(Boolean).map(l => l.b.n + (l.up ? ' ✓' : ' ✗')).join('، ') + ' · رسائل واردة ' + this.net.mq.stats.in + ' · مرفوضة ' + this.net.mq.stats.bad : ''} · نظراء الغرفة: ${this.net.named ? this.net.named.peers().length : 0} · آخر إشارة: ${this.lastMsg ? Math.round((Date.now() - this.lastMsg) / 1000) + 'ث' : '—'}${this.net.err ? ' · خطأ: ' + esc(this.net.err) : ''}</div>`;
  },
  side_plan() {
    const E = this.e, s = E.s, sc = E.schedule();
    const games = Object.entries(D.GAMES);
    return `<div class="row"><b>إجمالي: ${sc.total} دقيقة</b><span class="grow"></span><button class="btn sm" data-act="plan60">البرنامج الافتراضي</button><button class="btn sm" data-act="plannew">برنامج المبتكرة</button></div>
      <table class="tbl" style="margin-top:8px"><tr><th>#</th><th>الفقرة</th><th>دقائق</th><th>أسئلة</th><th></th></tr>${s.plan.map((p, i) => `<tr style="${i === s.planIdx ? 'background:rgba(34,163,145,.15)' : ''}"><td>${i + 1}</td><td>${esc(E.segName(p.g))}</td><td><input class="in" style="width:56px;padding:4px" type="number" min="1" value="${p.min}" data-pmin="${i}"></td><td>${E.gameDef(p.g) && !['secret', 'taboo', 'live'].includes(p.g) ? `<input class="in" style="width:56px;padding:4px" type="number" min="1" max="20" value="${p.count || E.gameDef(p.g).count || ''}" data-pcnt="${i}">` : ''}</td><td class="row" style="gap:2px"><button class="chipbtn" data-act="pup" data-arg="${i}">▲</button><button class="chipbtn" data-act="pdown" data-arg="${i}">▼</button><button class="chipbtn" data-act="pdel" data-arg="${i}">✕</button></td></tr>`).join('')}</table>
      <div class="note" style="margin:10px 0 6px">أضف لعبة إلى نهاية البرنامج (قبل التتويج):</div>
      <div class="seg-pick">${games.map(([k, g]) => `<button class="g" data-act="padd" data-arg="${k}"><b>${g.icon} ${esc(g.name)}</b><span class="mut">${MODE_LBL[g.mode] || ''}</span></button>`).join('')}</div>`;
  },
  side_bank() {
    const E = this.e, f = this.bf = this.bf || { kind: 'mcq', cat: '', d: '', q: '' };
    const dis = new Set(this.disabled);
    const list = E.allBank.filter(b => b.kind === f.kind && (!f.cat || b.cat === f.cat) && (!f.d || b.d === +f.d) && (!f.q || (b.q + (b.a || '') + (b.c || []).join()).includes(f.q)));
    const kinds = [['mcq', 'اختيار من متعدد'], ['tf', 'صح وخطأ'], ['order', 'رتّبها'], ['whoami', 'من أنا'], ['open', 'ألغاز وشفرات'], ['number', 'الرقم الأقرب'], ['consensus', 'عقل واحد'], ['taboo', 'الكلمة الممنوعة'], ['live', 'تحديات حضورية']];
    const counts = {}; E.bank.forEach(b => { counts[b.kind] = (counts[b.kind] || 0) + 1; });
    return `<div class="row wrap"><select class="in" data-bf="kind">${kinds.map(k => `<option value="${k[0]}" ${f.kind === k[0] ? 'selected' : ''}>${k[1]} (${counts[k[0]] || 0})</option>`).join('')}</select><select class="in" data-bf="cat"><option value="">كل المجالات</option>${Object.entries(D.CATS).map(([k, v]) => `<option value="${k}" ${f.cat === k ? 'selected' : ''}>${v}</option>`).join('')}</select><select class="in" data-bf="d"><option value="">كل المستويات</option><option value="1" ${f.d === '1' ? 'selected' : ''}>سهل</option><option value="2" ${f.d === '2' ? 'selected' : ''}>متوسط</option><option value="3" ${f.d === '3' ? 'selected' : ''}>صعب</option></select><input class="in grow" placeholder="بحث" data-bf="q" value="${esc(f.q)}"></div>
      <div class="row wrap" style="margin-top:8px"><button class="btn sm pri" data-act="qadd">+ سؤال جديد</button><button class="btn sm" data-act="qimport">استيراد</button><button class="btn sm" data-act="qexport">تصدير المخصّص</button><span class="mut" style="font-size:12px">المعروض: ${list.length} · المخصّص: ${this.custom.length}</span></div>
      <div class="scroll" style="margin-top:8px"><table class="tbl">${list.map(b => `<tr style="${dis.has(b.id) ? 'opacity:.4' : ''}"><td><div>${esc(b.q)}</div><div class="mut" style="font-size:12px">${esc(this.bankAns(b))}${b.src ? ' · ' + esc(b.src) : ''}</div></td><td style="white-space:nowrap">${b.d ? ['', 'سهل', 'متوسط', 'صعب'][b.d] : ''}</td><td><button class="chipbtn" data-act="qtoggle" data-arg="${b.id}">${dis.has(b.id) ? 'تفعيل' : 'تعطيل'}</button>${b.custom ? `<button class="chipbtn" data-act="qdel" data-arg="${b.id}">حذف</button>` : ''}</td></tr>`).join('')}</table></div>`;
  },
  bankAns(b) { if (b.kind === 'mcq') return '✔ ' + b.c[0]; if (b.kind === 'tf') return b.a ? '✔ صح' : '✔ خطأ'; if (b.kind === 'order') return b.c.join(' ← '); if (b.kind === 'taboo') return 'ممنوع: ' + b.c.join('، '); if (b.kind === 'consensus') return b.c.join(' / '); if (b.kind === 'whoami') return '✔ ' + b.a + ' — ' + b.clues.length + ' تلميحات'; return b.a != null ? '✔ ' + b.a + (b.unit ? ' ' + b.unit : '') : ''; },
  side_log() {
    const E = this.e, s = E.s;
    return `<div class="row"><button class="btn sm" data-act="undo" ${s.undo.length ? '' : 'disabled'}>↶ تراجع عن آخر عملية${s.undo.length ? ' (' + esc(s.undo[s.undo.length - 1].label) + ')' : ''}</button></div><div class="scroll" style="margin-top:8px"><table class="tbl"><tr><th>الوقت</th><th>الفريق</th><th>النقاط</th><th>السبب</th></tr>${[...s.ledger].reverse().slice(0, 200).map(x => { const t = E.team(x.team) || {}; return `<tr><td class="mut">${new Date(x.t).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</td><td style="color:${t.color}">${esc(t.name || '')}</td><td style="direction:ltr;font-weight:700;color:${x.d > 0 ? 'var(--ok)' : x.d < 0 ? 'var(--bad)' : 'var(--mut)'}">${x.d > 0 ? '+' : ''}${x.d}</td><td>${esc(x.why)}</td></tr>`; }).join('')}</table></div>`;
  },
  side_settings() {
    const s = this.e.s, st = s.settings;
    return `<div class="col">
      <label class="col"><span class="mut">اسم المسابقة</span><input class="in" data-title value="${esc(s.title)}"></label>
      <div class="mut">الفرق (2–4)</div>${s.teams.map((t, i) => `<div class="row"><input type="color" value="${t.color}" data-tcolor="${i}" style="width:40px;height:34px;border:0;background:none"><input class="in grow" value="${esc(t.name)}" data-tname="${i}">${s.teams.length > 2 ? `<button class="chipbtn" data-act="tdel" data-arg="${i}">✕</button>` : ''}</div>`).join('')}${s.teams.length < 4 ? '<button class="btn sm" data-act="tadd">+ إضافة فريق</button>' : ''}
      <div class="row wrap"><label class="row">خصم الإجابة الخاطئة في الاستباق <input class="in" style="width:60px" type="number" min="0" max="20" data-set="buzzPenalty" value="${st.buzzPenalty}"></label><label class="row">وقت الإجابة بعد الاستباق (ث) <input class="in" style="width:60px" type="number" min="3" max="60" data-set="answerTime" value="${st.answerTime}"></label></div>
      <label class="row">مستوى المؤثرات على الشاشة <select class="in" data-set="fx"><option value="high" ${st.fx === 'high' ? 'selected' : ''}>كامل</option><option value="low" ${st.fx === 'low' ? 'selected' : ''}>مخفف</option><option value="off" ${st.fx === 'off' ? 'selected' : ''}>بلا حركة</option></select></label>
      <label class="row"><input type="checkbox" data-set="autoSecret" ${st.autoSecret ? 'checked' : ''}> توزيع المهام السرية تلقائيًا في الافتتاح</label>
      <hr style="border-color:var(--line)">
      <div class="row wrap"><b>الشعار</b><label class="btn sm">رفع شعار آخر<input type="file" accept="image/*" data-logo hidden></label><button class="btn sm" data-act="logoreset">الشعار الأصلي</button><button class="btn sm" data-act="colorsreset">ألوان الشعار الأصلية</button></div>
      <div class="row wrap"><b>الخط</b><label class="btn sm">تحميل ملف خط (مثل خط ثمانية الرسمي)<input type="file" accept=".otf,.ttf,.woff,.woff2" data-font hidden></label><button class="btn sm" data-act="fontreset">الخط الافتراضي</button></div>
      <div class="note">الخط المحمّل يُحفظ في هذا المتصفح فقط ولا يُرفع إلى أي مكان (التزامًا بترخيص الخط)، فحمّله على حاسوب العرض نفسه.</div>
      <label class="col"><span class="mut">رابط الصفحة (لـ QR) — اتركه فارغًا لاستخدام الرابط المضمّن</span><input class="in" data-url value="${esc(LS.get('bena.url', ''))}" placeholder="${esc(ARTIFACT_URL.startsWith('%%') ? 'https://claude.ai/…' : ARTIFACT_URL)}" style="direction:ltr"></label>
      <hr style="border-color:var(--line)">
      <div class="row wrap"><button class="btn sm" data-act="backup">نسخة احتياطية للمسابقة</button><button class="btn sm" data-act="restore">استعادة من نسخة</button><button class="btn sm bad" data-act="reset">مسابقة جديدة</button></div></div>`;
  },
  side_archive() {
    const L = LS.get('bena.archive', []);
    return L.length ? `<div class="col">${[...L].reverse().map(a => `<div class="card" style="padding:10px"><div class="row"><b>${esc(a.title)}</b><span class="mut" style="font-size:12px">${new Date(a.at).toLocaleString('ar-SA')}</span><span class="grow"></span><span class="mut">${a.players} مشارك</span></div><div class="row wrap" style="margin-top:6px">${a.teams.map(t => `<span class="pill" style="border-bottom:3px solid ${t.color}">${t.rank}. ${esc(t.name)} ${t.score}</span>`).join('')}</div></div>`).join('')}<button class="btn sm bad" data-act="clrarch">مسح الأرشيف</button></div>` : '<div class="note">تُحفظ هنا نتائج كل مسابقة تصل إلى التتويج.</div>';
  },
  side_help() {
    return `<div class="col note" style="color:var(--tx)">
      <b class="h">التشغيل يوم المسابقة</b>
      <div>1. افتح هذه الصفحة على حاسوب المشرف واختر «لوحة المشرف».</div>
      <div>2. لشاشة البروجكتور: اضغط «🖥️ شاشة العرض» واتبع الخطوات (نافذة ثانية في المتصفح نفسه على الشاشة الممتدة)، أو استخدم «▶ عرض في هذه النافذة» إن كانت الشاشة مكررة.</div>
      <div>3. يمسح الطلاب رمز QR، ويُدخلون رمز الغرفة وأسماءهم.</div>
      <div>4. ابدأ المسابقة، وتنقّل بالأزرار الكبيرة. كل خطوة تظهر على الشاشة الكبيرة فورًا.</div>
      <div>اختصارات: <b>مسافة</b> = الزر الرئيس، <b>Ctrl+Z</b> = تراجع، <b>1/0</b> = صحيحة/خاطئة عند الاستباق.</div>
      <b class="h" style="margin-top:8px">الاتصال بالجوالات — الحقيقة كما هي</b>
      <div class="warnbox">يعمل اتصال الجوالات عبر «غرفة» صفحات Claude اللحظية. لذلك يجب أن يكون الطالب <b>مسجّل الدخول في Claude</b> و<b>مدعوًّا</b> إلى هذه الصفحة. الزائر برابط عام لا يتصل بالغرفة. جرّب بجوال واحد قبل يوم المسابقة.</div>
      <div>• حاسوب المشرف هو المرجع الوحيد للأسبقية: أول ضغطة تصل إليه تُعتمد، ولا يُستخدم وقت الجوال. اختلاف سرعة الإنترنت قد يقدّم طالبًا على آخر بأجزاء من الثانية، ولا يوجد نظام يضمن عدالة زمنية مطلقة بين شبكات مختلفة.</div>
      <div>• أبقِ نافذة لوحة المشرف ظاهرة (لا تصغّرها)، لأن المتصفح يبطئ النوافذ المخفية فتتأخر الضغطات.</div>
      <div>• المهام السرية وكلمة «الكلمة الممنوعة» تُخفى في الواجهة عن غير أصحابها، لكنها ليست مشفرة.</div>
      <b class="h" style="margin-top:8px">وضع الطوارئ</b>
      <div>إذا انقطع الإنترنت تستمر اللوحة والشاشة (النافذتان في المتصفح نفسه تتصلان محليًا): امنح الأسبقية يدويًا بأزرار الفرق، وحوّل الأسئلة إلى «إجابة الفريق»، وعدّل النقاط، وشغّل المؤقتات، وانتقل بين الجولات، وأعلن النتائج. الاستباق من الجوالات يتوقف حتى يعود الاتصال. تُحفظ الحالة تلقائيًا كل نصف ثانية في هذا المتصفح.</div>
      <b class="h" style="margin-top:8px">نظام النقاط</b>
      <div>سهل 10 · متوسط 20 · صعب 30 · من أنا 40←10 · الإجابة الفردية: نسبة أعضاء الفريق المجيبين صحيحًا × 20 أو 25 · سلسلة 3 = +5 · الحسم ×2 · رهان الحسم ≤ 25% (حد 40) · المفاجآت ≤ 20 · التحدي الحضوري 20/15/10/5 · تصويت الجمهور +10.</div></div>`;
  },
  bindSide() {
    const el = $('#side'), E = this.e;
    $$('[data-set]', el).forEach(x => x.onchange = () => { const k = x.dataset.set; let v = x.type === 'checkbox' ? x.checked : x.value; if (x.type === 'number') v = +v; E.setSetting(k, v); });
    $$('[data-move]', el).forEach(x => x.onchange = () => E.moveStudent(x.dataset.move, x.value));
    const so = $('[data-simon]', el); if (so) so.onchange = () => { this.sim.on = so.checked; };
    $$('[data-pmin]', el).forEach(x => x.onchange = () => { E.s.plan[+x.dataset.pmin].min = Math.max(1, +x.value || 1); E.touch(); });
    $$('[data-pcnt]', el).forEach(x => x.onchange = () => { E.s.plan[+x.dataset.pcnt].count = Math.max(1, Math.min(20, +x.value || 1)); E.touch(); });
    $$('[data-bf]', el).forEach(x => { const ev = x.tagName === 'INPUT' ? 'oninput' : 'onchange'; x[ev] = () => { this.bf[x.dataset.bf] = x.value; if (x.tagName === 'INPUT') { clearTimeout(this.bft); this.bft = setTimeout(() => { $('#sidebody').innerHTML = this.side_bank(); this.bindSide(); const i = $('[data-bf="q"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 300); } else this.renderSide(); }; });
    const ti = $('[data-title]', el); if (ti) ti.onchange = () => { E.s.title = ti.value.slice(0, 40) || 'ميدان بناء'; E.touch(); };
    $$('[data-tname]', el).forEach(x => x.onchange = () => { const L = E.s.teams.map(t => ({ ...t })); L[+x.dataset.tname].name = x.value; E.setTeams(L); });
    $$('[data-tcolor]', el).forEach(x => x.onchange = () => { const L = E.s.teams.map(t => ({ ...t })); L[+x.dataset.tcolor].color = x.value; E.setTeams(L); });
    const lg = $('[data-logo]', el); if (lg) lg.onchange = () => this.loadLogo(lg.files[0]);
    const fn = $('[data-font]', el); if (fn) fn.onchange = () => { const f = fn.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { if (!LS.set('bena.font', r.result)) toast('الملف كبير؛ سيعمل حتى إغلاق الصفحة فقط'); Brand.apply(); toast('تم تحميل الخط'); }; r.readAsDataURL(f); };
    const u = $('[data-url]', el); if (u) u.onchange = () => { LS.set('bena.url', u.value.trim()); this.broadcast(true); this.renderSide(); };
  },
  loadLogo(f) {
    if (!f) return; const r = new FileReader();
    r.onload = () => { const img = new Image(); img.onload = () => { const max = 900, k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height); const url = c.toDataURL('image/png'); LS.set('bena.logo', url); this.extractColors(x, c.width, c.height); this.net.emit('logo', url); this.stage.refreshLogo(); this.render(); toast('تم تحديث الشعار على هذا الجهاز وشاشة العرض في المتصفح نفسه'); }; img.src = r.result; };
    r.readAsDataURL(f);
  },
  extractColors(ctx, w, h) { try { const d = ctx.getImageData(0, 0, w, h).data; const bins = {}; for (let i = 0; i < d.length; i += 16) { const [r, g, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]]; if (a < 200) continue; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx - mn < 40 || mx < 60) continue; const k = (r >> 5) + ',' + (g >> 5) + ',' + (b >> 5); bins[k] = (bins[k] || 0) + 1; } const top = Object.entries(bins).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => '#' + k.split(',').map(v => ((+v << 5) + 16).toString(16).padStart(2, '0')).join('')); if (top.length) { LS.set('bena.colors', [top[0], top[1] || top[0]]); Brand.apply(); } } catch (e) { } },
  // ---------- الأوامر ----------
  act(a, arg, btn) {
    const E = this.e, s = E.s, it = E.item();
    const [x, y] = String(arg || '').split('|');
    switch (a) {
      case 'start': E.goSegment(0); break;
      case 'goseg': if (s.planIdx >= 0 && +arg !== s.planIdx) confirmBox('الانتقال إلى «' + E.segName(s.plan[+arg].g) + '»؟ ستُترك الجولة الحالية (النقاط محفوظة).', () => E.goSegment(+arg)); else E.goSegment(+arg); break;
      case 'nextseg': E.nextSegment(); break;
      case 'next': E.nextItem(); break;
      case 'open': E.openItem(); break;
      case 'memhide': E.memHide(); break;
      case 'judge': E.judge(arg === '1'); break;
      case 'reopen': E.reopen(); break;
      case 'reveal': E.revealItem(); break;
      case 'lock': E.lockAll(); break;
      case 'clue': E.revealClue(); break;
      case 'mbuzz': E.manualBuzz(arg); break;
      case 'mode': E.setMode(arg); break;
      case 'teammark': E.teamMark($$('[data-tok]').filter(c => c.checked).map(c => c.dataset.tok)); break;
      case 'spin': E.spin(); break;
      case 'box': E.openBox(+arg); break;
      case 'luck': E.applyLuck(arg === '1'); break;
      case 'closebids': $$('[data-bid]').forEach(i => { if (i.value !== '') E.setBid(i.dataset.bid, i.value); }); E.closeBids(); break;
      case 'auc': E.judgeAuction(arg === '1'); break;
      case 'lockw': $$('[data-wager]').forEach(i => E.setWager(i.dataset.wager, i.value)); E.lockWagers(); break;
      case 'judgew': E.judgeWager($$('[data-wok]').filter(c => c.checked).map(c => c.dataset.wok)); break;
      case 'taboostart': E.tabooStart(); break;
      case 'tabook': E.tabooMark(arg === '1'); break;
      case 'tabooend': E.tabooEnd(); break;
      case 'tabooskip': it.revealed = true; s.seg.phase = 'reveal'; it.result = { pts: 0 }; E.touch(); break;
      case 'place': E.livePlace(arg); break;
      case 'livescorephase': s.seg.phase = 'score'; E.touch(); break;
      case 'livescore': E.liveScore(); break;
      case 'vote': E.openVote(); break;
      case 'closevote': E.closeVote(); break;
      case 'survend': E.survivalEnd(); break;
      case 'tiebreak': E.startTiebreak(); break;
      case 'backcrown': E.goSegment(s.returnTo != null ? s.returnTo : s.plan.length - 1); break;
      case 'pause': E.pauseTimer(); break;
      case 'resume': E.resumeTimer(); break;
      case 'add10': E.addTime(10); break;
      case 'cleartimer': E.clearTimer(); E.touch(); break;
      case 'undo': { const l = E.undo(); toast(l ? 'تم التراجع: ' + l : 'لا يوجد ما يُتراجع عنه'); break; }
      case 'card': if (y === 'freeze') { modal(`<div class="col"><b>تجميد أي فريق؟ (لا يستطيع الاستباق في السؤال التالي الذي يشارك فيه)</b><div class="ctl">${s.teams.filter(t => t.id !== x).map(t => `<button class="btn" data-fz="${t.id}" style="border-bottom:3px solid ${t.color}">${esc(t.name)}</button>`).join('')}</div><button class="btn" data-close>إلغاء</button></div>`, (m, close) => $$('[data-fz]', m).forEach(b => b.onclick = () => { E.useCard(x, 'freeze', b.dataset.fz); close(); })); } else E.useCard(x, y); break;
      case 'adj': E.manualAdjust(x, +y); break;
      case 'adjc': modal(`<div class="col"><b>تعديل نقاط ${esc(E.team(arg).name)}</b><input class="in" type="number" id="adv" placeholder="مثال: 15 أو -10"><input class="in" id="adw" placeholder="السبب"><div class="row"><button class="btn pri" data-ok>اعتماد</button><button class="btn" data-close>إلغاء</button></div></div>`, (m, close) => { $('[data-ok]', m).onclick = () => { const v = Math.round(+$('#adv', m).value); if (v) E.manualAdjust(arg, v, $('#adw', m).value || 'تعديل يدوي'); close(); }; }); break;
      case 'mission': E.missionDone(arg); break;
      case 'missions': E.assignMissions(); break;
      case 'tab': if (['room', 'plan', 'bank', 'log', 'settings', 'archive', 'help'].includes(arg)) { this.sideTab = arg; this.renderSide(); } break;
      case 'copy': this.copy(arg); break;
      case 'newcode': s.code = E.makeCode(); this.afterReset(); break;
      case 'balance': E.autoBalance(); break;
      case 'kick': confirmBox('إزالة هذا المشارك؟ (لن يُسمح له بالعودة بالجهاز نفسه)', () => E.removeStudent(arg, true)); break;
      case 'bots': this.addBots(+arg); break;
      case 'nobots': this.removeBots(); break;
      case 'plan60': E.setPlan(D.DEFAULT_PLAN); break;
      case 'plannew': E.setPlan([{ g: 'opening', min: 4 }, { g: 'everyone', min: 7 }, { g: 'whoami', min: 7 }, { g: 'duel', min: 8 }, { g: 'consensus', min: 4 }, { g: 'estimate', min: 5 }, { g: 'survival', min: 6 }, { g: 'boxes', min: 5 }, { g: 'final', min: 11 }, { g: 'crown', min: 3 }]); break;
      case 'pup': if (+arg > 0) { const p = s.plan; [p[+arg - 1], p[+arg]] = [p[+arg], p[+arg - 1]]; if (s.planIdx === +arg) s.planIdx--; else if (s.planIdx === +arg - 1) s.planIdx++; E.touch(); } break;
      case 'pdown': if (+arg < s.plan.length - 1) { const p = s.plan; [p[+arg + 1], p[+arg]] = [p[+arg], p[+arg + 1]]; if (s.planIdx === +arg) s.planIdx++; else if (s.planIdx === +arg + 1) s.planIdx--; E.touch(); } break;
      case 'pdel': if (+arg !== s.planIdx) { s.plan.splice(+arg, 1); if (s.planIdx > +arg) s.planIdx--; E.touch(); } break;
      case 'padd': { const ci = s.plan.findIndex(p => p.g === 'crown'); const at = ci >= 0 ? ci : s.plan.length; s.plan.splice(at, 0, { g: arg, min: 5 }); if (s.planIdx >= at) s.planIdx++; E.touch(); toast('أُضيفت: ' + E.segName(arg)); break; }
      case 'qtoggle': { const i = this.disabled.indexOf(arg); if (i >= 0) this.disabled.splice(i, 1); else this.disabled.push(arg); this.saveBank(); this.renderSide(); break; }
      case 'qdel': this.custom = this.custom.filter(c => c.id !== arg); this.saveBank(); this.renderSide(); break;
      case 'qadd': this.qAddForm(); break;
      case 'qimport': this.qImport(); break;
      case 'qexport': this.textOut('تصدير الأسئلة المخصّصة (JSON)', JSON.stringify(this.custom, null, 1)); break;
      case 'tdel': { const L = s.teams.filter((_, i) => i !== +arg); E.setTeams(L); break; }
      case 'tadd': { const L = s.teams.map(t => ({ ...t })); const i = L.length; const used = new Set(L.map(t => t.id)); let id = 't' + (i + 1), k = i + 1; while (used.has(id)) id = 't' + (++k); L.push({ id, name: BENA_ENGINE.TEAM_NAMES[i] || 'فريق ' + (i + 1), color: BENA_ENGINE.TEAM_COLORS[i] || '#888' }); E.setTeams(L); break; }
      case 'logoreset': LS.del('bena.logo'); this.net.emit('logo', null); this.stage.refreshLogo(); this.render(); break;
      case 'colorsreset': LS.del('bena.colors'); document.documentElement.style.removeProperty('--brand'); document.documentElement.style.removeProperty('--brand2'); break;
      case 'fontreset': LS.del('bena.font'); document.documentElement.style.removeProperty('--fh'); break;
      case 'backup': this.textOut('نسخة احتياطية كاملة للمسابقة — احفظ النص في ملف', JSON.stringify(Object.assign({}, s, { undo: [] }))); break;
      case 'restore': modal(`<div class="col"><b>الصق نص النسخة الاحتياطية</b><textarea class="in" rows="8" id="rs" style="direction:ltr"></textarea><label class="btn sm">أو اختر ملفًا<input type="file" hidden id="rsf"></label><div class="row"><button class="btn pri" data-ok>استعادة</button><button class="btn" data-close>إلغاء</button></div></div>`, (m, close) => { $('#rsf', m).onchange = e => { const f = e.target.files[0]; if (f) f.text().then(t => { $('#rs', m).value = t; }); }; $('[data-ok]', m).onclick = () => { try { const st = JSON.parse($('#rs', m).value); if (!st.code || !st.teams) throw 0; st.undo = st.undo || []; this.newEngine(st); this.afterReset(); close(); toast('تمت الاستعادة'); } catch (e) { toast('النص غير صالح'); } }; }); break;
      case 'reset': confirmBox('بدء مسابقة جديدة؟ ستُمسح النقاط والطلاب الحاليون (الأرشيف يبقى).', () => { const keep = { teams: s.teams, settings: s.settings, plan: s.plan, title: s.title }; this.newEngine(null); Object.assign(this.e.s, JSON.parse(JSON.stringify(keep))); this.e.s.teams.forEach(t => this.e.initTeam(this.e.s, t.id)); this.e.s.cards = {}; this.e.s.armed = {}; this.e.s.streak = {}; this.e.s.teams.forEach(t => this.e.initTeam(this.e.s, t.id)); this.removeBots(); this.afterReset(); }); break;
      case 'clrarch': confirmBox('مسح أرشيف النتائج؟', () => { LS.set('bena.archive', []); if (this.net.db && this.uidv) this.net.db.doc(`data/users/${this.uidv}/archive`).set({ list: [] }).catch(() => { }); this.renderSide(); }); break;
      case 'sound': this.sound = !this.sound; LS.set('bena.hostSound', this.sound); this.renderBar(); break;
      case 'present': this.presentMode(); break;
      case 'displayhelp': modal(`<div class="col"><div class="h" style="font-size:20px">🖥️ تشغيل شاشة العرض</div><div class="note" style="color:var(--tx)"><b>الطريقة المفضلة (شاشة ممتدة):</b><br>1. صِل البروجكتور واجعله «شاشة ممتدة» لا مكررة.<br>2. افتح هذه الصفحة نفسها في نافذة متصفح جديدة واسحبها إلى البروجكتور.<br>3. اختر «شاشة العرض» ثم اضغط في أي مكان لتفعيل الصوت وملء الشاشة.<br>تتصل النافذتان مباشرةً محليًا حتى دون إنترنت، وتظهر هنا «شاشة العرض متصلة».<br><br><b>على جهاز آخر:</b> افتح الصفحة بحساب Claude نفسه، واختر «شاشة العرض»، وأدخل الرمز <b>${esc(s.code)}</b>.<br><br><b>شاشة مكررة (نسخة واحدة):</b> استخدم «▶ عرض في هذه النافذة». ستختفي أدوات المشرف والإجابات، وتعود باختصار Esc.</div><button class="btn" data-close>حسنًا</button></div>`); break;
    }
  },
  copy(t) { try { navigator.clipboard.writeText(t).then(() => toast('تم النسخ'), () => this.textOut('انسخ النص', t)); } catch (e) { this.textOut('انسخ النص', t); } },
  textOut(title, text) { modal(`<div class="col"><b>${esc(title)}</b><textarea class="in" rows="10" readonly style="direction:ltr;font-size:12px">${esc(text)}</textarea><div class="row"><button class="btn pri" data-cp>نسخ</button><button class="btn" data-close>إغلاق</button></div></div>`, (m) => { $('[data-cp]', m).onclick = () => { const ta = $('textarea', m); ta.select(); try { navigator.clipboard.writeText(text).then(() => toast('تم النسخ'), () => toast('حدّد النص وانسخه يدويًا')); } catch (e) { toast('حدّد النص وانسخه يدويًا'); } }; }); },
  qAddForm() {
    modal(`<div class="col"><b>سؤال اختيار من متعدد جديد</b><textarea class="in" id="nq" rows="2" placeholder="نص السؤال"></textarea><input class="in" id="na" placeholder="الإجابة الصحيحة" style="border-color:var(--ok)"><input class="in" id="w1" placeholder="خيار خاطئ 1"><input class="in" id="w2" placeholder="خيار خاطئ 2"><input class="in" id="w3" placeholder="خيار خاطئ 3"><div class="row"><select class="in" id="nc">${Object.entries(D.CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><select class="in" id="nd"><option value="1">سهل</option><option value="2" selected>متوسط</option><option value="3">صعب</option></select></div><input class="in" id="ns" placeholder="المصدر (اختياري)"><div class="row"><button class="btn pri" data-ok>حفظ</button><button class="btn" data-close>إلغاء</button></div></div>`, (m, close) => {
      $('[data-ok]', m).onclick = () => { const v = id => $('#' + id, m).value.trim(); const c = [v('na'), v('w1'), v('w2'), v('w3')]; if (!v('nq') || c.some(x => !x)) return toast('أكمل السؤال والخيارات الأربعة'); if (new Set(c).size < 4) return toast('الخيارات مكررة'); this.custom.push({ id: 'u' + Date.now().toString(36), kind: 'mcq', cat: v('nc'), d: +v('nd'), q: v('nq'), c, src: v('ns') }); this.saveBank(); close(); this.renderSide(); toast('أُضيف السؤال'); };
    });
  },
  qImport() {
    modal(`<div class="col"><b>استيراد أسئلة</b><div class="note">JSON: مصفوفة عناصر مثل {"kind":"mcq","cat":"general","d":2,"q":"…","c":["الصحيحة","خطأ","خطأ","خطأ"]}<br>أو CSV بسطر لكل سؤال: السؤال,الصحيحة,خطأ1,خطأ2,خطأ3,المجال,الصعوبة</div><textarea class="in" rows="8" id="imp" style="direction:ltr"></textarea><label class="btn sm">اختيار ملف<input type="file" hidden id="impf" accept=".json,.csv,.txt"></label><div class="row"><button class="btn pri" data-ok>استيراد</button><button class="btn" data-close>إلغاء</button></div></div>`, (m, close) => {
      $('#impf', m).onchange = e => { const f = e.target.files[0]; if (f) f.text().then(t => { $('#imp', m).value = t; }); };
      $('[data-ok]', m).onclick = () => {
        const txt = $('#imp', m).value.trim(); let items = [];
        try { if (txt.startsWith('[')) items = JSON.parse(txt); else items = txt.split(/\r?\n/).filter(Boolean).map(l => l.split(',').map(x => x.trim())).filter(r => r.length >= 5).map(r => ({ kind: 'mcq', q: r[0], c: r.slice(1, 5), cat: D.CATS[r[5]] ? r[5] : 'general', d: [1, 2, 3].includes(+r[6]) ? +r[6] : 2 })); } catch (e) { return toast('تعذّرت قراءة النص'); }
        const ok = items.filter(x => x && typeof x.q === 'string' && x.q.trim() && (x.kind !== 'mcq' || (Array.isArray(x.c) && x.c.length === 4 && x.c.every(c => typeof c === 'string' && c)))).map((x, i) => Object.assign({}, x, { id: 'u' + Date.now().toString(36) + i, kind: x.kind || 'mcq', cat: D.CATS[x.cat] ? x.cat : 'general', d: [1, 2, 3].includes(+x.d) ? +x.d : 2 }));
        this.custom.push(...ok); this.saveBank(); close(); this.renderSide(); toast('استُورد ' + ok.length + ' من ' + items.length);
      };
    });
  },
  // ---------- العرض داخل النافذة نفسها ----------
  presentMode() {
    SFX.unlock();
    const ov = document.createElement('div'); ov.className = 'stage-host'; ov.style.zIndex = 500; document.body.appendChild(ov);
    const st = new Stage(ov, { sound: true }); st.setRoster(this.e.roster()); st.update(this.pubState()); this.present = st;
    const ex = document.createElement('button'); ex.className = 'btn sm'; ex.textContent = '✕ رجوع للوحة (Esc)'; ex.style.cssText = 'position:fixed;top:8px;left:8px;z-index:501;opacity:.25'; ex.onmouseenter = () => ex.style.opacity = 1; ex.onmouseleave = () => ex.style.opacity = .25;
    const close = () => { ov.remove(); ex.remove(); clearInterval(st.loop); this.present = null; try { document.fullscreenElement && document.exitFullscreen(); } catch (e) { } };
    ex.onclick = close; document.body.appendChild(ex); this.closePresent = close;
    try { document.documentElement.requestFullscreen().catch(() => { }); } catch (e) { }
  },
  key(e) {
    if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName)) return;
    if (e.key === 'Escape' && this.present) { this.closePresent(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); this.act('undo'); return; }
    const E = this.e, seg = E.s.seg;
    if (seg && seg.phase === 'answering' && (e.key === '1' || e.key === '0')) { this.act('judge', e.key); return; }
    if (e.key === ' ' && !e.repeat) { const b = $('#deck .btn.pri.big'); if (b && !b.disabled) { e.preventDefault(); b.click(); } }
  },
  tickUI() {
    const r = this.e.remaining(); $$('[data-htm]').forEach(x => { x.textContent = r == null ? '' : fmtTime(r); x.style.color = r != null && r < 5000 ? 'var(--bad)' : ''; });
    const now = Date.now(); if (!this._lb || now - this._lb > 5000) { this._lb = now; this.renderBar(); }
  }
};
// تغييرات القوائم المنسدلة داخل لوحة التحكم
document.addEventListener('change', e => {
  const x = e.target; if (typeof Host === 'undefined' || !Host.e || !document.getElementById('deck')) return;
  if (x.dataset.change === 'rep') Host.e.setRep(x.value);
  if (x.dataset.change === 'duelrep') Host.e.setDuelRep(x.dataset.team, x.value);
});
