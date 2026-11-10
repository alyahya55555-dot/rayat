/* رايات — جوال المتسابق: دخول بلا حساب، إجابة، أوامر القائد ومشورة الفريق، استباق، توقعات، والمرشد */
const Phone = {
  init(code, fp) {
    // هوية الجوال لكل تبويب (تبقى مع إعادة التحميل، ولا تختلط إن فُتح أكثر من جوال في متصفح واحد)
    const SS = { get(k, d) { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } }; this.SS = SS;
    this.code = code; this.pid = SS.get('rayat.pid', null) || uid(10); SS.set('rayat.pid', this.pid); this.me = SS.get('rayat.me', {}) || {};
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
    const prev = this.P; this.P = P; this.lastState = performance.now(); if (P.tm) { this.endAt = performance.now() + P.tm.r; this.dur = P.tm.d; } else this.endAt = 0;
    if (P.mapSeed != null && (!this.M || this.mkey !== P.teams.length + ':' + P.mapSeed)) { this.mkey = P.teams.length + ':' + P.mapSeed; this.M = RayatMap.build(P.teams.length, P.mapSeed); }
    const t = this.myTeam(); if (prev && prev.stage !== P.stage) { this.local = {}; if (P.stage === 'orders') this.picks = []; this.tab = null;
      if (P.stage === 'predict' && P.duel && (P.duel.d === t || P.duel.a === t)) this.buzzV([120, 60, 120]);
      if (P.stage === 'buzz' && P.duel && (P.duel.d === t || P.duel.a === t || P.duel.ally === t)) this.buzzV([60]); }
    // اهتزاز لحظات الفريق: هجوم على أرضه، غدر حليفه، بداية مرحلة
    if (P.ev && P.ev.id !== this.lastEvV) { this.lastEvV = P.ev.id; const e = P.ev; if (e.k === 'attack' && e.d === t) this.buzzV([300, 120, 300]); else if (e.k === 'attack' && e.a === t && e.result === 'taken') this.buzzV([80, 60, 80]); else if (e.k === 'unally' && e.betray && (e.b === t || e.a === t)) this.buzzV([400]); else if (e.k === 'phase') this.buzzV([60]); }
    this.render(); },
  buzzV(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { } },
  myTeam() { const p = this.P && this.P.players[this.pid]; return p ? p.t : null; },
  isCap() { const t = this.myTeam(); return t != null && this.P.teams[t].cap === this.pid; },
  rn(r) { return this.M ? this.M.regions[r].name : 'إقليم ' + r; },
  tick() { // انقطاع الاتصال بالمشرف: المشرف يبث كل 2.5 ثانية، فغياب البث 9 ثوانٍ يعني انقطاعًا
    { const off = !!(this.P && this.lastState && performance.now() - this.lastState > 9000); let ob = document.getElementById('offbar'); if (off && !ob) { ob = document.createElement('div'); ob.id = 'offbar'; ob.className = 'offbar'; ob.textContent = 'انقطع الاتصال بالمشرف… تُعاد المحاولة تلقائيًا'; document.body.appendChild(ob); } else if (!off && ob) ob.remove(); }
    const el = $('#ptm'); if (el && this.P && this.P.paused) { el.textContent = this.P.tm ? '⏸ ' + Math.ceil(this.P.tm.r / 1000) + ' ث' : '⏸'; return; } if (el && this.endAt) { const s = Math.ceil(Math.max(0, this.endAt - performance.now()) / 1000); el.textContent = s + ' ث'; } },
  header() { const P = this.P, t = this.myTeam(), T = P && t != null ? P.teams[t] : null;
    return `<div class="hd"><div class="nm k">رايـات</div>${T ? `<span class="badge" style="--tc:${T.color}">${esc(T.name)}${this.isCap() ? ' · القائد 👑' : ''}</span>` : ''}<span class="tm" id="ptm"></span></div>`; },
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
      return `<div class="box col"><div class="q">${esc(q.text)}</div><div class="ans">${q.c.map((c, i) => `<button data-ans="${i}" class="${rev ? (i === q.a ? 'ok' : mine === i ? 'no' : '') : mine === i ? 'sel' : ''}" ${mine != null || rev ? 'disabled' : ''}><span class="L">${LET[i]}</span>${esc(c)}</button>`).join('')}</div>${rev ? `<div class="big k" style="font-size:22px">${mine === q.a ? '✅ أصبت' : mine == null ? (sent != null ? 'لم تصل إجابتك قبل انتهاء الوقت' : 'لم تجب') : '❌ لم تُصب'}</div><div class="mut" style="text-align:center">فريقك: ${Math.round(((P.ans && P.ans.ratios[t]) || 0) * 100)}٪ إجابات صحيحة ← ${(n => n === 0 ? 'لا أوامر' : n === 1 ? 'أمر واحد' : n === 2 ? 'أمران' : n + ' أوامر')(P.ans ? P.ans.orders[t] || 0 : 0)}</div>` : mine != null ? `<div class="mut" style="text-align:center">${got || st === 'gq' ? 'وصلت إجابتك ✓' : 'جارٍ إرسال إجابتك…'}</div>` : ''}</div>${this.resBox()}`; }
    if (st === 'orders') return this.ordersUI();
    if (st === 'predict' && P.duel) { const D = P.duel, side = D.a === t || D.ally === t ? 'a' : D.d === t ? 'd' : null;
      if (side) return `<div class="box"><div class="big k" style="color:${tc(t)}">${side === 'a' ? 'فريقكم يهاجم' : 'أرضكم تحت الهجوم!'}</div><div class="mut" style="text-align:center;margin-top:8px">${esc(D.kindAr)} على ${esc(D.rn)}. استعدوا للاستباق: أول من يضغط من فريقكم يجيب بصوت عالٍ.</div></div>`;
      const mine = this.local.pred; return `<div class="box col"><div class="big k" style="font-size:24px">من يفوز؟</div><div class="mut" style="text-align:center">التوقع الصحيح يجلب ذهبًا لفريقك</div><div class="pred"><button data-pred="a" class="${mine === 'a' ? 'sel' : ''}" style="--tc:${tc(D.a)}">${tn(D.a)}<div class="mut" style="font-size:14px">المهاجم</div></button><button data-pred="d" class="${mine === 'd' ? 'sel' : ''}" style="--tc:${tc(D.d)}">${tn(D.d)}<div class="mut" style="font-size:14px">المدافع</div></button></div></div>`; }
    if ((st === 'buzz' || st === 'judge' || st === 'point') && P.duel) { const D = P.duel, side = D.a === t || D.ally === t ? 'a' : D.d === t ? 'd' : null;
      if (st === 'buzz' && side && !D.tried.includes(side)) return `<div class="box col" style="gap:18px"><div class="q" style="text-align:center">${esc(D.q ? D.q.text : '')}</div><button class="buzz k" data-buzz>اضغط!</button><div class="mut" style="text-align:center">أول من يضغط يجيب بصوت عالٍ</div></div>`;
      if (st === 'judge' && D.buzz) return `<div class="box"><div class="mut" style="text-align:center">يجيب الآن</div><div class="big k" style="color:${tc(D.buzz.team)}">${tn(D.buzz.team)} · ${esc(D.buzz.name)}</div></div>`;
      return `<div class="box"><div class="big k" style="font-size:24px">${tn(D.a)} ${D.pts.a} – ${D.pts.d} ${tn(D.d)}</div><div class="mut" style="text-align:center;margin-top:6px">${side ? (D.tried.includes(side) ? 'أخطأ فريقكم، الفرصة للفريق الآخر' : 'تابعوا') : 'تابع المواجهة على الشاشة'}</div></div>`; }
    if (st === 'tie' && P.tie) { const can = P.tie.teams.includes(t) && !P.tie.buzz && !P.tie.tried.includes(t); return `<div class="box col"><div class="big k" style="font-size:24px">المواجهة الفاصلة</div>${P.tie.q ? `<div class="q">${esc(P.tie.q.text)}</div>` : ''}${can ? '<button class="buzz k" data-tbuzz>اضغط!</button>' : P.tie.buzz ? `<div class="big k" style="color:${tc(P.tie.buzz.team)}">${tn(P.tie.buzz.team)} يجيب</div>` : ''}</div>`; }
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
    $$('[data-buzz]').forEach(b => b.onclick = () => { this.send('bz', { d: P.duel.id }); this.buzzV(80); b.textContent = '✓'; b.disabled = true; });
    $$('[data-tbuzz]').forEach(b => b.onclick = () => { this.send('tb', {}); this.buzzV(80); b.textContent = '✓'; b.disabled = true; });
    $$('[data-tab]').forEach(b => b.onclick = () => { this.tab = b.dataset.tab; this.render(); });
    $$('[data-gx]').forEach(b => b.onclick = e => { e.stopPropagation(); this.seen[b.dataset.gx] = 1; LS.set('rayat.seen', this.seen); this.render(); });
    $$('[data-opt]').forEach(b => b.onclick = () => { const o = this.clean(this.curList[+b.dataset.opt]); const gk = this.guideKey(o); this.seen[gk] = 1; LS.set('rayat.seen', this.seen);
      if (this.isCap()) { const n = P.left[this.myTeam()] || 0; if (this.picks.length >= n) this.picks.shift(); this.picks.push(o); this.warned = false; this.send('ord', { l: this.picks, cy: P.cycle }); }
      else this.send('sug', { o }); this.buzzV(20); this.render(); });
    $$('[data-unpick]').forEach(b => b.onclick = () => { const i = +b.dataset.unpick; if (this.picks[i]) { this.picks.splice(i, 1); this.warned = false; this.send('ord', { l: this.picks, cy: P.cycle }); this.render(); } });
    $$('[data-ready]').forEach(b => b.onclick = () => { if (P.paused) return; const t = this.myTeam(), chk = planCheck(this.picks, P.res[t]); if (chk.bad && !this.warned) { this.warned = true; this.render(); return; } this.send('ord', { l: this.picks, cy: P.cycle }); this.send('rdy', { cy: P.cycle }); });
    $$('[data-fix]').forEach(b => b.onclick = () => { this.warned = false; this.render(); });
    $$('[data-dip]').forEach(b => b.onclick = () => { const k = b.dataset.dip; this.send('dip', { k, b: b.dataset.b != null ? +b.dataset.b : undefined, yes: b.dataset.yes === '1', res: b.dataset.res, amt: 3 }); toast('تم الإرسال'); });
  }
};
