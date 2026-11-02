/* ===== واجهة الطالب (الجوال) ===== */
const Student = {
  init(code, fp) {
    this.fp = fp || null;
    this.root = $('#app'); this.root.innerHTML = '<div class="pl"><div class="pl-state">…</div></div>';
    this.resolveSid().then(() => this.init2(code));
  },
  // هوية لكل تبويب: تبقى بعد التحديث، ولا تتكرر إن فُتح تبويب آخر في المتصفح نفسه
  async resolveSid() {
    // هوية لكل تبويب: تبقى بعد تحديث الصفحة. إن أُغلق التبويب وعاد الطالب باسمه نفسه، يستعيد المشرف سجله تلقائيًا
    this.cfg = LS.get('bena.player', null) || {};
    let sid = null; try { sid = sessionStorage.getItem('bena.sid'); } catch (e) { }
    if (!sid) { sid = uid(8); if (this.cfg.sid) this.cfg.joinedCode = null; }
    try { sessionStorage.setItem('bena.sid', sid); } catch (e) { }
    this.cfg.sid = sid;
  },
  init2(code) {
    if (code) this.cfg.code = code;
    this.P = null; this.R = { L: [], M: {} }; this.local = {}; this.hostSeen = 0; this.lastHs = null; this.lastV = -1;
    this.net = new Net('student');
    if (this.fp) { this.cfg.fp = this.fp; } if (this.cfg.fp && (!code || code === this.cfg.code)) this.net.expectFp = this.cfg.fp;
    this.net.on('state', (P) => this.onState(P));
    this.net.on('roster', (R) => { if (R && R.L && !(this.R.v > R.v && this.R.hs === this.lastHs)) { this.R = R; this.R.hs = this.lastHs; this.render(); } });
    this.priv = {}; this.net.on('priv', d => this.onPriv(d));
    if (Crypt.ok) Crypt.keypair().then(kp => { this.kp = kp; if (this.joined) this.net.presence({ pk: kp.pub }); }).catch(() => { this.net.presence({ pk: 'none' }); });
    this.net.on('status', () => this.renderNet());
    this.net.on('peers', ch => { this.hostHere = ch.peers.some(p => p.presence && p.presence.r === 'h'); this.renderNet(); });
    this.net.init().then(() => { if (this.joined) this.connect(); });
    this.clock = Object.create(Clock);
    setInterval(() => this.tickUI(), 200);
    setInterval(() => { if (this.joined) this.net.heartbeat(); }, 3000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { this.wake(); if (this.joined) this.net.heartbeat(); } });
    window.addEventListener('pagehide', () => this.net.bye());
    this.joined = !!(this.cfg.nm && this.cfg.code && !code) || !!(this.cfg.nm && code && this.cfg.joinedCode === code);
    this.root = $('#app');
    this.render();
    if (this.joined && this.net.caps) this.connect();
  },
  save() { LS.set('bena.player', this.cfg); try { sessionStorage.setItem('bena.joined', this.cfg.joinedCode || ''); } catch (e) { } },
  async wake() { try { if (navigator.wakeLock && !this.wl) { this.wl = await navigator.wakeLock.request('screen'); this.wl.addEventListener('release', () => { this.wl = null; }); } } catch (e) { } },
  async connect() {
    const c = this.cfg; this.wake();
    this.net.code = c.code;
    this.net.presence({ r: 's', c: c.code, sid: c.sid, nm: c.nm, tw: c.tw || null, pk: this.kp ? this.kp.pub : (Crypt.ok ? null : 'none') });
    await this.net.joinRoom(c.code);
    this.renderNet();
  },
  onState(P) {
    if (!P || P.code !== this.cfg.code) return;
    if (P.hs !== this.lastHs) { this.lastHs = P.hs; this.lastV = -1; }
    if (P.v < this.lastV) return;
    const fxNew = this.P && P.fx && this.P.fx && P.fx.n !== this.P.fx.n ? P.fx : null;
    this.lastV = P.v; this.P = P; this.hostSeen = Date.now(); this.clock.set(P.tm);
    this.render();
    if (fxNew && fxNew.k === 'buzz' && this.me() && fxNew.d && fxNew.d.team === this.me().team) this.vibe([60, 40, 120]);
  },
  async onPriv(d) {
    if (!d || !d.m || (d.code && d.code !== this.cfg.code)) return;
    if (d.h === this.privH && d.n < this.privN) return; this.privH = d.h; this.privN = d.n; const ct = d.m[this.cfg.sid]; if (!ct) return;
    if (ct === this._lastCt) return;
    try {
      let obj;
      if (ct.startsWith('p:')) obj = JSON.parse(ct.slice(2));
      else { const hk = this.P && this.P.hk; if (!hk || !this.kp) return; if (!this.hkey || this.hkey.hk !== hk) this.hkey = { hk, k: await Crypt.derive(this.kp.priv, hk) }; obj = await Crypt.dec(this.hkey.k, ct.slice(2)); }
      this._lastCt = ct; this.priv = obj || {}; this._k = null; this.render();
    } catch (e) { }
  },
  me() { const r = (this.R.L || []).find(x => x[0] === this.cfg.sid); return r ? { sid: r[0], name: r[1], team: r[2] } : null; },
  team(id) { const t = this.P && this.P.T.find(x => x[0] === id); return t ? { id: t[0], name: t[1], color: t[2], score: t[3], frz: t[6] } : null; },
  vibe(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { } },
  renderNet() {
    const el = $('#netbar'); if (!el) return; const l = this.net.label(); const fresh = Date.now() - this.hostSeen < 9000;
    el.innerHTML = `<span class="dot ${l.cls}"></span>${esc(l.t)}${this.joined ? ' · ' + (fresh ? 'المشرف متصل' : 'بانتظار المشرف') : ''}${this.joined && !fresh && this.net.untrusted && this.net.untrusted.size ? ' <button class="btn sm" id="retrust">إعادة الربط بالمشرف</button>' : ''}`;
    const b = $('#retrust'); if (b) b.onclick = () => { this.net.resetTrust(); this.cfg.fp = null; this.save(); toast('سيُربط جوالك بالمشرف الحالي'); };
  },
  joinForm() {
    const c = this.cfg; const teams = D.GAMES && (this.P ? this.P.T : null);
    const tnames = teams ? teams.map(t => [t[0], t[1], t[2]]) : BENA_ENGINE.TEAM_NAMES.map((n, i) => ['t' + (i + 1), n, BENA_ENGINE.TEAM_COLORS[i]]);
    this.root.innerHTML = `<div class="pl"><div style="height:140px;display:flex;justify-content:center;margin:10px 0 6px">${Brand.logoImg()}</div>
      <div class="h" style="text-align:center;font-size:26px;font-weight:800">الانضمام إلى ميدان بناء</div>
      <div class="col" style="margin-top:16px">
        <label class="col"><span class="mut">رمز الغرفة</span><input class="in" id="jc" inputmode="numeric" maxlength="4" value="${esc(c.code || '')}" style="font-size:26px;text-align:center;letter-spacing:8px;direction:ltr"></label>
        <label class="col"><span class="mut">اسمك</span><input class="in" id="jn" maxlength="24" value="${esc(c.nm || '')}" placeholder="اكتب اسمك" style="font-size:20px"></label>
        <div class="mut">اختر فريقك (قد يعدّله المشرف)</div>
        <div class="teampick">${tnames.map(t => `<button data-tw="${t[0]}" class="${c.tw === t[0] ? 'sel' : ''}" style="--tc:${t[2]}">${esc(t[1])}</button>`).join('')}<button data-tw="" class="${!c.tw ? 'sel' : ''}" style="--tc:#666;grid-column:span 2">وزّعني تلقائيًا</button></div>
        <button class="btn pri big" id="jgo">دخول</button>
        <div class="note">لا يحتاج الدخول بريدًا ولا كلمة مرور داخل المسابقة. ستُحفظ بياناتك على هذا الجوال فقط لتعود تلقائيًا إن انقطع الاتصال.</div>
      </div><div class="netbar" id="netbar"></div></div>`;
    $$('[data-tw]', this.root).forEach(b => b.onclick = () => { c.tw = b.dataset.tw || null; $$('[data-tw]', this.root).forEach(x => x.classList.toggle('sel', x === b)); });
    $('#jgo').onclick = () => {
      SFX.unlock();
      const code = $('#jc').value.replace(/\D/g, '').slice(0, 4), nm = $('#jn').value.trim();
      if (code.length !== 4) return toast('رمز الغرفة 4 أرقام');
      if (nm.length < 2) return toast('اكتب اسمك');
      c.code = code; c.nm = nm; c.joinedCode = code; this.save(); this.joined = true; this.render(); this.connect();
    };
    this.renderNet();
  },
  key() {
    const P = this.P, I = (P && P.I) || {}, me = this.me();
    return JSON.stringify([!!P, P && P.g, P && P.ph, P && P.ii, I.qid, I.rv, I.bz, I.lk, I.reps, I.word && I.word[0], I.rep, I.wi, me && me.team, me && me.name, (this.R.M || {})[me && me.team], P && P.alive && me && P.alive.includes(me.sid), (I.ad || []).includes(this.cfg.sid), JSON.stringify(this.local[I.qid] || null), JSON.stringify(this.priv || {}), JSON.stringify(P && P.V), JSON.stringify(P && P.bomb), JSON.stringify(I.vt && [I.vt.cr, Object.keys(I.vt.lk || {}), I.vt.tr]), JSON.stringify(I.sh), P && P.bs, I.bo, this.local['b' + I.qid + '.' + I.bo] ? 1 : 0, P && P.T.map(t => t[3] + '' + t[6]).join(), P && P.rev, I.res2 ? 1 : 0, (this.R.L || []).length]);
  },
  render() {
    if (!this.joined) return this.joinForm();
    const k = this.key(); if (k === this._k && $('.pl-body', this.root)) return; this._k = k;
    const P = this.P, me = this.me(), c = this.cfg;
    const t = me && P ? this.team(me.team) : null;
    const M = this.priv && this.priv.m ? this.priv.m : null;
    let body = this.bodyHTML(P, me, t);
    this.root.innerHTML = `<div class="pl"><div class="pl-head" style="--tc:${t ? t.color : '#334'}"><span class="nm">${esc(me ? me.name : c.nm)}</span><span class="pill" style="background:rgba(0,0,0,.25);border:0;color:#fff">${esc(t ? t.name : 'بانتظار الفريق')}</span><span class="sc">${t ? t.score : ''}</span></div>
      <div class="pl-body">${body}
      ${M && P && P.g ? `<details class="pl-mission"${P.I && P.I.k === 'secret' ? ' open' : ''}><summary>🤫 مهمة فريقك السرية ${M[1] ? '✅ أُنجزت' : ''}</summary><div style="margin-top:6px">${esc(M[0])}</div><div class="mut" style="font-size:12px">لا تُظهرها للفرق الأخرى. إنجازها = +15</div></details>` : ''}
      ${P ? `<div class="pl-mini">${P.T.map(x => `<span style="--tc:${x[2]}">${esc(x[1])} ${x[3]}</span>`).join('')}</div>` : ''}
      </div><div class="netbar" id="netbar"></div><div style="text-align:center"><button class="btn ghost sm mut" id="leave">تغيير الاسم أو الغرفة</button></div></div>`;
    this.bind();
    this.renderNet();
  },
  bodyHTML(P, me, t) {
    if (!P) return `<div class="pl-state big">✅ تم تسجيلك</div><div class="pl-state">بانتظار وصول حالة المسابقة من حاسوب المشرف…<br><span class="mut">رمز الغرفة ${esc(this.cfg.code)}</span></div>`;
    if (!me) return `<div class="pl-state">بانتظار تسجيلك لدى المشرف…<br><span class="mut">إن طال الانتظار، تأكد من رمز الغرفة أو اطلب من المشرف إضافتك.</span></div>`;
    const I = P.I || {};
    if (!P.g) { const mates = (this.R.L || []).filter(x => x[2] === me.team).map(x => x[1]); return `<div class="pl-state big win">أنت في فريق ${esc(t.name)} ✅</div><div class="pl-state">زملاؤك: ${mates.map(esc).join('، ') || '—'}</div><div class="pl-state mut">انتظر بدء المسابقة وتابع الشاشة الكبيرة 👀</div>`; }
    if (P.g === 'opening') return `<div class="pl-state big">🎬 الافتتاح</div><div class="pl-state">تابع الشاشة الكبيرة. فريقك: <b>${esc(t.name)}</b></div>`;
    if (P.g === 'crown') { const rk = (P.rk || []).find(r => r[0] === me.team); const show = P.ph === 'winner' || P.ph === 'awards'; return `<div class="pl-state big">🏆 التتويج</div>${show && rk ? `<div class="pl-state big ${rk[2] === 1 ? 'win' : ''}">${rk[2] === 1 ? '👑 فريقك هو البطل!' : 'مركز فريقك: ' + rk[2]}</div>` : '<div class="pl-state">تابع الشاشة…</div>'}`; }
    if (P.ph === 'intro') return `<div class="pl-state big">${esc(P.gi || '')} ${esc(P.gn)}</div><div class="pl-state">${esc(P.gd || '')}</div>`;
    if (P.ph === 'done') return `<div class="pl-state big">انتهت الجولة</div><div class="pl-state">تابع الترتيب على الشاشة</div>`;
    if (!P.I) return `<div class="pl-state">تابع الشاشة…</div>`;
    const myTeam = me.team, mine = this.local[I.qid];
    const q = I.q ? `<div class="pl-q">${esc(I.q)}</div>` : '';
    const rev = I.rv ? this.revealHTML(P, me) : '';
    // ألعاب خاصة
    if (I.k === 'secret') return `<div class="pl-state big">🤫 افتح مهمة فريقك بالأسفل</div>`;
    if (I.k === 'wheel' || I.k === 'box') { const tt = this.team(I.team); return `<div class="pl-state big" style="border:2px solid ${tt.color}">${I.k === 'wheel' ? '🎡' : '🎁'} دور فريق ${esc(tt.name)}</div>${I.team === myTeam ? `<div class="pl-state">${I.rep && I.rep === me.name ? '<b>أنت من سيختار!</b> توجّه إلى الشاشة.' : 'فريقك يختار الآن — ' + esc(I.rep || '')}</div>` : ''}${I.res ? `<div class="pl-state">${esc(I.res.t)}</div>` : ''}`; }
    if (I.k === 'taboo') {
      const tt = this.team(I.team);
      const W = this.priv && this.priv.w; if (I.rep === me.sid && P.ph === 'open' && W) return `<div class="pl-state">أنت الواصف! صف الكلمة دون ذكر الممنوعات</div><div class="taboo-card"><div class="w">${esc(W[0])}</div><div class="b">${W[1].map(w => `<span>${esc(w)}</span>`).join('')}</div></div><div class="pl-timer" data-tm></div>`;
      if (I.rep === me.sid) return `<div class="pl-state big win">أنت الواصف لفريقك 🎤</div><div class="pl-state">ستظهر الكلمة هنا عند البدء.</div>`;
      return `<div class="pl-state big" style="border:2px solid ${tt.color}">🤐 دور ${esc(tt.name)}</div><div class="pl-state">${I.team === myTeam ? 'خمّنوا! يصف لكم ' + esc(I.repName || '') : 'استمعوا… وانتظروا دوركم'}</div><div class="pl-state big">${I.got || 0} ✓</div>`;
    }
    if (I.k === 'live') {
      if (P.ph === 'vote') { const v = mine; return `<div class="pl-q">🗳️ صوّت لأفضل فريق أداءً (غير فريقك)</div><div class="pl-choices">${P.T.filter(x => x[0] !== myTeam).map(x => `<button data-vote="${x[0]}" class="${v === x[0] ? 'sel' : ''}" ${v ? 'disabled' : ''} style="border-inline-start:6px solid ${x[2]}">${esc(x[1])}</button>`).join('')}</div>${v ? '<div class="pl-state">✅ تم تسجيل صوتك</div>' : ''}`; }
      return `<div class="pl-state big">🏃 ${esc(I.q)}</div><div class="pl-state">${esc(I.desc)}</div><div class="pl-timer" data-tm></div>`;
    }
    if (I.auc && P.ph === 'bidding') return `<div class="pl-state big">🔨 المزاد</div><div class="pl-state">تشاوروا: كم نقطة يراهن فريقكم؟ أخبروا المشرف (حتى 30)</div>`;
    if (I.wq && P.ph === 'wager') return `<div class="pl-state big">🎲 رهان الحسم</div><div class="pl-state">حددوا رهان فريقكم مع المشرف (حتى 25% من نقاطكم)</div>`;
    if (I.wq && P.ph === 'open') return `${q}<div class="pl-state">✍️ اكتبوا إجابة فريقكم على ورقة وسلموها للمشرف</div>`;
    // الاستباق
    if (P.mode === 'buzz' || I.auc) {
      if (I.k === 'whoami') { const cl = (I.clues || []).map((c, i) => `<div class="pl-state" style="text-align:right">${i + 1}. ${esc(c)}</div>`).join(''); var head = `<div class="pl-q">🕵️ من أنا؟ (${I.pts} نقطة)</div>${cl}`; } else var head = q;
      if (I.rv) return head + rev;
      if (I.auc) return head + `<div class="pl-state">${I.win === myTeam ? '🎤 فريقك فاز بالمزاد — أجيبوا!' : 'الفريق الفائز بالمزاد يجيب'}</div>`;
      if (P.ph === 'ready') return head + `<button class="buzzer" disabled>استعد</button>`;
      if (P.ph === 'answering' && I.bz) { const bt = this.team(I.bz[0]); if (I.bz[0] === myTeam) return head + `<div class="pl-state big win">${I.bz[1] === me.name ? '🎤 أنت صاحب الأسبقية! أجب الآن' : '⚡ فريقك حصل على الأسبقية عبر ' + esc(I.bz[1])}</div><div class="pl-timer" data-tm></div>`; return head + `<div class="pl-state big lose">سبقكم ${esc(bt.name)}${I.bz[1] ? ' — ' + esc(I.bz[1]) : ''}</div>`; }
      if (P.ph === 'paused') return head + `<div class="pl-state">${(I.lk || []).includes(myTeam) ? '❌ خرج فريقك من هذا السؤال' : '⏳ قد يُعاد فتح الاستباق لكم'}</div>`;
      if (P.ph === 'open') {
        const t2 = this.team(myTeam);
        let why = '';
        if (!(I.el || []).includes(myTeam)) why = 'فريقك ليس في هذه المواجهة — شجّع!';
        else if ((I.lk || []).includes(myTeam)) why = 'خرج فريقك من هذا السؤال';
        else if (t2 && t2.frz) why = '❄️ فريقك مجمّد في هذا السؤال';
        else if (I.reps && !I.reps.some(r => r[0] === me.sid)) why = 'المواجهة بين الممثلين: ' + I.reps.map(r => esc(r[1])).join(' و ');
        if (why) return head + `<div class="pl-state">${why}</div>`;
        if (this.local['b' + I.qid + '.' + I.bo]) return head + `<button class="buzzer pressed" disabled>أُرسلت</button><div class="pl-state">بانتظار تأكيد حاسوب المشرف…</div>`;
        return head + `<button class="buzzer" data-buzz>اضغط!</button>${I.reps ? '<div class="pl-state win">أنت ممثل فريقك ⚔️</div>' : ''}`;
      }
      return head;
    }
    if (P.mode === 'team') return q + (I.rv ? rev : `<div class="pl-state">👥 تشاوروا مع فريقكم، والممثل يقدّم الإجابة للمشرف</div>${I.c ? `<div class="pl-choices">${I.c.map((c, i) => `<button disabled><span class="L">${LET[i]}</span>${esc(c)}</button>`).join('')}</div>` : ''}`);
    // الإجابة الفردية
    if (P.alive && !P.alive.includes(me.sid) && P.g === 'survival') return q + `<div class="pl-state big lose">💔 خرجت من الصمود</div><div class="pl-state">شجّع زملاءك الصامدين!</div>`;
    if (P.ph === 'ready') return q + `<div class="pl-state">استعد… ستظهر الخيارات بعد لحظات</div>`;
    if (P.ph === 'show') return `<div class="pl-state big">👁️ انظر إلى الشاشة وتذكّر!</div>`;
    if (I.rv) return q + rev;
    if (P.ph !== 'open') return q;
    const sent = (I.ad || []).includes(me.sid);
    const conf = mine != null ? `<div class="pl-state">${sent ? '✅ وصلت إجابتك إلى المشرف' : '⏳ جارٍ الإرسال…'}</div>` : '';
    if (I.k === 'number') return q + (mine != null ? `<div class="pl-state big">${esc(mine)} ${esc(I.unit || '')}</div>` + conf : `<input class="in" id="num" inputmode="decimal" placeholder="اكتب رقمًا" style="font-size:28px;text-align:center;direction:ltr"><button class="btn pri big" data-num>إرسال</button>`) + '<div class="pl-timer" data-tm></div>';
    if (I.k === 'order') {
      const seq = (this.local['o' + I.qid] || []);
      if (mine != null) return q + `<div class="pl-state">ترتيبك: ${mine.map(i => esc(I.c[i])).join(' ← ')}</div>` + conf;
      return q + `<div class="mut" style="text-align:center">اضغط العناصر بالترتيب الصحيح</div><div class="pl-choices">${I.c.map((c, i) => { const at = seq.indexOf(i); return `<button data-ord="${i}" class="${at >= 0 ? 'sel' : ''}"><span class="L">${at >= 0 ? at + 1 : '·'}</span>${esc(c)}</button>`; }).join('')}</div><div class="row"><button class="btn grow" data-ordreset>إعادة</button><button class="btn pri grow" data-ordsend ${seq.length === I.c.length ? '' : 'disabled'}>إرسال</button></div><div class="pl-timer" data-tm></div>`;
    }
    return q + `<div class="pl-choices">${(I.c || []).map((c, i) => `<button data-ans="${i}" class="${mine === i ? 'sel' : ''}" ${mine != null ? 'disabled' : ''}><span class="L">${LET[i]}</span>${esc(c)}</button>`).join('')}</div>${conf}<div class="pl-timer" data-tm></div>`;
  },
  revealHTML(P, me) {
    const I = P.I, mine = this.local[I.qid];
    let h = '';
    if (I.k === 'consensus') { const R = I.res2 && I.res2[me.team]; return `<div class="pl-state big">${R && R.ratio != null ? 'توافق فريقك ' + Math.round(R.ratio * 100) + '% (+' + (R.pts || 0) + ')' : 'انتهى التصويت'}</div>`; }
    if (I.c && I.a !== undefined && I.k !== 'order') h += `<div class="pl-choices">${I.c.map((c, i) => `<button disabled class="${i === I.a ? 'ok' : (mine === i ? 'no' : '')}"><span class="L">${LET[i]}</span>${esc(c)}</button>`).join('')}</div>`;
    else if (I.k === 'order' && I.a) h += `<div class="pl-state">الترتيب الصحيح: ${I.a.map(i => esc(I.c[i])).join(' ← ')}</div>`;
    else if (I.a !== undefined) h += `<div class="pl-state big">الإجابة: ${esc(I.a)}${I.k === 'number' && I.unit ? ' ' + esc(I.unit) : ''}</div>`;
    if (mine != null && P.mode === 'all' && I.k !== 'number') { const ok = I.k === 'order' ? JSON.stringify(mine) === JSON.stringify(I.a) : mine === I.a; h += `<div class="pl-state big ${ok ? 'win' : 'lose'}">${ok ? '✅ إجابتك صحيحة' : '❌ إجابتك خاطئة'}</div>`; if (ok) this.vibe(80); }
    const R = I.res2;
    if (R && R.team !== undefined && R.team) { const tt = this.team(R.team); h += `<div class="pl-state">${R.ok ? '✅' : '❌'} ${esc(tt.name)}</div>`; }
    else if (R && R[me.team] && R[me.team].pts) h += `<div class="pl-state">فريقك: +${R[me.team].pts}</div>`;
    return h;
  },
  bind() {
    const P = this.P, I = (P && P.I) || {}, c = this.cfg;
    const b = $('[data-buzz]', this.root);
    if (b) { const go = e => { e.preventDefault(); const bk = 'b' + I.qid + '.' + I.bo; if (this.local[bk]) return; SFX.unlock(); this.local[bk] = 1; this.net.presence({ bz: { q: I.qid, o: I.bo, n: Date.now() } }); this.vibe(40); this._k = null; this.render(); }; b.addEventListener('pointerdown', go, { once: true }); }
    $$('[data-ans]', this.root).forEach(x => x.onclick = () => { if (this.local[I.qid] != null) return; const v = +x.dataset.ans; this.local[I.qid] = v; this.net.presence({ an: { q: I.qid, v } }); this.vibe(20); this._k = null; this.render(); });
    const nb = $('[data-num]', this.root); if (nb) nb.onclick = () => { const raw = ($('#num').value || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٫,]/g, '.'); const v = parseFloat(raw); if (!isFinite(v)) return toast('اكتب رقمًا صحيحًا'); this.local[I.qid] = v; this.net.presence({ an: { q: I.qid, v } }); this._k = null; this.render(); };
    $$('[data-ord]', this.root).forEach(x => x.onclick = () => { const k = 'o' + I.qid; const seq = this.local[k] = this.local[k] || []; const i = +x.dataset.ord; if (seq.includes(i)) seq.splice(seq.indexOf(i), 1); else seq.push(i); this._k = null; this.render(); });
    const orr = $('[data-ordreset]', this.root); if (orr) orr.onclick = () => { this.local['o' + I.qid] = []; this._k = null; this.render(); };
    const ors = $('[data-ordsend]', this.root); if (ors) ors.onclick = () => { const seq = this.local['o' + I.qid] || []; if (seq.length !== I.c.length) return; this.local[I.qid] = seq.slice(); this.net.presence({ an: { q: I.qid, v: seq.slice() } }); this._k = null; this.render(); };
    $$('[data-vote]', this.root).forEach(x => x.onclick = () => { if (this.local[I.qid]) return; this.local[I.qid] = x.dataset.vote; this.net.presence({ vt: { q: I.qid, t: x.dataset.vote } }); this._k = null; this.render(); });
    const lv = $('#leave'); if (lv) lv.onclick = () => { this.joined = false; c.joinedCode = null; this.save(); this.render(); };
  },
  tickUI() { const r = this.clock.rem(); $$('[data-tm]', this.root).forEach(e => { e.textContent = r == null ? '' : '⏱ ' + fmtTime(r); }); if (this.joined && Date.now() - this.hostSeen > 9000) this.renderNet(); }
};
