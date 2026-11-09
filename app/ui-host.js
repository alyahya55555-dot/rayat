/* رايات — لوحة المشرف: إعداد بسيط، ثم أزرار في وقتها فقط */
const TEAM_DEF = [['الصقور', '#2f6fdb'], ['السهم', '#1f9d55'], ['الرواد', '#e07a2e'], ['الهمّة', '#8e4fb8'], ['النخبة', '#c43d5a'], ['الأفق', '#16a0a0']];
const STAGE_AR = { lobby: 'الانتظار', phase: 'مشهد المرحلة', question: 'السؤال', reveal: 'كشف الإجابة', orders: 'القادة يختارون', exec: 'التنفيذ', scene: 'مشهد', predict: 'التوقعات', buzz: 'الاستباق', judge: 'احكم على الإجابة', point: 'نقطة', gq: 'سؤال حامية القلعة', harvest: 'الحصاد', bini: 'البيني', tie: 'المواجهة الفاصلة', crown: 'التتويج' };
const Host = {
  init() {
    this.handled = {}; this.byPid = {}; this.peerPid = {}; this.bcPeers = new Map(); this.multSel = 2;
    this.cfg = LS.get('rayat.cfg', { n: 4, teams: TEAM_DEF.map(t => ({ name: t[0], color: t[1] })), level: 'sec', binisOn: true, seed: 7 });
    this.custom = LS.get('rayat.binis.custom', []);
    this.newGame(); const saved = LS.get('rayat.save', null);
    this.net = new Net('host');
    this.net.on('peers', ch => this.onPeers(ch)); this.net.on('bcpres', (peer, pr, code, fp) => this.onBc(peer, pr, fp)); this.net.on('bcbye', peer => this.onLeave(peer));
    this.net.on('mqup', () => this.broadcast()); this.net.on('status', () => this.renderSide()); this.net.on('caps', () => this.onCaps());
    this.root = $('#app'); this.root.innerHTML = '<div class="hst"><div class="side" id="hside"></div><div class="main" id="hmain"></div></div>';
    this.net.init().then(() => { if (this.net.mq) this.net.mq.ensureKey().then(k => { if (k) { this.fp = k.fp; this.render(); this.broadcast(); } }); });
    if (saved && saved.s && saved.s.stage !== 'lobby' && saved.s.stage !== 'crown') this.askResume(saved);
    setInterval(() => { this.g.tick(); this.tickUI(); }, 200); setInterval(() => this.broadcast(), 2500); setInterval(() => this.checkBc(), 3000);
    window.addEventListener('beforeunload', () => this.save());
    this.render();
  },
  binis() { return (window.RAYAT_BINIS || []).concat(this.custom); },
  newGame(code) { const c = this.cfg; this.g = new RayatGame({ bank: window.RAYAT_BANK, binis: this.binis(), level: c.level, binisOn: c.binisOn, mapSeed: c.seed, code, teams: c.teams.slice(0, c.n).map(t => ({ name: t.name, color: t.color, mark: t.name.replace(/^ال/, '')[0] })) }); this.g.onChange = () => this.changed(); this.handled = {}; },
  askResume(saved) { modal(`<div class="col"><h2>مسابقة محفوظة</h2><div class="mut">وُجدت مسابقة غير منتهية (الرمز ${esc(saved.s.code)}). تستأنفها؟</div><div class="row"><button class="btn pri" data-r>استئناف</button><button class="btn" data-close>مسابقة جديدة</button></div></div>`, (m, close) => { $('[data-r]', m).onclick = () => { close(); this.g.load(JSON.stringify(saved)); Object.values(this.g.s.players).forEach(p => p.online = false); this.net.joinRoom(this.g.s.code); this.changed(); }; }); },
  async onCaps() { await this.net.joinRoom(this.g.s.code); this.net.presence({ r: 'h', c: this.g.s.code }); this.renderSide(); },
  // ---------- الجوالات ----------
  onPeers(ch) { [...ch.joined, ...ch.updated].filter(p => !p.sameTab && p.kind === 'viewer').forEach(p => this.onPres(p.peer, p.presence || {}, p.by)); ch.left.forEach(p => this.onLeave(p.peer)); this.display = ch.peers.filter(p => p.presence && p.presence.r === 'd').length; if (ch.joined.length) this.broadcast(); this.renderSide(); },
  onBc(peer, pr, fp) { const isNew = !this.bcPeers.has(peer); this.bcPeers.set(peer, Date.now()); if (isNew) setTimeout(() => this.broadcast(), 50); if (pr.r === 'd') { this.bcDisplay = Date.now(); return; } this.onPres(peer, pr, fp || null); },
  checkBc() { const now = Date.now(); this.bcPeers.forEach((t, peer) => { if (now - t > 12000) { this.bcPeers.delete(peer); this.onLeave(peer); } }); },
  onLeave(peer) { const pid = this.peerPid[peer]; if (pid) this.g.offline(pid); },
  onPres(peer, pr, by) { const g = this.g; if (pr.r !== 's' || !pr.pid || pr.c !== g.s.code) return; const pid = String(pr.pid).slice(0, 16);
    if (this.byPid[pid] && by && this.byPid[pid] !== by) return; if (by) this.byPid[pid] = by; this.peerPid[peer] = pid;
    if (pr.nm) g.join(pid, pr.nm, pr.tw); if (!g.s.players[pid]) return;
    const h = this.handled[pid] = this.handled[pid] || {}, fresh = f => { const m = pr[f]; if (!m || typeof m.n !== 'number' || m.n <= (h[f] || 0)) return null; h[f] = m.n; return m; };
    let m;
    if ((m = fresh('an'))) g.answer(pid, m.q, m.c);
    if ((m = fresh('ord'))) g.setOrders(pid, m.l);
    if ((m = fresh('sug'))) g.suggest(pid, m.o);
    if ((m = fresh('rdy'))) g.setReady(pid);
    if ((m = fresh('pr'))) g.predict(pid, m.d, m.s);
    if ((m = fresh('bz'))) g.buzz(pid, m.d);
    if ((m = fresh('tb'))) g.tieBuzz(pid);
    if ((m = fresh('dip'))) g.dip(pid, m);
  },
  // ---------- البث ----------
  changed() { if (!this.bq) this.bq = setTimeout(() => { this.bq = null; this.broadcast(); }, 40); if (!this.rq) this.rq = requestAnimationFrame(() => { this.rq = null; this.render(); }); if (!this.sq) this.sq = setTimeout(() => { this.sq = null; this.save(); }, 800); },
  broadcast() { const P = this.g.pub(); if (this.fp) P.fp = this.fp; this.net.emit('state', P); },
  save() { try { LS.set('rayat.save', JSON.parse(this.g.save())); } catch (e) { } },
  // ---------- الواجهة ----------
  tickUI() { const el = $('#htm'); if (el) { const l = this.g.left(); el.textContent = this.g.s.deadline ? Math.ceil(l / 1000) + ' ث' : ''; } },
  renderSide() { const el = $('#hside'); if (!el) return; const g = this.g, s = g.s, P = g.pub(), l = this.net.label();
    el.innerHTML = `<div><h1 class="k">رايـات</h1><div class="mut">لوحة المشرف</div></div>
      <div class="panel col"><div class="row" style="justify-content:space-between"><span>رمز الغرفة</span><b style="font-size:28px;letter-spacing:6px;direction:ltr">${esc(s.code)}</b></div><div class="mut" style="font-size:13px"><span class="dot ${l.cls}"></span> ${esc(l.t)}</div><button class="btn" id="opendsp">🖥️ افتح شاشة العرض</button></div>
      ${g.S ? `<div class="panel col"><b>الفرق</b><div class="tlist">${P.teams.map((t, i) => `<div style="--tc:${t.color}"><span><b>${esc(t.name)}</b> · ${t.n} لاعب</span><span>${P.score[i]} أرض · 🌾${P.res[i].food} 💰${P.res[i].gold} 🪨${P.res[i].stone}</span></div>`).join('')}</div></div>` : ''}
      <div class="panel log"><b>السجل</b>${s.log.slice(-14).reverse().map(x => `<div>${esc(x.text)}</div>`).join('') || '<div>—</div>'}</div>`;
    $('#opendsp').onclick = () => { const base = (pageBase() || ARTIFACT_URL || '').split('#')[0], link = base && !base.startsWith('%%') ? base + '#display-' + s.code : '#display-' + s.code; let w = null; try { w = window.open(link, 'rayat-display'); } catch (e) { }
      if (!w) modal(`<div class="col"><h2>شاشة العرض</h2><div class="mut">افتح هذا الرابط في نافذة أخرى على حاسوب العرض (أو على أي جهاز متصل بالبروجكتور):</div><input class="in" readonly value="${esc(link)}" style="direction:ltr" id="dl"><div class="row"><button class="btn pri" id="dcopy">نسخ الرابط</button><button class="btn" data-close>إغلاق</button></div><div class="mut">أو أدخل رمز الغرفة <b>${esc(s.code)}</b> في شاشة العرض.</div></div>`, m => { $('#dcopy', m).onclick = () => { try { navigator.clipboard.writeText(link).then(() => toast('نُسخ الرابط')).catch(() => { $('#dl', m).select(); }); } catch (e) { $('#dl', m).select(); } }; }); }; },
  render() { this.renderSide(); const el = $('#hmain'); if (!el) return; const ae = document.activeElement; if (ae && el.contains(ae) && /INPUT|SELECT|TEXTAREA/.test(ae.tagName)) return; const g = this.g, s = g.s, html = s.stage === 'lobby' ? this.setupUI() : this.liveUI(); if (html === this.lastHtml) return; this.lastHtml = html; el.innerHTML = html; this.bind(); },
  setupUI() { const c = this.cfg, s = this.g.s, P = this.g.pub(), url = joinUrl(s.code, this.fp);
    return `<div class="panel col"><h2>إعداد المسابقة</h2>
      <div class="row"><span style="width:110px">عدد الفرق</span><div class="mults grow">${[2, 3, 4, 5, 6].map(n => `<button data-n="${n}" class="${c.n === n ? 'sel' : ''}">${n}</button>`).join('')}</div></div>
      <div class="grid2">${c.teams.slice(0, c.n).map((t, i) => `<div class="tcfg"><input type="color" data-tc="${i}" value="${t.color}"><input class="in" data-tname="${i}" value="${esc(t.name)}" maxlength="14"></div>`).join('')}</div>
      <div class="row"><span style="width:110px">المستوى</span><div class="mults grow">${Object.entries(RayatGame.LEVELS).map(([k, v]) => `<button data-lv="${k}" class="${c.level === k ? 'sel' : ''}">${v}</button>`).join('')}</div></div>
      <div class="row"><span style="width:110px">البينيات</span><div class="mults grow"><button data-bo="1" class="${c.binisOn ? 'sel' : ''}">مع بينيات</button><button data-bo="0" class="${!c.binisOn ? 'sel' : ''}">بدون</button></div></div>
      <div class="row"><span style="width:110px">الخريطة</span><button class="btn sm" id="reseed">🎲 جزيرة أخرى</button><span class="mut">رقم ${c.seed}</span></div></div>
      ${c.binisOn ? `<div class="panel col"><b>أضف بينيًّا خاصًا</b><div class="grid2"><input class="in" id="bname" placeholder="اسم البيني" maxlength="30"><input class="in" id="bn" placeholder="عدد المشاركين من كل فريق (اختياري)" inputmode="numeric"></div><input class="in" id="bdesc" placeholder="شرح بسيط" maxlength="140"><button class="btn sm" id="badd">إضافة</button>${this.custom.length ? `<div class="mut">بينياتك: ${this.custom.map((b, i) => `${esc(b.name)} <button class="btn sm" data-bdel="${i}">✕</button>`).join(' · ')}</div>` : ''}</div>` : ''}
      <div class="panel row" style="gap:22px;align-items:flex-start"><div style="width:200px;background:#fff;border-radius:16px;padding:8px">${url ? qrSvg(url) : ''}</div><div class="col grow"><b>المتسابقون (${Object.keys(s.players).length})</b><div class="plist">${P.teams.map((t, i) => `<div class="t" style="--tc:${t.color}"><b>${esc(t.name)}</b>${Object.entries(s.players).filter(([, p]) => p.team === i).map(([pid, p]) => `<div><button class="btn sm" data-pl="${pid}" style="width:100%;text-align:start;background:none;border:0;padding:4px 0">${t.cap === pid ? '👑 ' : ''}${esc(p.name)}</button></div>`).join('') || '<div class="mut">—</div>'}</div>`).join('')}</div>
      <div class="mut" style="font-size:13px;word-break:break-all">${url ? esc(url) : 'الرابط يظهر بعد النشر'}</div></div></div>
      <button class="btn pri big" id="start" ${Object.keys(s.players).length ? '' : 'disabled'}>ابدأ المسابقة</button>
      <div class="mut" style="font-size:13px">لتجربة كاملة بلا أجهزة: <button class="btn sm" id="bots">أضف متسابقين تجريبيين</button></div>`; },
  liveUI() { const g = this.g, s = g.s, P = g.pub(), st = s.stage, T = P.teams, tn = i => i == null ? 'محايد' : esc(T[i].name), key = g.hostView().key;
    const LETTERS = ['أ', 'ب', 'ج', 'د'], ansTxt = (q, a) => q && a != null ? `${LETTERS[a]}) ${esc(q.c[a])}` : '';
    let h = `<div class="panel row" style="justify-content:space-between"><div class="stage">${esc(P.phaseName || '')} · الجولة ${s.cycle}<b>${STAGE_AR[st] || st}</b></div><div class="row"><b id="htm" style="font-size:28px"></b><button class="btn" data-pause>${s.paused ? '▶️ استئناف' : '⏸ إيقاف مؤقت'}</button></div></div>`;
    if (st === 'question' || st === 'reveal' || st === 'gq') { const q = st === 'gq' ? s.duel.q : s.q; h += `<div class="panel col"><div style="font-family:var(--ft);font-size:22px;font-weight:700">${esc(q.text)}</div><div class="key">الإجابة: ${ansTxt(q, q.a)}</div><div class="mut">أجاب ${st === 'gq' ? Object.keys(s.duel.gqAns).length : Object.keys(s.answers).length} من ${Object.keys(s.players).length}</div>${st === 'question' ? '<button class="btn pri" data-skip>اكشف الآن</button>' : ''}</div>`; }
    if (st === 'orders') h += `<div class="panel col"><b>القادة يختارون</b>${(s.orderTeams || []).map(t => `<div>${tn(t)}: ${(s.orders[t] || []).length} من ${g.S.turn.left[t]} ${s.ready[t] ? '✓ جاهز' : ''}</div>`).join('')}<button class="btn pri" data-skip>نفّذ الآن</button></div>`;
    if (st === 'buzz' || st === 'judge') { const D = s.duel; h += `<div class="panel col"><div class="mut">${esc(D.kindAr)}: ${tn(D.a)} ضد ${tn(D.d)} · ${D.pts.a}–${D.pts.d}</div><div style="font-family:var(--ft);font-size:22px;font-weight:700">${esc(D.q.text)}</div><div class="key">الإجابة: ${ansTxt(D.q, D.q.a)}</div>${st === 'judge' ? `<div style="font-size:22px">يجيب: <b>${tn(D.buzz.team)} · ${esc(D.buzz.name)}</b></div><div class="judge"><button class="btn ok" data-judge="1">✓ صحيحة</button><button class="btn bad" data-judge="0">✗ خاطئة</button></div>` : `<div class="mut">بانتظار الاستباق من جوالات الفريقين…</div><div class="row"><button class="btn sm" data-buzzfor="a">ضغط ${tn(D.a)} (يدويًا)</button><button class="btn sm" data-buzzfor="d">ضغط ${tn(D.d)} (يدويًا)</button></div>`}</div>`; }
    if (st === 'tie' && s.tie) { const t = s.tie; h += `<div class="panel col"><b>المواجهة الفاصلة</b>${t.q ? `<div style="font-family:var(--ft);font-size:20px">${esc(t.q.text)}</div><div class="key">الإجابة: ${ansTxt(t.q, t.q.a)}</div>` : ''}${t.buzz ? `<div style="font-size:20px">يجيب: <b>${tn(t.buzz.team)}</b></div><div class="judge"><button class="btn ok" data-tj="1">✓ صحيحة</button><button class="btn bad" data-tj="0">✗ خاطئة</button></div>` : '<div class="mut">بانتظار الاستباق…</div>'}</div>`; }
    if (['scene', 'phase', 'harvest', 'reveal', 'predict', 'point'].includes(st)) h += `<div class="panel row"><button class="btn big pri" data-skip>⏭ تخطَّ</button><span class="mut">ينتقل تلقائيًا عند انتهاء الوقت</span></div>`;
    if (st === 'bini' && s.bini) { const b = s.bini; h += `<div class="panel col"><h2>${esc(b.name)} ${b.mult > 1 ? '×' + b.mult : ''}</h2><div class="mut">${esc(b.desc)}</div><div class="row"><button class="btn" data-bt="30">⏱ 30 ث</button><button class="btn" data-bt="60">⏱ دقيقة</button><button class="btn" data-bt="90">⏱ 90 ث</button></div><b>الفائز:</b><div class="row" style="flex-wrap:wrap">${T.map(t => `<button class="btn" data-bw="${t.id}" style="border-inline-start:5px solid ${t.color}">${esc(t.name)}</button>`).join('')}</div><button class="btn sm" data-bc>إلغاء البيني</button></div>`; }
    if (s.binisOn && ['question', 'harvest', 'reveal'].includes(st)) { const B = this.binis(); h += `<div class="panel col"><b>بيني الآن</b><div class="row"><span>المضاعف</span><div class="mults grow">${[1, 2, 3, 4, 5].map(m => `<button data-mult="${m}" class="${this.multSel === m ? 'sel' : ''}">×${m}</button>`).join('')}</div></div>${this.multSel === 5 ? '<div class="mut" style="color:var(--gold)">⚠️ ×5 قد يحسم المسابقة</div>' : '<div class="mut">المقترح ×2 أو ×3</div>'}<div class="row" style="flex-wrap:wrap">${B.map((b, i) => `<button class="btn sm" data-bini="${i}">${esc(b.name)}</button>`).join('')}</div></div>`; }
    if (st === 'crown') h += `<div class="panel col"><h2>التتويج: ${tn(s.winner)}</h2>${(P.rank || []).map((r, k) => `<div>${k + 1}. ${tn(r.team)} — ${r.score} أرض</div>`).join('')}<button class="btn" id="newgame">مسابقة جديدة</button></div>`;
    if (st !== 'crown') h += `<div class="panel row"><button class="btn sm" data-nextphase>المرحلة التالية بعد هذه الجولة</button><button class="btn sm bad" id="endgame">إنهاء المسابقة</button></div>`;
    return h; },
  bind() { const g = this.g, c = this.cfg, save = () => { LS.set('rayat.cfg', c); };
    const rebuild = () => { save(); const players = g.s.players, code = g.s.code; this.newGame(code); Object.entries(players).forEach(([pid, p]) => { this.g.join(pid, p.name, p.team < c.n ? p.team : null); }); this.render(); this.broadcast(); };
    $$('[data-n]').forEach(b => b.onclick = () => { c.n = +b.dataset.n; rebuild(); });
    $$('[data-tname]').forEach(b => b.onchange = () => { c.teams[+b.dataset.tname].name = b.value.trim() || c.teams[+b.dataset.tname].name; rebuild(); });
    $$('[data-tc]').forEach(b => b.onchange = () => { c.teams[+b.dataset.tc].color = b.value; rebuild(); });
    $$('[data-lv]').forEach(b => b.onclick = () => { c.level = b.dataset.lv; rebuild(); });
    $$('[data-bo]').forEach(b => b.onclick = () => { c.binisOn = b.dataset.bo === '1'; rebuild(); });
    const rs = $('#reseed'); if (rs) rs.onclick = () => { c.seed = 1 + Math.floor(Math.random() * 999); rebuild(); };
    const ba = $('#badd'); if (ba) ba.onclick = () => { const name = $('#bname').value.trim(), desc = $('#bdesc').value.trim(), n = parseInt($('#bn').value, 10); if (!name) return toast('اكتب اسم البيني'); this.custom.push({ name, desc, n: n > 0 ? n : null, mine: true }); LS.set('rayat.binis.custom', this.custom); rebuild(); };
    $$('[data-bdel]').forEach(b => b.onclick = () => { this.custom.splice(+b.dataset.bdel, 1); LS.set('rayat.binis.custom', this.custom); rebuild(); });
    $$('[data-pl]').forEach(b => b.onclick = () => { const pid = b.dataset.pl, p = g.s.players[pid]; if (!p) return; modal(`<div class="col"><h2>${esc(p.name)}</h2><button class="btn" data-mc>👑 اجعله قائد فريقه</button><div class="mut">انقله إلى فريق:</div><div class="row" style="flex-wrap:wrap">${g.s.teams.map(t => `<button class="btn sm" data-mt="${t.id}" style="border-inline-start:5px solid ${t.color}">${esc(t.name)}</button>`).join('')}</div><button class="btn bad sm" data-mk>إخراجه</button></div>`, (m, close) => { $('[data-mc]', m).onclick = () => { g.setCaptain(p.team, pid); close(); }; $$('[data-mt]', m).forEach(x => x.onclick = () => { g.movePlayer(pid, +x.dataset.mt); close(); }); $('[data-mk]', m).onclick = () => { g.kick(pid); close(); }; }); });
    const stt = $('#start'); if (stt) stt.onclick = () => { SFX.unlock(); g.start(); };
    const bots = $('#bots'); if (bots) bots.onclick = () => { this.g.s.teams.forEach((t, i) => { for (let k = 0; k < 3; k++) g.join('bot-' + i + '-' + k, 'تجريبي ' + (k + 1), i); }); toast('أُضيف متسابقون تجريبيون (يجيبون آليًا)'); this.bots = true; };
    $$('[data-skip]').forEach(b => b.onclick = () => g.skip());
    $$('[data-pause]').forEach(b => b.onclick = () => g.pause(!g.s.paused));
    $$('[data-judge]').forEach(b => b.onclick = () => g.judge(b.dataset.judge === '1'));
    $$('[data-buzzfor]').forEach(b => b.onclick = () => { const D = g.s.duel; if (!D) return; const team = b.dataset.buzzfor === 'a' ? D.a : D.d, pid = g.members(team)[0]; if (pid) g.buzz(pid, D.id); });
    $$('[data-tj]').forEach(b => b.onclick = () => g.tieJudge(b.dataset.tj === '1'));
    $$('[data-mult]').forEach(b => b.onclick = () => { this.multSel = +b.dataset.mult; this.render(); });
    $$('[data-bini]').forEach(b => b.onclick = () => g.biniStart(+b.dataset.bini, this.multSel));
    $$('[data-bt]').forEach(b => b.onclick = () => g.biniTimer(+b.dataset.bt));
    $$('[data-bw]').forEach(b => b.onclick = () => g.biniWinner(+b.dataset.bw));
    $$('[data-bc]').forEach(b => b.onclick = () => g.biniCancel());
    $$('[data-nextphase]').forEach(b => b.onclick = () => { g.nextPhaseNow(); toast('تبدأ المرحلة التالية بعد هذه الجولة'); });
    const ng = $('#newgame'); if (ng) ng.onclick = () => { this.newGame(); this.render(); this.broadcast(); this.net.joinRoom(this.g.s.code); };
    const eg = $('#endgame'); if (eg) eg.onclick = () => confirmBox('إنهاء المسابقة الآن وإعلان الترتيب؟', () => { g.enterPhase(RayatRules.CFG.PHASES.length - 1); });
  }
};
// متسابقون تجريبيون: يجيبون ويختارون آليًا (لوضع التجربة قبل يوم المسابقة)
setInterval(() => { const H = Host; if (!H.g || !H.bots) return; const g = H.g, s = g.s, bots = Object.keys(s.players).filter(p => p.startsWith('bot-'));
  if (s.stage === 'question' && s.q) bots.forEach(p => { if (Math.random() < .25) g.answer(p, s.q.id, Math.random() < .6 ? s.q.a : Math.floor(Math.random() * 4)); });
  if (s.stage === 'orders') (s.orderTeams || []).forEach(t => { const cap = g.captain(t); if (!cap || !cap.startsWith('bot-') || s.ready[t]) return; const O = g.options(t), all = [].concat(...Object.values(O)); if (!all.length) return; const pref = all.filter(o => o.k === 'attack' || o.k === 'occupy'); const n = g.S.turn.left[t], l = []; for (let i = 0; i < n; i++) { const src = pref.length && Math.random() < .7 ? pref : all; l.push(src[Math.floor(Math.random() * src.length)]); } g.setOrders(cap, l); g.setReady(cap); });
  if (s.stage === 'predict' && s.duel) bots.forEach(p => { if (Math.random() < .2) g.predict(p, s.duel.id, Math.random() < .5 ? 'a' : 'd'); });
  if (s.stage === 'buzz' && s.duel && Math.random() < .15) { const c = bots.filter(p => g.sideOf(s.players[p].team)); if (c.length) g.buzz(c[Math.floor(Math.random() * c.length)], s.duel.id); }
  if (s.stage === 'gq' && s.duel) bots.forEach(p => { if (Math.random() < .3 && g.s.duel) g.answer(p, g.s.duel.q.id, Math.random() < .5 ? g.s.duel.q.a : 0); });
  if (s.stage === 'tie' && s.tie && !s.tie.buzz && Math.random() < .2) { const c = bots.filter(p => s.tie.teams.includes(s.players[p].team)); if (c.length) g.tieBuzz(c[Math.floor(Math.random() * c.length)]); }
}, 400);
