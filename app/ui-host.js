/* رايات — لوحة المشرف: إعداد بسيط، ثم أزرار في وقتها فقط */
const TEAM_DEF = [['الصقور', '#2f6fdb'], ['السهم', '#1f9d55'], ['الرواد', '#e07a2e'], ['الهمّة', '#8e4fb8'], ['النخبة', '#c43d5a'], ['الأفق', '#16a0a0']];
const STAGE_AR = { lobby: 'الانتظار', phase: 'مشهد المرحلة', question: 'السؤال', reveal: 'كشف الإجابة', orders: 'القادة يختارون', exec: 'التنفيذ', scene: 'مشهد', predict: 'التوقعات', buzz: 'الاستباق', judge: 'الضاغط يختار إجابته', point: 'نقطة', gq: 'سؤال حامية القلعة', harvest: 'الحصاد', bini: 'البيني', tie: 'المواجهة الفاصلة', crown: 'التتويج' };
const Host = {
  init() {
    this.handled = {}; this.byPid = {}; this.peerPid = {}; this.bcPeers = new Map(); this.multSel = 2;
    this.cfg = LS.get('rayat.cfg', { n: 4, teams: TEAM_DEF.map(t => ({ name: t[0], color: t[1] })), level: 'med', binisOn: true, seed: 7, total: 60 }); if (![40, 50, 60, 90].includes(this.cfg.total)) this.cfg.total = 60; this.cfg.level = { mid: 'easy', sec: 'med', uni: 'hard' }[this.cfg.level] || this.cfg.level;
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
  newGame(code) { const c = this.cfg; this.g = new RayatGame({ bank: window.RAYAT_BANK, binis: this.binis(), level: c.level, binisOn: c.binisOn, mapSeed: c.seed, total: c.total, code, teams: c.teams.slice(0, c.n).map(t => ({ name: t.name, color: t.color, mark: t.name.replace(/^ال/, '')[0] })) }); this.g.onChange = () => this.changed(); this.g.hasDisplay = () => this.hasDisplay(); this.handled = {}; },
  askResume(saved) { modal(`<div class="col"><h2>مسابقة محفوظة</h2><div class="mut">وُجدت مسابقة غير منتهية (الرمز ${esc(saved.s.code)}). تستأنفها؟</div><div class="row"><button class="btn pri" data-r>استئناف</button><button class="btn" data-close>مسابقة جديدة</button></div></div>`, (m, close) => { $('[data-r]', m).onclick = () => { close(); this.g.load(JSON.stringify(saved)); Object.values(this.g.s.players).forEach(p => p.online = false); this.net.joinRoom(this.g.s.code); this.changed(); }; }); },
  async onCaps() { await this.net.joinRoom(this.g.s.code); this.net.presence({ r: 'h', c: this.g.s.code }); this.renderSide(); },
  // ---------- الجوالات ----------
  // إشارة شاشة العرض «انتهى المشهد»
  dispAck(peer, pr) { const m = pr && pr.sd; if (!m || typeof m.n !== 'number') return; this.ackN = this.ackN || {}; if (m.n <= (this.ackN[peer] || 0)) return; this.ackN[peer] = m.n; this.g.sceneAck(m.k); },
  hasDisplay() { return !!this.mapLayer || this.display > 0 || (this.bcDisplay && Date.now() - this.bcDisplay < 12000); },
  onPeers(ch) { ch.peers.forEach(p => { if (p.presence && p.presence.r === 'd' && !p.sameTab) this.dispAck(p.peer, p.presence); }); [...ch.joined, ...ch.updated].filter(p => !p.sameTab && p.kind === 'viewer').forEach(p => this.onPres(p.peer, p.presence || {}, p.by)); ch.left.forEach(p => this.onLeave(p.peer)); this.display = ch.peers.filter(p => p.presence && p.presence.r === 'd').length; if (ch.joined.length) this.broadcast(); this.renderSide(); },
  onBc(peer, pr, fp) { const isNew = !this.bcPeers.has(peer); this.bcPeers.set(peer, Date.now()); if (isNew) setTimeout(() => this.broadcast(), 50); if (pr.r === 'd') { this.bcDisplay = Date.now(); this.dispAck(peer, pr); return; } this.onPres(peer, pr, fp || null); },
  checkBc() { this.renderSide(); const now = Date.now(); this.bcPeers.forEach((t, peer) => { if (now - t > 12000) { this.bcPeers.delete(peer); this.onLeave(peer); } }); },
  onLeave(peer) { const pid = this.peerPid[peer]; if (pid) this.g.offline(pid); },
  onPres(peer, pr, by) { const g = this.g; if (pr.r !== 's' || !pr.pid || pr.c !== g.s.code) return; const pid = String(pr.pid).slice(0, 16);
    if (this.byPid[pid] && by && this.byPid[pid] !== by) return; if (by) this.byPid[pid] = by; this.peerPid[peer] = pid;
    if (pr.nm) g.join(pid, pr.nm, pr.tw); if (!g.s.players[pid]) return;
    const h = this.handled[pid] = this.handled[pid] || {}, fresh = f => { const m = pr[f]; if (!m || typeof m.n !== 'number' || m.n <= (h[f] || 0)) return null; h[f] = m.n; return m; };
    let m;
    if ((m = fresh('an'))) g.answer(pid, m.q, m.c);
    if ((m = fresh('ord'))) g.setOrders(pid, m.l, m.cy);
    if ((m = fresh('sug'))) g.suggest(pid, m.o);
    if ((m = fresh('rdy'))) g.setReady(pid, m.cy);
    if ((m = fresh('pr'))) g.predict(pid, m.d, m.s);
    if ((m = fresh('bz'))) g.buzz(pid, m.d);
    if ((m = fresh('pk'))) g.pick(pid, m.d, m.i);
    if ((m = fresh('tp'))) g.tiePick(pid, m.i);
    if ((m = fresh('tb'))) g.tieBuzz(pid);
    if ((m = fresh('dip'))) g.dip(pid, m);
  },
  // ---------- البث ----------
  // ---------- الأرشيف: كل مسابقة تُحفظ بنتيجتها وخريطتها الأخيرة (صورة الذكرى) وشريط الحرب ----------
  archive() { return LS.get('rayat.archive', []); },
  saveArchive() { const g = this.g, s = g.s; if (s.stage !== 'crown' || s.winner == null || !g.S) return; const key = s.code + '-' + (s.startedAt || s.v); if (this.archivedKey === key) return; this.archivedKey = key;
    const A = this.archive(); if (A.some(x => x.key === key)) return; const P = g.pub();
    A.unshift({ key, date: new Date().toISOString(), level: s.level, seed: s.mapSeed, teams: s.teams.map(t => ({ name: t.name, color: t.color, mark: t.mark })), winner: s.winner, rank: P.rank, ribbon: P.ribbon, owner: g.S.regions.map(r => r.owner), cycles: s.cycle });
    try { LS.set('rayat.archive', A.slice(0, 30)); } catch (e) { } },
  showArchive() { const A = this.archive(), d = iso => { try { return new Date(iso).toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return iso.slice(0, 10); } };
    if (!A.length) return modal('<div class="col"><h2>الأرشيف</h2><div class="mut">لا توجد مسابقات منتهية بعد. تُحفظ كل مسابقة هنا تلقائيًا عند التتويج.</div><button class="btn" data-close>إغلاق</button></div>');
    modal(`<div class="col"><h2>المسابقات السابقة</h2>${A.map((x, i) => `<button class="btn" data-ar="${i}" style="text-align:start;display:flex;justify-content:space-between;gap:10px"><span>${esc(d(x.date))}</span><span style="color:${x.teams[x.winner].color}">🏆 ${esc(x.teams[x.winner].name)}</span></button>`).join('')}<button class="btn" data-close>إغلاق</button></div>`, m => {
      $$('[data-ar]', m).forEach(b => b.onclick = () => { const x = A[+b.dataset.ar]; m.remove(); this.showMemorial(x); }); }); },
  showMemorial(x) { const M = RayatMap.build(x.teams.length, x.seed), map = RayatMap.svg(M, { teams: x.teams.map(t => ({ ...t, emb: t.mark })), owner: x.owner, forts: new Set() }).replace('<svg ', '<svg style="width:100%;height:auto;display:block;border-radius:14px" ');
    const txt = `رايات — ${x.teams[x.winner].name} أبطال الجزيرة\n` + (x.rank || []).map((r, k) => `${k + 1}. ${x.teams[r.team].name}: ${r.score} أرض`).join('\n');
    modal(`<div class="col"><div class="kind" style="color:var(--gold)">صورة الذكرى</div><h2 class="k" style="font-size:34px;color:${x.teams[x.winner].color}">${esc(x.teams[x.winner].name)}</h2>${map}
      <div class="tlist">${(x.rank || []).map((r, k) => `<div style="--tc:${x.teams[r.team].color}"><b>${k + 1}. ${esc(x.teams[r.team].name)}</b><span>${r.score} أرض</span></div>`).join('')}</div>
      ${x.ribbon && x.ribbon.length ? `<b>شريط الحرب</b>${x.ribbon.map(r => `<div style="font-size:14px"><b style="color:var(--gold)">${esc(r.name)}</b>: <span class="mut">${r.ev.map(esc).join(' · ')}</span></div>`).join('')}` : ''}
      <div class="row"><button class="btn pri" id="arcopy">نسخ النتيجة</button><button class="btn" data-close>إغلاق</button></div></div>`, m => { $('#arcopy', m).onclick = () => { try { navigator.clipboard.writeText(txt).then(() => toast('نُسخت النتيجة')).catch(() => toast('تعذّر النسخ')); } catch (e) { toast('تعذّر النسخ'); } }; }); },
  changed() { if (this.g.s.stage === 'crown') this.saveArchive(); if (!this.bq) this.bq = setTimeout(() => { this.bq = null; this.broadcast(); }, 40); if (!this.rq) this.rq = requestAnimationFrame(() => { this.rq = null; this.render(); }); if (!this.sq) this.sq = setTimeout(() => { this.sq = null; this.save(); }, 800); },
  broadcast() { const P = this.g.pub(); if (this.fp) P.fp = this.fp; this.net.emit('state', P); if (this.mapLayer) { try { Display.onState(JSON.parse(JSON.stringify(P))); } catch (e) { console.error(e); } this.renderMapCtl(); } },
  save() { try { LS.set('rayat.save', JSON.parse(this.g.save())); } catch (e) { } },
  // ---------- الواجهة ----------
  tickUI() { const el = $('#htm'); if (el) { const l = this.g.left(); el.textContent = this.g.s.deadline ? Math.ceil(l / 1000) + ' ث' : ''; }
    const ce = $('#cel'); if (ce) { const c = this.g.timeInfo(), mm = ms => { const t = Math.max(0, Math.round(ms / 1000)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }; ce.textContent = mm(c.el); $('#crem').textContent = c.over > 0 ? 'تجاوز ' + mm(c.over) : mm(c.rem); const e = new Date(Date.now() + c.rem), cd = $('#cend'); cd.textContent = c.done ? 'انتهت' : (this.g.s.paused ? '⏸ ' : '') + String(e.getHours()).padStart(2, '0') + ':' + String(e.getMinutes()).padStart(2, '0'); } },
  renderSide() { const el = $('#hside'); if (!el) return; const g = this.g, s = g.s, P = g.pub(), l = this.net.label();
    el.innerHTML = `<div><h1 class="k">رايـات</h1><div class="mut">لوحة المشرف</div></div>
      <div class="panel col"><div class="row" style="justify-content:space-between"><span>رمز الغرفة</span><b style="font-size:28px;letter-spacing:6px;direction:ltr">${esc(s.code)}</b></div><div class="mut" style="font-size:13px"><span class="dot ${l.cls}"></span> ${esc(l.t)}</div><button class="btn pri" id="maphere">🗺️ اعرض الخريطة هنا</button><a class="btn" id="opendsp" href="${esc(this.dspLink())}" target="_blank" rel="noopener" style="text-align:center;text-decoration:none">🖥️ شاشة العرض في نافذة ثانية</a></div>${IN_CLAUDE && !this.net.room ? `<div class="panel col" style="border-color:var(--gold)"><b>لدخول الطلاب بلا حسابات</b><div class="mut" style="font-size:14px">هذه الصفحة لا تتصل بالجوالات غير المسجّلة. شغّل المسابقة من الرابط الثابت:</div><a class="btn pri" href="${STABLE_URL}#host" target="_blank" rel="noopener" style="text-align:center;text-decoration:none">افتح الرابط الثابت</a></div>` : ''}
      ${g.S ? `<div class="panel col"><b>الفرق</b><div class="tlist">${P.teams.map((t, i) => `<div style="--tc:${t.color}"><span><b>${esc(t.name)}</b> · ${t.n} لاعب</span><span>${P.score[i]} أرض · 🌾${P.res[i].food} 💰${P.res[i].gold} 🪨${P.res[i].stone}</span></div>`).join('')}</div></div>` : ''}
      <div class="panel log"><b>السجل</b>${s.log.slice(-14).reverse().map(x => `<div>${esc(x.text)}</div>`).join('') || '<div>—</div>'}</div>`;
    $('#maphere').onclick = () => this.showMap(true); },
  dspLink() { const base = (pageBase() || ARTIFACT_URL || '').split('#')[0]; return (base && !base.startsWith('%%') ? base : '') + '#display-' + this.g.s.code; },
  // الخريطة في نفس النافذة: شاشة العرض كاملة فوق اللوحة، تأخذ الحالة مباشرة بلا شبكة
  showMap(on) {
    if (!this.mapLayer) { const L = document.createElement('div'); L.id = 'maplayer'; L.style.cssText = 'position:fixed;inset:0;z-index:400;background:#0b2230'; document.body.appendChild(L);
      const box = document.createElement('div'); Display.init(this.g.s.code, { local: true, root: box }); L.appendChild(box);
      const f = document.createElement('div'); f.className = 'mapctl'; f.id = 'mapctl'; L.appendChild(f); this.mapLayer = L; this.broadcast(); }
    this.mapLayer.style.display = on ? 'block' : 'none'; this.mapOn = on; this.renderMapCtl();
    if (on && Display.W) Display.W.resize(innerWidth, innerHeight); },
  renderMapCtl() { if (this.mapLayer) SFX.setExt(!this.mapOn || this.display > 0 || (this.bcDisplay && Date.now() - this.bcDisplay < 12000)); const f = $('#mapctl'); if (!f || !this.mapOn) return; const html = `<button class="btn" data-mback>⚙️<span class="lbl"> لوحة المشرف</span></button>`;
    if (f.dataset.h === html) return; f.dataset.h = html; f.innerHTML = html;
    $('[data-mback]', f).onclick = () => this.showMap(false); },
  render() { this.renderSide(); const el = $('#hmain'); if (!el) return; const ae = document.activeElement; if (ae && el.contains(ae) && /INPUT|SELECT|TEXTAREA/.test(ae.tagName)) return; const g = this.g, s = g.s, html = s.stage === 'lobby' ? this.setupUI() : this.liveUI(); if (html === this.lastHtml) return; this.lastHtml = html; el.innerHTML = html; this.bind(); },
  open: { more: false, bini: false, adv: false },
  setupUI() { const c = this.cfg, s = this.g.s, P = this.g.pub(), url = joinUrl(s.code, this.fp);
    return `<div class="panel col"><h2>إعداد المسابقة</h2>
      <div class="row"><span style="width:110px">عدد الفرق</span><div class="mults grow">${[2, 3, 4, 5, 6].map(n => `<button data-n="${n}" class="${c.n === n ? 'sel' : ''}">${n}</button>`).join('')}</div></div>
      <div class="grid2">${c.teams.slice(0, c.n).map((t, i) => `<div class="tcfg"><input type="color" data-tc="${i}" value="${t.color}"><input class="in" data-tname="${i}" value="${esc(t.name)}" maxlength="14"></div>`).join('')}</div>
      <div class="row"><span style="width:110px">المدة</span><div class="mults grow">${[40, 50, 60, 90].map(m => `<button data-tot="${m}" class="${c.total === m ? 'sel' : ''}">${m} د</button>`).join('')}</div></div>
      <div class="mut" style="font-size:13px;margin-inline-start:118px">تبدأ المدة عند «ابدأ المسابقة» وتشمل الأسئلة والمشاهد والبينيات والتتويج. التسجيل والشرح قبل البدء خارجها. ${c.binisOn ? `البينيات المناسبة لهذه المدة: ${({ 40: 'واحد', 50: 'اثنان', 60: 'اثنان', 90: 'أربعة' })[c.total]} (نحو 3 دقائق لكل بيني).` : ''}</div>
      <div class="row"><span style="width:110px">البينيات</span><div class="mults grow"><button data-bo="1" class="${c.binisOn ? 'sel' : ''}">مع بينيات</button><button data-bo="0" class="${!c.binisOn ? 'sel' : ''}">بدون</button></div></div></div>
      <details class="panel det" data-det="more" ${this.open.more ? 'open' : ''}><summary>إعدادات إضافية <span class="mut">المستوى: ${RayatGame.LEVELS[c.level]} · الخريطة والأرشيف${c.binisOn ? ' · بينياتك الخاصة' : ''}</span></summary><div class="col">
      <div class="row"><span style="width:110px">المستوى</span><div class="mults grow">${Object.entries(RayatGame.LEVELS).map(([k, v]) => `<button data-lv="${k}" class="${c.level === k ? 'sel' : ''}">${v}</button>`).join('')}</div></div>
      <div class="row"><span style="width:110px">الخريطة</span><button class="btn sm" id="reseed">🎲 جزيرة أخرى</button><span class="mut">رقم ${c.seed}</span></div>
      <div class="row"><span style="width:110px">الأرشيف</span><button class="btn sm" id="archive">📜 المسابقات السابقة (${this.archive().length})</button></div>
      ${c.binisOn ? `<div class="col" style="border-top:1px solid var(--line);padding-top:12px"><b>أضف بينيًّا خاصًا</b><div class="grid2"><input class="in" id="bname" placeholder="اسم البيني" maxlength="30"><input class="in" id="bn" placeholder="عدد المشاركين من كل فريق (اختياري)" inputmode="numeric"></div><input class="in" id="bdesc" placeholder="شرح بسيط" maxlength="140"><button class="btn sm" id="badd">إضافة</button>${this.custom.length ? `<div class="mut">بينياتك: ${this.custom.map((b, i) => `${esc(b.name)} <button class="btn sm" data-bdel="${i}">✕</button>`).join(' · ')}</div>` : ''}</div>` : ''}</div></details>
      <div class="panel row" style="gap:22px;align-items:flex-start"><div style="width:200px;background:#fff;border-radius:16px;padding:8px">${url ? qrSvg(url) : ''}</div><div class="col grow"><b>المتسابقون (${Object.keys(s.players).length})</b><div class="plist">${P.teams.map((t, i) => `<div class="t" style="--tc:${t.color}"><b>${esc(t.name)}</b>${Object.entries(s.players).filter(([, p]) => p.team === i).map(([pid, p]) => `<div><button class="btn sm" data-pl="${pid}" style="width:100%;text-align:start;background:none;border:0;padding:4px 0">${t.cap === pid ? '👑 ' : ''}${esc(p.name)}</button></div>`).join('') || '<div class="mut">—</div>'}</div>`).join('')}</div>
      <div class="mut" style="font-size:13px;word-break:break-all">${url ? esc(url) : 'الرابط يظهر بعد النشر'}</div></div></div>
      <button class="btn pri big" id="start" ${Object.keys(s.players).length ? '' : 'disabled'}>ابدأ المسابقة</button>
      <div class="mut" style="font-size:13px">لتجربة كاملة بلا أجهزة: <button class="btn sm" id="bots">أضف متسابقين تجريبيين</button></div>`; },
  liveUI() { const g = this.g, s = g.s, P = g.pub(), st = s.stage, T = P.teams, tn = i => i == null ? 'محايد' : esc(T[i].name), key = g.hostView().key;
    const LETTERS = ['أ', 'ب', 'ج', 'د'], ansTxt = (q, a) => q && a != null ? `${LETTERS[a]}) ${esc(q.c[a])}` : '';
    let h = `<div class="panel row" style="justify-content:space-between"><div class="stage">${esc(P.phaseName || '')} · الجولة ${s.cycle}<b>${STAGE_AR[st] || st}</b></div><div class="row"><b id="htm" style="font-size:28px"></b><button class="btn" data-pause>${s.paused ? '▶️ استئناف' : '⏸ إيقاف مؤقت'}</button></div></div>`;
    { const nP = Object.keys(s.players).length, rd = (s.orderTeams || []).filter(t => s.ready[t]).length, act = s.paused ? 'المسابقة متوقفة: اضغط «استئناف» للمتابعة' : ({ phase: 'مشهد المرحلة يُعرض الآن', question: `اقرأ السؤال للطلاب · أجاب ${Object.keys(s.answers).length} من ${nP}`, reveal: 'كشف الإجابة', orders: `القادة يختارون أوامرهم · جاهز ${rd} من ${(s.orderTeams || []).length}`, predict: 'المتفرجون يتوقعون الفائز', buzz: 'اقرأ سؤال المواجهة، وانتظر الجرس', judge: 'الضاغط يختار إجابته من جواله (التصحيح آلي)', point: 'نقطة، والمواجهة مستمرة', gq: 'سؤال حامية القلعة', scene: 'المشهد يُعرض الآن (تخطَّه إن احتجت)', harvest: 'الحصاد · هذا وقت مناسب لبدء بيني', bini: s.bini && s.bini.running ? 'البيني جارٍ: اختر الفائز حين ينتهي' : 'أدِر البيني ثم اختر الفريق الفائز', tie: 'مواجهة فاصلة: اقرأ السؤال وانتظر الجرس', crown: 'انتهت المسابقة: التتويج' })[st] || '';
      h += `<div class="panel clockp"><div class="cl"><div><span>المنقضي</span><b id="cel">—</b></div><div><span>المتبقي</span><b id="crem">—</b></div><div><span>النهاية المتوقعة</span><b id="cend">—</b></div><div><span>المدة</span><b>${s.total}${s.extra ? ' + ' + s.extra : ''} د</b></div></div><div class="act">${esc(act)}</div>${st !== 'crown' ? `<div class="row"><button class="btn sm" data-extend>➕ تمديد 5 دقائق</button><button class="btn sm ${s.endAfter ? 'pri' : ''}" data-endafter>${s.endAfter ? '✓ تنتهي بعد هذه الجولة (إلغاء)' : '🏁 إنهاء بعد الجولة الحالية'}</button></div>` : ''}</div>`; }
    if (st === 'question' || st === 'reveal' || st === 'gq') { const q = st === 'gq' ? s.duel.q : s.q; h += `<div class="panel col"><div style="font-family:var(--ft);font-size:22px;font-weight:700">${esc(q.text)}</div><div class="key">الإجابة: ${ansTxt(q, q.a)}</div><div class="mut">أجاب ${st === 'gq' ? Object.keys(s.duel.gqAns).length : Object.keys(s.answers).length} من ${Object.keys(s.players).length}</div>${st === 'question' ? '<button class="btn pri" data-skip>اكشف الآن</button>' : ''}</div>`; }
    if (st === 'orders') h += `<div class="panel col"><b>القادة يختارون</b>${(s.orderTeams || []).map(t => `<div>${tn(t)}: ${(s.orders[t] || []).length} من ${g.S.turn.left[t]} ${s.ready[t] ? '✓ جاهز' : ''}</div>`).join('')}<button class="btn pri" data-skip>نفّذ الآن</button></div>`;
    if (st === 'buzz' || st === 'judge') { const D = s.duel, opts = `<div class="hopts">${D.q.c.map((c, k) => `<div class="${k === D.q.a ? 'ok' : (D.wrong || []).includes(k) ? 'no' : ''}"><b>${LET[k]}</b> ${esc(c)}</div>`).join('')}</div>`;
      h += `<div class="panel col"><div class="mut">${esc(D.kindAr)}: ${tn(D.a)} ضد ${tn(D.d)} · ${D.pts.a}–${D.pts.d}</div><div style="font-family:var(--ft);font-size:22px;font-weight:700">${esc(D.q.text)}</div>${opts}${st === 'judge' ? `<div style="font-size:20px">${D.buzz.pass ? `أخطأ الأول، والسؤال الآن عند <b>${tn(D.buzz.team)}</b>: أول عضو يختار` : `يختار الآن من جواله: <b>${tn(D.buzz.team)} · ${esc(D.buzz.name)}</b>`}</div><div class="mut">التصحيح آلي، ولا يُطلب منك حكم.</div>` : `<div class="mut">بانتظار الجرس من جوالات الفريقين…</div><div class="row"><button class="btn sm" data-buzzfor="a">ضغط ${tn(D.a)} (يدويًا)</button><button class="btn sm" data-buzzfor="d">ضغط ${tn(D.d)} (يدويًا)</button></div>`}</div>`; }
    if (st === 'tie' && s.tie) { const t = s.tie; h += `<div class="panel col"><b>المواجهة الفاصلة</b>${t.q ? `<div style="font-family:var(--ft);font-size:20px">${esc(t.q.text)}</div><div class="hopts">${t.q.c.map((c, k) => `<div class="${k === t.q.a ? 'ok' : (t.wrong || []).includes(k) ? 'no' : ''}"><b>${LET[k]}</b> ${esc(c)}</div>`).join('')}</div>` : ''}${t.buzz ? `<div style="font-size:20px">يختار الآن من جواله: <b>${tn(t.buzz.team)} · ${esc(t.buzz.name)}</b></div><div class="mut">التصحيح آلي.</div>` : '<div class="mut">بانتظار الجرس…</div>'}</div>`; }
    if (['scene', 'phase', 'harvest', 'reveal', 'predict', 'point'].includes(st)) h += `<div class="panel row"><button class="btn big pri" data-skip>⏭ تخطَّ</button><span class="mut">ينتقل تلقائيًا عند انتهاء الوقت</span></div>`;
    if (st === 'bini' && s.bini) { const b = s.bini; h += `<div class="panel col"><h2>${esc(b.name)} ${b.mult > 1 ? '×' + b.mult : ''}</h2><div class="mut">${esc(b.desc)}</div><div class="row"><button class="btn" data-bt="30">⏱ 30 ث</button><button class="btn" data-bt="60">⏱ دقيقة</button><button class="btn" data-bt="90">⏱ 90 ث</button></div><b>الفائز:</b><div class="row" style="flex-wrap:wrap">${T.map(t => `<button class="btn" data-bw="${t.id}" style="border-inline-start:5px solid ${t.color}">${esc(t.name)}</button>`).join('')}</div><button class="btn sm" data-bc>إلغاء البيني</button></div>`; }
    if (s.binisOn && ['question', 'harvest', 'reveal'].includes(st)) { const B = this.binis(); h += `<details class="panel det" data-det="bini" ${this.open.bini ? 'open' : ''}><summary>🎯 بدء بيني <span class="mut">${B.length} في المكتبة · المضاعف ×${this.multSel}</span></summary><div class="col"><div class="row"><span>المضاعف</span><div class="mults grow">${[1, 2, 3, 4, 5].map(m => `<button data-mult="${m}" class="${this.multSel === m ? 'sel' : ''}">×${m}</button>`).join('')}</div></div>${this.multSel === 5 ? '<div class="mut" style="color:var(--gold)">⚠️ ×5 قد يحسم المسابقة</div>' : '<div class="mut">المقترح ×2 أو ×3</div>'}<div class="row" style="flex-wrap:wrap">${B.map((b, i) => `<button class="btn sm" data-bini="${i}">${esc(b.name)}</button>`).join('')}</div></div></details>`; }
    if (st === 'crown') h += `<div class="panel col"><h2>التتويج: ${tn(s.winner)}</h2>${(P.rank || []).map((r, k) => `<div>${k + 1}. ${tn(r.team)} — ${r.score} أرض</div>`).join('')}<button class="btn" id="newgame">مسابقة جديدة</button></div>`;
    if (st !== 'crown') h += `<details class="panel det" data-det="adv" ${this.open.adv ? 'open' : ''}><summary>أدوات إضافية</summary><div class="row"><button class="btn sm" data-nextphase>المرحلة التالية بعد هذه الجولة</button><button class="btn sm bad" id="endgame">إنهاء المسابقة الآن</button></div></details>`;
    return h; },
  bind() { const g = this.g, c = this.cfg, save = () => { LS.set('rayat.cfg', c); };
    const rebuild = () => { save(); const players = g.s.players, code = g.s.code; this.newGame(code); Object.entries(players).forEach(([pid, p]) => { this.g.join(pid, p.name, p.team < c.n ? p.team : null); }); this.render(); this.broadcast(); };
    $$('[data-n]').forEach(b => b.onclick = () => { c.n = +b.dataset.n; rebuild(); });
    $$('[data-tname]').forEach(b => b.onchange = () => { c.teams[+b.dataset.tname].name = b.value.trim() || c.teams[+b.dataset.tname].name; rebuild(); });
    $$('[data-tc]').forEach(b => b.onchange = () => { c.teams[+b.dataset.tc].color = b.value; rebuild(); });
    $$('[data-lv]').forEach(b => b.onclick = () => { c.level = b.dataset.lv; rebuild(); });
    $$('[data-tot]').forEach(b => b.onclick = () => { c.total = +b.dataset.tot; rebuild(); });
    $$('[data-bo]').forEach(b => b.onclick = () => { c.binisOn = b.dataset.bo === '1'; rebuild(); });
    const ar = $('#archive'); if (ar) ar.onclick = () => this.showArchive();
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
    $$('details[data-det]').forEach(d => d.ontoggle = () => { this.open[d.dataset.det] = d.open; });
    $$('[data-extend]').forEach(b => b.onclick = () => { g.extend(5); toast('مُدّدت المسابقة 5 دقائق'); });
    $$('[data-endafter]').forEach(b => b.onclick = () => { g.endAfterRound(!g.s.endAfter); });
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
  if (s.stage === 'judge' && s.duel && s.duel.buzz && s.duel.q && Math.random() < .25) { const D = s.duel, c = D.buzz.pass ? bots.filter(p => g.sideOf(s.players[p].team) === D.buzz.side) : (String(D.buzz.pid).startsWith('bot-') ? [D.buzz.pid] : []); if (c.length) { const left = D.q.c.map((_, k) => k).filter(k => !(D.wrong || []).includes(k)); g.pick(c[Math.floor(Math.random() * c.length)], D.id, Math.random() < .6 ? D.q.a : left[Math.floor(Math.random() * left.length)]); } }
  if (s.stage === 'tie' && s.tie && s.tie.buzz && String(s.tie.buzz.pid).startsWith('bot-') && Math.random() < .25) g.tiePick(s.tie.buzz.pid, Math.random() < .6 ? s.tie.q.a : Math.floor(Math.random() * 4));
  if (s.stage === 'gq' && s.duel) bots.forEach(p => { if (Math.random() < .3 && g.s.duel) g.answer(p, g.s.duel.q.id, Math.random() < .5 ? g.s.duel.q.a : 0); });
  if (s.stage === 'tie' && s.tie && !s.tie.buzz && Math.random() < .2) { const c = bots.filter(p => s.tie.teams.includes(s.players[p].team)); if (c.length) g.tieBuzz(c[Math.floor(Math.random() * c.length)]); }
}, 400);
