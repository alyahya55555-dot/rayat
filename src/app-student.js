/* ===== واجهة الطالب (الجوال): بسيطة وسريعة ===== */
const Student = {
  init(code, fp) {
    this.fp = fp || null; this.root = $('#app');
    this.root.innerHTML = '<div class="pl"><div class="pl-state">…</div></div>';
    // هوية لكل تبويب: تبقى بعد تحديث الصفحة. إن أُغلق التبويب وعاد الطالب باسمه نفسه يستعيد المشرف سجله.
    this.cfg = LS.get('bena.player', null) || {};
    let sid = null; try { sid = sessionStorage.getItem('bena.sid'); } catch (e) { }
    if (!sid) { sid = uid(8); this.cfg.joinedCode = null; }
    try { sessionStorage.setItem('bena.sid', sid); } catch (e) { }
    this.cfg.sid = sid;
    if (code) this.cfg.code = code;
    this.P = null; this.R = { L: [] }; this.local = {}; this.hostSeen = 0; this.lastHs = null; this.lastV = -1; this.priv = {}; this.sheet = null; this.n = 0;
    this.net = new Net('student');
    if (this.fp) this.cfg.fp = this.fp; if (this.cfg.fp && (!code || code === this.cfg.code)) this.net.expectFp = this.cfg.fp;
    this.net.on('state', P => this.onState(P));
    this.net.on('roster', R => { if (R && R.L && !(this.R.v > R.v && this.R.hs === this.lastHs)) { this.R = R; this.R.hs = this.lastHs; this.render(); } });
    this.net.on('priv', d => this.onPriv(d));
    this.net.on('status', () => this.renderNet());
    if (Crypt.ok) Crypt.keypair().then(kp => { this.kp = kp; if (this.joined) this.net.presence({ pk: kp.pub }); }).catch(() => { this.net.presence({ pk: 'none' }); });
    this.joined = !!(this.cfg.nm && this.cfg.code && this.cfg.joinedCode === this.cfg.code);
    this.net.init().then(() => { if (this.joined) this.connect(); });
    this.clock = Object.create(Clock);
    setInterval(() => this.tickUI(), 250);
    setInterval(() => { if (this.joined) this.net.heartbeat(); }, 3000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { this.wake(); if (this.joined) this.net.heartbeat(); } });
    window.addEventListener('pagehide', () => this.net.bye());
    this.render();
  },
  save() { LS.set('bena.player', this.cfg); },
  async wake() { try { if (navigator.wakeLock && !this.wl) { this.wl = await navigator.wakeLock.request('screen'); this.wl.addEventListener('release', () => { this.wl = null; }); } } catch (e) { } },
  connect() {
    const c = this.cfg; this.wake(); this.net.code = c.code;
    this.net.presence({ r: 's', c: c.code, sid: c.sid, nm: c.nm, tw: c.tw || null, pk: this.kp ? this.kp.pub : (Crypt.ok ? null : 'none') });
    this.net.joinRoom(c.code); this.renderNet();
  },
  send(field, data) { this.n++; this.net.presence({ [field]: Object.assign({ n: this.n }, data) }); },
  onState(P) {
    if (!P || P.code !== this.cfg.code) return;
    if (P.hs !== this.lastHs) { this.lastHs = P.hs; this.lastV = -1; }
    if (P.v < this.lastV) return;
    const old = this.P; this.lastV = P.v; this.P = P; this.hostSeen = Date.now(); this.clock.set(P.tm);
    const me = this.me();
    if (old && P.fx && old.fx && P.fx.n !== old.fx.n && me) { const d = P.fx.d || {}; if (P.fx.k === 'buzz' && d.team === me.team) this.vibe([60, 40, 120]); if ((P.fx.k === 'correct' || P.fx.k === 'crack') && d.team === me.team) this.vibe([30, 30, 30]); if (P.fx.k === 'battle' && (P.BR || []).some(r => r.to === me.team || r.from === me.team)) this.vibe([200, 80, 200, 80, 300]); }
    this.render();
  },
  async onPriv(d) {
    if (!d || !d.m || (d.code && d.code !== this.cfg.code)) return;
    if (d.h === this.privH && d.n < this.privN) return; this.privH = d.h; this.privN = d.n;
    const ct = d.m[this.cfg.sid]; if (!ct || ct === this._lastCt) return;
    try {
      let obj; if (ct.startsWith('p:')) obj = JSON.parse(ct.slice(2));
      else { const hk = this.P && this.P.hk; if (!hk || !this.kp) return; if (!this.hkey || this.hkey.hk !== hk) this.hkey = { hk, k: await Crypt.derive(this.kp.priv, hk) }; obj = await Crypt.dec(this.hkey.k, ct.slice(2)); }
      this._lastCt = ct; this.priv = obj || {}; this._k = null; this.render();
    } catch (e) { }
  },
  me() { const r = (this.R.L || []).find(x => x[0] === this.cfg.sid); return r ? { sid: r[0], name: r[1], team: r[2] } : null; },
  team(id) { const t = this.P && this.P.T.find(x => x[0] === id); return t ? { id: t[0], name: t[1], color: t[2], score: t[3], gold: t[4], theme: t[5], lv: t[6], cap: t[7], capName: t[8] } : null; },
  isCap() { const me = this.me(), t = me && this.team(me.team); return !!(t && t.cap === me.sid); },
  levels(t) { return Object.fromEntries(D.BUILD_KEYS.map((k, i) => [k, t.lv[i]])); },
  vibe(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { } },
  renderNet() {
    const el = $('#netbar'); if (!el) return; const l = this.net.label(); const fresh = Date.now() - this.hostSeen < 9000;
    el.innerHTML = `<span class="dot ${l.cls}"></span>${esc(l.t)}${this.joined ? ' · ' + (fresh ? 'متصل بالمشرف' : 'بانتظار المشرف') : ''}${this.joined && !fresh && this.net.untrusted && this.net.untrusted.size ? ' <button class="btn sm" id="retrust">إعادة الربط</button>' : ''}`;
    const b = $('#retrust'); if (b) b.onclick = () => { this.net.resetTrust(); this.cfg.fp = null; this.save(); toast('سيُربط جوالك بالمشرف الحالي'); };
  },
  joinForm() {
    const c = this.cfg; const T = this.P ? this.P.T.map(t => [t[0], t[1], t[2]]) : BENA_ENGINE.TEAM_NAMES.map((n, i) => ['t' + (i + 1), n, BENA_ENGINE.TEAM_COLORS[i]]);
    this.root.innerHTML = `<div class="pl"><div class="pl-logo">${Brand.logoImg()}</div>
      <div class="h" style="text-align:center;font-size:24px;font-weight:800">ادخل الجزيرة</div>
      <div class="col" style="margin-top:14px">
        <label class="col"><span class="mut">رمز الغرفة</span><input class="in" id="jc" inputmode="numeric" maxlength="4" value="${esc(c.code || '')}" style="font-size:28px;text-align:center;letter-spacing:10px;direction:ltr"></label>
        <label class="col"><span class="mut">اسمك</span><input class="in" id="jn" maxlength="24" value="${esc(c.nm || '')}" placeholder="اكتب اسمك" style="font-size:20px"></label>
        <div class="mut">فريقك</div>
        <div class="teampick">${T.map(t => `<button data-tw="${t[0]}" class="${c.tw === t[0] ? 'sel' : ''}" style="--tc:${t[2]}">${esc(t[1])}</button>`).join('')}<button data-tw="" class="${!c.tw ? 'sel' : ''}" style="--tc:#667;grid-column:1/-1">وزّعني تلقائيًا</button></div>
        <button class="btn pri big" id="jgo">دخول</button>
      </div><div class="netbar" id="netbar"></div></div>`;
    $$('[data-tw]', this.root).forEach(b => b.onclick = () => { c.tw = b.dataset.tw || null; $$('[data-tw]', this.root).forEach(x => x.classList.toggle('sel', x === b)); });
    $('#jgo').onclick = () => {
      SFX.unlock();
      const code = $('#jc').value.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '').slice(0, 4), nm = $('#jn').value.trim();
      if (code.length !== 4) return toast('رمز الغرفة 4 أرقام'); if (nm.length < 2) return toast('اكتب اسمك');
      if (code !== c.code) { c.fp = null; this.net.expectFp = null; }
      c.code = code; c.nm = nm; c.joinedCode = code; this.save(); this.joined = true; this.render(); this.connect();
    };
    this.renderNet();
  },
  key() {
    const P = this.P, I = (P && P.I) || {}, me = this.me(), t = me && this.team(me.team);
    return JSON.stringify([!!P, P && P.g, P && P.ph, P && P.ii, I.qid, I.bo, I.rv, I.bz, I.lk, me, t, this.priv, this.local[I.qid], this.local['b' + I.qid + '.' + I.bo], (I.ad || []).includes(this.cfg.sid), I.vt && [I.vt.cr, Object.keys(I.vt.lk || {})], I.wset, I.wpick, P && P.rev, I.res2 ? 1 : 0, (this.R.L || []).length, P && P.CO, P && P.BR ? P.BR.length : 0, this.ctab, this.att, P && P.T.map(t => t[9])]);
  },
  render() {
    if (!this.joined) { if ($('#jn', this.root)) return; return this.joinForm(); }
    const k = this.key(); if (k === this._k && $('.pl-body', this.root)) return; const ae = document.activeElement; if (ae && ae.id === 'tname' && this.root.contains(ae)) return; this._k = k;
    const P = this.P, me = this.me(), t = me && P ? this.team(me.team) : null, cap = this.isCap();
    const head = `<div class="pl-head" style="--tc:${t ? t.color : '#334'}"><div class="nm">${esc(t ? t.name : 'بانتظار الفريق')}<small>${esc(me ? me.name : this.cfg.nm)}${cap ? ' · القائد 👑' : ''}</small></div><div class="nums"><span><b>${t ? t.score : 0}</b>نقطة</span><span class="g"><b>${t ? t.gold : 0}</b>💰 ذهب</span></div></div>`;
    const body = this.bodyHTML(P, me, t);
    this.root.innerHTML = `<div class="pl">${head}<div class="pl-body">${body}</div><div class="netbar" id="netbar"></div><div style="text-align:center"><button class="btn ghost sm mut" id="leave">تغيير الاسم أو الغرفة</button></div></div>`;
    this.bind(); this.renderNet();
  },
  // أثناء الإجابة نخفي زر السوق حتى لا يشتت القائد
  busyPhase() { const P = this.P; return !!P && ['open', 'answering', 'show', 'wager', 'paused'].includes(P.ph); },
  villageBox(t) { const fl = ((this.P && this.P.T.find(x => x[0] === t.id)) || [])[9] || {}; return `<div class="pl-vil">${villageSVG({ id: t.id, color: t.color, theme: t.theme, name: t.name }, this.levels(t), { labels: true, gold: t.gold, shield: fl.sh, off: Object.fromEntries((fl.off || []).map(k => [k, 1])) })}</div>`; },
  bodyHTML(P, me, t) {
    if (!P) return `<div class="pl-state big">✅ تم تسجيلك</div><div class="pl-state">بانتظار المشرف… <span class="mut">الغرفة ${esc(this.cfg.code)}</span></div>`;
    if (!me) return `<div class="pl-state">بانتظار تسجيلك لدى المشرف…</div>`;
    const I = P.I || {}, cap = this.isCap();
    const capLine = `<div class="mut" style="text-align:center;font-size:14px">${cap ? '👑 أنت قائد الفريق: تبني وتحمي وتهاجم في «مجلس القرية» بعد كل جولة' : 'قائد فريقك: ' + esc(t.capName || '—')}</div>`;
    const nameBox = cap && (!P.g || P.g === 'opening') ? `<div class="pl-name"><span class="mut">اسم قريتكم</span><input class="in" id="tname" maxlength="20" value="${esc(this.local.tn != null ? this.local.tn : t.name)}"><button class="btn pri" data-tname>اعتماد</button></div>` : '';
    if (!P.g) return `<div class="pl-state big win">أنت في فريق ${esc(t.name)} ✅</div>${nameBox}${this.villageBox(t)}${capLine}<div class="pl-state mut">تابع الشاشة الكبيرة، وستبدأ المسابقة قريبًا</div>`;
    if (P.g === 'council') return this.councilHTML(P, me, t);
    if (P.g === 'opening' && !(P.I && ['open', 'reveal'].includes(P.ph))) {
      if (P.ph === 'themes') {
        if (!cap) return `<div class="pl-state big">🎨 قائدكم يختار طابع القرية</div>${this.villageBox(t)}${capLine}`;
        return `<div class="pl-q">🎨 اختر طابع قريتكم</div><div class="mut" style="text-align:center;font-size:14px">يغيّر شكل القرية فقط، ولا يؤثر في الفوز</div><div class="themes">${D.THEME_KEYS.map(k => `<button data-theme="${k}" class="${t.theme === k ? 'sel' : ''}">${villageSVG({ id: t.id, color: t.color, theme: k }, { house: 1, market: 1, castle: 1 })}<b>${D.THEMES[k].name}</b><small>${D.THEMES[k].mark}</small></button>`).join('')}</div>`;
      }
      return `<div class="pl-state big">🏝️ تابع الشاشة الكبيرة</div>${nameBox}${this.villageBox(t)}${capLine}`;
    }
    if (P.g === 'crown') { const rk = (P.rk || []).find(r => r[0] === me.team); const show = P.ph === 'winner'; return `${this.villageBox(t)}<div class="pl-state big ${show && rk && rk[2] === 1 ? 'win' : ''}">${show && rk ? (rk[2] === 1 ? '🏆 فريقك هو البطل!' : 'مركز فريقك: ' + rk[2]) : 'تابع الشاشة… 🥁'}</div>`; }
    if (P.ph === 'intro') return `<div class="pl-state big">${esc(P.gi || '')} ${esc(P.gn)}</div><div class="pl-how">${(P.how || []).map(x => { const k = x.indexOf(': '); return `<div>${k > 0 ? `<b>${esc(x.slice(0, k))}:</b> ${esc(x.slice(k + 2))}` : esc(x)}</div>`; }).join('')}</div>`;
    if (P.ph === 'done') return `<div class="pl-state big">انتهت الجولة</div>${this.villageBox(t)}${capLine}`;
    if (!P.I) return `<div class="pl-state">تابع الشاشة…</div>`;
    const mine = this.local[I.qid];
    const q = I.q ? `<div class="pl-q">${esc(I.q)}</div>` : '';
    if (I.k === 'vault') return this.vaultHTML(P, me);
    if (I.wq) return this.wagerHTML(P, me, t);
    if (P.mode === 'buzz') {
      const head = (I.tr ? `<div class="pl-state gold">⛵ سفينة الكنز: +${I.tg} ذهب لأول إجابة صحيحة</div>` : '') + q;
      if (I.rv) return head + this.revealHTML(P, me);
      const inPair = (I.el || []).includes(me.team);
      if (!inPair) { const ps = (I.pair || []).map(id => this.team(id)).filter(Boolean); return head + `<div class="pl-state">⚔️ المواجهة الآن بين ${ps.map(x => esc(x.name)).join(' و ')} — شجّع!</div>`; }
      if (P.ph === 'ready') return head + `<button class="buzzer" disabled>استعد</button>`;
      if (P.ph === 'answering' && I.bz) { const bt = this.team(I.bz[0]); if (I.bz[0] === me.team) return head + `<div class="pl-state big win">${I.bz[1] === me.name ? '🎤 أنت أولًا! أجب الآن بصوتك' : '⚡ فريقك أولًا: ' + esc(I.bz[1])}</div><div class="pl-timer" data-tm></div>`; return head + `<div class="pl-state big lose">سبقكم ${esc(bt.name)}</div>`; }
      if (P.ph === 'paused') return head + `<div class="pl-state">${(I.lk || []).includes(me.team) ? '❌ خرج فريقك من هذا السؤال' : '⏳ الفرصة قد تنتقل إليكم'}</div>`;
      if (P.ph === 'open') {
        if ((I.lk || []).includes(me.team)) return head + `<div class="pl-state">❌ خرج فريقك من هذا السؤال</div>`;
        if (this.local['b' + I.qid + '.' + I.bo]) return head + `<button class="buzzer pressed" disabled>أُرسلت</button>`;
        return head + `<button class="buzzer" data-buzz>اضغط!</button>`;
      }
      return head;
    }
    // الإجابة الفردية
    if (P.ph === 'ready') return q + `<div class="pl-state">استعد…</div>`;
    if (P.ph === 'show') return `<div class="pl-state big">👁️ انظر إلى الشاشة وتذكّر!</div>`;
    if (I.rv) return q + this.revealHTML(P, me);
    if (P.ph !== 'open') return q;
    const sent = (I.ad || []).includes(me.sid);
    return q + `<div class="pl-choices">${(I.c || []).map((c, i) => `<button data-ans="${i}" class="${mine === i ? 'sel' : ''}" ${mine != null ? 'disabled' : ''}><span class="L">${LET[i]}</span>${esc(c)}</button>`).join('')}</div>${mine != null ? `<div class="pl-state">${sent ? '✅ وصلت إجابتك' : '⏳ جارٍ الإرسال…'}</div>` : ''}<div class="pl-timer" data-tm></div>`;
  },
  revealHTML(P, me) {
    const I = P.I, mine = this.local[I.qid]; let h = '';
    if (I.c && I.a !== undefined) h += `<div class="pl-choices">${I.c.map((c, i) => `<button disabled class="${i === I.a ? 'ok' : (mine === i ? 'no' : '')}"><span class="L">${LET[i]}</span>${esc(c)}</button>`).join('')}</div>`;
    if (mine != null && P.mode === 'all') { const ok = mine === I.a; h += `<div class="pl-state big ${ok ? 'win' : 'lose'}">${ok ? '✅ إجابتك صحيحة' : '❌ إجابتك خاطئة'}</div>`; }
    const R = I.res2;
    if (R && R.team !== undefined && R.team) { const tt = this.team(R.team); h += `<div class="pl-state">${R.team === me.team ? '🎉 ' : ''}${esc(tt.name)}: ${R.pts ? '+' + R.pts + ' نقطة و' : ''}+${R.gold} ذهب</div>`; }
    else if (R && R[me.team] && R[me.team].pts) h += `<div class="pl-state win">فريقك: +${R[me.team].pts} نقطة و+${R[me.team].pts} ذهب</div>`;
    return h;
  },
  vaultHTML(P, me) {
    const I = P.I, V = I.vt || { cr: {}, lk: {}, tr: {} }, mt = me.team;
    if (I.rv) return `<div class="pl-term"><div>&gt; الرمز: ${esc(I.a)}</div></div><div class="pl-state big ${V.cr[mt] ? 'win' : ''}">${V.cr[mt] ? '✅ فتحتم الخزنة — المركز ' + V.cr[mt][0] : 'لم تُفتح خزنتكم'}</div>`;
    if (P.ph !== 'open') return `<div class="pl-term"><div>&gt; جارٍ تجهيز الخزنة…</div></div><div class="pl-state">ستصلك تلميحاتك السرية بعد لحظات</div>`;
    if (V.cr[mt]) return `<div class="pl-state big win">✅ فتحتم الخزنة! المركز ${V.cr[mt][0]}</div>`;
    const clues = (this.priv || {}).k || [], locked = V.lk[mt];
    return `<div class="pl-term">${clues.length ? clues.map(c => `<div>&gt; ${esc(c)}</div>`).join('') : '<div>&gt; لا تلميح لك هذه المرة: اجمع تلميحات زملائك</div>'}</div><div class="mut" style="text-align:center;font-size:13px">شارك تلميحك مع فريقك بصوت منخفض</div>${locked ? '<div class="pl-state lose">⛔ رمز خاطئ — انتظر ثوانٍ</div>' : ''}<input class="in" id="vcode" inputmode="numeric" maxlength="4" placeholder="••••" value="${esc(this.local['vc' + I.qid] || '')}" style="font-size:34px;text-align:center;letter-spacing:12px;direction:ltr" ${locked ? 'disabled' : ''}><button class="btn pri big" data-vsend ${locked ? 'disabled' : ''}>🔓 فتح الخزنة</button><div class="pl-timer" data-tm></div>`;
  },
  wagerHTML(P, me, t) {
    const I = P.I, cap = this.isCap(), max = (I.wmax || {})[me.team] || 0;
    if (I.rv) { const r = (I.res2 || {})[me.team]; return (I.q ? `<div class="pl-q">${esc(I.q)}</div>` : '') + this.revealHTML(P, me) + (r ? `<div class="pl-state big ${r.ok ? 'win' : 'lose'}">${r.ok ? '✅' : '❌'} رهانكم ${r.w}: ${r.pts > 0 ? '+' : ''}${r.pts}</div>` : ''); }
    if (P.ph === 'wager') {
      if (!cap) return `<div class="pl-state big">🎲 سؤال الرهان</div><div class="pl-state">قائدكم ${esc(t.capName || '')} يحدد الرهان (حتى ${max} نقطة)</div>`;
      if ((I.wset || []).includes(me.team)) return `<div class="pl-state big win">✓ سُجّل رهانكم</div><div class="pl-state">يمكنك تغييره قبل انتهاء الوقت</div>${this.wagerBtns(max)}`;
      return `<div class="pl-state big">🎲 كم تراهنون؟</div><div class="mut" style="text-align:center">الإجابة الصحيحة تضيف الرهان، والخاطئة تخصمه</div>${this.wagerBtns(max)}<div class="pl-timer" data-tm></div>`;
    }
    const q = `<div class="pl-q">${esc(I.q || '')}</div>`;
    if (!cap) return q + `<div class="pl-state">قائدكم يختار الإجابة الآن — ساعدوه!</div>`;
    const mine = this.local['w' + I.qid];
    return q + `<div class="pl-choices">${(I.c || []).map((c, i) => `<button data-wpick="${i}" class="${mine === i ? 'sel' : ''}" ${mine != null ? 'disabled' : ''}><span class="L">${LET[i]}</span>${esc(c)}</button>`).join('')}</div>${mine != null ? `<div class="pl-state">${(I.wpick || []).includes(me.team) ? '✅ وصلت إجابتكم' : '⏳ جارٍ الإرسال…'}</div>` : ''}<div class="pl-timer" data-tm></div>`;
  },
  wagerBtns(max) { const opts = [...new Set([0, Math.round(max * .25), Math.round(max * .5), Math.round(max * .75), max])]; return `<div class="wager">${opts.map(v => `<button data-wager="${v}" class="${this.local.wg === v ? 'sel' : ''}">${v}</button>`).join('')}</div>`; },
  // ---------- مجلس القرية على الجوال ----------
  defInfo(t, type) { const k = D.ATTACKS[type].def, L = t.lv[D.BUILD_KEYS.indexOf(k)] || 0, P = this.P, raw = P.T.find(x => x[0] === t.id), sh = raw && raw[9] && raw[9].sh ? 1 : 0; return { k, L, block: D.BLOCK[L] + sh, sh }; },
  councilHTML(P, me, t) {
    const cap = this.isCap(), ord = (this.priv || {}).ord;
    if (P.ph === 'intro') return `<div class="pl-state big">🏛️ مجلس القرية</div><div class="pl-how">${(P.how || []).map(x => { const k = x.indexOf(': '); return `<div>${k > 0 ? `<b>${esc(x.slice(0, k))}:</b> ${esc(x.slice(k + 2))}` : esc(x)}</div>`; }).join('')}</div>${this.villageBox(t)}`;
    if (P.ph === 'battle' || P.ph === 'done') {
      const R = (P.BR || []).filter(r => r.from === me.team || r.to === me.team), A = D.ATTACKS;
      if (!R.length) return `<div class="pl-state big">${P.ph === 'battle' ? '⚔️ المعركة على الشاشة' : '🏝️ استعدوا للجولة التالية'}</div><div class="pl-state">لم يهاجمكم أحد، ولم تهاجموا في هذا المجلس</div>${this.villageBox(t)}`;
      return `<div class="pl-state big">⚔️ نتيجة المعركة</div><div class="pl-br">${R.map(r => { const mine = r.from === me.team, o = this.team(mine ? r.to : r.from); const out = r.held ? (mine ? '❌ صدّوا هجومكم' : '🛡️ صددتم الهجوم! +' + r.held) : r.type === 'raid' ? (mine ? '✅ غنمتم ' : '❌ سُرق منكم ') + (r.gold || 0) + ' 💰' : r.type === 'catapult' ? (mine ? '✅ خسروا ' : '❌ خسرتم ') + (r.pts || 0) + ' نقطة' : (mine ? '✅ أحرقتم ' : '❌ احترق ') + ((r.off || []).map(k => D.BUILD[k].name).join('، ') || '—'); return `<div class="${mine ? 'out' : 'in'}"><b>${mine ? 'هجومكم على' : 'هجوم من'} ${esc(o ? o.name : '')}</b><span>${A[r.type].icon} ${r.units} ${esc(A[r.type].units)} · أوقف الدفاع ${Math.min(r.units, r.block)}</span><em>${out}</em></div>`; }).join('')}</div>${this.villageBox(t)}`;
    }
    // المجلس مفتوح
    const ordLine = ord ? (() => { const o = this.team(ord[1]); const A = D.ATTACKS[ord[0]]; return `<div class="pl-ord">✉️ أمركم السري: ${A.icon} ${esc(A.name)} بـ${ord[2]} ${esc(A.units)} على ${esc(o ? o.name : '')}</div>`; })() : '';
    if (!cap) return `<div class="pl-state big">🏛️ قائدكم ${esc(t.capName || '')} يقرر الآن</div><div class="pl-state">تشاوروا معه: نبني؟ نحمي؟ نهاجم من؟</div>${ordLine}${this.villageBox(t)}<div class="pl-timer" data-tm></div>`;
    const tab = this.ctab || 'build';
    return `<div class="pl-tabs"><button data-ctab="build" class="${tab === 'build' ? 'on' : ''}">🏗️ البناء والدفاع</button><button data-ctab="attack" class="${tab === 'attack' ? 'on' : ''}">⚔️ الهجوم${ord ? ' ✉️' : ''}</button></div><div class="pl-timer" data-tm></div>` + (tab === 'build' ? this.shopHTML(t) : this.attackHTML(P, me, t, ord));
  },
  attackHTML(P, me, t, ord) {
    const W = D.WAR, A = D.ATTACKS, a = this.att = this.att || { type: null, to: null, units: 2 }, CO = P.CO || { cnt: {} };
    const others = P.T.map(x => this.team(x[0])).filter(x => x.id !== me.team);
    let h = ord ? `<div class="pl-ord">✉️ أمركم الحالي: ${A[ord[0]].icon} ${esc(A[ord[0]].name)} بـ${ord[2]} ${esc(A[ord[0]].units)} على ${esc((this.team(ord[1]) || {}).name || '')}<button class="btn sm bad" data-ocancel>إلغاء واسترجاع الذهب</button></div><div class="mut" style="text-align:center;font-size:13px">يمكنك تعديله بإرسال أمر جديد</div>` : '';
    h += `<div class="pl-sub">1) نوع الهجوم</div><div class="atk-types">${D.ATTACK_KEYS.map(k => `<button data-atype="${k}" class="${a.type === k ? 'sel' : ''}"><span class="i">${A[k].icon}</span><b>${esc(A[k].name)}</b><small>${esc(A[k].fx)}</small><small class="def">يصده: ${D.BUILD[A[k].def].icon} ${esc(D.BUILD[A[k].def].name)}</small></button>`).join('')}</div>`;
    if (!a.type) return h;
    h += `<div class="pl-sub">2) الهدف</div><div class="atk-targets">${others.map(o => { const di = this.defInfo(o, a.type), full = (CO.cnt[o.id] || 0) >= W.maxPerTarget && !(ord && ord[1] === o.id); return `<button data-ato="${o.id}" class="${a.to === o.id ? 'sel' : ''}" style="--tc:${o.color}" ${full ? 'disabled' : ''}><b>${esc(o.name)}</b><small>${D.BUILD[di.k].icon} ${di.L ? 'مستوى ' + di.L + ' يوقف ' + D.BLOCK[di.L] : 'بلا ' + esc(D.BUILD[di.k].name)}${di.sh ? ' · 🛡️ +1' : ''}</small>${full ? '<small>مكتملة: هوجمت مرتين</small>' : ''}</button>`; }).join('')}</div>`;
    if (!a.to) return h;
    const o = this.team(a.to), di = this.defInfo(o, a.type), maxU = Math.max(0, Math.min(W.maxUnits, Math.floor((t.gold + (ord ? ord[2] * W.unitCost : 0)) / W.unitCost)));
    a.units = Math.max(1, Math.min(a.units, maxU || 1)); const hits = Math.max(0, a.units - di.block);
    h += `<div class="pl-sub">3) حجم الهجوم</div><div class="atk-units"><button data-au="-1">−</button><div><b>${a.units}</b> ${esc(A[a.type].units)}<small>${a.units * W.unitCost} 💰</small></div><button data-au="1">+</button></div>`;
    h += `<div class="atk-prev">${hits ? `المتوقع: يتجاوز <b>${hits}</b> ${esc(A[a.type].units)} دفاعهم` : `⚠️ دفاعهم يوقف ${di.block}: هجوم بهذا الحجم سيُصد كاملًا`}</div>`;
    h += `<button class="btn pri big" data-asend ${maxU < 1 ? 'disabled' : ''}>${maxU < 1 ? 'لا يكفي الذهب' : '✉️ اعتماد الأمر السري'}</button>`;
    return h;
  },
  shopHTML(t) {
    const lv = this.levels(t), off = new Set(((this.P.T.find(x => x[0] === t.id) || [])[9] || {}).off || []);
    const item = k => { const L = lv[k], B = D.BUILD[k], c = L >= 2 ? null : B.cost[L], can = c != null && c <= t.gold; return `<div class="item ${L >= 2 ? 'max' : ''}"><div class="ic">${buildingSVG({ id: t.id, color: t.color, theme: t.theme }, k, Math.max(1, Math.min(2, L + 1)))}</div><div class="tx"><b>${B.icon} ${B.name}${L ? ' <span class="lvb">م' + L + '</span>' : ''}${off.has(k) ? ' 🔥' : ''}</b><small>${L === 0 ? B.desc : L === 1 ? 'المستوى 2: ' + B.up : 'مكتمل ✓'}</small></div>${c != null ? `<button class="btn ${can ? 'pri' : ''}" data-buy="${k}" ${can ? '' : 'disabled'}>${L ? 'ترقية' : 'بناء'} · ${c}💰</button>` : ''}</div>`; };
    return `<div class="mut" style="text-align:center">💰 ذهب فريقكم: <b style="color:var(--gold)">${t.gold}</b></div><div class="pl-sub">🌾 الازدهار</div><div class="shop">${D.BUILD_KEYS.filter(k => D.BUILD[k].grp === 'grow').map(item).join('')}</div><div class="pl-sub">🛡️ الدفاع</div><div class="shop">${D.BUILD_KEYS.filter(k => D.BUILD[k].grp === 'def').map(item).join('')}</div>`;
  },
  bind() {
    const P = this.P, I = (P && P.I) || {}, me = this.me();
    const b = $('[data-buzz]', this.root);
    if (b) b.addEventListener('pointerdown', e => { e.preventDefault(); const bk = 'b' + I.qid + '.' + I.bo; if (this.local[bk]) return; SFX.unlock(); this.local[bk] = 1; this.send('bz', { q: I.qid, o: I.bo }); this.vibe(40); this._k = null; this.render(); }, { once: true });
    $$('[data-ans]', this.root).forEach(x => x.onclick = () => { if (this.local[I.qid] != null) return; const v = +x.dataset.ans; this.local[I.qid] = v; this.send('an', { q: I.qid, v }); this.vibe(20); this._k = null; this.render(); });
    $$('[data-theme]', this.root).forEach(x => x.onclick = () => { this.send('th', { t: x.dataset.theme }); this.vibe(20); toast('تم اختيار ' + D.THEMES[x.dataset.theme].name); });
    $$('[data-wager]', this.root).forEach(x => x.onclick = () => { const v = +x.dataset.wager; this.local.wg = v; this.send('wg', { q: I.qid, v }); this._k = null; this.render(); });
    $$('[data-wpick]', this.root).forEach(x => x.onclick = () => { if (this.local['w' + I.qid] != null) return; const v = +x.dataset.wpick; this.local['w' + I.qid] = v; this.send('wp', { q: I.qid, v }); this._k = null; this.render(); });
    $$('[data-buy]', this.root).forEach(x => x.onclick = () => { const k = x.dataset.buy; this.send('buy', { k }); this.vibe([20, 20, 60]); $$('[data-buy]', this.root).forEach(b => { b.disabled = true; }); x.textContent = '⏳'; toast('🏗️ يجري البناء… سيظهر على الشاشة'); setTimeout(() => { this._k = null; this.render(); }, 1500); });
    $$('[data-ctab]', this.root).forEach(x => x.onclick = () => { this.ctab = x.dataset.ctab; this._k = null; this.render(); });
    $$('[data-atype]', this.root).forEach(x => x.onclick = () => { this.att = Object.assign(this.att || { units: 2 }, { type: x.dataset.atype }); this._k = null; this.render(); });
    $$('[data-ato]', this.root).forEach(x => x.onclick = () => { this.att.to = x.dataset.ato; this._k = null; this.render(); });
    $$('[data-au]', this.root).forEach(x => x.onclick = () => { this.att.units = Math.max(1, Math.min(D.WAR.maxUnits, (this.att.units || 1) + +x.dataset.au)); this._k = null; this.render(); });
    const asd = $('[data-asend]', this.root); if (asd) asd.onclick = () => { const a = this.att; this.send('ord', { type: a.type, to: a.to, units: a.units }); this.vibe([30, 30, 90]); asd.disabled = true; asd.textContent = '⏳ جارٍ الإرسال…'; toast('✉️ أُرسل الأمر السري'); setTimeout(() => { this._k = null; this.render(); }, 1500); };
    const oc = $('[data-ocancel]', this.root); if (oc) oc.onclick = () => { this.send('oc', {}); toast('أُلغي الأمر وعاد الذهب'); };
    const tn = $('#tname', this.root); if (tn) tn.oninput = () => { this.local.tn = tn.value; };
    const tb = $('[data-tname]', this.root); if (tb) tb.onclick = () => { const v = (this.local.tn != null ? this.local.tn : '').trim(); if (v.length < 2) return toast('اكتب اسمًا من حرفين على الأقل'); this.send('tn', { v }); this.local.tn = null; toast('✅ اعتُمد اسم قريتكم'); };
    const vi = $('#vcode', this.root); if (vi) vi.oninput = () => { const v = vi.value.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '').slice(0, 4); this.local['vc' + I.qid] = v; if (vi.value !== v) vi.value = v; };
    const vs = $('[data-vsend]', this.root); if (vs) vs.onclick = () => { const c = this.local['vc' + I.qid] || ''; if (c.length !== 4) return toast('الرمز 4 أرقام'); this.send('vc', { q: I.qid, c }); this.local['vc' + I.qid] = ''; this.vibe(30); toast('أُرسل الرمز'); this._k = null; this.render(); };
    const lv = $('#leave'); if (lv) lv.onclick = () => { this.joined = false; this.cfg.joinedCode = null; this.save(); this.render(); };
  },
  tickUI() { const r = this.clock.rem(); $$('[data-tm]', this.root).forEach(e => { e.textContent = r == null ? '' : '⏱ ' + fmtTime(r); }); if (this.joined && Date.now() - this.hostSeen > 9000) this.renderNet(); }
};
