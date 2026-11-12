/* رايات — جوال المتسابق: دخول بلا حساب، إجابة، أوامر القائد ومشورة الفريق، استباق، توقعات، والمرشد */
const Phone = {
  init(code, fp) {
    // هوية الجوال لكل تبويب (تبقى مع إعادة التحميل، ولا تختلط إن فُتح أكثر من جوال في متصفح واحد)
    const SS = { get(k, d) { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } }; this.SS = SS;
    // إذا أُغلق المتصفح ثم فُتح الرابط من جديد على الجوال نفسه: تعود الهوية نفسها (الاسم والفريق والقيادة) بلا تسجيل مكرر.
    // تُحفظ لكل رمز مسابقة مع «نبض» كل ثانيتين، فلا تُستعار هوية تبويب آخر ما زال مفتوحًا في المتصفح نفسه.
    const lk = 'rayat.id.' + (code || ''), old = code ? LS.get(lk, null) : null, live = old && Date.now() - (old.at || 0) < 7000;
    this.code = code; this.pid = SS.get('rayat.pid', null) || (old && !live ? old.pid : null) || uid(10); SS.set('rayat.pid', this.pid);
    this.me = SS.get('rayat.me', null) || (old && old.pid === this.pid ? old.me : null) || {}; SS.set('rayat.me', this.me);
    try { if (old && old.pid === this.pid && old.sign && !sessionStorage.getItem('rayat.sign')) sessionStorage.setItem('rayat.sign', old.sign); } catch (e) { } // مفتاح التوقيع نفسه، فيعرفه المشرف
    const sg = () => { try { return sessionStorage.getItem('rayat.sign'); } catch (e) { return null; } };
    this.keepId = () => { if (this.code) LS.set('rayat.id.' + this.code, { pid: this.pid, me: this.me, sign: sg(), at: Date.now() }); }; this.keepId(); setInterval(() => this.keepId(), 2000); addEventListener('pagehide', () => { if (this.code) LS.set('rayat.id.' + this.code, { pid: this.pid, me: this.me, sign: sg(), at: 0 }); });
    this.n = SS.get('rayat.n', 0); this.P = null; this.picks = []; this.tab = null; this.local = {}; this.seen = LS.get('rayat.seen', {});
    this.net = new Net('student'); if (fp) this.net.expectFp = fp;
    this.net.on('state', P => this.onState(P)); this.net.on('status', () => this.render());
    this.net.on('caps', () => { if (this.code) this.join(); });
    this.net.init(); setInterval(() => this.net.heartbeat(), 3000); setInterval(() => this.tick(), 250);
    this.root = $('#app'); this.render(); setTimeout(() => { if (!this.P) this.render(); }, 9600);
  },
  async join() { this.net.code = this.code; await this.net.joinRoom(this.code); this.pres(); },
  pres() { this.net.presence({ r: 's', c: this.code, pid: this.pid, nm: this.me.nm || null, tw: this.me.tw ?? null }); },
  send(f, d) { this.n++; this.SS.set('rayat.n', this.n); this.net.presence({ [f]: Object.assign({ n: this.n }, d) }); },
  onState(P) { if (!P || (this.code && P.code !== this.code)) return; if (!this.code) this.code = P.code; if (this.P && P.v < this.P.v) return;
    { const t0 = this.P && this.myTeam(), was = t0 != null && this.P.teams[t0] && this.P.teams[t0].cap === this.pid, me1 = P.players && P.players[this.pid], now = !!(me1 && P.teams && P.teams[me1.t] && P.teams[me1.t].cap === this.pid); if (this.P && !was && now && P.stage === 'phase') { toast('👑 أنت قائد فريقك في هذه المرحلة', 4000); try { navigator.vibrate && navigator.vibrate([80, 60, 80]); } catch (e) { } } }
    const prev = this.P; this.P = P; this.lastState = performance.now(); if (P.tm) { this.endAt = performance.now() + P.tm.r; this.dur = P.tm.d; } else this.endAt = 0;
    { const L = P.stage === 'buzz' && P.duel ? P.duel.lock : P.stage === 'tie' && P.tie ? P.tie.lock : 0; this.lockUntil = P.paused ? Infinity : performance.now() + (L || 0); }
    if (P.mapSeed != null && (!this.M || this.mkey !== P.teams.length + ':' + P.mapSeed)) { this.mkey = P.teams.length + ':' + P.mapSeed; this.M = RayatMap.build(P.teams.length, P.mapSeed); if (this.mapOpen) this.closeMap(); }
    if (this.MW && P.vis) { if (P.ev && P.ev.id !== this.lastEv) { this.lastEv = P.ev.id; (this.evq = this.evq || []).push(P.ev); if (!this.pumping) this.pump(); }
      else if (!this.playing) this.syncVis(); this.mapInfo(); }
    if (this.mapOpen && (!prev || prev.stage !== P.stage)) { this.mapBigMan = null; this.mapSize(); const W = this.MW, D = P.duel; if (W && !this.playing && W.camMode() === 'follow') { try { if (['predict', 'buzz', 'judge', 'point'].includes(P.stage) && D && W.faceoff) W.faceoff({ a: D.a, d: D.d, r: D.r, unit: D.unit, ally: D.ally, from: D.from }); else if (['orders', 'harvest', 'bini', 'tie'].includes(P.stage)) W.overview(1.6); } catch (e) { } } }
    const t = this.myTeam(); if (prev && prev.stage !== P.stage) { this.local = {}; if (P.stage === 'orders') this.picks = []; this.tab = null;
      if (P.stage === 'predict' && P.duel && (P.duel.d === t || P.duel.a === t)) this.buzzV([120, 60, 120]);
      if (P.stage === 'buzz' && P.duel && (P.duel.d === t || P.duel.a === t || P.duel.ally === t)) this.buzzV([60]); }
    // اهتزاز لحظات الفريق: هجوم على أرضه، غدر حليفه، بداية مرحلة
    if (P.ev && P.ev.id !== this.lastEvV) { this.lastEvV = P.ev.id; const e = P.ev; if (e.k === 'attack' && e.d === t) this.buzzV([300, 120, 300]); else if (e.k === 'attack' && e.a === t && e.result === 'taken') this.buzzV([80, 60, 80]); else if (e.k === 'unally' && e.betray && (e.b === t || e.a === t)) this.buzzV([400]); else if (e.k === 'phase') this.buzzV([60]); }
    this.render(); },
  // الجرس مقفل ثلاث ثوانٍ للقراءة (المشرف يرفض أي ضغطة قبلها)، والزر يعدّ تنازليًا ثم يعمل
  lockLeft() { return Math.max(0, (this.lockUntil || 0) - performance.now()); },
  buzzBtn(attr) { const l = this.lockLeft(); return l > 0 ? `<button class="buzz k locked" ${attr} data-lock disabled>اقرأ… ${Math.min(9, Math.ceil(l / 1000))}</button>` : `<button class="buzz k" ${attr} data-lock>اضغط!</button>`; },
  lockUI() { $$('[data-lock]').forEach(b => { if (b.dataset.done) return; const l = this.lockLeft(); if (l > 0) { b.disabled = true; b.classList.add('locked'); b.textContent = 'اقرأ… ' + Math.min(9, Math.ceil(l / 1000)); } else if (b.classList.contains('locked')) { b.disabled = false; b.classList.remove('locked'); b.textContent = 'اضغط!'; this.buzzV(40); } }); },
  buzzV(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { } },
  myTeam() { const p = this.P && this.P.players[this.pid]; return p ? p.t : null; },
  isCap() { const t = this.myTeam(); return t != null && this.P.teams[t].cap === this.pid; },
  rn(r) { return this.M ? this.M.regions[r].name : 'إقليم ' + r; },
  tick() { this.lockUI(); // انقطاع الاتصال بالمشرف: المشرف يبث كل 2.5 ثانية، فغياب البث 9 ثوانٍ يعني انقطاعًا
    { const off = !!(this.P && this.lastState && performance.now() - this.lastState > 9000); let ob = document.getElementById('offbar'); if (off && !ob) { ob = document.createElement('div'); ob.id = 'offbar'; ob.className = 'offbar'; ob.textContent = 'انقطع الاتصال بالمشرف… تُعاد المحاولة تلقائيًا'; document.body.appendChild(ob); } else if (!off && ob) ob.remove(); }
    const el = $('#ptm'); if (el && this.P && this.P.paused) { el.textContent = this.P.tm ? '⏸ ' + Math.ceil(this.P.tm.r / 1000) + ' ث' : '⏸'; return; } if (el && this.endAt) { const s = Math.ceil(Math.max(0, this.endAt - performance.now()) / 1000); el.textContent = s + ' ث'; } },
  header() { const P = this.P, t = this.myTeam(), T = P && t != null ? P.teams[t] : null;
    return `<div class="hd"><div class="nm k">رايـات</div>${T ? `<span class="badge" style="--tc:${T.color}">${esc(T.name)}${this.isCap() ? ' · القائد 👑' : ''}</span>` : ''}${P && P.vis && this.me && this.me.nm ? `<button class="mapbtn ${this.mapOpen ? 'on' : ''}" data-map>🗺️ الخريطة</button>` : ''}<button class="mapbtn" data-guide>📖</button><span class="tm" id="ptm"></span></div>`; },
  resBox() { const P = this.P, t = this.myTeam(); if (!P || !P.res || t == null) return ''; const R = P.res[t];
    return `<div class="res"><div>أرضكم<b>${P.score[t]}</b></div><div>🌾 طعام<b>${R.food}</b></div><div>💰 ذهب<b>${R.gold}</b></div><div>🪨 حجر<b>${R.stone}</b></div></div>`; },
  render() {
    const r = this.root; if (!r) return; const P = this.P;
    if (!this.code || !P) { r.innerHTML = `<div class="ph">${this.header()}<div class="box col"><div class="big k">انضم إلى رايات</div>${this.code ? `<div class="mut" style="text-align:center">جارٍ الاتصال بالغرفة ${esc(this.code)}…</div>${IN_CLAUDE && !this.net.room && performance.now() > 9000 ? `<div class="mut" style="text-align:center;margin-top:8px">إن طال الانتظار فافتح الرابط الثابت:</div><a class="btn pri" href="${STABLE_URL}#join-${esc(this.code)}" target="_blank" rel="noopener" style="text-align:center;text-decoration:none">الرابط الثابت</a>` : ''}` : `<input class="in" id="jc" placeholder="رمز الغرفة" inputmode="numeric" maxlength="4" style="text-align:center;font-size:26px;letter-spacing:8px;direction:ltr"><button class="btn pri big" id="jgo">دخول</button>`}</div><div class="mut" style="text-align:center;font-size:13px">${esc(this.net.label().t)}</div></div>`;
      const b = $('#jgo'); if (b) b.onclick = () => { const c = $('#jc').value.replace(/\D/g, ''); if (c.length === 4) { this.code = c; this.join(); this.render(); } }; return; }
    const me = P.players[this.pid];
    if (!this.me.nm) { if ($('#nm')) { P.teams.forEach(t => { const c = $(`[data-cnt="${t.id}"]`); if (c) c.textContent = t.n + ' متسابق'; }); return; } return this.joinForm(); }
    if (!me) { r.innerHTML = `<div class="ph">${this.header()}${this.waitBox('جارٍ الانضمام…')}</div>`; return; }
    const html = `<div class="ph ${P.paused ? 'paused' : ''}">${this.header()}${P.paused ? '<div class="pausebar">⏸ المسابقة متوقفة مؤقتًا — انتظر استئناف المشرف</div>' : ''}${this.body()}</div>`; if (html === this.lastHtml) return; this.lastHtml = html; r.innerHTML = html; this.bind();
  },
  joinForm() { const P = this.P; this.root.innerHTML = `<div class="ph">${this.header()}<div class="box col"><div class="big k">أهلًا بك</div><input class="in" id="nm" placeholder="اسمك" maxlength="24" value="${esc(this.draftNm || this.me.nm || '')}"><div class="mut">اختر فريقك</div><div class="teampick">${P.teams.map(t => `<button data-tw="${t.id}" class="${this.me.tw === t.id ? 'sel' : ''}" style="--tc:${t.color}">${esc(t.name)}<div class="mut" style="font-size:13px" data-cnt="${t.id}">${t.n} متسابق</div></button>`).join('')}</div><button class="btn pri big" id="go">انضمام</button></div></div>`;
    $('#nm').oninput = e => { this.draftNm = e.target.value; };
    $$('[data-tw]').forEach(b => b.onclick = () => { this.me.tw = +b.dataset.tw; this.SS.set('rayat.me', this.me); $$('[data-tw]').forEach(x => x.classList.toggle('sel', x === b)); });
    $('#go').onclick = () => { const nm = $('#nm').value.trim(); if (!nm) return toast('اكتب اسمك'); if (P.stage === 'lobby' && this.me.tw == null) return toast('اختر فريقك'); this.me.nm = nm; this.SS.set('rayat.me', this.me); this.pres(); this.render(); }; },
  body() { const P = this.P, t = this.myTeam(), st = P.stage, T = P.teams, tn = i => i == null ? 'محايد' : esc(T[i].name), tc = i => i == null ? '#888' : T[i].color;
    if (st === 'lobby') return `<div class="box"><div class="big k">انضممت إلى ${tn(t)}</div><div class="mut" style="text-align:center;margin-top:8px">${this.isCap() ? 'أنت القائد: تختار أوامر فريقك بعد مشورتهم.' : 'القائد يختار الأوامر، وأنت تجاوب وتشير عليه وتستبق في المواجهات.'}</div></div><div class="guidecard"><b>كيف تفوز؟</b>أجيبوا صحيحًا لتأخذوا أوامر، وبالأوامر تحتلون وتبنون وتهاجمون. الفريق الأكثر أرضًا في الآخر يفوز، والقلعة الكبرى ${CASTLE_AR()}.</div>`;
    if (st === 'question' || st === 'gq' || st === 'reveal') { const q = P.q; if (!q) return this.waitBox('…');
      if (st === 'gq' && !(P.duel && (P.duel.a === t || P.duel.ally === t))) return `<div class="box"><div class="big k">سؤال حامية القلعة</div><div class="mut" style="text-align:center">يجيب عليه ${tn(P.duel && P.duel.a)} الآن</div></div>${this.resBox()}`;
      const rev = st === 'reveal', sv = this.SS.get('rayat.ans', null), sent = this.local.ans ?? (sv && sv.q === q.id ? sv.c : null), got = (P.answered || []).includes(this.pid);
      const mine = rev ? (P.ans && P.ans.by && P.ans.by[this.pid] != null ? P.ans.by[this.pid] : null) : sent;
      if (st === 'gq') { /* سؤال الحامية: لا قائمة تأكيد، نعتمد المحلي */ }
      return `<div class="box col"><div class="q">${esc(q.text)}</div><div class="ans">${q.c.map((c, i) => `<button data-ans="${i}" class="${rev ? (i === q.a ? 'ok' : mine === i ? 'no' : '') : mine === i ? 'sel' : ''}" ${mine != null || rev ? 'disabled' : ''}><span class="L">${LET[i]}</span>${esc(c)}</button>`).join('')}</div>${rev ? `<div class="big k" style="font-size:22px">${mine === q.a ? '✅ أصبت' : mine == null ? (sent != null ? 'لم تصل إجابتك قبل انتهاء الوقت' : 'لم تجب') : '❌ لم تُصب'}</div>${q.f ? `<div class="athar">${esc(q.f)}</div>` : ''}<div class="mut" style="text-align:center">فريقك: ${Math.round(((P.ans && P.ans.ratios[t]) || 0) * 100)}٪ إجابات صحيحة ← ${(n => n === 0 ? 'لا أوامر' : n === 1 ? 'أمر واحد' : n === 2 ? 'أمران' : n + ' أوامر')(P.ans ? P.ans.orders[t] || 0 : 0)}</div>` : mine != null ? `<div class="mut" style="text-align:center">${got || st === 'gq' ? 'وصلت إجابتك ✓' : 'جارٍ إرسال إجابتك…'}</div>` : ''}</div>${this.resBox()}`; }
    if (st === 'orders') return this.ordersUI();
    if (st === 'predict' && P.duel) { const D = P.duel, side = D.a === t || D.ally === t ? 'a' : D.d === t ? 'd' : null;
      if (side) return `<div class="box"><div class="big k" style="color:${tc(t)}">${side === 'a' ? 'فريقكم يهاجم' : 'أرضكم تحت الهجوم!'}</div><div class="mut" style="text-align:center;margin-top:8px">${esc(D.kindAr)} على ${esc(D.rn)}. استعدوا للاستباق: أول من يضغط من فريقكم يجيب بصوت عالٍ.</div></div>`;
      const mine = this.local.pred; return `<div class="box col"><div class="big k" style="font-size:24px">من يفوز؟</div><div class="mut" style="text-align:center">التوقع الصحيح يجلب ذهبًا لفريقك</div><div class="pred"><button data-pred="a" class="${mine === 'a' ? 'sel' : ''}" style="--tc:${tc(D.a)}">${tn(D.a)}<div class="mut" style="font-size:14px">المهاجم</div></button><button data-pred="d" class="${mine === 'd' ? 'sel' : ''}" style="--tc:${tc(D.d)}">${tn(D.d)}<div class="mut" style="font-size:14px">المدافع</div></button></div></div>`; }
    if ((st === 'buzz' || st === 'judge' || st === 'point') && P.duel) { const D = P.duel, side = D.a === t || D.ally === t ? 'a' : D.d === t ? 'd' : null;
      const optsV = (pickable) => D.q ? `<div class="dopts">${D.q.c.map((c, i) => { const w = (D.wrong || []).includes(i), ok = D.ans === i; return pickable && !w ? `<button class="opt" data-pick="${i}"><span class="L">${LET[i]}</span>${esc(c)}</button>` : `<div class="opt ${w ? 'no' : ok ? 'ok' : 'dim'}"><span class="L">${LET[i]}</span>${esc(c)}</div>`; }).join('')}</div>` : '';
      if (st === 'buzz' && side && !D.tried.includes(side)) return `<div class="box col" style="gap:14px"><div class="q" style="text-align:center">${esc(D.q ? D.q.text : '')}</div>${optsV(false)}${this.buzzBtn('data-buzz')}<div class="mut" style="text-align:center">أول من يضغط يختار الإجابة من جواله</div></div>`;
      if (st === 'judge' && D.buzz) { const mine = D.buzz.pass ? side === D.buzz.side : D.buzz.pid === this.pid;
        if (mine) return `<div class="box col" style="gap:12px"><div class="mut" style="text-align:center">${D.buzz.pass ? 'أخطأ الفريق الآخر، والسؤال عندكم: أول من يختار يجيب عن الفريق' : 'اختر الإجابة الآن'}</div><div class="q" style="text-align:center">${esc(D.q.text)}</div>${optsV(true)}</div>`;
        return `<div class="box col" style="gap:12px"><div class="mut" style="text-align:center">${D.buzz.pass ? 'السؤال الآن عند' : 'يختار الإجابة الآن'}</div><div class="big k" style="color:${tc(D.buzz.team)}">${tn(D.buzz.team)}${D.buzz.name ? ' · ' + esc(D.buzz.name) : ''}</div><div class="q" style="text-align:center;font-size:17px">${esc(D.q.text)}</div>${optsV(false)}</div>`; }
      return `<div class="box col" style="gap:10px"><div class="big k" style="font-size:24px">${tn(D.a)} ${D.pts.a} – ${D.pts.d} ${tn(D.d)}</div>${st === 'point' ? optsV(false) : ''}<div class="mut" style="text-align:center">${st === 'point' ? `نقطة لـ${D.last === 'a' ? tn(D.a) : tn(D.d)}` : side ? 'تابعوا' : 'تابع المواجهة على الشاشة'}</div></div>`; }
    if (st === 'tie' && P.tie) { const T2 = P.tie, can = T2.teams.includes(t) && !T2.buzz && !T2.tried.includes(t), mine = T2.buzz && T2.buzz.pid === this.pid, ov = pk => T2.q ? `<div class="dopts">${T2.q.c.map((c, i) => { const w = (T2.wrong || []).includes(i); return pk && !w ? `<button class="opt" data-tpick="${i}"><span class="L">${LET[i]}</span>${esc(c)}</button>` : `<div class="opt ${w ? 'no' : 'dim'}"><span class="L">${LET[i]}</span>${esc(c)}</div>`; }).join('')}</div>` : '';
      return `<div class="box col" style="gap:12px"><div class="big k" style="font-size:24px">المواجهة الفاصلة</div>${T2.q ? `<div class="q" style="text-align:center">${esc(T2.q.text)}</div>` : ''}${mine ? `<div class="mut" style="text-align:center">اختر الإجابة الآن</div>${ov(true)}` : `${ov(false)}${can ? this.buzzBtn('data-tbuzz') : T2.buzz ? `<div class="big k" style="color:${tc(T2.buzz.team)}">${tn(T2.buzz.team)} يختار</div>` : ''}`}</div>`; }
    if (st === 'crown' && P.winner == null && P.rank && P.rank[0]) P.winner = P.rank[0].team;
    if (st === 'crown') { const won = P.winner === t; return `<div class="box"><div class="big k" style="font-size:36px;color:${tc(P.winner)}">${won ? '🏆 أنتم أبطال الجزيرة' : 'الأبطال: ' + tn(P.winner)}</div><div class="col" style="margin-top:14px">${(P.rank || []).map((x, k) => `<div class="row" style="justify-content:space-between;padding:8px 12px;border-radius:12px;background:rgba(255,255,255,.05);border-inline-start:5px solid ${tc(x.team)}"><b>${k + 1}. ${tn(x.team)}</b><span>${x.score} أرض</span></div>`).join('')}</div></div>`; }
    if (st === 'bini' && P.bini) return `<div class="box"><div class="mut" style="text-align:center">بيني ${P.bini.mult > 1 ? '×' + P.bini.mult : ''}</div><div class="big k">${esc(P.bini.name)}</div><div class="q" style="font-weight:400;font-size:17px;margin-top:8px">${esc(P.bini.desc)}</div></div>`;
    const cap = st === 'scene' && P.ev ? this.evText(P.ev) : st === 'harvest' ? 'الحصاد: أراضيكم تنتج' : st === 'phase' ? 'مرحلة جديدة: ' + esc(P.phaseName || '') : 'تابع الشاشة';
    return `<div class="box"><div class="big k" style="font-size:22px">${cap}</div></div>${this.resBox()}${this.dipBox()}`; },
  evText(e) { const T = this.P.teams, tn = i => i == null ? '' : esc(T[i].name);
    if (e.k === 'attack') return e.result === 'taken' ? `${tn(e.a)} يفتحون ${esc(this.rn(e.r))}` : e.result === 'loot' ? `${tn(e.a)} ينهبون عاصمة ${tn(e.d)}` : e.result === 'garrisonFell' ? 'سقطت الحامية وصمدت الأرض' : `${tn(e.d)} يصدّون الهجوم`;
    if (e.k === 'occupy') return `${tn(e.team)} يحتلون ${esc(this.rn(e.r))}`; if (e.k === 'batch') return 'تنفيذ أوامر الجولة'; if (e.k === 'phase') return esc(e.name);
    if (e.k === 'ally') return `تحالف ${tn(e.a)} و${tn(e.b)}`; if (e.k === 'unally') return e.betray ? `${tn(e.a)} ينقضون الحلف` : 'انتهى حلف'; return 'تنفيذ الأوامر'; },
  waitBox(t) { return `<div class="box"><div class="big k" style="font-size:22px">${t}</div></div>`; },
  // ---------- الأوامر ----------
  // اختيار أمر: القائد يضيفه لخطته، والعضو يرسله اقتراحًا (يُستعمل من قائمة الأوامر ومن بطاقة الأرض في الخريطة)
  chooseOpt(o0) { const P = this.P; if (!P || P.paused || P.stage !== 'orders') return; const o = this.clean(o0), gk = this.guideKey(o); this.seen[gk] = 1; LS.set('rayat.seen', this.seen);
    if (this.isCap()) { const n = P.left[this.myTeam()] || 0; if (this.picks.length >= n) this.picks.shift(); this.picks.push(o); this.warned = false; this.send('ord', { l: this.picks, cy: P.cycle }); }
    else this.send('sug', { o }); this.buzzV(20); this.render(); this.mapInfo(); },
  // ---------- خريطة الطالب ثلاثية الأبعاد: كاميرا مستقلة لكل جوال، وحالة الأراضي متزامنة مع المسابقة ----------
  // الخريطة في أعلى الشاشة، والسؤال والجرس والأوامر تبقى تحتها كما هي، فلا تتعارض اللمسات.
  /* بث الجوال: المشاهد نفسها تُعرض على خريطة الطالب بلا صوت، والكاميرا تتابع الحدث ما لم يحرّكها بيده */
  syncVis() { const P = this.P; if (!this.MW || !P || !P.vis) return; const vk = JSON.stringify(P.vis); if (vk === this.mvk) return; this.mvk = vk; try { this.MW.setState(P.vis); } catch (e) { } },
  async pump() { this.pumping = true; try { while (this.MW && this.evq && this.evq.length) { if (this.evq.length > 1) { this.evq.splice(0, this.evq.length - 1); this.mvk = null; this.syncVis(); } /* متأخر: يلحق بآخر حدث */ const ev = this.evq.shift(), W = this.MW; this.playing = true;
      try { if (ev.k === 'phase') await W.phase({ key: ev.key, hold: Math.min(ev.hold || 0, 2) }); else if (ev.k === 'attack') await W.attack(ev); else if (ev.k === 'occupy') await W.occupy(ev.one || ev); else if (['walls', 'tower', 'garInf', 'garCav'].includes(ev.k)) { const e = ev.one || ev; await W.build({ r: e.r, k: e.k, team: e.team }); } else if (ev.k === 'capital') await W.capital(ev.one || ev); else if (ev.k === 'batch') await W.batch(ev.list.filter(e => e.k !== 'supply')); else if (ev.k === 'ally') await W.ally(ev); else if (ev.k === 'unally') await W.unally(ev); } catch (e) { console.error(e); }
      this.playing = false; if (this.MW !== W) break; } } finally { this.pumping = false; this.playing = false; this.mvk = null; this.syncVis(); this.followBtn(); } },
  followBtn() { const b = document.querySelector('#pmap [data-pm="f"]'); if (b && this.MW) b.classList.toggle('on', this.MW.camMode() === 'follow'); },
  /* الطول: الخريطة أكبر وقت المشاهدة (مشهد، حصاد، مرحلة) وأصغر وقت الحاجة للإجابة، وزر ⤢ يقلب ذلك يدويًا */
  mapSize() { const P = this.P, watch = !!P && ['phase', 'scene', 'exec', 'harvest', 'point', 'bini', 'crown'].includes(P.stage), big = this.mapBigMan != null ? this.mapBigMan : watch; document.body.classList.toggle('mapbig', big); const b = document.querySelector('#pmap [data-pm="big"]'); if (b) b.textContent = big ? '⤡' : '⤢'; if (this.mapRz) requestAnimationFrame(() => this.mapRz()); },
  openMap() { const P = this.P; if (!P || !this.M || !P.vis || this.mapOpen) return; const box = document.createElement('div'); box.id = 'pmap';
    box.innerHTML = `<canvas id="pmapc"></canvas><div class="pmbar"><button data-pm="f" class="fol on">📺 متابعة</button><button data-pm="all">🏝</button><button data-pm="in">＋</button><button data-pm="out">－</button><button data-pm="l" class="rot">⟲</button><button data-pm="r" class="rot">⟳</button><button data-pm="big">⤢</button><button data-pm="x" class="x">✕</button></div><div class="pminfo hide" id="pminfo"></div><div class="pmhint" id="pmhint">اسحب للتحريك · إصبعان للتقريب · المس أرضًا لمعلوماتها</div>`;
    document.body.appendChild(box); document.body.classList.add('mapon'); this.mapOpen = true; this.mapSel = null; const cv = box.querySelector('canvas'), TT = P.teams.map(t => ({ name: t.name, color: t.color, mark: t.mark || t.name[0] }));
    const ld = document.createElement('div'); ld.className = 'pmload'; ld.textContent = 'جارٍ تجهيز الخريطة…'; box.appendChild(ld); this.render();
    setTimeout(() => { if (!this.mapOpen || !document.getElementById('pmap')) return;
    try { const c = document.createElement('canvas'); if (!(c.getContext('webgl2') || c.getContext('webgl'))) throw new Error('no webgl'); const W = this.MW = RayatWorld(cv, this.M, TT, { seed: 91, lite: true, shadow: 1024, maxDpr: 1.5 });
      W.fontsReady(); W.setState(P.vis); this.mvk = JSON.stringify(P.vis); this.lastEv = P.ev ? P.ev.id : null; this.evq = []; this.mapSize(); W.resize(box.clientWidth, box.clientHeight); W.viewAll(); W.followEvent(); W.start(); cv.addEventListener('pointerup', () => setTimeout(() => this.followBtn(), 0)); cv.addEventListener('touchend', () => setTimeout(() => this.followBtn(), 0)); this.mapOff = W.attachControls(cv, { onPick: r => { this.mapSel = r; this.mapInfo(); const h = document.getElementById('pmhint'); if (h) h.remove(); } });
      const act = { f: () => W.followEvent(), all: () => W.viewAll(), in: () => W.zoomBy(.75), out: () => W.zoomBy(1.33), l: () => W.orbitBy(.4), r: () => W.orbitBy(-.4), big: () => { this.mapBigMan = !document.body.classList.contains('mapbig'); this.mapSize(); }, x: () => this.closeMap() }; box.querySelector('.pmbar').onclick = e => { const b = e.target.closest('[data-pm]'); if (b) { act[b.dataset.pm](); this.followBtn(); } }; setTimeout(() => { const h = document.getElementById('pmhint'); if (h) h.classList.add('fade'); }, 5000);
      this.mapRz = () => { if (this.MW) this.MW.resize(box.clientWidth, box.clientHeight); }; addEventListener('resize', this.mapRz); }
    catch (e) { // بديل بلا رسوم ثلاثية: خريطة مسطحة بالألوان نفسها
      this.MW = null; cv.remove(); const d = document.createElement('div'); d.className = 'pm2d'; d.innerHTML = RayatMap.svg(this.M, { teams: TT.map(t => ({ ...t, emb: t.mark })), owner: P.vis.regions.map(r => r.owner), forts: new Set(P.vis.regions.filter(r => r.walls).map(r => r.id)) }); box.prepend(d);
      box.querySelector('.pmbar').innerHTML = '<button data-pm="x" class="x">✕ إغلاق</button>'; box.querySelector('.pmbar').onclick = () => this.closeMap(); const h = box.querySelector('.pmhint'); if (h) h.textContent = 'جهازك لا يدعم العرض ثلاثي الأبعاد، فهذه خريطة مسطحة'; }
    ld.remove(); }, 40); },
  closeMap() { if (!this.mapOpen) return; this.mapOpen = false; if (this.mapOff) { this.mapOff(); this.mapOff = null; } if (this.mapRz) { removeEventListener('resize', this.mapRz); this.mapRz = null; } if (this.MW) { try { this.MW.dispose(); } catch (e) { } this.MW = null; }
    const box = document.getElementById('pmap'); if (box) box.remove(); document.body.classList.remove('mapon', 'mapbig'); this.mapBigMan = null; this.evq = []; this.mapSel = null; this.render(); },
  // بطاقة الأرض المحددة: اسمها ونوعها وإنتاجها ومالكها وتحصيناتها، والأوامر المتاحة عليها الآن بحسب صلاحية الطالب
  mapInfo() { const el = document.getElementById('pminfo'), P = this.P, r = this.mapSel; if (!el || !P) return; if (r == null || !this.M.regions[r] || !P.vis) { el.classList.add('hide'); return; }
    const R = this.M.regions[r], v = P.vis.regions[r] || {}, T = P.teams, TY = { farm: 'مزرعة', mine: 'منجم', quarry: 'محجر', village: 'قرية', port: 'ميناء', rich: 'أرض غنية', capital: 'عاصمة', castle: 'القلعة الكبرى' }, Y = RayatRules.CFG.YIELD[R.type], t = this.myTeam();
    const def = [v.walls ? 'سور' : '', v.tower ? 'برج مراقبة' : '', v.garrison ? (v.garrison === 'cav' ? 'حامية فرسان' : 'حامية مشاة') : ''].filter(Boolean);
    let acts = ''; if (P.stage === 'orders' && t != null && (P.orderTeams || []).includes(t) && P.opts && P.opts[t]) { const all = [].concat(...Object.values(P.opts[t]).filter(Array.isArray)).filter(o => o.r === r), cap = this.isCap(); this.mapOpts = all;
      acts = all.length ? `<div class="pma">${all.map((o, i) => { const [a, b] = this.optLabel(o); return `<button data-pmo="${i}">${cap ? 'أضف للخطة' : 'اقترح'}: ${esc(a)}<small>${esc(b)}</small></button>`; }).join('')}</div>` : `<div class="mut">لا أمر متاحًا لفريقك على هذه الأرض الآن</div>`; }
    const html = `<button class="pmx" data-pmc>✕</button><b class="k">${esc(R.name)}</b><div class="pml"><span>${TY[R.type] || ''}${R.type === 'castle' ? ' · تُحسب بـ' + RayatRules.CFG.CASTLE_POINTS + ' أراضٍ' : ''}</span><span>المالك: <b style="color:${v.owner != null ? T[v.owner].color : 'inherit'}">${v.owner != null ? esc(T[v.owner].name) : 'محايدة'}</b></span></div><div class="pml"><span>تنتج كل جولة: ${Y ? costText(Y) : '—'}</span><span>${def.length ? 'التحصين: ' + def.join('، ') : 'بلا تحصين'}</span></div>${acts}`;
    if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; el.querySelector('[data-pmc]').onclick = () => { this.mapSel = null; this.mapInfo(); }; el.querySelectorAll('[data-pmo]').forEach(b => b.onclick = () => this.chooseOpt(this.mapOpts[+b.dataset.pmo])); } el.classList.remove('hide'); },
  optLabel(o) { const C = RayatRules.CFG.COST, T = this.P.teams, own = r => { const v = this.P.vis && this.P.vis.regions[r]; return v ? v.owner : null; };
    switch (o.k) {
      case 'supply': return [`تموين ${RES_AR[o.res]}`, `+${RayatRules.CFG.SUPPLY} ${RES_AR[o.res]}`];
      case 'occupy': return [`احتلال ${this.rn(o.r)}`, costText(C.occupy)];
      case 'walls': return [`سور في ${this.rn(o.r)}`, costText(C.walls)];
      case 'tower': return [`برج مراقبة في ${this.rn(o.r)}`, costText(C.tower)];
      case 'garInf': return [`حامية مشاة في ${this.rn(o.r)}`, costText(C.garInf)];
      case 'garCav': return [`حامية فرسان في ${this.rn(o.r)}`, costText(C.garCav)];
      case 'cap2': return ['تطوير العاصمة إلى مدينة', costText(C.cap2)]; case 'cap3': return ['تطوير العاصمة إلى حاضرة', costText(C.cap3)];
      case 'attack': { const ow = own(o.r), u = { inf: 'مشاة', cav: 'فرسان', cat: 'منجنيق' }[o.unit]; return [`${u} على ${this.rn(o.r)}${ow != null ? ' (' + T[ow].name + ')' : ''}`, (o.betray ? 'نقض الحلف · ' : o.joint ? 'مشترك نصف التكلفة · ' : o.revenge ? 'ثأر مجاني · ' : '') + (o.revenge ? '' : costText(o.joint ? Object.fromEntries(Object.entries(C[o.unit]).map(([k, v]) => [k, Math.ceil(v / 2)])) : C[o.unit]))]; }
    } return [o.k, '']; },
  guideKey(o) { if (o.k === 'attack') return o.betray ? 'betray' : o.joint ? 'joint' : o.unit; if (o.k === 'cap2' || o.k === 'cap3') return 'cap'; return o.k; },
  ordersUI() { const P = this.P, t = this.myTeam(), cap = this.isCap(), inTurn = (P.orderTeams || []).includes(t), n = P.left ? P.left[t] || 0 : 0;
    if (!inTurn || !n) return `<div class="box"><div class="big k" style="font-size:22px">${inTurn ? 'لا أوامر لفريقكم هذه الجولة' : 'فرق أخرى تختار أوامرها'}</div><div class="mut" style="text-align:center;margin-top:6px">أجيبوا صحيحًا في السؤال القادم لتأخذوا أوامر</div></div>${this.resBox()}${this.dipBox()}`;
    const O = P.opts[t] || {}, cats = [['occupy', 'احتلال', O.occupy], ['attack', 'هجوم', O.attack], ['def', 'دفاع', [].concat(O.walls || [], O.tower || [], O.garInf || [], O.garCav || [])], ['cap', 'العاصمة', O.cap], ['supply', 'تموين', O.supply]].filter(c => c[2] && c[2].length);
    if (!this.tab || !cats.find(c => c[0] === this.tab)) this.tab = cats[0] ? cats[0][0] : null;
    const cur = cats.find(c => c[0] === this.tab), sug = P.sug && P.sug[t] || {}, votes = {}; Object.values(sug).forEach(o => { const k = JSON.stringify(o); votes[k] = (votes[k] || 0) + 1; });
    const list = cur ? cur[2] : [], gk = list[0] ? this.guideKey(list[0]) : null, showG = gk && !this.seen[gk] ? GUIDE[gk] : null;
    const myS = sug[this.pid], ready = P.ready && P.ready[t];
    let h = `${this.resBox()}<div class="box col"><div class="row" style="justify-content:space-between"><b style="font-size:18px">${cap ? `اختر ${n === 1 ? 'أمرًا واحدًا' : n === 2 ? 'أمرين' : n + ' أوامر'}` : 'أشِر على قائدك'}</b>${cap ? `<button class="btn ${ready ? 'ok' : 'pri'} sm" data-ready ${this.picks.length ? '' : 'disabled'}>${ready ? 'أُرسلت ✓' : 'جاهز'}</button>` : ''}</div>`;
    if (cap) h += `<div class="slots">${Array.from({ length: n }, (_, i) => { const o = this.picks[i]; return `<div class="${o ? 'f' : ''}" data-unpick="${i}">${o ? esc(this.optLabel(o)[0]) : 'أمر ' + (i + 1)}</div>`; }).join('')}</div>`;
    if (cap && this.picks.length) { const chk = planCheck(this.picks, P.res[t]), tot = costText(chk.total), R = chk.after;
      h += `<div class="plan ${chk.bad ? 'bad' : ''}"><div>الكلفة: <b>${tot}</b> · رصيدك بعدها: 🌾${R.food} 💰${R.gold} 🪨${R.stone}</div>${chk.steps.map((x, i) => x.ok ? '' : `<div class="w">⚠️ الأمر ${i + 1} (${esc(this.optLabel(x.o)[0])}) لا يكفيه ${x.short.map(k => RES_AR[k]).join(' و')} بعد ما قبله، وسيتحول إلى تموين.</div>`).join('')}${chk.bad && this.warned ? `<div class="row" style="margin-top:8px"><button class="btn sm grow" data-fix>أعدّل الخطة</button><button class="btn sm ok grow" data-ready>أرسلها كما هي</button></div>` : ''}${chk.bad ? '<div class="mut" style="font-size:12.5px;margin-top:4px">الأوامر تُنفَّذ بالترتيب. جرّب التموين أولًا ثم الاحتلال، أو بدّل الأمر.</div>' : ''}</div>`; }
    if (!cap) h += `<div class="mut" style="font-size:14px">${myS ? 'اقتراحك وصل: ' + esc(this.optLabel(myS)[0]) : 'اضغط خيارًا ليصل اقتراحك إلى القائد'}</div>`;
    h += `<div class="tabs">${cats.map(c => `<button data-tab="${c[0]}" class="${c[0] === this.tab ? 'sel' : ''}">${c[1]}</button>`).join('')}</div>`;
    if (showG) h += `<div class="guidecard"><span class="x" data-gx="${gk}">✕</span><b>${showG.i} ${esc(showG.t)}</b>${esc(showG.what)}${showG.stop && showG.stop !== '—' ? `<div class="mut" style="margin-top:6px">يوقفه: ${esc(showG.stop)}</div>` : ''}</div>`;
    h += `<div class="list">${list.map((o, i) => { const [a, b] = this.optLabel(o), v = votes[JSON.stringify(this.clean(o))] || 0, tcol = o.k === 'attack' && P.vis && P.vis.regions[o.r] && P.vis.regions[o.r].owner != null ? P.teams[P.vis.regions[o.r].owner].color : 'transparent';
      return `<button data-opt="${i}" style="--tc:${tcol}"><span>${esc(a)}<br><small>${esc(b)}</small></span>${v ? `<span class="n">${v} 👍</span>` : ''}</button>`; }).join('')}</div></div>${this.dipBox()}`;
    this.curList = list; return h; },
  clean(o) { const out = { k: o.k }; ['r', 'res', 'unit'].forEach(k => { if (o[k] != null) out[k] = o[k]; }); ['joint', 'betray', 'revenge'].forEach(k => { if (o[k]) out[k] = true; }); return out; },
  // ---------- التحالف (للقائد) ----------
  dipBox() { const P = this.P, t = this.myTeam(); if (!this.isCap() || !P.ally || !RayatRules.CFG.PHASES.slice(0, P.phase + 1).some(p => p.unlock.includes('alliance')) || P.phaseKey === 'final' || P.teams.length < 3) return '';
    const T = P.teams, ally = P.ally[t], off = P.offer[t];
    if (off != null) return `<div class="box col"><b>${esc(T[off].name)} يعرضون عليكم التحالف</b><div class="row"><button class="btn ok grow" data-dip="accept" data-yes="1">قبول</button><button class="btn grow" data-dip="accept" data-yes="0">رفض</button></div></div>`;
    if (ally != null) return `<div class="box col"><b>حليفكم: ${esc(T[ally].name)}</b><div class="row">${['gold', 'food', 'stone'].map(r => `<button class="btn sm grow" data-dip="gift" data-res="${r}">أرسل 3 ${RES_AR[r]}</button>`).join('')}</div><button class="btn sm" data-dip="end">إنهاء الحلف بهدوء</button></div>`;
    return `<div class="box col"><b>اعرض التحالف على</b><div class="row" style="flex-wrap:wrap">${T.filter(x => x.id !== t && P.ally[x.id] == null).map(x => `<button class="btn sm" data-dip="offer" data-b="${x.id}" style="border-inline-start:4px solid ${x.color}">${esc(x.name)}</button>`).join('')}</div>${this.seen.ally ? '' : `<div class="guidecard"><span class="x" data-gx="ally">✕</span><b>🤝 التحالف</b>${esc(GUIDE.ally.what)}</div>`}</div>`; },
  bind() { const P = this.P;
    $$('[data-ans]').forEach(b => b.onclick = () => { if (P.paused) return; const i = +b.dataset.ans; this.local.ans = i; const q = P.q; this.SS.set('rayat.ans', { q: q.id, c: i }); this.send('an', { q: q.id, c: i }); this.buzzV(30); this.render(); });
    $$('[data-pred]').forEach(b => b.onclick = () => { this.local.pred = b.dataset.pred; this.send('pr', { d: P.duel.id, s: b.dataset.pred }); this.render(); });
    $$('[data-buzz]').forEach(b => b.onclick = () => { if (this.lockLeft() > 0 || P.paused) return; b.dataset.done = 1; this.send('bz', { d: P.duel.id }); this.buzzV(80); b.textContent = '✓'; b.disabled = true; });
    $$('[data-pick]').forEach(b => b.onclick = () => { if (P.paused) return; this.send('pk', { d: P.duel.id, i: +b.dataset.pick }); this.buzzV(40); $$('[data-pick]').forEach(x => { x.disabled = true; x.classList.add(x === b ? 'sel' : 'dim'); }); });
    $$('[data-tpick]').forEach(b => b.onclick = () => { if (P.paused) return; this.send('tp', { i: +b.dataset.tpick }); this.buzzV(40); $$('[data-tpick]').forEach(x => { x.disabled = true; x.classList.add(x === b ? 'sel' : 'dim'); }); });
    $$('[data-tbuzz]').forEach(b => b.onclick = () => { if (this.lockLeft() > 0 || P.paused) return; b.dataset.done = 1; this.send('tb', {}); this.buzzV(80); b.textContent = '✓'; b.disabled = true; });
    $$('[data-tab]').forEach(b => b.onclick = () => { this.tab = b.dataset.tab; this.render(); });
    $$('[data-gx]').forEach(b => b.onclick = e => { e.stopPropagation(); this.seen[b.dataset.gx] = 1; LS.set('rayat.seen', this.seen); this.render(); });
    $$('[data-opt]').forEach(b => b.onclick = () => this.chooseOpt(this.curList[+b.dataset.opt]));
    $$('[data-guide]').forEach(b => b.onclick = () => Manual.open('p'));
    $$('[data-map]').forEach(b => b.onclick = () => this.mapOpen ? this.closeMap() : this.openMap());
    $$('[data-unpick]').forEach(b => b.onclick = () => { const i = +b.dataset.unpick; if (this.picks[i]) { this.picks.splice(i, 1); this.warned = false; this.send('ord', { l: this.picks, cy: P.cycle }); this.render(); } });
    $$('[data-ready]').forEach(b => b.onclick = () => { if (P.paused) return; const t = this.myTeam(), chk = planCheck(this.picks, P.res[t]); if (chk.bad && !this.warned) { this.warned = true; this.render(); return; } this.send('ord', { l: this.picks, cy: P.cycle }); this.send('rdy', { cy: P.cycle }); });
    $$('[data-fix]').forEach(b => b.onclick = () => { this.warned = false; this.render(); });
    $$('[data-dip]').forEach(b => b.onclick = () => { const k = b.dataset.dip; this.send('dip', { k, b: b.dataset.b != null ? +b.dataset.b : undefined, yes: b.dataset.yes === '1', res: b.dataset.res, amt: 3 }); toast('تم الإرسال'); });
  }
};
