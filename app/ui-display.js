/* رايات — شاشة العرض (البروجكتور): الجزيرة ثلاثية الأبعاد + طبقة نظيفة فوقها، عنصر رئيس واحد في كل لحظة */

const Display = {
  init(code, opt = {}) {
    this.local = !!opt.local; this.root = opt.root || $('#app');
    this.code = code || LS.get('rayat.displayCode', '') || ''; this.P = null; this.W = null; this.lastEv = 0; this.visKey = ''; this.skipSeq = 0; this.endAt = 0; this.dur = 1; this.lastStage = ''; this.lastPhase = -1; this.playing = 0;
    this.root.innerHTML = `<canvas id="world"></canvas><div class="dsp" id="dsp"><div class="top"><div class="brand k">رايـــات<small>حرب السيطرة على الجزيرة</small></div><div class="phase" id="phase"></div></div><div class="dom" id="dom"></div><div class="card qcard hide" id="qcard"></div><div class="card banner hide" id="banner"></div><div class="card mid hide" id="mid"></div><div class="card lobby mid hide" id="lobby"></div><div class="sidelog" id="slog"></div></div><div class="statusbar" id="sbar"></div>`;
    if (this.local) this.net = { label: () => ({ cls: 'on', t: 'العرض في نفس النافذة' }), heartbeat() { }, presence() { }, joinRoom() { } };
    else {
      this.net = new Net('display');
      this.net.on('state', P => this.onState(P));
      this.net.on('caps', () => { if (this.code) this.join(this.code); });
      this.net.on('status', () => this.badge());
      this.net.init(); this.net.presence({ r: 'd' });
      setInterval(() => this.net.heartbeat(), 3000);
    }
    this.overlay(); setInterval(() => this.tickUI(), 200);
    window.addEventListener('resize', () => this.W && this.W.resize(innerWidth, innerHeight));
    if (!this.local) setTimeout(() => { if (!this.P) this.askCode(); }, 4000);
  },
  async join(code) { this.code = code; LS.set('rayat.displayCode', code); await this.net.joinRoom(code); this.net.presence({ r: 'd', c: code }); this.badge(); },
  overlay() { const o = document.createElement('div'); o.style.cssText = 'position:fixed;inset:0;z-index:50;display:grid;place-items:center;background:rgba(4,14,20,.7);cursor:pointer';
    o.innerHTML = '<div style="text-align:center"><div class="brand k" style="font-size:90px">رايـــات</div><div class="mut" style="margin-top:14px;font-size:20px">اضغط في أي مكان لتفعيل الصوت وملء الشاشة</div></div>';
    o.onclick = () => { SFX.unlock(); setTimeout(() => SFX.ambient(), 800); try { document.documentElement.requestFullscreen().catch(() => { }); } catch (e) { } o.remove(); }; this.root.appendChild(o);
    const sb = document.createElement('div'); sb.className = 'sndbox'; sb.innerHTML = `<button class="btn sm" id="sm">🔊</button><input type="range" id="sv" min="0" max="100" value="${Math.round(SFX.vol * 100)}">`; this.root.appendChild(sb);
    $('#sm', this.root).onclick = () => { SFX.unlock(); SFX.on = !SFX.on; $('#sm').textContent = SFX.on ? '🔊' : '🔇'; }; $('#sv', this.root).oninput = e => { SFX.unlock(); SFX.setVol(+e.target.value / 100); }; },
  badge() { const b = $('#sbar'); if (b) { const l = this.net.label(); b.innerHTML = `<span class="dot ${l.cls}"></span> ${esc(l.t)}${this.code ? ' · ' + esc(this.code) : ''}`; } },
  askCode() { if ($('#askcode') || this.P) return; const d = document.createElement('div'); d.id = 'askcode'; d.className = 'modal-bg'; d.innerHTML = `<div class="modal col"><b>لم تصل حالة المسابقة بعد</b><div class="mut">إن كانت لوحة المشرف مفتوحة في المتصفح نفسه فستظهر تلقائيًا. على جهاز آخر أدخل رمز الغرفة:</div><div class="row"><input class="in" id="dcode" maxlength="4" inputmode="numeric" style="direction:ltr;text-align:center;letter-spacing:8px;font-size:24px"><button class="btn pri" id="dgo">ربط</button></div></div>`; document.body.appendChild(d); $('#dgo').onclick = () => { const c = $('#dcode').value.replace(/\D/g, ''); if (c.length === 4) { this.join(c); d.remove(); } }; },
  ensureWorld(P) {
    const key = P.teams.length + ':' + P.mapSeed + ':' + P.teams.map(t => t.color + t.name).join();
    if (this.W && this.worldKey === key) return;
    if (this.W) { try { this.W.renderer.dispose(); } catch (e) { } const c = $('#world'), n = c.cloneNode(); c.replaceWith(n); }
    this.worldKey = key; const M = RayatMap.build(P.teams.length, P.mapSeed);
    this.W = RayatWorld($('#world'), M, P.teams.map(t => ({ name: t.name, color: t.color, mark: t.mark || t.name[0] })), { seed: 91, lite: innerWidth < 900 });
    this.W.on('sfx', e => SFX.play(e.k, e.at || 0, e.dur || 0));
    this.W.fontsReady(); this.W.resize(innerWidth, innerHeight); this.W.start(); this.visKey = '';
  },
  onState(P) {
    if (!P || !P.teams) return; if (this.code && P.code !== this.code && this.P) return; if (!this.code && P.code) this.join(P.code);
    if (this.P && P.v < this.P.v && P.code === this.P.code) return;
    const ask = $('#askcode'); if (ask) ask.remove();
    this.P = P; this.ensureWorld(P);
    if (P.tm) { this.endAt = performance.now() + P.tm.r; this.dur = P.tm.d || 1; } else this.endAt = 0;
    if (P.skipSeq !== this.skipSeq) { this.skipSeq = P.skipSeq; if (this.playing) this.W.skip(); }
    // الأحداث: مشهد جديد يُشغَّل مرة واحدة
    if (P.ev && P.ev.id !== this.lastEv) { this.lastEv = P.ev.id; this.enqueue(P.ev); }
    else if (!P.ev && !this.playing && P.vis) this.syncVis(P.vis);
    if (P.stage !== this.lastStage) { this.onStage(P.stage, this.lastStage); this.lastStage = P.stage; }
    if (P.phase !== this.lastPhase && P.phaseKey) { if (this.lastPhase < 0) this.W.setSky(P.phaseKey, 0); this.lastPhase = P.phase; }
    this.render();
  },
  syncVis(vis) { const k = JSON.stringify(vis); if (k === this.visKey) return; this.visKey = k; this.W.setState(vis); },
  // المشاهد تُعرض واحدًا بعد الآخر؛ إن تراكمت يُسرَّع الجاري ليلحق
  enqueue(ev) { (this.evq = this.evq || []).push(ev); if (this.playing) { this.W.skip(); return; } this.pump(); },
  async pump() { while (this.evq && this.evq.length) { const ev = this.evq.shift(); await this.playEvent(ev); if (this.evq.length) this.W.skip(); } },
  async playEvent(ev) { const W = this.W, tn = this.P.teams; this.playing++; this.curEv = ev;
    try {
      if (ev.k === 'phase') { SFX.play('phase'); await W.phase({ key: ev.key }); }
      else if (ev.k === 'attack') await W.attack(ev);
      else if (ev.k === 'occupy') await W.occupy(ev.one || ev);
      else if (['walls', 'tower', 'garInf', 'garCav'].includes(ev.k)) { const e = ev.one || ev; await W.build({ r: e.r, k: e.k, team: e.team }); }
      else if (ev.k === 'capital') await W.capital(ev.one || ev);
      else if (ev.k === 'batch') await W.batch(ev.list.filter(e => e.k !== 'supply'));
      else if (ev.k === 'ally') await W.ally(ev);
      else if (ev.k === 'unally') await W.unally(ev);
      else if (ev.k === 'supply') SFX.play('harvest');
    } catch (e) { console.error(e); }
    this.playing--; this.curEv = null; if (!this.playing && this.P && this.P.vis && !this.P.ev) this.syncVis(this.P.vis); this.render(); },
  onStage(st, prev) { if (['question', 'orders', 'predict', 'buzz', 'harvest', 'bini', 'tie'].includes(st) && !this.playing && this.W) this.W.overview(1.6); if (st === 'question') SFX.play('question'); if (st === 'reveal') SFX.play('reveal'); if (st === 'harvest') SFX.play('harvest'); if (st === 'judge') SFX.play('buzz'); if (st === 'crown') { SFX.play('crown'); this.W && this.W.setSky('crown', 6); } },
  tickUI() { const t = $('#tbar'); if (t && this.endAt) { const left = Math.max(0, this.endAt - performance.now()); t.style.transform = `scaleX(${left / this.dur})`; } const pl = $('#plft'); if (pl && this.P && this.P.phaseLeft != null) pl.textContent = this.P.stage === 'lobby' || this.P.stage === 'crown' ? '' : 'باقي ' + Math.ceil(Math.max(0, this.P.phaseLeft - 0) / 60000) + ' د'; },
  show(id, html) { ['qcard', 'banner', 'mid', 'lobby'].forEach(k => { const el = $('#' + k); if (k === id) { if (html != null && el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; } el.classList.remove('hide'); } else el.classList.add('hide'); }); },
  render() {
    const P = this.P; if (!P) return; const T = P.teams, tn = i => i == null ? 'محايد' : esc(T[i].name), tc = i => i == null ? '#999' : T[i].color;
    // الشريط العلوي: المرحلة والسيطرة
    $('#phase').innerHTML = P.stage === 'lobby' ? '' : `<b class="k">${esc(P.phaseName || '')}</b><span>الجولة ${P.cycle || 0} · <span id="plft"></span></span>`;
    if (P.score) { const tot = (P.nRegions || 1) - 1 + 4; $('#dom').innerHTML = `<div class="bar">${T.map((t, i) => `<i style="flex:${P.score[i]};background:${t.color}"></i>`).join('')}<i style="flex:${Math.max(0, tot - P.score.reduce((a, b) => a + b, 0))};background:rgba(255,255,255,.18)"></i></div><div class="names">${T.map((t, i) => `<span><i class="chip" style="background:${t.color}"></i>${esc(t.name)} <em>${P.score[i]}</em></span>`).join('')}</div>`; }
    else $('#dom').innerHTML = '';
    const tbar = `<div class="timer"><i id="tbar"></i></div>`, st = P.stage;
    const slog = $('#slog'); slog.innerHTML = '';
    if (st === 'lobby') { const url = joinUrl(P.code, P.fp); return this.show('lobby', `<div><div class="qr">${url ? qrSvg(url) : ''}</div><div class="code">رمز الغرفة<b>${esc(P.code)}</b></div></div><div><div class="ptitle k" style="font-size:64px;text-align:start">امسح الرمز وانضم</div><div class="mut" style="font-size:20px;margin:6px 0 20px">اختر فريقك من جوالك، وأول من ينضم يكون القائد</div><div class="teams">${T.map((t, i) => `<div class="team" style="--tc:${t.color}"><h3>${esc(t.name)}</h3>${Object.entries(P.players).filter(([, p]) => p.t === i).map(([pid, p]) => `<div class="p ${t.cap === pid ? 'cap' : ''}">${t.cap === pid ? '👑 ' : ''}${esc(p.n)}</div>`).join('') || '<div class="p">بانتظار المتسابقين…</div>'}</div>`).join('')}</div></div>`); }
    if (st === 'phase' && P.ev && P.ev.k === 'phase') { const U = { occupy: 'الاحتلال', supply: 'التموين', inf: 'المشاة', walls: 'الأسوار', cav: 'الفرسان', tower: 'برج المراقبة', garInf: 'الحامية', alliance: 'التحالفات', cat: 'المنجنيق', cap2: 'تطوير العاصمة', castle: 'القلعة الكبرى' };
      const un = (P.ev.unlock || []).filter(k => U[k] && k !== 'garCav' && k !== 'cap3').map(k => U[k]);
      return this.show('mid', `<div class="kind">المرحلة</div><div class="ptitle k">${esc(P.ev.name)}</div>${un.length ? `<div class="punlock">ينفتح الآن: ${un.join('، ')}</div>` : P.ev.key === 'final' ? '<div class="punlock">سقطت التحالفات كلها، وكل فريق لنفسه</div>' : ''}`); }
    if ((st === 'question' || st === 'reveal' || st === 'gq') && P.q) { const q = P.q, rev = st === 'reveal';
      const head = st === 'gq' ? `سؤال حامية القلعة · يجيب ${tn(P.duel.a)} من جوالاتهم` : `سؤال الجولة ${P.cycle} · ${esc(q.topic || '')}`;
      const res = rev && P.ans ? `<div class="row" style="justify-content:center;gap:18px;margin-top:16px;flex-wrap:wrap">${T.map((t, i) => `<span style="font-weight:700"><i class="chip" style="background:${t.color}"></i> ${esc(t.name)}: ${Math.round((P.ans.ratios[i] || 0) * 100)}٪ ← ${P.ans.orders[i] || 0} ${P.ans.orders[i] === 1 ? 'أمر' : P.ans.orders[i] === 2 ? 'أمران' : 'أوامر'}</span>`).join('')}</div>` : '';
      return this.show('qcard', `<div class="qtop"><span>${head}</span><span>${rev ? '' : `أجاب ${(P.answered || []).length || q.answered || P.duel && P.duel.gqN || 0}`}</span></div><div class="qtext">${esc(q.text)}</div><div class="opts">${q.c.map((c, i) => `<div class="opt ${rev ? (i === q.a ? 'right' : 'dim') : ''}"><span class="L">${LET[i]}</span>${esc(c)}</div>`).join('')}</div>${res}${rev ? '' : tbar}`); }
    if (st === 'orders') { const ot = P.orderTeams || [];
      return this.show('banner', `<small>القادة يختارون أوامرهم بعد مشورة فرقهم</small><b class="k">${ot.map(t => `<span style="color:${tc(t)}">${tn(t)}${P.ready && P.ready[t] ? ' ✓' : ''}</span>`).join(' · ')}</b>${tbar}`); }
    if (st === 'predict' || st === 'buzz' || st === 'judge' || st === 'point') { const D = P.duel; if (!D) return; const need = D.kind === 'castle' ? 'أفضل من ثلاثة' : D.need.a > 1 ? 'المهاجم يحتاج فوزين' : 'فوز واحد يحسم';
      const pips = (side, team) => `<div class="pips" style="color:${tc(team)}">${Array.from({ length: D.need[side] }, (_, k) => `<i class="${k < D.pts[side] ? 'on' : ''}"></i>`).join('')}</div>`;
      const vs = `<div class="kind">${esc(D.kindAr)} · ${esc(D.rn)} · ${need}</div><div class="vs"><div class="side" style="color:${tc(D.a)}"><b class="k">${tn(D.a)}${D.ally != null ? ' + ' + tn(D.ally) : ''}</b><span>يهاجمون ${D.betray ? '(نقض الحلف)' : D.revenge ? '(ثأر)' : ''}</span>${pips('a', D.a)}</div><div class="x">⚔</div><div class="side" style="color:${tc(D.d)}"><b class="k">${tn(D.d)}</b><span>يدافعون</span>${pips('d', D.d)}</div></div>`;
      if (st === 'predict') return this.show('mid', vs + `<div class="punlock">الفرق المتفرجة: توقّعوا الفائز من جوالاتكم (${D.preds} توقع)</div>${tbar}`);
      if (st === 'point') return this.show('mid', vs + `<div class="punlock">نقطة لـ${D.last === 'a' ? tn(D.a) : tn(D.d)}، والمواجهة مستمرة</div>`);
      if (st === 'judge' && D.buzz) return this.show('qcard', `<div class="qtop"><span>${esc(D.kindAr)} · ${esc(D.rn)}</span><span><span style="color:${tc(D.a)}">${tn(D.a)} ${D.pts.a}</span> – <span style="color:${tc(D.d)}">${D.pts.d} ${tn(D.d)}</span></span></div><div class="qtext">${esc(D.q.text)}</div><div style="text-align:center"><div class="mut">ضغط أولًا</div><div class="who" style="color:${tc(D.buzz.team)}">${tn(D.buzz.team)} · ${esc(D.buzz.name)}</div><div class="mut" style="margin-top:6px">يجيب بصوت عالٍ، والمشرف يحكم</div></div>`);
      return this.show('qcard', `<div class="qtop"><span style="color:${tc(D.a)}">${tn(D.a)}</span><span>${D.tried.length ? 'الفرصة للفريق الآخر' : 'اضغطوا للاستباق!'}</span><span style="color:${tc(D.d)}">${tn(D.d)}</span></div><div class="qtext">${esc(D.q.text)}</div><div class="opts">${D.q.c.map((c, i) => `<div class="opt"><span class="L">${LET[i]}</span>${esc(c)}</div>`).join('')}</div>${tbar}`); }
    if (st === 'scene' && P.ev) { const e = P.ev, cap = this.caption(e, T);
      if (!cap) return this.show(null); return this.show('banner', `<small>${cap[0]}</small><b class="k">${cap[1]}</b>${cap[2] ? `<div class="guide">${esc(cap[2])}</div>` : ''}`); }
    if (st === 'harvest' && P.harvest) return this.show('banner', `<small>الحصاد: أراضيكم تنتج كل جولة</small><div class="row" style="gap:22px;justify-content:center;margin-top:6px">${T.map((t, i) => { const h = P.harvest[i] || {}; return `<div style="text-align:center"><b style="color:${t.color};font-family:var(--fd);font-size:20px">${esc(t.name)}</b><div class="mut" style="font-size:14px">🌾${h.food || 0} · 💰${h.gold || 0} · 🪨${h.stone || 0}</div></div>`; }).join('')}</div>`);
    if (st === 'bini' && P.bini) { const b = P.bini; return this.show('mid', `<div class="kind">بيني ${b.mult > 1 ? `مضاعف ×${b.mult}` : ''}</div><div class="ptitle k" style="font-size:72px">${esc(b.name)}</div><div class="punlock" style="font-family:var(--ft);max-width:820px;margin-inline:auto">${esc(b.desc)}</div>${b.n ? `<div class="punlock">من كل فريق: ${b.n}</div>` : ''}<div class="punlock gold">الجائزة: ${b.mult} ${b.mult === 1 ? 'أمر' : b.mult === 2 ? 'أمران' : 'أوامر'}</div>${b.running ? tbar : ''}`); }
    if (st === 'tie' && P.tie) { const t = P.tie; return this.show('qcard', `<div class="qtop"><span>المواجهة الفاصلة: تعادل في الصدارة · الفائز أول من يصل نقطتين</span><span>${t.teams.map((x, i) => `<span style="color:${tc(x)}">${tn(x)} ${t.pts[i]}</span>`).join(' · ')}</span></div><div class="qtext">${t.q ? esc(t.q.text) : ''}</div>${t.buzz ? `<div class="who" style="text-align:center;color:${tc(t.buzz.team)}">${tn(t.buzz.team)} · ${esc(t.buzz.name)}</div>` : (t.q ? `<div class="opts">${t.q.c.map((c, i) => `<div class="opt"><span class="L">${LET[i]}</span>${esc(c)}</div>`).join('')}</div>` : '')}${tbar}`); }
    if (st === 'crown') { return this.show('mid', `<div class="kind">التتويج</div><div class="ptitle k" style="color:${tc(P.winner)}">${tn(P.winner)}</div><div class="punlock">أبطال الجزيرة</div><div class="rank">${(P.rank || []).map((r, k) => `<div style="--tc:${tc(r.team)}"><b>${k + 1}. ${tn(r.team)}</b><span>${r.score} أرض</span></div>`).join('')}</div>`); }
    if (st === 'scene' || st === 'phase') return this.show(null);
    this.show(null);
  },
  caption(e, T) { const tn = i => i == null ? '' : `<span style="color:${T[i].color}">${esc(T[i].name)}</span>`, rn = r => esc(this.W ? this.W.M.regions[r].name : '');
    switch (e.k) {
      case 'attack': { const u = { inf: 'المشاة', cav: 'الفرسان', cat: 'المنجنيق' }[e.unit] || ''; const res = e.result === 'taken' ? `${tn(e.a)} يفتحون ${rn(e.r)}` : e.result === 'loot' ? `${tn(e.a)} ينهبون عاصمة ${tn(e.d)}` : e.result === 'garrisonFell' ? `سقطت حامية ${rn(e.r)}، وصمدت الأرض` : `${tn(e.d)} يصدّون الهجوم`;
        return [`هجوم ${u}${e.ally != null ? ' مشترك' : ''}`, res, guideLine(e, T)]; }
      case 'occupy': return ['احتلال', `${tn(e.team)} يحتلون ${rn(e.r)}`, guideLine(e, T)];
      case 'walls': return ['تحصين', `${tn(e.team)} يبنون سورًا في ${rn(e.r)}`, guideLine(e, T)];
      case 'tower': return ['برج مراقبة', `${tn(e.team)} يرفعون برجًا في ${rn(e.r)}`, guideLine(e, T)];
      case 'garInf': case 'garCav': return ['حامية', `${tn(e.team)} ينشرون حامية في ${rn(e.r)}`, guideLine(e, T)];
      case 'capital': return ['تطوير العاصمة', `${tn(e.team)}: عاصمتهم صارت ${e.level === 2 ? 'مدينة' : 'حاضرة'}`, guideLine(e, T)];
      case 'supply': return ['تموين', `${tn(e.team)} +${e.n} ${RES_AR[e.res]}`, ''];
      case 'batch': { const by = {}; e.list.forEach(x => { const a = x.k === 'occupy' ? 'احتلال ' + rn(x.r) : x.k === 'supply' ? 'تموين ' + RES_AR[x.res] : x.k === 'capital' ? 'تطوير العاصمة' : (GUIDE[x.k] ? GUIDE[x.k].t : '') + (x.r != null ? ' ' + rn(x.r) : ''); (by[x.team] = by[x.team] || []).push(a); });
        return ['أوامر الجولة', `<span class="rows">${Object.entries(by).map(([t, a]) => `<span>${tn(+t)}: <em>${a.join('، ')}</em></span>`).join('')}</span>`, '']; }
      case 'ally': return ['تحالف', `${tn(e.a)} و${tn(e.b)} يتحالفون`, guideLine(e, T)];
      case 'unally': return [e.betray ? 'نقض الحلف' : 'نهاية حلف', e.betray ? `${tn(e.a)} ينقضون حلفهم مع ${tn(e.b)}` : `انتهى الحلف بين ${tn(e.a)} و${tn(e.b)}`, guideLine(e, T)];
    } return null; }
};
